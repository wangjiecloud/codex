from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
import realtime_data

router = APIRouter()


@router.get("/{code}")
async def get_guba(
    code: str,
    post_type: str = Query(default="news", description="news=资讯, notice=公告"),
    count: int = Query(default=30, ge=5, le=100),
):
    news = await run_in_threadpool(realtime_data.fetch_stock_news, code)
    news = news[:count]
    return {
        "code": code,
        "type": post_type,
        "items": [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "author": r.get("source", ""),
                "readCount": 0,
                "replyCount": 0,
                "pubTime": r.get("pubTime", ""),
            }
            for r in news
        ],
    }
