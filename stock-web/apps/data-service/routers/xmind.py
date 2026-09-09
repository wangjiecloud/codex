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


def _call_llm_vision(
    prompt: str,
    image_urls: list[str],
    system: str = "",
    model: Optional[str] = None,
    max_tokens: int = 4096,
) -> str:
    """调用多模态 LLM API（vision），传入图片 URL 做图片内容解析。返回文本响应。"""
    cfg = _load_llm_config()
    vision_model = model or os.environ.get("XMIND_VISION_MODEL", "claude-sonnet-4-6")

    content_parts: list = [{"type": "text", "text": prompt}]
    for img_url in image_urls:
        content_parts.append({"type": "image_url", "image_url": {"url": img_url}})

    messages: list = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": content_parts})

    resp = requests.post(
        f"{_LLM_BASE_URL}/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": cfg["authorization"],
            "user": cfg["user"],
        },
        json={
            "model": vision_model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.3,
        },
        timeout=180,
    )
    if not resp.ok:
        raise RuntimeError(
            f"LLM Vision API error {resp.status_code}: {resp.text[:200]}"
        )

    data = resp.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    return content


# ── 图片内容分析 ──────────────────────────────────────────────────────────────


_VISION_SYSTEM = """你是一个图片内容分析专家。请仔细分析图片中的所有文字、图表、架构信息，
将其转化为结构化的文本描述。注意：
1. 提取图片中所有可见的文字内容（标题、标签、说明、注释等）
2. 描述图表/架构图的结构关系（如层级、流程、分类、模块依赖）
3. 如果是架构图，列出各模块名称和它们之间的关系
4. 如果是流程图，按流程顺序列出各步骤
5. 保持原文信息的准确性和完整性，不要遗漏关键内容
6. 用 markdown 格式输出，层次清晰"""


def _analyze_images(raw_content: dict) -> dict:
    """
    当网页含图片时，用 vision LLM 解析图片内容。
    将解析出的文本追加到 raw_content["full_text"]。
    图片 URL 保留在 raw_content["images"] 中，供后续在节点 url 字段中引用。
    """
    images = raw_content.get("images", [])
    full_text_len = len(raw_content.get("full_text", ""))

    # 判断是否需要图片分析：
    #   - 图片为主（正文少于 800 字 且至少 1 张图片）
    #   - 或图片较多（>= 3 张）
    need_vision = (full_text_len < 800 and len(images) >= 1) or (len(images) >= 3)

    if not need_vision or not images:
        return raw_content

    image_descriptions = []
    for img in images[:8]:
        try:
            result = _call_llm_vision(
                prompt=f"请详细分析这张图片的内容。图片描述: {img.get('alt', '无')}",
                image_urls=[img["url"]],
                system=_VISION_SYSTEM,
                max_tokens=4096,
            )
            if result.strip():
                image_descriptions.append(
                    f"[图片内容解析] {img.get('alt', '')}\n{result.strip()}\n"
                    f"图片链接: {img['url']}"
                )
        except Exception:
            pass

    if image_descriptions:
        img_text = "\n\n".join(image_descriptions)
        raw_content["full_text"] = raw_content["full_text"] + "\n\n" + img_text

    return raw_content


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
    seen = set()
    unique_links = []
    for lk in links:
        if lk["url"] not in seen:
            seen.add(lk["url"])
            unique_links.append(lk)
    unique_links = unique_links[:30]

    # 提取图片（架构图、流程图、示意图等）
    images = []
    for img in content_area.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if not src or src.startswith("data:"):
            continue
        if src.startswith("/"):
            src = urljoin(source_url, src)
        elif not src.startswith("http"):
            continue
        alt = (img.get("alt") or img.get("title") or "").strip()
        # 过滤掉小图标/头像（通常尺寸很小）
        width = img.get("width", "")
        height = img.get("height", "")
        if width and width.isdigit() and int(width) < 50:
            continue
        if height and height.isdigit() and int(height) < 50:
            continue
        images.append({"url": src, "alt": alt})
    images = images[:15]

    return {
        "title": page_title,
        "url": source_url,
        "meta_desc": meta_desc,
        "full_text": full_text,
        "links": unique_links,
        "images": images,
    }


