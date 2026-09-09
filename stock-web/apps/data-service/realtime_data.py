"""
实时数据源服务层 — 参考 fundtool-extension 项目模式
数据源：腾讯财经(qt.gtimg.cn) / 东方财富(push2his/push2delay.eastmoney.com) / 新浪财经(hq.sinajs.cn)
所有数据实时获取，不存数据库
"""

import requests
import json
import re
import time
import logging
from datetime import datetime, date, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ============ 数据源 URL 常量 ============
TENCENT_HQ_URL = "https://qt.gtimg.cn/q="
TENCENT_MINUTE_URL = "https://web.ifzq.gtimg.cn/appstock/app/minute/query?code="
TENCENT_DKLINE_URL = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param="
TENCENT_MKLINE_URL = "https://ifzq.gtimg.cn/appstock/app/kline/mkline?param="

EM_KLINE_HIS_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
EM_KLINE_DELAY_URL = "https://push2delay.eastmoney.com/api/qt/stock/kline/get"
EM_TRENDS_URL = "https://push2delay.eastmoney.com/api/qt/stock/trends2/get"
EM_ULIST_URL = "https://push2delay.eastmoney.com/api/qt/ulist.np/get"
EM_CLIST_URL = "https://push2delay.eastmoney.com/api/qt/clist/get"
EM_STOCK_GET_URL = "https://push2delay.eastmoney.com/api/qt/stock/get"
EM_F10_URL = "https://emweb.securities.eastmoney.com/PC_HSF10"
EM_DC_API = "https://datacenter.eastmoney.com/securities/api/data/v1/get"

SINA_HQ_URL = "https://hq.sinajs.cn/list="
SINA_SUGGEST_URL = (
    "https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,22,41,86,87,203&key="
)

# ============ 工具函数 ============


def _ts() -> int:
    return int(time.time() * 1000)


def _safe_float(val, default=0.0) -> float:
    try:
        v = float(str(val).strip())
        return v if v == v else default
    except Exception:
        return default


def _decode_gbk(resp) -> str:
    return resp.content.decode("gbk", errors="replace")


def is_a_share(code: str) -> bool:
    if not code or len(code) != 6:
        return False
    return code.startswith("0") or code.startswith("3") or code.startswith("6")


def to_tencent_symbol(code: str) -> str:
    if code.startswith("6") or code.startswith("5"):
        return f"sh{code}"
    if code.startswith("0") or code.startswith("3") or code.startswith("1"):
        return f"sz{code}"
    if code.startswith("4") or code.startswith("8"):
        return f"bj{code}"
    return f"sh{code}"


def to_em_secid(code: str) -> str:
    if code.startswith("6"):
        return f"1.{code}"
    if (
        code.startswith("0")
        or code.startswith("3")
        or code.startswith("4")
        or code.startswith("8")
        or code.startswith("9")
    ):
        return f"0.{code}"
    return f"1.{code}"


def to_em_secucode(code: str) -> str:
    if code.startswith("6"):
        return f"{code}.SH"
    if code.startswith("9") or code.startswith("8"):
        return f"{code}.BJ"
    return f"{code}.SZ"


def to_sina_symbol(code: str) -> str:
    if code.startswith("6") or code.startswith("5"):
        return f"sh{code}"
    return f"sz{code}"


# ============ 1. 实时行情（腾讯）============


