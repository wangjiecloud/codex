#!/usr/bin/env python3
import sys
import os
import re
import time
import urllib.request
from datetime import datetime
from html.parser import HTMLParser

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ".")

from db import SessionLocal, MarginTradingStockHistory, MarginTradingStockSyncStatus
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://data.10jqka.com.cn/",
}

_HISTORY_URL = "https://data.10jqka.com.cn/market/rzrqgg/code/{code}/page/{page}/"


def _fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("gbk", errors="replace")


class _HistoryTableParser(HTMLParser):
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
            if self._cells and len(self._cells) >= 9:
                self.rows.append(self._cells[:])
        if self._in_tr and tag in ("td", "th"):
            self._in_td = False
            self._cells.append("".join(self._current_cell).strip())

    def handle_data(self, data):
        if self._in_td:
            self._current_cell.append(data)


def _safe_float(s: str) -> float | None:
    s = s.strip().replace(",", "").replace("亿", "").replace("万", "").replace("%", "")
    try:
        return float(s)
    except Exception:
        return None


def _parse_history_page(html: str) -> list[dict]:
    parser = _HistoryTableParser()
    parser.feed(html)

    results = []
    for cells in parser.rows:
        if len(cells) < 9:
            continue
        date_str = cells[0].strip()
        if not re.match(r"\d{4}-\d{2}-\d{2}", date_str):
            continue

        results.append(
            {
                "trade_date": date_str,
                "rz_balance": _safe_float(cells[1]),
                "rz_buy": _safe_float(cells[2]),
                "rz_repay": _safe_float(cells[3]),
                "rz_net": _safe_float(cells[4]),
                "rz_balance_ratio": _safe_float(cells[5]),
                "rq_qty": _safe_float(cells[6]),
                "rq_sell": _safe_float(cells[7]),
                "rq_net": _safe_float(cells[8]),
                "margin_balance": _safe_float(cells[9]) if len(cells) > 9 else None,
            }
        )
    return results


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


def _upsert_history(code: str, rows: list[dict]) -> int:
    if not rows:
        return 0
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        count = 0
        for row in rows:
            stmt = sqlite_insert(MarginTradingStockHistory).values(
                code=code,
                trade_date=row["trade_date"],
                rz_balance=row.get("rz_balance"),
                rz_buy=row.get("rz_buy"),
                rz_repay=row.get("rz_repay"),
                rz_net=row.get("rz_net"),
                rz_balance_ratio=row.get("rz_balance_ratio"),
                rq_qty=row.get("rq_qty"),
                rq_sell=row.get("rq_sell"),
                rq_net=row.get("rq_net"),
                margin_balance=row.get("margin_balance"),
                updated_at=now,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["code", "trade_date"],
                set_={
                    "rz_balance": stmt.excluded.rz_balance,
                    "rz_buy": stmt.excluded.rz_buy,
                    "rz_repay": stmt.excluded.rz_repay,
                    "rz_net": stmt.excluded.rz_net,
                    "rz_balance_ratio": stmt.excluded.rz_balance_ratio,
                    "rq_qty": stmt.excluded.rq_qty,
                    "rq_sell": stmt.excluded.rq_sell,
                    "rq_net": stmt.excluded.rq_net,
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


def _set_sync_status(code: str, status: str, row_count: int = 0):
    db = SessionLocal()
    try:
        stmt = sqlite_insert(MarginTradingStockSyncStatus).values(
            code=code,
            status=status,
            row_count=row_count,
            last_synced_at=datetime.utcnow() if status == "done" else None,
            updated_at=datetime.utcnow(),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["code"],
            set_={
                "status": stmt.excluded.status,
                "row_count": stmt.excluded.row_count,
                "last_synced_at": stmt.excluded.last_synced_at,
                "updated_at": stmt.excluded.updated_at,
            },
        )
        db.execute(stmt)
        db.commit()
    finally:
        db.close()


def sync_stock_history(code: str) -> int:
    _set_sync_status(code, "syncing")
    try:
        first_url = _HISTORY_URL.format(code=code, page=1)
        first_html = _fetch_html(first_url)
        total_pages = min(_get_total_pages(first_html), 20)

        all_rows = _parse_history_page(first_html)

        for page in range(2, total_pages + 1):
            try:
                html = _fetch_html(_HISTORY_URL.format(code=code, page=page))
                rows = _parse_history_page(html)
                all_rows.extend(rows)
                time.sleep(0.3)
            except Exception as e:
                print(f"[stock_margin] {code} 第 {page} 页失败: {e}")

        n = _upsert_history(code, all_rows)
        _set_sync_status(code, "done", n)
        print(f"[stock_margin] {code}: upsert {n} 条历史数据")
        return n
    except Exception as e:
        _set_sync_status(code, "failed")
        print(f"[stock_margin] {code} 同步失败: {e}")
        raise


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sync_stock_margin.py <code>")
        sys.exit(1)
    sync_stock_history(sys.argv[1])
