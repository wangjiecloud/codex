from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
import realtime_data

router = APIRouter()


@router.get("/{code}")
async def get_news(
    code: str,
    count: int = Query(default=20, ge=5, le=100),
):
    news = await run_in_threadpool(realtime_data.fetch_stock_news, code)
    news = news[:count]
    return {
        "code": code,
        "news": [
            {
                "code": r.get("code", code),
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "source": r.get("source", ""),
                "pubTime": r.get("pubTime", ""),
            }
            for r in news
        ],
    }
