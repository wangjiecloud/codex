from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
import realtime_data

router = APIRouter()


@router.get("/hot")
async def get_hot_themes():
    data = await run_in_threadpool(realtime_data.fetch_industry_boards)
    return data[:10]


@router.get("/popular-stocks")
async def get_popular_stocks(
    sort: str = Query("popular", description="popular=人气榜 hot=热度 rise=飙升榜"),
):
    data = await run_in_threadpool(realtime_data.fetch_popular_stocks, sort)
    return {"stocks": data, "sort": sort, "total": len(data)}


@router.get("/{theme_id}")
async def get_theme_stocks(theme_id: str):
    data = await run_in_threadpool(realtime_data.fetch_board_stocks, theme_id)
    return data


@router.get("/{theme_id}/stocks")
async def get_theme_stocks_explicit(theme_id: str):
    data = await run_in_threadpool(realtime_data.fetch_board_stocks, theme_id)
    return data