def fetch_quote(code: str) -> dict:
    symbol = to_tencent_symbol(code)
    url = f"{TENCENT_HQ_URL}{symbol}&_={_ts()}"
    try:
        resp = requests.get(url, timeout=10)
        text = _decode_gbk(resp)
        m = re.search(r'v_([^=]+)="([^"]*)"', text)
        if not m or not m.group(2):
            return {}
        fields = m.group(2).split("~")
        if len(fields) < 35:
            return {}
        name = fields[1]
        price = _safe_float(fields[3])
        prev_close = _safe_float(fields[4])
        open_price = _safe_float(fields[5])
        volume = _safe_float(fields[6])
        change_amt = _safe_float(fields[31])
        change_pct = _safe_float(fields[32])
        high = _safe_float(fields[33])
        low = _safe_float(fields[34])
        turnover = _safe_float(fields[37]) if len(fields) > 37 else 0.0
        turnover_rate = _safe_float(fields[38]) if len(fields) > 38 else 0.0

        return {
            "code": code,
            "name": name,
            "price": round(price, 4),
            "change": round(change_pct, 2),
            "changeAmt": round(change_amt, 4),
            "open": round(open_price, 4),
            "prevClose": round(prev_close, 4),
            "high": round(high, 4),
            "low": round(low, 4),
            "volume": volume,
            "turnover": turnover,
            "turnoverRate": round(turnover_rate, 2),
            "marketCap": 0.0,
            "pe": 0.0,
            "pb": 0.0,
            "amplitude": round((high - low) / prev_close * 100, 2)
            if prev_close > 0
            else 0.0,
            "updatedAt": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.error(f"fetch_quote({code}) error: {e}")
        return {}


def fetch_quote_with_detail(code: str) -> dict:
    quote = fetch_quote(code)
    if not quote:
        return {}
    try:
        secid = to_em_secid(code)
        url = f"{EM_STOCK_GET_URL}?secid={secid}&fields=f57,f58,f162,f167,f168,f169,f170,f171,f173,f177,f183,f184,f185,f186,f187,f188,f190,f191,f192,f193&_={_ts()}"
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        if data:
            quote["pe"] = _safe_float(data.get("f162"))
            quote["pb"] = _safe_float(data.get("f167"))
            quote["marketCap"] = _safe_float(data.get("f185"))
            quote["turnoverRate"] = _safe_float(
                data.get("f168"), quote.get("turnoverRate", 0.0)
            )
            quote["amplitude"] = _safe_float(
                data.get("f171"), quote.get("amplitude", 0.0)
            )
    except Exception as e:
        logger.error(f"fetch_quote_with_detail({code}) em error: {e}")
    return quote


def fetch_batch_quotes(codes: list[str]) -> list[dict]:
    if not codes:
        return []
    a_codes = [c for c in codes if is_a_share(c)]
    results = []
    for i in range(0, len(a_codes), 80):
        batch = a_codes[i : i + 80]
        symbols = [to_tencent_symbol(c) for c in batch]
        url = f"{TENCENT_HQ_URL}{','.join(symbols)}&_={_ts()}"
        try:
            resp = requests.get(url, timeout=15)
            text = _decode_gbk(resp)
            for m in re.finditer(r'v_([^=]+)="([^"]*)"', text):
                fields = m.group(2).split("~")
                if len(fields) < 35:
                    continue
                raw_symbol = m.group(1)
                code = (
                    raw_symbol[2:]
                    if raw_symbol.startswith(("sh", "sz", "bj"))
                    else raw_symbol
                )
                price = _safe_float(fields[3])
                prev_close = _safe_float(fields[4])
                change_pct = _safe_float(fields[32])
                results.append(
                    {
                        "code": code,
                        "name": fields[1],
                        "price": round(price, 4),
                        "change": round(change_pct, 2),
                        "changeAmt": round(_safe_float(fields[31]), 4),
                        "open": round(_safe_float(fields[5]), 4),
                        "prevClose": round(prev_close, 4),
                        "high": round(_safe_float(fields[33]), 4),
                        "low": round(_safe_float(fields[34]), 4),
                        "volume": _safe_float(fields[6]),
                        "turnover": _safe_float(fields[37])
                        if len(fields) > 37
                        else 0.0,
                        "turnoverRate": round(_safe_float(fields[38]), 2)
                        if len(fields) > 38
                        else 0.0,
                        "marketCap": 0.0,
                        "pe": 0.0,
                        "pb": 0.0,
                        "amplitude": 0.0,
                        "updatedAt": datetime.utcnow().isoformat(),
                    }
                )
        except Exception as e:
            logger.error(f"fetch_batch_quotes batch error: {e}")
    return results


# ============ 2. K线数据（东方财富 + 腾讯回退）============


def fetch_kline(code: str, period: str = "daily", count: int = 110) -> list[dict]:
    if count == 110:
        if period == "weekly":
            count = 156
        elif period == "monthly":
            count = 120

    if is_a_share(code):
        bars = _fetch_kline_em(code, period, count)
        if bars:
            return bars
    return _fetch_kline_tencent(code, period, count)


def _fetch_kline_em(code: str, period: str, count: int) -> list[dict]:
    secid = to_em_secid(code)
    klt = {"daily": 101, "weekly": 102, "monthly": 103}.get(period, 101)
    url = (
        f"{EM_KLINE_HIS_URL}?secid={secid}"
        f"&fields1=f1,f2,f3,f4,f5,f6"
        f"&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
        f"&klt={klt}&fqt=1&beg=0&end=20500101&lmt={count}&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=15)
        data = resp.json().get("data", {})
        klines = data.get("klines", [])
        if not klines:
            return []
        bars = []
        prev_close = 0.0
        for line in klines:
            parts = line.split(",")
            if len(parts) < 7:
                continue
            d = parts[0]
            o = _safe_float(parts[1])
            c = _safe_float(parts[2])
            h = _safe_float(parts[3])
            lo = _safe_float(parts[4])
            vol = int(_safe_float(parts[5]))
            turn = _safe_float(parts[8]) if len(parts) > 8 else 0.0
            change_pct = (
                round((c - prev_close) / prev_close * 100, 4) if prev_close > 0 else 0.0
            )
            prev_close = c
            bars.append(
                {
                    "time": d,
                    "open": o,
                    "high": h,
                    "low": lo,
                    "close": c,
                    "volume": vol,
                    "turnRate": turn,
                    "changePct": change_pct,
                }
            )
        return bars[-count:] if len(bars) > count else bars
    except Exception as e:
        logger.error(f"_fetch_kline_em({code},{period}) error: {e}")
        return []


def _fetch_kline_tencent(code: str, period: str, count: int) -> list[dict]:
    symbol = to_tencent_symbol(code)
    tc_period = {"daily": "day", "weekly": "week", "monthly": "month"}.get(
        period, "day"
    )
    url = f"{TENCENT_DKLINE_URL}{symbol},{tc_period},,,{count},qfq&_={_ts()}"
    try:
        resp = requests.get(url, timeout=15)
        data = resp.json().get("data", {})
        stock_data = data.get(symbol, {})
        key = f"qfq{tc_period}" if f"qfq{tc_period}" in stock_data else tc_period
        klines = stock_data.get(key, [])
        if not klines:
            return []
        bars = []
        prev_close = 0.0
        for row in klines:
            if len(row) < 6:
                continue
            d = row[0]
            o = _safe_float(row[1])
            c = _safe_float(row[2])
            h = _safe_float(row[3])
            lo = _safe_float(row[4])
            vol = int(_safe_float(row[5]))
            change_pct = (
                round((c - prev_close) / prev_close * 100, 4) if prev_close > 0 else 0.0
            )
            prev_close = c
            bars.append(
                {
                    "time": d,
                    "open": o,
                    "high": h,
                    "low": lo,
                    "close": c,
                    "volume": vol,
                    "turnRate": 0.0,
                    "changePct": change_pct,
                }
            )
        return bars
    except Exception as e:
        logger.error(f"_fetch_kline_tencent({code},{period}) error: {e}")
        return []


# ============ 3. 分时数据（腾讯 + 东财）============


def fetch_minute(code: str) -> list[dict]:
    if is_a_share(code):
        return _fetch_minute_tencent(code)
    return _fetch_minute_em(code)


def _fetch_minute_tencent(code: str) -> list[dict]:
    symbol = to_tencent_symbol(code)
    url = f"{TENCENT_MINUTE_URL}{symbol}&_={_ts()}"
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        stock_data = data.get(symbol, {})
        raw = stock_data.get("data", {}).get("data", [])
        if not raw:
            return []
        result = []
        prev_close = _safe_float(stock_data.get("data", {}).get("preClose", 0))
        prev_vol = 0
        prev_amt = 0
        for line in raw:
            parts = line.split(" ")
            if len(parts) < 4:
                continue
            hhmm = parts[0][:4]
            hh = hhmm[:2]
            mm = hhmm[2:4]
            price = _safe_float(parts[1])
            cum_vol = _safe_float(parts[2])
            cum_amt = _safe_float(parts[3])
            vol = cum_vol - prev_vol
            amt = cum_amt - prev_amt
            prev_vol = cum_vol
            prev_amt = cum_amt
            change_pct = (
                round((price - prev_close) / prev_close * 100, 2)
                if prev_close > 0
                else 0.0
            )
            result.append(
                {
                    "time": f"{hh}:{mm}",
                    "price": price,
                    "volume": vol,
                    "amount": amt,
                    "changePct": change_pct,
                }
            )
        return result
    except Exception as e:
        logger.error(f"_fetch_minute_tencent({code}) error: {e}")
        return []


def _fetch_minute_em(code: str) -> list[dict]:
    secid = to_em_secid(code)
    url = (
        f"{EM_TRENDS_URL}?secid={secid}"
        f"&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13"
        f"&fields2=f51,f52,f53,f54,f55,f56,f57,f58"
        f"&ndays=1&iscr=0&nsr=1&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        trends = data.get("trends", [])
        if not trends:
            return []
        result = []
        prev_close = _safe_float(data.get("preClose", 0))
        for line in trends:
            parts = line.split(",")
            if len(parts) < 8:
                continue
            dt_str = parts[0]
            hhmm = dt_str[11:16]
            price = _safe_float(parts[2])
            vol = _safe_float(parts[5])
            change_pct = (
                round((price - prev_close) / prev_close * 100, 2)
                if prev_close > 0
                else 0.0
            )
            result.append(
                {
                    "time": hhmm,
                    "price": price,
                    "volume": vol,
                    "amount": _safe_float(parts[6]),
                    "changePct": change_pct,
                }
            )
        return result
    except Exception as e:
        logger.error(f"_fetch_minute_em({code}) error: {e}")
        return []


# ============ 4. 股票搜索（东方财富 clist）============


def search_stocks(keyword: str, limit: int = 20) -> list[dict]:
    if not keyword.strip():
        return []
    kw = keyword.strip()
    url = (
        f"{EM_CLIST_URL}?pn=1&pz={limit}&po=1&np=1&fltt=2&invt=2"
        f"&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
        f"&fields=f12,f14,f2,f3"
        f"&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        diff = data.get("diff", [])
        results = []
        kw_lower = kw.lower()
        for item in diff:
            code = item.get("f12", "")
            name = item.get("f14", "")
            if kw_lower in code.lower() or kw in name:
                results.append(
                    {
                        "code": code,
                        "name": name,
                        "price": _safe_float(item.get("f2")),
                        "change": _safe_float(item.get("f3")),
                    }
                )
        results.sort(
            key=lambda x: (
                not x["code"].startswith(kw),
                not kw in x["name"],
                x["code"],
            )
        )
        return results[:limit]
    except Exception as e:
        logger.error(f"search_stocks({keyword}) error: {e}")
        return []


# ============ 5. 板块/行业（东方财富 clist）============


def fetch_industry_boards() -> list[dict]:
    results = []
    for pn in range(1, 5):
        url = (
            f"{EM_CLIST_URL}?pn={pn}&pz=100&po=1&np=1&fltt=2&invt=2"
            f"&fid=f3&fs=m:90+t:2"
            f"&fields=f2,f3,f4,f8,f12,f14,f104,f105,f128,f136"
            f"&_={_ts()}"
        )
        try:
            resp = requests.get(url, timeout=10)
            data = resp.json().get("data", {})
            diff = data.get("diff", [])
            if not diff:
                break
            for item in diff:
                results.append(
                    {
                        "code": item.get("f12", ""),
                        "name": item.get("f14", ""),
                        "changePct": _safe_float(item.get("f3")),
                        "changeAmt": _safe_float(item.get("f4")),
                        "price": _safe_float(item.get("f2")),
                        "turnoverRate": _safe_float(item.get("f8")),
                        "riseCount": int(_safe_float(item.get("f104"))),
                        "fallCount": int(_safe_float(item.get("f105"))),
                        "leadStock": item.get("f128", ""),
                        "leadStockPct": _safe_float(item.get("f136")),
                    }
                )
        except Exception as e:
            logger.error(f"fetch_industry_boards pn={pn} error: {e}")
            break
    return results


def fetch_concept_boards() -> list[dict]:
    results = []
    for pn in range(1, 5):
        url = (
            f"{EM_CLIST_URL}?pn={pn}&pz=100&po=1&np=1&fltt=2&invt=2"
            f"&fid=f3&fs=m:90+t:3"
            f"&fields=f2,f3,f4,f8,f12,f14,f104,f105,f128,f136"
            f"&_={_ts()}"
        )
        try:
            resp = requests.get(url, timeout=10)
            data = resp.json().get("data", {})
            diff = data.get("diff", [])
            if not diff:
                break
            for item in diff:
                results.append(
                    {
                        "code": item.get("f12", ""),
                        "name": item.get("f14", ""),
                        "changePct": _safe_float(item.get("f3")),
                        "changeAmt": _safe_float(item.get("f4")),
                        "price": _safe_float(item.get("f2")),
                        "turnoverRate": _safe_float(item.get("f8")),
                        "riseCount": int(_safe_float(item.get("f104"))),
                        "fallCount": int(_safe_float(item.get("f105"))),
                        "leadStock": item.get("f128", ""),
                        "leadStockPct": _safe_float(item.get("f136")),
                    }
                )
        except Exception as e:
            logger.error(f"fetch_concept_boards pn={pn} error: {e}")
            break
    return results


def fetch_board_stocks(board_code: str, count: int = 200) -> list[dict]:
    url = (
        f"{EM_CLIST_URL}?pn=1&pz={count}&po=1&np=1&fltt=2&invt=2"
        f"&fid=f3&fs=b:{board_code}"
        f"&fields=f12,f14,f2,f3,f4,f5,f6,f7,f8,f15,f16,f17,f18"
        f"&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        diff = data.get("diff", [])
        results = []
        for item in diff:
            results.append(
                {
                    "code": item.get("f12", ""),
                    "name": item.get("f14", ""),
                    "price": _safe_float(item.get("f2")),
                    "changePct": _safe_float(item.get("f3")),
                    "changeAmt": _safe_float(item.get("f4")),
                    "volume": _safe_float(item.get("f5")),
                    "turnover": _safe_float(item.get("f6")),
                    "amplitude": _safe_float(item.get("f7")),
                    "turnoverRate": _safe_float(item.get("f8")),
                    "high": _safe_float(item.get("f15")),
                    "low": _safe_float(item.get("f16")),
                    "open": _safe_float(item.get("f17")),
                    "prevClose": _safe_float(item.get("f18")),
                }
            )
        return results
    except Exception as e:
        logger.error(f"fetch_board_stocks({board_code}) error: {e}")
        return []


def fetch_board_kline(
    board_code: str, period: str = "daily", count: int = 110
) -> list[dict]:
    klt = {"daily": 101, "weekly": 102, "monthly": 103}.get(period, 101)
    secid = f"90.{board_code}"
    url = (
        f"{EM_KLINE_HIS_URL}?secid={secid}"
        f"&fields1=f1,f2,f3,f4,f5,f6"
        f"&fields2=f51,f52,f53,f54,f55,f56,f57"
        f"&klt={klt}&fqt=1&beg=0&end=20500101&lmt={count}&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=15)
        data = resp.json().get("data", {})
        klines = data.get("klines", [])
        if not klines:
            return []
        bars = []
        prev_close = 0.0
        for line in klines:
            parts = line.split(",")
            if len(parts) < 7:
                continue
            d = parts[0]
            o = _safe_float(parts[1])
            c = _safe_float(parts[2])
            h = _safe_float(parts[3])
            lo = _safe_float(parts[4])
            vol = int(_safe_float(parts[5]))
            change_pct = (
                round((c - prev_close) / prev_close * 100, 4) if prev_close > 0 else 0.0
            )
            prev_close = c
            bars.append(
                {
                    "time": d,
                    "open": o,
                    "high": h,
                    "low": lo,
                    "close": c,
                    "volume": vol,
                    "turnRate": 0.0,
                    "changePct": change_pct,
                }
            )
        return bars[-count:] if len(bars) > count else bars
    except Exception as e:
        logger.error(f"fetch_board_kline({board_code},{period}) error: {e}")
        return []


# ============ 6. 全球指数（东方财富）============

GLOBAL_INDEX_SECIDS = {
    "000001": "1.000001",
    "399001": "0.399001",
    "399006": "0.399006",
    "000016": "1.000016",
    "000300": "1.000300",
    "000688": "1.000688",
    "000047": "1.000047",
    "000680": "1.000680",
    "HSI": "100.HSI",
    "HSCEI": "100.HSCEI",
    "HSTECH": "100.HSTECH",
    "DJIA": "100.DJIA",
    "SPX": "100.SPX",
    "NDX": "100.NDX",
    "N225": "100.N225",
    "KS11": "100.KS11",
    "FTSE": "100.FTSE",
    "GDAXI": "100.GDAXI",
    "FCHI": "100.FCHI",
    "SENSEX": "100.SENSEX",
    "TWII": "100.TWII",
    "AS51": "100.AS51",
}


def fetch_global_indices(codes: Optional[list[str]] = None) -> list[dict]:
    if codes is None:
        codes = list(GLOBAL_INDEX_SECIDS.keys())
    secids = [GLOBAL_INDEX_SECIDS.get(c, c) for c in codes]
    fields = "f2,f3,f4,f12,f14,f15,f16,f17,f18,f6"
    url = f"{EM_ULIST_URL}?fltt=2&invt=2&secids={','.join(secids)}&fields={fields}&_={_ts()}"
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        diff = data.get("diff", [])
        results = []
        for item in diff:
            results.append(
                {
                    "code": item.get("f12", ""),
                    "name": item.get("f14", ""),
                    "price": _safe_float(item.get("f2")),
                    "changePct": _safe_float(item.get("f3")),
                    "changeAmt": _safe_float(item.get("f4")),
                    "high": _safe_float(item.get("f15")),
                    "low": _safe_float(item.get("f16")),
                    "open": _safe_float(item.get("f17")),
                    "prevClose": _safe_float(item.get("f18")),
                    "volume": _safe_float(item.get("f6")),
                }
            )
        return results
    except Exception as e:
        logger.error(f"fetch_global_indices error: {e}")
        return []


def fetch_global_index_kline(
    code: str, period: str = "daily", count: int = 110
) -> list[dict]:
    secid = GLOBAL_INDEX_SECIDS.get(code, code)
    klt = {"daily": 101, "weekly": 102, "monthly": 103}.get(period, 101)
    url = (
        f"{EM_KLINE_HIS_URL}?secid={secid}"
        f"&fields1=f1,f2,f3,f4,f5,f6"
        f"&fields2=f51,f52,f53,f54,f55,f56,f57"
        f"&klt={klt}&fqt=1&beg=0&end=20500101&lmt={count}&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=15)
        data = resp.json().get("data", {})
        klines = data.get("klines", [])
        if not klines:
            return []
        bars = []
        prev_close = 0.0
        for line in klines:
            parts = line.split(",")
            if len(parts) < 7:
                continue
            d = parts[0]
            o = _safe_float(parts[1])
            c = _safe_float(parts[2])
            h = _safe_float(parts[3])
            lo = _safe_float(parts[4])
            vol = int(_safe_float(parts[5]))
            change_pct = (
                round((c - prev_close) / prev_close * 100, 4) if prev_close > 0 else 0.0
            )
            prev_close = c
            bars.append(
                {
                    "time": d,
                    "open": o,
                    "high": h,
                    "low": lo,
                    "close": c,
                    "volume": vol,
                    "turnRate": 0.0,
                    "changePct": change_pct,
                }
            )
        return bars[-count:] if len(bars) > count else bars
    except Exception as e:
        logger.error(f"fetch_global_index_kline({code},{period}) error: {e}")
        return []


# ============ 7. 资金流向（东方财富）============


def fetch_fund_flow_concept() -> list[dict]:
    url = (
        f"{EM_CLIST_URL}?pn=1&pz=50&po=1&np=1&fltt=2&invt=2"
        f"&fid=f62&fs=m:90+t:3"
        f"&fields=f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f164,f174"
        f"&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        diff = data.get("diff", [])
        results = []
        for item in diff:
            results.append(
                {
                    "code": item.get("f12", ""),
                    "name": item.get("f14", ""),
                    "changePct": _safe_float(item.get("f3")),
                    "mainNet": _safe_float(item.get("f62")),
                    "mainNetPct": _safe_float(item.get("f184")),
                    "superNet": _safe_float(item.get("f66")),
                    "bigNet": _safe_float(item.get("f72")),
                    "midNet": _safe_float(item.get("f78")),
                    "smallNet": _safe_float(item.get("f84")),
                }
            )
        return results
    except Exception as e:
        logger.error(f"fetch_fund_flow_concept error: {e}")
        return []


def fetch_fund_flow_industry() -> list[dict]:
    url = (
        f"{EM_CLIST_URL}?pn=1&pz=50&po=1&np=1&fltt=2&invt=2"
        f"&fid=f62&fs=m:90+t:2"
        f"&fields=f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f164,f174"
        f"&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        diff = data.get("diff", [])
        results = []
        for item in diff:
            results.append(
                {
                    "code": item.get("f12", ""),
                    "name": item.get("f14", ""),
                    "changePct": _safe_float(item.get("f3")),
                    "mainNet": _safe_float(item.get("f62")),
                    "mainNetPct": _safe_float(item.get("f184")),
                    "superNet": _safe_float(item.get("f66")),
                    "bigNet": _safe_float(item.get("f72")),
                    "midNet": _safe_float(item.get("f78")),
                    "smallNet": _safe_float(item.get("f84")),
                }
            )
        return results
    except Exception as e:
        logger.error(f"fetch_fund_flow_industry error: {e}")
        return []


def fetch_market_fund_flow() -> dict:
    url = (
        f"https://push2.eastmoney.com/api/qt/ulist.np/get"
        f"?fltt=2&invt=2&secids=1.000001,0.399001"
        f"&fields=f62,f184,f66,f69,f72,f75,f78,f81,f84,f87"
        f"&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        diff = data.get("diff", [])
        if not diff:
            return {}
        sh = diff[0] if len(diff) > 0 else {}
        sz = diff[1] if len(diff) > 1 else {}
        return {
            "sh": {
                "mainNet": _safe_float(sh.get("f62")),
                "superNet": _safe_float(sh.get("f66")),
                "bigNet": _safe_float(sh.get("f72")),
                "midNet": _safe_float(sh.get("f78")),
                "smallNet": _safe_float(sh.get("f84")),
            },
            "sz": {
                "mainNet": _safe_float(sz.get("f62")),
                "superNet": _safe_float(sz.get("f66")),
                "bigNet": _safe_float(sz.get("f72")),
                "midNet": _safe_float(sz.get("f78")),
                "smallNet": _safe_float(sz.get("f84")),
            },
        }
    except Exception as e:
        logger.error(f"fetch_market_fund_flow error: {e}")
        return {}


def fetch_north_bound_flow() -> dict:
    url = (
        f"https://push2.eastmoney.com/api/qt/kamt.rtmin/get"
        f"?fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56"
        f"&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        d = data.get("s2n", {})
        return {
            "hgt": _safe_float(d.get("f52")),
            "sgt": _safe_float(d.get("f53")),
            "total": _safe_float(d.get("f51")),
        }
    except Exception as e:
        logger.error(f"fetch_north_bound_flow error: {e}")
        return {}


# ============ 8. 市场情绪/涨跌统计（东方财富 clist）============


def fetch_market_breadth() -> dict:
    url = (
        f"{EM_CLIST_URL}?pn=1&pz=1&po=1&np=1&fltt=2&invt=2"
        f"&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
        f"&fields=f2,f3,f4,f12,f14"
        f"&_={_ts()}"
    )
    try:
        url_all = (
            f"{EM_CLIST_URL}?pn=1&pz=6000&po=1&np=1&fltt=2&invt=2"
            f"&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
            f"&fields=f3,f4"
            f"&_={_ts()}"
        )
        resp = requests.get(url_all, timeout=15)
        data = resp.json().get("data", {})
        diff = data.get("diff", [])
        up = down = flat = limit_up = limit_down = 0
        for item in diff:
            pct = _safe_float(item.get("f3"))
            amt = _safe_float(item.get("f4"))
            if pct > 0:
                up += 1
            elif pct < 0:
                down += 1
            else:
                flat += 1
            if pct >= 9.9:
                limit_up += 1
            elif pct <= -9.9:
                limit_down += 1
        return {
            "tradeDate": date.today().strftime("%Y-%m-%d"),
            "upCount": up,
            "downCount": down,
            "flatCount": flat,
            "limitUp": limit_up,
            "limitDown": limit_down,
            "total": up + down + flat,
        }
    except Exception as e:
        logger.error(f"fetch_market_breadth error: {e}")
        return {}


# ============ 9. 新闻/快讯（东方财富）============


def fetch_news_flash(category: str = "all") -> list[dict]:
    url = (
        f"https://np-anotice-stock.eastmoney.com/api/security/ann"
        f"?page_size=50&page_index=1&ann_type=A&client_source=web"
        f"&f_node=0&s_node=0&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json()
        items = data.get("data", {}).get("list", [])
        results = []
        for item in items:
            results.append(
                {
                    "id": str(item.get("art_code", "")),
                    "title": item.get("title", ""),
                    "digest": item.get("notice_content", "")[:200],
                    "url": f"https://data.eastmoney.com/notices/detail/{item.get('art_code', '')}.html",
                    "pubTime": item.get("notice_date", ""),
                    "category": "notice",
                }
            )
        return results
    except Exception as e:
        logger.error(f"fetch_news_flash error: {e}")
        return []


def fetch_7x24_flash() -> list[dict]:
    url = (
        f"https://np-listapi.eastmoney.com/comm/web/getFastNewsList"
        f"?client=web&biz=web_724&fastColumn=102&sortEnd=&pageSize=50&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json()
        items = data.get("data", {}).get("list", [])
        results = []
        for item in items:
            results.append(
                {
                    "id": str(item.get("art_code", "")),
                    "title": item.get("title", ""),
                    "digest": item.get("digest", ""),
                    "url": item.get("url_w", ""),
                    "pubTime": item.get("showtime", ""),
                    "category": "flash",
                }
            )
        return results
    except Exception as e:
        logger.error(f"fetch_7x24_flash error: {e}")
        return []


def fetch_stock_news(code: str) -> list[dict]:
    secid = to_em_secid(code)
    url = (
        f"https://np-anotice-stock.eastmoney.com/api/security/ann"
        f"?page_size=20&page_index=1&ann_type=A&client_source=web"
        f"&stock_list={secid}&f_node=0&s_node=0&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json()
        items = data.get("data", {}).get("list", [])
        results = []
        for item in items:
            results.append(
                {
                    "code": code,
                    "title": item.get("title", ""),
                    "url": f"https://data.eastmoney.com/notices/detail/{item.get('art_code', '')}.html",
                    "source": item.get("title_ch", ""),
                    "pubTime": item.get("notice_date", ""),
                }
            )
        return results
    except Exception as e:
        logger.error(f"fetch_stock_news({code}) error: {e}")
        return []


# ============ 10. 融资融券（东方财富）============


def fetch_margin_trading() -> dict:
    url = (
        f"https://datacenter-web.eastmoney.com/api/data/v1/get"
        f"?reportName=RPTA_RZRQ_TJB&columns=ALL&source=WEB&sortColumns=TDATE"
        f"&sortTypes=-1&pageSize=10&pageNumber=1&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json()
        items = data.get("result", {}).get("data", [])
        if not items:
            return {}
        latest = items[0]
        return {
            "tradeDate": latest.get("TDATE", "")[:10],
            "marginBalance": _safe_float(latest.get("RZYE")),
            "rzBalance": _safe_float(latest.get("RZYE")),
            "rqBalance": _safe_float(latest.get("RQYE")),
            "rzBuy": _safe_float(latest.get("RZMRE")),
            "rzRepay": _safe_float(latest.get("RZCHE")),
        }
    except Exception as e:
        logger.error(f"fetch_margin_trading error: {e}")
        return {}


def fetch_margin_trading_stocks() -> list[dict]:
    url = (
        f"https://datacenter-web.eastmoney.com/api/data/v1/get"
        f"?reportName=RPTA_RZRQ_GGMX&columns=ALL&source=WEB"
        f"&sortColumns=RZJME&sortTypes=-1&pageSize=50&pageNumber=1&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json()
        items = data.get("result", {}).get("data", [])
        results = []
        for item in items:
            results.append(
                {
                    "code": item.get("SCODE", ""),
                    "name": item.get("SNAME", ""),
                    "rzBalance": _safe_float(item.get("RZYE")),
                    "rzBuy": _safe_float(item.get("RZMRE")),
                    "rzRepay": _safe_float(item.get("RZCHE")),
                    "rzNet": _safe_float(item.get("RZJME")),
                    "rqQty": _safe_float(item.get("RQYL")),
                    "rqSell": _safe_float(item.get("RQMCL")),
                    "marginBalance": _safe_float(item.get("RZRQYE")),
                }
            )
        return results
    except Exception as e:
        logger.error(f"fetch_margin_trading_stocks error: {e}")
        return []


# ============ 11. 个股基本面/F10（东方财富 Web API）============


def fetch_f10_snapshot(code: str) -> dict:
    secucode = to_em_secucode(code)
    url = f"{EM_F10_URL}/CompanySurvey/PageAjax?code={secucode}&_={_ts()}"
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        data = resp.json()
        result = {"code": code}

        jbzl = data.get("jbzl", [])
        if jbzl:
            info = jbzl[0]
            result["companyName"] = info.get("ORG_NAME", "")
            result["shortName"] = info.get("SECURITY_NAME_ABBR", "")
            result["listedDate"] = ""
            result["registeredCapital"] = _safe_float(info.get("REG_CAPITAL"))
            result["employees"] = int(_safe_float(info.get("EMP_NUM")))
            result["businessScope"] = info.get("BUSINESS_SCOPE", "")
            result["mainBusiness"] = info.get("ORG_PROFILE", "")
            result["industry"] = info.get("INDUSTRYCSRC1", "")
            result["emIndustry"] = info.get("EM2016", "")

        result["updatedAt"] = datetime.utcnow().isoformat()
        return result
    except Exception as e:
        logger.error(f"fetch_f10_snapshot({code}) error: {e}")
        return {}


def fetch_f10_financial(code: str) -> list[dict]:
    url = (
        f"{EM_DC_API}?reportName=RPT_LICO_FN_CPD"
        f"&columns=ALL"
        f"&filter=(SECURITY_CODE=%22{code}%22)"
        f"&pageNumber=1&pageSize=30"
        f"&sortTypes=-1&sortColumns=REPORTDATE"
    )
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        data = resp.json()
        result = []
        items = data.get("result", {}).get("data", []) or []
        for item in items:
            result.append(
                {
                    "reportDate": str(item.get("REPORTDATE", ""))[:10],
                    "revenue": _safe_float(item.get("TOTAL_OPERATE_INCOME")),
                    "netProfit": _safe_float(item.get("PARENT_NETPROFIT")),
                    "eps": _safe_float(item.get("BASIC_EPS")),
                    "roe": _safe_float(item.get("WEIGHTAVG_ROE")),
                    "grossMargin": _safe_float(item.get("XSMLL")),
                    "revenueYoy": _safe_float(item.get("YSTZ")),
                    "netProfitYoy": _safe_float(item.get("SJLTZ")),
                    "bps": _safe_float(item.get("BPS")),
                    "cfps": _safe_float(item.get("MGJYXJJE")),
                    "deductedEps": _safe_float(item.get("DEDUCT_BASIC_EPS")),
                }
            )
        return result
    except Exception as e:
        logger.error(f"fetch_f10_financial({code}) error: {e}")
        return []


def fetch_f10_main_business(code: str) -> list[dict]:
    url = (
        f"{EM_DC_API}?reportName=RPT_MAIN_BUSINESS"
        f"&columns=ALL"
        f"&filter=(SECURITY_CODE=%22{code}%22)(BUSINESS_TYPE_CODE=%22001%22)(IS_MAXREPORTDATE=%221%22)(DISPLAY_DATA_TYPE=%22%E6%8C%87%E6%A0%87%E6%95%B0%E5%80%BC%22)"
        f"&pageNumber=1&pageSize=100"
        f"&sortTypes=-1&sortColumns=REPORT_DATE"
    )
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        data = resp.json()
        items = data.get("result", {}).get("data", []) or []
        biz_map: dict[str, dict] = {}
        total_revenue = 0.0
        for item in items:
            if item.get("ITEM_LEVEL", 0) == 1:
                continue
            name = item.get("ITEM_NAME", "")
            itype = item.get("INDICATOR_TYPE", "")
            val = _safe_float(item.get("DATA_VALUE"))
            if name not in biz_map:
                biz_map[name] = {"revenue": 0.0, "grossMargin": 0.0}
            if itype == "1":
                biz_map[name]["revenue"] = val
                total_revenue += val
            elif itype == "4":
                biz_map[name]["grossMargin"] = val
        result = []
        for name, vals in biz_map.items():
            ratio = (
                (vals["revenue"] / total_revenue * 100) if total_revenue > 0 else 0.0
            )
            result.append(
                {
                    "productName": name,
                    "revenue": vals["revenue"],
                    "revenueRatio": ratio,
                    "grossMargin": vals["grossMargin"],
                }
            )
        result.sort(key=lambda x: x["revenue"], reverse=True)
        return result
    except Exception as e:
        logger.error(f"fetch_f10_main_business({code}) error: {e}")
        return []


def fetch_stock_detail(code: str) -> dict:
    secid = to_em_secid(code)
    url = (
        f"{EM_STOCK_GET_URL}?secid={secid}"
        f"&fields=f57,f58,f84,f85,f100,f104,f105,f108,f112,f113,f114,f115,"
        f"f116,f117,f162,f167,f168,f169,f170,f171,f173,f183,f184,f185,"
        f"f186,f187,f188,f190,f191,f192,f193,f222"
        f"&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        if not data:
            return {}
        return {
            "code": data.get("f57", code),
            "name": data.get("f58", ""),
            "pe": _safe_float(data.get("f162")),
            "pb": _safe_float(data.get("f167")),
            "totalShares": _safe_float(data.get("f84")),
            "circulatingShares": _safe_float(data.get("f85")),
            "marketCap": _safe_float(data.get("f185")),
            "circulatingMarketCap": _safe_float(data.get("f186")),
            "turnoverRate": _safe_float(data.get("f168")),
            "amplitude": _safe_float(data.get("f171")),
            "volume": _safe_float(data.get("f47")),
            "turnover": _safe_float(data.get("f48")),
            "price": _safe_float(data.get("f43")),
            "changePct": _safe_float(data.get("f170")),
            "changeAmt": _safe_float(data.get("f169")),
            "high": _safe_float(data.get("f44")),
            "low": _safe_float(data.get("f45")),
            "open": _safe_float(data.get("f46")),
            "prevClose": _safe_float(data.get("f60")),
            "industry": data.get("f127", ""),
        }
    except Exception as e:
        logger.error(f"fetch_stock_detail({code}) error: {e}")
        return {}


# ============ 12. 人气榜/热门股（东方财富）============


def fetch_popular_stocks(sort_type: str = "popular") -> list[dict]:
    sort_field_map = {
        "popular": "f3",
        "hot": "f8",
        "rise": "f3",
    }
    sort_field = sort_field_map.get(sort_type, "f3")
    url = (
        f"{EM_CLIST_URL}?pn=1&pz=20&po=1&np=1&fltt=2&invt=2"
        f"&fid={sort_field}&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
        f"&fields=f12,f14,f2,f3,f8,f6"
        f"&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        diff = data.get("diff", [])
        results = []
        for idx, item in enumerate(diff):
            results.append(
                {
                    "rank": idx + 1,
                    "code": item.get("f12", ""),
                    "name": item.get("f14", ""),
                    "price": _safe_float(item.get("f2")),
                    "pct": _safe_float(item.get("f3")),
                    "turnoverRate": _safe_float(item.get("f8")),
                    "turnover": _safe_float(item.get("f6")),
                }
            )
        return results
    except Exception as e:
        logger.error(f"fetch_popular_stocks error: {e}")
        return []


# ============ 13. 指数分时（东财 trends2）============


def fetch_index_minute(code: str) -> list[dict]:
    secid = GLOBAL_INDEX_SECIDS.get(code, to_em_secid(code))
    url = (
        f"{EM_TRENDS_URL}?secid={secid}"
        f"&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13"
        f"&fields2=f51,f52,f53,f54,f55,f56,f57,f58"
        f"&ndays=1&iscr=0&nsr=1&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json().get("data", {})
        trends = data.get("trends", [])
        if not trends:
            return []
        result = []
        prev_close = _safe_float(data.get("preClose", 0))
        for line in trends:
            parts = line.split(",")
            if len(parts) < 8:
                continue
            dt_str = parts[0]
            hhmm = dt_str[11:16]
            price = _safe_float(parts[2])
            vol = _safe_float(parts[5])
            change_pct = (
                round((price - prev_close) / prev_close * 100, 2)
                if prev_close > 0
                else 0.0
            )
            result.append(
                {
                    "time": hhmm,
                    "price": price,
                    "volume": vol,
                    "amount": _safe_float(parts[6]),
                    "changePct": change_pct,
                }
            )
        return result
    except Exception as e:
        logger.error(f"fetch_index_minute({code}) error: {e}")
        return []


# ============ 14. 全市场列表（东方财富 clist）============


def fetch_all_stocks(
    page: int = 1, page_size: int = 100, sort_field: str = "f3", sort_order: str = "1"
) -> list[dict]:
    """获取全市场 A 股快照（单页，最多100条）"""
    url = (
        f"{EM_CLIST_URL}?pn={page}&pz={page_size}&po={sort_order}&np=1&fltt=2&invt=2"
        f"&fid={sort_field}&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
        f"&fields=f12,f14,f2,f3,f4,f5,f6,f7,f8,f15,f16,f17,f18,f100,f162,f167,f168,f184,f185,f186"
        f"&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=15)
        data = resp.json().get("data", {})
        diff = data.get("diff", [])
        results = []
        for item in diff:
            results.append(
                {
                    "code": item.get("f12", ""),
                    "name": item.get("f14", ""),
                    "price": _safe_float(item.get("f2")),
                    "changePct": _safe_float(item.get("f3")),
                    "changeAmt": _safe_float(item.get("f4")),
                    "volume": _safe_float(item.get("f5")),
                    "turnover": _safe_float(item.get("f6")),
                    "amplitude": _safe_float(item.get("f7")),
                    "turnoverRate": _safe_float(item.get("f8")),
                    "high": _safe_float(item.get("f15")),
                    "low": _safe_float(item.get("f16")),
                    "open": _safe_float(item.get("f17")),
                    "prevClose": _safe_float(item.get("f18")),
                    "pe": _safe_float(item.get("f162")),
                    "pb": _safe_float(item.get("f167")),
                    "marketCap": _safe_float(item.get("f185")),
                    "circulatingMarketCap": _safe_float(item.get("f186")),
                    "industry": item.get("f100", ""),
                }
            )
        return results
    except Exception as e:
        logger.error(f"fetch_all_stocks error: {e}")
        return []


def fetch_all_stocks_full(sort_field: str = "f3", sort_order: str = "1") -> list[dict]:
    """获取全市场所有 A 股快照（自动分页，并发拉取）"""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    first_page = fetch_all_stocks(1, 100, sort_field, sort_order)
    if not first_page:
        return []

    url = (
        f"{EM_CLIST_URL}?pn=1&pz=100&po={sort_order}&np=1&fltt=2&invt=2"
        f"&fid={sort_field}&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
        f"&_={_ts()}"
    )
    try:
        resp = requests.get(url, timeout=15)
        total = resp.json().get("data", {}).get("total", 100)
    except Exception:
        total = 100

    total_pages = (total + 99) // 100
    if total_pages <= 1:
        return first_page

    all_results = list(first_page)

    def _fetch_page(pn: int) -> list[dict]:
        return fetch_all_stocks(pn, 100, sort_field, sort_order)

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(_fetch_page, pn): pn for pn in range(2, total_pages + 1)
        }
        for future in as_completed(futures):
            try:
                page_data = future.result()
                all_results.extend(page_data)
            except Exception as e:
                logger.error(f"fetch_all_stocks_full page error: {e}")

    logger.info(f"fetch_all_stocks_full: total={total}, fetched={len(all_results)}")
    return all_results


# ============ 10. 股东人数（东方财富 datacenter） ============

_DC_HOLDERNUM_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get"


def _code_to_secucode(code: str) -> str:
    """A 股代码转 SECUCODE 格式：6 开头 → xxxxxx.SH，0/3 开头 → xxxxxx.SZ"""
    if code.startswith("6") or code.startswith("9"):
        return f"{code}.SH"
    return f"{code}.SZ"


def fetch_shareholder_counts(codes: list[str]) -> dict:
    """批量获取股东人数（最新一期），返回 {code: holder_count}"""
    if not codes:
        return {}

    secucodes = [_code_to_secucode(c) for c in codes if len(c) == 6]
    if not secucodes:
        return {}

    result = {}
    # 每批最多 50 只，避免 URL 过长
    batch_size = 50
    for i in range(0, len(secucodes), batch_size):
        batch = secucodes[i : i + batch_size]
        filter_str = ",".join(f'"{sc}"' for sc in batch)
        url = (
            f"{_DC_HOLDERNUM_URL}?reportName=RPT_F10_EH_HOLDERNUM"
            f"&columns=SECUCODE,SECURITY_CODE,HOLDER_TOTAL_NUM,END_DATE"
            f"&sortColumns=END_DATE&sortTypes=-1&pageSize=500"
            f"&filter=(SECUCODE in ({filter_str}))"
            f"&_={_ts()}"
        )
        try:
            resp = requests.get(url, timeout=15)
            data = resp.json().get("result", {})
            rows = data.get("data", []) or []
            seen = set()
            for row in rows:
                secucode = row.get("SECUCODE", "")
                code = row.get("SECURITY_CODE", "")
                if code in seen:
                    continue
                seen.add(code)
                holder_num = row.get("HOLDER_TOTAL_NUM")
                if holder_num is not None:
                    result[code] = int(holder_num)
        except Exception as e:
            logger.error(f"fetch_shareholder_counts batch error: {e}")

    return result
