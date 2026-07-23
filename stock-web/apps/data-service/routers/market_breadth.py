"""
A股市场情绪（宽度）数据路由
- GET  /api/market-breadth              近60交易日涨跌家数统计列表
- POST /api/market-breadth/sync         手动触发当日数据同步
- POST /api/market-breadth/backfill     批量补充历史数据（涨停/跌停家数，近N个交易日）

数据来源策略：
  当日数据：akshare stock_market_activity_legu（含上涨/下跌/平盘/涨停/跌停全量）
  历史数据：akshare stock_zt_pool_em（涨停池）+ stock_zt_pool_dtgc_em（跌停池，限近30日）
            上涨/下跌/平盘家数历史无公开接口，从 stock_kline 反算（仅统计库内股票，为估算值）

akshare stock_market_activity_legu 实际返回列：['item', 'value']
item 取值示例：
  上涨 / 涨停 / 真实涨停 / st st*涨停 / 下跌 / 跌停 / 真实跌停 / st st*跌停 / 平盘 / 停牌 / 活跃度 / 统计日期
"""

from fastapi import APIRouter, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
import akshare as ak

from db import SessionLocal, MarketBreadth, StockKline

router = APIRouter()

# 后台补历史任务进度（简单内存状态，单任务）
_backfill_progress: dict = {
    "running": False,
    "done": 0,
    "total": 0,
    "errors": [],
    "last_date": "",
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _calc_sentiment_score(
    row: MarketBreadth, recent_rows: list[MarketBreadth]
) -> float:
    total = max(row.total or 0, 1)
    up = row.up_count or 0
    down = row.down_count or 0
    limit_up = row.limit_up or 0
    limit_down = row.limit_down or 0
    st_total = (row.st_limit_up or 0) + (row.st_limit_down or 0)

    breadth_component = ((up - down) / total) * 22
    limit_component = ((limit_up - limit_down) / total) * 160
    limit_strength_component = (
        (limit_up - limit_down) / max(limit_up + limit_down, 1)
    ) * 10
    st_penalty = -(st_total / total) * 120

    score = (
        50 + breadth_component + limit_component + limit_strength_component + st_penalty
    )

    if len(recent_rows) >= 5:
        recent5 = recent_rows[:5]
        avg_up = sum(r.up_count or 0 for r in recent5) / len(recent5)
        avg_down = sum(r.down_count or 0 for r in recent5) / len(recent5)
        avg_total = max(sum(r.total or 0 for r in recent5) / len(recent5), 1)
        trend_component = (((up - down) - (avg_up - avg_down)) / avg_total) * 8
        score += trend_component

    return round(_clamp(score, 0, 100), 1)


def _score_level(score: float) -> str:
    if score <= 20:
        return "冰点"
    if score <= 40:
        return "偏冷"
    if score <= 60:
        return "中性"
    if score <= 80:
        return "偏热"
    return "过热"


def _score_state(row: MarketBreadth, score: float, prev: MarketBreadth | None) -> str:
    up = row.up_count or 0
    down = row.down_count or 0
    limit_up = row.limit_up or 0
    limit_down = row.limit_down or 0

    if (up > down and limit_up <= max(15, limit_down + 5)) or (
        limit_up >= 25 and limit_down >= 8
    ):
        return "分歧"

    if score >= 81:
        return "亢奋"
    if score <= 20:
        return "冰点"

    if prev is None:
        return "修复" if score >= 55 else "退潮"

    prev_score = _calc_sentiment_score(prev, [prev])
    if score - prev_score >= 6:
        return "修复"
    if prev_score - score >= 6:
        return "退潮"
    return "分歧" if abs(limit_up - limit_down) <= 5 else "震荡"


def _build_breadth_summary(rows: list[MarketBreadth]) -> dict:
    if not rows:
        return {
            "trade_date": None,
            "sentiment_score": None,
            "sentiment_level": None,
            "sentiment_state": None,
            "score_change_1d": None,
            "score_change_5d": None,
            "recent_5d_avg_score": None,
            "latest": None,
            "signals": [],
        }

    latest = rows[0]
    prev = rows[1] if len(rows) > 1 else None
    score = _calc_sentiment_score(latest, rows)
    recent5_scores = [
        _calc_sentiment_score(r, rows[idx:]) for idx, r in enumerate(rows[:5])
    ]
    avg5 = round(sum(recent5_scores) / len(recent5_scores), 1)
    prev_score = _calc_sentiment_score(prev, rows[1:]) if prev else None
    score_change_1d = round(score - prev_score, 1) if prev_score is not None else None
    score_change_5d = round(score - avg5, 1)
    total = max(latest.total or 0, 1)
    advance_decline_ratio = round(
        (latest.up_count or 0) / max(latest.down_count or 0, 1), 2
    )
    breadth_pct = round(
        ((latest.up_count or 0) - (latest.down_count or 0)) / total * 100, 2
    )
    limit_diff = (latest.limit_up or 0) - (latest.limit_down or 0)
    state = _score_state(latest, score, prev)

    signals = []
    if limit_diff >= 20:
        signals.append("涨停优势明显")
    elif limit_diff <= -10:
        signals.append("跌停压力偏大")

    if breadth_pct >= 20:
        signals.append("普涨扩散")
    elif breadth_pct <= -20:
        signals.append("普跌扩散")

    st_total = (latest.st_limit_up or 0) + (latest.st_limit_down or 0)
    if total > 0 and st_total / total >= 0.01:
        signals.append("ST异动占比偏高")

    if state == "分歧":
        signals.append("高低切换较快")

    return {
        "trade_date": latest.trade_date,
        "sentiment_score": score,
        "sentiment_level": _score_level(score),
        "sentiment_state": state,
        "score_change_1d": score_change_1d,
        "score_change_5d": score_change_5d,
        "recent_5d_avg_score": avg5,
        "latest": {
            "up_count": latest.up_count,
            "down_count": latest.down_count,
            "flat_count": latest.flat_count,
            "limit_up": latest.limit_up,
            "limit_down": latest.limit_down,
            "st_limit_up": latest.st_limit_up,
            "st_limit_down": latest.st_limit_down,
            "total": latest.total,
            "advance_decline_ratio": advance_decline_ratio,
            "breadth_pct": breadth_pct,
            "limit_diff": limit_diff,
        },
        "signals": signals,
    }


def sync_market_breadth(target_date: str = None) -> dict:
    """
    从 akshare stock_market_activity_legu 获取当日全市场涨跌停统计，写入 market_breadth 表。
    target_date: "YYYY-MM-DD"，None 表示今天。
    """
    if target_date is None:
        target_date = datetime.now().strftime("%Y-%m-%d")

    try:
        df = ak.stock_market_activity_legu()
        # 将 item-value 对转成字典
        data = {}
        for _, r in df.iterrows():
            item = str(r.get("item", "")).strip()
            try:
                val = int(float(str(r.get("value", 0)).replace("%", "").strip() or 0))
            except (ValueError, TypeError):
                val = 0
            data[item] = val

        up_count = data.get("上涨", 0)
        down_count = data.get("下跌", 0)
        flat_count = data.get("平盘", 0)
        # 用"真实涨停"而非"涨停"（去除一字板虚假涨停）
        limit_up = data.get("真实涨停", data.get("涨停", 0))
        limit_down = data.get("真实跌停", data.get("跌停", 0))
        st_limit_up = data.get("st st*涨停", 0)
        st_limit_down = data.get("st st*跌停", 0)
        total = up_count + down_count + flat_count

        _upsert(
            target_date,
            up_count,
            down_count,
            flat_count,
            limit_up,
            limit_down,
            st_limit_up,
            st_limit_down,
            total,
        )

        return {
            "status": "ok",
            "date": target_date,
            "source": "legu",
            "up_count": up_count,
            "down_count": down_count,
            "flat_count": flat_count,
            "limit_up": limit_up,
            "limit_down": limit_down,
            "st_limit_up": st_limit_up,
            "st_limit_down": st_limit_down,
            "total": total,
        }
    except Exception as e:
        print(f"[market_breadth] legu error: {e}")

    # 备用方案：直接统计 stock_zh_a_spot_em（全A行情），自己算涨跌家数
    try:
        import pandas as pd

        df = ak.stock_zh_a_spot_em()
        # 找涨跌幅列（通常第5列，或列名含"涨跌幅"）
        pct_col = None
        for c in df.columns:
            if "涨跌幅" in str(c):
                pct_col = c
                break
        if pct_col is None and len(df.columns) > 4:
            pct_col = df.columns[4]

        name_col = df.columns[1] if len(df.columns) > 1 else None
        pcts = pd.to_numeric(df[pct_col], errors="coerce").fillna(0)

        if name_col is not None:
            is_st = df[name_col].astype(str).str.contains("ST", na=False)
        else:
            is_st = pd.Series([False] * len(df))

        up_count = int((pcts > 0).sum())
        down_count = int((pcts < 0).sum())
        flat_count = int((pcts == 0).sum())
        limit_up = int(((pcts >= 9.9) & ~is_st).sum())
        limit_down = int(((pcts <= -9.9) & ~is_st).sum())
        st_limit_up = int(((pcts >= 4.9) & is_st).sum())
        st_limit_down = int(((pcts <= -4.9) & is_st).sum())
        total = len(df)

        _upsert(
            target_date,
            up_count,
            down_count,
            flat_count,
            limit_up,
            limit_down,
            st_limit_up,
            st_limit_down,
            total,
        )

        return {
            "status": "ok",
            "date": target_date,
            "source": "spot_em",
            "up_count": up_count,
            "down_count": down_count,
            "flat_count": flat_count,
            "limit_up": limit_up,
            "limit_down": limit_down,
            "st_limit_up": st_limit_up,
            "st_limit_down": st_limit_down,
            "total": total,
        }
    except Exception as e:
        print(f"[market_breadth] spot_em fallback error: {e}")
        return {"status": "error", "detail": str(e)}


def _upsert(trade_date, up, down, flat, lu, ld, st_lu, st_ld, total):
    db = SessionLocal()
    try:
        from sqlalchemy.dialects.sqlite import insert

        stmt = (
            insert(MarketBreadth)
            .values(
                trade_date=trade_date,
                up_count=up,
                down_count=down,
                flat_count=flat,
                limit_up=lu,
                limit_down=ld,
                st_limit_up=st_lu,
                st_limit_down=st_ld,
                total=total,
                updated_at=datetime.utcnow(),
            )
            .on_conflict_do_update(
                index_elements=["trade_date"],
                set_=dict(
                    up_count=up,
                    down_count=down,
                    flat_count=flat,
                    limit_up=lu,
                    limit_down=ld,
                    st_limit_up=st_lu,
                    st_limit_down=st_ld,
                    total=total,
                    updated_at=datetime.utcnow(),
                ),
            )
        )
        db.execute(stmt)
        db.commit()
    finally:
        db.close()


@router.get("")
def get_market_breadth(days: int = 60):
    """返回近 N 个交易日（默认60天）的市场情绪数据，按日期倒序"""
    db = SessionLocal()
    try:
        rows = (
            db.query(MarketBreadth)
            .order_by(MarketBreadth.trade_date.desc())
            .limit(days)
            .all()
        )
        return [
            {
                "trade_date": r.trade_date,
                "up_count": r.up_count,
                "down_count": r.down_count,
                "flat_count": r.flat_count,
                "limit_up": r.limit_up,
                "limit_down": r.limit_down,
                "st_limit_up": r.st_limit_up,
                "st_limit_down": r.st_limit_down,
                "total": r.total,
            }
            for r in rows
        ]
    finally:
        db.close()


@router.get("/summary")
def get_market_breadth_summary(days: int = Query(20, ge=5, le=60)):
    db = SessionLocal()
    try:
        rows = (
            db.query(MarketBreadth)
            .order_by(MarketBreadth.trade_date.desc())
            .limit(days)
            .all()
        )
        return _build_breadth_summary(rows)
    finally:
        db.close()


@router.post("/sync")
def trigger_sync(date: str = None):
    """手动触发市场情绪数据同步（默认今日）"""
    try:
        from routers.system import sched_log

        sched_log(
            "info", f"[market_breadth] 开始同步: {date or '今日'}", source="manual"
        )
    except Exception:
        pass
    result = sync_market_breadth(date)
    try:
        from routers.system import sched_log

        if result.get("status") == "ok":
            sched_log(
                "success",
                f"[market_breadth] 同步完成: 涨{result['up_count']} 跌{result['down_count']} 涨停{result['limit_up']} 跌停{result['limit_down']}",
                source="manual",
            )
        else:
            sched_log(
                "error",
                f"[market_breadth] 同步失败: {result.get('detail', '')}",
                source="manual",
            )
    except Exception:
        pass
    return JSONResponse(content=result)


# ---------------------------------------------------------------------------
# 历史补充：从涨停池/跌停池 + K线反算上涨/下跌家数
# ---------------------------------------------------------------------------


def _sync_one_day_historical(date_str: str) -> dict:
    """
    用历史数据接口补充某一天的市场宽度数据。
    date_str: "YYYY-MM-DD"
    - 涨停家数：stock_zt_pool_em（限最近30个交易日，更早返回0但不报错）
    - 跌停家数：stock_zt_pool_dtgc_em（限最近30个交易日）
    - 上涨/下跌/平盘：从 stock_kline 反算（估算值，仅含库内股票）
    """
    date_compact = date_str.replace("-", "")  # "20260710"

    # 1. 涨停家数
    limit_up = 0
    st_limit_up = 0
    try:
        df_zt = ak.stock_zt_pool_em(date=date_compact)
        if df_zt is not None and not df_zt.empty:
            limit_up = len(df_zt)
            name_col = df_zt.columns[2] if len(df_zt.columns) > 2 else None
            if name_col:
                st_limit_up = int(
                    df_zt[name_col].astype(str).str.contains("ST", na=False).sum()
                )
    except Exception:
        pass

    # 2. 跌停家数（仅最近30个交易日有效）
    limit_down = 0
    st_limit_down = 0
    try:
        df_dt = ak.stock_zt_pool_dtgc_em(date=date_compact)
        if df_dt is not None and not df_dt.empty:
            limit_down = len(df_dt)
            name_col = df_dt.columns[2] if len(df_dt.columns) > 2 else None
            if name_col:
                st_limit_down = int(
                    df_dt[name_col].astype(str).str.contains("ST", na=False).sum()
                )
    except Exception:
        pass

    # 3. 上涨/下跌/平盘：从 stock_kline 反算（估算）
    up_count = 0
    down_count = 0
    flat_count = 0
    total = 0
    try:
        from sqlalchemy import text as sa_text

        db = SessionLocal()
        try:
            rows = db.execute(
                sa_text(
                    "SELECT change_pct FROM stock_kline "
                    "WHERE period='daily' AND trade_date=:d"
                ),
                {"d": date_str},
            ).fetchall()
            if rows:
                for r in rows:
                    pct = r[0] or 0.0
                    if pct > 0:
                        up_count += 1
                    elif pct < 0:
                        down_count += 1
                    else:
                        flat_count += 1
                total = up_count + down_count + flat_count
        finally:
            db.close()
    except Exception:
        pass

    _upsert(
        date_str,
        up_count,
        down_count,
        flat_count,
        limit_up,
        limit_down,
        st_limit_up,
        st_limit_down,
        total,
    )

    return {
        "date": date_str,
        "limit_up": limit_up,
        "limit_down": limit_down,
        "up_count": up_count,
        "down_count": down_count,
        "total": total,
    }


def _get_recent_trade_dates(n: int) -> list[str]:
    """返回最近 n 个自然日中是交易日的日期列表（从 stock_kline 推断），倒序。"""
    try:
        from sqlalchemy import text as sa_text

        db = SessionLocal()
        try:
            rows = db.execute(
                sa_text(
                    "SELECT DISTINCT trade_date FROM stock_kline "
                    "WHERE period='daily' "
                    "ORDER BY trade_date DESC LIMIT :n"
                ),
                {"n": n},
            ).fetchall()
            return [r[0] for r in rows]
        finally:
            db.close()
    except Exception:
        # fallback：用最近 n 个自然日（跳过周末）
        dates = []
        d = datetime.now()
        while len(dates) < n:
            d -= timedelta(days=1)
            if d.weekday() < 5:
                dates.append(d.strftime("%Y-%m-%d"))
        return dates


def _run_backfill(days: int):
    """后台执行历史补充。"""
    global _backfill_progress
    _backfill_progress = {
        "running": True,
        "done": 0,
        "total": 0,
        "errors": [],
        "last_date": "",
    }

    trade_dates = _get_recent_trade_dates(days)
    _backfill_progress["total"] = len(trade_dates)

    # 跳过已有完整数据的日期（涨停和跌停都已有值）
    db = SessionLocal()
    try:
        from sqlalchemy import text as sa_text

        existing = set(
            r[0]
            for r in db.execute(
                sa_text(
                    "SELECT trade_date FROM market_breadth WHERE limit_up > 0 OR limit_down > 0"
                )
            ).fetchall()
        )
    finally:
        db.close()

    try:
        from routers.system import sched_log

        sched_log(
            "info", f"[market_breadth] 开始补历史 {days} 个交易日", source="manual"
        )
    except Exception:
        pass

    for i, date_str in enumerate(trade_dates):
        if date_str in existing:
            _backfill_progress["done"] = i + 1
            _backfill_progress["last_date"] = date_str
            continue
        try:
            _sync_one_day_historical(date_str)
        except Exception as e:
            _backfill_progress["errors"].append(f"{date_str}: {e}")
        _backfill_progress["done"] = i + 1
        _backfill_progress["last_date"] = date_str

    _backfill_progress["running"] = False
    try:
        from routers.system import sched_log

        sched_log(
            "success",
            f"[market_breadth] 补历史完成: {_backfill_progress['done']}/{_backfill_progress['total']} 天, 错误 {len(_backfill_progress['errors'])} 条",
            source="manual",
        )
    except Exception:
        pass


@router.post("/backfill")
async def backfill_history(
    background_tasks: BackgroundTasks,
    days: int = Query(
        60, ge=1, le=250, description="补充最近几个交易日，默认60，最大250"
    ),
):
    """后台补充历史市场情绪数据（涨停/跌停家数，上涨/下跌为估算值）"""
    global _backfill_progress
    if _backfill_progress.get("running"):
        return JSONResponse(
            content={
                "status": "already_running",
                "progress": _backfill_progress,
            }
        )
    background_tasks.add_task(_run_backfill, days)
    return JSONResponse(content={"status": "started", "days": days})


@router.get("/backfill/progress")
def get_backfill_progress():
    """查询历史补充进度"""
    return JSONResponse(content=_backfill_progress)
