from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime
import threading
import requests
import re

from db import get_db, SessionLocal, NewsFlash

router = APIRouter()

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.eastmoney.com/",
}

_CATEGORY_MAP = {
    "a": {"label": "A股", "type_id": 104},
    "important": {"label": "重要", "type_id": 103},
    "notice": {"label": "公告", "type_id": 109},
    "futures": {"label": "期货", "type_id": 102},
    "abnormal": {"label": "异动", "type_id": 106},
    "hk": {"label": "港股", "type_id": 105},
    "us": {"label": "美股", "type_id": 107},
}

_PAGE_SIZE = 20
_MAX_PAGES = 50
_sync_locks: dict[str, threading.Lock] = {k: threading.Lock() for k in _CATEGORY_MAP}
_syncing_cats: set[str] = set()
_syncing_lock = threading.Lock()


def _fetch_em_page(type_id: int, page: int) -> list[dict]:
    url = (
        f"https://newsapi.eastmoney.com/kuaixun/v1/"
        f"getlist_{type_id}_ajaxResult_{_PAGE_SIZE}_{page}_.html"
    )
    try:
        r = requests.get(url, headers=_HEADERS, timeout=12)
        raw = r.text.strip()
        if raw.startswith("var ajaxResult="):
            raw = raw[len("var ajaxResult=") :]
        raw = re.sub(r";?\s*$", "", raw)
        import json

        d = json.loads(raw)
        return d.get("LivesList", [])
    except Exception as e:
        print(f"[news_flash] fetch type={type_id} page={page} error: {e}")
        return []


def _parse_item(it: dict, cate_key: str) -> dict | None:
    news_id = str(it.get("id") or it.get("newsid") or "")
    if not news_id:
        return None
    ctime_raw = str(it.get("showtime") or it.get("ordertime") or "")
    try:
        ctime = datetime.strptime(ctime_raw, "%Y-%m-%d %H:%M:%S").strftime(
            "%Y-%m-%d %H:%M:%S"
        )
    except Exception:
        ctime = ctime_raw
    return {
        "id": f"{cate_key}_{news_id}",
        "title": str(it.get("title") or ""),
        "digest": str(it.get("digest") or ""),
        "url": str(it.get("url_w") or it.get("url_m") or ""),
        "ctime": ctime,
        "category": cate_key,
    }


def _get_latest_ctime(cate_key: str) -> str | None:
    db = SessionLocal()
    try:
        row = (
            db.query(NewsFlash.ctime)
            .filter(NewsFlash.category == cate_key)
            .order_by(NewsFlash.ctime.desc())
            .first()
        )
        return row[0] if row else None
    finally:
        db.close()


def sync_category(cate_key: str, pages: int | None = None) -> int:
    cfg = _CATEGORY_MAP.get(cate_key)
    if not cfg:
        return 0
    lock = _sync_locks[cate_key]
    if not lock.acquire(blocking=False):
        return 0
    with _syncing_lock:
        _syncing_cats.add(cate_key)
    try:
        latest_ctime = _get_latest_ctime(cate_key)
        items_all = []
        max_pages = pages if pages is not None else _MAX_PAGES
        for page in range(1, max_pages + 1):
            raw_items = _fetch_em_page(cfg["type_id"], page)
            if not raw_items:
                break
            found_overlap = False
            for it in raw_items:
                parsed = _parse_item(it, cate_key)
                if not parsed:
                    continue
                if latest_ctime and parsed["ctime"] <= latest_ctime:
                    found_overlap = True
                    continue
                items_all.append(parsed)
            if found_overlap:
                break

        if not items_all:
            return 0

        db = SessionLocal()
        try:
            for it in items_all:
                stmt = sqlite_insert(NewsFlash).values(
                    id=it["id"],
                    title=it["title"],
                    digest=it["digest"],
                    url=it["url"],
                    ctime=it["ctime"],
                    category=it["category"],
                    updated_at=datetime.utcnow(),
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "title": stmt.excluded.title,
                        "digest": stmt.excluded.digest,
                        "url": stmt.excluded.url,
                        "updated_at": stmt.excluded.updated_at,
                    },
                )
                db.execute(stmt)
            db.commit()
            print(
                f"[news_flash] {cate_key}: +{len(items_all)} new items @ {datetime.now().strftime('%H:%M:%S')}"
            )
            return len(items_all)
        except Exception as e:
            db.rollback()
            print(f"[news_flash] {cate_key} DB error: {e}")
            return 0
        finally:
            db.close()
    finally:
        lock.release()
        with _syncing_lock:
            _syncing_cats.discard(cate_key)


def sync_news_flash() -> int:
    total = 0
    threads = []
    results: dict[str, int] = {}

    def _run(key: str):
        results[key] = sync_category(key, pages=3)

    for key in _CATEGORY_MAP:
        t = threading.Thread(target=_run, args=(key,), daemon=True)
        threads.append(t)
        t.start()
    for t in threads:
        t.join()
    total = sum(results.values())
    print(f"[news_flash] all categories synced: {total} total items")
    return total


@router.get("")
def get_news_flash(
    category: str = Query("a"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, le=50),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * page_size
    q = db.query(NewsFlash).filter(NewsFlash.category == category)
    total = q.count()
    rows = q.order_by(NewsFlash.ctime.desc()).offset(offset).limit(page_size).all()
    with _syncing_lock:
        syncing = category in _syncing_cats
    return {
        "category": category,
        "categoryLabel": _CATEGORY_MAP.get(category, {}).get("label", category),
        "categories": [
            {"key": k, "label": v["label"]} for k, v in _CATEGORY_MAP.items()
        ],
        "page": page,
        "pageSize": page_size,
        "total": total,
        "hasMore": offset + page_size < total,
        "syncing": syncing,
        "items": [
            {
                "id": r.id,
                "title": r.title,
                "digest": r.digest,
                "url": r.url,
                "ctime": r.ctime,
            }
            for r in rows
        ],
    }


@router.post("/sync")
def trigger_sync_all():
    threading.Thread(target=sync_news_flash, daemon=True).start()
    return {"message": "sync started"}


@router.post("/sync/{category}")
def trigger_sync_category(category: str):
    if category not in _CATEGORY_MAP:
        return {"error": "unknown category"}
    threading.Thread(target=sync_category, args=(category,), daemon=True).start()
    return {"message": f"sync started for {category}"}
