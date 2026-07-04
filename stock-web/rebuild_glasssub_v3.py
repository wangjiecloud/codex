"""
glasssub 产业图谱完整重建脚本 v3
按图中4层次重新设计，清除旧节点和边，全量重建

层级映射（按图中业务流：材料→设备→基板制造→封测）:
  upstream     (y=0)   : 03 上游材料 - 彩虹股份/戈碧迦/石英股份/菲利华/阿石创/天承科技
  downstream   (y=210) : 02 上游设备 - 帝尔激光/德龙激光/盛美上海/芯碁微装/汇成真空/精测电子
  core         (y=420) : 01 中游制造 - 京东方A/沃格光电/蓝思科技/五方光电
  application  (y=630) : 04 下游封测 - 长电科技/通富微电/晶方科技
"""
import sqlite3
import json
from datetime import datetime

DB_PATH = "apps/data-service/stock_data.db"

# ===================== 全量节点定义 =====================
NODES = [
    # ---- upstream (y=0): 上游材料 ----
    {
        "node_id": "gs_mat_caihong",
        "label": "彩虹股份",
        "layer": "upstream", "x": 100, "y": 0,
        "ticker": "600707", "market": "sh",
        "group_name": "高世代玻璃基板",
        "desc": "高世代显示基板龙头，G8.5+/G10.5全世代量产，8寸半导体基板完成封测厂送样验证",
        "icon": "🔴", "stocks": ["600707"],
    },
    {
        "node_id": "gs_mat_gobija",
        "label": "戈碧迦",
        "layer": "upstream", "x": 383, "y": 0,
        "ticker": "835438", "market": "bj",
        "group_name": "光学玻璃原片",
        "desc": "原片国产先锋，北交所唯一明确有玻璃基板业务的公司，玻璃载板已过多家知名半导体厂商验证",
        "icon": "🟡", "stocks": [],  # 北交所，baostock不支持
    },
    {
        "node_id": "gs_mat_shiyinggu",
        "label": "石英股份",
        "layer": "upstream", "x": 666, "y": 0,
        "ticker": "603688", "market": "sh",
        "group_name": "高纯石英砂",
        "desc": "国内唯一实现6N高纯石英砂量产的企业，可用于玻璃基板生产",
        "icon": "💎", "stocks": ["603688"],
    },
    {
        "node_id": "gs_mat_feilihua",
        "label": "菲利华",
        "layer": "upstream", "x": 949, "y": 0,
        "ticker": "300395", "market": "sz",
        "group_name": "光掩膜基板",
        "desc": "光掩膜基板是光刻环节的'底片'，光掩膜基板精密加工部分产品规格已通过客户验证",
        "icon": "🔵", "stocks": ["300395"],
    },
    {
        "node_id": "gs_mat_ashichuang",
        "label": "阿石创",
        "layer": "upstream", "x": 1232, "y": 0,
        "ticker": "300706", "market": "sz",
        "group_name": "TGV靶材",
        "desc": "铝钪合金靶材在玻璃基板电极层的镀膜应用最为核心，TGV工艺靶材用量是传统方案的3-5倍",
        "icon": "⚙️", "stocks": ["300706"],
    },
    {
        "node_id": "gs_mat_tiancheng",
        "label": "天承科技",
        "layer": "upstream", "x": 1515, "y": 0,
        "ticker": "688603", "market": "sh",
        "group_name": "TGV电镀液",
        "desc": "TGV填孔电镀液，TGV先进封装电镀添加剂已小批量出货，在京东方等核心客户处验证",
        "icon": "🧪", "stocks": ["688603"],
    },

    # ---- downstream (y=210): 上游设备 ----
    {
        "node_id": "gs_eq_dier",
        "label": "帝尔激光",
        "layer": "downstream", "x": 100, "y": 210,
        "ticker": "300776", "market": "sz",
        "group_name": "TGV激光钻孔",
        "desc": "TGV激光微孔设备龙头，国内市占率约40%-60%，已实现晶圆级和面板级封装激光技术全覆盖",
        "icon": "⚡", "stocks": ["300776"],
    },
    {
        "node_id": "gs_eq_delong",
        "label": "德龙激光",
        "layer": "downstream", "x": 440, "y": 210,
        "ticker": "688170", "market": "sh",
        "group_name": "TGV激光切割",
        "desc": "TGV激光隐形切割龙头，国内TGV激光隐形切割龙头，成功切入全球供应链",
        "icon": "✂️", "stocks": ["688170"],
    },
    {
        "node_id": "gs_eq_shengmei",
        "label": "盛美上海",
        "layer": "downstream", "x": 780, "y": 210,
        "ticker": "688082", "market": "sh",
        "group_name": "电镀/清洗设备",
        "desc": "面板级电镀/清洗，推出面板级电镀、负压清洗和边缘刻蚀设备，兼容玻璃基板",
        "icon": "🏭", "stocks": ["688082"],
    },
    {
        "node_id": "gs_eq_xinjizhuang",
        "label": "芯碁微装",
        "layer": "downstream", "x": 1120, "y": 210,
        "ticker": "688630", "market": "sh",
        "group_name": "直写光刻设备",
        "desc": "泛半导体直写光刻设备，支持玻璃基板面板级封装",
        "icon": "🔬", "stocks": ["688630"],
    },
    {
        "node_id": "gs_eq_huicheng",
        "label": "汇成真空",
        "layer": "downstream", "x": 1460, "y": 210,
        "ticker": "301392", "market": "sz",
        "group_name": "PVD镀膜设备",
        "desc": "PVD镀膜设备，PVD设备价值量占整线投入约40%；已对接京东方、云天半导体等头部企业",
        "icon": "💫", "stocks": ["301392"],
    },
    {
        "node_id": "gs_eq_jingce",
        "label": "精测电子",
        "layer": "downstream", "x": 1800, "y": 210,
        "ticker": "300567", "market": "sz",
        "group_name": "TGV检测设备",
        "desc": "TGV AOI量检测设备",
        "icon": "🔭", "stocks": ["300567"],
    },

    # ---- core (y=420): 中游制造（基板制造与TGV深加工）----
    {
        "node_id": "gs_core_jdf",
        "label": "京东方A",
        "layer": "core", "x": 100, "y": 420,
        "ticker": "000725", "market": "sz",
        "group_name": "面板级玻璃基板",
        "desc": "2026H1板级玻璃基封装载板试验线全自动化通线，与康宁签署三年合作备忘录",
        "icon": "📺", "stocks": ["000725"],
    },
    {
        "node_id": "gs_core_woge",
        "label": "沃格光电",
        "layer": "core", "x": 650, "y": 420,
        "ticker": "603773", "market": "sh",
        "group_name": "TGV全制程",
        "desc": "TGV全制程核心龙头，全球少数掌握TGV全制程并量产的企业之一，武汉10万㎡/年产线已投产",
        "icon": "🌟", "stocks": ["603773"],
    },
    {
        "node_id": "gs_core_lens",
        "label": "蓝思科技",
        "layer": "core", "x": 1150, "y": 420,
        "ticker": "300433", "market": "sz",
        "group_name": "TGV标准制定",
        "desc": "TGV标准制定者，作为主要起草单位参与《3D封装玻璃通孔(TGV)工艺技术规范》团体标准制定",
        "icon": "📋", "stocks": ["300433"],
    },
    {
        "node_id": "gs_core_wufang",
        "label": "五方光电",
        "layer": "core", "x": 1650, "y": 420,
        "ticker": "002962", "market": "sz",
        "group_name": "TGV批量交付",
        "desc": "具备TGV批量交付能力，适配1.6T/3.2T CPO低损耗需求",
        "icon": "📦", "stocks": ["002962"],
    },

    # ---- application (y=630): 下游封测 ----
    {
        "node_id": "gs_app_changdian",
        "label": "长电科技",
        "layer": "application", "x": 300, "y": 630,
        "ticker": "600584", "market": "sh",
        "group_name": "TGV封测",
        "desc": "全球封测龙头，TGV射频IPD工艺验证完成，玻璃基板封装项目预计2026年量产",
        "icon": "🏆", "stocks": ["600584"],
    },
    {
        "node_id": "gs_app_tongfu",
        "label": "通富微电",
        "layer": "application", "x": 900, "y": 630,
        "ticker": "002156", "market": "sz",
        "group_name": "TGV封测",
        "desc": "国内封测龙头，具备使用TGV玻璃基板进行封装的技术能力",
        "icon": "🥈", "stocks": ["002156"],
    },
    {
        "node_id": "gs_app_jingfang",
        "label": "晶方科技",
        "layer": "application", "x": 1500, "y": 630,
        "ticker": "603005", "market": "sh",
        "group_name": "TGV封测",
        "desc": "传感芯片封装，深耕传感器封装，布局玻璃基板封装",
        "icon": "🔬", "stocks": ["603005"],
    },
]

