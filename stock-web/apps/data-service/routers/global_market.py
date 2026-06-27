from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime
import threading
import requests

import akshare as ak

from db import get_db, SessionLocal, GlobalMarketIndex

router = APIRouter()

_REGION_MAP: dict[str, str] = {
    "000001": "cn",
    "399001": "cn",
    "399006": "cn",
    "000688": "cn",
    "000300": "cn",
    "399005": "cn",
    "HSI": "cn",
    "HSCEI": "cn",
    "HSCCI": "cn",
    "DJIA": "us",
    "SPX": "us",
    "NDX": "us",
    "FTSE": "eu",
    "GDAXI": "eu",
    "FCHI": "eu",
    "SX5E": "eu",
    "MIB": "eu",
    "IBEX": "eu",
    "AEX": "eu",
    "SSMI": "eu",
    "N225": "asia",
    "KS11": "asia",
    "KOSPI200": "asia",
    "TWII": "asia",
    "AS51": "asia",
    "SENSEX": "asia",
    "JKSE": "asia",
    "KLSE": "asia",
    "STI": "asia",
    "VNINDEX": "asia",
    "PSI": "asia",
    "AORD": "asia",
    "NZ50": "asia",
    "SET": "asia",
    "UDI": "other",
    "CRB": "other",
    "BDI": "other",
}

FEATURED_CODES = [
    "000001",
    "399001",
    "399006",
    "000688",
    "000300",
    "HSI",
    "HSCEI",
    "DJIA",
    "SPX",
    "NDX",
    "FTSE",
    "GDAXI",
    "FCHI",
    "N225",
    "KS11",
    "TWII",
    "AS51",
    "UDI",
]

_sync_lock = threading.Lock()
_is_syncing = False


def _safe_float(val, default: float = 0.0) -> float:
    try:
        v = float(str(val).replace(",", "").strip())
        return v if v == v else default
    except Exception:
        return default


def sync_global_indices() -> int:
    global _is_syncing
    with _sync_lock:
        if _is_syncing:
            return 0
        _is_syncing = True

    try:
        df = ak.index_global_spot_em()
        if df is None or df.empty:
            return 0

        db = SessionLocal()
        try:
            count = 0
            for _, row in df.iterrows():
                code = str(row.get("代码", "")).strip()
                if not code:
                    continue
                region = _REGION_MAP.get(code, "other")
                stmt = sqlite_insert(GlobalMarketIndex).values(
                    code=code,
                    name=str(row.get("名称", "")),
                    region=region,
                    price=round(_safe_float(row.get("最新价")), 4),
                    change_amt=round(_safe_float(row.get("涨跌额")), 4),
                    change_pct=round(_safe_float(row.get("涨跌幅")), 4),
                    open=round(_safe_float(row.get("开盘价")), 4),
                    high=round(_safe_float(row.get("最高价")), 4),
                    low=round(_safe_float(row.get("最低价")), 4),
                    prev_close=round(_safe_float(row.get("昨收价")), 4),
                    market_time=str(row.get("最新行情时间", "")),
                    updated_at=datetime.utcnow(),
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["code"],
                    set_={
                        "name": stmt.excluded.name,
                        "price": stmt.excluded.price,
                        "change_amt": stmt.excluded.change_amt,
                        "change_pct": stmt.excluded.change_pct,
                        "open": stmt.excluded.open,
                        "high": stmt.excluded.high,
                        "low": stmt.excluded.low,
                        "prev_close": stmt.excluded.prev_close,
                        "market_time": stmt.excluded.market_time,
                        "updated_at": stmt.excluded.updated_at,
                    },
                )
                db.execute(stmt)
                count += 1
            db.commit()
            from routers.system import sched_log

            sched_log("success", f"全球市场指数同步完成，共 {count} 条")
            return count
        except Exception as e:
            db.rollback()
            from routers.system import sched_log

            sched_log("error", f"全球市场指数同步DB错误: {e}")
            return 0
        finally:
            db.close()
    except Exception as e:
        from routers.system import sched_log

        sched_log("error", f"全球市场指数同步失败: {e}")
        return 0
    finally:
        with _sync_lock:
            _is_syncing = False


def _row_to_dict(row: GlobalMarketIndex) -> dict:
    return {
        "code": row.code,
        "name": row.name,
        "region": row.region,
        "price": row.price,
        "changeAmt": row.change_amt,
        "changePct": row.change_pct,
        "open": row.open,
        "high": row.high,
        "low": row.low,
        "prevClose": row.prev_close,
        "marketTime": row.market_time,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/indices")
def get_all_indices(db: Session = Depends(get_db)):
    rows = (
        db.query(GlobalMarketIndex)
        .order_by(GlobalMarketIndex.region, GlobalMarketIndex.code)
        .all()
    )
    return [_row_to_dict(r) for r in rows]


@router.get("/featured")
def get_featured_indices(db: Session = Depends(get_db)):
    rows_map = {
        r.code: r
        for r in db.query(GlobalMarketIndex)
        .filter(GlobalMarketIndex.code.in_(FEATURED_CODES))
        .all()
    }
    result = []
    for code in FEATURED_CODES:
        if code in rows_map:
            result.append(_row_to_dict(rows_map[code]))
    return result


_EM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.eastmoney.com/",
}

