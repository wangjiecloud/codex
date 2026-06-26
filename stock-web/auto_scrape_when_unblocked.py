#!/usr/bin/env python3
"""
检查东方财富封禁状态并在解封后自动重新爬取所有股吧数据
Usage: python3 auto_scrape_when_unblocked.py
"""

import requests
import time
import sys
import subprocess
from datetime import datetime


def check_if_blocked():
    """检测是否仍被东方财富封禁"""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }
        resp = requests.get(
            "https://guba.eastmoney.com/list,601208,99_1.html",
            headers=headers,
            timeout=10,
        )
        return "身份核实" in resp.text
    except Exception as e:
        print(f"检测失败: {e}")
        return True


def scrape_all_stocks():
    """执行批量爬取"""
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 开始批量爬取...")
    result = subprocess.run(
        ["python3", "batch_scrape_guba.py", "--delay", "5"],
        capture_output=True,
        text=True,
        cwd="/Users/wangjie494/codespace/self/SuperJAI/oss/agent/codex/stock-web",
    )

    print(result.stdout)
    if result.returncode == 0:
        print("✓ 爬取完成")
        return True
    else:
        print(f"✗ 爬取失败: {result.stderr}")
        return False


def main():
    print("=" * 60)
    print("东方财富股吧自动爬取脚本")
    print("=" * 60)

    # 首次检测
    print("\n检测封禁状态...")
    if not check_if_blocked():
        print("✓ 未被封禁，立即开始爬取")
        scrape_all_stocks()
        sys.exit(0)

    print("❌ 当前仍被封禁")
    print("\n选项:")
    print("1. 每30分钟自动检测，解封后自动爬取 (推荐)")
    print("2. 仅检测一次并退出")
    print("3. 强制爬取 (可能失败)")

    choice = input("\n请选择 (1/2/3): ").strip()

    if choice == "1":
        print("\n开始监控，每30分钟检测一次...")
        print("按 Ctrl+C 停止监控\n")

        check_count = 0
        try:
            while True:
                check_count += 1
                print(
                    f"[{datetime.now().strftime('%H:%M:%S')}] 第 {check_count} 次检测...",
                    end=" ",
                )

                if not check_if_blocked():
                    print("✓ 解封！")
                    scrape_all_stocks()
                    break
                else:
                    print("仍被封禁，30分钟后重试")
                    time.sleep(1800)  # 30 minutes

        except KeyboardInterrupt:
            print("\n\n监控已停止")

    elif choice == "2":
        print("\n仅检测一次:")
        if check_if_blocked():
            print("❌ 仍被封禁")
            sys.exit(1)
        else:
            print("✓ 已解封")
            sys.exit(0)

    elif choice == "3":
        print("\n强制尝试爬取...")
        scrape_all_stocks()
    else:
        print("无效选择")
        sys.exit(1)


if __name__ == "__main__":
    main()
