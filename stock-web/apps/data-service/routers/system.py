import json
import threading
from collections import deque
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from db import (
    get_db,
    StockMeta,
    StockQuote,
    StockFundamental,
    StockF10Snapshot,
    StockKline,
    IndustryNode,
    NewsFlash,
    TaskLastRun,
    SessionLocal,
)
from datetime import datetime, timedelta

router = APIRouter()

_sched_logs: deque = deque(maxlen=200)
_sched_logs_lock = threading.Lock()
_sched_log_seq: int = 0

_failed_stocks: dict = {}
_failed_stocks_lock = threading.Lock()

# 记录每个任务的上次完成时间 { task_id: "MM-DD HH:MM" }
# 进程启动时从数据库预热，之后每次完成时内存+DB 同步更新
_task_last_run: dict = {}
_task_last_run_lock = threading.Lock()
_task_last_run_loaded = False


def _load_task_last_run_from_db():
    """进程启动时调用一次，从 DB 预热内存字典"""
    global _task_last_run_loaded
    db = SessionLocal()
    try:
        rows = db.query(TaskLastRun).all()
        with _task_last_run_lock:
            for row in rows:
                _task_last_run[row.task_id] = row.last_run_at.strftime("%m-%d %H:%M")
            _task_last_run_loaded = True
    except Exception as e:
        print(f"[system] 加载 task_last_run 失败: {e}")
    finally:
        db.close()


def record_task_last_run(task_id: str):
    """任务执行完毕时调用，同时更新内存缓存和数据库"""
    now = datetime.utcnow()
    display = now.strftime("%m-%d %H:%M")
    with _task_last_run_lock:
        _task_last_run[task_id] = display
    # 异步写入数据库（不阻塞调度线程）
    def _persist():
        db = SessionLocal()
        try:
            row = db.query(TaskLastRun).filter_by(task_id=task_id).first()
            if row:
                row.last_run_at = now
                row.updated_at = now
            else:
                db.add(TaskLastRun(task_id=task_id, last_run_at=now, updated_at=now))
            db.commit()
        except Exception as e:
            print(f"[system] 持久化 task_last_run({task_id}) 失败: {e}")
        finally:
            db.close()
    threading.Thread(target=_persist, daemon=True).start()


def get_task_last_run_dt(task_id: str) -> Optional[datetime]:
    """返回指定任务的上次完成时间（datetime，UTC），从 DB 读取；未执行过返回 None"""
    db = SessionLocal()
    try:
        row = db.query(TaskLastRun).filter_by(task_id=task_id).first()
        return row.last_run_at if row else None
    except Exception:
        return None
    finally:
        db.close()


def record_failed_stock(code: str, name: str, reason: str, sync_type: str = "kline"):
    with _failed_stocks_lock:
        key = f"{sync_type}:{code}"
        _failed_stocks[key] = {
            "code": code,
            "name": name,
            "reason": reason,
            "syncType": sync_type,
            "time": datetime.now().isoformat(),
        }


def sched_log(level: str, message: str, source: str = "manual"):
    global _sched_log_seq
    with _sched_logs_lock:
        _sched_log_seq += 1
        _sched_logs.append(
            {
                "seq": _sched_log_seq,
                "time": datetime.now().strftime("%H:%M:%S"),
                "level": level,
                "message": message,
                "source": source,
            }
        )


def _get_last_sync(table_class, field_name="updated_at") -> Optional[str]:
    from db import SessionLocal
    from sqlalchemy import func as _func

    db = SessionLocal()
    try:
        row = db.query(_func.max(getattr(table_class, field_name))).scalar()
        return row.isoformat() if row else None
    except Exception:
        return None
    finally:
        db.close()


