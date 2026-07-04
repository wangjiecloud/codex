"""
同步 glasssub 新增企业数据：
- 300219 鸿利智汇（新增）
- 300456 赛微电子（新增）
- 300724 捷佳伟创（修正name，已有kline需补充）
- 688127 蓝特光学（新增）
"""
import sqlite3
import baostock as bs
import json
from datetime import datetime, timedelta

DB_PATH = "apps/data-service/stock_data.db"

COMPANIES = [
    {"code": "300219", "name": "鸿利智汇", "market": "sz"},
    {"code": "300456", "name": "赛微电子", "market": "sz"},
    {"code": "300724", "name": "捷佳伟创", "market": "sz"},
    {"code": "688127", "name": "蓝特光学", "market": "sh"},
]

def get_baostock_code(code, market):
    return f"{market}.{code}"

def sync_klines(conn, code, market, bs_logged_in=True):
    bs_code = get_baostock_code(code, market)
    end_date = datetime.today().strftime("%Y-%m-%d")
    start_date = (datetime.today() - timedelta(days=600)).strftime("%Y-%m-%d")
    
    rs = bs.query_history_k_data_plus(
        bs_code,
        "date,open,high,low,close,volume,amount,turn,pctChg",
        start_date=start_date,
        end_date=end_date,
        frequency="d",
        adjustflag="2"
    )
    
    rows = []
    while (rs.error_code == '0') and rs.next():
        row = rs.get_row_data()
        rows.append(row)
    
    if not rows:
        print(f"  [WARN] {code} 无kline数据")
        return 0
    
    cursor = conn.cursor()
    cursor.execute("DELETE FROM stock_kline WHERE code=? AND period='daily'", (code,))
    
    inserted = 0
    for row in rows:
        trade_date, open_, high, low, close, volume, turnover, turn, pct_chg = row
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO stock_kline
                (code, period, trade_date, open, high, low, close, volume, turnover, change_pct)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (code, 'daily', trade_date,
                  float(open_) if open_ else 0,
                  float(high) if high else 0,
                  float(low) if low else 0,
                  float(close) if close else 0,
                  float(volume) if volume else 0,
                  float(turnover) if turnover else 0,
                  float(pct_chg) if pct_chg else 0))
            inserted += 1
        except Exception as e:
            print(f"  [ERR] kline row {row}: {e}")
    
    conn.commit()
    print(f"  kline: {inserted} 条")
    return inserted

def sync_fundamental(conn, code, market):
    bs_code = get_baostock_code(code, market)
    end_year = datetime.today().year
    
    cursor = conn.cursor()
    inserted = 0
    
    for year in range(end_year - 2, end_year + 1):
        for quarter in [1, 2, 3, 4]:
            rs = bs.query_profit_data(code=bs_code, year=year, quarter=quarter)
            rows = []
            while (rs.error_code == '0') and rs.next():
                rows.append(rs.get_row_data())
            
            if rows:
                row = rows[0]
                try:
                    report_date = f"{year}Q{quarter}"
                    cursor.execute("""
                        INSERT OR REPLACE INTO stock_fundamental
                        (code, report_date, eps, revenue_yoy, net_profit, net_profit_yoy, gross_margin, debt_ratio, raw_json)
                        VALUES (?,?,?,?,?,?,?,?,?)
                    """, (
                        code, report_date,
                        float(row[2]) if len(row) > 2 and row[2] else 0,
                        0, 0, 0, 0, 0,
                        json.dumps(row)
                    ))
                    inserted += 1
                except Exception as e:
                    print(f"  [ERR] fundamental {year}Q{quarter}: {e}")
    
    conn.commit()
    print(f"  fundamental: {inserted} 条")
    return inserted

def ensure_stock_meta(conn, code, name, market):
    cursor = conn.cursor()
    cursor.execute("SELECT code, industry_ids FROM stock_meta WHERE code=?", (code,))
    row = cursor.fetchone()
    if row:
        # 已存在，更新name和market，保留industry_ids
        cursor.execute("UPDATE stock_meta SET name=?, market=? WHERE code=?", (name, market, code))
        print(f"  stock_meta: 已存在，更新name/market")
    else:
        cursor.execute("""
            INSERT INTO stock_meta (code, name, market, industry_ids)
            VALUES (?, ?, ?, ?)
        """, (code, name, market, json.dumps(["glasssub"])))
        print(f"  stock_meta: 新增")
    conn.commit()

def ensure_stock_quote(conn, code, name):
    cursor = conn.cursor()
    cursor.execute("SELECT code FROM stock_quote WHERE code=?", (code,))
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO stock_quote
            (code, name, price, change, change_amt, high, low, open, prev_close,
             volume, turnover, market_cap, pe, pb, turnover_rate, amplitude)
            VALUES (?,?,0,0,0,0,0,0,0,0,0,0,0,0,0,0)
        """, (code, name))
        conn.commit()
        print(f"  stock_quote: 新增默认值")
    else:
        print(f"  stock_quote: 已存在")

def main():
    conn = sqlite3.connect(DB_PATH)
    lg = bs.login()
    print(f"baostock login: {lg.error_msg}")
    
    for company in COMPANIES:
        code = company["code"]
        name = company["name"]
        market = company["market"]
        print(f"\n=== {code} {name} ===")
        
        ensure_stock_meta(conn, code, name, market)
        ensure_stock_quote(conn, code, name)
        sync_klines(conn, code, market)
        sync_fundamental(conn, code, market)
    
    bs.logout()
    
    # 验证结果
    print("\n=== 验证 ===")
    cursor = conn.cursor()
    for company in COMPANIES:
        code = company["code"]
        cursor.execute("SELECT code, name, industry_ids FROM stock_meta WHERE code=?", (code,))
        meta = cursor.fetchone()
        cursor.execute("SELECT COUNT(*) FROM stock_kline WHERE code=?", (code,))
        kline_cnt = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM stock_fundamental WHERE code=?", (code,))
        fund_cnt = cursor.fetchone()[0]
        print(f"{code}: meta={meta}, kline={kline_cnt}, fundamental={fund_cnt}")
    
    conn.close()

if __name__ == "__main__":
    main()
