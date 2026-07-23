from fastapi import APIRouter, Depends, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from db import (
    get_db,
    MarginTradingDaily,
    MarginTradingStockSnapshot,
    MarginTradingStockHistory,
    MarginTradingStockSyncStatus,
)
from datetime import datetime

router = APIRouter()


@router.get("/history")
async def get_margin_history(
    market: str = Query("total", description="市场: total/sh/sz/bj"),
    limit: int = Query(120, ge=1, le=500),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(MarginTradingDaily)
        .filter(MarginTradingDaily.market == market)
        .order_by(MarginTradingDaily.trade_date.asc())
        .limit(limit)
        .all()
    )
    return [
        {
            "tradeDate": r.trade_date,
            "marginBalance": r.margin_balance,
            "rzBalance": r.rz_balance,
            "rqBalance": r.rq_balance,
            "rzBuy": r.rz_buy,
            "rzRepay": r.rz_repay,
        }
        for r in rows
    ]


@router.get("/latest")
async def get_margin_latest(db: Session = Depends(get_db)):
    latest_date = (
        db.query(func.max(MarginTradingDaily.trade_date))
        .filter(MarginTradingDaily.market == "total")
        .scalar()
    )
    if not latest_date:
        return {"date": None, "total": None, "sh": None, "sz": None, "bj": None}

    rows = (
        db.query(MarginTradingDaily)
        .filter(MarginTradingDaily.trade_date == latest_date)
        .all()
    )
    market_map = {r.market: r for r in rows}

    def _fmt(r):
        if not r:
            return None
        return {
            "marginBalance": r.margin_balance,
            "rzBalance": r.rz_balance,
            "rqBalance": r.rq_balance,
            "rzBuy": r.rz_buy,
            "rzRepay": r.rz_repay,
        }

    return {
        "date": latest_date,
        "total": _fmt(market_map.get("total")),
        "sh": _fmt(market_map.get("sh")),
        "sz": _fmt(market_map.get("sz")),
        "bj": _fmt(market_map.get("bj")),
    }


@router.get("/table")
async def get_margin_table(
    limit: int = Query(60, ge=1, le=500),
    db: Session = Depends(get_db),
):
    latest_dates = (
        db.query(MarginTradingDaily.trade_date)
        .filter(MarginTradingDaily.market == "sh")
        .order_by(MarginTradingDaily.trade_date.desc())
        .limit(limit)
        .subquery()
    )

    rows = (
        db.query(MarginTradingDaily)
        .filter(MarginTradingDaily.trade_date.in_(latest_dates))
        .order_by(
            MarginTradingDaily.trade_date.desc(),
            MarginTradingDaily.market.asc(),
        )
        .all()
    )

    date_map: dict = {}
    for r in rows:
        date_map.setdefault(r.trade_date, {})
        date_map[r.trade_date][r.market] = r

    result = []
    for trade_date in sorted(date_map.keys(), reverse=True):
        m = date_map[trade_date]
        sh = m.get("sh")
        sz = m.get("sz")
        bj = m.get("bj")
        total = m.get("total")
        result.append(
            {
                "tradeDate": trade_date,
                "sh": {
                    "rzBalance": sh.rz_balance if sh else None,
                    "rzBuy": sh.rz_buy if sh else None,
                    "rqBalance": sh.rq_balance if sh else None,
                    "marginBalance": sh.margin_balance if sh else None,
                },
                "sz": {
                    "rzBalance": sz.rz_balance if sz else None,
                    "rzBuy": sz.rz_buy if sz else None,
                    "rqBalance": sz.rq_balance if sz else None,
                    "marginBalance": sz.margin_balance if sz else None,
                },
                "bj": {
                    "rzBalance": bj.rz_balance if bj else None,
                    "rzBuy": bj.rz_buy if bj else None,
                    "rqBalance": bj.rq_balance if bj else None,
                    "marginBalance": bj.margin_balance if bj else None,
                },
                "total": {
                    "rzBalance": total.rz_balance if total else None,
                    "rzBuy": total.rz_buy if total else None,
                    "rqBalance": total.rq_balance if total else None,
                    "marginBalance": total.margin_balance if total else None,
                },
            }
        )
    return result


