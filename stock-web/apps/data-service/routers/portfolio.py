from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

from db import get_db, PortfolioHolding, PortfolioTrade

router = APIRouter()


class HoldingIn(BaseModel):
    id: str
    code: str
    name: str
    cost_price: float
    shares: int


class TradeIn(BaseModel):
    id: str
    holding_id: str
    trade_type: str
    trade_date: str
    price: float
    shares: int
    note: Optional[str] = ""


def _holding_to_dict(h: PortfolioHolding, trades: list) -> dict:
    return {
        "id": h.id,
        "code": h.code,
        "name": h.name,
        "costPrice": h.cost_price,
        "shares": h.shares,
        "trades": trades,
    }


def _trade_to_dict(t: PortfolioTrade) -> dict:
    return {
        "id": t.id,
        "holdingId": t.holding_id,
        "type": t.trade_type,
        "date": t.trade_date,
        "price": t.price,
        "shares": t.shares,
        "note": t.note or "",
    }


def _recalculate_holding(holding: PortfolioHolding, db: Session) -> None:
    trades = (
        db.query(PortfolioTrade)
        .filter(PortfolioTrade.holding_id == holding.id)
        .order_by(PortfolioTrade.trade_date, PortfolioTrade.created_at)
        .all()
    )

    if not trades:
        return

    total_shares = 0
    total_cost = 0.0

    for trade in trades:
        if trade.trade_type == "buy":
            if trade.price > 0:
                total_cost += trade.price * trade.shares
            total_shares += trade.shares
        elif trade.trade_type == "sell" and total_shares > 0:
            total_cost -= trade.price * trade.shares
            total_shares -= trade.shares
            if total_shares <= 0:
                total_cost = 0.0

    holding.shares = max(0, total_shares)
    holding.cost_price = (
        round(total_cost / total_shares, 4) if total_shares > 0 else 0.0
    )
    holding.updated_at = datetime.utcnow()


@router.get("")
async def list_holdings(db: Session = Depends(get_db)):
    holdings = db.query(PortfolioHolding).order_by(PortfolioHolding.created_at).all()
    all_trades = db.query(PortfolioTrade).all()
    trades_by_holding: dict[str, list] = {}
    for t in all_trades:
        trades_by_holding.setdefault(t.holding_id, []).append(_trade_to_dict(t))
    return [_holding_to_dict(h, trades_by_holding.get(h.id, [])) for h in holdings]


@router.post("")
async def upsert_holding(body: HoldingIn, db: Session = Depends(get_db)):
    row = db.query(PortfolioHolding).filter(PortfolioHolding.id == body.id).first()
    if row:
        row.name = body.name
        row.cost_price = round(body.cost_price, 4)
        row.shares = body.shares
        row.updated_at = datetime.utcnow()
    else:
        row = PortfolioHolding(
            id=body.id,
            code=body.code,
            name=body.name,
            cost_price=round(body.cost_price, 4),
            shares=body.shares,
        )
        db.add(row)
    db.commit()
    return {"ok": True}


@router.delete("/{holding_id}")
async def delete_holding(holding_id: str, db: Session = Depends(get_db)):
    db.query(PortfolioTrade).filter(PortfolioTrade.holding_id == holding_id).delete()
    deleted = (
        db.query(PortfolioHolding).filter(PortfolioHolding.id == holding_id).delete()
    )
    db.commit()
    if not deleted:
        raise HTTPException(status_code=404, detail="Holding not found")
    return {"ok": True}


@router.post("/{holding_id}/trades")
async def add_trade(holding_id: str, body: TradeIn, db: Session = Depends(get_db)):
    holding = (
        db.query(PortfolioHolding).filter(PortfolioHolding.id == holding_id).first()
    )
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    row = PortfolioTrade(
        id=body.id,
        holding_id=holding_id,
        trade_type=body.trade_type,
        trade_date=body.trade_date,
        price=round(body.price, 4),
        shares=body.shares,
        note=body.note or "",
    )
    db.add(row)
    db.flush()

    _recalculate_holding(holding, db)
    db.commit()

    return {
        "ok": True,
        "holding": {
            "id": holding.id,
            "costPrice": holding.cost_price,
            "shares": holding.shares,
        },
    }


@router.delete("/{holding_id}/trades/{trade_id}")
async def delete_trade(holding_id: str, trade_id: str, db: Session = Depends(get_db)):
    holding = (
        db.query(PortfolioHolding).filter(PortfolioHolding.id == holding_id).first()
    )
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    deleted = (
        db.query(PortfolioTrade)
        .filter(
            PortfolioTrade.id == trade_id,
            PortfolioTrade.holding_id == holding_id,
        )
        .delete()
    )

    if not deleted:
        raise HTTPException(status_code=404, detail="Trade not found")

    db.flush()
    _recalculate_holding(holding, db)
    db.commit()

    return {
        "ok": True,
        "holding": {
            "id": holding.id,
            "costPrice": holding.cost_price,
            "shares": holding.shares,
        },
    }
