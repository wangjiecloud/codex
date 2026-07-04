"""
Seed script: 写入人形机器人(humanoid) 和 商业航天(aerospace) 两个新产业。
tab = "new_economy"（新经济赛道）
Run: python seed_humanoid_aerospace.py
"""

import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from db import (
    SessionLocal,
    engine,
    Base,
    IndustryList,
    IndustryMeta,
    IndustryNode,
    IndustryEdge,
    StockMeta,
    StockQuote,
)

Base.metadata.create_all(bind=engine)
db = SessionLocal()
NOW = datetime.utcnow()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
def upsert_list(row: dict):
    stmt = sqlite_insert(IndustryList).values(**row)
    stmt = stmt.on_conflict_do_update(
        index_elements=["industry_id"],
        set_={k: stmt.excluded[k] for k in row if k != "industry_id"},
    )
    db.execute(stmt)


def upsert_meta(row: dict):
    stmt = sqlite_insert(IndustryMeta).values(**row)
    stmt = stmt.on_conflict_do_update(
        index_elements=["industry_id"],
        set_={k: stmt.excluded[k] for k in row if k != "industry_id"},
    )
    db.execute(stmt)


def upsert_node(row: dict):
    stmt = sqlite_insert(IndustryNode).values(**row)
    stmt = stmt.on_conflict_do_update(
        index_elements=["industry_id", "node_id"],
        set_={k: stmt.excluded[k] for k in row if k not in ("industry_id", "node_id")},
    )
    db.execute(stmt)


def upsert_edge(row: dict):
    stmt = sqlite_insert(IndustryEdge).values(**row)
    stmt = stmt.on_conflict_do_update(
        index_elements=["industry_id", "edge_id"],
        set_={k: stmt.excluded[k] for k in row if k not in ("industry_id", "edge_id")},
    )
    db.execute(stmt)


def upsert_stock(code: str, name: str, market: str, industry_ids: list):
    stmt = sqlite_insert(StockMeta).values(
        code=code,
        name=name,
        market=market,
        industry_ids=json.dumps(industry_ids, ensure_ascii=False),
        updated_at=NOW,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["code"],
        set_={
            "name": stmt.excluded.name,
            "market": stmt.excluded.market,
            "industry_ids": stmt.excluded.industry_ids,
            "updated_at": stmt.excluded.updated_at,
        },
    )
    db.execute(stmt)


def upsert_quote(code: str):
    stmt = sqlite_insert(StockQuote).values(
        code=code,
        name="",
        price=0.0,
        change=0.0,
        change_amt=0.0,
        open=0.0,
        prev_close=0.0,
        high=0.0,
        low=0.0,
        volume=0,
        turnover=0.0,
        market_cap=0.0,
        pe=0.0,
        pb=0.0,
        turnover_rate=0.0,
        amplitude=0.0,
        updated_at=None,
    )
    stmt = stmt.on_conflict_do_nothing(index_elements=["code"])
    db.execute(stmt)


# ============================================================================
# 15. humanoid — 人形机器人
# ============================================================================
HUMANOID_STOCKS = [
    # 执行器/减速器
    ("300699", "光峰科技", "A股"),   # 伺服电机
    ("603025", "大豪科技", "A股"),   # 运动控制
    ("002527", "新时达", "A股"),     # 伺服+运控
    ("300890", "翔宇医疗", "A股"),   # 康复机器人/执行器
    # 关键零部件 — 减速器
    ("002772", "苏试试验", "A股"),
    ("300816", "力源信息", "A股"),
    ("688187", "时代电气", "A股"),
    # 关键零部件 — 丝杆/传感器
    ("002938", "鹏鼎控股", "A股"),   # FPC
    ("688516", "奥比中光", "A股"),   # 3D视觉传感器
    ("688232", "新龙科技", "A股"),   # 行星滚柱丝杆
    ("301175", "中科视拓", "A股"),   # 视觉AI
    # 本体/整机
    ("300024", "机器人", "A股"),     # 工业机器人本体
    ("688229", "航天软件", "A股"),
    ("688256", "寒武纪", "A股"),     # AI芯片/脑控
    # 下游应用
    ("002376", "众源新材", "A股"),
    ("603912", "佳力图", "A股"),
    ("002553", "天鹅股份", "A股"),
    # 人工智能/软件
    ("688041", "海光信息", "A股"),
    ("688169", "石头科技", "A股"),   # 家用机器人
    ("002961", "瑞达期货", "A股"),
]

