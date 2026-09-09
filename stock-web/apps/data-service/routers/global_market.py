from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
import realtime_data

router = APIRouter()

_REGION_MAP: dict[str, str] = {
    "000001": "cn",
    "399001": "cn",
    "399006": "cn",
    "000016": "cn",
    "000300": "cn",
    "000688": "cn",
    "000047": "cn",
    "000680": "cn",
    "HSI": "hk",
    "HSCEI": "hk",
    "HSTECH": "hk",
    "DJIA": "us",
    "SPX": "us",
    "NDX": "us",
    "FTSE": "eu",
    "GDAXI": "eu",
    "FCHI": "eu",
    "SX5E": "eu",
    "N225": "asia",
    "KS11": "asia",
    "TWII": "asia",
    "AS51": "asia",
    "SENSEX": "asia",
    "UDI": "other",
    "CRB": "other",
    "BDI": "other",
}

FEATURED_CODES = [
    "000001",
    "399001",
    "399006",
    "000300",
    "HSI",
    "HSCEI",
    "DJIA",
    "SPX",
    "NDX",
    "FTSE",
    "GDAXI",
    "FCHI",
    "N225",
    "KS11",
    "TWII",
    "AS51",
    "UDI",
]

CN_INDEX_CODES = [
    "000001",
    "399001",
    "399006",
    "000016",
    "000300",
    "000688",
    "000047",
    "000680",
]


def _add_region(item: dict) -> dict:
    item["region"] = _REGION_MAP.get(item.get("code", ""), "other")
    return item


@router.get("/indices")
async def get_all_indices():
    data = await run_in_threadpool(realtime_data.fetch_global_indices)
    return [_add_region(item) for item in data]


@router.get("/featured")
async def get_featured_indices():
    data = await run_in_threadpool(realtime_data.fetch_global_indices, FEATURED_CODES)
    code_order = {c: i for i, c in enumerate(FEATURED_CODES)}
    data.sort(key=lambda x: code_order.get(x.get("code", ""), 999))
    return [_add_region(item) for item in data]


@router.get("/cn_indices")
async def get_cn_indices():
    data = await run_in_threadpool(realtime_data.fetch_global_indices, CN_INDEX_CODES)
    return data


@router.get("/sh_trend")
async def get_sh_trend():
    data = await run_in_threadpool(realtime_data.fetch_index_minute, "000001")
    return data


@router.get("/overview")
async def get_market_overview():
    data = await run_in_threadpool(realtime_data.fetch_global_indices)
    return [_add_region(item) for item in data]
