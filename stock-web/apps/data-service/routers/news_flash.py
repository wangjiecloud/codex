from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
import realtime_data

router = APIRouter()


@router.get("")
async def get_news_flash():
    data = await run_in_threadpool(realtime_data.fetch_7x24_flash)
    return data


@router.get("/")
async def get_news_flash_slash():
    data = await run_in_threadpool(realtime_data.fetch_7x24_flash)
    return data