@router.get("/stats")
async def get_system_stats(db: Session = Depends(get_db)):
    total_stocks = db.query(func.count(StockMeta.code)).scalar() or 0

    total_quote_data = db.query(func.count(StockQuote.code)).scalar() or 0
    total_fundamental_data = db.query(func.count(StockF10Snapshot.code)).scalar() or 0
    total_stock_info_data = db.query(func.count(StockMeta.code)).scalar() or 0
    total_kline_data = db.query(func.count(StockKline.id)).scalar() or 0
    stocks_with_kline = (
        db.query(func.count(func.distinct(StockKline.code))).scalar() or 0
    )

    total_data = total_quote_data + total_fundamental_data

    stocks_with_quote = (
        db.query(func.count(StockQuote.code))
        .filter(StockQuote.updated_at.isnot(None))
        .scalar()
        or 0
    )
    stocks_with_fundamental = db.query(func.count(StockF10Snapshot.code)).scalar() or 0

    return {
        "totalStocks": total_stocks,
        "totalData": total_data,
        "dataByType": {
            "quote": total_quote_data,
            "fundamental": total_fundamental_data,
            "stock_info": total_stock_info_data,
            "kline": total_kline_data,
        },
        "stocksByDataType": {
            "quote": stocks_with_quote,
            "fundamental": stocks_with_fundamental,
            "stock_info": total_stock_info_data,
            "kline": stocks_with_kline,
        },
        "quoteLastSync": _get_last_sync(StockQuote),
        "fundamentalLastSync": _get_last_sync(StockF10Snapshot),
        "klineLastSync": _get_last_sync(StockKline),
        "stockInfoLastSync": _get_last_sync(StockMeta),
    }


_FLASH_CATEGORIES = {
    "important": "重要",
    "a": "A股",
    "hk": "港股",
    "us": "美股",
    "abnormal": "异动",
    "notice": "公告",
}


@router.get("/flash-stats")
async def get_flash_stats(db: Session = Depends(get_db)):
    from routers.news_flash import _syncing_cats, _syncing_lock

    with _syncing_lock:
        syncing = set(_syncing_cats)

    rows = (
        db.query(
            NewsFlash.category,
            func.count(NewsFlash.id).label("count"),
            func.max(NewsFlash.ctime).label("latest_ctime"),
            func.max(NewsFlash.updated_at).label("last_sync"),
        )
        .group_by(NewsFlash.category)
        .all()
    )

    stats_map = {r.category: r for r in rows}
    result = []
    for key, label in _FLASH_CATEGORIES.items():
        r = stats_map.get(key)
        result.append(
            {
                "key": key,
                "label": label,
                "count": r.count if r else 0,
                "latestCtime": r.latest_ctime if r else None,
                "lastSync": r.last_sync.isoformat() if r and r.last_sync else None,
                "syncing": key in syncing,
            }
        )
    return result


@router.get("/failed-stocks")
async def get_failed_stocks():
    with _failed_stocks_lock:
        return {"failed": list(_failed_stocks.values())}


@router.post("/retry-failed")
async def retry_failed_stocks(codes: list[str] = None):
    from routers.industry import _sync_klines
    import threading

    def _retry():
        with _failed_stocks_lock:
            targets = []
            if codes:
                # 如果指定了代码列表，查找所有类型的失败记录
                for c in codes:
                    for key in _failed_stocks.keys():
                        if _failed_stocks[key]["code"] == c:
                            targets.append(_failed_stocks[key])
            else:
                # 重试所有失败记录
                targets = list(_failed_stocks.values())
        
        for item in targets:
            if not item:
                continue
            try:
                if item["syncType"] == "kline":
                    _sync_klines(item["code"], "daily")
                    with _failed_stocks_lock:
                        _failed_stocks.pop(f"kline:{item['code']}", None)
                    sched_log("success", f"重试成功: {item['code']} {item['name']}")
                elif item["syncType"] == "sw_kline":
                    # 重试申万板块K线
                    from routers.sw_industry import _fetch_sw_kline
                    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
                    from db import StockKline, SessionLocal
                    from datetime import datetime
                    
                    # 从名称中提取周期类型（如"通信设备(daily K)"）
                    period = "daily"
                    if "(weekly" in item["name"].lower():
                        period = "weekly"
                    elif "(monthly" in item["name"].lower():
                        period = "monthly"
                    
                    count = {"daily": 60, "weekly": 104, "monthly": 100}.get(period, 60)
                    bars = _fetch_sw_kline(item["code"], count, period)
                    
                    if bars:
                        db = SessionLocal()
                        try:
                            for bar in bars:
                                stmt = sqlite_insert(StockKline).values(
                                    code=item["code"],
                                    period=period,
                                    trade_date=bar["time"],
                                    open=bar["open"],
                                    high=bar["high"],
                                    low=bar["low"],
                                    close=bar["close"],
                                    volume=bar["volume"],
                                    turnover=0.0,
                                    turn_rate=0.0,
                                    change_pct=bar["changePct"],
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
                                        "change_pct": stmt.excluded.change_pct,
                                        "updated_at": stmt.excluded.updated_at,
                                    },
                                )
                                db.execute(stmt)
                            db.commit()
                            with _failed_stocks_lock:
                                _failed_stocks.pop(f"sw_kline:{item['code']}", None)
                            sched_log("success", f"重试成功: {item['code']} {item['name']}")
                        except Exception as db_err:
                            db.rollback()
                            sched_log("error", f"重试失败: {item['code']} - 数据库写入失败: {db_err}")
                        finally:
                            db.close()
                    else:
                        sched_log("error", f"重试失败: {item['code']} - 无法获取K线数据")
            except Exception as e:
                sched_log("error", f"重试失败: {item['code']} - {e}")

    threading.Thread(target=_retry, daemon=True).start()
    return {"status": "started"}


