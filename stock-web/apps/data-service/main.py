from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from routers import (
    quote,
    kline,
    fundamental,
    news,
    industry,
    guba,
    sync,
    system,
    global_market,
    news_flash,
    concept_board,
    theme,
    portfolio,
    sw_industry,
)
import akshare as ak
from fastapi import HTTPException
from db import init_db
from datetime import datetime, time as dtime, timedelta
import threading
from apscheduler.schedulers.background import BackgroundScheduler

app = FastAPI(title="股策AI 数据服务", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "null"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(quote.router, prefix="/api/quote", tags=["行情"])
app.include_router(kline.router, prefix="/api/kline", tags=["K线"])
app.include_router(fundamental.router, prefix="/api/fundamental", tags=["基本面"])
app.include_router(news.router, prefix="/api/news", tags=["新闻"])
app.include_router(industry.router, prefix="/api/industry", tags=["产业链"])
app.include_router(guba.router, prefix="/api/guba", tags=["股吧资讯"])
app.include_router(sync.router, prefix="/api/sync", tags=["数据同步"])
app.include_router(system.router, prefix="/api/system", tags=["系统监控"])
app.include_router(global_market.router, prefix="/api/global", tags=["全球市场"])
app.include_router(news_flash.router, prefix="/api/flash", tags=["快讯"])
app.include_router(concept_board.router, prefix="/api/board", tags=["概念板块"])
app.include_router(theme.router, prefix="/api/theme", tags=["主题板块"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["持仓管理"])
app.include_router(sw_industry.router, prefix="/api/sw-industry", tags=["申万行业"])

_scheduler = BackgroundScheduler(timezone="Asia/Shanghai")


def _warmup_caches():
    from routers.industry import (
        _fetch_industry_quotes,
        _industry_list_cache,
        _industry_stocks_cache,
        _industry_map_cache,
        _INDUSTRY_LIST_TTL,
        _INDUSTRY_STOCKS_TTL,
        _INDUSTRY_MAP_TTL,
    )
    from db import SessionLocal, IndustryList, IndustryNode
    import json, time

    print("[warmup] pre-warming caches...")
    try:
        db = SessionLocal()
        try:
            rows = db.query(IndustryList).order_by(IndustryList.sort_order).all()
            list_data = {
                "industries": [
                    {
                        "id": r.industry_id,
                        "name": r.name,
                        "description": r.description,
                        "icon": r.icon,
                        "companyCount": r.company_count or 0,
                        "lastAnalyzed": r.last_analyzed,
                        "representatives": json.loads(r.representatives or "[]"),
                    }
                    for r in rows
                ]
            }
            _industry_list_cache["ts"] = time.time()
            _industry_list_cache["data"] = list_data

            nodes = db.query(IndustryNode).filter(IndustryNode.stocks != "[]").all()
            stock_to_industries: dict = {}
            for node in nodes:
                for code in json.loads(node.stocks or "[]"):
                    stock_to_industries.setdefault(code, [])
                    if node.industry_id not in stock_to_industries[code]:
                        stock_to_industries[code].append(node.industry_id)
            map_data = {"mapping": stock_to_industries}
            _industry_map_cache["ts"] = time.time()
            _industry_map_cache["data"] = map_data
        finally:
            db.close()

        stocks_data = _fetch_industry_quotes("")
        _industry_stocks_cache["ts"] = time.time()
        _industry_stocks_cache["data"] = stocks_data
        print("[warmup] done")
    except Exception as e:
        print(f"[warmup] error: {e}")


@app.on_event("startup")
def startup():
    init_db()
    industry.seed_company_chains()

    threading.Thread(target=_warmup_caches, daemon=True).start()

    _scheduler.add_job(
        industry.sync_all_data,
        trigger="cron",
        hour=17,
        minute=30,
        id="daily_sync",
        replace_existing=True,
    )

    _t0 = datetime.now()
    _scheduler.add_job(
        news_flash.sync_news_flash,
        trigger="interval",
        minutes=3,
        start_date=_t0 + timedelta(seconds=10),
        id="news_flash_sync",
        replace_existing=True,
    )

    _scheduler.add_job(
        guba.sync_guba_incremental,
        trigger="interval",
        minutes=20,
        id="guba_incremental_sync",
        replace_existing=True,
    )

    _scheduler.start()

    # 检查是否在生产环境中启用自动同步
    # 可以通过环境变量 AUTO_SYNC_ON_STARTUP=false 来禁用
    import os

    auto_sync = os.getenv("AUTO_SYNC_ON_STARTUP", "true").lower() == "true"

    if not auto_sync:
        print("[startup] AUTO_SYNC_ON_STARTUP=false, skipping startup sync")
        return

    now = datetime.now().time()
    if now >= dtime(17, 30):
        print("[startup] after 17:30 — triggering immediate full sync")
        from routers.sync import _run_full_sync, _status, _lock

        with _lock:
            if not _status["running"]:
                threading.Thread(target=_run_full_sync, daemon=True).start()
            else:
                print("[startup] sync already running, skipping startup sync")
    elif now >= dtime(15, 0):
        print(f"[startup] {now.strftime('%H:%M')} — market closed, syncing quotes only")
        threading.Thread(target=industry._sync_all_quotes, daemon=True).start()
    else:
        print(f"[startup] {now.strftime('%H:%M')} — before market close, skipping sync")


@app.on_event("shutdown")
def shutdown():
    _scheduler.shutdown(wait=False)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/search")
async def search(
    q: str = Query("", description="股票代码或名称关键词"), limit: int = Query(8)
):
    if not q.strip():
        return {"results": []}
    try:
        from db import SessionLocal, StockMeta, StockQuote
        from sqlalchemy import or_

        db = SessionLocal()
        try:
            rows = (
                db.query(StockMeta.code, StockMeta.name)
                .filter(
                    or_(
                        StockMeta.code.contains(q.strip()),
                        StockMeta.name.contains(q.strip()),
                    )
                )
                .limit(limit)
                .all()
            )
            codes = [r.code for r in rows]
            quotes = {
                qr.code: qr
                for qr in db.query(StockQuote).filter(StockQuote.code.in_(codes)).all()
            }
            return {
                "results": [
                    {
                        "code": r.code,
                        "name": r.name,
                        "price": quotes[r.code].price if r.code in quotes else 0,
                        "change": quotes[r.code].change if r.code in quotes else 0,
                    }
                    for r in rows
                ]
            }
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
