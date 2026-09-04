from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from datetime import datetime, date, timedelta
import threading
import time
import requests
import pandas as pd

import akshare as ak

from db import get_db, SessionLocal, GlobalMarketIndex, GlobalIndexKline

router = APIRouter()

_REGION_MAP: dict[str, str] = {
    "000001": "cn",
    "399001": "cn",
    "399006": "cn",
    "000688": "cn",
    "000300": "cn",
    "399005": "cn",
    "HSI": "hk",
    "HSCEI": "hk",
    "HSTECH": "hk",
    "DJIA": "us",
    "SPX": "us",
    "NDX": "us",
    "FTSE": "eu",
    "GDAXI": "eu",
    "FCHI": "eu",
    "SX5E": "eu",
    "N225": "asia",
    "KS11": "asia",
    "TWII": "asia",
    "AS51": "asia",
    "SENSEX": "asia",
    "UDI": "other",
    "CRB": "other",
    "BDI": "other",
}

FEATURED_CODES = [
    "000001",
    "399001",
    "399006",
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

# 复盘 tab 需要同步的全球指数 K 线（仅非A股，A 股大盘指数走新浪日K）
# 000680 科创综指：走新浪日K接口
REVIEW_INDEX_CODES = [
    # A 股特殊指数
    "000680",
    # 港股
    "HSI",
    "HSCEI",
    "HSTECH",
    # 美股
    "DJIA",
    "SPX",
    "NDX",
    # 日本/韩国
    "N225",
    "KS11",
]

_sync_lock = threading.Lock()
_is_syncing = False

# 全球指数K线同步锁
_kline_sync_lock = threading.Lock()
_kline_is_syncing = False

_EM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://quote.eastmoney.com/",
}


def _safe_float(val, default: float = 0.0) -> float:
    try:
        v = float(str(val).replace(",", "").strip())
        return v if v == v else default
    except Exception:
        return default


# ─────────────────── 新浪财经 K 线抓取 ───────────────────

# 新浪财经接口映射：code -> (接口类型, 新浪symbol)
_SINA_INDEX_MAP: dict[str, tuple[str, str]] = {
    # 港股：ak.stock_hk_index_daily_sina(symbol)
    "HSI": ("hk", "HSI"),
    "HSCEI": ("hk", "HSCEI"),
    "HSTECH": ("hk", "HSTECH"),
    # 美股：ak.index_us_stock_sina(symbol)
    "DJIA": ("us", ".DJI"),
    "SPX": ("us", ".INX"),
    "NDX": ("us", ".NDX"),
    # 日本/韩国：ak.index_global_hist_sina(symbol) 用中文名
    "N225": ("global", "日经225指数"),
    "KS11": ("global", "首尔综合指数"),
    # A 股指数（走新浪日K直接抓取接口）
    "000680": ("cn_index", "sh000680"),  # 科创综指
}


def _fetch_sina_cn_index_daily(symbol: str) -> Optional[pd.DataFrame]:
    """
    通过新浪财经日K接口抓取 A 股指数数据（新浪日K接口支持的指数，如科创综指 sh000680）。
    symbol: 新浪格式，如 'sh000680'
    返回标准化 DataFrame：date, open, high, low, close, volume
    """
    import re
    import json

    # 新浪日K接口每次最多返回有限条，循环多次获取近 500 个交易日
    # scale=240 表示日K，datalen 最大约 300
    all_bars: list[dict] = []
    var_name = f"_{symbol}_daily"
    url = (
        f"https://quotes.sina.cn/cn/api/jsonp_v2.php/"
        f"var%20{var_name}=/CN_MarketDataService.getKLineData"
        f"?symbol={symbol}&scale=240&datalen=500&ma=no"
    )
    headers = {"Referer": "https://finance.sina.com.cn", "User-Agent": "Mozilla/5.0"}
    try:
        r = requests.get(url, headers=headers, timeout=15)
        text = r.text
        # 提取 JSON 数组
        m = re.search(r"\(\[(.+)\]\)", text, re.DOTALL)
        if not m:
            return None
        items = json.loads("[" + m.group(1) + "]")
        for it in items:
            all_bars.append(
                {
                    "date": it["day"],
                    "open": float(it["open"]),
                    "high": float(it["high"]),
                    "low": float(it["low"]),
                    "close": float(it["close"]),
                    "volume": float(it.get("volume", 0)),
                }
            )
    except Exception as e:
        print(f"[global_kline] sina cn_index fetch failed for {symbol}: {e}")
        return None

    if not all_bars:
        return None
    df = pd.DataFrame(all_bars)
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    df = df.sort_values("date").reset_index(drop=True)
    return df


