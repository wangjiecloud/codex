"""Real scraper for eastmoney guba."""

import requests
from bs4 import BeautifulSoup
from typing import List, Dict
import re
import time


def scrape_guba_posts(
    code: str, category: str = "all", max_pages: int = 2
) -> List[Dict]:
    """
    Scrape real posts from eastmoney guba.

    category: "all" | "announcement" | "research" | "news"
    """
    category_codes = {"all": 0, "announcement": 1, "news": 2, "research": 3}
    cat_code = category_codes.get(category, 0)

    base_url = f"https://guba.eastmoney.com/list,{code}"
    if category != "all":
        base_url = f"{base_url},99_{cat_code}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Cache-Control": "max-age=0",
    }

    all_posts = []

    for page in range(1, max_pages + 1):
        try:
            url = f"{base_url}.html" if page == 1 else f"{base_url}_{page}.html"

            response = requests.get(url, headers=headers, timeout=15)
            response.encoding = "utf-8"

            if response.status_code != 200:
                continue

            soup = BeautifulSoup(response.text, "lxml")
            items = soup.select("tr.listitem")

            for item in items:
                try:
                    read_elem = item.select_one(".read")
                    read_count = int(read_elem.get_text(strip=True)) if read_elem else 0

                    reply_elem = item.select_one(".reply")
                    comment_count = (
                        int(reply_elem.get_text(strip=True)) if reply_elem else 0
                    )

                    title_elem = item.select_one(".title a")
                    if not title_elem:
                        continue

                    title = title_elem.get_text(strip=True)
                    post_url = title_elem.get("href", "")
                    if post_url and not post_url.startswith("http"):
                        post_url = f"https://guba.eastmoney.com{post_url}"

                    post_id = title_elem.get("data-postid", "")
                    if not post_id and post_url:
                        match = re.search(r"/news,\w+,(\d+)\.html", post_url)
                        if match:
                            post_id = match.group(1)

                    author_elem = item.select_one(".author a")
                    author = author_elem.get_text(strip=True) if author_elem else "匿名"

                    time_elem = item.select_one(".update")
                    post_time = time_elem.get_text(strip=True) if time_elem else ""

                    post_type = title_elem.get("data-posttype", "")
                    detected_category = category if category != "all" else "news"
                    if post_type == "1":
                        detected_category = "announcement"
                    elif post_type == "3":
                        detected_category = "research"
                    elif "公告" in title[:10]:
                        detected_category = "announcement"
                    elif "研报" in title or "研究" in title:
                        detected_category = "research"

                    if title and post_id:
                        all_posts.append(
                            {
                                "post_id": post_id,
                                "title": title,
                                "author": author,
                                "read_count": read_count,
                                "comment_count": comment_count,
                                "post_time": post_time,
                                "url": post_url,
                                "category": detected_category,
                            }
                        )

                except Exception as e:
                    continue

            if page < max_pages:
                time.sleep(1)

        except Exception as e:
            print(f"[scraper] Error page {page}: {e}")
            continue

    return all_posts


def scrape_all_categories(code: str) -> Dict[str, List[Dict]]:
    result = {
        "announcement": [],
        "research": [],
        "news": [],
    }

    all_posts = scrape_guba_posts(code, category="all", max_pages=2)

    for post in all_posts:
        cat = post.get("category", "news")
        if cat in result:
            result[cat].append(post)

    for category in ["announcement", "research", "news"]:
        if len(result[category]) < 5:
            extra = scrape_guba_posts(code, category=category, max_pages=1)
            for p in extra:
                if p["post_id"] not in [x["post_id"] for x in result[category]]:
                    result[category].append(p)
        result[category] = result[category][:20]

    return result


if __name__ == "__main__":
    test_code = "300750"
    print(f"Scraping {test_code}...")
    data = scrape_all_categories(test_code)
    for cat, items in data.items():
        print(f"\n{cat}: {len(items)} items")
        if items:
            print(f"  [{items[0]['post_time']}] {items[0]['title'][:40]}...")
            print(
                f"  Author: {items[0]['author']}, Reads: {items[0]['read_count']}, Comments: {items[0]['comment_count']}"
            )
