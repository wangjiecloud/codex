#!/usr/bin/env python3
"""
scrape_f10.py — 东方财富 F10 全量爬取并写入数据库

用法:
    python scrape_f10.py --code 000657
    python scrape_f10.py --code 000657 --light   # 仅主要指标
    python scrape_f10.py --code 000657 --db /path/to/stock_data.db
"""
import argparse
import json
import re
import sys
import os
import sqlite3
from datetime import datetime

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# ──────────────────────────────────────────────
# 工具
# ──────────────────────────────────────────────

def market_prefix(code: str) -> str:
    return "sz" if code.startswith(("0", "3")) else "sh"


def f10_url(code: str) -> str:
    return (
        f"https://emweb.securities.eastmoney.com/pc_hsf10/pages/index.html"
        f"?type=web&code={market_prefix(code)}{code}&color=b#/"
    )


def get_content(page, skip_lines: int = 60) -> str:
    lines = page.inner_text("body").split("\n")
    return "\n".join(l.strip() for l in lines[skip_lines:] if l.strip())


def to_float(val):
    if val is None:
        return None
    s = str(val).strip().replace(",", "").replace("%", "")
    s = s.replace("亿", "e8").replace("万", "e4")
    s = re.sub(r"[^\d.\-+eE]", "", s)
    try:
        return float(s)
    except Exception:
        return None


def ex(pattern, txt, group=1):
    m = re.search(pattern, txt, re.S)
    return m.group(group).strip() if m else None


# ──────────────────────────────────────────────
# 爬取
# ──────────────────────────────────────────────

