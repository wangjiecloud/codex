# 数据采集体系整体优化方案

> 版本：v1.0 | 日期：2026-07-12 | 作者：WorkSpace Agent 深度分析

---

## 一、现状全景分析

### 1.1 数据库表清单（stock_data.db）

| 表名                             | 用途                                                                                                   | 更新频率要求                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `stock_meta`                     | 股票基本信息（代码/名称/市场/产业）                                                                    | 低频（上市/退市/改名时更新） |
| `stock_quote`                    | 实时行情缓存（价格/涨跌/换手率等）                                                                     | 每个交易日收盘后             |
| `stock_kline`                    | 日K/周K/月K线数据（**申万板块K线也写入此表**，用板块代码区分）                                         | 每交易日1次（日K）           |
| `stock_fundamental`              | baostock基本面快照（轻量版）                                                                           | 每季度1次                    |
| `stock_f10_snapshot`             | 东方财富F10主要指标快照                                                                                | 每季度1次（财报季优先）      |
| `stock_f10_financial_history`    | F10财务历史多报告期（成长/每股/盈利/负债等核心指标，按 code+report_date 唯一）                         | 每季度1次                    |
| `stock_f10_financial_statement`  | F10财务三表详细科目（资产负债表/利润表/现金流量表，按 statement_type 区分）                            | 每季度1次                    |
| `stock_f10_dividend_history`     | F10分红历史                                                                                            | 每年1次                      |
| `stock_f10_institution_forecast` | F10机构盈利预测                                                                                        | 每季度1次                    |
| `stock_f10_business_analysis`    | F10经营分析（主营构成/研发/客户供应商等）                                                              | 每季度1次                    |
| `stock_f10_shareholder_info`     | F10股东研究快照（前十大股东/机构持仓）                                                                 | 每季度1次                    |
| `stock_f10_peer_comparison`      | F10同行比较数据                                                                                        | 每季度1次                    |
| `stock_f10_company_profile`      | F10公司概况+高管+股本结构                                                                              | 低频                         |
| `stock_f10_key_events`           | F10公司大事纪要                                                                                        | 低频                         |
| `stock_f10_fund_flow`            | F10资金流向与龙虎榜                                                                                    | 低频                         |
| `stock_f10_research_report`      | F10研究报告摘要                                                                                        | 低频                         |
| `stock_indicator`                | 技术指标（KDJ/MA，由 compute_indicators.py 写入，**不通过 SQLAlchemy ORM**）                           | 每交易日1次（K线更新后计算） |
| `industry_list`                  | 产业列表页卡片                                                                                         | 手动维护                     |
| `industry_meta`                  | 产业元信息                                                                                             | 手动维护                     |
| `industry_node`                  | 产业链图谱节点                                                                                         | 手动维护                     |
| `industry_edge`                  | 产业链图谱边                                                                                           | 手动维护                     |
| `sw_industry`                    | 申万行业板块行情                                                                                       | 每个交易日收盘后             |
| `sw_industry_constituent`        | 申万行业成分股                                                                                         | 低频（季度调整）             |
| `news_flash`                     | 快讯（重要/A股/港股/美股/异动/公告）                                                                   | 每3分钟                      |
| `stock_news`                     | 股票相关新闻（极少使用，可能为废弃表）                                                                 | 每日                         |
| `stock_guba`                     | 股吧资讯与公告（用 `post_type` 区分："news"资讯 \| "notice"公告，**无 guba_news/guba_notice 两张表**） | 每日                         |
| `stock_guba_post`                | 股吧帖子正文（关联分析用，全量落库）                                                                   | 低频                         |
| `stock_guba_sync`                | 股吧帖子同步状态（每只股票一条，done=1表示已全量抓取）                                                 | 同步时更新                   |
| `stock_relation`                 | 股票共现关联关系（来自股吧帖子正文分析）                                                               | 低频                         |
| `theme_news`                     | 板块/主题新闻                                                                                          | 每15分钟                     |
| `concept_board`                  | 概念板块行情                                                                                           | 每日                         |
| `fund_flow_snapshot`             | 资金流向快照                                                                                           | 每个交易日16:00后            |
| `global_market_index`            | 全球主要市场指数快照（实时价格/涨跌）                                                                  | 低频                         |
| `global_index_kline`             | 全球指数K线（港/美/日/欧等）                                                                           | 每日18:00（收盘后）          |
| `stock_minute_kline`             | 分时数据（**实际表名为 stock_minute_kline**，非 stock_minute）                                         | 每个交易日收盘后             |
| `popular_stock_cache`            | 人气榜缓存（由 `POST /api/theme/popular-stocks/refresh` 手动刷新）                                     | 按需（手动触发）             |
| `portfolio_holding`              | 持仓记录                                                                                               | 用户操作触发                 |
| `portfolio_trade`                | 交易记录                                                                                               | 用户操作触发                 |
| `memo`                           | 备忘录                                                                                                 | 用户操作触发                 |

### 1.2 现有定时任务清单（main.py）

| 任务ID                      | 触发时间  | 函数                                                            | 说明                                                                                                                |
| --------------------------- | --------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `daily_sync`                | 每天17:30 | `industry.sync_all_data`                                        | 全量同步（**7步：行情→申万→K线→F10→申万K线→板块新闻→技术指标**，**不含分时**，分时由单独的 minute_daily_sync 触发） |
| `news_flash_sync`           | 每3分钟   | `news_flash.sync_news_flash`                                    | 快讯增量同步                                                                                                        |
| `daily_cleanup`             | 每天03:00 | `cleanup.run_cleanup`                                           | 数据清理                                                                                                            |
| `theme_news_sync`           | 每15分钟  | `theme.sync_theme_news`                                         | 板块/主题新闻同步                                                                                                   |
| `guba_daily_sync`           | 每天17:30 | `guba.sync_all_guba`                                            | 股吧资讯与公告                                                                                                      |
| `fund_flow_snapshot`        | 每天16:00 | `fund_flow.take_daily_snapshot`                                 | 资金流向快照                                                                                                        |
| `minute_daily_sync`         | 每天17:30 | `_auto_sync_minute`（**main.py startup 内部局部函数**）         | 产业链分时数据 + A股宽基指数（000001/399006/000016/000300/000680/000047）                                           |
| `indices_minute_daily_sync` | 每天15:35 | `_auto_sync_indices_minute`（**main.py startup 内部局部函数**） | 宽基指数分时（6只，约2分钟完成，用于复盘Tab展示）                                                                   |
| `global_index_kline_sync`   | 每天18:00 | `global_market.sync_all_review_index_klines`                    | 全球指数K线                                                                                                         |

