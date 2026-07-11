0、数据库保护规则（最高优先级）：

- 严禁在未经用户明确指示的情况下删除、清空、覆盖任何数据库数据，包括但不限于 DROP TABLE、DELETE FROM、TRUNCATE 及任何会批量替换现有行的操作
- 发现数据库数据异常（如表为空、数据缺失）时，必须先停下来向用户报告并询问原因，不得自行判断并执行"恢复"操作
- 写入数据时若使用 INSERT OR REPLACE / on_conflict_do_update，必须明确告知用户该操作会覆盖已有数据，并获得同意后才能执行
- 任何涉及数据库数据变更的脚本（如 seed、migrate、reset），执行前必须获得用户明确授权

1、所有的股票相关的数据，都要存到数据库中

1.1、股票基本面（F10）数据爬取规则：

- **必须使用 f10-scraper skill**（位于 `.agents/skills/f10-scraper/`）来爬取和入库 F10 数据
- 爬取命令（在 `apps/data-service/` 目录下执行）：
  ```bash
  python ../../.agents/skills/f10-scraper/scripts/scrape_f10.py --code {股票代码}
  ```
- 覆盖 11 张数据库表：stock_f10_snapshot / stock_f10_financial_statement / stock_f10_dividend_history / stock_f10_institution_forecast / stock_f10_business_analysis / stock_f10_shareholder_info / stock_f10_peer_comparison / stock_f10_company_profile / stock_f10_key_events / stock_f10_fund_flow / stock_f10_research_report
- 爬取后必须用 `--verify-only` 参数验证数据已写入所有表
- 详细的爬取方法、SPA 结构说明、已知问题解决方案见 `.agents/skills/f10-scraper/SKILL.md`

2、新增产业时必须完整补全以下所有数据，缺一不可：

- stock_meta：产业内所有股票的基本信息（code/name/market/industry_ids）
- stock_quote：对应股票的行情缓存（新增时写入默认值0，再调用同步）
- stock_kline：所有股票的日K线数据（至少400个交易日），调用 \_sync_klines(code, "daily")
- stock_fundamental：所有股票的基本面数据，调用 \_sync_fundamental(code)
- industry_list：列表页卡片（industry_id/name/description/icon/company_count/last_analyzed/representatives/sort_order）
- industry_meta：产业元信息（industry_id/title/subtitle/layer_labels/sort_order）
- industry_node：产业链图谱节点，需含（industry_id/node_id/x/y/label/icon/desc/layer/ticker/market/group_name/stocks）
- industry_edge：产业链图谱连接边（industry_id/edge_id/source/target/layer/label）
- 前端 OVERVIEW_INDUSTRIES 常量：在 IndustryDetailContent.tsx 的 OVERVIEW_INDUSTRIES 数组中追加新产业节点（id/label/icon/color/reps/x/y），并在 OVERVIEW_EDGES_DEF 中追加与其他产业的关联边

3、产业链图谱节点设计规范：

- layer 取值：upstream（上游原材料/设备）、core（核心制造）、downstream（下游封装/应用）、application（终端/海外巨头）
- y 坐标按层级分配：L0=0, L1=210, L2=420, L3=630, L4=840
- x 坐标在层内均匀分布，范围 100-1800
- 海外企业节点 stocks=[] 不关联A股
- 每条边 edge_id 唯一，格式建议 e-{src_short}-{tgt_short}

  3.1、3D图（供应链图/泳道图）节点字段写法规则（严格遵守）：

- **一个节点只代表一家企业**：stocks 字段只放该企业的一个股票代码，严禁将多家企业合并到同一个节点的 stocks 数组
- **label = 企业名称**：节点卡片大标题显示 label，必须写企业名（如"中际旭创"、"云南锗业"），不能写材料类别名（如"磷化铟衬底"）
- **group_name = 分组/类别标签**：同一分组的多个节点会被框在一起，左上角显示 group_name，写材料/技术类别（如"磷化铟衬底"、"国产光芯片"、"海外MLCC巨头"）
- **desc = 企业主营/产品描述**：简短说明该企业在产业链中的角色和核心产品
- **ticker = 该企业股票代码**：A股写6位代码，海外写 ticker symbol
- 新增同类材料的多家企业时，每家各建一个节点，设置相同 group_name，x 坐标在层内重新均匀分布

4、已有产业 ID 列表（新增产业 sort_order 递增）：

