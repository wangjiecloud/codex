from fastapi import APIRouter, HTTPException, Query
import akshare as ak

router = APIRouter()


@router.get("/{code}")
async def get_news(
    code: str,
    count: int = Query(default=20, ge=5, le=100),
):
    try:
        df = ak.stock_news_em(symbol=code)
        if df is None or df.empty:
            return {"code": code, "news": []}
        df = df.head(count)
        news_list = []
        for _, row in df.iterrows():
            news_list.append(
                {
                    "title": str(row.get("新闻标题", "")),
                    "url": str(row.get("新闻链接", "")),
                    "time": str(row.get("发布时间", "")),
                    "source": str(row.get("文章来源", "")),
                }
            )
        return {"code": code, "news": news_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