_CN_INDEX_SECIDS = "1.000001,0.399001,0.399006,1.000688,0.899050"
_CN_INDEX_FIELDS = "f1,f2,f3,f4,f12,f14,f15,f16,f17,f18"


def _get_cn_indices() -> list:
    try:
        r = requests.get(
            f"https://push2.eastmoney.com/api/qt/ulist.np/get"
            f"?fltt=2&invt=2&fields={_CN_INDEX_FIELDS}&secids={_CN_INDEX_SECIDS}",
            headers=_EM_HEADERS,
            timeout=10,
        )
        items = r.json().get("data", {}).get("diff", [])
        return [
            {
                "code": it.get("f12", ""),
                "name": it.get("f14", ""),
                "price": _safe_float(it.get("f2")),
                "changePct": _safe_float(it.get("f3")),
                "changeAmt": _safe_float(it.get("f4")),
                "high": _safe_float(it.get("f15")),
                "low": _safe_float(it.get("f16")),
                "open": _safe_float(it.get("f17")),
                "prevClose": _safe_float(it.get("f18")),
            }
            for it in items
        ]
    except Exception as e:
        print(f"[global_market] cn_indices error: {e}")
        return []


def _get_sh_overview() -> dict:
    try:
        r_sh = requests.get(
            "https://push2.eastmoney.com/api/qt/stock/get"
            "?secid=1.000001&fields=f43,f44,f45,f46,f47,f48",
            headers=_EM_HEADERS,
            timeout=10,
        )
        r_sz = requests.get(
            "https://push2.eastmoney.com/api/qt/stock/get?secid=0.399001&fields=f48",
            headers=_EM_HEADERS,
            timeout=10,
        )
        sh = r_sh.json().get("data", {})
        sz = r_sz.json().get("data", {})
        total_turn = _safe_float(sh.get("f48", 0)) + _safe_float(sz.get("f48", 0))

        prev_turn = 0.0
        try:
            df_sh = ak.stock_zh_index_daily_em(symbol="sh000001")
            df_sz = ak.stock_zh_index_daily_em(symbol="sz399001")
            if (
                df_sh is not None
                and len(df_sh) >= 2
                and df_sz is not None
                and len(df_sz) >= 2
            ):
                prev_turn = float(df_sh.iloc[-2]["amount"]) + float(
                    df_sz.iloc[-2]["amount"]
                )
        except Exception:
            pass

        return {
            "todayTurnover": total_turn,
            "prevTurnover": prev_turn,
            "shLatest": _safe_float(sh.get("f43", 0)) / 100,
            "shHigh": _safe_float(sh.get("f44", 0)) / 100,
            "shLow": _safe_float(sh.get("f45", 0)) / 100,
            "shOpen": _safe_float(sh.get("f46", 0)) / 100,
            "shVolume": _safe_float(sh.get("f47", 0)),
        }
    except Exception as e:
        print(f"[global_market] sh_overview error: {e}")
        return {}


def _get_sh_trend() -> list:
    try:
        r = requests.get(
            "https://push2.eastmoney.com/api/qt/stock/trends2/get"
            "?secid=1.000001&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11"
            "&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscca=1",
            headers=_EM_HEADERS,
            timeout=10,
        )
        data = r.json().get("data", {})
        pre_close = _safe_float(data.get("preClose", 0))
        raw = data.get("trends", [])
        result = []
        for item in raw:
            parts = str(item).split(",")
            if len(parts) < 3:
                continue
            t = parts[0].split(" ")[-1]
            price = _safe_float(parts[2])
            if price <= 0:
                continue
            result.append({"time": t, "price": price, "preClose": pre_close})
        return result
    except Exception as e:
        print(f"[global_market] sh_trend error: {e}")
        return []


@router.get("/cn_indices")
def get_cn_indices():
    return _get_cn_indices()


@router.get("/sh_trend")
def get_sh_trend():
    return _get_sh_trend()


@router.get("/overview")
def get_market_overview():
    return _get_sh_overview()


@router.get("/status")
def get_sync_status():
    return {"syncing": _is_syncing}


@router.post("/sync")
def trigger_sync():
    threading.Thread(target=sync_global_indices, daemon=True).start()
    return {"message": "sync started"}
