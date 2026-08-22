"""
AI 策略定制路由
对指定股票的历史 K 线数据，枚举技术指标组合 × 参数变体，
通过多轮单股回测找出历史高胜率策略，支持保存/编辑/删除。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import sqlite3
import os
import json
import re
from datetime import datetime, timedelta

router = APIRouter()

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "stock_data.db")


# ── 工具函数 ──────────────────────────────────────────────────────────────────


def _get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=60)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=60000")
    return conn


def _get_trading_dates(code: str, days: int) -> tuple[str, str, list[str]]:
    """获取该股最近 N 个交易日的日期列表"""
    conn = _get_conn()
    try:
        rows = conn.execute(
            """
            SELECT trade_date FROM stock_kline
            WHERE code=? AND period='daily'
            ORDER BY trade_date DESC LIMIT ?
            """,
            (code, days),
        ).fetchall()
        if not rows:
            return "", "", []
        dates = sorted([r["trade_date"] for r in rows])
        return dates[0], dates[-1], dates
    finally:
        conn.close()


def _get_signal_dates_for_code(sql: str, code: str, dates: list[str]) -> list[str]:
    """
    批量检查该股在给定日期列表中每天的信号，复用单次 DB 连接。
    相比原来每天开/关连接，速度快 10-20x。

    为避免 historical_quote.volume 与 kline_xxx.volume 的歧义，
    采用更轻量的替换策略：
    - 把 stock_quote 替换为单行的 stock_meta 快照（只提供 code/name，无 volume）
    - JOIN kline_xxx 里的指标列已带表别名（k./m./r./b. 等），不歧义
    """
    if not dates:
        return []

    conn = _get_conn()
    signal_dates = []

    try:
        for signal_date in dates:
            # 轻量快照 CTE：只提供 code/name，不含 volume/price 等会冲突的字段
            snapshot_cte = f"""
