"""
为14家新企业写入 industry_node 和 industry_edge，并更新 company_count
"""
import sqlite3
import json
from datetime import datetime

DB = "apps/data-service/stock_data.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()
NOW = datetime.now().isoformat()


def add_industry_id(code, iid):
    row = cur.execute("SELECT industry_ids FROM stock_meta WHERE code=?", (code,)).fetchone()
    if not row:
        return
    ids = json.loads(row[0]) if row[0] else []
    if iid not in ids:
        ids.append(iid)
        cur.execute("UPDATE stock_meta SET industry_ids=? WHERE code=?", (json.dumps(ids), code))
        print(f"  [meta] {code} industry_ids += {iid}")


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
        print(f"  [edge] 已存在 {edge_id}，跳过")
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
    return count


# ─── 1. 协创数据（300857）→ idc / downstream ─────────────────────────────────
print("\n=== 协创数据 → idc ===")
# idc/downstream 已有5个节点(max_x=2100)，新增 x=2400
upsert_node("idc", "idc_xiechuang", "协创数据", "downstream",
            x=2400, y=420,
            stocks=["300857"], group_name="IDC运营商",
            desc="算力数据中心建设与运营，云计算/大数据中心服务",
            icon="🏢", ticker="300857", market="CN")
upsert_edge("idc", "e-yingweike-xiechuang", "idc_yingweike", "idc_xiechuang", "core→downstream", "温控方案")
add_industry_id("300857", "idc")

# ─── 2. 同飞股份（300990）→ liquidcool / upstream  热管理/液冷辅材 ──────────────
print("\n=== 同飞股份 → liquidcool ===")
# liquidcool/upstream max_x=1800(海外)，新增 x=1460（在飞荣达1120后）
upsert_node("liquidcool", "lc_tongfei", "同飞股份", "upstream",
            x=1460, y=0,
            stocks=["300990"], group_name="液冷辅材/散热组件",
            desc="工业冷却/热管理设备，数据中心液冷换热系统",
            icon="❄️", ticker="300990", market="CN")
upsert_edge("liquidcool", "e-tongfei-shenling", "lc_tongfei", "lc_shenling", "upstream→core", "热管理配件")
upsert_edge("liquidcool", "e-tongfei-gaolan", "lc_tongfei", "lc_gaolan", "upstream→core", "热管理配件")
add_industry_id("300990", "liquidcool")

# ─── 3. 德科立（688205）→ optics / downstream  光模块 ──────────────────────────
print("\n=== 德科立 → optics ===")
# optics/downstream max_x=1800，新增 x=2100
upsert_node("optics", "opt_dekel", "德科立", "downstream",
            x=2100, y=420,
            stocks=["688205"], group_name="800G/1.6T数通模块",
            desc="高速光模块（100G/400G/800G），数通/电信光模块供应商",
            icon="🔌", ticker="688205", market="CN")
upsert_edge("optics", "e-accelink-dekel", "opt_accelink", "opt_dekel", "core→downstream", "光有源器件")
upsert_edge("optics", "e-tianfu-dekel", "opt_tianfu", "opt_dekel", "core→downstream", "光收发模块")
add_industry_id("688205", "optics")

# ─── 4. 上海新阳（300236）→ semieq / upstream  湿电子化学品 ──────────────────────
print("\n=== 上海新阳 → semieq ===")
# semieq/upstream 特种气体/化学品组，追加 x=4050
upsert_node("semieq", "se_xinyangsh", "上海新阳", "upstream",
            x=4050, y=0,
            stocks=["300236"], group_name="特种气体/化学品",
            desc="半导体湿电子化学品（镀铜液/光刻胶辅料），国产替代重要供应商",
            icon="🧪", ticker="300236", market="CN")
upsert_edge("semieq", "e-xinyangsh-beifang", "se_xinyangsh", "se_beifang", "upstream→core", "化学品供应")
add_industry_id("300236", "semieq")

