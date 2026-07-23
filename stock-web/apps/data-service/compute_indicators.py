#!/usr/bin/env python3
"""
全量计算 stock_indicator 表（KDJ + MA + MACD + RSI + BOLL），
基于 stock_kline 数据，写入 stock_indicator。
用法：python compute_indicators.py [--code 600519]
"""

import sqlite3
import argparse
import sys
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "stock_data.db")


def calc_indicators(klines: list[tuple]) -> list[dict]:
    """
    klines: [(trade_date, open, high, low, close, volume), ...] 按日期升序
    返回每行的 {trade_date, kdj_k, kdj_d, kdj_j, ma5, ma10, ma20, ma60,
    macd_diff, macd_dea, macd_hist, rsi14, boll_upper, boll_middle, boll_lower}
    """
    n = len(klines)
    if n == 0:
        return []

    results = []
    K, D = 50.0, 50.0  # 标准初始值

    closes = [row[4] for row in klines]
    ema12 = None
    ema26 = None
    dea = None

    for i, (trade_date, o, high, low, close, vol) in enumerate(klines):
        # RSV: 9日最低/最高
        lo_idx = max(0, i - 8)
        lo9 = min(row[3] for row in klines[lo_idx : i + 1])
        hi9 = max(row[2] for row in klines[lo_idx : i + 1])
        if hi9 != lo9:
            rsv = (close - lo9) / (hi9 - lo9) * 100
        else:
            rsv = 50.0

        # EMA 平滑（同花顺标准：K = 2/3*K_prev + 1/3*RSV，D = 2/3*D_prev + 1/3*K）
        K = K * 2 / 3 + rsv * 1 / 3
        D = D * 2 / 3 + K * 1 / 3
        J = 3 * K - 2 * D

        # MA
        def ma(n_days):
            start = max(0, i - n_days + 1)
            vals = closes[start : i + 1]
            return sum(vals) / len(vals)

        if ema12 is None:
            ema12 = close
            ema26 = close
            diff = 0.0
            dea = 0.0
        else:
            ema12 = close * (2 / 13) + ema12 * (11 / 13)
            ema26 = close * (2 / 27) + ema26 * (25 / 27)
            diff = ema12 - ema26
            dea = diff * (2 / 10) + dea * (8 / 10)
        hist = (diff - dea) * 2

        gain = 0.0
        loss = 0.0
        rsi_start = max(1, i - 14 + 1)
        for j in range(rsi_start, i + 1):
            delta = closes[j] - closes[j - 1]
            if delta >= 0:
                gain += delta
            else:
                loss += -delta
        rsi_len = i - rsi_start + 1
        avg_gain = gain / rsi_len if rsi_len > 0 else 0.0
        avg_loss = loss / rsi_len if rsi_len > 0 else 0.0
        if avg_loss == 0:
            rsi14 = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi14 = 100 - 100 / (1 + rs)

        boll_start = max(0, i - 20 + 1)
        boll_vals = closes[boll_start : i + 1]
        boll_middle = sum(boll_vals) / len(boll_vals)
        variance = sum((v - boll_middle) ** 2 for v in boll_vals) / len(boll_vals)
        std = variance**0.5
        boll_upper = boll_middle + 2 * std
        boll_lower = boll_middle - 2 * std

        results.append(
            {
                "trade_date": trade_date,
                "kdj_k": round(K, 4),
                "kdj_d": round(D, 4),
                "kdj_j": round(J, 4),
                "ma5": round(ma(5), 4),
                "ma10": round(ma(10), 4),
                "ma20": round(ma(20), 4),
                "ma60": round(ma(60), 4),
                "macd_diff": round(diff, 4),
                "macd_dea": round(dea, 4),
                "macd_hist": round(hist, 4),
                "rsi14": round(rsi14, 4),
                "boll_upper": round(boll_upper, 4),
                "boll_middle": round(boll_middle, 4),
                "boll_lower": round(boll_lower, 4),
            }
        )
    return results


def compute_for_code(code: str, period: str = "daily") -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT trade_date, open, high, low, close, volume "
            "FROM stock_kline WHERE code=? AND period=? ORDER BY trade_date ASC",
            (code, period),
        )
        rows = cur.fetchall()
        if not rows:
            return 0

        indicators = calc_indicators(rows)
        batch = []
        for ind in indicators:
            batch.append(
                (
                    code,
                    ind["trade_date"],
                    period,
                    ind["kdj_k"],
                    ind["kdj_d"],
                    ind["kdj_j"],
                    ind["ma5"],
                    ind["ma10"],
                    ind["ma20"],
                    ind["ma60"],
                    ind["macd_diff"],
                    ind["macd_dea"],
                    ind["macd_hist"],
                    ind["rsi14"],
                    ind["boll_upper"],
                    ind["boll_middle"],
                    ind["boll_lower"],
                )
            )
        cur.executemany(
            """INSERT OR REPLACE INTO stock_indicator
               (code, trade_date, period, kdj_k, kdj_d, kdj_j, ma5, ma10, ma20, ma60,
                macd_diff, macd_dea, macd_hist, rsi14, boll_upper, boll_middle, boll_lower)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            batch,
        )
        conn.commit()
        return len(batch)
    finally:
        conn.close()


def compute_for_codes(codes: list[str], period: str = "daily"):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    total = len(codes)
    batch = []
    BATCH_SIZE = 500

    for idx, code in enumerate(codes):
        cur.execute(
            "SELECT trade_date, open, high, low, close, volume "
            "FROM stock_kline WHERE code=? AND period=? ORDER BY trade_date ASC",
            (code, period),
        )
        rows = cur.fetchall()
        if not rows:
            continue

        indicators = calc_indicators(rows)
        for ind in indicators:
            batch.append(
                (
                    code,
                    ind["trade_date"],
                    period,
                    ind["kdj_k"],
                    ind["kdj_d"],
                    ind["kdj_j"],
                    ind["ma5"],
                    ind["ma10"],
                    ind["ma20"],
                    ind["ma60"],
                    ind["macd_diff"],
                    ind["macd_dea"],
                    ind["macd_hist"],
                    ind["rsi14"],
                    ind["boll_upper"],
                    ind["boll_middle"],
                    ind["boll_lower"],
                )
            )

        if len(batch) >= BATCH_SIZE or idx == total - 1:
            cur.executemany(
                """INSERT OR REPLACE INTO stock_indicator
                   (code, trade_date, period, kdj_k, kdj_d, kdj_j, ma5, ma10, ma20, ma60,
                    macd_diff, macd_dea, macd_hist, rsi14, boll_upper, boll_middle, boll_lower)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                batch,
            )
            conn.commit()
            batch = []

        if (idx + 1) % 200 == 0 or idx == total - 1:
            print(f"  [{idx + 1}/{total}] {code} done, {len(rows)} rows")

    conn.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--code", help="只计算指定股票代码")
    parser.add_argument("--period", default="daily")
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    if args.code:
        codes = [args.code]
    else:
        cur.execute(
            "SELECT DISTINCT code FROM stock_kline WHERE period=?", (args.period,)
        )
        codes = [row[0] for row in cur.fetchall()]
    conn.close()

    print(f"开始计算 {len(codes)} 只股票的 {args.period} 技术指标...")
    compute_for_codes(codes, args.period)
    print("完成！")


if __name__ == "__main__":
    main()
