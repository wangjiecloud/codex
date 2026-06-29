from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, timedelta
import threading
import time

from db import get_db, SessionLocal, GubaPost
from eastmoney_scraper import scrape_all_categories, fetch_post_content, fetch_guba_all

router = APIRouter()

_CACHE_TTL_MINUTES = 5

_syncing: set = set()
_syncing_lock = threading.Lock()

_incremental_running = False
_incremental_lock = threading.Lock()
_guba_last_sync: str = ""

VALID_CATEGORIES = {"all", "announcement", "news", "research", "discussion", "article"}


def _is_data_fresh(db: Session, code: str) -> bool:
    cutoff = datetime.utcnow() - timedelta(minutes=_CACHE_TTL_MINUTES)
    return (
        db.query(GubaPost)
        .filter(GubaPost.code == code, GubaPost.updated_at >= cutoff)
        .first()
    ) is not None


def _has_any_data(db: Session, code: str) -> bool:
    return db.query(GubaPost).filter(GubaPost.code == code).first() is not None


def _upsert_posts(db: Session, code: str, posts_by_cat: dict):
    now = datetime.utcnow()
    all_rows = []
    for category, posts in posts_by_cat.items():
        for post in posts:
            pre_content = post.get("content", "") or ""
            all_rows.append(
                {
                    "code": code,
                    "post_id": post["post_id"],
                    "title": post["title"],
                    "author": post["author"],
                    "read_count": post["read_count"],
                    "comment_count": post["comment_count"],
                    "post_time": post["post_time"],
                    "post_date": post.get("post_date", ""),
                    "url": post["url"],
                    "category": post["category"],
                    "content": pre_content,
                    "content_fetched": 1 if pre_content else 0,
                    "updated_at": now,
                }
            )

    if not all_rows:
        return 0

    batch_size = 100
    count = 0
    for i in range(0, len(all_rows), batch_size):
        batch = all_rows[i : i + batch_size]
        for attempt in range(10):
            try:
                stmt = sqlite_insert(GubaPost).values(batch)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["code", "post_id"],
                    set_={
                        "read_count": stmt.excluded.read_count,
                        "comment_count": stmt.excluded.comment_count,
                        "post_date": stmt.excluded.post_date,
                        "updated_at": stmt.excluded.updated_at,
                        "content": stmt.excluded.content,
                        "content_fetched": stmt.excluded.content_fetched,
                    },
                )
                db.execute(stmt)
                db.commit()
                count += len(batch)
                break
            except Exception as e:
                db.rollback()
                if attempt < 9:
                    time.sleep(5 + attempt * 2)
                else:
                    print(f"[guba_sync] batch upsert failed after retries: {e}")
    return count


def _sync_guba_posts(code: str):
    with _syncing_lock:
        if code in _syncing:
            return
        _syncing.add(code)

    try:
        print(f"[guba_sync] scraping {code}")
        data = scrape_all_categories(code, max_pages=5)
        now = datetime.utcnow().isoformat()
        all_rows = []
        for category, posts in data.items():
            for post in posts:
                pre_content = post.get("content", "") or ""
                all_rows.append(
                    (
                        code,
                        post["post_id"],
                        post["title"],
                        post["author"],
                        post["read_count"],
                        post["comment_count"],
                        post["post_time"],
                        post.get("post_date", ""),
                        post["url"],
                        post["category"],
                        pre_content,
                        1 if pre_content else 0,
                        now,
                    )
                )

        import sqlite3 as _sqlite3
        import os

        db_path = os.path.join(os.path.dirname(__file__), "..", "stock_data.db")
        conn = _sqlite3.connect(os.path.normpath(db_path), timeout=120)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=120000")
        batch_size = 100
        count = 0
        for i in range(0, len(all_rows), batch_size):
            batch = all_rows[i : i + batch_size]
            for attempt in range(10):
                try:
                    conn.executemany(
                        """INSERT INTO guba_post
                           (code, post_id, title, author, read_count, comment_count,
                            post_time, post_date, url, category, content, content_fetched, updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                           ON CONFLICT(code, post_id) DO UPDATE SET
                             read_count=excluded.read_count,
                             comment_count=excluded.comment_count,
                             post_time=excluded.post_time,
                             post_date=excluded.post_date,
                             content=excluded.content,
                             content_fetched=excluded.content_fetched,
                             updated_at=excluded.updated_at""",
                        batch,
                    )
                    conn.commit()
                    count += len(batch)
                    break
                except _sqlite3.OperationalError as e:
                    if attempt < 9:
                        time.sleep(5 + attempt * 2)
                    else:
                        print(f"[guba_sync] batch failed: {e}")
        conn.close()
        print(f"[guba_sync] saved {count} posts for {code}")
    except Exception as e:
        print(f"[guba_sync] error: {e}")
    finally:
        with _syncing_lock:
            _syncing.discard(code)