> **启动时隐式触发机制（main.py startup）**：服务启动时会额外执行两个自动检查：
>
> 1. **全球指数K线补全**：检查 `global_index_kline` 表数据量，不足100条时立即触发 `sync_all_review_index_klines()`
> 2. **按启动时间决策同步**（需 `AUTO_SYNC_ON_STARTUP=true`，默认开启）：
>    - 17:30 后启动 → 触发完整全量同步 `_run_full_sync`
>    - 15:00-17:30 启动 → 仅触发行情同步 `_sync_all_quotes`
>    - 15:00 前启动 → 跳过，不同步
>    - 非交易日启动 → 跳过

### 1.3 手动触发接口清单（sync.py + 其他）

> ⚠️ 标注 `🚧 待开发` 的接口当前代码中**不存在**，为规划中的新增接口。

| 接口                                                    | 方法                                                                  | 说明                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| `POST /api/sync/all`                                    | 触发全量同步（行情+申万+K线+F10）                                     | 监控页"同步全部"按钮                       |
| `POST /api/sync/quotes`                                 | 仅同步实时行情                                                        | 监控页单独触发                             |
| `POST /api/sync/klines`                                 | 仅同步K线                                                             | 监控页单独触发                             |
| `POST /api/sync/fundamental`                            | 仅同步F10财务数据                                                     | 监控页单独触发                             |
| `POST /api/sync/stock_info`                             | 同步基本信息                                                          | 监控页单独触发                             |
| `POST /api/sync/stop`                                   | 停止当前同步                                                          | 监控页停止按钮                             |
| `GET /api/sync/status`                                  | 查询当前同步状态                                                      | 监控页轮询                                 |
| `POST /api/flash/sync`                                  | 同步所有快讯                                                          | 监控页                                     |
| `POST /api/flash/sync/{category}`                       | 同步单类快讯（category 取值：important/a_share/hk/us/anomaly/notice） | 监控页                                     |
| `POST /api/sw-industry/sync`                            | 同步申万行业行情                                                      | 监控页                                     |
| `POST /api/sw-industry/sync-klines`                     | 同步申万板块K线（`_sync_rotation_klines`）                            | 监控页                                     |
| `POST /api/minute/sync-industry`                        | 同步产业链分时数据                                                    | 监控页                                     |
| `POST /api/minute/sync-indices`                         | 同步宽基指数分时（6只）                                               | 监控页                                     |
| `GET /api/minute/stats/industry`                        | 产业链分时数据统计                                                    | 监控页（**注意：不是 /api/minute/stats**） |
| `GET /api/minute/stats/indices`                         | 宽基指数分时数据统计                                                  | 监控页                                     |
| `POST /api/theme/sync-news`                             | 同步板块新闻                                                          | 监控页                                     |
| `POST /api/theme/sync-news-full`                        | 板块新闻全量补抓                                                      | 手动补数据                                 |
| `POST /api/theme/popular-stocks/refresh`                | 刷新人气榜并写入 `popular_stock_cache`                                | 手动触发                                   |
| `POST /api/guba/sync`                                   | 同步所有股票股吧资讯                                                  | 监控页                                     |
| `POST /api/guba/sync/{code}`                            | 同步单只股票股吧                                                      | Agent/手动补数据                           |
| `GET /api/guba/sync/status`                             | 查询股吧同步状态                                                      | 监控页                                     |
| `GET /api/guba/stats/summary`                           | 股吧统计摘要                                                          | 监控页                                     |
| `POST /api/board/sync`                                  | 同步概念板块行情                                                      | **无监控页面支持**                         |
| `POST /api/board/calc-industry-kline`                   | 产业板块K线聚合计算                                                   | 手动                                       |
| `POST /api/board/sync-industry-stocks`                  | 补全产业成分股K线                                                     | 手动补数据                                 |
| `POST /api/fund-flow/snapshot`                          | 触发资金流向快照                                                      | **无监控页面支持**                         |
| `GET /api/fund-flow/dates`                              | 资金流向已有日期列表                                                  | 查询用                                     |
| `POST /api/fundamental/{code}/sync`                     | 同步单只股票F10（`?full=true` 触发全量Playwright爬取20标签页）        | Agent/产业详情页                           |
| `POST /api/industry/sync/quotes/batch`                  | 批量刷新行情                                                          | 自选股页面刷新按钮                         |
| `POST /api/industry/sync/industry-stocks/{industry_id}` | 批量同步产业股票数据                                                  | 产业页面                                   |
| `GET /api/industry/sync/industry-stocks/status`         | 查询产业同步状态                                                      | 产业页面轮询                               |
| `GET /api/system/stats`                                 | 系统数据统计                                                          | 监控页                                     |
| `GET /api/system/flash-stats`                           | 快讯数据统计                                                          | 监控页                                     |
| `GET /api/system/failed-stocks`                         | 查询失败的K线同步记录                                                 | 监控页                                     |
| `POST /api/system/retry-failed`                         | 重试失败的同步记录                                                    | 监控页                                     |
| `DELETE /api/system/failed-stocks`                      | 清空失败记录                                                          | 监控页                                     |
| `GET /api/system/scheduler-logs`                        | 查询调度日志                                                          | 监控页                                     |
| `GET /api/system/task-status`                           | 🚧 待开发：返回所有定时任务状态                                       | 规划中                                     |
| `POST /api/system/trigger-task/{task_id}`               | 🚧 待开发：手动触发指定任务                                           | 规划中                                     |
| `POST /api/system/stop-task/{task_id}`                  | 🚧 待开发：停止指定任务                                               | 规划中                                     |

---

