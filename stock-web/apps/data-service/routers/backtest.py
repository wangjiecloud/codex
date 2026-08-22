"""
回测系统路由
接收策略描述（自然语言 -> SQL），在历史数据上模拟回测，返回每日收益曲线和统计指标。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta
import sqlite3
import os
import json
import re
import threading
import uuid

router = APIRouter()

# ── 任务取消机制 ──────────────────────────────────────────────────────────────
# {job_id: threading.Event}  Event 被 set() 时表示"取消信号"
_cancel_events: dict[str, threading.Event] = {}
_cancel_lock = threading.Lock()

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "stock_data.db")


# ── 请求/响应模型 ──────────────────────────────────────────────────────────────


class BacktestRequest(BaseModel):
    sql: str  # 选股 SQL（只选 code，或含 code 列即可）
    start_date: str  # 回测开始日期 YYYY-MM-DD
    end_date: str  # 回测结束日期 YYYY-MM-DD
    hold_days: int = 5  # 兼容旧参数，优先使用 max_hold_days
    max_hold_days: int = 10  # 最大持仓天数（到期强平）
    stop_profit: float = 8.0  # 止盈线（%），浮盈达到后次日卖出
    stop_loss: float = 5.0  # 止损线（%），浮亏达到后次日卖出
    benchmark: str = "000300"  # 基准指数代码，默认沪深300
    job_id: Optional[str] = None  # 前端传入的任务ID，用于取消


class DailyReturn(BaseModel):
    date: str
    strategy_return: float  # 策略累计收益率（%）
    benchmark_return: float  # 基准累计收益率（%）
    daily_pct: float  # 当日截面平均涨跌幅（%）


class TradeDetail(BaseModel):
    code: str
    name: str
    buy_date: str
    sell_date: str
    buy_price: float
    sell_price: float
    return_pct: float  # 单笔收益率（%）
    hold_days: int


class BacktestStats(BaseModel):
    total_return: float  # 总收益率（%）
    annual_return: float  # 年化收益率（%）
    benchmark_total_return: float  # 基准总收益率（%）
    benchmark_annual_return: float  # 基准年化收益率（%）
    sharpe_ratio: float  # 夏普比率
    max_drawdown: float  # 最大回撤（%）
    win_rate: float  # 胜率（%）
    total_trades: int  # 总交易次数
    avg_return_per_trade: float  # 单笔平均收益率（%）
    trade_days: int  # 回测交易日数
    signal_days: int  # 有信号的天数


class BacktestResponse(BaseModel):
    curve: list[DailyReturn]
    trades: list[TradeDetail]
    stats: BacktestStats
    sql_used: str  # 实际使用的 SQL（方便调试）
    signal_count_by_date: dict  # 每个信号日的选出股票数


# ── 工具函数 ──────────────────────────────────────────────────────────────────


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def _get_trading_dates(start_date: str, end_date: str) -> list[str]:
    """从 stock_kline 表中获取[start_date, end_date]内的交易日列表"""
    conn = _get_conn()
    try:
        rows = conn.execute(
            """
            SELECT DISTINCT trade_date
            FROM stock_kline
            WHERE period='daily' AND trade_date >= ? AND trade_date <= ?
            ORDER BY trade_date
            """,
            (start_date, end_date),
        ).fetchall()
        return [r["trade_date"] for r in rows]
    finally:
        conn.close()


def _get_kline_map(codes: list[str], start_date: str, end_date: str) -> dict:
    """
    返回 {code: {trade_date: {open, close, high, low, change_pct}}}
    只取 [start_date, end_date] 范围，提前取好避免多次查库
    """
    if not codes:
        return {}
    conn = _get_conn()
    try:
        placeholders = ",".join("?" * len(codes))
        rows = conn.execute(
            f"""
            SELECT code, trade_date, open, high, low, close, change_pct, volume
            FROM stock_kline
            WHERE period='daily'
              AND code IN ({placeholders})
              AND trade_date >= ?
              AND trade_date <= ?
            ORDER BY trade_date
            """,
            (*codes, start_date, end_date),
        ).fetchall()
        result: dict = {}
        for r in rows:
            code = r["code"]
            if code not in result:
                result[code] = {}
            result[code][r["trade_date"]] = {
                "open": r["open"] or 0,
                "close": r["close"] or 0,
                "high": r["high"] or 0,
                "low": r["low"] or 0,
                "change_pct": r["change_pct"] or 0,
                "volume": r["volume"] or 0,
            }
        return result
    finally:
        conn.close()


def _get_benchmark_kline(code: str, start_date: str, end_date: str) -> dict:
    """返回基准指数 {trade_date: close}"""
    conn = _get_conn()
    try:
        # 先扩展一些日期，以便找到第一个有效的基准价格
        extended_start = (
            datetime.strptime(start_date, "%Y-%m-%d") - timedelta(days=60)
        ).strftime("%Y-%m-%d")
        rows = conn.execute(
            """
            SELECT trade_date, close
            FROM stock_kline
            WHERE period='daily' AND code=? AND trade_date >= ? AND trade_date <= ?
            ORDER BY trade_date
            """,
            (code, extended_start, end_date),
        ).fetchall()
        return {r["trade_date"]: r["close"] for r in rows}
    finally:
        conn.close()


def _get_stock_names(codes: list[str]) -> dict:
    """返回 {code: name}"""
    if not codes:
        return {}
    conn = _get_conn()
    try:
        placeholders = ",".join("?" * len(codes))
        rows = conn.execute(
            f"SELECT code, name FROM stock_meta WHERE code IN ({placeholders})",
            codes,
        ).fetchall()
        return {r["code"]: r["name"] for r in rows}
    finally:
        conn.close()


def _extract_signal_codes_on_date(sql: str, signal_date: str) -> list[str]:
    """
    执行一次基于历史数据的选股 SQL，提取在 signal_date 那天满足条件的股票代码。

    修复说明：
    - historical_quote：用当天 K 线快照模拟 stock_quote，只含 signal_date 当天数据
    - stock_kline 中的窗口函数（MA/BOLL/RSI等）需限制 trade_date <= signal_date，
      否则 ROW_NUMBER() rn=1 会指向全库最新日期，造成未来数据泄露
    """
    # 构建历史快照视图 SQL
    historical_quote_sql = f"""
    WITH historical_quote AS (
        SELECT
            k.code,
            COALESCE(m.name, k.code) AS name,
            k.close AS price,
            k.change_pct AS change,
            k.open,
            k.close AS prev_close,
            k.high,
            k.low,
            k.volume,
            k.turnover,
            k.change_pct AS turn_rate,
            NULL AS market_cap,
            NULL AS pe,
            NULL AS pb,
            NULL AS turnover_rate,
            k.trade_date AS updated_at
        FROM stock_kline k
        LEFT JOIN stock_meta m ON m.code = k.code
        WHERE k.period = 'daily' AND k.trade_date = '{signal_date}'
    )
    """

    user_sql = sql.strip()

    # 关键修复：将策略 SQL 里 stock_kline 的 WHERE 子句注入日期上限
    # 这样窗口函数（MA/RSI/BOLL等）只使用 signal_date 及之前的数据
    # 替换 "FROM stock_kline WHERE period = 'daily'" 以及各种写法
    def inject_date_limit(sql_text: str, date: str) -> str:
        """在 stock_kline 的 WHERE period='daily' 后注入 trade_date <= date 限制"""
        # 匹配 FROM stock_kline WHERE period = 'daily' 各种写法（单/双引号，有无空格）
        patched = re.sub(
            r"(FROM\s+stock_kline\s+WHERE\s+period\s*=\s*['\"]daily['\"])",
            rf"\1 AND trade_date <= '{date}'",
            sql_text,
            flags=re.IGNORECASE,
        )
        return patched

    user_sql = inject_date_limit(user_sql, signal_date)

    # 构建最终 SQL：合并 WITH CTE
    if re.match(r"^\s*WITH\s+", user_sql, re.IGNORECASE):
        final_sql = (
            historical_quote_sql.rstrip()
            + ",\n"
            + user_sql[user_sql.lower().index("with") + 4 :]
        )
    else:
        final_sql = historical_quote_sql + user_sql

    # 替换 stock_quote → historical_quote
    final_sql = re.sub(
        r"\bstock_quote\b",
        "historical_quote",
        final_sql,
        flags=re.IGNORECASE,
    )

    conn = _get_conn()
    try:
        rows = conn.execute(final_sql).fetchall()
        codes = []
        for r in rows:
            keys = r.keys() if hasattr(r, "keys") else list(range(len(r)))
            # 取 code 列
            try:
                code = r["code"]
            except (IndexError, KeyError):
                code = r[0]
            if code and isinstance(code, str) and len(code) == 6:
                codes.append(code)
        return list(set(codes))
    except Exception as e:
        # SQL执行失败时静默返回空列表（部分信号日可能因数据不足导致失败）
        print(f"[backtest] signal SQL failed on {signal_date}: {e}")
        return []
    finally:
        conn.close()


def _find_next_trading_date(
    kline_map_code: dict, after_date: str, offset: int = 1
) -> Optional[str]:
    """在 kline_map_code 中找 after_date 之后第 offset 个交易日"""
    dates = sorted(kline_map_code.keys())
    try:
        idx = dates.index(after_date)
        target_idx = idx + offset
        if target_idx < len(dates):
            return dates[target_idx]
    except ValueError:
        # after_date 不在列表中，找第一个大于它的
        for d in dates:
            if d > after_date:
                offset -= 1
                if offset == 0:
                    return d
    return None


# ── 核心回测逻辑 ──────────────────────────────────────────────────────────────


def _run_backtest(
    sql: str,
    start_date: str,
    end_date: str,
    max_hold_days: int,
    stop_profit: float,
    stop_loss: float,
    benchmark_code: str,
    cancel_event: Optional[threading.Event] = None,
) -> BacktestResponse:
    """
    回测流程：
    1. 获取回测期内所有交易日
    2. 每个交易日执行选股 SQL（基于当天历史K线快照），得到信号股票列表
    3. 信号日次日买入，逐日检查止盈/止损/到期强平，确定实际卖出日
    4. 基于实际持仓每日盈亏构建净值曲线（与交易明细完全一致）
    5. 与基准指数对比
    """
    # 拓展日期范围（需要信号日之后 max_hold_days 天的数据）
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    extended_end = (end_dt + timedelta(days=max_hold_days * 3)).strftime("%Y-%m-%d")

    # 获取所有交易日
    all_trading_dates = _get_trading_dates(start_date, extended_end)
    if not all_trading_dates:
        raise HTTPException(status_code=400, detail="指定日期范围内无交易日数据")

    # 回测区间内的交易日
    backtest_dates = [d for d in all_trading_dates if start_date <= d <= end_date]
    if not backtest_dates:
        raise HTTPException(status_code=400, detail="回测日期范围内无交易日数据")

    print(
        f"[backtest] 回测区间: {start_date} ~ {end_date}, {len(backtest_dates)} 个交易日"
    )

    # ── Step 1: 每个信号日执行选股 SQL ────────────────────────────────────────
    signal_by_date: dict[str, list[str]] = {}  # {signal_date: [codes]}
    all_signal_codes: set[str] = set()

    for trade_date in backtest_dates:
        # 检查取消信号
        if cancel_event and cancel_event.is_set():
            raise HTTPException(status_code=499, detail="回测已被用户取消")
        codes = _extract_signal_codes_on_date(sql, trade_date)
        signal_by_date[trade_date] = codes
        all_signal_codes.update(codes)

    print(
        f"[backtest] 信号统计: {sum(len(v) for v in signal_by_date.values())} 个信号, {len(all_signal_codes)} 个唯一股票"
    )

    # ── Step 2: 获取所有信号股票的K线 ─────────────────────────────────────────
    all_codes_list = list(all_signal_codes)
    kline_map = (
        _get_kline_map(all_codes_list, start_date, extended_end)
        if all_codes_list
        else {}
    )
    stock_names = _get_stock_names(all_codes_list)

    # ── Step 3: 获取基准K线 ───────────────────────────────────────────────────
    benchmark_kline = _get_benchmark_kline(benchmark_code, start_date, extended_end)

    # 基准初始价格（回测第一个交易日收盘价）
    benchmark_start_price = None
    for d in backtest_dates:
        if d in benchmark_kline and benchmark_kline[d] > 0:
            benchmark_start_price = benchmark_kline[d]
            break

    # ── Step 4: 计算每笔交易（动态止盈止损） ─────────────────────────────────
    trades: list[TradeDetail] = []

    for signal_date in backtest_dates:
        codes = signal_by_date.get(signal_date, [])
        for code in codes:
            if code not in kline_map:
                continue
            code_kline = kline_map[code]
            dates_sorted = sorted(code_kline.keys())

            # 买入日：信号日次日（T+1 开盘）
            buy_date = None
            for d in dates_sorted:
                if d > signal_date:
                    buy_date = d
                    break
            if not buy_date:
                continue

            buy_price = code_kline[buy_date]["open"]
            if buy_price <= 0:
                buy_price = code_kline[buy_date]["close"]
            if buy_price <= 0:
                continue

            buy_idx = dates_sorted.index(buy_date)

            # 逐日检查止盈/止损/到期
            sell_date = None
            sell_price = None
            sell_reason = "到期"

            for i in range(buy_idx, min(buy_idx + max_hold_days, len(dates_sorted))):
                d = dates_sorted[i]
                bar = code_kline[d]
                day_high = bar.get("high", bar["close"])
                day_low = bar.get("low", bar["close"])
                day_close = bar["close"]

                if i == buy_idx:
                    # 买入当天：用当日收盘价做持仓评估，不触发卖出（次日才能卖）
                    continue

                # 用当日最高价检测止盈（日内触达，以收盘价卖出保守估算）
                high_pct = (day_high - buy_price) / buy_price * 100
                low_pct = (day_low - buy_price) / buy_price * 100

                if high_pct >= stop_profit:
                    # 止盈：以当日收盘价卖出（保守，实际可能更高）
                    sell_date = d
                    sell_price = day_close
                    sell_reason = f"止盈{stop_profit}%"
                    break
                elif low_pct <= -stop_loss:
                    # 止损：以当日收盘价卖出
                    sell_date = d
                    sell_price = day_close
                    sell_reason = f"止损{stop_loss}%"
                    break

            # 未触止盈止损：到期强平（最后一天收盘）
            if sell_date is None:
                last_idx = min(buy_idx + max_hold_days - 1, len(dates_sorted) - 1)
                sell_date = dates_sorted[last_idx]
                sell_price = code_kline[sell_date]["close"]

            if sell_price is None or sell_price <= 0:
                continue

            return_pct = (sell_price - buy_price) / buy_price * 100
            actual_hold = dates_sorted.index(sell_date) - buy_idx + 1

            trades.append(
                TradeDetail(
                    code=code,
                    name=stock_names.get(code, code),
                    buy_date=buy_date,
                    sell_date=sell_date,
                    buy_price=round(buy_price, 3),
                    sell_price=round(sell_price, 3),
                    return_pct=round(return_pct, 2),
                    hold_days=actual_hold,
                )
            )

    # ── Step 5: 计算每日策略净值曲线（基于实际持仓，与交易明细完全一致） ──────
    # 正确做法：对每个交易日，计算当天所有"活跃持仓"的浮盈均值作为当日策略收益
    # 活跃持仓 = buy_date <= trade_date < sell_date（包含买入日，不含卖出日）

    # 建立：每笔交易在哪些日期是活跃的
    # 对每个日期，收集所有活跃持仓的当日收益率（vs 买入价）
    date_active_returns: dict[str, list[float]] = {d: [] for d in backtest_dates}

    for trade in trades:
        buy_idx_in_all = None
        # 找买入日在 backtest_dates 中的位置
        for i, d in enumerate(backtest_dates):
            if d >= trade.buy_date:
                buy_idx_in_all = i
                break
        if buy_idx_in_all is None:
            continue

        for i in range(buy_idx_in_all, len(backtest_dates)):
            d = backtest_dates[i]
            if d > trade.sell_date:
                break
            # 当日收盘价 vs 买入价
            if trade.code in kline_map and d in kline_map[trade.code]:
                close = kline_map[trade.code][d]["close"]
                if close > 0 and trade.buy_price > 0:
                    day_return = (close - trade.buy_price) / trade.buy_price * 100
                    date_active_returns[d].append(day_return)

    # 构建曲线：每日策略净值 = 上日净值 × (1 + 当日新增收益增量/100)
    # 简化为：每日截面收益 = 当日活跃持仓平均浮盈 - 前一日平均浮盈（增量法）
    # 更稳健做法：直接用等权组合净值
    curve: list[DailyReturn] = []
    strategy_nav = 100.0
    benchmark_nav = 100.0
    prev_benchmark_close = benchmark_start_price
    prev_avg_return = 0.0  # 前日活跃持仓平均浮盈

    for trade_date in backtest_dates:
        active_returns = date_active_returns.get(trade_date, [])
        avg_return_today = (
            sum(active_returns) / len(active_returns) if active_returns else None
        )

        if avg_return_today is not None:
            # 当日增量 = 今日平均浮盈 - 前日平均浮盈
            daily_pct = avg_return_today - prev_avg_return
            prev_avg_return = avg_return_today
        else:
            # 无持仓日：如果前面有持仓已全部卖出，增量归零
            daily_pct = 0.0 - prev_avg_return  # 恢复到0基线
            prev_avg_return = 0.0

        strategy_nav = strategy_nav * (1 + daily_pct / 100)

        # 基准收益
        bench_close = benchmark_kline.get(trade_date)
        if (
            bench_close
            and bench_close > 0
            and prev_benchmark_close
            and prev_benchmark_close > 0
        ):
            bench_day_pct = (
                (bench_close - prev_benchmark_close) / prev_benchmark_close * 100
            )
            benchmark_nav = benchmark_nav * (1 + bench_day_pct / 100)
            prev_benchmark_close = bench_close

        curve.append(
            DailyReturn(
                date=trade_date,
                strategy_return=round(strategy_nav - 100, 2),
                benchmark_return=round(benchmark_nav - 100, 2),
                daily_pct=round(daily_pct, 2),
            )
        )

    # ── Step 6: 计算统计指标 ──────────────────────────────────────────────────
    trade_days = len(backtest_dates)
    signal_days = sum(1 for d in backtest_dates if signal_by_date.get(d))

    total_return = curve[-1].strategy_return if curve else 0.0
    benchmark_total_return = curve[-1].benchmark_return if curve else 0.0

    # 年化收益（按252交易日）
    years = trade_days / 252 if trade_days > 0 else 1
    annual_return = (
        ((1 + total_return / 100) ** (1 / years) - 1) * 100 if years > 0 else 0
    )
    benchmark_annual_return = (
        ((1 + benchmark_total_return / 100) ** (1 / years) - 1) * 100
        if years > 0
        else 0
    )

    # 最大回撤
    max_nav = 100.0
    max_drawdown = 0.0
    nav = 100.0
    for point in curve:
        nav = 100 + point.strategy_return
        max_nav = max(max_nav, nav)
        dd = (max_nav - nav) / max_nav * 100
        max_drawdown = max(max_drawdown, dd)

    # 胜率和平均单笔收益
    if trades:
        win_trades = [t for t in trades if t.return_pct > 0]
        win_rate = len(win_trades) / len(trades) * 100
        avg_return = sum(t.return_pct for t in trades) / len(trades)
    else:
        win_rate = 0.0
        avg_return = 0.0

    # 夏普比率（简化：用日收益标准差）
    if len(curve) > 1:
        daily_returns = [p.daily_pct for p in curve]
        mean_r = sum(daily_returns) / len(daily_returns)
        std_r = (
            sum((r - mean_r) ** 2 for r in daily_returns) / len(daily_returns)
        ) ** 0.5
        sharpe = (mean_r / std_r * (252**0.5)) if std_r > 0 else 0.0
    else:
        sharpe = 0.0

    stats = BacktestStats(
        total_return=round(total_return, 2),
        annual_return=round(annual_return, 2),
        benchmark_total_return=round(benchmark_total_return, 2),
        benchmark_annual_return=round(benchmark_annual_return, 2),
        sharpe_ratio=round(sharpe, 2),
        max_drawdown=round(max_drawdown, 2),
        win_rate=round(win_rate, 1),
        total_trades=len(trades),
        avg_return_per_trade=round(avg_return, 2),
        trade_days=trade_days,
        signal_days=signal_days,
    )

    # 限制返回 trades 数量（最多500笔，按时间倒序）
    sorted_trades = sorted(trades, key=lambda t: t.buy_date, reverse=True)[:500]

    signal_count_by_date = {
        d: len(codes) for d, codes in signal_by_date.items() if codes
    }

    return BacktestResponse(
        curve=curve,
        trades=sorted_trades,
        stats=stats,
        sql_used=sql,
        signal_count_by_date=signal_count_by_date,
    )


# ── API 路由 ──────────────────────────────────────────────────────────────────


@router.post("/run", summary="执行策略回测")
def run_backtest(req: BacktestRequest):
    """
    执行策略回测。

    - sql: 选股 SQL，必须含 code 列（可以含多列）
    - start_date / end_date: 回测日期范围（YYYY-MM-DD）
    - max_hold_days: 最大持仓天数（默认10天，到期强平）
    - stop_profit: 止盈线（%），默认 8.0
    - stop_loss: 止损线（%），默认 5.0
    - benchmark: 基准指数代码（默认 000300 沪深300）
    - job_id: 前端生成的任务ID，可通过 /cancel/{job_id} 取消回测
    """
    # 基本参数校验
    try:
        start_dt = datetime.strptime(req.start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(req.end_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="日期格式错误，请使用 YYYY-MM-DD")

    if start_dt >= end_dt:
        raise HTTPException(status_code=400, detail="开始日期必须早于结束日期")

    date_span = (end_dt - start_dt).days
    if date_span > 365 * 3:
        raise HTTPException(status_code=400, detail="回测区间不能超过3年，以避免超时")

    # 兼容旧参数：若前端传了 hold_days 且未传 max_hold_days，则用 hold_days
    max_hold_days = req.max_hold_days
    if max_hold_days < 1 or max_hold_days > 90:
        raise HTTPException(status_code=400, detail="最大持仓天数需在 1~90 之间")

    if req.stop_profit < 1 or req.stop_profit > 50:
        raise HTTPException(status_code=400, detail="止盈线需在 1%~50% 之间")

    if req.stop_loss < 1 or req.stop_loss > 30:
        raise HTTPException(status_code=400, detail="止损线需在 1%~30% 之间")

    if not req.sql.strip():
        raise HTTPException(status_code=400, detail="SQL 不能为空")

    # 注册取消 Event
    job_id = req.job_id or str(uuid.uuid4())
    cancel_event = threading.Event()
    with _cancel_lock:
        _cancel_events[job_id] = cancel_event

    try:
        result = _run_backtest(
            sql=req.sql,
            start_date=req.start_date,
            end_date=req.end_date,
            max_hold_days=max_hold_days,
            stop_profit=req.stop_profit,
            stop_loss=req.stop_loss,
            benchmark_code=req.benchmark,
            cancel_event=cancel_event,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"回测执行失败: {str(e)}")
    finally:
        # 清理 Event
        with _cancel_lock:
            _cancel_events.pop(job_id, None)


@router.post("/cancel/{job_id}", summary="取消正在执行的回测")
def cancel_backtest(job_id: str):
    """通过 job_id 取消正在运行的回测任务"""
    with _cancel_lock:
        event = _cancel_events.get(job_id)
    if event is None:
        return {"ok": False, "message": "任务不存在或已完成"}
    event.set()
    return {"ok": True, "message": "取消信号已发送"}


@router.get("/benchmarks", summary="获取可选基准指数列表")
def get_benchmarks():
    """返回支持的基准指数列表"""
    return {
        "benchmarks": [
            {"code": "000300", "name": "沪深300"},
            {"code": "000001", "name": "上证指数"},
            {"code": "399006", "name": "创业板指"},
            {"code": "000905", "name": "中证500"},
            {"code": "000852", "name": "中证1000"},
            {"code": "399001", "name": "深证成指"},
        ]
    }


# ── 策略元数据（与前端 STRATEGY_TEMPLATES 保持同步） ─────────────────────────

STRATEGY_CATALOG = [
    {
        "id": "macd_kdj",
        "label": "MACD+KDJ 双金叉",
        "stop_profit": 10,
        "stop_loss": 6,
        "max_hold_days": 10,
        "conditions": [
            "MACD DIF 向上穿越（EMA12 - EMA26 持续扩大）",
            "MACD 在零轴附近（DIF 在 -1 到 +2 区间，非过热）",
            "KDJ RSV 向上（K线上扬）且 RSV < 60（未超买）",
            "成交量 > 5日均量 × 1.5（放量配合）",
            "排除 ST 股",
        ],
        "sql": """WITH kline_ind AS (
  SELECT code, trade_date, close, volume,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS ema12,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 25 PRECEDING AND CURRENT ROW) AS ema26,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 1  PRECEDING AND CURRENT ROW) AS ema12_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 2  PRECEDING AND 1 PRECEDING) AS ema26_prev,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS low9,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS high9,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS low9_prev,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS high9_prev,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
),
signals AS (
  SELECT code,
    (ema12 - ema26) AS dif,
    (ema12_prev - ema26_prev) AS dif_prev,
    CASE WHEN high9 > low9 THEN (close - low9) / (high9 - low9) * 100 ELSE 50 END AS rsv,
    CASE WHEN high9_prev > low9_prev THEN (close - low9_prev) / (high9_prev - low9_prev) * 100 ELSE 50 END AS rsv_prev,
    volume, vol_avg5
  FROM kline_ind WHERE rn = 1
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN signals s ON s.code = q.code
WHERE s.dif > s.dif_prev AND s.dif > -1 AND s.dif < 2
  AND s.rsv > s.rsv_prev AND s.rsv < 60
  AND s.volume > s.vol_avg5 * 1.5
  AND q.name NOT LIKE '%ST%'
ORDER BY s.volume / s.vol_avg5 DESC""",
    },
    {
        "id": "ma_breakout",
        "label": "均线多头排列+放量突破",
        "stop_profit": 12,
        "stop_loss": 6,
        "max_hold_days": 15,
        "conditions": [
            "MA5 > MA10 > MA20 > MA60（四线多头排列）",
            "收盘价 > MA20（突破关键均线）",
            "成交量 > 5日均量 × 1.3（放量确认）",
            "收盘价 < MA60 × 1.30（距60日均线未超涨30%）",
            "排除 ST 股",
        ],
        "sql": """WITH kline_ma AS (
  SELECT code, trade_date, close, volume,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  4 PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  9 PRECEDING AND CURRENT ROW) AS ma10,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN kline_ma k ON k.code = q.code AND k.rn = 1
WHERE k.ma5 > k.ma10 AND k.ma10 > k.ma20 AND k.ma20 > k.ma60
  AND k.close > k.ma20
  AND k.volume > k.vol_avg5 * 1.3
  AND k.close < k.ma60 * 1.30
  AND q.name NOT LIKE '%ST%'
ORDER BY k.close / k.ma20 DESC""",
    },
    {
        "id": "boll_breakout",
        "label": "布林带收口突破",
        "stop_profit": 10,
        "stop_loss": 5,
        "max_hold_days": 12,
        "conditions": [
            "布林带宽度（上轨-下轨）创近15日最小值（带宽收窄蓄力）",
            "收盘价 > 布林上轨（有效突破上轨）",
            "成交量 > 10日均量 × 1.5（放量突破）",
            "20日均线向上（趋势向上）",
            "排除 ST 股",
        ],
        "sql": """WITH boll_prep AS (
  SELECT code, trade_date, close, volume,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  9 PRECEDING AND CURRENT ROW) AS vol_avg10,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
),
boll AS (
  SELECT code, trade_date, close, volume, ma20, vol_avg10, rn,
    ma20 + 2 * AVG(ABS(close - ma20)) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS boll_upper,
    ma20 - 2 * AVG(ABS(close - ma20)) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS boll_lower
  FROM boll_prep
),
boll_width AS (
  SELECT code,
    (boll_upper - boll_lower) AS width,
    MIN(boll_upper - boll_lower) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 14 PRECEDING AND CURRENT ROW) AS min_width_15d,
    close, volume, vol_avg10, boll_upper, ma20, rn
  FROM boll
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN boll_width b ON b.code = q.code AND b.rn = 1
WHERE b.width <= b.min_width_15d * 1.05
  AND b.close > b.boll_upper
  AND b.volume > b.vol_avg10 * 1.5
  AND q.name NOT LIKE '%ST%'
