import json
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from db import (
    SessionLocal,
    IndustryNode,
    IndustryEdge,
    IndustryMeta,
    IndustryList,
)
import realtime_data

router = APIRouter()

_COMPANY_CHAIN_SEEDS = [
    {
        "industry_id": "nvidia_chain",
        "name": "英伟达",
        "icon": "🟢",
        "description": "英伟达GPU/AI加速器相关A股产业链：受益于NVDA算力需求的上下游国内企业",
        "representatives": json.dumps(
            ["中际旭创", "工业富联", "沪电股份", "长电科技"], ensure_ascii=False
        ),
        "company_count": 0,
        "last_analyzed": "未分析",
        "sort_order": 100,
        "tab": "company",
    },
    {
        "industry_id": "changxin_chain",
        "name": "长鑫存储",
        "icon": "🔵",
        "description": "长鑫存储DRAM自主化相关A股产业链：设备/材料/封测等国产替代供应链",
        "representatives": json.dumps(
            ["北方华创", "中微公司", "沪硅产业", "拓荆科技"], ensure_ascii=False
        ),
        "company_count": 0,
        "last_analyzed": "未分析",
        "sort_order": 101,
        "tab": "company",
    },
]


def seed_company_chains() -> None:
    db = SessionLocal()
    try:
        for seed in _COMPANY_CHAIN_SEEDS:
            exists = (
                db.query(IndustryList)
                .filter(IndustryList.industry_id == seed["industry_id"])
                .first()
            )
            if not exists:
                db.add(IndustryList(**seed))
        db.commit()
    finally:
        db.close()


def _get_all_industry_a_shares(db: Session) -> list[str]:
    rows = db.query(IndustryNode).filter(IndustryNode.stocks != "[]").all()
    codes: set[str] = set()
    for row in rows:
        for code in json.loads(row.stocks or "[]"):
            if code and realtime_data.is_a_share(code):
                codes.add(code)
    return sorted(codes)


@router.get("/list")
async def get_industry_list():
    def _fetch():
        db = SessionLocal()
        try:
            rows = db.query(IndustryList).order_by(IndustryList.sort_order).all()
            return {
                "industries": [
                    {
                        "id": r.industry_id,
                        "name": r.name,
                        "description": r.description,
                        "icon": r.icon,
                        "companyCount": r.company_count or 0,
                        "lastAnalyzed": r.last_analyzed,
                        "representatives": json.loads(r.representatives or "[]"),
                        "tab": r.tab or "ai_infra",
                    }
                    for r in rows
                ]
            }
        finally:
            db.close()

    result = await run_in_threadpool(_fetch)
    return JSONResponse(content=result)


@router.get("/graph/{industry_id}")
async def get_industry_graph(industry_id: str):
    def _fetch():
        db = SessionLocal()
        try:
            nodes = (
                db.query(IndustryNode)
                .filter(IndustryNode.industry_id == industry_id)
                .all()
            )
            edges = (
                db.query(IndustryEdge)
                .filter(IndustryEdge.industry_id == industry_id)
                .all()
            )
            meta_row = (
                db.query(IndustryMeta)
                .filter(IndustryMeta.industry_id == industry_id)
                .first()
            )
            return nodes, edges, meta_row
        finally:
            db.close()

    nodes, edges, meta_row = await run_in_threadpool(_fetch)
    if not nodes and not meta_row:
        raise HTTPException(status_code=404, detail="Industry not found")
    result = {
        "title": meta_row.title if meta_row else industry_id,
        "subtitle": meta_row.subtitle if meta_row else "",
        "layerLabels": json.loads(meta_row.layer_labels or "[]") if meta_row else [],
        "nodes": [
            {
                "id": n.node_id,
                "x": n.x,
                "y": n.y,
                "label": n.label,
                "icon": n.icon,
                "desc": n.desc,
                "layer": n.layer,
                "ticker": n.ticker,
                "market": n.market,
                "group": n.group_name,
                "stocks": json.loads(n.stocks or "[]"),
            }
            for n in nodes
        ],
        "edges": [
            {
                "id": e.edge_id,
                "source": e.source,
                "target": e.target,
                "layer": e.layer,
                "label": e.label,
            }
            for e in edges
        ],
    }
    return JSONResponse(content=result)


