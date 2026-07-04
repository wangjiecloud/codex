"""
glasssub 产业精准化重构
目标：聚焦"半导体先进封装玻璃基板"这一核心AI算力相关方向
- 保留：封装基板制造商（深南电路/兴森科技/康希通信）、玻璃基板探索（沃格光电/凯盛科技）、
        陶瓷/特种封装（三环集团/中瓷电子）、上游材料（中材科技/芯源微/江化微）
- 剔除：面板玻璃（彩虹股份/南玻A/旗滨集团/洛阳玻璃/京东方/深天马A）
        精密组装（蓝思科技/立讯精密/长信科技/歌尔股份）
        SiC衬底/硅片（天岳先进/中环股份）——这两家应归 aipower/semieq，不属于玻璃基板

产业链新结构（4层）：
upstream:  玻璃原料/化学品/专用设备 → 支撑基板制造
core:      玻璃基板/陶瓷封装基材制造商 → 核心制造
downstream: IC封装基板应用（深南/兴森/康希通信） → 直接下游
application: AI芯片/先进封装终端（英伟达/台积电/英特尔）
"""
import sqlite3, json
from datetime import datetime

DB = "apps/data-service/stock_data.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()
NOW = datetime.now().isoformat()

# ── 1. 确定删除节点列表 ─────────────────────────────────────────
NODES_TO_REMOVE = [
    # 面板玻璃（与AI封装无关）
    "caihong",        # 彩虹股份 — 面板玻璃
    "nanbo",          # 南玻A — 面板/建筑玻璃
    "qibin",          # 旗滨集团 — 建筑/面板玻璃
    # 显示面板（与封装无关）
    "boe",            # 京东方A
    "tianma",         # 深天马A
    # 精密组装（消费电子，非封装基板）
    "lens",           # 蓝思科技
    "luxshare",       # 立讯精密（glasssub里）
    "changxin",       # 长信科技
    # SiC衬底（功率器件，归aipower）
    "tianyue",        # 天岳先进
]

# ── 2. 确定保留并修正的节点 ────────────────────────────────────
# 保留：深南电路(shennan_pkg)、兴森科技(xinsen_pkg)、康希通信(kantong未确认)
# 保留：沃格光电(gs_woge)、凯盛科技(gs_kaisheng)、中瓷电子(gs_zhongci)
# 保留：三环集团(sanhuan_gs)、华天科技(huatian_pkg)
# 保留：上游：中材科技(cailiao)、江化微(gs_jianghua)、芯源微(xinyuan_eq)、康宁(corning_gl)

print("=== 删除不相关节点 ===")
for node_id in NODES_TO_REMOVE:
    # 先删关联边
    edges = cur.execute(
        "SELECT edge_id FROM industry_edge WHERE industry_id='glasssub' AND (source=? OR target=?)",
        (node_id, node_id)
    ).fetchall()
    for (eid,) in edges:
        cur.execute("DELETE FROM industry_edge WHERE edge_id=?", (eid,))
        print(f"  删除边: {eid}")
    # 删节点
    result = cur.execute("DELETE FROM industry_node WHERE industry_id='glasssub' AND node_id=?", (node_id,))
    if result.rowcount:
        print(f"  删除节点: {node_id}")
    else:
        print(f"  [跳过] {node_id} 不存在")

# ── 3. 修正 stock_meta.industry_ids（移除 glasssub）───────────────
REMOVE_FROM_GLASSSUB = [
    "600707",  # 彩虹股份
    "000012",  # 南玻A
    "601636",  # 旗滨集团
    "600876",  # 洛阳玻璃（节点在overview，meta里有glasssub）
    "000725",  # 京东方A
    "000050",  # 深天马A
    "300433",  # 蓝思科技
    "002475",  # 立讯精密（保留glasssub用于精密组装的meta？→ 移除，立讯与玻璃基板无实质关联）
    "300088",  # 长信科技
    "688234",  # 天岳先进（SiC衬底，应归aipower，不是玻璃基板）
    "002129",  # 中环股份（硅片/SiC，不是玻璃基板）
    "002241",  # 歌尔股份（消费电子声学）
]

print("\n=== 更新 stock_meta.industry_ids ===")
for code in REMOVE_FROM_GLASSSUB:
    row = cur.execute("SELECT name, industry_ids FROM stock_meta WHERE code=?", (code,)).fetchone()
    if not row:
        print(f"  [{code}] 不在DB，跳过")
        continue
    ids = json.loads(row[1]) if row[1] else []
    if "glasssub" in ids:
        ids.remove("glasssub")
        cur.execute("UPDATE stock_meta SET industry_ids=? WHERE code=?", (json.dumps(ids), code))
        print(f"  {code} {row[0]:15s}: 移除 glasssub → {ids}")

# ── 4. 重新规划产业链图谱（4层，聚焦封装玻璃基板）──────────────

# 清理旧的不准确节点层级（华天科技在glasssub core，实际是封装制造，应在core；兴森科技应在downstream/core）
# 先删除所有现有glasssub节点，重建
print("\n=== 清空旧节点/边，重建产业链图谱 ===")
cur.execute("DELETE FROM industry_edge WHERE industry_id='glasssub'")
cur.execute("DELETE FROM industry_node WHERE industry_id='glasssub'")
print("  已清空所有 glasssub 节点和边")

