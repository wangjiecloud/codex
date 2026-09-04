from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy import text as sa_text
from datetime import datetime, date, timedelta
import threading
import urllib3
import requests as _req

from db import (
    get_db,
    SessionLocal,
    SwIndustry,
    SwIndustryConstituent,
    SwIndustryDaily,
    StockMeta,
    StockQuote,
    StockKline,
)

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

router = APIRouter()

_sync_lock = threading.Lock()
_is_syncing = False

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://data.eastmoney.com/",
}


def _safe_float(val, default: float = 0.0) -> float:
    try:
        v = float(str(val).replace(",", "").strip())
        return v if v == v else default
    except Exception:
        return default


def _upsert_stock_meta(db, code: str, name: str):
    """Ensure stock exists in stock_meta and stock_quote."""
    stmt = sqlite_insert(StockMeta).values(
        code=code,
        name=name,
        market="SZ" if code.startswith(("0", "3")) else "SH",
        industry_ids="[]",
    )
    stmt = stmt.on_conflict_do_nothing(index_elements=["code"])
    db.execute(stmt)

    stmt2 = sqlite_insert(StockQuote).values(
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
        updated_at=None,
    )
    stmt2 = stmt2.on_conflict_do_nothing(index_elements=["code"])
    db.execute(stmt2)


def sync_sw_industries() -> int:
    global _is_syncing
    with _sync_lock:
        if _is_syncing:
            return 0
        _is_syncing = True
    try:
        import akshare as ak

        df = ak.index_realtime_sw(symbol="二级行业")
        df["涨幅"] = ((df["最新价"] - df["昨收盘"]) / df["昨收盘"] * 100).round(4)

        df2 = ak.sw_index_second_info()
        info_map = {}
        for _, row in df2.iterrows():
            raw_code = str(row["行业代码"]).replace(".SI", "")
            info_map[raw_code] = row

        rows_to_write = []
        for _, row in df.iterrows():
            code = str(row["指数代码"]).strip()
            name = str(row["指数名称"]).strip()
            info = info_map.get(code, {})
            rows_to_write.append(
                {
                    "code": code,
                    "name": name,
                    "prev_close": round(_safe_float(row["昨收盘"]), 4),
                    "open": round(_safe_float(row["今开盘"]), 4),
                    "price": round(_safe_float(row["最新价"]), 4),
                    "high": round(_safe_float(row["最高价"]), 4),
                    "low": round(_safe_float(row["最低价"]), 4),
                    "volume": round(_safe_float(row["成交量"]), 4),
                    "turnover": round(_safe_float(row["成交额"]), 4),
                    "change_pct": round(_safe_float(row["涨幅"]), 4),
                    "pe_static": _safe_float(info.get("静态市盈率", 0)),
                    "pe_ttm": _safe_float(info.get("TTM(滚动)市盈率", 0)),
                    "pb": _safe_float(info.get("市净率", 0)),
                    "dividend_yield": _safe_float(info.get("静态股息率", 0)),
                    "comp_count": int(_safe_float(info.get("成份个数", 0))),
                    "updated_at": datetime.utcnow(),
                }
            )

        db = SessionLocal()
        retry_count = 3
        for attempt in range(retry_count):
            try:
                count = 0
                for item in rows_to_write:
                    stmt = sqlite_insert(SwIndustry).values(level="二级", **item)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["code"],
                        set_={
                            "name": stmt.excluded.name,
                            "prev_close": stmt.excluded.prev_close,
                            "open": stmt.excluded.open,
                            "price": stmt.excluded.price,
                            "high": stmt.excluded.high,
                            "low": stmt.excluded.low,
                            "volume": stmt.excluded.volume,
                            "turnover": stmt.excluded.turnover,
                            "change_pct": stmt.excluded.change_pct,
                            "pe_static": stmt.excluded.pe_static,
                            "pe_ttm": stmt.excluded.pe_ttm,
                            "pb": stmt.excluded.pb,
                            "dividend_yield": stmt.excluded.dividend_yield,
                            "comp_count": stmt.excluded.comp_count,
                            "updated_at": stmt.excluded.updated_at,
                        },
                    )
                    db.execute(stmt)
                    count += 1
                db.commit()

                # ── 同时写入每日历史快照表 ──────────────────────────────
                today_str = date.today().isoformat()
                daily_count = 0
                for item in rows_to_write:
                    daily_stmt = sqlite_insert(SwIndustryDaily).values(
                        trade_date=today_str,
                        code=item["code"],
                        name=item["name"],
                        change_pct=item["change_pct"],
                        close=item["price"],
                        volume=item["volume"],
                        turnover=item["turnover"],
                        updated_at=datetime.utcnow(),
                    )
                    daily_stmt = daily_stmt.on_conflict_do_update(
                        index_elements=["trade_date", "code"],
                        set_={
                            "name": daily_stmt.excluded.name,
                            "change_pct": daily_stmt.excluded.change_pct,
                            "close": daily_stmt.excluded.close,
                            "volume": daily_stmt.excluded.volume,
                            "turnover": daily_stmt.excluded.turnover,
                            "updated_at": daily_stmt.excluded.updated_at,
                        },
                    )
                    db.execute(daily_stmt)
                    daily_count += 1
                db.commit()
                # ────────────────────────────────────────────────────────

                from routers.system import sched_log

                sched_log(
                    "success",
                    f"申万行业同步完成，共 {count} 个板块，日历史 {daily_count} 条",
                    source="scheduler",
                )
                return count
            except Exception as e:
                db.rollback()
                if attempt < retry_count - 1 and "database is locked" in str(e).lower():
                    import time

                    time.sleep(1 + attempt * 0.5)
                    continue
                from routers.system import sched_log

                sched_log("error", f"申万行业同步DB错误: {e}", source="scheduler")
                return 0
            finally:
                if attempt == retry_count - 1:
                    db.close()
    except Exception as e:
        from routers.system import sched_log

        sched_log("error", f"申万行业同步失败: {e}", source="scheduler")
        return 0
    finally:
        with _sync_lock:
            _is_syncing = False


