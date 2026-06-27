from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, date, timedelta

from db import SessionLocal, StockQuote, StockMeta
from bs_session import get_bs, reset_bs

router = APIRouter()

_quote_refresh_lock: set[str] = set()
_QUOTE_STALE_HOURS = 24


@router.get("/search")
async def search_stocks(q: str = Query("", description="股票代码或名称关键字")):
    if not q.strip():
        return {"results": []}
    keyword = q.strip().lower()

    def _fetch():
        db = SessionLocal()
        try:
            rows = (
                db.query(StockMeta.code, StockMeta.name)
                .filter(StockMeta.market == "A股")
                .all()
            )
            results = [
                {"code": r.code, "name": r.name}
                for r in rows
                if keyword in r.code.lower() or keyword in (r.name or "").lower()
            ]
            results.sort(key=lambda x: (not x["code"].startswith(q.strip()), x["code"]))
            return {"results": results[:20]}
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


def get_stock_name(code: str) -> str:
    """Get stock name from DB."""
    db = SessionLocal()
    try:
        row = db.query(StockMeta).filter(StockMeta.code == code).first()
        return row.name if row else ""
    finally:
        db.close()


def _to_bs_code(code: str) -> str:
    if code.startswith("6") or code.startswith("5"):
        return f"sh.{code}"
    return f"sz.{code}"


def _is_a_share(code: str) -> bool:
    if not code or len(code) != 6:
        return False
    if code.startswith("0") or code.startswith("3"):
        return True
    if code.startswith("6") or code.startswith("688"):
        return True
    return False


def _safe_float(val, default=0.0) -> float:
    try:
        v = float(str(val).strip())
        return v if v == v else default
    except Exception:
        return default


def _fetch_and_cache_quote(code: str) -> dict:
    if not _is_a_share(code):
        raise HTTPException(
            status_code=501,
            detail=f"Real-time quotes not supported for non-A-share stock: {code}",
        )

    db = SessionLocal()
    try:
        bs = get_bs()
        bs_code = _to_bs_code(code)
        today = date.today().strftime("%Y-%m-%d")
        start = (date.today() - timedelta(days=5)).strftime("%Y-%m-%d")
        fields = "date,code,open,high,low,close,preclose,volume,amount,turn,pctChg,peTTM,pbMRQ"
        rs = bs.query_history_k_data_plus(
            bs_code,
            fields,
            start_date=start,
            end_date=today,
            frequency="d",
            adjustflag="2",
        )
        row_data = []
        while rs.error_code == "0" and rs.next():
            row_data.append(rs.get_row_data())

        if not row_data:
            raise HTTPException(status_code=404, detail=f"Stock {code} not found")

        r = row_data[-1]
        close = round(_safe_float(r[5]), 4)
        preclose = round(_safe_float(r[6]), 4)

        result = {
            "code": code,
            "name": get_stock_name(code),
            "price": close,
            "change": round(_safe_float(r[10]), 4),
            "changeAmt": round(close - preclose, 4),
            "open": round(_safe_float(r[2]), 4),
            "prevClose": preclose,
            "high": round(_safe_float(r[3]), 4),
            "low": round(_safe_float(r[4]), 4),
            "volume": _safe_float(r[7]),
            "turnover": _safe_float(r[8]),
            "marketCap": 0.0,
            "pe": round(_safe_float(r[11]), 4),
            "pb": round(_safe_float(r[12]), 4),
            "turnoverRate": round(_safe_float(r[9]), 4),
            "amplitude": 0.0,
            "updatedAt": datetime.utcnow().isoformat(),
        }

        stmt = sqlite_insert(StockQuote).values(
            code=code,
            name=get_stock_name(code),
            price=result["price"],
            change=result["change"],
            change_amt=result["changeAmt"],
            open=result["open"],
            prev_close=result["prevClose"],
            high=result["high"],
            low=result["low"],
            volume=result["volume"],
            turnover=result["turnover"],
            market_cap=0.0,
            pe=result["pe"],
            pb=result["pb"],
            turnover_rate=result["turnoverRate"],
            amplitude=0.0,
            updated_at=datetime.utcnow(),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["code"],
            set_={
                "price": stmt.excluded.price,
                "change": stmt.excluded.change,
                "change_amt": stmt.excluded.change_amt,
                "open": stmt.excluded.open,
                "prev_close": stmt.excluded.prev_close,
                "high": stmt.excluded.high,
                "low": stmt.excluded.low,
                "volume": stmt.excluded.volume,
                "turnover": stmt.excluded.turnover,
                "pe": stmt.excluded.pe,
                "pb": stmt.excluded.pb,
                "turnover_rate": stmt.excluded.turnover_rate,
                "updated_at": stmt.excluded.updated_at,
            },
        )
        db.execute(stmt)
        db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        reset_bs()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.get("/{code}")
async def get_quote(code: str, background_tasks: BackgroundTasks):
    def _read_cached():
        db = SessionLocal()
        try:
            return db.query(StockQuote).filter(StockQuote.code == code).first()
        finally:
            db.close()

    row = await run_in_threadpool(_read_cached)

    def _row_to_dict(r: StockQuote, warning: str | None = None) -> dict:
        d = {
            "code": r.code,
            "name": r.name,
            "price": r.price,
            "change": r.change,
            "changeAmt": r.change_amt,
            "open": r.open,
            "prevClose": r.prev_close,
            "high": r.high,
            "low": r.low,
            "volume": r.volume,
            "turnover": r.turnover,
            "marketCap": r.market_cap,
            "pe": r.pe,
            "pb": r.pb,
            "turnoverRate": r.turnover_rate,
            "amplitude": r.amplitude,
            "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
        }
        if warning:
            d["cacheWarning"] = warning
        return d

    def _needs_refresh(r: StockQuote) -> bool:
        if r.price == 0 or r.updated_at is None:
            return True
        age_hours = (datetime.utcnow() - r.updated_at).total_seconds() / 3600
        return age_hours >= _QUOTE_STALE_HOURS

    def _bg_refresh(c: str) -> None:
        if c in _quote_refresh_lock:
            return
        _quote_refresh_lock.add(c)
        try:
            _fetch_and_cache_quote(c)
        except Exception:
            pass
        finally:
            _quote_refresh_lock.discard(c)

    if row and not _needs_refresh(row):
        return JSONResponse(content=_row_to_dict(row))

    if row and row.price > 0:
        background_tasks.add_task(_bg_refresh, code)
        return JSONResponse(
            content=_row_to_dict(row, "数据可能不是最新，正在更新中...")
        )

    if row:
        return JSONResponse(
            content=_row_to_dict(row, "数据可能不是最新，正在更新中...")
        )
    raise HTTPException(status_code=404, detail=f"No quote data for {code}")
