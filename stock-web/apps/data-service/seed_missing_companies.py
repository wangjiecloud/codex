"""
补充14家有数据但无产业归属的企业（排除飞龙股份/利通电子待确认）
- 12家确认归属：紫光股份、东山精密、铭普光磁、伊戈尔、天通股份、国电南瑞、四方股份、中国西电、华勤技术、彤程新材、数据港、嘉元科技
- 操作：写 industry_node、industry_edge、更新 stock_meta.industry_ids、更新 industry_list.company_count
"""
import sqlite3
import json
from datetime import datetime

DB = "apps/data-service/stock_data.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()

NOW = datetime.now().isoformat()


def get_industry_ids(code):
    row = cur.execute("SELECT industry_ids FROM stock_meta WHERE code=?", (code,)).fetchone()
    if row:
        return json.loads(row[0]) if row[0] else []
    return []


def add_industry_id(code, iid):
    ids = get_industry_ids(code)
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
    print(f"  [edge] 新增 {edge_id}: {source} → {target}")


def update_company_count(industry_id):
    """重新统计 A 股数量"""
    rows = cur.execute("SELECT stocks FROM industry_node WHERE industry_id=?", (industry_id,)).fetchall()
    codes = set()
    for (s,) in rows:
        lst = json.loads(s) if s else []
        for c in lst:
            # A股判断
            if c and (c.startswith('0') or c.startswith('3') or c.startswith('6')):
                codes.add(c)
    count = len(codes)
    cur.execute("UPDATE industry_list SET company_count=? WHERE industry_id=?", (count, industry_id))
    print(f"  [count] {industry_id} company_count = {count}")
    return count


# ─── 1. 东山精密（002384）→ optics / upstream  磁性件/精密结构件 ───────────────
print("\n=== 东山精密 → optics ===")
upsert_node("optics", "opt_dongshan", "东山精密", "upstream",
            x=1200, y=0,
            stocks=["002384"], group_name="精密结构件",
            desc="光模块精密结构件/金属外壳制造",
            icon="🔩", ticker="002384", market="CN")
upsert_edge("optics", "e-dongshan-accelink", "opt_dongshan", "opt_accelink", "upstream→core", "供应精密件")
upsert_edge("optics", "e-dongshan-innolight", "opt_dongshan", "opt_innolight", "upstream→downstream", "供应精密件")
add_industry_id("002384", "optics")

# ─── 2. 铭普光磁（002902）→ optics / upstream  磁性元件 ────────────────────────
print("\n=== 铭普光磁 → optics ===")
upsert_node("optics", "opt_mingpu", "铭普光磁", "upstream",
            x=1450, y=0,
            stocks=["002902"], group_name="磁性元件",
            desc="光模块配套磁性元件/网络变压器",
            icon="🧲", ticker="002902", market="CN")
upsert_edge("optics", "e-mingpu-accelink", "opt_mingpu", "opt_accelink", "upstream→core", "供应磁性件")
upsert_edge("optics", "e-mingpu-innolight", "opt_mingpu", "opt_innolight", "upstream→downstream", "供应磁性件")
add_industry_id("002902", "optics")

# ─── 3. 天通股份（600330）→ optics / upstream  铁氧体磁性材料 ──────────────────
print("\n=== 天通股份 → optics ===")
upsert_node("optics", "opt_tiantong", "天通股份", "upstream",
            x=1650, y=0,
            stocks=["600330"], group_name="磁性元件",
            desc="铁氧体磁芯/磁性材料，用于光模块电源及信号隔离",
            icon="🧲", ticker="600330", market="CN")
upsert_edge("optics", "e-tiantong-mingpu", "opt_tiantong", "opt_mingpu", "upstream", "铁氧体材料")
add_industry_id("600330", "optics")

# ─── 4. 伊戈尔（002922）→ aipower / core  变压器/电感 ────────────────────────
print("\n=== 伊戈尔 → aipower ===")
# aipower/core 当前4个节点(x=200/550/900/1250)，新增x=1600
upsert_node("aipower", "pw_yige", "伊戈尔", "core",
            x=1600, y=210,
            stocks=["002922"], group_name="服务器电源/PSU",
            desc="AI服务器专用变压器/电感，服务器电源核心磁性元件",
            icon="⚡", ticker="002922", market="CN")
upsert_edge("aipower", "e-yige-maige", "pw_yige", "pw_maige", "core", "配套电源")
upsert_edge("aipower", "e-yangjie-yige", "pw_yangjie", "pw_yige", "upstream→core", "功率器件")
add_industry_id("002922", "aipower")

# ─── 5. 国电南瑞（600406）→ aipower / downstream  电力自动化/配电 ──────────────
print("\n=== 国电南瑞 → aipower ===")
# aipower/downstream 当前3个节点(x=200/550/900)，新增x=1250/1600
upsert_node("aipower", "pw_guodian", "国电南瑞", "downstream",
            x=1250, y=420,
            stocks=["600406"], group_name="高压配电/变电",
            desc="电力自动化/继电保护/智慧变电站，大型AI数据中心配电系统",
            icon="⚡", ticker="600406", market="CN")
upsert_edge("aipower", "e-tebian-guodian", "pw_tebian", "pw_guodian", "downstream", "配电协同")
upsert_edge("aipower", "e-guodian-idc", "pw_guodian", "pw_idc", "downstream→application", "供配电")
add_industry_id("600406", "aipower")

