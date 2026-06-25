from fastapi import APIRouter, HTTPException, Query
import akshare as ak

router = APIRouter()


@router.get("/{code}")
async def get_kline(
    code: str,
    period: str = Query(default="daily", description="daily/weekly/monthly"),
    adjust: str = Query(default="qfq", description="qfq/hfq/"),
    count: int = Query(default=120, ge=10, le=500),
):
    try:
        df = ak.stock_zh_a_hist(symbol=code, period=period, adjust=adjust)
        df = df.tail(count)
        bars = []
        for _, row in df.iterrows():
            bars.append(
                {
                    "time": str(row["日期"]),
                    "open": float(row["开盘"]),
                    "high": float(row["最高"]),
                    "low": float(row["最低"]),
                    "close": float(row["收盘"]),
                    "volume": int(row["成交量"]),
                }
            )
        return {"code": code, "period": period, "bars": bars}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
