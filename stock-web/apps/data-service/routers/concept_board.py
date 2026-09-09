from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from datetime import datetime
import realtime_data

router = APIRouter()


@router.get("")
async def get_boards(
    sort: str = Query("change_pct"),
    limit: int = Query(20, le=100),
):
    concept = await run_in_threadpool(realtime_data.fetch_concept_boards)
    industry = await run_in_threadpool(realtime_data.fetch_industry_boards)
    combined = concept + industry
    sort_key_map = {
        "change_pct": "changePct",
        "turnover": "turnoverRate",
        "name": "name",
    }
    key = sort_key_map.get(sort, "changePct")
    combined.sort(key=lambda x: x.get(key, 0), reverse=(sort != "name"))
    return combined[:limit]


@router.get("/industry")
async def get_industry_boards(
    sort: str = Query("change_pct"),
    limit: int = Query(100, le=200),
):
    boards = await run_in_threadpool(realtime_data.fetch_industry_boards)
    sort_key_map = {
        "change_pct": "changePct",
        "turnover": "turnoverRate",
        "name": "name",
    }
    key = sort_key_map.get(sort, "changePct")
    boards.sort(key=lambda x: x.get(key, 0), reverse=(sort != "name"))
    return boards[:limit]


@router.get("/constituents/{board_code}")
async def get_constituents(board_code: str):
    stocks = await run_in_threadpool(realtime_data.fetch_board_stocks, board_code)
    return {
        "board_code": board_code,
        "constituents": [
            {"code": s.get("code", ""), "name": s.get("name", "")} for s in stocks
        ],
        "syncing": False,
        "updated_at": datetime.utcnow().isoformat(),
    }


@router.get("/industry-constituents/{board_code}")
async def get_industry_constituents(board_code: str):
    stocks = await run_in_threadpool(realtime_data.fetch_board_stocks, board_code)
    return [
        {
            "code": s.get("code", ""),
            "name": s.get("name", ""),
            "price": s.get("price", 0.0),
            "changePct": s.get("changePct", 0.0),
            "changeAmt": s.get("changeAmt", 0.0),
            "open": s.get("open", 0.0),
            "prevClose": s.get("prevClose", 0.0),
            "high": s.get("high", 0.0),
            "low": s.get("low", 0.0),
            "volume": s.get("volume", 0.0),
            "turnover": s.get("turnover", 0.0),
            "turnoverRate": s.get("turnoverRate", 0.0),
            "updatedAt": datetime.utcnow().isoformat(),
        }
        for s in stocks
    ]