## 二、现有问题深度诊断

### 2.1 重复同步问题

**问题1：17:30 有三个任务同时触发**

- `daily_sync`（id）→ `sync_all_data` → `_run_full_sync`（**7步：行情→申万→K线→F10→申万K线→板块新闻→技术指标**）
- `guba_daily_sync` → `sync_all_guba`（单独任务，已在全量流程外独立运行，**不重复**）
- `minute_daily_sync` → `_auto_sync_minute`（**与全量流程不重复**，`_run_full_sync` 本身不含分时，分时由此独立任务负责；但两者同在17:30触发，可能造成并发竞争）

**问题2：全量流程与手动触发逻辑不一致**

- `triggerFullRefresh`（前端）按顺序调用：`/api/sync/all` → `/api/sync/stock_info` → `/api/sync/fundamental` → `/api/flash/sync` → `/api/theme/sync-news` → `/api/guba/sync`
- 但 `/api/sync/all` 内部（`_run_full_sync`）已经包含了板块新闻和技术指标同步
- 导致：板块新闻被同步两次（`_run_full_sync` 内 + 前端额外调用）
- 导致：股吧资讯在 `_run_full_sync` 流程外，前端才会触发（**stock_guba** 表仅由 `guba_daily_sync` 写入）

**问题3：K线重复判断逻辑存在差异**

- `_run_klines_sync`（单独K线同步）：只判断是否有数据，不判断今日是否已更新
- `_sync_klines`（底层函数）：已有今日最新K线则跳过（正确）
- `_run_full_sync`（全量流程）：调用 `_sort_klines_missing_first` 只按"有无数据"排序，没有过滤今日已同步的，依赖 `_sync_klines` 内部判断（可以但低效）

**问题4：概念板块和资金流向没有统一监控**

- `sync_concept_boards` 没有加入定时调度，只有手动触发 `POST /api/board/sync`
- `take_daily_snapshot`（资金流向）在 main.py 已有 16:00 定时，但监控页没有展示其状态
- 全球指数K线同步（18:00）监控页没有展示

### 2.2 定时频率不合理

| 任务                  | 现有频率                       | 问题                                                                                        | 建议                                                          |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| F10财务数据           | 每天全量同步（如果今日未同步） | 财务数据每季度更新一次，每天全量爬取3000+只股票极其浪费，且大量并发Playwright实例会触发反爬 | 每周1次，或财报季（3/4/7/8/10/11月）每天同步，其余月份每周1次 |
| `news_flash_sync`     | 每3分钟                        | 合理，快讯时效性强                                                                          | 保持                                                          |
| `theme_news_sync`     | 每15分钟                       | 合理                                                                                        | 保持                                                          |
| `daily_sync`（全量）  | 17:30每天                      | 全量同步含K线+F10，耗时极长（小时级），非交易日应完全跳过                                   | 保持，但需要优化跳过逻辑                                      |
| `guba_daily_sync`     | 17:30每天                      | 股吧资讯每天更新，合理（写入 `stock_guba` 表，用 post_type 区分资讯/公告）                  | 但应错开17:30，改为18:30（等全量同步完成）                    |
| `申万行业成分股`      | 无定时，手动触发               | 成分股季度调整，目前完全没有自动更新                                                        | 每季度末自动更新一次                                          |
| `概念板块`            | 无定时，只能手动               | 缺失定时                                                                                    | 每天19:00同步一次（收盘后接口稳定）                           |
| `stock_meta` 基本信息 | 只在全量流程中手动触发         | 应该低频自动同步                                                                            | 每周1次                                                       |

### 2.3 稳定性问题

**问题1：并发锁表**

- 当前SQLite配置：`WAL模式` + `busy_timeout=60000`（60秒）+ `pool_size=10` + `max_overflow=20`
- 问题：全量同步时，K线（3000+只股票×每只30次insert）与行情同步（3000+次update）并发执行，极易触发锁等待
- 现有保护：`_db_execute_with_retry` 和 `_db_commit_with_retry` 有3次重试，但重试间隔太短（0.5-1.5秒）
- 根本问题：多个定时任务同时在17:30触发（`daily_sync` + `guba_daily_sync` + `minute_daily_sync`）

**问题2：Playwright反爬和内存泄漏**

- `_scrape_f10_full`：每只股票启动一个Playwright浏览器实例，访问20个标签页
- 未见截图文件清理逻辑（`fundamental.py` 未调用 `page.screenshot()`，目前无截图）
- 但 Playwright 浏览器进程在高并发下可能不能正常释放（`browser.close()` 在异常时是否一定执行？）
- `f10-scraper` skill 脚本（`scrape_f10.py`）与 `fundamental.py` 是两套独立的爬虫，**逻辑重复**

**问题3：baostock连接稳定性**

- baostock session 串码问题已有处理（价格异常检测）
- 超时重置逻辑存在，但`_run_full_sync`中K线阶段超时阈值（45秒超时，5次连续超时才reset_bs）可能不够
- 行情同步和K线同步都会调用`reset_bs()`，两者并发时会互相干扰

**问题4：中断续传不完善**

- K线：`_sync_klines` 已有"今日已有最新K线则跳过"机制（好）
- F10：`_run_fundamental_sync` 和 `_run_full_sync` 有"今日已同步则跳过"机制（好）
- 行情：**没有跳过机制**，每次都全量重新同步（今日已同步也要重同步）
- 分时：有"缓存"机制，但不确保跨天续传

**问题5：自选股页面手动刷新问题**

- `WatchlistPanel.tsx` 中刷新按钮调用 `/api/industry/sync/quotes/batch`
- 该接口直接实时拉取baostock数据并写入DB，不依赖定时同步
- 问题：非交易时间（晚上/周末）刷新会拉到过期数据或失败
- 建议：增加"今日数据是否已同步"提示，非交易时间直接用缓存

**问题6：各页面同步逻辑分散，监控页不完整**

- 自选股页面：有独立刷新按钮（调用 `/api/industry/sync/quotes/batch`）
- 产业详情页：有个股同步入口（调用 `/api/fundamental/{code}/sync`）
- 这些入口在监控页没有记录/展示
- 监控页缺失：概念板块、资金流向、全球指数K线、申万成分股的状态展示

