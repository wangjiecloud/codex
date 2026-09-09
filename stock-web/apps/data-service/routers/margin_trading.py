from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
import realtime_data

router = APIRouter()


@router.get("/latest")
async def get_margin_latest():
    data = await run_in_threadpool(realtime_data.fetch_margin_trading)
    if not data:
        return {"date": None, "total": None, "sh": None, "sz": None, "bj": None}
    return {
        "date": data.get("tradeDate"),
        "total": {
            "marginBalance": data.get("marginBalance", 0.0),
            "rzBalance": data.get("rzBalance", 0.0),
            "rqBalance": data.get("rqBalance", 0.0),
            "rzBuy": data.get("rzBuy", 0.0),
            "rzRepay": data.get("rzRepay", 0.0),
        },
        "sh": None,
        "sz": None,
        "bj": None,
    }


@router.get("/history")
async def get_margin_history(
    market: str = Query("total"),
    limit: int = Query(120, ge=1, le=500),
):
    data = await run_in_threadpool(realtime_data.fetch_margin_trading)
    if not data:
        return []
    return [
        {
            "tradeDate": data.get("tradeDate"),
            "marginBalance": data.get("marginBalance", 0.0),
            "rzBalance": data.get("rzBalance", 0.0),
            "rqBalance": data.get("rqBalance", 0.0),
            "rzBuy": data.get("rzBuy", 0.0),
            "rzRepay": data.get("rzRepay", 0.0),
        }
    ]


@router.get("/table")
async def get_margin_table(
    limit: int = Query(60, ge=1, le=500),
):
    data = await run_in_threadpool(realtime_data.fetch_margin_trading)
    if not data:
        return []
    return [
        {
            "tradeDate": data.get("tradeDate"),
            "total": {
                "rzBalance": data.get("rzBalance", 0.0),
                "rzBuy": data.get("rzBuy", 0.0),
                "rqBalance": data.get("rqBalance", 0.0),
                "marginBalance": data.get("marginBalance", 0.0),
            },
            "sh": None,
            "sz": None,
            "bj": None,
        }
    ]


@router.get("/stocks")
async def get_stock_snapshots(
    date: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query("rz_net"),
):
    rows = await run_in_threadpool(realtime_data.fetch_margin_trading_stocks)
    sort_key_map = {
        "rz_net": "rzNet",
        "rz_balance": "rzBalance",
        "margin_balance": "marginBalance",
        "rz_buy": "rzBuy",
    }
    key = sort_key_map.get(sort_by, "rzNet")
    rows.sort(key=lambda x: x.get(key, 0), reverse=True)
    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "date": date,
        "total": total,
        "rows": rows[start:end],
    }
