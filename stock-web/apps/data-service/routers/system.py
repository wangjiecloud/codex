import json
import threading
from collections import deque
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from db import (
    get_db,
    GubaPost,
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


def sched_log(level: str, message: str):
    global _sched_log_seq
    with _sched_logs_lock:
        _sched_log_seq += 1
        _sched_logs.append(
            {
                "seq": _sched_log_seq,
                "time": datetime.now().strftime("%H:%M:%S"),
                "level": level,
                "message": message,
            }
        )


def _get_guba_last_sync() -> str | None:
    try:
        from routers.guba import _guba_last_sync

        if _guba_last_sync:
            return _guba_last_sync
    except Exception:
        pass
    from db import SessionLocal, GubaPost
    from sqlalchemy import func as _func

    db = SessionLocal()
    try:
        row = db.query(_func.max(GubaPost.updated_at)).scalar()
        return row.isoformat() if row else None
    except Exception:
        return None
    finally:
        db.close()


@router.get("/stats")
async def get_system_stats(db: Session = Depends(get_db)):
    node_rows = (
        db.query(IndustryNode.industry_id, IndustryNode.stocks)
        .filter(IndustryNode.industry_id != "overview")
        .all()
    )
    industry_stocks: set[str] = set()
    for _, stocks_json in node_rows:
        try:
            industry_stocks.update(json.loads(stocks_json) if stocks_json else [])
        except Exception:
            pass
    total_stocks = len(industry_stocks)

    total_guba_data = db.query(func.count(GubaPost.id)).scalar() or 0
    total_quote_data = db.query(func.count(StockQuote.code)).scalar() or 0
    total_fundamental_data = db.query(func.count(StockFundamental.code)).scalar() or 0
    total_stock_info_data = db.query(func.count(StockMeta.code)).scalar() or 0
    total_kline_data = db.query(func.count(StockKline.id)).scalar() or 0
    stocks_with_kline = (
        db.query(func.count(func.distinct(StockKline.code))).scalar() or 0
    )

    total_data = total_guba_data + total_quote_data + total_fundamental_data

    announcement_count = (
        db.query(func.count(GubaPost.id))
        .filter(GubaPost.category == "announcement")
        .scalar()
        or 0
    )
    research_count = (
        db.query(func.count(GubaPost.id))
        .filter(GubaPost.category == "research")
        .scalar()
        or 0
    )
    news_count = (
        db.query(func.count(GubaPost.id)).filter(GubaPost.category == "news").scalar()
        or 0
    )

    recent_cutoff = datetime.utcnow() - timedelta(days=7)
    recent_updates = (
        db.query(
            GubaPost.code,
            func.count(GubaPost.id).label("count"),
            func.max(GubaPost.updated_at).label("updated_at"),
        )
        .filter(GubaPost.updated_at >= recent_cutoff)
        .group_by(GubaPost.code)
        .order_by(func.max(GubaPost.updated_at).desc())
        .limit(10)
        .all()
    )

    stocks_with_guba = db.query(func.count(func.distinct(GubaPost.code))).scalar() or 0
    stocks_with_quote = db.query(func.count(StockQuote.code)).scalar() or 0
    stocks_with_fundamental = db.query(func.count(StockFundamental.code)).scalar() or 0

    return {
        "totalStocks": total_stocks,
        "totalData": total_data,
        "dataByType": {
            "guba": total_guba_data,
            "quote": total_quote_data,
            "fundamental": total_fundamental_data,
            "stock_info": total_stock_info_data,
            "kline": total_kline_data,
        },
        "stocksByDataType": {
            "guba": stocks_with_guba,
            "quote": stocks_with_quote,
            "fundamental": stocks_with_fundamental,
            "stock_info": total_stock_info_data,
            "kline": stocks_with_kline,
        },
        "categories": {
            "announcement": announcement_count,
            "research": research_count,
            "news": news_count,
        },
        "recentUpdates": [
            {
                "code": update.code,
                "count": update.count,
                "updatedAt": update.updated_at,
            }
            for update in recent_updates
        ],
        "gubaLastSync": _get_guba_last_sync(),
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


@router.get("/scheduler-logs")
async def get_scheduler_logs(since: int = Query(0)):
    with _sched_logs_lock:
        logs = [e for e in _sched_logs if e["seq"] > since]
    return {"logs": logs, "latest_seq": _sched_log_seq}
