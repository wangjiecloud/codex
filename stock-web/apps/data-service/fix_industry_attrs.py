"""
批量修复图中企业的产业归属，以及补充缺失的 industry_node/edge
"""
import sqlite3, json
from datetime import datetime

DB = "apps/data-service/stock_data.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()
NOW = datetime.now().isoformat()


def add_industry_id(code, iid):
    row = cur.execute("SELECT industry_ids FROM stock_meta WHERE code=?", (code,)).fetchone()
    if not row:
        print(f"  [WARN] {code} 不在stock_meta，跳过")
        return False
    ids = json.loads(row[0]) if row[0] else []
    if iid not in ids:
        ids.append(iid)
        cur.execute("UPDATE stock_meta SET industry_ids=? WHERE code=?", (json.dumps(ids), code))
        print(f"  [meta] {code} industry_ids += {iid}")
    return True


def upsert_node(industry_id, node_id, label, layer, x, y, stocks, group_name, desc, icon="🏭", ticker="", market="CN"):
    existing = cur.execute("SELECT node_id FROM industry_node WHERE industry_id=? AND node_id=?",
                           (industry_id, node_id)).fetchone()
    if existing:
        print(f"  [node] 已存在 {node_id}，跳过")
        return
    cur.execute("""
        INSERT INTO industry_node
        (industry_id, node_id, x, y, label, icon, desc, layer, ticker, market, group_name, stocks, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (industry_id, node_id, x, y, label, icon, desc, layer, ticker, market,
          group_name, json.dumps(stocks), NOW))
    print(f"  [node] 新增 {node_id} ({label}) → {industry_id}/{layer} x={x}")


def upsert_edge(industry_id, edge_id, source, target, layer, label=""):
    existing = cur.execute("SELECT edge_id FROM industry_edge WHERE industry_id=? AND edge_id=?",
                           (industry_id, edge_id)).fetchone()
    if existing:
        return
    cur.execute("""
        INSERT INTO industry_edge (industry_id, edge_id, source, target, layer, label, updated_at)
        VALUES (?,?,?,?,?,?,?)
    """, (industry_id, edge_id, source, target, layer, label, NOW))
    print(f"  [edge] {edge_id}: {source} → {target}")


def update_company_count(industry_id):
    rows = cur.execute("SELECT stocks FROM industry_node WHERE industry_id=?", (industry_id,)).fetchall()
    codes = set()
    for (s,) in rows:
        lst = json.loads(s) if s else []
        for c in lst:
            if c and (c.startswith('0') or c.startswith('3') or c.startswith('6')):
                codes.add(c)
    count = len(codes)
    cur.execute("UPDATE industry_list SET company_count=? WHERE industry_id=?", (count, industry_id))
    print(f"  [count] {industry_id} company_count = {count}")


# ═══════════════════════════════════════════════════════════════
# 1. 修复 mlcc：三环集团（300408）加入mlcc
# ═══════════════════════════════════════════════════════════════
print("\n=== 1. 三环集团 → mlcc ===")
add_industry_id("300408", "mlcc")
# 节点已存在(sanhuan)，只需更新industry_ids

# ═══════════════════════════════════════════════════════════════
# 2. 修复 aiserver：工业富联/浪潮信息/中科曙光 industry_ids 补充
# ═══════════════════════════════════════════════════════════════
print("\n=== 2. 工业富联/浪潮信息/中科曙光 → aiserver ===")
add_industry_id("601138", "aiserver")  # 工业富联，节点 as_foxconn 已存在
add_industry_id("000977", "aiserver")  # 浪潮信息，节点 as_inspur 已存在
add_industry_id("603019", "aiserver")  # 中科曙光，节点 as_sugon 已存在

# ═══════════════════════════════════════════════════════════════
# 3. 修复先进封装4家 → semieq
# 先查semieq core最大x（目前是2000）
# ═══════════════════════════════════════════════════════════════
print("\n=== 3. 先进封装 → semieq ===")
# 先进封装属于semieq的 downstream 层（封装是制造的下游）
# 查semieq downstream现有节点
rows = cur.execute("SELECT node_id, label, x FROM industry_node WHERE industry_id='semieq' AND layer='downstream' ORDER BY x").fetchall()
print(f"  semieq/downstream 现有: {rows}")
# 从x=100开始分布
advanced_pkg = [
    ("002156", "通富微电", "se_tongfu", 100, "先进封装/测试", "先进封装（FCBGA/SiP/Chiplet）"),
    ("600584", "长电科技", "se_changjian", 500, "先进封装/测试", "先进封装（FCBGA/WLP/SiP），全球第三大封测"),
    ("002185", "华天科技", "se_huatian", 900, "先进封装/测试", "先进封装/测试，国产封装龙头"),
    ("603005", "晶方科技", "se_jingfang", 1300, "先进封装/测试", "晶圆级封装（WLP/WLCSP），图像传感器封装"),
]
for code, name, node_id, x, group_name, desc in advanced_pkg:
    upsert_node("semieq", node_id, name, "downstream",
                x=x, y=630,
                stocks=[code], group_name=group_name,
                desc=desc, icon="📦", ticker=code, market="CN")
    add_industry_id(code, "semieq")

# 添加边：连接core层设备到downstream封装
upsert_edge("semieq", "e-asml-tongfu", "se_asml", "se_tongfu", "core→downstream", "光刻设备")
upsert_edge("semieq", "e-beifang-tongfu", "se_beifang", "se_tongfu", "core→downstream", "刻蚀设备")
upsert_edge("semieq", "e-beifang-changjian", "se_beifang", "se_changjian", "core→downstream", "设备支持")

# ═══════════════════════════════════════════════════════════════
# 4. 修复 pcb：东山精密(002384) 加入pcb + 深南电路(002916) 加入pcb
# ═══════════════════════════════════════════════════════════════
print("\n=== 4. 东山精密/深南电路 → pcb ===")
# 东山精密：PCB精密制造（PCB core层，数通/AI服务器板）
upsert_node("pcb", "pcb_dongshan", "东山精密", "core",
            x=2050, y=210,
            stocks=["002384"], group_name="数通/AI服务器板",
            desc="AI服务器主板/高频高速PCB，HDI/埋容埋阻技术",
            icon="🔧", ticker="002384", market="CN")
upsert_edge("pcb", "e-dongshan-hudian", "pcb_dongshan", "pcb_hudian", "core", "数通PCB协作")
add_industry_id("002384", "pcb")

# 深南电路：已有节点pcb_shennan，只需更新industry_ids
add_industry_id("002916", "pcb")

# ═══════════════════════════════════════════════════════════════
# 5. 修复 coppercable：立讯精密(002475) + 鼎通科技(688668) 加入
# ═══════════════════════════════════════════════════════════════
print("\n=== 5. 立讯精密/鼎通科技 → coppercable ===")
rows = cur.execute("SELECT MAX(x), COUNT(*) FROM industry_node WHERE industry_id='coppercable' AND layer='core'").fetchone()
max_x = rows[0]
print(f"  coppercable/core max_x={max_x}")

# 立讯精密：高速铜缆组件/连接器
upsert_node("coppercable", "cu_luxshare", "立讯精密", "core",
            x=max_x + 350, y=210,
            stocks=["002475"], group_name="国产高速铜缆",
            desc="高速铜缆/连接器组件，AI服务器DAC/AEC线缆模组",
            icon="🔌", ticker="002475", market="CN")
upsert_edge("coppercable", "e-luxshare-nvda", "cu_luxshare", "cu_nvda", "core→application", "供应连接器")
add_industry_id("002475", "coppercable")

# 鼎通科技：高速连接器
rows2 = cur.execute("SELECT MAX(x) FROM industry_node WHERE industry_id='coppercable' AND layer='core'").fetchone()
upsert_node("coppercable", "cu_dingtong", "鼎通科技", "core",
            x=rows2[0] + 350, y=210,
            stocks=["688668"], group_name="国产高速铜缆",
            desc="高速连接器/精密连接组件，服务器/数通高速互联",
            icon="🔌", ticker="688668", market="CN")
upsert_edge("coppercable", "e-dingtong-nvda", "cu_dingtong", "cu_nvda", "core→application", "供应连接器")
add_industry_id("688668", "coppercable")

# ═══════════════════════════════════════════════════════════════
# 6. 修复圣阳股份(002580) → aipower（BBU/后备电源）
# ═══════════════════════════════════════════════════════════════
print("\n=== 6. 圣阳股份 → aipower ===")
rows = cur.execute("SELECT MAX(x) FROM industry_node WHERE industry_id='aipower' AND layer='core'").fetchone()
max_x = rows[0]
upsert_node("aipower", "pw_shengyang", "圣阳股份", "core",
            x=max_x + 350, y=210,
            stocks=["002580"], group_name="BBU/后备电源",
            desc="铅酸/锂电备用电源/UPS电池，AI数据中心后备储能",
            icon="🔋", ticker="002580", market="CN")
upsert_edge("aipower", "e-shengyang-zhongheng", "pw_shengyang", "pw_zhongheng", "core", "BBU协作")
add_industry_id("002580", "aipower")

# ═══════════════════════════════════════════════════════════════
# 7. 修复英维克(002837) → liquidcool
# 英维克目前 industry_ids=['idc']，需加 liquidcool
# 英维克已在 liquidcool 图谱(lc_yingweike)，只需更新meta
# ═══════════════════════════════════════════════════════════════
print("\n=== 7. 英维克 → liquidcool ===")
add_industry_id("002837", "liquidcool")
# 英维克也在idc core(idc_yingweike)，这个没错，两个都保留

# ═══════════════════════════════════════════════════════════════
# 8. 申菱环境(301018=中菱环境) → liquidcool
# 申菱环境已在 liquidcool 节点(lc_shenling)，只需更新meta
# ═══════════════════════════════════════════════════════════════
print("\n=== 8. 申菱环境 → liquidcool ===")
row = cur.execute("SELECT code, name, industry_ids FROM stock_meta WHERE code='301018'").fetchone()
print(f"  申菱环境: {row}")
add_industry_id("301018", "liquidcool")

# ═══════════════════════════════════════════════════════════════
# 9. 中科曙光(603019) → liquidcool（图中标了液冷）
# 中科曙光已在 liquidcool 节点(lc_fuxin? 查一下)
# ═══════════════════════════════════════════════════════════════
print("\n=== 9. 中科曙光 → liquidcool ===")
node = cur.execute("SELECT node_id FROM industry_node WHERE industry_id='liquidcool' AND stocks LIKE '%603019%'").fetchone()
print(f"  曙光在liquidcool节点: {node}")
if not node:
    rows = cur.execute("SELECT MAX(x) FROM industry_node WHERE industry_id='liquidcool' AND layer='downstream'").fetchone()
    upsert_node("liquidcool", "lc_sugon", "中科曙光", "downstream",
                x=(rows[0] or 900) + 300, y=630,
                stocks=["603019"], group_name="液冷整体方案",
                desc="曙光数创液冷服务器整机，浸没式/冷板式液冷解决方案",
                icon="❄️", ticker="603019", market="CN")
    upsert_edge("liquidcool", "e-sugon-nvda", "lc_sugon", "lc_nvda", "downstream→application", "液冷服务器")
add_industry_id("603019", "liquidcool")

conn.commit()
print("\n=== 更新 company_count ===")
for iid in ["mlcc", "aiserver", "semieq", "pcb", "coppercable", "aipower", "liquidcool"]:
    update_company_count(iid)
conn.commit()
conn.close()
print("\n批量修复完成！")
