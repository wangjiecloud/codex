from fastapi import APIRouter, BackgroundTasks
from datetime import datetime
import threading
import time as _time
import json
import os

from routers.industry import _sync_all_quotes, _sync_klines
from db import (
    SessionLocal,
    StockMeta,
    StockFundamental,
    StockF10Snapshot,
    StockQuote,
    StockKline,
)
from eastmoney_scraper import fetch_stock_info
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

# 断点续传游标文件路径
_FUNDAMENTAL_CURSOR_FILE = os.path.join(
    os.path.dirname(__file__), "..", "fundamental_cursor.json"
)


def _save_fundamental_cursor(date_str: str, codes: list, done: int):
    """保存断点续传游标"""
    cursor = {"date": date_str, "codes": codes, "done": done}
    try:
        with open(_FUNDAMENTAL_CURSOR_FILE, "w", encoding="utf-8") as f:
            json.dump(cursor, f)
    except Exception as e:
        print(f"[sync] failed to save fundamental cursor: {e}")


def _load_fundamental_cursor(date_str: str):
    """加载断点续传游标，仅当日期匹配时有效，返回 (codes, start_index) 或 None"""
    try:
        if not os.path.exists(_FUNDAMENTAL_CURSOR_FILE):
            return None
        with open(_FUNDAMENTAL_CURSOR_FILE, "r", encoding="utf-8") as f:
            cursor = json.load(f)
        if cursor.get("date") == date_str and isinstance(cursor.get("codes"), list):
            done = cursor.get("done", 0)
            codes = cursor["codes"]
            # done >= 0 且列表非空即认为游标有效（done=0 表示从头续传剩余列表）
            if 0 <= done < len(codes):
                return codes, done
    except Exception as e:
        print(f"[sync] failed to load fundamental cursor: {e}")
    return None