ORDER BY b.volume / b.vol_avg10 DESC""",
    },
    {
        "id": "rsi_oversold",
        "label": "RSI 低位超卖反弹",
        "stop_profit": 7,
        "stop_loss": 4,
        "max_hold_days": 8,
        "conditions": [
            "RSI14 前一日 ≤ 30（超卖区），当日 RSI14 > 30（向上穿越超卖线）",
            "当日阳线（收盘 > 开盘）",
            "成交量 < 20日均量（缩量反弹，非放量追涨）",
            "收盘价 < MA60 × 0.85（处于低位，距60日均线超卖15%）",
            "排除 ST 股",
        ],
        "sql": """WITH rsi_calc AS (
  SELECT code, trade_date, close, open, volume,
    CASE WHEN AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END)
              OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) = 0
         THEN 100
         ELSE 100 - 100 / (1 + AVG(CASE WHEN change_pct > 0 THEN change_pct ELSE 0 END)
                                    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)
                             / AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END)
                                    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW))
    END AS rsi14,
    CASE WHEN AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END)
              OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 14 PRECEDING AND 1 PRECEDING) = 0
         THEN 100
         ELSE 100 - 100 / (1 + AVG(CASE WHEN change_pct > 0 THEN change_pct ELSE 0 END)
                                    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 14 PRECEDING AND 1 PRECEDING)
                             / AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END)
                                    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 14 PRECEDING AND 1 PRECEDING))
    END AS rsi14_prev,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_avg20,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN rsi_calc r ON r.code = q.code AND r.rn = 1
