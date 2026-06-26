#!/usr/bin/env python3
"""
Batch scrape Guba posts for all stocks in the database.
Usage: python batch_scrape_guba.py [--limit N] [--delay SECONDS]
"""

import requests
import sqlite3
import time
import argparse
from datetime import datetime

DB_PATH = "apps/data-service/stock_data.db"
API_BASE = "http://localhost:8000"


def get_stock_codes(limit=None):
    """Get all stock codes from database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    if limit:
        cursor.execute("SELECT code FROM stock_quote ORDER BY code LIMIT ?", (limit,))
    else:
        cursor.execute("SELECT code FROM stock_quote ORDER BY code")

    codes = [row[0] for row in cursor.fetchall()]
    conn.close()
    return codes


def scrape_stock(code, delay=3):
    """Trigger scraping for a single stock"""
    url = f"{API_BASE}/api/guba/sync/{code}"

    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Scraping {code}...", end=" ")
        response = requests.post(url, timeout=30)

        if response.status_code == 200:
            data = response.json()
            total = data.get("total_saved", 0)
            print(f"✓ Saved {total} posts")
            return True
        else:
            print(f"✗ HTTP {response.status_code}")
            return False

    except requests.RequestException as e:
        print(f"✗ Error: {e}")
        return False
    finally:
        time.sleep(delay)


def main():
    parser = argparse.ArgumentParser(description="Batch scrape Guba posts")
    parser.add_argument("--limit", type=int, help="Limit number of stocks to scrape")
    parser.add_argument(
        "--delay", type=float, default=3.0, help="Delay between requests (seconds)"
    )
    parser.add_argument("--start-from", type=str, help="Start from specific stock code")
    args = parser.parse_args()

    codes = get_stock_codes(args.limit)

    if args.start_from:
        try:
            start_index = codes.index(args.start_from)
            codes = codes[start_index:]
            print(f"Starting from {args.start_from} (index {start_index})")
        except ValueError:
            print(f"Warning: {args.start_from} not found in database")

    print(f"Found {len(codes)} stocks to scrape")
    print(f"Delay between requests: {args.delay}s")
    print(f"Estimated time: {len(codes) * args.delay / 60:.1f} minutes")
    print("-" * 60)

    success_count = 0
    fail_count = 0

    for i, code in enumerate(codes, 1):
        print(f"[{i}/{len(codes)}] ", end="")
        if scrape_stock(code, args.delay):
            success_count += 1
        else:
            fail_count += 1

    print("-" * 60)
    print(f"Completed: {success_count} success, {fail_count} failed")

    # Show final stats
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) as total_posts, COUNT(DISTINCT code) as unique_stocks FROM guba_post"
    )
    total_posts, unique_stocks = cursor.fetchone()
    conn.close()

    print(f"Database now contains: {total_posts} posts from {unique_stocks} stocks")


if __name__ == "__main__":
    main()
