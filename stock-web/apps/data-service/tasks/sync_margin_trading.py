#!/usr/bin/env python3
import sys
import os
import re
import json
import time
import urllib.request
from datetime import datetime
from html.parser import HTMLParser

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ".")

from db import SessionLocal, MarginTradingDaily, MarginTradingStockSnapshot
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://data.10jqka.com.cn/",
}

_BOARD_URLS = {
    "sh": "https://data.10jqka.com.cn/market/rzrq/board/sh/",
    "sz": "https://data.10jqka.com.cn/market/rzrq/board/sz/",
    "bj": "https://data.10jqka.com.cn/market/rzrq/board/bj/",
    "total": "https://data.10jqka.com.cn/market/rzrq/",
}

_STOCK_BOARD_URL = "https://data.10jqka.com.cn/market/rzrq/board/gg/page/{page}/"


def _fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("gbk", errors="replace")


def _parse_dataday(html: str) -> list[dict]:
    m = re.search(r"var dataDay\s*=\s*(\[.+?\]);\s*\n", html, re.DOTALL)
    if not m:
        return []
    raw = m.group(1)
    try:
        data = json.loads(raw)
    except Exception:
        return []

    if not data or not isinstance(data[0], list):
        return []

    series = data[0]
    rows = []
    for item in series:
        if not isinstance(item, list) or len(item) < 3:
            continue
        trade_date = item[0]
        metrics = item[2]
        if not isinstance(metrics, list):
            continue
        m_map = {m[0]: m[1] for m in metrics if isinstance(m, list) and len(m) >= 2}
        rows.append(
            {
                "trade_date": trade_date,
                "margin_balance": m_map.get("融资融券余额"),
                "rz_balance": m_map.get("融资余额"),
                "rq_balance": m_map.get("融券余额"),
                "rz_buy": m_map.get("融资买入"),
                "rz_repay": m_map.get("融资偿还"),
            }
        )
    return rows