### 2.4 数据完整性缺口

| 问题                                   | 描述                                                                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| stock_fundamental 表（baostock轻量版） | 与 stock_f10_snapshot 重复，功能已被F10覆盖，但仍然存在同步逻辑（`_sync_fundamental`在industry.py中，实际上存入的是`stock_fundamental`而非F10） |
| 申万成分股无自动更新                   | `sw_industry_constituent` 只能手动触发                                                                                                          |
| 概念板块无自动定时                     | `concept_board` 只能手动触发，未加入调度                                                                                                        |
| F10 skill 与 fundamental router 重复   | `.agents/skills/f10-scraper/scripts/scrape_f10.py` 与 `routers/fundamental.py` 是两套逻辑，容易出现数据不一致                                   |

---

## 三、优化方案设计

### 3.1 统一任务调度层设计

#### 3.1.1 任务分级

**A级（每日必须）：影响所有页面展示的核心数据**

- 实时行情（stock_quote）：交易日收盘后（15:10后）
- 日K线（stock_kline daily）：每交易日1次，收盘后
- 申万行业行情（sw_industry）：每交易日收盘后
- 技术指标（stock_indicator）：K线更新后自动计算
- 宽基指数分时：每交易日15:35（当前实际时间，规划方案中时间待定）
- 快讯（news_flash）：每3分钟持续

**B级（每日补充）：丰富内容，允许当天延迟同步**

- 资金流向快照（fund_flow_snapshot）：每交易日16:00
- 产业链分时（`stock_minute_kline`）：每交易日19:05（规划，当前实际是17:30）
- 股吧资讯公告（`stock_guba`）：每交易日18:30（错开全量）
- 板块/主题新闻（theme_news）：每15分钟
- 概念板块（concept_board）：每交易日19:00
- 全球指数K线（global_index_kline）：每天18:00

**C级（低频补充）：财务数据，按季度更新**

- F10财务快照（stock_f10_snapshot）：财报季每天，非财报季每周日
- 申万成分股（sw_industry_constituent）：每季度末第一个周日
- 股票基本信息（stock_meta）：每周日

#### 3.1.2 任务执行顺序（解决并发冲突）

> **原则**：所有需要接口数据的任务放到17:30以后（闭盘后接口数据才稳定），只有资金流向快照保留16:00（收盘后即可抓取）。

```
16:00 → 资金流向快照（收盘后立即抓取，接口稳定）
17:30 → 行情同步 + 申万板块（A级，约30分钟）
18:00 → K线增量同步（A级，仅同步今日未更新的，约60分钟）
18:30 → 全球指数K线 + 技术指标计算（18:35触发指标）
19:00 → 概念板块
19:05 → 产业链分时（稍错开，避免与概念板块并发）
19:30 → 股吧资讯（B级，等前面任务完成后触发）
高频（全天）: 每3分钟快讯，每15分钟板块新闻
低频: 每周日凌晨2点F10财务（财报季同步30天内未更新，非财报季只补缺失）
```

#### 3.1.3 修改方案：main.py 调度重构

**当前问题**：17:30 同时触发3个任务，造成并发锁竞争；且15:10/15:35/16:30触发时，数据接口可能尚未稳定。

**修改后调度表**：

```python
# A级任务 - 按顺序触发，避免并发，全部17:30以后
# ⚠️ 注意：当前 industry.sync_all_data 调用的是完整的 _run_full_sync（含K线+F10+申万K线等）
# 拆分方案需要新建只做行情+申万的函数（如 _sync_quotes_and_sw），而非直接复用 sync_all_data
_scheduler.add_job(_sync_quotes_and_sw,               trigger="cron", hour=17, minute=30, id="daily_quotes_sync")   # 行情+申万（需新建函数）
_scheduler.add_job(_daily_klines_incremental,         trigger="cron", hour=18, minute=0,  id="daily_klines_sync")   # K线增量
_scheduler.add_job(global_market.sync_all_review_index_klines, trigger="cron", hour=18, minute=30, id="global_index_kline_sync")
_scheduler.add_job(_compute_indicators_job,           trigger="cron", hour=18, minute=35, id="daily_indicators")    # 技术指标

# B级任务（17:30以后，依次错开）
_scheduler.add_job(fund_flow.take_daily_snapshot,     trigger="cron", hour=16, minute=0,  id="fund_flow_snapshot")  # 资金流向保留16:00
_scheduler.add_job(concept_board.sync_concept_boards, trigger="cron", hour=19, minute=0,  id="concept_board_sync")
_scheduler.add_job(_auto_sync_minute,                 trigger="cron", hour=19, minute=5,  id="minute_daily_sync")
_scheduler.add_job(guba.sync_all_guba,                trigger="cron", hour=19, minute=30, id="guba_daily_sync")

# 高频任务
_scheduler.add_job(news_flash.sync_news_flash,        trigger="interval", minutes=3,  id="news_flash_sync")
_scheduler.add_job(theme.sync_theme_news,             trigger="interval", minutes=15, id="theme_news_sync")

# C级低频任务
_scheduler.add_job(_weekly_fundamental_sync,          trigger="cron", day_of_week="sun", hour=2, id="weekly_fundamental_sync")
_scheduler.add_job(_quarterly_sw_constituents,        trigger="cron", day_of_week="sun", hour=3, id="quarterly_sw_constituents")
```

### 3.2 K线同步优化：增量补偿机制

当前 `_sync_klines` 已有今日跳过逻辑，但 `_run_klines_sync` 和 `_run_full_sync` 中缺少"今日已全部同步则完全跳过"的批量判断。

**新增 `_daily_klines_incremental` 函数**：

