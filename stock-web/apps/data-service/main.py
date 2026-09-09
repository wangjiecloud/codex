from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from fastapi import HTTPException
from db import init_db

from routers import (
    quote,
    kline,
    minute,
    fundamental,
    news,
    industry,
    global_market,
    news_flash,
    concept_board,
    theme,
    portfolio,
    sw_industry,
    guba,
    fund_flow,
    memo,
    market_breadth,
    market_flow,
    watchlist,
    margin_trading,
    backtest,
    auto_strategy,
    xmind,
    ai_screen,
)
import realtime_data

app = FastAPI(title="股策AI 数据服务", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(quote.router, prefix="/api/quote", tags=["行情"])
app.include_router(kline.router, prefix="/api/kline", tags=["K线"])
app.include_router(minute.router, prefix="/api/minute", tags=["分时"])
app.include_router(fundamental.router, prefix="/api/fundamental", tags=["基本面"])
app.include_router(news.router, prefix="/api/news", tags=["新闻"])
app.include_router(industry.router, prefix="/api/industry", tags=["产业链"])
app.include_router(global_market.router, prefix="/api/global", tags=["全球市场"])
app.include_router(news_flash.router, prefix="/api/flash", tags=["快讯"])
app.include_router(concept_board.router, prefix="/api/board", tags=["概念板块"])
app.include_router(theme.router, prefix="/api/theme", tags=["主题板块"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["持仓管理"])
app.include_router(sw_industry.router, prefix="/api/sw-industry", tags=["申万行业"])
app.include_router(guba.router, prefix="/api/guba", tags=["股吧资讯"])
app.include_router(fund_flow.router, prefix="/api/fund-flow", tags=["资金流向"])
app.include_router(market_flow.router, prefix="/api/market-flow", tags=["市场资金流向"])
app.include_router(memo.router, prefix="/api/memo", tags=["备忘录"])
app.include_router(watchlist.router)
app.include_router(
    market_breadth.router, prefix="/api/market-breadth", tags=["市场情绪"]
)
app.include_router(
    margin_trading.router, prefix="/api/margin-trading", tags=["融资融券"]
)
app.include_router(backtest.router, prefix="/api/backtest", tags=["回测系统"])
app.include_router(auto_strategy.router, prefix="/api/backtest", tags=["AI策略定制"])
app.include_router(xmind.router, prefix="/api/xmind", tags=["XMind工具"])
app.include_router(ai_screen.router, prefix="/api/ai-screen", tags=["AI选股"])


@app.on_event("startup")
def startup():
    init_db()
    industry.seed_company_chains()


@app.get("/health")
def health():
    return {"status": "ok", "mode": "realtime"}


@app.get("/api/search")
async def search(
    q: str = Query("", description="股票代码或名称关键词"), limit: int = Query(10)
):
    kw = q.strip()
    if not kw:
        return {"results": []}
    try:
        results = await run_in_threadpool(realtime_data.search_stocks, kw, limit)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
