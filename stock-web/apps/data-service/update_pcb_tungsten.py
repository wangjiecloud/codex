#!/usr/bin/env python3
"""
更新 PCB 产业链：
1. 将钻针节点从 L0 移到 L1
2. L0 新增钨粉节点（4家企业）
3. 更新相关边连接
"""

import sqlite3
import json
from datetime import datetime

DB_PATH = "stock_data.db"


def update_pcb_industry():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    print("开始更新 PCB 产业链...")

    # === 1. 添加缺失的江钨装备股票 ===
    print("\n[1/6] 检查并添加江钨装备...")
    c.execute("SELECT code FROM stock_meta WHERE code = ?", ("300689",))
    if not c.fetchone():
        c.execute(
            """
            INSERT INTO stock_meta (code, name, market, industry_ids, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """,
            (
                "300689",
                "江钨装备",
                "深交所",
                json.dumps(["pcb"]),
                datetime.now().isoformat(),
            ),
        )

        # 添加行情缓存默认值
        c.execute(
            """
            INSERT INTO stock_quote (code, name, price, change, change_amt, open, prev_close, 
                                    high, low, volume, turnover, market_cap, pe, pb, 
                                    turnover_rate, amplitude, updated_at)
            VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?)
        """,
            ("300689", "江钨装备", datetime.now().isoformat()),
        )

        print("  ✓ 已添加 300689 江钨装备")
    else:
        print("  ✓ 300689 江钨装备已存在")

    # === 2. 删除旧的钻针节点（L0） ===
    print("\n[2/6] 删除旧的钻针节点...")
    old_drill_nodes = ["drill_zhongwu", "drill_dingtai"]
    for node_id in old_drill_nodes:
        c.execute(
            "DELETE FROM industry_node WHERE industry_id = ? AND node_id = ?",
            ("pcb", node_id),
        )
        print(f"  ✓ 已删除节点: {node_id}")

    # === 3. 在 L1 (core layer y=210) 添加钻针节点 ===
    print("\n[3/6] 在 L1 添加 PCB钻针/钨材料节点...")

    # 重新计算 L1 的 x 坐标分布（原来有3个CCL节点，现在要加2个钻针节点，总共5个）
    # 原始CCL节点：生益科技(400), 华正新材(850), 南亚新材(1300)
    # 新的分布：均匀分布5个节点在 100-1800
    l1_positions = [
        (100, "ccl_shengyi", "生益科技", "FR4/高速CCL", ["600183"]),
        (525, "ccl_huazheng", "华正新材", "FR4/高速CCL", ["603186"]),
        (950, "ccl_nanya", "南亚新材", "高频高速CCL", ["688519"]),
        (1375, "drill_zhongwu", "中钨高新", "PCB钻针/钨材料", ["000657"]),
        (1800, "drill_dingtai", "鼎泰高科", "PCB钻针/钨材料", ["300407"]),
    ]

    # 更新 CCL 节点的 x 坐标
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (100, "pcb", "ccl_shengyi"),
    )
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (525, "pcb", "ccl_huazheng"),
    )
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (950, "pcb", "ccl_nanya"),
    )

    # 添加钻针节点到 L1
    drill_nodes_l1 = [
        {
            "node_id": "drill_zhongwu",
            "label": "中钨高新",
            "layer": "core",
            "x": 1375,
            "y": 210,
            "stocks": ["000657"],
            "group_name": "PCB钻针/钨材料",
            "desc": "精密钨材钻针制造，PCB微孔加工核心材料",
            "icon": "⚙️",
            "ticker": "000657",
            "market": "深A",
        },
        {
            "node_id": "drill_dingtai",
            "label": "鼎泰高科",
            "layer": "core",
            "x": 1800,
            "y": 210,
            "stocks": ["300407"],
            "group_name": "PCB钻针/钨材料",
            "desc": "超小径钻针，高密度PCB微孔加工",
            "icon": "⚙️",
            "ticker": "300407",
            "market": "深A",
        },
    ]

    for node in drill_nodes_l1:
        c.execute(
            """
            INSERT INTO industry_node 
            (industry_id, node_id, x, y, label, icon, desc, layer, ticker, market, group_name, stocks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                "pcb",
                node["node_id"],
                node["x"],
                node["y"],
                node["label"],
                node["icon"],
                node["desc"],
                node["layer"],
                node["ticker"],
                node["market"],
                node["group_name"],
                json.dumps(node["stocks"]),
            ),
        )
        print(f"  ✓ 已添加 L1 节点: {node['label']} (x={node['x']})")

    # === 4. 在 L0 (upstream layer y=0) 添加钨粉节点 ===
    print("\n[4/6] 在 L0 添加钨粉节点...")

    # 原 L0 有 15 个节点，现在要加 4 个钨粉节点，重新分布在 100-1800
    # 简化处理：在原有基础上，将钨粉节点插入到合适位置
    tungsten_nodes = [
        {
            "node_id": "tungsten_xiamen",
            "label": "厦门钨业",
            "x": 100,
            "stocks": ["600549"],
            "desc": "钨粉末、碳化钨粉，钻针材料供应",
        },
        {
            "node_id": "tungsten_zhangyuan",
            "label": "章源钨业",
            "x": 250,
            "stocks": ["002378"],
            "desc": "钨精矿、钨粉末，硬质合金原料",
        },
        {
            "node_id": "tungsten_xianglu",
            "label": "翔鹭钨业",
            "x": 400,
            "stocks": ["002842"],
            "desc": "超细钨粉、碳化钨粉末",
        },
        {
            "node_id": "tungsten_jiangwu",
            "label": "江钨装备",
            "x": 550,
            "stocks": ["300689"],
            "desc": "钨材料加工装备、硬质合金刀具",
        },
    ]

    # 先更新现有 L0 节点的 x 坐标（向右移动，为钨粉腾出空间）
    # 玻纤布节点
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (700, "pcb", "glass_fiber_jushi"),
    )
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (825, "pcb", "glass_fiber_honghe"),
    )
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (950, "pcb", "glass_fiber_zhongcai"),
    )

    # 铜箔节点
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (1075, "pcb", "copper_foil_tongguang"),
    )
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (1200, "pcb", "copper_foil_defude"),
    )
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (1325, "pcb", "copper_foil_nuode"),
    )

    # 树脂节点
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (1450, "pcb", "resin_dongcai"),
    )
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (1575, "pcb", "resin_shengquan"),
    )
    c.execute(
        "UPDATE industry_node SET x = ? WHERE industry_id = ? AND node_id = ?",
        (1700, "pcb", "resin_hongchang"),
    )

    # 其他材料节点 - 保持在右侧
    # silica_lianrui, wet_chem_tiancheng, dry_film_guanghua, equip_dazu 保持不变或微调

    # 添加钨粉节点
    for node in tungsten_nodes:
        c.execute(
            """
            INSERT INTO industry_node 
            (industry_id, node_id, x, y, label, icon, desc, layer, ticker, market, group_name, stocks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                "pcb",
                node["node_id"],
                node["x"],
                0,
                node["label"],
                "⚒️",
                node["desc"],
                "upstream",
                node["stocks"][0],
                "A股",
                "钨粉/钨材料",
                json.dumps(node["stocks"]),
            ),
        )
        print(f"  ✓ 已添加 L0 节点: {node['label']} (x={node['x']})")

    # === 5. 删除旧的钻针相关边 ===
    print("\n[5/6] 删除旧的钻针边...")
    old_drill_edges = [
        "e-pcb-dr-zw-ao",
        "e-pcb-dr-dt-hd",
        "e-pcb-dr-dt-pd",
        "e-pcb-dr-zw-hd",
        "e-pcb-dr-zw-sn",
    ]
    for edge_id in old_drill_edges:
        c.execute(
            "DELETE FROM industry_edge WHERE industry_id = ? AND edge_id = ?",
            ("pcb", edge_id),
        )
        print(f"  ✓ 已删除边: {edge_id}")

    # === 6. 添加新的边连接 ===
    print("\n[6/6] 添加新的边连接...")

    new_edges = [
        # 钨粉 -> 钻针 (L0 -> L1)
        {
            "edge_id": "e-tungsten-xm-zw",
            "source": "tungsten_xiamen",
            "target": "drill_zhongwu",
            "layer": "upstream",
            "label": "钨粉末",
        },
        {
            "edge_id": "e-tungsten-zy-zw",
            "source": "tungsten_zhangyuan",
            "target": "drill_zhongwu",
            "layer": "upstream",
            "label": "钨精矿",
        },
        {
            "edge_id": "e-tungsten-xl-dt",
            "source": "tungsten_xianglu",
            "target": "drill_dingtai",
            "layer": "upstream",
            "label": "超细钨粉",
        },
        {
            "edge_id": "e-tungsten-jw-dt",
            "source": "tungsten_jiangwu",
            "target": "drill_dingtai",
            "layer": "upstream",
            "label": "硬质合金",
        },
        # 钻针 -> PCB 制造商 (L1 -> L2)
        {
            "edge_id": "e-drill-zw-hd",
            "source": "drill_zhongwu",
            "target": "pcb_hudian",
            "layer": "core",
            "label": "精密钻针",
        },
        {
            "edge_id": "e-drill-zw-sn",
            "source": "drill_zhongwu",
            "target": "pcb_shennan",
            "layer": "core",
            "label": "钻针",
        },
        {
            "edge_id": "e-drill-zw-ao",
            "source": "drill_zhongwu",
            "target": "pcb_aoshikang",
            "layer": "core",
            "label": "钻针",
        },
        {
            "edge_id": "e-drill-dt-hd",
            "source": "drill_dingtai",
            "target": "pcb_hudian",
            "layer": "core",
            "label": "超小径钻针",
        },
        {
            "edge_id": "e-drill-dt-pd",
            "source": "drill_dingtai",
            "target": "pcb_pengding",
            "layer": "core",
            "label": "微孔钻针",
        },
    ]

    for edge in new_edges:
        c.execute(
            """
            INSERT INTO industry_edge (industry_id, edge_id, source, target, layer, label)
            VALUES (?, ?, ?, ?, ?, ?)
        """,
            (
                "pcb",
                edge["edge_id"],
                edge["source"],
                edge["target"],
                edge["layer"],
                edge["label"],
            ),
        )
        print(f"  ✓ 已添加边: {edge['source']} -> {edge['target']} ({edge['label']})")

    # === 7. 更新 industry_ids ===
    print("\n[7/6] 更新股票的 industry_ids...")
    tungsten_codes = ["600549", "002378", "002842", "300689", "000657", "300407"]
    for code in tungsten_codes:
        c.execute("SELECT industry_ids FROM stock_meta WHERE code = ?", (code,))
        row = c.fetchone()
        if row:
            industries = json.loads(row[0]) if row[0] else []
            if "pcb" not in industries:
                industries.append("pcb")
                c.execute(
                    "UPDATE stock_meta SET industry_ids = ? WHERE code = ?",
                    (json.dumps(industries), code),
                )
                print(f"  ✓ 已更新 {code} 的产业链标签")

    # === 8. 更新 industry_list 的 company_count ===
    print("\n[8/6] 更新产业链公司数量...")
    c.execute("""
        SELECT COUNT(DISTINCT json_each.value) 
        FROM industry_node, json_each(industry_node.stocks)
        WHERE industry_id = 'pcb' AND json_each.value LIKE '0%' OR json_each.value LIKE '3%' OR json_each.value LIKE '6%'
    """)
    count = c.fetchone()[0]
    c.execute(
        "UPDATE industry_list SET company_count = ? WHERE industry_id = ?",
        (count, "pcb"),
    )
    print(f"  ✓ PCB 产业 A 股数量: {count}")

    conn.commit()
    conn.close()

    print("\n✅ PCB 产业链更新完成！")
    print("\n修改摘要:")
    print("  • 在 L1 添加了 PCB钻针/钨材料 分组（中钨高新、鼎泰高科）")
    print("  • 在 L0 添加了 钨粉/钨材料 分组（厦门钨业、章源钨业、翔鹭钨业、江钨装备）")
    print("  • 更新了供应链连接关系：钨粉 → 钻针 → PCB制造商")
    print("  • 重新调整了各层节点的 x 坐标分布")


if __name__ == "__main__":
    update_pcb_industry()