def _fetch_all_stocks_by_sw2() -> dict:
    import requests as req

    all_items = []
    for pn in range(1, 50):
        url = (
            "https://push2.eastmoney.com/api/qt/clist/get"
            f"?pn={pn}&pz=100&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281"
            "&fltt=2&invt=2&fid=f3"
            "&fs=m:0+t:6+f:!50,m:1+t:2+f:!50"
            "&fields=f12,f14,f100"
        )
        try:
            r = req.get(url, headers=_HEADERS, timeout=15, verify=False)
            d = r.json().get("data") or {}
            items = d.get("diff") or []
            if not items:
                break
            all_items.extend(items)
            if len(all_items) >= (d.get("total") or 0):
                break
        except Exception:
            break

    from collections import defaultdict

    result: dict = defaultdict(list)
    for item in all_items:
        ind = str(item.get("f100") or "").strip()
        code = str(item.get("f12") or "").strip()
        name = str(item.get("f14") or "").strip()
        if ind and ind != "-" and code and name:
            result[ind].append({"code": code, "name": name})
    return dict(result)


def sync_sw_constituents_bulk() -> int:
    import akshare as ak
    from routers.system import sched_log
    import time as _time

    db = SessionLocal()
    try:
        boards = db.query(SwIndustry.code, SwIndustry.name).all()
        if not boards:
            sched_log(
                "warning",
                "申万行业表为空，请先执行 sync_sw_industries",
                source="scheduler",
            )
            return 0

        total = 0
        errors = 0
        for board_code, board_name in boards:
            try:
                df = ak.index_component_sw(symbol=board_code)
                if df is None or df.empty:
                    continue
                for _, row in df.iterrows():
                    code = str(row["证券代码"]).strip()
                    sname = str(row["证券名称"]).strip()
                    if not code or not sname:
                        continue
                    _upsert_stock_meta(db, code, sname)

                    stmt = sqlite_insert(SwIndustryConstituent).values(
                        board_code=board_code,
                        stock_code=code,
                        stock_name=sname,
                        updated_at=datetime.utcnow(),
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["board_code", "stock_code"],
                        set_={
                            "stock_name": stmt.excluded.stock_name,
                            "updated_at": stmt.excluded.updated_at,
                        },
                    )
                    db.execute(stmt)
                    total += 1
                db.commit()
            except Exception as e:
                db.rollback()
                errors += 1
                if errors <= 3:
                    sched_log(
                        "error",
                        f"申万成分股[{board_code}]同步失败: {e}",
                        source="scheduler",
                    )
            _time.sleep(0.1)

        sched_log(
            "success",
            f"申万成分股批量同步完成，共 {total} 条（{errors} 个行业失败）",
            source="scheduler",
        )
        return total
    except Exception as e:
        db.rollback()
        from routers.system import sched_log

        sched_log("error", f"申万成分股批量DB错误: {e}", source="scheduler")
        return 0
    finally:
        db.close()


def sync_sw_constituents(board_code: str) -> int:
    db = SessionLocal()
    try:
        existing = (
            db.query(SwIndustryConstituent)
            .filter(SwIndustryConstituent.board_code == board_code)
            .count()
        )
    finally:
        db.close()

    if existing > 0:
        return existing

    sync_sw_constituents_bulk()

    db = SessionLocal()
    try:
        return (
            db.query(SwIndustryConstituent)
            .filter(SwIndustryConstituent.board_code == board_code)
            .count()
        )
    finally:
        db.close()


def sync_all_sw_constituents():
    return sync_sw_constituents_bulk()


