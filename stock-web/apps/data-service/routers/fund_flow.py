"""
板块主力资金流向
数据来源：akshare -> 同花顺数据中心
支持：
  - 今日实时数据（直接拉取）
  - T-1 ~ T-5 历史数据（从每日快照数据库读取）
"""

import threading
import akshare as ak
from datetime import date
from fastapi import APIRouter, Query
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from db import SessionLocal, FundFlowSnapshot

router = APIRouter()

# period 参数 -> akshare symbol 映射（实时接口用）
_PERIOD_MAP = {
    "today": "即时",
    "3d": "3日排行",
    "5d": "5日排行",
    "10d": "10日排行",
}


def _df_to_rows(df) -> list[dict]:
    """将 akshare DataFrame 转为统一格式"""
    rows = []
    for _, r in df.iterrows():
        def safe(v):
            try:
                f = float(v)
                return None if f != f else f
            except Exception:
                return None

        rows.append({
            "name": str(r.get("行业", "") or ""),
            "index": safe(r.get("行业指数")),
            "changePct": safe(r.get("行业-涨跌幅")),
            "inflow": safe(r.get("流入资金")),
            "outflow": safe(r.get("流出资金")),
            "netflow": safe(r.get("净额")),
            "compCount": safe(r.get("公司家数")),
            "topStock": str(r.get("领涨股", "") or ""),
            "topStockChangePct": safe(r.get("领涨股-涨跌幅")),
            "topStockPrice": safe(r.get("当前价")),
        })
    return rows


def _sort_and_limit(rows: list[dict], sort: str, order: str, limit: int) -> dict:
    field_map = {
        "netflow": "netflow",
        "inflow": "inflow",
        "outflow": "outflow",
        "changePct": "changePct",
        "name": "name",
    }
    field = field_map.get(sort, "netflow")
    reverse = order != "asc"

    def sort_key(r: dict):
        v = r.get(field)
        if v is None:
            return float("-inf") if reverse else float("inf")
        return v

    sorted_rows = sorted(rows, key=sort_key, reverse=reverse)
    return {
        "items": sorted_rows[:limit],
        "total": len(rows),
    }


# ──────────────────────────────────────────────────────────────
# 快照：写入 / 读取
# ──────────────────────────────────────────────────────────────

