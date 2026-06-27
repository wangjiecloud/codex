from fastapi import APIRouter, Query
import requests

router = APIRouter()

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.10jqka.com.cn/",
}

_THEME_REFERER = "https://news.10jqka.com.cn/app/theme_front/theme/single/"

HEADLINE_THEME = {"themeId": "headline", "themeName": "头条"}


def _get(url: str, referer: str = "") -> dict:
    headers = dict(_HEADERS)
    if referer:
        headers["Referer"] = referer
    try:
        r = requests.get(url, headers=headers, timeout=10)
        return r.json()
    except Exception as e:
        print(f"[theme] GET {url} error: {e}")
        return {}


def _post(url: str, body: dict, referer: str = "") -> dict:
    headers = dict(_HEADERS)
    headers["Content-Type"] = "application/json"
    if referer:
        headers["Referer"] = referer
    try:
        r = requests.post(url, json=body, headers=headers, timeout=10)
        return r.json()
    except Exception as e:
        print(f"[theme] POST {url} error: {e}")
        return {}


def _fmt_news_item(it: dict) -> dict:
    pic_urls = it.get("picUrl") or []
    pic = (
        pic_urls[0]
        if isinstance(pic_urls, list) and pic_urls
        else (pic_urls if isinstance(pic_urls, str) else "")
    )
    return {
        "id": it.get("itemId") or it.get("id"),
        "title": it.get("title", ""),
        "abstract": it.get("abstract", ""),
        "picUrl": pic,
        "source": it.get("source", ""),
        "time": it.get("time", 0),
        "url": it.get("contentUrl") or it.get("url") or it.get("webUrl") or "",
        "stocks": [
            {
                "name": s.get("stockName", ""),
                "code": s.get("stockCode", ""),
                "market": s.get("stockMarket", ""),
            }
            for s in (it.get("stocks") or [])
        ],
    }


@router.get("/hot")
def get_hot_themes():
    data = _get("https://news.10jqka.com.cn/app/headline/v1/hot-theme")
    themes = data.get("data", [])
    result = [HEADLINE_THEME]
    for t in themes:
        if t.get("themeId") != "TZ-11940":
            result.append({"themeId": t["themeId"], "themeName": t["themeName"]})
    return result


@router.get("/headline")
def get_headline_news(cursor: str = Query("99999999999999999")):
    url = f"https://news.10jqka.com.cn/app/headline/web/v1/list/{cursor}"
    data = _get(url)
    items = data.get("data") or []
    result = []
    for it in items:
        result.append(
            {
                "id": it.get("id", ""),
                "title": it.get("title", ""),
                "abstract": it.get("aiSummary") or "",
                "picUrl": it.get("picUrl") or "",
                "source": it.get("source", ""),
                "time": it.get("ctime", 0),
                "url": it.get("url") or "",
                "tag": it.get("tag") or "",
                "sortScore": it.get("sortScore", 0),
                "stocks": [
                    {
                        "name": s.get("stockName", ""),
                        "code": s.get("stockCode", ""),
                        "market": s.get("stockMarket", ""),
                    }
                    for s in (it.get("stocks") or [])
                ],
            }
        )
    next_cursor = str(result[-1]["sortScore"]) if result else ""
    has_more = len(result) > 0
    return {"items": result, "hasMore": has_more, "nextCursor": next_cursor}


@router.get("/{theme_id}")
def get_theme_meta(theme_id: str):
    data = _get(f"https://news.10jqka.com.cn/app/theme/v1/theme/?themeId={theme_id}")
    d = data.get("data", {})
    index_code = None
    content_tabs = []
    for mod in d.get("module", []):
        if mod.get("type") == 3:
            index_code = mod.get("id")
        if mod.get("type") == 2:
            items = mod.get("items") or []
            for it in items:
                content_tabs.append({"id": it.get("id"), "name": it.get("name", "")})
    return {
        "themeId": theme_id,
        "title": d.get("title"),
        "content": d.get("content"),
        "indexCode": str(index_code) if index_code else None,
        "contentId": content_tabs[0]["id"] if content_tabs else None,
        "contentName": content_tabs[0]["name"] if content_tabs else None,
        "contentTabs": content_tabs,
    }


