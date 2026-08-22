#!/usr/bin/env python3
"""
扫描东方财富行业板块 BK 代码，建立 行业名称 -> BK代码 映射表
慢速扫描版本：每次请求间隔 1s，聚焦在 BK0420~BK0560
"""

import time
import json
import os

from curl_cffi import requests as cffi_requests

url = "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"

# 读取已有结果（断点续扫）
output_file = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "bk_code_map.json"
)
results = {}
if os.path.exists(output_file):
    with open(output_file, "r", encoding="utf-8") as f:
        results = json.load(f)
    print(f"已加载 {len(results)} 个已有映射: {list(results.items())}")

found_bks = set(results.keys())


def fetch_bk(bk_code):
    params = {
        "lmt": "0",
        "klt": "101",
        "fields1": "f1,f2,f3,f7",
        "fields2": "f51",
        "secid": f"90.{bk_code}",
        "ut": "b2884a393a59ad64002292a3e90d46a5",
    }
    r = cffi_requests.get(url, params=params, impersonate="chrome124", timeout=12)
    d = r.json()
    data = d.get("data") or {}
    klines = data.get("klines") or []
    name_api = data.get("name", "")
    return name_api, len(klines)


# 聚焦扫描 BK0420~BK0560（东方财富行业板块主要在这个区间）
# 跳过已成功的
for i in range(420, 561):
    bk = f"BK{i:04d}"
    if bk in found_bks:
        print(f"{bk}: 已有 ({results[bk]}), 跳过", flush=True)
        continue

    success = False
    for attempt in range(2):
        try:
            name_api, kline_cnt = fetch_bk(bk)
            if kline_cnt > 0 and name_api:
                results[bk] = name_api
                print(f"✓ {bk}: {name_api} ({kline_cnt} klines)", flush=True)
                # 实时写入文件
                with open(output_file, "w", encoding="utf-8") as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)
                success = True
            else:
                print(f"  {bk}: 无数据 (empty)", flush=True)
            break
        except Exception as e:
            if attempt == 0:
                print(f"  {bk}: 失败({e}), 重试...", flush=True)
                time.sleep(3)
            else:
                print(f"  {bk}: 放弃", flush=True)

    # 每次请求后等待 1s
    time.sleep(1.0)


print(f"\n=== 扫描完成，共找到 {len(results)} 个板块 ===")
# 按 BK 代码排序输出
sorted_results = dict(sorted(results.items()))
print(json.dumps(sorted_results, ensure_ascii=False, indent=2))
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(sorted_results, f, ensure_ascii=False, indent=2)
print(f"已写入 {output_file}")