def scrape_full(code: str) -> dict:
    """全量爬取 F10 全部 20 个标签页"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright 未安装，请运行: pip install playwright && playwright install chromium")
        sys.exit(1)

    base = f10_url(code)
    result = {"code": code, "source_url": base, "scraped_at": datetime.utcnow().isoformat()}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, user_agent=UA)
        page = ctx.new_page()

        def goto(hash_name, wait_ms=5000):
            page.goto(base + hash_name, wait_until="domcontentloaded")
            page.wait_for_timeout(wait_ms)
            return get_content(page, 60)

        # ── 1. zyzb 主要指标 ──────────────────
        print(f"  [1/20] zyzb 操盘必读...")
        text = goto("zyzb", 6000)
        result["zyzb_text"] = text
        result["eps_basic"]           = ex(r"基本每股收益.*?(\-?\d+\.?\d*)", text)
        result["eps_diluted"]         = ex(r"稀释每股收益.*?(\-?\d+\.?\d*)", text)
        result["nav_per_share"]       = ex(r"每股净资产.*?(\-?\d+\.?\d*)", text)
        result["reserve_per_share"]   = ex(r"每股公积金.*?(\-?\d+\.?\d*)", text)
        result["retained_per_share"]  = ex(r"每股未分配利润.*?(\-?\d+\.?\d*)", text)
        result["cfps"]                = ex(r"每股经营现金流.*?(\-?\d+\.?\d*)", text)
        result["pe_ttm"]              = ex(r"市盈率TTM.*?(\-?\d+\.?\d*)", text)
        result["pe_static"]           = ex(r"市盈率[-静].*?(\-?\d+\.?\d*)", text)
        result["pe_dynamic"]          = ex(r"市盈率[-动].*?(\-?\d+\.?\d*)", text)
        result["pb"]                  = ex(r"市净率.*?(\-?\d+\.?\d*)", text)
        # 修复：实际格式 "净资产收益率(加权)(%)\t9.03\t..."，取第一个值
        roe_m = re.search(r"净资产收益率\(加权\)\(%\)\t(-?\d+\.?\d*)", text)
        result["roe_weighted"]        = roe_m.group(1) if roe_m else None
        # 修复：毛利率格式 "毛利率(%)\t30.45\t..."，取第一个值
        gm_m = re.search(r"毛利率\(%\)\t(-?\d+\.?\d*)", text)
        result["gross_margin"]        = gm_m.group(1) if gm_m else ex(r"毛利率.*?(\-?\d+\.?\d*)", text)
        # 修复：资产负债率格式同上
        dr_m = re.search(r"资产负债率\(%\)\t(-?\d+\.?\d*)", text)
        result["debt_ratio"]          = dr_m.group(1) if dr_m else ex(r"资产负债率.*?(\-?\d+\.?\d*)", text)
        result["revenue_yoy"]         = ex(r"营业总收入同比增长.*?(\-?\d+\.?\d*)", text)
        result["net_profit_yoy"]      = ex(r"归属净利润同比增长.*?(\-?\d+\.?\d*)", text)
        result["deducted_profit_yoy"] = ex(r"扣非净利润同比增长.*?(\-?\d+\.?\d*)", text)
        result["report_period"]       = ex(r"(\d{4}-\d{2}-\d{2})", text)

        # ── 2. cwfx 财务分析（含三表）──────────
        print(f"  [2/20] cwfx 财务分析 + 三张报表...")
        page.goto(base + "cwfx", wait_until="domcontentloaded")
        page.wait_for_timeout(6000)
        result["cwfx_by_period"] = get_content(page, 60)

        financial_statements = {}
        for stmt_name, stmt_key in [
            ("资产负债表", "balance_sheet"),
            ("利润表",   "income"),
            ("现金流量表", "cashflow"),
        ]:
            print(f"    -> {stmt_name}")
            page.goto(base + "cwfx", wait_until="domcontentloaded")
            page.wait_for_timeout(5000)
            stmt_data = {}
            try:
                btn = page.get_by_text(stmt_name, exact=True)
                if btn.count() > 0:
                    btn.first.click()
                    page.wait_for_timeout(3000)
                    stmt_data["按报告期"] = get_content(page, 60)
                    # 其他维度
                    data_tabs = page.query_selector_all("ul.dataTab li")
                    for dt in data_tabs[:5]:
                        t = dt.inner_text().strip()
                        if t and t not in stmt_data and t in ("按单季度", "按年度", "报告期同比"):
                            dt.click()
                            page.wait_for_timeout(2000)
                            stmt_data[t] = get_content(page, 60)
            except Exception as e:
                print(f"    {stmt_name} 失败: {e}")
            financial_statements[stmt_key] = stmt_data

        result["financial_statements"] = financial_statements

        # ── 3. gdyj 股东研究 ──────────────────
        print(f"  [3/20] gdyj 股东研究...")
        text = goto("gdyj", 6000)
        result["gdyj_text"] = text

        # ── 4. jyfx 经营分析 ──────────────────
        print(f"  [4/20] jyfx 经营分析...")
        page.goto(base + "jyfx", wait_until="domcontentloaded")
        page.wait_for_timeout(7000)
        result["jyfx_text"] = get_content(page, 60)
        result["rd_expense_ratio"] = ex(r"研发投入占营收比\s+(\d+\.?\d*)%", result["jyfx_text"])

        jyfx_categories = {}
        jyfx_table_rows = {}
        try:
            # 直接解析主营构成表格（table 元素），不依赖 tab 按钮点击
            # 表格格式：报告期\t主营构成\t主营收入(元)\t收入比例\t主营成本(元)\t...
            # 行格式：按产品分类\t产品名\t55.73亿\t31.60%\t...  或  产品名\t55.73亿\t31.60%\t...
            tables = page.query_selector_all("table")
            breakdown_table_text = ""
            for tbl in tables:
                txt = tbl.inner_text()
                if "按产品分类" in txt or ("主营构成" in txt and "收入比例" in txt):
                    breakdown_table_text = txt
                    break

            product_rows = []
            if breakdown_table_text:
                jyfx_categories["按产品"] = breakdown_table_text
                current_cat = None
                for line in breakdown_table_text.split("\n"):
                    line = line.strip()
                    if not line:
                        continue
                    parts = [p.strip() for p in line.split("\t")]
                    # 识别分类标题行（"按产品分类"、"按行业分类"、"按地区分类"）
                    if parts[0] in ("按产品分类", "按行业分类", "按地区分类"):
                        current_cat = parts[0]
                        # 同行可能带第一条产品数据
                        if len(parts) >= 4 and current_cat == "按产品分类":
                            name = parts[1]
                            rev_str = parts[2]
                            ratio_str = parts[3]
                            if "%" in ratio_str and len(name) >= 2:
                                try:
                                    ratio_val = float(ratio_str.replace("%", "").strip())
                                except Exception:
                                    ratio_val = None
                                if ratio_val and 0 < ratio_val <= 100:
                                    product_rows.append({
                                        "name": name,
                                        "revenue": to_float(rev_str),
                                        "ratio": ratio_val,
                                        "gross_margin": to_float(parts[8]) if len(parts) > 8 else None,
                                    })
                        continue
                    # 只收集「按产品分类」下的行
                    if current_cat != "按产品分类":
                        continue
                    # 普通产品行：名称\t收入\t收入比例\t...
                    if len(parts) >= 3:
                        name = parts[0]
                        if re.search(r"主营构成|收入比例|成本比例|利润比例|报告期|合计|小计", name):
                            continue
                        if len(name) < 2 or len(name) > 30:
                            continue
                        rev_str = parts[1]
                        ratio_str = parts[2]
                        if "%" in ratio_str:
                            try:
                                ratio_val = float(ratio_str.replace("%", "").strip())
                            except Exception:
                                ratio_val = None
                            if ratio_val and 0 < ratio_val <= 100:
                                product_rows.append({
                                    "name": name,
                                    "revenue": to_float(rev_str),
                                    "ratio": ratio_val,
                                    "gross_margin": to_float(parts[8]) if len(parts) > 8 else None,
                                })

            if product_rows:
                jyfx_table_rows["按产品"] = product_rows
                print(f"    jyfx 主营构成（按产品）解析到 {len(product_rows)} 行")
            else:
                print(f"    jyfx 主营构成：未找到按产品分类数据")
        except Exception as e:
            print(f"    jyfx 主营构成失败: {e}")
        result["jyfx_categories"] = jyfx_categories
        result["jyfx_table_rows"] = jyfx_table_rows

        # ── 5. ylyc 盈利预测 ──────────────────
        print(f"  [5/20] ylyc 盈利预测...")
        text = goto("ylyc", 5000)
        result["ylyc_text"] = text
        result["consensus_rating"] = ex(r"综合评级\s+(买入|增持|中性|减持|卖出)", text)
        result["analyst_count"]    = ex(r"(\d+)\s*家\s*(?:券商|机构)", text)

        # ── 6. fhrz 分红融资 ──────────────────
        print(f"  [6/20] fhrz 分红融资...")
        text = goto("fhrz", 5000)
        result["fhrz_text"] = text
        result["dividend_yield"] = ex(r"股息率\s+(\d+\.?\d*%?)", text)
        result["payout_ratio"]   = ex(r"股利支付率\s+(\d+\.?\d*%?)", text)

        # ── 7. thbj 同行比较 ──────────────────
        print(f"  [7/20] thbj 同行比较...")
        result["thbj_text"] = goto("thbj", 5000)

        # ── 8. gsgk 公司概况 ──────────────────
        print(f"  [8/20] gsgk 公司概况...")
        result["gsgk_text"] = goto("gsgk", 5000)

        # ── 9. gsgg 公司高管 ──────────────────
        print(f"  [9/20] gsgg 公司高管...")
        result["gsgg_text"] = goto("gsgg", 5000)

        # ── 10. gbjg 股本结构 ─────────────────
        print(f"  [10/20] gbjg 股本结构...")
        result["gbjg_text"] = goto("gbjg", 5000)

        # ── 11. hxtc 核心题材 ─────────────────
        print(f"  [11/20] hxtc 核心题材...")
        result["hxtc_text"] = goto("hxtc", 5000)

        # ── 12. gsds 公司大事 ─────────────────
        print(f"  [12/20] gsds 公司大事...")
        result["gsds_text"] = goto("gsds", 5000)

        # ── 13. zbyz 资本运作 ─────────────────
        print(f"  [13/20] zbyz 资本运作...")
        result["zbyz_text"] = goto("zbyz", 6000)

        # ── 14. glgg 关联个股 ─────────────────
        print(f"  [14/20] glgg 关联个股...")
        result["glgg_text"] = goto("glgg", 5000)

        # ── 15. zjlx 资金流向 ─────────────────
        print(f"  [15/20] zjlx 资金流向...")
        text = goto("zjlx", 5000)
        result["zjlx_text"] = text
        result["margin_balance"] = ex(r"融资余额(\d+\.?\d*亿?万?)", text)

        # ── 16. lhbd 龙虎榜 ──────────────────
        print(f"  [16/20] lhbd 龙虎榜...")
        result["lhbd_text"] = goto("lhbd", 5000)

        # ── 17. jgpj 机构评级 ─────────────────
        print(f"  [17/20] jgpj 机构评级...")
        result["jgpj_text"] = goto("jgpj", 5000)

        # ── 18. yjbg 研究报告 ─────────────────
        print(f"  [18/20] yjbg 研究报告...")
        result["yjbg_text"] = goto("yjbg", 5000)

        # ── 19. zndp 智能点评 ─────────────────
        print(f"  [19/20] zndp 智能点评...")
        result["zndp_text"] = goto("zndp", 5000)

        # ── 20. zxgg 资讯公告 ─────────────────
        print(f"  [20/20] zxgg 资讯公告...")
        result["zxgg_text"] = goto("zxgg", 5000)

        browser.close()

    print(f"  爬取完成，共 {len(result)} 个字段")
    return result


def scrape_light(code: str) -> dict:
    """轻量版：只抓 zyzb / ylyc / fhrz"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright 未安装")
        sys.exit(1)

    base = f10_url(code)
    result = {"code": code, "source_url": base, "scraped_at": datetime.utcnow().isoformat()}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, user_agent=UA)
        page = ctx.new_page()

        def goto(h, wait=5000):
            page.goto(base + h, wait_until="domcontentloaded")
            page.wait_for_timeout(wait)
            return get_content(page, 60)

        print("  [1/3] zyzb...")
        text = goto("zyzb", 6000)
        result["zyzb_text"] = text
        result["eps_basic"]           = ex(r"基本每股收益.*?(\-?\d+\.?\d*)", text)
        result["eps_diluted"]         = ex(r"稀释每股收益.*?(\-?\d+\.?\d*)", text)
        result["nav_per_share"]       = ex(r"每股净资产.*?(\-?\d+\.?\d*)", text)
        result["cfps"]                = ex(r"每股经营现金流.*?(\-?\d+\.?\d*)", text)
        result["pe_ttm"]              = ex(r"市盈率TTM.*?(\-?\d+\.?\d*)", text)
        result["pb"]                  = ex(r"市净率.*?(\-?\d+\.?\d*)", text)
        result["roe_weighted"]        = ex(r"加权净资产收益率.*?(\-?\d+\.?\d*)", text)
        result["gross_margin"]        = ex(r"毛利率.*?(\-?\d+\.?\d*)", text)
        result["debt_ratio"]          = ex(r"资产负债率.*?(\-?\d+\.?\d*)", text)
        result["revenue_yoy"]         = ex(r"营业总收入同比增长.*?(\-?\d+\.?\d*)", text)
        result["net_profit_yoy"]      = ex(r"归属净利润同比增长.*?(\-?\d+\.?\d*)", text)
        result["deducted_profit_yoy"] = ex(r"扣非净利润同比增长.*?(\-?\d+\.?\d*)", text)
        result["report_period"]       = ex(r"(\d{4}-\d{2}-\d{2})", text)

        print("  [2/3] ylyc...")
        text = goto("ylyc", 5000)
        result["ylyc_text"] = text
        result["consensus_rating"] = ex(r"综合评级\s+(买入|增持|中性|减持|卖出)", text)

        print("  [3/3] fhrz...")
        result["fhrz_text"] = goto("fhrz", 5000)

        browser.close()
    return result


