import requests
from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import re
import time

try:
    import akshare as ak

    _AKSHARE_AVAILABLE = True
except ImportError:
    _AKSHARE_AVAILABLE = False

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}


def _normalize_url(href: str) -> str:
    if not href:
        return ""
    if href.startswith("//"):
        return "https:" + href
    if href.startswith("http"):
        return href
    return "https://guba.eastmoney.com" + href


def _parse_post_time(time_str: str) -> str:
    if not time_str:
        return ""
    time_str = str(time_str).strip()
    now_year = time.strftime("%Y")
    m = re.match(r"^(\d{2}-\d{2})\s+(\d{2}:\d{2})$", time_str)
    if m:
        return f"{now_year}-{m.group(1)} {m.group(2)}"
    m = re.match(r"^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$", time_str)
    if m:
        return time_str
    m = re.match(r"^(\d{4}-\d{2}-\d{2})$", time_str)
    if m:
        return f"{time_str} 00:00"
    return time_str


def _scrape_news_akshare(code: str) -> List[Dict]:
    if not _AKSHARE_AVAILABLE:
        return []
    try:
        df = ak.stock_news_em(symbol=code)
        posts = []
        for _, row in df.iterrows():
            raw_time = str(row.get("发布时间", ""))
            post_date = _parse_post_time(raw_time)
            post_id = (
                re.sub(r"[^a-zA-Z0-9]", "", str(row.get("新闻链接", "")))[-30:]
                or f"news_{code}_{len(posts)}"
            )
            posts.append(
                {
                    "post_id": f"news_{post_id}",
                    "title": str(row.get("新闻标题", "")),
                    "author": str(row.get("文章来源", "匿名")),
                    "read_count": 0,
                    "comment_count": 0,
                    "post_time": raw_time,
                    "post_date": post_date,
                    "url": str(row.get("新闻链接", "")),
                    "category": "news",
                    "content": str(row.get("新闻内容", "")),
                }
            )
        return posts
    except Exception as e:
        print(f"[scraper] news akshare error for {code}: {e}")
        return []


def _scrape_announcement_akshare(code: str) -> List[Dict]:
    if not _AKSHARE_AVAILABLE:
        return []
    try:
        df = ak.stock_individual_notice_report(security=code)
        posts = []
        for _, row in df.iterrows():
            raw_time = str(row.get("公告日期", ""))
            post_date = _parse_post_time(raw_time)
            url = str(row.get("网址", ""))
            post_id = (
                re.sub(r"[^a-zA-Z0-9]", "", url)[-30:] or f"ann_{code}_{len(posts)}"
            )
            posts.append(
                {
                    "post_id": f"ann_{post_id}",
                    "title": str(row.get("公告标题", "")),
                    "author": str(row.get("公告类型", "公告")),
                    "read_count": 0,
                    "comment_count": 0,
                    "post_time": raw_time,
                    "post_date": post_date,
                    "url": url,
                    "category": "announcement",
                    "content": "",
                }
            )
        return posts
    except Exception as e:
        print(f"[scraper] announcement akshare error for {code}: {e}")
        return []


def _scrape_research_akshare(code: str) -> List[Dict]:
    if not _AKSHARE_AVAILABLE:
        return []
    try:
        df = ak.stock_research_report_em(symbol=code)
        posts = []
        for _, row in df.iterrows():
            raw_time = str(row.get("日期", ""))
            post_date = _parse_post_time(raw_time)
            url = str(row.get("报告PDF链接", ""))
            post_id = (
                re.sub(r"[^a-zA-Z0-9]", "", url)[-30:] or f"res_{code}_{len(posts)}"
            )
            institution = str(row.get("机构", ""))
            rating = str(row.get("东财评级", ""))
            author = f"{institution} {rating}".strip() if institution else "机构"
            posts.append(
                {
                    "post_id": f"res_{post_id}",
                    "title": str(row.get("报告名称", "")),
                    "author": author,
                    "read_count": 0,
                    "comment_count": 0,
                    "post_time": raw_time,
                    "post_date": post_date,
                    "url": url,
                    "category": "research",
                    "content": "",
                }
            )
        return posts
    except Exception as e:
        print(f"[scraper] research akshare error for {code}: {e}")
        return []


def scrape_category(code: str, category: str, max_pages: int = 5) -> List[Dict]:
    if category == "announcement":
        posts = _scrape_announcement_akshare(code)
    elif category == "news":
        posts = _scrape_news_akshare(code)
    elif category == "research":
        posts = _scrape_research_akshare(code)
    else:
        posts = []
    return posts


def scrape_all(code: str, max_pages: int = 5) -> List[Dict]:
    news = _scrape_news_akshare(code)
    announcements = _scrape_announcement_akshare(code)
    research = _scrape_research_akshare(code)
    all_posts = news + announcements + research
    seen_ids: set = set()
    deduped = []
    for p in all_posts:
        if p["post_id"] not in seen_ids:
            seen_ids.add(p["post_id"])
            p = dict(p)
            p["category"] = "all"
            deduped.append(p)
    return deduped


def scrape_all_categories(code: str, max_pages: int = 5) -> Dict[str, List[Dict]]:
    result: Dict[str, List[Dict]] = {
        "announcement": [],
        "research": [],
        "news": [],
    }

    result["announcement"] = _scrape_announcement_akshare(code)
    print(f"[scraper] {code} announcement: {len(result['announcement'])} posts")

    result["news"] = _scrape_news_akshare(code)
    print(f"[scraper] {code} news: {len(result['news'])} posts")

    result["research"] = _scrape_research_akshare(code)
    print(f"[scraper] {code} research: {len(result['research'])} posts")

    return result


def fetch_post_content(url: str) -> Optional[str]:
    if not url:
        return None
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.encoding = "utf-8"
        if resp.status_code != 200:
            return None
        soup = BeautifulSoup(resp.text, "lxml")

        if "guba.eastmoney.com" in url:
            paragraphs = soup.select(".newspage p")
            if paragraphs:
                lines = [
                    p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)
                ]
                if lines:
                    return "\n".join(lines)

        all_p = soup.find_all("p")
        content_lines = [
            p.get_text(strip=True) for p in all_p if len(p.get_text(strip=True)) > 10
        ]
        if content_lines:
            return "\n".join(content_lines)

        for sel in [".neirong", "#post_content", ".article-content", ".content-text"]:
            elem = soup.select_one(sel)
            if elem:
                text = elem.get_text("\n", strip=True)
                if len(text) > 20:
                    return text

        return None
    except Exception as e:
        print(f"[scraper] fetch_post_content error: {e}")
        return None


if __name__ == "__main__":
    test_code = "000657"
    print(f"Scraping {test_code}...")
    data = scrape_all_categories(test_code, max_pages=2)
    for cat, items in data.items():
        print(f"\n{cat}: {len(items)} items")
        if items:
            print(f"  [{items[0]['post_date']}] {items[0]['title'][:50]}")