```python
def _daily_klines_incremental():
    """
    每日K线增量同步：只同步今日未更新的股票，支持中断续传。
    逻辑：
    1. 查询 stock_kline 中 MAX(trade_date) < 今天 的股票列表
    2. 按"完全无数据的优先"排序
    3. 依次调用 _sync_klines(code, "daily")，内部已有today跳过逻辑
    """
    from routers.industry import is_trading_day
    if not is_trading_day():
        return

    today_str = date.today().strftime("%Y-%m-%d")
    db = SessionLocal()
    try:
        # 获取今日已有K线的股票
        already_synced = {
            row[0] for row in db.execute(text(
                "SELECT DISTINCT code FROM stock_kline WHERE period='daily' AND trade_date=:today"
            ), {"today": today_str}).fetchall()
        }
        all_codes = [row.code for row in db.query(StockMeta).filter(StockMeta.market == "A股").all()]
    finally:
        db.close()

    # 过滤今日已同步
    pending = [c for c in all_codes if c not in already_synced]
    sched_log("info", f"[K线增量] 待同步 {len(pending)}/{len(all_codes)} 只（今日已跳过 {len(already_synced)} 只）")

    for code in pending:
        _sync_klines(code, "daily")
        time.sleep(0.1)
```

### 3.3 F10同步优化：财报季智能触发

**财报季判断规则**：

- 4月（一季报）、8月（半年报）、10-11月（三季报）、1-3月（年报）属于财报季
- **财报季**：每周日02:00同步30天内未更新的股票
- **非财报季**：每周日02:00只同步从未同步过的股票（跳过已有数据的）
- 新增股票（stock_f10_snapshot 中无记录）：两种情况下都会立即触发

```python
def _is_reporting_season() -> bool:
    """是否处于财报密集披露期"""
    month = date.today().month
    return month in (1, 2, 3, 4, 8, 10, 11)

def _weekly_fundamental_sync():
    """每周日凌晨2点：同步F10财务数据"""
    if not _is_reporting_season():
        # 非财报季只同步从未同步过的股票
        _run_fundamental_sync_missing_only()
        return
    # 财报季：同步30天内未更新的股票
    _run_fundamental_sync_stale(days=30)
```

### 3.4 并发与稳定性优化

#### 3.4.1 baostock 单例锁

当前问题：行情同步和K线同步都会调用 `reset_bs()`，两者并发时互相干扰。

**优化方案**：增加 `_bs_global_lock` 全局互斥锁，确保同一时刻只有一个任务使用 baostock session：

```python
# bs_session.py 新增
_bs_global_lock = threading.Lock()

def acquire_bs():
    """获取baostock session的排他锁"""
    _bs_global_lock.acquire()
    return get_bs()

def release_bs():
    """释放baostock session锁"""
    _bs_global_lock.release()
```

但实际上，由于行情同步和K线同步时间已经错开（17:30行情，18:00K线），这个问题会自然缓解。

#### 3.4.2 SQLite WAL 并发优化

当前配置已较好，但需要调整：

- `busy_timeout` 从 60000 改为 30000（30秒，超时更快报错而不是无限等待）
- 在高并发写入（K线批量）时，改用批量INSERT而非逐条INSERT

**K线批量写入优化**（`_sync_klines`）：

```python
# 当前：逐条执行 db.execute(stmt)，然后 db.commit()
# 优化：收集所有stmt，一次性批量执行
stmts = [build_stmt(r) for r in rows]
for stmt in stmts:
    db.execute(stmt)
db.commit()  # 只有一次commit，减少锁竞争
```

（注意：当前代码其实已经是在一个transaction里批量execute后commit，这个已经OK）

#### 3.4.3 Playwright 资源保护

当前 `_scrape_f10_full` 和 `_scrape_f10` 都使用 `with sync_playwright() as p` 管理 Playwright 上下文，但 `browser` 是在 `with` 块内通过 `p.chromium.launch()` 单独创建的——**`with` 块结束不会自动关闭 `browser`**，仍需显式调用 `browser.close()`。需要检查 `browser.close()` 是否在 `finally` 块中。

**检查点**：`fundamental.py:528` 和 `:1498` 的 `browser.close()` 应改为 `try/finally` 确保执行：

```python
browser = p.chromium.launch(headless=True)
try:
    # ... 所有业务逻辑
finally:
    browser.close()
```

**并发限制**：F10全量同步（`_run_fundamental_sync`）每只股票串行处理，已避免并发Playwright实例。但批量同步时内存压力大，建议增加内存检查。

#### 3.4.4 F10 skill 与 fundamental router 去重

**问题**：`.agents/skills/f10-scraper/scripts/scrape_f10.py`（Agent使用）与 `routers/fundamental.py` 中的 `_scrape_f10_full`（API使用）是两套重复的Playwright爬虫逻辑。

**解决方案**：

- Agent调用改为 HTTP API：`POST /api/fundamental/{code}/sync?full=true`
- `scrape_f10.py` 仅保留作为独立命令行备用，API层统一使用 `fundamental.py`
- 更新 `stock-analyzer.md` Agent 的工具使用方式

### 3.5 监控页面重新设计

#### 3.5.1 新增：统一任务状态中心

> 🚧 以下接口均为**规划中待开发**，当前代码中不存在，调用返回 404。

新增后端接口 `GET /api/system/task-status`，返回所有定时任务的状态：

```json
{
  "tasks": [
    {
      "id": "daily_quotes_sync",
      "name": "每日行情同步",
      "type": "scheduled",
      "schedule": "每交易日 17:30",
      "status": "idle|running|done|error",
      "lastRun": "2026-07-12T08:30:00",
      "lastSuccess": "2026-07-12T09:00:00",
      "nextRun": "2026-07-13T08:30:00",
      "progress": { "done": 0, "total": 0, "current": "" },
      "dataCount": 3248
    }
  ]
}
```

新增后端接口 `POST /api/system/trigger-task/{task_id}`，支持手动触发任意任务。

新增后端接口 `POST /api/system/stop-task/{task_id}`，支持停止任意任务。

#### 3.5.2 监控页面新增模块

**新增：全局任务列表视图**

展示所有任务（定时+手动），每行显示：

- 任务名称 + 类型标签（定时/手动/高频）
- 状态徽章（运行中🔄 / 空闲✅ / 错误❌ / 跳过⏭）
- 上次运行时间 + 耗时
- 下次运行时间（定时任务）
- 数据量统计
- 手动触发按钮 + 停止按钮