# ──────────────────────────────────────────────
# 数据解析
# ──────────────────────────────────────────────

def parse_dividend_history(code, fhrz_text):
    rows = []
    pattern = (
        r"(\d{4}年报|\d{4}半年报|\d{4}[一二三四]季报)\s+"
        r"(\d{4}-\d{2}-\d{2})\s+"
        r"([^\t\n]+?(?:派[^\t\n]+?元|不分配[^\t\n]*?|10转\d+[^\t\n]*?))\s+"
        r"(\d{4}-\d{2}-\d{2}|--)\s+"
        r"(\d{4}-\d{2}-\d{2}|--)"
    )
    for m in re.finditer(pattern, fhrz_text):
        plan = m.group(3).strip()
        cash_m = re.search(r"派(\d+\.?\d*)元", plan)
        dps = float(cash_m.group(1)) / 10 if cash_m else None
        rows.append({
            "code": code,
            "report_period": m.group(1),
            "announce_date": m.group(2),
            "dividend_plan": plan,
            "record_date": m.group(4) if m.group(4) != "--" else None,
            "ex_div_date": m.group(5) if m.group(5) != "--" else None,
            "dividend_per_share": dps,
        })
    return rows


def parse_institution_forecast(code, ylyc_text):
    """从盈利预测明细中解析机构预测（每家机构每个预测年份各一行）。
    
    表头行: "时间\t机构\t研究员\t2025年\t2026年预测\t2027年预测\t2028年预测"
    数据行: "2026-05-06\t中国银河\t华立\t0.5620\t2.11\t2.22\t2.46"
    评级行: "买入"
    """
    rows = []
    lines = ylyc_text.split("\n")

    # 找表头行，提取年份列
    header_years = []
    detail_start = -1
    for i, line in enumerate(lines):
        if re.match(r"时间\t机构", line):
            parts = line.split("\t")
            for p in parts[3:]:
                year_m = re.search(r"(\d{4})年", p)
                if year_m:
                    header_years.append(year_m.group(1))
            detail_start = i + 1
            break

    if not header_years or detail_start < 0:
        # 兜底：旧逻辑
        pattern = r"(\d{4}-\d{2}-\d{2})\s+(.+?)\s+[\w,，]+\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(-?\d+\.?\d*|--).*?(买入|增持|中性|减持|卖出|推荐)"
        for m in re.finditer(pattern, ylyc_text):
            rdate = m.group(1)
            inst  = m.group(2).strip()
            eps   = to_float(m.group(4))
            rating = m.group(6)
            yr    = str(int(rdate[:4]) + 1) + "E"
            rows.append({"code": code, "report_date": rdate, "institution": inst,
                         "eps_forecast": eps, "rating": rating, "year": yr})
        return rows

    i = detail_start
    while i < len(lines):
        line = lines[i].strip()
        m = re.match(r"(\d{4}-\d{2}-\d{2})\t(.+?)\t(.+?)\t(.+)", line)
        if m:
            report_date = m.group(1)
            institution = m.group(2).strip()
            eps_parts = [v.strip() for v in m.group(4).split("\t")]

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
                    i += 1

            for j, year in enumerate(header_years):
                if j < len(eps_parts):
                    val_str = eps_parts[j]
                    if val_str and val_str != "--":
                        rows.append({
                            "code": code,
                            "report_date": report_date,
                            "institution": institution,
                            "eps_forecast": to_float(val_str),
                            "rating": rating,
                            "year": f"{year}E",
                        })
        i += 1

    return rows


