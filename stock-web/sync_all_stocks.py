#!/usr/bin/env python3
"""
批量同步所有股票的实时数据
"""

import sys

sys.path.append("apps/data-service")

from stock_names import STOCK_NAMES
import requests
import time

print(f"开始同步 {len(STOCK_NAMES)} 支股票...")
print("=" * 80)

success = 0
failed = []

for i, (code, name) in enumerate(STOCK_NAMES.items(), 1):
    try:
        print(f"[{i}/{len(STOCK_NAMES)}] {code} ({name})...", end=" ")

        # Call API to trigger fetch
        resp = requests.get(f"http://localhost:8000/api/quote/{code}", timeout=30)

        if resp.status_code == 200:
            data = resp.json()
            if data.get("price"):
                print(f"✅ {data['price']}")
                success += 1
            else:
                print(f"⚠️  No price")
                failed.append((code, name, "No price"))
        else:
            print(f"❌ HTTP {resp.status_code}")
            failed.append((code, name, f"HTTP {resp.status_code}"))

    except Exception as e:
        print(f"❌ {str(e)[:50]}")
        failed.append((code, name, str(e)[:50]))

    # Rate limiting
    time.sleep(0.5)

print("\n" + "=" * 80)
print(f"完成: {success} 成功, {len(failed)} 失败")

if failed:
    print("\n失败列表:")
    for code, name, error in failed[:20]:
        print(f"  {code} ({name}): {error}")
    if len(failed) > 20:
        print(f"  ... 还有 {len(failed) - 20} 个")
