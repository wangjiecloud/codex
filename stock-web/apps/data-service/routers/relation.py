"""
股票关联关系路由
- 爬取东方财富股吧帖子正文（type=0，全部帖子），识别共现股票
- 统计共现次数，写入 stock_relation 表
- 返回图数据供前端 D3.js 力导向图渲染
"""

import re
import time
import json
import threading
from datetime import datetime
from collections import Counter

from curl_cffi import requests as cffi_requests
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from db import SessionLocal, StockMeta, StockRelation, StockGubaPost, StockGubaSync, get_db

router = APIRouter()

# ---------- 同步状态 ----------
_sync_status: dict = {
    "running": False,
    "code": "",
    "done": 0,
    "total": 0,
    "message": "",
}
_sync_lock = threading.Lock()

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    ),
    "Referer": "https://guba.eastmoney.com/",
    "Accept": "*/*",
}

_CODE_RE = re.compile(r"\b([036]\d{5})\b")
# 东方财富帖子正文中超链接格式：/r/0.300308 或 /r/1.600396
_LINK_CODE_RE = re.compile(r"/r/[01]\.(\d{6})")


def _get_all_stock_names(db: Session) -> dict[str, str]:
    """返回 {name: code} 的映射表（用于名称识别）"""
    rows = db.query(StockMeta.code, StockMeta.name).all()
    return {r.name: r.code for r in rows if r.name}


def _build_name_pattern(name_to_code: dict[str, str]) -> re.Pattern | None:
    """构建股票名称识别正则（按名称长度倒序，避免短名吃掉长名）"""
    names = sorted(name_to_code.keys(), key=len, reverse=True)
    if not names:
        return None
    escaped = [re.escape(n) for n in names]
    return re.compile("|".join(escaped))


def _extract_codes_from_text(
    text: str,
    name_to_code: dict[str, str],
    name_pattern: re.Pattern | None,
) -> set[str]:
    """从正文中提取股票代码（链接格式 + 6位代码正则 + 名称识别）"""
    found: set[str] = set()
    # 1. 超链接格式 /r/0.300308 / /r/1.600396（东方财富帖子正文HTML内嵌）
    for m in _LINK_CODE_RE.finditer(text):
        found.add(m.group(1))
    # 2. 纯文本 6 位代码正则（去掉 HTML 标签后再匹配）
    plain = re.sub(r"<[^>]+>", " ", text)
    for m in _CODE_RE.finditer(plain):
        found.add(m.group(1))
    # 3. 名称识别
    if name_pattern:
        for m in name_pattern.finditer(plain):
            code = name_to_code.get(m.group(0))
            if code:
                found.add(code)
    return found


def _fetch_post_content(code: str, post_id: str) -> str:
    """
    获取帖子正文。
    从帖子 HTML 页面中提取 post_content 字段（内嵌 JSON）。
    """
    try:
        url = f"https://guba.eastmoney.com/news,{code},{post_id}.html"
        r = cffi_requests.get(url, headers=_HEADERS, timeout=12, impersonate="chrome124")
        if r.status_code != 200:
            return ""
        text = r.content.decode("utf-8", errors="replace")
        m = re.search(r'"post_content":"(.*?)"(?:,|,")', text, re.DOTALL)
        if m:
            return m.group(1)
    except Exception:
        pass
    return ""


def _fetch_posts(code: str, max_posts: int = 10000) -> list[dict]:
    """爬取股吧 type=0（全部帖子）分页列表，返回 {post_id, title, pub_time}，最多 max_posts 篇"""
    posts = []
    page = 1
    per_page = 50
    consecutive_empty = 0
    while len(posts) < max_posts:
        try:
            url = (
                f"https://gbcdn.dfcfw.com/gbapi/"
                f"webarticlelist_api_Article_Articlelist.js"
                f"?ps={per_page}&p={page}&code={code}&type=0&sort=0&callback=Q"
            )
            r = cffi_requests.get(
                url, headers=_HEADERS, timeout=15, impersonate="chrome124"
            )
            m = re.search(r"Q\((\{.*\})\)", r.text, re.DOTALL)
            if not m:
                break
            d = json.loads(m.group(1))
            page_posts = d.get("re", [])
            if not page_posts:
                consecutive_empty += 1
                if consecutive_empty >= 3:
                    break
                page += 1
                time.sleep(0.5)
                continue
            consecutive_empty = 0
            for p in page_posts:
                post_id = str(p.get("post_id", ""))
                title = str(p.get("post_title") or "").strip()
                pub_time = str(p.get("post_publish_time") or "").strip()
                if post_id:
                    posts.append({"post_id": post_id, "title": title, "pub_time": pub_time})
            # 注意：rc 字段不可信（始终返回1），不用它判断是否到底
            # 只有连续3页返回0条才认为到底，单页少于50条是正常波动不中断
            page += 1
            time.sleep(0.3)
        except Exception as e:
            print(f"[relation] fetch posts page={page} code={code} error: {e}")
            break
    return posts[:max_posts]