def parse_research_reports(code, yjbg_text):
    rows = []
    pattern = r"\[(买入|增持|推荐|中性|减持|卖出)[^\]]*\]\s*\n?(.+?)\n\s*(\d{4}-\d{2}-\d{2})"
    for m in re.finditer(pattern, yjbg_text):
        rows.append({"code": code, "rating": m.group(1),
                     "title": m.group(2).strip()[:200], "report_date": m.group(3)})
    return rows


def parse_key_events(code, gsds_text):
    """从公司大事文本中解析大事事件。
    
    格式：YYYY-MM-DD事件类型描述内容（各事件连续排列）
    策略：以已知事件类型关键词为标志，按日期+类型切割。
    """
    EVENT_TYPES = [
        "股东大会", "资本运作", "机构调研", "一季报披露", "半年报披露", "三季报披露",
        "年报披露", "股东户数", "沪深港通", "限售解禁", "股票回购", "新增概念",
        "重大事项", "业绩预告", "股权激励", "增发", "配股", "分红送转", "融资融券",
        "龙虎榜", "大宗交易", "股权质押", "董事会", "监事会", "高管变动", "诉讼仲裁",
        "合同中标", "战略合作", "并购重组", "子公司变动", "评级变动", "中报预披露",
    ]
    type_pattern = "|".join(re.escape(t) for t in EVENT_TYPES)
    split_re = re.compile(r"(\d{4}-\d{2}-\d{2})(" + type_pattern + r")")
    matches = list(split_re.finditer(gsds_text))
    rows = []
    for idx, m in enumerate(matches):
        event_date = m.group(1)
        event_type = m.group(2)
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(gsds_text)
        raw_desc = gsds_text[start:end].strip()
        desc = re.sub(r"\[查看公告\]", "", raw_desc)
        desc = re.sub(r"查看详情>?\s*", "", desc)
        desc = re.sub(r"同类事件\s*", "", desc)
        desc = re.sub(r"\s+", " ", desc).strip()
        if len(desc) >= 2:
            rows.append({
                "code": code,
                "event_date": event_date,
                "event_type": event_type,
                "event_desc": desc[:1000],
            })
    return rows[:100]  # 最多100条


