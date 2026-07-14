"""
分时数据路由

数据来源（优先级）：
  1. 新浪财经 stock_zh_a_minute（1分钟K线，覆盖最近约8个交易日）
  2. baostock query_history_k_data_plus frequency='5'（5分钟K线，任意历史）

GET  /api/minute/{code}?date=YYYY-MM-DD
  - 先查数据库缓存
  - 数据库无数据时：最近8天用新浪1分钟；更早日期用 baostock 5分钟

POST /api/minute/{code}/sync?date=YYYY-MM-DD
  - 强制从远程拉取并覆盖入库

POST /api/minute/sync-batch
  - 批量同步多只股票当日分时数据
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, date, timedelta
from typing import Optional, List
from pydantic import BaseModel
import asyncio

from db import SessionLocal, StockMinuteKline, StockQuote, StockKline
from bs_session import get_bs

router = APIRouter()


def _safe_float(val, default=0.0):
    try:
        v = float(str(val).strip().replace(",", ""))
        return v if v == v else default
    except Exception:
        return default


def _is_a_share(code):
    """A股个股 + A股宽基指数（000/399开头）均支持分时"""
    return bool(code) and (
        code.startswith("0") or code.startswith("3") or code.startswith("6")
    )


def _to_bs_code(code):
    """baostock 代码转换：
    - 6开头 → sh.（上交所股票）
    - 上交所指数白名单（000开头挂牌上交所）→ sh.
    - 399xxx 深交所指数 → sz.
    - 其余（0/3开头深交所股票，其他000开头中证指数）→ sz.
    """
    if code.startswith("6"):
        return f"sh.{code}"
    # 上交所挂牌的000开头指数
    _SH_INDEX = {"000001", "000016", "000300", "000688", "000010", "000015",
                 "000020", "000030", "000068", "000903", "000905", "000906",
                 "000852", "000928", "000680", "000047"}
    if code in _SH_INDEX:
        return f"sh.{code}"
    return f"sz.{code}"


def _to_sina_code(code):
    """新浪分时接口代码前缀：
    - 6开头 → sh（上交所股票）
    - 000688 科创50 → sh（上交所科创板指数）
    - 000001/000016/000300等上证指数 → sh（上交所指数）
    - 000985/399xxx 中证/深交所指数 → sz
    - 0/3开头深交所股票 → sz
    上交所指数白名单（000开头但挂牌上交所）：
    000001(上证综), 000016(上证50), 000300(沪深300), 000688(科创50), 000680(科创综指), 000047(上证全指)
    其余000开头中证/跨市场指数用 sz
    """
    if code.startswith("6"):
        return f"sh{code}"
    # 上交所挂牌的指数
    _SH_INDEX = {"000001", "000016", "000300", "000688", "000010", "000015",
                 "000020", "000030", "000068", "000903", "000905", "000906",
                 "000852", "000928", "000680", "000047"}
    if code in _SH_INDEX:
        return f"sh{code}"
    # 399xxx 深交所指数，其他000开头中证指数，以及0/3开头深交所股票
    return f"sz{code}"


def _get_latest_trade_date():
    d = date.today()
    for _ in range(7):
        if d.weekday() < 5:
            return d.strftime("%Y-%m-%d")
        d -= timedelta(days=1)
    return date.today().strftime("%Y-%m-%d")


def _is_index_code(code: str) -> bool:
    """判断是否为指数代码（000xxx / 399xxx），区别于个股"""
    return code.startswith("000") or code.startswith("399")


def _read_from_db(code, trade_date):
    db = SessionLocal()
    try:
        rows = (
            db.query(StockMinuteKline)
            .filter(StockMinuteKline.code == code, StockMinuteKline.trade_date == trade_date)
            .order_by(StockMinuteKline.minute_time)
            .all()
        )
        return [
            {
                "time": r.minute_time,
                "open": float(r.open) if r.open is not None else 0.0,
                "high": float(r.high) if r.high is not None else 0.0,
                "low": float(r.low) if r.low is not None else 0.0,
                "close": float(r.close) if r.close is not None else 0.0,
                "volume": float(r.volume) if r.volume is not None else 0.0,
                "amount": float(r.amount) if r.amount is not None else 0.0,
                "avgPrice": float(r.avg_price) if r.avg_price is not None else 0.0,
                "prevClose": float(r.prev_close) if r.prev_close is not None else 0.0,
            }
            for r in rows
        ]
    finally:
        db.close()


def _get_prev_close_from_db(code, trade_date):
    """
    获取昨收价：
    1. 优先从日K线（stock_kline）取 trade_date 前一个交易日的 close
       （避免指数代码与同名个股代码混淆，如 000001 上证指数 vs 平安银行）
    2. 日K线取不到时，回落到 stock_quote.prev_close
    """
    db = SessionLocal()
    try:
        # 优先从日K线取昨日收盘价（trade_date 当天之前最近一条）
        kline = (
            db.query(StockKline)
            .filter(StockKline.code == code, StockKline.period == "daily",
                    StockKline.trade_date < trade_date)
            .order_by(StockKline.trade_date.desc())
            .first()
        )
        if kline and kline.close and float(kline.close) > 0:
            return float(kline.close)
        # 回落到 stock_quote
        q = db.query(StockQuote).filter(StockQuote.code == code).first()
        if q and q.prev_close and float(q.prev_close) > 0:
            return float(q.prev_close)
    except Exception:
        pass
    finally:
        db.close()
    return 0.0


def _save_bars_to_db(code, trade_date, bars, prev_close):
    db = SessionLocal()
    try:
        for bar in bars:
            stmt = sqlite_insert(StockMinuteKline).values(
                code=code, trade_date=trade_date, minute_time=bar["time"],
                open=bar["open"], high=bar["high"], low=bar["low"], close=bar["close"],
                volume=bar["volume"], amount=bar["amount"],
                avg_price=round(bar.get("avg", bar["close"]), 4),
                prev_close=prev_close, updated_at=datetime.utcnow(),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["code", "trade_date", "minute_time"],
                set_={
                    "open": stmt.excluded.open, "high": stmt.excluded.high,
                    "low": stmt.excluded.low, "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume, "amount": stmt.excluded.amount,
                    "avg_price": stmt.excluded.avg_price,
                    "prev_close": stmt.excluded.prev_close,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"入库失败: {e}")
    finally:
        db.close()


def _is_within_sina_range(target_date):
    """判断是否在新浪约8个交易日范围内（按自然日14天估算）"""
    try:
        td = date.fromisoformat(target_date)
        delta = (date.today() - td).days
        return 0 <= delta <= 14
    except Exception:
        return False


def _fetch_sina_1min(code, target_date):
    """通过新浪 stock_zh_a_minute 拉1分钟K线，过滤 target_date 当天"""
    import akshare as ak
    df = ak.stock_zh_a_minute(symbol=_to_sina_code(code), period="1", adjust="")
    if df is None or df.empty:
        return []
    day_df = df[df["day"].str.startswith(target_date)].copy()
    if day_df.empty:
        return []
    bars = []
    for _, row in day_df.iterrows():
        day_str = str(row["day"])
        time_part = day_str[11:16]
        if not ("09:30" <= time_part <= "15:00"):
            continue
        bars.append({
            "time": time_part,
            "open": _safe_float(row["open"]), "high": _safe_float(row["high"]),
            "low": _safe_float(row["low"]), "close": _safe_float(row["close"]),
            "volume": _safe_float(row["volume"]), "amount": _safe_float(row["amount"]),
        })
    if not bars:
        return []
    # 对指数：avg_price 用当天累计收盘价移动平均（close VWAP无意义，指数成交量/额单位不匹配）
    # 对个股：用累计成交额/累计成交量（VWAP）
    if _is_index_code(code):
        cum_close, cnt = 0.0, 0
        for bar in bars:
            cum_close += bar["close"]
            cnt += 1
            bar["avg"] = round(cum_close / cnt, 4)
    else:
        cum_amt, cum_vol = 0.0, 0.0
        for bar in bars:
            cum_amt += bar["amount"]
            cum_vol += bar["volume"]
            bar["avg"] = round(cum_amt / cum_vol, 4) if cum_vol > 0 else bar["close"]
    return bars


def _fetch_bs_5min(code, target_date):
    """通过 baostock 拉5分钟K线（支持任意历史日期）"""
    bs = get_bs()
    rs = bs.query_history_k_data_plus(
        _to_bs_code(code),
        "date,time,open,high,low,close,volume,amount",
        start_date=target_date, end_date=target_date,
        frequency="5", adjustflag="3",
    )
    raw_rows = []
    while rs.error_code == "0" and rs.next():
        raw_rows.append(rs.get_row_data())
    if not raw_rows:
        return []
    bars = []
    for row in raw_rows:
        time_str = row[1]
        if len(time_str) < 12:
            continue
        minute_str = f"{time_str[8:10]}:{time_str[10:12]}"
        bars.append({
            "time": minute_str, "open": _safe_float(row[2]), "high": _safe_float(row[3]),
            "low": _safe_float(row[4]), "close": _safe_float(row[5]),
            "volume": _safe_float(row[6]), "amount": _safe_float(row[7]),
        })
    cum_amt, cum_vol = 0.0, 0.0
    if _is_index_code(code):
        cum_close, cnt = 0.0, 0
        for bar in bars:
            cum_close += bar["close"]
            cnt += 1
            bar["avg"] = round(cum_close / cnt, 4)
    else:
        for bar in bars:
            cum_amt += bar["amount"]
            cum_vol += bar["volume"]
            bar["avg"] = round(cum_amt / cum_vol, 4) if cum_vol > 0 else bar["close"]
    return bars


def _fetch_and_save(code, target_date):
    """拉取分时数据并入库。返回 (bars, mode)。"""
    prev_close = _get_prev_close_from_db(code, target_date)
    bars = []
    mode = "1min"

    if _is_within_sina_range(target_date):
        try:
            bars = _fetch_sina_1min(code, target_date)
        except Exception:
            bars = []

    # 对指数代码，baostock 不提供分钟K线，跳过以避免返回同代码个股的错误数据
    if not bars and not _is_index_code(code):
        bars = _fetch_bs_5min(code, target_date)
        mode = "5min"

    if not bars:
        return [], mode

    _save_bars_to_db(code, target_date, bars, prev_close)

    return [
        {
            "time": b["time"], "open": b["open"], "high": b["high"],
            "low": b["low"], "close": b["close"], "volume": b["volume"],
            "amount": b["amount"], "avgPrice": b.get("avg", b["close"]),
            "prevClose": prev_close,
        }
        for b in bars
    ], mode


class SyncBatchRequest(BaseModel):
    codes: List[str]
    date: Optional[str] = None


def _fetch_one_code(code, trade_date):
    if not _is_a_share(code):
        return {"code": code, "status": "skip", "reason": "非A股", "count": 0}
    cached = _read_from_db(code, trade_date)
    if cached:
        return {"code": code, "status": "cached", "count": len(cached)}
    try:
        bars, mode = _fetch_and_save(code, trade_date)
        return {"code": code, "status": "ok", "count": len(bars), "mode": mode}
    except HTTPException as e:
        return {"code": code, "status": "error", "reason": e.detail, "count": 0}
    except Exception as e:
        return {"code": code, "status": "error", "reason": str(e), "count": 0}


@router.post("/sync-batch")
async def sync_batch(body: SyncBatchRequest):
    if not body.codes:
        return {"total": 0, "ok": 0, "cached": 0, "skip": 0, "error": 0, "results": []}
    trade_date = body.date if body.date else _get_latest_trade_date()
    semaphore = asyncio.Semaphore(3)

    async def _sync_one(code):
        async with semaphore:
            return await run_in_threadpool(_fetch_one_code, code.strip(), trade_date)

    results = await asyncio.gather(*[_sync_one(c) for c in body.codes if c.strip()])
    summary = {"ok": 0, "cached": 0, "skip": 0, "error": 0}
    for r in results:
        s = r.get("status", "error")
        summary[s] = summary.get(s, 0) + 1
    return {"date": trade_date, "total": len(results), **summary, "results": results}


@router.get("/{code}")
async def get_minute_kline(
    code: str,
    date: Optional[str] = Query(None, description="交易日 YYYY-MM-DD"),
):
    if not _is_a_share(code):
        raise HTTPException(status_code=400, detail="仅支持A股分时数据查询")
    trade_date = date if date else _get_latest_trade_date()

    cached = await run_in_threadpool(_read_from_db, code, trade_date)
    if cached:
        mode = "1min" if len(cached) > 50 else "5min"
        return {"code": code, "date": trade_date, "bars": cached,
                "source": "cache", "count": len(cached), "mode": mode}

    bars, mode = await run_in_threadpool(_fetch_and_save, code, trade_date)
    if not bars:
        raise HTTPException(status_code=404,
                            detail=f"{trade_date} 无分时数据（非交易日或停牌）")
    return {"code": code, "date": trade_date, "bars": bars,
            "source": "remote", "count": len(bars), "mode": mode}


@router.post("/{code}/sync")
async def sync_minute_kline(
    code: str,
    date: Optional[str] = Query(None, description="交易日 YYYY-MM-DD"),
):
    if not _is_a_share(code):
        raise HTTPException(status_code=400, detail="仅支持A股分时数据同步")
    trade_date = date if date else _get_latest_trade_date()
    bars, mode = await run_in_threadpool(_fetch_and_save, code, trade_date)
    return {
        "code": code, "date": trade_date, "count": len(bars), "mode": mode,
        "message": f"已同步 {len(bars)} 条{'1分钟' if mode == '1min' else '5分钟'}K线数据",
    }


# ── 全局同步状态 ──────────────────────────────────────────────
_industry_sync_status: dict = {
    "running": False,
    "total": 0,
    "done": 0,
    "ok": 0,
    "cached": 0,
    "error": 0,
    "current": "",
    "trade_date": "",
    "started_at": None,
    "finished_at": None,
}


def _get_industry_codes() -> List[str]:
    """从 industry_node 表获取全部产业链 A 股代码"""
    from sqlalchemy import text as _text
    db = SessionLocal()
    try:
        rows = db.execute(_text("""
            SELECT DISTINCT json_each.value as code
            FROM industry_node, json_each(industry_node.stocks)
            WHERE industry_node.stocks IS NOT NULL AND industry_node.stocks != '[]'
        """)).fetchall()
        return [
            r[0] for r in rows
            if r[0] and len(r[0]) == 6 and (
                r[0].startswith("0") or r[0].startswith("3") or r[0].startswith("6")
            )
        ]
    except Exception:
        return []
    finally:
        db.close()


def _run_industry_sync(trade_date: str):
    """后台线程：批量同步产业链全部 A 股分时数据"""
    import time as _t
    from routers.system import sched_log
    global _industry_sync_status
    codes = _get_industry_codes()
    _industry_sync_status.update({
        "running": True, "total": len(codes), "done": 0,
        "ok": 0, "cached": 0, "error": 0,
        "current": "", "trade_date": trade_date,
        "started_at": datetime.utcnow().isoformat(),
        "finished_at": None,
    })
    sched_log("info", f"[分时同步] 开始，共 {len(codes)} 只产业链A股，交易日 {trade_date}", source="minute_sync")
    for code in codes:
        _industry_sync_status["current"] = code
        result = _fetch_one_code(code, trade_date)
        s = result.get("status", "error")
        _industry_sync_status["done"] += 1
        if s == "ok":
            _industry_sync_status["ok"] += 1
        elif s == "cached":
            _industry_sync_status["cached"] += 1
        elif s == "error":
            _industry_sync_status["error"] += 1
        _t.sleep(0.2)
    _industry_sync_status.update({
        "running": False, "current": "",
        "finished_at": datetime.utcnow().isoformat(),
    })
    ok = _industry_sync_status["ok"]
    cached = _industry_sync_status["cached"]
    error = _industry_sync_status["error"]
    sched_log("success", f"[分时同步] 完成：新增 {ok} 只，缓存 {cached} 只，失败 {error} 只", source="minute_sync")


@router.get("/stats/industry")
async def get_industry_sync_stats():
    """返回产业链分时数据 DB 统计 + 当前同步状态"""
    from sqlalchemy import text as _text
    db = SessionLocal()
    try:
        # 总股票数（产业链）
        total_codes = await run_in_threadpool(_get_industry_codes)
        # DB 中已有数据的（code, trade_date）去重数
        row = db.execute(_text(
            "SELECT COUNT(DISTINCT code) as c, COUNT(DISTINCT trade_date) as d, "
            "COUNT(*) as total FROM stock_minute_kline"
        )).fetchone()
        covered_codes = row[0] if row else 0
        distinct_dates = row[1] if row else 0
        total_bars = row[2] if row else 0
        # 最新交易日已覆盖股票数
        latest_date = _get_latest_trade_date()
        latest_row = db.execute(_text(
            "SELECT COUNT(DISTINCT code) FROM stock_minute_kline WHERE trade_date = :d"
        ), {"d": latest_date}).fetchone()
        latest_covered = latest_row[0] if latest_row else 0
    except Exception:
        covered_codes = distinct_dates = total_bars = latest_covered = 0
    finally:
        db.close()

    return {
        "industry_total": len(total_codes),
        "covered_codes": covered_codes,
        "latest_date": latest_date,
        "latest_covered": latest_covered,
        "distinct_dates": distinct_dates,
        "total_bars": total_bars,
        "sync_status": _industry_sync_status,
    }


@router.post("/sync-industry")
async def sync_industry_minute():
    """手动触发产业链全部 A 股当日分时数据同步"""
    global _industry_sync_status
    if _industry_sync_status.get("running"):
        return {"status": "already_running", "message": "同步任务已在运行中"}
    trade_date = _get_latest_trade_date()
    import threading
    threading.Thread(target=_run_industry_sync, args=(trade_date,), daemon=True).start()
    return {"status": "started", "trade_date": trade_date, "message": "产业链分时同步已启动"}


# ── A 股宽基指数分时同步 ──────────────────────────────────────────────
CN_REVIEW_INDICES = ["000001", "399006", "000016", "000300", "000680", "000047"]

_indices_sync_status: dict = {
    "running": False,
    "total": 0,
    "done": 0,
    "ok": 0,
    "cached": 0,
    "error": 0,
    "trade_date": "",
    "started_at": None,
    "finished_at": None,
}


def _run_indices_sync(trade_date: str):
    """后台线程：同步 A 股宽基指数当日1分钟分时数据"""
    import time as _t
    global _indices_sync_status
    _indices_sync_status.update({
        "running": True, "total": len(CN_REVIEW_INDICES), "done": 0,
        "ok": 0, "cached": 0, "error": 0,
        "trade_date": trade_date,
        "started_at": datetime.utcnow().isoformat(),
        "finished_at": None,
    })
    for code in CN_REVIEW_INDICES:
        result = _fetch_one_code(code, trade_date)
        s = result.get("status", "error")
        _indices_sync_status["done"] += 1
        if s in ("ok", "cached"):
            _indices_sync_status[s] += 1
        else:
            _indices_sync_status["error"] += 1
        _t.sleep(0.3)
    _indices_sync_status.update({
        "running": False,
        "finished_at": datetime.utcnow().isoformat(),
    })
    print(f"[indices_sync] {trade_date} 完成: "
          f"ok={_indices_sync_status['ok']} "
          f"cached={_indices_sync_status['cached']} "
          f"error={_indices_sync_status['error']}")


@router.post("/sync-indices")
async def sync_indices_minute(
    date: Optional[str] = Query(None, description="交易日 YYYY-MM-DD，默认最新交易日"),
):
    """手动触发 A 股宽基指数（上证/创业板/上证50/沪深300/科创50/中证全指）当日分时同步"""
    global _indices_sync_status
    if _indices_sync_status.get("running"):
        return {
            "status": "already_running",
            "message": "指数分时同步已在运行中",
            "sync_status": _indices_sync_status,
        }
    trade_date = date if date else _get_latest_trade_date()
    import threading
    threading.Thread(target=_run_indices_sync, args=(trade_date,), daemon=True).start()
    return {
        "status": "started",
        "trade_date": trade_date,
        "indices": CN_REVIEW_INDICES,
        "message": f"已启动 {len(CN_REVIEW_INDICES)} 个A股宽基指数分时同步（{trade_date}）",
    }


@router.get("/stats/indices")
async def get_indices_sync_stats():
    """返回 A 股宽基指数分时数据统计 + 当前同步状态"""
    from sqlalchemy import text as _text
    db = SessionLocal()
    try:
        latest_date = _get_latest_trade_date()
        rows = db.execute(_text("""
            SELECT code, COUNT(*) as bars, MAX(trade_date) as latest_date
            FROM stock_minute_kline
            WHERE code IN ('000001','399006','000016','000300','000680','000047')
            GROUP BY code
        """)).fetchall()
        coverage = {r[0]: {"bars": r[1], "latest_date": r[2]} for r in rows}
    except Exception:
        coverage = {}
    finally:
        db.close()

    return {
        "indices": CN_REVIEW_INDICES,
        "latest_trade_date": latest_date,
        "coverage": coverage,
        "sync_status": _indices_sync_status,
    }
