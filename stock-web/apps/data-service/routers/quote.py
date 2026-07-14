from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, date, timedelta

from db import SessionLocal, StockQuote, StockMeta
from bs_session import get_bs, reset_bs

router = APIRouter()

_quote_refresh_lock: set[str] = set()
_QUOTE_STALE_HOURS = 4  # 当天已同步时，最多缓存4小时


@router.get("/search")
async def search_stocks(q: str = Query("", description="股票代码或名称关键字")):
    if not q.strip():
        return {"results": []}
    keyword = q.strip().lower()

    def _fetch():
        db = SessionLocal()
        try:
            rows = (
                db.query(StockMeta.code, StockMeta.name, StockMeta.market)
                .filter(StockMeta.market.in_(["A股", "SH", "SZ"]))
                .all()
            )
            results = [
                {"code": r.code, "name": r.name, "market": r.market}
                for r in rows
                if keyword in r.code.lower() or keyword in (r.name or "").lower()
            ]
            results.sort(key=lambda x: (not x["code"].startswith(q.strip()), x["code"]))
            return {"results": results[:20]}
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


@router.get("/industries")
async def get_stock_industries(codes: list[str] = Query([], description="股票代码列表")):
    """
    批量获取股票所属行业
    优先返回申万行业分类，查不到时使用产业分类（industry_ids 第一个）
    返回格式: { "600000": "银行", "000001": "银行", ... }
    """
    if not codes:
        return {}

    def _fetch():
        db = SessionLocal()
        try:
            from db import SwIndustry, SwIndustryConstituent, IndustryMeta
            import json
            # 查询申万行业
            result = {}
            for code in codes:
                # 优先查询申万行业
                row = (
                    db.query(SwIndustry.name)
                    .join(
                        SwIndustryConstituent,
                        SwIndustry.code == SwIndustryConstituent.board_code,
                    )
                    .filter(SwIndustryConstituent.stock_code == code)
                    .first()
                )
                if row and row[0]:
                    result[code] = row[0]
                else:
                    # 申万行业查不到，尝试使用产业分类
                    meta = db.query(StockMeta).filter(StockMeta.code == code).first()
                    if meta and meta.industry_ids:
                        try:
                            industry_ids = json.loads(meta.industry_ids) if isinstance(meta.industry_ids, str) else meta.industry_ids
                            if industry_ids and len(industry_ids) > 0:
                                # 查询产业名称
                                industry = db.query(IndustryMeta).filter(IndustryMeta.industry_id == industry_ids[0]).first()
                                if industry and industry.title:
                                    result[code] = industry.title
                                else:
                                    result[code] = "未分类"
                            else:
                                result[code] = "未分类"
                        except:
                            result[code] = "未分类"
                    else:
                        result[code] = "未分类"
            return result
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


def get_stock_name(code: str) -> str:
    """Get stock name from DB."""
    db = SessionLocal()
    try:
        row = db.query(StockMeta).filter(StockMeta.code == code).first()
        return row.name if row else ""
    finally:
        db.close()


def _to_bs_code(code: str) -> str:
    if code.startswith("6") or code.startswith("5"):
        return f"sh.{code}"
    return f"sz.{code}"


def _fetch_total_share(bs_code: str) -> float:
    """通过 baostock query_profit_data 获取总股本（股），最多回退 8 个季度。"""
    bs = get_bs()
    today = date.today()
    year = today.year
    quarter = (today.month - 1) // 3 + 1
    for _ in range(8):
        try:
            rs = bs.query_profit_data(code=bs_code, year=year, quarter=quarter)
            rows = []
            while rs.error_code == "0" and rs.next():
                rows.append(rs.get_row_data())
            if rows:
                ts = float(rows[0][9]) if rows[0][9] else 0.0
                if ts > 0:
                    return ts
        except Exception:
            pass
        quarter -= 1
        if quarter == 0:
            year -= 1
            quarter = 4
    return 0.0


