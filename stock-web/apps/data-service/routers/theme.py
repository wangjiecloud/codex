from typing import Optional
from fastapi import APIRouter, Query
import requests
import threading
import sqlite3
import os
from datetime import datetime

router = APIRouter()

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.10jqka.com.cn/",
}

_THEME_REFERER = "https://news.10jqka.com.cn/app/theme_front/theme/single/"

HEADLINE_THEME = {"themeId": "headline", "themeName": "头条"}

_theme_news_sync_lock = threading.Lock()
_theme_news_syncing = False


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


def _db_path() -> str:
    import os
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "stock_data.db")


def _fetch_popular_stocks_realtime(sort: str) -> list:
    """
    实时拉取东方财富人气榜/飙升榜（100条），补充行情和名称，返回列表。
    sort: 'hot' | 'rise'
    """
    import math, sqlite3, concurrent.futures
    import requests as _req

    def safe_float(v):
        try:
            f = float(v)
            return None if math.isnan(f) else f
        except Exception:
            return None

    def parse_em_code(sc: str):
        sc = str(sc)
        if sc.startswith("SZ"):
            return sc[2:], "33"
        elif sc.startswith("SH"):
            return sc[2:], "17"
        else:
            return sc, "17"

    # 拉取 100 条原始排名
    try:
        resp = _req.post(
            "https://emappdata.eastmoney.com/stockrank/getAllCurrentList",
            json={
                "appId": "appId01",
                "globalId": "786e4c21-70dc-435a-93bb-38",
                "marketType": "",
                "pageNo": 1,
                "pageSize": 100,
            },
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        raw_data = resp.json().get("data", [])
    except Exception as e:
        print(f"[popular-stocks] rank fetch error ({sort}): {e}")
        return []

    if not raw_data:
        return []

    # 飙升榜：按 hisRc 降序重新排名
    if sort == "rise":
        raw_data = sorted(raw_data, key=lambda x: x.get("hisRc", 0), reverse=True)

    stocks_info = []
    market_map: dict = {}
    for i, item in enumerate(raw_data):
        code, market = parse_em_code(item.get("sc", ""))
        stocks_info.append({
            "code": code,
            "market": market,
            "rank": item.get("rk", 0) if sort == "hot" else i + 1,
            "hisRc": item.get("hisRc", 0),
        })
        market_map.setdefault(market, []).append(code)

    # 同花顺 quota 获取实时行情
    prices: dict = {}
    if market_map:
        code_list = [{"market": mkt, "codes": codes} for mkt, codes in market_map.items()]
        snap = _post(
            "https://quota-h.10jqka.com.cn/fuyao/common_hq_aggr/quote/v1/multi_last_snapshot",
            {
                "code_list": code_list,
                "trade_class": "intraday",
                "data_fields": ["10", "199112", "264648", "6", "1"],
                "lang": "zh_cn",
                "gpid": 1,
            },
        )
        for qd in (snap.get("data") or {}).get("quote_data", []):
            vals = (qd.get("value") or [[]])[0]
            fields = qd.get("data_fields", [])
            val_map = dict(zip(fields, vals))
            prices[qd["code"]] = {
                "name": val_map.get("1", ""),
                "price": safe_float(val_map.get("10")),
                "pct": safe_float(val_map.get("199112")),
                "change": safe_float(val_map.get("264648")),
                "prevClose": safe_float(val_map.get("6")),
            }

    # 补充缺失名称：先查 stock_meta
    missing_codes = []
    try:
        conn = sqlite3.connect(_db_path())
        for s in stocks_info:
            code = s["code"]
            if not (prices.get(code) or {}).get("name"):
                row = conn.execute("SELECT name FROM stock_meta WHERE code=?", (code,)).fetchone()
                if row:
                    prices.setdefault(code, {})["name"] = row[0]
                else:
                    missing_codes.append(code)
        conn.close()
    except Exception as e:
        print(f"[popular-stocks] db name lookup error: {e}")
        missing_codes = [s["code"] for s in stocks_info if not (prices.get(s["code"]) or {}).get("name")]

    # 再用东方财富搜索接口补全
    if missing_codes:
        def fetch_em_name(code: str):
            try:
                r = _req.get(
                    f"https://searchapi.eastmoney.com/api/suggest/get"
                    f"?input={code}&type=14&token=D43BF722C8E33BDC906FB84D85E326&count=1",
                    headers={"User-Agent": "Mozilla/5.0"},
                    timeout=5,
                )
                data = r.json()
                items = (data.get("QuotationCodeTable") or {}).get("Data") or []
                if items:
                    return code, items[0].get("Name", "")
            except Exception:
                pass
            return code, ""

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            for code, name in pool.map(fetch_em_name, missing_codes):
                if name:
                    prices.setdefault(code, {})["name"] = name

    result = []
    for s in stocks_info:
        code = s["code"]
        p = prices.get(code, {})
        result.append({
            "rank": s["rank"],
            "code": code,
            "name": p.get("name") or code,
            "price": p.get("price"),
            "pct": p.get("pct"),
            "change": p.get("change"),
            "prevClose": p.get("prevClose"),
            "hisRc": s["hisRc"],
        })
    return result


@router.get("/popular-stocks")
def get_popular_stocks(
    sort: str = Query("hot", description="hot=人气榜 rise=飙升榜"),
):
    """从数据库缓存读取人气榜/飙升榜（最多100条），包含申万行业信息"""
    import sqlite3

    try:
        conn = sqlite3.connect(_db_path())
        # LEFT JOIN 申万行业表，获取二级行业名称
        rows = conn.execute(
            """
            SELECT 
                p.rank, p.code, p.name, p.price, p.pct, p.change, p.prev_close, p.his_rc, p.updated_at,
                i.name as industry
            FROM popular_stock_cache p
            LEFT JOIN sw_industry_constituent c ON p.code = c.stock_code
            LEFT JOIN sw_industry i ON c.board_code = i.code AND i.level = '二级'
            WHERE p.sort = ?
            ORDER BY p.rank ASC
            """,
            (sort,),
        ).fetchall()
        conn.close()
    except Exception as e:
        print(f"[popular-stocks] db read error: {e}")
        rows = []

    if not rows:
        return {"stocks": [], "sort": sort, "updatedAt": None, "total": 0}

    updated_at = rows[0][8]
    stocks = [
        {
            "rank": r[0],
            "code": r[1],
            "name": r[2],
            "price": r[3],
            "pct": r[4],
            "change": r[5],
            "prevClose": r[6],
            "hisRc": r[7],
            "industry": r[9] if r[9] else None,  # 行业字段
        }
        for r in rows
    ]
    return {"stocks": stocks, "sort": sort, "updatedAt": updated_at, "total": len(stocks)}


@router.post("/popular-stocks/refresh")
def refresh_popular_stocks(
    sort: str = Query("hot", description="hot=人气榜 rise=飙升榜，用于决定返回哪个榜单数据"),
):
    """
    同时刷新人气榜和飙升榜（各100条），写入数据库缓存。
    返回指定 sort 的最新数据。
    """
    import sqlite3, datetime, concurrent.futures

    now_str = datetime.datetime.now().isoformat()

    def fetch_and_save(s: str):
        stocks = _fetch_popular_stocks_realtime(s)
        if not stocks:
            return s, []
        try:
            conn = sqlite3.connect(_db_path())
            conn.executemany(
                """INSERT OR REPLACE INTO popular_stock_cache
                   (sort, rank, code, name, price, pct, change, prev_close, his_rc, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        s,
                        item["rank"],
                        item["code"],
                        item["name"],
                        item["price"],
                        item["pct"],
                        item["change"],
                        item["prevClose"],
                        item["hisRc"],
                        now_str,
                    )
                    for item in stocks
                ],
            )
            conn.commit()
            conn.close()
            print(f"[popular-stocks/refresh] saved {len(stocks)} rows for sort={s}")
        except Exception as e:
            print(f"[popular-stocks/refresh] db write error ({s}): {e}")
        return s, stocks

    # 并发刷新两榜
    results: dict = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for s, stocks in pool.map(fetch_and_save, ["hot", "rise"]):
            results[s] = stocks

    stocks_for_sort = results.get(sort, [])
    return {
        "stocks": stocks_for_sort,
        "sort": sort,
        "updatedAt": now_str,
        "total": len(stocks_for_sort),
    }


@router.post("/sync-news")
def trigger_sync_theme_news_early():
    """手动触发板块新闻增量同步（静态路由，优先匹配）"""
    threading.Thread(target=sync_theme_news, daemon=True).start()
    return {"message": "板块新闻增量同步已启动"}


@router.post("/sync-news-full")
def trigger_sync_theme_news_full_early():
    """手动触发板块新闻全量补抓（每板块最多50页，静态路由，优先匹配）"""
    threading.Thread(target=lambda: sync_theme_news(full=True), daemon=True).start()
    return {"message": "板块新闻全量补抓已启动（每板块最多50页）"}


@router.get("/news-db")
def get_theme_news_from_db_early(
    theme_id: str = Query("", description="板块ID，空则返回全部"),
    q: str = Query("", description="标题关键词搜索"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, le=100),
):
    """从数据库读取已缓存的板块新闻，支持按板块过滤和标题关键词搜索（静态路由优先）"""
    try:
        conn = sqlite3.connect(_db_path_theme())
        conditions = []
        params: list = []
        if theme_id:
            conditions.append("theme_id=?")
            params.append(theme_id)
        if q:
            conditions.append("title LIKE ?")
            params.append(f"%{q}%")
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        base = f"FROM theme_news {where}"
        total_row = conn.execute(f"SELECT COUNT(*) {base}", params).fetchone()
        total = total_row[0] if total_row else 0
        offset = (page - 1) * page_size
        rows = conn.execute(
            f"SELECT id, theme_id, theme_name, title, source, pub_time, url {base} ORDER BY pub_time DESC LIMIT ? OFFSET ?",
            params + [page_size, offset],
        ).fetchall()
        conn.close()
    except Exception as e:
        print(f"[theme_news] db read error: {e}")
        return {"items": [], "total": 0, "page": page, "pageSize": page_size}

    return {
        "items": [
            {
                "id": r[0],
                "themeId": r[1],
                "themeName": r[2],
                "title": r[3],
                "source": r[4],
                "pubTime": r[5],
                "url": r[6],
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasMore": offset + page_size < total,
    }


@router.get("/news-stats")
def get_theme_news_stats_early():
    """返回 theme_news 各板块的数量统计，供监控页使用（静态路由优先）"""
    global _theme_news_syncing
    try:
        conn = sqlite3.connect(_db_path_theme())
        rows = conn.execute(
            "SELECT theme_id, theme_name, COUNT(*) as cnt, MAX(pub_time) as latest, MAX(updated_at) as last_sync "
            "FROM theme_news GROUP BY theme_id ORDER BY cnt DESC"
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM theme_news").fetchone()[0]
        conn.close()
    except Exception as e:
        print(f"[theme_news] stats error: {e}")
        return {"total": 0, "syncing": _theme_news_syncing, "themes": []}

    return {
        "total": total,
        "syncing": _theme_news_syncing,
        "themes": [
            {
                "themeId": r[0],
                "themeName": r[1],
                "count": r[2],
                "latestPubTime": r[3],
                "lastSync": r[4],
            }
            for r in rows
        ],
    }


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


# ─────────────────────────────────────────────────────────────────────────────
# 板块新闻入库 / 同步
# ─────────────────────────────────────────────────────────────────────────────

def _db_path_theme() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "stock_data.db")


def _get_theme_list() -> list[dict]:
    """获取同花顺全部热门主题列表（含 headline）"""
    data = _get("https://news.10jqka.com.cn/app/headline/v1/hot-theme")
    themes = data.get("data", [])
    result = [HEADLINE_THEME]
    for t in themes:
        if t.get("themeId") != "TZ-11940":
            result.append({"themeId": t["themeId"], "themeName": t.get("themeName", "")})
    return result


def _fetch_theme_news_page(theme_id: str, content_id: Optional[int], page: int) -> list[dict]:
    """拉取单个主题第 page 页新闻列表（最多30条）"""
    if theme_id == "headline":
        # 头条使用独立接口
        cursor = "99999999999999999" if page == 1 else ""
        url = f"https://news.10jqka.com.cn/app/headline/web/v1/list/{cursor}"
        data = _get(url)
        items = data.get("data") or []
        return [
            {
                "id": it.get("id", ""),
                "title": it.get("title", ""),
                "source": it.get("source", ""),
                "time": it.get("ctime", 0),
                "url": it.get("url") or "",
            }
            for it in items
        ]
    if not content_id:
        return []
    data = _get(
        f"https://news.10jqka.com.cn/app/theme/web/v1/content/?id={content_id}&page={page}&size=30",
        referer=f"{_THEME_REFERER}{theme_id}",
    )
    items = data.get("data") or []
    return [
        {
            "id": it.get("itemId") or it.get("id") or "",
            "title": it.get("title", ""),
            "source": it.get("source", ""),
            "time": it.get("time", 0),
            "url": it.get("contentUrl") or it.get("url") or it.get("webUrl") or "",
        }
        for it in items
    ]


def _get_theme_content_id(theme_id: str) -> Optional[int]:
    """通过主题 meta 接口获取 contentId"""
    if theme_id == "headline":
        return None
    data = _get(f"https://news.10jqka.com.cn/app/theme/v1/theme/?themeId={theme_id}")
    d = data.get("data", {})
    for mod in d.get("module", []):
        if mod.get("type") == 2:
            items = mod.get("items") or []
            if items:
                return items[0].get("id")
    return None


def _get_latest_pub_time(theme_id: str) -> Optional[str]:
    """从数据库查询该主题最新一条新闻的 pub_time"""
    try:
        conn = sqlite3.connect(_db_path_theme())
        row = conn.execute(
            "SELECT pub_time FROM theme_news WHERE theme_id=? ORDER BY pub_time DESC LIMIT 1",
            (theme_id,),
        ).fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None


def _upsert_theme_news(rows: list[dict]) -> int:
    """批量写入 theme_news 表，冲突时更新 title/source/updated_at，返回写入条数"""
    if not rows:
        return 0
    try:
        conn = sqlite3.connect(_db_path_theme())
        conn.executemany(
            """INSERT INTO theme_news (id, theme_id, theme_name, title, source, pub_time, url, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   title=excluded.title,
                   source=excluded.source,
                   updated_at=excluded.updated_at""",
            [
                (
                    r["id"],
                    r["theme_id"],
                    r["theme_name"],
                    r["title"],
                    r["source"],
                    r["pub_time"],
                    r["url"],
                    datetime.utcnow().isoformat(),
                )
                for r in rows
            ],
        )
        conn.commit()
        count = len(rows)
        conn.close()
        return count
    except Exception as e:
        print(f"[theme_news] upsert error: {e}")
        return 0


def _sync_one_theme(theme: dict, full: bool = False) -> int:
    """同步单个主题的新闻到 theme_news 表。
    full=True 时全量拉取（最多50页），full=False 时增量拉取（最多5页）。
    """
    theme_id = theme["themeId"]
    theme_name = theme.get("themeName", "")

    latest_time = _get_latest_pub_time(theme_id)
    content_id = _get_theme_content_id(theme_id)

    new_rows = []
    MAX_PAGES = 50 if full else 5

    for page in range(1, MAX_PAGES + 1):
        items = _fetch_theme_news_page(theme_id, content_id, page)
        if not items:
            break

        found_overlap = False
        for it in items:
            item_id = str(it.get("id") or "")
            if not item_id:
                continue
            raw_time = it.get("time", 0)
            try:
                ts = int(raw_time)
                pub_time = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                pub_time = str(raw_time)

            uid = f"{theme_id}_{item_id}"

            # 增量模式：遇到比已有数据更早的条目时停止
            # 全量模式：所有条目都写入（ON CONFLICT DO UPDATE 保证幂等）
            if not full and latest_time and pub_time <= latest_time:
                found_overlap = True
                continue

            new_rows.append(
                {
                    "id": uid,
                    "theme_id": theme_id,
                    "theme_name": theme_name,
                    "title": it.get("title", ""),
                    "source": it.get("source", ""),
                    "pub_time": pub_time,
                    "url": it.get("url", ""),
                }
            )

        if found_overlap:
            break

    return _upsert_theme_news(new_rows)


def sync_theme_news(full: bool = False) -> dict:
    """
    同步所有热门主题的新闻到 theme_news 表。
    full=True 时全量拉取（每板块最多50页约1500条）；
    full=False 时增量拉取（每板块最多5页）。
    """
    global _theme_news_syncing
    if not _theme_news_sync_lock.acquire(blocking=False):
        return {"status": "already_running"}
    _theme_news_syncing = True
    try:
        themes = _get_theme_list()
        results: dict[str, int] = {}
        total = 0

        def _run(t: dict):
            try:
                n = _sync_one_theme(t, full=full)
                results[t["themeId"]] = n
            except Exception as e:
                print(f"[theme_news] sync {t['themeId']} error: {e}")
                results[t["themeId"]] = 0

        threads = [threading.Thread(target=_run, args=(t,), daemon=True) for t in themes]
        for th in threads:
            th.start()
        for th in threads:
            th.join()

        total = sum(results.values())
        mode = "全量" if full else "增量"
        from routers.system import sched_log
        sched_log("success", f"板块新闻{mode}同步完成，新增 {total} 条，涉及 {len(themes)} 个板块", source="scheduler")
        print(f"[theme_news] {mode}sync done: total={total} across {len(themes)} themes")
        return {"status": "ok", "total": total, "details": results}
    finally:
        _theme_news_syncing = False
        _theme_news_sync_lock.release()