# ── LLM 智能结构化 ───────────────────────────────────────────────────────────


_LLM_SYSTEM_PROMPT = """你是一个知识架构师。你的任务是围绕一个主题，构建全方位的知识结构思维导图（JSON格式）。
用户提供的内容只是参考素材，你的目标是以这些素材为线索，构建出该主题完整、系统的知识框架。
框架中的每个节点必须有实质性的 content 字段（概要说明），不能为空字符串。
素材中涉及的具体细节、案例、图表等，嵌入到框架的对应位置作为补充，并标注 url 字段（来源链接）。
输出必须是纯 JSON，不要包含 markdown 代码块标记。"""


def _build_framework_prompt(
    raw_content: dict,
    root_topic: str,
    existing_tree_json: Optional[str] = None,
) -> str:
    """
    构建 LLM prompt：
    1. 根节点 = root_topic（XMind 文件名），是对该主题的全面概述
    2. 首先构建该主题的完整知识框架（一级分类=核心知识领域，二级=关键知识点，三级=具体细节）
    3. 然后将素材内容嵌入到框架的对应位置，作为细节补充
    4. 框架要全面、系统，不局限于素材内容
    5. 如果已有树结构，在已有框架基础上整合新素材，不破坏已有结构
    """
    links_text = ""
    if raw_content.get("links"):
        links_text = "\n\n[素材中的重要链接]\n"
        for lk in raw_content["links"][:15]:
            links_text += f"- {lk['text']}: {lk['url']}\n"

    images_text = ""
    if raw_content.get("images"):
        images_text = "\n\n[素材中的图片（架构图/流程图/示意图等）]\n"
        for img in raw_content["images"][:10]:
            desc = f"描述: {img['alt']}" if img.get("alt") else "无描述"
            images_text += f"- {desc}: {img['url']}\n"

    existing_tree_text = ""
    if existing_tree_json:
        existing_tree_text = f"""\
\n\n[已有的知识框架树（JSON）]
{existing_tree_json}

重要：已有框架是你的基础结构。新素材中的信息应该整合到已有框架的对应节点中：
- 如果素材涉及已有节点的内容，在 content 中补充细节，在 url 中标注来源
- 如果素材包含已有框架未覆盖的知识点，在合适的位置新增子节点
- 不要删除已有节点，只能新增或丰富
- 保持框架的系统性和完整性
"""

    prompt = f"""请围绕「{root_topic}」这个主题，构建一个全方位的知识结构思维导图。

素材标题：{raw_content["title"]}
素材URL：{raw_content["url"]}
{existing_tree_text}

素材正文内容：
{raw_content["full_text"][:8000]}
{links_text}
{images_text}

请按以下要求生成 JSON：

1. 根节点 title = "{root_topic}"，content = 对「{root_topic}」这个主题的全面概述（3-5句话，说明该主题的核心研究对象、关键问题和知识体系）
2. 一级子节点 = 该主题的核心知识领域（如同一本教科书的章节划分），每个领域应有明确的边界和定位
3. 二级子节点 = 该知识领域下的关键知识点（如章节中的小节）
4. 三级及更深子节点 = 具体技术细节、实现方法、典型案例等
5. 每个节点的 content 字段必须包含该知识点的概要说明（至少1-2句话），绝不能为空
6. 素材中的信息嵌入到框架的对应位置：
   - 如果素材内容涉及某个知识点，在 content 中补充具体细节
   - 在 url 字段中标注素材来源链接
   - 如果素材中有架构图、流程图等图片，在对应节点的 url 字段中标注图片链接
7. 框架要全面系统：即使素材未涉及的知识领域，也要在框架中体现（这很重要！）
8. 不要用「💡补充」前缀，所有节点都是框架的有机组成部分

返回 JSON 格式（严格遵守）：
{{
  "title": "{root_topic}",
  "content": "对{root_topic}的全面概述",
  "url": "",
  "children": [
    {{
      "title": "核心知识领域1",
      "content": "该领域的概要说明，描述在{root_topic}中的定位",
      "url": "",
      "children": [
        {{
          "title": "关键知识点1",
          "content": "详细说明，包含素材中的相关细节",
          "url": "素材来源URL（如有）",
          "children": [
            {{
              "title": "具体细节",
              "content": "说明",
              "url": "",
              "children": []
            }}
          ]
        }},
        {{
          "title": "关键知识点2",
          "content": "说明",
          "url": "",
          "children": []
        }}
      ]
    }},
    {{
      "title": "核心知识领域2",
      "content": "说明",
      "url": "",
      "children": []
    }}
  ]
}}"""

    return prompt


