"""
直接用东方财富 push2his API 拉 ETF 历史K线
"""

import sys, os, json, time
from datetime import datetime, date

sys.path.insert(0, os.path.dirname(__file__))

import requests


def fetch_em_kline(
    code: str, secid_prefix: str, period: int, limit: int = 5000
) -> list:
    """
    东方财富K线接口
    secid: 1.510300 (上交所) 或 0.159530 (深交所)
    period: 101=日K 102=周K 103=月K
    """
    secid = f"{secid_prefix}.{code}"
    url = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
    params = {
        "secid": secid,
        "ut": "fa5fd1943c7b386f172d6893dbfba10b",
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
        "klt": period,  # 101=日K, 102=周K, 103=月K
        "fqt": 1,  # 1=前复权
        "end": "20500101",
        "lmt": limit,
        "cb": "",
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://quote.eastmoney.com/",
    }
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        data = resp.json()
        klines = data.get("data", {}).get("klines", [])
        return klines
    except Exception as e:
        print(f"  [em] {code} period={period} error: {e}")
        return []


def test_em():
    # 测试510300
    for code, prefix in [
        ("510300", "1"),
        ("510210", "1"),
        ("159530", "0"),
        ("159994", "0"),
    ]:
        klines = fetch_em_kline(code, prefix, 101, 5000)
        if klines:
            print(
                f"{code} 日K: {len(klines)}条, first={klines[0][:20]}, last={klines[-1][:20]}"
            )
        else:
            print(f"{code} 日K: 无数据")


if __name__ == "__main__":
    test_em()