for code, name, mkt in HUMANOID_STOCKS:
    upsert_stock(code, name, mkt, ["humanoid"])
    upsert_quote(code)

upsert_list(
    dict(
        industry_id="humanoid",
        name="人形机器人",
        sort_order=15,
        description="覆盖执行器/减速器/丝杆/传感器/本体及AI大脑全链路，特斯拉Optimus/小米CyberOne等引领需求",
        icon="🤖",
        company_count=len(HUMANOID_STOCKS),
        last_analyzed="2026-07-02",
        representatives=json.dumps(["机器人", "新时达", "奥比中光", "寒武纪"], ensure_ascii=False),
        updated_at=NOW,
        tab="humanoid",
    )
)

upsert_meta(
    dict(
        industry_id="humanoid",
        sort_order=15,
        title="人形机器人产业链",
        subtitle="从核心零部件到整机本体，国产替代加速",
        layer_labels=json.dumps(["上游材料/传感器", "核心零部件", "本体集成", "下游应用"], ensure_ascii=False),
        updated_at=NOW,
    )
)

# 节点：layer分布 upstream/core/downstream/application
# y: L0=0, L1=210, L2=420, L3=630
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in [
    # ── upstream (L0) ──
    ("rare_earth", 150, 0, "稀土磁材", "🧲",
     "钕铁硼永磁，驱动电机核心材料", "upstream", "000831", "A股",
     ["000831"]),
    ("fpc_board", 400, 0, "FPC柔性板", "📟",
     "机器人关节FPC信号传输", "upstream", "002938", "A股",
     ["002938"]),
    ("sensor_3d", 650, 0, "3D视觉传感器", "👁️",
     "深度摄像头/ToF传感器，环境感知", "upstream", "688516", "A股",
     ["688516"]),
    ("servo_chip", 900, 0, "伺服芯片/AI芯片", "🔮",
     "运动控制MCU与AI推理芯片", "upstream", "688256", "A股",
     ["688256", "688041"]),
    ("special_steel", 1150, 0, "特种钢/铝合金", "⚙️",
     "关节壳体/骨架高强度材料", "upstream", "600516", "A股",
     ["600516"]),
    ("actuator_mat", 1400, 0, "PEEK/碳纤维", "🔩",
     "轻量化结构件复合材料", "upstream", "603899", "A股",
     ["603899"]),
    # ── core (L1) ──
    ("harmonic_reducer", 150, 210, "谐波减速器", "⚙️",
     "关节核心，精密传动，RV/谐波路线并行", "core", "300699", "A股",
     ["300699", "300816"]),
    ("ballscrew", 450, 210, "行星滚柱丝杆", "🔩",
     "线性执行器核心，替代电动推缸", "core", "688232", "A股",
     ["688232"]),
    ("servo_motor", 750, 210, "伺服电机/BLDC", "🔋",
     "直驱/外转子无框电机，高转矩密度", "core", "002527", "A股",
     ["002527", "603025"]),
    ("force_sensor", 1050, 210, "六维力矩传感器", "📡",
     "关节力控反馈，柔顺操作核心", "core", "688516", "A股",
     ["688516"]),
    ("motion_ctrl", 1350, 210, "运动控制器", "🖥️",
     "多轴协调控制，实时EtherCAT总线", "core", "002527", "A股",
     ["002527", "603025"]),
    # ── downstream (L2) ──
    ("robot_body", 200, 420, "人形机器人本体", "🤖",
     "整机集成，特斯拉Optimus/宇树/小米", "downstream", "300024", "A股",
     ["300024"]),
    ("ai_brain", 550, 420, "具身智能大脑", "🧠",
     "端到端强化学习，机器人操作系统", "downstream", "688256", "A股",
     ["688256", "688041"]),
    ("home_robot", 900, 420, "家用服务机器人", "🏠",
     "家庭清洁/护理/陪伴场景", "downstream", "688169", "A股",
     ["688169"]),
    ("ind_robot", 1250, 420, "工业协作机器人", "🏭",
     "汽车/3C工厂柔性产线", "downstream", "300024", "A股",
     ["300024"]),
    # ── application (L3) ──
    ("tesla_opt", 300, 630, "特斯拉Optimus", "🚀",
     "全球量产人形机器人标杆，年产目标百万台", "application", "TSLA", "美股",
     []),
    ("xiaomi_cyber", 750, 630, "小米CyberOne", "📱",
     "国内消费级人形机器人，生态闭环", "application", "01810", "港股",
     []),
    ("unitree", 1200, 630, "宇树科技", "🦿",
     "四足+人形双线，B系列出货放量", "application", "未上市", "未上市",
     []),
]:
    upsert_node(
        dict(
            industry_id="humanoid",
            node_id=nid,
            x=x,
            y=y,
            label=label,
            icon=icon,
            desc=desc,
            layer=layer,
            ticker=ticker,
            market=market,
            stocks=json.dumps(stocks),
            updated_at=NOW,
        )
    )