def _post_to_dict(post: GubaPost) -> dict:
    return {
        "post_id": post.post_id,
        "title": post.title,
        "author": post.author,
        "time": post.post_time,
        "post_date": post.post_date or "",
        "reads": str(post.read_count),
        "replies": str(post.comment_count),
        "url": post.url,
        "category": post.category,
    }


def _fetch_and_save_content(post_id: str, url: str):
    content = fetch_post_content(url) or ""
    if not content:
        return
    db = SessionLocal()
    try:
        post = db.query(GubaPost).filter(GubaPost.post_id == post_id).first()
        if post:
            post.content = content
            post.content_fetched = 1
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@router.get("/post/{post_id}")
async def get_post_detail(
    post_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    post = db.query(GubaPost).filter(GubaPost.post_id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if not post.content and not post.content_fetched:
        background_tasks.add_task(_fetch_and_save_content, post_id, post.url)

    return {
        **_post_to_dict(post),
        "content": post.content or "",
    }


@router.get("/{code}")
async def get_guba_data(
    code: str,
    background_tasks: BackgroundTasks,
    category: str = Query("all"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")

    def _fetch():
        db = SessionLocal()
        try:
            has_fresh = _is_data_fresh(db, code)
            has_any = _has_any_data(db, code)
            q = db.query(GubaPost).filter(GubaPost.code == code)
            if category != "all":
                q = q.filter(GubaPost.category == category)
            q = q.order_by(GubaPost.post_date.desc(), GubaPost.id.desc())
            total = q.count()
            posts = q.offset((page - 1) * page_size).limit(page_size).all()
            return has_fresh, has_any, total, [_post_to_dict(p) for p in posts]
        finally:
            db.close()

    has_fresh, has_any, total, items = await run_in_threadpool(_fetch)

    if not has_fresh:
        background_tasks.add_task(_sync_guba_posts, code)

    return {
        "code": code,
        "category": category,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "items": items,
        "syncing": not has_fresh,
        "source": "database" if has_any else "empty",
    }


@router.post("/sync/batch")
async def trigger_batch_guba_sync(background_tasks: BackgroundTasks):
    from routers.sync import _status, _lock

    with _lock:
        if _status["running"]:
            return {"status": "already_running", **_status}

    background_tasks.add_task(_run_batch_guba_sync)
    return {"status": "started"}


@router.post("/sync/all/batch")
async def trigger_batch_guba_all_sync(background_tasks: BackgroundTasks):
    from routers.sync import _status, _lock

    with _lock:
        if _status["running"]:
            return {"status": "already_running", **_status}

    background_tasks.add_task(_run_batch_guba_all_sync)
    return {"status": "started"}


@router.post("/sync/all/{code}")
async def trigger_guba_all_sync(code: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(_sync_guba_all_posts, code)
    return {"status": "started", "code": code}


@router.post("/sync/{code}")
async def trigger_guba_sync(code: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(_sync_guba_posts, code)
    return {"status": "started", "code": code}


def sync_guba_incremental():
    global _incremental_running, _guba_last_sync
    with _incremental_lock:
        if _incremental_running:
            return
        _incremental_running = True

    from routers.system import sched_log

    try:
        from db import SessionLocal, StockMeta

        db = SessionLocal()
        try:
            codes = [row.code for row in db.query(StockMeta.code).all()]
        finally:
            db.close()

        total = len(codes)
        sched_log("info", f"股吧增量同步开始，共 {total} 只股票", source="scheduler")
        pending_rows = []
        errors = 0

        for idx, code in enumerate(codes):
            try:
                data = scrape_all_categories(code, max_pages=1)
                if not data:
                    continue
                now = datetime.utcnow().isoformat()
                for category, posts in data.items():
                    for post in posts:
                        pre_content = post.get("content", "") or ""
                        pending_rows.append(
                            (
                                code,
                                post["post_id"],
                                post["title"],
                                post["author"],
                                post["read_count"],
                                post["comment_count"],
                                post["post_time"],
                                post.get("post_date", ""),
                                post["url"],
                                post["category"],
                                pre_content,
                                1 if pre_content else 0,
                                now,
                            )
                        )
            except Exception as e:
                errors += 1
                print(f"[guba_incremental] error for {code}: {e}")
            time.sleep(0.3)

        saved_total = 0
        if pending_rows:
            import sqlite3 as _sqlite3, os

            db_path = os.path.join(os.path.dirname(__file__), "..", "stock_data.db")
            conn = _sqlite3.connect(os.path.normpath(db_path), timeout=30)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=30000")
            try:
                for i in range(0, len(pending_rows), 500):
                    batch = pending_rows[i : i + 500]
                    conn.executemany(
                        """INSERT INTO guba_post
                           (code, post_id, title, author, read_count, comment_count,
                            post_time, post_date, url, category, content, content_fetched, updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                           ON CONFLICT(code, post_id) DO UPDATE SET
                             read_count=excluded.read_count,
                             comment_count=excluded.comment_count,
                             post_time=excluded.post_time,
                             post_date=excluded.post_date,
                             content=excluded.content,
                             content_fetched=excluded.content_fetched,
                             updated_at=excluded.updated_at""",
                        batch,
                    )
                    conn.commit()
                    saved_total += len(batch)
            except Exception as e:
                print(f"[guba_incremental] final write error: {e}")
            finally:
                conn.close()

        _guba_last_sync = datetime.utcnow().isoformat()
        sched_log(
            "success",
            f"股吧增量同步完成，写入 {saved_total} 条，错误 {errors} 只",
            source="scheduler",
        )
    except Exception as e:
        sched_log("error", f"股吧增量同步异常: {e}", source="scheduler")
    finally:
        with _incremental_lock:
            _incremental_running = False


def _run_batch_guba_sync():
    from db import SessionLocal, StockMeta
    from routers.sync import _status, _lock

    db = SessionLocal()
    try:
        codes = [row.code for row in db.query(StockMeta.code).all()]
    finally:
        db.close()

    with _lock:
        _status.update(
            running=True,
            phase="guba",
            total=len(codes),
            done=0,
            current="",
            started_at=datetime.utcnow().isoformat(),
            finished_at="",
        )

    print(f"[guba_sync] starting batch sync for {len(codes)} stocks")

    for i, code in enumerate(codes):
        with _lock:
            _status["current"] = code
            _status["done"] = i

        try:
            _sync_guba_posts(code)
        except Exception as e:
            print(f"[guba_sync] error syncing {code}: {e}")

        time.sleep(0.5)

    with _lock:
        _status.update(
            running=False,
            phase="done",
            current="",
            done=len(codes),
            finished_at=datetime.utcnow().isoformat(),
        )

    print("[guba_sync] batch sync finished")


def _sync_guba_all_posts(code: str, max_pages: int = 5):
    db = SessionLocal()
    try:
        print(f"[guba_all_sync] syncing all posts for {code}")
        all_posts = []

        for page in range(1, max_pages + 1):
            posts = fetch_guba_all(code, page)
            if not posts:
                break
            all_posts.extend(posts)
            time.sleep(0.3)

        if not all_posts:
            print(f"[guba_all_sync] no posts found for {code}")
            return

        _upsert_all_posts(db, code, all_posts)
        print(f"[guba_all_sync] synced {len(all_posts)} posts for {code}")

    except Exception as e:
        print(f"[guba_all_sync] error syncing {code}: {e}")
    finally:
        db.close()


def _upsert_all_posts(db: Session, code: str, posts: list):
    now = datetime.utcnow()
    all_rows = []

    for post in posts:
        all_rows.append(
            {
                "code": code,
                "post_id": post["post_id"],
                "title": post["title"],
                "author": post["author"],
                "author_url": post.get("author_url", ""),
                "read_count": post.get("read_count", 0),
                "comment_count": post.get("reply_count", 0),
                "post_time": post.get("update_time", ""),
                "post_date": post.get("update_time", ""),
                "url": post["url"],
                "category": "discussion" if post.get("post_type") == "0" else "article",
                "post_type": post.get("post_type", "0"),
                "content": "",
                "content_fetched": 0,
                "updated_at": now,
            }
        )

    if not all_rows:
        return 0

    batch_size = 100
    count = 0
    for i in range(0, len(all_rows), batch_size):
        batch = all_rows[i : i + batch_size]
        for attempt in range(10):
            try:
                stmt = sqlite_insert(GubaPost).values(batch)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["code", "post_id"],
                    set_={
                        "read_count": stmt.excluded.read_count,
                        "comment_count": stmt.excluded.comment_count,
                        "post_date": stmt.excluded.post_date,
                        "post_time": stmt.excluded.post_time,
                        "author_url": stmt.excluded.author_url,
                        "post_type": stmt.excluded.post_type,
                        "updated_at": stmt.excluded.updated_at,
                    },
                )
                db.execute(stmt)
                db.commit()
                count += len(batch)
                break
            except Exception as e:
                if attempt == 9:
                    print(f"[_upsert_all_posts] error batch {i}: {e}")
                    raise
                db.rollback()
                time.sleep(0.1)

    return count


def _run_batch_guba_all_sync():
    from db import SessionLocal, StockMeta
    from routers.sync import _status, _lock

    db = SessionLocal()
    try:
        codes = [row.code for row in db.query(StockMeta.code).all()]
    finally:
        db.close()

    with _lock:
        _status.update(
            running=True,
            phase="guba_all",
            total=len(codes),
            done=0,
            current="",
            started_at=datetime.utcnow().isoformat(),
            finished_at="",
        )

    print(f"[guba_all_sync] starting batch sync for {len(codes)} stocks")

    for i, code in enumerate(codes):
        with _lock:
            _status["current"] = code
            _status["done"] = i

        try:
            _sync_guba_all_posts(code)
        except Exception as e:
            print(f"[guba_all_sync] error syncing {code}: {e}")

        time.sleep(0.5)

    with _lock:
        _status.update(
            running=False,
            phase="done",
            current="",
            done=len(codes),
            finished_at=datetime.utcnow().isoformat(),
        )

    print("[guba_all_sync] batch sync finished")