@router.get("/{theme_id}/stocks")
def get_theme_stocks(theme_id: str, index_code: str = Query(...)):
    rank_data = _get(
        f"https://news.10jqka.com.cn/app/concept_v2_api/open/api/concept/quote/v1/get_block_stock_rank"
        f"?indexCode={index_code}&marketId=48",
        referer=f"{_THEME_REFERER}{theme_id}",
    )
    d = rank_data.get("data", {})
    block = d.get("block", {})
    stocks_raw = d.get("stockList", [])

    market_map: dict = {}
    for s in stocks_raw:
        mkt = s.get("marketId", "17")
        market_map.setdefault(mkt, []).append(s["stockCode"])

    prices: dict = {}
    if market_map:
        code_list = [
            {"market": mkt, "codes": codes} for mkt, codes in market_map.items()
        ]
        snap = _post(
            "https://quota-h.10jqka.com.cn/fuyao/common_hq_aggr/quote/v1/multi_last_snapshot",
            {
                "code_list": code_list,
                "trade_class": "intraday",
                "data_fields": ["55", "6", "19", "264648", "199112", "10"],
                "lang": "zh_cn",
                "gpid": 1,
            },
        )
        for qd in (snap.get("data") or {}).get("quote_data", []):
            vals = (qd.get("value") or [[]])[0]
            fields = qd.get("data_fields", [])
            val_map = dict(zip(fields, vals))
            prices[qd["code"]] = {
                "latest": val_map.get("10"),
                "gain": val_map.get("199112"),
                "change": val_map.get("264648"),
            }

    result_stocks = []
    for s in stocks_raw:
        code = s["stockCode"]
        p = prices.get(code, {})
        result_stocks.append(
            {
                "code": code,
                "name": s["stockName"],
                "market": s.get("marketId", "17"),
                "gain": float(s.get("gain", 0)),
                "latest": p.get("latest"),
                "change": p.get("change"),
            }
        )

    block_snap = _post(
        "https://quota-h.10jqka.com.cn/fuyao/common_hq_aggr/quote/v1/multi_last_snapshot",
        {
            "code_list": [{"market": "48", "codes": [index_code]}],
            "trade_class": "intraday",
            "data_fields": ["6", "10", "19", "55", "199112", "264648"],
            "lang": "zh_cn",
            "gpid": 1,
        },
    )
    block_price = {}
    for qd in (block_snap.get("data") or {}).get("quote_data", []):
        vals = (qd.get("value") or [[]])[0]
        fields = qd.get("data_fields", [])
        val_map = dict(zip(fields, vals))
        block_price = {
            "latest": val_map.get("10"),
            "prevClose": val_map.get("6"),
            "change": val_map.get("264648"),
        }

    return {
        "blockName": block.get("blockName"),
        "gain": float(block.get("gain", 0)),
        "latest": block_price.get("latest"),
        "prevClose": block_price.get("prevClose"),
        "change": block_price.get("change"),
        "stocks": result_stocks,
    }


@router.get("/{theme_id}/trend")
def get_theme_trend(theme_id: str, index_code: str = Query(...)):
    data = _post(
        "https://quota-h.10jqka.com.cn/fuyao/common_hq_aggr/quote/v1/single_trend",
        {
            "code_list": [{"codes": [index_code], "market": "48"}],
            "trade_date": 0,
            "gpid": 2,
            "time_zone": "Asia/Shanghai",
            "trade_class": "intraday",
        },
    )
    qd_list = (data.get("data") or {}).get("quote_data", [])
    if not qd_list:
        return {"basePrice": 0, "points": []}
    qd = qd_list[0]
    base_price = qd.get("base_price", 0)
    points = [
        {"time": v[0], "price": v[1]} for v in (qd.get("value") or []) if len(v) >= 2
    ]
    return {"basePrice": base_price, "points": points}


@router.get("/{theme_id}/news")
def get_theme_news(
    theme_id: str,
    content_id: int = Query(...),
    page: int = Query(1, ge=1),
    size: int = Query(15, le=30),
):
    data = _get(
        f"https://news.10jqka.com.cn/app/theme/web/v1/content/?id={content_id}&page={page}&size={size}",
        referer=f"{_THEME_REFERER}{theme_id}",
    )
    items = data.get("data") or []
    has_more = len(items) > 0
    return {
        "items": [_fmt_news_item(it) for it in items],
        "hasMore": has_more,
        "page": page,
    }
