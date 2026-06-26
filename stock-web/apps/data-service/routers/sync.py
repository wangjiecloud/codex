from fastapi import APIRouter, BackgroundTasks
from datetime import datetime
import threading
import time as _time

from routers.industry import _sync_all_quotes, _sync_klines
from db import SessionLocal, StockMeta

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
