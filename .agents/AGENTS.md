0、数据库保护规则（最高优先级）：

- 严禁在未经用户明确指示的情况下删除、清空、覆盖任何数据库数据，包括但不限于 DROP TABLE、DELETE FROM、TRUNCATE 及任何会批量替换现有行的操作
- 发现数据库数据异常（如表为空、数据缺失）时，必须先停下来向用户报告并询问原因，不得自行判断并执行"恢复"操作
- 写入数据时若使用 INSERT OR REPLACE / on_conflict_do_update，必须明确告知用户该操作会覆盖已有数据，并获得同意后才能执行
- 任何涉及数据库数据变更的脚本（如 seed、migrate、reset），执行前必须获得用户明确授权

1、所有的股票相关的数据，都要存到数据库中

2、新增产业时必须完整补全以下所有数据，缺一不可：

- stock_meta：产业内所有股票的基本信息（code/name/market/industry_ids）
- stock_quote：对应股票的行情缓存（新增时写入默认值0，再调用同步）
- stock_kline：所有股票的日K线数据（至少400个交易日），调用 \_sync_klines(code, "daily")
- stock_fundamental：所有股票的基本面数据，调用 \_sync_fundamental(code)
- guba_post：所有股票的公告/新闻/研报数据，调用 scrape_all_categories(code)
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