# ─── 6. 四方股份（601126）→ aipower / downstream  继电保护 ───────────────────
print("\n=== 四方股份 → aipower ===")
upsert_node("aipower", "pw_sifang", "四方股份", "downstream",
            x=1600, y=420,
            stocks=["601126"], group_name="高压配电/变电",
            desc="继电保护/电力自动化，AI数据中心变电站配电方案",
            icon="⚡", ticker="601126", market="CN")
upsert_edge("aipower", "e-sifang-idc", "pw_sifang", "pw_idc", "downstream→application", "继电保护")
add_industry_id("601126", "aipower")

# ─── 7. 中国西电（601179）→ aipower / downstream  高压配电 ───────────────────
print("\n=== 中国西电 → aipower ===")
upsert_node("aipower", "pw_xidian", "中国西电", "downstream",
            x=1800, y=420,
            stocks=["601179"], group_name="高压配电/变电",
            desc="高压/特高压开关设备，大型数据中心变电站供配电",
            icon="⚡", ticker="601179", market="CN")
upsert_edge("aipower", "e-xidian-idc", "pw_xidian", "pw_idc", "downstream→application", "高压配电")
add_industry_id("601179", "aipower")

# ─── 8. 紫光股份（000938）→ aiserver / downstream  企业网络 ──────────────────
print("\n=== 紫光股份 → aiserver ===")
# aiserver/downstream 当前5个节点(x=200/650/1100/1550/1800)，新增 x=2100
upsert_node("aiserver", "as_unisplendour", "紫光股份", "downstream",
            x=2100, y=420,
            stocks=["000938"], group_name="品牌整机/集成",
            desc="新华三（H3C）母公司，AI服务器/网络设备/云基础设施整体解决方案",
            icon="🖥️", ticker="000938", market="CN")
upsert_edge("aiserver", "e-inspur-unisplendour", "as_inspur", "as_unisplendour", "core→downstream", "算力解决方案")
add_industry_id("000938", "aiserver")

# ─── 9. 华勤技术（603296）→ aiserver / core  ODM代工 ────────────────────────
print("\n=== 华勤技术 → aiserver ===")
# aiserver/core 当前5个节点(x=200/550/900/1250/1600)，新增 x=1950
upsert_node("aiserver", "as_huaqin", "华勤技术", "core",
            x=1950, y=210,
            stocks=["603296"], group_name="AI服务器ODM",
            desc="AI服务器/边缘计算服务器ODM代工，拥有完整服务器设计制造能力",
            icon="🖥️", ticker="603296", market="CN")
upsert_edge("aiserver", "e-huaqin-unisplendour", "as_huaqin", "as_unisplendour", "core→downstream", "ODM制造")
upsert_edge("aiserver", "e-huaqin-h3c", "as_huaqin", "as_h3c", "core→downstream", "ODM制造")
add_industry_id("603296", "aiserver")

# ─── 10. 彤程新材（603650）→ semieq / upstream  光刻胶树脂 ──────────────────
print("\n=== 彤程新材 → semieq ===")
# semieq/upstream 光刻胶材料组最大x=2950，新增 x=3100
upsert_node("semieq", "se_tongcheng", "彤程新材", "upstream",
            x=3100, y=0,
            stocks=["603650"], group_name="光刻胶材料",
            desc="光刻胶核心原材料酚醛树脂/光敏树脂，国产光刻胶重要上游",
            icon="🧪", ticker="603650", market="CN")
upsert_edge("semieq", "e-tongcheng-feike", "se_tongcheng", "se_feike", "upstream", "供应树脂原料")
upsert_edge("semieq", "e-tongcheng-jingrui", "se_tongcheng", "se_jingrui", "upstream", "供应树脂原料")
add_industry_id("603650", "semieq")

# ─── 11. 数据港（603881）→ idc / downstream  IDC运营 ─────────────────────────
print("\n=== 数据港 → idc ===")
# idc/downstream 当前4个节点(x=100/667/1233/1800)，已满
# 注意：idc_runze已是润泽科技，idc_wanguo是万国数据
# 新增 x=2000（超出范围？用1000居中）→ 重新看，范围100-1800，已有4个均匀分布
# 增加第5个时重新分布: 100, 475, 850, 1225, 1600
# 但不修改已有节点坐标，直接追加 x=2100
upsert_node("idc", "idc_sjg", "数据港", "downstream",
            x=2100, y=420,
            stocks=["603881"], group_name="IDC运营商",
            desc="上海大型IDC运营商，专注长三角AI数据中心建设与运营",
            icon="🏢", ticker="603881", market="CN")
upsert_edge("idc", "e-keshida-sjg", "idc_keshida", "idc_sjg", "core→downstream", "配电/UPS")
upsert_edge("idc", "e-yingweike-sjg", "idc_yingweike", "idc_sjg", "core→downstream", "温控")
add_industry_id("603881", "idc")

# ─── 12. 嘉元科技（688388）→ pcb  已有节点，仅更新 industry_ids ─────────────
print("\n=== 嘉元科技 → pcb ===")
add_industry_id("688388", "pcb")

conn.commit()

# 更新各产业 company_count
print("\n=== 更新 company_count ===")
for iid in ["optics", "aipower", "aiserver", "semieq", "idc", "pcb"]:
    update_company_count(iid)

conn.commit()
conn.close()
print("\n全部完成！")
