from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, date, timedelta
import requests
import json
import time

from db import SessionLocal, StockKline, GlobalIndexKline

router = APIRouter()

# 全球非A股指数（走 GlobalIndexKline / EM 接口）
_GLOBAL_INDEX_CODES = {
    "HSI",
    "HSCEI",
    "HSTECH",
    "HSCCI",
    "DJIA",
    "SPX",
    "NDX",
    "N225",
    "KS11",
    "KOSPI200",
    "FTSE",
    "GDAXI",
    "FCHI",
    "SX5E",
    "MIB",
    "IBEX",
    "AEX",
    "SSMI",
    "TWII",
    "AS51",
    "SENSEX",
    "JKSE",
    "KLSE",
    "STI",
    "VNINDEX",
    "SET",
    "UDI",
}

# 不支持的指数，走 GlobalIndexKline / 新浪日K 接口
_CN_INDEX_EM_CODES = {"000688", "880351", "000680"}


def _is_global_index(code: str) -> bool:
    """走 GlobalIndexKline / EM 接口"""
    return code in _GLOBAL_INDEX_CODES or code in _CN_INDEX_EM_CODES


def _safe_float(val, default=0.0) -> float:
    try:
        v = float(str(val).strip())
        return v if v == v else default
    except Exception:
        return default


def _latest_trade_date() -> str:
    d = date.today() - timedelta(days=1)
    for _ in range(7):
        if d.weekday() < 5:
            return d.strftime("%Y-%m-%d")
        d -= timedelta(days=1)
    return (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")


_SINA_SCALE_MAP = {"daily": 240, "weekly": 1200, "monthly": 7200}


def _to_sina_symbol(code: str) -> str:
    if code.startswith("6") or code.startswith("5"):
        return f"sh{code}"
    return f"sz{code}"


def _fetch_and_cache_klines_sina(code: str, period: str, count: int) -> list:
    db = SessionLocal()
    try:
        sina_symbol = _to_sina_symbol(code)
        scale = _SINA_SCALE_MAP.get(period, 240)
        fetch_count = max(count * 2, 400)
        url = f"https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData"
        params = {
            "symbol": sina_symbol,
            "scale": str(scale),
            "ma": "no",
            "datalen": str(fetch_count),
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        r = requests.get(url, params=params, headers=headers, timeout=15)
        r.raise_for_status()
        rows = json.loads(r.text)
        if not rows:
            return []
        bars = []
        prev_close = 0.0
        for row in rows:
            trade_date = row.get("day", "")[:10]
            o = _safe_float(row.get("open"))
            h = _safe_float(row.get("high"))
            lo = _safe_float(row.get("low"))
            c = _safe_float(row.get("close"))
            vol = int(_safe_float(row.get("volume")))
            change_pct = 0.0
            if prev_close > 0:
                change_pct = round((c - prev_close) / prev_close * 100, 4)
            prev_close = c
            stmt = sqlite_insert(StockKline).values(
                code=code,
                period=period,
                trade_date=trade_date,
                open=o,
                high=h,
                low=lo,
                close=c,
                volume=vol,
                turnover=0.0,
                turn_rate=0.0,
                change_pct=change_pct,
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
                    "change_pct": stmt.excluded.change_pct,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
            bars.append(
                {
                    "time": trade_date,
                    "open": o,
                    "high": h,
                    "low": lo,
                    "close": c,
                    "volume": vol,
                    "turnRate": 0.0,
                    "changePct": change_pct,
                }
            )
        db.commit()
        return bars[-count:]
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


def _fetch_and_cache_klines(code: str, period: str, count: int) -> list:
    try:
        return _fetch_and_cache_klines_sina(code, period, count)
    except Exception as sina_err:
        raise HTTPException(
            status_code=503,
            detail=f"K线数据源不可用(sina: {sina_err})",
        )


def _read_global_index_kline(code: str, period: str, count: int) -> list:
    """从 global_index_kline 表读取全球指数 K 线，不足时触发抓取"""
    db = SessionLocal()
    try:
        rows = (
            db.query(GlobalIndexKline)
            .filter(GlobalIndexKline.code == code, GlobalIndexKline.period == period)
            .order_by(GlobalIndexKline.trade_date.desc())
            .limit(count)
            .all()
        )
        if not rows:
            return []
        return [
            {
                "time": r.trade_date,
                "open": float(r.open) if r.open else 0.0,
                "high": float(r.high) if r.high else 0.0,
                "low": float(r.low) if r.low else 0.0,
                "close": float(r.close) if r.close else 0.0,
                "volume": float(r.volume) if r.volume else 0.0,
                "turnRate": 0.0,
                "changePct": float(r.change_pct) if r.change_pct else 0.0,
            }
            for r in reversed(rows)
        ]
    finally:
        db.close()


def _fetch_and_cache_global_index_kline(code: str, period: str, count: int) -> list:
    """通过 global_market 模块抓取并缓存全球指数 K 线"""
    from routers.global_market import fetch_index_kline

    return fetch_index_kline(code, period, count)


def _bars_from_rows(rows) -> list:
    return [
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


def _refresh_kline_cache(code: str, period: str, count: int) -> None:
    try:
        _fetch_and_cache_klines(code, period, count)
    except Exception:
        pass


@router.get("/{code}")
async def get_kline(
    code: str,
    period: str = Query(default="daily"),
    count: int = Query(default=110, ge=10, le=1000),
    response: Response = None,
):
    # 设置不缓存响应头，确保返回最新数据
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    # 按周期决定默认返回条数：日K 110（约5个月），周K 156（3年），月K 120（10年）
    if count == 110:
        if period == "weekly":
            count = 156
        elif period == "monthly":
            count = 120

    # 全球非A股指数走独立路由
    if _is_global_index(code):

        def _read_global():
            return _read_global_index_kline(code, period, count)

        rows = await run_in_threadpool(_read_global)
        min_expected = {"daily": 50, "weekly": 50, "monthly": 24}.get(period, 24)
        if len(rows) < min_expected:
            return await run_in_threadpool(
                _fetch_and_cache_global_index_kline, code, period, count
            )
        return rows

    def _read_cached():
        db = SessionLocal()
        try:
            total = (
                db.query(StockKline)
                .filter(StockKline.code == code, StockKline.period == period)
                .count()
            )
            rows = (
                db.query(StockKline)
                .filter(StockKline.code == code, StockKline.period == period)
                .order_by(StockKline.trade_date.desc())
                .limit(count)
                .all()
            )
            return total, rows
        finally:
            db.close()

    total, rows = await run_in_threadpool(_read_cached)

    latest_trade_date = _latest_trade_date()
    latest_cached_date = rows[0].trade_date if rows else None
    if period == "daily" and latest_cached_date != latest_trade_date:
        if rows:
            import threading

            threading.Thread(
                target=_refresh_kline_cache,
                args=(code, period, count),
                daemon=True,
            ).start()
            return _bars_from_rows(rows)

    min_expected = {"daily": 100, "weekly": 50, "monthly": 24}.get(period, 50)
    if total < min_expected:
        if rows:
            import threading

            threading.Thread(
                target=_refresh_kline_cache,
                args=(code, period, count),
                daemon=True,
            ).start()
            return _bars_from_rows(rows)
        # 首次请求（缓存为空），同步抓取后返回
        bars = await run_in_threadpool(_fetch_and_cache_klines, code, period, count)
        if not bars:
            raise HTTPException(
                status_code=404, detail=f"No cached kline data for {code}"
            )
        return bars

    return _bars_from_rows(rows)
