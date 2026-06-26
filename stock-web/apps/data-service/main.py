from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from routers import quote, kline, fundamental, news, industry, guba, sync
import akshare as ak
from fastapi import HTTPException
from db import init_db
from datetime import datetime, time as dtime
import threading
from apscheduler.schedulers.background import BackgroundScheduler

app = FastAPI(title="股策AI 数据服务", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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

_scheduler = BackgroundScheduler(timezone="Asia/Shanghai")


@app.on_event("startup")
def startup():
    init_db()

    _scheduler.add_job(
        industry.sync_all_data,
        trigger="cron",
        hour=17,
        minute=30,
        id="daily_sync",
        replace_existing=True,
    )
    _scheduler.start()

    now = datetime.now().time()
    if now >= dtime(17, 30):
        print("[startup] after 17:30 — triggering immediate full sync")
        threading.Thread(target=industry.sync_all_data, daemon=True).start()
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
async def search(q: str = Query("", description="股票代码或名称关键词")):
    if not q.strip():
        return {"results": []}
    try:
        df = ak.stock_zh_a_spot_em()
        mask = df["名称"].str.contains(q, na=False) | df["代码"].str.contains(
            q, na=False
        )
        results = df[mask].head(10)
        return {
            "results": [
                {
                    "code": str(r["代码"]),
                    "name": str(r["名称"]),
                    "price": float(r.get("最新价", 0)),
                    "change": float(r.get("涨跌幅", 0)),
                }
                for _, r in results.iterrows()
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
