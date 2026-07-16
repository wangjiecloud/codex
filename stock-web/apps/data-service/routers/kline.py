from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, date, timedelta

from db import SessionLocal, StockKline, GlobalIndexKline
from bs_session import get_bs, reset_bs

router = APIRouter()

# 全球非A股指数（走 GlobalIndexKline / EM 接口）
_GLOBAL_INDEX_CODES = {
    "HSI", "HSCEI", "HSTECH", "HSCCI",
    "DJIA", "SPX", "NDX",
    "N225",
    "KS11", "KOSPI200",
    "FTSE", "GDAXI", "FCHI", "SX5E", "MIB", "IBEX", "AEX", "SSMI",
    "TWII", "AS51", "SENSEX", "JKSE", "KLSE", "STI", "VNINDEX", "SET",
    "UDI",
}

# A 股大盘指数的正确 baostock 前缀映射
# 上交所指数：000xxx / 000001/000016/000300/000905/000688 等
# 深交所指数：399xxx
_CN_INDEX_BS_MAP: dict[str, str] = {
    "000001": "sh.000001",   # 上证指数
    "000002": "sh.000002",   # 上证A股指数
    "000016": "sh.000016",   # 上证50
    "000300": "sh.000300",   # 沪深300
    "000905": "sh.000905",   # 中证500
    "000852": "sh.000852",   # 中证1000
    "000985": "sh.000985",   # 中证全指
    "000047": "sh.000047",   # 上证全指
    "399001": "sz.399001",   # 深证成指
    "399006": "sz.399006",   # 创业板指
    "399005": "sz.399005",   # 中小板指
    "399300": "sz.399300",   # 深版沪深300
    "399673": "sz.399673",   # 创业板50
}

# 不支持 baostock 的指数，走 GlobalIndexKline / 新浪日K 接口
# 000680 科创综指：baostock 不支持 sh.000680，走新浪日K
_CN_INDEX_EM_CODES = {"000688", "880351", "000680"}


def _is_global_index(code: str) -> bool:
    """走 GlobalIndexKline / EM 接口"""
    return code in _GLOBAL_INDEX_CODES or code in _CN_INDEX_EM_CODES


def _to_bs_code(code: str) -> str:
    """转换为 baostock 代码，优先查精确映射表"""
    if code in _CN_INDEX_BS_MAP:
        return _CN_INDEX_BS_MAP[code]
    # 普通股票：6/5 开头上交所，其余深交所
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
            return (
                db.query(StockKline)
                .filter(StockKline.code == code, StockKline.period == period)
                .order_by(StockKline.trade_date.desc())
                .limit(count)
                .all()
            )
        finally:
            db.close()

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

    # 缓存不足时重新从 baostock 拉取：用数据库总条数判断，避免 limit(count) < min 误判
    min_expected = {"daily": 100, "weekly": 50, "monthly": 24}.get(period, 50)
    if total < min_expected:
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
