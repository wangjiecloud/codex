"""
重建 glasssub（玻璃基板）产业链图谱
保留现有节点，追加10家核心企业的缺失节点，并重新分布坐标
"""
import sqlite3
import json
from datetime import datetime

DB_PATH = "apps/data-service/stock_data.db"

# 新增节点定义
# 层级分配: upstream(y=0), core(y=210), downstream(y=420), application(y=630)
NEW_NODES = [
    # === upstream 层 - 玻璃基板设备/材料 ===
    {
        "node_id": "gs_up_jiejia",
        "label": "捷佳伟创",
        "layer": "upstream",
        "x": 1800,
        "y": 0,
        "ticker": "300724",
        "market": "sz",
        "group_name": "玻璃基板制造装备",
        "desc": "光伏/半导体设备，跨界玻璃基板制造装备",
        "icon": "🔧",
        "stocks": ["300724"],
    },
    # === core 层 - 核心制造 ===
    {
        "node_id": "gs_core_jdf",
        "label": "京东方A",
        "layer": "core",
        "x": 250,
        "y": 210,
        "ticker": "000725",
        "market": "sz",
        "group_name": "面板/显示玻璃",
        "desc": "面板巨头，玻璃基板封装与显示应用",
        "icon": "📺",
        "stocks": ["000725"],
    },
    {
        "node_id": "gs_core_shuijing",
        "label": "水晶光电",
        "layer": "core",
        "x": 550,
        "y": 210,
        "ticker": "002273",
        "market": "sz",
        "group_name": "光学薄膜玻璃",
        "desc": "光学薄膜与玻璃加工，AR/VR光学元件",
        "icon": "💎",
        "stocks": ["002273"],
    },
    {
        "node_id": "gs_core_lante",
        "label": "蓝特光学",
        "layer": "core",
        "x": 850,
        "y": 210,
        "ticker": "688127",
        "market": "sh",
        "group_name": "光学薄膜玻璃",
        "desc": "高折射率光学玻璃基材，精密光学元件",
        "icon": "🔭",
        "stocks": ["688127"],
    },
    {
        "node_id": "gs_core_laibao",
        "label": "莱宝高科",
        "layer": "core",
        "x": 1150,
        "y": 210,
        "ticker": "002106",
        "market": "sz",
        "group_name": "面板/显示玻璃",
        "desc": "触控显示玻璃加工，ITO导电玻璃",
        "icon": "📱",
        "stocks": ["002106"],
    },
    {
        "node_id": "gs_core_hongli",
        "label": "鸿利智汇",
        "layer": "core",
        "x": 1450,
        "y": 210,
        "ticker": "300219",
        "market": "sz",
        "group_name": "MiniLED封装",
        "desc": "MiniLED玻璃基封装，背光模组应用",
        "icon": "💡",
        "stocks": ["300219"],
    },
    # === downstream 层 - 封装应用 ===
    {
        "node_id": "gs_dn_jingfang",
        "label": "晶方科技",
        "layer": "downstream",
        "x": 350,
        "y": 420,
        "ticker": "603005",
        "market": "sh",
        "group_name": "玻璃通孔封装",
        "desc": "WLCSP/TSV/玻璃通孔（TGV）封装",
        "icon": "🔬",
        "stocks": ["603005"],
    },
    {
        "node_id": "gs_dn_saiwei",
        "label": "赛微电子",
        "layer": "downstream",
        "x": 800,
        "y": 420,
        "ticker": "300456",
        "market": "sz",
        "group_name": "玻璃通孔封装",
        "desc": "MEMS代工/TGV（Through Glass Via玻璃通孔）",
        "icon": "⚡",
        "stocks": ["300456"],
    },
    {
        "node_id": "gs_dn_tongfu",
        "label": "通富微电",
        "layer": "downstream",
        "x": 1250,
        "y": 420,
        "ticker": "002156",
        "market": "sz",
        "group_name": "先进封装",
        "desc": "Chiplet先进封装，玻璃基板封装应用",
        "icon": "🏭",
        "stocks": ["002156"],
    },
]

