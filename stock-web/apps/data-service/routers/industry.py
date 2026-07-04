from fastapi import APIRouter, BackgroundTasks, Query, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy import text
from datetime import datetime, date, timedelta
import json
import time

from db import (
    SessionLocal,
    StockQuote,
    StockKline,
    StockFundamental,
    StockNews,
    StockMeta,
    IndustryNode,
    IndustryEdge,
    IndustryMeta,
    IndustryList,
)
from bs_session import get_bs, reset_bs

router = APIRouter()

_industry_list_cache: dict = {}
_industry_stocks_cache: dict = {}
_industry_graph_cache: dict[str, dict] = {}
_industry_map_cache: dict = {}
_INDUSTRY_LIST_TTL = 60
_INDUSTRY_STOCKS_TTL = 30
_INDUSTRY_GRAPH_TTL = 300
_INDUSTRY_MAP_TTL = 300

_COMPANY_CHAIN_SEEDS = [
    {
        "industry_id": "nvidia_chain",
        "name": "英伟达",
        "icon": "🟢",
        "description": "英伟达GPU/AI加速器相关A股产业链：受益于NVDA算力需求的上下游国内企业",
        "representatives": json.dumps(
            ["中际旭创", "工业富联", "沪电股份", "长电科技"], ensure_ascii=False
        ),
        "company_count": 0,
        "last_analyzed": "未分析",
        "sort_order": 100,
        "tab": "company",
    },
    {
        "industry_id": "changxin_chain",
        "name": "长鑫存储",
        "icon": "🔵",
        "description": "长鑫存储DRAM自主化相关A股产业链：设备/材料/封测等国产替代供应链",
        "representatives": json.dumps(
            ["北方华创", "中微公司", "沪硅产业", "拓荆科技"], ensure_ascii=False
        ),
        "company_count": 0,
        "last_analyzed": "未分析",
        "sort_order": 101,
        "tab": "company",
    },
]


def seed_company_chains() -> None:
    db = SessionLocal()
    try:
        for seed in _COMPANY_CHAIN_SEEDS:
            exists = (
                db.query(IndustryList)
                .filter(IndustryList.industry_id == seed["industry_id"])
                .first()
            )
            if not exists:
                db.add(IndustryList(**seed))
        db.commit()
    finally:
        db.close()


def _get_industry_meta(db: Session) -> dict[str, dict]:
    """Load industry meta (title/subtitle/layerLabels) from DB."""
    rows = db.query(IndustryMeta).all()
    return {
        r.industry_id: {
            "title": r.title,
            "subtitle": r.subtitle,
            "layerLabels": json.loads(r.layer_labels or "[]"),
        }
        for r in rows
    }


def _get_a_shares(db: Session) -> list[str]:
    """Return sorted list of A-share codes from stock_meta."""
    import re

    rows = (
        db.query(StockMeta.code).filter(StockMeta.market.in_(["A股", "SH", "SZ"])).all()
    )
    return sorted({r.code for r in rows if re.match(r"^[036]\d{5}$", r.code)})


def _get_non_a_shares(db: Session) -> list[dict]:
    """Return non-A-share symbol list from stock_meta."""
    rows = db.query(StockMeta).filter(StockMeta.market != "A股").all()
    return [{"code": r.code, "name": r.name, "market": r.market} for r in rows]


def get_stock_name(code: str, db: Session | None = None) -> str:
    """Get stock name from DB; fall back to empty string."""
    if db is None:
        db = SessionLocal()
        try:
            row = db.query(StockMeta).filter(StockMeta.code == code).first()
            return row.name if row else ""
        finally:
            db.close()
    row = db.query(StockMeta).filter(StockMeta.code == code).first()
    return row.name if row else ""


import threading as _threading

_sync_running = False
_quotes_lock = _threading.Lock()


def _db_execute_with_retry(db, stmt, max_retries=3):
    """Execute DB statement with retry on lock errors."""
    import time

    for attempt in range(max_retries):
        try:
            db.execute(stmt)
            return True
        except Exception as e:
            if attempt < max_retries - 1 and "database is locked" in str(e).lower():
                time.sleep(0.5 + attempt * 0.5)
                continue
            raise
    return False