WITH stock_quote_snap AS (
    SELECT k.code, COALESCE(m.name, k.code) AS name,
           k.close AS price, k.change_pct AS change
    FROM stock_kline k
    LEFT JOIN stock_meta m ON m.code = k.code
    WHERE k.period = 'daily' AND k.trade_date = '{signal_date}' AND k.code = '{code}'
)
"""
            user_sql = sql.strip()
            # 注入日期上限并限制到当前股票（CTE 窗口只扫单股数据，速度快 10x+）
            user_sql = re.sub(
                r"(FROM\s+stock_kline\s+WHERE\s+period\s*=\s*['\"]daily['\"])",
                rf"\1 AND trade_date <= '{signal_date}' AND code = '{code}'",
                user_sql,
                flags=re.IGNORECASE,
            )
            # 注入个股过滤到最终 WHERE（ORDER BY 前）
            if "AND q.code = " not in user_sql:
                if "ORDER BY" in user_sql.upper():
                    idx = user_sql.upper().rfind("ORDER BY")
                    user_sql = (
                        user_sql[:idx] + f"\n  AND q.code = '{code}'\n" + user_sql[idx:]
                    )
                else:
                    user_sql = user_sql + f"\n  AND q.code = '{code}'"

            # 替换 stock_quote → stock_quote_snap
            user_sql = re.sub(
                r"\bstock_quote\b", "stock_quote_snap", user_sql, flags=re.IGNORECASE
            )

            # 拼接：snapshot_cte 在前，user_sql 的 WITH 关键字后追加
            if re.match(r"^\s*WITH\s+", user_sql, re.IGNORECASE):
                final_sql = (
                    snapshot_cte.rstrip()
                    + ",\n"
                    + user_sql[user_sql.lower().index("with") + 4 :]
                )
            else:
                final_sql = snapshot_cte + user_sql

            try:
                rows = conn.execute(final_sql).fetchall()
                for r in rows:
                    try:
                        c = r["code"]
                    except (IndexError, KeyError):
                        c = r[0]
                    if c == code:
                        signal_dates.append(signal_date)
                        break
            except Exception:
                pass
    finally:
        conn.close()

    return signal_dates


def _run_single_backtest(
    code: str,
    sql: str,
    dates: list[str],
    stop_profit: float,
    stop_loss: float,
    max_hold_days: int,
) -> dict:
    """
    对单只股票在指定日期列表上执行策略回测，返回统计结果。
    信号日 T+0 触发，T+1 开盘买入。
    复用单次 DB 连接批量获取信号，速度比逐日开/关连接快 10-20x。
    """
    # 批量获取信号日（单次 DB 连接）
    signal_dates = _get_signal_dates_for_code(sql, code, dates)

    if not signal_dates:
        return {"trade_count": 0, "win_rate": 0.0, "avg_return": 0.0, "signal_count": 0}

    # 获取该股完整 K 线（用于交易模拟）
    start_date = dates[0]
    end_date = dates[-1]
    conn = _get_conn()
    try:
        rows = conn.execute(
            """
            SELECT trade_date, open, high, low, close
            FROM stock_kline
            WHERE code=? AND period='daily'
              AND trade_date >= ? AND trade_date <= ?
            ORDER BY trade_date
            """,
            (code, start_date, end_date),
        ).fetchall()
    finally:
        conn.close()

    kline = {r["trade_date"]: dict(r) for r in rows}
    sorted_dates = sorted(kline.keys())

    wins = 0
    losses = 0
    total_return = 0.0

    for sig_date in signal_dates:
        # T+1 买入
        buy_date = None
        for d in sorted_dates:
            if d > sig_date:
                buy_date = d
                break
        if not buy_date:
            continue

        buy_price = kline[buy_date].get("open") or kline[buy_date].get("close", 0)
        if buy_price <= 0:
            continue

        buy_idx = sorted_dates.index(buy_date)
        sell_date = None
        sell_price = None

        for i in range(buy_idx, min(buy_idx + max_hold_days, len(sorted_dates))):
            d = sorted_dates[i]
            bar = kline[d]
            if i == buy_idx:
                continue
            day_high = bar.get("high", bar["close"])
            day_low = bar.get("low", bar["close"])
            high_pct = (day_high - buy_price) / buy_price * 100
            low_pct = (day_low - buy_price) / buy_price * 100
            if high_pct >= stop_profit:
                sell_date = d
                sell_price = bar["close"]
                break
            elif low_pct <= -stop_loss:
                sell_date = d
                sell_price = bar["close"]
                break

        if sell_date is None:
            last_idx = min(buy_idx + max_hold_days - 1, len(sorted_dates) - 1)
            sell_date = sorted_dates[last_idx]
            sell_price = kline[sell_date]["close"]

        if not sell_price or sell_price <= 0:
            continue

        ret = (sell_price - buy_price) / buy_price * 100
        total_return += ret
        if ret > 0:
            wins += 1
        else:
            losses += 1

    trade_count = wins + losses
    if trade_count == 0:
        return {
            "trade_count": 0,
            "win_rate": 0.0,
            "avg_return": 0.0,
            "signal_count": len(signal_dates),
        }

    return {
        "trade_count": trade_count,
        "win_rate": wins / trade_count * 100,
        "avg_return": total_return / trade_count,
        "signal_count": len(signal_dates),
    }


# ── 指标模块库（参数化 SQL 片段） ─────────────────────────────────────────────


def _build_candidate_strategies() -> list[dict]:
    """
    生成候选策略列表。每个策略包含：
    - id: 唯一标识
    - label: 可读名称
    - indicators: 使用的指标列表
    - sql: 完整选股 SQL
    - stop_profit / stop_loss / max_hold_days: 推荐退出参数
    """
    candidates = []

    # ── 指标1：MACD 方向 ──────────────────────────────────────────────────────
    # 参数：EMA 窗口（短/长周期）
    for short_w, long_w in [(12, 26), (9, 21), (5, 13)]:
        label_m = f"MACD({short_w},{long_w})"
        macd_cte = f"""kline_macd AS (
  SELECT code, trade_date, close, volume,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {short_w - 1} PRECEDING AND CURRENT ROW) AS ema_s,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {long_w - 1} PRECEDING AND CURRENT ROW) AS ema_l,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {short_w} PRECEDING AND 1 PRECEDING) AS ema_s_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {long_w} PRECEDING AND 1 PRECEDING) AS ema_l_prev,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)"""
        macd_where = (
            "(ema_s - ema_l) > (ema_s_prev - ema_l_prev) AND (ema_s - ema_l) > 0"
        )

        # ── 指标2：RSI 超卖反弹 ──────────────────────────────────────────────
        for rsi_oversold in [25, 30, 35]:
            label_r = f"RSI<{rsi_oversold}反弹"
            rsi_cte = f"""kline_rsi AS (
  SELECT code, trade_date, close, volume,
    CASE WHEN AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) = 0
         THEN 100
         ELSE 100 - 100 / (1 + AVG(CASE WHEN change_pct > 0 THEN change_pct ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)
                            / AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW))
    END AS rsi14,
    CASE WHEN AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 14 PRECEDING AND 1 PRECEDING) = 0
         THEN 100
         ELSE 100 - 100 / (1 + AVG(CASE WHEN change_pct > 0 THEN change_pct ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 14 PRECEDING AND 1 PRECEDING)
                            / AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 14 PRECEDING AND 1 PRECEDING))
    END AS rsi14_prev,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)"""
            rsi_where = f"rsi14_prev <= {rsi_oversold} AND rsi14 > {rsi_oversold}"

            # 组合：MACD 上行 + RSI 超卖反弹
            sql = f"""WITH {macd_cte},
{rsi_cte}
SELECT q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change
FROM stock_quote q
JOIN kline_macd m ON m.code = q.code AND m.rn = 1
JOIN kline_rsi r ON r.code = q.code AND r.rn = 1
WHERE {macd_where}
  AND {rsi_where}
  AND m.volume > m.vol_avg5 * 1.2
  AND q.name NOT LIKE '%ST%'
