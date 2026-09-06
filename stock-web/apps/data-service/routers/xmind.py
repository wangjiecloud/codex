"""
XMind 工具路由
- 解析 URL 内容，使用 LLM 提炼概要并结构化为知识树
- 以 XMind 文件名为根节点，自动分类文章内容并补齐相关知识
- 生成/合并 XMind 复合文件（多 sheet，支持超链接跳转）
- 文件元数据和节点存数据库，可下载 .xmind 文件
"""

import io
import json
import os
import uuid
import zipfile
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, NavigableString, Tag
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db import SessionLocal, XmindFile, XmindNode

router = APIRouter()


# ── Pydantic 请求模型 ────────────────────────────────────────────────────────


class FileCreateReq(BaseModel):
    name: str
    description: str = ""


class ParseUrlReq(BaseModel):
    url: str


class MergeReq(BaseModel):
    url: str
    sheet_title: Optional[str] = None
    conflict_resolution: str = "new_sheet"  # new_sheet | replace | skip


# ── LLM 调用 ─────────────────────────────────────────────────────────────────

_LLM_BASE_URL = "https://apiprod.midea.com/llm/f-devops-python-litellm/v1"


def _load_llm_config() -> dict:
    """从 ~/.config/opencode/llm-config.json 读取认证信息"""
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
    """从 ~/.codex/config.toml 读取当前模型"""
    config_path = os.path.expanduser("~/.codex/config.toml")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                for line in f:
                    stripped = line.strip()
                    # 精确匹配 model = "xxx"，不能匹配 model_provider
                    if stripped.startswith("model ") or stripped.startswith("model\t"):
                        val = stripped.split("=", 1)[1].strip().strip('"')
                        if val:
                            return val
        except Exception:
            pass
    return "hw-glm-5"