for eid, src, tgt, lbl in [
    ("e-hm-re-hm", "rare_earth", "servo_motor", "永磁材料"),
    ("e-hm-fpc-mc", "fpc_board", "motion_ctrl", "信号传输"),
    ("e-hm-s3d-ai", "sensor_3d", "ai_brain", "感知输入"),
    ("e-hm-sc-mc", "servo_chip", "motion_ctrl", "控制芯片"),
    ("e-hm-sc-ai", "servo_chip", "ai_brain", "AI推理"),
    ("e-hm-st-hr", "special_steel", "robot_body", "骨架材料"),
    ("e-hm-am-rb", "actuator_mat", "robot_body", "轻量化"),
    ("e-hm-hr-rb", "harmonic_reducer", "robot_body", "关节传动"),
    ("e-hm-bs-rb", "ballscrew", "robot_body", "线性执行"),
    ("e-hm-sm-hr", "servo_motor", "harmonic_reducer", "驱动"),
    ("e-hm-sm-bs", "servo_motor", "ballscrew", "驱动"),
    ("e-hm-fs-mc", "force_sensor", "motion_ctrl", "力反馈"),
    ("e-hm-mc-rb", "motion_ctrl", "robot_body", "控制集成"),
    ("e-hm-rb-ai", "robot_body", "ai_brain", "端到端训练"),
    ("e-hm-rb-hr2", "robot_body", "home_robot", "本体→家用"),
    ("e-hm-rb-ir", "robot_body", "ind_robot", "本体→工业"),
    ("e-hm-ai-home", "ai_brain", "home_robot", "智能决策"),
    ("e-hm-ai-ind", "ai_brain", "ind_robot", "工业AI"),
    ("e-hm-home-ts", "home_robot", "tesla_opt", "消费场景"),
    ("e-hm-ind-ts", "ind_robot", "tesla_opt", "工业场景"),
    ("e-hm-home-xm", "home_robot", "xiaomi_cyber", "国内市场"),
    ("e-hm-rb-ut", "robot_body", "unitree", "整机出货"),
]:
    upsert_edge(
        dict(
            industry_id="humanoid",
            edge_id=eid,
            source=src,
            target=tgt,
            layer="",
            label=lbl,
            updated_at=NOW,
        )
    )


# ============================================================================
# 16. aerospace — 商业航天
# ============================================================================
AEROSPACE_STOCKS = [
    # 运载火箭/发射
    ("600879", "航天电子", "A股"),
    ("002025", "航天电器", "A股"),
    ("600677", "航天通信", "A股"),
    ("688403", "汇成真空", "A股"),
    # 卫星整星/平台
    ("600350", "山东高速", "A股"),
    ("002308", "威创股份", "A股"),
    ("688366", "昊海生科", "A股"),
    # 卫星载荷/通信
    ("688568", "中科星图", "A股"),
    ("002621", "超图软件", "A股"),
    ("688108", "赛诺威盛", "A股"),
    # 地面系统/终端
    ("002544", "中航电测", "A股"),
    ("000738", "航发控制", "A股"),
    ("688665", "四方精创", "A股"),
    # 卫星应用/数据
    ("002497", "雅化集团", "A股"),   # 高能固体推进剂
    ("300151", "昌红科技", "A股"),   # 密封结构件
    ("300017", "网宿科技", "A股"),   # CDN/卫星互联网
    ("000547", "航天有色", "A股"),
    ("688138", "清越科技", "A股"),
    ("603912", "佳力图", "A股"),
    ("688303", "大全能源", "A股"),
]

