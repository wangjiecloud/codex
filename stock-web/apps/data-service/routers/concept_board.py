from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime
import threading
import time
import requests

from db import get_db, SessionLocal, ConceptBoard

router = APIRouter()

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.eastmoney.com/",
}

_sync_lock = threading.Lock()
_is_syncing = False


def _safe_float(val, default: float = 0.0) -> float:
    try:
        v = float(str(val).replace(",", "").strip())
        return v if v == v else default
    except Exception:
        return default


def _is_a_share(code: str) -> bool:
    if not code or len(code) != 6:
        return False
    if code.startswith("0") or code.startswith("3"):
        return True
    if code.startswith("6") or code.startswith("688"):
        return True
    return False


def sync_concept_boards() -> int:
    global _is_syncing
    with _sync_lock:
        if _is_syncing:
            return 0
        _is_syncing = True

    try:
        url = (
            "https://push2.eastmoney.com/api/qt/clist/get"
            "?pn=1&pz=100&po=1&np=1&ut=&fltt=2&invt=2&fid=f3"
            "&fs=m:90+t:3"
            "&fields=f1,f2,f3,f4,f5,f6,f7,f8,f10,f12,f14,f20,f21,f128,f136,f140,f141,f207,f208,f209,f222"
        )
        items = []
        for attempt in range(3):
            try:
                r = requests.get(url, headers=_HEADERS, timeout=15)
                items = r.json().get("data", {}).get("diff", [])
                if items:
                    break
            except Exception:
                if attempt < 2:
                    time.sleep(2)
                else:
                    raise
        if not items:
            return 0

        db = SessionLocal()
        retry_count = 3
        for db_attempt in range(retry_count):
            try:
                count = 0
                for it in items:
                    code = str(it.get("f12", "")).strip()
                    if not code:
                        continue
                    stmt = sqlite_insert(ConceptBoard).values(
                        code=code,
                        name=str(it.get("f14", "")),
                        change_pct=round(_safe_float(it.get("f3")), 4),
                        change_amt=round(_safe_float(it.get("f4")), 4),
                        price=round(_safe_float(it.get("f2")), 4),
                        volume=_safe_float(it.get("f5")),
                        turnover=_safe_float(it.get("f6")),
                        rise_count=int(_safe_float(it.get("f207", 0))),
                        fall_count=int(_safe_float(it.get("f208", 0))),
                        lead_stock=str(it.get("f128", "")),
                        lead_stock_pct=round(_safe_float(it.get("f136")), 4),
                        updated_at=datetime.utcnow(),
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["code"],
                        set_={
                            "name": stmt.excluded.name,
                            "change_pct": stmt.excluded.change_pct,
                            "change_amt": stmt.excluded.change_amt,
                            "price": stmt.excluded.price,
                            "volume": stmt.excluded.volume,
                            "turnover": stmt.excluded.turnover,
                            "rise_count": stmt.excluded.rise_count,
                            "fall_count": stmt.excluded.fall_count,
                            "lead_stock": stmt.excluded.lead_stock,
                            "lead_stock_pct": stmt.excluded.lead_stock_pct,
                            "updated_at": stmt.excluded.updated_at,
                        },
                    )
                    db.execute(stmt)
                    count += 1
                db.commit()
                from routers.system import sched_log

                sched_log(
                    "success", f"概念板块同步完成，共 {count} 条", source="scheduler"
                )
                return count
            except Exception as e:
                db.rollback()
                if (
                    db_attempt < retry_count - 1
                    and "database is locked" in str(e).lower()
                ):
                    time.sleep(1 + db_attempt * 0.5)
                    continue
                from routers.system import sched_log

                sched_log("error", f"概念板块同步DB错误: {e}", source="scheduler")
                return 0
            finally:
                if db_attempt == retry_count - 1:
                    db.close()
    except Exception as e:
        from routers.system import sched_log

        sched_log("error", f"概念板块同步失败: {e}", source="scheduler")
        return 0
    finally:
        with _sync_lock:
            _is_syncing = False