ORDER BY m.volume / m.vol_avg5 DESC"""
            candidates.append(
                {
                    "id": f"macd{short_w}_{long_w}__rsi{rsi_oversold}",
                    "label": f"{label_m} + {label_r}",
                    "indicators": ["MACD", "RSI"],
                    "sql": sql,
                    "stop_profit": 8.0,
                    "stop_loss": 5.0,
                    "max_hold_days": 8,
                }
            )

        # ── 指标3：量能放大 ──────────────────────────────────────────────────
        for vol_ratio in [1.5, 2.0, 2.5]:
            label_v = f"量比>{vol_ratio}"
            vol_where = f"volume > vol_avg5 * {vol_ratio}"

            # 组合：MACD 上行 + 放量
            sql = f"""WITH {macd_cte}
SELECT q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change
FROM stock_quote q
JOIN kline_macd k ON k.code = q.code AND k.rn = 1
WHERE {macd_where}
  AND {vol_where}
  AND q.name NOT LIKE '%ST%'
ORDER BY k.volume / k.vol_avg5 DESC"""
            candidates.append(
                {
                    "id": f"macd{short_w}_{long_w}__vol{str(vol_ratio).replace('.', 'p')}",
                    "label": f"{label_m} + {label_v}",
                    "indicators": ["MACD", "VOL"],
                    "sql": sql,
                    "stop_profit": 10.0,
                    "stop_loss": 6.0,
                    "max_hold_days": 10,
                }
            )

    # ── 指标4：KDJ 超卖金叉 ───────────────────────────────────────────────────
    for kdj_low in [20, 25, 30]:
        for ma_w in [5, 10, 20]:
            label_k = f"KDJ<{kdj_low}金叉"
            label_ma = f"MA{ma_w}支撑"
            kdj_ma_cte = f"""kline_kdj AS (
  SELECT code, trade_date, close, volume,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS low9,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS high9,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS low9_prev,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS high9_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {ma_w - 1} PRECEDING AND CURRENT ROW) AS ma_ref,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
),
kdj_calc AS (
  SELECT *,
    CASE WHEN high9 > low9 THEN (close - low9)/(high9 - low9)*100 ELSE 50 END AS rsv,
    CASE WHEN high9_prev > low9_prev THEN (close - low9_prev)/(high9_prev - low9_prev)*100 ELSE 50 END AS rsv_prev
  FROM kline_kdj WHERE rn=1
)"""
            sql = f"""WITH {kdj_ma_cte}
SELECT q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change
FROM stock_quote q
JOIN kdj_calc k ON k.code = q.code
WHERE k.rsv < {kdj_low} AND k.rsv_prev < {kdj_low}
  AND k.rsv > k.rsv_prev
  AND k.close BETWEEN k.ma_ref * 0.97 AND k.ma_ref * 1.05
  AND q.name NOT LIKE '%ST%'"""
            candidates.append(
                {
                    "id": f"kdj{kdj_low}__ma{ma_w}",
                    "label": f"{label_k} + {label_ma}支撑",
                    "indicators": ["KDJ", "MA"],
                    "sql": sql,
                    "stop_profit": 8.0,
                    "stop_loss": 4.0,
                    "max_hold_days": 8,
                }
            )

    # ── 指标5：均线突破系列 ───────────────────────────────────────────────────
    for ma_long in [20, 30, 60]:
        for vol_ratio in [1.2, 1.5, 2.0]:
            label_b = f"突破MA{ma_long}+量比>{vol_ratio}"
            sql = f"""WITH kline_ma AS (
  SELECT code, trade_date, close, volume,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {ma_long - 1} PRECEDING AND CURRENT ROW) AS ma_long,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {ma_long} PRECEDING AND 1 PRECEDING) AS ma_long_prev,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change