def add_node(node_id, label, layer, x, y, stocks, group, desc, icon="🏭", ticker="", market="CN"):
    cur.execute("""
        INSERT INTO industry_node
        (industry_id, node_id, x, y, label, icon, desc, layer, ticker, market, group_name, stocks, updated_at)
        VALUES ('glasssub',?,?,?,?,?,?,?,?,?,?,?,?)
    """, (node_id, x, y, label, icon, desc, layer, ticker, market, group, json.dumps(stocks), NOW))
    print(f"  [node] {node_id} ({label}) {layer} x={x}")

def add_edge(edge_id, source, target, layer, label=""):
    cur.execute("""
        INSERT INTO industry_edge (industry_id, edge_id, source, target, layer, label, updated_at)
        VALUES ('glasssub',?,?,?,?,?,?)
    """, (edge_id, source, target, layer, label, NOW))

# ── upstream: 玻璃原料/化学品/专用设备 (y=0) ──────────────────────
print("\n--- upstream ---")
# 中材科技（600176 中国巨石在pcb，002080 中材科技是玻璃纤维/材料）
add_node("gs_up_zhongcai", "中材科技", "upstream", 100, 0,
         ["002080"], "玻璃基础原料",
         "玻璃纤维/特种玻璃原材料，高纯石英及基板原料供应", "🪨", "002080")

# 洛阳玻璃（600876）：特种玻璃/超薄浮法玻璃，TFT基板玻璃探索
add_node("gs_up_luoyang", "洛阳玻璃", "upstream", 400, 0,
         ["600876"], "特种玻璃原料",
         "超薄浮法玻璃/电子玻璃原片，封装基板用特种玻璃探索", "🪟", "600876")

# 康宁（海外巨头，核心原料/玻璃基板供应商）
add_node("gs_up_corning", "康宁", "upstream", 700, 0,
         [], "海外玻璃基板巨头",
         "全球最大半导体玻璃基板供应商，Glass Core Substrate技术引领者",
         "🔬", "GLW", "US")

# 芯源微（688037）：半导体专用清洗/涂胶设备，用于玻璃基板制程
add_node("gs_up_xinyuanwei", "芯源微", "upstream", 1000, 0,
         ["688037"], "半导体专用设备",
         "半导体专用清洗/涂胶设备，玻璃基板制程关键设备", "⚙️", "688037")

# 江化微（603078）：高纯湿电子化学品，玻璃基板制程清洗液
add_node("gs_up_jianghua", "江化微", "upstream", 1300, 0,
         ["603078"], "清洗/刻蚀化学品",
         "高纯电子化学品/清洗液/刻蚀液，玻璃基板微孔加工配套", "🧪", "603078")

# 金晶科技（600586）：超白玻璃/电子玻璃，探索光伏及封装玻璃
add_node("gs_up_jinjing", "金晶科技", "upstream", 1600, 0,
         ["600586"], "特种玻璃原料",
         "超白玻璃/电子玻璃，探索封装基板用超薄玻璃方向", "🪟", "600586")

# ── core: 玻璃基板制造 + 陶瓷/有机封装基材制造商 (y=210) ────────
print("\n--- core ---")
# 沃格光电（603773）：超薄玻璃精密加工，Glass Core Substrate研发
add_node("gs_core_woge", "沃格光电", "core", 100, 210,
         ["603773"], "玻璃基板制造",
         "超薄玻璃精密加工/微孔加工，Glass Core Substrate先行者", "🔬", "603773")

# 凯盛科技（600552）：中建材旗下，特种玻璃+ITO导电玻璃
add_node("gs_core_kaisheng", "凯盛科技", "core", 400, 210,
         ["600552"], "玻璃基板制造",
         "特种功能玻璃/ITO导电玻璃，半导体封装玻璃基板研究", "🔬", "600552")

# 三环集团（300408）：LTCC/陶瓷封装基板，AI芯片射频器件封装
add_node("gs_core_sanhuan", "三环集团", "core", 700, 210,
         ["300408"], "陶瓷封装基材",
         "LTCC低温共烧陶瓷/陶瓷封装基板，5G/AI射频芯片封装核心材料", "🏺", "300408")

# 中瓷电子（003031）：氧化铝陶瓷封装外壳
add_node("gs_core_zhongci", "中瓷电子", "core", 1000, 210,
         ["003031"], "陶瓷封装基材",
         "陶瓷封装外壳/氧化铝基板，功率/射频芯片气密封装", "🏺", "003031")

# 华天科技（002185）：有机/陶瓷封装测试，国内第三大封测厂
add_node("gs_core_huatian", "华天科技", "core", 1300, 210,
         ["002185"], "封装基材应用",
         "OSAT封装测试，扇出/Chiplet先进封装探索，玻璃基板潜在客户", "📦", "002185")