# ──────────────────────────────────────────────
# 写库
# ──────────────────────────────────────────────

def upsert_all(code: str, data: dict, db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    now = datetime.utcnow().isoformat()

    def upsert(table, where_cols, row_dict):
        """通用 upsert：若存在则 UPDATE，否则 INSERT"""
        row_dict["updated_at"] = now
        cols = list(row_dict.keys())
        placeholders = ", ".join(["?"] * len(cols))
        where_clause = " AND ".join([f"{c}=?" for c in where_cols])
        where_vals = [row_dict[c] for c in where_cols]
        existing = conn.execute(
            f"SELECT 1 FROM {table} WHERE {where_clause}", where_vals
        ).fetchone()
        if existing:
            set_clause = ", ".join([f"{c}=?" for c in cols if c not in where_cols])
            set_vals = [row_dict[c] for c in cols if c not in where_cols]
            conn.execute(f"UPDATE {table} SET {set_clause} WHERE {where_clause}",
                         set_vals + where_vals)
        else:
            conn.execute(
                f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders})",
                [row_dict[c] for c in cols]
            )

    # ── 1. stock_f10_snapshot ──────────────
    # pe_ttm 优先从 stock_quote 取（更准确），兜底用 F10 爬取值
    pe_ttm_val = to_float(data.get("pe_ttm"))
    try:
        row = conn.execute("SELECT pe FROM stock_quote WHERE code=?", (code,)).fetchone()
        if row and row[0]:
            pe_ttm_val = to_float(str(row[0]))
    except Exception:
        pass

    upsert("stock_f10_snapshot", ["code"], {
        "code": code,
        "eps_basic":           to_float(data.get("eps_basic")),
        "eps_diluted":         to_float(data.get("eps_diluted")),
        "nav_per_share":       to_float(data.get("nav_per_share")),
        "reserve_per_share":   to_float(data.get("reserve_per_share")),
        "retained_per_share":  to_float(data.get("retained_per_share")),
        "cfps":                to_float(data.get("cfps")),
        "pe_dynamic":          to_float(data.get("pe_dynamic")),
        "pe_ttm":              pe_ttm_val,
        "pe_static":           to_float(data.get("pe_static")),
        "pb":                  to_float(data.get("pb")),
        "roe_weighted":        to_float(data.get("roe_weighted")),
        "gross_margin":        to_float(data.get("gross_margin")),
        "debt_ratio":          to_float(data.get("debt_ratio")),
        "revenue_yoy":         to_float(data.get("revenue_yoy")),
        "net_profit_yoy":      to_float(data.get("net_profit_yoy")),
        "deducted_profit_yoy": to_float(data.get("deducted_profit_yoy")),
        "report_period":       data.get("report_period"),
        "source_url":          data.get("source_url"),
        "data_source":         "eastmoney_f10",
        "raw_json":            json.dumps(
            {k: v for k, v in data.items()
             if not k.endswith("_text") and not isinstance(v, dict)},
            ensure_ascii=False
        ),
    })
    print(f"  ✓ stock_f10_snapshot")

    # ── 2. stock_f10_financial_statement ──
    stmts = data.get("financial_statements", {})
    rp = data.get("report_period") or now[:10]
    cnt = 0
    for stmt_type, stmt_data in stmts.items():
        if isinstance(stmt_data, dict):
            for tab_label, content in stmt_data.items():
                if content and len(content) > 100:
                    upsert("stock_f10_financial_statement",
                           ["code", "statement_type", "tab_label", "report_date"], {
                        "code": code,
                        "statement_type": stmt_type,
                        "tab_label": tab_label,
                        "report_date": rp,
                        "content_text": content,
                    })
                    cnt += 1
    print(f"  ✓ stock_f10_financial_statement ({cnt} 条)")

    # ── 3. stock_f10_dividend_history ─────
    fhrz_text = data.get("fhrz_text", "")
    div_rows = parse_dividend_history(code, fhrz_text)
    for dr in div_rows:
        upsert("stock_f10_dividend_history", ["code", "report_period"], dr)
    print(f"  ✓ stock_f10_dividend_history ({len(div_rows)} 条)")

    # ── 4. stock_f10_institution_forecast ─
    ylyc_text = data.get("ylyc_text", "")
    fc_rows = parse_institution_forecast(code, ylyc_text)
    for fr in fc_rows:
        upsert("stock_f10_institution_forecast",
               ["code", "institution", "year"], fr)
    print(f"  ✓ stock_f10_institution_forecast ({len(fc_rows)} 条)")

    # ── 5. stock_f10_business_analysis ────
    jyfx_text = data.get("jyfx_text", "")
    biz_review_m = re.search(
        r"经营评述(.{200,3000}?)(?:核心竞争力|行业背景|$)", jyfx_text, re.S
    )
    upsert("stock_f10_business_analysis", ["code"], {
        "code": code,
        "report_date": rp,
        "main_business_breakdown": json.dumps(
            {"structured": data.get("jyfx_table_rows", {}), "raw": data.get("jyfx_categories", {})},
            ensure_ascii=False
        ),
        "rd_expense_ratio": to_float(data.get("rd_expense_ratio")),
        "business_review": biz_review_m.group(1).strip() if biz_review_m else None,
    })
    print(f"  ✓ stock_f10_business_analysis")

    # ── 6. stock_f10_shareholder_info ─────
    gdyj_text = data.get("gdyj_text", "")
    upsert("stock_f10_shareholder_info", ["code"], {
        "code": code,
        "report_date": rp,
        "top10_holders": gdyj_text[:5000],
    })
    print(f"  ✓ stock_f10_shareholder_info")

    # ── 7. stock_f10_peer_comparison ──────
    upsert("stock_f10_peer_comparison", ["code"], {
        "code": code,
        "report_date": rp,
        "content_text": data.get("thbj_text", "")[:5000],
    })
    print(f"  ✓ stock_f10_peer_comparison")

    # ── 8. stock_f10_company_profile ──────
    gsgk_text = data.get("gsgk_text", "")
    cc_m = re.search(
        r"核心竞争力(.{100,3000}?)(?:智能制造|产品优势|科技创新|行业背景|$)", gsgk_text, re.S
    )
    ib_m = re.search(r"行业背景(.{100,2000}?)(?:核心竞争力|主营业务|$)", gsgk_text, re.S)
    upsert("stock_f10_company_profile", ["code"], {
        "code": code,
        "main_business": gsgk_text[:3000],
        "core_competence": cc_m.group(1).strip() if cc_m else None,
        "industry_background": ib_m.group(1).strip() if ib_m else None,
        "executives_json": data.get("gsgg_text", "")[:3000],
        "share_structure_json": data.get("gbjg_text", "")[:2000],
        "concept_sectors": data.get("hxtc_text", "")[:2000],
        "capital_operations": data.get("zbyz_text", "")[:2000],
        "related_stocks_json": data.get("glgg_text", "")[:1000],
    })
    print(f"  ✓ stock_f10_company_profile")

    # ── 9. stock_f10_key_events ───────────
    gsds_text = data.get("gsds_text", "")
    ev_rows = parse_key_events(code, gsds_text)
    # 合并同天同类型的事件描述（应对 UNIQUE(code,event_date,event_type) 约束）
    merged: dict = {}
    for ev in ev_rows:
        key = (ev["event_date"], ev["event_type"])
        if key in merged:
            merged[key]["event_desc"] = (merged[key]["event_desc"] + " / " + ev["event_desc"])[:1000]
        else:
            merged[key] = dict(ev)
    ev_final = list(merged.values())
    # 先清空旧数据（全量刷新），再批量插入
    conn.execute("DELETE FROM stock_f10_key_events WHERE code=?", (code,))
    for ev in ev_final:
        cols = list(ev.keys()) + ["updated_at"]
        vals = list(ev.values()) + [now]
        placeholders = ", ".join(["?"] * len(cols))
        conn.execute(
            f"INSERT INTO stock_f10_key_events ({', '.join(cols)}) VALUES ({placeholders})",
            vals
        )
    print(f"  ✓ stock_f10_key_events ({len(ev_final)} 条)")

    # ── 10. stock_f10_fund_flow ───────────
    zjlx_text = data.get("zjlx_text", "")
    lhbd_text = data.get("lhbd_text", "")
    dt_m = re.search(r"(\d{4}-\d{2}-\d{2})\s+龙虎榜\s+(.+?)(?:\n|$)", lhbd_text)
    upsert("stock_f10_fund_flow", ["code"], {
        "code": code,
        "fund_flow_text": zjlx_text[:3000],
        "dragon_tiger_text": lhbd_text[:3000],
        "margin_balance": to_float(data.get("margin_balance")),
        "last_dragon_date": dt_m.group(1) if dt_m else None,
        "last_dragon_reason": dt_m.group(2).strip()[:200] if dt_m else None,
    })
    print(f"  ✓ stock_f10_fund_flow")

    # ── 11. stock_f10_research_report ─────
    yjbg_text = data.get("yjbg_text", "")
    rr_rows = parse_research_reports(code, yjbg_text)
    for rr in rr_rows:
        upsert("stock_f10_research_report",
               ["code", "report_date", "title"], rr)
    print(f"  ✓ stock_f10_research_report ({len(rr_rows)} 条)")

    # ── 12. stock_fundamental 兼容旧表 ────
    upsert("stock_fundamental", ["code"], {
        "code": code,
        "report_date": rp,
        "roe": to_float(data.get("roe_weighted")),
        "gross_margin": to_float(data.get("gross_margin")),
        "debt_ratio": to_float(data.get("debt_ratio")),
        "revenue_yoy": to_float(data.get("revenue_yoy")),
        "net_profit_yoy": to_float(data.get("net_profit_yoy")),
    })
    print(f"  ✓ stock_fundamental (兼容)")

    conn.commit()
    conn.close()