def _llm_structure_tree(
    raw_content: dict,
    root_topic: str,
    existing_tree_json: Optional[str] = None,
) -> dict:
    """使用 LLM 构建完整知识框架，并将素材嵌入框架中"""
    prompt = _build_framework_prompt(raw_content, root_topic, existing_tree_json)

    try:
        tree = _call_llm_json(prompt, _LLM_SYSTEM_PROMPT)
    except Exception as e:
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

    tree["title"] = root_topic
    tree["url"] = ""

    def _ensure_fields(node: dict):
        if "content" not in node:
            node["content"] = ""
        if "url" not in node:
            node["url"] = ""
        if "children" not in node:
            node["children"] = []
        for child in node["children"]:
            _ensure_fields(child)

    _ensure_fields(tree)

    return tree


# ── 下钻子 Sheet 自动生成 ─────────────────────────────────────────────────────


_DRILL_SYSTEM = """你是一个知识架构师。你的任务是对某个子主题进行深度展开，构建详细的知识结构思维导图（JSON格式）。
要求：
1. 每个节点的 content 必须是一段完整的说明（3-8句话），包含定义、作用、关键特点、实现方式等
2. 树的深度至少3层（核心概念 → 关键要点 → 具体细节），尽量详细
3. 节点要具体、有信息量，不要空泛的标题
4. 如果素材中有图片链接，保留在对应节点的 url 字段
5. 输出纯 JSON，不要 markdown 代码块标记"""


def _generate_drill_sheets(
    overview_tree: dict,
    root_topic: str,
    source_url: str,
) -> list[dict]:
    """
    自动为概览图中每个一级子节点生成详细下钻子 Sheet。
    返回 [{sheet_id, sheet_title, tree, source_url}, ...]
    每个子 Sheet 以该一级节点为主题做深度展开。
    """
    top_level_nodes = overview_tree.get("children", [])
    if not top_level_nodes:
        return []

    drill_sheets = []

    for idx, node in enumerate(top_level_nodes):
        node_title = node.get("title", "")
        node_content = node.get("content", "")
        if not node_title:
            continue

        # 收集该节点的子节点信息作为上下文
        children_text = ""
        children = node.get("children", [])
        if children:
            children_text = "\n该主题在概览图中的子节点（供参考）：\n"
            for c in children:
                children_text += (
                    f"- {c.get('title', '')}: {c.get('content', '')[:150]}\n"
                )

        node_urls = node.get("url", "")

        drill_prompt = f"""请对「{node_title}」这个子主题进行深度展开，构建一个详细的知识结构思维导图。

这是「{root_topic}」主题下的一个子领域。
概览图中对该主题的说明：{node_content}
{children_text}
{f"相关图片链接: {node_urls}" if node_urls else ""}

请按以下要求生成 JSON：
1. 根节点 title = "{node_title}"，content = 对「{node_title}」的全面详细说明（3-5句话，涵盖核心定义、作用和价值）
2. 一级子节点 = 该子主题的核心方面/关键维度（4-8个），每个方面应有明确的边界
3. 二级子节点 = 每个方面的具体要点（3-6个），要有实质性内容
4. 三级及更深子节点 = 细节说明、案例、技术参数、实现方式等
5. 每个节点的 content 是一段完整说明（3-8句话），不能为空，不能只是标题
6. 如果有图片链接，在对应节点 url 字段中保留

返回 JSON 格式（严格遵守）：
{{
  "title": "{node_title}",
  "content": "详细说明",
  "url": "{node_urls}",
  "children": [
    {{
      "title": "核心方面1",
      "content": "详细说明（3-8句话）",
      "url": "",
      "children": [
        {{
          "title": "具体要点",
          "content": "说明",
          "url": "",
          "children": []
        }}
      ]
    }}
  ]
}}"""

        try:
            tree = _call_llm_json(drill_prompt, _DRILL_SYSTEM)

            def _ensure(n: dict):
                if "content" not in n:
                    n["content"] = ""
                if "url" not in n:
                    n["url"] = ""
                if "children" not in n:
                    n["children"] = []
                for c in n["children"]:
                    _ensure(c)

            _ensure(tree)
            tree["title"] = node_title
        except Exception:
            tree = node
            tree.setdefault("children", [])

        sheet_id = f"drill-{idx}"
        drill_sheets.append(
            {
                "sheet_id": sheet_id,
                "sheet_title": node_title,
                "tree": tree,
                "source_url": source_url,
                "drill_node_index": idx,
            }
        )

    return drill_sheets