def _flush_posts(batch: list[dict]) -> None:
    """批量写入帖子正文到 stock_guba_post，单次事务"""
    if not batch:
        return
    db = SessionLocal()
    try:
        for item in batch:
            stmt = (
                sqlite_insert(StockGubaPost)
                .values(
                    code=item["code"],
                    post_id=item["post_id"],
                    title=item["title"],
                    content=item["content"],
                    pub_time=item["pub_time"],
                    updated_at=datetime.utcnow(),
                )
                .on_conflict_do_nothing(index_elements=["code", "post_id"])
            )
            db.execute(stmt)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[relation] flush posts error: {e}")
    finally:
        db.close()


def _sync_relation(code: str) -> dict:
    """
    核心爬取逻辑（单只股票）：
    1. 检查 stock_guba_sync 是否已完成，已完成则跳过
    2. 拉取最多 10000 条帖子列表（全量分页）
    3. 逐帖请求正文 HTML，每 50 篇批量落库一次（减少 SQLite 锁争用）
    4. 从标题+正文识别共现股票，统计写入 stock_relation
    5. 完成后在 stock_guba_sync 标记 done=1
    """
    from sqlalchemy import text as _text

    BATCH_SIZE = 50  # 每多少篇批量写一次 DB

    # ── 1. 检查是否已完成 ──
    db = SessionLocal()
    try:
        sync_row = db.query(StockGubaSync).filter(StockGubaSync.code == code).first()
        if sync_row and sync_row.done == 1:
            return {"status": "skipped", "code": code, "related": 0}
        # 获取已落库的 post_id 集合，避免重复请求
        existing_ids: set[str] = {
            r[0] for r in db.execute(
                _text("SELECT post_id FROM stock_guba_post WHERE code=:c"),
                {"c": code}
            ).fetchall()
        }
        name_to_code = _get_all_stock_names(db)
    finally:
        db.close()

    # ── 2. 拉取帖子列表 ──
    posts = _fetch_posts(code, max_posts=10000)
    total_posts = len(posts)
    _sync_status["total"] = total_posts
    _sync_status["message"] = f"共获取 {total_posts} 篇帖子，开始逐帖抓取正文..."

    name_pattern = _build_name_pattern(name_to_code)
    co_counter: Counter = Counter()
    batch: list[dict] = []  # 待批量写入的帖子

    for i, post in enumerate(posts):
        _sync_status["done"] = i
        _sync_status["message"] = f"[{i+1}/{total_posts}] 抓取正文 {code} post={post['post_id']}"
        pid = post["post_id"]
        title = post["title"]
        pub_time = post.get("pub_time", "")

        # 已落库的直接读（不重复请求网络）
        if pid in existing_ids:
            # 从内存里拿不到 content，统计共现只能靠 title
            found = _extract_codes_from_text(title, name_to_code, name_pattern)
            found.discard(code)
            for c in found:
                co_counter[c] += 1
            continue

        # 拉取正文
        content = _fetch_post_content(code, pid)
        batch.append({
            "code": code,
            "post_id": pid,
            "title": title,
            "content": content,
            "pub_time": pub_time,
        })

        # 统计共现
        found = _extract_codes_from_text(title, name_to_code, name_pattern)
        if content:
            found |= _extract_codes_from_text(content, name_to_code, name_pattern)
        found.discard(code)
        for c in found:
            co_counter[c] += 1

        time.sleep(0.15)

        # 每 BATCH_SIZE 篇批量写一次
        if len(batch) >= BATCH_SIZE:
            _flush_posts(batch)
            batch.clear()

    # 写入剩余
    if batch:
        _flush_posts(batch)
        batch.clear()

    # ── 4. 写入 stock_relation ──
    if co_counter:
        db = SessionLocal()
        try:
            for code_b, cnt in co_counter.items():
                stmt = (
                    sqlite_insert(StockRelation)
                    .values(code_a=code, code_b=code_b, count=cnt, updated_at=datetime.utcnow())
                    .on_conflict_do_update(
                        index_elements=["code_a", "code_b"],
                        set_={"count": cnt, "updated_at": datetime.utcnow()},
                    )
                )
                db.execute(stmt)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[relation] db write error: {e}")
        finally:
            db.close()

    # ── 5. 标记完成 ──
    db = SessionLocal()
    try:
        stmt = (
            sqlite_insert(StockGubaSync)
            .values(
                code=code,
                done=1,
                post_count=total_posts,
                relation_count=len(co_counter),
                finished_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            .on_conflict_do_update(
                index_elements=["code"],
                set_={
                    "done": 1,
                    "post_count": total_posts,
                    "relation_count": len(co_counter),
                    "finished_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                },
            )
        )
        db.execute(stmt)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[relation] sync status write error: {e}")
    finally:
        db.close()

    return {"status": "done", "code": code, "related": len(co_counter)}


def _sync_all_relations():
    """全量同步：遍历 stock_meta 中所有 A 股，依次分析关联关系"""
    global _sync_status

    with _sync_lock:
        if _sync_status["running"]:
            return
        _sync_status = {
            "running": True,
            "code": "",
            "done": 0,
            "total": 0,
            "message": "初始化，获取股票列表...",
        }

    try:
        db = SessionLocal()
        try:
            from sqlalchemy import text as _text
            # 优先处理未完成（done=0）或从未同步过的股票，已完成(done=1)的排在最后
            rows = db.execute(_text("""
                SELECT m.code
                FROM stock_meta m
                LEFT JOIN stock_guba_sync s ON m.code = s.code
                WHERE m.market IN ('SH','SZ','A股') OR m.market IS NULL
                ORDER BY COALESCE(s.done, 0) ASC, m.code ASC
            """)).fetchall()
            codes = [r[0] for r in rows]
        finally:
            db.close()

        # 统计未完成数量用于进度显示
        db = SessionLocal()
        try:
            from sqlalchemy import text as _text2
            pending_count = db.execute(_text2("""
                SELECT COUNT(*) FROM stock_meta m
                LEFT JOIN stock_guba_sync s ON m.code = s.code
                WHERE (m.market IN ('SH','SZ','A股') OR m.market IS NULL)
                  AND COALESCE(s.done, 0) = 0
            """)).scalar()
        finally:
            db.close()

        total = len(codes)
        _sync_status["total"] = total
        _sync_status["message"] = f"共 {total} 只股票，待完成 {pending_count} 只，开始同步..."

        for i, code in enumerate(codes):
            _sync_status["code"] = code
            _sync_status["done"] = i
            _sync_status["message"] = f"[{i+1}/{total}] 正在分析 {code}..."
            try:
                result = _sync_relation(code)
                if result.get("status") == "skipped":
                    _sync_status["message"] = f"[{i+1}/{total}] {code} 已完成，跳过"
            except Exception as e:
                print(f"[relation] sync error code={code}: {e}")
            time.sleep(0.2)

        _sync_status["done"] = total
        _sync_status["message"] = f"全量同步完成，共处理 {total} 只股票"
    finally:
        _sync_status["running"] = False


# ─────────────────────────────────────────────────────────────────────────────
# API 路由（固定路径必须在动态路径之前）
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_sync_status():
    """获取关联关系同步状态"""
    return {
        "running": _sync_status["running"],
        "code": _sync_status["code"],
        "done": _sync_status["done"],
        "total": _sync_status["total"],
        "message": _sync_status["message"],
    }


@router.post("/sync/all")
async def sync_all_relation():
    """触发全量同步（所有 A 股股票的关联关系爬取）"""
    with _sync_lock:
        if _sync_status["running"]:
            return {"status": "already_running"}
    threading.Thread(target=_sync_all_relations, daemon=True).start()
    return {"status": "started"}


@router.post("/sync/{code}")
async def sync_relation(code: str):
    """触发爬取指定单只股票的关联关系（后台任务）"""
    with _sync_lock:
        if _sync_status["running"]:
            return {"status": "already_running", "code": _sync_status["code"]}

    def _run():
        global _sync_status
        with _sync_lock:
            _sync_status = {"running": True, "code": code, "done": 0, "total": -1, "message": f"正在获取 {code} 帖子列表..."}
        try:
            result = _sync_relation(code)
            _sync_status["message"] = f"{code} 完成，发现 {result.get('related', 0)} 只关联"
        except Exception as e:
            _sync_status["message"] = f"错误: {e}"
        finally:
            _sync_status["running"] = False

    threading.Thread(target=_run, daemon=True).start()
    return {"status": "started", "code": code}


@router.get("/all")
async def get_all_relations(
    top: int = Query(default=5, ge=1, le=20),
    min_count: int = Query(default=1, ge=1, description="最低共现次数过滤"),
    db: Session = Depends(get_db),
):
    """
    返回全图：所有 code_a 的 top-N 关联，合并去重后组成一张大图。
    适用于「未选中股票时展示整体关联网络」。
    nodes / links 格式与单股接口一致。
    """
    from sqlalchemy import func, text as _text

    # 取每个 code_a 的 top-N（用 ROW_NUMBER 窗口函数）
    sql = _text("""
        SELECT code_a, code_b, count
        FROM (
            SELECT code_a, code_b, count,
                   ROW_NUMBER() OVER (PARTITION BY code_a ORDER BY count DESC) AS rn
            FROM stock_relation
            WHERE count >= :min_count
        ) t
        WHERE rn <= :top
    """)
    rows = db.execute(sql, {"top": top, "min_count": min_count}).fetchall()

    if not rows:
        return {"nodes": [], "links": [], "synced": False, "updatedAt": None, "name": "全图"}

    # 收集所有节点
    all_codes: set[str] = set()
    for r in rows:
        all_codes.add(r.code_a)
        all_codes.add(r.code_b)

    meta_rows = db.query(StockMeta).filter(StockMeta.code.in_(all_codes)).all()
    code_to_name = {r.code: r.name for r in meta_rows}

    # 以 code_a 的累计共现次数决定节点大小
    code_a_total: dict[str, int] = {}
    for r in rows:
        code_a_total[r.code_a] = code_a_total.get(r.code_a, 0) + r.count

    max_total = max(code_a_total.values()) if code_a_total else 1

    node_set: dict[str, dict] = {}
    for code in all_codes:
        total = code_a_total.get(code, 0)
        size = 12 + int((total / max_total) * 20)  # 12~32
        node_set[code] = {
            "id": code,
            "name": code_to_name.get(code, code),
            "size": size,
            "isCenter": False,
        }

    links = [{"source": r.code_a, "target": r.code_b, "value": r.count} for r in rows]

    # 取最新 updated_at
    last_updated = db.execute(_text("SELECT MAX(updated_at) FROM stock_relation")).scalar()

    return {
        "nodes": list(node_set.values()),
        "links": links,
        "synced": True,
        "updatedAt": last_updated,
        "name": "全图",
    }


@router.get("/{code}")
async def get_relation(
    code: str,
    top: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """
    返回指定股票的 top-N 关联图数据（力导向图格式）。
    nodes: [{id, name, size}]
    links: [{source, target, value}]
    """
    rows = (
        db.query(StockRelation)
        .filter(StockRelation.code_a == code)
        .order_by(StockRelation.count.desc())
        .limit(top)
        .all()
    )

    # 补全名称
    all_codes = {code} | {r.code_b for r in rows}
    meta_rows = db.query(StockMeta).filter(StockMeta.code.in_(all_codes)).all()
    code_to_name = {r.code: r.name for r in meta_rows}

    center_name = code_to_name.get(code, code)
    nodes = [{"id": code, "name": center_name, "size": 28, "isCenter": True}]
    links = []

    for r in rows:
        nodes.append(
            {
                "id": r.code_b,
                "name": code_to_name.get(r.code_b, r.code_b),
                "size": 18,
                "isCenter": False,
                "count": r.count,
            }
        )
        links.append({"source": code, "target": r.code_b, "value": r.count})

    return {
        "code": code,
        "name": center_name,
        "nodes": nodes,
        "links": links,
        "synced": len(rows) > 0,
        "updatedAt": rows[0].updated_at.isoformat() if rows else None,
    }
