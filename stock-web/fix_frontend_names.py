#!/usr/bin/env python3
"""
自动修复前端stock names使其与backend一致
"""

import re
import sys

sys.path.append("apps/data-service")
from stock_names import STOCK_NAMES

# Read frontend file
with open("apps/web/app/industry/[name]/page.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Pattern to match: code: "123456", name: "股票名"
pattern = r'(code: "(\d+)",\s*name: )"([^"]+)"'


def replacer(match):
    prefix = match.group(1)  # 'code: "123456", name: '
    code = match.group(2)  # '123456'
    old_name = match.group(3)  # '旧名字'

    if code in STOCK_NAMES:
        correct_name = STOCK_NAMES[code]
        if old_name != correct_name:
            print(f"  {code}: '{old_name}' → '{correct_name}'")
            return f'{prefix}"{correct_name}"'

    return match.group(0)  # No change


print("修复前端股票名称...")
print("=" * 80)

new_content = re.sub(pattern, replacer, content)

# Write back
with open("apps/web/app/industry/[name]/page.tsx", "w", encoding="utf-8") as f:
    f.write(new_content)

print("\n✅ 前端文件已更新")
