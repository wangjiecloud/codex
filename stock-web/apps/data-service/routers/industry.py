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


def is_trading_day(d: date | None = None) -> bool:
    """判断指定日期（默认今天）是否为 A 股交易日（周一至周五，排除节假日）。
    使用 baostock 查询准确结果；若 baostock 不可用则降级为仅判断周末。
    """
    if d is None:
        d = date.today()
    # 周末直接排除
    if d.weekday() >= 5:
        return False
    try:
        bs = get_bs()
        rs = bs.query_trade_dates(
            start_date=d.strftime("%Y-%m-%d"),
            end_date=d.strftime("%Y-%m-%d"),
        )
        if rs.error_code == "0" and rs.next():
            row = rs.get_row_data()
            # row[1] == "1" 表示交易日
            return row[1] == "1"
    except Exception:
        pass
    # 降级：仅排除周末
    return True


def _latest_kline_date(code: str) -> str | None:
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
    """17:30 定时任务入口。复用前端一键刷新的同一套逻辑（_run_full_sync），
    确保行情、申万板块、K线、基本面、快讯全部同步，且有超时保护和 stop 支持。
    """
    from routers.system import sched_log

    if not is_trading_day():
        sched_log("info", "非交易日，跳过每日全量同步", source="scheduler")
        return

    from routers.sync import _run_full_sync, _status, _lock
    import threading

    with _lock:
        if _status["running"]:
            sched_log("warning", "17:30 定时同步：检测到同步任务已在运行，跳过本次触发", source="scheduler")
            return

    sched_log("info", "17:30 定时同步启动，复用全量同步流程", source="scheduler")
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

    try:
        bs = get_bs()
        today = date.today().strftime("%Y-%m-%d")
        yesterday = (date.today() - timedelta(days=5)).strftime("%Y-%m-%d")
        fields = "date,code,open,high,low,close,preclose,volume,amount,turn,pctChg,peTTM,pbMRQ"
        batch_statements = []
        BATCH_SIZE = 50

        # 预加载 kline 最新交易日和收盘价，用于合理性校验
        _kline_latest: dict[str, tuple[str, float]] = {}  # code -> (trade_date, close)
        db_kline = SessionLocal()
        try:
            from sqlalchemy import text as _text
            rows_kline = db_kline.execute(_text(
                "SELECT k.code, k.trade_date, k.close FROM stock_kline k "
                "INNER JOIN (SELECT code, MAX(trade_date) AS max_date FROM stock_kline "
                "WHERE period='daily' GROUP BY code) m ON k.code=m.code AND k.trade_date=m.max_date "
                "WHERE k.period='daily'"
            )).fetchall()
            for row_k in rows_kline:
                _kline_latest[row_k[0]] = (row_k[1], float(row_k[2]))
        finally:
            db_kline.close()

        # 最新交易日（kline 中最大日期）
        _latest_trade_date = max((v[0] for v in _kline_latest.values()), default="")

        for idx, raw_code in enumerate(all_codes):
            from routers.sync import _stop_requested

            if _stop_requested.is_set():
                sched_log("warning", "行情同步已被用户停止")
                break

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
                    bs = get_bs()
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

            # 过滤掉列数不足的行（baostock 偶发返回空行或残缺行，防止 list index out of range）
            expected_cols = len(fields.split(","))
            row_data = [r for r in row_data if len(r) >= expected_cols]
            if not row_data:
                print(f"[sync_quotes] {raw_code} 所有行列数不足 {expected_cols}，跳过")
                continue

            r = row_data[-1]

            # 校验 baostock 返回的 code 字段（index=1）是否与请求的 code 一致，防止串码
            returned_bs_code = str(r[1]).strip().lower()  # e.g. "sh.688012"
            if returned_bs_code != bs_code.lower():
                print(f"[sync_quotes] {raw_code} 串码：请求 {bs_code}，返回 {returned_bs_code}，重置session跳过")
                reset_bs()
                bs = get_bs()
                continue

            row_trade_date = r[0]  # baostock 返回的行情日期

            # 跳过逻辑：判断行情日期而非 updated_at，确保拿到的是最新交易日数据
            if _latest_trade_date and row_trade_date < _latest_trade_date:
                # baostock 返回的不是最新交易日，说明数据还未更新，跳过
                skipped_count += 1
                with _lock:
                    _status["done"] = idx + 1
                continue

            q = quotes.get(raw_code)
            if q and q.updated_at and row_trade_date:
                # 若当前 stock_quote 已经记录了该行情日期的数据，跳过
                existing_kline = _kline_latest.get(raw_code)
                if existing_kline and existing_kline[0] == row_trade_date:
                    # 还需检查价格是否合理，不合理则不跳过（强制覆盖修正）
                    if abs(q.price - existing_kline[1]) / existing_kline[1] < 0.01:
                        skipped_count += 1
                        with _lock:
                            _status["done"] = idx + 1
                        continue

            close = round(_safe_float(r[5]), 4)
            preclose = round(_safe_float(r[6]), 4)

            # 价格合理性校验：仅拦截 baostock 串码（偏差通常 >100%）
            # 除权场景下价格跳变可达 30-50%，不应拦截，直接信任 baostock 数据
            kline_ref = _kline_latest.get(raw_code)
            if kline_ref and kline_ref[1] > 0 and close > 0:
                diff_pct = abs(close - kline_ref[1]) / kline_ref[1] * 100
                if diff_pct > 60:
                    print(f"[sync_quotes] {raw_code} 价格异常：baostock={close}, kline={kline_ref[1]}, 偏差={diff_pct:.1f}%，跳过写入")
                    sched_log("warning", f"[行情同步] {raw_code} 价格异常（baostock={close}, kline={kline_ref[1]}, 偏差={diff_pct:.1f}%），已跳过", source="scheduler")
                    continue
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
    # 今日已有最新 K 线则跳过（避免重复全量拉取）
    if period == "daily":
        latest = _latest_kline_date(code)
        today_str = date.today().strftime("%Y-%m-%d")
        if latest and latest >= today_str:
            return

    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

    # 需要触发 reset_bs 的瞬态网络错误关键词
    _TRANSIENT_ERRORS = (
        "bad file descriptor",
        "utf-8",
        "utf8",
        "decompression",
        "codec",
        "connection",
        "broken pipe",
        "reset by peer",
        "timed out",
        "接收数据异常",
    )

    def _is_transient(e: Exception) -> bool:
        msg = str(e).lower()
        return any(kw in msg for kw in _TRANSIENT_ERRORS)

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

    rows = None
    fetch_attempts = 3
    for fetch_attempt in range(fetch_attempts):
        with ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(_fetch_rows)
            try:
                rows = fut.result(timeout=30)
                break  # 成功则退出重试
            except FuturesTimeout:
                print(f"[sync_klines] {code} timed out (attempt {fetch_attempt + 1}/{fetch_attempts})")
                reset_bs()
                if fetch_attempt < fetch_attempts - 1:
                    time.sleep(2 * (fetch_attempt + 1))
                    continue
                from routers.system import record_failed_stock
                record_failed_stock(code, get_stock_name(code), "超时", "kline")
                return
            except Exception as e:
                if _is_transient(e) and fetch_attempt < fetch_attempts - 1:
                    print(f"[sync_klines] {code} transient error (attempt {fetch_attempt + 1}/{fetch_attempts}): {e}, retrying...")
                    reset_bs()
                    time.sleep(2 * (fetch_attempt + 1))
                    continue
                print(f"[sync_klines] {code} fetch error: {e}")
                reset_bs()
                from routers.system import record_failed_stock
                record_failed_stock(code, get_stock_name(code), str(e), "kline")
                return

    if not rows:
        return

    db = SessionLocal()
    retry_count = 3
    try:
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
                    time.sleep(1 + db_attempt * 0.5)
                    continue
                print(f"[sync_klines] {code} db error: {e}")
    finally:
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

            # profit_data fields: [0]code [1]pubDate [2]statDate [3]roeAvg
            #   [4]npMargin [5]gpMargin [6]netProfit [7]epsTTM [8]MBRevenue
            #   [9]totalShare [10]liqaShare
            # growth_data fields: [0]code [1]pubDate [2]statDate [3]YOYEquity
            #   [4]YOYAsset [5]YOYNI [6]YOYEPSBasic [7]YOYPNI
            # balance_data fields: [0]code [1]pubDate [2]statDate [3]currentRatio
            #   [4]quickRatio [5]cashRatio [6]YOYLiability [7]liabilityToAsset
            #   [8]assetToEquity
            eps = _safe_float(profit_row[7]) if len(profit_row) > 7 else None          # epsTTM
            roe = _safe_float(profit_row[3]) if len(profit_row) > 3 else None          # roeAvg
            gross_margin = _safe_float(profit_row[4]) if len(profit_row) > 4 else None # npMargin（净利润率）
            net_profit = _safe_float(profit_row[6]) if len(profit_row) > 6 else None   # netProfit
            revenue = _safe_float(profit_row[8]) if len(profit_row) > 8 else None      # MBRevenue（营业收入）
            revenue_yoy = (
                _safe_float(growth_row[5])    # YOYNI（净利润同比，近似营收同比）
                if growth_row and len(growth_row) > 5
                else None
            )
            net_profit_yoy = (
                _safe_float(growth_row[7])    # YOYPNI（扣非净利润同比）
                if growth_row and len(growth_row) > 7
                else None
            )
            debt_ratio = (
                _safe_float(balance_row[7])   # liabilityToAsset（资产负债率）
                if balance_row and len(balance_row) > 7
                else None
            )
            report_date = profit_row[2] if profit_row else ""  # statDate（报告期）

            stmt = sqlite_insert(StockFundamental).values(
                code=code,
                report_date=report_date,
                eps=eps,
                roe=roe,
                revenue=revenue,
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
            db.query(IndustryNode)
            .filter(IndustryNode.industry_id == industry_id)
            .all()
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
        _industry_sync_status["message"] = f"[产业同步] {industry_id} 无 A 股节点，已跳过"
        sched_log("warning", f"[产业同步] {industry_id} 无 A 股节点", source="manual")
        return

    total = len(codes)
    _industry_sync_status["total"] = total
    sched_log("info", f"[产业同步] 开始同步 {industry_id}，共 {total} 只股票", source="manual")

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
