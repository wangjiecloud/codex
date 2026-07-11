from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, date, timedelta

from db import SessionLocal, StockKline
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
        # 按周期决定回溯窗口：日K 400天，周K 3年，月K 10年
        if period == "weekly":
            lookback_days = max(count * 7 + 30, 3 * 365)
        elif period == "monthly":
            lookback_days = max(count * 31 + 60, 10 * 365)
        else:
            lookback_days = max(count * 2, 400)
        start = (date.today() - timedelta(days=lookback_days)).strftime(
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
    count: int = Query(default=110, ge=10, le=1000),
):
    # 按周期决定默认返回条数：日K 110（约5个月），周K 156（3年），月K 120（10年）
    if count == 110:
        if period == "weekly":
            count = 156
        elif period == "monthly":
            count = 120

    def _read_cached():
        db = SessionLocal()
        try:
            return (
                db.query(StockKline)
                .filter(StockKline.code == code, StockKline.period == period)
                .order_by(StockKline.trade_date.desc())
                .limit(count)
                .all()
            )
        finally:
            db.close()

    rows = await run_in_threadpool(_read_cached)

    # 缓存不足时重新从 baostock 拉取：日K 要求至少 100 根（约5个月）
    min_expected = {"daily": 100, "weekly": 100, "monthly": 60}.get(period, 60)
    if len(rows) < min_expected:
        return await run_in_threadpool(_fetch_and_cache_klines, code, period, count)

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