# ──────────────────────────────────────────────
# 验证
# ──────────────────────────────────────────────

def verify(code: str, db_path: str):
    conn = sqlite3.connect(db_path)
    tables = [
        "stock_f10_snapshot",
        "stock_f10_financial_statement",
        "stock_f10_dividend_history",
        "stock_f10_institution_forecast",
        "stock_f10_business_analysis",
        "stock_f10_shareholder_info",
        "stock_f10_peer_comparison",
        "stock_f10_company_profile",
        "stock_f10_key_events",
        "stock_f10_fund_flow",
        "stock_f10_research_report",
    ]
    print(f"\n{'='*55}")
    print(f"数据验证 — 股票 {code}")
    print(f"{'='*55}")
    all_ok = True
    for tbl in tables:
        cnt = conn.execute(
            f"SELECT COUNT(*) FROM {tbl} WHERE code=?", (code,)
        ).fetchone()[0]
        status = "✓" if cnt > 0 else "✗ 空"
        if cnt == 0:
            all_ok = False
        print(f"  {status}  {tbl:45s} {cnt} 行")
    conn.close()
    print(f"{'='*55}")
    if all_ok:
        print("全部表均有数据")
    else:
        print("部分表数据缺失，请检查爬取日志")


# ──────────────────────────────────────────────
# 入口
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="东方财富 F10 爬取并写入数据库")
    parser.add_argument("--code", required=True, help="股票代码，如 000657")
    parser.add_argument("--db", default="stock_data.db", help="SQLite 数据库路径")
    parser.add_argument("--light", action="store_true", help="轻量模式（只抓主要指标）")
    parser.add_argument("--verify-only", action="store_true", help="只验证数据，不爬取")
    args = parser.parse_args()

    db_path = args.db
    if not os.path.isabs(db_path):
        # 默认相对于 apps/data-service/
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.abspath(os.path.join(script_dir, "../../../../"))
        db_path = os.path.join(project_root, "apps", "data-service", db_path)

    if not os.path.exists(db_path):
        print(f"ERROR: 数据库文件不存在: {db_path}")
        print("请先启动服务（apps/data-service）以初始化数据库")
        sys.exit(1)

    if args.verify_only:
        verify(args.code, db_path)
        return

    print(f"\n{'='*55}")
    print(f"开始爬取 {args.code} F10 数据 ({'轻量' if args.light else '全量'}模式)")
    print(f"数据库: {db_path}")
    print(f"{'='*55}\n")

    if args.light:
        data = scrape_light(args.code)
    else:
        data = scrape_full(args.code)

    print(f"\n开始写入数据库...")
    upsert_all(args.code, data, db_path)

    verify(args.code, db_path)
    print("\n完成！")


if __name__ == "__main__":
    main()
