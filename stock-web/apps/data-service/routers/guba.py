"""
股吧资讯与公告抓取路由
数据来源：
- 资讯（官方资讯）：gbcdn.dfcfw.com JSONP 接口 type=1（与网站资讯 tab 完全一致）
- 公告：东方财富公告接口 np-anotice-stock.eastmoney.com（官方公告）
"""

import threading
import time
import json
from datetime import datetime

import akshare as ak
from curl_cffi import requests as cffi_requests
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db import SessionLocal, StockGuba, get_db

router = APIRouter()

# ---------- 同步状态 ----------
_sync_status: dict = {"running": False, "current": "", "done": 0, "total": 0}
_sync_lock = threading.Lock()

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Referer": "https://guba.eastmoney.com/",
    "Accept": "*/*",
}


def _fetch_news(code: str) -> list[dict]:
    """资讯：东方财富股吧官方资讯（type=1，与网站资讯 tab 完全一致，via gbcdn JSONP）"""
    try:
        # gbcdn.dfcfw.com JSONP 缓存，type=1 = 官方资讯账号发布的内容
        url = (
            f"https://gbcdn.dfcfw.com/gbapi/webarticlelist_api_Article_Articlelist.js"
            f"?ps=50&p=1&code={code}&type=1&sort=0&callback=Q"
        )
        r = cffi_requests.get(url, headers=_HEADERS, timeout=15, impersonate="chrome124")
        text = r.text
        # JSONP 格式: var webarticlelist_api_Article_Articlelist=Q({...});
        # 用正则更鲁棒地提取 JSON 内容
        import re as _re, json as _json
        m = _re.search(r'Q\((\{.*\})\)', text, _re.DOTALL)
        if not m:
            # 降级：找 Q( 到最后一个 ) 之间
            if "Q(" not in text:
                raise ValueError(f"unexpected response format, content[:200]={text[:200]}")
            start = text.index("Q(") + 2
            end = text.rindex(")")
            d = _json.loads(text[start:end])
        else:
            d = _json.loads(m.group(1))
        posts = d.get("re", [])
        result = []
        for p in posts:
            title = str(p.get("post_title") or "").strip()
            post_id = p.get("post_id", "")
            stock_code = p.get("stockbar_code") or code
            post_url = f"https://guba.eastmoney.com/news,{stock_code},{post_id}.html"
            if title and post_id:
                user_info = p.get("post_user") or {}
                author = str(user_info.get("topicuser_nickname") or "匿名").strip()
                result.append({
                    "title": title,
                    "url": post_url,
                    "author": author,
                    "read_count": int(p.get("post_click_count") or 0),
                    "reply_count": int(p.get("post_reply_count") or p.get("post_comment_count") or 0),
                    "pub_time": str(p.get("post_last_time") or p.get("post_publish_time") or ""),
                })
        return result
    except Exception as e:
        print(f"[guba] fetch guba posts error code={code}: {e}")
        # fallback: akshare 媒体新闻
        try:
            df = ak.stock_news_em(symbol=code)
            result = []
            for _, row in df.iterrows():
                title = str(row.get("新闻标题", "") or "").strip()
                url = str(row.get("新闻链接", "") or "").strip()
                if title and url:
                    result.append({
                        "title": title,
                        "url": url,
                        "author": str(row.get("文章来源", "") or ""),
                        "read_count": 0,
                        "reply_count": 0,
                        "pub_time": str(row.get("发布时间", "") or ""),
                    })
            return result
        except Exception as e2:
            print(f"[guba] fetch news fallback error: {e2}")
            return []