def _call_llm(prompt: str, system: str = "", max_tokens: int = 8192) -> str:
    """调用 LLM API，返回文本响应"""
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
            "temperature": 0.3,
        },
        timeout=120,
    )
    if not resp.ok:
        raise RuntimeError(f"LLM API error {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    return content


def _call_llm_json(prompt: str, system: str = "") -> dict:
    """调用 LLM 并解析 JSON 响应"""
    raw = _call_llm(prompt, system)
    # 去除可能的 markdown 代码块标记
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        # 去掉首尾 ``` 行
        while lines and lines[0].strip().startswith("```"):
            lines.pop(0)
        while lines and lines[-1].strip().startswith("```"):
            lines.pop()
        raw = "\n".join(lines)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # 尝试提取 JSON 部分
        import re

        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        raise RuntimeError(f"LLM 返回的不是有效 JSON: {raw[:200]}...")


# ── HTML 解析 ────────────────────────────────────────────────────────────────


def _gen_id() -> str:
    return uuid.uuid4().hex[:26]


def _fetch_url(url: str) -> tuple[str, str]:
    """获取 URL 内容，返回 (html, final_url)"""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(url, headers=headers, timeout=30, allow_redirects=True)
    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text, resp.url


def _extract_raw_content(html: str, source_url: str) -> dict:
    """
    提取网页的原始内容：标题、正文全文、所有链接。
    返回: {"title", "url", "full_text", "links": [{"text", "url"}]}
    """
    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        soup = BeautifulSoup(html, "html.parser")

    # 页面标题
    page_title = ""
    if soup.title:
        page_title = soup.title.get_text(strip=True)
    if not page_title:
        h1 = soup.find("h1")
        if h1:
            page_title = h1.get_text(strip=True)[:100]
    if not page_title:
        page_title = source_url

    # meta description
    meta_desc = ""
    meta = soup.find("meta", attrs={"name": "description"})
    if meta and meta.get("content"):
        meta_desc = meta["content"][:500]

    # 找到主内容区域
    content_area = (
        soup.find("main")
        or soup.find("article")
        or soup.find(
            "div",
            class_=lambda c: (
                c
                and any(
                    kw in c.lower()
                    for kw in ["content", "article", "main", "post", "entry", "body"]
                )
            ),
        )
        or soup.body
        or soup
    )

    # 提取完整正文（保留标题层级结构）
    lines = []
    heading_tags = {"h1", "h2", "h3", "h4", "h5", "h6"}

    for el in content_area.descendants:
        if isinstance(el, NavigableString):
            continue
        if not isinstance(el, Tag):
            continue
        tag = el.name.lower()
        if tag in heading_tags:
            text = el.get_text(strip=True)
            if text:
                level = int(tag[1])
                prefix = "#" * level
                lines.append(f"\n{prefix} {text}")
        elif tag in ("p", "li", "blockquote", "td"):
            text = el.get_text(separator=" ", strip=True)
            if text and len(text) > 5:
                lines.append(text)
        elif tag == "pre":
            text = el.get_text(strip=True)
            if text:
                lines.append(f"```\n{text[:500]}\n```")

    full_text = "\n".join(lines)
    if meta_desc:
        full_text = f"[页面摘要] {meta_desc}\n\n{full_text}"

    # 截断到合理长度（避免超过 LLM 上下文限制）
    if len(full_text) > 12000:
        full_text = full_text[:12000] + "\n\n[内容过长，已截断]"

    # 提取重要链接
    links = []
    for a in content_area.find_all("a", href=True):
        href = a["href"]
        if href.startswith("#") or href.startswith("javascript:"):
            continue
        if href.startswith("/"):
            href = urljoin(source_url, href)
        text = a.get_text(strip=True)
        if text and len(text) > 2 and len(text) < 100:
            links.append({"text": text, "url": href})
    # 去重，最多保留 30 个
    seen = set()
    unique_links = []
    for lk in links:
        if lk["url"] not in seen:
            seen.add(lk["url"])
            unique_links.append(lk)
    unique_links = unique_links[:30]

    return {
        "title": page_title,
        "url": source_url,
        "meta_desc": meta_desc,
        "full_text": full_text,
        "links": unique_links,
    }


# ── LLM 智能结构化 ───────────────────────────────────────────────────────────


_LLM_SYSTEM_PROMPT = """你是一个知识结构化专家。你的任务是将网页内容提取为结构化的思维导图树（JSON格式）。
每个节点必须有实质性的 content 字段（概要说明），不能为空字符串。
关键信息节点要标注 url 字段（来源链接）。
输出必须是纯 JSON，不要包含 markdown 代码块标记。"""


def _build_llm_prompt(
    raw_content: dict,
    root_topic: str,
    existing_categories: list[str],
) -> str:
    """
    构建 LLM prompt，要求：
    1. 根节点 = root_topic（XMind 文件名）
    2. 分析文章属于哪个知识分类，创建一级子节点
    3. 在分类下提炼核心知识点（二级、三级子节点）
    4. 每个节点有概要 content
    5. 从全局视角补齐文章未提及但相关的知识点
    """
    links_text = ""
    if raw_content["links"]:
        links_text = "\n\n[页面中的重要链接]\n"
        for lk in raw_content["links"][:15]:
            links_text += f"- {lk['text']}: {lk['url']}\n"

    existing_cats_text = ""
    if existing_categories:
        existing_cats_text = (
            f"\n\n[该思维导图已有的一级分类]\n"
            + "\n".join(f"- {c}" for c in existing_categories)
            + "\n如果文章内容与已有分类相关，请归入已有分类；如果是新的知识领域，请创建新分类。\n"
        )

    prompt = f"""请将以下网页内容提取为结构化的思维导图树。

根节点标题必须是：「{root_topic}」

网页标题：{raw_content["title"]}
网页URL：{raw_content["url"]}
{existing_cats_text}

网页正文内容：
{raw_content["full_text"][:8000]}
{links_text}

请按以下要求生成 JSON：

1. 根节点 title = "{root_topic}"，content = 对「{root_topic}」这个主题的总体概述（2-3句话）
2. 分析这篇文章内容属于「{root_topic}」下的哪个知识分类，创建为一级子节点
3. 在该分类下，提炼文章的核心知识点为二级、三级子节点
4. 每个节点的 content 字段必须包含该知识点的概要说明（至少1-2句话），绝不能为空
5. 如果文章中有重要的参考链接，在对应节点的 url 字段中标注
6. 从全局视角补齐：在该分类下，补充文章未提及但与「{root_topic}」相关的知识点，标题以「💡补充」开头
7. 如果文章内容涉及多个知识领域，可以创建多个一级分类
8. 对于已有分类中未涉及的知识领域，也可以创建空分类并在下面添加「💡补充」节点

返回 JSON 格式（严格遵守）：
{{
  "title": "{root_topic}",
  "content": "对{root_topic}的总体概述",
  "url": "",
  "children": [
    {{
      "title": "知识分类名",
      "content": "该分类的概要说明，描述这个分类在{root_topic}中的定位和重要性",
      "url": "",
      "children": [
        {{
          "title": "核心知识点1",
          "content": "这个知识点的详细说明和概要",
          "url": "来源URL（如有）",
          "children": [
            {{
              "title": "子知识点",
              "content": "说明",
              "url": "",
              "children": []
            }}
          ]
        }},
        {{
          "title": "💡补充：相关但文章未提及的知识点",
          "content": "这个知识点的说明，为什么它在这个分类中很重要",
          "url": "",
          "children": []
        }}
      ]
    }}
  ]
}}"""

    return prompt


def _llm_structure_tree(
    raw_content: dict,
    root_topic: str,
    existing_categories: Optional[list[str]] = None,
) -> dict:
    """使用 LLM 将原始内容结构化为知识树"""
    prompt = _build_llm_prompt(raw_content, root_topic, existing_categories or [])

    try:
        tree = _call_llm_json(prompt, _LLM_SYSTEM_PROMPT)
    except Exception as e:
        # LLM 失败时回退到简单结构
        tree = {
            "title": root_topic,
            "content": raw_content.get("meta_desc", ""),
            "url": "",
            "children": [
                {
                    "title": raw_content["title"][:80],
                    "content": raw_content["full_text"][:500],
                    "url": raw_content["url"],
                    "children": [],
                }
            ],
        }
        tree["_llm_error"] = str(e)

    # 确保根节点标题是文件名
    tree["title"] = root_topic
    tree["url"] = ""

    # 为所有没有 url 的节点补充 source_url
    def _ensure_fields(node: dict, src_url: str):
        if "content" not in node:
            node["content"] = ""
        if "url" not in node:
            node["url"] = ""
        if "children" not in node:
            node["children"] = []
        for child in node["children"]:
            _ensure_fields(child, src_url)

    _ensure_fields(tree, raw_content["url"])

    return tree


# ── XMind 文件构建 ───────────────────────────────────────────────────────────


def _build_xmind_zip(sheets: list[dict]) -> bytes:
    """构建 XMind ZIP 文件（现代 JSON 格式）"""
    content_json = json.dumps(sheets, ensure_ascii=False, indent=2)
    metadata_json = json.dumps(
        {
            "creator": {
                "name": "Stock Web XMind Tool",
                "version": "2.0",
            }
        },
        ensure_ascii=False,
    )
    manifest_json = json.dumps(
        {
            "file-entries": {
                "content.json": {},
                "metadata.json": {},
                "manifest.json": {},
            }
        },
        ensure_ascii=False,
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("content.json", content_json)
        zf.writestr("metadata.json", metadata_json)
        zf.writestr("manifest.json", manifest_json)
    return buf.getvalue()


def _nodes_to_sheets(db, file_id: int) -> list[dict]:
    """从数据库节点构建 XMind sheets JSON"""
    nodes = (
        db.query(XmindNode)
        .filter(XmindNode.file_id == file_id)
        .order_by(XmindNode.node_order)
        .all()
    )

    sheets_map: dict[str, list[XmindNode]] = {}
    sheet_titles: dict[str, str] = {}
    for n in nodes:
        if n.sheet_id not in sheets_map:
            sheets_map[n.sheet_id] = []
            sheet_titles[n.sheet_id] = n.sheet_title or n.sheet_id
        sheets_map[n.sheet_id].append(n)

    sheets = []
    for sheet_id, sheet_nodes in sheets_map.items():
        children_map: dict[Optional[int], list[XmindNode]] = {}
        for n in sheet_nodes:
            pid = n.parent_id
            if pid not in children_map:
                children_map[pid] = []
            children_map[pid].append(n)

        roots = children_map.get(None, [])
        if not roots:
            continue

        root_node = roots[0]

        def build_topic(node: XmindNode) -> dict:
            topic: dict = {
                "id": _gen_id(),
                "class": "topic",
                "title": node.title,
            }
            if node.url:
                topic["href"] = node.url
            if node.content:
                topic["notes"] = {
                    "plain": {"content": node.content},
                }
            kids = children_map.get(node.id, [])
            if kids:
                topic["children"] = {
                    "attached": [build_topic(k) for k in kids],
                }
            return topic

        sheet = {
            "id": sheet_id,
            "class": "sheet",
            "title": sheet_titles.get(sheet_id, sheet_id),
            "rootTopic": build_topic(root_node),
        }

        # 跨 sheet 跳转链接
        other_sheets = [s for s in sheets_map if s != sheet_id]
        if other_sheets:
            jump_children = []
            for osid in other_sheets:
                jump_children.append(
                    {
                        "id": _gen_id(),
                        "class": "topic",
                        "title": f"➡️ 跳转: {sheet_titles.get(osid, osid)}",
                        "href": f"xmind://go-to-sheet?id={osid}",
                    }
                )
            existing_children = (
                sheet["rootTopic"].get("children", {}).get("attached", [])
            )
            sheet["rootTopic"]["children"] = {
                "attached": existing_children + jump_children,
            }

        sheets.append(sheet)

    return sheets


def _save_tree_to_db(
    db, file_id: int, sheet_id: str, sheet_title: str, tree: dict, source_url: str
):
    """递归将树结构存入 xmind_node 表"""

    def _save(node: dict, parent_id: Optional[int], order: int):
        db_node = XmindNode(
            file_id=file_id,
            parent_id=parent_id,
            sheet_id=sheet_id,
            sheet_title=sheet_title,
            title=node["title"],
            content=node.get("content", ""),
            url=node.get("url", ""),
            node_order=order,
            source_url=source_url,
        )
        db.add(db_node)
        db.flush()
        for i, child in enumerate(node.get("children", [])):
            _save(child, db_node.id, i)

    _save(tree, None, 0)


def _get_existing_categories(db, file_id: int) -> list[str]:
    """获取已有的一级分类节点标题（parent_id is None 的子节点）"""
    # 找到所有 sheet 的根节点，然后找根节点的子节点
    root_nodes = (
        db.query(XmindNode)
        .filter(XmindNode.file_id == file_id, XmindNode.parent_id is None)
        .all()
    )
    categories = []
    for root in root_nodes:
        children = (
            db.query(XmindNode)
            .filter(XmindNode.parent_id == root.id)
            .order_by(XmindNode.node_order)
            .all()
        )
        for child in children:
            if child.title not in categories:
                categories.append(child.title)
    return categories


# ── API 端点 ─────────────────────────────────────────────────────────────────


@router.get("/files")
def list_files():
    """列出所有 XMind 文件"""
    db = SessionLocal()
    try:
        files = db.query(XmindFile).order_by(XmindFile.updated_at.desc()).all()
        result = []
        for f in files:
            node_count = db.query(XmindNode).filter(XmindNode.file_id == f.id).count()
            sheet_count = (
                db.query(XmindNode.sheet_id)
                .filter(XmindNode.file_id == f.id)
                .distinct()
                .count()
            )
            result.append(
                {
                    "id": f.id,
                    "name": f.name,
                    "description": f.description or "",
                    "created_at": f.created_at.isoformat() if f.created_at else "",
                    "updated_at": f.updated_at.isoformat() if f.updated_at else "",
                    "node_count": node_count,
                    "sheet_count": sheet_count,
                }
            )
        return {"files": result}
    finally:
        db.close()


@router.post("/files")
def create_file(req: FileCreateReq):
    """创建新的 XMind 文件"""
    db = SessionLocal()
    try:
        f = XmindFile(name=req.name, description=req.description)
        db.add(f)
        db.commit()
        db.refresh(f)
        return {
            "id": f.id,
            "name": f.name,
            "description": f.description or "",
            "created_at": f.created_at.isoformat() if f.created_at else "",
        }
    finally:
        db.close()


@router.delete("/files/{file_id}")
def delete_file(file_id: int):
    """删除 XMind 文件及其所有节点"""
    db = SessionLocal()
    try:
        f = db.query(XmindFile).filter(XmindFile.id == file_id).first()
        if not f:
            raise HTTPException(404, "文件不存在")
        db.query(XmindNode).filter(XmindNode.file_id == file_id).delete()
        db.delete(f)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.get("/files/{file_id}")
def get_file(file_id: int):
    """获取 XMind 文件详情（含所有 sheet 和节点树）"""
    db = SessionLocal()
    try:
        f = db.query(XmindFile).filter(XmindFile.id == file_id).first()
        if not f:
            raise HTTPException(404, "文件不存在")

        nodes = (
            db.query(XmindNode)
            .filter(XmindNode.file_id == file_id)
            .order_by(XmindNode.node_order)
            .all()
        )

        sheets_map: dict[str, list[XmindNode]] = {}
        for n in nodes:
            if n.sheet_id not in sheets_map:
                sheets_map[n.sheet_id] = []
            sheets_map[n.sheet_id].append(n)

        sheets = []
        for sid, snodes in sheets_map.items():
            children_map: dict[Optional[int], list[XmindNode]] = {}
            for n in snodes:
                pid = n.parent_id
                if pid not in children_map:
                    children_map[pid] = []
                children_map[pid].append(n)

            def build(node: XmindNode) -> dict:
                return {
                    "id": node.id,
                    "title": node.title,
                    "content": node.content or "",
                    "url": node.url or "",
                    "source_url": node.source_url or "",
                    "children": [build(k) for k in children_map.get(node.id, [])],
                }

            roots = children_map.get(None, [])
            sheets.append(
                {
                    "sheet_id": sid,
                    "sheet_title": snodes[0].sheet_title if snodes else sid,
                    "source_url": snodes[0].source_url if snodes else "",
                    "node_count": len(snodes),
                    "tree": [build(r) for r in roots],
                }
            )

        return {
            "id": f.id,
            "name": f.name,
            "description": f.description or "",
            "created_at": f.created_at.isoformat() if f.created_at else "",
            "updated_at": f.updated_at.isoformat() if f.updated_at else "",
            "sheets": sheets,
        }
    finally:
        db.close()


@router.post("/parse-url")
def parse_url(req: ParseUrlReq):
    """
    解析 URL 内容，使用 LLM 提炼概要并结构化。
    不入库，仅供预览。
    """
    try:
        html, final_url = _fetch_url(req.url)
    except Exception as e:
        raise HTTPException(400, f"URL 获取失败: {e}")

    raw = _extract_raw_content(html, final_url)

    # 用 LLM 结构化（无 root_topic 时用文章标题）
    tree = _llm_structure_tree(raw, raw["title"], [])

    def count_nodes(node: dict) -> int:
        return 1 + sum(count_nodes(c) for c in node.get("children", []))

    return {
        "url": final_url,
        "title": raw["title"],
        "content": raw.get("meta_desc", ""),
        "node_count": count_nodes(tree),
        "tree": tree,
        "raw_text_length": len(raw["full_text"]),
    }


# ── PDF 解析 ─────────────────────────────────────────────────────────────────


def _extract_pdf_content(pdf_bytes: bytes, filename: str) -> dict:
    """用 PyMuPDF 提取 PDF 文本内容，返回与 _extract_raw_content 相同的结构"""
    try:
        import pymupdf
    except ImportError:
        raise RuntimeError("pymupdf 未安装，请执行 pip install pymupdf")

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    pages_text = []
    for page in doc:
        text = page.get_text("text")
        if text.strip():
            pages_text.append(text.strip())
    doc.close()

    full_text = "\n\n".join(pages_text)
    if len(full_text) > 12000:
        full_text = full_text[:12000] + "\n\n[内容过长，已截断]"

    title = os.path.splitext(filename)[0]

    return {
        "title": title,
        "url": "",
        "meta_desc": f"PDF 文件: {filename}, 共 {len(pages_text)} 页",
        "full_text": full_text,
        "links": [],
    }


@router.post("/parse-pdf")
async def parse_pdf(file: UploadFile = File(...)):
    """
    上传 PDF 文件，提取文本并使用 LLM 结构化为知识树。
    不入库，仅供预览。
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "请上传 PDF 文件")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(400, "文件为空")

    try:
        raw = _extract_pdf_content(pdf_bytes, file.filename)
    except Exception as e:
        raise HTTPException(400, f"PDF 解析失败: {e}")

    tree = _llm_structure_tree(raw, raw["title"], [])

    def count_nodes(node: dict) -> int:
        return 1 + sum(count_nodes(c) for c in node.get("children", []))

    return {
        "url": "",
        "title": raw["title"],
        "content": raw.get("meta_desc", ""),
        "node_count": count_nodes(tree),
        "tree": tree,
        "raw_text_length": len(raw["full_text"]),
    }


@router.post("/merge-pdf/{file_id}")
async def merge_pdf(
    file_id: int,
    file: UploadFile = File(...),
    sheet_title: Optional[str] = Form(None),
    conflict_resolution: str = Form("new_sheet"),
):
    """
    上传 PDF 文件，提取文本并 LLM 结构化后合并到已有 XMind 文件。
    """
    db = SessionLocal()
    try:
        f = db.query(XmindFile).filter(XmindFile.id == file_id).first()
        if not f:
            raise HTTPException(404, "文件不存在")

        if not file.filename or not file.filename.lower().endswith(".pdf"):
            raise HTTPException(400, "请上传 PDF 文件")

        pdf_bytes = await file.read()
        if not pdf_bytes:
            raise HTTPException(400, "文件为空")

        try:
            raw = _extract_pdf_content(pdf_bytes, file.filename)
        except Exception as e:
            raise HTTPException(400, f"PDF 解析失败: {e}")

        source_url = f"pdf://{file.filename}"

        existing = (
            db.query(XmindNode)
            .filter(XmindNode.file_id == file_id, XmindNode.source_url == source_url)
            .first()
        )

        conflict = False
        if existing:
            if conflict_resolution == "skip":
                return {
                    "ok": True,
                    "skipped": True,
                    "message": f"PDF {file.filename} 已存在，已跳过",
                }
            elif conflict_resolution == "replace":
                db.query(XmindNode).filter(
                    XmindNode.file_id == file_id,
                    XmindNode.source_url == source_url,
                ).delete()
                conflict = True
            else:
                conflict = True

        existing_categories = _get_existing_categories(db, file_id)
        tree = _llm_structure_tree(raw, f.name, existing_categories)

        sheet_id = _gen_id()
        s_title = sheet_title or raw["title"][:100]

        _save_tree_to_db(db, file_id, sheet_id, s_title, tree, source_url)

        f.updated_at = datetime.utcnow()
        db.commit()

        node_count = (
            db.query(XmindNode)
            .filter(
                XmindNode.file_id == file_id,
                XmindNode.sheet_id == sheet_id,
            )
            .count()
        )
        sheet_count = (
            db.query(XmindNode.sheet_id)
            .filter(XmindNode.file_id == file_id)
            .distinct()
            .count()
        )

        return {
            "ok": True,
            "conflict": conflict,
            "sheet_id": sheet_id,
            "sheet_title": s_title,
            "source_url": source_url,
            "node_count": node_count,
            "total_sheets": sheet_count,
            "tree": tree,
            "llm_model": _load_current_model(),
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(500, f"合并失败: {e}")
    finally:
        db.close()


@router.post("/merge/{file_id}")
def merge_url(file_id: int, req: MergeReq):
    """
    将 URL 解析结果用 LLM 智能结构化后合并到已有 XMind 文件。
    - 根节点 = 文件名
    - 文章内容自动归类为一级子节点
    - 补齐相关知识点
    - conflict_resolution: new_sheet | replace | skip
    """
    db = SessionLocal()
    try:
        f = db.query(XmindFile).filter(XmindFile.id == file_id).first()
        if not f:
            raise HTTPException(404, "文件不存在")

        # 获取 URL 内容
        try:
            html, final_url = _fetch_url(req.url)
        except Exception as e:
            raise HTTPException(400, f"URL 获取失败: {e}")

        raw = _extract_raw_content(html, final_url)

        # 检查冲突
        existing = (
            db.query(XmindNode)
            .filter(XmindNode.file_id == file_id, XmindNode.source_url == final_url)
            .first()
        )

        conflict = False
        if existing:
            if req.conflict_resolution == "skip":
                return {
                    "ok": True,
                    "skipped": True,
                    "message": f"URL {final_url} 已存在，已跳过",
                }
            elif req.conflict_resolution == "replace":
                db.query(XmindNode).filter(
                    XmindNode.file_id == file_id,
                    XmindNode.source_url == final_url,
                ).delete()
                conflict = True
            else:
                conflict = True

        # 获取已有的一级分类（帮助 LLM 归类）
        existing_categories = _get_existing_categories(db, file_id)

        # 用 LLM 结构化：根节点 = 文件名
        tree = _llm_structure_tree(raw, f.name, existing_categories)

        # 生成 sheet
        sheet_id = _gen_id()
        sheet_title = req.sheet_title or raw["title"][:100]

        _save_tree_to_db(db, file_id, sheet_id, sheet_title, tree, final_url)

        f.updated_at = datetime.utcnow()
        db.commit()

        node_count = (
            db.query(XmindNode)
            .filter(
                XmindNode.file_id == file_id,
                XmindNode.sheet_id == sheet_id,
            )
            .count()
        )
        sheet_count = (
            db.query(XmindNode.sheet_id)
            .filter(XmindNode.file_id == file_id)
            .distinct()
            .count()
        )

        return {
            "ok": True,
            "conflict": conflict,
            "sheet_id": sheet_id,
            "sheet_title": sheet_title,
            "source_url": final_url,
            "node_count": node_count,
            "total_sheets": sheet_count,
            "tree": tree,
            "llm_model": _load_current_model(),
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(500, f"合并失败: {e}")
    finally:
        db.close()


@router.get("/download/{file_id}")
def download_file(file_id: int):
    """下载 XMind 文件（.xmind ZIP 格式）"""
    db = SessionLocal()
    try:
        f = db.query(XmindFile).filter(XmindFile.id == file_id).first()
        if not f:
            raise HTTPException(404, "文件不存在")

        sheets = _nodes_to_sheets(db, file_id)
        if not sheets:
            raise HTTPException(400, "文件没有内容")

        zip_bytes = _build_xmind_zip(sheets)
        safe_name = f.name.replace(" ", "_").replace("/", "_")
        from urllib.parse import quote

        encoded_name = quote(safe_name)
        return StreamingResponse(
            io.BytesIO(zip_bytes),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}.xmind",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(500, f"下载失败: {e}")
    finally:
        db.close()


@router.delete("/files/{file_id}/sheet/{sheet_id}")
def delete_sheet(file_id: int, sheet_id: str):
    """删除某个 sheet（同 sheet_id 的所有节点）"""
    db = SessionLocal()
    try:
        deleted = (
            db.query(XmindNode)
            .filter(
                XmindNode.file_id == file_id,
                XmindNode.sheet_id == sheet_id,
            )
            .delete()
        )
        f = db.query(XmindFile).filter(XmindFile.id == file_id).first()
        if f:
            f.updated_at = datetime.utcnow()
        db.commit()
        return {"ok": True, "deleted": deleted}
    finally:
        db.close()
