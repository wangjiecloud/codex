"""
fundamental.py
基本面数据路由：
- GET  /api/fundamental/{code}           — 查询基本面快照（优先数据库，必要时触发抓取）
- POST /api/fundamental/{code}/sync      — 主动从东方财富 F10 全量同步并更新数据库
- GET  /api/fundamental/{code}/history   — 查询历史多报告期财务数据
- GET  /api/fundamental/{code}/full      — 查询全量 F10 数据（含财务三表/同行/研报等）

F10 覆盖的所有标签页（完整版）：
  zyzb  操盘必读（主要指标）
  gdyj  股东研究（十大股东、机构持仓、北向资金）
  jyfx  经营分析（主营构成/研发/客户集中度/经营评述）
  hxtc  核心题材（所属板块）
  zxgg  资讯公告
  gsds  公司大事
  gsgk  公司概况
  thbj  同行比较
  ylyc  盈利预测（机构预测、评级统计）
  yjbg  研究报告摘要
  cwfx  财务分析（每股指标/成长/盈利/运营/偿债 + 三张报表 + 杜邦）
  fhrz  分红融资（分红历史/融资明细）
  gbjg  股本结构
  gsgg  公司高管
  zbyz  资本运作
  glgg  关联个股
  zjlx  资金流向
  lhbd  龙虎榜单
  jgpj  机构评级
  zndp  智能点评
"""
import json
import re
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from db import (
    SessionLocal,
    StockFundamental,
    StockF10Snapshot,
    StockF10FinancialHistory,
    StockF10DividendHistory,
    StockF10InstitutionForecast,
    StockF10BusinessAnalysis,
    StockF10ShareholderInfo,
    StockF10FinancialStatement,
    StockF10PeerComparison,
    StockF10CompanyProfile,
    StockF10KeyEvents,
    StockF10FundFlow,
    StockF10ResearchReport,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ──────────────────────────────────────────────
# 工具函数
# ──────────────────────────────────────────────

def _to_float(val) -> Optional[float]:
    """把各种格式的数值字符串转成 float，失败返回 None"""
    if val is None:
        return None
    s = str(val).strip().replace(",", "").replace("%", "").replace("亿", "e8").replace("万", "e4")
    s = re.sub(r"[^\d.\-+eE]", "", s)
    try:
        return float(s)
    except Exception:
        return None


def _market_prefix(code: str) -> str:
    """根据 A 股代码判断交易所前缀"""
    if code.startswith(("0", "3")):
        return "sz"
    return "sh"


def _f10_url(code: str) -> str:
    prefix = _market_prefix(code)
    return (
        f"https://emweb.securities.eastmoney.com/pc_hsf10/pages/index.html"
        f"?type=web&code={prefix}{code}&color=b#/"
    )


def _get_content(page, skip_lines: int = 80) -> str:
    """从页面 body 提取文本，跳过前 N 行（导航/头部）"""
    lines = page.inner_text("body").split("\n")
    return "\n".join(l.strip() for l in lines[skip_lines:] if l.strip())


# ──────────────────────────────────────────────
# Playwright 全量抓取核心逻辑
# ──────────────────────────────────────────────

def _scrape_f10_full(code: str) -> dict:
    """
    使用 Playwright 全量抓取东方财富 F10 所有标签页数据。
    覆盖 20 个标签页，含子 tab 切换，返回结构化 dict。
    同步阻塞，需在线程池中执行。
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError("playwright 未安装，请运行: pip install playwright && playwright install chromium")

    base = _f10_url(code)
    result: dict = {
        "code": code,
        "source_url": base,
        "scraped_at": datetime.utcnow().isoformat(),
    }

    ua = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, user_agent=ua)
        page = ctx.new_page()

        # ─────────────────────────────────
        # 1. 操盘必读 zyzb — 主要指标快照
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 zyzb")
        page.goto(base + "zyzb", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        zyzb_text = _get_content(page, 60)
        result["zyzb_text"] = zyzb_text

        def _ex(pattern, txt, group=1):
            m = re.search(pattern, txt, re.S)
            return m.group(group).strip() if m else None

        result["eps_basic"]           = _ex(r"基本每股收益.*?(\-?\d+\.?\d*)", zyzb_text)
        result["eps_diluted"]         = _ex(r"稀释每股收益.*?(\-?\d+\.?\d*)", zyzb_text)
        result["nav_per_share"]       = _ex(r"每股净资产.*?(\-?\d+\.?\d*)", zyzb_text)
        result["reserve_per_share"]   = _ex(r"每股公积金.*?(\-?\d+\.?\d*)", zyzb_text)
        result["retained_per_share"]  = _ex(r"每股未分配利润.*?(\-?\d+\.?\d*)", zyzb_text)
        result["cfps"]                = _ex(r"每股经营现金流.*?(\-?\d+\.?\d*)", zyzb_text)
        result["pe_ttm"]              = _ex(r"市盈率TTM.*?(\-?\d+\.?\d*)", zyzb_text)
        result["pe_static"]           = _ex(r"市盈率[-静].*?(\-?\d+\.?\d*)", zyzb_text)
        result["pe_dynamic"]          = _ex(r"市盈率[-动].*?(\-?\d+\.?\d*)", zyzb_text)
        result["pb"]                  = _ex(r"市净率.*?(\-?\d+\.?\d*)", zyzb_text)
        # 修复：实际文本格式为 "净资产收益率(加权)(%)\t9.03\t..."，取第一个数值
        roe_m = re.search(r"净资产收益率\(加权\)\(%\)\t(-?\d+\.?\d*)", zyzb_text)
        result["roe_weighted"]        = roe_m.group(1) if roe_m else _ex(r"加权净资产收益率.*?(\-?\d+\.?\d*)", zyzb_text)
        # 修复：毛利率格式同上，取第一个值
        gm_m = re.search(r"毛利率\(%\)\t(-?\d+\.?\d*)", zyzb_text)
        result["gross_margin"]        = gm_m.group(1) if gm_m else _ex(r"毛利率.*?(\-?\d+\.?\d*)", zyzb_text)
        # 修复：资产负债率格式同上
        dr_m = re.search(r"资产负债率\(%\)\t(-?\d+\.?\d*)", zyzb_text)
        result["debt_ratio"]          = dr_m.group(1) if dr_m else _ex(r"资产负债率.*?(\-?\d+\.?\d*)", zyzb_text)
        result["revenue"]             = _ex(r"营业总收入\(元\)\s+(\d+\.?\d*[亿万]?)", zyzb_text)
        result["revenue_yoy"]         = _ex(r"营业总收入同比增长.*?(\-?\d+\.?\d*)", zyzb_text)
        result["net_profit"]          = _ex(r"归属净利润\(元\)\s+(\d+\.?\d*[亿万]?)", zyzb_text)
        result["net_profit_yoy"]      = _ex(r"归属净利润同比增长.*?(\-?\d+\.?\d*)", zyzb_text)
        result["deducted_profit_yoy"] = _ex(r"扣非净利润同比增长.*?(\-?\d+\.?\d*)", zyzb_text)
        result["report_period"]       = _ex(r"(\d{4}-\d{2}-\d{2})", zyzb_text)

        # ─────────────────────────────────
        # 2. 财务分析 cwfx — 财务三表 + 指标多维度 + 历史多期
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 cwfx")
        page.goto(base + "cwfx", wait_until="domcontentloaded")
        page.wait_for_timeout(6000)

        # 按报告期（默认）—— 含多期历史数据，用于解析近5年财报
        cwfx_by_period_text = _get_content(page, 60)
        result["cwfx_by_period"] = cwfx_by_period_text

        # 尝试切换"按年度"获取年报级别数据（更规整，方便解析年收入/净利润）
        try:
            data_tabs = page.query_selector_all("ul.dataTab li")
            for dt in data_tabs[:4]:
                t = dt.inner_text().strip()
                if t == "按年度":
                    dt.click()
                    page.wait_for_timeout(2000)
                    result["cwfx_by_year"] = _get_content(page, 60)
                    break
            # 切回按报告期
            for dt in page.query_selector_all("ul.dataTab li")[:4]:
                if dt.inner_text().strip() == "按报告期":
                    dt.click()
                    page.wait_for_timeout(1000)
                    break
        except Exception as e:
            logger.warning(f"cwfx 年度切换失败: {e}")

        # 三张报表：资产负债表、利润表、现金流量表
        financial_statements = {}
        for stmt_name, stmt_key in [("资产负债表", "balance_sheet"),
                                     ("利润表", "income"),
                                     ("现金流量表", "cashflow")]:
            try:
                page.goto(base + "cwfx", wait_until="domcontentloaded")
                page.wait_for_timeout(5000)
                btn = page.get_by_text(stmt_name, exact=True)
                if btn.count() > 0:
                    btn.first.click()
                    page.wait_for_timeout(3000)
                    stmt_data = {}
                    # 按报告期（默认）
                    stmt_data["按报告期"] = _get_content(page, 60)
                    # 尝试年报
                    try:
                        data_tabs = page.query_selector_all("ul.dataTab li")
                        for dt in data_tabs[:4]:
                            t = dt.inner_text().strip()
                            if t in ("按报告期", "按单季度", "按年度", "报告期同比"):
                                dt.click()
                                page.wait_for_timeout(2000)
                                stmt_data[t] = _get_content(page, 60)
                    except Exception as e:
                        logger.warning(f"cwfx dataTab 切换失败: {e}")
                    financial_statements[stmt_key] = stmt_data
            except Exception as e:
                logger.warning(f"cwfx {stmt_name} 抓取失败: {e}")
                financial_statements[stmt_key] = {}

        result["financial_statements"] = financial_statements

        # ─────────────────────────────────
        # 3. 股东研究 gdyj — 十大股东/机构持仓/北向资金
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 gdyj")
        page.goto(base + "gdyj", wait_until="domcontentloaded")
        page.wait_for_timeout(6000)
        result["gdyj_text"] = _get_content(page, 60)

        # 获取各历史报告期十大股东
        try:
            date_tabs = page.query_selector_all("ul.dateTab li")
            gdyj_periods = {}
            for li in date_tabs[:12]:
                t = li.inner_text().strip()
                if re.match(r"\d{4}-\d{2}-\d{2}", t):
                    li.click()
                    page.wait_for_timeout(2000)
                    gdyj_periods[t] = _get_content(page, 60)
            result["gdyj_periods"] = gdyj_periods
        except Exception as e:
            logger.warning(f"gdyj 历史期抓取失败: {e}")
            result["gdyj_periods"] = {}

        # ─────────────────────────────────
        # 4. 经营分析 jyfx — 主营构成/研发/客户
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 jyfx")
        page.goto(base + "jyfx", wait_until="domcontentloaded")
        page.wait_for_timeout(7000)
        result["jyfx_text"] = _get_content(page, 60)
        result["rd_expense_ratio"] = _ex(r"研发投入占营收比\s+(\d+\.?\d*)%", result["jyfx_text"])

        # 主营构成按产品/行业/地区 — 保存原始文本 + 尝试解析表格行
        jyfx_categories = {}
        jyfx_table_rows = {}   # 结构化表格行数据，最终用于饼图

        try:
            # 先切换到表格模式
            tabs = page.query_selector_all("ul.zygcfx-tab li")
            if tabs:
                tabs[0].click()
                page.wait_for_timeout(1000)

            jyfx_full_text = _get_content(page, 60)
            jyfx_categories["full_text"] = jyfx_full_text

            # ── 策略1：直接解析主营构成 table 元素（不依赖 tab 按钮点击）──
            # 找含 "按产品分类" 或 "主营构成+收入比例" 的表格，解析产品维度数据
            # 不回落到「按行业」「按地区」，避免引入申万行业分类词汇污染饼图
            product_rows = []
            try:
                tables = page.query_selector_all("table")
                breakdown_table_text = ""
                for tbl in tables:
                    txt = tbl.inner_text()
                    if "按产品分类" in txt or ("主营构成" in txt and "收入比例" in txt):
                        breakdown_table_text = txt
                        break

                if breakdown_table_text:
                    jyfx_categories["按产品"] = breakdown_table_text
                    current_cat = None
                    for line in breakdown_table_text.split("\n"):
                        line = line.strip()
                        if not line:
                            continue
                        parts = [p.strip() for p in line.split("\t")]
                        # 识别分类标题行
                        if parts[0] in ("按产品分类", "按行业分类", "按地区分类"):
                            current_cat = parts[0]
                            # 同行可能带第一条产品数据
                            if len(parts) >= 4 and current_cat == "按产品分类":
                                name = parts[1]
                                rev_str = parts[2]
                                ratio_str = parts[3]
                                if "%" in ratio_str and len(name) >= 2:
                                    ratio_val = _to_float(ratio_str)
                                    if ratio_val and 0 < ratio_val <= 100:
                                        product_rows.append({
                                            "name": name,
                                            "revenue": _to_float(rev_str),
                                            "ratio": ratio_val,
                                            "gross_margin": _to_float(parts[8]) if len(parts) > 8 else None,
                                        })
                            continue
                        # 只收集「按产品分类」下的行
                        if current_cat != "按产品分类":
                            continue
                        if len(parts) >= 3:
                            name = parts[0]
                            if re.search(r"主营构成|收入比例|成本比例|利润比例|报告期|合计|小计", name):
                                continue
                            if len(name) < 2 or len(name) > 30:
                                continue
                            rev_str = parts[1]
                            ratio_str = parts[2]
                            if "%" in ratio_str:
                                ratio_val = _to_float(ratio_str)
                                if ratio_val and 0 < ratio_val <= 100:
                                    product_rows.append({
                                        "name": name,
                                        "revenue": _to_float(rev_str),
                                        "ratio": ratio_val,
                                        "gross_margin": _to_float(parts[8]) if len(parts) > 8 else None,
                                    })
            except Exception as e_tbl:
                logger.warning(f"[F10] {code} jyfx table解析失败: {e_tbl}")

            if product_rows:
                jyfx_table_rows["按产品"] = product_rows
                logger.info(f"[F10] {code} jyfx 按产品 解析到 {len(product_rows)} 行")

            # ── 策略2：从"业务竞争力"各业务 tab 点击，解析 "年报：X业务总营收Y亿" ──
            if not jyfx_table_rows:
                try:
                    li_elements = page.query_selector_all("li")
                    business_lis = []
                    for li in li_elements:
                        txt = li.inner_text().strip()
                        try:
                            parent_text = li.evaluate(
                                "el => el.parentElement?.parentElement?.innerText?.substring(0,80) || ''"
                            )
                        except Exception:
                            parent_text = ""
                        if "业务竞争力" in parent_text and len(txt) < 25 and txt and "\n" not in txt:
                            business_lis.append((txt, li))

                    if business_lis:
                        busi_breakdown = []
                        for bname, li_el in business_lis:
                            try:
                                li_el.click()
                                page.wait_for_timeout(1200)
                                btext = _get_content(page, 60)
                                # 匹配 "年报：X业务总营收Y亿元，同比Z%"
                                m = re.search(
                                    r"\d{4}年报：.{0,20}?业务总营收(\d+\.?\d*)亿元[，,]同比([+-]?\d+\.?\d*)%",
                                    btext
                                )
                                if m:
                                    busi_breakdown.append({
                                        "name": bname,
                                        "revenue": _to_float(m.group(1) + "亿"),
                                        "yoy": float(m.group(2)),
                                    })
                                    logger.info(f"[F10] {code} 业务{bname}: {m.group(1)}亿")
                            except Exception as be:
                                logger.warning(f"[F10] {code} 业务tab {bname} 点击失败: {be}")

                        if busi_breakdown:
                            total_rev = sum(r.get("revenue") or 0 for r in busi_breakdown)
                            if total_rev > 0:
                                for r in busi_breakdown:
                                    r["ratio"] = round((r.get("revenue") or 0) / total_rev * 100, 2)
                            jyfx_table_rows["业务竞争力"] = busi_breakdown
                            logger.info(f"[F10] {code} 业务竞争力解析到 {len(busi_breakdown)} 条")
                except Exception as e2:
                    logger.warning(f"[F10] {code} 业务竞争力抓取失败: {e2}")

        except Exception as e:
            logger.warning(f"jyfx 主营构成抓取失败: {e}")

        result["jyfx_categories"] = jyfx_categories
        result["jyfx_table_rows"] = jyfx_table_rows

        # ─────────────────────────────────
        # 5. 盈利预测 ylyc — 机构预测/评级
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 ylyc")
        page.goto(base + "ylyc", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["ylyc_text"] = _get_content(page, 60)
        result["consensus_rating"] = _ex(r"综合评级\s+(买入|增持|中性|减持|卖出)", result["ylyc_text"])
        result["analyst_count"]    = _ex(r"(\d+)\s*家\s*(?:券商|机构)", result["ylyc_text"])

        # ─────────────────────────────────
        # 6. 分红融资 fhrz — 分红历史/融资明细
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 fhrz")
        page.goto(base + "fhrz", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["fhrz_text"] = _get_content(page, 60)
        result["dividend_yield"] = _ex(r"股息率\s+(\d+\.?\d*%?)", result["fhrz_text"])
        result["payout_ratio"]   = _ex(r"股利支付率\s+(\d+\.?\d*%?)", result["fhrz_text"])

        # ─────────────────────────────────
        # 7. 同行比较 thbj
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 thbj")
        page.goto(base + "thbj", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["thbj_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 8. 公司概况 gsgk
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 gsgk")
        page.goto(base + "gsgk", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["gsgk_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 9. 公司高管 gsgg
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 gsgg")
        page.goto(base + "gsgg", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["gsgg_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 10. 股本结构 gbjg
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 gbjg")
        page.goto(base + "gbjg", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["gbjg_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 11. 核心题材 hxtc
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 hxtc")
        page.goto(base + "hxtc", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["hxtc_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 12. 公司大事 gsds
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 gsds")
        page.goto(base + "gsds", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["gsds_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 13. 资本运作 zbyz
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 zbyz")
        page.goto(base + "zbyz", wait_until="domcontentloaded")
        page.wait_for_timeout(6000)
        result["zbyz_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 14. 关联个股 glgg
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 glgg")
        page.goto(base + "glgg", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["glgg_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 15. 资金流向 zjlx
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 zjlx")
        page.goto(base + "zjlx", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["zjlx_text"] = _get_content(page, 60)
        result["margin_balance"]  = _ex(r"融资余额(\d+\.?\d*亿?万?)", result["zjlx_text"])

        # ─────────────────────────────────
        # 16. 龙虎榜单 lhbd
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 lhbd")
        page.goto(base + "lhbd", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["lhbd_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 17. 机构评级 jgpj
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 jgpj")
        page.goto(base + "jgpj", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["jgpj_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 18. 研究报告 yjbg
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 yjbg")
        page.goto(base + "yjbg", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["yjbg_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 19. 智能点评 zndp
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 zndp")
        page.goto(base + "zndp", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["zndp_text"] = _get_content(page, 60)

        # ─────────────────────────────────
        # 20. 资讯公告 zxgg
        # ─────────────────────────────────
        logger.info(f"[F10] {code} 抓取 zxgg")
        page.goto(base + "zxgg", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        result["zxgg_text"] = _get_content(page, 60)

        browser.close()

    logger.info(f"[F10] {code} 全量抓取完成，共 {len(result)} 个字段")
    return result


# ──────────────────────────────────────────────
# 数据解析 & 持久化
# ──────────────────────────────────────────────

def _parse_jyfx_breakdown(jyfx_table_rows: dict) -> list[dict]:
    """
    从 jyfx_table_rows（结构化主营构成）中提取营收占比，
    只使用「按产品」分类，对应东方财富 F10 jyfx 页「主营构成 → 按产品」tab 的数据。
    不回落到「按行业」「按地区」「业务竞争力」，避免引入错误的行业分类数据。
    返回适合饼图展示的数组：
    [{"name": "精矿及粉末产品", "ratio": 31.6, "revenue": 5573000000.0}, ...]
    """
    rows = jyfx_table_rows.get("按产品", [])
    if not rows:
        return []
    # 按 ratio 降序，最多返回 8 条
    sorted_rows = sorted(rows, key=lambda r: r.get("ratio") or 0, reverse=True)
    # 如果占比之和不接近 100，归一化
    total = sum(r.get("ratio") or 0 for r in sorted_rows)
    if total > 0 and abs(total - 100) > 5:
        for r in sorted_rows:
            r["ratio"] = round((r.get("ratio") or 0) / total * 100, 2)
    return sorted_rows[:8]


def _parse_cwfx_history(code: str, cwfx_by_period: str, cwfx_by_year: str = "") -> list[dict]:
    """
    从 cwfx 财务分析文本中解析多期历史财务数据，用于填充 stock_f10_financial_history 表。

    东方财富 cwfx 实际文本格式（利润表按报告期）：
      利润表  2026-03-31  2025-12-31  2025-09-30  2025-06-30  2025-03-31
      营业总收入  70.07亿  176.4亿  127.6亿  78.49亿  33.94亿
      归属净利润  9.903亿  13.92亿  ...

    指标行用多个空格/tab 分隔，日期格式有两种：
      - 完整：2026-03-31
      - 短格式：26-03-31（需补全为 2026-03-31）
    """
    rows_by_date: dict[str, dict] = {}

    def _normalize_date(d: str) -> str:
        """把 26-03-31 格式补全为 2026-03-31"""
        m = re.match(r"^(\d{2})-(\d{2})-(\d{2})$", d)
        if m:
            yy = int(m.group(1))
            year = 2000 + yy if yy <= 50 else 1900 + yy
            return f"{year}-{m.group(2)}-{m.group(3)}"
        return d

    def _parse_block(text: str):
        if not text:
            return
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        # 字段映射：指标关键词 → 数据库字段名
        # 注意：较长/更精确的关键字必须放在前面，防止短关键字先匹配（如"营业总收入"
        # 在前缀匹配时会误命中"营业总收入同比增长(%)"）
        field_map = {
            "营业总收入同比增长": "revenue_yoy",     # ← 必须在 "营业总收入" 前面
            "归属净利润同比增长": "net_profit_yoy",  # ← 必须在 "归属净利润" 前面
            "扣非净利润同比增长": None,              # 忽略，不入库
            "营业总收入滚动环比增长": None,           # 忽略，不入库
            "归属净利润滚动环比增长": None,           # 忽略，不入库
            "扣非净利润滚动环比增长": None,           # 忽略，不入库
            "营业总收入":         "revenue",
            "营业收入":           "revenue",
            "归属净利润":         "net_profit",
            "净利润":             "net_profit",
            "扣非净利润":         "deducted_profit",
            "毛利润":             "gross_profit",
            "毛利率":             "gross_margin",
            "净利率":             "net_margin",
            "净资产收益率(加权)": "roe_weighted",
            "净资产收益率":       "roe_weighted",
            "资产负债率":         "debt_ratio",
            "每股收益":           "eps_basic",
            "基本每股收益":       "eps_basic",
            "每股净资产":         "nav_per_share",
        }
        # 精确匹配优先（避免"净利率"匹配到"净利润"）
        exact_fields = {
            "营业总收入": "revenue",
            "营业收入":   "revenue",
            "归属净利润": "net_profit",
        }

        # ── 预扫描：找第一个日期行，用于文件开头没有日期行时的兜底 ──
        first_date_cols: list[str] = []
        for line in lines:
            dates_full = re.findall(r"\d{4}-\d{2}-\d{2}", line)
            dates_short = re.findall(r"\b(\d{2})-(\d{2})-(\d{2})\b", line)
            if len(dates_full) >= 2:
                first_date_cols = dates_full
                break
            if not dates_full and len(dates_short) >= 2:
                new_dates = []
                for yy, mm, dd in dates_short:
                    y = 2000 + int(yy) if int(yy) <= 50 else 1900 + int(yy)
                    new_dates.append(f"{y}-{mm}-{dd}")
                if new_dates:
                    first_date_cols = new_dates
                    break

        # 初始化所有日期 key（后面遇到日期行时也会 re-init）
        for d in first_date_cols:
            if d not in rows_by_date:
                rows_by_date[d] = {"code": code, "report_date": d}

        # 文件开头可能有成长性指标行（在第一个日期行之前），用 first_date_cols 先顶上
        date_cols: list[str] = first_date_cols[:]

        for line in lines:
            # ── 1. 检测日期行（形如 "利润表  2026-03-31  2025-12-31 ..."）
            dates_full = re.findall(r"\d{4}-\d{2}-\d{2}", line)
            dates_short = re.findall(r"\b(\d{2})-(\d{2})-(\d{2})\b", line)

            if len(dates_full) >= 2:
                date_cols = dates_full
                for d in date_cols:
                    if d not in rows_by_date:
                        rows_by_date[d] = {"code": code, "report_date": d}
                continue

            if not dates_full and len(dates_short) >= 2:
                new_dates = []
                for yy, mm, dd in dates_short:
                    y = 2000 + int(yy) if int(yy) <= 50 else 1900 + int(yy)
                    new_dates.append(f"{y}-{mm}-{dd}")
                date_cols = new_dates
                for d in date_cols:
                    if d not in rows_by_date:
                        rows_by_date[d] = {"code": code, "report_date": d}
                continue

            if not date_cols:
                continue

            # ── 2. 检测指标行（含具体数值，用 tab 或多空格分隔）
            parts = re.split(r"\t|  +", line)
            if len(parts) < 2:
                continue

            indicator = parts[0].strip()
            indicator_clean = re.sub(r"\([^)]*\)", "", indicator).strip()

            matched_field = None
            explicitly_ignored = False
            # 精确匹配
            for kw, field in exact_fields.items():
                if indicator_clean == kw or indicator == kw:
                    matched_field = field
                    break
            # 前缀匹配（较长关键字在前，确保"营业总收入同比增长"优先于"营业总收入"）
            if not matched_field:
                for kw, field in field_map.items():
                    if indicator_clean.startswith(kw) or indicator.startswith(kw):
                        if field is None:
                            # 明确标记为忽略的行（如"同比增长"类的百分比行不入库）
                            explicitly_ignored = True
                        else:
                            matched_field = field
                        break

            if explicitly_ignored or not matched_field:
                continue

            # 提取数值列，对齐 date_cols
            val_parts = parts[1:]
            for j, d in enumerate(date_cols):
                if j >= len(val_parts):
                    break
                raw = val_parts[j].strip()
                if not raw or raw in ("--", "—", ""):
                    continue
                v = _to_float(raw)
                if v is not None:
                    existing = rows_by_date.get(d, {})
                    # 已有数据则不覆盖（保留更早解析的值）
                    if matched_field not in existing or existing.get(matched_field) is None:
                        rows_by_date.setdefault(d, {"code": code, "report_date": d})[matched_field] = v

    _parse_block(cwfx_by_period)
    _parse_block(cwfx_by_year)

    # 过滤：只保留有 revenue 或 net_profit 的记录，且在近5年内
    cutoff_year = datetime.utcnow().year - 5
    result = []
    for d, row in rows_by_date.items():
        try:
            row_year = int(d[:4])
        except Exception:
            continue
        if row_year < cutoff_year:
            continue
        if row.get("revenue") or row.get("net_profit"):
            result.append(row)

    result.sort(key=lambda r: r.get("report_date", ""), reverse=True)
    return result[:20]


def _build_history_from_statements(code: str) -> list[dict]:
    """
    直接从数据库 stock_f10_financial_statement 中解析多期财务历史数据。
    用于 /finance-view 接口在 stock_f10_financial_history 为空时的兜底逻辑。

    三步策略：
    1. 从 income 文本解析 revenue/net_profit 绝对值（杜邦分析区块含亿元数字）
    2. 从 cwfx_summary 文本（cwfx 成长性摘要）解析 revenue_yoy/net_profit_yoy/roe_weighted
    3. 从 balance_sheet 文本补充 gross_margin/net_margin/debt_ratio 等盈利能力指标
    """
    db = SessionLocal()
    try:
        stmts = db.query(StockF10FinancialStatement).filter_by(code=code).all()
    finally:
        db.close()

    # 当同一个 (statement_type, tab_label) 有多条记录时，取最新的
    stmt_map: dict[tuple, str] = {}
    for s in sorted(stmts, key=lambda x: x.updated_at or ""):
        stmt_map[(s.statement_type, s.tab_label)] = s.content_text or ""

    combined_result: dict[str, dict] = {}

    # ── 第一步：income 文本 → 提取 revenue/net_profit 绝对值 ──
    for tab in ["按报告期", "按年度"]:
        text = stmt_map.get(("income", tab), "")
        if not text:
            continue
        rows = _parse_cwfx_history(code, text)  # 内部已过滤有 revenue/net_profit 的记录
        for row in rows:
            d = row["report_date"]
            if d not in combined_result:
                combined_result[d] = dict(row)
            else:
                for k, v in row.items():
                    if v is not None and combined_result[d].get(k) is None:
                        combined_result[d][k] = v

    # ── 第二步：cwfx_summary 文本 → 提取 revenue_yoy/net_profit_yoy/roe_weighted ──
    # cwfx_summary 是 cwfx 首屏的成长性/盈利能力分析摘要（含同比增长行）
    for tab in ["按报告期", "按年度"]:
        text = stmt_map.get(("cwfx_summary", tab), "")
        if not text:
            # 旧版兜底：balance_sheet 文本开头可能有同比增长行
            text = stmt_map.get(("balance_sheet", tab), "")
        if not text:
            continue
        rows_raw = _parse_cwfx_history_relaxed(code, text)
        for row in rows_raw:
            d = row["report_date"]
            supplement_fields = {"revenue_yoy", "net_profit_yoy", "roe_weighted", "gross_margin", "net_margin", "debt_ratio"}
            if d in combined_result:
                for k in supplement_fields:
                    v = row.get(k)
                    if v is not None and combined_result[d].get(k) is None:
                        combined_result[d][k] = v
            else:
                # cwfx_summary 里可能有 income 没有的期次（如中间季度）
                row_filtered = {k: v for k, v in row.items() if v is not None}
                if len(row_filtered) > 2:  # 至少有2个有效字段才加入
                    combined_result[d] = row_filtered

    # ── 第三步：balance_sheet 文本 → 补充 gross_margin/net_margin/debt_ratio ──
    for tab in ["按报告期", "按年度"]:
        text = stmt_map.get(("balance_sheet", tab), "")
        if not text:
            continue
        rows_raw = _parse_cwfx_history_relaxed(code, text)
        for row in rows_raw:
            d = row["report_date"]
            supplement_fields = {"gross_margin", "net_margin", "debt_ratio", "roe_weighted"}
            if d in combined_result:
                for k in supplement_fields:
                    v = row.get(k)
                    if v is not None and combined_result[d].get(k) is None:
                        combined_result[d][k] = v

    result = list(combined_result.values())
    result.sort(key=lambda r: r.get("report_date", ""), reverse=True)
    return result[:20]


def _parse_cwfx_history_relaxed(code: str, text: str) -> list[dict]:
    """
    宽松版 cwfx 解析：不要求记录含 revenue/net_profit，
    专门用于从 balance_sheet 文本提取 revenue_yoy/net_profit_yoy/roe_weighted 等指标。
    """
    import re as _re
    rows_by_date: dict[str, dict] = {}

    def _normalize_date(d: str) -> str:
        m = _re.match(r"^(\d{2})-(\d{2})-(\d{2})$", d)
        if m:
            yy = int(m.group(1))
            year = 2000 + yy if yy <= 50 else 1900 + yy
            return f"{year}-{m.group(2)}-{m.group(3)}"
        return d

    field_map = {
        "营业总收入同比增长": "revenue_yoy",
        "归属净利润同比增长": "net_profit_yoy",
        "扣非净利润同比增长": None,
        "营业总收入滚动环比增长": None,
        "归属净利润滚动环比增长": None,
        "扣非净利润滚动环比增长": None,
        "净资产收益率(加权)": "roe_weighted",
        "净资产收益率": "roe_weighted",
        "毛利率": "gross_margin",
        "净利率": "net_margin",
        "资产负债率": "debt_ratio",
    }

    if not text:
        return []

    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # 预扫描找第一个日期行
    first_date_cols: list[str] = []
    for line in lines:
        dates_full = _re.findall(r"\d{4}-\d{2}-\d{2}", line)
        dates_short = _re.findall(r"\b(\d{2})-(\d{2})-(\d{2})\b", line)
        if len(dates_full) >= 2:
            first_date_cols = dates_full
            break
        if not dates_full and len(dates_short) >= 2:
            new_dates = []
            for yy, mm, dd in dates_short:
                y = 2000 + int(yy) if int(yy) <= 50 else 1900 + int(yy)
                new_dates.append(f"{y}-{mm}-{dd}")
            if new_dates:
                first_date_cols = new_dates
                break

    for d in first_date_cols:
        if d not in rows_by_date:
            rows_by_date[d] = {"code": code, "report_date": d}

    date_cols: list[str] = first_date_cols[:]

    for line in lines:
        dates_full = _re.findall(r"\d{4}-\d{2}-\d{2}", line)
        dates_short = _re.findall(r"\b(\d{2})-(\d{2})-(\d{2})\b", line)

        if len(dates_full) >= 2:
            date_cols = dates_full
            for d in date_cols:
                if d not in rows_by_date:
                    rows_by_date[d] = {"code": code, "report_date": d}
            continue

        if not dates_full and len(dates_short) >= 2:
            new_dates = []
            for yy, mm, dd in dates_short:
                y = 2000 + int(yy) if int(yy) <= 50 else 1900 + int(yy)
                new_dates.append(f"{y}-{mm}-{dd}")
            date_cols = new_dates
            for d in date_cols:
                if d not in rows_by_date:
                    rows_by_date[d] = {"code": code, "report_date": d}
            continue

        if not date_cols:
            continue

        parts = _re.split(r"\t|  +", line)
        if len(parts) < 2:
            continue

        indicator = parts[0].strip()
        indicator_clean = _re.sub(r"\([^)]*\)", "", indicator).strip()

        matched_field = None
        explicitly_ignored = False
        for kw, field in field_map.items():
            if indicator_clean.startswith(kw) or indicator.startswith(kw):
                if field is None:
                    explicitly_ignored = True
                else:
                    matched_field = field
                break

        if explicitly_ignored or not matched_field:
            continue

        val_parts = parts[1:]
        for j, d in enumerate(date_cols):
            if j >= len(val_parts):
                break
            raw = val_parts[j].strip()
            if not raw or raw in ("--", "—", ""):
                continue
            v = _to_float(raw)
            if v is not None:
                rows_by_date.setdefault(d, {"code": code, "report_date": d})[matched_field] = v

    # 宽松过滤：只要有任意一个字段就保留（不强求 revenue/net_profit）
    cutoff_year = datetime.utcnow().year - 5
    result = []
    for d, row in rows_by_date.items():
        try:
            row_year = int(d[:4])
        except Exception:
            continue
        if row_year < cutoff_year:
            continue
        # 只要有至少一个有意义的财务指标
        if any(row.get(f) is not None for f in ["revenue_yoy", "net_profit_yoy", "roe_weighted", "gross_margin"]):
            result.append(row)

    result.sort(key=lambda r: r.get("report_date", ""), reverse=True)
    return result[:20]


def _parse_dividend_history(code: str, fhrz_text: str) -> list[dict]:
    """从分红融资文本中解析分红历史记录"""
    rows = []
    # 匹配格式: "2025年报  2026-06-27  10派2.3元  2026-07-03  2026-07-06  实施方案"
    pattern = r"(\d{4}年报|\d{4}半年报|\d{4}[一二三四]季报)\s+(\d{4}-\d{2}-\d{2})\s+([^\t\n]+?派[^\t\n]+?元[^\t\n]*?|不分配[^\t\n]*?|10转\d+[^\t\n]*?)\s+(\d{4}-\d{2}-\d{2}|--)\s+(\d{4}-\d{2}-\d{2}|--)"
    for m in re.finditer(pattern, fhrz_text):
        period = m.group(1)
        announce_date = m.group(2)
        plan = m.group(3).strip()
        record_date = m.group(4)
        ex_div_date = m.group(5)
        # 提取每股派息金额
        cash_m = re.search(r"派(\d+\.?\d*)元", plan)
        dps = float(cash_m.group(1)) / 10 if cash_m else None  # 10派X元 → X/10
        rows.append({
            "code": code,
            "report_period": period,
            "announce_date": announce_date,
            "dividend_plan": plan,
            "record_date": record_date if record_date != "--" else None,
            "ex_div_date": ex_div_date if ex_div_date != "--" else None,
            "dividend_per_share": dps,
            "status": "实施方案",
        })
    return rows


def _parse_institution_forecast(code: str, ylyc_text: str) -> list[dict]:
    """从盈利预测文本中解析机构预测（预测明细部分）。
    
    实际文本格式（预测明细区块）:
      时间\t机构\t研究员\t{年A}\t{年B预测}\t{年C预测}\t{年D预测}\n评级
      2026-05-06\t中国银河\t华立,阎予露\t0.5620\t2.11\t2.22\t2.46\n买入
    
    表头标识预测年份，从"预测明细"和"每股收益(元)净利润(元)"行之后的"时间\t机构..."行开始解析。
    """
    rows = []
    lines = ylyc_text.split("\n")

    # 找到"预测明细"区块的表头行，提取年份列
    # 表头行格式: "时间\t机构\t研究员\t2025年\t2026年预测\t2027年预测\t2028年预测"
    header_years = []
    detail_start = -1
    for i, line in enumerate(lines):
        if re.match(r"时间\t机构", line):
            # 提取年份列（格式：2025年/2026年预测/2027年预测）
            parts = line.split("\t")
            for p in parts[3:]:
                year_m = re.search(r"(\d{4})年", p)
                if year_m:
                    header_years.append(year_m.group(1))
            detail_start = i + 1
            break

    if not header_years or detail_start < 0:
        # 兜底：旧正则逻辑（只抓第一个预测年份）
        for line in lines:
            date_m = re.match(
                r"(\d{4}-\d{2}-\d{2})\s+(.+?)\s+(.+?)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(-?\d+\.?\d*|--).*?(买入|增持|中性|减持|卖出|推荐)",
                line
            )
            if date_m:
                rows.append({
                    "code": code,
                    "report_date": date_m.group(1),
                    "institution": date_m.group(2).strip(),
                    "eps_forecast": _to_float(date_m.group(5)),
                    "rating": date_m.group(7),
                    "year": f"{int(date_m.group(1)[:4])+1}E",
                })
        return rows

    # 逐行解析预测明细：一行数据 + 下一行评级
    i = detail_start
    while i < len(lines):
        line = lines[i].strip()
        # 匹配数据行：日期\t机构\t研究员\t数值...
        m = re.match(r"(\d{4}-\d{2}-\d{2})\t(.+?)\t(.+?)\t(.+)", line)
        if m:
            report_date = m.group(1)
            institution = m.group(2).strip()
            eps_values_str = m.group(4)
            eps_parts = [v.strip() for v in eps_values_str.split("\t")]

            # 下一行可能是评级（买入/增持等），也可能在同行末尾
            rating = None
            rating_pattern = r"(买入|增持|中性|减持|卖出|推荐|强烈推荐)"
            rating_m = re.search(rating_pattern, line)
            if rating_m:
                rating = rating_m.group(1)
            elif i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                rating_m2 = re.match(rating_pattern, next_line)
                if rating_m2:
                    rating = rating_m2.group(1)
                    i += 1  # 跳过评级行

            # 为每个预测年份创建一条记录（跳过已确认的历史年份：最后一个已知年之前的都是历史）
            # 只存预测年份（带 "E" 标记），历史年数据归入 snapshot
            for j, year in enumerate(header_years):
                if j < len(eps_parts):
                    val_str = eps_parts[j]
                    if val_str and val_str != "--":
                        rows.append({
                            "code": code,
                            "report_date": report_date,
                            "institution": institution,
                            "eps_forecast": _to_float(val_str),
                            "rating": rating,
                            "year": f"{year}E",
                        })
        i += 1

    return rows


def _parse_key_events(code: str, gsds_text: str) -> list[dict]:
    """从公司大事文本中解析大事事件。
    
    实际文本格式（每条事件连续排列）:
      2026-05-20股东大会[查看公告]于2026-05-20召开2025年年度股东大会 查看详情>
      2026-05-16资本运作为满足自硬公司...
      2026-04-27一季报披露[查看公告]...  同类事件
    
    策略：以 "YYYY-MM-DD事件类型" 为分割点，提取事件类型和描述。
    已知事件类型关键词列表（用于从日期后紧跟的文字中识别类型）。
    """
    EVENT_TYPES = [
        "股东大会", "资本运作", "机构调研", "一季报披露", "半年报披露", "三季报披露",
        "年报披露", "股东户数", "沪深港通", "限售解禁", "股票回购", "新增概念",
        "重大事项", "业绩预告", "股权激励", "增发", "配股", "分红送转", "融资融券",
        "龙虎榜", "大宗交易", "股权质押", "董事会", "监事会", "高管变动", "诉讼仲裁",
        "合同中标", "战略合作", "并购重组", "子公司变动", "评级变动", "中报预披露",
    ]
    
    rows = []
    # 将事件类型列表合并为正则或组，用于识别日期后的事件类型
    type_pattern = "|".join(re.escape(t) for t in EVENT_TYPES)
    
    # 按日期+事件类型分割：找所有 "YYYY-MM-DD事件类型" 的位置
    split_re = re.compile(r"(\d{4}-\d{2}-\d{2})(" + type_pattern + r")")
    
    # 找出所有起始位置
    matches = list(split_re.finditer(gsds_text))
    
    for idx, m in enumerate(matches):
        event_date = m.group(1)
        event_type = m.group(2)
        
        # 描述从事件类型之后到下一个事件起始位置之前
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(gsds_text)
        raw_desc = gsds_text[start:end].strip()
        
        # 清理描述：去掉 "[查看公告]"、"查看详情>"、"同类事件" 等
        desc = re.sub(r"\[查看公告\]", "", raw_desc)
        desc = re.sub(r"查看详情>?\s*", "", desc)
        desc = re.sub(r"同类事件\s*", "", desc)
        desc = re.sub(r"\s+", " ", desc).strip()
        
        # 跳过描述过短的（可能是噪音）
        if len(desc) < 2:
            continue
        
        rows.append({
            "code": code,
            "event_date": event_date,
            "event_type": event_type,
            "event_desc": desc[:1000],
        })
    
    return rows


def _upsert_f10_full(code: str, data: dict):
    """将全量抓取数据写入所有相关表"""
    db = SessionLocal()
    try:
        now = datetime.utcnow()

        # ──── 1. stock_f10_snapshot ────
        snap = db.query(StockF10Snapshot).filter(StockF10Snapshot.code == code).first()
        if not snap:
            snap = StockF10Snapshot(code=code)
            db.add(snap)

        snap.eps_basic           = _to_float(data.get("eps_basic"))
        snap.eps_diluted         = _to_float(data.get("eps_diluted"))
        snap.nav_per_share       = _to_float(data.get("nav_per_share"))
        snap.reserve_per_share   = _to_float(data.get("reserve_per_share"))
        snap.retained_per_share  = _to_float(data.get("retained_per_share"))
        snap.cfps                = _to_float(data.get("cfps"))
        snap.pe_dynamic          = _to_float(data.get("pe_dynamic"))
        # pe_ttm 优先从 stock_quote 取（行情数据更准确），兜底用 F10 爬取值
        quote_pe = None
        try:
            from db import StockQuote
            sq = db.query(StockQuote).filter(StockQuote.code == code).first()
            if sq and sq.pe:
                quote_pe = sq.pe
        except Exception:
            pass
        snap.pe_ttm              = quote_pe if quote_pe else _to_float(data.get("pe_ttm"))
        snap.pe_static           = _to_float(data.get("pe_static"))
        snap.pb                  = _to_float(data.get("pb"))
        snap.roe_weighted        = _to_float(data.get("roe_weighted"))
        snap.gross_margin        = _to_float(data.get("gross_margin"))
        snap.debt_ratio          = _to_float(data.get("debt_ratio"))
        snap.revenue_yoy         = _to_float(data.get("revenue_yoy"))
        snap.net_profit_yoy      = _to_float(data.get("net_profit_yoy"))
        snap.deducted_profit_yoy = _to_float(data.get("deducted_profit_yoy"))
        snap.report_period       = data.get("report_period")
        snap.source_url          = data.get("source_url")
        snap.data_source         = "eastmoney_f10"
        snap.raw_json            = json.dumps(
            {k: v for k, v in data.items() if not k.endswith("_text") and not isinstance(v, dict)},
            ensure_ascii=False
        )
        snap.updated_at = now

        # ──── 2. stock_fundamental 旧表兼容 ────
        old = db.query(StockFundamental).filter(StockFundamental.code == code).first()
        if not old:
            old = StockFundamental(code=code)
            db.add(old)
        old.roe = snap.roe_weighted
        old.gross_margin = snap.gross_margin
        old.debt_ratio = snap.debt_ratio
        old.revenue_yoy = snap.revenue_yoy
        old.net_profit_yoy = snap.net_profit_yoy
        old.updated_at = now

        # ──── 3. stock_f10_financial_statement 财务三表 + cwfx 成长性摘要 ────
        stmts = data.get("financial_statements", {})
        for stmt_type, stmt_data in stmts.items():
            if isinstance(stmt_data, dict):
                for tab_label, content in stmt_data.items():
                    if content and len(content) > 100:
                        existing = db.query(StockF10FinancialStatement).filter(
                            StockF10FinancialStatement.code == code,
                            StockF10FinancialStatement.statement_type == stmt_type,
                            StockF10FinancialStatement.tab_label == tab_label,
                        ).first()
                        if not existing:
                            existing = StockF10FinancialStatement(
                                code=code,
                                statement_type=stmt_type,
                                tab_label=tab_label,
                                report_date=data.get("report_period") or now.strftime("%Y-%m-%d"),
                            )
                            db.add(existing)
                        existing.content_text = content
                        existing.updated_at = now

        # 额外保存 cwfx 成长性摘要（含同比增长、ROE 等历史多期数据）
        for cwfx_tab_label, cwfx_content_key in [("按报告期", "cwfx_by_period"), ("按年度", "cwfx_by_year")]:
            cwfx_content = data.get(cwfx_content_key, "")
            if cwfx_content and len(cwfx_content) > 100 and "同比" in cwfx_content:
                existing_cwfx = db.query(StockF10FinancialStatement).filter(
                    StockF10FinancialStatement.code == code,
                    StockF10FinancialStatement.statement_type == "cwfx_summary",
                    StockF10FinancialStatement.tab_label == cwfx_tab_label,
                ).first()
                if not existing_cwfx:
                    existing_cwfx = StockF10FinancialStatement(
                        code=code,
                        statement_type="cwfx_summary",
                        tab_label=cwfx_tab_label,
                        report_date=data.get("report_period") or now.strftime("%Y-%m-%d"),
                    )
                    db.add(existing_cwfx)
                existing_cwfx.content_text = cwfx_content
                existing_cwfx.updated_at = now

        # ──── 4. stock_f10_dividend_history 分红历史 ────
        if data.get("fhrz_text"):
            div_rows = _parse_dividend_history(code, data["fhrz_text"])
            for dr in div_rows:
                ex = db.query(StockF10DividendHistory).filter(
                    StockF10DividendHistory.code == code,
                    StockF10DividendHistory.report_period == dr["report_period"],
                ).first()
                if not ex:
                    ex = StockF10DividendHistory(code=code, report_period=dr["report_period"])
                    db.add(ex)
                ex.announce_date = dr.get("announce_date")
                ex.dividend_plan = dr.get("dividend_plan")
                ex.record_date = dr.get("record_date")
                ex.ex_div_date = dr.get("ex_div_date")
                ex.dividend_per_share = dr.get("dividend_per_share")
                ex.status = dr.get("status")
                ex.updated_at = now

        # ──── 5. stock_f10_institution_forecast 机构预测 ────
        if data.get("ylyc_text"):
            fc_rows = _parse_institution_forecast(code, data["ylyc_text"])
            for fr in fc_rows:
                ex = db.query(StockF10InstitutionForecast).filter(
                    StockF10InstitutionForecast.code == code,
                    StockF10InstitutionForecast.institution == fr.get("institution", ""),
                    StockF10InstitutionForecast.year == fr.get("year", ""),
                ).first()
                if not ex:
                    ex = StockF10InstitutionForecast(
                        code=code,
                        institution=fr.get("institution", ""),
                        year=fr.get("year", ""),
                    )
                    db.add(ex)
                ex.eps_forecast = fr.get("eps_forecast")
                ex.rating = fr.get("rating")
                ex.report_date = fr.get("report_date")
                ex.updated_at = now

        # ──── 6. stock_f10_business_analysis 经营分析 ────
        biz = db.query(StockF10BusinessAnalysis).filter(
            StockF10BusinessAnalysis.code == code
        ).first()
        if not biz:
            biz = StockF10BusinessAnalysis(code=code)
            db.add(biz)
        biz.report_date = data.get("report_period")
        # 优先存结构化的 jyfx_table_rows（带 ratio/revenue），兼容旧版 jyfx_categories 文本
        jyfx_table_rows = data.get("jyfx_table_rows", {})
        if jyfx_table_rows:
            biz.main_business_breakdown = json.dumps(
                {"structured": jyfx_table_rows, "raw": data.get("jyfx_categories", {})},
                ensure_ascii=False
            )
        else:
            biz.main_business_breakdown = json.dumps(
                data.get("jyfx_categories", {}), ensure_ascii=False
            )
        biz.rd_expense_ratio = _to_float(data.get("rd_expense_ratio"))
        biz.updated_at = now
        # 提取经营评述
        jyfx_text = data.get("jyfx_text", "")
        biz_review_m = re.search(r"经营评述(.{200,3000}?)(?:核心竞争力|行业背景|$)", jyfx_text, re.S)
        if biz_review_m:
            biz.business_review = biz_review_m.group(1).strip()

        # ──── 6b. stock_f10_financial_history 近5年历史财报 ────
        try:
            # 优先从三张报表文本合并解析（income 有绝对值，balance_sheet 有 yoy/ROE）
            # 此时 financial_statements 已写入数据库，直接用 _build_history_from_statements 读取
            hist_rows = _build_history_from_statements(code)
            if not hist_rows:
                # 兜底：直接从 cwfx_by_period 文本解析（可能只有 yoy/ROE，无绝对值）
                hist_rows = _parse_cwfx_history(
                    code,
                    data.get("cwfx_by_period", ""),
                    data.get("cwfx_by_year", ""),
                )
            for hr in hist_rows:
                ex = db.query(StockF10FinancialHistory).filter(
                    StockF10FinancialHistory.code == code,
                    StockF10FinancialHistory.report_date == hr["report_date"],
                ).first()
                if not ex:
                    ex = StockF10FinancialHistory(
                        code=code,
                        report_date=hr["report_date"],
                    )
                    db.add(ex)
                # 只更新有值的字段
                for field in ["revenue", "revenue_yoy", "net_profit", "net_profit_yoy",
                               "deducted_profit", "gross_profit", "gross_margin",
                               "net_margin", "roe_weighted", "debt_ratio", "eps_basic", "nav_per_share"]:
                    val = hr.get(field)
                    if val is not None:
                        setattr(ex, field, val)
                ex.updated_at = now
            if hist_rows:
                logger.info(f"[F10] {code} 写入 financial_history {len(hist_rows)} 条")
        except Exception as e:
            logger.warning(f"[F10] {code} 写入 financial_history 失败: {e}")

        # ──── 7. stock_f10_shareholder_info 股东研究 ────
        sh = db.query(StockF10ShareholderInfo).filter(
            StockF10ShareholderInfo.code == code
        ).first()
        if not sh:
            sh = StockF10ShareholderInfo(code=code)
            db.add(sh)
        sh.report_date = data.get("report_period")
        sh.top10_holders = data.get("gdyj_text", "")[:5000]
        sh.updated_at = now

        # ──── 8. stock_f10_peer_comparison 同行比较 ────
        pc = db.query(StockF10PeerComparison).filter(
            StockF10PeerComparison.code == code
        ).first()
        if not pc:
            pc = StockF10PeerComparison(code=code)
            db.add(pc)
        pc.content_text = data.get("thbj_text", "")
        pc.report_date = data.get("report_period")
        pc.updated_at = now

        # ──── 9. stock_f10_company_profile 公司概况/高管/股本 ────
        cp = db.query(StockF10CompanyProfile).filter(
            StockF10CompanyProfile.code == code
        ).first()
        if not cp:
            cp = StockF10CompanyProfile(code=code)
            db.add(cp)
        cp.main_business = data.get("gsgk_text", "")[:3000]
        cp.executives_json = data.get("gsgg_text", "")[:3000]
        cp.share_structure_json = data.get("gbjg_text", "")[:2000]
        cp.concept_sectors = data.get("hxtc_text", "")[:2000]
        cp.capital_operations = data.get("zbyz_text", "")[:2000]
        cp.related_stocks_json = data.get("glgg_text", "")[:1000]
        # 提取核心竞争力和行业背景
        gsgk_text = data.get("gsgk_text", "") or data.get("zyzb_text", "")
        cc_m = re.search(r"核心竞争力(.{100,3000}?)(?:智能制造|产品优势|科技创新|行业背景|$)", gsgk_text, re.S)
        if cc_m:
            cp.core_competence = cc_m.group(1).strip()
        ib_m = re.search(r"行业背景(.{100,2000}?)(?:核心竞争力|主营业务|$)", gsgk_text, re.S)
        if ib_m:
            cp.industry_background = ib_m.group(1).strip()
        cp.updated_at = now

        # ──── 10. stock_f10_fund_flow 资金流向/龙虎榜 ────
        ff = db.query(StockF10FundFlow).filter(
            StockF10FundFlow.code == code
        ).first()
        if not ff:
            ff = StockF10FundFlow(code=code)
            db.add(ff)
        ff.fund_flow_text = data.get("zjlx_text", "")[:3000]
        ff.dragon_tiger_text = data.get("lhbd_text", "")[:3000]
        ff.margin_balance = _to_float(data.get("margin_balance"))
        # 提取最近龙虎榜信息
        lhbd_text = data.get("lhbd_text", "")
        dt_m = re.search(r"(\d{4}-\d{2}-\d{2})\s+龙虎榜\s+(.+?)(?:\n|$)", lhbd_text)
        if dt_m:
            ff.last_dragon_date = dt_m.group(1)
            ff.last_dragon_reason = dt_m.group(2).strip()[:200]
        ff.updated_at = now

        # ──── 11. stock_f10_research_report 研究报告 ────
        yjbg_text = data.get("yjbg_text", "")
        rr_pattern = r"\[(买入|增持|推荐|中性|减持|卖出)[^\]]*\]\s*\n?(.+?)\n\s*(\d{4}-\d{2}-\d{2})"
        for m in re.finditer(rr_pattern, yjbg_text):
            rating = m.group(1)
            title = m.group(2).strip()
            rdate = m.group(3)
            ex = db.query(StockF10ResearchReport).filter(
                StockF10ResearchReport.code == code,
                StockF10ResearchReport.report_date == rdate,
                StockF10ResearchReport.title == title[:200],
            ).first()
            if not ex:
                ex = StockF10ResearchReport(
                    code=code,
                    report_date=rdate,
                    title=title[:200],
                )
                db.add(ex)
            ex.rating = rating
            ex.updated_at = now

        # ──── 12. stock_f10_key_events 公司大事 ────
        if data.get("gsds_text"):
            # 先清空该股票旧数据（大事纪要全量刷新）
            db.query(StockF10KeyEvents).filter(StockF10KeyEvents.code == code).delete()
            key_event_rows = _parse_key_events(code, data["gsds_text"])
            # 合并同天同类型事件（应对 UNIQUE(code,event_date,event_type) 约束）
            merged: dict = {}
            for ke in key_event_rows:
                key = (ke["event_date"], ke["event_type"])
                if key in merged:
                    merged[key]["event_desc"] = (merged[key]["event_desc"] + " / " + ke["event_desc"])[:1000]
                else:
                    merged[key] = dict(ke)
            for ke in merged.values():
                ev = StockF10KeyEvents(
                    code=code,
                    event_date=ke["event_date"],
                    event_type=ke["event_type"],
                    event_desc=ke["event_desc"],
                )
                db.add(ev)
            logger.info(f"[F10] {code} 写入 key_events {len(merged)} 条")

        db.commit()
        logger.info(f"[F10] {code} 数据写库完成")
    except Exception as e:
        db.rollback()
        logger.error(f"[F10] {code} 数据写库失败: {e}")
        raise
    finally:
        db.close()


# ──────────────────────────────────────────────
# 向下兼容：旧版轻量抓取（仅抓5个标签页）
# ──────────────────────────────────────────────

def _scrape_f10(code: str) -> dict:
    """轻量版抓取（仅核心指标），用于快速查询场景"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError("playwright 未安装")

    base = _f10_url(code)
    result: dict = {"code": code, "source_url": base, "scraped_at": datetime.utcnow().isoformat()}
    ua = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 900}, user_agent=ua)
        page = ctx.new_page()

        page.goto(base + "zyzb", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        text = _get_content(page, 60)
        result["zyzb_text"] = text

        def _ex(pattern, txt, group=1):
            m = re.search(pattern, txt, re.S)
            return m.group(group).strip() if m else None

        result["eps_basic"]           = _ex(r"基本每股收益.*?(\-?\d+\.?\d*)", text)
        result["eps_diluted"]         = _ex(r"稀释每股收益.*?(\-?\d+\.?\d*)", text)
        result["nav_per_share"]       = _ex(r"每股净资产.*?(\-?\d+\.?\d*)", text)
        result["cfps"]                = _ex(r"每股经营现金流.*?(\-?\d+\.?\d*)", text)
        result["pe_ttm"]              = _ex(r"市盈率TTM.*?(\-?\d+\.?\d*)", text)
        result["pb"]                  = _ex(r"市净率.*?(\-?\d+\.?\d*)", text)
        result["roe_weighted"]        = _ex(r"加权净资产收益率.*?(\-?\d+\.?\d*)", text)
        result["gross_margin"]        = _ex(r"毛利率.*?(\-?\d+\.?\d*)", text)
        result["debt_ratio"]          = _ex(r"资产负债率.*?(\-?\d+\.?\d*)", text)
        result["revenue_yoy"]         = _ex(r"营业总收入同比增长.*?(\-?\d+\.?\d*)", text)
        result["net_profit_yoy"]      = _ex(r"归属净利润同比增长.*?(\-?\d+\.?\d*)", text)
        result["deducted_profit_yoy"] = _ex(r"扣非净利润同比增长.*?(\-?\d+\.?\d*)", text)
        result["report_period"]       = _ex(r"(\d{4}-\d{2}-\d{2})", text)

        page.goto(base + "ylyc", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        ylyc = _get_content(page, 60)
        result["ylyc_text"] = ylyc
        result["consensus_rating"] = _ex(r"综合评级\s+(买入|增持|中性|减持|卖出)", ylyc)

        page.goto(base + "fhrz", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        result["fhrz_text"] = _get_content(page, 60)

        browser.close()
    return result


def _upsert_f10(code: str, data: dict):
    """轻量版写库（向下兼容）"""
    db = SessionLocal()
    try:
        snap = db.query(StockF10Snapshot).filter(StockF10Snapshot.code == code).first()
        if not snap:
            snap = StockF10Snapshot(code=code)
            db.add(snap)

        snap.eps_basic           = _to_float(data.get("eps_basic"))
        snap.eps_diluted         = _to_float(data.get("eps_diluted"))
        snap.nav_per_share       = _to_float(data.get("nav_per_share"))
        snap.cfps                = _to_float(data.get("cfps"))
        snap.pe_ttm              = _to_float(data.get("pe_ttm"))
        snap.pb                  = _to_float(data.get("pb"))
        snap.roe_weighted        = _to_float(data.get("roe_weighted"))
        snap.gross_margin        = _to_float(data.get("gross_margin"))
        snap.debt_ratio          = _to_float(data.get("debt_ratio"))
        snap.revenue_yoy         = _to_float(data.get("revenue_yoy"))
        snap.net_profit_yoy      = _to_float(data.get("net_profit_yoy"))
        snap.deducted_profit_yoy = _to_float(data.get("deducted_profit_yoy"))
        snap.report_period       = data.get("report_period")
        snap.source_url          = data.get("source_url")
        snap.data_source         = "eastmoney_f10"
        snap.raw_json            = json.dumps(
            {k: v for k, v in data.items() if not k.endswith("_text")},
            ensure_ascii=False
        )
        snap.updated_at = datetime.now()

        old = db.query(StockFundamental).filter(StockFundamental.code == code).first()
        if not old:
            old = StockFundamental(code=code)
            db.add(old)
        old.roe = snap.roe_weighted
        old.gross_margin = snap.gross_margin
        old.debt_ratio = snap.debt_ratio
        old.revenue_yoy = snap.revenue_yoy
        old.net_profit_yoy = snap.net_profit_yoy
        old.updated_at = datetime.now()

        db.commit()
    finally:
        db.close()


# ──────────────────────────────────────────────
# API 路由
# ──────────────────────────────────────────────

@router.get("/{code}")
async def get_fundamental(code: str, force_sync: bool = False):
    """
    查询基本面数据。
    - 优先读数据库 stock_f10_snapshot
    - 若数据库无数据，或数据超过 24h 未更新，自动触发 F10 抓取（轻量版）
    - force_sync=true 可强制重新抓取
    """
    def _fetch():
        db = SessionLocal()
        try:
            snap = db.query(StockF10Snapshot).filter(StockF10Snapshot.code == code).first()
            old  = db.query(StockFundamental).filter(StockFundamental.code == code).first()
            return snap, old
        finally:
            db.close()

    snap, old = await run_in_threadpool(_fetch)

    need_sync = force_sync
    if not snap:
        need_sync = True
    elif snap.updated_at and (datetime.utcnow() - snap.updated_at) > timedelta(hours=24):
        need_sync = True

    if need_sync:
        try:
            scraped = await run_in_threadpool(_scrape_f10, code)
            await run_in_threadpool(_upsert_f10, code, scraped)
            snap, old = await run_in_threadpool(_fetch)
        except Exception as e:
            logger.error(f"F10 scrape failed for {code}: {e}")
            if not snap and not old:
                raise HTTPException(
                    status_code=404,
                    detail=f"数据库无 {code} 基本面数据，且 F10 抓取失败: {str(e)}"
                )

    if not snap and not old:
        raise HTTPException(status_code=404, detail=f"No fundamental data for {code}")

    result = {
        "code": code,
        "source_url": _f10_url(code),
        "data_freshness": snap.updated_at.strftime("%Y-%m-%d %H:%M") if snap and snap.updated_at else None,
        "report_period": snap.report_period if snap else (old.report_date if old else None),
    }

    if snap:
        result["metrics"] = {
            "per_share": {
                "eps_basic":          snap.eps_basic,
                "eps_diluted":        snap.eps_diluted,
                "nav_per_share":      snap.nav_per_share,
                "cfps":               snap.cfps,
                "retained_per_share": snap.retained_per_share,
            },
            "valuation": {
                "pe_ttm":                 snap.pe_ttm,
                "pe_static":              snap.pe_static,
                "pe_dynamic":             snap.pe_dynamic,
                "pb":                     snap.pb,
                "total_market_cap":       snap.total_market_cap,
                "circulating_market_cap": snap.circulating_market_cap,
            },
            "profitability": {
                "roe_weighted": snap.roe_weighted,
                "roa_weighted": snap.roa_weighted,
                "gross_margin": snap.gross_margin,
                "net_margin":   snap.net_margin,
            },
            "growth": {
                "revenue_yoy":         snap.revenue_yoy,
                "revenue_qoq":         snap.revenue_qoq,
                "net_profit_yoy":      snap.net_profit_yoy,
                "net_profit_qoq":      snap.net_profit_qoq,
                "deducted_profit_yoy": snap.deducted_profit_yoy,
            },
            "leverage": {
                "debt_ratio":    snap.debt_ratio,
                "current_ratio": snap.current_ratio,
                "quick_ratio":   snap.quick_ratio,
            },
            "cashflow": {
                "cfps":                snap.cfps,
                "sales_cashflow_ratio": snap.sales_cashflow_ratio,
            },
        }
    elif old:
        result["metrics"] = {
            "profitability": {"roe_weighted": old.roe, "gross_margin": old.gross_margin},
            "growth":        {"revenue_yoy": old.revenue_yoy, "net_profit_yoy": old.net_profit_yoy},
            "leverage":      {"debt_ratio": old.debt_ratio},
        }

    return result


@router.post("/{code}/sync")
async def sync_fundamental(code: str, background_tasks: BackgroundTasks, full: bool = False):
    """
    主动触发 F10 数据同步（异步后台执行）
    - full=false (默认) 轻量版：仅同步主要指标
    - full=true  全量版：爬取全部20个标签页（约2-3分钟）
    """
    def _do_sync():
        if full:
            data = _scrape_f10_full(code)
            _upsert_f10_full(code, data)
        else:
            data = _scrape_f10(code)
            _upsert_f10(code, data)

    background_tasks.add_task(run_in_threadpool, _do_sync)
    return {
        "code": code,
        "message": f"已触发 F10 {'全量' if full else '轻量'}数据同步，数据将在后台更新。来源: {_f10_url(code)}",
        "status": "syncing",
        "mode": "full" if full else "light",
    }


@router.get("/{code}/history")
async def get_fundamental_history(code: str, limit: int = 8):
    """查询历史多报告期财务数据"""
    def _fetch():
        db = SessionLocal()
        try:
            rows = (
                db.query(StockF10FinancialHistory)
                .filter(StockF10FinancialHistory.code == code)
                .order_by(StockF10FinancialHistory.report_date.desc())
                .limit(limit)
                .all()
            )
            return rows
        finally:
            db.close()

    rows = await run_in_threadpool(_fetch)
    return {
        "code": code,
        "history": [
            {
                "report_date":    r.report_date,
                "revenue":        r.revenue,
                "revenue_yoy":    r.revenue_yoy,
                "net_profit":     r.net_profit,
                "net_profit_yoy": r.net_profit_yoy,
                "roe_weighted":   r.roe_weighted,
                "gross_margin":   r.gross_margin,
                "debt_ratio":     r.debt_ratio,
                "eps_basic":      r.eps_basic,
            }
            for r in rows
        ],
    }


@router.get("/{code}/full")
async def get_fundamental_full(code: str):
    """
    查询全量 F10 数据，包含：
    - 快照指标、财务三表、分红历史、机构预测
    - 经营分析、股东研究、同行比较
    - 公司概况/高管/股本、资金流向/龙虎榜、研究报告
    """
    def _fetch_all():
        db = SessionLocal()
        try:
            snap    = db.query(StockF10Snapshot).filter_by(code=code).first()
            biz     = db.query(StockF10BusinessAnalysis).filter_by(code=code).first()
            sh      = db.query(StockF10ShareholderInfo).filter_by(code=code).first()
            pc      = db.query(StockF10PeerComparison).filter_by(code=code).first()
            cp      = db.query(StockF10CompanyProfile).filter_by(code=code).first()
            ff      = db.query(StockF10FundFlow).filter_by(code=code).first()
            divs    = db.query(StockF10DividendHistory).filter_by(code=code).order_by(
                StockF10DividendHistory.announce_date.desc()).limit(10).all()
            fcs     = db.query(StockF10InstitutionForecast).filter_by(code=code).order_by(
                StockF10InstitutionForecast.report_date.desc()).limit(20).all()
            rrs     = db.query(StockF10ResearchReport).filter_by(code=code).order_by(
                StockF10ResearchReport.report_date.desc()).limit(10).all()
            stmts   = db.query(StockF10FinancialStatement).filter_by(code=code).order_by(
                StockF10FinancialStatement.report_date.desc()).limit(6).all()
            return snap, biz, sh, pc, cp, ff, divs, fcs, rrs, stmts
        finally:
            db.close()

    snap, biz, sh, pc, cp, ff, divs, fcs, rrs, stmts = await run_in_threadpool(_fetch_all)

    if not snap:
        raise HTTPException(status_code=404, detail=f"No F10 data for {code}, please sync first: POST /api/fundamental/{code}/sync?full=true")

    return {
        "code": code,
        "source_url": _f10_url(code),
        "updated_at": snap.updated_at.strftime("%Y-%m-%d %H:%M") if snap and snap.updated_at else None,
        "snapshot": {
            "report_period": snap.report_period,
            "eps_basic": snap.eps_basic, "eps_diluted": snap.eps_diluted,
            "nav_per_share": snap.nav_per_share, "cfps": snap.cfps,
            "pe_ttm": snap.pe_ttm, "pe_static": snap.pe_static, "pb": snap.pb,
            "roe_weighted": snap.roe_weighted, "roa_weighted": snap.roa_weighted,
            "gross_margin": snap.gross_margin, "net_margin": snap.net_margin,
            "revenue_yoy": snap.revenue_yoy, "net_profit_yoy": snap.net_profit_yoy,
            "deducted_profit_yoy": snap.deducted_profit_yoy,
            "debt_ratio": snap.debt_ratio, "current_ratio": snap.current_ratio,
        },
        "business_analysis": {
            "main_business_breakdown": json.loads(biz.main_business_breakdown) if biz and biz.main_business_breakdown else None,
            "rd_expense_ratio": biz.rd_expense_ratio if biz else None,
            "business_review": biz.business_review if biz else None,
        } if biz else None,
        "shareholder": {
            "report_date": sh.report_date,
            "top10_holders": sh.top10_holders[:2000] if sh and sh.top10_holders else None,
        } if sh else None,
        "peer_comparison": {
            "industry_name": pc.industry_name,
            "content": pc.content_text[:2000] if pc and pc.content_text else None,
        } if pc else None,
        "company_profile": {
            "main_business": cp.main_business[:1000] if cp and cp.main_business else None,
            "core_competence": cp.core_competence[:500] if cp and cp.core_competence else None,
            "concept_sectors": cp.concept_sectors[:500] if cp and cp.concept_sectors else None,
        } if cp else None,
        "fund_flow": {
            "margin_balance": ff.margin_balance,
            "last_dragon_date": ff.last_dragon_date,
            "last_dragon_reason": ff.last_dragon_reason,
        } if ff else None,
        "dividends": [
            {
                "report_period": d.report_period,
                "dividend_plan": d.dividend_plan,
                "dividend_per_share": d.dividend_per_share,
                "ex_div_date": d.ex_div_date,
            } for d in divs
        ],
        "institution_forecasts": [
            {
                "institution": f.institution,
                "year": f.year,
                "eps_forecast": f.eps_forecast,
                "rating": f.rating,
                "report_date": f.report_date,
            } for f in fcs
        ],
        "research_reports": [
            {
                "report_date": r.report_date,
                "institution": r.institution,
                "rating": r.rating,
                "title": r.title,
            } for r in rrs
        ],
        "financial_statements": [
            {
                "statement_type": s.statement_type,
                "tab_label": s.tab_label,
                "report_date": s.report_date,
                "content_preview": s.content_text[:500] if s.content_text else None,
            } for s in stmts
        ],
    }


@router.get("/{code}/finance-view")
async def get_finance_view(code: str, background_tasks: BackgroundTasks):
    """
    财务 Tab 专用接口：
    - 立即从数据库返回：营收业务占比（饼图数据）+ 近5年财报历史（表格数据）
    - 同时在后台触发全量 F10 同步（异步，不阻塞响应）
    
    响应结构：
    {
      "code": "...",
      "updated_at": "...",
      "business_breakdown": [{"name": "...", "ratio": 60.25, "revenue": 1234.56}, ...],
      "income_history": [{"report_date": "2025-12-31", "revenue": 1234.56, "net_profit": 56.78, ...}, ...]
    }
    """
    def _fetch_db():
        """
        F10 表中部分字段（main_business_breakdown、raw_json 等）可能含非 UTF-8 乱码数据。
        SQLAlchemy ORM 在读取这些字段时，sqlite3 驱动会抛 OperationalError: Could not decode to UTF-8。
        解决方案：将底层 sqlite3 连接的 text_factory 临时切换为 bytes，用 errors='replace' 解码，
        再构造轻量 proxy 对象传给上层逻辑。
        """
        import sqlite3 as _sqlite3

        db = SessionLocal()
        try:
            # ---- 获取底层 sqlite3 连接并切换为 bytes 模式 ----
            raw_conn = db.connection().connection
            orig_factory = raw_conn.text_factory
            raw_conn.text_factory = bytes

            def _safe_str(v):
                """bytes → str，非 UTF-8 字符用 ? 替代"""
                if isinstance(v, bytes):
                    return v.decode("utf-8", errors="replace")
                return v

            # ---- 读取 business_analysis ----
            biz = None
            try:
                row = raw_conn.execute(
                    "SELECT main_business_breakdown FROM stock_f10_business_analysis WHERE code=?",
                    (code,)
                ).fetchone()
                if row and row[0]:
                    decoded = _safe_str(row[0])
                    class _BizProxy:
                        main_business_breakdown = decoded
                    biz = _BizProxy()
            except Exception as e_biz:
                logger.warning(f"[finance-view] {code} 读取 business_analysis 失败，跳过: {e_biz}")

            # ---- 读取 financial_history（纯数值列，bytes 模式下仍返回 bytes for TEXT） ----
            hist_rows = raw_conn.execute(
                """SELECT report_date, revenue, revenue_yoy, net_profit, net_profit_yoy,
                          deducted_profit, gross_margin, net_margin, roe_weighted, debt_ratio, eps_basic
                   FROM stock_f10_financial_history
                   WHERE code=?
                   ORDER BY report_date DESC
                   LIMIT 20""",
                (code,)
            ).fetchall()

            class _HistProxy:
                __slots__ = ("report_date", "revenue", "revenue_yoy", "net_profit",
                             "net_profit_yoy", "deducted_profit", "gross_margin",
                             "net_margin", "roe_weighted", "debt_ratio", "eps_basic")
                def __init__(self, row):
                    self.report_date     = _safe_str(row[0])
                    self.revenue         = row[1]
                    self.revenue_yoy     = row[2]
                    self.net_profit      = row[3]
                    self.net_profit_yoy  = row[4]
                    self.deducted_profit = row[5]
                    self.gross_margin    = row[6]
                    self.net_margin      = row[7]
                    self.roe_weighted    = row[8]
                    self.debt_ratio      = row[9]
                    self.eps_basic       = row[10]

            hist = [_HistProxy(r) for r in hist_rows]

            # ---- 读取 snapshot（只需少量字段，raw_json 可能也有乱码） ----
            snap = None
            try:
                snap_row = raw_conn.execute(
                    """SELECT updated_at, report_period, revenue_yoy, net_profit_yoy,
                              roe_weighted, gross_margin, net_margin
                       FROM stock_f10_snapshot WHERE code=?""",
                    (code,)
                ).fetchone()
                if snap_row:
                    from datetime import datetime as _dt
                    class _SnapProxy:
                        pass
                    s = _SnapProxy()
                    s.updated_at      = _dt.fromisoformat(_safe_str(snap_row[0])) if snap_row[0] else None
                    s.report_period   = _safe_str(snap_row[1]) if snap_row[1] else None
                    s.revenue_yoy     = snap_row[2]
                    s.net_profit_yoy  = snap_row[3]
                    s.roe_weighted    = snap_row[4]
                    s.gross_margin    = snap_row[5]
                    s.net_margin      = snap_row[6]
                    snap = s
            except Exception as e_snap:
                logger.warning(f"[finance-view] {code} 读取 snapshot 失败，跳过: {e_snap}")

            return biz, hist, snap
        finally:
            # 还原 text_factory，避免影响其他查询
            try:
                raw_conn.text_factory = orig_factory
            except Exception:
                pass
            db.close()

    biz, hist, snap = await run_in_threadpool(_fetch_db)

    # 解析营收业务占比（饼图数据）
    business_breakdown = []
    if biz and biz.main_business_breakdown:
        try:
            raw = json.loads(biz.main_business_breakdown)
            # 新格式：{"structured": {...}, "raw": {...}}
            if isinstance(raw, dict) and "structured" in raw:
                business_breakdown = _parse_jyfx_breakdown(raw["structured"])
            # 旧格式：直接是 {"按产品": "...", ...}（纯文本，无法直接用）
            elif isinstance(raw, dict):
                # 尝试旧格式作为 table_rows 处理（可能只有文本）
                business_breakdown = _parse_jyfx_breakdown(raw)
        except Exception as e:
            logger.warning(f"[finance-view] {code} 解析 business_breakdown 失败: {e}")

    # 过滤近5年财报（最多20条，按报告期降序）
    cutoff_year = datetime.utcnow().year - 5
    income_history = []
    for r in hist:
        try:
            if int(r.report_date[:4]) < cutoff_year:
                continue
        except Exception:
            continue
        income_history.append({
            "report_date":      r.report_date,
            "revenue":          r.revenue,
            "revenue_yoy":      r.revenue_yoy,
            "net_profit":       r.net_profit,
            "net_profit_yoy":   r.net_profit_yoy,
            "deducted_profit":  r.deducted_profit,
            "gross_margin":     r.gross_margin,
            "net_margin":       r.net_margin,
            "roe_weighted":     r.roe_weighted,
            "debt_ratio":       r.debt_ratio,
            "eps_basic":        r.eps_basic,
        })

    # 若 stock_f10_financial_history 为空，从 stock_f10_financial_statement 直接解析（兜底）
    if not income_history:
        try:
            fallback_rows = await run_in_threadpool(_build_history_from_statements, code)
            if fallback_rows:
                income_history = fallback_rows
                logger.info(f"[finance-view] {code} 从 financial_statement 兜底解析到 {len(income_history)} 条历史数据")
        except Exception as e:
            logger.warning(f"[finance-view] {code} 兜底解析失败: {e}")

    # 用 snapshot 补充最新一期缺失的 yoy/roe 数据（snapshot 有最近一期的指标快照）
    if income_history and snap:
        latest = income_history[0]
        snap_date = snap.report_period if hasattr(snap, 'report_period') and snap.report_period else None
        # 如果最新记录日期与 snapshot 一致（或 snapshot 无报告期），补充缺失字段
        if not snap_date or latest.get("report_date") == snap_date:
            for field, snap_field in [
                ("revenue_yoy",    "revenue_yoy"),
                ("net_profit_yoy", "net_profit_yoy"),
                ("roe_weighted",   "roe_weighted"),
                ("gross_margin",   "gross_margin"),
                ("net_margin",     "net_margin"),
            ]:
                if latest.get(field) is None:
                    v = getattr(snap, snap_field, None)
                    if v is not None:
                        latest[field] = v

    # 后台触发全量同步（不阻塞）
    def _bg_sync():
        try:
            data = _scrape_f10_full(code)
            _upsert_f10_full(code, data)
            logger.info(f"[finance-view] {code} 后台全量同步完成")
        except Exception as e:
            logger.warning(f"[finance-view] {code} 后台同步失败: {e}")

    background_tasks.add_task(run_in_threadpool, _bg_sync)

    return {
        "code":               code,
        "updated_at":         snap.updated_at.strftime("%Y-%m-%d %H:%M") if snap and snap.updated_at else None,
        "has_data":           bool(business_breakdown or income_history),
        "business_breakdown": business_breakdown,
        "income_history":     income_history,
        "syncing":            True,
    }