# 新增边定义
NEW_EDGES = [
    # 捷佳伟创(upstream) → 沃格光电(core)
    {"edge_id": "e-jiejia-woge", "source": "gs_up_jiejia", "target": "gs_core_woge", "layer": "upstream", "label": "设备供应"},
    # 捷佳伟创(upstream) → 凯盛科技(core)
    {"edge_id": "e-jiejia-kaisheng", "source": "gs_up_jiejia", "target": "gs_core_kaisheng", "layer": "upstream", "label": "设备供应"},
    # 洛阳玻璃(upstream) → 京东方A(core)
    {"edge_id": "e-luoyang-jdf", "source": "gs_up_luoyang", "target": "gs_core_jdf", "layer": "upstream", "label": "玻璃原料"},
    # 金晶科技(upstream) → 蓝特光学(core)
    {"edge_id": "e-jinjing-lante", "source": "gs_up_jinjing", "target": "gs_core_lante", "layer": "upstream", "label": "光学玻璃原料"},
    # 水晶光电(core) → 晶方科技(downstream)
    {"edge_id": "e-shuijing-jingfang", "source": "gs_core_shuijing", "target": "gs_dn_jingfang", "layer": "core", "label": "光学玻璃基材"},
    # 三环集团(core) → 赛微电子(downstream)
    {"edge_id": "e-sanhuan-saiwei", "source": "gs_core_sanhuan", "target": "gs_dn_saiwei", "layer": "core", "label": "陶瓷/玻璃封装基材"},
    # 兴森科技(core) → 通富微电(downstream)
    {"edge_id": "e-xinsen-tongfu", "source": "gs_core_xinsen", "target": "gs_dn_tongfu", "layer": "core", "label": "封装基板"},
    # 晶方科技(downstream) → 英特尔(application)
    {"edge_id": "e-jingfang-intel", "source": "gs_dn_jingfang", "target": "gs_app_intel", "layer": "downstream", "label": "TGV封装交付"},
    # 赛微电子(downstream) → 英伟达(application)
    {"edge_id": "e-saiwei-nvda", "source": "gs_dn_saiwei", "target": "gs_app_nvda", "layer": "downstream", "label": "MEMS/TGV封装"},
    # 通富微电(downstream) → 英伟达(application)
    {"edge_id": "e-tongfu-nvda", "source": "gs_dn_tongfu", "target": "gs_app_nvda", "layer": "downstream", "label": "Chiplet封装"},
    # 京东方A(core) → 英特尔(application)
    {"edge_id": "e-jdf-intel", "source": "gs_core_jdf", "target": "gs_app_intel", "layer": "core", "label": "玻璃基板显示"},
    # 鸿利智汇(core) → 英伟达(application)
    {"edge_id": "e-hongli-nvda", "source": "gs_core_hongli", "target": "gs_app_nvda", "layer": "core", "label": "MiniLED背光模组"},
]

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()

    # 重新分布现有 upstream 节点的 x 坐标（加入捷佳伟创后共7个节点）
    upstream_existing = [
        "gs_up_zhongcai",
        "gs_up_luoyang",
        "gs_up_corning",
        "gs_up_xinyuanwei",
        "gs_up_jianghua",
        "gs_up_jinjing",
    ]
    total_up = len(upstream_existing) + 1  # +捷佳伟创
    x_step = 1700 // (total_up - 1)
    for i, nid in enumerate(upstream_existing):
        new_x = 100 + i * x_step
        cursor.execute("UPDATE industry_node SET x=? WHERE industry_id='glasssub' AND node_id=?", (new_x, nid))
    print(f"upstream 现有 {len(upstream_existing)} 节点 x 坐标已重新分布，间距={x_step}")

    # 重新分布现有 core 节点的 x 坐标（加入6个新节点后共12个）
    core_existing = [
        "gs_core_woge",
        "gs_core_kaisheng",
        "gs_core_sanhuan",
        "gs_core_zhongci",
        "gs_core_huatian",
        "gs_core_xinsen",
    ]
    # 新增6个core节点: jdf, shuijing, lante, laibao, hongli + 保留现有6个 = 共12
    # 将现有6个均匀分布在右半部分 (x=950-1800)
    total_core = len(core_existing)
    x_start_existing = 950
    x_step_exist = (1800 - x_start_existing) // (total_core - 1)
    for i, nid in enumerate(core_existing):
        new_x = x_start_existing + i * x_step_exist
        cursor.execute("UPDATE industry_node SET x=? WHERE industry_id='glasssub' AND node_id=?", (new_x, nid))
    print(f"core 现有 {len(core_existing)} 节点 x 坐标已重新分布")

    # 重新分布现有 downstream 节点 x 坐标（新增3个后共7个）
    downstream_existing = [
        "gs_dn_shennan",
        "gs_dn_kangxi",
        "gs_dn_jinggong",
        "gs_dn_lens",
    ]
    # 分布在右半部分 (x=900-1800)
    x_start_dn = 900
    x_step_dn = (1800 - x_start_dn) // (len(downstream_existing) - 1)
    for i, nid in enumerate(downstream_existing):
        new_x = x_start_dn + i * x_step_dn
        cursor.execute("UPDATE industry_node SET x=? WHERE industry_id='glasssub' AND node_id=?", (new_x, nid))
    print(f"downstream 现有 {len(downstream_existing)} 节点 x 坐标已重新分布")

    conn.commit()

    # 插入新节点
    inserted_nodes = 0
    for node in NEW_NODES:
        cursor.execute("SELECT node_id FROM industry_node WHERE industry_id='glasssub' AND node_id=?", (node["node_id"],))
        if cursor.fetchone():
            print(f"  节点 {node['node_id']} ({node['label']}) 已存在，跳过")
            continue
        cursor.execute("""
            INSERT INTO industry_node
            (industry_id, node_id, x, y, label, icon, desc, layer, ticker, market, group_name, stocks, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            "glasssub",
            node["node_id"],
            node["x"],
            node["y"],
            node["label"],
            node.get("icon", ""),
            node.get("desc", ""),
            node["layer"],
            node["ticker"],
            node["market"],
            node.get("group_name", ""),
            json.dumps(node.get("stocks", [])),
            now,
        ))
        inserted_nodes += 1
        print(f"  新增节点: {node['node_id']} ({node['label']}) layer={node['layer']} x={node['x']}")

    conn.commit()

    # 插入新边
    inserted_edges = 0
    for edge in NEW_EDGES:
        cursor.execute("SELECT edge_id FROM industry_edge WHERE industry_id='glasssub' AND edge_id=?", (edge["edge_id"],))
        if cursor.fetchone():
            continue
        cursor.execute("""
            INSERT INTO industry_edge (industry_id, edge_id, source, target, layer, label, updated_at)
            VALUES (?,?,?,?,?,?,?)
        """, ("glasssub", edge["edge_id"], edge["source"], edge["target"], edge.get("layer", ""), edge.get("label", ""), now))
        inserted_edges += 1

    conn.commit()
    print(f"\n新增节点: {inserted_nodes}, 新增边: {inserted_edges}")

    # 统计 glasssub A股公司数量
    cursor.execute("""
        SELECT DISTINCT json_each.value
        FROM industry_node, json_each(industry_node.stocks)
        WHERE industry_node.industry_id = 'glasssub'
    """)
    all_stocks = [r[0] for r in cursor.fetchall()]
    a_stocks = [s for s in all_stocks if s and (s.startswith('0') or s.startswith('3') or s.startswith('6'))]
    company_count = len(set(a_stocks))
    print(f"\nglasssub A股数量: {company_count}")
    print(f"A股列表: {sorted(set(a_stocks))}")

    cursor.execute("""
        UPDATE industry_list SET company_count=?, last_analyzed=?
        WHERE industry_id='glasssub'
    """, (company_count, datetime.utcnow().isoformat()))
    conn.commit()
    print(f"industry_list.company_count 已更新为 {company_count}")

    # 验证：列出所有节点
    print("\n=== 最终节点列表 ===")
    cursor.execute("""
        SELECT node_id, label, layer, x, y, stocks
        FROM industry_node WHERE industry_id='glasssub'
        ORDER BY layer, x
    """)
    nodes = cursor.fetchall()
    print(f"总节点数: {len(nodes)}")
    for n in nodes:
        print(f"  {n[2]:12} x={n[3]:4} {n[1]} stocks={n[5]}")

    conn.close()

if __name__ == "__main__":
    main()
