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
    db = SessionLocal()
    try:
        from db import StockF10BusinessAnalysis, StockF10FinancialHistory

        snapshot_codes = {r.code for r in db.query(StockF10Snapshot.code).all()}
        business_codes = {
            r.code
            for r in db.query(
                StockF10BusinessAnalysis.code,
                StockF10BusinessAnalysis.main_business_breakdown,
            ).all()
            if r.main_business_breakdown and r.main_business_breakdown.strip()
        }
        history_codes = {
            r.code for r in db.query(StockF10FinancialHistory.code).distinct().all()
        }
        have_data = snapshot_codes & business_codes & history_codes
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

    sched_log("info", "[7/7] 开始计算技术指标（KDJ/MA/MACD/RSI/BOLL）...")
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


# ────────────────────────────────────────────────────────────────────
#  全量 K 线补全（日K / 周K / 月K，从上市日起，支持断点续传）
# ────────────────────────────────────────────────────────────────────

_KLINE_BACKFILL_CURSOR_FILE = os.path.join(
    os.path.dirname(__file__), "..", "kline_backfill_cursor.json"
)

# 补全任务独立状态（与 _status 隔离，互不影响）
_backfill_status: dict = {
    "running": False,
    "phase": "",  # "daily" | "weekly" | "monthly" | "done" | "stopped"
    "total": 0,
    "done": 0,
    "current": "",
    "started_at": "",
    "finished_at": "",
    "periods_done": [],  # 已完成的周期列表
}
_backfill_lock = threading.Lock()
_backfill_stop = threading.Event()


def _save_backfill_cursor(codes: list, period_idx: int, code_idx: int):
    """保存全量K线补全游标（原子写入，防止进程中断导致文件损坏）"""
    cursor = {
        "codes": codes,
        "period_idx": period_idx,
        "code_idx": code_idx,
    }
    tmp_file = _KLINE_BACKFILL_CURSOR_FILE + ".tmp"
    try:
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(cursor, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_file, _KLINE_BACKFILL_CURSOR_FILE)
    except Exception as e:
        print(f"[backfill] failed to save cursor: {e}")
        try:
            os.remove(tmp_file)
        except Exception:
            pass


def _load_backfill_cursor():
    """加载全量K线补全游标，返回 (codes, period_idx, code_idx) 或 None"""
    try:
        if not os.path.exists(_KLINE_BACKFILL_CURSOR_FILE):
            return None
        with open(_KLINE_BACKFILL_CURSOR_FILE, "r", encoding="utf-8") as f:
            cursor = json.load(f)
        codes = cursor.get("codes")
        period_idx = cursor.get("period_idx", 0)
        code_idx = cursor.get("code_idx", 0)
        if isinstance(codes, list) and len(codes) > 0:
            return codes, period_idx, code_idx
    except Exception as e:
        print(f"[backfill] failed to load cursor: {e}")
    return None


def _clear_backfill_cursor():
    try:
        if os.path.exists(_KLINE_BACKFILL_CURSOR_FILE):
            os.remove(_KLINE_BACKFILL_CURSOR_FILE)
    except Exception:
        pass


def _get_ipo_date(code: str) -> str:
    """返回默认上市日期（不再调用 baostock）。"""
    return "1990-01-01"


def _has_kline_data(code: str, period: str) -> bool:
    """检查 stock_kline 中该 code+period 是否已有数据，有则返回 True（跳过）。"""
    from db import SessionLocal, StockKline

    db = SessionLocal()
    try:
        exists = (
            db.query(StockKline.code)
            .filter(StockKline.code == code, StockKline.period == period)
            .limit(1)
            .first()
        )
        return exists is not None
    except Exception:
        return False
    finally:
        db.close()