@router.get("")
def get_boards(
    sort: str = Query("change_pct"),
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
):
    col_map = {
        "change_pct": ConceptBoard.change_pct,
        "turnover": ConceptBoard.turnover,
        "name": ConceptBoard.name,
    }
    order_col = col_map.get(sort, ConceptBoard.change_pct)
    rows = db.query(ConceptBoard).order_by(order_col.desc()).limit(limit).all()
    return [
        {
            "code": r.code,
            "name": r.name,
            "changePct": r.change_pct,
            "changeAmt": r.change_amt,
            "price": r.price,
            "riseCount": r.rise_count,
            "fallCount": r.fall_count,
            "leadStock": r.lead_stock,
            "leadStockPct": r.lead_stock_pct,
            "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.post("/sync")
def trigger_sync():
    threading.Thread(target=sync_concept_boards, daemon=True).start()
    return {"message": "sync started"}


@router.get("/industry")
def get_industry_boards(
    sort: str = Query("change_pct"),
    limit: int = Query(100, le=200),
    db: Session = Depends(get_db),
):
    """
    动态生成产业板块数据
    基于 industry_node 表中的产业链分层(layer)动态构建板块
    每个产业的每个分层作为一个独立板块
    """
    import json
    from collections import defaultdict
    from sqlalchemy import text

    # 1. 查询所有产业节点
    query = text("""
        SELECT industry_id, layer, group_name, stocks, label
        FROM industry_node
        WHERE stocks IS NOT NULL AND stocks != '[]'
    """)
    rows = db.execute(query).fetchall()

    # 2. 按 industry_id + layer 分组聚合股票
    layer_stocks = defaultdict(lambda: {"stocks": set(), "groups": set(), "labels": []})

    for row in rows:
        industry_id, layer, group_name, stocks_json, label = row
        stocks = json.loads(stocks_json) if stocks_json else []

        # 过滤 A 股（以 0/3/6 开头）
        a_stocks = [s for s in stocks if s and (s[0] in ("0", "3", "6"))]

        if a_stocks:
            key = f"{industry_id}_{layer}"
            layer_stocks[key]["stocks"].update(a_stocks)
            if group_name:
                layer_stocks[key]["groups"].add(group_name)
            if label:
                layer_stocks[key]["labels"].append(label)

    # 3. 为每个分层查询行情并聚合
    boards = []

    for board_code, data in layer_stocks.items():
        industry_id, layer = board_code.rsplit("_", 1)
        stock_codes = list(data["stocks"])

        if not stock_codes:
            continue

        # 查询这些股票的实时行情
        placeholders = ",".join([f"'{c}'" for c in stock_codes])
        quote_query = text(f"""
            SELECT code, name, price, change_amt, change, turnover, market_cap
            FROM stock_quote
            WHERE code IN ({placeholders})
              AND price > 0
        """)
        quotes = db.execute(quote_query).fetchall()

        if not quotes:
            continue

        # 聚合计算
        total_change_pct = 0
        total_volume = 0
        rise_count = 0
        fall_count = 0
        lead_stock_code = ""
        lead_stock_name = ""
        lead_stock_pct = 0

        for q in quotes:
            code, name, price, change_amt, change_pct, turnover, market_cap = q

            if change_pct is not None:
                total_change_pct += change_pct
                if change_pct > 0:
                    rise_count += 1
                elif change_pct < 0:
                    fall_count += 1

                # 找领涨股
                if change_pct > lead_stock_pct:
                    lead_stock_pct = change_pct
                    lead_stock_code = code
                    lead_stock_name = name

            if turnover:
                total_volume += turnover

        # 平均涨跌幅
        avg_change_pct = round(total_change_pct / len(quotes), 4) if quotes else 0

        # 生成板块名称
        layer_name_map = {
            "upstream": "L0-上游",
            "core": "L1-核心",
            "downstream": "L2-下游",
            "application": "L3-应用",
        }
        layer_display = layer_name_map.get(layer, layer)

        # 获取产业中文名
        industry_query = text("""
            SELECT name FROM industry_list WHERE industry_id = :industry_id
        """)
        industry_result = db.execute(
            industry_query, {"industry_id": industry_id}
        ).fetchone()
        industry_name = industry_result[0] if industry_result else industry_id

        board_name = f"{industry_name}{layer_display}"

        # 添加分组信息作为标签
        groups_str = "/".join(sorted(data["groups"])[:2]) if data["groups"] else ""

        boards.append(
            {
                "code": board_code,
                "name": board_name,
                "changePct": avg_change_pct,
                "changeAmt": 0,  # 板块不计算绝对变化值
                "price": 0,  # 板块无价格
                "riseCount": rise_count,
                "fallCount": fall_count,
                "leadStock": f"{lead_stock_name}({lead_stock_code})"
                if lead_stock_code
                else "",
                "leadStockPct": lead_stock_pct,
                "compCount": len(quotes),
                "turnover": round(total_volume, 2),
                "tag": groups_str,  # 用于前端显示标签
                "updatedAt": datetime.now().isoformat(),
            }
        )

    # 4. 排序
    sort_key_map = {
        "change_pct": lambda x: x["changePct"],
        "turnover": lambda x: x["turnover"],
        "name": lambda x: x["name"],
    }
    sort_func = sort_key_map.get(sort, lambda x: x["changePct"])
    boards.sort(key=sort_func, reverse=(sort != "name"))

    # 5. 限制返回数量
    return boards[:limit]


def calc_industry_board_kline(days: int = 60, force: bool = False) -> int:
    """
    计算产业板块的历史涨跌幅并缓存到 stock_kline 表

    逻辑：
    1. 查询所有产业节点，按 industry_id + layer 分组
    2. 对每个分组，获取成分股列表
    3. 查询成分股的历史 K 线数据（最近 days 个交易日）
    4. 按日期聚合：计算当日所有成分股的平均涨跌幅
    5. 缓存到 stock_kline 表（code = {industry_id}_{layer}）

    Args:
        days:  回溯天数
        force: True 时跳过"已是最新"检查，强制重新计算所有产业板块

    Returns:
        缓存的记录数，0 表示跳过（今日已算过）
    """
    from collections import defaultdict
    from sqlalchemy import text
    from db import StockKline
    from datetime import timedelta, date as date_type

    # 非交易日 或 今日已算过则跳过（force=True 时完全跳过此判断）
    if not force:
        from routers.industry import is_trading_day
        today_str = date_type.today().strftime("%Y-%m-%d")

        # 先查出当前数据库中有哪些产业板块的最新日期
        db_check = SessionLocal()
        try:
            rows = db_check.execute(text(
                "SELECT code, MAX(trade_date) as latest FROM stock_kline "
                "WHERE period='daily' AND instr(code,'_')>0 GROUP BY code"
            )).fetchall()
            existing_latest = {r[0]: r[1] for r in rows}
        finally:
            db_check.close()

        if not is_trading_day():
            # 非交易日：所有已有的板块数据都不超过 4 天，且没有"从未计算过"的板块 → 跳过
            if existing_latest:
                try:
                    max_age = max(
                        (date_type.today() - date_type.fromisoformat(v)).days
                        for v in existing_latest.values()
                    )
                    # 还需要检查 industry_node 里是否有新产业还没有计算过
                    db_check2 = SessionLocal()
                    try:
                        node_rows = db_check2.execute(text(
                            "SELECT DISTINCT industry_id || '_' || layer as code FROM industry_node "
                            "WHERE stocks IS NOT NULL AND stocks != '[]'"
                        )).fetchall()
                        all_board_codes = {r[0] for r in node_rows}
                    finally:
                        db_check2.close()

                    missing_boards = all_board_codes - set(existing_latest.keys())
                    if max_age <= 4 and not missing_boards:
                        print(f"[calc_industry_kline] skipped — non-trading day, data is {max_age}d old, no missing boards")
                        return 0
                    if missing_boards:
                        print(f"[calc_industry_kline] found {len(missing_boards)} new boards with no data, proceeding")
                except Exception:
                    pass
        else:
            # 交易日：所有板块今日都已算过，且没有新板块 → 跳过
            db_check3 = SessionLocal()
            try:
                node_rows = db_check3.execute(text(
                    "SELECT DISTINCT industry_id || '_' || layer as code FROM industry_node "
                    "WHERE stocks IS NOT NULL AND stocks != '[]'"
                )).fetchall()
                all_board_codes = {r[0] for r in node_rows}
            finally:
                db_check3.close()

            missing_boards = all_board_codes - set(existing_latest.keys())
            stale_boards = {c for c, d in existing_latest.items() if d < today_str}
            if not missing_boards and not stale_boards:
                print(f"[calc_industry_kline] skipped — all boards up to date ({today_str})")
                return 0
    else:
        print(f"[calc_industry_kline] force mode — skipping staleness check")

    db = SessionLocal()
    try:
        # 1. 获取所有产业节点和元信息
        nodes_query = text("""
            SELECT n.industry_id, n.layer, n.stocks, il.name AS industry_name
            FROM industry_node n
            LEFT JOIN industry_list il ON n.industry_id = il.industry_id
            WHERE n.stocks IS NOT NULL AND n.stocks != '[]'
        """)
        nodes = db.execute(nodes_query).fetchall()

        # 2. 按 industry_id + layer 分组聚合股票
        layer_stocks = defaultdict(lambda: {"stocks": set(), "name": ""})
        for row in nodes:
            industry_id = row.industry_id
            layer = row.layer
            industry_name = row.industry_name or industry_id
            stocks = eval(row.stocks) if row.stocks else []

            # 过滤 A 股
            a_stocks = [s for s in stocks if _is_a_share(s)]
            if not a_stocks:
                continue

            key = f"{industry_id}_{layer}"
            layer_stocks[key]["stocks"].update(a_stocks)
            layer_stocks[key]["name"] = industry_name

        if not layer_stocks:
            return 0

        # 3. 计算截止日期（今天往前 days*2 天，确保有足够交易日）
        from datetime import date as date_type

        today = date_type.today()
        date_cutoff = (today - timedelta(days=days * 2)).isoformat()

        total_cached = 0

        # 4. 遍历每个产业板块
        for board_code, data in layer_stocks.items():
            stocks = list(data["stocks"])
            if not stocks:
                continue

            # 5. 查询成分股的历史 K 线
            placeholders = ",".join([f":stock{i}" for i in range(len(stocks))])
            kline_query = text(f"""
                SELECT code, trade_date, change_pct
                FROM stock_kline
                WHERE code IN ({placeholders})
                  AND period = 'daily'
                  AND trade_date >= :date_cutoff
                ORDER BY trade_date ASC
            """)
            params = {f"stock{i}": code for i, code in enumerate(stocks)}
            params["date_cutoff"] = date_cutoff
            klines = db.execute(kline_query, params).fetchall()

            if not klines:
                continue

            # 6. 按日期聚合：计算每日平均涨跌幅
            date_changes = defaultdict(list)
            for row in klines:
                if row.change_pct is not None:
                    date_changes[row.trade_date].append(row.change_pct)

            # 7. 缓存到 stock_kline 表
            for trade_date, changes in sorted(date_changes.items())[-days:]:
                if not changes:
                    continue
                avg_change = round(sum(changes) / len(changes), 4)

                stmt = sqlite_insert(StockKline).values(
                    code=board_code,
                    period="daily",
                    trade_date=trade_date,
                    open=0.0,
                    high=0.0,
                    low=0.0,
                    close=0.0,
                    volume=0,
                    turnover=0.0,
                    turn_rate=0.0,
                    change_pct=avg_change,
                    updated_at=datetime.now(),
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["code", "period", "trade_date"],
                    set_={
                        "change_pct": stmt.excluded.change_pct,
                        "updated_at": stmt.excluded.updated_at,
                    },
                )
                db.execute(stmt)
                total_cached += 1

        db.commit()
        return total_cached
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


@router.post("/calc-industry-kline")
def trigger_calc_industry_kline(
    background_tasks: BackgroundTasks,
    days: int = Query(default=60, ge=14, le=120),
    force: bool = Query(default=False),
):
    """手动触发产业板块 K 线聚合计算（后台执行），供前端进入页面时调用
    
    force=true 时强制重新计算，忽略"非交易日/已是最新"跳过检查
    """
    background_tasks.add_task(calc_industry_board_kline, days, force)
    return {"message": f"产业板块K线计算已启动，days={days}, force={force}"}


def _sync_missing_industry_stocks_klines():
    """
    检查所有产业节点成分股（A股），找出在 stock_kline 里完全没有日线数据的股票，
    调用 _sync_klines 补全历史 K 线。用于新增产业后首次补全数据。
    """
    from sqlalchemy import text
    from routers.industry import _sync_klines

    db = SessionLocal()
    try:
        # 1. 取出所有产业节点里的 A 股
        rows = db.execute(text(
            "SELECT stocks FROM industry_node WHERE stocks IS NOT NULL AND stocks != '[]'"
        )).fetchall()
        all_stocks: set[str] = set()
        for r in rows:
            try:
                stocks = eval(r[0]) if r[0] else []
                for s in stocks:
                    if _is_a_share(s):
                        all_stocks.add(s)
            except Exception:
                pass

        if not all_stocks:
            return

        # 2. 查出已经有日线 K 线的股票
        placeholders = ",".join([f"'{s}'" for s in all_stocks])
        existing = db.execute(text(
            f"SELECT DISTINCT code FROM stock_kline "
            f"WHERE period='daily' AND code IN ({placeholders})"
        )).fetchall()
        existing_codes = {r[0] for r in existing}

        missing = all_stocks - existing_codes
    finally:
        db.close()

    if not missing:
        print(f"[sync_missing_industry_stocks] all {len(all_stocks)} stocks have klines, nothing to do")
        return

    print(f"[sync_missing_industry_stocks] {len(missing)} stocks missing klines, syncing...")
    success_count = 0
    fail_count = 0
    for code in sorted(missing):
        try:
            _sync_klines(code, "daily")
            success_count += 1
        except Exception as e:
            print(f"[sync_missing_industry_stocks] {code} error: {e}")
            fail_count += 1
            # 出错后多等一会，让 baostock 连接恢复
            time.sleep(2.0)
            continue
        # 正常调用间隔 0.3s，避免单连接高频请求导致 baostock 错误
        time.sleep(0.3)
    print(f"[sync_missing_industry_stocks] done: success={success_count}, fail={fail_count}, total={len(missing)}")


@router.post("/sync-industry-stocks")
def trigger_sync_industry_stocks(background_tasks: BackgroundTasks):
    """
    补全产业板块成分股的历史 K 线（只同步从未有过 K 线的股票）。
    新增产业后调用一次即可，完成后再调用 calc-industry-kline?force=true 生成板块聚合 K 线。
    """
    background_tasks.add_task(_sync_missing_industry_stocks_klines)
    return {"message": "产业成分股 K 线补全任务已启动（后台执行）"}


@router.get("/industry-rotation")
async def get_industry_rotation(
    days: int = Query(default=14, ge=5, le=60),
    db: Session = Depends(get_db),
):
    """
    产业板块轮动热力图数据

    返回格式：
    {
        "dates": ["2026-06-01", "2026-06-02", ...],
        "boards": [
            {
                "code": "pcb_core",
                "name": "PCB（印制电路板）L1-核心",
                "tag": "AI服务器组装/FPC软板",
                "currentChangePct": 5.7023,
                "data": [1.2, 2.3, -0.5, ...]  # 对应 dates 的涨跌幅
            },
            ...
        ]
    }
    """
    from fastapi.concurrency import run_in_threadpool
    from datetime import date as date_type, timedelta
    from sqlalchemy import text

    def _compute():
        db_inner = SessionLocal()
        try:
            # 1. 查询所有产业节点，分组聚合
            nodes_query = text("""
                SELECT n.industry_id, n.layer, n.stocks, n.group_name,
                       il.name AS industry_name
                FROM industry_node n
                LEFT JOIN industry_list il ON n.industry_id = il.industry_id
                WHERE n.stocks IS NOT NULL AND n.stocks != '[]'
            """)
            nodes = db_inner.execute(nodes_query).fetchall()

            from collections import defaultdict

            layer_data = defaultdict(
                lambda: {"stocks": set(), "groups": set(), "name": ""}
            )

            for row in nodes:
                industry_id = row.industry_id
                layer = row.layer
                industry_name = row.industry_name or industry_id
                stocks = eval(row.stocks) if row.stocks else []
                group_name = row.group_name or ""

                # 过滤 A 股
                a_stocks = [s for s in stocks if _is_a_share(s)]
                if not a_stocks:
                    continue

                key = f"{industry_id}_{layer}"
                layer_data[key]["stocks"].update(a_stocks)
                layer_data[key]["name"] = industry_name
                if group_name:
                    layer_data[key]["groups"].add(group_name)

            if not layer_data:
                return {"dates": [], "boards": []}

            # 2. 查询最近 days*2 天的 K 线数据
            today = date_type.today()
            date_cutoff = (today - timedelta(days=days * 2 + 10)).isoformat()

            board_codes = list(layer_data.keys())
            placeholders = ",".join([f":board{i}" for i in range(len(board_codes))])
            kline_query = text(f"""
                SELECT code, trade_date, change_pct
                FROM stock_kline
                WHERE code IN ({placeholders})
                  AND period = 'daily'
                  AND trade_date >= :date_cutoff
                ORDER BY trade_date ASC
            """)
            params = {f"board{i}": code for i, code in enumerate(board_codes)}
            params["date_cutoff"] = date_cutoff
            rows = db_inner.execute(kline_query, params).fetchall()

            # 如果缓存为空，触发后台计算
            if not rows:
                threading.Thread(
                    target=calc_industry_board_kline, args=(days * 2,), daemon=True
                ).start()
                return {"dates": [], "boards": []}

            # 3. 构建 code -> {date -> change_pct} 映射
            code_date_map = defaultdict(dict)
            all_dates = set()
            for r in rows:
                code_date_map[r.code][r.trade_date] = r.change_pct
                all_dates.add(r.trade_date)

            sorted_dates = sorted(all_dates)[-days:]

            # 数据陈旧（最新日期超过3天前）时触发后台重算
            from datetime import date as _date
            if sorted_dates:
                try:
                    latest_dt = _date.fromisoformat(sorted_dates[-1])
                    if (_date.today() - latest_dt).days > 3:
                        threading.Thread(
                            target=calc_industry_board_kline, args=(days * 2,), daemon=True
                        ).start()
                except Exception:
                    pass

            # 4. 查询当前涨跌幅（从 stock_quote 聚合计算）
            from db import StockQuote

            current_change_map = {}
            for board_code, data in layer_data.items():
                stocks = list(data["stocks"])
                if not stocks:
                    continue
                quotes = (
                    db_inner.query(StockQuote.change)
                    .filter(StockQuote.code.in_(stocks))
                    .all()
                )
                if quotes:
                    avg = round(sum(q.change for q in quotes) / len(quotes), 4)
                    current_change_map[board_code] = avg
                else:
                    current_change_map[board_code] = 0.0

            # 5. 构建返回结果
            layer_name_map = {
                "upstream": "L0-上游",
                "core": "L1-核心",
                "downstream": "L2-下游",
                "application": "L3-应用",
            }

            result_boards = []
            for board_code, data in layer_data.items():
                industry_id, layer = board_code.rsplit("_", 1)
                industry_name = data["name"]
                layer_display = layer_name_map.get(layer, layer)
                board_name = f"{industry_name}{layer_display}"

                groups_str = (
                    "/".join(sorted(data["groups"])[:2]) if data["groups"] else None
                )

                # 获取历史涨跌幅数据
                hist_data = [code_date_map[board_code].get(d) for d in sorted_dates]

                result_boards.append(
                    {
                        "code": board_code,
                        "name": board_name,
                        "tag": groups_str,
                        "currentChangePct": current_change_map.get(board_code, 0.0),
                        "data": hist_data,
                    }
                )

            # 按当前涨跌幅排序
            result_boards.sort(key=lambda x: x["currentChangePct"], reverse=True)

            return {"dates": sorted_dates, "boards": result_boards}
        finally:
            db_inner.close()

    return await run_in_threadpool(_compute)


@router.get("/industry-constituents/{board_code}")
def get_industry_constituents(
    board_code: str,
    db: Session = Depends(get_db),
):
    from sqlalchemy import text
    from db import StockQuote

    try:
        industry_id, layer = board_code.rsplit("_", 1)
    except ValueError:
        return []

    nodes_query = text("""
        SELECT stocks
        FROM industry_node
        WHERE industry_id = :industry_id AND layer = :layer
          AND stocks IS NOT NULL AND stocks != '[]'
    """)
    rows = db.execute(
        nodes_query, {"industry_id": industry_id, "layer": layer}
    ).fetchall()

    all_stocks = set()
    for row in rows:
        stocks = eval(row.stocks) if row.stocks else []
        a_stocks = [s for s in stocks if _is_a_share(s)]
        all_stocks.update(a_stocks)

    if not all_stocks:
        return []

    codes = list(all_stocks)
    quotes = db.query(StockQuote).filter(StockQuote.code.in_(codes)).all()
    quote_map = {q.code: q for q in quotes}

    from db import StockMeta

    meta_map = {}
    metas = db.query(StockMeta).filter(StockMeta.code.in_(codes)).all()
    for m in metas:
        meta_map[m.code] = m.name

    result = []
    for code in codes:
        q = quote_map.get(code)
        name = meta_map.get(code, code)
        result.append(
            {
                "code": code,
                "name": name,
                "price": q.price if q else 0.0,
                "changePct": q.change if q else 0.0,
                "changeAmt": q.change_amt if q else 0.0,
                "open": q.open if q else 0.0,
                "prevClose": q.prev_close if q else 0.0,
                "high": q.high if q else 0.0,
                "low": q.low if q else 0.0,
                "volume": q.volume if q else 0.0,
                "turnover": q.turnover if q else 0.0,
                "marketCap": q.market_cap if q else 0.0,
                "pe": q.pe if q else 0.0,
                "pb": q.pb if q else 0.0,
                "turnoverRate": q.turnover_rate if q else 0.0,
                "updatedAt": q.updated_at.isoformat() if q and q.updated_at else None,
            }
        )

    result.sort(key=lambda x: x["changePct"], reverse=True)
    return result


@router.delete("/industry/{board_code}")
def delete_industry_board(
    board_code: str,
    db: Session = Depends(get_db),
):
    from sqlalchemy import text
    from db import StockKline

    try:
        industry_id, layer = board_code.rsplit("_", 1)
    except ValueError:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Invalid board code format")

    delete_nodes = text("""
        DELETE FROM industry_node
        WHERE industry_id = :industry_id AND layer = :layer
    """)
    result = db.execute(delete_nodes, {"industry_id": industry_id, "layer": layer})
    deleted_count = result.rowcount

    if deleted_count == 0:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Board not found")

    delete_klines = text("""
        DELETE FROM stock_kline
        WHERE code = :board_code AND period = 'daily'
    """)
    db.execute(delete_klines, {"board_code": board_code})

    db.commit()

    return {
        "success": True,
        "deleted_nodes": deleted_count,
        "board_code": board_code,
        "message": f"已删除 {deleted_count} 个节点",
    }