# ===================== 边定义 =====================
EDGES = [
    # 上游材料 → 上游设备
    {"edge_id": "e-caihong-dier", "source": "gs_mat_caihong", "target": "gs_eq_dier", "layer": "upstream", "label": "玻璃基板原片"},
    {"edge_id": "e-caihong-delong", "source": "gs_mat_caihong", "target": "gs_eq_delong", "layer": "upstream", "label": "玻璃基板原片"},
    {"edge_id": "e-ashichuang-shengmei", "source": "gs_mat_ashichuang", "target": "gs_eq_shengmei", "layer": "upstream", "label": "TGV靶材"},
    {"edge_id": "e-tiancheng-shengmei", "source": "gs_mat_tiancheng", "target": "gs_eq_shengmei", "layer": "upstream", "label": "电镀液"},
    {"edge_id": "e-feilihua-xinjizhuang", "source": "gs_mat_feilihua", "target": "gs_eq_xinjizhuang", "layer": "upstream", "label": "光掩膜基板"},
    {"edge_id": "e-ashichuang-huicheng", "source": "gs_mat_ashichuang", "target": "gs_eq_huicheng", "layer": "upstream", "label": "靶材"},

    # 上游设备 → 中游制造
    {"edge_id": "e-dier-jdf", "source": "gs_eq_dier", "target": "gs_core_jdf", "layer": "downstream", "label": "TGV激光钻孔"},
    {"edge_id": "e-dier-woge", "source": "gs_eq_dier", "target": "gs_core_woge", "layer": "downstream", "label": "TGV激光钻孔"},
    {"edge_id": "e-delong-woge", "source": "gs_eq_delong", "target": "gs_core_woge", "layer": "downstream", "label": "TGV激光切割"},
    {"edge_id": "e-shengmei-jdf", "source": "gs_eq_shengmei", "target": "gs_core_jdf", "layer": "downstream", "label": "电镀/清洗"},
    {"edge_id": "e-shengmei-woge", "source": "gs_eq_shengmei", "target": "gs_core_woge", "layer": "downstream", "label": "电镀/清洗"},
    {"edge_id": "e-huicheng-woge", "source": "gs_eq_huicheng", "target": "gs_core_woge", "layer": "downstream", "label": "PVD镀膜"},
    {"edge_id": "e-huicheng-jdf", "source": "gs_eq_huicheng", "target": "gs_core_jdf", "layer": "downstream", "label": "PVD镀膜"},
    {"edge_id": "e-jingce-woge", "source": "gs_eq_jingce", "target": "gs_core_woge", "layer": "downstream", "label": "AOI检测"},

    # 中游制造 → 下游封测
    {"edge_id": "e-woge-changdian", "source": "gs_core_woge", "target": "gs_app_changdian", "layer": "core", "label": "TGV玻璃基板"},
    {"edge_id": "e-woge-tongfu", "source": "gs_core_woge", "target": "gs_app_tongfu", "layer": "core", "label": "TGV玻璃基板"},
    {"edge_id": "e-jdf-changdian", "source": "gs_core_jdf", "target": "gs_app_changdian", "layer": "core", "label": "玻璃基封装载板"},
    {"edge_id": "e-lens-jingfang", "source": "gs_core_lens", "target": "gs_app_jingfang", "layer": "core", "label": "TGV加工"},
    {"edge_id": "e-wufang-tongfu", "source": "gs_core_wufang", "target": "gs_app_tongfu", "layer": "core", "label": "CPO光模块基板"},
]


