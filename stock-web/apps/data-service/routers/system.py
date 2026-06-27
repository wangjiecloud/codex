import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from db import get_db, GubaPost, StockMeta, StockQuote, StockFundamental, IndustryNode
from datetime import datetime, timedelta

router = APIRouter()


@router.get("/stats")
async def get_system_stats(db: Session = Depends(get_db)):
    node_rows = (
        db.query(IndustryNode.industry_id, IndustryNode.stocks)
        .filter(IndustryNode.industry_id != "overview")
        .all()
    )
    industry_stocks: set[str] = set()
    for _, stocks_json in node_rows:
        try:
            industry_stocks.update(json.loads(stocks_json) if stocks_json else [])
        except Exception:
            pass
    total_stocks = len(industry_stocks)

    total_guba_data = db.query(func.count(GubaPost.id)).scalar() or 0
    total_quote_data = db.query(func.count(StockQuote.code)).scalar() or 0
    total_fundamental_data = db.query(func.count(StockFundamental.code)).scalar() or 0

    total_data = total_guba_data + total_quote_data + total_fundamental_data

    announcement_count = (
        db.query(func.count(GubaPost.id))
        .filter(GubaPost.category == "announcement")
        .scalar()
        or 0
    )
    research_count = (
        db.query(func.count(GubaPost.id))
        .filter(GubaPost.category == "research")
        .scalar()
        or 0
    )
    news_count = (
        db.query(func.count(GubaPost.id)).filter(GubaPost.category == "news").scalar()
        or 0
    )

    recent_cutoff = datetime.utcnow() - timedelta(days=7)
    recent_updates = (
        db.query(
            GubaPost.code,
            func.count(GubaPost.id).label("count"),
            func.max(GubaPost.updated_at).label("updated_at"),
        )
        .filter(GubaPost.updated_at >= recent_cutoff)
        .group_by(GubaPost.code)
        .order_by(func.max(GubaPost.updated_at).desc())
        .limit(10)
        .all()
    )

    stocks_with_guba = db.query(func.count(func.distinct(GubaPost.code))).scalar() or 0
    stocks_with_quote = db.query(func.count(StockQuote.code)).scalar() or 0
    stocks_with_fundamental = db.query(func.count(StockFundamental.code)).scalar() or 0

    return {
        "totalStocks": total_stocks,
        "totalData": total_data,
        "dataByType": {
            "guba": total_guba_data,
            "quote": total_quote_data,
            "fundamental": total_fundamental_data,
        },
        "stocksByDataType": {
            "guba": stocks_with_guba,
            "quote": stocks_with_quote,
            "fundamental": stocks_with_fundamental,
        },
        "categories": {
            "announcement": announcement_count,
            "research": research_count,
            "news": news_count,
        },
        "recentUpdates": [
            {
                "code": update.code,
                "count": update.count,
                "updatedAt": update.updated_at,
            }
            for update in recent_updates
        ],
    }
