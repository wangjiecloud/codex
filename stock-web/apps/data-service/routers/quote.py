from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, date, timedelta
from typing import Optional
import requests

from db import SessionLocal, StockQuote, StockMeta

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
async def get_stock_industries(
    codes: list[str] = Query([], description="股票代码列表"),
):
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
                            industry_ids = (
                                json.loads(meta.industry_ids)
                                if isinstance(meta.industry_ids, str)
                                else meta.industry_ids
                            )
                            if industry_ids and len(industry_ids) > 0:
                                # 查询产业名称
                                industry = (
                                    db.query(IndustryMeta)
                                    .filter(IndustryMeta.industry_id == industry_ids[0])
                                    .first()
                                )
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


def _to_sina_symbol(code: str) -> str:
    if code.startswith("6") or code.startswith("5"):
        return f"sh{code}"
    return f"sz{code}"


def _fetch_and_cache_quote(code: str, update_market_cap: bool = False) -> dict:
    if not _is_a_share(code):
        raise HTTPException(
            status_code=501,
            detail=f"Real-time quotes not supported for non-A-share stock: {code}",
        )

    db = SessionLocal()
    try:
        sina_symbol = _to_sina_symbol(code)
        url = f"https://hq.sinajs.cn/list={sina_symbol}"
        headers = {"Referer": "https://finance.sina.com.cn"}
        r = requests.get(url, headers=headers, timeout=10)
        r.encoding = "gbk"
        line = r.text.strip()
        if not line or '=""' in line:
            raise HTTPException(status_code=404, detail=f"Stock {code} not found")

        import re

        m = re.search(r'"([^"]*)"', line)
        if not m or not m.group(1):
            raise HTTPException(status_code=404, detail=f"Stock {code} not found")
        fields = m.group(1).split(",")
        if len(fields) < 10:
            raise HTTPException(status_code=404, detail=f"Stock {code} malformed data")

        name = fields[0]
        open_price = _safe_float(fields[1])
        preclose = _safe_float(fields[2])
        close = _safe_float(fields[3])
        high = _safe_float(fields[4])
        low = _safe_float(fields[5])
        volume = _safe_float(fields[8])
        turnover = _safe_float(fields[9])
        change_pct = (
            round((close - preclose) / preclose * 100, 4) if preclose > 0 else 0.0
        )
        change_amt = round(close - preclose, 4) if preclose > 0 else 0.0

        if update_market_cap:
            try:
                import akshare as ak

                df = ak.stock_zh_a_spot_em()
                row = df[df["代码"] == code]
                if not row.empty:
                    market_cap = _safe_float(row.iloc[0].get("总市值", 0))
                else:
                    market_cap = 0.0
            except Exception:
                market_cap = 0.0
        else:
            existing_q = db.query(StockQuote).filter(StockQuote.code == code).first()
            market_cap = (
                float(existing_q.market_cap)
                if existing_q and existing_q.market_cap
                else 0.0
            )

        result = {
            "code": code,
            "name": name,
            "price": round(close, 4),
            "change": change_pct,
            "changeAmt": change_amt,
            "open": round(open_price, 4),
            "prevClose": round(preclose, 4),
            "high": round(high, 4),
            "low": round(low, 4),
            "volume": volume,
            "turnover": turnover,
            "marketCap": market_cap,
            "pe": 0.0,
            "pb": 0.0,
            "turnoverRate": 0.0,
            "amplitude": 0.0,
            "updatedAt": datetime.utcnow().isoformat(),
        }

        existing_pe_pb = db.query(StockQuote).filter(StockQuote.code == code).first()
        if existing_pe_pb:
            if existing_pe_pb.pe:
                result["pe"] = float(existing_pe_pb.pe)
            if existing_pe_pb.pb:
                result["pb"] = float(existing_pe_pb.pb)
            if existing_pe_pb.turnover_rate:
                result["turnoverRate"] = float(existing_pe_pb.turnover_rate)

        stmt = sqlite_insert(StockQuote).values(
            code=code,
            name=name,
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


def _row_to_dict(r: StockQuote, warning: Optional[str] = None) -> dict:
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
        now_cst = datetime.utcnow() + timedelta(hours=8)
        today_cst = now_cst.date()
        record_date_cst = (r.updated_at + timedelta(hours=8)).date()
        market_closed_today = now_cst.weekday() < 5 and (
            now_cst.hour > 15 or (now_cst.hour == 15 and now_cst.minute >= 30)
        )
        last_valid_trade_date = (
            today_cst if market_closed_today else today_cst - timedelta(days=1)
        )
        while last_valid_trade_date.weekday() >= 5:
            last_valid_trade_date -= timedelta(days=1)
        if record_date_cst < last_valid_trade_date:
            return True
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

    if row:
        if _needs_refresh(row):
            _threading.Thread(target=_bg_refresh, args=(code,), daemon=True).start()
            return JSONResponse(
                content=_row_to_dict(row, "数据可能不是最新，后台刷新中")
            )
        return JSONResponse(content=_row_to_dict(row))

    if code not in _quote_refresh_lock:
        _threading.Thread(target=_bg_refresh, args=(code,), daemon=True).start()
    raise HTTPException(status_code=404, detail=f"No cached quote data for {code}")


import threading as _threading

_market_cap_sync_running = False


def _do_sync_market_cap_bg():
    """后台线程：用 akshare stock_zh_a_spot_em 批量更新所有 market_cap=0 的股票市值"""
    global _market_cap_sync_running
    try:
        db = SessionLocal()
        rows = (
            db.query(StockQuote.code)
            .filter((StockQuote.market_cap == None) | (StockQuote.market_cap == 0.0))
            .all()
        )
        target_codes = {r.code for r in rows if _is_a_share(r.code)}
        db.close()

        if not target_codes:
            print("[sync-market-cap] 无需同步，所有股票市值已填充")
            return

        print(f"[sync-market-cap] 开始同步 {len(target_codes)} 只股票市值 (akshare)")
        import akshare as ak

        df = ak.stock_zh_a_spot_em()
        updated = failed = 0
        batch_db = SessionLocal()
        for _, row in df.iterrows():
            code = str(row.get("代码", "")).strip()
            if code not in target_codes:
                continue
            mc = _safe_float(row.get("总市值", 0))
            if mc > 0:
                batch_db.query(StockQuote).filter(StockQuote.code == code).update(
                    {"market_cap": round(mc, 2)}
                )
                updated += 1
                if updated % 100 == 0:
                    batch_db.commit()
                    print(f"[sync-market-cap] 已更新 {updated}")
            else:
                failed += 1
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
            return (
                db.query(StockQuote)
                .filter(
                    (StockQuote.market_cap == None) | (StockQuote.market_cap == 0.0)
                )
                .count()
            )
        finally:
            db.close()

    total = await run_in_threadpool(_count)
    return {
        "status": "started",
        "total": total,
        "message": f"后台开始同步 {total} 只股票市值，请稍后查看日志",
    }