def _fetch_sina_daily(code: str) -> Optional[pd.DataFrame]:
    """
    从新浪财经抓取全球指数日K数据，返回标准化 DataFrame。
    列：date(str YYYY-MM-DD), open, high, low, close, volume
    """
    entry = _SINA_INDEX_MAP.get(code)
    if not entry:
        return None
    kind, symbol = entry

    for attempt in range(3):
        try:
            if kind == "hk":
                df = ak.stock_hk_index_daily_sina(symbol=symbol)
                # 列名：date, open, high, low, close, volume
                df = df.rename(
                    columns={
                        "date": "date",
                        "open": "open",
                        "high": "high",
                        "low": "low",
                        "close": "close",
                        "volume": "volume",
                    }
                )
            elif kind == "us":
                df = ak.index_us_stock_sina(symbol=symbol)
                # 列名：date, open, high, low, close, volume
                df = df.rename(
                    columns={
                        "date": "date",
                        "open": "open",
                        "high": "high",
                        "low": "low",
                        "close": "close",
                        "volume": "volume",
                    }
                )
            elif kind == "cn_index":
                # A 股指数直接调用新浪财经 K 线接口
                df = _fetch_sina_cn_index_daily(symbol)
                if df is None:
                    return None
            else:  # global
                df = ak.index_global_hist_sina(symbol=symbol)
                # 列名：日期, 开盘, 收盘, 最高, 最低, 成交量
                df = df.rename(
                    columns={
                        "日期": "date",
                        "开盘": "open",
                        "收盘": "close",
                        "最高": "high",
                        "最低": "low",
                        "成交量": "volume",
                    }
                )

            # 统一日期格式为字符串 YYYY-MM-DD
            df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
            for col in ["open", "high", "low", "close"]:
                df[col] = pd.to_numeric(df[col], errors="coerce")
            df["volume"] = pd.to_numeric(df.get("volume", 0), errors="coerce").fillna(0)
            df = df.dropna(subset=["close"]).sort_values("date").reset_index(drop=True)
            return df

        except Exception as e:
            if attempt < 2:
                time.sleep(2)
            else:
                print(f"[global_kline] sina fetch failed for {code}: {e}")
                return None
    return None


def _resample_to_period(df: pd.DataFrame, period: str) -> pd.DataFrame:
    """将日K DataFrame 聚合为周K或月K。"""
    if period == "daily":
        return df

    df = df.copy()
    df["date_dt"] = pd.to_datetime(df["date"])
    df = df.set_index("date_dt")

    freq = "W" if period == "weekly" else "ME"
    resampled = (
        df.resample(freq)
        .agg(
            open=("open", "first"),
            high=("high", "max"),
            low=("low", "min"),
            close=("close", "last"),
            volume=("volume", "sum"),
        )
        .dropna(subset=["close"])
        .reset_index()
    )
    resampled["date"] = resampled["date_dt"].dt.strftime("%Y-%m-%d")
    return resampled[["date", "open", "high", "low", "close", "volume"]]


def _compute_change_pct(df: pd.DataFrame) -> pd.DataFrame:
    """计算涨跌幅（与前一个 close 对比）。"""
    df = df.copy()
    df["change_pct"] = df["close"].pct_change() * 100
    df["change_pct"] = df["change_pct"].fillna(0.0).round(4)
    return df


def _fetch_sina_kline(code: str, period: str, count: int) -> list[dict]:
    """
    通过新浪财经抓取全球指数 K 线。
    返回格式: [{"time": "YYYY-MM-DD", "open", "close", "high", "low", "volume", "change_pct"}, ...]
    period: "daily"/"weekly"/"monthly"
    """
    df = _fetch_sina_daily(code)
    if df is None or df.empty:
        return []

    df = _resample_to_period(df, period)
    df = _compute_change_pct(df)

    result = []
    for _, row in df.tail(count).iterrows():
        result.append(
            {
                "time": str(row["date"]),
                "open": _safe_float(row["open"]),
                "high": _safe_float(row["high"]),
                "low": _safe_float(row["low"]),
                "close": _safe_float(row["close"]),
                "volume": _safe_float(row["volume"]),
                "change_pct": _safe_float(row.get("change_pct", 0.0)),
            }
        )
    return result


# ─────────────────── 数据库写入 ───────────────────


