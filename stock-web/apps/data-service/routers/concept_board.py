import json
from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from datetime import datetime
from db import SessionLocal, IndustryNode, IndustryList
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


@router.get("/industry-rotation")
async def get_industry_rotation(days: int = Query(default=7, ge=1, le=30)):
    def _fetch():
        db = SessionLocal()
        try:
            nodes = db.query(IndustryNode).filter(IndustryNode.stocks != "[]").all()
            groups: dict[tuple[str, str], set[str]] = {}
            for node in nodes:
                stocks_list = json.loads(node.stocks or "[]")
                key = (node.industry_id, node.layer)
                if key not in groups:
                    groups[key] = set()
                for code in stocks_list:
                    if code and realtime_data.is_a_share(code):
                        groups[key].add(code)

            all_codes = sorted(set().union(*groups.values())) if groups else []
            if not all_codes:
                return {"dates": [], "boards": []}

            quotes = realtime_data.fetch_batch_quotes(all_codes)
            quote_map = {q["code"]: q for q in quotes}

            import concurrent.futures as cf

            kline_map: dict[str, list] = {}
            with cf.ThreadPoolExecutor(max_workers=50) as executor:
                futures = {
                    executor.submit(realtime_data.fetch_kline, c, "daily", days + 1): c
                    for c in all_codes
                }
                for f in cf.as_completed(futures):
                    code = futures[f]
                    try:
                        kline_map[code] = f.result()
                    except Exception:
                        pass

            industry_map = {}
            for il in db.query(IndustryList).all():
                industry_map[il.industry_id] = il.name

            dates: list[str] = []
            rotation_boards: list[dict] = []
            for (industry_id, layer), codes in groups.items():
                valid_quotes = [quote_map[c] for c in codes if c in quote_map]
                if not valid_quotes:
                    continue
                avg_pct = sum(q["change"] for q in valid_quotes) / len(valid_quotes)

                hist_data: list[float | None] = [None] * days
                for i in range(days):
                    vals = []
                    for c in codes:
                        bars = kline_map.get(c, [])
                        if len(bars) >= 2:
                            hist_bars = bars[-(days + 1) : -1]
                            if i < len(hist_bars):
                                vals.append(hist_bars[i].get("changePct", 0.0))
                    if vals:
                        hist_data[i] = round(sum(vals) / len(vals), 2)

                if not dates:
                    for c in codes:
                        bars = kline_map.get(c, [])
                        if len(bars) >= 2:
                            hist_bars = bars[-(days + 1) : -1]
                            dates = [b["time"] for b in hist_bars]
                            break

                industry_name = industry_map.get(industry_id, industry_id)
                rotation_boards.append(
                    {
                        "code": f"{industry_id}_{layer}",
                        "name": f"{industry_name}·{layer}",
                        "tag": None,
                        "currentChangePct": round(avg_pct, 2),
                        "data": hist_data,
                    }
                )

            return {"dates": dates, "boards": rotation_boards}
        finally:
            db.close()

    return await run_in_threadpool(_fetch)
