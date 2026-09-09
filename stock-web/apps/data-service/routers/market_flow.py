from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from datetime import datetime
import realtime_data

router = APIRouter()


@router.get("/summary")
async def get_market_fund_flow_summary():
    investor_type = await run_in_threadpool(realtime_data.fetch_market_fund_flow)
    north_bound = await run_in_threadpool(realtime_data.fetch_north_bound_flow)
    return {
        "north_bound": north_bound,
        "investor_type": investor_type,
        "trade_date": datetime.now().strftime("%Y-%m-%d"),
        "data_source": "realtime",
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


@router.get("/north-bound")
async def get_north_bound_flow_only():
    return await run_in_threadpool(realtime_data.fetch_north_bound_flow)