@router.get("/node-stocks")
async def get_node_stocks():
    def _fetch():
        db = SessionLocal()
        try:
            rows = db.query(IndustryNode).filter(IndustryNode.stocks != "[]").all()
            result: dict[str, dict[str, list[str]]] = {}
            for row in rows:
                result.setdefault(row.industry_id, {})[row.node_id] = json.loads(
                    row.stocks or "[]"
                )
            return {"nodeStocks": result}
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


@router.get("/stock-industry-map")
async def get_stock_industry_map():
    def _fetch():
        db = SessionLocal()
        try:
            nodes = db.query(IndustryNode).filter(IndustryNode.stocks != "[]").all()
            stock_to_industries: dict[str, list[str]] = {}
            for node in nodes:
                node_codes = json.loads(node.stocks or "[]")
                for code in node_codes:
                    stock_to_industries.setdefault(code, [])
                    if node.industry_id not in stock_to_industries[code]:
                        stock_to_industries[code].append(node.industry_id)
            return {"mapping": stock_to_industries}
        finally:
            db.close()

    result = await run_in_threadpool(_fetch)
    return JSONResponse(content=result)


@router.get("/non-a-shares")
async def get_non_a_share_info():
    def _fetch():
        db = SessionLocal()
        try:
            rows = db.query(IndustryNode).filter(IndustryNode.market != "A").all()
            seen: set[str] = set()
            result: list[dict] = []
            for row in rows:
                if row.ticker and row.ticker not in seen:
                    seen.add(row.ticker)
                    result.append(
                        {
                            "code": row.ticker,
                            "name": row.label,
                            "market": row.market or "",
                        }
                    )
            return {"symbols": result}
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


@router.get("/perf")
async def get_stock_performance():
    def _fetch():
        db = SessionLocal()
        try:
            rows = db.query(IndustryList).order_by(IndustryList.sort_order).all()
            industries = [
                {
                    "id": r.industry_id,
                    "name": r.name,
                    "icon": r.icon,
                    "companyCount": r.company_count or 0,
                }
                for r in rows
            ]
            all_codes: list[str] = []
            seen: set[str] = set()
            node_rows = db.query(IndustryNode).filter(IndustryNode.stocks != "[]").all()
            for nr in node_rows:
                for code in json.loads(nr.stocks or "[]"):
                    if code and realtime_data.is_a_share(code) and code not in seen:
                        seen.add(code)
                        all_codes.append(code)
            quotes = realtime_data.fetch_batch_quotes(all_codes)
            return {"industries": industries, "quotes": quotes}
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


@router.get("/stocks")
async def get_industry_quotes(
    codes: str = Query("", description="逗号分隔的股票代码，留空返回全部产业链"),
):
    def _fetch():
        db = SessionLocal()
        try:
            if codes:
                code_list = [c.strip() for c in codes.split(",") if c.strip()]
            else:
                code_list = _get_all_industry_a_shares(db)
            quotes = realtime_data.fetch_batch_quotes(code_list)
            return {"quotes": {q["code"]: q for q in quotes}, "total": len(quotes)}
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


@router.get("/news")
async def get_industry_news(
    codes: str = Query("", description="逗号分隔的股票代码"),
    limit: int = Query(50, ge=5, le=200),
    flash: bool = Query(False, description="是否返回7x24快讯"),
):
    if flash:
        items = realtime_data.fetch_7x24_flash()
        return {"news": items[:limit]}

    if codes:
        code_list = [c.strip() for c in codes.split(",") if c.strip()]
    else:

        def _get_all_codes():
            db = SessionLocal()
            try:
                return _get_all_industry_a_shares(db)
            finally:
                db.close()

        code_list = await run_in_threadpool(_get_all_codes)

    all_news: list[dict] = []
    for code in code_list[:20]:
        items = realtime_data.fetch_stock_news(code)
        all_news.extend(items)
    all_news.sort(key=lambda x: x.get("pubTime", ""), reverse=True)
    return {"news": all_news[:limit]}
