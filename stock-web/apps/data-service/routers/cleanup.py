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