def _db_commit_with_retry(db, max_retries=3):
    """Commit DB transaction with retry on lock errors."""
    import time

    for attempt in range(max_retries):
        try:
            db.commit()
            return True
        except Exception as e:
            if attempt < max_retries - 1 and "database is locked" in str(e).lower():
                time.sleep(0.5 + attempt * 0.5)
                db.rollback()
                continue
            raise
    return False


def sync_all_data():
    from routers.system import sched_log
    from routers.sw_industry import sync_sw_industries

    sched_log("info", "每日全量同步开始（行情+申万板块+K线）", source="scheduler")
    _sync_all_quotes()
    try:
        count = sync_sw_industries()
        sched_log(
            "success", f"申万行业板块同步完成，共 {count} 个板块", source="scheduler"
        )
    except Exception as e:
        sched_log("error", f"申万行业板块同步失败: {e}", source="scheduler")
    db = SessionLocal()
    try:
        codes = _get_a_shares(db)
    finally:
        db.close()
    for code in codes:
        _sync_klines(code, "daily")
    sched_log(
        "success", f"每日全量同步完成，共 {len(codes)} 只股票", source="scheduler"
    )


def _to_bs_code(code: str) -> str:
    if code.startswith("6") or code.startswith("5"):
        return f"sh.{code}"
    return f"sz.{code}"


def _safe_float(val, default=0.0) -> float:
    try:
        v = float(str(val).strip())
        return v if v == v else default
    except Exception:
        return default