def _get_sheet_tree_json(db, file_id: int, sheet_id: str) -> Optional[str]:
    """读取文件中指定 sheet 的树结构，返回 JSON 字符串（供 LLM 参考）"""
    nodes = (
        db.query(XmindNode)
        .filter(XmindNode.file_id == file_id, XmindNode.sheet_id == sheet_id)
        .order_by(XmindNode.node_order)
        .all()
    )
    if not nodes:
        return None

    children_map: dict[Optional[int], list[XmindNode]] = {}
    for n in nodes:
        pid = n.parent_id
        if pid not in children_map:
            children_map[pid] = []
        children_map[pid].append(n)

    roots = children_map.get(None, [])
    if not roots:
        return None

    def build(node: XmindNode) -> dict:
        return {
            "title": node.title,
            "content": (node.content or "")[:200],
            "url": node.url or "",
            "children": [build(k) for k in children_map.get(node.id, [])],
        }

    tree = build(roots[0])
    return json.dumps(tree, ensure_ascii=False)


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
    """获取已有的一级分类节点标题"""
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


def _get_existing_tree_json(db, file_id: int) -> Optional[str]:
    """读取文件已有的树结构，返回 JSON 字符串（供 LLM 参考）"""
    nodes = (
        db.query(XmindNode)
        .filter(XmindNode.file_id == file_id)
        .order_by(XmindNode.node_order)
        .all()
    )
    if not nodes:
        return None

    children_map: dict[Optional[int], list[XmindNode]] = {}
    for n in nodes:
        pid = n.parent_id
        if pid not in children_map:
            children_map[pid] = []
        children_map[pid].append(n)

    roots = children_map.get(None, [])
    if not roots:
        return None

    def build(node: XmindNode) -> dict:
        return {
            "title": node.title,
            "content": (node.content or "")[:200],
            "url": node.url or "",
            "children": [build(k) for k in children_map.get(node.id, [])],
        }

    tree = build(roots[0])
    return json.dumps(tree, ensure_ascii=False)


