"""
自选股 CRUD API
- GET  /api/watchlist          → 获取自选股列表（按 sort_order 排序）
- POST /api/watchlist          → 批量替换自选股（传完整 codes 列表）
- POST /api/watchlist/add      → 添加单只
- DELETE /api/watchlist/{code} → 删除单只
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from db import get_db, UserWatchlist
from datetime import datetime

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class WatchlistBulkRequest(BaseModel):
    codes: List[str]


class WatchlistAddRequest(BaseModel):
    code: str


@router.get("")
def get_watchlist(db: Session = Depends(get_db)):
    """获取自选股列表，按 sort_order 升序"""
    rows = db.query(UserWatchlist).order_by(UserWatchlist.sort_order).all()
    return {"codes": [r.code for r in rows]}


@router.post("")
def set_watchlist(body: WatchlistBulkRequest, db: Session = Depends(get_db)):
    """批量替换自选股（前端拖拽排序后调用，传完整有序列表）"""
    # 删除旧数据，重新写入
    db.query(UserWatchlist).delete()
    for i, code in enumerate(body.codes):
        db.add(UserWatchlist(code=code, sort_order=i, added_at=datetime.utcnow()))
    db.commit()
    return {"ok": True, "count": len(body.codes)}


@router.post("/add")
def add_stock(body: WatchlistAddRequest, db: Session = Depends(get_db)):
    """添加单只自选股（已存在则忽略）"""
    existing = db.query(UserWatchlist).filter(UserWatchlist.code == body.code).first()
    if existing:
        return {"ok": True, "added": False}
    # 取当前最大 sort_order
    from sqlalchemy import func

    max_order = db.query(func.max(UserWatchlist.sort_order)).scalar() or -1
    db.add(
        UserWatchlist(
            code=body.code, sort_order=max_order + 1, added_at=datetime.utcnow()
        )
    )
    db.commit()
    return {"ok": True, "added": True}


@router.delete("/{code}")
def remove_stock(code: str, db: Session = Depends(get_db)):
    """删除单只自选股"""
    row = db.query(UserWatchlist).filter(UserWatchlist.code == code).first()
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