def _sync_all_quotes():
    from routers.sync import _status, _lock
    from routers.system import sched_log

    if not _quotes_lock.acquire(blocking=False):
        sched_log("warning", "行情同步已在运行中，跳过本次触发", source="scheduler")
        return

    global _sync_running
    _sync_running = True

    all_codes_raw = []
    quotes = {}

    db_init = SessionLocal()
    try:
        all_codes_raw = list(_get_a_shares(db_init))
        quotes = {
            r.code: r
            for r in db_init.query(StockQuote)
            .filter(StockQuote.code.in_(all_codes_raw))
            .all()
        }
    finally:
        db_init.close()

    def _quote_priority(code: str) -> int:
        q = quotes.get(code)
        if q is None or q.updated_at is None or q.price == 0:
            return 0
        return 1

    all_codes = sorted(all_codes_raw, key=_quote_priority)
    total_codes = len(all_codes)
    skipped_count = 0
    count = 0

    try:
        bs = get_bs()
        today = date.today().strftime("%Y-%m-%d")
        yesterday = (date.today() - timedelta(days=5)).strftime("%Y-%m-%d")
        fields = "date,code,open,high,low,close,preclose,volume,amount,turn,pctChg,peTTM,pbMRQ"
        batch_statements = []
        BATCH_SIZE = 50

        for idx, raw_code in enumerate(all_codes):
            from routers.sync import _stop_requested

            if _stop_requested.is_set():
                sched_log("warning", "行情同步已被用户停止")
                break

            # Skip if stock already has today's quote data (北京时间判断)
            q = quotes.get(raw_code)
            if q and q.updated_at:
                today_cst = (datetime.utcnow() + timedelta(hours=8)).date()
                quote_date_cst = (q.updated_at + timedelta(hours=8)).date()
                if quote_date_cst >= today_cst:
                    skipped_count += 1
                    with _lock:
                        _status["current"] = raw_code
                        _status["done"] = idx + 1
                    continue

            with _lock:
                _status["current"] = raw_code
                _status["done"] = idx

            bs_code = _to_bs_code(raw_code)
            try:
                from concurrent.futures import (
                    ThreadPoolExecutor,
                    TimeoutError as FuturesTimeout,
                )

                def _fetch_quote():
                    return bs.query_history_k_data_plus(
                        bs_code,
                        fields,
                        start_date=yesterday,
                        end_date=today,
                        frequency="d",
                        adjustflag="2",
                    )

                with ThreadPoolExecutor(max_workers=1) as ex:
                    fut = ex.submit(_fetch_quote)
                    try:
                        rs = fut.result(timeout=20)
                    except FuturesTimeout:
                        print(f"[sync_quotes] {raw_code} timed out, skipping")
                        reset_bs()
                        bs = get_bs()
                        continue

                if rs.error_code != "0":
                    print(f"[sync_quotes] {raw_code} baostock error: {rs.error_msg}")
                    reset_bs()
                    continue

                row_data = []
                max_rows = 10
                row_count = 0
                while rs.next() and row_count < max_rows:
                    row_data.append(rs.get_row_data())
                    row_count += 1
            except Exception as e:
                print(f"[sync_quotes] {raw_code} fetch error: {e}")
                continue

            if not row_data:
                continue

            r = row_data[-1]
            close = round(_safe_float(r[5]), 4)
            preclose = round(_safe_float(r[6]), 4)
            high = round(_safe_float(r[3]), 4)
            low = round(_safe_float(r[4]), 4)
            change_amt = round(close - preclose, 4)
            amplitude = round((high - low) / preclose * 100, 4) if preclose > 0 else 0.0

            stmt = sqlite_insert(StockQuote).values(
                code=raw_code,
                name=get_stock_name(raw_code),
                price=close,
                change=round(_safe_float(r[10]), 4),
                change_amt=change_amt,
                open=round(_safe_float(r[2]), 4),
                prev_close=preclose,
                high=high,
                low=low,
                volume=_safe_float(r[7]),
                turnover=_safe_float(r[8]),
                market_cap=0.0,
                pe=round(_safe_float(r[11]), 4),
                pb=round(_safe_float(r[12]), 4),
                turnover_rate=round(_safe_float(r[9]), 4),
                amplitude=amplitude,
                updated_at=datetime.utcnow(),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["code"],
                set_={
                    "price": stmt.excluded.price,
                    "change": stmt.excluded.change,
                    "change_amt": stmt.excluded.change_amt,
                    "open": stmt.excluded.open,
                    "prev_close": stmt.excluded.prev_close,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "volume": stmt.excluded.volume,
                    "turnover": stmt.excluded.turnover,
                    "pe": stmt.excluded.pe,
                    "pb": stmt.excluded.pb,
                    "turnover_rate": stmt.excluded.turnover_rate,
                    "amplitude": stmt.excluded.amplitude,
                    "updated_at": stmt.excluded.updated_at,
                },
            )

            batch_statements.append(stmt)
            count += 1

            if len(batch_statements) >= BATCH_SIZE:
                db_batch = SessionLocal()
                try:
                    for s in batch_statements:
                        _db_execute_with_retry(db_batch, s)
                    _db_commit_with_retry(db_batch)
                    print(
                        f"[sync_quotes] progress: {idx + 1}/{total_codes} ({count} saved)"
                    )
                except Exception as e:
                    print(f"[sync_quotes] batch commit error: {e}")
                    try:
                        db_batch.rollback()
                    except Exception:
                        pass
                finally:
                    db_batch.close()
                batch_statements = []

        if batch_statements:
            db_batch = SessionLocal()
            try:
                for s in batch_statements:
                    _db_execute_with_retry(db_batch, s)
                _db_commit_with_retry(db_batch)
            except Exception as e:
                print(f"[sync_quotes] final batch error: {e}")
                try:
                    db_batch.rollback()
                except Exception:
                    pass
            finally:
                db_batch.close()

        with _lock:
            _status["done"] = total_codes

        from routers.system import sched_log

        sched_log(
            "success",
            f"实时行情同步完成，更新 {count}/{total_codes} 只股票（跳过 {skipped_count} 只已同步）",
        )
    except Exception as e:
        from routers.system import sched_log

        sched_log("error", f"实时行情同步失败: {e}")
        import traceback

        traceback.print_exc()
        reset_bs()
    finally:
        _sync_running = False
        _quotes_lock.release()


