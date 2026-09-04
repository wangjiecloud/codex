from typing import Optional
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
from compute_indicators import compute_for_code

router = APIRouter()


def is_trading_day(d: Optional[date] = None) -> bool:
    """判断指定日期（默认今天）是否为 A 股交易日。
    仅判断周末（周六日不交易）。
    """
    if d is None:
        d = date.today()
    return d.weekday() < 5


def _latest_kline_date(code: str) -> Optional[str]:
    """查询数据库中该股票日 K 线的最新日期，不存在则返回 None。"""
    db = SessionLocal()
    try:
        row = db.execute(
            text(
                "SELECT MAX(trade_date) FROM stock_kline "
                "WHERE code=:code AND period='daily'"
            ),
            {"code": code},
        ).fetchone()
        return row[0] if row and row[0] else None
    finally:
        db.close()


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


def get_stock_name(code: str, db: Optional[Session] = None) -> str:
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
    """17:30 定时任务入口。复用前端一键刷新的同一套逻辑（_run_full_sync），
    确保行情、申万板块、K线、基本面、快讯全部同步，且有超时保护和 stop 支持。
    只允许在 15:00-19:00 时段内触发（防止误操作在非收盘时段执行）。
    """
    from routers.system import sched_log
    from datetime import time as dtime

    if not is_trading_day():
        sched_log("info", "非交易日，跳过每日全量同步", source="scheduler")
        return

    # 时段保护：只允许 15:00-19:00 触发，避免非收盘时段（如早上）误操作
    now_t = datetime.now().time()
    if not (dtime(15, 0) <= now_t <= dtime(19, 0)):
        sched_log(
            "warning",
            f"[定时] 当前时间 {now_t.strftime('%H:%M')} 不在允许触发时段（15:00-19:00），已拒绝执行。"
            "请在收盘后手动触发，或等待 17:30 自动调度。",
            source="scheduler",
        )
        return

    from routers.sync import _run_full_sync, _status, _lock
    import threading

    with _lock:
        if _status["running"]:
            sched_log(
                "warning",
                "17:30 定时同步：检测到同步任务已在运行，跳过本次触发",
                source="scheduler",
            )
            return

    sched_log("info", "[定时] 17:30 定时同步启动，复用全量同步流程", source="scheduler")
    threading.Thread(target=_run_full_sync, daemon=True).start()


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

    if not is_trading_day():
        sched_log("info", "非交易日，跳过行情同步", source="scheduler")
        return

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
    # 本次同步中已触发过 kline 修复的股票集合，避免重复触发
    _kline_repair_triggered: set = set()

    try:
        # 直接走新浪批量实时行情
        print(f"[sync_quotes] 使用新浪批量实时行情同步 {total_codes} 只股票")

        import requests as _req

        def _sina_realtime_quotes(codes_list, batch_size=80):
            def _to_sina(c):
                return f"sh{c}" if c[0] in ("5", "6") else f"sz{c}"

            res = {}
            headers = {"Referer": "https://finance.sina.com.cn"}
            for j in range(0, len(codes_list), batch_size):
                batch = codes_list[j : j + batch_size]
                sina_codes = ",".join(_to_sina(c) for c in batch)
                url = f"https://hq.sinajs.cn/list={sina_codes}"
                try:
                    r = _req.get(url, headers=headers, timeout=10)
                    for line in r.text.strip().split("\n"):
                        if "=" not in line:
                            continue
                        var_part, data_part = line.split("=", 1)
                        sina_code = var_part.split("_")[-1].strip('"')
                        code = sina_code[2:]
                        fields = data_part.strip('" \n').split(",")
                        if len(fields) < 32:
                            continue
                        name = fields[0]
                        open_ = _safe_float(fields[1])
                        prev_close = _safe_float(fields[2])
                        price = _safe_float(fields[3])
                        high = _safe_float(fields[4])
                        low = _safe_float(fields[5])
                        volume = _safe_float(fields[8])
                        turnover = _safe_float(fields[9])
                        change_pct = (
                            round((price - prev_close) / prev_close * 100, 4)
                            if prev_close > 0
                            else 0
                        )
                        change_amt = (
                            round(price - prev_close, 4) if prev_close > 0 else 0
                        )
                        amplitude = (
                            round((high - low) / prev_close * 100, 4)
                            if prev_close > 0
                            else 0
                        )
                        res[code] = {
                            "name": name,
                            "price": price,
                            "open": open_,
                            "prev_close": prev_close,
                            "high": high,
                            "low": low,
                            "volume": volume,
                            "turnover": turnover,
                            "change": change_pct,
                            "change_amt": change_amt,
                            "amplitude": amplitude,
                        }
                except Exception as e:
                    print(f"[sync_quotes] sina batch {j} error: {e}")
            return res

        BATCH = 80
        total_saved = 0
        for i in range(0, len(all_codes_raw), BATCH):
            from routers.sync import _stop_requested

            if _stop_requested.is_set():
                sched_log("warning", "行情同步已被用户停止", source="scheduler")
                break

            batch_codes = all_codes_raw[i : i + BATCH]
            live = _sina_realtime_quotes(batch_codes)
            if not live:
                continue
            db_batch = SessionLocal()
            try:
                for code, d in live.items():
                    stmt = sqlite_insert(StockQuote).values(
                        code=code,
                        name=d.get("name") or get_stock_name(code),
                        price=d.get("price", 0.0),
                        change=d.get("change", 0.0),
                        change_amt=d.get("change_amt", 0.0),
                        open=d.get("open", 0.0),
                        prev_close=d.get("prev_close", 0.0),
                        high=d.get("high", 0.0),
                        low=d.get("low", 0.0),
                        volume=d.get("volume", 0.0),
                        turnover=d.get("turnover", 0.0),
                        market_cap=0.0,
                        pe=0.0,
                        pb=0.0,
                        turnover_rate=0.0,
                        amplitude=d.get("amplitude", 0.0),
                        updated_at=datetime.utcnow(),
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["code"],
                        set_={
                            "name": stmt.excluded.name,
                            "price": stmt.excluded.price,
                            "change": stmt.excluded.change,
                            "change_amt": stmt.excluded.change_amt,
                            "open": stmt.excluded.open,
                            "prev_close": stmt.excluded.prev_close,
                            "high": stmt.excluded.high,
                            "low": stmt.excluded.low,
                            "volume": stmt.excluded.volume,
                            "turnover": stmt.excluded.turnover,
                            "amplitude": stmt.excluded.amplitude,
                            "updated_at": stmt.excluded.updated_at,
                        },
                    )
                    db_batch.execute(stmt)
                db_batch.commit()
                total_saved += len(live)
            except Exception as e:
                print(f"[sync_quotes] sina batch commit error: {e}")
                db_batch.rollback()
            finally:
                db_batch.close()
            with _lock:
                _status["done"] = min(i + BATCH, total_codes)
            if (i // BATCH + 1) % 10 == 0:
                print(
                    f"[sync_quotes] sina progress: {i + BATCH}/{total_codes} ({total_saved} saved)"
                )

        sched_log(
            "success",
            f"新浪行情同步完成，更新 {total_saved}/{total_codes} 只股票",
            source="scheduler",
        )
        return
    except Exception as e:
        from routers.system import sched_log

        sched_log("error", f"实时行情同步失败: {e}")
        import traceback

        traceback.print_exc()
    finally:
        _sync_running = False
        _quotes_lock.release()


def _sync_klines(code: str, period: str = "daily", force: bool = False):
    # 今日已有最新 K 线则跳过（避免重复全量拉取）
    # force=True 时跳过此检查，用于修复陈旧/错误的 kline 数据
    if period == "daily" and not force:
        latest = _latest_kline_date(code)
        today_str = date.today().strftime("%Y-%m-%d")
        if latest and latest >= today_str:
            return

    try:
        from routers.kline import _fetch_and_cache_klines_sina

        sina_bars = _fetch_and_cache_klines_sina(code, period, 400)
        if sina_bars:
            try:
                count = compute_for_code(code, period)
                print(
                    f"[sync_klines] {code} done ({len(sina_bars)} bars), indicators refreshed"
                )
            except Exception as e:
                print(f"[sync_klines] {code} indicator refresh error: {e}")
        else:
            print(f"[sync_klines] {code} sina returned 0 bars")
            from routers.system import record_failed_stock

            record_failed_stock(code, get_stock_name(code), "新浪返回0条", "kline")
    except Exception as e:
        print(f"[sync_klines] {code} fetch error: {e}")
        from routers.system import record_failed_stock

        record_failed_stock(code, get_stock_name(code), str(e), "kline")


def _sync_fundamental(code: str):
    """用 akshare 拉取财务指标，写入 stock_fundamental 表。"""
    db = SessionLocal()
    try:
        import akshare as ak

        symbol = code.lstrip("0") if not code.startswith("6") else code
        df = ak.stock_financial_analysis_indicator(symbol=symbol, start_year="2023")
        if df is None or df.empty:
            print(f"[sync_fundamental] {code} akshare 返回空")
            return

        latest = df.iloc[-1].to_dict()
        report_date = str(latest.get("日期", ""))

        eps = _safe_float(latest.get("摊薄每股收益(元)"))
        roe = _safe_float(latest.get("净资产收益率(%)"))
        gross_margin = _safe_float(latest.get("销售毛利率(%)"))
        revenue_yoy = _safe_float(latest.get("主营业务收入增长率(%)"))
        net_profit_yoy = _safe_float(latest.get("净利润增长率(%)"))
        debt_ratio = _safe_float(latest.get("资产负债率(%)"))

        raw = json.dumps(
            {
                "report_date": report_date,
                "eps": eps,
                "roe": roe,
                "gross_margin": gross_margin,
            },
            ensure_ascii=False,
        )

        stmt = sqlite_insert(StockFundamental).values(
            code=code,
            report_date=report_date,
            eps=eps,
            roe=roe,
            revenue=None,
            revenue_yoy=revenue_yoy,
            net_profit=None,
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
                "revenue_yoy": stmt.excluded.revenue_yoy,
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
    except Exception as e:
        db.rollback()
        print(f"[sync_fundamental] {code} error: {e}")
    finally:
        db.close()


def _sync_news(code: str):
    print(f"[sync_news] {code}: no news API available, skipping")


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


@router.post("/sync/quotes/batch")
async def sync_quotes_batch(payload: dict):
    """批量刷新指定股票的行情，同步写入 stock_quote 表后返回最新数据。
    body: {"codes": ["000001", "600183", ...]}
    """
    from routers.quote import _fetch_and_cache_quote, _is_a_share

    codes = payload.get("codes", [])
    if not codes or not isinstance(codes, list):
        raise HTTPException(status_code=400, detail="codes 参数不能为空")

    a_codes = [c for c in codes if _is_a_share(str(c).strip())]
    if not a_codes:
        raise HTTPException(status_code=400, detail="codes 中没有有效的A股代码")

    results = {}
    errors = {}

    def _do_batch():
        for code in a_codes:
            try:
                data = _fetch_and_cache_quote(code)
                results[code] = data
            except Exception as e:
                errors[code] = str(e)
        # 清除内存缓存，让下次 /stocks 重新读库
        _industry_stocks_cache.clear()

    await run_in_threadpool(_do_batch)
    return {
        "refreshed": len(results),
        "failed": len(errors),
        "quotes": results,
        "errors": errors,
    }


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


# ── 产业内股票批量同步 ──────────────────────────────────────────────
_industry_sync_status: dict = {
    "running": False,
    "industry_id": None,
    "done": 0,
    "total": 0,
    "message": "",
    "errors": [],
}
_industry_sync_lock = _threading.Lock()


def _sync_industry_stocks(industry_id: str) -> None:
    """批量同步指定产业内所有 A 股的 kline + fundamental + quote。"""
    from routers.system import sched_log

    global _industry_sync_status
    with _industry_sync_lock:
        if _industry_sync_status["running"]:
            return
        _industry_sync_status = {
            "running": True,
            "industry_id": industry_id,
            "done": 0,
            "total": 0,
            "message": f"[产业同步] 正在读取 {industry_id} 产业节点...",
            "errors": [],
        }

    db = SessionLocal()
    try:
        nodes = (
            db.query(IndustryNode).filter(IndustryNode.industry_id == industry_id).all()
        )
        codes: list[str] = []
        for node in nodes:
            stocks = json.loads(node.stocks or "[]")
            for code in stocks:
                if code and code not in codes:
                    codes.append(code)
    finally:
        db.close()

    if not codes:
        _industry_sync_status["running"] = False
        _industry_sync_status["message"] = (
            f"[产业同步] {industry_id} 无 A 股节点，已跳过"
        )
        sched_log("warning", f"[产业同步] {industry_id} 无 A 股节点", source="manual")
        return

    total = len(codes)
    _industry_sync_status["total"] = total
    sched_log(
        "info", f"[产业同步] 开始同步 {industry_id}，共 {total} 只股票", source="manual"
    )

    errors: list[str] = []
    for idx, code in enumerate(codes):
        _industry_sync_status["done"] = idx
        _industry_sync_status["message"] = f"[产业同步] ({idx + 1}/{total}) 同步 {code}"
        try:
            _sync_klines(code, "daily")
        except Exception as e:
            errors.append(f"{code} kline: {e}")
        try:
            _sync_fundamental(code)
        except Exception as e:
            errors.append(f"{code} fundamental: {e}")

    _industry_sync_status["done"] = total
    _industry_sync_status["running"] = False
    _industry_sync_status["errors"] = errors
    msg = f"[产业同步] {industry_id} 完成，共 {total} 只，错误 {len(errors)} 条"
    _industry_sync_status["message"] = msg
    sched_log("info", msg, source="manual")


@router.post("/sync/industry-stocks/{industry_id}")
async def sync_industry_stocks(industry_id: str, background_tasks: BackgroundTasks):
    """触发指定产业内所有 A 股的 kline + fundamental 批量同步。"""
    if _industry_sync_status.get("running"):
        return {"status": "already_running", **_industry_sync_status}
    background_tasks.add_task(_sync_industry_stocks, industry_id)
    return {"status": "started", "industry_id": industry_id}


@router.get("/sync/industry-stocks/status")
async def get_industry_sync_status():
    """查询产业内股票批量同步进度。"""
    return _industry_sync_status


# ── 结束：产业内股票批量同步 ─────────────────────────────────────────


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