def _replace_all_nodes(
    db, file_id: int, sheet_id: str, sheet_title: str, tree: dict, source_url: str
):
    """删除旧节点，写入新的完整树（单一 sheet 模式）"""
    db.query(XmindNode).filter(XmindNode.file_id == file_id).delete()

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
    - 含图片时用 vision LLM OCR 图片内容
    - 生成概览 Sheet + 每个一级节点的下钻子 Sheet
    不入库，仅供预览。
    """
    try:
        html, final_url = _fetch_url(req.url)
    except Exception as e:
        raise HTTPException(400, f"URL 获取失败: {e}")

    raw = _extract_raw_content(html, final_url)

    # 如果网页含图片，用 vision LLM 解析图片内容
    raw = _analyze_images(raw)

    # 用 LLM 结构化概览
    overview_tree = _llm_structure_tree(raw, raw["title"], None)

    def count_nodes(node: dict) -> int:
        return 1 + sum(count_nodes(c) for c in node.get("children", []))

    # 自动为每个一级节点生成下钻子 Sheet
    drill_sheets = _generate_drill_sheets(overview_tree, raw["title"], final_url)

    return {
        "url": final_url,
        "title": raw["title"],
        "content": raw.get("meta_desc", ""),
        "node_count": count_nodes(overview_tree),
        "tree": overview_tree,
        "raw_text_length": len(raw["full_text"]),
        "has_images": len(raw.get("images", [])) > 0,
        "image_count": len(raw.get("images", [])),
        "drill_sheets": [
            {
                "sheet_id": ds["sheet_id"],
                "sheet_title": ds["sheet_title"],
                "node_count": count_nodes(ds["tree"]),
                "tree": ds["tree"],
            }
            for ds in drill_sheets
        ],
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


# ── 通用文件内容提取 ──────────────────────────────────────────────────────────


_TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".rst",
    ".log",
    ".csv",
    ".tsv",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".swift",
    ".kt",
    ".scala",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".ps1",
    ".bat",
    ".cmd",
    ".sql",
    ".html",
    ".htm",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".xml",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".json",
    ".jsonl",
    ".ndjson",
    ".graphql",
    ".gql",
    ".vue",
    ".svelte",
    ".astro",
    ".dockerfile",
    ".env",
    ".gitignore",
    ".editorconfig",
    ".proto",
    ".thrift",
    ".wasm",
    ".lua",
    ".r",
    ".dart",
    ".groovy",
    ".clj",
    ".cljs",
    ".ex",
    ".exs",
    ".nim",
    ".zig",
    ".v",
    ".cr",
    ".d",
}

_PDF_EXTENSIONS = {".pdf"}

_DOC_EXTENSIONS = {".doc", ".docx", ".rtf"}


def _extract_text_file_content(file_bytes: bytes, filename: str) -> dict:
    """提取文本类文件内容，返回与 _extract_raw_content 相同的结构"""
    try:
        text = file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = file_bytes.decode("gbk")
        except UnicodeDecodeError:
            text = file_bytes.decode("utf-8", errors="replace")

    title = os.path.splitext(filename)[0]

    return {
        "title": title,
        "url": "",
        "meta_desc": f"文件: {filename}, {len(text)} 字符",
        "full_text": text,
        "links": [],
    }


def _extract_file_content(file_bytes: bytes, filename: str) -> dict:
    """根据文件类型分发到对应的提取函数"""
    ext = os.path.splitext(filename)[1].lower()

    if ext in _PDF_EXTENSIONS:
        return _extract_pdf_content(file_bytes, filename)

    if ext in _DOC_EXTENSIONS:
        try:
            import pymupdf

            doc = pymupdf.open(stream=file_bytes, filetype="pdf")
            pages_text = []
            for page in doc:
                text = page.get_text("text")
                if text.strip():
                    pages_text.append(text.strip())
            doc.close()
            full_text = "\n\n".join(pages_text)
            return {
                "title": os.path.splitext(filename)[0],
                "url": "",
                "meta_desc": f"文档: {filename}, 共 {len(pages_text)} 页",
                "full_text": full_text,
                "links": [],
            }
        except Exception:
            return _extract_text_file_content(file_bytes, filename)

    return _extract_text_file_content(file_bytes, filename)


@router.post("/parse-directory")
async def parse_directory(files: list[UploadFile] = File(...)):
    """
    上传文件目录中的多个文件，逐个提取文本内容，
    合并后使用 LLM 结构化为知识树。不入库，仅供预览。
    """
    if not files:
        raise HTTPException(400, "请上传文件")

    file_contents = []
    for upload_file in files:
        if not upload_file.filename:
            continue
        ext = os.path.splitext(upload_file.filename)[1].lower()
        if (
            ext not in _TEXT_EXTENSIONS
            and ext not in _PDF_EXTENSIONS
            and ext not in _DOC_EXTENSIONS
        ):
            continue
        try:
            file_bytes = await upload_file.read()
            if not file_bytes:
                continue
            raw = _extract_file_content(file_bytes, upload_file.filename)
            file_contents.append(
                {
                    "filename": upload_file.filename,
                    "title": raw["title"],
                    "text": raw["full_text"],
                }
            )
        except Exception:
            continue

    if not file_contents:
        raise HTTPException(400, "目录中没有可解析的文件")

    combined_title = (
        file_contents[0]["title"]
        if len(file_contents) == 1
        else os.path.basename(
            os.path.dirname(file_contents[0]["filename"])
            or file_contents[0]["filename"]
        )
        or "文件目录"
    )

    combined_text_parts = []
    for fc in file_contents:
        combined_text_parts.append(f"━━━ 文件: {fc['filename']} ━━━\n\n{fc['text']}")
    combined_text = "\n\n".join(combined_text_parts)

    if len(combined_text) > 30000:
        combined_text = combined_text[:30000] + "\n\n[内容过长，已截断]"

    raw = {
        "title": combined_title,
        "url": "",
        "meta_desc": f"目录文件合并: {len(file_contents)} 个文件, {len(combined_text)} 字符",
        "full_text": combined_text,
        "links": [],
        "images": [],
    }

    tree = _llm_structure_tree(raw, raw["title"], None)

    def count_nodes(node: dict) -> int:
        return 1 + sum(count_nodes(c) for c in node.get("children", []))

    return {
        "url": "",
        "title": raw["title"],
        "content": raw.get("meta_desc", ""),
        "node_count": count_nodes(tree),
        "tree": tree,
        "raw_text_length": len(raw["full_text"]),
        "file_count": len(file_contents),
        "files": [fc["filename"] for fc in file_contents],
    }


@router.post("/merge-directory/{file_id}")
async def merge_directory(
    file_id: int,
    files: list[UploadFile] = File(...),
):
    """
    上传文件目录中的多个文件，逐个提取文本内容，
    合并后使用 LLM 整合到已有 XMind 文件的知识框架中。
    单一 sheet 模式，所有内容在同一个 tab 中。
    """
    db = SessionLocal()
    try:
        f = db.query(XmindFile).filter(XmindFile.id == file_id).first()
        if not f:
            raise HTTPException(404, "文件不存在")

        if not files:
            raise HTTPException(400, "请上传文件")

        file_contents = []
        for upload_file in files:
            if not upload_file.filename:
                continue
            ext = os.path.splitext(upload_file.filename)[1].lower()
            if (
                ext not in _TEXT_EXTENSIONS
                and ext not in _PDF_EXTENSIONS
                and ext not in _DOC_EXTENSIONS
            ):
                continue
            try:
                file_bytes = await upload_file.read()
                if not file_bytes:
                    continue
                raw = _extract_file_content(file_bytes, upload_file.filename)
                file_contents.append(
                    {
                        "filename": upload_file.filename,
                        "title": raw["title"],
                        "text": raw["full_text"],
                    }
                )
            except Exception:
                continue

        if not file_contents:
            raise HTTPException(400, "目录中没有可解析的文件")

        combined_text_parts = []
        for fc in file_contents:
            combined_text_parts.append(
                f"━━━ 文件: {fc['filename']} ━━━\n\n{fc['text']}"
            )
        combined_text = "\n\n".join(combined_text_parts)

        if len(combined_text) > 30000:
            combined_text = combined_text[:30000] + "\n\n[内容过长，已截断]"

        combined_title = (
            file_contents[0]["title"] if len(file_contents) == 1 else f.name
        )

        raw = {
            "title": combined_title,
            "url": "",
            "meta_desc": f"目录文件合并: {len(file_contents)} 个文件, {len(combined_text)} 字符",
            "full_text": combined_text,
            "links": [],
            "images": [],
        }

        source_url = f"directory://{len(file_contents)}-files"

        existing_tree_json = _get_existing_tree_json(db, file_id)

        tree = _llm_structure_tree(raw, f.name, existing_tree_json)

        sheet_id = "main"
        sheet_title = f.name

        _replace_all_nodes(db, file_id, sheet_id, sheet_title, tree, source_url)

        f.updated_at = datetime.utcnow()
        db.commit()

        node_count = db.query(XmindNode).filter(XmindNode.file_id == file_id).count()
        sheet_count = (
            db.query(XmindNode.sheet_id)
            .filter(XmindNode.file_id == file_id)
            .distinct()
            .count()
        )

        return {
            "ok": True,
            "sheet_id": sheet_id,
            "sheet_title": sheet_title,
            "source_url": source_url,
            "node_count": node_count,
            "total_sheets": sheet_count,
            "tree": tree,
            "file_count": len(file_contents),
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

    tree = _llm_structure_tree(raw, raw["title"], None)

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
):
    """
    上传 PDF 文件，提取文本并 LLM 整合到已有 XMind 文件的知识框架中。
    单一 sheet 模式，所有内容在同一个 tab 中。
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

        # 读取已有树结构
        existing_tree_json = _get_existing_tree_json(db, file_id)

        # LLM 构建/整合知识框架
        tree = _llm_structure_tree(raw, f.name, existing_tree_json)

        # 单一 sheet
        sheet_id = "main"
        sheet_title = f.name

        _replace_all_nodes(db, file_id, sheet_id, sheet_title, tree, source_url)

        f.updated_at = datetime.utcnow()
        db.commit()

        node_count = db.query(XmindNode).filter(XmindNode.file_id == file_id).count()
        sheet_count = (
            db.query(XmindNode.sheet_id)
            .filter(XmindNode.file_id == file_id)
            .distinct()
            .count()
        )

        return {
            "ok": True,
            "sheet_id": sheet_id,
            "sheet_title": sheet_title,
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
    将 URL 内容整合到已有 XMind 文件的知识框架中。
    - 含图片时用 vision LLM OCR 图片内容
    - 生成概览 Sheet + 每个一级节点的下钻子 Sheet
    - 概览 Sheet 中的每个一级节点带跳转链接到对应子 Sheet
    """
    db = SessionLocal()
    try:
        f = db.query(XmindFile).filter(XmindFile.id == file_id).first()
        if not f:
            raise HTTPException(404, "文件不存在")

        try:
            html, final_url = _fetch_url(req.url)
        except Exception as e:
            raise HTTPException(400, f"URL 获取失败: {e}")

        raw = _extract_raw_content(html, final_url)

        # 如果网页含图片，用 vision LLM 解析图片内容
        raw = _analyze_images(raw)

        # 读取已有树结构
        existing_tree_json = _get_existing_tree_json(db, file_id)

        # LLM 构建/整合概览知识框架
        overview_tree = _llm_structure_tree(raw, f.name, existing_tree_json)

        # 自动为每个一级节点生成下钻子 Sheet
        drill_sheets = _generate_drill_sheets(overview_tree, f.name, final_url)

        # 先删除旧节点
        db.query(XmindNode).filter(XmindNode.file_id == file_id).delete()

        # 概览 Sheet 中的每个一级节点添加跳转链接到对应子 Sheet
        top_level_nodes = overview_tree.get("children", [])
        for idx, node in enumerate(top_level_nodes):
            matching_drill = None
            for ds in drill_sheets:
                if ds.get("drill_node_index") == idx:
                    matching_drill = ds
                    break
            if matching_drill:
                drill_sheet_id = matching_drill["sheet_id"]
                drill_sheet_title = matching_drill["sheet_title"]
                existing_url = node.get("url", "")
                node["url"] = f"xmind://go-to-sheet?id={drill_sheet_id}"
                node["content"] = (
                    node.get("content", "")
                    + f"\n\n➡️ 点击跳转到详细子导图: {drill_sheet_title}"
                )
                if existing_url:
                    node["content"] += f"\n素材来源: {existing_url}"

        # 保存概览 Sheet
        _save_tree_to_db(db, file_id, "overview", f.name, overview_tree, final_url)

        # 保存每个下钻子 Sheet
        for ds in drill_sheets:
            _save_tree_to_db(
                db,
                file_id,
                ds["sheet_id"],
                ds["sheet_title"],
                ds["tree"],
                final_url,
            )

        f.updated_at = datetime.utcnow()
        db.commit()

        node_count = db.query(XmindNode).filter(XmindNode.file_id == file_id).count()
        sheet_count = (
            db.query(XmindNode.sheet_id)
            .filter(XmindNode.file_id == file_id)
            .distinct()
            .count()
        )

        return {
            "ok": True,
            "sheet_id": "overview",
            "sheet_title": f.name,
            "source_url": final_url,
            "node_count": node_count,
            "total_sheets": sheet_count,
            "tree": overview_tree,
            "drill_sheets": [
                {
                    "sheet_id": ds["sheet_id"],
                    "sheet_title": ds["sheet_title"],
                }
                for ds in drill_sheets
            ],
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
