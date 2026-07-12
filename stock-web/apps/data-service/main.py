from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from routers import (
    quote,
    kline,
    minute,
    fundamental,
    news,
    industry,
    sync,
    system,
    global_market,
    news_flash,
    concept_board,
    theme,
    portfolio,
    sw_industry,
    cleanup,
    guba,
    fund_flow,
    relation,
    memo,
)
import akshare as ak
from fastapi import HTTPException
from db import init_db
from datetime import datetime, time as dtime, timedelta
import threading
from apscheduler.schedulers.background import BackgroundScheduler

app = FastAPI(title="股策AI 数据服务", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "null"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(quote.router, prefix="/api/quote", tags=["行情"])
app.include_router(kline.router, prefix="/api/kline", tags=["K线"])
app.include_router(minute.router, prefix="/api/minute", tags=["分时"])
app.include_router(fundamental.router, prefix="/api/fundamental", tags=["基本面"])
app.include_router(news.router, prefix="/api/news", tags=["新闻"])
app.include_router(industry.router, prefix="/api/industry", tags=["产业链"])
app.include_router(sync.router, prefix="/api/sync", tags=["数据同步"])
app.include_router(system.router, prefix="/api/system", tags=["系统监控"])
app.include_router(global_market.router, prefix="/api/global", tags=["全球市场"])
app.include_router(news_flash.router, prefix="/api/flash", tags=["快讯"])
app.include_router(concept_board.router, prefix="/api/board", tags=["概念板块"])
app.include_router(theme.router, prefix="/api/theme", tags=["主题板块"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["持仓管理"])
app.include_router(sw_industry.router, prefix="/api/sw-industry", tags=["申万行业"])
app.include_router(cleanup.router, prefix="/api/cleanup", tags=["数据清理"])
app.include_router(guba.router, prefix="/api/guba", tags=["股吧资讯"])
app.include_router(fund_flow.router, prefix="/api/fund-flow", tags=["资金流向"])
app.include_router(relation.router, prefix="/api/relation", tags=["股票关联"])
app.include_router(memo.router, prefix="/api/memo", tags=["备忘录"])

_scheduler = BackgroundScheduler(timezone="Asia/Shanghai")


def _warmup_caches():
    from routers.industry import (
        _fetch_industry_quotes,
        _industry_list_cache,
        _industry_stocks_cache,
        _industry_map_cache,
        _INDUSTRY_LIST_TTL,
        _INDUSTRY_STOCKS_TTL,
        _INDUSTRY_MAP_TTL,
    )
    from db import SessionLocal, IndustryList, IndustryNode
    import json, time

    print("[warmup] pre-warming caches...")
    try:
        db = SessionLocal()
        try:
            rows = db.query(IndustryList).order_by(IndustryList.sort_order).all()
            list_data = {
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
            _industry_list_cache["ts"] = time.time()
            _industry_list_cache["data"] = list_data

            nodes = db.query(IndustryNode).filter(IndustryNode.stocks != "[]").all()
            stock_to_industries: dict = {}
            for node in nodes:
                for code in json.loads(node.stocks or "[]"):
                    stock_to_industries.setdefault(code, [])
                    if node.industry_id not in stock_to_industries[code]:
                        stock_to_industries[code].append(node.industry_id)
            map_data = {"mapping": stock_to_industries}
            _industry_map_cache["ts"] = time.time()
            _industry_map_cache["data"] = map_data
        finally:
            db.close()

        stocks_data = _fetch_industry_quotes("")
        _industry_stocks_cache["ts"] = time.time()
        _industry_stocks_cache["data"] = stocks_data
        print("[warmup] done")
    except Exception as e:
        print(f"[warmup] error: {e}")


def _init_popular_stock_cache_table():
    """建立人气榜缓存表（如不存在）"""
    import sqlite3, os
    db_path = os.path.join(os.path.dirname(__file__), "stock_data.db")
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS popular_stock_cache (
                sort       TEXT    NOT NULL,
                rank       INTEGER NOT NULL,
                code       TEXT    NOT NULL,
                name       TEXT,
                price      REAL,
                pct        REAL,
                change     REAL,
                prev_close REAL,
                his_rc     INTEGER,
                updated_at TEXT    NOT NULL,
                PRIMARY KEY (sort, rank)
            )
        """)
        conn.commit()
        conn.close()
        print("[startup] popular_stock_cache table ready")
    except Exception as e:
        print(f"[startup] popular_stock_cache table error: {e}")


@app.on_event("startup")
def startup():
    init_db()
    _init_popular_stock_cache_table()
    industry.seed_company_chains()

    threading.Thread(target=_warmup_caches, daemon=True).start()

    # 启动时后台异步同步全球指数 K 线（如果数据库中缺少数据）
    def _maybe_sync_global_klines():
        from db import SessionLocal, GlobalIndexKline
        db = SessionLocal()
        try:
            count = db.query(GlobalIndexKline).count()
        finally:
            db.close()
        if count < 100:  # 数据不足时触发全量同步
            print(f"[startup] global_index_kline has only {count} rows, triggering sync")
            global_market.sync_all_review_index_klines()
        else:
            print(f"[startup] global_index_kline has {count} rows, skip sync")
    threading.Thread(target=_maybe_sync_global_klines, daemon=True).start()

    _scheduler.add_job(
        industry.sync_all_data,
        trigger="cron",
        hour=17,
        minute=30,
        id="daily_sync",
        replace_existing=True,
    )

    _t0 = datetime.now()
    _scheduler.add_job(
        news_flash.sync_news_flash,
        trigger="interval",
        minutes=3,
        start_date=_t0 + timedelta(seconds=10),
        id="news_flash_sync",
        replace_existing=True,
    )

    # 每天凌晨3点执行数据清理任务
    _scheduler.add_job(
        cleanup.run_cleanup,
        trigger="cron",
        hour=3,
        minute=0,
        id="daily_cleanup",
        replace_existing=True,
    )

    # 每15分钟同步板块/主题新闻
    _scheduler.add_job(
        theme.sync_theme_news,
        trigger="interval",
        minutes=15,
        start_date=_t0 + timedelta(seconds=30),
        id="theme_news_sync",
        replace_existing=True,
    )

    # 每天17:30同步股吧资讯与公告
    _scheduler.add_job(
        guba.sync_all_guba,
        trigger="cron",
        hour=17,
        minute=30,
        id="guba_daily_sync",
        replace_existing=True,
    )

    # 每天16:00收盘后快照板块资金流向
    _scheduler.add_job(
        fund_flow.take_daily_snapshot,
        trigger="cron",
        hour=16,
        minute=0,
        id="fund_flow_snapshot",
        replace_existing=True,
    )

    # 每个工作日15:32收盘后自动同步产业链股票当日5分钟K线数据入库（baostock，支持任意历史日期）
    def _auto_sync_minute():
        """收盘后批量同步产业链全部A股 + A股宽基指数当日分时数据，持续积累历史"""
        from routers.industry import is_trading_day
        if not is_trading_day():
            return
        db = SessionLocal()
        try:
            from sqlalchemy import text as _text
            rows = db.execute(_text("""
                SELECT DISTINCT json_each.value as code
                FROM industry_node, json_each(industry_node.stocks)
                WHERE industry_node.stocks IS NOT NULL AND industry_node.stocks != '[]'
            """)).fetchall()
            codes = [r[0] for r in rows if r[0] and (
                r[0].startswith("0") or r[0].startswith("3") or r[0].startswith("6")
            ) and len(r[0]) == 6]
        except Exception:
            codes = []
        finally:
            db.close()

        # 追加 A 股宽基指数（复盘Tab展示，支持双击分时）
        CN_INDICES = ["000001", "399006", "000016", "000300", "000680", "000047"]
        for idx_code in CN_INDICES:
            if idx_code not in codes:
                codes.append(idx_code)

        if not codes:
            print("[minute_sync] 未找到产业链A股，跳过")
            return
        print(f"[minute_sync] 开始同步 {len(codes)} 只产业链A股+宽基指数的当日分时数据")
        from routers.minute import _fetch_one_code, _get_latest_trade_date
        import time as _t
        trade_date = _get_latest_trade_date()
        ok, cached, skip, error = 0, 0, 0, 0
        for code in codes:
            result = _fetch_one_code(code, trade_date)
            s = result.get("status", "error")
            if s == "ok":
                ok += 1
            elif s == "cached":
                cached += 1
            elif s == "skip":
                skip += 1
            else:
                error += 1
            _t.sleep(0.2)  # 避免触发东方财富限频
        print(f"[minute_sync] 完成: ok={ok} cached={cached} skip={skip} error={error}")

    _scheduler.add_job(
        _auto_sync_minute,
        trigger="cron",
        hour=17,
        minute=30,
        id="minute_daily_sync",
        replace_existing=True,
    )

    # 每个工作日15:35收盘后快速同步 A 股宽基指数分时数据（6只，约2分钟完成）
    def _auto_sync_indices_minute():
        from routers.industry import is_trading_day
        if not is_trading_day():
            return
        from routers.minute import _run_indices_sync, _get_latest_trade_date
        trade_date = _get_latest_trade_date()
        print(f"[indices_minute_sync] 同步 A 股宽基指数分时 {trade_date}")
        _run_indices_sync(trade_date)

    _scheduler.add_job(
        _auto_sync_indices_minute,
        trigger="cron",
        hour=15,
        minute=35,
        id="indices_minute_daily_sync",
        replace_existing=True,
    )

    # 每天18:00同步全球指数 K 线（收盘后港股/美股/日韩等已更新当日数据）
    _scheduler.add_job(
        global_market.sync_all_review_index_klines,
        trigger="cron",
        hour=18,
        minute=0,
        id="global_index_kline_sync",
        replace_existing=True,
    )

    _scheduler.start()

    # 检查是否在生产环境中启用自动同步
    # 可以通过环境变量 AUTO_SYNC_ON_STARTUP=false 来禁用
    import os

    auto_sync = os.getenv("AUTO_SYNC_ON_STARTUP", "true").lower() == "true"

    if not auto_sync:
        print("[startup] AUTO_SYNC_ON_STARTUP=false, skipping startup sync")
        return

    from routers.industry import is_trading_day
    if not is_trading_day():
        print("[startup] non-trading day — skipping startup sync")
        return

    now = datetime.now().time()
    if now >= dtime(17, 30):
        print("[startup] after 17:30 — triggering immediate full sync")
        from routers.sync import _run_full_sync, _status, _lock

        with _lock:
            if not _status["running"]:
                threading.Thread(target=_run_full_sync, daemon=True).start()
            else:
                print("[startup] sync already running, skipping startup sync")
    elif now >= dtime(15, 0):
        print(f"[startup] {now.strftime('%H:%M')} — market closed, syncing quotes only")
        threading.Thread(target=industry._sync_all_quotes, daemon=True).start()
    else:
        print(f"[startup] {now.strftime('%H:%M')} — before market close, skipping sync")


@app.on_event("shutdown")
def shutdown():
    _scheduler.shutdown(wait=False)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/search")
async def search(
    q: str = Query("", description="股票代码或名称关键词"), limit: int = Query(10)
):
    kw = q.strip()
    if not kw:
        return {"results": []}
    try:
        from db import SessionLocal, StockMeta, StockQuote
        from sqlalchemy import or_

        db = SessionLocal()
        try:
            # 拉取足够多候选，再在 Python 层排序
            rows = (
                db.query(StockMeta.code, StockMeta.name)
                .filter(
                    or_(
                        StockMeta.code.contains(kw),
                        StockMeta.name.contains(kw),
                    )
                )
                .limit(200)
                .all()
            )

            kw_lower = kw.lower()

            def _rank(r):
                code_lower = r.code.lower()
                name = r.name
                # 0: 代码完全匹配
                if code_lower == kw_lower:
                    return 0
                # 1: 代码前缀匹配
                if code_lower.startswith(kw_lower):
                    return 1
                # 2: 代码包含匹配
                if kw_lower in code_lower:
                    return 2
                # 3: 名称前缀匹配
                if name.startswith(kw):
                    return 3
                # 4: 名称包含匹配
                return 4

            rows_sorted = sorted(rows, key=_rank)[:limit]

            codes = [r.code for r in rows_sorted]
            quotes = {
                qr.code: qr
                for qr in db.query(StockQuote).filter(StockQuote.code.in_(codes)).all()
            }
            return {
                "results": [
                    {
                        "code": r.code,
                        "name": r.name,
                        "price": quotes[r.code].price if r.code in quotes else 0,
                        "change": quotes[r.code].change if r.code in quotes else 0,
                    }
                    for r in rows_sorted
                ]
            }
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