for code, name, mkt in AEROSPACE_STOCKS:
    upsert_stock(code, name, mkt, ["aerospace"])
    upsert_quote(code)

upsert_list(
    dict(
        industry_id="aerospace",
        name="商业航天",
        sort_order=16,
        description="覆盖火箭发射/卫星平台/载荷通信/地面应用全链，星链低轨互联网驱动商业化加速",
        icon="🚀",
        company_count=len(AEROSPACE_STOCKS),
        last_analyzed="2026-07-02",
        representatives=json.dumps(["航天电子", "中科星图", "超图软件", "航天电器"], ensure_ascii=False),
        updated_at=NOW,
        tab="aerospace",
    )
)

upsert_meta(
    dict(
        industry_id="aerospace",
        sort_order=16,
        title="商业航天产业链",
        subtitle="从火箭发射到卫星应用，国产商业航天加速崛起",
        layer_labels=json.dumps(["上游材料/零部件", "运载火箭", "卫星平台/载荷", "地面终端/应用"], ensure_ascii=False),
        updated_at=NOW,
    )
)

for nid, x, y, label, icon, desc, layer, ticker, market, stocks in [
    # ── upstream (L0) ──
    ("propellant", 150, 0, "固体推进剂", "🔥",
     "高能固体燃料，固体火箭核心", "upstream", "002497", "A股",
     ["002497"]),
    ("carbon_fiber", 400, 0, "碳纤维/复材", "🧵",
     "火箭壳体/整流罩轻量化结构件", "upstream", "600516", "A股",
     ["600516"]),
    ("special_alloy", 650, 0, "特种合金/钛", "⚙️",
     "发动机耐高温材料，钛合金零件", "upstream", "000547", "A股",
     ["000547"]),
    ("seal_part", 900, 0, "密封结构件", "🔩",
     "火箭密封/压力容器精密零件", "upstream", "300151", "A股",
     ["300151"]),
    ("elec_comp", 1150, 0, "宇航级电子元件", "📟",
     "抗辐射芯片/连接器/传感器", "upstream", "002025", "A股",
     ["002025", "600879"]),
    ("solar_cell", 1400, 0, "卫星太阳能电池", "🌞",
     "三结GaAs高效太阳电池", "upstream", "688303", "A股",
     ["688303"]),
    # ── core (L1) ──
    ("rocket_engine", 200, 210, "液体火箭发动机", "🔥",
     "可重复使用液氧甲烷/煤油发动机", "core", "600879", "A股",
     ["600879"]),
    ("solid_rocket", 550, 210, "固体运载火箭", "🚀",
     "快响应固体火箭，小型商业发射", "core", "600677", "A股",
     ["600677"]),
    ("launch_platform", 900, 210, "发射测控系统", "📡",
     "地面测控/遥测/发射指挥系统", "core", "600879", "A股",
     ["600879", "002544"]),
    ("vacuum_equip", 1250, 210, "真空镀膜装备", "🔬",
     "卫星光学载荷薄膜镀制设备", "core", "688403", "A股",
     ["688403"]),
    # ── downstream (L2) ──
    ("leo_sat", 200, 420, "低轨通信卫星", "🛰️",
     "星座组网，宽带互联网，Ku/Ka频段", "downstream", "600879", "A股",
     ["600879"]),
    ("eo_sat", 550, 420, "遥感/光学卫星", "🌍",
     "SAR/光学多谱段，商业遥感", "downstream", "688568", "A股",
     ["688568"]),
    ("nav_sat", 900, 420, "导航增强卫星", "📍",
     "北斗增强/精密定位服务", "downstream", "002025", "A股",
     ["002025"]),
    ("sat_comms", 1250, 420, "卫星通信终端", "📻",
     "相控阵天线/星载收发模组", "downstream", "002544", "A股",
     ["002544", "002025"]),
    # ── application (L3) ──
    ("gis_app", 200, 630, "遥感GIS应用", "🗺️",
     "卫星图像解译/地理信息服务", "application", "688568", "A股",
     ["688568", "002621"]),
    ("satnet_app", 600, 630, "卫星互联网", "🌐",
     "低轨宽带互联网接入，替代光纤盲区", "application", "300017", "A股",
     ["300017"]),
    ("spacex_sl", 1050, 630, "SpaceX星链", "🌟",
     "全球最大低轨星座，6000+颗在轨", "application", "SpaceX", "未上市",
     []),
    ("landspace", 1450, 630, "蓝箭/星河动力", "🚀",
     "国内商业火箭头部企业，朱雀系列", "application", "未上市", "未上市",
     []),
]:
    upsert_node(
        dict(
            industry_id="aerospace",
            node_id=nid,
            x=x,
            y=y,
            label=label,
            icon=icon,
            desc=desc,
            layer=layer,
            ticker=ticker,
            market=market,
            stocks=json.dumps(stocks),
            updated_at=NOW,
        )
    )

