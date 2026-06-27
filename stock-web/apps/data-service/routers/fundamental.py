import json
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from db import SessionLocal, StockFundamental

router = APIRouter()

_KEY_MAP = {
    "报告期": "report_date",
    "营业总收入": "revenue",
    "营业总收入同比增长率": "revenue_yoy",
    "净利润": "net_profit",
    "净利润同比增长率": "net_profit_yoy",
    "扣非净利润": "deducted_profit",
    "基本每股收益": "eps",
    "每股净资产": "nav_per_share",
    "每股经营现金流": "cfps",
    "销售净利率": "net_margin",
    "销售毛利率": "gross_margin",
    "净资产收益率-摊薄": "roe",
    "资产负债率": "debt_ratio",
    "流动比率": "current_ratio",
    "速动比率": "quick_ratio",
    "存货周转率": "inventory_turnover",
    "应收账款周转天数": "ar_days",
}


@router.get("/{code}")
async def get_fundamental(code: str):
    def _fetch():
        db = SessionLocal()
        try:
            return (
                db.query(StockFundamental).filter(StockFundamental.code == code).first()
            )
        finally:
            db.close()

    row = await run_in_threadpool(_fetch)
    if not row:
        raise HTTPException(status_code=404, detail=f"No fundamental data for {code}")

    raw: dict = {}
    if row.raw_json:
        try:
            raw = json.loads(row.raw_json)
        except Exception:
            pass

    mapped: dict = {}
    for cn_key, en_key in _KEY_MAP.items():
        val = raw.get(cn_key)
        if val is not None and str(val) not in ("False", "None", ""):
            mapped[en_key] = str(val)

    mapped["report_date"] = row.report_date or raw.get("报告期", "")
    if row.eps:
        mapped["eps"] = str(row.eps)
    if row.roe:
        mapped["roe"] = str(row.roe)
    if row.revenue:
        mapped["revenue"] = str(row.revenue)
    if row.net_profit:
        mapped["net_profit"] = str(row.net_profit)
    if row.gross_margin:
        mapped["gross_margin"] = str(row.gross_margin)
    if row.debt_ratio:
        mapped["debt_ratio"] = str(row.debt_ratio)
    if row.updated_at:
        mapped["updated_at"] = row.updated_at.strftime("%Y-%m-%d")

    return {"code": code, "data": mapped, "raw": raw}
