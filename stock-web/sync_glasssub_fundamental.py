"""
修复 glasssub 新增企业的 fundamental 数据同步
使用与 industry.py 相同的字段映射逻辑
"""

import sqlite3
import random
import string
import time
import baostock as bs
import json
from datetime import datetime

DB_PATH = "apps/data-service/stock_data.db"


def _random_user_id():
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choices(chars, k=8))


COMPANIES = [
    {"code": "300219", "name": "鸿利智汇", "market": "sz"},
    {"code": "300456", "name": "赛微电子", "market": "sz"},
    {"code": "300724", "name": "捷佳伟创", "market": "sz"},
    {"code": "688127", "name": "蓝特光学", "market": "sh"},
]


def safe_float(v):
    try:
        return float(v)
    except:
        return None


def sync_fundamental(conn, code, market):
    bs_code = f"{market}.{code}"
    cursor = conn.cursor()

    # 与 industry.py 保持一致：查2024Q4
    rs_profit = bs.query_profit_data(code=bs_code, year=2024, quarter=4)
    profit_row = None
    while rs_profit.error_code == "0" and rs_profit.next():
        profit_row = rs_profit.get_row_data()

    rs_growth = bs.query_growth_data(code=bs_code, year=2024, quarter=4)
    growth_row = None
    while rs_growth.error_code == "0" and rs_growth.next():
        growth_row = rs_growth.get_row_data()

    rs_balance = bs.query_balance_data(code=bs_code, year=2024, quarter=4)
    balance_row = None
    while rs_balance.error_code == "0" and rs_balance.next():
        balance_row = rs_balance.get_row_data()

    if not profit_row:
        print(f"  [WARN] {code} fundamental 无数据")
        return 0

    raw = json.dumps(
        {"profit": profit_row, "growth": growth_row, "balance": balance_row},
        ensure_ascii=False,
    )

    # profit_row: code, pubDate, statDate, roeAvg, npMargin, gpMargin, netProfit, epsTTM, MBRevenue, totalShare, liqaShare
    eps = safe_float(profit_row[6]) if len(profit_row) > 6 else None
    roe = safe_float(profit_row[2]) if len(profit_row) > 2 else None
    gross_margin = safe_float(profit_row[4]) if len(profit_row) > 4 else None
    net_profit = safe_float(profit_row[5]) if len(profit_row) > 5 else None
    report_date = profit_row[0]  # bs_code

    revenue_yoy = (
        safe_float(growth_row[6]) if growth_row and len(growth_row) > 6 else None
    )
    net_profit_yoy = (
        safe_float(growth_row[4]) if growth_row and len(growth_row) > 4 else None
    )

    debt_ratio = (
        safe_float(balance_row[6]) if balance_row and len(balance_row) > 6 else None
    )

    cursor.execute(
        """
        INSERT OR REPLACE INTO stock_fundamental
        (code, report_date, eps, revenue_yoy, net_profit, net_profit_yoy, gross_margin, debt_ratio, raw_json)
        VALUES (?,?,?,?,?,?,?,?,?)
    """,
        (
            code,
            report_date,
            eps,
            revenue_yoy,
            net_profit,
            net_profit_yoy,
            gross_margin,
            debt_ratio,
            raw,
        ),
    )
    conn.commit()
    print(f"  fundamental: OK (eps={eps}, net_profit={net_profit})")
    return 1


def main():
    conn = sqlite3.connect(DB_PATH)
    lg = bs.login(user_id=_random_user_id(), password="123456")
    print(f"baostock: {lg.error_msg}")

    for company in COMPANIES:
        code = company["code"]
        name = company["name"]
        market = company["market"]
        print(f"\n=== {code} {name} ===")
        sync_fundamental(conn, code, market)

    bs.logout()

    print("\n=== 验证 ===")
    cursor = conn.cursor()
    for company in COMPANIES:
        code = company["code"]
        cursor.execute(
            "SELECT code, report_date, eps, net_profit FROM stock_fundamental WHERE code=?",
            (code,),
        )
        row = cursor.fetchone()
        print(f"{code}: {row}")

    conn.close()


if __name__ == "__main__":
    main()
