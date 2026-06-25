from fastapi import APIRouter, HTTPException
import akshare as ak

router = APIRouter()


@router.get("/{code}")
async def get_fundamental(code: str):
    try:
        df = ak.stock_financial_abstract_ths(symbol=code, indicator="按年度")
        if df is None or df.empty:
            raise HTTPException(
                status_code=404, detail=f"No fundamental data for {code}"
            )
        latest = df.iloc[0].to_dict()
        return {"code": code, "data": {k: str(v) for k, v in latest.items()}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
