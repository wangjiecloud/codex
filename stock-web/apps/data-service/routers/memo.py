from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from db import get_db, Memo

router = APIRouter()


# ─── Pydantic schemas ────────────────────────────────────────────────────────

class MemoCreate(BaseModel):
    title: Optional[str] = ""
    content: str
    pinned: Optional[bool] = False


class MemoUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    pinned: Optional[bool] = None


class MemoOut(BaseModel):
    id: int
    title: str
    content: str
    pinned: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── 路由 ─────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[MemoOut])
def list_memos(db: Session = Depends(get_db)):
    """获取所有备忘录，置顶的排前面，再按更新时间倒序"""
    rows = (
        db.query(Memo)
        .order_by(Memo.pinned.desc(), Memo.updated_at.desc())
        .all()
    )
    return [_to_out(r) for r in rows]


@router.post("/", response_model=MemoOut)
def create_memo(body: MemoCreate, db: Session = Depends(get_db)):
    """新建备忘录"""
    now = datetime.utcnow()
    memo = Memo(
        title=body.title or "",
        content=body.content,
        pinned=1 if body.pinned else 0,
        created_at=now,
        updated_at=now,
    )
    db.add(memo)
    db.commit()
    db.refresh(memo)
    return _to_out(memo)


@router.put("/{memo_id}", response_model=MemoOut)
def update_memo(memo_id: int, body: MemoUpdate, db: Session = Depends(get_db)):
    """更新备忘录"""
    memo = db.query(Memo).filter(Memo.id == memo_id).first()
    if not memo:
        raise HTTPException(status_code=404, detail="备忘录不存在")
    if body.title is not None:
        memo.title = body.title
    if body.content is not None:
        memo.content = body.content
    if body.pinned is not None:
        memo.pinned = 1 if body.pinned else 0
    memo.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(memo)
    return _to_out(memo)


@router.delete("/{memo_id}")
def delete_memo(memo_id: int, db: Session = Depends(get_db)):
    """删除备忘录"""
    memo = db.query(Memo).filter(Memo.id == memo_id).first()
    if not memo:
        raise HTTPException(status_code=404, detail="备忘录不存在")
    db.delete(memo)
    db.commit()
    return {"ok": True}


# ─── 内部工具 ─────────────────────────────────────────────────────────────────

def _to_out(m: Memo) -> MemoOut:
    return MemoOut(
        id=m.id,
        title=m.title or "",
        content=m.content or "",
        pinned=bool(m.pinned),
        created_at=m.created_at,
        updated_at=m.updated_at,
    )
