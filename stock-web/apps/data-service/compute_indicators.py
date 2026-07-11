#!/usr/bin/env python3
"""
全量计算 stock_indicator 表（标准 KDJ + MA），
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
    返回每行的 {trade_date, kdj_k, kdj_d, kdj_j, ma5, ma10, ma20, ma60}
    """
    n = len(klines)
    if n == 0:
        return []

    results = []
    K, D = 50.0, 50.0  # 标准初始值

    closes = [row[4] for row in klines]

    for i, (trade_date, o, high, low, close, vol) in enumerate(klines):
        # RSV: 9日最低/最高
        lo_idx = max(0, i - 8)
        lo9 = min(row[3] for row in klines[lo_idx:i+1])
        hi9 = max(row[2] for row in klines[lo_idx:i+1])
        if hi9 != lo9:
            rsv = (close - lo9) / (hi9 - lo9) * 100
        else:
            rsv = 50.0

        # EMA 平滑（同花顺标准：K = 2/3*K_prev + 1/3*RSV，D = 2/3*D_prev + 1/3*K）
        K = K * 2/3 + rsv * 1/3
        D = D * 2/3 + K * 1/3
        J = 3*K - 2*D

        # MA
        def ma(n_days):
            start = max(0, i - n_days + 1)
            vals = closes[start:i+1]
            return sum(vals) / len(vals)

        results.append({
            "trade_date": trade_date,
            "kdj_k": round(K, 4),
            "kdj_d": round(D, 4),
            "kdj_j": round(J, 4),
            "ma5":  round(ma(5),  4),
            "ma10": round(ma(10), 4),
            "ma20": round(ma(20), 4),
            "ma60": round(ma(60), 4),
        })
    return results


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
            (code, period)
        )
        rows = cur.fetchall()
        if not rows:
            continue

        indicators = calc_indicators(rows)
        for ind in indicators:
            batch.append((
                code, ind["trade_date"], period,
                ind["kdj_k"], ind["kdj_d"], ind["kdj_j"],
                ind["ma5"], ind["ma10"], ind["ma20"], ind["ma60"],
            ))

        if len(batch) >= BATCH_SIZE or idx == total - 1:
            cur.executemany(
                """INSERT OR REPLACE INTO stock_indicator
                   (code, trade_date, period, kdj_k, kdj_d, kdj_j, ma5, ma10, ma20, ma60)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                batch
            )
            conn.commit()
            batch = []

        if (idx + 1) % 200 == 0 or idx == total - 1:
            print(f"  [{idx+1}/{total}] {code} done, {len(rows)} rows")

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
        cur.execute("SELECT DISTINCT code FROM stock_kline WHERE period=?", (args.period,))
        codes = [row[0] for row in cur.fetchall()]
    conn.close()

    print(f"开始计算 {len(codes)} 只股票的 {args.period} 技术指标...")
    compute_for_codes(codes, args.period)
    print("完成！")


if __name__ == "__main__":
    main()