def _is_a_share(code: str) -> bool:
    if not code or len(code) != 6:
        return False
    if code.startswith("0") or code.startswith("3"):
        return True
    if code.startswith("6") or code.startswith("688"):
        return True
    return False


def _safe_float(val, default=0.0) -> float:
    try:
        v = float(str(val).strip())
        return v if v == v else default
    except Exception:
        return default


def _fetch_and_cache_quote(code: str, update_market_cap: bool = False) -> dict:
    if not _is_a_share(code):
        raise HTTPException(
            status_code=501,
            detail=f"Real-time quotes not supported for non-A-share stock: {code}",
        )

    db = SessionLocal()
    try:
        bs = get_bs()
        bs_code = _to_bs_code(code)
        today = date.today().strftime("%Y-%m-%d")
        start = (date.today() - timedelta(days=5)).strftime("%Y-%m-%d")
        fields = "date,code,open,high,low,close,preclose,volume,amount,turn,pctChg,peTTM,pbMRQ"
        rs = bs.query_history_k_data_plus(
            bs_code,
            fields,
            start_date=start,
            end_date=today,
            frequency="d",
            adjustflag="2",
        )
        row_data = []
        while rs.error_code == "0" and rs.next():
            row_data.append(rs.get_row_data())

        if not row_data:
            raise HTTPException(status_code=404, detail=f"Stock {code} not found")

        r = row_data[-1]

        # 校验 baostock 返回的 code 字段（index=1）是否与请求的 code 一致
        # 防止 baostock session 串码——游标错位时返回的是别的股票数据
        returned_bs_code = str(r[1]).strip()  # e.g. "sh.688012"
        expected_bs_code = bs_code.lower()     # e.g. "sh.688012"
        if returned_bs_code.lower() != expected_bs_code:
            print(f"[quote] {code} baostock串码：请求 {expected_bs_code}，返回 {returned_bs_code}，重置session并拒绝写入")
            reset_bs()
            # 降级返回已有缓存
            existing = db.query(StockQuote).filter(StockQuote.code == code).first()
            if existing and existing.price and existing.price > 0:
                return _row_to_dict(existing, "baostock串码，返回缓存数据")
            raise HTTPException(status_code=503, detail=f"baostock code mismatch for {code}, please retry")
        close = round(_safe_float(r[5]), 4)
        preclose = round(_safe_float(r[6]), 4)

        # 计算总市值：仅在 update_market_cap=True 时才调用 baostock（耗时约1.6s/只）
        # 普通行情刷新时直接读数据库已有市值，避免大量并发时超时
        if update_market_cap:
            total_share = _fetch_total_share(bs_code)
            market_cap = round(close * total_share, 2) if total_share > 0 else 0.0
        else:
            existing_q = db.query(StockQuote).filter(StockQuote.code == code).first()
            market_cap = float(existing_q.market_cap) if existing_q and existing_q.market_cap else 0.0

        # 价格合理性校验：与 kline 最新收盘价偏差超过 25% 时，拒绝写入，返回已有缓存
        # 25% 能覆盖科创板/创业板 ±20% 涨跌停上限，同时拦住 baostock 串码（偏差通常 >100%）
        if close > 0:
            from db import StockKline
            kline_ref = (
                db.query(StockKline.close)
                .filter(StockKline.code == code, StockKline.period == "daily")
                .order_by(StockKline.trade_date.desc())
                .first()
            )
            if kline_ref and kline_ref[0] and float(kline_ref[0]) > 0:
                diff_pct = abs(close - float(kline_ref[0])) / float(kline_ref[0]) * 100
                if diff_pct > 25:
                    print(f"[quote] {code} baostock价格异常：{close} vs kline={kline_ref[0]}，偏差{diff_pct:.1f}%，返回缓存数据")
                    # 返回已有缓存数据，不写入异常值
                    existing = db.query(StockQuote).filter(StockQuote.code == code).first()
                    if existing and existing.price and existing.price > 0:
                        return _row_to_dict(existing)
                    # 无缓存则用 kline 数据构建返回值（不写库）
                    raise HTTPException(status_code=503, detail=f"baostock returned abnormal price for {code}, please retry later")

        result = {
            "code": code,
            "name": get_stock_name(code),
            "price": close,
            "change": round(_safe_float(r[10]), 4),
            "changeAmt": round(close - preclose, 4),
            "open": round(_safe_float(r[2]), 4),
            "prevClose": preclose,
            "high": round(_safe_float(r[3]), 4),
            "low": round(_safe_float(r[4]), 4),
            "volume": _safe_float(r[7]),
            "turnover": _safe_float(r[8]),
            "marketCap": market_cap,
            "pe": round(_safe_float(r[11]), 4),
            "pb": round(_safe_float(r[12]), 4),
            "turnoverRate": round(_safe_float(r[9]), 4),
            "amplitude": 0.0,
            "updatedAt": datetime.utcnow().isoformat(),
        }

        stmt = sqlite_insert(StockQuote).values(
            code=code,
            name=get_stock_name(code),
            price=result["price"],
            change=result["change"],
            change_amt=result["changeAmt"],
            open=result["open"],
            prev_close=result["prevClose"],
            high=result["high"],
            low=result["low"],
            volume=result["volume"],
            turnover=result["turnover"],
            market_cap=result["marketCap"],
            pe=result["pe"],
            pb=result["pb"],
            turnover_rate=result["turnoverRate"],
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
                "turnover_rate": stmt.excluded.turnover_rate,
                "updated_at": stmt.excluded.updated_at,
            },
        )
        db.execute(stmt)
        db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        reset_bs()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