**新增：每日数据健康检查面板**

展示今日各类数据是否已同步：

```
✅ 实时行情    3248/3248 只  更新于 16:45
✅ 日K线       3248/3248 只  更新于 17:50
✅ 申万板块    100/100 板块  更新于 16:35
⚠️  概念板块    0/0 条       未同步
⚠️  资金流向    未快照
✅ 快讯        12580 条      最新 18:23
✅ 全球指数K线 更新于 18:05
⚠️  产业分时   45/210 只    进行中...
❌ F10财务    本周日同步（非财报季）
```

**保留现有模块**：

- 快讯数据（6分类）
- 申万行业板块
- 产业链分时数据
- 板块新闻
- 股吧资讯与公告
- 数据同步控制（行情/K线/财务/基本信息）

**新增监控模块**：

- 概念板块同步状态
- 资金流向快照状态
- 全球指数K线同步状态
- F10财务数据（含财报季智能提示）
- 技术指标计算状态

#### 3.5.3 自选股页面优化

**问题**：点击刷新按钮直接调用实时baostock API，非交易时间可能拉到旧数据或失败。

**优化方案**：

1. 刷新按钮增加"今日已同步"检测：若当天定时同步已完成，提示"使用缓存数据"而不是重新拉取
2. 增加非交易时间提示：显示"行情数据来自 YYYY-MM-DD 收盘"
3. 强制刷新（非交易时间）仍然支持，但明确提示

```typescript
// WatchlistPanel.tsx 优化
const handleRefresh = async () => {
  const isMarketOpen = checkMarketHours(); // 09:15-15:05 为交易时间
  if (!isMarketOpen) {
    // 非交易时间：直接读缓存，不调用baostock
    setHint("使用缓存行情数据（非交易时间）");
    await fetchFromCache(visibleCodes);
    return;
  }
  // 交易时间：正常刷新
  await fetch("/api/industry/sync/quotes/batch", ...);
};
```

### 3.6 数据断点续传增强

#### 3.6.1 行情同步断点续传

新增行情"今日已更新"判断：

```python
def _run_quotes_sync():
    today_cst_str = (datetime.utcnow() + timedelta(hours=8)).date().strftime("%Y-%m-%d")

    db = SessionLocal()
    try:
        # 过滤今日已更新的行情（避免重复拉取）
        already_updated = {
            r.code for r in db.query(StockQuote.code, StockQuote.updated_at)
            .filter(StockQuote.updated_at >= datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0))
            .all()
        }
    finally:
        db.close()

    pending = [c for c in all_codes if c not in already_updated]
    sched_log("info", f"行情同步：待更新 {len(pending)}/{len(all_codes)} 只")
```

#### 3.6.2 分时数据断点续传

已有缓存机制（`_fetch_one_code` 检查是否已有今日数据），但需要：

- 确保中断后重启能从上次进度继续（当前是全部重新遍历）
- 建议：记录已完成的code到临时状态表，重启时读取跳过

#### 3.6.3 股吧资讯断点续传

当前：`sync_all_guba` 遍历所有股票，每只调用 `sync_guba_stock`。
问题：中途失败后重启需要重新遍历。
优化：记录每次同步的起始代码，支持从指定代码续传。

---

## 四、数据采集 Agent 改造方案

### 4.1 Agent 定位说明

系统中现有 Agent 的定位：

- **`stock-analyzer.md`**（Codex CLI Agent）：保持"基本面分析专家 + F10爬取"定位，**不做任何修改**
- **`data-collector.md`**（新建 Codex CLI Agent）：数据采集与监控专家，负责触发同步接口、查询任务状态、分析数据缺口
- **前端 `data` Chat Agent**（`route.ts` 中）：面向用户的对话界面，查询DB数据为主，不修改

本章方案聚焦于新建 `.agents/agents/data-collector.md`。

### 4.2 data-collector.md 内容设计

**核心定位**：

- 了解所有数据爬取任务的业务背景和API接口
- 能够查询任务状态、触发手动同步、停止任务
- 能够分析数据缺口，主动发现需要补充的数据
- 能够调用接口触发 K线/行情/F10/概念板块等各类同步任务
- **不包含**：F10深度分析、产业链操作（这些属于 `stock-analyzer.md` 的职责）

**包含的知识**：

1. **监控系统架构**：`main.py` APScheduler调度 + `routers/sync.py` 手动触发 + `routers/system.py` 状态查询
2. **全部定时任务清单**（见本文第三章3.1.1，含新调度时间）
3. **全部手动触发接口**（见本文第一章1.3）
4. **数据库表与任务对应关系**（见本文第一章1.1）
5. **F10爬取说明**：优先调用 `POST /api/fundamental/{code}/sync?full=true`，而非直接运行 scrape_f10.py

**新增能力（API调用）**：

```markdown
## 数据采集监控能力

### 查询任务状态

- 查询当前同步状态：GET http://localhost:8000/api/sync/status
- 查询系统统计：GET http://localhost:8000/api/system/stats
- 查询调度日志：GET http://localhost:8000/api/system/scheduler-logs
- 查询失败记录：GET http://localhost:8000/api/system/failed-stocks

### 触发数据同步

- 全量同步：POST http://localhost:8000/api/sync/all
- 仅行情：POST http://localhost:8000/api/sync/quotes
- 仅K线：POST http://localhost:8000/api/sync/klines
- 仅F10：POST http://localhost:8000/api/sync/fundamental
- 仅基本信息：POST http://localhost:8000/api/sync/stock_info
- 停止同步：POST http://localhost:8000/api/sync/stop
- 快讯同步：POST http://localhost:8000/api/flash/sync
- 申万行业：POST http://localhost:8000/api/sw-industry/sync
- 申万板块K线：POST http://localhost:8000/api/sw-industry/sync-klines
- 概念板块：POST http://localhost:8000/api/board/sync
- 板块新闻：POST http://localhost:8000/api/theme/sync-news
- 股吧资讯：POST http://localhost:8000/api/guba/sync
- 资金流向：POST http://localhost:8000/api/fund-flow/snapshot
- 全球指数K线：POST http://localhost:8000/api/global/sync-klines
- 单股F10：POST http://localhost:8000/api/fundamental/{code}/sync?full=true
- 产业链分时：POST http://localhost:8000/api/minute/sync-industry
- 宽基指数分时：POST http://localhost:8000/api/minute/sync-indices
```

