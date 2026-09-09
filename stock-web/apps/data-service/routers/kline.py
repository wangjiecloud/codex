from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.concurrency import run_in_threadpool

import realtime_data

router = APIRouter()

_GLOBAL_INDEX_CODES = {
    "HSI",
    "HSCEI",
    "HSTECH",
    "HSCCI",
    "DJIA",
    "SPX",
    "NDX",
    "N225",
    "KS11",
    "KOSPI200",
    "FTSE",
    "GDAXI",
    "FCHI",
    "SX5E",
    "MIB",
    "IBEX",
    "AEX",
    "SSMI",
    "TWII",
    "AS51",
    "SENSEX",
    "JKSE",
    "KLSE",
    "STI",
    "VNINDEX",
    "SET",
    "UDI",
}

_CN_INDEX_EM_CODES = {"000688", "880351", "000680"}


def _is_global_index(code: str) -> bool:
    return code in _GLOBAL_INDEX_CODES or code in _CN_INDEX_EM_CODES


@router.get("/{code}")
async def get_kline(
    code: str,
    period: str = Query(default="daily"),
    count: int = Query(default=110, ge=10, le=1000),
    response: Response = None,
):
    if response:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    if _is_global_index(code):
        bars = await run_in_threadpool(
            realtime_data.fetch_global_index_kline, code, period, count
        )
        if not bars:
            raise HTTPException(status_code=404, detail=f"No kline data for {code}")
        return bars

    bars = await run_in_threadpool(realtime_data.fetch_kline, code, period, count)
    if not bars:
        raise HTTPException(status_code=404, detail=f"No kline data for {code}")
    return bars