FROM stock_quote q
JOIN kline_ma k ON k.code = q.code AND k.rn = 1
WHERE k.close > k.ma_long
  AND k.ma_long_prev <= k.ma_long * 0.998
  AND k.volume > k.vol_avg5 * {vol_ratio}
  AND k.close > k.ma5
  AND q.name NOT LIKE '%ST%'
ORDER BY k.volume / k.vol_avg5 DESC"""
            candidates.append(
                {
                    "id": f"ma_break{ma_long}__vol{str(vol_ratio).replace('.', 'p')}",
                    "label": label_b,
                    "indicators": ["MA", "VOL"],
                    "sql": sql,
                    "stop_profit": 10.0,
                    "stop_loss": 6.0,
                    "max_hold_days": 12,
                }
            )

    # ── 指标6：布林带突破 ─────────────────────────────────────────────────────
    for boll_w in [15, 20, 25]:
        for vol_ratio in [1.5, 2.0]:
            label_b2 = f"BOLL({boll_w})突破上轨+量比>{vol_ratio}"
            sql = f"""WITH boll AS (
  SELECT code, trade_date, close, volume,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {boll_w - 1} PRECEDING AND CURRENT ROW) AS mid,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {boll_w - 1} PRECEDING AND CURRENT ROW)
      + 2*AVG(ABS(close - AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {boll_w - 1} PRECEDING AND CURRENT ROW)))
        OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {boll_w - 1} PRECEDING AND CURRENT ROW) AS upper,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS vol_avg10,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change
FROM stock_quote q
JOIN boll b ON b.code = q.code AND b.rn = 1
WHERE b.close > b.upper
  AND b.volume > b.vol_avg10 * {vol_ratio}
  AND b.close > b.mid
  AND q.name NOT LIKE '%ST%'