def _row_to_dict(r: StockQuote, warning: str | None = None) -> dict:
    d = {
        "code": r.code,
        "name": r.name,
        "price": r.price,
        "change": r.change,
        "changeAmt": r.change_amt,
        "open": r.open,
        "prevClose": r.prev_close,
        "high": r.high,
        "low": r.low,
        "volume": r.volume,
        "turnover": r.turnover,
        "marketCap": r.market_cap,
        "pe": r.pe,
        "pb": r.pb,
        "turnoverRate": r.turnover_rate,
        "amplitude": r.amplitude,
        "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
    }
    if warning:
        d["cacheWarning"] = warning
    return d


@router.get("/batch")
async def get_batch_quotes(codes: list[str] = Query([], description="股票代码列表")):
    """批量获取股票行情（从缓存读取，不触发刷新）"""
    if not codes:
        return {"quotes": []}

    def _fetch():
        db = SessionLocal()
        try:
            rows = db.query(StockQuote).filter(StockQuote.code.in_(codes)).all()
            return {"quotes": [_row_to_dict(r) for r in rows]}
        finally:
            db.close()

    return await run_in_threadpool(_fetch)


@router.get("/{code}")
async def get_quote(code: str):
    def _read_cached():
        db = SessionLocal()
        try:
            return db.query(StockQuote).filter(StockQuote.code == code).first()
        finally:
            db.close()

    row = await run_in_threadpool(_read_cached)

    def _needs_refresh(r: StockQuote) -> bool:
        if r.price == 0 or r.updated_at is None:
            return True
        # 用北京时间日期判断：不是今天同步的就强制刷新
        today_cst = (datetime.utcnow() + timedelta(hours=8)).date()
        record_date_cst = (r.updated_at + timedelta(hours=8)).date()
        if record_date_cst < today_cst:
            return True
        # 今天的数据，4小时内使用缓存
        age_hours = (datetime.utcnow() - r.updated_at).total_seconds() / 3600
        return age_hours >= _QUOTE_STALE_HOURS

    def _bg_refresh(c: str) -> None:
        if c in _quote_refresh_lock:
            return
        _quote_refresh_lock.add(c)
        try:
            _fetch_and_cache_quote(c)
        except Exception:
            pass
        finally:
            _quote_refresh_lock.discard(c)

    if row and not _needs_refresh(row):
        return JSONResponse(content=_row_to_dict(row))

    # 缓存过期或无缓存，同步拉取最新数据
    try:
        result = await run_in_threadpool(_fetch_and_cache_quote, code)
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception:
        # 拉取失败时降级返回旧缓存
        if row:
            return JSONResponse(content=_row_to_dict(row, "数据可能不是最新，获取失败"))
        raise HTTPException(status_code=404, detail=f"No quote data for {code}")


