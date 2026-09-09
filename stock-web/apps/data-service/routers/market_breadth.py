from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
import realtime_data

router = APIRouter()


@router.get("")
async def get_market_breadth(days: int = 60):
    data = await run_in_threadpool(realtime_data.fetch_market_breadth)
    return [data] if data else []


@router.get("/summary")
async def get_market_breadth_summary(days: int = Query(20, ge=5, le=60)):
    data = await run_in_threadpool(realtime_data.fetch_market_breadth)
    if not data:
        return {
            "trade_date": None,
            "sentiment_score": None,
            "sentiment_level": None,
            "sentiment_state": None,
            "latest": None,
            "signals": [],
        }
    return {
        "trade_date": data.get("tradeDate"),
        "latest": {
            "up_count": data.get("upCount", 0),
            "down_count": data.get("downCount", 0),
            "flat_count": data.get("flatCount", 0),
            "limit_up": data.get("limitUp", 0),
            "limit_down": data.get("limitDown", 0),
            "total": data.get("total", 0),
        },
        "signals": [],
    }
