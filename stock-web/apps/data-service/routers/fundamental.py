from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
import realtime_data

router = APIRouter()


@router.get("/{code}")
async def get_fundamental(code: str):
    detail = await run_in_threadpool(realtime_data.fetch_stock_detail, code)
    snapshot = await run_in_threadpool(realtime_data.fetch_f10_snapshot, code)
    financials = await run_in_threadpool(realtime_data.fetch_f10_financial, code)

    if not detail and not snapshot:
        raise HTTPException(status_code=404, detail=f"No fundamental data for {code}")

    latest_fin = financials[0] if financials else {}

    result = {
        "code": code,
        "name": detail.get("name") or snapshot.get("shortName", ""),
        "industry": snapshot.get("industry", "") or detail.get("industry", ""),
        "price": detail.get("price"),
        "changePct": detail.get("changePct"),
        "data_freshness": snapshot.get("updatedAt"),
        "report_period": latest_fin.get("reportDate"),
        "metrics": {
            "per_share": {
                "eps_basic": latest_fin.get("eps"),
                "eps_diluted": latest_fin.get("eps"),
                "nav_per_share": latest_fin.get("bps"),
                "cfps": latest_fin.get("cfps"),
                "retained_per_share": None,
            },
            "valuation": {
                "pe_ttm": detail.get("pe"),
                "pe_static": None,
                "pe_dynamic": None,
                "pb": detail.get("pb"),
                "total_market_cap": detail.get("marketCap"),
                "circulating_market_cap": detail.get("circulatingMarketCap"),
            },
            "profitability": {
                "roe_weighted": latest_fin.get("roe"),
                "roa_weighted": None,
                "gross_margin": latest_fin.get("grossMargin"),
                "net_margin": None,
            },
            "growth": {
                "revenue_yoy": latest_fin.get("revenueYoy"),
                "revenue_qoq": None,
                "net_profit_yoy": latest_fin.get("netProfitYoy"),
                "net_profit_qoq": None,
                "deducted_profit_yoy": None,
            },
            "leverage": {
                "debt_ratio": None,
                "current_ratio": None,
                "quick_ratio": None,
            },
            "cashflow": {
                "cfps": latest_fin.get("cfps"),
                "sales_cashflow_ratio": None,
            },
        },
        "company_info": {
            "companyName": snapshot.get("companyName", ""),
            "shortName": snapshot.get("shortName", ""),
            "listedDate": snapshot.get("listedDate", ""),
            "registeredCapital": snapshot.get("registeredCapital"),
            "employees": snapshot.get("employees"),
            "mainBusiness": snapshot.get("mainBusiness", ""),
            "businessScope": snapshot.get("businessScope", ""),
            "emIndustry": snapshot.get("emIndustry", ""),
        },
        "market_data": {
            "totalShares": detail.get("totalShares"),
            "circulatingShares": detail.get("circulatingShares"),
            "turnoverRate": detail.get("turnoverRate"),
            "amplitude": detail.get("amplitude"),
            "volume": detail.get("volume"),
            "turnover": detail.get("turnover"),
            "high": detail.get("high"),
            "low": detail.get("low"),
            "open": detail.get("open"),
            "prevClose": detail.get("prevClose"),
        },
    }

    return result


@router.get("/{code}/finance-view")
async def get_finance_view(code: str):
    financials = await run_in_threadpool(realtime_data.fetch_f10_financial, code)
    main_business = await run_in_threadpool(realtime_data.fetch_f10_main_business, code)

    income_history = []
    for item in financials:
        income_history.append(
            {
                "report_date": item.get("reportDate", ""),
                "revenue": item.get("revenue"),
                "revenue_yoy": item.get("revenueYoy"),
                "net_profit": item.get("netProfit"),
                "net_profit_yoy": item.get("netProfitYoy"),
                "deducted_profit": None,
                "gross_margin": item.get("grossMargin"),
                "net_margin": None,
                "roe_weighted": item.get("roe"),
                "debt_ratio": None,
                "eps_basic": item.get("eps"),
                "eps_deducted": item.get("deductedEps"),
                "bps": item.get("bps"),
                "cfps": item.get("cfps"),
            }
        )

    business_breakdown = []
    for item in main_business:
        business_breakdown.append(
            {
                "name": item.get("productName", ""),
                "ratio": item.get("revenueRatio"),
                "revenue": item.get("revenue"),
                "gross_margin": item.get("grossMargin"),
            }
        )

    has_data = bool(income_history or business_breakdown)

    return {
        "code": code,
        "updated_at": None,
        "has_data": has_data,
        "business_breakdown": business_breakdown,
        "income_history": income_history,
        "syncing": False,
    }
