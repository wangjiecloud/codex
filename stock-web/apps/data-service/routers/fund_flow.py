"""
板块主力资金流向
数据来源：akshare -> 同花顺数据中心
支持：
  - 优先从数据库读取已有快照（所有 period）
  - 库中无数据时实时拉取并写入快照
  - T-1 ~ T-5 历史数据（按 trade_date 查询）
"""

import threading
import akshare as ak
from datetime import date
from fastapi import APIRouter, Query, BackgroundTasks
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from db import SessionLocal, FundFlowSnapshot

router = APIRouter()

# py_mini_racer (V8) 在同一进程内只能单线程使用，全局锁保证不并发
_ak_lock = threading.Lock()

# period 参数 -> akshare symbol 映射
_PERIOD_MAP = {
    "today": "即时",
    "3d": "3日排行",
    "5d": "5日排行",
    "10d": "10日排行",
}


def _fetch_fund_flow(board_type: str, symbol: str) -> list[dict]:
    """直接调用 akshare（带全局锁，防并发冲突）"""
    with _ak_lock:
        if board_type == "concept":
            df = ak.stock_fund_flow_concept(symbol=symbol)
        else:
            df = ak.stock_fund_flow_industry(symbol=symbol)

    rows = []
    for _, r in df.iterrows():
        def safe(v):
            try:
                if isinstance(v, str):
                    v = v.rstrip("%")
                f = float(v)
                return None if f != f else f
            except Exception:
                return None

        # 概念板块列名是 "阶段涨跌幅"，行业板块是 "行业-涨跌幅"
        change_pct = safe(r.get("阶段涨跌幅") or r.get("行业-涨跌幅"))
        rows.append({
            "name": str(r.get("行业", "") or ""),
            "index": safe(r.get("行业指数")),
            "changePct": change_pct,
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

def _save_snapshot(board_type: str, trade_date: str, period: str, rows: list[dict]):
    """将资金流数据写入 fund_flow_snapshot 表（含 period）"""
    if not rows:
        return
    db = SessionLocal()
    try:
        for r in rows:
            stmt = sqlite_insert(FundFlowSnapshot).values(
                trade_date=trade_date,
                board_type=board_type,
                period=period,
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
                index_elements=["trade_date", "board_type", "period", "name"],
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
        print(f"[fund_flow] snapshot saved: {board_type} {trade_date} period={period} {len(rows)} rows")
    except Exception as e:
        db.rollback()
        print(f"[fund_flow] snapshot save error: {e}")
    finally:
        db.close()


def _load_snapshot(board_type: str, trade_date: str, period: str) -> list[dict]:
    """从数据库读取指定日期+period的快照"""
    db = SessionLocal()
    try:
        rows = (
            db.query(FundFlowSnapshot)
            .filter(
                FundFlowSnapshot.board_type == board_type,
                FundFlowSnapshot.trade_date == trade_date,
                FundFlowSnapshot.period == period,
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


def _latest_snapshot_date(board_type: str, period: str) -> str | None:
    """返回指定 board_type + period 下库中最新的快照日期，无数据返回 None"""
    db = SessionLocal()
    try:
        result = (
            db.query(FundFlowSnapshot.trade_date)
            .filter(
                FundFlowSnapshot.board_type == board_type,
                FundFlowSnapshot.period == period,
            )
            .order_by(FundFlowSnapshot.trade_date.desc())
            .first()
        )
        return result[0] if result else None
    finally:
        db.close()


def _available_dates_by_period() -> dict:
    """返回各 period 下已有快照的交易日（降序，最多最近20天）
    格式: { "today": ["2026-07-04", ...], "3d": [...], "5d": [...], "10d": [...] }
    """
    db = SessionLocal()
    try:
        result = (
            db.query(FundFlowSnapshot.period, FundFlowSnapshot.trade_date)
            .distinct()
            .order_by(FundFlowSnapshot.period, FundFlowSnapshot.trade_date.desc())
            .all()
        )
        out: dict[str, list[str]] = {}
        for period, trade_date in result:
            if period not in out:
                out[period] = []
            if len(out[period]) < 20:
                out[period].append(trade_date)
        return out
    finally:
        db.close()


def take_daily_snapshot():
    """定时任务：快照今日全部 period 数据（concept + industry），收盘后调用"""
    from routers.industry import is_trading_day

    if not is_trading_day():
        print("[fund_flow] take_daily_snapshot skipped — not a trading day")
        return

    today = date.today().strftime("%Y-%m-%d")
    print(f"[fund_flow] taking daily snapshot for {today}...")
    for board_type in ["concept", "industry"]:
        for period, symbol in _PERIOD_MAP.items():
            try:
                rows = _fetch_fund_flow(board_type, symbol)
                if rows:
                    _save_snapshot(board_type, today, period, rows)
            except Exception as e:
                print(f"[fund_flow] snapshot {board_type} {period} error: {e}")


# ──────────────────────────────────────────────────────────────
# 统一取数逻辑
# ──────────────────────────────────────────────────────────────

def _get_fund_flow(
    board_type: str,
    period: str,
    sort: str,
    order: str,
    limit: int,
    trade_date: str | None,
) -> dict:
    """
    取数优先级：
    1. 指定 trade_date -> 直接读对应日期+period的快照
    2. 未指定 trade_date -> 先查今日快照，有则直接返回，无则实时拉取并写入快照
    """
    today = date.today().strftime("%Y-%m-%d")
    target_date = trade_date or today

    # 优先读库
    rows = _load_snapshot(board_type, target_date, period)
    if rows:
        return _sort_and_limit(rows, sort, order, limit)

    # 库中无数据且不是查历史（或今天尚无快照），则实时拉取
    if trade_date:
        # 历史日期查不到，直接返回空
        return {"items": [], "total": 0}

    # 今日库中无数据：回落到最新一天的快照（非交易日/收盘前常见）
    latest_date = _latest_snapshot_date(board_type, period)
    if latest_date:
        rows = _load_snapshot(board_type, latest_date, period)
        if rows:
            print(f"[fund_flow] fallback to latest snapshot: {board_type} {latest_date} period={period}")
            return _sort_and_limit(rows, sort, order, limit)

    # 非交易日不调 akshare，直接返回空
    from routers.industry import is_trading_day
    if not is_trading_day():
        return {"items": [], "total": 0}

    symbol = _PERIOD_MAP.get(period, "即时")
    try:
        rows = _fetch_fund_flow(board_type, symbol)
    except Exception as e:
        print(f"[fund_flow] fetch {board_type} {period} error: {e}")
        rows = []

    # 实时数据写入快照（后台线程，不阻塞响应）
    if rows:
        threading.Thread(
            target=_save_snapshot,
            args=(board_type, today, period, rows),
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
    limit: int = Query(default=50, ge=1, le=2000),
    trade_date: str | None = Query(default=None, description="指定历史日期 YYYY-MM-DD"),
):
    """同花顺行业板块主力资金流向排行"""
    return _get_fund_flow("industry", period, sort, order, limit, trade_date)


@router.get("/dates")
def get_available_dates():
    """返回各 period 已有快照的交易日列表
    响应格式：{ "today": [...], "3d": [...], "5d": [...], "10d": [...] }
    """
    return _available_dates_by_period()


@router.post("/snapshot")
def trigger_snapshot(background_tasks: BackgroundTasks):
    """手动触发全量快照（所有 period + 所有 board_type），后台执行"""
    background_tasks.add_task(take_daily_snapshot)
    return {"message": "快照任务已启动，后台执行中..."}
