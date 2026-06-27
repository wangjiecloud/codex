from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime
import threading
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
        r = requests.get(url, headers=_HEADERS, timeout=15)
        items = r.json().get("data", {}).get("diff", [])
        if not items:
            return 0

        db = SessionLocal()
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
            print(
                f"[concept_board] synced {count} boards at {datetime.now().strftime('%H:%M:%S')}"
            )
            return count
        except Exception as e:
            db.rollback()
            print(f"[concept_board] DB error: {e}")
            return 0
        finally:
            db.close()
    except Exception as e:
        print(f"[concept_board] fetch error: {e}")
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
