"""
数据清理任务 - 防止数据库无限增长
"""

from fastapi import APIRouter
from datetime import datetime, timedelta
from db import SessionLocal, NewsFlash, StockKline
from sqlalchemy import text

router = APIRouter()


def cleanup_old_news_flash(days: int = 30) -> int:
    """清理超过指定天数的快讯数据"""
    db = SessionLocal()
    try:
        cutoff_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        result = db.query(NewsFlash).filter(NewsFlash.ctime < cutoff_date).delete()
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        print(f"[cleanup] news_flash failed: {e}")
        return 0
    finally:
        db.close()


def cleanup_old_klines(days: int = 400) -> int:
    """
    清理超过指定天数的K线数据
    保留每只股票最近400天的日K数据即可
    """
    db = SessionLocal()
    try:
        # 对每只股票，只保留最近N天的日K数据
        cutoff_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        # 获取所有股票代码
        codes = db.query(StockKline.code).distinct().all()
        deleted = 0

        for (code,) in codes:
            # 删除该股票超过天数的K线
            result = (
                db.query(StockKline)
                .filter(
                    StockKline.code == code,
                    StockKline.period == "daily",
                    StockKline.trade_date < cutoff_date,
                )
                .delete()
            )
            deleted += result

        db.commit()
        return deleted
    except Exception as e:
        db.rollback()
        print(f"[cleanup] klines failed: {e}")
        return 0
    finally:
        db.close()


def vacuum_database():
    """执行VACUUM回收数据库空间"""
    db = SessionLocal()
    try:
        db.execute(text("VACUUM"))
        db.commit()
        print("[cleanup] VACUUM completed")
    except Exception as e:
        print(f"[cleanup] VACUUM failed: {e}")
    finally:
        db.close()


def wal_checkpoint():
    """强制执行 WAL checkpoint，将 WAL 文件合并回主数据库，防止 WAL 文件无限膨胀"""
    import sqlite3, os
    db_path = os.path.join(os.path.dirname(__file__), "..", "stock_data.db")
    db_path = os.path.abspath(db_path)
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        # TRUNCATE 模式：checkpoint 后截断 WAL 文件为 0 字节（最彻底）
        result = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        conn.close()
        # result = (busy, log, checkpointed)
        print(f"[checkpoint] WAL checkpoint done: busy={result[0]}, log={result[1]}, checkpointed={result[2]}")
        return result
    except Exception as e:
        print(f"[checkpoint] WAL checkpoint failed: {e}")
        return None


def backup_database():
    """用 SQLite online backup API 热备份数据库（不影响正在运行的服务）"""
    import sqlite3, os, shutil
    from datetime import date
    db_path = os.path.join(os.path.dirname(__file__), "..", "stock_data.db")
    db_path = os.path.abspath(db_path)
    backup_dir = os.path.join(os.path.dirname(db_path), "backups")
    os.makedirs(backup_dir, exist_ok=True)

    today = date.today().strftime("%Y%m%d")
    backup_path = os.path.join(backup_dir, f"stock_data_{today}.db")

    # 已有今日备份则跳过
    if os.path.exists(backup_path):
        print(f"[backup] today's backup already exists: {backup_path}")
        return backup_path

    try:
        src = sqlite3.connect(db_path, timeout=30)
        dst = sqlite3.connect(backup_path)
        src.backup(dst, pages=500)  # 每批500页，边备份边让其他写操作进行
        dst.close()
        src.close()
        size_mb = os.path.getsize(backup_path) / 1024 / 1024
        print(f"[backup] backup done: {backup_path} ({size_mb:.1f}MB)")

        # 只保留最近7天备份，删除更旧的
        for f in sorted(os.listdir(backup_dir)):
            if f.startswith("stock_data_") and f.endswith(".db"):
                fpath = os.path.join(backup_dir, f)
                fdate = f.replace("stock_data_", "").replace(".db", "")
                if fdate < (date.today().strftime("%Y%m%d")):
                    # 保留最近7个
                    pass  # 下面统一处理
        backups = sorted([
            f for f in os.listdir(backup_dir)
            if f.startswith("stock_data_") and f.endswith(".db")
        ])
        for old in backups[:-7]:
            os.remove(os.path.join(backup_dir, old))
            print(f"[backup] removed old backup: {old}")

        return backup_path
    except Exception as e:
        print(f"[backup] backup failed: {e}")
        return None


def run_cleanup():
    """执行完整的清理流程"""
    from routers.system import sched_log

    print("[cleanup] Starting cleanup task...")

    # 清理30天前的快讯
    news_deleted = cleanup_old_news_flash(days=30)
    if news_deleted > 0:
        sched_log("info", f"清理了 {news_deleted} 条30天前的快讯数据", source="cleanup")

    # 清理400天前的K线数据
    kline_deleted = cleanup_old_klines(days=400)
    if kline_deleted > 0:
        sched_log(
            "info", f"清理了 {kline_deleted} 条400天前的K线数据", source="cleanup"
        )

    # 执行VACUUM回收空间
    if news_deleted > 0 or kline_deleted > 0:
        vacuum_database()
        sched_log("success", "数据清理完成，已回收磁盘空间", source="cleanup")

    print(f"[cleanup] Cleanup completed: news={news_deleted}, kline={kline_deleted}")

    # WAL checkpoint：将 WAL 文件合并回主数据库，防止膨胀
    wal_checkpoint()

    # 热备份数据库（每天一次，已备份今天则跳过）
    backup_database()
    sched_log("success", "WAL checkpoint 与数据库备份完成", source="cleanup")


@router.post("/trigger")
def trigger_cleanup():
    """手动触发清理任务"""
    import threading

    threading.Thread(target=run_cleanup, daemon=True).start()
    return {"message": "cleanup task started"}


@router.get("/stats")
def get_cleanup_stats():
    """获取可清理的数据统计"""
    db = SessionLocal()
    try:
        from datetime import datetime, timedelta

        cutoff_30d = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        cutoff_400d = (datetime.now() - timedelta(days=400)).strftime("%Y-%m-%d")

        old_news = db.query(NewsFlash).filter(NewsFlash.ctime < cutoff_30d).count()
        old_klines = (
            db.query(StockKline)
            .filter(StockKline.period == "daily", StockKline.trade_date < cutoff_400d)
            .count()
        )

        return {
            "oldNewsCount": old_news,
            "oldKlineCount": old_klines,
            "newsCutoffDays": 30,
            "klineCutoffDays": 400,
        }
    finally:
        db.close()