import threading as _threading

_market_cap_sync_running = False

def _do_sync_market_cap_bg():
    """后台线程：批量用 baostock 总股本 × 价格更新所有 market_cap=0 的股票"""
    global _market_cap_sync_running
    try:
        db = SessionLocal()
        rows = db.query(StockQuote.code, StockQuote.price).filter(
            (StockQuote.market_cap == None) | (StockQuote.market_cap == 0.0)
        ).all()
        targets = [(r.code, r.price) for r in rows if _is_a_share(r.code) and r.price and r.price > 0]
        db.close()

        # 找有效季度（2026 Q1）
        today = date.today()
        year = today.year
        quarter = (today.month - 1) // 3 + 1
        eff_year, eff_quarter = year, quarter
        for _ in range(6):
            eff_quarter -= 1
            if eff_quarter == 0:
                eff_year -= 1; eff_quarter = 4
            rs_test = get_bs().query_profit_data(code="sh.600877", year=eff_year, quarter=eff_quarter)
            test_rows = []
            while rs_test.error_code == "0" and rs_test.next():
                test_rows.append(rs_test.get_row_data())
            if test_rows and test_rows[0][9]:
                break

        print(f"[sync-market-cap] 开始同步 {len(targets)} 只股票，使用 {eff_year} Q{eff_quarter} 数据")
        updated = failed = 0
        batch_db = SessionLocal()
        for i, (code, price) in enumerate(targets):
            try:
                bs_code = _to_bs_code(code)
                rs = get_bs().query_profit_data(code=bs_code, year=eff_year, quarter=eff_quarter)
                rows_data = []
                while rs.error_code == "0" and rs.next():
                    rows_data.append(rs.get_row_data())
                if rows_data and rows_data[0][9]:
                    ts = float(rows_data[0][9])
                    if ts > 0:
                        batch_db.query(StockQuote).filter(StockQuote.code == code).update({"market_cap": round(price * ts, 2)})
                        updated += 1
                        if updated % 50 == 0:
                            batch_db.commit()
                            print(f"[sync-market-cap] 进度 {i+1}/{len(targets)}, 已更新 {updated}")
                        continue
                failed += 1
            except Exception as e:
                failed += 1
                print(f"[sync-market-cap] {code} 失败: {e}")
        batch_db.commit()
        batch_db.close()
        print(f"[sync-market-cap] 完成: updated={updated}, failed={failed}")
    except Exception as e:
        print(f"[sync-market-cap] 异常: {e}")
    finally:
        _market_cap_sync_running = False


@router.post("/sync-market-cap")
async def sync_all_market_cap():
    """后台异步同步所有 market_cap=0 的股票市值（总股本 × 现价）。立即返回，后台运行。"""
    global _market_cap_sync_running
    if _market_cap_sync_running:
        return {"status": "already_running", "message": "市值同步任务正在运行中"}
    _market_cap_sync_running = True
    t = _threading.Thread(target=_do_sync_market_cap_bg, daemon=True)
    t.start()
    # 查询待同步数量
    def _count():
        db = SessionLocal()
        try:
            return db.query(StockQuote).filter(
                (StockQuote.market_cap == None) | (StockQuote.market_cap == 0.0)
            ).count()
        finally:
            db.close()
    total = await run_in_threadpool(_count)
    return {"status": "started", "total": total, "message": f"后台开始同步 {total} 只股票市值，请稍后查看日志"}