ORDER BY b.volume / b.vol_avg10 DESC"""
            candidates.append(
                {
                    "id": f"boll{boll_w}_break__vol{str(vol_ratio).replace('.', 'p')}",
                    "label": label_b2,
                    "indicators": ["BOLL", "VOL"],
                    "sql": sql,
                    "stop_profit": 10.0,
                    "stop_loss": 5.0,
                    "max_hold_days": 10,
                }
            )

    # ── 指标7：回踩均线缩量止跌 ───────────────────────────────────────────────
    for ma_ref in [5, 10]:
        for shrink in [0.6, 0.7, 0.8]:
            label_p = f"回踩MA{ma_ref}+缩量{int(shrink * 100)}%"
            sql = f"""WITH kline_pull AS (
  SELECT code, trade_date, close, open, volume,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {ma_ref - 1} PRECEDING AND CURRENT ROW) AS ma_ref,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    MAX(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS high20,
    MIN(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS low20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change
FROM stock_quote q
JOIN kline_pull k ON k.code = q.code AND k.rn = 1
WHERE k.high20 > k.low20 * 1.1
  AND k.close BETWEEN k.ma_ref * 0.97 AND k.ma_ref * 1.03
  AND k.volume < k.vol_avg5 * {shrink}
  AND k.close > k.open
  AND q.name NOT LIKE '%ST%'"""
            candidates.append(
                {
                    "id": f"pullback_ma{ma_ref}__shrink{str(shrink).replace('.', 'p')}",
                    "label": label_p,
                    "indicators": ["MA", "VOL"],
                    "sql": sql,
                    "stop_profit": 7.0,
                    "stop_loss": 4.0,
                    "max_hold_days": 7,
                }
            )

    # ── 指标8：右侧突破近 N 日高点 ────────────────────────────────────────────
    for lookback in [10, 15, 20, 30]:
        for vol_ratio in [1.3, 1.5]:
            label_rb = f"突破{lookback}日高点+量比>{vol_ratio}"
            sql = f"""WITH kline_rb AS (
  SELECT code, trade_date, close, volume,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN {lookback} PRECEDING AND 1 PRECEDING) AS high_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change
FROM stock_quote q
JOIN kline_rb k ON k.code = q.code AND k.rn = 1
WHERE k.close > k.high_prev
  AND k.volume > k.vol_avg5 * {vol_ratio}
  AND k.close > k.ma20
  AND q.name NOT LIKE '%ST%'
ORDER BY k.close / k.high_prev DESC"""
            candidates.append(
                {
                    "id": f"right_break{lookback}__vol{str(vol_ratio).replace('.', 'p')}",
                    "label": label_rb,
                    "indicators": ["RIGHT_BREAK", "VOL"],
                    "sql": sql,
                    "stop_profit": 10.0,
                    "stop_loss": 5.0,
                    "max_hold_days": 12,
                }
            )

    # ── 指标9：地量地价反转 ───────────────────────────────────────────────────
    for vol_pct in [0.5, 0.6, 0.7]:
        for low_near in [1.05, 1.10, 1.15]:
            label_gv = (
                f"地量({int(vol_pct * 100)}%)+近低位({int((low_near - 1) * 100)}%内)"
            )
            sql = f"""WITH kline_gv AS (
  SELECT code, trade_date, close, low, volume,
    MIN(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS vol_min30,
    MIN(low)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 62 PRECEDING AND CURRENT ROW) AS low_3m,
    MIN(low)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS low5,
    MIN(low)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 5 PRECEDING) AS low5_prev,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change
FROM stock_quote q
JOIN kline_gv k ON k.code = q.code AND k.rn = 1
WHERE k.volume <= k.vol_min30 * {vol_pct + 0.1}
  AND k.close <= k.low_3m * {low_near}
  AND k.low5 >= k.low5_prev
  AND q.name NOT LIKE '%ST%'"""
            candidates.append(
                {
                    "id": f"gvol{str(vol_pct).replace('.', 'p')}__low{str(low_near).replace('.', 'p')}",
                    "label": label_gv,
                    "indicators": ["VOL", "LOW"],
                    "sql": sql,
                    "stop_profit": 10.0,
                    "stop_loss": 6.0,
                    "max_hold_days": 12,
                }
            )

    return candidates


# ── 请求/响应模型 ──────────────────────────────────────────────────────────────


class UserStrategyIn(BaseModel):
    name: str
    description: Optional[str] = ""
    for_code: Optional[str] = None
    for_name: Optional[str] = None
    sql_text: str
    stop_profit: float = 10.0
    stop_loss: float = 6.0
    max_hold_days: int = 10
    win_rate: Optional[float] = None
    avg_return: Optional[float] = None
    trade_count: Optional[int] = None
    score: Optional[float] = None
    indicators: Optional[str] = None
    params_json: Optional[str] = None
    source: str = "manual"


class UserStrategyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sql_text: Optional[str] = None
    stop_profit: Optional[float] = None
    stop_loss: Optional[float] = None
    max_hold_days: Optional[int] = None


# ── API 路由 ──────────────────────────────────────────────────────────────────


@router.get("/auto_strategy/{code}")
def auto_strategy_for_stock(code: str, days: int = 120, top_n: int = 5):
    """
    对指定股票的历史 K 线，枚举技术指标组合并逐一回测，
    返回历史胜率最高的策略列表（不自动保存，前端确认后再调用 save 接口）。

    - days: 回测历史天数（默认 120 个交易日，约 6 个月；最大 180）
    - top_n: 返回前 N 名策略
    """
    # 限制最大天数，防止耗时过长
    days = min(days, 180)
    # 1. 获取股票基本信息
    conn = _get_conn()
    try:
        meta = conn.execute(
            "SELECT name FROM stock_meta WHERE code=?", (code,)
        ).fetchone()
        stock_name = meta["name"] if meta else code
    finally:
        conn.close()

    # 2. 获取回测日期列表
    start_date, end_date, dates = _get_trading_dates(code, days)
    if len(dates) < 60:
        raise HTTPException(
            status_code=400,
            detail=f"股票 {code} K线数据不足（仅 {len(dates)} 条），无法进行策略定制",
        )

    # 3. 生成候选策略
    candidates = _build_candidate_strategies()

    # 4. 对每个候选策略执行单股回测
    results = []
    for cand in candidates:
        stats = _run_single_backtest(
            code=code,
            sql=cand["sql"],
            dates=dates,
            stop_profit=cand["stop_profit"],
            stop_loss=cand["stop_loss"],
            max_hold_days=cand["max_hold_days"],
        )
        # 至少需要 1 笔交易才纳入排名（单股信号本身稀少，门槛不宜过高）
        if stats["trade_count"] < 1:
            continue

        # 综合得分：胜率×0.5 + 均收益×3×0.3 + 信号频率分×0.2
        freq_score = min(stats["signal_count"] / max(len(dates) / 20, 1) * 10, 10)
        score = (
            stats["win_rate"] * 0.5
            + max(stats["avg_return"], 0) * 3 * 0.3
            + freq_score * 0.2
        )

        results.append(
            {
                **cand,
                "trade_count": stats["trade_count"],
                "win_rate": round(stats["win_rate"], 1),
                "avg_return": round(stats["avg_return"], 2),
                "signal_count": stats["signal_count"],
                "score": round(score, 1),
                "backtest_period": {
                    "start": start_date,
                    "end": end_date,
                    "days": len(dates),
                },
            }
        )

    # 5. 按得分降序，取 top_n
    results.sort(key=lambda x: x["score"], reverse=True)
    top = results[:top_n]
    for i, r in enumerate(top):
        r["rank"] = i + 1

    return {
        "code": code,
        "name": stock_name,
        "total_candidates": len(candidates),
        "valid_candidates": len(results),
        "backtest_period": {"start": start_date, "end": end_date, "days": len(dates)},
        "top_strategies": top,
    }


@router.get("/user_strategies")
def list_user_strategies(code: Optional[str] = None):
    """列出所有用户自定义策略，可按 for_code 过滤"""
    conn = _get_conn()
    try:
        if code:
            rows = conn.execute(
                "SELECT * FROM user_strategy WHERE for_code=? OR for_code IS NULL ORDER BY score DESC, created_at DESC",
                (code,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM user_strategy ORDER BY score DESC, created_at DESC"
            ).fetchall()
        return {"strategies": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.post("/user_strategies")
def save_user_strategy(body: UserStrategyIn):
    """保存一个用户自定义策略"""
    conn = _get_conn()
    try:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur = conn.execute(
            """
            INSERT INTO user_strategy
              (name, description, for_code, for_name, sql_text,
               stop_profit, stop_loss, max_hold_days,
               win_rate, avg_return, trade_count, score,
               indicators, params_json, source, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                body.name,
                body.description,
                body.for_code,
                body.for_name,
                body.sql_text,
                body.stop_profit,
                body.stop_loss,
                body.max_hold_days,
                body.win_rate,
                body.avg_return,
                body.trade_count,
                body.score,
                body.indicators,
                body.params_json,
                body.source,
                now,
                now,
            ),
        )
        conn.commit()
        return {"id": cur.lastrowid, "ok": True}
    finally:
        conn.close()


@router.put("/user_strategies/{strategy_id}")
def update_user_strategy(strategy_id: int, body: UserStrategyUpdate):
    """更新用户自定义策略（部分字段）"""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT id FROM user_strategy WHERE id=?", (strategy_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="策略不存在")
        fields = []
        values = []
        if body.name is not None:
            fields.append("name=?")
            values.append(body.name)
        if body.description is not None:
            fields.append("description=?")
            values.append(body.description)
        if body.sql_text is not None:
            fields.append("sql_text=?")
            values.append(body.sql_text)
        if body.stop_profit is not None:
            fields.append("stop_profit=?")
            values.append(body.stop_profit)
        if body.stop_loss is not None:
            fields.append("stop_loss=?")
            values.append(body.stop_loss)
        if body.max_hold_days is not None:
            fields.append("max_hold_days=?")
            values.append(body.max_hold_days)
        if not fields:
            return {"ok": True}
        fields.append("updated_at=?")
        values.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        values.append(strategy_id)
        conn.execute(f"UPDATE user_strategy SET {', '.join(fields)} WHERE id=?", values)
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/user_strategies/{strategy_id}")
def delete_user_strategy(strategy_id: int):
    """删除用户自定义策略"""
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM user_strategy WHERE id=?", (strategy_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.get("/user_strategies/{strategy_id}")
def get_user_strategy(strategy_id: int):
    """获取单个用户自定义策略"""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM user_strategy WHERE id=?", (strategy_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="策略不存在")
        return dict(row)
    finally:
        conn.close()
