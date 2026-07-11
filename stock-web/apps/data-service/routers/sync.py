from fastapi import APIRouter, BackgroundTasks
from datetime import datetime
import threading
import time as _time
import json

from routers.industry import _sync_all_quotes, _sync_klines
from db import SessionLocal, StockMeta, StockFundamental, StockQuote, StockKline
from eastmoney_scraper import fetch_stock_info, fetch_stock_fundamental
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

router = APIRouter()

_status: dict = {
    "running": False,
    "phase": "",
    "total": 0,
    "done": 0,
    "current": "",
    "started_at": "",
    "finished_at": "",
}
_lock = threading.Lock()
_stop_requested = threading.Event()


def _sort_codes_missing_first(codes: list, table, code_col, has_data_check) -> list:
    db = SessionLocal()
    try:
        existing = {row[0] for row in db.query(code_col).all()}
    finally:
        db.close()
    missing = [c for c in codes if c not in existing or not has_data_check(existing, c)]
    have = [c for c in codes if c in existing and has_data_check(existing, c)]
    return missing + have


def _sort_quotes_missing_first(codes: list) -> list:
    db = SessionLocal()
    try:
        have_data = {
            r.code
            for r in db.query(
                StockQuote.code, StockQuote.price, StockQuote.updated_at
            ).all()
            if r.price and r.price > 0 and r.updated_at
        }
    finally:
        db.close()
    missing = [c for c in codes if c not in have_data]
    have = [c for c in codes if c in have_data]
    return missing + have


def _sort_klines_missing_first(codes: list) -> list:
    db = SessionLocal()
    try:
        have_data = {r.code for r in db.query(StockKline.code).distinct().all()}
    finally:
        db.close()
    missing = [c for c in codes if c not in have_data]
    have = [c for c in codes if c in have_data]
    return missing + have


def _sort_fundamental_missing_first(codes: list) -> list:
    db = SessionLocal()
    try:
        have_data = {r.code for r in db.query(StockFundamental.code).all()}
    finally:
        db.close()
    missing = [c for c in codes if c not in have_data]
    have = [c for c in codes if c in have_data]
    return missing + have


def _sort_meta_missing_first(codes: list) -> list:
    db = SessionLocal()
    try:
        have_name = {
            r.code
            for r in db.query(StockMeta.code, StockMeta.name).all()
            if r.name and r.name.strip()
        }
    finally:
        db.close()
    missing = [c for c in codes if c not in have_name]
    have = [c for c in codes if c in have_name]
    return missing + have


