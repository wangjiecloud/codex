"""
Backfill turn_rate for all existing stock_kline rows by re-fetching from baostock.
Only updates rows where turn_rate IS NULL or turn_rate = 0.
"""

import sqlite3
import baostock as bs
from datetime import date, timedelta

DB_PATH = "stock_data.db"


def _to_bs_code(code: str) -> str:
    if code.startswith("6") or code.startswith("5"):
        return f"sh.{code}"
    return f"sz.{code}"


def _safe_float(val, default=0.0) -> float:
    try:
        v = float(str(val).strip())
        return v if v == v else default
    except Exception:
        return default


def backfill_turn_rate():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute(
        "SELECT DISTINCT code FROM stock_kline WHERE turn_rate IS NULL OR turn_rate = 0"
    )
    codes = [r[0] for r in cur.fetchall()]
    print(f"Codes needing backfill: {len(codes)}")

    lg = bs.login()
    if lg.error_code != "0":
        print(f"baostock login failed: {lg.error_msg}")
        conn.close()
        return

    start = (date.today() - timedelta(days=800)).strftime("%Y-%m-%d")
    end = date.today().strftime("%Y-%m-%d")
    fields = "date,code,turn,pctChg"

    updated_total = 0
    for i, code in enumerate(codes):
        bs_code = _to_bs_code(code)
        for period_key, freq in [("daily", "d"), ("weekly", "w"), ("monthly", "m")]:
            rs = bs.query_history_k_data_plus(
                bs_code,
                fields,
                start_date=start,
                end_date=end,
                frequency=freq,
                adjustflag="2",
            )
            rows_updated = 0
            while rs.error_code == "0" and rs.next():
                r = rs.get_row_data()
                trade_date = r[0]
                turn = _safe_float(r[2])
                if turn == 0:
                    continue
                cur.execute(
                    "UPDATE stock_kline SET turn_rate = ? WHERE code = ? AND period = ? AND trade_date = ?",
                    (turn, code, period_key, trade_date),
                )
                rows_updated += cur.rowcount
            updated_total += rows_updated

        if (i + 1) % 20 == 0 or (i + 1) == len(codes):
            conn.commit()
            print(
                f"[{i + 1}/{len(codes)}] {code} done, total updated so far: {updated_total}"
            )

    conn.commit()
    bs.logout()
    conn.close()
    print(f"\nBackfill complete. Total rows updated: {updated_total}")


if __name__ == "__main__":
    backfill_turn_rate()
