from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import os
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
    market_breadth,
    market_flow,
    watchlist,
    margin_trading,
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
app.include_router(market_flow.router, prefix="/api/market-flow", tags=["市场资金流向"])
app.include_router(relation.router, prefix="/api/relation", tags=["股票关联"])
app.include_router(memo.router, prefix="/api/memo", tags=["备忘录"])
app.include_router(watchlist.router)
app.include_router(
    market_breadth.router, prefix="/api/market-breadth", tags=["市场情绪"]
)
app.include_router(
    margin_trading.router, prefix="/api/margin-trading", tags=["融资融券"]
)

_scheduler = BackgroundScheduler(timezone="Asia/Shanghai")

# F10 强制全量同步标志：被 trigger-task?force=true 设置，任务执行时消费后重置
_f10_force_flag = {"force": False}


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

    # 从数据库预热任务完成时间缓存（进程重启后恢复 lastRun 显示）
    from routers.system import _load_task_last_run_from_db

    _load_task_last_run_from_db()

    # 启动时后台异步同步全球指数 K 线（如果数据库中缺少数据）
    def _maybe_sync_global_klines():
        from db import SessionLocal, GlobalIndexKline

        db = SessionLocal()
        try:
            count = db.query(GlobalIndexKline).count()
        finally:
            db.close()
        if count < 100:  # 数据不足时触发全量同步
            print(
                f"[startup] global_index_kline has only {count} rows, triggering sync"
            )
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

    # 每天19:30同步股吧资讯与公告（从17:30移后，避免与daily_sync并发）
    _scheduler.add_job(
        guba.sync_all_guba,
        trigger="cron",
        hour=19,
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

    # 每天16:30收盘后同步大盘资金流向历史数据（AKShare stock_market_fund_flow 落库）
    _scheduler.add_job(
        market_flow.sync_market_daily_fund_flow,
        trigger="cron",
        hour=16,
        minute=30,
        id="market_daily_fund_flow_sync",
        replace_existing=True,
    )

    # 每个工作日15:32收盘后自动同步产业链股票当日5分钟K线数据入库（baostock，支持任意历史日期）
    def _auto_sync_minute():
        """收盘后批量同步产业链全部A股 + A股宽基指数当日分时数据，持续积累历史"""
        from db import SessionLocal
        from routers.industry import is_trading_day

        if not is_trading_day():
            return
        db = SessionLocal()
        try:
            from sqlalchemy import text as _text

            rows = db.execute(
                _text("""
                SELECT DISTINCT json_each.value as code
                FROM industry_node, json_each(industry_node.stocks)
                WHERE industry_node.stocks IS NOT NULL AND industry_node.stocks != '[]'
            """)
            ).fetchall()
            codes = [
                r[0]
                for r in rows
                if r[0]
                and (
                    r[0].startswith("0") or r[0].startswith("3") or r[0].startswith("6")
                )
                and len(r[0]) == 6
            ]
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
        hour=19,
        minute=5,
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

    # 每天17:00同步全球指数快照（复盘Tab展示的最新价/涨跌幅等）
    _scheduler.add_job(
        global_market.sync_global_indices,
        trigger="cron",
        hour=17,
        minute=0,
        id="global_index_snapshot_sync",
        replace_existing=True,
    )

    # 每天19:00同步概念板块行情（闭盘后接口稳定，错开daily_sync，避免并发）
    _scheduler.add_job(
        concept_board.sync_concept_boards,
        trigger="cron",
        hour=19,
        minute=0,
        id="concept_board_sync",
        replace_existing=True,
    )

    # 每天18:00增量同步K线（只同步今日未更新的股票，支持中断续传）
    def _daily_klines_incremental():
        """K线增量同步：查今日未更新的股票，依次同步，内部已有today跳过逻辑"""
        from db import SessionLocal
        from routers.industry import is_trading_day, _sync_klines
        from routers.system import sched_log
        from datetime import date as _date

        if not is_trading_day():
            return

        today_str = _date.today().strftime("%Y-%m-%d")
        db = SessionLocal()
        try:
            from sqlalchemy import text as _text
            from db import StockMeta as _SM

            already = {
                r[0]
                for r in db.execute(
                    _text(
                        "SELECT DISTINCT code FROM stock_kline WHERE period='daily' AND trade_date=:today"
                    ),
                    {"today": today_str},
                ).fetchall()
            }
            all_codes = [
                r.code for r in db.query(_SM).filter(_SM.market.in_(["SH", "SZ"])).all()
            ]
        finally:
            db.close()

        pending = [c for c in all_codes if c not in already]
        sched_log(
            "info",
            f"[K线增量] 待同步 {len(pending)}/{len(all_codes)} 只（今日已跳过 {len(already)} 只）",
        )

        for code in pending:
            try:
                _sync_klines(code, "daily")
            except Exception as e:
                print(f"[kline_incr] error {code}: {e}")
            import time as _t

            _t.sleep(0.1)

        sched_log("success", f"[K线增量] 完成，共同步 {len(pending)} 只")

    _scheduler.add_job(
        _daily_klines_incremental,
        trigger="cron",
        hour=18,
        minute=0,
        id="daily_klines_incremental",
        replace_existing=True,
    )

    # 每周日凌晨02:00同步F10财务数据（低频，财报季同步30天内未更新，非财报季只补缺失）
    # force_sync=True 时忽略已有数据，强制全量重新同步（用于二季报等手动补数据）
    _F10_CURSOR_FILE = os.path.join(os.path.dirname(__file__), "f10_sync_cursor.json")

    def _save_f10_cursor(mode: str, codes: list, done: int):
        """保存 F10 同步断点游标"""
        import json as _json

        try:
            with open(_F10_CURSOR_FILE, "w", encoding="utf-8") as f:
                _json.dump({"mode": mode, "codes": codes, "done": done}, f)
        except Exception as e:
            print(f"[weekly_f10] 游标保存失败: {e}")

    def _load_f10_cursor(mode: str):
        """加载 F10 同步断点游标，mode 匹配才返回 (codes, start_index)，否则返回 None"""
        import json as _json

        try:
            if not os.path.exists(_F10_CURSOR_FILE):
                return None
            with open(_F10_CURSOR_FILE, "r", encoding="utf-8") as f:
                cursor = _json.load(f)
            if cursor.get("mode") == mode and isinstance(cursor.get("codes"), list):
                done = cursor.get("done", 0)
                codes = cursor["codes"]
                if 0 <= done < len(codes):
                    return codes, done
        except Exception as e:
            print(f"[weekly_f10] 游标加载失败: {e}")
        return None

    def _clear_f10_cursor():
        try:
            if os.path.exists(_F10_CURSOR_FILE):
                os.remove(_F10_CURSOR_FILE)
        except Exception:
            pass

    def _is_reporting_season() -> bool:
        """财报密集披露期：1-4月（年报/一季报）、8月（半年报）、10-11月（三季报）"""
        from datetime import date as _date

        return _date.today().month in (1, 2, 3, 4, 8, 10, 11)

    def _finance_tab_ready_codes(db, updated_after=None):
        from db import (
            StockF10BusinessAnalysis,
            StockF10FinancialHistory,
            StockF10Snapshot,
        )

        snapshot_rows = db.query(
            StockF10Snapshot.code, StockF10Snapshot.updated_at
        ).all()
        business_rows = db.query(
            StockF10BusinessAnalysis.code,
            StockF10BusinessAnalysis.updated_at,
            StockF10BusinessAnalysis.main_business_breakdown,
        ).all()
        history_rows = db.query(
            StockF10FinancialHistory.code,
            StockF10FinancialHistory.updated_at,
        ).all()

        snapshot_codes = {
            row.code
            for row in snapshot_rows
            if row.code
            and (
                updated_after is None
                or (row.updated_at and row.updated_at >= updated_after)
            )
        }
        business_codes = {
            row.code
            for row in business_rows
            if row.code
            and row.main_business_breakdown
            and row.main_business_breakdown.strip()
            and (
                updated_after is None
                or (row.updated_at and row.updated_at >= updated_after)
            )
        }
        history_codes = {
            row.code
            for row in history_rows
            if row.code
            and (
                updated_after is None
                or (row.updated_at and row.updated_at >= updated_after)
            )
        }

        return {
            "snapshot": snapshot_codes,
            "business": business_codes,
            "history": history_codes,
            "complete": snapshot_codes & business_codes & history_codes,
        }

    def _weekly_fundamental_sync(force: bool = False):
        """每周日低频同步F10财务数据，支持断点续传。
        force=True 时强制全量重新同步所有股票（忽略已有数据，用于手动补二季报等）"""
        from db import SessionLocal
        from routers.system import sched_log
        from routers.fundamental import _scrape_f10_full, _upsert_f10_full
        from datetime import date as _date, datetime as _dt, timedelta as _td

        # 检查是否被 trigger-task?force=true 设置了强制标志
        _force = force or _f10_force_flag.get("force", False)
        _f10_force_flag["force"] = False  # 消费后重置

        reporting = _is_reporting_season()
        # 游标 mode 区分强制全量 vs 财报季 vs 普通，避免模式切换后错误续传
        cursor_mode = "force" if _force else ("reporting" if reporting else "normal")

        # 尝试加载断点游标
        resumed = _load_f10_cursor(cursor_mode)
        if resumed:
            codes, start_index = resumed
            sched_log(
                "info",
                f"[weekly_f10] 断点续传（{cursor_mode}）：从第 {start_index + 1}/{len(codes)} 只继续",
            )
        else:
            # 无游标，重新计算待同步列表
            if _force:
                sched_log(
                    "info", "[weekly_f10] 强制全量模式：忽略已有数据，重新同步所有股票"
                )
            else:
                sched_log(
                    "info",
                    f"[weekly_f10] 开始，当前{'财报季' if reporting else '非财报季'}",
                )

            db = SessionLocal()
            try:
                from db import StockMeta as _SM

                all_codes = [r.code for r in db.query(_SM.code).all()]

                if _force:
                    already = set()
                    sched_log(
                        "info",
                        f"[weekly_f10] 强制全量：共 {len(all_codes)} 只股票待同步",
                    )
                elif reporting:
                    threshold = _dt.utcnow() - _td(days=30)
                    coverage = _finance_tab_ready_codes(db, threshold)
                    already = coverage["complete"]
                    sched_log(
                        "info",
                        "[weekly_f10] 财报季："
                        f"快照近30天{len(coverage['snapshot'])}只，"
                        f"主营构成近30天{len(coverage['business'])}只，"
                        f"财报历史近30天{len(coverage['history'])}只，"
                        f"财务Tab完整近30天{len(already)}只，待同步{len(all_codes) - len(already)}只",
                    )
                else:
                    coverage = _finance_tab_ready_codes(db)
                    already = coverage["complete"]
                    sched_log(
                        "info",
                        "[weekly_f10] 非财报季："
                        f"快照完整{len(coverage['snapshot'])}只，"
                        f"主营构成完整{len(coverage['business'])}只，"
                        f"财报历史完整{len(coverage['history'])}只，"
                        f"财务Tab完整{len(already)}只，仅补缺失{len(all_codes) - len(already)}只",
                    )
            finally:
                db.close()

            codes = [c for c in all_codes if c not in already]
            start_index = 0

        if not codes:
            sched_log("info", "[weekly_f10] 无需同步，跳过")
            _clear_f10_cursor()
            return

        total = len(codes)
        succeeded = 0
        failed = 0
        try:
            for i in range(start_index, total):
                code = codes[i]
                pct = round((i + 1) / total * 100) if total else 0
                try:
                    data = _scrape_f10_full(code)
                    _upsert_f10_full(code, data)
                    succeeded += 1
                    sched_log(
                        "info",
                        f"[F10] {i + 1}/{total} ({pct}%) - {code} 同步完成",
                        source="scheduler",
                    )
                except Exception as e:
                    failed += 1
                    sched_log(
                        "error",
                        f"[F10] {i + 1}/{total} ({pct}%) - {code} 失败: {e}",
                        source="scheduler",
                    )
                # 每10只保存一次游标
                if (i + 1) % 10 == 0:
                    _save_f10_cursor(cursor_mode, codes, i + 1)
                import time as _t

                _t.sleep(0.5)
        except Exception as e:
            # 意外中断时保存当前进度
            _save_f10_cursor(cursor_mode, codes, i)
            sched_log(
                "error",
                f"[weekly_f10] 中断于第 {i + 1}/{total} 只，游标已保存，重启后可续传",
                source="scheduler",
            )
            raise

        _clear_f10_cursor()
        sched_log(
            "success",
            f"[weekly_f10] 完成，共同步 {total} 只（成功 {succeeded}，失败 {failed}）",
        )

    _scheduler.add_job(
        _weekly_fundamental_sync,
        trigger="cron",
        day_of_week="sun",
        hour=2,
        minute=0,
        id="weekly_fundamental_sync",
        replace_existing=True,
    )

    # 每个交易日 15:35 收盘后同步市场情绪（涨跌家数/涨跌停家数）
    def _auto_sync_market_breadth():
        from routers.industry import is_trading_day

        if not is_trading_day():
            return
        from routers.market_breadth import sync_market_breadth

        result = sync_market_breadth()
        print(f"[market_breadth] 定时同步完成: {result}")

    _scheduler.add_job(
        _auto_sync_market_breadth,
        trigger="cron",
        hour=15,
        minute=35,
        id="market_breadth_daily_sync",
        replace_existing=True,
    )

    # 每天18:00同步融资融券数据（收盘后数据更新完毕）
    _scheduler.add_job(
        margin_trading.sync_margin_trading,
        trigger="cron",
        hour=18,
        minute=0,
        id="margin_trading_daily_sync",
        replace_existing=True,
    )

    # 每6小时执行一次 WAL checkpoint，防止 WAL 文件无限膨胀
    _scheduler.add_job(
        cleanup.wal_checkpoint,
        trigger="interval",
        hours=6,
        start_date=_t0 + timedelta(minutes=10),
        id="wal_checkpoint",
        replace_existing=True,
    )

    _scheduler.start()

    # 监听任务完成事件，记录每个任务的上次完成时间
    from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR
    from routers.system import record_task_last_run

    def _on_job_done(event):
        record_task_last_run(event.job_id)

    _scheduler.add_listener(_on_job_done, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)

    # -----------------------------------------------------------------------
    # 统一补跑机制：进程重启后检查所有「有状态」任务，若上一次应执行时的数据缺失，
    # 则在后台线程里按顺序补跑，保证数据不因关机/重启而永久丢失。
    #
    # 补跑规则（CATCHUP_RULES）字段说明：
    #   task_id          — APScheduler 任务 ID
    #   max_gap_days     — 上次完成距今超过多少天触发补跑（基于 task_last_run 表）
    #                      日频：3（周五→周一最多差3天）；周频：9
    #   fn               — 实际执行的补跑函数（与调度器注册的函数相同）
    #   desc             — 日志描述
    #   trading_day_only — True：今天若非交易日则跳过（但不更新 lastRun，下次交易日启动再跑）
    #                      False：无论什么日期都执行（如 F10、概念板块等）
    #
    # 不在列表中的任务（news_flash / theme_news / daily_cleanup / wal_checkpoint）
    # 属于幂等/高频，不需要补跑。
    # -----------------------------------------------------------------------

    CATCHUP_RULES = [
        # ---- 日频任务，仅交易日补跑 ----
        dict(
            task_id="daily_sync",
            max_gap_days=3,
            trading_day_only=True,
            fn=lambda: industry.sync_all_data(),
            desc="每日全量行情",
        ),
        dict(
            task_id="daily_klines_incremental",
            max_gap_days=3,
            trading_day_only=True,
            fn=lambda: _daily_klines_incremental(),
            desc="K线增量同步",
        ),
        dict(
            task_id="fund_flow_snapshot",
            max_gap_days=3,
            trading_day_only=True,
            fn=lambda: fund_flow.take_daily_snapshot(),
            desc="资金流向快照",
        ),
        dict(
            task_id="market_daily_fund_flow_sync",
            max_gap_days=3,
            trading_day_only=True,
            fn=lambda: market_flow.sync_market_daily_fund_flow(),
            desc="大盘资金流向历史",
        ),
        dict(
            task_id="market_breadth_daily_sync",
            max_gap_days=3,
            trading_day_only=True,
            fn=lambda: _auto_sync_market_breadth(),
            desc="涨跌统计",
        ),
        dict(
            task_id="minute_daily_sync",
            max_gap_days=3,
            trading_day_only=True,
            fn=lambda: _auto_sync_minute(),
            desc="产业链分时数据",
        ),
        dict(
            task_id="indices_minute_daily_sync",
            max_gap_days=3,
            trading_day_only=True,
            fn=lambda: _auto_sync_indices_minute(),
            desc="宽基指数分时",
        ),
        dict(
            task_id="guba_daily_sync",
            max_gap_days=3,
            trading_day_only=True,
            fn=lambda: guba.sync_all_guba(),
            desc="股吧资讯",
        ),
        # ---- 日频任务，不受交易日限制 ----
        dict(
            task_id="global_index_snapshot_sync",
            max_gap_days=3,
            trading_day_only=False,
            fn=lambda: global_market.sync_global_indices(),
            desc="全球指数快照",
        ),
        dict(
            task_id="global_index_kline_sync",
            max_gap_days=3,
            trading_day_only=False,
            fn=lambda: global_market.sync_all_review_index_klines(),
            desc="全球指数K线",
        ),
        dict(
            task_id="concept_board_sync",
            max_gap_days=3,
            trading_day_only=False,
            fn=lambda: concept_board.sync_concept_boards(),
            desc="概念板块行情",
        ),
        dict(
            task_id="margin_trading_daily_sync",
            max_gap_days=3,
            trading_day_only=True,
            fn=lambda: margin_trading.sync_margin_trading(),
            desc="融资融券数据",
        ),
        # ---- 周频任务 ----
        dict(
            task_id="weekly_fundamental_sync",
            max_gap_days=9,
            trading_day_only=False,
            fn=lambda: _weekly_fundamental_sync(),
            desc="F10财务数据",
        ),
    ]

    def _run_catchup_checks():
        """启动后在后台线程里顺序检查所有 A 类任务，缺了就补。"""
        from routers.industry import is_trading_day as _is_trading_day
        from routers.system import (
            get_task_last_run_dt,
            sched_log,
            record_task_last_run as _record,
        )
        import time as _time

        today_is_trading = _is_trading_day()

        sched_log(
            "info",
            f"[catchup] 开始检查所有任务是否需要补跑（今日{'交易日' if today_is_trading else '非交易日'}）",
        )
        for rule in CATCHUP_RULES:
            task_id = rule["task_id"]
            max_days = rule["max_gap_days"]
            fn = rule["fn"]
            desc = rule["desc"]
            trading_day_only = rule["trading_day_only"]
            try:
                # 非交易日且该任务仅限交易日执行：直接跳过，不更新 lastRun
                if trading_day_only and not today_is_trading:
                    sched_log(
                        "info", f"[catchup] {desc}（{task_id}）今日非交易日，跳过"
                    )
                    continue

                last_dt = get_task_last_run_dt(task_id)
                if last_dt is None:
                    sched_log(
                        "info", f"[catchup] {desc}（{task_id}）从未执行，立即补跑"
                    )
                    need = True
                else:
                    gap = (datetime.utcnow() - last_dt).total_seconds() / 86400
                    if gap >= max_days:
                        sched_log(
                            "info",
                            f"[catchup] {desc}（{task_id}）上次 {last_dt.strftime('%m-%d %H:%M')} UTC，距今 {gap:.1f} 天，补跑",
                        )
                        need = True
                    else:
                        sched_log(
                            "info",
                            f"[catchup] {desc}（{task_id}）距今 {gap:.1f} 天，无需补跑",
                        )
                        need = False

                if need:
                    fn()
                    _record(task_id)  # 补跑完成，更新持久化 lastRun
                    sched_log("success", f"[catchup] {desc}（{task_id}）补跑完成")

            except Exception as e:
                sched_log("warn", f"[catchup] {desc}（{task_id}）补跑失败: {e}")

            _time.sleep(0.5)  # 任务间短暂间隔，避免并发冲击

        sched_log("info", "[catchup] 全部检查完毕")

    threading.Thread(target=_run_catchup_checks, daemon=True).start()

    # 检查是否在生产环境中启用自动同步
    # 可以通过环境变量 AUTO_SYNC_ON_STARTUP=false 来禁用
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
