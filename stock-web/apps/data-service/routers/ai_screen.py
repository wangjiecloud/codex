"""
AI 智能选股 — 混合模式（实时数据 + 内存过滤）

流程：
1. LLM 将用户自然语言转换为策略 JSON
2. 调用东方财富 clist API 获取全市场 A 股快照（含行情/市值/PE/PB/换手率/行业）
3. 在内存中按 market_filters 过滤
4. 如有 technical_filters，对候选股票批量拉取 K 线，在内存中计算技术指标并过滤
5. 返回结果（SSE 流式）
"""

import os
import json
import time
import logging
import sqlite3
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import requests
from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from starlette.responses import StreamingResponse

import realtime_data

logger = logging.getLogger(__name__)
router = APIRouter()

DB_PATH = os.path.join(
    os.path.expanduser("~"),
    "codespace/self/SuperJAI/oss/agent/codex/stock-web/apps/data-service/stock_data.db",
)

_LLM_BASE_URL = "https://apiprod.midea.com/llm/f-devops-python-litellm/v1"


def _load_llm_config() -> dict:
    config_path = os.path.expanduser("~/.config/opencode/llm-config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                cfg = json.load(f)
            return {
                "authorization": cfg.get("authorization", ""),
                "user": cfg.get("user", ""),
            }
        except Exception:
            pass
    return {"authorization": "", "user": ""}


def _load_current_model() -> str:
    config_path = os.path.expanduser("~/.codex/config.toml")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                for line in f:
                    stripped = line.strip()
                    if stripped.startswith("model ") or stripped.startswith("model\t"):
                        val = stripped.split("=", 1)[1].strip().strip('"')
                        if val:
                            return val
        except Exception:
            pass
    return "hw-glm-5"


def _call_llm(prompt: str, system: str = "", max_tokens: int = 4096) -> str:
    cfg = _load_llm_config()
    model = _load_current_model()
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    resp = requests.post(
        f"{_LLM_BASE_URL}/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": cfg["authorization"],
            "user": cfg["user"],
        },
        json={
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.1,
        },
        timeout=60,
    )
    if not resp.ok:
        raise RuntimeError(f"LLM API error {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    return data.get("choices", [{}])[0].get("message", {}).get("content", "")


def _call_llm_json(prompt: str, system: str = "") -> dict:
    raw = _call_llm(prompt, system)
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        while lines and lines[0].strip().startswith("```"):
            lines.pop(0)
        while lines and lines[-1].strip().startswith("```"):
            lines.pop()
        raw = "\n".join(lines)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        import re

        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        raise RuntimeError(f"LLM 返回的不是有效 JSON: {raw[:300]}...")


# ─── 技术指标计算 ─────────────────────────────────────────────────────────


def _is_limit_up(change_pct: float, code: str) -> bool:
    if code.startswith("30") or code.startswith("68"):
        return change_pct >= 19.9
    return change_pct >= 9.9


def _calc_ma(bars: list, period: int) -> Optional[float]:
    closes = [b["close"] for b in bars[-period:]]
    if len(closes) < period:
        return None
    return sum(closes) / period


def _calc_vol_avg(bars: list, period: int) -> Optional[float]:
    vols = [b["volume"] for b in bars[-period:]]
    if len(vols) < period:
        return None
    return sum(vols) / vols


def _check_low_volume(bars: list, params: dict, code: str) -> dict:
    """地量判定：某日成交量低于近20日均量的阈值比例"""
    days_ago = params.get("days_ago", 1)
    threshold = params.get("threshold", 0.5)
    if len(bars) < 21:
        return {"pass": False, "detail": "K线不足20日"}
    target_idx = -days_ago
    target_bar = bars[target_idx]
    vol_avg_20d = sum(b["volume"] for b in bars[-20:]) / 20
    if vol_avg_20d <= 0:
        return {"pass": False, "detail": "20日均量为0"}
    ratio = target_bar["volume"] / vol_avg_20d
    passed = ratio < threshold
    return {
        "pass": passed,
        "detail": f"第{days_ago}天量比={ratio:.2f} (<{threshold}={'是' if passed else '否'})",
        "extra": {"vol_ratio": round(ratio, 4)},
    }


def _check_ma_above(bars: list, params: dict, code: str) -> dict:
    """收盘价在均线之上"""
    period = params.get("period", 20)
    if len(bars) < period + 1:
        return {"pass": False, "detail": f"K线不足{period}日"}
    ma = _calc_ma(bars, period)
    close = bars[-1]["close"]
    passed = close > ma if ma else False
    return {
        "pass": passed,
        "detail": f"close={close:.2f} > MA{period}={ma:.2f}"
        if ma
        else f"MA{period}无法计算",
        "extra": {f"ma{period}": round(ma, 2)} if ma else {},
    }


def _check_ma_below(bars: list, params: dict, code: str) -> dict:
    """收盘价在均线之下"""
    period = params.get("period", 10)
    if len(bars) < period + 1:
        return {"pass": False, "detail": f"K线不足{period}日"}
    ma = _calc_ma(bars, period)
    close = bars[-1]["close"]
    passed = close < ma if ma else False
    return {
        "pass": passed,
        "detail": f"close={close:.2f} < MA{period}={ma:.2f}"
        if ma
        else f"MA{period}无法计算",
        "extra": {f"ma{period}": round(ma, 2)} if ma else {},
    }


def _check_limit_up_count(bars: list, params: dict, code: str) -> dict:
    """近N年涨停次数"""
    years = params.get("years", 3)
    min_count = params.get("min_count", 10)
    from datetime import datetime, timedelta

    cutoff = (datetime.now() - timedelta(days=years * 365)).strftime("%Y-%m-%d")
    count = sum(
        1 for b in bars if b["time"] >= cutoff and _is_limit_up(b["changePct"], code)
    )
    passed = count >= min_count
    return {
        "pass": passed,
        "detail": f"近{years}年涨停{count}次 (>= {min_count}={'是' if passed else '否'})",
        "extra": {"limit_up_count": count},
    }


def _check_consecutive_up(bars: list, params: dict, code: str) -> dict:
    """近N日连续阳线"""
    days = params.get("days", 5)
    if len(bars) < days:
        return {"pass": False, "detail": f"K线不足{days}日"}
    recent = bars[-days:]
    passed = all(b["close"] > b["open"] for b in recent)
    return {
        "pass": passed,
        "detail": f"近{days}日连续阳线={'是' if passed else '否'}",
    }


def _check_near_low(bars: list, params: dict, code: str) -> dict:
    """距近N月低点不超过X%"""
    months = params.get("months", 3)
    pct = params.get("pct", 20)
    days = months * 21
    if len(bars) < days:
        days = len(bars)
    if days < 5:
        return {"pass": False, "detail": "K线不足"}
    recent = bars[-days:]
    low_min = min(b["low"] for b in recent)
    close = bars[-1]["close"]
    if low_min <= 0:
        return {"pass": False, "detail": "最低价为0"}
    rise_pct = (close - low_min) / low_min * 100
    passed = rise_pct <= pct
    return {
        "pass": passed,
        "detail": f"距{months}月低点涨幅={rise_pct:.1f}% (<= {pct}={'是' if passed else '否'})",
        "extra": {"low_3m": round(low_min, 2), "rise_from_low_pct": round(rise_pct, 2)},
    }


def _check_volume_increasing(bars: list, params: dict, code: str) -> dict:
    """成交量温和放大（5日均量 > 20日均量）"""
    if len(bars) < 20:
        return {"pass": False, "detail": "K线不足20日"}
    vol_avg_5 = sum(b["volume"] for b in bars[-5:]) / 5
    vol_avg_20 = sum(b["volume"] for b in bars[-20:]) / 20
    passed = vol_avg_5 > vol_avg_20
    return {
        "pass": passed,
        "detail": f"5日均量={vol_avg_5:.0f} > 20日均量={vol_avg_20:.0f}={'是' if passed else '否'}",
    }


def _check_volume_decreasing(bars: list, params: dict, code: str) -> dict:
    """连续缩量：近N日成交量逐日递减（允许1日例外）"""
    days = params.get("days", 5)
    tolerance = params.get("tolerance", 1)
    if len(bars) < days + 5:
        return {"pass": False, "detail": f"K线不足{days + 5}日"}
    recent = bars[-days:]
    violations = 0
    for i in range(1, len(recent)):
        if recent[i]["volume"] > recent[i - 1]["volume"]:
            violations += 1
    passed = violations <= tolerance
    detail_parts = [f"{b['volume']:,.0f}" for b in recent]
    return {
        "pass": passed,
        "detail": f"近{days}日量: {' > '.join(detail_parts)}，放量日={violations} (<= {tolerance}={'是' if passed else '否'})",
    }


_TECH_CHECKERS = {
    "low_volume": _check_low_volume,
    "ma_above": _check_ma_above,
    "ma_below": _check_ma_below,
    "limit_up_count": _check_limit_up_count,
    "consecutive_up": _check_consecutive_up,
    "near_low": _check_near_low,
    "volume_increasing": _check_volume_increasing,
    "volume_decreasing": _check_volume_decreasing,
}


# ─── 策略执行 ─────────────────────────────────────────────────────────


def _apply_market_filters(stocks: list, filters: dict) -> list:
    if not filters:
        return stocks
    result = []
    for s in stocks:
        if (
            filters.get("change_min") is not None
            and s["changePct"] < filters["change_min"]
        ):
            continue
        if (
            filters.get("change_max") is not None
            and s["changePct"] > filters["change_max"]
        ):
            continue
        if filters.get("price_min") is not None and s["price"] < filters["price_min"]:
            continue
        if filters.get("price_max") is not None and s["price"] > filters["price_max"]:
            continue
        if (
            filters.get("turnover_rate_min") is not None
            and s["turnoverRate"] < filters["turnover_rate_min"]
        ):
            continue
        if (
            filters.get("turnover_rate_max") is not None
            and s["turnoverRate"] > filters["turnover_rate_max"]
        ):
            continue
        if filters.get("pe_min") is not None and s["pe"] < filters["pe_min"]:
            continue
        if filters.get("pe_max") is not None and s["pe"] > filters["pe_max"]:
            continue
        if filters.get("pb_min") is not None and s["pb"] < filters["pb_min"]:
            continue
        if filters.get("pb_max") is not None and s["pb"] > filters["pb_max"]:
            continue
        if filters.get("market_cap_min") is not None:
            if s["marketCap"] < filters["market_cap_min"]:
                continue
        if filters.get("market_cap_max") is not None:
            if s["marketCap"] > filters["market_cap_max"]:
                continue
        result.append(s)
    return result


def _apply_exclude_st(stocks: list, exclude: bool) -> list:
    if not exclude:
        return stocks
    return [s for s in stocks if "ST" not in s["name"].upper()]


def _apply_industry_keywords(stocks: list, keywords: list) -> list:
    if not keywords:
        return stocks
    result = []
    for s in stocks:
        ind = s.get("industry", "")
        if any(kw in ind for kw in keywords):
            result.append(s)
    return result


def _query_industry_stocks_from_db(industry_ids: list) -> set:
    """从 industry_node 表查结构性股票池"""
    if not industry_ids:
        return set()
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        codes = set()
        placeholders = ",".join(["?" for _ in industry_ids])
        rows = cursor.execute(
            f"SELECT stocks FROM industry_node WHERE industry_id IN ({placeholders})",
            industry_ids,
        ).fetchall()
        conn.close()
        import json as _json

        for (stocks_json,) in rows:
            if not stocks_json:
                continue
            try:
                arr = _json.loads(stocks_json)
                if isinstance(arr, list):
                    for c in arr:
                        if isinstance(c, str) and len(c) == 6:
                            codes.add(c)
            except Exception:
                pass
        return codes
    except Exception as e:
        logger.error(f"query industry stocks from db error: {e}")
        return set()


def _fetch_kline_with_cache(code: str, count: int = 260) -> list:
    try:
        return realtime_data.fetch_kline(code, "daily", count)
    except Exception as e:
        logger.error(f"fetch_kline({code}) error: {e}")
        return []


def _apply_technical_filters(
    stocks: list, tech_filters: list, max_kline_stocks: int = 200
) -> tuple:
    """对候选股票批量拉 K 线，计算技术指标并过滤。返回 (pass_list, reject_info)"""
    if not tech_filters:
        return stocks, []

    candidates = stocks[:max_kline_stocks]
    if len(stocks) > max_kline_stocks:
        logger.warning(
            f"technical_filters: 候选 {len(stocks)} 只 > 上限 {max_kline_stocks}，仅处理前 {max_kline_stocks} 只"
        )

    max_years = 3
    for f in tech_filters:
        if f.get("type") == "limit_up_count" and f.get("years", 3) > max_years:
            max_years = f["years"]
    kline_count = max(260, max_years * 250)

    results = []
    reject_info = []

    with ThreadPoolExecutor(max_workers=10) as executor:
        future_map = {
            executor.submit(_fetch_kline_with_cache, s["code"], kline_count): s
            for s in candidates
        }
        for future in as_completed(future_map):
            stock = future_map[future]
            try:
                bars = future.result()
            except Exception:
                bars = []
            if not bars or len(bars) < 5:
                reject_info.append(
                    {
                        "code": stock["code"],
                        "name": stock["name"],
                        "reason": "K线数据不足",
                    }
                )
                continue

            passed_all = True
            extra_data = {}
            for tf in tech_filters:
                checker = _TECH_CHECKERS.get(tf.get("type", ""))
                if not checker:
                    continue
                result = checker(bars, tf, stock["code"])
                if not result["pass"]:
                    passed_all = False
                    reject_info.append(
                        {
                            "code": stock["code"],
                            "name": stock["name"],
                            "reason": result["detail"],
                        }
                    )
                    break
                extra_data.update(result.get("extra", {}))

            if passed_all:
                stock_copy = dict(stock)
                stock_copy["_tech"] = extra_data
                results.append(stock_copy)

    return results, reject_info


def _sort_stocks(stocks: list, order_by: str, order_desc: bool) -> list:
    field_map = {
        "change": "changePct",
        "price": "price",
        "turnover_rate": "turnoverRate",
        "pe": "pe",
        "pb": "pb",
        "market_cap": "marketCap",
        "volume": "volume",
        "turnover": "turnover",
    }
    key = field_map.get(order_by, "changePct")
    return sorted(stocks, key=lambda x: x.get(key, 0), reverse=order_desc)


def _format_result_rows(stocks: list) -> tuple:
    """格式化结果，返回 (columns, rows)"""
    columns = [
        {"key": "code", "label": "代码"},
        {"key": "name", "label": "名称"},
        {"key": "price", "label": "现价"},
        {"key": "change", "label": "涨跌幅(%)"},
        {"key": "turnover_rate", "label": "换手率(%)"},
        {"key": "pe", "label": "PE"},
        {"key": "pb", "label": "PB"},
        {"key": "cap_yi", "label": "市值(亿)"},
        {"key": "holder_num", "label": "股东人数"},
        {"key": "industry", "label": "行业"},
    ]

    rows = []
    for s in stocks:
        holder_num = s.get("holder_num")
        rows.append(
            [
                s["code"],
                s["name"],
                str(round(s["price"], 2)),
                str(round(s["changePct"], 2)),
                str(round(s["turnoverRate"], 2)),
                str(round(s["pe"], 2)) if s["pe"] else "-",
                str(round(s["pb"], 2)) if s["pb"] else "-",
                str(round(s["marketCap"] / 1e8, 2)) if s["marketCap"] else "-",
                str(holder_num) if holder_num else "-",
                s.get("industry", "") or "未分类",
            ]
        )
    return columns, rows


# ─── LLM System Prompt ─────────────────────────────────────────────────

_SYSTEM_PROMPT = """你是A股智能选股助手，将用户的自然语言需求转换为一个选股策略 JSON。

数据来源：东方财富全市场快照（实时获取，不依赖数据库），包含所有A股的以下字段：
- price: 现价（元）
- changePct: 涨跌幅（百分比数值，如 3.25 表示涨3.25%，-5.00 表示跌5%）
- volume: 成交量
- turnover: 成交额（元）
- turnoverRate: 换手率（百分比数值，如 1.5 表示换手1.5%）
- amplitude: 振幅（百分比数值）
- pe: 市盈率（动态）
- pb: 市净率
- marketCap: 总市值（元，500亿=50000000000）
- industry: 行业（如"半导体"、"计算机设备"、"化学制品"）
- open/high/low/prevClose: 今开/最高/最低/昨收

技术指标（需要K线数据，后端自动拉取并计算，你只需声明要哪些指标）：
1. {"type": "low_volume", "days_ago": 1, "threshold": 0.5} — 地量：N天前成交量低于20日均量的阈值比例
   - "昨日地量" → days_ago=1, threshold=0.5
   - "今日地量" → days_ago=0, threshold=0.5（注意：days_ago=0 实际取最新一天）
   - "极度地量" → threshold=0.3
2. {"type": "ma_above", "period": 20} — 收盘价在均线之上（period=5/10/20/60）
3. {"type": "ma_below", "period": 10} — 收盘价在均线之下
4. {"type": "limit_up_count", "years": 3, "min_count": 10} — 近N年涨停次数>=M
   主板涨停≈+9.9%，创业板/科创板涨停≈+19.9%，自动区分板块
   "偶有涨停"=3, "多次涨停"=10, "频繁涨停"=15
5. {"type": "consecutive_up", "days": 5} — 近N日连续阳线（close>open）
6. {"type": "near_low", "months": 3, "pct": 20} — 距近N月最低点涨幅不超过X%
7. {"type": "volume_increasing", "days": 5} — 成交量温和放大（5日均量>20日均量）
8. {"type": "volume_decreasing", "days": 5, "tolerance": 1} — 连续缩量：近N日成交量逐日递减，tolerance表示允许的放量日数（默认允许1日例外）
   - "连续缩量" → days=5, tolerance=1
   - "连续3日缩量" → days=3, tolerance=0
   - "缩量" → days=5, tolerance=2（较宽松）
   注意：连续缩量和地量是不同概念，缩量看趋势（量逐日递减），地量看绝对水平（低于20日均量的50%）。用户说"连续缩量"必须用 volume_decreasing，不能只用 low_volume

规则：
- market_cap 单位元：500亿=50000000000
- 涨跌幅方向：涨幅=正数，跌幅=负数（change_max=-3 表示跌幅超过3%的股票）
- "排除ST" 默认 exclude_st=true
- 产业关键词用 industry_keywords（匹配 industry 字段，如["半导体","计算机"]）
- 排序字段：change/price/turnover_rate/pe/pb/market_cap/volume/turnover
- 用户未指定排序时默认 order_by="change", order_desc=true
- 用户说"前N名/top N"时设 limit=N，否则不设 limit（设为 null）
- 如果需求无法用以上条件表达，返回 {"UNSUPPORTED": true}

只输出 JSON，不加任何解释和代码块标记。"""


def _build_strategy_prompt(query: str) -> str:
    return f"""用户需求：{query}

请生成选股策略 JSON。格式如下：
{{
  "exclude_st": true,
  "industry_keywords": [],
  "market_filters": {{
    "change_min": null,
    "change_max": null,
    "price_min": null,
    "price_max": null,
    "turnover_rate_min": null,
    "turnover_rate_max": null,
    "pe_min": null,
    "pe_max": null,
    "pb_min": null,
    "pb_max": null,
    "market_cap_min": null,
    "market_cap_max": null
  }},
  "technical_filters": [],
  "order_by": "change",
  "order_desc": true,
  "limit": null
}}

注意：不需要的字段填 null，不要省略。只输出 JSON。"""


def _format_strategy_text(strategy: dict) -> str:
    """将策略 JSON 格式化为可读文本（替代旧 SQL 显示）"""
    parts = []
    if strategy.get("exclude_st"):
        parts.append("排除ST")
    kw = strategy.get("industry_keywords", [])
    if kw:
        parts.append(f"行业包含: {','.join(kw)}")
    mf = strategy.get("market_filters", {})
    if mf:
        filter_parts = []
        for k, v in mf.items():
            if v is not None:
                filter_parts.append(f"{k}={v}")
        if filter_parts:
            parts.append(f"行情过滤: {', '.join(filter_parts)}")
    tf = strategy.get("technical_filters", [])
    if tf:
        tech_parts = []
        for t in tf:
            tech_parts.append(json.dumps(t, ensure_ascii=False))
        parts.append(f"技术指标: {'; '.join(tech_parts)}")
    ob = strategy.get("order_by", "change")
    od = "降序" if strategy.get("order_desc", True) else "升序"
    parts.append(f"排序: {ob} {od}")
    if strategy.get("limit"):
        parts.append(f"限 {strategy['limit']} 条")
    return " | ".join(parts) if parts else "无过滤条件"


# ─── SSE 流式接口 ─────────────────────────────────────────────────────────


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/screen")
async def ai_screen(request: Request):
    body = await request.json()
    query = body.get("query", "").strip()
    if not query:
        return {"error": "查询条件不能为空"}

    async def event_stream():
        try:
            yield _sse({"type": "status", "message": "正在分析选股条件..."})

            # ── 阶段1：LLM 生成策略 JSON ──
            strategy = _call_llm_json(_build_strategy_prompt(query), _SYSTEM_PROMPT)

            if strategy.get("UNSUPPORTED"):
                yield _sse(
                    {"type": "error", "message": "该查询超出支持范围，请尝试其他条件。"}
                )
                return

            strategy_text = _format_strategy_text(strategy)
            yield _sse({"type": "sql", "sql": strategy_text})
            yield _sse({"type": "status", "message": "正在获取全市场行情..."})

            # ── 阶段2：获取全市场快照 ──
            all_stocks = await run_in_threadpool(
                realtime_data.fetch_all_stocks_full, "f3", "1"
            )
            if not all_stocks:
                yield _sse({"type": "error", "message": "获取全市场行情失败"})
                return

            # 只保留 A 股，过滤停牌/退市股（price <= 0）
            all_stocks = [
                s
                for s in all_stocks
                if realtime_data.is_a_share(s["code"]) and s.get("price", 0) > 0
            ]

            yield _sse(
                {
                    "type": "status",
                    "message": f"全市场 {len(all_stocks)} 只股票，正在过滤...",
                }
            )

            # ── 阶段3：应用市场过滤 ──
            market_filters = strategy.get("market_filters", {})
            filtered = _apply_market_filters(all_stocks, market_filters)
            filtered = _apply_exclude_st(filtered, strategy.get("exclude_st", True))
            filtered = _apply_industry_keywords(
                filtered, strategy.get("industry_keywords", [])
            )

            # ── 阶段4：结构性过滤（从 DB 查 industry_node） ──
            industry_ids = strategy.get("industry_ids", [])
            if industry_ids:
                db_codes = await run_in_threadpool(
                    _query_industry_stocks_from_db, industry_ids
                )
                if db_codes:
                    filtered = [s for s in filtered if s["code"] in db_codes]

            yield _sse(
                {
                    "type": "status",
                    "message": f"行情过滤后 {len(filtered)} 只"
                    + (
                        "，正在拉取K线计算技术指标..."
                        if strategy.get("technical_filters")
                        else "，正在排序..."
                    ),
                }
            )

            # ── 阶段5：技术指标过滤 ──
            tech_filters = strategy.get("technical_filters", [])
            if tech_filters and filtered:
                if len(filtered) > 200:
                    yield _sse(
                        {
                            "type": "status",
                            "message": f"候选 {len(filtered)} 只 > 200，仅处理换手率最低的200只以加速K线拉取...",
                        }
                    )
                    filtered = sorted(
                        filtered, key=lambda x: x.get("turnoverRate", 999)
                    )[:200]

                filtered, reject_info = await run_in_threadpool(
                    _apply_technical_filters, filtered, tech_filters
                )

                if not filtered:
                    yield _sse(
                        {
                            "type": "status",
                            "message": f"技术指标过滤后无结果。淘汰详情：{len(reject_info)}只未通过。正在尝试放宽...",
                        }
                    )

                    retry_strategy = _call_llm_json(
                        f"用户需求：{query}\n\n上一次策略执行后结果为空。策略：{json.dumps(strategy, ensure_ascii=False)}\n淘汰最多的原因可能是技术指标过严。请适当放宽条件后重新生成策略 JSON。只输出JSON。",
                        _SYSTEM_PROMPT,
                    )
                    if not retry_strategy.get("UNSUPPORTED"):
                        strategy = retry_strategy
                        strategy_text = _format_strategy_text(strategy)
                        yield _sse({"type": "sql", "sql": strategy_text})
                        yield _sse(
                            {"type": "status", "message": "已放宽条件，重新执行..."}
                        )

                        all_stocks_2 = all_stocks
                        filtered_2 = _apply_market_filters(
                            all_stocks_2, strategy.get("market_filters", {})
                        )
                        filtered_2 = _apply_exclude_st(
                            filtered_2, strategy.get("exclude_st", True)
                        )
                        filtered_2 = _apply_industry_keywords(
                            filtered_2, strategy.get("industry_keywords", [])
                        )
                        tech_2 = strategy.get("technical_filters", [])
                        if tech_2 and filtered_2:
                            if len(filtered_2) > 200:
                                filtered_2 = sorted(
                                    filtered_2, key=lambda x: x.get("turnoverRate", 999)
                                )[:200]
                            filtered_2, _ = await run_in_threadpool(
                                _apply_technical_filters, filtered_2, tech_2
                            )
                        filtered = filtered_2

            if not filtered:
                yield _sse({"type": "empty"})
                return

            # ── 阶段6：排序 + 限制 ──
            order_by = strategy.get("order_by", "change")
            order_desc = strategy.get("order_desc", True)
            filtered = _sort_stocks(filtered, order_by, order_desc)

            limit = strategy.get("limit")
            if limit:
                filtered = filtered[:limit]

            # ── 阶段7：获取股东人数 ──
            yield _sse(
                {
                    "type": "status",
                    "message": f"正在获取 {len(filtered)} 只股票的股东人数...",
                }
            )
            try:
                holder_counts = await run_in_threadpool(
                    realtime_data.fetch_shareholder_counts,
                    [s["code"] for s in filtered],
                )
                for s in filtered:
                    s["holder_num"] = holder_counts.get(s["code"], None)
            except Exception as e:
                logger.error(f"fetch_shareholder_counts error: {e}")
                for s in filtered:
                    s.setdefault("holder_num", None)

            yield _sse(
                {"type": "status", "message": f"正在格式化 {len(filtered)} 只结果..."}
            )

            columns, rows = _format_result_rows(filtered)

            yield _sse(
                {
                    "type": "result",
                    "columns": columns,
                    "rows": rows,
                    "total": len(rows),
                }
            )

        except Exception as e:
            logger.error(f"ai_screen error: {e}", exc_info=True)
            yield _sse({"type": "error", "message": f"查询失败：{str(e)}"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