def _sync_klines(code: str, period: str = "daily"):
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

    def _fetch_rows():
        bs_period = "d" if period == "daily" else ("w" if period == "weekly" else "m")
        bs = get_bs()
        bs_code = _to_bs_code(code)
        fields = "date,code,open,high,low,close,volume,amount,turn,pctChg"
        start = (date.today() - timedelta(days=400)).strftime("%Y-%m-%d")
        end = date.today().strftime("%Y-%m-%d")

        rs = bs.query_history_k_data_plus(
            bs_code,
            fields,
            start_date=start,
            end_date=end,
            frequency=bs_period,
            adjustflag="2",
        )
        if rs.error_code != "0":
            reset_bs()
            return None

        rows = []
        while rs.next() and len(rows) < 1000:
            r = rs.get_row_data()
            if r and len(r) >= 10:
                rows.append(r)
        return rows

    with ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(_fetch_rows)
        try:
            rows = fut.result(timeout=30)
        except FuturesTimeout:
            print(f"[sync_klines] {code} timed out, skipping")
            reset_bs()
            from routers.system import record_failed_stock

            record_failed_stock(code, get_stock_name(code), "超时", "kline")
            return
        except Exception as e:
            print(f"[sync_klines] {code} fetch error: {e}")
            reset_bs()
            from routers.system import record_failed_stock

            record_failed_stock(code, get_stock_name(code), str(e), "kline")
            return

    if not rows:
        return

    db = SessionLocal()
    retry_count = 3
    for db_attempt in range(retry_count):
        try:
            for r in rows:
                stmt = sqlite_insert(StockKline).values(
                    code=code,
                    period=period,
                    trade_date=r[0],
                    open=round(_safe_float(r[2]), 4),
                    high=round(_safe_float(r[3]), 4),
                    low=round(_safe_float(r[4]), 4),
                    close=round(_safe_float(r[5]), 4),
                    volume=int(_safe_float(r[6])),
                    turnover=_safe_float(r[7]),
                    change_pct=round(_safe_float(r[9]), 4),
                    updated_at=datetime.utcnow(),
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["code", "period", "trade_date"],
                    set_={
                        "open": stmt.excluded.open,
                        "high": stmt.excluded.high,
                        "low": stmt.excluded.low,
                        "close": stmt.excluded.close,
                        "volume": stmt.excluded.volume,
                        "turnover": stmt.excluded.turnover,
                        "change_pct": stmt.excluded.change_pct,
                        "updated_at": stmt.excluded.updated_at,
                    },
                )
                db.execute(stmt)
            db.commit()
            print(f"[sync_klines] {code} done, {len(rows)} bars saved")
            break
        except Exception as e:
            db.rollback()
            if db_attempt < retry_count - 1 and "database is locked" in str(e).lower():
                import time

                time.sleep(1 + db_attempt * 0.5)
                continue
            print(f"[sync_klines] {code} db error: {e}")
        finally:
            if db_attempt == retry_count - 1:
                db.close()


