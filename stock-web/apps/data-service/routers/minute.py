from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from typing import Optional

import realtime_data

router = APIRouter()


def _is_index_code(code: str) -> bool:
    return code.startswith("000") or code.startswith("399")


@router.get("/{code}")
async def get_minute_kline(
    code: str,
    date: Optional[str] = Query(None, description="交易日 YYYY-MM-DD"),
):
    if _is_index_code(code):
        bars = await run_in_threadpool(realtime_data.fetch_index_minute, code)
    else:
        bars = await run_in_threadpool(realtime_data.fetch_minute, code)

    if not bars:
        raise HTTPException(status_code=404, detail="无分时数据（非交易日或停牌）")

    return {
        "code": code,
        "date": date,
        "bars": bars,
        "source": "realtime",
        "count": len(bars),
        "mode": "1min",
    }
