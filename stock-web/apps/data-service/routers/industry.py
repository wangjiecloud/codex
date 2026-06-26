from fastapi import APIRouter, Depends, BackgroundTasks, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy import text
from datetime import datetime, date, timedelta
import json

from db import (
    get_db,
    SessionLocal,
    StockQuote,
    StockKline,
    StockFundamental,
    StockNews,
)
from industry_stocks import INDUSTRY_A_SHARES, NON_A_SHARE_SYMBOLS
from bs_session import get_bs, reset_bs
from stock_names import get_stock_name

router = APIRouter()

_sync_running = False


def _to_bs_code(code: str) -> str:
    if code.startswith("6") or code.startswith("5"):
        return f"sh.{code}"
    return f"sz.{code}"


def _safe_float(val, default=0.0) -> float:
    try:
        v = float(str(val).strip())
        return v if v == v else default
    except Exception:
        return default


def _sync_all_quotes():
    global _sync_running
    _sync_running = True
    db = SessionLocal()
    try:
        bs = get_bs()
        today = date.today().strftime("%Y-%m-%d")
        yesterday = (date.today() - timedelta(days=5)).strftime("%Y-%m-%d")
        fields = "date,code,open,high,low,close,preclose,volume,amount,turn,pctChg,peTTM,pbMRQ"
        count = 0
        for raw_code in INDUSTRY_A_SHARES:
            bs_code = _to_bs_code(raw_code)
            try:
                rs = bs.query_history_k_data_plus(
                    bs_code,
                    fields,
                    start_date=yesterday,
                    end_date=today,
                    frequency="d",
                    adjustflag="2",
                )
                row_data = []
                while rs.error_code == "0" and rs.next():
                    row_data.append(rs.get_row_data())
            except Exception as e:
                print(f"[sync_quotes] {raw_code} fetch error: {e}")
                continue

            if not row_data:
                continue

            r = row_data[-1]
            close = _safe_float(r[5])
            preclose = _safe_float(r[6])
            change_amt = round(close - preclose, 4)

            stmt = sqlite_insert(StockQuote).values(
                code=raw_code,
                name=get_stock_name(raw_code),
                price=close,
                change=_safe_float(r[10]),
                change_amt=change_amt,
                open=_safe_float(r[2]),
                prev_close=preclose,
                high=_safe_float(r[3]),
                low=_safe_float(r[4]),
                volume=_safe_float(r[7]),
                turnover=_safe_float(r[8]),
                market_cap=0.0,
                pe=_safe_float(r[11]),
                pb=_safe_float(r[12]),
                turnover_rate=_safe_float(r[9]),
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
                    "pe": stmt.excluded.pe,
                    "pb": stmt.excluded.pb,
                    "turnover_rate": stmt.excluded.turnover_rate,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
            count += 1

        db.commit()
        print(f"[sync_quotes] done, saved {count} rows")
    except Exception as e:
        db.rollback()
        print(f"[sync_quotes] error: {e}")
        import traceback

        traceback.print_exc()
        reset_bs()
    finally:
        db.close()
        _sync_running = False


def _sync_klines(code: str, period: str = "daily"):
    db = SessionLocal()
    bs_period = "d" if period == "daily" else ("w" if period == "weekly" else "m")
    try:
        bs = get_bs()
        bs_code = _to_bs_code(code)
        fields = "date,code,open,high,low,close,volume,amount,turn,pctChg"
        start = (date.today() - timedelta(days=400)).strftime("%Y-%m-%d")
        end = date.today().strftime("%Y-%m-%d")
        rs = bs.query_history_k_data_plus(
            bs_code,
            fields,
            start_date=start,
            end_date=end,
            frequency=bs_period,
            adjustflag="2",
        )
        rows_saved = 0
        while rs.error_code == "0" and rs.next():
            r = rs.get_row_data()
            stmt = sqlite_insert(StockKline).values(
                code=code,
                period=period,
                trade_date=r[0],
                open=_safe_float(r[2]),
                high=_safe_float(r[3]),
                low=_safe_float(r[4]),
                close=_safe_float(r[5]),
                volume=int(_safe_float(r[6])),
                turnover=_safe_float(r[7]),
                change_pct=_safe_float(r[9]),
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
                    "turnover": stmt.excluded.turnover,
                    "change_pct": stmt.excluded.change_pct,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
            rows_saved += 1
        db.commit()
        print(f"[sync_klines] {code} done, {rows_saved} bars")
    except Exception as e:
        db.rollback()
        print(f"[sync_klines] {code} error: {e}")
        reset_bs()
    finally:
        db.close()


def _sync_fundamental(code: str):
    db = SessionLocal()
    try:
        bs = get_bs()
        bs_code = _to_bs_code(code)
        rs_profit = bs.query_profit_data(code=bs_code, year=2024, quarter=4)
        profit_row = None
        while rs_profit.error_code == "0" and rs_profit.next():
            profit_row = rs_profit.get_row_data()

        rs_growth = bs.query_growth_data(code=bs_code, year=2024, quarter=4)
        growth_row = None
        while rs_growth.error_code == "0" and rs_growth.next():
            growth_row = rs_growth.get_row_data()

        rs_balance = bs.query_balance_data(code=bs_code, year=2024, quarter=4)
        balance_row = None
        while rs_balance.error_code == "0" and rs_balance.next():
            balance_row = rs_balance.get_row_data()

        if not profit_row:
            return

        raw = json.dumps(
            {
                "profit": profit_row,
                "growth": growth_row,
                "balance": balance_row,
            },
            ensure_ascii=False,
        )

        eps = _safe_float(profit_row[6]) if len(profit_row) > 6 else None
        roe = _safe_float(profit_row[2]) if len(profit_row) > 2 else None
        gross_margin = _safe_float(profit_row[4]) if len(profit_row) > 4 else None
        net_profit = _safe_float(profit_row[5]) if len(profit_row) > 5 else None
        revenue_yoy = (
            _safe_float(growth_row[6]) if growth_row and len(growth_row) > 6 else None
        )
        net_profit_yoy = (
            _safe_float(growth_row[4]) if growth_row and len(growth_row) > 4 else None
        )
        debt_ratio = (
            _safe_float(balance_row[6])
            if balance_row and len(balance_row) > 6
            else None
        )
        report_date = profit_row[0] if profit_row else ""

        stmt = sqlite_insert(StockFundamental).values(
            code=code,
            report_date=report_date,
            eps=eps,
            roe=roe,
            revenue=None,
            revenue_yoy=revenue_yoy,
            net_profit=net_profit,
            net_profit_yoy=net_profit_yoy,
            gross_margin=gross_margin,
            debt_ratio=debt_ratio,
            raw_json=raw,
            updated_at=datetime.utcnow(),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["code"],
            set_={
                "report_date": stmt.excluded.report_date,
                "eps": stmt.excluded.eps,
                "roe": stmt.excluded.roe,
                "revenue": stmt.excluded.revenue,
                "revenue_yoy": stmt.excluded.revenue_yoy,
                "net_profit": stmt.excluded.net_profit,
                "net_profit_yoy": stmt.excluded.net_profit_yoy,
                "gross_margin": stmt.excluded.gross_margin,
                "debt_ratio": stmt.excluded.debt_ratio,
                "raw_json": stmt.excluded.raw_json,
                "updated_at": stmt.excluded.updated_at,
            },
        )
        db.execute(stmt)
        db.commit()
        print(f"[sync_fundamental] {code} done")
    except Exception as e:
        db.rollback()
        print(f"[sync_fundamental] {code} error: {e}")
        reset_bs()
    finally:
        db.close()


def _sync_news(code: str):
    print(f"[sync_news] {code}: baostock has no news API, skipping")


@router.get("/stocks")
async def get_industry_quotes(
    codes: str = Query("", description="逗号分隔的股票代码，留空返回全部产业链"),
    db: Session = Depends(get_db),
):
    code_list = (
        [c.strip() for c in codes.split(",") if c.strip()]
        if codes
        else INDUSTRY_A_SHARES
    )
    rows = db.query(StockQuote).filter(StockQuote.code.in_(code_list)).all()
    result = {}
    for row in rows:
        result[row.code] = {
            "code": row.code,
            "name": row.name,
            "price": row.price,
            "change": row.change,
            "changeAmt": row.change_amt,
            "open": row.open,
            "prevClose": row.prev_close,
            "high": row.high,
            "low": row.low,
            "volume": row.volume,
            "turnover": row.turnover,
            "marketCap": row.market_cap,
            "pe": row.pe,
            "pb": row.pb,
            "turnoverRate": row.turnover_rate,
            "amplitude": row.amplitude,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        }
    return {"quotes": result, "total": len(result)}


@router.post("/sync")
async def trigger_sync(background_tasks: BackgroundTasks):
    if _sync_running:
        return {"status": "already_running"}
    background_tasks.add_task(_sync_all_quotes)
    return {"status": "started", "codes": len(INDUSTRY_A_SHARES)}


@router.post("/sync/kline/{code}")
async def sync_kline(
    code: str,
    period: str = Query("daily"),
    background_tasks: BackgroundTasks = None,
):
    if code not in INDUSTRY_A_SHARES:
        raise HTTPException(status_code=400, detail="Not an industry stock")
    background_tasks.add_task(_sync_klines, code, period)
    return {"status": "started", "code": code, "period": period}


@router.post("/sync/fundamental/{code}")
async def sync_fundamental(
    code: str,
    background_tasks: BackgroundTasks,
):
    if code not in INDUSTRY_A_SHARES:
        raise HTTPException(status_code=400, detail="Not an industry stock")
    background_tasks.add_task(_sync_fundamental, code)
    return {"status": "started", "code": code}


@router.post("/sync/news/{code}")
async def sync_news_for(
    code: str,
    background_tasks: BackgroundTasks,
):
    background_tasks.add_task(_sync_news, code)
    return {"status": "started", "code": code}


@router.get("/news")
async def get_industry_news(
    codes: str = Query("", description="逗号分隔的股票代码"),
    limit: int = Query(50, ge=5, le=200),
    db: Session = Depends(get_db),
):
    code_list = (
        [c.strip() for c in codes.split(",") if c.strip()]
        if codes
        else INDUSTRY_A_SHARES
    )
    rows = (
        db.query(StockNews)
        .filter(StockNews.code.in_(code_list))
        .order_by(StockNews.pub_time.desc())
        .limit(limit)
        .all()
    )
    return {
        "news": [
            {
                "code": r.code,
                "title": r.title,
                "url": r.url,
                "source": r.source,
                "pubTime": r.pub_time,
            }
            for r in rows
        ]
    }


@router.get("/non-a-shares")
async def get_non_a_share_info():
    return {"symbols": NON_A_SHARE_SYMBOLS}


@router.get("/stock-industry-map")
async def get_stock_industry_map():
    industry_map = {
        "pcb": [
            "600176",
            "603256",
            "601208",
            "688300",
            "688388",
            "301217",
            "301511",
            "600549",
            "600183",
            "688183",
            "603186",
            "688519",
            "301377",
            "000657",
            "002916",
            "002436",
            "002463",
            "300476",
            "002938",
            "601138",
            "002475",
            "688082",
            "688003",
            "688630",
            "002594",
        ],
        "mlcc": [
            "300285",
            "002601",
            "601899",
            "000878",
            "000636",
            "300408",
            "002138",
            "002859",
            "601138",
            "002475",
            "688686",
            "002594",
        ],
        "memory": [
            "600206",
            "300666",
            "002409",
            "688268",
            "688126",
            "688300",
            "688019",
            "300054",
            "603986",
            "688008",
            "688525",
            "301308",
            "300475",
            "688627",
            "688361",
            "601138",
            "000977",
        ],
        "optics": [
            "002281",
            "688498",
            "688048",
            "688313",
            "600703",
            "300394",
            "300620",
            "300570",
            "300548",
            "300308",
            "300502",
            "000988",
            "603083",
        ],
        "fiber": [
            "300395",
            "688268",
            "002064",
            "601869",
            "600487",
            "600522",
            "600498",
        ],
        "liquidcool": [
            "300547",
            "601992",
            "605288",
            "300602",
            "301018",
            "300499",
            "002837",
            "688861",
            "300249",
            "601138",
        ],
        "aipower": [
            "600563",
            "002245",
            "688601",
            "603290",
            "688396",
            "600089",
            "002851",
            "002364",
            "002335",
            "300870",
            "002518",
            "688676",
        ],
        "coppercable": ["000630", "600110", "002130", "300913", "603465", "603659"],
        "aigpu": [
            "301269",
            "688521",
            "600584",
            "688256",
            "688041",
            "300474",
            "603019",
            "000977",
        ],
        "idc": ["000063", "002518", "002837", "603912", "300442", "300738", "300383"],
    }

    stock_to_industries: dict[str, list[str]] = {}
    for industry_id, codes in industry_map.items():
        for code in codes:
            stock_to_industries.setdefault(code, [])
            if industry_id not in stock_to_industries[code]:
                stock_to_industries[code].append(industry_id)

    return {"mapping": stock_to_industries}


@router.get("/perf")
async def get_stock_performance(db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
        WITH
        latest AS (
            SELECT code, close AS cur
            FROM stock_kline
            WHERE period = 'daily'
              AND (code, trade_date) IN (
                  SELECT code, MAX(trade_date)
                  FROM stock_kline
                  WHERE period = 'daily'
                  GROUP BY code
              )
        ),
        ref_jan AS (
            SELECT code, close AS base_jan
            FROM stock_kline
            WHERE period = 'daily'
              AND (code, trade_date) IN (
                  SELECT code, MIN(trade_date)
                  FROM stock_kline
                  WHERE period = 'daily' AND trade_date >= '2026-01-01'
                  GROUP BY code
              )
        ),
        ref_may AS (
            SELECT code, close AS base_may
            FROM stock_kline
            WHERE period = 'daily'
              AND (code, trade_date) IN (
                  SELECT code, MIN(trade_date)
                  FROM stock_kline
                  WHERE period = 'daily' AND trade_date >= '2026-05-01'
                  GROUP BY code
              )
        )
        SELECT l.code,
               ROUND((l.cur - j.base_jan) / j.base_jan * 100, 2) AS ytd,
               ROUND((l.cur - m.base_may) / m.base_may * 100, 2) AS m5
        FROM latest l
        LEFT JOIN ref_jan j ON j.code = l.code
        LEFT JOIN ref_may m ON m.code = l.code
    """)
    ).fetchall()

    result: dict[str, dict] = {}
    for code, ytd, m5 in rows:
        result[code] = {
            "ytd": ytd,
            "m5": m5,
        }
    return {"perf": result}
