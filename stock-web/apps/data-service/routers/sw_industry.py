from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, date, timedelta
import threading
import urllib3

from db import (
    get_db,
    SessionLocal,
    SwIndustry,
    SwIndustryConstituent,
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
            from routers.system import sched_log

            sched_log(
                "success", f"申万行业同步完成，共 {count} 个板块", source="scheduler"
            )
            return count
        except Exception as e:
            db.rollback()
            from routers.system import sched_log

            sched_log("error", f"申万行业同步DB错误: {e}", source="scheduler")
            return 0
        finally:
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
    try:
        industry_stocks = _fetch_all_stocks_by_sw2()
    except Exception as e:
        from routers.system import sched_log

        sched_log("error", f"申万成分股批量拉取失败: {e}", source="scheduler")
        return 0

    db = SessionLocal()
    try:
        boards = db.query(SwIndustry).all()
        name_to_code = {b.name: b.code for b in boards}

        total = 0
        for ind_name, stocks in industry_stocks.items():
            board_code = name_to_code.get(ind_name)
            if not board_code:
                continue

            for stock in stocks:
                code = stock["code"]
                sname = stock["name"]
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
        from routers.system import sched_log

        sched_log(
            "success", f"申万成分股批量同步完成，共 {total} 条", source="scheduler"
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


def _fetch_sw_kline(board_code: str, count: int) -> list[dict]:
    import akshare as ak

    df = ak.index_hist_sw(symbol=board_code, period="day")
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
    return bars[-count:]


@router.get("/kline/{board_code}")
async def get_sw_kline(
    board_code: str,
    period: str = Query(default="daily"),
    count: int = Query(default=120, ge=10, le=500),
):
    from fastapi.concurrency import run_in_threadpool

    def _read_cached():
        db = SessionLocal()
        try:
            return (
                db.query(StockKline)
                .filter(StockKline.code == board_code, StockKline.period == period)
                .order_by(StockKline.trade_date.desc())
                .limit(count)
                .all()
            )
        finally:
            db.close()

    rows = await run_in_threadpool(_read_cached)

    if rows:
        return [
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

    def _fetch_and_cache():
        try:
            bars = _fetch_sw_kline(board_code, count)
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
        return bars

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

            top20_codes = [b.code for b in all_boards[:20]]

            industry_codes = list(set(_INDUSTRY_SW_MAP.values()))
            extra_codes = [c for c in industry_codes if c not in top20_codes]

            selected_codes = top20_codes + extra_codes
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

    if not result["dates"]:

        def _bg_sync():
            db = SessionLocal()
            try:
                all_boards = (
                    db.query(SwIndustry).order_by(SwIndustry.change_pct.desc()).all()
                )
                top20 = [b.code for b in all_boards[:20]]
                extra = list(set(_INDUSTRY_SW_MAP.values()))
                codes_to_sync = list(dict.fromkeys(top20 + extra))
            finally:
                db.close()
            for code in codes_to_sync:
                try:
                    bars = _fetch_sw_kline(code, 60)
                    if not bars:
                        continue
                    db2 = SessionLocal()
                    try:
                        for bar in bars:
                            stmt = sqlite_insert(StockKline).values(
                                code=code,
                                period="daily",
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
                    except Exception:
                        db2.rollback()
                    finally:
                        db2.close()
                except Exception:
                    continue

        threading.Thread(target=_bg_sync, daemon=True).start()

    return result