for eid, src, tgt, lbl in [
    ("e-as-prop-re", "propellant", "solid_rocket", "固体推进剂"),
    ("e-as-cf-re", "carbon_fiber", "rocket_engine", "复材壳体"),
    ("e-as-cf-sr", "carbon_fiber", "solid_rocket", "整流罩"),
    ("e-as-sa-re", "special_alloy", "rocket_engine", "耐高温材料"),
    ("e-as-seal-re", "seal_part", "rocket_engine", "密封件"),
    ("e-as-ec-sat", "elec_comp", "leo_sat", "星载电子"),
    ("e-as-ec-nav", "elec_comp", "nav_sat", "星载电子"),
    ("e-as-solar-leo", "solar_cell", "leo_sat", "太阳电池"),
    ("e-as-solar-eo", "solar_cell", "eo_sat", "太阳电池"),
    ("e-as-re-lp", "rocket_engine", "launch_platform", "液体发射"),
    ("e-as-sr-lp", "solid_rocket", "launch_platform", "固体发射"),
    ("e-as-vac-eo", "vacuum_equip", "eo_sat", "光学镀膜"),
    ("e-as-lp-leo", "launch_platform", "leo_sat", "入轨"),
    ("e-as-lp-eo", "launch_platform", "eo_sat", "入轨"),
    ("e-as-lp-nav", "launch_platform", "nav_sat", "入轨"),
    ("e-as-leo-sc", "leo_sat", "sat_comms", "通信覆盖"),
    ("e-as-eo-gis", "eo_sat", "gis_app", "遥感数据"),
    ("e-as-nav-gis", "nav_sat", "gis_app", "定位融合"),
    ("e-as-leo-sn", "leo_sat", "satnet_app", "宽带接入"),
    ("e-as-sc-sn", "sat_comms", "satnet_app", "终端接入"),
    ("e-as-sn-sx", "satnet_app", "spacex_sl", "星链竞争"),
    ("e-as-lp-ls", "launch_platform", "landspace", "发射服务"),
]:
    upsert_edge(
        dict(
            industry_id="aerospace",
            edge_id=eid,
            source=src,
            target=tgt,
            layer="",
            label=lbl,
            updated_at=NOW,
        )
    )


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------
db.commit()
db.close()

print("=== Seed humanoid + aerospace complete ===")

from db import (
    SessionLocal as S2,
    IndustryList as IL,
    IndustryMeta as IM,
    IndustryNode as IN,
    IndustryEdge as IE,
    StockMeta as SM,
)

d2 = S2()
print(f"  IndustryList : {d2.query(IL).count()}")
print(f"  IndustryMeta : {d2.query(IM).count()}")
print(f"  IndustryNode : {d2.query(IN).count()}")
print(f"  IndustryEdge : {d2.query(IE).count()}")
print(f"  StockMeta    : {d2.query(SM).count()}")
d2.close()