def _fetch_notice(code: str) -> list[dict]:
    """公告：东方财富公告接口"""
    try:
        url = "https://np-anotice-stock.eastmoney.com/api/security/ann"
        params = {
            "sr": -1,
            "page_size": 50,
            "page_index": 1,
            "ann_type": "A",
            "client_source": "web",
            "stock_list": code,
        }
        r = cffi_requests.get(url, headers=_HEADERS, params=params, timeout=15, impersonate="chrome")
        data = r.json()
        items = data.get("data", {}).get("list", [])
        result = []
        for item in items:
            title = str(item.get("title") or "").strip()
            art_code = item.get("art_code", "")
            notice_url = f"https://data.eastmoney.com/notices/detail/{code}/{art_code}.html"
            pub_time = str(item.get("display_time", "") or item.get("notice_date", ""))[:19]
            ann_type = ""
            cols = item.get("columns", [])
            if cols:
                ann_type = cols[0].get("column_name", "")
            if title:
                result.append({
                    "title": title,
                    "url": notice_url,
                    "author": ann_type,
                    "read_count": 0,
                    "reply_count": 0,
                    "pub_time": pub_time,
                })
        return result
    except Exception as e:
        print(f"[guba] fetch notice error code={code}: {e}")
        # fallback: akshare
        try:
            df = ak.stock_individual_notice_report(security=code)
            result = []
            for _, r in df.iterrows():
                title = str(r.get("公告标题", "") or "").strip()
                url = str(r.get("网址", "") or "").strip()
                if title and url:
                    result.append({
                        "title": title,
                        "url": url,
                        "author": str(r.get("公告类型", "") or ""),
                        "read_count": 0,
                        "reply_count": 0,
                        "pub_time": str(r.get("公告日期", "") or ""),
                    })
            return result[:100]
        except Exception as e2:
            print(f"[guba] fetch notice fallback error: {e2}")
            return []


def _fetch_guba_page(code: str, post_type: str, page: int = 1) -> list[dict]:
    """统一入口：按 post_type 分发"""
    if post_type == "news":
        return _fetch_news(code)
    else:
        return _fetch_notice(code)


def _save_guba_items(code: str, post_type: str, items: list[dict]) -> int:
    """保存到数据库，返回新增条数"""
    if not items:
        return 0
    db = SessionLocal()
    saved = 0
    try:
        for item in items:
            url = item["url"]
            exists = (
                db.query(StockGuba)
                .filter(
                    StockGuba.code == code,
                    StockGuba.post_type == post_type,
                    StockGuba.url == url,
                )
                .first()
            )
            if exists:
                exists.read_count = item["read_count"]
                exists.reply_count = item["reply_count"]
                exists.updated_at = datetime.utcnow()
            else:
                db.add(
                    StockGuba(
                        code=code,
                        post_type=post_type,
                        title=item["title"],
                        url=url,
                        author=item["author"],
                        read_count=item["read_count"],
                        reply_count=item["reply_count"],
                        pub_time=item["pub_time"],
                        updated_at=datetime.utcnow(),
                    )
                )
                saved += 1
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[guba] save error code={code} type={post_type}: {e}")
    finally:
        db.close()
    return saved


def sync_guba_stock(code: str) -> int:
    """同步单只股票的资讯+公告，返回总新增条数"""
    total_saved = 0
    for post_type in ("news", "notice"):
        items = _fetch_guba_page(code, post_type)
        if items:
            saved = _save_guba_items(code, post_type, items)
            total_saved += saved
        time.sleep(0.5)
    return total_saved