@router.get("")
def get_sw_industries(
    sort: str = Query("change_pct"),
    order: str = Query("desc"),
    db: Session = Depends(get_db),
):
    col_map = {
        "change_pct": SwIndustry.change_pct,
        "turnover": SwIndustry.turnover,
        "volume": SwIndustry.volume,
        "pe_ttm": SwIndustry.pe_ttm,
        "pb": SwIndustry.pb,
        "comp_count": SwIndustry.comp_count,
        "name": SwIndustry.name,
        "price": SwIndustry.price,
    }
    col = col_map.get(sort, SwIndustry.change_pct)
    q = db.query(SwIndustry)
    q = q.order_by(col.asc() if order == "asc" else col.desc())
    rows = q.all()
    return [
        {
            "code": r.code,
            "name": r.name,
            "level": r.level,
            "price": r.price,
            "prevClose": r.prev_close,
            "open": r.open,
            "high": r.high,
            "low": r.low,
            "changePct": r.change_pct,
            "volume": r.volume,
            "turnover": r.turnover,
            "peStatic": r.pe_static,
            "peTtm": r.pe_ttm,
            "pb": r.pb,
            "dividendYield": r.dividend_yield,
            "compCount": r.comp_count,
            "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


def _fetch_realtime_quotes(codes: list[str]) -> dict:
    """从东方财富批量拉取实时行情，返回 {code: {...}} dict。
    f2=最新价 f3=涨跌幅 f4=涨跌额 f5=成交量 f6=成交额 f15=最高 f16=最低
    f17=今开 f18=昨收 f20=总市值 f23=市净率 f9=动态PE"""
    if not codes:
        return {}

    # 东方财富 secid: 0.开头(深) 或 1.开头(沪)
    def _secid(c: str) -> str:
        return f"0.{c}" if c[0] in ("0", "3") else f"1.{c}"

    secids = ",".join(_secid(c) for c in codes)
    url = (
        "https://push2.eastmoney.com/api/qt/ulist.np/get"
        f"?fltt=2&invt=2&fields=f2,f3,f4,f5,f6,f9,f12,f14,f15,f16,f17,f18,f20,f23"
        f"&secids={secids}"
    )
    try:
        r = _req.get(url, headers=_HEADERS, timeout=10, verify=False)
        items = r.json().get("data", {}).get("diff", []) or []
    except Exception:
        return {}

    result = {}
    for item in items:
        code = str(item.get("f12", "")).strip()
        if not code:
            continue
        result[code] = {
            "price": _safe_float(item.get("f2")),
            "change": _safe_float(item.get("f3")),  # 涨跌幅%
            "change_amt": _safe_float(item.get("f4")),
            "volume": _safe_float(item.get("f5")),
            "turnover": _safe_float(item.get("f6")),
            "high": _safe_float(item.get("f15")),
            "low": _safe_float(item.get("f16")),
            "open": _safe_float(item.get("f17")),
            "prev_close": _safe_float(item.get("f18")),
            "market_cap": _safe_float(item.get("f20")),
            "pb": _safe_float(item.get("f23")),
            "pe": _safe_float(item.get("f9")),
            "name": str(item.get("f14", "")).strip(),
        }
    return result


def _is_quote_stale(quotes: list) -> bool:
    """判断行情数据是否是今天之前的旧数据（以 updated_at 判断）。
    updated_at 存的是 UTC 时间，折算为北京时间（+8h）后与今天比较。"""
    from datetime import timezone, timedelta as _td

    cst = timezone(_td(hours=8))
    today_cst = datetime.now(tz=cst).date().isoformat()
    for q in quotes:
        if q.updated_at:
            # updated_at 是 naive UTC datetime
            dt_cst = q.updated_at.replace(tzinfo=timezone.utc).astimezone(cst)
            if dt_cst.date().isoformat() >= today_cst:
                return False
    return True


def _refresh_quotes_for_codes(codes: list[str]):
    """实时刷新一批股票的行情并写入 stock_quote 表。"""
    live = _fetch_realtime_quotes(codes)
    if not live:
        return
    db = SessionLocal()
    try:
        for code, d in live.items():
            stmt = sqlite_insert(StockQuote).values(
                code=code,
                name=d["name"] or code,
                price=d["price"],
                change=d["change"],
                change_amt=d["change_amt"],
                open=d["open"],
                prev_close=d["prev_close"],
                high=d["high"],
                low=d["low"],
                volume=d["volume"],
                turnover=d["turnover"],
                market_cap=d["market_cap"],
                pe=d["pe"],
                pb=d["pb"],
                turnover_rate=0.0,
                amplitude=0.0,
                updated_at=datetime.utcnow(),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["code"],
                set_={
                    "price": stmt.excluded.price,
                    "change": stmt.excluded.change,
                    "change_amt": stmt.excluded.change_amt,
                    "open": stmt.excluded.open,
                    "prev_close": stmt.excluded.prev_close,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "volume": stmt.excluded.volume,
                    "turnover": stmt.excluded.turnover,
                    "market_cap": stmt.excluded.market_cap,
                    "pe": stmt.excluded.pe,
                    "pb": stmt.excluded.pb,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@router.get("/constituents/{board_code}")
def get_sw_constituents(
    board_code: str,
    db: Session = Depends(get_db),
):
    cons = (
        db.query(SwIndustryConstituent)
        .filter(SwIndustryConstituent.board_code == board_code)
        .all()
    )

    if not cons:
        count = sync_sw_constituents(board_code)
        if count == 0:
            return []
        db2 = SessionLocal()
        try:
            cons = (
                db2.query(SwIndustryConstituent)
                .filter(SwIndustryConstituent.board_code == board_code)
                .all()
            )
        finally:
            db2.close()

    codes = [c.stock_code for c in cons]
    quote_map = {}
    if codes:
        quotes = db.query(StockQuote).filter(StockQuote.code.in_(codes)).all()
        quote_map = {q.code: q for q in quotes}

    # 检测行情是否是旧数据，是则实时刷新
    if codes and _is_quote_stale(list(quote_map.values())):
        _refresh_quotes_for_codes(codes)
        # 重新读取刷新后的数据
        db2 = SessionLocal()
        try:
            fresh = db2.query(StockQuote).filter(StockQuote.code.in_(codes)).all()
            quote_map = {q.code: q for q in fresh}
        finally:
            db2.close()

    result = []
    for c in cons:
        q = quote_map.get(c.stock_code)
        result.append(
            {
                "code": c.stock_code,
                "name": c.stock_name,
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


@router.post("/sync")
def trigger_sync():
    threading.Thread(target=sync_sw_industries, daemon=True).start()
    return {"message": "sync started"}


@router.post("/sync-constituents/{board_code}")
def trigger_sync_constituents(board_code: str):
    threading.Thread(
        target=sync_sw_constituents, args=(board_code,), daemon=True
    ).start()
    return {"message": "sync started", "boardCode": board_code}


@router.get("/boards-by-stock/{stock_code}")
def get_boards_by_stock(stock_code: str, db: Session = Depends(get_db)):
    rows = (
        db.query(SwIndustryConstituent.board_code)
        .filter(SwIndustryConstituent.stock_code == stock_code)
        .all()
    )
    board_codes = [r.board_code for r in rows]
    if not board_codes:
        return []
    boards = db.query(SwIndustry).filter(SwIndustry.code.in_(board_codes)).all()
    return [{"code": b.code, "name": b.name} for b in boards]


@router.get("/detail/{board_code}")
def get_sw_board_detail(board_code: str, db: Session = Depends(get_db)):
    r = db.query(SwIndustry).filter(SwIndustry.code == board_code).first()
    if not r:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="板块不存在")
    return {
        "code": r.code,
        "name": r.name,
        "level": r.level,
        "price": r.price,
        "prevClose": r.prev_close,
        "open": r.open,
        "high": r.high,
        "low": r.low,
        "changePct": r.change_pct,
        "volume": r.volume,
        "turnover": r.turnover,
        "peStatic": r.pe_static,
        "peTtm": r.pe_ttm,
        "pb": r.pb,
        "dividendYield": r.dividend_yield,
        "compCount": r.comp_count,
        "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
    }


def _safe_float_kline(val, default=0.0) -> float:
    try:
        v = float(str(val).replace(",", "").strip())
        return v if v == v else default
    except Exception:
        return default


def _fetch_sw_kline(board_code: str, count: int, period: str = "daily") -> list[dict]:
    import akshare as ak

    # 映射 DB period → akshare period
    _ak_period_map = {"daily": "day", "weekly": "week", "monthly": "month"}
    ak_period = _ak_period_map.get(period, "day")

    df = ak.index_hist_sw(symbol=board_code, period=ak_period)
    if df is None or df.empty:
        return []

    bars = []
    prev_close = None
    for _, row in df.iterrows():
        trade_date = str(row.get("日期", ""))[:10]
        if not trade_date:
            continue
        open_ = _safe_float_kline(row.get("开盘", 0))
        high = _safe_float_kline(row.get("最高", 0))
        low = _safe_float_kline(row.get("最低", 0))
        close = _safe_float_kline(row.get("收盘", 0))
        volume = _safe_float_kline(row.get("成交量", 0))
        if prev_close and prev_close > 0:
            change_pct = round((close - prev_close) / prev_close * 100, 4)
        else:
            change_pct = 0.0
        bars.append(
            {
                "time": trade_date,
                "open": round(open_, 4),
                "high": round(high, 4),
                "low": round(low, 4),
                "close": round(close, 4),
                "volume": int(volume),
                "turnRate": 0.0,
                "changePct": change_pct,
            }
        )
        prev_close = close

    bars.sort(key=lambda x: x["time"])
    return bars  # 返回全量，由调用方决定截取条数


def _dedup_period_bars(bars: list, period: str) -> list:
    """对周K/月K去重：申万接口在当周/当月未收盘时每天都会返回一条记录，
    按周/月分组后只保留每组中日期最大（最新）的一条。"""
    if period not in ("weekly", "monthly"):
        return bars
    # 按周/月分组 key
    if period == "weekly":

        def _group_key(bar):
            d = bar["time"]  # "YYYY-MM-DD"
            from datetime import date as _date

            dt = _date.fromisoformat(d)
            # ISO 周号（周一为第一天）
            return dt.isocalendar()[:2]  # (year, week)
    else:

        def _group_key(bar):
            return bar["time"][:7]  # "YYYY-MM"

    # 每组只保留日期最大的一条
    group: dict = {}
    for bar in bars:
        key = _group_key(bar)
        if key not in group or bar["time"] > group[key]["time"]:
            group[key] = bar
    # 按时间升序返回
    return sorted(group.values(), key=lambda x: x["time"])


@router.get("/kline/{board_code}")
async def get_sw_kline(
    board_code: str,
    period: str = Query(default="daily"),
    count: int = Query(default=110, ge=10, le=500),
):
    from fastapi.concurrency import run_in_threadpool

    # 按周期调整默认返回条数（与 kline.py 保持一致）
    if count == 110:
        if period == "weekly":
            count = 156
        elif period == "monthly":
            count = 120

    def _read_cached():
        db = SessionLocal()
        try:
            total = (
                db.query(StockKline)
                .filter(StockKline.code == board_code, StockKline.period == period)
                .count()
            )
            rows = (
                db.query(StockKline)
                .filter(StockKline.code == board_code, StockKline.period == period)
                .order_by(StockKline.trade_date.desc())
                .limit(count + 20)  # 多取一些，去重后再截取
                .all()
            )
            return total, rows
        finally:
            db.close()

    total, rows = await run_in_threadpool(_read_cached)

    # 用 DB 总条数判断缓存是否足够，避免 limit(count) 误判
    _min_cache = {"daily": 100, "weekly": 100, "monthly": 100}
    min_required = _min_cache.get(period, 100)

    if total >= min_required:
        bars = [
            {
                "time": r.trade_date,
                "open": r.open,
                "high": r.high,
                "low": r.low,
                "close": r.close,
                "volume": r.volume,
                "turnRate": r.turn_rate or 0.0,
                "changePct": r.change_pct,
            }
            for r in reversed(rows)
        ]
        # 对周K/月K去重，去除同周/同月内的重复记录
        bars = _dedup_period_bars(bars, period)
        return bars[-count:]

    def _fetch_and_cache():
        try:
            bars = _fetch_sw_kline(board_code, count, period)  # 返回全量
        except Exception:
            bars = []
        if not bars:
            return []
        db = SessionLocal()
        try:
            for bar in bars:
                stmt = sqlite_insert(StockKline).values(
                    code=board_code,
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
        except Exception:
            db.rollback()
        finally:
            db.close()
        # 写入全量后，对周K/月K去重，返回最新 count 条
        bars = _dedup_period_bars(bars, period)
        return bars[-count:]

    return await run_in_threadpool(_fetch_and_cache)


_INDUSTRY_SW_MAP = {
    "aigpu": "801081",
    "memory": "801081",
    "optics": "801084",
    "pcb": "801083",
    "mlcc": "801083",
    "fiber": "801102",
    "aiserver": "801101",
    "idc": "801103",
    "glasssub": "801712",
    "semieq": "801074",
    "liquidcool": "801072",
    "aipower": "801733",
    "coppercable": "801082",
}

_INDUSTRY_LABELS = {
    "aigpu": "AI算力芯片",
    "memory": "存储芯片",
    "optics": "光模块CPO",
    "pcb": "PCB/元件",
    "mlcc": "MLCC/元件",
    "fiber": "光纤通信",
    "aiserver": "AI服务器",
    "idc": "IDC/IT服务",
    "glasssub": "玻璃基板",
    "semieq": "半导体设备",
    "liquidcool": "液冷/设备",
    "aipower": "AI供配电",
    "coppercable": "高速铜连接",
}


@router.get("/rotation")
async def get_sw_rotation(days: int = Query(default=14, ge=5, le=60)):
    from fastapi.concurrency import run_in_threadpool
    from datetime import date as date_type

    def _compute():
        db = SessionLocal()
        try:
            all_boards = (
                db.query(SwIndustry).order_by(SwIndustry.change_pct.desc()).all()
            )

            # 全量展示所有申万二级板块
            selected_codes = [b.code for b in all_boards]
            boards_meta = {b.code: b for b in all_boards}

            today = date_type.today()
            date_cutoff = (today - timedelta(days=days * 2 + 10)).isoformat()

            rows = (
                db.query(StockKline)
                .filter(
                    StockKline.code.in_(selected_codes),
                    StockKline.period == "daily",
                    StockKline.trade_date >= date_cutoff,
                )
                .order_by(StockKline.trade_date.asc())
                .all()
            )

            from collections import defaultdict

            code_date_map: dict = defaultdict(dict)
            all_dates: set = set()
            for r in rows:
                code_date_map[r.code][r.trade_date] = r.change_pct
                all_dates.add(r.trade_date)

            sorted_dates = sorted(all_dates)[-days:]

            inv_map: dict = {}
            for ind_id, sw_code in _INDUSTRY_SW_MAP.items():
                label = _INDUSTRY_LABELS.get(ind_id, ind_id)
                if sw_code in inv_map:
                    inv_map[sw_code] = inv_map[sw_code] + "/" + label
                else:
                    inv_map[sw_code] = label

            result_boards = []
            for code in selected_codes:
                meta = boards_meta.get(code)
                if not meta:
                    continue
                tag = inv_map.get(code)
                data = [code_date_map[code].get(d) for d in sorted_dates]
                result_boards.append(
                    {
                        "code": code,
                        "name": meta.name,
                        "tag": tag,
                        "currentChangePct": meta.change_pct,
                        "data": data,
                    }
                )

            return {"dates": sorted_dates, "boards": result_boards}
        finally:
            db.close()

    result = await run_in_threadpool(_compute)

    def _is_stale(dates: list) -> bool:
        """检测数据是否陈旧：最新日期距今超过3个自然日（覆盖周末）"""
        if not dates:
            return True
        from datetime import date as date_type

        try:
            latest = date_type.fromisoformat(dates[-1])
            return (date_type.today() - latest).days > 3
        except Exception:
            return True

    if not result["dates"] or _is_stale(result["dates"]):
        threading.Thread(target=_sync_rotation_klines, daemon=True).start()

    return result


def _sync_rotation_klines(force: bool = False):
    """后台同步板块轮动所需的 K 线数据（top20 + 产业关联 + 所有申万二级，含日/周/月K）"""
    from routers.industry import is_trading_day
    from routers.system import record_failed_stock

    # 1) 非交易日不同步（force 模式跳过此判断，允许补历史数据）
    if not force and not is_trading_day():
        print("[sync_rotation_klines] skipped — not a trading day")
        return

    # 2) 今日已有最新数据则跳过（任取一条申万板块日K最新日期判断）
    if not force:
        today_str = date.today().strftime("%Y-%m-%d")
        db_check = SessionLocal()
        try:
            row = db_check.execute(
                sa_text(
                    "SELECT MAX(trade_date) FROM stock_kline "
                    "WHERE period='daily' AND code LIKE '8%'"
                )
            ).fetchone()
            latest = row[0] if row and row[0] else None
        finally:
            db_check.close()

        if latest and latest >= today_str:
            print(f"[sync_rotation_klines] skipped — already up to date ({latest})")
            return

    db = SessionLocal()
    board_name_map = {}  # 用于记录板块代码和名称的映射
    try:
        all_boards = db.query(SwIndustry).order_by(SwIndustry.change_pct.desc()).all()
        all_sw_codes = [b.code for b in all_boards]
        board_name_map = {
            b.code: b.name for b in all_boards
        }  # 构建板块代码->名称的映射
        if force:
            # force 模式：找出日K数据落后的板块单独补，速度更快
            from sqlalchemy import text as _text

            rows = db.execute(
                _text(
                    "SELECT code, MAX(trade_date) as latest FROM stock_kline "
                    "WHERE period='daily' AND code LIKE '8%' GROUP BY code"
                )
            ).fetchall()
            latest_map = {r[0]: r[1] for r in rows}
            # 取全量最新日期，只同步落后的板块
            global_latest = max(latest_map.values()) if latest_map else "1970-01-01"
            codes_to_sync = [
                c
                for c in all_sw_codes
                if latest_map.get(c, "1970-01-01") < global_latest
            ]
            # 没有或极少落后时同步全部（首次 force）
            if not codes_to_sync:
                codes_to_sync = all_sw_codes
            print(
                f"[sync_rotation_klines] force mode: {len(codes_to_sync)} stale codes to sync"
            )
        else:
            top20 = [b.code for b in all_boards[:20]]
            extra = list(set(_INDUSTRY_SW_MAP.values()))
            codes_to_sync = list(dict.fromkeys(top20 + extra + all_sw_codes))
    finally:
        db.close()

    # force 模式只补日K（快）；常规模式补全三周期
    period_counts = (
        [("daily", 10)]
        if force
        else [
            ("daily", 60),
            ("weekly", 104),
            ("monthly", 100),
        ]
    )

    for code in codes_to_sync:
        board_name = board_name_map.get(code, code)  # 获取板块名称，没有则使用代码
        for period, count in period_counts:
            try:
                bars = _fetch_sw_kline(code, count, period)
                if not bars:
                    continue
                db2 = SessionLocal()
                try:
                    for bar in bars:
                        stmt = sqlite_insert(StockKline).values(
                            code=code,
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
                        db2.execute(stmt)
                    db2.commit()
                except Exception as db_err:
                    db2.rollback()
                    # 记录数据库写入失败
                    record_failed_stock(
                        code=code,
                        name=f"{board_name}({period}K)",
                        reason=f"数据库写入失败: {str(db_err)[:100]}",
                        sync_type="sw_kline",
                    )
                    print(
                        f"[sync_rotation_klines] DB error for {code} {period}: {db_err}"
                    )
                finally:
                    db2.close()
            except Exception as fetch_err:
                # 记录K线获取失败
                record_failed_stock(
                    code=code,
                    name=f"{board_name}({period}K)",
                    reason=f"K线获取失败: {str(fetch_err)[:100]}",
                    sync_type="sw_kline",
                )
                print(
                    f"[sync_rotation_klines] Fetch error for {code} {period}: {fetch_err}"
                )
                continue


@router.post("/sync-klines")
def trigger_sync_klines(force: bool = Query(default=False)):
    """后台异步同步板块轮动 K 线（供前端进入页面时触发）\n\nforce=true 时跳过「今日已更新」判断，强制补拉最新数据。"""
    threading.Thread(target=_sync_rotation_klines, args=(force,), daemon=True).start()
    return {"message": "kline sync started", "force": force}


@router.get("/limit-up-ladder")
def get_limit_up_ladder(
    date: str = Query(default=None, description="交易日期，默认取最新，格式 YYYYMMDD"),
    db: Session = Depends(get_db),
):
    """连板天梯：从东方财富涨停板池获取今日连板数据，按连板数分层展示及板块汇总。"""
    import akshare as ak
    import pandas as pd
    from datetime import date as _date

    # 确定查询日期
    if date:
        query_date = date.replace("-", "")  # 支持 YYYY-MM-DD 或 YYYYMMDD
    else:
        query_date = _date.today().strftime("%Y%m%d")

    # 格式化显示日期 YYYY-MM-DD
    display_date = f"{query_date[:4]}-{query_date[4:6]}-{query_date[6:8]}"

    try:
        df = ak.stock_zt_pool_em(date=query_date)
    except Exception as e:
        return {
            "date": display_date,
            "totalCount": 0,
            "ladder": [],
            "sectorSummary": [],
            "error": str(e),
        }

    if df is None or df.empty:
        return {
            "date": display_date,
            "totalCount": 0,
            "ladder": [],
            "sectorSummary": [],
        }

    # 解析数据
    stocks_list = []
    for _, row in df.iterrows():
        code = str(row.get("代码", "")).strip()
        name = str(row.get("名称", "")).strip().replace(" ", "")
        change_pct = float(row.get("涨跌幅", 0) or 0)
        consecutive = int(row.get("连板数", 1) or 1)
        industry = str(row.get("所属行业", "")).strip()
        seal_time = str(row.get("首次封板时间", "")).strip()  # 格式 HHmmss

        # 一字板判断：封板时间在 092500 ~ 092600 之间（集合竞价封板）
        is_yizi = seal_time.startswith("092") and seal_time <= "092600"

        # 格式化封板时间 HH:mm
        if len(seal_time) >= 4:
            fmt_time = f"{seal_time[:2]}:{seal_time[2:4]}"
        else:
            fmt_time = ""

        stocks_list.append(
            {
                "code": code,
                "name": name,
                "consecutiveDays": consecutive,
                "changePct": round(change_pct, 2),
                "isYizi": is_yizi,
                "sealTime": fmt_time,
                "industry": industry,
                # boards 字段：将行业名称包装为统一格式
                "boards": [{"code": "", "name": industry}] if industry else [],
            }
        )

    # 按连板数分层
    from collections import defaultdict

    ladder_dict: dict[int, list] = defaultdict(list)
    for s in stocks_list:
        ladder_dict[s["consecutiveDays"]].append(s)

    # 按连板数从高到低排序，每层内按封板时间排序（早封板优先）
    ladder = []
    for days in sorted(ladder_dict.keys(), reverse=True):
        stocks_in_level = sorted(
            ladder_dict[days],
            key=lambda x: x["sealTime"] if x["sealTime"] else "99:99",
        )
        ladder.append({"days": days, "stocks": stocks_in_level})

    # 板块汇总：连板 >= 2 的股票，按行业聚合
    sector_count: dict[str, dict] = {}
    for s in stocks_list:
        if s["consecutiveDays"] >= 2 and s["industry"]:
            ind = s["industry"]
            if ind not in sector_count:
                sector_count[ind] = {"code": "", "name": ind, "count": 0}
            sector_count[ind]["count"] += 1

    # 同时统计首板行业分布（用于顶部摘要所有涨停行业）
    all_sector_count: dict[str, int] = {}
    for s in stocks_list:
        if s["industry"]:
            all_sector_count[s["industry"]] = all_sector_count.get(s["industry"], 0) + 1

    sector_summary = sorted(sector_count.values(), key=lambda x: -x["count"])

    # 所有行业分布（按数量排序），用于顶部板块标签展示
    all_sectors = sorted(
        [{"name": k, "count": v} for k, v in all_sector_count.items()],
        key=lambda x: -x["count"],
    )

    return {
        "date": display_date,
        "totalCount": len(stocks_list),
        "ladder": ladder,
        "sectorSummary": sector_summary,
        "allSectors": all_sectors,
    }


@router.get("/limit-up-broken")
def get_limit_up_broken(
    date: str = Query(default=None, description="交易日期，默认取今日，格式 YYYYMMDD"),
    db: Session = Depends(get_db),
):
    """断板股：昨日涨停（有连板历史）但今日未涨停的股票，按昨日连板数从高到低展示。"""
    import akshare as ak
    from datetime import date as _date

    if date:
        query_date = date.replace("-", "")
    else:
        query_date = _date.today().strftime("%Y%m%d")

    display_date = f"{query_date[:4]}-{query_date[4:6]}-{query_date[6:8]}"

    try:
        df = ak.stock_zt_pool_previous_em(date=query_date)
    except Exception as e:
        return {
            "date": display_date,
            "totalCount": 0,
            "broken": [],
            "error": str(e),
        }

    if df is None or df.empty:
        return {
            "date": display_date,
            "totalCount": 0,
            "broken": [],
        }

    # 获取今日涨停板中的股票代码（排除在今日涨停池中的股票）
    try:
        today_zt_df = ak.stock_zt_pool_em(date=query_date)
        today_zt_codes = (
            set(str(r).strip() for r in today_zt_df["代码"].tolist())
            if today_zt_df is not None and not today_zt_df.empty
            else set()
        )
    except Exception:
        today_zt_codes = set()

    broken_list = []
    for _, row in df.iterrows():
        code = str(row.get("代码", "")).strip()
        name = str(row.get("名称", "")).strip().replace(" ", "")
        change_pct = float(row.get("涨跌幅", 0) or 0)
        prev_consecutive = int(row.get("昨日连板数", 1) or 1)
        industry = str(row.get("所属行业", "")).strip()
        prev_seal_time = str(row.get("昨日封板时间", "")).strip()

        # 断板判断：今日不在涨停池中
        if code in today_zt_codes:
            continue

        # 格式化昨日封板时间
        if len(prev_seal_time) >= 4:
            fmt_prev_time = f"{prev_seal_time[:2]}:{prev_seal_time[2:4]}"
        else:
            fmt_prev_time = ""

        # 一字板判断（昨日）
        is_prev_yizi = prev_seal_time.startswith("092") and prev_seal_time <= "092600"

        broken_list.append(
            {
                "code": code,
                "name": name,
                "prevConsecutiveDays": prev_consecutive,
                "changePct": round(change_pct, 2),
                "isPrevYizi": is_prev_yizi,
                "prevSealTime": fmt_prev_time,
                "industry": industry,
            }
        )

    # 按昨日连板数从高到低排序，同连板数内按今日涨跌幅排序（跌幅最大的在前，反映最惨）
    broken_list.sort(key=lambda x: (-x["prevConsecutiveDays"], x["changePct"]))

    # 按昨日连板数分层
    from collections import defaultdict

    broken_dict: dict[int, list] = defaultdict(list)
    for s in broken_list:
        broken_dict[s["prevConsecutiveDays"]].append(s)

    broken_ladder = []
    for days in sorted(broken_dict.keys(), reverse=True):
        broken_ladder.append({"days": days, "stocks": broken_dict[days]})

    # 行业分布统计
    sector_count: dict[str, int] = {}
    for s in broken_list:
        if s["industry"]:
            sector_count[s["industry"]] = sector_count.get(s["industry"], 0) + 1
    all_sectors = sorted(
        [{"name": k, "count": v} for k, v in sector_count.items()],
        key=lambda x: -x["count"],
    )

    return {
        "date": display_date,
        "totalCount": len(broken_list),
        "broken": broken_ladder,
        "allSectors": all_sectors,
    }

    # 6. 查询申万板块成分股，关联每支股票的板块
    # 先看本地数据库是否有成分股数据
    cons_rows = (
        db.query(
            SwIndustryConstituent.stock_code,
            SwIndustryConstituent.stock_name,
            SwIndustryConstituent.board_code,
        )
        .filter(SwIndustryConstituent.stock_code.in_(lookback_codes))
        .all()
    )

    # 本地有成分股数据
    board_map: dict[str, list[str]] = {}  # code -> [board_code, ...]
    stock_name_map: dict[str, str] = {}
    if cons_rows:
        for r in cons_rows:
            board_map.setdefault(r[0], []).append(r[2])
            if r[1]:
                stock_name_map[r[0]] = r[1]

        # 查询板块名称
        board_codes = list({b for bs in board_map.values() for b in bs})
        board_name_rows = (
            db.query(SwIndustry.code, SwIndustry.name)
            .filter(SwIndustry.code.in_(board_codes))
            .all()
        )
        board_name_dict = {r[0]: r[1] for r in board_name_rows}

        for code, info in code_info.items():
            codes_for_stock = board_map.get(code, [])
            info["boards"] = [
                {"code": bc, "name": board_name_dict.get(bc, bc)}
                for bc in codes_for_stock
            ]
    else:
        # 本地无成分股数据，尝试从东财实时接口获取股票名称
        try:
            live_quotes = _fetch_realtime_quotes(lookback_codes)
            for code, q in live_quotes.items():
                if q.get("name"):
                    stock_name_map[code] = q["name"]
        except Exception:
            pass

    # 7. 补充股票名称（从 stock_quote 或 sw_industry_constituent）
    sq_rows = (
        db.query(StockQuote.code, StockQuote.name)
        .filter(StockQuote.code.in_(lookback_codes))
        .all()
    )
    for r in sq_rows:
        if r[1] and r[1].strip():
            stock_name_map[r[0]] = r[1]

    for code, info in code_info.items():
        info["name"] = stock_name_map.get(code, code)

    # 8. 按连板数分层，构建天梯结构
    ladder_dict: dict[int, list] = {}
    for code, info in code_info.items():
        days = info["consecutiveDays"]
        ladder_dict.setdefault(days, []).append(info)

    # 按连板数从高到低排序
    ladder = []
    for days in sorted(ladder_dict.keys(), reverse=True):
        stocks = sorted(ladder_dict[days], key=lambda x: x["changePct"], reverse=True)
        ladder.append({"days": days, "stocks": stocks})

    # 9. 板块汇总：统计各板块出现次数（连板 >= 2 的股票）
    sector_count: dict[str, dict] = {}
    for code, info in code_info.items():
        if info["consecutiveDays"] >= 2:
            for board in info["boards"]:
                bc = board["code"]
                if bc not in sector_count:
                    sector_count[bc] = {"code": bc, "name": board["name"], "count": 0}
                sector_count[bc]["count"] += 1

    sector_summary = sorted(sector_count.values(), key=lambda x: -x["count"])

    return {
        "date": target_date,
        "totalCount": len(code_info),
        "ladder": ladder,
        "sectorSummary": sector_summary,
    }