def _run_full_sync():
    from routers.system import sched_log
    from routers.sw_industry import sync_sw_industries
    from routers.industry import is_trading_day

    _stop_requested.clear()

    if not is_trading_day():
        sched_log("info", "非交易日，跳过全量同步", source="scheduler")
        return

    db = SessionLocal()
    try:
        codes = [row.code for row in db.query(StockMeta.code).all()]
    finally:
        db.close()

    with _lock:
        _status.update(
            running=True,
            phase="quotes",
            total=len(codes),
            done=0,
            current="",
            started_at=datetime.utcnow().isoformat(),
            finished_at="",
        )

    sched_log("info", f"[1/4] 开始同步实时行情，共 {len(codes)} 只股票")
    _sync_all_quotes()
    sched_log("success", f"[1/4] 实时行情同步完成")

    if _stop_requested.is_set():
        sched_log("warning", "同步已被用户停止")
        with _lock:
            _status.update(
                running=False,
                phase="stopped",
                finished_at=datetime.utcnow().isoformat(),
            )
        return

    with _lock:
        _status.update(phase="sw_industry", done=0, current="", total=1)

    sched_log("info", "[2/4] 开始同步申万行业板块行情...")
    try:
        count = sync_sw_industries()
        sched_log("success", f"[2/4] 申万行业板块同步完成，共 {count} 个板块")
    except Exception as e:
        sched_log("error", f"[2/4] 申万行业板块同步失败: {e}")

    if _stop_requested.is_set():
        sched_log("warning", "同步已被用户停止")
        with _lock:
            _status.update(
                running=False,
                phase="stopped",
                finished_at=datetime.utcnow().isoformat(),
            )
        return

    kline_codes = _sort_klines_missing_first(codes)

    with _lock:
        _status.update(phase="klines", done=0, total=len(kline_codes))

    sched_log(
        "info", f"[3/4] 开始同步 K 线数据，共 {len(kline_codes)} 只股票（无数据股优先）"
    )
    consecutive_timeouts = 0
    for i, code in enumerate(kline_codes):
        if _stop_requested.is_set():
            sched_log("warning", "同步已被用户停止")
            with _lock:
                _status.update(
                    running=False,
                    phase="stopped",
                    finished_at=datetime.utcnow().isoformat(),
                )
            return

        with _lock:
            _status["current"] = code
            _status["done"] = i

        from routers.industry import _sync_klines as _kline_fn
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as _FTimeout
        import threading as _th

        timed_out = _th.Event()

        def _run_kline(c=code):
            try:
                _kline_fn(c, "daily")
                timed_out.clear()
            except Exception:
                pass

        with ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(_run_kline)
            try:
                fut.result(timeout=45)
                consecutive_timeouts = 0
            except _FTimeout:
                consecutive_timeouts += 1
                print(
                    f"[full_sync] kline {code} outer timeout ({consecutive_timeouts})"
                )
                if consecutive_timeouts >= 5:
                    from bs_session import reset_bs

                    reset_bs()
                    _time.sleep(3)
                    consecutive_timeouts = 0

        _time.sleep(0.1)
        if (i + 1) % 500 == 0:
            sched_log("info", f"[3/4] K线同步进度: {i + 1}/{len(kline_codes)}")

    sched_log("success", f"[3/4] K线数据同步完成，共 {len(kline_codes)} 只股票")

    if _stop_requested.is_set():
        sched_log("warning", "同步已被用户停止")
        with _lock:
            _status.update(
                running=False,
                phase="stopped",
                finished_at=datetime.utcnow().isoformat(),
            )
        return

    fundamental_codes = _sort_fundamental_missing_first(codes)
    with _lock:
        _status.update(phase="fundamental", done=0, total=len(fundamental_codes))

    sched_log(
        "info",
        f"[4/4] 开始同步财务数据，共 {len(fundamental_codes)} 只股票（无数据股优先）",
    )
    from routers.industry import _sync_fundamental

    for i, code in enumerate(fundamental_codes):
        if _stop_requested.is_set():
            sched_log("warning", "同步已被用户停止")
            with _lock:
                _status.update(
                    running=False,
                    phase="stopped",
                    finished_at=datetime.utcnow().isoformat(),
                )
            return

        with _lock:
            _status["current"] = code
            _status["done"] = i

        try:
            _sync_fundamental(code)
        except Exception as e:
            print(f"[full_sync] fundamental {code} failed: {e}")

        _time.sleep(0.1)
        if (i + 1) % 500 == 0:
            sched_log(
                "info", f"[4/4] 财务数据同步进度: {i + 1}/{len(fundamental_codes)}"
            )

    sched_log("success", f"[4/4] 财务数据同步完成，共 {len(fundamental_codes)} 只股票")

    if _stop_requested.is_set():
        sched_log("warning", "同步已被用户停止")
        with _lock:
            _status.update(
                running=False,
                phase="stopped",
                finished_at=datetime.utcnow().isoformat(),
            )
        return

    # [5/6] 申万行业板块 K 线同步
    sched_log("info", "[5/6] 开始同步申万行业板块 K 线...")
    try:
        from routers.sw_industry import _sync_rotation_klines as _sync_sw_klines
        _sync_sw_klines()
        sched_log("success", "[5/6] 申万行业板块 K 线同步完成")
    except Exception as e:
        sched_log("error", f"[5/6] 申万行业板块 K 线同步失败: {e}")

    if _stop_requested.is_set():
        sched_log("warning", "同步已被用户停止")
        with _lock:
            _status.update(
                running=False,
                phase="stopped",
                finished_at=datetime.utcnow().isoformat(),
            )
        return

    # [6/7] 板块新闻同步
    sched_log("info", "[6/7] 开始同步板块新闻...")
    try:
        from routers.theme import sync_theme_news as _sync_theme_news
        _sync_theme_news()
    except Exception as e:
        sched_log("error", f"[6/7] 板块新闻同步失败: {e}")

    # [7/7] 技术指标计算（KDJ + MA 写入 stock_indicator）
    sched_log("info", "[7/7] 开始计算技术指标（KDJ/MA）...")
    try:
        import subprocess, sys, os
        script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "compute_indicators.py")
        result = subprocess.run(
            [sys.executable, script_path],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0:
            sched_log("success", "[7/7] 技术指标计算完成")
        else:
            sched_log("error", f"[7/7] 技术指标计算失败: {result.stderr[-200:]}")
    except Exception as e:
        sched_log("error", f"[7/7] 技术指标计算异常: {e}")

    with _lock:
        _status.update(
            running=False,
            phase="done",
            current="",
            done=len(codes),
            finished_at=datetime.utcnow().isoformat(),
        )

    sched_log("success", "全量刷新完成")
    print("[sync] finished")


@router.get("/status")
async def get_status():
    with _lock:
        return dict(_status)


@router.post("/all")
async def trigger_sync_all(background_tasks: BackgroundTasks):
    with _lock:
        if _status["running"]:
            return {"status": "already_running", **_status}
    background_tasks.add_task(_run_full_sync)
    return {"status": "started"}


@router.post("/stop")
async def stop_sync():
    from routers.system import sched_log

    with _lock:
        if not _status["running"]:
            return {"status": "not_running", "message": "没有正在运行的同步任务"}

    _stop_requested.set()
    sched_log("warning", "已请求停止同步，正在等待当前任务完成...")
    return {
        "status": "stopping",
        "message": "停止请求已发送，任务将在当前操作完成后停止",
    }


def _run_quotes_sync():
    from routers.industry import _sync_all_quotes
    from routers.system import sched_log

    _stop_requested.clear()

    db = SessionLocal()
    try:
        from db import StockMeta as _SM

        total = db.query(_SM.code).count()
    finally:
        db.close()

    with _lock:
        _status.update(
            running=True,
            phase="quotes",
            total=total,
            done=0,
            current="",
            started_at=datetime.utcnow().isoformat(),
            finished_at="",
        )

    sched_log("info", f"开始同步实时行情，共 {total} 只股票")
    _sync_all_quotes()

    if _stop_requested.is_set():
        sched_log("warning", "实时行情同步已被用户停止")
        with _lock:
            _status.update(
                running=False,
                phase="stopped",
                finished_at=datetime.utcnow().isoformat(),
            )
        return

    with _lock:
        _status.update(
            running=False,
            phase="done",
            current="",
            done=total,
            finished_at=datetime.utcnow().isoformat(),
        )

    sched_log("success", f"实时行情同步完成，共 {total} 只股票")
    print("[sync] quotes-only sync finished")


@router.post("/quotes")
async def trigger_sync_quotes(background_tasks: BackgroundTasks):
    with _lock:
        if _status["running"]:
            return {"status": "already_running", **_status}
    background_tasks.add_task(_run_quotes_sync)
    return {"status": "started"}


def _run_stock_info_sync():
    from routers.system import sched_log

    _stop_requested.clear()

    db = SessionLocal()
    try:
        raw_codes = [row.code for row in db.query(StockMeta.code).all()]
    finally:
        db.close()

    codes = _sort_meta_missing_first(raw_codes)

    with _lock:
        _status.update(
            running=True,
            phase="stock_info",
            total=len(codes),
            done=0,
            current="",
            started_at=datetime.utcnow().isoformat(),
            finished_at="",
        )

    sched_log("info", f"开始同步基本信息，共 {len(codes)} 只股票")

    for i, code in enumerate(codes):
        if _stop_requested.is_set():
            sched_log("warning", "基本信息同步已被用户停止")
            with _lock:
                _status.update(
                    running=False,
                    phase="stopped",
                    finished_at=datetime.utcnow().isoformat(),
                )
            return

        with _lock:
            _status["current"] = code
            _status["done"] = i

        try:
            info = fetch_stock_info(code)
            if info:
                db = SessionLocal()
                try:
                    stmt = sqlite_insert(StockMeta).values(
                        code=code,
                        name=info.get("name", ""),
                        market="",
                        industry_ids=info.get("industry", ""),
                        updated_at=datetime.utcnow(),
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["code"],
                        set_={
                            "name": stmt.excluded.name,
                            "industry_ids": stmt.excluded.industry_ids,
                            "updated_at": stmt.excluded.updated_at,
                        },
                    )
                    db.execute(stmt)
                    db.commit()
                    print(f"[sync] updated stock info for {code}")
                except Exception as e:
                    db.rollback()
                    print(f"[sync] error updating stock info for {code}: {e}")
                finally:
                    db.close()
        except Exception as e:
            print(f"[sync] error fetching stock info for {code}: {e}")

        _time.sleep(0.2)

    with _lock:
        _status.update(
            running=False,
            phase="done",
            current="",
            done=len(codes),
            finished_at=datetime.utcnow().isoformat(),
        )

    sched_log("success", f"基本信息同步完成，共 {len(codes)} 只股票")


@router.post("/stock_info")
async def trigger_sync_stock_info(background_tasks: BackgroundTasks):
    with _lock:
        if _status["running"]:
            return {"status": "already_running", **_status}
    background_tasks.add_task(_run_stock_info_sync)
    return {"status": "started"}


def _run_fundamental_sync():
    from routers.system import sched_log

    _stop_requested.clear()

    db = SessionLocal()
    try:
        raw_codes = [row.code for row in db.query(StockMeta.code).all()]
    finally:
        db.close()

    codes = _sort_fundamental_missing_first(raw_codes)

    with _lock:
        _status.update(
            running=True,
            phase="fundamental",
            total=len(codes),
            done=0,
            current="",
            started_at=datetime.utcnow().isoformat(),
            finished_at="",
        )

    sched_log("info", f"开始同步财务数据，共 {len(codes)} 只股票")

    for i, code in enumerate(codes):
        if _stop_requested.is_set():
            sched_log("warning", "财务数据同步已被用户停止")
            with _lock:
                _status.update(
                    running=False,
                    phase="stopped",
                    finished_at=datetime.utcnow().isoformat(),
                )
            return

        with _lock:
            _status["current"] = code
            _status["done"] = i

        try:
            fund_data = fetch_stock_fundamental(code)
            if fund_data:
                db = SessionLocal()
                try:
                    raw_data = fund_data.get("raw_data", {})

                    def safe_float(val):
                        try:
                            return float(
                                str(val)
                                .replace(",", "")
                                .replace("亿", "")
                                .replace("万", "")
                                .strip()
                                or "0"
                            )
                        except:
                            return 0.0

                    stmt = sqlite_insert(StockFundamental).values(
                        code=code,
                        report_date=fund_data.get("report_date", ""),
                        eps=safe_float(fund_data.get("basic_eps", "0")),
                        roe=safe_float(fund_data.get("roe", "0")),
                        revenue=safe_float(
                            fund_data.get("total_operating_revenue", "0")
                        ),
                        revenue_yoy=0.0,
                        net_profit=safe_float(fund_data.get("net_profit", "0")),
                        net_profit_yoy=0.0,
                        gross_margin=0.0,
                        debt_ratio=0.0,
                        raw_json=json.dumps(raw_data, ensure_ascii=False),
                        updated_at=datetime.utcnow(),
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["code"],
                        set_={
                            "report_date": stmt.excluded.report_date,
                            "eps": stmt.excluded.eps,
                            "roe": stmt.excluded.roe,
                            "revenue": stmt.excluded.revenue,
                            "net_profit": stmt.excluded.net_profit,
                            "raw_json": stmt.excluded.raw_json,
                            "updated_at": stmt.excluded.updated_at,
                        },
                    )
                    db.execute(stmt)
                    db.commit()
                    print(f"[sync] updated fundamental data for {code}")
                except Exception as e:
                    db.rollback()
                    print(f"[sync] error updating fundamental data for {code}: {e}")
                finally:
                    db.close()
        except Exception as e:
            print(f"[sync] error fetching fundamental data for {code}: {e}")

        _time.sleep(0.3)

    with _lock:
        _status.update(
            running=False,
            phase="done",
            current="",
            done=len(codes),
            finished_at=datetime.utcnow().isoformat(),
        )

    print("[sync] fundamental sync finished")


@router.post("/fundamental")
async def trigger_sync_fundamental(background_tasks: BackgroundTasks):
    with _lock:
        if _status["running"]:
            return {"status": "already_running", **_status}
    background_tasks.add_task(_run_fundamental_sync)
    return {"status": "started"}


def _run_klines_sync():
    from routers.system import sched_log

    _stop_requested.clear()

    db = SessionLocal()
    try:
        codes = [row.code for row in db.query(StockMeta.code).all()]
    finally:
        db.close()

    kline_codes = _sort_klines_missing_first(codes)

    with _lock:
        _status.update(
            running=True,
            phase="klines",
            done=0,
            total=len(kline_codes),
            current="",
            started_at=datetime.utcnow().isoformat(),
            finished_at="",
        )

    sched_log(
        "info", f"开始批量同步K线数据，共 {len(kline_codes)} 只股票（无数据股优先）"
    )
    for i, code in enumerate(kline_codes):
        if _stop_requested.is_set():
            sched_log("warning", "K线数据同步已被用户停止")
            with _lock:
                _status.update(
                    running=False,
                    phase="stopped",
                    finished_at=datetime.utcnow().isoformat(),
                )
            return

        with _lock:
            _status["current"] = code
            _status["done"] = i
        _sync_klines(code, "daily")
        _time.sleep(0.1)
        if (i + 1) % 500 == 0:
            sched_log("info", f"K线同步进度: {i + 1}/{len(kline_codes)}")

    with _lock:
        _status.update(
            running=False,
            phase="done",
            current="",
            done=len(kline_codes),
            finished_at=datetime.utcnow().isoformat(),
        )

    sched_log("success", f"K线数据同步完成，共 {len(kline_codes)} 只股票")


@router.post("/klines")
async def trigger_sync_klines(background_tasks: BackgroundTasks):
    with _lock:
        if _status["running"]:
            return {"status": "already_running", **_status}
    background_tasks.add_task(_run_klines_sync)
    return {"status": "started"}