def _clear_fundamental_cursor():
    """清除游标文件"""
    try:
        if os.path.exists(_FUNDAMENTAL_CURSOR_FILE):
            os.remove(_FUNDAMENTAL_CURSOR_FILE)
    except Exception:
        pass


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
    """优先同步 stock_f10_snapshot 中无数据的股票"""
    db = SessionLocal()
    try:
        have_data = {r.code for r in db.query(StockF10Snapshot.code).all()}
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
        if (i + 1) % 100 == 0:
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

    all_fundamental_codes = _sort_fundamental_missing_first(codes)
    # 预加载今日已同步的股票，直接从队列中移除
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    db2 = SessionLocal()
    try:
        synced_today = {
            row.code
            for row in db2.query(
                StockF10Snapshot.code, StockF10Snapshot.updated_at
            ).all()
            if row.updated_at and row.updated_at.strftime("%Y-%m-%d") == today_str
        }
    finally:
        db2.close()
    skip_count = sum(1 for c in all_fundamental_codes if c in synced_today)
    fundamental_codes = [c for c in all_fundamental_codes if c not in synced_today]

    with _lock:
        _status.update(phase="fundamental", done=0, total=len(fundamental_codes))

    sched_log(
        "info",
        f"[4/4] 开始同步财务数据（F10），待同步 {len(fundamental_codes)} 只（今日已跳过 {skip_count} 只）",
    )
    from routers.fundamental import _scrape_f10, _upsert_f10

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
            data = _scrape_f10(code)
            _upsert_f10(code, data)
        except Exception as e:
            print(f"[full_sync] fundamental {code} failed: {e}")

        _time.sleep(0.1)
        if (i + 1) % 500 == 0:
            sched_log(
                "info", f"[4/4] 财务数据同步进度: {i + 1}/{len(fundamental_codes)}"
            )

    sched_log(
        "success",
        f"[4/4] 财务数据（F10）同步完成，共处理 {len(fundamental_codes)} 只股票",
    )

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

        script_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "compute_indicators.py"
        )
        result = subprocess.run(
            [sys.executable, script_path], capture_output=True, text=True, timeout=120
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
        from db import StockMeta as _SM, StockQuote as _SQ
        from sqlalchemy import func as _func

        total = db.query(_SM.code).count()
        # 今日已更新的行情（按 updated_at 日期过滤）
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        already_today = (
            db.query(_func.count(_SQ.code)).filter(_SQ.updated_at >= today_str).scalar()
            or 0
        )
    finally:
        db.close()

    if already_today >= total * 0.9:
        sched_log(
            "info",
            f"实时行情今日已同步 {already_today}/{total} 只（≥90%），跳过重复同步",
        )
        return

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

    sched_log(
        "info", f"开始同步实时行情，共 {total} 只股票（今日已有 {already_today} 只）"
    )
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
    from routers.fundamental import _scrape_f10, _upsert_f10

    _stop_requested.clear()

    today_str = datetime.now().strftime("%Y-%m-%d")

    # ── 断点续传：优先从游标文件恢复 ──
    resumed = _load_fundamental_cursor(today_str)
    if resumed:
        codes, start_index = resumed
        sched_log(
            "info",
            f"财务数据（F10）断点续传，从第 {start_index + 1}/{len(codes)} 只继续",
        )
    else:
        # 无有效游标，重新构建股票列表并过滤今日已同步
        db = SessionLocal()
        try:
            raw_codes = [row.code for row in db.query(StockMeta.code).all()]
            # 预加载今日已同步的股票（updated_at 日期为今天），直接从队列中移除
            from sqlalchemy import text as _text

            rows = db.execute(
                _text(
                    "SELECT code FROM stock_f10_snapshot WHERE substr(updated_at,1,10) = :today"
                ),
                {"today": today_str},
            ).fetchall()
            synced_today = {r[0] for r in rows}
        finally:
            db.close()

        all_codes = _sort_fundamental_missing_first(raw_codes)
        skip_count = sum(1 for c in all_codes if c in synced_today)
        codes = [c for c in all_codes if c not in synced_today]
        start_index = 0

        if not codes:
            sched_log(
                "info", f"财务数据（F10）今日已全部同步，跳过（共 {skip_count} 只）"
            )
            _clear_fundamental_cursor()
            return

        sched_log(
            "info",
            f"开始同步财务数据（F10），待同步 {len(codes)} 只（今日已跳过 {skip_count} 只）",
        )
        # 不在初始化时保存游标（done=0 无意义），等第一只同步完再保存

    with _lock:
        _status.update(
            running=True,
            phase="fundamental",
            total=len(codes),
            done=start_index,
            current="",
            started_at=datetime.utcnow().isoformat(),
            finished_at="",
        )

    for i in range(start_index, len(codes)):
        code = codes[i]

        if _stop_requested.is_set():
            sched_log("warning", "财务数据同步已被用户停止")
            # 保存当前游标以便下次续传
            _save_fundamental_cursor(today_str, codes, i)
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
            data = _scrape_f10(code)
            _upsert_f10(code, data)
            print(f"[sync] updated F10 data for {code}")
        except Exception as e:
            print(f"[sync] error syncing F10 for {code}: {e}")

        # 每只同步后立即更新游标，确保重启后能从最近完成的位置续传
        _save_fundamental_cursor(today_str, codes, i + 1)

        _time.sleep(0.3)

    with _lock:
        _status.update(
            running=False,
            phase="done",
            current="",
            done=len(codes),
            finished_at=datetime.utcnow().isoformat(),
        )

    # 同步完成，清除游标
    _clear_fundamental_cursor()
    sched_log("success", f"财务数据（F10）同步完成，共 {len(codes)} 只股票")
    print("[sync] fundamental sync finished")


@router.post("/fundamental")
async def trigger_sync_fundamental(
    background_tasks: BackgroundTasks, force: bool = False
):
    with _lock:
        if _status["running"]:
            return {"status": "already_running", **_status}
    if force:
        _clear_fundamental_cursor()
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
