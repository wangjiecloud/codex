from fastapi import APIRouter, HTTPException
import akshare as ak
import pandas as pd

router = APIRouter()


@router.get("/{code}")
async def get_quote(code: str):
    try:
        df = ak.stock_zh_a_spot_em()
        row = df[df["代码"] == code]
        if row.empty:
            raise HTTPException(status_code=404, detail=f"Stock {code} not found")
        r = row.iloc[0]
        return {
            "code": code,
            "name": str(r.get("名称", "")),
            "price": float(r.get("最新价", 0)),
            "change": float(r.get("涨跌幅", 0)),
            "changeAmt": float(r.get("涨跌额", 0)),
            "open": float(r.get("今开", 0)),
            "prevClose": float(r.get("昨收", 0)),
            "high": float(r.get("最高", 0)),
            "low": float(r.get("最低", 0)),
            "volume": str(r.get("成交量", 0)),
            "turnover": str(r.get("成交额", 0)),
            "marketCap": str(r.get("总市值", 0)),
            "pe": str(r.get("市盈率-动态", 0)),
            "pb": str(r.get("市净率", 0)),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search/{keyword}")
async def search_stock(keyword: str):
    try:
        df = ak.stock_zh_a_spot_em()
        mask = df["名称"].str.contains(keyword, na=False) | df["代码"].str.contains(
            keyword, na=False
        )
        results = df[mask].head(10)
        return [
            {
                "code": str(r["代码"]),
                "name": str(r["名称"]),
                "price": float(r.get("最新价", 0)),
                "change": float(r.get("涨跌幅", 0)),
            }
            for _, r in results.iterrows()
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