# ─── 5. 聚辰股份（688123）→ memory / core  EEPROM ──────────────────────────────
print("\n=== 聚辰股份 → memory ===")
# memory/core max_x=1460，新增 x=1750
rows = cur.execute("SELECT node_id, label, x, group_name FROM industry_node WHERE industry_id='memory' AND layer='core' ORDER BY x").fetchall()
print("  memory/core 现有:", rows)
upsert_node("memory", "mem_jucheng", "聚辰股份", "core",
            x=1750, y=210,
            stocks=["688123"], group_name="存储芯片设计",
            desc="EEPROM/存储芯片设计，应用于IoT/工业/消费电子",
            icon="💾", ticker="688123", market="CN")
upsert_edge("memory", "e-jucheng-mem", "mem_jucheng", "mem_husi", "core→upstream", "存储设计")
add_industry_id("688123", "memory")

# ─── 6. 腾景科技（688195）→ optics / upstream  光学元件 ─────────────────────────
print("\n=== 腾景科技 → optics ===")
# optics/upstream 最大x=1800，新增 x=1900（OCS光学器件组，福晶科技1650已有）
upsert_node("optics", "opt_tengjing", "腾景科技", "upstream",
            x=1900, y=0,
            stocks=["688195"], group_name="OCS光学器件",
            desc="光学镜片/光学元件/光通信用精密光学器件",
            icon="🔭", ticker="688195", market="CN")
upsert_edge("optics", "e-tengjing-accelink", "opt_tengjing", "opt_accelink", "upstream→core", "光学器件")
upsert_edge("optics", "e-tengjing-guangku", "opt_tengjing", "opt_guangku", "upstream→core", "光无源器件")
add_industry_id("688195", "optics")

# ─── 7. 锐捷网络（301165）→ aiserver / downstream  网络设备 ──────────────────────
print("\n=== 锐捷网络 → aiserver ===")
# aiserver/downstream max_x=2100，新增 x=2400
upsert_node("aiserver", "as_ruijie", "锐捷网络", "downstream",
            x=2400, y=420,
            stocks=["301165"], group_name="品牌整机/集成",
            desc="AI园区/数据中心网络设备（交换机/路由器/WLAN），算力网络方案",
            icon="🌐", ticker="301165", market="CN")
upsert_edge("aiserver", "e-inspur-ruijie", "as_inspur", "as_ruijie", "core→downstream", "算力+网络方案")
add_industry_id("301165", "aiserver")

# ─── 8. 阳光电源（300274）→ aipower / downstream  逆变器/储能 ──────────────────
print("\n=== 阳光电源 → aipower ===")
# aipower/downstream max_x=1800，新增 x=2050
upsert_node("aipower", "pw_sungrow", "阳光电源", "downstream",
            x=2050, y=420,
            stocks=["300274"], group_name="高压配电/变电",
            desc="储能/逆变器巨头，AI数据中心储能备电/UPS方案",
            icon="☀️", ticker="300274", market="CN")
upsert_edge("aipower", "e-sungrow-idc", "pw_sungrow", "pw_idc", "downstream→application", "储能备电")
add_industry_id("300274", "aipower")

# ─── 9. 宏景科技（301396）→ semieq / core  半导体检测设备 ──────────────────────
print("\n=== 宏景科技 → semieq ===")
# semieq/core max_x 查询
row = cur.execute("SELECT MAX(x), COUNT(*) FROM industry_node WHERE industry_id='semieq' AND layer='core'").fetchone()
max_x = row[0]
print(f"  semieq/core max_x={max_x}, count={row[1]}")
upsert_node("semieq", "se_hongjing", "宏景科技", "core",
            x=max_x + 200, y=210,
            stocks=["301396"], group_name="量测/检测",
            desc="半导体检测设备（光学检测/量测），AI芯片制造良率监控",
            icon="🔬", ticker="301396", market="CN")
upsert_edge("semieq", "e-hongjing-kla", "se_hongjing", "se_kla", "core", "国产替代KLA")
add_industry_id("301396", "semieq")

# ─── 10. 中一科技（301150）→ pcb / upstream  电解铜箔 ──────────────────────────
print("\n=== 中一科技 → pcb ===")
# pcb/upstream max_x=2400，新增 x=2550
upsert_node("pcb", "copper_zhongyi", "中一科技", "upstream",
            x=2550, y=0,
            stocks=["301150"], group_name="电解铜箔",
            desc="电解铜箔（锂电铜箔/电子铜箔），覆铜板及PCB制造关键材料",
            icon="🔧", ticker="301150", market="CN")