def _save_snapshot(board_type: str, trade_date: str, rows: list[dict]):
    """将当日资金流数据写入 fund_flow_snapshot 表"""
    if not rows:
        return
    db = SessionLocal()
    try:
        for r in rows:
            stmt = sqlite_insert(FundFlowSnapshot).values(
                trade_date=trade_date,
                board_type=board_type,
                name=r.get("name", ""),
                index_val=r.get("index") or 0.0,
                change_pct=r.get("changePct") or 0.0,
                inflow=r.get("inflow") or 0.0,
                outflow=r.get("outflow") or 0.0,
                netflow=r.get("netflow") or 0.0,
                comp_count=int(r.get("compCount") or 0),
                top_stock=r.get("topStock", ""),
                top_stock_change_pct=r.get("topStockChangePct") or 0.0,
                top_stock_price=r.get("topStockPrice") or 0.0,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["trade_date", "board_type", "name"],
                set_={
                    "index_val": stmt.excluded.index_val,
                    "change_pct": stmt.excluded.change_pct,
                    "inflow": stmt.excluded.inflow,
                    "outflow": stmt.excluded.outflow,
                    "netflow": stmt.excluded.netflow,
                    "comp_count": stmt.excluded.comp_count,
                    "top_stock": stmt.excluded.top_stock,
                    "top_stock_change_pct": stmt.excluded.top_stock_change_pct,
                    "top_stock_price": stmt.excluded.top_stock_price,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
        db.commit()
        print(f"[fund_flow] snapshot saved: {board_type} {trade_date} {len(rows)} rows")
    except Exception as e:
        db.rollback()
        print(f"[fund_flow] snapshot save error: {e}")
    finally:
        db.close()


def _load_snapshot(board_type: str, trade_date: str) -> list[dict]:
    """从数据库读取指定日期的快照"""
    db = SessionLocal()
    try:
        rows = (
            db.query(FundFlowSnapshot)
            .filter(
                FundFlowSnapshot.board_type == board_type,
                FundFlowSnapshot.trade_date == trade_date,
            )
            .all()
        )
        return [
            {
                "name": r.name,
                "index": r.index_val,
                "changePct": r.change_pct,
                "inflow": r.inflow,
                "outflow": r.outflow,
                "netflow": r.netflow,
                "compCount": r.comp_count,
                "topStock": r.top_stock,
                "topStockChangePct": r.top_stock_change_pct,
                "topStockPrice": r.top_stock_price,
            }
            for r in rows
        ]
    finally:
        db.close()


def _available_dates() -> list[str]:
    """返回数据库中已有快照的所有交易日（降序，最多最近20天）"""
    db = SessionLocal()
    try:
        result = (
            db.query(FundFlowSnapshot.trade_date)
            .distinct()
            .order_by(FundFlowSnapshot.trade_date.desc())
            .limit(20)
            .all()
        )
        return [r[0] for r in result]
    finally:
        db.close()


def take_daily_snapshot():
    """定时任务：快照今日数据（concept + industry），收盘后调用"""
    today = date.today().strftime("%Y-%m-%d")
    print(f"[fund_flow] taking daily snapshot for {today}...")
    for board_type, fn in [
        ("concept", lambda: ak.stock_fund_flow_concept(symbol="即时")),
        ("industry", lambda: ak.stock_fund_flow_industry(symbol="即时")),
    ]:
        try:
            df = fn()
            rows = _df_to_rows(df)
            _save_snapshot(board_type, today, rows)
        except Exception as e:
            print(f"[fund_flow] snapshot {board_type} error: {e}")


# ──────────────────────────────────────────────────────────────
# 统一取数逻辑
# ──────────────────────────────────────────────────────────────

def _get_fund_flow(board_type: str, period: str, sort: str, order: str, limit: int, trade_date: str | None) -> dict:
    """
    - trade_date 指定具体日期 -> 从快照读
    - period = today          -> 实时拉取并顺手写快照
    - period = 3d/5d/10d      -> 实时拉取排行
    """
    if trade_date:
        rows = _load_snapshot(board_type, trade_date)
        return _sort_and_limit(rows, sort, order, limit)

    symbol = _PERIOD_MAP.get(period, "即时")
    try:
        if board_type == "concept":
            df = ak.stock_fund_flow_concept(symbol=symbol)
        else:
            df = ak.stock_fund_flow_industry(symbol=symbol)
        rows = _df_to_rows(df)
    except Exception as e:
        print(f"[fund_flow] fetch {board_type} error: {e}")
        rows = []

    # 今日实时数据顺手写入快照
    if period == "today" and rows:
        today = date.today().strftime("%Y-%m-%d")
        threading.Thread(
            target=_save_snapshot,
            args=(board_type, today, rows),
            daemon=True,
        ).start()

    return _sort_and_limit(rows, sort, order, limit)


# ──────────────────────────────────────────────────────────────
# API 路由
# ──────────────────────────────────────────────────────────────

@router.get("/concept")
def get_concept_fund_flow(
    period: str = Query(default="today"),
    sort: str = Query(default="netflow"),
    order: str = Query(default="desc"),
    limit: int = Query(default=50, ge=1, le=500),
    trade_date: str | None = Query(default=None, description="指定历史日期 YYYY-MM-DD"),
):
    """同花顺概念板块主力资金流向排行"""
    return _get_fund_flow("concept", period, sort, order, limit, trade_date)


@router.get("/industry")
def get_industry_fund_flow(
    period: str = Query(default="today"),
    sort: str = Query(default="netflow"),
    order: str = Query(default="desc"),
    limit: int = Query(default=50, ge=1, le=200),
    trade_date: str | None = Query(default=None, description="指定历史日期 YYYY-MM-DD"),
):
    """同花顺行业板块主力资金流向排行"""
    return _get_fund_flow("industry", period, sort, order, limit, trade_date)


@router.get("/dates")
def get_available_dates():
    """返回已有快照的交易日列表（降序）"""
    return {"dates": _available_dates()}
