"""
同步14家新企业数据：stock_meta / stock_quote / stock_kline / stock_fundamental
按顺序执行，baostock不支持多线程
"""

import sys, os

sys.path.insert(0, os.path.dirname(__file__))

import sqlite3
import json
import random
import string
import time
import baostock as bs
from datetime import datetime, date, timedelta

DB = "apps/data-service/stock_data.db"


def _random_user_id():
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choices(chars, k=8))


# 14家待同步企业（code: (name, market, 目标产业)）
NEW_COMPANIES = {
    "300857": ("协创数据", "SZ", ["idc"]),
    "300990": ("同飞股份", "SZ", ["liquidcool"]),
    "688205": ("德科立", "SH", ["optics"]),
    "300236": ("上海新阳", "SZ", ["semieq"]),
    "688123": ("聚辰股份", "SH", ["memory"]),
    "688195": ("腾景科技", "SH", ["optics"]),
    "301165": ("锐捷网络", "SZ", ["aiserver"]),
    "300274": ("阳光电源", "SZ", ["aipower"]),
    "301396": ("宏景科技", "SZ", ["semieq"]),
    "301150": ("中一科技", "SZ", ["pcb"]),
    "301526": ("国际复材", "SZ", ["pcb"]),
    "301389": ("隆扬电子", "SZ", ["semieq"]),
    "688668": ("鼎通科技", "SH", ["pcb"]),
    "300757": ("罗博特科", "SZ", ["semieq"]),
}


def to_bs_code(code: str) -> str:
    if code.startswith("6"):
        return f"sh.{code}"
    return f"sz.{code}"


def safe_float(v):
    try:
        return float(v)
    except:
        return 0.0


def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    NOW = datetime.now().isoformat()

    lg = bs.login(user_id=_random_user_id(), password="123456")
    print(f"baostock login: {lg.error_msg}")

    for code, (name, market, industry_ids) in NEW_COMPANIES.items():
        print(f"\n{'=' * 50}")
        print(f"处理: {code} {name}")

        # 1. 写入 stock_meta（如果不存在）
        existing = cur.execute(
            "SELECT code FROM stock_meta WHERE code=?", (code,)
        ).fetchone()
        if not existing:
            cur.execute(
                """
                INSERT INTO stock_meta (code, name, market, industry_ids, updated_at)
                VALUES (?, ?, ?, ?, ?)
            """,
                (code, name, market, json.dumps(industry_ids), NOW),
            )
            print(f"  [meta] 新增 {code} {name}")
        else:
            # 更新 industry_ids
            old = json.loads(
                cur.execute(
                    "SELECT industry_ids FROM stock_meta WHERE code=?", (code,)
                ).fetchone()[0]
                or "[]"
            )
            new_ids = list(set(old + industry_ids))
            cur.execute(
                "UPDATE stock_meta SET industry_ids=? WHERE code=?",
                (json.dumps(new_ids), code),
            )
            print(f"  [meta] 更新 industry_ids: {new_ids}")

        # 2. 写入 stock_quote 默认值（如果不存在）
        qrow = cur.execute(
            "SELECT code FROM stock_quote WHERE code=?", (code,)
        ).fetchone()
        if not qrow:
            cur.execute(
                """
                INSERT INTO stock_quote (code, name, price, change, change_amt,
                    high, low, open, prev_close, volume, turnover,
                    market_cap, pe, pb, turnover_rate, amplitude, updated_at)
                VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?)
            """,
                (code, name, NOW),
            )
            print(f"  [quote] 写入默认值")

        conn.commit()

        # 3. 同步 K线
        bs_code = to_bs_code(code)
        kline_count = cur.execute(
            "SELECT COUNT(*) FROM stock_kline WHERE code=?", (code,)
        ).fetchone()[0]
        if kline_count < 100:
            start = (date.today() - timedelta(days=400)).strftime("%Y-%m-%d")
            end = date.today().strftime("%Y-%m-%d")
            time.sleep(0.3)
            rs = bs.query_history_k_data_plus(
                bs_code,
                "date,code,open,high,low,close,volume,amount,turn,pctChg",
                start_date=start,
                end_date=end,
                frequency="d",
                adjustflag="2",
            )
            rows = []
            while rs.error_code == "0" and rs.next():
                r = rs.get_row_data()
                if r and len(r) >= 10:
                    rows.append(r)

            if rows:
                for r in rows:
                    cur.execute(
                        """
                        INSERT OR REPLACE INTO stock_kline
                        (code, period, trade_date, open, high, low, close, volume, turnover, change_pct, updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)
                    """,
                        (
                            code,
                            "daily",
                            r[0],
                            round(safe_float(r[2]), 4),
                            round(safe_float(r[3]), 4),
                            round(safe_float(r[4]), 4),
                            round(safe_float(r[5]), 4),
                            int(safe_float(r[6])),
                            safe_float(r[7]),
                            round(safe_float(r[9]), 4),
                            NOW,
                        ),
                    )
                conn.commit()
                print(f"  [kline] {len(rows)} 条K线已同步")
            else:
                print(f"  [kline] 无数据（可能代码有误）")
        else:
            print(f"  [kline] 已有 {kline_count} 条，跳过")

        # 4. 同步 fundamental
        fund_row = cur.execute(
            "SELECT code FROM stock_fundamental WHERE code=?", (code,)
        ).fetchone()
        if not fund_row:
            time.sleep(0.3)
            rs_profit = bs.query_profit_data(code=bs_code, year=2024, quarter=4)
            profit_row = None
            while rs_profit.error_code == "0" and rs_profit.next():
                profit_row = rs_profit.get_row_data()

            time.sleep(0.3)
            rs_growth = bs.query_growth_data(code=bs_code, year=2024, quarter=4)
            growth_row = None
            while rs_growth.error_code == "0" and rs_growth.next():
                growth_row = rs_growth.get_row_data()

            time.sleep(0.3)
            rs_balance = bs.query_balance_data(code=bs_code, year=2024, quarter=4)
            balance_row = None
            while rs_balance.error_code == "0" and rs_balance.next():
                balance_row = rs_balance.get_row_data()

            if profit_row:
                raw = json.dumps(
                    {
                        "profit": profit_row,
                        "growth": growth_row,
                        "balance": balance_row,
                    },
                    ensure_ascii=False,
                )
                cur.execute(
                    """
                    INSERT OR REPLACE INTO stock_fundamental
                    (code, report_date, eps, revenue_yoy, net_profit, net_profit_yoy,
                     gross_margin, debt_ratio, raw_json, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                """,
                    (
                        code,
                        profit_row[0] if profit_row else bs_code,
                        safe_float(profit_row[2]) if profit_row else 0,
                        safe_float(growth_row[3]) if growth_row else 0,
                        safe_float(profit_row[4]) if profit_row else 0,
                        safe_float(growth_row[4]) if growth_row else 0,
                        safe_float(profit_row[3]) if profit_row else 0,
                        safe_float(balance_row[7]) if balance_row else 0,
                        raw,
                        NOW,
                    ),
                )
                conn.commit()
                print(f"  [fundamental] 已同步")
            else:
                print(f"  [fundamental] 无数据")
        else:
            print(f"  [fundamental] 已有，跳过")

    bs.logout()
    conn.close()
    print("\n\n全部同步完成！")


if __name__ == "__main__":
    main()
