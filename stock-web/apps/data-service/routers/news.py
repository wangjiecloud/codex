from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session

from db import get_db, StockNews

router = APIRouter()


@router.get("/{code}")
async def get_news(
    code: str,
    count: int = Query(default=20, ge=5, le=100),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(StockNews)
        .filter(StockNews.code == code)
        .order_by(StockNews.pub_time.desc())
        .limit(count)
        .all()
    )
    return {
        "code": code,
        "news": [
            {
                "code": r.code,
                "title": r.title,
                "url": r.url,
                "source": r.source,
                "pubTime": r.pub_time,
            }
            for r in rows
        ],
    }
