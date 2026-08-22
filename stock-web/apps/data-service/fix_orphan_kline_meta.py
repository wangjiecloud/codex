"""
一次性修复脚本：将 stock_kline 中有、stock_meta 中没有的存量股票，
从 baostock 拉取基本信息并补写 stock_meta + stock_quote。

运行方式：
  cd apps/data-service
  python fix_orphan_kline_meta.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from db import SessionLocal, StockMeta, StockQuote
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy import text
from datetime import datetime
import time

# ── 1. 找出孤立 code ──────────────────────────────────────────
db = SessionLocal()
try:
    # stock_kline 中所有合法6位数字 code
    rows = db.execute(
        text(
            "SELECT DISTINCT code FROM stock_kline "
            "WHERE period='daily' AND length(code)=6 AND typeof(code)='text'"
        )
    ).fetchall()
    kline_codes = {r[0] for r in rows if r[0].isdigit()}

    # stock_meta 中已有的 code
    meta_rows = db.execute(text("SELECT code FROM stock_meta")).fetchall()
    meta_codes = {r[0] for r in meta_rows}
finally:
    db.close()

orphan_codes = sorted(kline_codes - meta_codes)
print(f"发现孤立 code（有K线无stock_meta）：{len(orphan_codes)} 只")
if not orphan_codes:
    print("无需修复，退出。")
    sys.exit(0)

# ── 2. 从 baostock 拉取基本信息 ──────────────────────────────
import baostock as bs

lg = bs.login()
if lg.error_code != "0":
    print(f"baostock 登录失败: {lg.error_msg}")
    sys.exit(1)

print("baostock 登录成功，开始拉取基本信息...")

bs_info = {}  # code -> {name, market}
for code in orphan_codes:
    bs_code = f"sh.{code}" if code.startswith(("6", "5")) else f"sz.{code}"
    market = "SH" if code.startswith(("6", "5")) else "SZ"
    try:
        rs = bs.query_stock_basic(code=bs_code)
        if rs.error_code == "0" and rs.next():
            row = rs.get_row_data()
            # fields: code, code_name, ipoDate, outDate, type, status
            name = row[1].strip() if len(row) > 1 else ""
        else:
            name = ""
    except Exception as e:
        print(f"  拉取 {code} 失败: {e}")
        name = ""
    bs_info[code] = {"name": name, "market": market}
    time.sleep(0.05)

bs.logout()
print(f"baostock 信息拉取完成，共 {len(bs_info)} 只")

# ── 3. 写入 stock_meta + stock_quote ─────────────────────────
db = SessionLocal()
success = 0
skipped = 0
failed = 0
try:
    for code, info in bs_info.items():
        name = info["name"]
        market = info["market"]
        try:
            # 补写 stock_meta（on_conflict_do_nothing 保证幂等）
            stmt_meta = (
                sqlite_insert(StockMeta)
                .values(code=code, name=name, market=market, industry_ids="")
                .on_conflict_do_nothing(index_elements=["code"])
            )
            db.execute(stmt_meta)

            # 补写 stock_quote（行情字段全部默认0，等行情同步刷新）
            stmt_quote = (
                sqlite_insert(StockQuote)
                .values(
                    code=code,
                    name=name,
                    price=0.0,
                    change=0.0,
                    change_amt=0.0,
                    open=0.0,
                    prev_close=0.0,
                    high=0.0,
                    low=0.0,
                    volume=0.0,
                    turnover=0.0,
                    market_cap=0.0,
                    pe=0.0,
                    pb=0.0,
                    turnover_rate=0.0,
                    amplitude=0.0,
                )
                .on_conflict_do_nothing(index_elements=["code"])
            )
            db.execute(stmt_quote)
            success += 1
        except Exception as e:
            print(f"  写入 {code} 失败: {e}")
            failed += 1

    db.commit()
finally:
    db.close()

# ── 4. 验证结果 ───────────────────────────────────────────────
db = SessionLocal()
try:
    after_meta = db.execute(text("SELECT COUNT(*) FROM stock_meta")).scalar()
    after_quote = db.execute(text("SELECT COUNT(*) FROM stock_quote")).scalar()
finally:
    db.close()

print(f"\n修复完成：成功={success}，失败={failed}")
print(f"当前 stock_meta 总数: {after_meta}")
print(f"当前 stock_quote 总数: {after_quote}")