### 4.3 Agent 调用接口的完整业务映射

| 业务场景                 | Agent应调用的接口                           | 说明                                                      |
| ------------------------ | ------------------------------------------- | --------------------------------------------------------- |
| 检查某只股票数据是否完整 | sqlite3查询多表                             | 检查stock_meta/stock_quote/stock_kline/stock_f10_snapshot |
| 同步某只股票的F10        | POST /api/fundamental/{code}/sync?full=true | 触发Playwright爬取20个标签页                              |
| 补充K线历史数据          | POST /api/sync/klines                       | 全量K线同步（内部有今日跳过逻辑）                         |
| 手动刷新行情             | POST /api/sync/quotes                       | 全量行情同步                                              |
| 查看今日同步进度         | GET /api/sync/status                        | 查看running/phase/done/total                              |
| 新增产业后同步数据       | 参考AGENTS.md规则7，依次调用对应接口        | 需要同步7类数据                                           |
| 检查昨日是否漏同步       | GET /api/system/scheduler-logs + sqlite3    | 通过日志和DB最新时间判断                                  |
| 发现失败的K线同步        | GET /api/system/failed-stocks               | 查看失败记录                                              |
| 重试失败的同步           | POST /api/system/retry-failed               | 重试所有失败记录                                          |

---

## 五、具体代码修改方案

### 5.1 main.py 修改（调度时间重排）

**修改点**：

1. 将 17:30 的 `daily_sync` 拆分——行情+申万保留17:30，K线移到18:00单独触发
2. 去掉 17:30 的 `minute_daily_sync`（移到19:05）
3. 去掉 17:30 的 `guba_daily_sync`（移到19:30）
4. 新增 19:00 的 `concept_board_sync`（概念板块，17:30后原则）
5. 新增 `_daily_klines_incremental` 函数（含今日已同步跳过）

**关键代码修改**：

```python
# 原来：17:30 daily_sync 触发全量流程（含行情+申万+K线+F10+申万K线+板块新闻+技术指标，**不含分时**）
# 修改后：拆分，全部17:30以后，错开时间避免并发

# 16:00 资金流向快照（保持，收盘后立即抓取）
# 17:30 行情同步 + 申万板块（原17:30 daily_sync 拆分出行情部分）
# 18:00 K线增量同步（修改：只同步今日未更新的，含断点续传）
# 18:30 全球指数K线 + 技术指标（等K线完成后计算指标）
# 19:00 概念板块 + 19:05 产业链分时（错开5分钟，避免并发）
# 19:30 股吧资讯（从17:30移到19:30，等前面任务完成）
# 每周日02:00 F10财务（低频，从每日移到每周）
```

> ⚠️ **重要**：修改调度时间不影响现有数据，只影响未来的执行时机。所有修改均为新增或时间调整，不涉及任何数据删除或覆盖。

### 5.2 routers/sync.py 修改

**新增函数**：`_run_quotes_sync_incremental`

- 只同步今日未更新的行情
- 跳过今日已有数据的股票

**修改 `_sort_klines_missing_first`**：

- 新增第三类：今日已有最新K线的，放到最后（可完全跳过）

### 5.3 routers/system.py 新增接口（🚧 规划中，当前均未实现）

> 以下接口在当前代码中**不存在**，调用会返回 404。为 §3.5.1 统一任务状态中心的配套后端接口。

```python
@router.get("/task-status")
async def get_task_status():
    """返回所有调度任务的当前状态"""
    from apscheduler.schedulers.background import BackgroundScheduler
    # 返回scheduler中所有job的状态
    ...

@router.post("/trigger-task/{task_id}")
async def trigger_task(task_id: str):
    """手动触发指定任务"""
    TASK_MAP = {
        "daily_quotes_sync": industry._sync_all_quotes,
        "daily_klines_sync": _daily_klines_incremental,
        "concept_board_sync": concept_board.sync_concept_boards,
        "fund_flow_snapshot": fund_flow.take_daily_snapshot,
        "global_index_kline_sync": global_market.sync_all_review_index_klines,
        "weekly_fundamental_sync": _run_fundamental_sync,
        "guba_daily_sync": guba.sync_all_guba,
        "minute_daily_sync": _auto_sync_minute,
    }
    ...
```

### 5.4 前端监控页面修改（system/page.tsx）

**新增组件**：

1. `TaskStatusTable` - 任务状态总览表格
2. `DailyHealthCheck` - 今日数据健康检查面板
3. `ConceptBoardMonitor` - 概念板块同步状态
4. `FundFlowMonitor` - 资金流向快照状态
5. `GlobalIndexMonitor` - 全球指数K线状态
6. `F10Monitor` - F10财务数据状态（含财报季提示）

**修改 `SwIndustryMonitor`**：去掉硬编码的"每3分钟"（申万实际上不是3分钟同步，是每日收盘后）

**修改 `triggerFullRefresh`**：

- 去掉内部重复调用板块新闻（`_run_full_sync` 内已包含）
- 优化为顺序调用：行情 → K线 → F10（低频时跳过）

### 5.5 自选股页面修改（WatchlistPanel.tsx）

**新增市场时间检测**：

```typescript
function isMarketHours(): boolean {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const day = now.getDay();
  if (day === 0 || day === 6) return false; // 周末
  const time = hours * 100 + minutes;
  return time >= 915 && time <= 1505; // 9:15-15:05
}
```

**刷新按钮逻辑优化**：

- 非交易时间：显示"行情数据来自 {最新同步日期}"，按钮文案改为"使用最新缓存"
- 点击后直接从 DB 读缓存，不调用 baostock

---

## 六、改造后的架构全景