@router.get("/stats")
async def get_margin_stats(db: Session = Depends(get_db)):
    total_rows = db.query(func.count(MarginTradingDaily.id)).scalar() or 0
    latest_date = (
        db.query(func.max(MarginTradingDaily.trade_date))
        .filter(MarginTradingDaily.market == "total")
        .scalar()
    )
    earliest_date = (
        db.query(func.min(MarginTradingDaily.trade_date))
        .filter(MarginTradingDaily.market == "total")
        .scalar()
    )
    day_count = (
        db.query(func.count(func.distinct(MarginTradingDaily.trade_date))).scalar() or 0
    )
    stock_snapshot_count = (
        db.query(func.count(MarginTradingStockSnapshot.id)).scalar() or 0
    )
    latest_snapshot_date = db.query(
        func.max(MarginTradingStockSnapshot.trade_date)
    ).scalar()
    return {
        "totalRows": total_rows,
        "dayCount": day_count,
        "latestDate": latest_date,
        "earliestDate": earliest_date,
        "stockSnapshotCount": stock_snapshot_count,
        "latestSnapshotDate": latest_snapshot_date,
    }


@router.get("/stocks")
async def get_stock_snapshots(
    date: str = Query(None, description="交易日期，默认最新"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query(
        "rz_net", description="排序字段: rz_net/rz_balance/margin_balance"
    ),
    db: Session = Depends(get_db),
):
    if not date:
        date = db.query(func.max(MarginTradingStockSnapshot.trade_date)).scalar()
    if not date:
        return {"date": None, "total": 0, "rows": []}

    sort_col_map = {
        "rz_net": MarginTradingStockSnapshot.rz_net,
        "rz_balance": MarginTradingStockSnapshot.rz_balance,
        "margin_balance": MarginTradingStockSnapshot.margin_balance,
        "rz_buy": MarginTradingStockSnapshot.rz_buy,
    }
    sort_col = sort_col_map.get(sort_by, MarginTradingStockSnapshot.rz_net)

    total = (
        db.query(func.count(MarginTradingStockSnapshot.id))
        .filter(MarginTradingStockSnapshot.trade_date == date)
        .scalar()
        or 0
    )
    rows = (
        db.query(MarginTradingStockSnapshot)
        .filter(MarginTradingStockSnapshot.trade_date == date)
        .order_by(sort_col.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "date": date,
        "total": total,
        "rows": [
            {
                "code": r.code,
                "name": r.name,
                "rzBalance": r.rz_balance,
                "rzBuy": r.rz_buy,
                "rzRepay": r.rz_repay,
                "rzNet": r.rz_net,
                "rqQty": r.rq_qty,
                "rqSell": r.rq_sell,
                "rqBalance": r.rq_balance,
                "marginBalance": r.margin_balance,
            }
            for r in rows
        ],
    }


@router.get("/stock/{code}/status")
async def get_stock_sync_status(code: str, db: Session = Depends(get_db)):
    row = (
        db.query(MarginTradingStockSyncStatus)
        .filter(MarginTradingStockSyncStatus.code == code)
        .first()
    )
    count = (
        db.query(func.count(MarginTradingStockHistory.id))
        .filter(MarginTradingStockHistory.code == code)
        .scalar()
        or 0
    )
    if not row:
        return {"code": code, "status": "none", "rowCount": count}
    return {
        "code": code,
        "status": row.status,
        "rowCount": count,
        "lastSyncedAt": row.last_synced_at.isoformat() if row.last_synced_at else None,
    }


@router.post("/stock/{code}/trigger")
async def trigger_stock_sync(
    code: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    existing = (
        db.query(MarginTradingStockSyncStatus)
        .filter(MarginTradingStockSyncStatus.code == code)
        .first()
    )
    if existing and existing.status == "syncing":
        return {"code": code, "message": "已在同步中"}

    def _run():
        from tasks.sync_stock_margin import sync_stock_history

        try:
            sync_stock_history(code)
        except Exception:
            pass

    background_tasks.add_task(_run)
    return {"code": code, "message": "已触发后台同步"}


@router.get("/stock/{code}/history")
async def get_stock_history(
    code: str,
    limit: int = Query(120, ge=1, le=500),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(MarginTradingStockHistory)
        .filter(MarginTradingStockHistory.code == code)
        .order_by(MarginTradingStockHistory.trade_date.asc())
        .limit(limit)
        .all()
    )
    return [
        {
            "tradeDate": r.trade_date,
            "rzBalance": r.rz_balance,
            "rzBuy": r.rz_buy,
            "rzRepay": r.rz_repay,
            "rzNet": r.rz_net,
            "rzBalanceRatio": r.rz_balance_ratio,
            "rqQty": r.rq_qty,
            "rqSell": r.rq_sell,
            "rqNet": r.rq_net,
            "marginBalance": r.margin_balance,
        }
        for r in rows
    ]


def sync_margin_trading():
    from tasks.sync_margin_trading import sync_margin_trading as _sync

    return _sync()
