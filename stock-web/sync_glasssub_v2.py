"""
同步 glasssub 产业图谱优化所需的新企业数据
需新同步5家：帝尔激光/德龙激光/芯碁微装/汇成真空/阿石创
"""

import sqlite3
import random
import string
import time
import baostock as bs
import json
from datetime import datetime, timedelta

DB_PATH = "apps/data-service/stock_data.db"


def _random_user_id():
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choices(chars, k=8))


NEW_COMPANIES = [
    {"code": "300776", "name": "帝尔激光", "market": "sz"},
    {"code": "688170", "name": "德龙激光", "market": "sh"},
    {"code": "688630", "name": "芯碁微装", "market": "sh"},
    {"code": "301392", "name": "汇成真空", "market": "sz"},
    {"code": "300706", "name": "阿石创", "market": "sz"},
]


def safe_float(v):
    try:
        return float(v)
    except:
        return None


def sync_klines(conn, code, market):
    bs_code = f"{market}.{code}"
    end_date = datetime.today().strftime("%Y-%m-%d")
    start_date = (datetime.today() - timedelta(days=600)).strftime("%Y-%m-%d")
    rs = bs.query_history_k_data_plus(
        bs_code,
        "date,open,high,low,close,volume,amount,turn,pctChg",
        start_date=start_date,
        end_date=end_date,
        frequency="d",
        adjustflag="2",
    )
    rows = []
    while (rs.error_code == "0") and rs.next():
        rows.append(rs.get_row_data())
    if not rows:
        print(f"  [WARN] {code} 无kline数据")
        return 0
    cursor = conn.cursor()
    cursor.execute("DELETE FROM stock_kline WHERE code=? AND period='daily'", (code,))
    inserted = 0
    for row in rows:
        trade_date, open_, high, low, close, volume, turnover, turn, pct_chg = row
        try:
            cursor.execute(
                """
                INSERT OR REPLACE INTO stock_kline
                (code, period, trade_date, open, high, low, close, volume, turnover, change_pct)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """,
                (
                    code,
                    "daily",
                    trade_date,
                    safe_float(open_) or 0,
                    safe_float(high) or 0,
                    safe_float(low) or 0,
                    safe_float(close) or 0,
                    safe_float(volume) or 0,
                    safe_float(turnover) or 0,
                    safe_float(pct_chg) or 0,
                ),
            )
            inserted += 1
        except Exception as e:
            print(f"  [ERR] kline row: {e}")
    conn.commit()
    print(f"  kline: {inserted} 条")
    return inserted


def sync_fundamental(conn, code, market):
    bs_code = f"{market}.{code}"
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
        {"profit": profit_row, "growth": growth_row, "balance": balance_row}
    )
    eps = safe_float(profit_row[6]) if len(profit_row) > 6 else None
    roe = safe_float(profit_row[2]) if len(profit_row) > 2 else None
    gross_margin = safe_float(profit_row[4]) if len(profit_row) > 4 else None
    net_profit = safe_float(profit_row[5]) if len(profit_row) > 5 else None
    report_date = profit_row[0]
    revenue_yoy = (
        safe_float(growth_row[6]) if growth_row and len(growth_row) > 6 else None
    )
    net_profit_yoy = (
        safe_float(growth_row[4]) if growth_row and len(growth_row) > 4 else None
    )
    debt_ratio = (
        safe_float(balance_row[6]) if balance_row and len(balance_row) > 6 else None
    )
    cursor = conn.cursor()
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
    print(f"  fundamental: OK")
    return 1


def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    lg = bs.login(user_id=_random_user_id(), password="123456")
    print(f"baostock: {lg.error_msg}\n")

    for c in NEW_COMPANIES:
        code, name, market = c["code"], c["name"], c["market"]
        print(f"=== {code} {name} ===")
        # stock_meta
        cursor.execute("SELECT code FROM stock_meta WHERE code=?", (code,))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO stock_meta (code, name, market, industry_ids) VALUES (?,?,?,?)",
                (code, name, market, json.dumps(["glasssub"])),
            )
        else:
            cursor.execute(
                "UPDATE stock_meta SET name=?, market=? WHERE code=?",
                (name, market, code),
            )
        conn.commit()
        # stock_quote
        cursor.execute("SELECT code FROM stock_quote WHERE code=?", (code,))
        if not cursor.fetchone():
            cursor.execute(
                """INSERT INTO stock_quote
                (code,name,price,change,change_amt,high,low,open,prev_close,volume,turnover,market_cap,pe,pb,turnover_rate,amplitude)
                VALUES (?,?,0,0,0,0,0,0,0,0,0,0,0,0,0,0)""",
                (code, name),
            )
            conn.commit()
        sync_klines(conn, code, market)
        sync_fundamental(conn, code, market)

    bs.logout()
    print("\n完成")


if __name__ == "__main__":
    main()
