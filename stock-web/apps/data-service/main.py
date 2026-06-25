from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from routers import quote, kline, fundamental, news
import akshare as ak
from fastapi import HTTPException

app = FastAPI(title="股策AI 数据服务", version="0.1.0")

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
