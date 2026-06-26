import sys
sys.path.insert(0, "apps/data-service")

from stock_names import STOCK_NAMES

new_codes = ["000657", "002594", "301516", "601208", "688218"]

print("需要同步的新股票：")
for code in new_codes:
    name = STOCK_NAMES.get(code, "未知")
    print(f"  {code} - {name}")

print("\n请手动运行: python3 sync_all_stocks.py")
