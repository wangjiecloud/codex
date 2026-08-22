import sys

sys.path.insert(0, ".")
from bs_session import get_bs

bs = get_bs()

# 测试510300不同年份
for year in ["2026", "2025", "2024", "2023", "2022", "2021"]:
    rs = bs.query_history_k_data_plus(
        "sh.510300",
        "date,close",
        start_date=year + "-01-01",
        end_date=year + "-12-31",
        frequency="d",
        adjustflag="2",
    )
    c = 0
    first = None
    while rs.next():
        r = rs.get_row_data()
        c += 1
        if c == 1:
            first = r
    print(f"510300 {year}: {c}条, err={rs.error_code}, first={first}")

# 全量拉取510300从2012年
rs2 = bs.query_history_k_data_plus(
    "sh.510300",
    "date,close",
    start_date="2012-05-28",
    end_date="2026-07-31",
    frequency="d",
    adjustflag="2",
)
c2 = 0
first2 = None
while rs2.next():
    r = rs2.get_row_data()
    c2 += 1
    if c2 == 1:
        first2 = r
print(f"510300 全量: {c2}条, err={rs2.error_code}, first={first2}")
