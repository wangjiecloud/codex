---
name: f10-scraper
description: >
  东方财富 F10 数据爬取技能。当需要抓取某只 A 股的 F10 基本面数据并保存到数据库时使用。
  触发场景：用户要求分析某只股票的基本面、同步/更新 F10 数据、查询某表无数据需要先填充、
  执行 POST /api/fundamental/{code}/sync?full=true、用代码直接操作数据库写入 F10 数据。
  覆盖 20 个标签页：zyzb/gdyj/jyfx/hxtc/zxgg/gsds/gsgk/thbj/ylyc/yjbg/cwfx/fhrz/gbjg/gsgg/zbyz/glgg/zjlx/lhbd/jgpj/zndp。
---

# F10 数据爬取技能

本技能使用 Playwright 全量抓取东方财富 F10 页面，解析结构化数据后写入 SQLite 数据库的 11 张 F10 相关表。

## 数据库位置

```
apps/data-service/stock_data.db
```

## 核心爬取脚本

运行 `scripts/scrape_f10.py` 即可完成单只股票的全量抓取与入库：

```bash
cd apps/data-service
python ../../.agents/skills/f10-scraper/scripts/scrape_f10.py --code 000657
```

支持参数：
- `--code`：股票代码（必填，6位数字，如 000657）
- `--db`：数据库路径（默认 `stock_data.db`）
- `--light`：轻量模式，只抓取 zyzb/ylyc/fhrz 三个标签页（默认全量）
- `--verify-only`：仅验证数据库中各表是否有数据，不做爬取

## 目标数据库表（11张，`stock_f10_financial_history` 暂未实现）

| 表名 | 内容 |
|---|---|
| `stock_f10_snapshot` | 最新指标快照（PE/PB/ROE/毛利率/EPS等） |
| `stock_f10_financial_statement` | 财务三表详细科目（资产负债/利润/现金流） |
| `stock_f10_dividend_history` | 历年分红记录 |
| `stock_f10_institution_forecast` | 机构盈利预测（EPS/评级，每家机构每预测年各一行） |
| `stock_f10_business_analysis` | 经营分析（主营构成/研发/经营评述） |
| `stock_f10_shareholder_info` | 股东研究（十大股东/机构持仓） |
| `stock_f10_peer_comparison` | 同行比较数据 |
| `stock_f10_company_profile` | 公司概况/高管/股本/题材/资本运作 |
| `stock_f10_key_events` | 公司大事纪要时间线（增发/回购/调研/分红/解禁等） |
| `stock_f10_fund_flow` | 资金流向与龙虎榜 |
| `stock_f10_research_report` | 研究报告摘要 |

## SPA 页面爬取要点

东方财富 F10 是**单页应用（SPA）**，通过 URL hash 切换内容：

```
https://emweb.securities.eastmoney.com/pc_hsf10/pages/index.html
  ?type=web&code=sz000657&color=b#/{hash}
```

### 股票代码前缀规则
- 以 `0` 或 `3` 开头（深交所）→ 前缀 `sz`
- 以 `6` 开头（上交所，含 600/601/603/605/688）→ 前缀 `sh`

### 关键 hash 与等待时长

| hash | 内容 | 建议等待(ms) |
|---|---|---|
| `zyzb` | 操盘必读/主要指标 | 5000 |
| `gdyj` | 股东研究 | 6000 |
| `jyfx` | 经营分析 | 7000 |
| `cwfx` | 财务分析（含三表） | 6000 |
| `fhrz` | 分红融资 | 5000 |
| `ylyc` | 盈利预测 | 5000 |
| `thbj` | 同行比较 | 5000 |
| `gsgk` | 公司概况 | 5000 |
| `gsgg` | 公司高管 | 5000 |
| `gbjg` | 股本结构 | 5000 |
| `hxtc` | 核心题材 | 5000 |
| `gsds` | 公司大事 | 5000 |
| `zbyz` | 资本运作 | 6000 |
| `glgg` | 关联个股 | 5000 |
| `zjlx` | 资金流向 | 5000 |
| `lhbd` | 龙虎榜单 | 5000 |
| `jgpj` | 机构评级 | 5000 |
| `yjbg` | 研究报告 | 5000 |
| `zndp` | 智能点评 | 5000 |
| `zxgg` | 资讯公告 | 5000 |

