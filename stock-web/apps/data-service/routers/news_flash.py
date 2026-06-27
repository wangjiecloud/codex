from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime
import threading
import requests

from db import get_db, SessionLocal, NewsFlash

router = APIRouter()

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.10jqka.com.cn/",
}

_CATEGORY_MAP = {
    "important": {"label": "重要", "tag_id": "-21101"},
    "a": {"label": "A股", "tag_id": "21103"},
    "hk": {"label": "港股", "tag_id": "21105"},
    "us": {"label": "美股", "tag_id": "21107"},
    "abnormal": {"label": "异动", "tag_id": "21111"},
    "notice": {"label": "公告", "tag_id": "34843"},
}

_PAGE_SIZE = 20
_MAX_PAGES = 50
_sync_locks: dict[str, threading.Lock] = {k: threading.Lock() for k in _CATEGORY_MAP}
_syncing_cats: set[str] = set()
_syncing_lock = threading.Lock()


def _fetch_ths_page(tag_id: str, last_seq: str = "0") -> list[dict]:
    url = (
        f"https://news.10jqka.com.cn/app/flash/flashnews/v1/list"
        f"?tagId={tag_id}&pageSize={_PAGE_SIZE}&seq={last_seq}&envTag=reqfix"
    )
    try:
        r = requests.get(url, headers=_HEADERS, timeout=12)
        d = r.json()
        return d.get("data", {}).get("list", [])
    except Exception as e:
        print(f"[news_flash] fetch tag_id={tag_id} last_seq={last_seq} error: {e}")
        return []


def _parse_item(it: dict, cate_key: str) -> dict | None:
    news_id = str(it.get("id") or it.get("seq") or "")
    if not news_id:
        return None
    ctime_raw = it.get("createTime") or it.get("ctime") or ""
    try:
        ts = int(ctime_raw)
        ctime = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        ctime = str(ctime_raw)
    return {
        "id": f"{cate_key}_{news_id}",
        "seq": str(it.get("seq") or news_id),
        "title": str(it.get("title") or ""),
        "digest": str(it.get("summary") or it.get("digest") or ""),
        "url": str(it.get("url") or ""),
        "ctime": ctime,
        "category": cate_key,
    }


def _get_latest_seq(cate_key: str) -> str | None:
    db = SessionLocal()
    try:
        row = (
            db.query(NewsFlash.seq)
            .filter(NewsFlash.category == cate_key)
            .order_by(NewsFlash.seq.desc())
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
        latest_seq = _get_latest_seq(cate_key)
        items_all = []
        max_pages = pages if pages is not None else _MAX_PAGES
        last_seq = "0"

        for _ in range(max_pages):
            raw_items = _fetch_ths_page(cfg["tag_id"], last_seq)
            if not raw_items:
                break
            found_overlap = False
            for it in raw_items:
                parsed = _parse_item(it, cate_key)
                if not parsed:
                    continue
                if latest_seq and parsed["seq"] <= latest_seq:
                    found_overlap = True
                    continue
                items_all.append(parsed)
            last_seq = str(raw_items[-1].get("seq") or "0")
            if found_overlap or last_seq == "0":
                break

        if not items_all:
            return 0

        db = SessionLocal()
        try:
            for it in items_all:
                stmt = sqlite_insert(NewsFlash).values(
                    id=it["id"],
                    seq=it["seq"],
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
                        "seq": stmt.excluded.seq,
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
        results[key] = sync_category(key)

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