def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    # 1. 清除旧的所有节点和边
    cursor.execute("DELETE FROM industry_node WHERE industry_id='glasssub'")
    cursor.execute("DELETE FROM industry_edge WHERE industry_id='glasssub'")
    conn.commit()
    print("已清除旧节点和边")

    # 2. 插入新节点
    for node in NODES:
        cursor.execute("""
            INSERT INTO industry_node
            (industry_id, node_id, x, y, label, icon, desc, layer, ticker, market, group_name, stocks, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            "glasssub", node["node_id"], node["x"], node["y"],
            node["label"], node.get("icon", ""), node.get("desc", ""),
            node["layer"], node["ticker"], node["market"],
            node.get("group_name", ""),
            json.dumps(node.get("stocks", [])), now,
        ))
    conn.commit()
    print(f"已插入 {len(NODES)} 个节点")

    # 3. 插入新边
    for edge in EDGES:
        cursor.execute("""
            INSERT INTO industry_edge (industry_id, edge_id, source, target, layer, label, updated_at)
            VALUES (?,?,?,?,?,?,?)
        """, ("glasssub", edge["edge_id"], edge["source"], edge["target"],
              edge.get("layer", ""), edge.get("label", ""), now))
    conn.commit()
    print(f"已插入 {len(EDGES)} 条边")

    # 4. 统计 A股数量并更新 industry_list
    cursor.execute("""
        SELECT DISTINCT json_each.value
        FROM industry_node, json_each(industry_node.stocks)
        WHERE industry_node.industry_id = 'glasssub'
    """)
    all_stocks = [r[0] for r in cursor.fetchall()]
    a_stocks = [s for s in all_stocks if s and (s.startswith('0') or s.startswith('3') or s.startswith('6'))]
    company_count = len(set(a_stocks))

    cursor.execute("""
        UPDATE industry_list
        SET company_count=?, description=?, last_analyzed=?
        WHERE industry_id='glasssub'
    """, (
        company_count,
        "玻璃基板先进封装产业链：上游高纯材料/TGV靶材/电镀液→激光/电镀/光刻/镀膜/检测设备→中游TGV全制程基板制造→下游先进封装量产，是AI芯片Chiplet/3D封装的关键基础材料赛道",
        now
    ))
    conn.commit()

    # 5. 验证
    print(f"\n=== 验证 ===")
    cursor.execute("SELECT layer, COUNT(*) FROM industry_node WHERE industry_id='glasssub' GROUP BY layer")
    for row in cursor.fetchall():
        print(f"  {row[0]:12}: {row[1]} 个节点")
    print(f"A股企业数: {company_count} ({sorted(set(a_stocks))})")

    # 打印节点清单
    print("\n=== 节点清单 ===")
    cursor.execute("SELECT node_id, label, layer, x, y FROM industry_node WHERE industry_id='glasssub' ORDER BY y, x")
    for r in cursor.fetchall():
        print(f"  {r[2]:12} x={r[3]:4} {r[1]}")

    conn.close()

if __name__ == "__main__":
    main()