```
                    ┌─────────────────────────────────┐
                    │        APScheduler 调度中心       │
                    │                                   │
                    │  A级（每交易日）:                  │
                    │  16:00 → 资金流向快照             │
                    │  17:30 → 行情+申万板块             │
                    │  18:00 → K线增量（含断点续传）     │
                    │  18:30 → 全球指数K线+技术指标      │
                     │  19:00 → 概念板块+产业分时(19:05)  │

                    │  19:30 → 股吧资讯                 │
                    │                                   │
                    │  高频（全天）:                     │
                    │  每3分钟  → 快讯增量               │
                    │  每15分钟 → 板块/主题新闻           │
                    │                                   │
                    │  低频（每周/季度）:                 │
                    │  每周日 → F10财务（智能触发）       │
                    │  每季度 → 申万成分股更新            │
                    └─────────────┬───────────────────┘
                                  │
                    ┌─────────────▼───────────────────┐
                    │          数据库 stock_data.db     │
                    │  (WAL模式 + busy_timeout=60s)    │
                    └─────────────────────────────────┘
                                  ▲
          ┌───────────────────────┼────────────────────┐
          │                       │                    │
┌─────────▼───────┐   ┌──────────▼──────┐  ┌─────────▼───────────┐
│  监控页面(system) │   │  各业务页面      │  │  data-collector.md  │
│                  │   │                 │  │  (新建Codex Agent)  │
│ 全任务状态总览   │   │ 自选股：读缓存   │  │ 调用API触发同步      │
│ 今日健康检查     │   │   不直接baostock│  │ 查询任务状态         │
│ 手动触发任意任务 │   │ 产业详情：      │  │ 分析数据缺口         │
│ 实时进度展示     │   │   单股F10同步   │  │ 创建新爬取任务       │
│ 日志 & 失败记录  │   │                 │  │                     │
└──────────────────┘   └─────────────────┘  └─────────────────────┘
```

---

## 七、验证与测试方案

### 7.1 修改前必须验证的数据库状态

```sql
-- 验证当前各表数据量（修改前记录，作为基准）
SELECT COUNT(*) FROM stock_meta WHERE market='A股';         -- 预期 ~3248
SELECT COUNT(*) FROM stock_quote WHERE price > 0;           -- 预期 ~3248
SELECT COUNT(DISTINCT code) FROM stock_kline;               -- 预期 ~3248
SELECT COUNT(*) FROM stock_f10_snapshot;                    -- 预期 <3248（部分缺失）
SELECT COUNT(*) FROM news_flash;                            -- 预期 >10000
SELECT COUNT(*) FROM sw_industry;                           -- 预期 ~100
SELECT MAX(trade_date) FROM stock_kline WHERE period='daily'; -- 预期最近交易日
```

### 7.2 修改后验证步骤

1. 重启后端服务，确认所有路由加载正常
2. 访问 `GET /api/system/stats` 确认数据量与修改前一致
3. 访问监控页面，确认新增面板正常显示
4. 测试手动触发一次行情同步，确认状态轮询正常
5. 确认自选股页面非交易时间使用缓存
6. 检查 scheduler-logs，确认定时任务按新时间执行

### 7.3 不可修改的内容清单（数据保护）

- ❌ 不允许修改 `db.py` 的表结构定义（会影响现有数据）
- ❌ 不允许修改 `_sync_klines`/`_sync_fundamental` 的核心逻辑
- ❌ 不允许修改 `_upsert_f10`（`routers/fundamental.py`）的 upsert 逻辑
- ❌ 不允许修改 `_sync_fundamental`（`routers/industry.py`）的 baostock 写入逻辑（**注意：`_upsert_fundamental` 此函数名在代码中不存在，实际是 `_sync_fundamental`**）
- ❌ 不允许删除任何现有的 `_status`/`_lock` 等全局状态变量
- ✅ 只修改 `main.py` 中 `add_job` 的时间参数
- ✅ 只在 `system.py` 新增接口，不修改现有接口
- ✅ 只在前端新增组件，不修改现有组件的数据请求逻辑

---

## 八、待确认问题（需要用户决策）

1. **F10同步频率**：方案中建议"每周日同步"，但如果用户希望更频繁（如每天），需确认能接受更长的同步时间（全量3000+只股票的F10约需4-8小时）

2. **申万成分股**：当前完全手动触发，是否需要加入季度自动更新？

3. **自选股页面刷新**：是否可以接受非交易时间只显示缓存数据（不调用baostock）？

4. ~~**全量同步时间**：建议将16:30作为行情同步起始时间（比原来17:30提前1小时），是否有业务影响？~~ **已决策**：行情同步保持17:30（闭盘后接口稳定），见 §3.1.2。

5. ~~**概念板块**：确认是否需要加入16:30定时同步？~~ **已决策**：加入定时同步，调整为19:00（见 §3.1.2，P1 任务）。

6. **stock-analyzer agent**：是否保留原有的 scrape_f10.py 命令行工具，还是完全改为调用API？

---

## 九、执行优先级排序

### P0（立即修改，影响系统稳定性）

- [ ] 修复 main.py 中 17:30 三任务并发问题（`minute_daily_sync` 从17:30移到19:05，`guba_daily_sync` 移到19:30）
- [ ] 修复前端 `triggerFullRefresh` 中板块新闻被调用两次的问题

### P1（本次任务必须完成，改善数据完整性）

- [ ] 新增 `concept_board_sync` 定时调度（每交易日19:00）
- [ ] 修改 `system.py` 新增 `task-status` 接口
- [ ] 修改前端监控页面新增全任务状态总览
- [ ] 修改前端监控页面新增今日健康检查面板
- [ ] 新增概念板块、资金流向、全球指数监控模块

### P2（本次任务，改善Agent能力）

- [x] 新建 `.agents/agents/data-collector.md`，写入完整API接口知识和数据采集业务映射
- [ ] `stock-analyzer.md` **不修改**，保持原有基本面分析专家定位

### P3（中期优化）

- [ ] F10同步改为低频（每周/财报季每天）
- [ ] 自选股页面非交易时间使用缓存
- [ ] 行情/K线增量跳过逻辑优化

---

_本文档由 WorkSpace Agent 基于项目深度代码分析生成。执行前请先确认待确认问题，并严格遵守数据保护规则（不能修改或删除现有数据）。_
