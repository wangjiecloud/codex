#!/usr/bin/env python3
"""
验证所有股票代码的正确性
"""

import sys
import re

# Read frontend file
with open("apps/web/app/industry/[name]/page.tsx", "r", encoding="utf-8") as f:
    frontend_content = f.read()

# Extract all code-name pairs from frontend
frontend_pattern = r'code: "(\d+)",\s*name: "([^"]+)"'
frontend_stocks = re.findall(frontend_pattern, frontend_content)

# Read stock_names.py
sys.path.append("apps/data-service")
from stock_names import STOCK_NAMES

print("=" * 80)
print("股票代码验证报告")
print("=" * 80)

# Check for mismatches
mismatches = []
frontend_dict = {}

for code, name in frontend_stocks:
    if code in frontend_dict and frontend_dict[code] != name:
        print(f"⚠️  前端重复代码: {code} - {frontend_dict[code]} vs {name}")
    frontend_dict[code] = name

print(f"\n前端股票总数: {len(frontend_stocks)} (唯一代码: {len(frontend_dict)})")
print(f"stock_names.py总数: {len(STOCK_NAMES)}")

# Compare
print("\n" + "=" * 80)
print("代码不一致检查")
print("=" * 80)

for code, frontend_name in frontend_dict.items():
    if code in STOCK_NAMES:
        backend_name = STOCK_NAMES[code]
        if frontend_name != backend_name:
            mismatches.append((code, frontend_name, backend_name))
            print(f"❌ {code}:")
            print(f"   前端: {frontend_name}")
            print(f"   后端: {backend_name}")
    else:
        print(f"⚠️  {code}: {frontend_name} - 仅在前端存在")

# Check backend-only stocks
print("\n" + "=" * 80)
print("仅在后端存在的股票")
print("=" * 80)

backend_only = []
for code, name in STOCK_NAMES.items():
    if code not in frontend_dict:
        backend_only.append((code, name))
        print(f"⚠️  {code}: {name}")

print("\n" + "=" * 80)
print("总结")
print("=" * 80)
print(f"名称不匹配: {len(mismatches)}")
print(f"仅前端: {len([c for c in frontend_dict if c not in STOCK_NAMES])}")
print(f"仅后端: {len(backend_only)}")

if mismatches:
    print("\n建议修复:")
    for code, fe_name, be_name in mismatches[:10]:
        print(f"  {code}: '{fe_name}' → '{be_name}'")
