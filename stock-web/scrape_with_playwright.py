#!/usr/bin/env python3
"""
Scrape Guba data using Playwright to bypass anti-scraping.
Usage: python scrape_with_playwright.py <stock_code> [--category announcement|research|news]
"""

import subprocess
import json
import re
import sys
import time
import argparse


def run_playwright_cmd(cmd):
    """Run playwright-cli command and return output"""
    result = subprocess.run(
        f"playwright-cli {cmd}", shell=True, capture_output=True, text=True
    )
    return result.stdout, result.stderr


def scrape_guba_category(code, category="announcement"):
    """Scrape a single category using Playwright"""
    category_codes = {"announcement": 1, "research": 3, "news": 2}
    cat_code = category_codes.get(category, 1)

    url = f"https://guba.eastmoney.com/list,{code},99_{cat_code}.html"

    print(f"Opening {url}...")
    run_playwright_cmd(f"goto {url}")
    time.sleep(3)

    # Get page HTML
    stdout, _ = run_playwright_cmd('--raw eval "document.documentElement.outerHTML"')

    # Parse HTML to extract posts
    posts = []

    # Extract list items using regex
    pattern = r'<tr[^>]*class="[^"]*listitem[^"]*"[^>]*>(.*?)</tr>'
    matches = re.findall(pattern, stdout, re.DOTALL)

    for match in matches:
        try:
            # Extract read count
            read_match = re.search(
                r'<div[^>]*class="[^"]*read[^"]*"[^>]*>(\d+)</div>', match
            )
            read_count = int(read_match.group(1)) if read_match else 0

            # Extract comment count
            reply_match = re.search(
                r'<div[^>]*class="[^"]*reply[^"]*"[^>]*>(\d+)</div>', match
            )
            comment_count = int(reply_match.group(1)) if reply_match else 0

            # Extract title and URL
            title_match = re.search(
                r'<a[^>]*data-postid="([^"]*)"[^>]*href="([^"]*)"[^>]*>([^<]*)</a>',
                match,
            )
            if not title_match:
                continue

            post_id = title_match.group(1)
            url = title_match.group(2)
            title = title_match.group(3).strip()

            if not url.startswith("http"):
                url = f"https://guba.eastmoney.com{url}"

            # Extract author
            author_match = re.search(
                r'<div[^>]*class="[^"]*author[^"]*"[^>]*>.*?<a[^>]*>([^<]*)</a>',
                match,
                re.DOTALL,
            )
            author = author_match.group(1).strip() if author_match else "匿名"

            # Extract time
            time_match = re.search(
                r'<div[^>]*class="[^"]*update[^"]*"[^>]*>([^<]*)</div>', match
            )
            post_time = time_match.group(1).strip() if time_match else ""

            posts.append(
                {
                    "post_id": post_id,
                    "title": title,
                    "author": author,
                    "read_count": read_count,
                    "comment_count": comment_count,
                    "post_time": post_time,
                    "url": url,
                    "category": category,
                }
            )
        except Exception as e:
            print(f"Error parsing post: {e}")
            continue

    return posts


def main():
    parser = argparse.ArgumentParser(description="Scrape Guba with Playwright")
    parser.add_argument("code", help="Stock code (e.g., 601208)")
    parser.add_argument(
        "--category",
        choices=["announcement", "research", "news"],
        default="announcement",
        help="Category to scrape",
    )
    args = parser.parse_args()

    # Open browser
    print("Opening browser...")
    run_playwright_cmd("open")
    time.sleep(2)

    try:
        posts = scrape_guba_category(args.code, args.category)
        print(f"\nFound {len(posts)} posts")
        print(json.dumps(posts, ensure_ascii=False, indent=2))
    finally:
        # Close browser
        run_playwright_cmd("close")


if __name__ == "__main__":
    main()
