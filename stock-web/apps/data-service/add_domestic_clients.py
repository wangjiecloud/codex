#!/usr/bin/env python3
"""
为 PCB 产业链终端应用层添加国内代表性企业
"""

import sqlite3
import json
from datetime import datetime

DB_PATH = "stock_data.db"


def add_domestic_clients():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    print("开始添加国内终端客户企业...\n")

    # 定义新增节点（L4 应用层，y=840）
    # 重新调整 x 坐标分布：将所有节点均匀分布在 100-1800
    nodes = [
        # AI算力分组
        {
            "node_id": "client_alibaba",
            "label": "阿里云",
            "x": 100,
            "group": "AI算力",
            "desc": "阿里巴巴云计算，AI服务器、智算中心PCB大规模采购",
            "icon": "☁️",
            "stocks": [],
        },
        {
            "node_id": "client_nvidia",
            "label": "英伟达",
            "x": 300,
            "group": "AI算力",
            "desc": "全球AI芯片领导者，GPU服务器PCB最大需求方",
            "icon": "🔲",
            "stocks": [],
        },
        {
            "node_id": "client_tencent",
            "label": "腾讯云",
            "x": 500,
            "group": "AI算力",
            "desc": "腾讯云计算，AI服务器、游戏服务器PCB需求",
            "icon": "☁️",
            "stocks": [],
        },
        {
            "node_id": "client_baidu",
            "label": "百度",
            "x": 700,
            "group": "AI算力",
            "desc": "百度智能云、文心一言，AI芯片及服务器PCB需求",
            "icon": "🤖",
            "stocks": [],
        },
        # 通信/智能手机分组
        {
            "node_id": "client_huawei",
            "label": "华为",
            "x": 900,
            "group": "通信/智能手机",
            "desc": "通信设备/智能手机/服务器PCB需求",
            "icon": "📡",
            "stocks": [],
        },
        {
            "node_id": "client_xiaomi",
            "label": "小米",
            "x": 1100,
            "group": "通信/智能手机",
            "desc": "智能手机、IoT设备、智能家居PCB需求",
            "icon": "📱",
            "stocks": [],
        },
        {
            "node_id": "client_oppo",
            "label": "OPPO",
            "x": 1300,
            "group": "通信/智能手机",
            "desc": "智能手机、可穿戴设备PCB需求",
            "icon": "📱",
            "stocks": [],
        },
        # 新能源汽车分组
        {
            "node_id": "client_byd",
            "label": "比亚迪",
            "x": 1500,
            "group": "新能源汽车",
            "desc": "新能源汽车电子、智能驾驶PCB需求",
            "icon": "🚗",
            "stocks": ["002594"],
        },
        {
            "node_id": "client_li",
            "label": "理想汽车",
            "x": 1700,
            "group": "新能源汽车",
            "desc": "增程式电动车、智能座舱PCB需求",
            "icon": "🚗",
            "stocks": [],
        },
    ]

    # 1. 删除旧的英伟达节点（会重新添加）
    print("[1/4] 删除旧节点...")
    c.execute(
        "DELETE FROM industry_node WHERE industry_id = ? AND node_id = ?",
        ("pcb", "nvidia_pcb"),
    )
    print("  ✓ 已删除旧的英伟达节点")

    # 2. 删除华为旧节点（会重新添加到新位置）
    c.execute(
        "DELETE FROM industry_node WHERE industry_id = ? AND node_id = ?",
        ("pcb", "huawei_pcb"),
    )
    print("  ✓ 已删除旧的华为节点")

    # 3. 添加所有新节点
    print("\n[2/4] 添加新节点...")
    for node in nodes:
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
                840,
                node["label"],
                node["icon"],
                node["desc"],
                "application",
                node["stocks"][0] if node["stocks"] else None,
                "A股" if node["stocks"] else "海外",
                node["group"],
                json.dumps(node["stocks"]),
            ),
        )
        stock_info = f"({node['stocks'][0]})" if node["stocks"] else "(海外)"
        print(
            f"  ✓ 已添加: {node['label']:12} {stock_info:10} x={node['x']}, 分组={node['group']}"
        )

    # 4. 更新连接边（从组装厂到终端客户）
    print("\n[3/4] 添加新的连接边...")

    # 删除旧的边
    old_edges = [
        "e-pcb-fx-nv",
        "e-pcb-fx-hw",
        "e-pcb-sy-hw",
        "e-pcb-goer-hw",
        "e-pcb-xin-nv",
        "e-pcb-pd-goer",
    ]
    for edge_id in old_edges:
        c.execute(
            "DELETE FROM industry_edge WHERE industry_id = ? AND edge_id = ?",
            ("pcb", edge_id),
        )

    # 添加新边
    new_edges = [
        # 工业富联 → AI算力客户
        (
            "e-assy-fx-ali",
            "assy_fuxin",
            "client_alibaba",
            "downstream",
            "AI服务器组装交付",
        ),
        ("e-assy-fx-nv", "assy_fuxin", "client_nvidia", "downstream", "GPU服务器交付"),
        (
            "e-assy-fx-tc",
            "assy_fuxin",
            "client_tencent",
            "downstream",
            "AI服务器组装交付",
        ),
        (
            "e-assy-fx-bd",
            "assy_fuxin",
            "client_baidu",
            "downstream",
            "AI服务器组装交付",
        ),
        # 立讯精密/歌尔股份 → 手机客户
        (
            "e-assy-lx-hw",
            "assy_luxshare",
            "client_huawei",
            "downstream",
            "手机精密组装",
        ),
        (
            "e-assy-lx-mi",
            "assy_luxshare",
            "client_xiaomi",
            "downstream",
            "手机/IoT组装",
        ),
        ("e-assy-ge-op", "assy_goer", "client_oppo", "downstream", "手机精密组装"),
        # 工业富联 → 汽车客户
        ("e-assy-fx-byd", "assy_fuxin", "client_byd", "downstream", "汽车电子组装"),
        ("e-assy-fx-li", "assy_fuxin", "client_li", "downstream", "汽车电子组装"),
    ]

    for edge_id, source, target, layer, label in new_edges:
        c.execute(
            """
            INSERT INTO industry_edge (industry_id, edge_id, source, target, layer, label)
            VALUES (?, ?, ?, ?, ?, ?)
        """,
            ("pcb", edge_id, source, target, layer, label),
        )
        print(f"  ✓ 已添加边: {source} → {target} ({label})")

    # 5. 添加比亚迪股票信息（如果不存在）
    print("\n[4/4] 检查并添加股票信息...")
    c.execute("SELECT code FROM stock_meta WHERE code = ?", ("002594",))
    if not c.fetchone():
        c.execute(
            """
            INSERT INTO stock_meta (code, name, market, industry_ids, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """,
            (
                "002594",
                "比亚迪",
                "深交所",
                json.dumps(["pcb"]),
                datetime.now().isoformat(),
            ),
        )

        c.execute(
            """
            INSERT INTO stock_quote (code, name, price, change, change_amt, open, prev_close,
                                    high, low, volume, turnover, market_cap, pe, pb,
                                    turnover_rate, amplitude, updated_at)
            VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?)
        """,
            ("002594", "比亚迪", datetime.now().isoformat()),
        )

        print("  ✓ 已添加 002594 比亚迪")
    else:
        # 更新 industry_ids
        c.execute("SELECT industry_ids FROM stock_meta WHERE code = ?", ("002594",))
        ids_json = c.fetchone()[0]
        industries = json.loads(ids_json) if ids_json else []
        if "pcb" not in industries:
            industries.append("pcb")
            c.execute(
                "UPDATE stock_meta SET industry_ids = ? WHERE code = ?",
                (json.dumps(industries), "002594"),
            )
            print("  ✓ 已更新 002594 比亚迪的产业标签")
        else:
            print("  ✓ 002594 比亚迪已存在")

    conn.commit()
    conn.close()

    print("\n✅ 添加完成！")
    print("\n摘要:")
    print("  • 新增节点: 9 个（含重新布局的英伟达和华为）")
    print("  • AI算力: 阿里云、英伟达、腾讯云、百度")
    print("  • 通信/手机: 华为、小米、OPPO")
    print("  • 新能源车: 比亚迪、理想汽车")
    print("  • 新增边: 9 条")


if __name__ == "__main__":
    add_domestic_clients()