def _save_global_klines(code: str, period: str, bars: list[dict]) -> int:
    """将全球指数 K 线写入 global_index_kline 表，返回写入条数"""
    if not bars:
        return 0
    db = SessionLocal()
    try:
        count = 0
        for bar in bars:
            stmt = sqlite_insert(GlobalIndexKline).values(
                code=code,
                period=period,
                trade_date=bar["time"],
                open=bar["open"],
                high=bar["high"],
                low=bar["low"],
                close=bar["close"],
                volume=bar["volume"],
                change_pct=bar["change_pct"],
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
            count += 1
        db.commit()
        return count
    except Exception as e:
        db.rollback()
        print(f"[global_kline] save failed for {code}/{period}: {e}")
        return 0
    finally:
        db.close()


def fetch_index_kline(code: str, period: str, count: int) -> list[dict]:
    """
    抓取并缓存单个全球指数 K 线，返回格式与 stock_kline 一致（供 kline.py 调用）。
    优先从数据库读取，若不足则触发同步。
    """
    # 先尝试从 DB 读取
    db = SessionLocal()
    try:
        rows = (
            db.query(GlobalIndexKline)
            .filter(
                GlobalIndexKline.code == code,
                GlobalIndexKline.period == period,
            )
            .order_by(GlobalIndexKline.trade_date.asc())
            .all()
        )
        if len(rows) >= count // 2:
            return [
                {
                    "time": r.trade_date,
                    "open": r.open,
                    "high": r.high,
                    "low": r.low,
                    "close": r.close,
                    "volume": r.volume,
                    "turnRate": 0.0,
                    "changePct": r.change_pct,
                }
                for r in rows[-count:]
            ]
    finally:
        db.close()

    # DB 数据不足，实时抓取
    bars = _fetch_sina_kline(code, period, count)
    if bars:
        _save_global_klines(code, period, bars)

    return [
        {
            "time": b["time"],
            "open": b["open"],
            "high": b["high"],
            "low": b["low"],
            "close": b["close"],
            "volume": b["volume"],
            "turnRate": 0.0,
            "changePct": b["change_pct"],
        }
        for b in bars
    ]


def sync_all_review_index_klines() -> int:
    """
    定时任务入口：同步所有复盘指数的日/周/月 K 线。
    """
    global _kline_is_syncing
    with _kline_sync_lock:
        if _kline_is_syncing:
            return 0
        _kline_is_syncing = True

    total = 0
    try:
        for code in REVIEW_INDEX_CODES:
            if code not in _SINA_INDEX_MAP:
                print(f"[global_kline] no sina mapping for {code}, skip")
                continue
            # 先抓日K，再聚合
            df_daily = _fetch_sina_daily(code)
            if df_daily is None or df_daily.empty:
                print(f"[global_kline] {code}: no daily data, skip")
                continue
            print(f"[global_kline] {code}: got {len(df_daily)} daily bars from sina")

            for period, count in [("daily", 500), ("weekly", 260), ("monthly", 120)]:
                try:
                    df_p = _resample_to_period(df_daily, period)
                    df_p = _compute_change_pct(df_p)
                    bars = []
                    for _, row in df_p.tail(count).iterrows():
                        bars.append(
                            {
                                "time": str(row["date"]),
                                "open": _safe_float(row["open"]),
                                "high": _safe_float(row["high"]),
                                "low": _safe_float(row["low"]),
                                "close": _safe_float(row["close"]),
                                "volume": _safe_float(row["volume"]),
                                "change_pct": _safe_float(row.get("change_pct", 0.0)),
                            }
                        )
                    n = _save_global_klines(code, period, bars)
                    total += n
                    print(f"[global_kline] {code}/{period}: saved {n} bars")
                except Exception as e:
                    print(f"[global_kline] sync error {code}/{period}: {e}")
            time.sleep(1)  # 避免请求过快
        print(f"[global_kline] sync_all done, total {total} bars saved")
    finally:
        with _kline_sync_lock:
            _kline_is_syncing = False
    return total


# ─────────────────── 原有全球快照同步 ───────────────────


def sync_global_indices() -> int:
    global _is_syncing
    with _sync_lock:
        if _is_syncing:
            return 0
        _is_syncing = True

    try:
        df = None
        for attempt in range(3):
            try:
                df = ak.index_global_spot_em()
                if df is not None and not df.empty:
                    break
            except Exception:
                if attempt < 2:
                    time.sleep(2)
                else:
                    raise
        if df is None or df.empty:
            return 0

        db = SessionLocal()
        retry_count = 3
        for db_attempt in range(retry_count):
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

                sched_log(
                    "success",
                    f"全球市场指数同步完成，共 {count} 条",
                    source="scheduler",
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

                sched_log("error", f"全球市场指数同步DB错误: {e}", source="scheduler")
                return 0
            finally:
                if db_attempt == retry_count - 1:
                    db.close()
    except Exception as e:
        from routers.system import sched_log

        sched_log("error", f"全球市场指数同步失败: {e}", source="scheduler")
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


_CN_INDEX_SECIDS = "1.000001,0.399001,0.399006,1.000300,0.899050"
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
    return {"syncing": _is_syncing, "klineSyncing": _kline_is_syncing}


@router.post("/sync")
def trigger_sync():
    threading.Thread(target=sync_global_indices, daemon=True).start()
    return {"message": "sync started"}


@router.post("/sync-klines")
def trigger_kline_sync():
    """手动触发全球指数 K 线同步"""
    threading.Thread(target=sync_all_review_index_klines, daemon=True).start()
    return {"message": "kline sync started"}