def _sync_fundamental(code: str):
    db = SessionLocal()
    retry_count = 3
    for db_attempt in range(retry_count):
        try:
            bs = get_bs()
            bs_code = _to_bs_code(code)
            rs_profit = bs.query_profit_data(code=bs_code, year=2024, quarter=4)
            profit_row = None
            while rs_profit.error_code == "0" and rs_profit.next():
                profit_row = rs_profit.get_row_data()

            rs_growth = bs.query_growth_data(code=bs_code, year=2024, quarter=4)
            growth_row = None
            while rs_growth.error_code == "0" and rs_growth.next():
                growth_row = rs_growth.get_row_data()

            rs_balance = bs.query_balance_data(code=bs_code, year=2024, quarter=4)
            balance_row = None
            while rs_balance.error_code == "0" and rs_balance.next():
                balance_row = rs_balance.get_row_data()

            if not profit_row:
                return

            raw = json.dumps(
                {
                    "profit": profit_row,
                    "growth": growth_row,
                    "balance": balance_row,
                },
                ensure_ascii=False,
            )

            eps = _safe_float(profit_row[6]) if len(profit_row) > 6 else None
            roe = _safe_float(profit_row[2]) if len(profit_row) > 2 else None
            gross_margin = _safe_float(profit_row[4]) if len(profit_row) > 4 else None
            net_profit = _safe_float(profit_row[5]) if len(profit_row) > 5 else None
            revenue_yoy = (
                _safe_float(growth_row[6])
                if growth_row and len(growth_row) > 6
                else None
            )
            net_profit_yoy = (
                _safe_float(growth_row[4])
                if growth_row and len(growth_row) > 4
                else None
            )
            debt_ratio = (
                _safe_float(balance_row[6])
                if balance_row and len(balance_row) > 6
                else None
            )
            report_date = profit_row[0] if profit_row else ""

            stmt = sqlite_insert(StockFundamental).values(
                code=code,
                report_date=report_date,
                eps=eps,
                roe=roe,
                revenue=None,
                revenue_yoy=revenue_yoy,
                net_profit=net_profit,
                net_profit_yoy=net_profit_yoy,
                gross_margin=gross_margin,
                debt_ratio=debt_ratio,
                raw_json=raw,
                updated_at=datetime.utcnow(),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["code"],
                set_={
                    "report_date": stmt.excluded.report_date,
                    "eps": stmt.excluded.eps,
                    "roe": stmt.excluded.roe,
                    "revenue": stmt.excluded.revenue,
                    "revenue_yoy": stmt.excluded.revenue_yoy,
                    "net_profit": stmt.excluded.net_profit,
                    "net_profit_yoy": stmt.excluded.net_profit_yoy,
                    "gross_margin": stmt.excluded.gross_margin,
                    "debt_ratio": stmt.excluded.debt_ratio,
                    "raw_json": stmt.excluded.raw_json,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
            db.commit()
            print(f"[sync_fundamental] {code} done")
            break
        except Exception as e:
            db.rollback()
            if db_attempt < retry_count - 1 and "database is locked" in str(e).lower():
                import time

                time.sleep(1 + db_attempt * 0.5)
                continue
            print(f"[sync_fundamental] {code} error: {e}")
            reset_bs()
        finally:
            if db_attempt == retry_count - 1:
                db.close()


def _sync_news(code: str):
    print(f"[sync_news] {code}: baostock has no news API, skipping")


def _fetch_industry_quotes(codes: str) -> dict:
    db = SessionLocal()
    try:
        code_list = (
            [c.strip() for c in codes.split(",") if c.strip()]
            if codes
            else _get_a_shares(db)
        )
        rows = db.query(StockQuote).filter(StockQuote.code.in_(code_list)).all()
        result = {}
        for row in rows:
            price = row.price
            change = row.change
            change_amt = row.change_amt
            open_ = row.open
            prev_close = row.prev_close
            high = row.high
            low = row.low
            volume = row.volume
            turnover = row.turnover
            turnover_rate = row.turnover_rate
            amplitude = row.amplitude

            if amplitude == 0.0 and high > 0 and low > 0 and prev_close > 0:
                amplitude = round((high - low) / prev_close * 100, 2)

            quote_never_synced = price == 0.0 and row.updated_at is None
            if quote_never_synced:
                kline_rows = (
                    db.query(StockKline)
                    .filter(StockKline.code == row.code, StockKline.period == "daily")
                    .order_by(StockKline.trade_date.desc())
                    .limit(2)
                    .all()
                )
                if kline_rows:
                    latest = kline_rows[0]
                    price = latest.close
                    change = latest.change_pct
                    open_ = latest.open
                    high = latest.high
                    low = latest.low
                    volume = float(latest.volume)
                    turnover = latest.turnover
                    turnover_rate = latest.turn_rate if latest.turn_rate else 0.0
                    prev_k = kline_rows[1] if len(kline_rows) > 1 else None
                    prev_close = prev_k.close if prev_k else 0.0
                    change_amt = round(price - prev_close, 4) if prev_close else 0.0
                    amplitude = (
                        round((high - low) / prev_close * 100, 2)
                        if prev_close > 0
                        else 0.0
                    )

            result[row.code] = {
                "code": row.code,
                "name": row.name,
                "price": price,
                "change": change,
                "changeAmt": change_amt,
                "open": open_,
                "prevClose": prev_close,
                "high": high,
                "low": low,
                "volume": volume,
                "turnover": turnover,
                "marketCap": row.market_cap,
                "pe": row.pe,
                "pb": row.pb,
                "turnoverRate": turnover_rate,
                "amplitude": amplitude,
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            }
        return {"quotes": result, "total": len(result)}
    finally:
        db.close()


@router.get("/stocks")
async def get_industry_quotes(
    codes: str = Query("", description="逗号分隔的股票代码，留空返回全部产业链"),
):
    if not codes:
        cached = _industry_stocks_cache
        if cached.get("ts") and time.time() - cached["ts"] < _INDUSTRY_STOCKS_TTL:
            return JSONResponse(content=cached["data"])
    out = await run_in_threadpool(_fetch_industry_quotes, codes)
    if not codes:
        _industry_stocks_cache["ts"] = time.time()
        _industry_stocks_cache["data"] = out
    return JSONResponse(content=out)


@router.post("/sync")
async def trigger_sync(background_tasks: BackgroundTasks):
    if _sync_running:
        return {"status": "already_running"}

    def _get_codes():
        db = SessionLocal()
        try:
            return _get_a_shares(db)
        finally:
            db.close()

    codes = await run_in_threadpool(_get_codes)
    background_tasks.add_task(_sync_all_quotes)
    return {"status": "started", "codes": len(codes)}


@router.post("/sync/kline/{code}")
async def sync_kline(
    code: str,
    period: str = Query("daily"),
    background_tasks: BackgroundTasks = None,
):
    def _check():
        db = SessionLocal()
        try:
            return code in _get_a_shares(db)
        finally:
            db.close()

    if not await run_in_threadpool(_check):
        raise HTTPException(status_code=400, detail="Not an industry stock")
    background_tasks.add_task(_sync_klines, code, period)
    return {"status": "started", "code": code, "period": period}


@router.post("/sync/fundamental/{code}")
async def sync_fundamental(
    code: str,
    background_tasks: BackgroundTasks,
):
    def _check():
        db = SessionLocal()
        try:
            return code in _get_a_shares(db)
        finally:
            db.close()

    if not await run_in_threadpool(_check):
        raise HTTPException(status_code=400, detail="Not an industry stock")
    background_tasks.add_task(_sync_fundamental, code)
    return {"status": "started", "code": code}


@router.post("/sync/news/{code}")
async def sync_news_for(
    code: str,
    background_tasks: BackgroundTasks,
):
    background_tasks.add_task(_sync_news, code)
    return {"status": "started", "code": code}


@router.get("/news")
async def get_industry_news(
    codes: str = Query("", description="逗号分隔的股票代码"),
    limit: int = Query(50, ge=5, le=200),
):
    def _fetch():
        db = SessionLocal()
        try:
            code_list = (
                [c.strip() for c in codes.split(",") if c.strip()]
                if codes
                else _get_a_shares(db)
            )
            rows = (
                db.query(StockNews)
                .filter(StockNews.code.in_(code_list))
                .order_by(StockNews.pub_time.desc())
                .limit(limit)
                .all()
            )
            return {
                "news": [
                    {
                        "code": r.code,
                        "title": r.title,
                        "url": r.url,
                        "source": r.source,
                        "pubTime": r.pub_time,
                    }
                    for r in rows
                ]
            }
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


@router.get("/non-a-shares")
async def get_non_a_share_info():
    def _fetch():
        db = SessionLocal()
        try:
            return {"symbols": _get_non_a_shares(db)}
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


@router.get("/stock-industry-map")
async def get_stock_industry_map():
    cached = _industry_map_cache
    if cached.get("ts") and time.time() - cached["ts"] < _INDUSTRY_MAP_TTL:
        return JSONResponse(content=cached["data"])

    def _fetch():
        db = SessionLocal()
        try:
            nodes = db.query(IndustryNode).filter(IndustryNode.stocks != "[]").all()
            stock_to_industries: dict[str, list[str]] = {}
            for node in nodes:
                node_codes = json.loads(node.stocks or "[]")
                for code in node_codes:
                    stock_to_industries.setdefault(code, [])
                    if node.industry_id not in stock_to_industries[code]:
                        stock_to_industries[code].append(node.industry_id)
            return {"mapping": stock_to_industries}
        finally:
            db.close()

    result = await run_in_threadpool(_fetch)
    _industry_map_cache["ts"] = time.time()
    _industry_map_cache["data"] = result
    return JSONResponse(content=result)


@router.get("/perf")
async def get_stock_performance():
    def _fetch():
        db = SessionLocal()
        try:
            rows = db.execute(
                text("""
                WITH
                latest AS (
                    SELECT code, close AS cur
                    FROM stock_kline
                    WHERE period = 'daily'
                      AND (code, trade_date) IN (
                          SELECT code, MAX(trade_date)
                          FROM stock_kline
                          WHERE period = 'daily'
                          GROUP BY code
                      )
                ),
                ref_jan AS (
                    SELECT code, close AS base_jan
                    FROM stock_kline
                    WHERE period = 'daily'
                      AND (code, trade_date) IN (
                          SELECT code, MIN(trade_date)
                          FROM stock_kline
                          WHERE period = 'daily' AND trade_date >= '2026-01-01'
                          GROUP BY code
                      )
                ),
                ref_may AS (
                    SELECT code, close AS base_may
                    FROM stock_kline
                    WHERE period = 'daily'
                      AND (code, trade_date) IN (
                          SELECT code, MIN(trade_date)
                          FROM stock_kline
                          WHERE period = 'daily' AND trade_date >= '2026-05-01'
                          GROUP BY code
                      )
                )
                SELECT l.code,
                       ROUND((l.cur - j.base_jan) / j.base_jan * 100, 2) AS ytd,
                       ROUND((l.cur - m.base_may) / m.base_may * 100, 2) AS m5
                FROM latest l
                LEFT JOIN ref_jan j ON j.code = l.code
                LEFT JOIN ref_may m ON m.code = l.code
            """)
            ).fetchall()
            result: dict[str, dict] = {}
            for code, ytd, m5 in rows:
                result[code] = {"ytd": ytd, "m5": m5}
            return {"perf": result}
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


@router.get("/node-stocks")
async def get_node_stocks():
    def _fetch():
        db = SessionLocal()
        try:
            rows = db.query(IndustryNode).filter(IndustryNode.stocks != "[]").all()
            result: dict[str, dict[str, list[str]]] = {}
            for row in rows:
                result.setdefault(row.industry_id, {})[row.node_id] = json.loads(
                    row.stocks or "[]"
                )
            return {"nodeStocks": result}
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


@router.get("/list")
async def get_industry_list():
    cached = _industry_list_cache
    if cached.get("ts") and time.time() - cached["ts"] < _INDUSTRY_LIST_TTL:
        return JSONResponse(content=cached["data"])

    def _fetch():
        db = SessionLocal()
        try:
            rows = db.query(IndustryList).order_by(IndustryList.sort_order).all()
            return {
                "industries": [
                    {
                        "id": r.industry_id,
                        "name": r.name,
                        "description": r.description,
                        "icon": r.icon,
                        "companyCount": r.company_count or 0,
                        "lastAnalyzed": r.last_analyzed,
                        "representatives": json.loads(r.representatives or "[]"),
                        "tab": r.tab or "ai_infra",
                    }
                    for r in rows
                ]
            }
        finally:
            db.close()

    result = await run_in_threadpool(_fetch)
    _industry_list_cache["ts"] = time.time()
    _industry_list_cache["data"] = result
    return JSONResponse(content=result)


@router.get("/graph/{industry_id}")
async def get_industry_graph(industry_id: str):
    cached = _industry_graph_cache.get(industry_id)
    if cached and time.time() - cached["ts"] < _INDUSTRY_GRAPH_TTL:
        return JSONResponse(content=cached["data"])

    def _fetch():
        db = SessionLocal()
        try:
            nodes = (
                db.query(IndustryNode)
                .filter(IndustryNode.industry_id == industry_id)
                .all()
            )
            edges = (
                db.query(IndustryEdge)
                .filter(IndustryEdge.industry_id == industry_id)
                .all()
            )
            meta_row = (
                db.query(IndustryMeta)
                .filter(IndustryMeta.industry_id == industry_id)
                .first()
            )
            return nodes, edges, meta_row
        finally:
            db.close()

    nodes, edges, meta_row = await run_in_threadpool(_fetch)
    if not nodes and not meta_row:
        raise HTTPException(status_code=404, detail="Industry not found")
    result = {
        "title": meta_row.title if meta_row else industry_id,
        "subtitle": meta_row.subtitle if meta_row else "",
        "layerLabels": json.loads(meta_row.layer_labels or "[]") if meta_row else [],
        "nodes": [
            {
                "id": n.node_id,
                "x": n.x,
                "y": n.y,
                "label": n.label,
                "icon": n.icon,
                "desc": n.desc,
                "layer": n.layer,
                "ticker": n.ticker,
                "market": n.market,
                "group": n.group_name,
                "stocks": json.loads(n.stocks or "[]"),
            }
            for n in nodes
        ],
        "edges": [
            {
                "id": e.edge_id,
                "source": e.source,
                "target": e.target,
                "layer": e.layer,
                "label": e.label,
            }
            for e in edges
        ],
    }
    _industry_graph_cache[industry_id] = {"ts": time.time(), "data": result}
    return JSONResponse(content=result)