# 兴森科技（002436）：ABF载板/IC封装基板，玻璃基板直接替代对象
add_node("gs_core_xinsen", "兴森科技", "core", 1600, 210,
         ["002436"], "封装基材应用",
         "ABF IC封装载板/高密度互联基板，正研究玻璃基板替代方案", "📦", "002436")

# ── downstream: IC封装基板终端制造 + 应用 (y=420) ──────────────
print("\n--- downstream ---")
# 深南电路（002916）：AI服务器PCB + IC封装基板，国内领先
add_node("gs_dn_shennan", "深南电路", "downstream", 200, 420,
         ["002916"], "IC封装基板/PCB",
         "AI服务器高速PCB + IC封装基板，国内最接近玻璃基板量产方向", "🔌", "002916")

# 康希通信（688653）：高频封装基板，AI通信芯片封装
add_node("gs_dn_kangxi", "康希通信", "downstream", 650, 420,
         ["688653"], "IC封装基板/PCB",
         "高频/高速封装基板，AI通信/毫米波芯片封装载板", "📡", "688653")

# 精功科技（002006）：精密光学/蚀刻设备，玻璃基板加工设备
add_node("gs_dn_jinggong", "精功科技", "downstream", 1100, 420,
         ["002006"], "玻璃基板设备",
         "精密切割/蚀刻加工设备，玻璃基板微孔加工专用设备", "⚙️", "002006")

# 蓝思科技（300433）：玻璃精密加工（保留一个，代表玻璃精加工方向）
add_node("gs_dn_lens", "蓝思科技", "downstream", 1550, 420,
         ["300433"], "玻璃精密加工",
         "消费电子/汽车玻璃精密加工，超薄玻璃CNC加工能力探索封装基板", "💎", "300433")

# ── application: AI芯片/先进封装终端 (y=630) ──────────────────
print("\n--- application ---")
add_node("gs_app_intel", "英特尔", "application", 300, 630,
         [], "先进封装引领者",
         "Glass Core Substrate发起者，2026年量产玻璃芯基板AI处理器",
         "🔵", "INTC", "US")

add_node("gs_app_nvda", "英伟达", "application", 800, 630,
         [], "AI算力芯片",
         "Blackwell/GB200系列GPU，CoWoS先进封装最大受益方",
         "🟢", "NVDA", "US")

add_node("gs_app_tsmc", "台积电", "application", 1300, 630,
         [], "晶圆代工/先进封装",
         "CoWoS/SoIC先进封装，未来玻璃基板封装最重要实施方",
         "⬛", "TSM", "US")

# ── 添加关键边 ─────────────────────────────────────────────────
print("\n--- edges ---")
edges = [
    ("gs-zhongcai-corning", "gs_up_zhongcai", "gs_up_corning", "upstream", "原料供应"),
    ("gs-luoyang-woge", "gs_up_luoyang", "gs_core_woge", "upstream→core", "玻璃原片"),
    ("gs-corning-woge", "gs_up_corning", "gs_core_woge", "upstream→core", "基板玻璃"),
    ("gs-corning-xinsen", "gs_up_corning", "gs_core_xinsen", "upstream→core", "基板玻璃"),
    ("gs-jinjing-woge", "gs_up_jinjing", "gs_core_woge", "upstream→core", "特种玻璃"),
    ("gs-xinyuanwei-woge", "gs_up_xinyuanwei", "gs_core_woge", "upstream→core", "加工设备"),
    ("gs-jianghua-woge", "gs_up_jianghua", "gs_core_woge", "upstream→core", "化学品"),
    ("gs-jianghua-kaisheng", "gs_up_jianghua", "gs_core_kaisheng", "upstream→core", "化学品"),
    ("gs-woge-shennan", "gs_core_woge", "gs_dn_shennan", "core→downstream", "玻璃基板"),
    ("gs-kaisheng-shennan", "gs_core_kaisheng", "gs_dn_shennan", "core→downstream", "基板材料"),
    ("gs-sanhuan-kangxi", "gs_core_sanhuan", "gs_dn_kangxi", "core→downstream", "陶瓷基材"),
    ("gs-xinsen-shennan", "gs_core_xinsen", "gs_dn_shennan", "core→downstream", "ABF载板"),
    ("gs-huatian-shennan", "gs_core_huatian", "gs_dn_shennan", "core→downstream", "封装协作"),
    ("gs-shennan-nvda", "gs_dn_shennan", "gs_app_nvda", "downstream→application", "封装基板"),
    ("gs-shennan-intel", "gs_dn_shennan", "gs_app_intel", "downstream→application", "Glass Core基板"),
    ("gs-kangxi-nvda", "gs_dn_kangxi", "gs_app_nvda", "downstream→application", "封装基板"),
    ("gs-xinsen-tsmc", "gs_core_xinsen", "gs_app_tsmc", "core→application", "ABF/玻璃基板"),
    ("gs-jinggong-woge", "gs_dn_jinggong", "gs_core_woge", "downstream→core", "加工设备"),
]
for eid, src, tgt, layer, label in edges:
    add_edge(eid, src, tgt, layer, label)
    print(f"  [edge] {eid}: {src} → {tgt}")

conn.commit()
print("\n节点和边已重建")
EOF
