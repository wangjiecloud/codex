#!/usr/bin/env python3
"""
同步钨材料相关股票的完整数据
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from routers.industry import _sync_klines, _sync_fundamental

tungsten_codes = ["600549", "002378", "002842", "300689", "000657", "300407"]
names = {
    "600549": "厦门钨业",
    "002378": "章源钨业",
    "002842": "翔鹭钨业",
    "300689": "江钨装备",
    "000657": "中钨高新",
    "300407": "鼎泰高科",
}


def main():
    print("开始同步钨材料股票数据...\n")

    for code in tungsten_codes:
        name = names[code]
        print(f"{'=' * 50}")
        print(f"正在同步: {code} {name}")
        print(f"{'=' * 50}")

        # 同步K线数据（至少266个交易日）
        print(f"\n[1/2] 同步K线数据...")
        try:
            _sync_klines(code, "daily")
            print(f"  ✓ K线数据同步完成")
        except Exception as e:
            print(f"  ✗ K线同步失败: {e}")

        # 同步基本面数据
        print(f"\n[2/2] 同步基本面数据...")
        try:
            _sync_fundamental(code)
            print(f"  ✓ 基本面数据同步完成")
        except Exception as e:
            print(f"  ✗ 基本面同步失败: {e}")

        print()

    print("✅ 所有数据同步完成！")


if __name__ == "__main__":
    main()
