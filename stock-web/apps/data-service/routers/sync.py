from fastapi import APIRouter, BackgroundTasks
from datetime import datetime
import threading
import time as _time
import json

from routers.industry import _sync_all_quotes, _sync_klines
from db import SessionLocal, StockMeta, StockFundamental
from eastmoney_scraper import fetch_stock_info, fetch_stock_fundamental
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

router = APIRouter()

_status: dict = {
    "running": False,
    "phase": "",
    "total": 0,
    "done": 0,
    "current": "",
    "started_at": "",
    "finished_at": "",
}
_lock = threading.Lock()


def _run_full_sync():
    db = SessionLocal()
    try:
        codes = [row.code for row in db.query(StockMeta.code).all()]
    finally:
        db.close()

    with _lock:
        _status.update(
            running=True,
            phase="quotes",
            total=len(codes),
            done=0,
            current="",
            started_at=datetime.utcnow().isoformat(),
            finished_at="",
        )

    print(f"[sync] starting quotes for {len(codes)} stocks")
    _sync_all_quotes()

    with _lock:
        _status.update(phase="klines", done=0)

    print("[sync] starting klines")
    for i, code in enumerate(codes):
        with _lock:
            _status["current"] = code
            _status["done"] = i
        _sync_klines(code, "daily")
        _time.sleep(0.1)

    with _lock:
        _status.update(
            running=False,
            phase="done",
            current="",
            done=len(codes),
            finished_at=datetime.utcnow().isoformat(),
        )

    print("[sync] finished")


@router.get("/status")
async def get_status():
    with _lock:
        return dict(_status)


@router.post("/all")
async def trigger_sync_all(background_tasks: BackgroundTasks):
    with _lock:
        if _status["running"]:
            return {"status": "already_running", **_status}
    background_tasks.add_task(_run_full_sync)
    return {"status": "started"}


def _run_stock_info_sync():
    db = SessionLocal()
    try:
        codes = [row.code for row in db.query(StockMeta.code).all()]
    finally:
        db.close()

    with _lock:
        _status.update(
            running=True,
            phase="stock_info",
            total=len(codes),
            done=0,
            current="",
            started_at=datetime.utcnow().isoformat(),
            finished_at="",
        )

    print(f"[sync] starting stock info for {len(codes)} stocks")

    for i, code in enumerate(codes):
        with _lock:
            _status["current"] = code
            _status["done"] = i

        try:
            info = fetch_stock_info(code)
            if info:
                db = SessionLocal()
                try:
                    stmt = sqlite_insert(StockMeta).values(
                        code=code,
                        name=info.get("name", ""),
                        market="",
                        industry_ids=info.get("industry", ""),
                        updated_at=datetime.utcnow(),
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["code"],
                        set_={
                            "name": stmt.excluded.name,
                            "industry_ids": stmt.excluded.industry_ids,
                            "updated_at": stmt.excluded.updated_at,
                        },
                    )
                    db.execute(stmt)
                    db.commit()
                    print(f"[sync] updated stock info for {code}")
                except Exception as e:
                    db.rollback()
                    print(f"[sync] error updating stock info for {code}: {e}")
                finally:
                    db.close()
        except Exception as e:
            print(f"[sync] error fetching stock info for {code}: {e}")

        _time.sleep(0.2)

    with _lock:
        _status.update(
            running=False,
            phase="done",
            current="",
            done=len(codes),
            finished_at=datetime.utcnow().isoformat(),
        )

    print("[sync] stock info sync finished")


@router.post("/stock_info")
async def trigger_sync_stock_info(background_tasks: BackgroundTasks):
    with _lock:
        if _status["running"]:
            return {"status": "already_running", **_status}
    background_tasks.add_task(_run_stock_info_sync)
    return {"status": "started"}


def _run_fundamental_sync():
    db = SessionLocal()
    try:
        codes = [row.code for row in db.query(StockMeta.code).all()]
    finally:
        db.close()

    with _lock:
        _status.update(
            running=True,
            phase="fundamental",
            total=len(codes),
            done=0,
            current="",
            started_at=datetime.utcnow().isoformat(),
            finished_at="",
        )

    print(f"[sync] starting fundamental data for {len(codes)} stocks")

    for i, code in enumerate(codes):
        with _lock:
            _status["current"] = code
            _status["done"] = i

        try:
            fund_data = fetch_stock_fundamental(code)
            if fund_data:
                db = SessionLocal()
                try:
                    raw_data = fund_data.get("raw_data", {})

                    def safe_float(val):
                        try:
                            return float(
                                str(val)
                                .replace(",", "")
                                .replace("亿", "")
                                .replace("万", "")
                                .strip()
                                or "0"
                            )
                        except:
                            return 0.0

                    stmt = sqlite_insert(StockFundamental).values(
                        code=code,
                        report_date=fund_data.get("report_date", ""),
                        eps=safe_float(fund_data.get("basic_eps", "0")),
                        roe=safe_float(fund_data.get("roe", "0")),
                        revenue=safe_float(
                            fund_data.get("total_operating_revenue", "0")
                        ),
                        revenue_yoy=0.0,
                        net_profit=safe_float(fund_data.get("net_profit", "0")),
                        net_profit_yoy=0.0,
                        gross_margin=0.0,
                        debt_ratio=0.0,
                        raw_json=json.dumps(raw_data, ensure_ascii=False),
                        updated_at=datetime.utcnow(),
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["code"],
                        set_={
                            "report_date": stmt.excluded.report_date,
                            "eps": stmt.excluded.eps,
                            "roe": stmt.excluded.roe,
                            "revenue": stmt.excluded.revenue,
                            "net_profit": stmt.excluded.net_profit,
                            "raw_json": stmt.excluded.raw_json,
                            "updated_at": stmt.excluded.updated_at,
                        },
                    )
                    db.execute(stmt)
                    db.commit()
                    print(f"[sync] updated fundamental data for {code}")
                except Exception as e:
                    db.rollback()
                    print(f"[sync] error updating fundamental data for {code}: {e}")
                finally:
                    db.close()
        except Exception as e:
            print(f"[sync] error fetching fundamental data for {code}: {e}")

        _time.sleep(0.3)

    with _lock:
        _status.update(
            running=False,
            phase="done",
            current="",
            done=len(codes),
            finished_at=datetime.utcnow().isoformat(),
        )

    print("[sync] fundamental sync finished")


@router.post("/fundamental")
async def trigger_sync_fundamental(background_tasks: BackgroundTasks):
    with _lock:
        if _status["running"]:
            return {"status": "already_running", **_status}
    background_tasks.add_task(_run_fundamental_sync)
    return {"status": "started"}
