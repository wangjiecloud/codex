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
                    "post_time": post_date if post_date else raw_time,
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


def fetch_stock_info(code: str) -> Optional[Dict]:
    if not _AKSHARE_AVAILABLE:
        return None
    try:
        df = ak.stock_individual_info_em(symbol=code)
        if df is None or df.empty:
            return None

        info_dict = {}
        for _, row in df.iterrows():
            key = str(row.get("item", "")).strip()
            value = str(row.get("value", "")).strip()
            if key:
                info_dict[key] = value

        return {
            "code": code,
            "name": info_dict.get("股票简称", ""),
            "industry": info_dict.get("行业", ""),
            "total_share": info_dict.get("总股本", ""),
            "float_share": info_dict.get("流通股", ""),
            "total_market_cap": info_dict.get("总市值", ""),
            "float_market_cap": info_dict.get("流通市值", ""),
            "pe_dynamic": info_dict.get("市盈率(动)", ""),
            "pb": info_dict.get("市净率", ""),
            "listing_date": info_dict.get("上市时间", ""),
            "raw_data": info_dict,
        }
    except Exception as e:
        print(f"[scraper] fetch_stock_info error for {code}: {e}")
        return None


def fetch_stock_fundamental(code: str) -> Optional[Dict]:
    if not _AKSHARE_AVAILABLE:
        return None
    try:
        df = ak.stock_financial_abstract_ths(symbol=code, indicator="按年度")
        if df is None or df.empty:
            return None

        latest = df.iloc[0].to_dict()
        return {
            "code": code,
            "report_date": str(latest.get("报告期", "")),
            "basic_eps": str(latest.get("基本每股收益", "")),
            "total_operating_revenue": str(latest.get("营业总收入", "")),
            "net_profit": str(latest.get("净利润", "")),
            "total_assets": str(latest.get("总资产", "")),
            "total_liabilities": str(latest.get("总负债", "")),
            "net_assets": str(latest.get("净资产", "")),
            "roe": str(latest.get("净资产收益率", "")),
            "raw_data": {k: str(v) for k, v in latest.items()},
        }
    except Exception as e:
        print(f"[scraper] fetch_stock_fundamental error for {code}: {e}")
        return None


def fetch_guba_all(code: str, page: int = 1) -> List[Dict]:
    """
    Fetch all posts from guba (mixed: user discussions + announcements + news + research)
    URL format: https://guba.eastmoney.com/list,{code},99_{page}.html

    Returns:
        List of dicts with keys: post_id, post_type, title, url, author, author_url,
                                 read_count, reply_count, update_time
    """
    try:
        if page == 1:
            url = f"https://guba.eastmoney.com/list,{code},99.html"
        else:
            url = f"https://guba.eastmoney.com/list,{code},99_{page}.html"

        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.encoding = "utf-8"

        if resp.status_code != 200:
            print(f"[scraper] fetch_guba_all failed: status={resp.status_code}")
            return []

        soup = BeautifulSoup(resp.text, "lxml")

        # Find all post rows
        rows = soup.select("tr.listitem")
        result = []

        for row in rows:
            try:
                # Read count
                read_div = row.select_one("td div.read")
                read_count = int(read_div.get_text(strip=True)) if read_div else 0

                # Reply count
                reply_div = row.select_one("td div.reply")
                reply_count = int(reply_div.get_text(strip=True)) if reply_div else 0

                # Title and link
                title_a = row.select_one("td div.title a")
                if not title_a:
                    continue

                title = title_a.get_text(strip=True)
                post_url = _normalize_url(title_a.get("href", ""))

                # Extract post_id and post_type from data attributes
                post_id = title_a.get("data-postid", "")
                post_type = title_a.get("data-posttype", "0")

                # Author
                author_a = row.select_one("td div.author a")
                author = author_a.get_text(strip=True) if author_a else ""
                author_url = (
                    _normalize_url(author_a.get("href", "")) if author_a else ""
                )

                # Update time
                update_div = row.select_one("td div.update")
                update_time = update_div.get_text(strip=True) if update_div else ""
                update_time = _parse_post_time(update_time)

                result.append(
                    {
                        "post_id": post_id,
                        "post_type": post_type,  # "0" = discussion, "20" = article/news
                        "title": title,
                        "url": post_url,
                        "author": author,
                        "author_url": author_url,
                        "read_count": read_count,
                        "reply_count": reply_count,
                        "update_time": update_time,
                    }
                )

            except Exception as e:
                print(f"[scraper] Error parsing row: {e}")
                continue

        print(f"[scraper] fetch_guba_all({code}, page={page}): {len(result)} posts")
        return result

    except Exception as e:
        print(f"[scraper] fetch_guba_all error: {e}")
        return []


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