def _upsert_rows(rows: list[dict], market: str):
    if not rows:
        return 0
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        count = 0
        for row in rows:
            stmt = sqlite_insert(MarginTradingDaily).values(
                trade_date=row["trade_date"],
                market=market,
                margin_balance=row["margin_balance"],
                rz_balance=row["rz_balance"],
                rq_balance=row["rq_balance"],
                rz_buy=row["rz_buy"],
                rz_repay=row["rz_repay"],
                updated_at=now,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["trade_date", "market"],
                set_={
                    "margin_balance": stmt.excluded.margin_balance,
                    "rz_balance": stmt.excluded.rz_balance,
                    "rq_balance": stmt.excluded.rq_balance,
                    "rz_buy": stmt.excluded.rz_buy,
                    "rz_repay": stmt.excluded.rz_repay,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
            count += 1
        db.commit()
        return count
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


class _StockTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self._in_table = False
        self._in_tr = False
        self._in_td = False
        self._cells = []
        self._current_cell = []
        self.rows = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "table":
            cls = attrs_dict.get("class", "")
            if "m-table" in cls or "list" in cls:
                self._in_table = True
        if self._in_table and tag == "tr":
            self._in_tr = True
            self._cells = []
        if self._in_tr and tag in ("td", "th"):
            self._in_td = True
            self._current_cell = []

    def handle_endtag(self, tag):
        if tag == "table":
            self._in_table = False
        if self._in_table and tag == "tr":
            self._in_tr = False
            if self._cells and len(self._cells) >= 8:
                self.rows.append(self._cells[:])
        if self._in_tr and tag in ("td", "th"):
            self._in_td = False
            self._cells.append("".join(self._current_cell).strip())

    def handle_data(self, data):
        if self._in_td:
            self._current_cell.append(data)


def _safe_float(s: str) -> float | None:
    s = s.strip().replace(",", "")
    try:
        return float(s)
    except Exception:
        return None


def _parse_stock_table_page(html: str) -> tuple[list[dict], str | None]:
    parser = _StockTableParser()
    parser.feed(html)

    m = re.search(r"var date\s*=\s*['\"](\d{4}-\d{2}-\d{2})['\"]", html)
    trade_date = m.group(1) if m else None

    if not trade_date:
        m2 = re.search(r"(\d{4}-\d{2}-\d{2})", html)
        trade_date = m2.group(1) if m2 else None

    results = []
    for cells in parser.rows:
        if len(cells) < 10:
            continue
        try:
            int(cells[0])
        except Exception:
            continue

        code_raw = cells[1].strip()
        code = re.sub(r"\D", "", code_raw)[-6:] if code_raw else ""
        if len(code) != 6:
            continue

        name = cells[2].strip()
        results.append(
            {
                "code": code,
                "name": name,
                "rz_balance": _safe_float(cells[3]),
                "rz_buy": _safe_float(cells[4]),
                "rz_repay": _safe_float(cells[5]),
                "rz_net": _safe_float(cells[6]),
                "rq_qty": _safe_float(cells[7]),
                "rq_sell": _safe_float(cells[8]),
                "rq_balance": _safe_float(cells[9]),
                "margin_balance": _safe_float(cells[10]) if len(cells) > 10 else None,
            }
        )
    return results, trade_date


def _get_total_pages(html: str) -> int:
    m = re.search(r'data-total-pages=["\'](\d+)["\']', html)
    if m:
        return int(m.group(1))
    m2 = re.search(r"共(\d+)页", html)
    if m2:
        return int(m2.group(1))
    m3 = re.search(r'"totalPage"\s*:\s*(\d+)', html)
    if m3:
        return int(m3.group(1))
    return 1


def _upsert_stock_snapshots(rows: list[dict], trade_date: str) -> int:
    if not rows:
        return 0
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        count = 0
        for row in rows:
            stmt = sqlite_insert(MarginTradingStockSnapshot).values(
                trade_date=trade_date,
                code=row["code"],
                name=row["name"],
                rz_balance=row.get("rz_balance"),
                rz_buy=row.get("rz_buy"),
                rz_repay=row.get("rz_repay"),
                rz_net=row.get("rz_net"),
                rq_qty=row.get("rq_qty"),
                rq_sell=row.get("rq_sell"),
                rq_balance=row.get("rq_balance"),
                margin_balance=row.get("margin_balance"),
                updated_at=now,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["trade_date", "code"],
                set_={
                    "name": stmt.excluded.name,
                    "rz_balance": stmt.excluded.rz_balance,
                    "rz_buy": stmt.excluded.rz_buy,
                    "rz_repay": stmt.excluded.rz_repay,
                    "rz_net": stmt.excluded.rz_net,
                    "rq_qty": stmt.excluded.rq_qty,
                    "rq_sell": stmt.excluded.rq_sell,
                    "rq_balance": stmt.excluded.rq_balance,
                    "margin_balance": stmt.excluded.margin_balance,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
            count += 1
        db.commit()
        return count
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def sync_stock_snapshots():
    print("[margin_trading] 开始爬取个股一览...")
    first_html = _fetch_html(_STOCK_BOARD_URL.format(page=1))
    total_pages = _get_total_pages(first_html)
    if total_pages > 200:
        total_pages = 200

    rows1, trade_date = _parse_stock_table_page(first_html)
    all_rows = list(rows1)

    print(
        f"[margin_trading] 个股一览：共 {total_pages} 页，日期 {trade_date}，第1页 {len(rows1)} 条"
    )

    for page in range(2, total_pages + 1):
        try:
            html = _fetch_html(_STOCK_BOARD_URL.format(page=page))
            rows, _ = _parse_stock_table_page(html)
            all_rows.extend(rows)
            if page % 10 == 0:
                print(
                    f"[margin_trading] 个股一览：已爬 {page}/{total_pages} 页，累计 {len(all_rows)} 条"
                )
            time.sleep(0.3)
        except Exception as e:
            print(f"[margin_trading] 个股一览第 {page} 页失败: {e}")

    if not trade_date:
        trade_date = datetime.now().strftime("%Y-%m-%d")

    n = _upsert_stock_snapshots(all_rows, trade_date)
    print(f"[margin_trading] 个股一览完成，upsert {n} 条，日期 {trade_date}")
    return n


def sync_margin_trading():
    total_upserted = 0
    for market, url in _BOARD_URLS.items():
        try:
            html = _fetch_html(url)
            rows = _parse_dataday(html)
            if not rows:
                print(f"[margin_trading] {market}: 未解析到数据")
                continue
            n = _upsert_rows(rows, market)
            total_upserted += n
            print(f"[margin_trading] {market}: upsert {n} 条 (共 {len(rows)} 条解析)")
        except Exception as e:
            print(f"[margin_trading] {market} 失败: {e}")

    try:
        n2 = sync_stock_snapshots()
        total_upserted += n2
    except Exception as e:
        print(f"[margin_trading] 个股一览失败: {e}")

    print(f"[margin_trading] 完成，合计 upsert {total_upserted} 条")
    return total_upserted


if __name__ == "__main__":
    sync_margin_trading()
