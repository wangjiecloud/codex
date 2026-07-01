import json
import threading
from collections import deque
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from db import (
    get_db,
    StockMeta,
    StockQuote,
    StockFundamental,
    StockKline,
    IndustryNode,
    NewsFlash,
)
from datetime import datetime, timedelta

router = APIRouter()

_sched_logs: deque = deque(maxlen=200)
_sched_logs_lock = threading.Lock()
_sched_log_seq: int = 0

_failed_stocks: dict = {}
_failed_stocks_lock = threading.Lock()


def record_failed_stock(code: str, name: str, reason: str, sync_type: str = "kline"):
    with _failed_stocks_lock:
        key = f"{sync_type}:{code}"
        _failed_stocks[key] = {
            "code": code,
            "name": name,
            "reason": reason,
            "syncType": sync_type,
            "time": datetime.now().isoformat(),
        }


def sched_log(level: str, message: str, source: str = "manual"):
    global _sched_log_seq
    with _sched_logs_lock:
        _sched_log_seq += 1
        _sched_logs.append(
            {
                "seq": _sched_log_seq,
                "time": datetime.now().strftime("%H:%M:%S"),
                "level": level,
                "message": message,
                "source": source,
            }
        )


def _get_last_sync(table_class, field_name="updated_at") -> str | None:
    from db import SessionLocal
    from sqlalchemy import func as _func

    db = SessionLocal()
    try:
        row = db.query(_func.max(getattr(table_class, field_name))).scalar()
        return row.isoformat() if row else None
    except Exception:
        return None
    finally:
        db.close()


@router.get("/stats")
async def get_system_stats(db: Session = Depends(get_db)):
    total_stocks = db.query(func.count(StockMeta.code)).scalar() or 0

    total_quote_data = db.query(func.count(StockQuote.code)).scalar() or 0
    total_fundamental_data = db.query(func.count(StockFundamental.code)).scalar() or 0
    total_stock_info_data = db.query(func.count(StockMeta.code)).scalar() or 0
    total_kline_data = db.query(func.count(StockKline.id)).scalar() or 0
    stocks_with_kline = (
        db.query(func.count(func.distinct(StockKline.code))).scalar() or 0
    )

    total_data = total_quote_data + total_fundamental_data

    stocks_with_quote = (
        db.query(func.count(StockQuote.code))
        .filter(StockQuote.updated_at.isnot(None))
        .scalar()
        or 0
    )
    stocks_with_fundamental = db.query(func.count(StockFundamental.code)).scalar() or 0

    return {
        "totalStocks": total_stocks,
        "totalData": total_data,
        "dataByType": {
            "quote": total_quote_data,
            "fundamental": total_fundamental_data,
            "stock_info": total_stock_info_data,
            "kline": total_kline_data,
        },
        "stocksByDataType": {
            "quote": stocks_with_quote,
            "fundamental": stocks_with_fundamental,
            "stock_info": total_stock_info_data,
            "kline": stocks_with_kline,
        },
        "quoteLastSync": _get_last_sync(StockQuote),
        "fundamentalLastSync": _get_last_sync(StockFundamental),
        "klineLastSync": _get_last_sync(StockKline),
        "stockInfoLastSync": _get_last_sync(StockMeta),
    }


_FLASH_CATEGORIES = {
    "important": "重要",
    "a": "A股",
    "hk": "港股",
    "us": "美股",
    "abnormal": "异动",
    "notice": "公告",
}


@router.get("/flash-stats")
async def get_flash_stats(db: Session = Depends(get_db)):
    from routers.news_flash import _syncing_cats, _syncing_lock

    with _syncing_lock:
        syncing = set(_syncing_cats)

    rows = (
        db.query(
            NewsFlash.category,
            func.count(NewsFlash.id).label("count"),
            func.max(NewsFlash.ctime).label("latest_ctime"),
            func.max(NewsFlash.updated_at).label("last_sync"),
        )
        .group_by(NewsFlash.category)
        .all()
    )

    stats_map = {r.category: r for r in rows}
    result = []
    for key, label in _FLASH_CATEGORIES.items():
        r = stats_map.get(key)
        result.append(
            {
                "key": key,
                "label": label,
                "count": r.count if r else 0,
                "latestCtime": r.latest_ctime if r else None,
                "lastSync": r.last_sync.isoformat() if r and r.last_sync else None,
                "syncing": key in syncing,
            }
        )
    return result


@router.get("/failed-stocks")
async def get_failed_stocks():
    with _failed_stocks_lock:
        return {"failed": list(_failed_stocks.values())}


@router.post("/retry-failed")
async def retry_failed_stocks(codes: list[str] = None):
    from routers.industry import _sync_klines
    import threading

    def _retry():
        with _failed_stocks_lock:
            targets = (
                [
                    _failed_stocks.get(f"kline:{c}")
                    for c in codes
                    if f"kline:{c}" in _failed_stocks
                ]
                if codes
                else list(_failed_stocks.values())
            )
        for item in targets:
            if not item:
                continue
            try:
                if item["syncType"] == "kline":
                    _sync_klines(item["code"], "daily")
                    with _failed_stocks_lock:
                        _failed_stocks.pop(f"kline:{item['code']}", None)
                    sched_log("success", f"重试成功: {item['code']} {item['name']}")
            except Exception as e:
                sched_log("error", f"重试失败: {item['code']} - {e}")

    threading.Thread(target=_retry, daemon=True).start()
    return {"status": "started"}


@router.delete("/failed-stocks")
async def clear_failed_stocks():
    with _failed_stocks_lock:
        _failed_stocks.clear()
    return {"status": "ok"}


@router.get("/scheduler-logs")
async def get_scheduler_logs(since: int = Query(0)):
    with _sched_logs_lock:
        logs = [e for e in _sched_logs if e["seq"] > since]
    return {"logs": logs, "latest_seq": _sched_log_seq}
