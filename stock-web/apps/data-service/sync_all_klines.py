import sys, time

sys.path.insert(0, ".")

from bs_session import get_bs, reset_bs
from db import SessionLocal, StockKline, StockMeta
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import date, timedelta, datetime


def to_bs_code(code):
    return f"sh.{code}" if code.startswith(("6", "5")) else f"sz.{code}"


def safe_float(v, d=0.0):
    try:
        x = float(str(v).strip())
        return x if x == x else d
    except:
        return d


bs = get_bs()
db = SessionLocal()

a_shares = [
    row[0] for row in db.query(StockMeta.code).filter(StockMeta.market == "A股").all()
]

start = (date.today() - timedelta(days=400)).strftime("%Y-%m-%d")
end = date.today().strftime("%Y-%m-%d")
fields = "date,code,open,high,low,close,volume,amount,turn,pctChg"

ok, fail = 0, 0
total = len(a_shares)
for i, code in enumerate(a_shares, 1):
    try:
        rs = bs.query_history_k_data_plus(
            to_bs_code(code),
            fields,
            start_date=start,
            end_date=end,
            frequency="d",
            adjustflag="2",
        )
        saved = 0
        while rs.error_code == "0" and rs.next():
            r = rs.get_row_data()
            stmt = sqlite_insert(StockKline).values(
                code=code,
                period="daily",
                trade_date=r[0],
                open=safe_float(r[2]),
                high=safe_float(r[3]),
                low=safe_float(r[4]),
                close=safe_float(r[5]),
                volume=int(safe_float(r[6])),
                turnover=safe_float(r[7]),
                change_pct=safe_float(r[9]),
                updated_at=datetime.utcnow(),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["code", "period", "trade_date"],
                set_={
                    "close": stmt.excluded.close,
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "change_pct": stmt.excluded.change_pct,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
            saved += 1
        db.commit()
        ok += 1
        print(f"[{i}/{total}] {code} ok ({saved} bars)")
    except Exception as e:
        fail += 1
        print(f"[{i}/{total}] {code} FAIL: {e}")
        reset_bs()
        bs = get_bs()
    time.sleep(0.1)

db.close()
bs.logout()
print(f"\nDone: {ok} ok, {fail} fail")