def _fetch_full_klines(code: str, period: str, start_date: str):
    """
    从 start_date 到今日，全量抓取指定周期K线并写入 stock_kline 表。
    直接使用新浪数据源。
    """
    from routers.kline import _fetch_and_cache_klines_sina
    from datetime import date as _date, datetime as _dt, timedelta as _timedelta

    try:
        start_dt = _dt.strptime(start_date, "%Y-%m-%d").date()
    except Exception:
        start_dt = _date.today() - _timedelta(days=400)
    delta_days = (_date.today() - start_dt).days
    if period == "weekly":
        need_count = max(delta_days // 7 + 30, 200)
    elif period == "monthly":
        need_count = max(delta_days // 30 + 12, 120)
    else:
        need_count = max(delta_days + 10, 400)

    try:
        rows = _fetch_and_cache_klines_sina(code, period, need_count)
        return len(rows) if rows else 0
    except Exception as e:
        print(f"[backfill] sina fetch failed for {code}/{period}: {e}")
        return 0


def _fetch_all_market_codes() -> tuple:
    """
    用 akshare 拉取全市场 A 股代码列表，
    并与 stock_meta 表中的代码合并去重，返回 (排序后的代码列表, 代码信息字典)。
    """
    import akshare as ak

    market_codes: set = set()
    bs_info: dict = {}

    try:
        df = ak.stock_zh_a_spot_em()
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                code = str(row.get("代码", "")).strip()
                name = str(row.get("名称", "")).strip()
                if len(code) == 6 and code.isdigit() and not code.startswith("8"):
                    market_codes.add(code)
                    bs_info[code] = {
                        "name": name,
                        "market": "SH" if code.startswith(("6", "5")) else "SZ",
                        "stock_type": "1",
                    }
    except Exception as e:
        print(f"[backfill] akshare stock_zh_a_spot_em error: {e}")

    def _is_valid_stock_code(code: str) -> bool:
        if not (len(code) == 6 and code.isdigit()):
            return False
        if code.startswith("8"):
            return False
        return True

    db = SessionLocal()
    try:
        db_codes = {
            row.code
            for row in db.query(StockMeta.code).all()
            if _is_valid_stock_code(row.code)
        }
    finally:
        db.close()

    all_codes = sorted(market_codes | db_codes)
    print(
        f"[backfill] 全市场代码：akshare={len(market_codes)}，"
        f"stock_meta有效={len(db_codes)}，合并去重后={len(all_codes)}"
    )
    return all_codes, bs_info


def _ensure_stock_meta_and_quote(code: str, bs_info: dict) -> None:
    """
    若 code 不在 stock_meta 表中，则自动补写 stock_meta 和 stock_quote（默认值）。
    bs_info: {code: {name, market, stock_type}} — 由 _fetch_all_market_codes 构建。
    """
    db = SessionLocal()
    try:
        exists = db.query(StockMeta.code).filter(StockMeta.code == code).first()
        if exists:
            return

        info = bs_info.get(code, {})
        name = info.get("name", "")
        market = info.get("market", "SH" if code.startswith(("6", "5")) else "SZ")

        # 补写 stock_meta
        stmt_meta = (
            sqlite_insert(StockMeta)
            .values(
                code=code,
                name=name,
                market=market,
                industry_ids="",
            )
            .on_conflict_do_nothing(index_elements=["code"])
        )
        db.execute(stmt_meta)

        # 补写 stock_quote（price 等行情字段全部默认 0，等行情同步时刷新）
        stmt_quote = (
            sqlite_insert(StockQuote)
            .values(
                code=code,
                name=name,
                price=0.0,
                change=0.0,
                change_amt=0.0,
                open=0.0,
                prev_close=0.0,
                high=0.0,
                low=0.0,
                volume=0.0,
                turnover=0.0,
                market_cap=0.0,
                pe=0.0,
                pb=0.0,
                turnover_rate=0.0,
                amplitude=0.0,
            )
            .on_conflict_do_nothing(index_elements=["code"])
        )
        db.execute(stmt_quote)

        db.commit()
        print(f"[backfill] 自动补写 stock_meta/stock_quote: {code} ({name}, {market})")
    except Exception as e:
        db.rollback()
        print(f"[backfill] _ensure_stock_meta_and_quote {code} error: {e}")
    finally:
        db.close()


def _run_kline_backfill():
    """全量K线补全主函数，支持断点续传"""
    from routers.system import sched_log

    _backfill_stop.clear()
    PERIODS = ["daily", "weekly", "monthly"]

    codes: list = []
    start_period_idx = 0
    start_code_idx = 0
    bs_info: dict = {}

    try:
        # ── 尝试加载断点游标 ──
        resumed = _load_backfill_cursor()
        if resumed:
            codes, start_period_idx, start_code_idx = resumed
            sched_log(
                "info",
                f"全量K线补全断点续传：从周期={PERIODS[start_period_idx]}，"
                f"第 {start_code_idx + 1}/{len(codes)} 只继续",
            )
        else:
            sched_log("info", "全量K线补全：正在从 akshare 拉取全市场股票列表…")
            codes, bs_info = _fetch_all_market_codes()
            start_period_idx = 0
            start_code_idx = 0
            sched_log(
                "info",
                f"开始全量K线补全，共 {len(codes)} 只股票/ETF × 3 周期（日K/周K/月K）",
            )

        total_codes = len(codes)
        # 计算总任务量（剩余周期 × 总只数 - 当前周期已完成的）
        remaining = (len(PERIODS) - start_period_idx) * total_codes - start_code_idx

        with _backfill_lock:
            _backfill_status.update(
                running=True,
                phase=PERIODS[start_period_idx],
                total=remaining,
                done=0,
                current="",
                started_at=datetime.utcnow().isoformat(),
                finished_at="",
                periods_done=PERIODS[:start_period_idx],
            )

        global_done = 0

        for period_idx in range(start_period_idx, len(PERIODS)):
            period = PERIODS[period_idx]

            with _backfill_lock:
                _backfill_status["phase"] = period

            code_start = start_code_idx if period_idx == start_period_idx else 0

            sched_log("info", f"全量K线补全：开始 {period}，共 {total_codes} 只")

            for code_idx in range(code_start, total_codes):
                if _backfill_stop.is_set():
                    # 保存游标后退出
                    _save_backfill_cursor(codes, period_idx, code_idx)
                    sched_log(
                        "warning",
                        f"全量K线补全已停止（游标已保存，下次可续传）"
                        f"：{period} 第 {code_idx}/{total_codes}",
                    )
                    with _backfill_lock:
                        _backfill_status.update(
                            running=False,
                            phase="stopped",
                            finished_at=datetime.utcnow().isoformat(),
                        )
                    return

                code = codes[code_idx]
                with _backfill_lock:
                    _backfill_status["current"] = code
                    _backfill_status["done"] = global_done

                # 已有数据则跳过（不发网络请求），游标照常推进
                if _has_kline_data(code, period):
                    _save_backfill_cursor(codes, period_idx, code_idx + 1)
                    global_done += 1
                    continue

                # 获取上市日期作为抓取起始日
                ipo_date = _get_ipo_date(code)

                # daily 阶段：若 stock_meta 里没有该股票，自动补写 stock_meta + stock_quote
                if period == "daily":
                    _ensure_stock_meta_and_quote(code, bs_info)

                saved = _fetch_full_klines(code, period, ipo_date)

                global_done += 1
                with _backfill_lock:
                    _backfill_status["done"] = global_done

                # 每完成一只立即更新游标
                _save_backfill_cursor(codes, period_idx, code_idx + 1)

                if (code_idx + 1) % 200 == 0:
                    sched_log(
                        "info",
                        f"全量K线补全进度：{period} {code_idx + 1}/{total_codes}，"
                        f"总进度 {global_done}/{remaining}",
                    )

                _time.sleep(0.15)  # 避免过于频繁请求

            # 完成一个周期
            with _backfill_lock:
                _backfill_status["periods_done"] = PERIODS[: period_idx + 1]

            sched_log("success", f"全量K线补全：{period} 完成，共 {total_codes} 只")

        # 全部完成
        _clear_backfill_cursor()
        with _backfill_lock:
            _backfill_status.update(
                running=False,
                phase="done",
                current="",
                done=global_done,
                finished_at=datetime.utcnow().isoformat(),
            )
        sched_log(
            "success",
            f"全量K线补全完成！日K/周K/月K 共处理 {total_codes} 只股票",
        )

    except Exception as e:
        import traceback

        err_msg = traceback.format_exc()
        print(f"[backfill] _run_kline_backfill 未捕获异常: {e}\n{err_msg}")
        # 游标已在每只股票完成后实时保存，无需在此重复保存
        with _backfill_lock:
            _backfill_status.update(
                running=False,
                phase="error",
                finished_at=datetime.utcnow().isoformat(),
            )
        try:
            sched_log("error", f"全量K线补全异常退出：{e}")
        except Exception:
            pass


@router.post("/kline-backfill")
async def trigger_kline_backfill(
    background_tasks: BackgroundTasks, force: bool = False
):
    """启动全量K线补全任务（日K/周K/月K，从上市日起）。force=true 时清除游标重新开始"""
    with _backfill_lock:
        if _backfill_status["running"]:
            return {"status": "already_running", **_backfill_status}
    if force:
        _clear_backfill_cursor()
    background_tasks.add_task(_run_kline_backfill)
    return {"status": "started"}


@router.post("/kline-backfill/stop")
async def stop_kline_backfill():
    """停止全量K线补全任务（游标已保存，下次启动自动续传）"""
    _backfill_stop.set()
    return {"status": "stop_requested"}


@router.get("/kline-backfill/status")
async def get_kline_backfill_status():
    """查询全量K线补全任务状态"""
    with _backfill_lock:
        status = dict(_backfill_status)

    # 附加游标信息（是否有可续传的进度）
    cursor = _load_backfill_cursor()
    status["has_cursor"] = cursor is not None
    if cursor:
        codes, period_idx, code_idx = cursor
        PERIODS = ["daily", "weekly", "monthly"]
        status["cursor_info"] = {
            "period": PERIODS[period_idx] if period_idx < len(PERIODS) else "done",
            "code_idx": code_idx,
            "total_codes": len(codes),
        }
    return status
