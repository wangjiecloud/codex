from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, date, timedelta

from db import get_db, SessionLocal, StockKline
from bs_session import get_bs, reset_bs

router = APIRouter()


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


def _fetch_and_cache_klines(code: str, period: str, count: int) -> list:
    db = SessionLocal()
    bs_period = "d" if period == "daily" else ("w" if period == "weekly" else "m")
    try:
        bsapi = get_bs()
        bs_code = _to_bs_code(code)
        start = (date.today() - timedelta(days=max(count * 2, 400))).strftime(
            "%Y-%m-%d"
        )
        end = date.today().strftime("%Y-%m-%d")
        fields = "date,code,open,high,low,close,volume,amount,turn,pctChg"
        rs = bsapi.query_history_k_data_plus(
            bs_code,
            fields,
            start_date=start,
            end_date=end,
            frequency=bs_period,
            adjustflag="2",
        )
        bars = []
        while rs.error_code == "0" and rs.next():
            r = rs.get_row_data()
            stmt = sqlite_insert(StockKline).values(
                code=code,
                period=period,
                trade_date=r[0],
                open=_safe_float(r[2]),
                high=_safe_float(r[3]),
                low=_safe_float(r[4]),
                close=_safe_float(r[5]),
                volume=int(_safe_float(r[6])),
                turnover=_safe_float(r[7]),
                turn_rate=_safe_float(r[8]),
                change_pct=_safe_float(r[9]),
                updated_at=datetime.utcnow(),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["code", "period", "trade_date"],
                set_={
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume,
                    "turnover": stmt.excluded.turnover,
                    "turn_rate": stmt.excluded.turn_rate,
                    "change_pct": stmt.excluded.change_pct,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
            bars.append(
                {
                    "time": r[0],
                    "open": _safe_float(r[2]),
                    "high": _safe_float(r[3]),
                    "low": _safe_float(r[4]),
                    "close": _safe_float(r[5]),
                    "volume": int(_safe_float(r[6])),
                    "turnRate": _safe_float(r[8]),
                    "changePct": _safe_float(r[9]),
                }
            )
        db.commit()
        return bars[-count:]
    except Exception as e:
        db.rollback()
        reset_bs()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.get("/{code}")
async def get_kline(
    code: str,
    period: str = Query(default="daily"),
    count: int = Query(default=120, ge=10, le=500),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(StockKline)
        .filter(StockKline.code == code, StockKline.period == period)
        .order_by(StockKline.trade_date.desc())
        .limit(count)
        .all()
    )

    # 如果有足够的缓存数据，直接返回
    if len(rows) >= min(count, 30):  # 至少要有30条或请求数量的数据
        bars = [
            {
                "time": r.trade_date,
                "open": r.open,
                "high": r.high,
                "low": r.low,
                "close": r.close,
                "volume": r.volume,
                "turnRate": r.turn_rate or 0.0,
                "changePct": r.change_pct,
            }
            for r in reversed(rows)
        ]
        return bars

    # 尝试获取最新数据
    try:
        bars = _fetch_and_cache_klines(code, period, count)
        return bars
    except Exception as e:
        # 如果baostock失败但有部分缓存，返回缓存数据
        if rows:
            print(
                f"[kline] baostock failed for {code}, returning {len(rows)} cached bars"
            )
            bars = [
                {
                    "time": r.trade_date,
                    "open": r.open,
                    "high": r.high,
                    "low": r.low,
                    "close": r.close,
                    "volume": r.volume,
                    "turnRate": r.turn_rate or 0.0,
                    "changePct": r.change_pct,
                }
                for r in reversed(rows)
            ]
            return bars
        # 无缓存且baostock失败，返回空数组
        print(f"[kline] no cache and baostock failed for {code}: {e}")
        return []