WHERE r.rsi14_prev <= 30 AND r.rsi14 > 30
  AND r.close > r.open
  AND r.volume < r.vol_avg20
  AND r.close < r.ma60 * 0.85
  AND q.name NOT LIKE '%ST%'
ORDER BY r.rsi14_prev ASC""",
    },
    {
        "id": "kdj_double_cross",
        "label": "KDJ 超卖区二次金叉",
        "stop_profit": 10,
        "stop_loss": 6,
        "max_hold_days": 10,
        "conditions": [
            "KDJ RSV 当日 < 20 且前一日 < 20（连续两日处于超卖区）",
            "当日 RSV > 前日 RSV（二次上扬，形成二次金叉）",
            "收盘价在 MA5 ± 3% 之间（贴近均线，未偏离）",
            "近5日低点 ≥ 前5日低点（止跌信号）",
            "排除 ST 股",
        ],
        "sql": """WITH kdj AS (
  SELECT code, trade_date, close, low,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS low9,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS high9,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS low9_prev,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS high9_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS ma5,
    MIN(low) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS low5d,
    MIN(low) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 5 PRECEDING) AS low5d_prev,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
),
rsv_calc AS (
  SELECT code, low9, high9, low9_prev, high9_prev, close, ma5, low5d, low5d_prev, rn,
    CASE WHEN high9 > low9 THEN (close - low9) / (high9 - low9) * 100 ELSE 50 END AS rsv,
    CASE WHEN high9_prev > low9_prev THEN (close - low9_prev) / (high9_prev - low9_prev) * 100 ELSE 50 END AS rsv_prev
  FROM kdj
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN rsv_calc r ON r.code = q.code AND r.rn = 1
WHERE r.rsv < 20 AND r.rsv_prev < 20 AND r.rsv > r.rsv_prev
  AND r.close BETWEEN r.ma5 * 0.97 AND r.ma5 * 1.05
  AND r.low5d >= r.low5d_prev
  AND q.name NOT LIKE '%ST%'""",
    },
    {
        "id": "pullback_ma5",
        "label": "缩量回踩 5 日线",
        "stop_profit": 7,
        "stop_loss": 4,
        "max_hold_days": 8,
        "conditions": [
            "20日涨幅 ≥ 15%（近期有过一波上涨行情）",
            "收盘价在 MA5 ± 3% 之间（精准回踩5日均线）",
            "成交量 < 5日均量 × 0.70（缩量回踩，主力未出货）",
            "当日阳线（收盘 > 开盘）",
            "排除 ST 股",
        ],
        "sql": """WITH kline_stats AS (
  SELECT code, trade_date, close, open, volume,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  4 PRECEDING AND CURRENT ROW) AS ma5,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    MAX(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS max_close_20d,
    MIN(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS min_close_20d,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN kline_stats k ON k.code = q.code AND k.rn = 1
WHERE k.max_close_20d > k.min_close_20d * 1.15
  AND k.close BETWEEN k.ma5 * 0.97 AND k.ma5 * 1.03
  AND k.volume < k.vol_avg5 * 0.70
  AND k.close > k.open
  AND q.name NOT LIKE '%ST%'
ORDER BY k.volume / k.vol_avg5 ASC""",
    },
    {
        "id": "vol_breakout",
        "label": "成交量异动+突破平台",
        "stop_profit": 8,
        "stop_loss": 5,
        "max_hold_days": 7,
        "conditions": [
            "成交量 > 20日均量 × 3.0（超大量异动）",
            "收盘价突破近20日最高价（突破平台压力）",
            "当日涨幅在 3%~9% 之间（有力上涨但未涨停）",
            "排除 ST 股",
        ],
        "sql": """WITH kline_vol AS (
  SELECT code, trade_date, close, high, change_pct,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_avg20,
    MAX(high)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS high_20d,
    volume,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN kline_vol k ON k.code = q.code AND k.rn = 1
WHERE k.volume > k.vol_avg20 * 3.0
  AND k.close > k.high_20d
  AND k.change_pct > 3 AND k.change_pct < 9
  AND q.name NOT LIKE '%ST%'
ORDER BY k.volume / k.vol_avg20 DESC""",
    },
    {
        "id": "right_breakout",
        "label": "右侧突破确认买入",
        "stop_profit": 10,
        "stop_loss": 5,
        "max_hold_days": 12,
        "conditions": [
            "收盘价 > 近20日最高价（突破前高，右侧确认）",
            "近5日低点 > 前5日低点（低点抬升，趋势向上）",
            "MACD DIF > 0 且 DIF 向上扩大（MACD多头）",
            "成交量 > 5日均量 × 1.5（放量突破）",
            "收盘价 > MA20（站稳均线）",
            "排除 ST 股",
        ],
        "sql": """WITH kline_base AS (
  SELECT code, trade_date, open, high, low, close, volume,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS high20_prev,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS low5,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 5 PRECEDING) AS low5_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS ema12,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 25 PRECEDING AND CURRENT ROW) AS ema26,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING) AS ema12_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 26 PRECEDING AND 1 PRECEDING) AS ema26_prev,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN kline_base k ON k.code = q.code AND k.rn = 1
WHERE k.close > k.high20_prev
  AND k.low5 > k.low5_prev
  AND (k.ema12 - k.ema26) > 0
  AND (k.ema12 - k.ema26) > (k.ema12_prev - k.ema26_prev)
  AND k.volume > k.vol_avg5 * 1.5
  AND k.close > k.ma20
  AND q.name NOT LIKE '%ST%'
ORDER BY k.close / k.high20_prev DESC""",
    },
    {
        "id": "ma_golden_cross",
        "label": "均线金叉右侧趋势启动",
        "stop_profit": 15,
        "stop_loss": 7,
        "max_hold_days": 20,
        "conditions": [
            "MA20 从下向上穿越 MA60（20/60日均线金叉，中期趋势转多）",
            "MA5 > MA10 > MA20（短期均线多头排列）",
            "KDJ RSV 向上且 < 75（未超买）",
            "MACD DIF > 0 且持续扩大（多头动能）",
            "成交量 > 10日均量（放量启动）",
            "排除 ST 股",
        ],
        "sql": """WITH kline_ma AS (
  SELECT code, trade_date, close, high, low, volume,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4  PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9  PRECEDING AND CURRENT ROW) AS ma10,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS ma20_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 60 PRECEDING AND 1 PRECEDING) AS ma60_prev,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9  PRECEDING AND CURRENT ROW) AS vol_avg10,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS low9,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS high9,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS low9_prev,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS high9_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS ema12,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 25 PRECEDING AND CURRENT ROW) AS ema26,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING) AS ema12_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 26 PRECEDING AND 1 PRECEDING) AS ema26_prev,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
),
signals AS (
  SELECT *,
    CASE WHEN high9 > low9 THEN (close - low9) / (high9 - low9) * 100 ELSE 50 END AS rsv,
    CASE WHEN high9_prev > low9_prev THEN (close - low9_prev) / (high9_prev - low9_prev) * 100 ELSE 50 END AS rsv_prev,
    (ema12 - ema26) AS macd_hist,
    (ema12_prev - ema26_prev) AS macd_hist_prev
  FROM kline_ma WHERE rn = 1
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN signals s ON s.code = q.code
WHERE s.ma20 > s.ma60 AND s.ma20_prev <= s.ma60_prev
  AND s.ma5 > s.ma10 AND s.ma10 > s.ma20
  AND s.rsv > s.rsv_prev AND s.rsv < 75
  AND s.macd_hist > 0 AND s.macd_hist > s.macd_hist_prev
  AND s.volume > s.vol_avg10
  AND q.name NOT LIKE '%ST%'
ORDER BY s.macd_hist - s.macd_hist_prev DESC""",
    },
]


def _run_single_stock_backtest(
    code: str,
    strategy: dict,
    start_date: str,
    end_date: str,
) -> dict:
    """对单只股票跑单个策略的简化回测，返回统计指标 + 逐笔交易明细"""
    sql = strategy["sql"]
    stop_profit = strategy["stop_profit"]
    stop_loss = strategy["stop_loss"]
    max_hold_days = strategy["max_hold_days"]

    # 注入个股过滤：在 "AND q.name NOT LIKE '%ST%'" 前插入，避免 rfind("ORDER BY")
    # 误匹配 OVER 子句内部的 ORDER BY（如 ROW_NUMBER() OVER (... ORDER BY trade_date DESC)）
    if "AND q.code = " not in sql:
        st_anchor = "AND q.name NOT LIKE '%ST%'"
        if st_anchor in sql:
            sql = sql.replace(st_anchor, f"AND q.code = '{code}'\n  {st_anchor}", 1)
        elif "WHERE" in sql.upper():
            # 没有 ST 过滤锚点时，追加到末尾
            sql = sql + f"\n  AND q.code = '{code}'"

    extended_end = (
        datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=max_hold_days * 3)
    ).strftime("%Y-%m-%d")

    backtest_dates = _get_trading_dates(start_date, end_date)
    if not backtest_dates:
        return {
            "signal_count": 0,
            "total_return": 0,
            "win_rate": 0,
            "trade_count": 0,
            "trades": [],
            "signal_dates": [],
        }

    signal_by_date: dict[str, list[str]] = {}
    for trade_date in backtest_dates:
        codes = _extract_signal_codes_on_date(sql, trade_date)
        signal_by_date[trade_date] = codes

    signal_dates = sorted([d for d, c in signal_by_date.items() if c])
    all_signal_codes = {code for codes in signal_by_date.values() for code in codes}
    if not all_signal_codes:
        return {
            "signal_count": 0,
            "total_return": 0,
            "win_rate": 0,
            "trade_count": 0,
            "trades": [],
            "signal_dates": [],
        }

    kline_map = _get_kline_map(list(all_signal_codes), start_date, extended_end)
    trades_stats = []  # 仅收益率，用于汇总统计
    trades_detail = []  # 完整明细

    # ── 辅助：计算信号日技术快照（基于 kline_map 中的历史数据）────────────────
    def _calc_signal_snapshot(c: str, signal_date: str, code_kline: dict) -> dict:
        """在 signal_date 当天，用截止该日的历史 K 线计算技术指标快照"""
        dates_all = sorted(code_kline.keys())
        # 取 signal_date 及之前的数据，最多 120 根
        hist = [d for d in dates_all if d <= signal_date][-120:]
        if len(hist) < 5:
            return {}
        closes = [code_kline[d]["close"] for d in hist]
        highs = [code_kline[d]["high"] for d in hist]
        lows = [code_kline[d]["low"] for d in hist]
        volumes = [code_kline[d].get("volume") or 0 for d in hist]
        # 从扩展的 kline_map 拿 volume（需要在 _get_kline_map 里含 volume）
        # 暂用 change_pct 代替，volume 需单独查
        cur_close = closes[-1]
        cur_open = code_kline[hist[-1]]["open"]
        cur_high = highs[-1]
        cur_low = lows[-1]

        def sma(arr, n):
            return round(sum(arr[-n:]) / n, 3) if len(arr) >= n else None

        ma5 = sma(closes, 5)
        ma10 = sma(closes, 10)
        ma20 = sma(closes, 20)
        ma60 = sma(closes, 60)

        # RSI14
        rsi14 = None
        if len(closes) >= 15:
            deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
            gains = [max(d, 0) for d in deltas[-14:]]
            losses = [abs(min(d, 0)) for d in deltas[-14:]]
            avg_gain = sum(gains) / 14
            avg_loss = sum(losses) / 14
            if avg_loss == 0:
                rsi14 = 100.0
            else:
                rs = avg_gain / avg_loss
                rsi14 = round(100 - 100 / (1 + rs), 1)

        # MACD (EMA12, EMA26, DIF)
        def ema(arr, n):
            if len(arr) < n:
                return None
            k = 2 / (n + 1)
            e = arr[0]
            for v in arr[1:]:
                e = v * k + e * (1 - k)
            return round(e, 3)

        ema12 = ema(closes, 12)
        ema26 = ema(closes, 26)
        dif = round(ema12 - ema26, 3) if ema12 and ema26 else None

        # 成交量比（当日 vs 5日均量）
        vol_ratio = None
        if len(hist) >= 2:
            vol_avg5_prev = sum(volumes[-6:-1]) / 5 if len(volumes) >= 6 else None
            if vol_avg5_prev and vol_avg5_prev > 0 and volumes[-1] > 0:
                vol_ratio = round(volumes[-1] / vol_avg5_prev, 2)

        # 布林带（20日）
        boll_upper = boll_lower = None
        if len(closes) >= 20:
            mid = sum(closes[-20:]) / 20
            std = (sum((x - mid) ** 2 for x in closes[-20:]) / 20) ** 0.5
            boll_upper = round(mid + 2 * std, 2)
            boll_lower = round(mid - 2 * std, 2)

        snap = {
            "date": signal_date,
            "open": round(cur_open, 2),
            "high": round(cur_high, 2),
            "low": round(cur_low, 2),
            "close": round(cur_close, 2),
            "change_pct": round(code_kline[hist[-1]].get("change_pct") or 0, 2),
        }
        if ma5:
            snap["ma5"] = ma5
        if ma10:
            snap["ma10"] = ma10
        if ma20:
            snap["ma20"] = ma20
        if ma60:
            snap["ma60"] = ma60
        if rsi14 is not None:
            snap["rsi14"] = rsi14
        if dif is not None:
            snap["macd_dif"] = dif
        if vol_ratio is not None:
            snap["vol_ratio"] = vol_ratio
        if boll_upper:
            snap["boll_upper"] = boll_upper
        if boll_lower:
            snap["boll_lower"] = boll_lower

        # 各均线偏离度
        for k, v in [("ma5", ma5), ("ma20", ma20), ("ma60", ma60)]:
            if v and v > 0:
                snap[f"vs_{k}"] = round((cur_close - v) / v * 100, 1)

        return snap

    for signal_date in backtest_dates:
        for c in signal_by_date.get(signal_date, []):
            if c not in kline_map:
                continue
            code_kline = kline_map[c]
            dates_sorted = sorted(code_kline.keys())
            buy_date = next((d for d in dates_sorted if d > signal_date), None)
            if not buy_date:
                continue
            buy_price = code_kline[buy_date].get("open") or code_kline[buy_date].get(
                "close", 0
            )
            if buy_price <= 0:
                continue
            buy_idx = dates_sorted.index(buy_date)

            # 信号日技术快照
            signal_snap = _calc_signal_snapshot(c, signal_date, code_kline)

            # 买入日数据
            buy_bar = code_kline[buy_date]
            buy_detail = {
                "date": buy_date,
                "open": round(buy_bar.get("open") or 0, 2),
                "high": round(buy_bar.get("high") or 0, 2),
                "low": round(buy_bar.get("low") or 0, 2),
                "close": round(buy_bar.get("close") or 0, 2),
                "gap_pct": round(
                    (buy_bar.get("open", 0) - code_kline[signal_date]["close"])
                    / code_kline[signal_date]["close"]
                    * 100,
                    2,
                )
                if signal_date in code_kline and code_kline[signal_date]["close"] > 0
                else None,
                "reason": f"信号日({signal_date})收盘后触发策略，次日以开盘价 {round(buy_bar.get('open') or 0, 2)} 买入",
            }

            sell_date = sell_price = None
            exit_reason = f"持仓{max_hold_days}天到期强平"
            exit_detail: dict = {}

            for i in range(
                buy_idx + 1, min(buy_idx + max_hold_days, len(dates_sorted))
            ):
                d = dates_sorted[i]
                bar = code_kline[d]
                day_high = bar.get("high", bar["close"])
                day_low = bar.get("low", bar["close"])
                high_pct = (day_high - buy_price) / buy_price * 100
                low_pct = (day_low - buy_price) / buy_price * 100
                if high_pct >= stop_profit:
                    sell_date = d
                    sell_price = bar["close"]
                    exit_reason = f"触及止盈 +{stop_profit}%"
                    exit_detail = {
                        "trigger": "止盈",
                        "threshold_pct": stop_profit,
                        "day_high": round(day_high, 2),
                        "day_high_pct": round(high_pct, 2),
                        "sell_price": round(bar["close"], 2),
                        "note": f"当日最高价 {round(day_high, 2)} 较买入价涨幅 +{round(high_pct, 1)}%，触及止盈线 +{stop_profit}%，以收盘价 {round(bar['close'], 2)} 卖出",
                    }
                    break
                elif low_pct <= -stop_loss:
                    sell_date = d
                    sell_price = bar["close"]
                    exit_reason = f"触及止损 -{stop_loss}%"
                    exit_detail = {
                        "trigger": "止损",
                        "threshold_pct": -stop_loss,
                        "day_low": round(day_low, 2),
                        "day_low_pct": round(low_pct, 2),
                        "sell_price": round(bar["close"], 2),
                        "note": f"当日最低价 {round(day_low, 2)} 较买入价跌幅 {round(low_pct, 1)}%，触及止损线 -{stop_loss}%，以收盘价 {round(bar['close'], 2)} 卖出",
                    }
                    break

            if sell_date is None:
                last_idx = min(buy_idx + max_hold_days - 1, len(dates_sorted) - 1)
                sell_date = dates_sorted[last_idx]
                sell_price = code_kline[sell_date]["close"]
                hold_actual = last_idx - buy_idx
                exit_detail = {
                    "trigger": "到期强平",
                    "threshold_pct": None,
                    "sell_price": round(sell_price, 2),
                    "note": f"持仓满 {max_hold_days} 交易日未触及止盈/止损，于 {sell_date} 以收盘价 {round(sell_price, 2)} 强平",
                }

            if sell_price and sell_price > 0:
                return_pct = round((sell_price - buy_price) / buy_price * 100, 2)
                hold_days = dates_sorted.index(sell_date) - buy_idx
                trades_stats.append(return_pct)
                trades_detail.append(
                    {
                        "signal_date": signal_date,
                        "buy_date": buy_date,
                        "buy_price": round(buy_price, 2),
                        "sell_date": sell_date,
                        "sell_price": round(sell_price, 2),
                        "return_pct": return_pct,
                        "hold_days": hold_days,
                        "exit_reason": exit_reason,
                        "signal_snapshot": signal_snap,
                        "buy_detail": buy_detail,
                        "exit_detail": exit_detail,
                    }
                )

    if not trades_stats:
        return {
            "signal_count": len(signal_dates),
            "total_return": 0,
            "win_rate": 0,
            "trade_count": 0,
            "trades": [],
            "signal_dates": signal_dates,
        }

    win_rate = sum(1 for r in trades_stats if r > 0) / len(trades_stats) * 100
    avg_return = sum(trades_stats) / len(trades_stats)
    # 简化总收益：等权复利
    total_return = 1.0
    for r in trades_stats:
        total_return *= 1 + r / 100
    total_return = (total_return - 1) * 100

    return {
        "signal_count": len(trades_stats),
        "trade_count": len(trades_stats),
        "win_rate": round(win_rate, 1),
        "avg_return": round(avg_return, 2),
        "total_return": round(total_return, 2),
        "trades": trades_detail,
        "signal_dates": signal_dates,
    }


def _calc_technical_levels(code: str) -> dict:
    """计算当前技术指标水位：均线、布林带、支撑/压力位"""
    conn = _get_conn()
    try:
        rows = conn.execute(
            """
            SELECT trade_date, open, high, low, close, volume
            FROM stock_kline
            WHERE code = ? AND period = 'daily'
            ORDER BY trade_date DESC
            LIMIT 120
            """,
            (code,),
        ).fetchall()
    finally:
        conn.close()

    if len(rows) < 20:
        return {}

    # 最新数据排在前面，反转得到时序
    rows = list(reversed(rows))
    closes = [r["close"] for r in rows]
    highs = [r["high"] for r in rows]
    lows = [r["low"] for r in rows]
    volumes = [r["volume"] for r in rows]
    current = closes[-1]

    def ma(n):
        if len(closes) < n:
            return None
        return round(sum(closes[-n:]) / n, 2)

    # 均线
    ma5 = ma(5)
    ma10 = ma(10)
    ma20 = ma(20)
    ma60 = ma(60)

    # 布林带（20日）
    boll_mid = ma20
    if boll_mid and len(closes) >= 20:
        std = (sum((c - boll_mid) ** 2 for c in closes[-20:]) / 20) ** 0.5
        boll_upper = round(boll_mid + 2 * std, 2)
        boll_lower = round(boll_mid - 2 * std, 2)
    else:
        boll_upper = boll_lower = None

    # 支撑位：近60日内的局部低点（低于前后各5天的低点）
    support_levels = []
    resistance_levels = []
    for i in range(5, min(60, len(rows)) - 5):
        lo = lows[-(i + 1)]
        hi = highs[-(i + 1)]
        # 局部低点
        if lo == min(lows[-(i + 6) : -(i - 4) if i > 4 else None]):
            support_levels.append(lo)
        # 局部高点
        if hi == max(highs[-(i + 6) : -(i - 4) if i > 4 else None]):
            resistance_levels.append(hi)

    # 取最近的支撑/压力（距当前价最近的）
    supports = sorted(set([round(s, 2) for s in support_levels if s < current]))[-3:]
    resistances = sorted(set([round(r, 2) for r in resistance_levels if r > current]))[
        :3
    ]

    # 成交量分析
    avg_vol_20 = round(sum(volumes[-20:]) / 20) if len(volumes) >= 20 else None
    latest_vol = volumes[-1]
    vol_ratio = round(latest_vol / avg_vol_20, 2) if avg_vol_20 else None

    # 当前价相对各均线的位置（%）
    def pct_vs(price, ref):
        if ref and ref > 0:
            return round((price - ref) / ref * 100, 2)
        return None

    return {
        "current_price": current,
        "ma5": ma5,
        "ma10": ma10,
        "ma20": ma20,
        "ma60": ma60,
        "boll_upper": boll_upper,
        "boll_mid": boll_mid,
        "boll_lower": boll_lower,
        "support_levels": supports,
        "resistance_levels": resistances,
        "vol_ratio": vol_ratio,
        "vs_ma5": pct_vs(current, ma5),
        "vs_ma20": pct_vs(current, ma20),
        "vs_ma60": pct_vs(current, ma60),
        "vs_boll_upper": pct_vs(current, boll_upper),
        "vs_boll_lower": pct_vs(current, boll_lower),
    }


def _calc_atr_stop_levels(code: str, strategy: dict) -> dict:
    """
    基于 ATR（14日平均真实波动幅度）动态计算该股票的合理止盈止损建议。

    逻辑：
    - ATR 反映股票每日"真实波动"幅度（考虑跳空），能比较真实地衡量波动性
    - 止损 = max(策略默认止损, round(atr_pct * stop_loss_atr_mult, 1))
      建议乘数 1.5 倍 ATR，避免正常波动触发
    - 止盈 = max(策略默认止盈, round(atr_pct * stop_profit_atr_mult, 1))
      建议乘数 2.5~3.0 倍 ATR，给足盈利空间
    - 但须保持止盈 > 止损（风险收益比 ≥ 1.5）

    Returns: {
        "atr14": float,             # 14日 ATR 绝对值（元）
        "atr_pct": float,           # ATR 占当前价的百分比（%）
        "volatility_level": str,    # 波动率等级: low/medium/high/extreme
        "dynamic_stop_profit": float,
        "dynamic_stop_loss": float,
        "default_stop_profit": float,
        "default_stop_loss": float,
        "adjusted": bool,           # 是否相对默认值有调整
        "adjust_reason": str,
    }
    """
    conn = _get_conn()
    try:
        rows = conn.execute(
            """SELECT trade_date, high, low, close
               FROM stock_kline
               WHERE code = ? AND period = 'daily'
               ORDER BY trade_date DESC LIMIT 30""",
            (code,),
        ).fetchall()
    finally:
        conn.close()

    default_sp = strategy["stop_profit"]
    default_sl = strategy["stop_loss"]

    if len(rows) < 15:
        return {
            "atr14": None,
            "atr_pct": None,
            "volatility_level": "unknown",
            "dynamic_stop_profit": default_sp,
            "dynamic_stop_loss": default_sl,
            "default_stop_profit": default_sp,
            "default_stop_loss": default_sl,
            "adjusted": False,
            "adjust_reason": "K线数据不足，使用策略默认值",
        }

    rows = list(reversed(rows))  # 时序升序
    current_price = rows[-1]["close"]

    # 计算真实波动幅度 True Range
    tr_list = []
    for i in range(1, len(rows)):
        high = rows[i]["high"]
        low = rows[i]["low"]
        prev_close = rows[i - 1]["close"]
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        tr_list.append(tr)

    atr14 = (
        sum(tr_list[-14:]) / 14 if len(tr_list) >= 14 else sum(tr_list) / len(tr_list)
    )
    atr_pct = round(atr14 / current_price * 100, 2) if current_price > 0 else 0

    # 波动率等级
    if atr_pct < 2.0:
        vol_level = "low"  # 低波动（银行、公用事业）
    elif atr_pct < 4.0:
        vol_level = "medium"  # 中等波动（普通A股）
    elif atr_pct < 8.0:
        vol_level = "high"  # 高波动（成长股、题材股）
    else:
        vol_level = "extreme"  # 极高波动（妖股、ST、科创板极端行情）

    # 动态止盈止损：基于 ATR 倍数，同时不低于策略默认值（防止过于宽松）
    # 止损：1.5 倍 ATR（给正常波动留空间），最小 = 策略默认
    sl_atr_mult = 1.5
    sp_atr_mult = 2.8  # 止盈：2.8 倍 ATR

    dyn_sl = max(default_sl, round(atr_pct * sl_atr_mult, 1))
    dyn_sp = max(default_sp, round(atr_pct * sp_atr_mult, 1))

    # 确保风险收益比 ≥ 1.5
    if dyn_sp < dyn_sl * 1.5:
        dyn_sp = round(dyn_sl * 1.5, 1)

    # 上限保护：止损不超过 20%，止盈不超过 40%
    dyn_sl = min(dyn_sl, 20.0)
    dyn_sp = min(dyn_sp, 40.0)

    adjusted = dyn_sl != default_sl or dyn_sp != default_sp

    # 生成调整原因说明
    if not adjusted:
        reason = f"ATR={atr_pct:.1f}%（{vol_level}波动），默认参数已合理"
    elif vol_level == "low":
        reason = f"ATR={atr_pct:.1f}%（低波动股），默认止损 -{default_sl}% 相对偏大，但已保留策略最小值"
    elif vol_level in ("high", "extreme"):
        reason = f"ATR={atr_pct:.1f}%（{'高' if vol_level == 'high' else '极高'}波动股），适当放宽止损至 -{dyn_sl}%，止盈至 +{dyn_sp}%，避免正常波动触发"
    else:
        reason = f"ATR={atr_pct:.1f}%（中等波动），动态微调止损至 -{dyn_sl}%，止盈至 +{dyn_sp}%"

    return {
        "atr14": round(atr14, 3),
        "atr_pct": atr_pct,
        "volatility_level": vol_level,
        "dynamic_stop_profit": dyn_sp,
        "dynamic_stop_loss": dyn_sl,
        "default_stop_profit": default_sp,
        "default_stop_loss": default_sl,
        "adjusted": adjusted,
        "adjust_reason": reason,
    }


@router.get("/analyze/{code}", summary="对单只股票跑全部策略回测并给出最佳策略推荐")
def analyze_stock(
    code: str,
    days: int = 120,  # 回测最近N天（默认120交易日≈6个月）
    benchmark: str = "000300",
):
    """
    对单只股票跑所有内置策略的历史回测，按综合得分排名，
    同时计算当前技术指标水位和建议买入/卖出区间。
    """
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT name FROM stock_quote WHERE code = ?", (code,)
        ).fetchone()
        stock_name = row["name"] if row else code

        # 确定回测日期范围
        dates = conn.execute(
            """SELECT DISTINCT trade_date FROM stock_kline
               WHERE code = ? AND period = 'daily'
               ORDER BY trade_date DESC LIMIT ?""",
            (code, days),
        ).fetchall()
    finally:
        conn.close()

    if not dates:
        raise HTTPException(status_code=404, detail=f"股票 {code} 无K线数据")

    end_date = dates[0]["trade_date"]
    start_date = dates[-1]["trade_date"]

    # 对每个兼容个股的策略跑回测
    results = []
    # 先计算 ATR（只需调用一次，所有策略共享同一股票的 ATR，按各自默认参数差异化）
    # ATR 计算放在策略循环之前，避免重复查询
    for strategy in STRATEGY_CATALOG:
        atr_info = _calc_atr_stop_levels(code, strategy)
        try:
            stats = _run_single_stock_backtest(code, strategy, start_date, end_date)
            # 综合得分 = 胜率 * 0.4 + 平均收益 * 0.4 + 信号频率分 * 0.2
            signal_score = min(stats.get("trade_count", 0) * 10, 30)  # 最多30分
            win_score = stats.get("win_rate", 0) * 0.4
            return_score = max(min(stats.get("avg_return", 0) * 4, 40), -20)
            score = round(win_score + return_score + signal_score * 0.2, 1)

            results.append(
                {
                    "id": strategy["id"],
                    "label": strategy["label"],
                    "stop_profit": strategy["stop_profit"],
                    "stop_loss": strategy["stop_loss"],
                    "max_hold_days": strategy["max_hold_days"],
                    "conditions": strategy.get("conditions", []),
                    "trade_count": stats.get("trade_count", 0),
                    "win_rate": stats.get("win_rate", 0),
                    "avg_return": stats.get("avg_return", 0),
                    "total_return": stats.get("total_return", 0),
                    "score": score,
                    "trades": stats.get("trades", []),
                    "signal_dates": stats.get("signal_dates", []),
                    "atr_stop": atr_info,
                }
            )
        except Exception as e:
            print(f"[analyze] strategy {strategy['id']} failed for {code}: {e}")
            results.append(
                {
                    "id": strategy["id"],
                    "label": strategy["label"],
                    "stop_profit": strategy["stop_profit"],
                    "stop_loss": strategy["stop_loss"],
                    "max_hold_days": strategy["max_hold_days"],
                    "conditions": strategy.get("conditions", []),
                    "trade_count": 0,
                    "win_rate": 0,
                    "avg_return": 0,
                    "total_return": 0,
                    "score": 0,
                    "trades": [],
                    "signal_dates": [],
                    "atr_stop": atr_info,
                }
            )

    # 按综合得分降序排名
    results.sort(key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1

    # 技术分析
    tech = _calc_technical_levels(code)

    # 当前是否有买入信号（最新信号日 = end_date）
    current_signals = []
    for strategy in STRATEGY_CATALOG:
        try:
            sql = strategy["sql"]
            if "AND q.code = " not in sql:
                st_anchor = "AND q.name NOT LIKE '%ST%'"
                if st_anchor in sql:
                    sql = sql.replace(
                        st_anchor, f"AND q.code = '{code}'\n  {st_anchor}", 1
                    )
                else:
                    sql = sql + f"\n  AND q.code = '{code}'"
            codes = _extract_signal_codes_on_date(sql, end_date)
            if code in codes:
                current_signals.append(strategy["id"])
        except Exception:
            pass

    return {
        "code": code,
        "name": stock_name,
        "backtest_period": {"start": start_date, "end": end_date, "days": days},
        "strategy_ranking": results,
        "best_strategy": results[0] if results else None,
        "current_signals": current_signals,  # 当前触发信号的策略id列表
        "technical": tech,
    }