### 页面内 sub-tab 切换

财务三表需在 `cwfx` 页面内点击切换（不是独立 hash）：

```python
# 切换到利润表
btn = page.get_by_text("利润表", exact=True)
btn.first.click()
page.wait_for_timeout(3000)

# 切换报告期维度
data_tabs = page.query_selector_all("ul.dataTab li")
# tab 内容: 按报告期 / 按单季度 / 按年度 / 报告期同比
```

### 文本提取方式

```python
def get_content(page, skip_lines=60):
    """跳过顶部导航栏，提取正文文本"""
    lines = page.inner_text("body").split("\n")
    return "\n".join(l.strip() for l in lines[skip_lines:] if l.strip())
```

### 已知问题与解决方案

| 问题 | 原因 | 解决方案 |
|---|---|---|
| `zcfzb/lrb/xjllb` hash 返回错误内容 | 这些 hash 本质上渲染的是整个 cwfx 页面 | 从 cwfx 内点击三张报表按钮切换 |
| `dataTab` 切换后元素脱离 DOM | 页面重新渲染 | 每次切换后重新查询 `data_tabs` |
| 内容长度恒为 9586/10002 | 未等待页面切换到指定 hash | 增加等待时间或用 `wait_for_selector` |
| 主营构成历史期为空 | `dateTab` 选择器错误 | 用 `ul.dateTab li` 或先截图调试 |
| `roe_weighted`/`gross_margin`/`debt_ratio` 为 None | zyzb 文本格式是 `净资产收益率(加权)(%)\t9.03\t...`，而非旧正则匹配的 `加权净资产收益率` | 已修复：改用 `净资产收益率\(加权\)\(%\)\t` 正则取第一个值 |
| `pe_ttm` 为 None | zyzb 中市盈率是图表展示，inner_text 无数值 | 已修复：改为从 `stock_quote.pe` 字段取实时PE |
| `key_events` 解析到股权质押/高管增减持数据 | 旧正则太宽泛，匹配到 gsds 页面下半部分的表格 | 已修复：改用事件类型关键词列表作为日期分割标志 |
| `institution_forecast` 年份偏移（报告日期+1年） | 旧逻辑误用报告日期年份推算预测年份 | 已修复：从 ylyc 表头行解析实际预测年份列 |
| 同天同类型大事事件有多条触发 UNIQUE 约束 | 如 2026-02-11 有两条 `资本运作` | 已修复：合并同天同类型事件描述 |

## 验证数据是否写入

```bash
cd apps/data-service
python ../../.agents/skills/f10-scraper/scripts/scrape_f10.py --code 000657 --verify-only
```

或直接用 Python：

```python
import sqlite3
conn = sqlite3.connect("apps/data-service/stock_data.db")
tables = [
    "stock_f10_snapshot", "stock_f10_financial_statement",
    "stock_f10_dividend_history", "stock_f10_institution_forecast",
    "stock_f10_business_analysis", "stock_f10_shareholder_info",
    "stock_f10_peer_comparison", "stock_f10_company_profile",
    "stock_f10_key_events", "stock_f10_fund_flow", "stock_f10_research_report",
]
for tbl in tables:
    cnt = conn.execute(f"SELECT COUNT(*) FROM {tbl} WHERE code=?", ("000657",)).fetchone()[0]
    status = "✓" if cnt > 0 else "✗ 空"
    print(f"  {status}  {tbl}: {cnt} 行")
```

## 调用 HTTP API（服务已启动时）

```bash
# 轻量同步（约30秒）
curl -X POST http://localhost:8000/api/fundamental/000657/sync

# 全量同步（约2-3分钟，后台执行）
curl -X POST "http://localhost:8000/api/fundamental/000657/sync?full=true"

# 查询快照
curl http://localhost:8000/api/fundamental/000657

# 查询全量数据
curl http://localhost:8000/api/fundamental/000657/full
```