- overview (0)：AI算力产业链全景概览
- aigpu (1)：AI算力芯片（GPU/NPU）
- pcb (2)：PCB（印制电路板）
- mlcc (3)：MLCC（积层陶瓷电容器）
- memory (4)：存储芯片（HBM/DRAM/NAND）
- optics (5)：光模块与CPO
- fiber (6)：光纤光缆
- liquidcool (7)：液冷散热
- aipower (8)：AI供配电（PSU/BBU/HVDC）
- coppercable (9)：高速铜连接（DAC/AEC）
- idc (10)：智算中心/IDC运营
- glasssub (11)：玻璃基板（半导体封装/面板）
- aiserver (12)：AI服务器整机（ODM/整机/算力交付）
- semieq (13)：半导体设备（光刻/刻蚀/CVD/CMP/清洗/检测）

5、玻璃基板产业（glasssub）股票列表：
600876 洛阳玻璃、600707 彩虹股份、000012 南玻A、600586 金晶科技、
605305 中材科技、300408 三环集团、002006 精功科技、688037 芯源微、
601636 旗滨集团、002916 深南电路、688185 康希通信、000725 京东方A、
000050 深天马A、002652 蓝思科技、002475 立讯精密、002241 歌尔股份、
002129 中环股份、688599 天岳先进

6、routers/quote.py 中 \_is_a_share() 函数的A股判断规则：

- 以 0 或 3 开头（深交所主板/创业板）：True
- 以 6 开头（上交所全部，含600/601/603/605/688等）：True
- 其他（含NVDA/AAPL等海外股票代码）：False

7、向现有产业的 3D图/供应链图 新增节点时，必须同步以下所有数据，缺一不可：

- industry_node：新增节点记录（industry_id/node_id/label/layer/x/y/stocks/group_name/desc/icon/ticker/market）
- industry_edge：新增与现有节点的连接边（industry_id/edge_id/source/target/layer/label）
- stock_meta：新节点中所有 A 股的基本信息（code/name/market/industry_ids）
- stock_quote：对应股票的行情缓存（新增时写入默认值0）
- stock_kline：调用 routers/industry.py 中的 \_sync_klines(code, "daily")，获取至少 266 个交易日 K 线
- stock_fundamental：调用 routers/industry.py 中的 \_sync_fundamental(code)
- industry_list.company_count：重新统计产业内 stocks 字段去重后的 A 股数量并更新
- 如果新增节点属于 upstream 层且 x 坐标与现有节点重叠，需重新均匀分布所有同层节点的 x 坐标（范围 100-1800）

9、编译 codex-rs 规则：

- 编译前必须先执行 `cargo clean` 清理旧产物，释放磁盘空间，再执行编译
- 编译命令统一使用 `cargo build --bin codex`（Mac arm64 原生，无需加 `--target` 参数）
- 完整流程：
  ```bash
  cd ~/codespace/self/SuperJAI/oss/agent/codex/codex-rs
  cargo clean
  cargo build --bin codex
  ```
- 编译产物路径：`codex-rs/target/debug/codex`，每次编译会覆盖同一文件
- 编译前确认磁盘剩余空间充足（`df -h /`），至少需要 10G 可用空间

10、PCB 产业（pcb）A股股票完整列表（30只，截至2026-06）：

- 上游原材料/耗材/设备（L0）：600176 中国巨石、603803 宏和科技、301217 铜冠铜箔、688728 德福科技、600110 诺德股份、601208 东材科技、605589 圣泉集团、603002 宏昌电子、688300 联瑞新材、688603 天承科技、002741 光华科技、000657 中钨高新、300407 鼎泰高科、301200 大族数控
- 覆铜板 CCL（L1）：600183 生益科技（FR4/高速CCL）、603186 华正新材（FR4/高速CCL）、688519 南亚新材（高频高速CCL）
- PCB制造/IC载板（L2）：002463 沪电股份（数通/AI服务器板）、002916 深南电路（数通/AI服务器板）、002938 鹏鼎控股（FPC软板）、300657 弘信电子（FPC软板）、002633 奥士康（HDI高密互联）、300476 胜宏科技（HDI高密互联）、603936 博敏电子（HDI高密互联）、002436 兴森科技（IC/ABF载板）、603421 世运电路（汽车板/多层板）、002134 天津普林（汽车板/多层板）
- 组装/测试（L3）：601138 工业富联（AI服务器组装）、002475 立讯精密（消费电子精密组装）、002241 歌尔股份（消费电子精密组装）
