"""
修复 stock_meta 中 name 错误的股票，重新同步 kline
错误原因：多个代码的 name 被写入了错误公司名，实际代码对应的是另一家公司
"""

import sqlite3, json, random, string, time, baostock as bs
from datetime import datetime, date, timedelta

DB = "apps/data-service/stock_data.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()


def _random_user_id():
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choices(chars, k=8))


NOW = datetime.now().isoformat()


def safe_float(v):
    try:
        return float(v)
    except:
        return 0.0


def to_bs_code(code):
    return f"sh.{code}" if code.startswith("6") else f"sz.{code}"


# 需要修正的 stock_meta name（代码正确，name 写错了）
# 这些代码在 baostock 验证后，实际对应的公司与 DB 中的 name 不符
fixes = [
    # (code, correct_name, market, industry_ids)
    ("300547", "川环科技", "SZ", ["liquidcool"]),  # DB 写了"朗升科技"
    ("600110", "诺德股份", "SH", ["pcb", "coppercable"]),  # DB 写了"中科宇航"
    ("300442", "润泽科技", "SZ", ["idc", "aipower"]),  # DB 写了"中新赛克"
    ("688082", "盛美上海", "SH", ["semieq"]),  # DB 写了"盛合晶微"
    ("688361", "中科飞测", "SH", ["semieq"]),  # DB 写了"纳芯微"
    ("300548", "长芯博创", "SZ", ["optics"]),  # DB 写了"博创科技"
]

# 注意：DB 里已有这些代码的记录，只是 name 不对
# 需要：
# 1. 更新 stock_meta.name 和 stock_quote.name
# 2. 删除旧的 kline 数据（之前同步的是错误公司的数据）
# 3. 重新同步正确公司的 kline/fundamental

lg = bs.login(user_id=_random_user_id(), password="123456")
print(f"baostock: {lg.error_msg}")

for code, correct_name, market, industry_ids in fixes:
    print(f"\n=== 修复 {code} → {correct_name} ===")

    # 查当前状态
    old = cur.execute(
        "SELECT name, industry_ids FROM stock_meta WHERE code=?", (code,)
    ).fetchone()
    print(
        f"  当前DB: name={old[0] if old else 'NOT IN DB'}, ids={old[1] if old else '?'}"
    )

    if old:
        # 合并已有的 industry_ids
        old_ids = json.loads(old[1]) if old[1] else []
        new_ids = list(set(old_ids + industry_ids))
        cur.execute(
            "UPDATE stock_meta SET name=?, industry_ids=?, market=?, updated_at=? WHERE code=?",
            (correct_name, json.dumps(new_ids), market, NOW, code),
        )
        print(f"  [meta] name 修正为 {correct_name}, industry_ids={new_ids}")
    else:
        cur.execute(
            """
            INSERT INTO stock_meta (code, name, market, industry_ids, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """,
            (code, correct_name, market, json.dumps(industry_ids), NOW),
        )
        print(f"  [meta] 新增")

    # 修正 stock_quote name
    cur.execute("UPDATE stock_quote SET name=? WHERE code=?", (correct_name, code))
    print(f"  [quote] name 修正")

    # 删除旧的 kline（可能是错误公司的数据），重新同步
    old_count = cur.execute(
        "SELECT COUNT(*) FROM stock_kline WHERE code=?", (code,)
    ).fetchone()[0]
    cur.execute("DELETE FROM stock_kline WHERE code=?", (code,))
    print(f"  [kline] 删除旧数据 {old_count} 条")

    # 删除旧的 fundamental
    cur.execute("DELETE FROM stock_fundamental WHERE code=?", (code,))

    conn.commit()

    # 重新同步 kline
    bs_code = to_bs_code(code)
    start = (date.today() - timedelta(days=400)).strftime("%Y-%m-%d")
    end = date.today().strftime("%Y-%m-%d")
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
        print(f"  [kline] 重新同步 {len(rows)} 条")
    else:
        print(f"  [kline] 无数据")

    # 重新同步 fundamental
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

    if profit_row:
        raw = json.dumps(
            {"profit": profit_row, "growth": growth_row, "balance": balance_row},
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
                profit_row[0],
                safe_float(profit_row[2]),
                safe_float(growth_row[3]) if growth_row else 0,
                safe_float(profit_row[4]),
                safe_float(growth_row[4]) if growth_row else 0,
                safe_float(profit_row[3]),
                safe_float(balance_row[7]) if balance_row else 0,
                raw,
                NOW,
            ),
        )
        print(f"  [fundamental] 重新同步")

    conn.commit()

bs.logout()
conn.close()
print("\n全部修复完成！")
