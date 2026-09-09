from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from datetime import datetime
import realtime_data

router = APIRouter()


@router.get("/concept")
async def get_concept_fund_flow(
    sort: str = Query(default="netflow"),
    order: str = Query(default="desc"),
    limit: int = Query(default=50, ge=1, le=500),
):
    rows = await run_in_threadpool(realtime_data.fetch_fund_flow_concept)
    sort_key_map = {
        "netflow": "mainNet",
        "inflow": "superNet",
        "outflow": "bigNet",
        "changePct": "changePct",
        "name": "name",
    }
    key = sort_key_map.get(sort, "mainNet")
    rows.sort(key=lambda x: x.get(key, 0), reverse=(order != "asc"))
    return {"items": rows[:limit], "total": len(rows)}


@router.get("/industry")
async def get_industry_fund_flow(
    sort: str = Query(default="netflow"),
    order: str = Query(default="desc"),
    limit: int = Query(default=50, ge=1, le=2000),
):
    rows = await run_in_threadpool(realtime_data.fetch_fund_flow_industry)
    sort_key_map = {
        "netflow": "mainNet",
        "inflow": "superNet",
        "outflow": "bigNet",
        "changePct": "changePct",
        "name": "name",
    }
    key = sort_key_map.get(sort, "mainNet")
    rows.sort(key=lambda x: x.get(key, 0), reverse=(order != "asc"))
    return {"items": rows[:limit], "total": len(rows)}