upsert_edge("pcb", "e-zhongyi-shengyi", "copper_zhongyi", "ccl_shengyi", "upstream", "供应铜箔")
upsert_edge("pcb", "e-zhongyi-nanya", "copper_zhongyi", "ccl_nanya", "upstream", "供应铜箔")
add_industry_id("301150", "pcb")

# ─── 11. 国际复材（301526）→ pcb / upstream  电子玻纤布 ────────────────────────
print("\n=== 国际复材 → pcb ===")
# pcb/upstream max_x=2550，新增 x=2700
upsert_node("pcb", "glass_guoji", "国际复材", "upstream",
            x=2700, y=0,
            stocks=["301526"], group_name="电子玻纤布",
            desc="电子级玻璃纤维/复合材料，覆铜板核心原材料",
            icon="🧵", ticker="301526", market="CN")
upsert_edge("pcb", "e-guoji-shengyi", "glass_guoji", "ccl_shengyi", "upstream", "供应玻纤布")
upsert_edge("pcb", "e-guoji-huazheng", "glass_guoji", "ccl_huazheng", "upstream", "供应玻纤布")
add_industry_id("301526", "pcb")

# ─── 12. 隆扬电子（301389）→ semieq / upstream  电磁屏蔽材料 ──────────────────
print("\n=== 隆扬电子 → semieq ===")
# semieq/upstream 精密零部件组，追加 x=4220
upsert_node("semieq", "se_longyang", "隆扬电子", "upstream",
            x=4220, y=0,
            stocks=["301389"], group_name="精密零部件",
            desc="电磁屏蔽材料/绝缘材料，半导体设备精密零件及屏蔽组件",
            icon="🛡️", ticker="301389", market="CN")
upsert_edge("semieq", "e-longyang-beifang", "se_longyang", "se_beifang", "upstream→core", "屏蔽材料")
add_industry_id("301389", "semieq")

# ─── 13. 鼎通科技（688668）→ pcb / core  连接器/HDI ──────────────────────────
print("\n=== 鼎通科技 → pcb ===")
# pcb/core 查看
rows = cur.execute("SELECT node_id, label, x, group_name FROM industry_node WHERE industry_id='pcb' AND layer='core' ORDER BY x").fetchall()
print("  pcb/core 现有:", rows)
row = cur.execute("SELECT MAX(x) FROM industry_node WHERE industry_id='pcb' AND layer='core'").fetchone()
max_x = row[0] or 0
upsert_node("pcb", "pcb_dingtong", "鼎通科技", "core",
            x=max_x + 300, y=210,
            stocks=["688668"], group_name="HDI高密互联",
            desc="高密度互联PCB（HDI）/连接器，AI服务器高频高速PCB",
            icon="🔌", ticker="688668", market="CN")
# 找到core层已有的节点建立连接
core_nodes = cur.execute("SELECT node_id FROM industry_node WHERE industry_id='pcb' AND layer='core' AND node_id != 'pcb_dingtong' LIMIT 2").fetchall()
for n in core_nodes:
    upsert_edge("pcb", f"e-dingtong-{n[0][-5:]}", "pcb_dingtong", n[0], "core", "HDI协作")
add_industry_id("688668", "pcb")

# ─── 14. 罗博特科（300757）→ semieq / core  半导体自动化设备 ──────────────────
print("\n=== 罗博特科 → semieq ===")
row = cur.execute("SELECT MAX(x) FROM industry_node WHERE industry_id='semieq' AND layer='core'").fetchone()
max_x = row[0]
upsert_node("semieq", "se_luobote", "罗博特科", "core",
            x=max_x + 200, y=210,
            stocks=["300757"], group_name="刻蚀/薄膜设备",
            desc="半导体自动化设备/搬运机器人，晶圆传片/自动化物流系统",
            icon="🤖", ticker="300757", market="CN")
upsert_edge("semieq", "e-luobote-beifang", "se_luobote", "se_beifang", "core", "自动化配套")
add_industry_id("300757", "semieq")

conn.commit()

# 更新 company_count
print("\n=== 更新 company_count ===")
for iid in ["idc", "liquidcool", "optics", "semieq", "memory", "aiserver", "aipower", "pcb"]:
    update_company_count(iid)

conn.commit()
conn.close()
print("\n全部完成！")
