from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, date, timedelta

from db import get_db, SessionLocal, StockQuote, StockMeta
from bs_session import get_bs, reset_bs

router = APIRouter()


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


def _safe_float(val, default=0.0) -> float:
    try:
        v = float(str(val).strip())
        return v if v == v else default
    except Exception:
        return default


def _fetch_and_cache_quote(code: str) -> dict:
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
        close = _safe_float(r[5])
        preclose = _safe_float(r[6])

        result = {
            "code": code,
            "name": get_stock_name(code),
            "price": close,
            "change": _safe_float(r[10]),
            "changeAmt": round(close - preclose, 4),
            "open": _safe_float(r[2]),
            "prevClose": preclose,
            "high": _safe_float(r[3]),
            "low": _safe_float(r[4]),
            "volume": _safe_float(r[7]),
            "turnover": _safe_float(r[8]),
            "marketCap": 0.0,
            "pe": _safe_float(r[11]),
            "pb": _safe_float(r[12]),
            "turnoverRate": _safe_float(r[9]),
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
async def get_quote(code: str, db: Session = Depends(get_db)):
    row = db.query(StockQuote).filter(StockQuote.code == code).first()
    if row:
        return {
            "code": row.code,
            "name": row.name,
            "price": row.price,
            "change": row.change,
            "changeAmt": row.change_amt,
            "open": row.open,
            "prevClose": row.prev_close,
            "high": row.high,
            "low": row.low,
            "volume": row.volume,
            "turnover": row.turnover,
            "marketCap": row.market_cap,
            "pe": row.pe,
            "pb": row.pb,
            "turnoverRate": row.turnover_rate,
            "amplitude": row.amplitude,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        }
    return _fetch_and_cache_quote(code)