@router.delete("/failed-stocks")
async def clear_failed_stocks():
    with _failed_stocks_lock:
        _failed_stocks.clear()
    return {"status": "ok"}


@router.get("/scheduler-logs")
async def get_scheduler_logs(since: int = Query(0)):
    with _sched_logs_lock:
        # 若 since >= 当前最大 seq，说明前端 seq 比服务端新（服务重启过），返回全部日志
        if since >= _sched_log_seq and since > 0:
            logs = list(_sched_logs)
        else:
            logs = [e for e in _sched_logs if e["seq"] > since]
    return {"logs": logs, "latest_seq": _sched_log_seq}


# ---------------------------------------------------------------------------
# 任务状态中心（统一调度管理接口）
# ---------------------------------------------------------------------------

def _get_scheduler():
    """获取 main.py 中的 _scheduler 实例"""
    import main as _main
    return getattr(_main, "_scheduler", None)


@router.get("/task-status")
async def get_task_status():
    """返回所有定时任务的当前状态（调度时间 + 上次/下次运行时间）"""
    # 若内存尚未从 DB 预热，先做一次同步加载
    if not _task_last_run_loaded:
        _load_task_last_run_from_db()

    scheduler = _get_scheduler()
    if scheduler is None:
        return {"tasks": [], "error": "scheduler not found"}

    with _task_last_run_lock:
        last_run_snapshot = dict(_task_last_run)

    tasks = []
    for job in scheduler.get_jobs():
        next_run = job.next_run_time
        tasks.append({
            "id": job.id,
            "name": job.name or job.id,
            "nextRun": next_run.isoformat() if next_run else None,
            "trigger": str(job.trigger),
            "lastRun": last_run_snapshot.get(job.id),
        })
    return {"tasks": tasks}


@router.post("/trigger-task/{task_id}")
async def trigger_task(task_id: str, force: bool = Query(default=False)):
    """手动立即触发指定调度任务（通过 modify_job 将 next_run_time 设为 now）
    force=true 时对支持强制模式的任务（如 weekly_fundamental_sync）强制全量重新同步。"""
    scheduler = _get_scheduler()
    if scheduler is None:
        return {"status": "error", "message": "scheduler not found"}

    job = scheduler.get_job(task_id)
    if not job:
        known_ids = [j.id for j in scheduler.get_jobs()]
        return {
            "status": "error",
            "message": f"task '{task_id}' not found",
            "available": known_ids,
        }

    try:
        # 对 weekly_fundamental_sync 支持 force 模式
        if force and task_id == "weekly_fundamental_sync":
            import main as _main
            _main._f10_force_flag["force"] = True
            sched_log("info", "[task-trigger] 强制全量模式：weekly_fundamental_sync 将重新同步所有股票")

        from apscheduler.util import datetime_ceil
        job.modify(next_run_time=datetime.now())
        sched_log("info", f"[task-trigger] 手动触发任务: {task_id}" + (" (force)" if force else ""))
        return {"status": "triggered", "task_id": task_id, "force": force}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/stop-task/{task_id}")
async def stop_task(task_id: str):
    """暂停指定调度任务（pause_job）。注意：仅暂停下次调度，不中断已在运行的线程。"""
    scheduler = _get_scheduler()
    if scheduler is None:
        return {"status": "error", "message": "scheduler not found"}

    job = scheduler.get_job(task_id)
    if not job:
        return {"status": "error", "message": f"task '{task_id}' not found"}

    try:
        scheduler.pause_job(task_id)
        sched_log("info", f"[task-stop] 已暂停任务: {task_id}")
        return {"status": "paused", "task_id": task_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}