def sync_all_guba(codes: list[str] | None = None):
    """同步所有股票的股吧数据（定时任务/一键更新调用）"""
    global _sync_status
    with _sync_lock:
        if _sync_status["running"]:
            return
        _sync_status = {"running": True, "current": "", "done": 0, "total": 0}

    try:
        from routers.system import sched_log

        if codes is None:
            db = SessionLocal()
            try:
                from sqlalchemy import text
                rows = db.execute(
                    text(
                        "SELECT code FROM stock_meta "
                        "WHERE market IN ('SH', 'SZ', 'A') OR market IS NULL"
                    )
                ).fetchall()
                codes = [r[0] for r in rows]
            finally:
                db.close()

        _sync_status["total"] = len(codes)
        sched_log(
            "info",
            f"[股吧] 开始同步 {len(codes)} 只股票资讯/公告",
            source="scheduler",
        )

        total = len(codes)
        for i, code in enumerate(codes):
            _sync_status["current"] = code
            _sync_status["done"] = i
            pct = round((i + 1) / total * 100) if total else 0
            try:
                saved = sync_guba_stock(code)
                msg = (
                    f"[股吧] {i + 1}/{total} ({pct}%) - {code}"
                    + (f" 新增 {saved} 条" if saved > 0 else "")
                )
                sched_log("info", msg, source="scheduler")
            except Exception as e:
                sched_log(
                    "error",
                    f"[股吧] {i + 1}/{total} ({pct}%) - {code} 同步失败: {e}",
                    source="scheduler",
                )
            time.sleep(0.8)

        _sync_status["done"] = len(codes)
        sched_log(
            "success",
            f"[股吧] 全部同步完成，共处理 {len(codes)} 只股票",
            source="scheduler",
        )
    finally:
        _sync_status["running"] = False
        _sync_status["current"] = ""


# ---------- API 路由（固定路径必须在动态路径之前）----------

@router.get("/sync/status")
async def get_sync_status():
    """获取股吧数据同步状态"""
    return {
        "running": _sync_status["running"],
        "current": _sync_status["current"],
        "done": _sync_status["done"],
        "total": _sync_status["total"],
    }


@router.get("/stats/summary")
async def get_guba_stats(db: Session = Depends(get_db)):
    """获取股吧数据统计摘要"""
    from sqlalchemy import func

    news_count = (
        db.query(func.count(StockGuba.id))
        .filter(StockGuba.post_type == "news")
        .scalar()
        or 0
    )
    notice_count = (
        db.query(func.count(StockGuba.id))
        .filter(StockGuba.post_type == "notice")
        .scalar()
        or 0
    )
    stock_count = (
        db.query(func.count(func.distinct(StockGuba.code))).scalar() or 0
    )
    last_sync_row = db.query(func.max(StockGuba.updated_at)).scalar()
    last_sync = last_sync_row.isoformat() if last_sync_row else None

    return {
        "newsCount": news_count,
        "noticeCount": notice_count,
        "stockCount": stock_count,
        "lastSync": last_sync,
        "syncing": _sync_status["running"],
    }


@router.post("/sync/{code}")
async def sync_stock_guba(code: str):
    """手动同步单只股票的股吧数据"""

    def _run():
        from routers.system import sched_log
        sched_log("info", f"[股吧] 手动同步: {code}")
        try:
            saved = sync_guba_stock(code)
            sched_log("success", f"[股吧] {code} 同步完成，新增 {saved} 条")
        except Exception as e:
            sched_log("error", f"[股吧] {code} 同步失败: {e}")

    threading.Thread(target=_run, daemon=True).start()
    return {"status": "started", "code": code}


@router.post("/sync")
async def sync_all_guba_endpoint():
    """一键同步所有股票的股吧数据（后台任务）"""
    with _sync_lock:
        if _sync_status["running"]:
            return {"status": "already_running"}

    threading.Thread(target=sync_all_guba, daemon=True).start()
    return {"status": "started"}


@router.get("/{code}")
async def get_guba(
    code: str,
    post_type: str = Query(
        default="news", description="news=资讯, notice=公告"
    ),
    count: int = Query(default=30, ge=5, le=100),
    db: Session = Depends(get_db),
):
    """获取指定股票的股吧资讯或公告列表"""
    rows = (
        db.query(StockGuba)
        .filter(
            StockGuba.code == code,
            StockGuba.post_type == post_type,
        )
        .order_by(StockGuba.pub_time.desc())
        .limit(count)
        .all()
    )
    return {
        "code": code,
        "type": post_type,
        "items": [
            {
                "title": r.title,
                "url": r.url,
                "author": r.author,
                "readCount": r.read_count,
                "replyCount": r.reply_count,
                "pubTime": r.pub_time,
            }
            for r in rows
        ],
    }
