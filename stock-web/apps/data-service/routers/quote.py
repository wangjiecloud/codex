from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

import realtime_data

router = APIRouter()


def _is_a_share(code: str) -> bool:
    if not code or len(code) != 6:
        return False
    if code.startswith("0") or code.startswith("3"):
        return True
    if code.startswith("6") or code.startswith("688"):
        return True
    return False


@router.get("/search")
async def search_stocks(q: str = Query("", description="股票代码或名称关键字")):
    if not q.strip():
        return {"results": []}
    results = await run_in_threadpool(realtime_data.search_stocks, q.strip(), 20)
    return {"results": results}


@router.get("/industries")
async def get_stock_industries(
    codes: list[str] = Query([], description="股票代码列表"),
):
    if not codes:
        return {}

    def _fetch():
        result = {}
        for code in codes:
            detail = realtime_data.fetch_stock_detail(code)
            industry = detail.get("industry", "") if detail else ""
            result[code] = industry if industry else "未分类"
        return result

    return await run_in_threadpool(_fetch)


@router.get("/batch")
async def get_batch_quotes(codes: list[str] = Query([], description="股票代码列表")):
    if not codes:
        return {"quotes": []}
    quotes = await run_in_threadpool(realtime_data.fetch_batch_quotes, codes)
    return {"quotes": quotes}


@router.get("/{code}")
async def get_quote(code: str):
    quote = await run_in_threadpool(realtime_data.fetch_quote_with_detail, code)
    if not quote:
        raise HTTPException(status_code=404, detail=f"No quote data for {code}")
    return quote
