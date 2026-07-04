"""
人形机器人产业链完整seed脚本（v2）
- 删除旧的单一 humanoid 产业
- 新增 hm_overview + 7个细分子产业
- tab 统一为 "humanoid"

产业结构:
  hm_overview  - 人形机器人产业链全景 (sort=15)
  hm_reducer   - 谐波/RV减速器        (sort=16)
  hm_screw     - 丝杠/线性执行器       (sort=17)
  hm_motor     - 电机与伺服驱动        (sort=18)
  hm_sensor    - 传感器(力/视觉/IMU)   (sort=19)
  hm_body      - 本体/整机集成         (sort=20)
  hm_brain     - AI大脑/具身智能       (sort=21)
  hm_actuator  - 关节执行器模组        (sort=22)
"""

import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime
from sqlalchemy import text
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

def upsert_list(row):
    stmt = sqlite_insert(IndustryList).values(**row)
    stmt = stmt.on_conflict_do_update(
        index_elements=["industry_id"],
        set_={k: stmt.excluded[k] for k in row if k != "industry_id"},
    )
    db.execute(stmt)

def upsert_meta(row):
    stmt = sqlite_insert(IndustryMeta).values(**row)
    stmt = stmt.on_conflict_do_update(
        index_elements=["industry_id"],
        set_={k: stmt.excluded[k] for k in row if k != "industry_id"},
    )
    db.execute(stmt)

def upsert_node(row):
    stmt = sqlite_insert(IndustryNode).values(**row)
    stmt = stmt.on_conflict_do_update(
        index_elements=["industry_id", "node_id"],
        set_={k: stmt.excluded[k] for k in row if k not in ("industry_id", "node_id")},
    )
    db.execute(stmt)

def upsert_edge(row):
    stmt = sqlite_insert(IndustryEdge).values(**row)
    stmt = stmt.on_conflict_do_update(
        index_elements=["industry_id", "edge_id"],
        set_={k: stmt.excluded[k] for k in row if k not in ("industry_id", "edge_id")},
    )
    db.execute(stmt)

def upsert_stock(code, name, market, industry_ids):
    stmt = sqlite_insert(StockMeta).values(
        code=code, name=name, market=market,
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

def upsert_quote(code):
    stmt = sqlite_insert(StockQuote).values(
        code=code, name="", price=0.0, change=0.0, change_amt=0.0,
        open=0.0, prev_close=0.0, high=0.0, low=0.0,
        volume=0, turnover=0.0, market_cap=0.0,
        pe=0.0, pb=0.0, turnover_rate=0.0, amplitude=0.0, updated_at=None,
    )
    stmt = stmt.on_conflict_do_nothing(index_elements=["code"])
    db.execute(stmt)

def add_stocks(codes_list, industry_id):
    for code, name, market in codes_list:
        upsert_stock(code, name, market, [industry_id])
        upsert_quote(code)

def delete_industry(industry_id):
    db.execute(text(f"DELETE FROM industry_list WHERE industry_id='{industry_id}'"))
    db.execute(text(f"DELETE FROM industry_meta WHERE industry_id='{industry_id}'"))
    db.execute(text(f"DELETE FROM industry_node WHERE industry_id='{industry_id}'"))
    db.execute(text(f"DELETE FROM industry_edge WHERE industry_id='{industry_id}'"))
    db.execute(text(f"DELETE FROM stock_meta WHERE industry_ids='[\"{industry_id}\"]'"))

print("删除旧的单一humanoid产业...")
delete_industry("humanoid")
db.commit()

# =============================================================================
# 15. hm_overview — 人形机器人产业链全景
# =============================================================================
print("写入 hm_overview ...")

upsert_list(dict(
    industry_id="hm_overview",
    name="人形机器人产业链全景",
    sort_order=15,
    description="覆盖减速器/丝杆/电机/传感器/AI大脑/整机全链路，特斯拉Optimus引领百亿级市场爆发",
    icon="🤖",
    company_count=0,
    last_analyzed="2026-07-02",
    representatives=json.dumps(["埃斯顿", "绿的谐波", "汇川技术", "三花智控"], ensure_ascii=False),
    updated_at=NOW,
    tab="humanoid",
))
upsert_meta(dict(
    industry_id="hm_overview",
    sort_order=15,
    title="人形机器人产业链全景概览",
    subtitle="从核心零部件到整机本体，国产化加速布局",
    layer_labels=json.dumps(["核心零部件层", "执行器/传感器层", "整机系统层", "AI大脑层"], ensure_ascii=False),
    updated_at=NOW,
))

OV_NODES = [
    ("hm_ov_reducer",  200,   0, "减速器",    "⚙️",  "谐波/RV精密减速器", "upstream",   "688017", "A股", ["688017","002472","301368"]),
    ("hm_ov_screw",    560,   0, "丝杠",      "🔩",  "行星滚柱丝杆/滚珠丝杠", "upstream","300580", "A股", ["300580","603667","603009"]),
    ("hm_ov_motor",    920,   0, "电机",      "⚡",  "无框力矩电机/空心杯BLDC", "upstream","603728", "A股", ["603728","300124","002979"]),
    ("hm_ov_sensor",  1280,   0, "传感器",    "👁️", "六维力/视觉/IMU传感器",  "upstream", "688213", "A股", ["688213","002975"]),
    ("hm_ov_material",1640,   0, "材料",      "🧲",  "碳纤维/钕铁硼/PEEK",   "upstream",  "000831", "A股", ["000831","300024"]),
    ("hm_ov_actuator", 200, 210, "执行器",    "🦾",  "关节模组/线性执行器",  "core",       "002050", "A股", ["002050","601689"]),
    ("hm_ov_ctrl",     620, 210, "控制系统",  "🖥️", "运动控制器/驱动器",    "core",       "688188", "A股", ["688188","603025","002527"]),
    ("hm_ov_fpc",     1040, 210, "FPC/连接器","📟",  "关节FPC/精密连接器",   "core",       "002938", "A股", ["002938"]),
    ("hm_ov_power",   1460, 210, "电源/电池", "🔋",  "锂电池/BMS/DC-DC",    "core",       "300124", "A股", ["300124"]),
    ("hm_ov_body",     200, 420, "整机本体",  "🤖",  "人形机器人整机集成",   "downstream", "002747", "A股", ["002747","688165","300024"]),
    ("hm_ov_brain",    700, 420, "AI大脑",    "🧠",  "具身智能/端到端神经网络","downstream","688256","A股", ["688256","688041","300223"]),
    ("hm_ov_tesla",   1200, 420, "特斯拉Optimus","🚀","全球量产人形机器人标杆","application","TSLA","美股",[]),
    ("hm_ov_xiaomi",  1600, 420, "国内整机厂","🏭",  "宇树/小米/傅利叶等",   "application","002747","A股",["002747"]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in OV_NODES:
    upsert_node(dict(
        industry_id="hm_overview", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

OV_EDGES = [
    ("e-hov-red-act", "hm_ov_reducer", "hm_ov_actuator", "传动"),
    ("e-hov-scr-act", "hm_ov_screw",   "hm_ov_actuator", "线性驱动"),
    ("e-hov-mot-act", "hm_ov_motor",   "hm_ov_actuator", "旋转驱动"),
    ("e-hov-sen-ctrl","hm_ov_sensor",  "hm_ov_ctrl",     "力反馈"),
    ("e-hov-mat-body","hm_ov_material","hm_ov_body",     "结构件"),
    ("e-hov-act-body","hm_ov_actuator","hm_ov_body",     "关节集成"),
    ("e-hov-ctrl-body","hm_ov_ctrl",   "hm_ov_body",     "控制集成"),
    ("e-hov-fpc-body","hm_ov_fpc",     "hm_ov_body",     "信号传输"),
    ("e-hov-pwr-body","hm_ov_power",   "hm_ov_body",     "供电"),
    ("e-hov-body-brain","hm_ov_body",  "hm_ov_brain",    "端到端训练"),
    ("e-hov-body-ts", "hm_ov_body",    "hm_ov_tesla",    "整机交付"),
    ("e-hov-body-xm", "hm_ov_body",    "hm_ov_xiaomi",   "整机交付"),
    ("e-hov-brain-ts","hm_ov_brain",   "hm_ov_tesla",    "AI算法"),
    ("e-hov-brain-xm","hm_ov_brain",   "hm_ov_xiaomi",   "AI算法"),
]
for eid, src, tgt, lbl in OV_EDGES:
    upsert_edge(dict(
        industry_id="hm_overview", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 16. hm_reducer — 谐波/RV减速器
# =============================================================================
print("写入 hm_reducer ...")

REDUCER_STOCKS = [
    ("688017", "绿的谐波", "A股"),
    ("002472", "双环传动", "A股"),
    ("301368", "丰立智能", "A股"),
    ("002527", "新时达",   "A股"),
    ("002979", "雷赛智能", "A股"),
    ("300850", "新强联",   "A股"),
]
add_stocks(REDUCER_STOCKS, "hm_reducer")
upsert_list(dict(
    industry_id="hm_reducer",
    name="谐波/RV减速器",
    sort_order=16,
    description="人形机器人关节核心传动部件，谐波减速器轻量高精、RV减速器高刚性，绿的谐波国产龙头",
    icon="⚙️",
    company_count=len(REDUCER_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["绿的谐波", "双环传动", "丰立智能", "新时达"], ensure_ascii=False),
    updated_at=NOW,
    tab="humanoid",
))
upsert_meta(dict(
    industry_id="hm_reducer",
    sort_order=16,
    title="谐波/RV减速器供应链",
    subtitle="精密传动核心，每台人形机器人需12-20个减速器",
    layer_labels=json.dumps(["L0 原材料/钢材", "L1 精密加工", "L2 减速器产品", "L3 整机客户"], ensure_ascii=False),
    updated_at=NOW,
))

RED_NODES = [
    ("rd_steel",   130,   0, "特种合金钢", "🔩", "轴承钢/工具钢/精密齿轮用钢", "upstream", "000887", "A股", ["000887"]),
    ("rd_lubriant",430,   0, "精密润滑脂", "💧", "谐波减速器专用润滑脂",       "upstream", "NLGI",  "外资", []),
    ("rd_bearing",730,    0, "特种轴承",   "⚙️", "薄壁轴承/交叉滚子轴承",      "upstream", "300850", "A股", ["300850"]),
    ("rd_flexspline",1130,0, "柔轮/刚轮",  "🔲", "谐波减速器核心弹性元件",      "upstream", "688017", "A股", ["688017"]),
    ("rd_grinding",1530,  0, "精密磨床",   "⚙️", "外圆/内圆磨削，齿形加工",    "upstream", "STUDER","外资", []),

    ("rd_harmonic", 200, 210, "谐波减速器",  "⚙️", "轻量/高精度，人形机器人手腕/膝关节", "core", "688017", "A股",
     ["688017", "301368"]),
    ("rd_rv",       600, 210, "RV减速器",    "🔧", "高刚性高负载，大臂/腰部关节",         "core", "002472", "A股",
     ["002472"]),
    ("rd_planet",  1000, 210, "行星减速器",  "🔩", "中低精度场景，成本更低",             "core", "002527", "A股",
     ["002527"]),
    ("rd_servo_asm",1400,210, "伺服一体化模组","🦾","减速器+电机+编码器集成模组",          "core", "002979", "A股",
     ["002979"]),

    ("rd_tesla",    200, 420, "特斯拉Optimus","🚀", "单台需20个减速器，年产目标百万台",  "downstream", "TSLA", "美股", []),
    ("rd_unitree",  550, 420, "宇树科技",     "🤖", "四足+人形，B系列减速器主要采购方", "downstream", "未上市","未上市",[]),
    ("rd_domestic", 900, 420, "国内整机厂",   "🏭", "埃斯顿/步科等下游整机集成商",      "downstream", "002747","A股", ["002747"]),
    ("rd_indrobot",1300, 420, "工业机器人",   "🏗️","协作机器人/SCARA关节需求",         "downstream", "688165","A股", ["688165"]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in RED_NODES:
    upsert_node(dict(
        industry_id="hm_reducer", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

RED_EDGES = [
    ("e-rd-st-fl",  "rd_steel",     "rd_flexspline","钢材"),
    ("e-rd-st-rv",  "rd_steel",     "rd_rv",        "钢材"),
    ("e-rd-lb-ha",  "rd_lubriant",  "rd_harmonic",  "润滑"),
    ("e-rd-be-ha",  "rd_bearing",   "rd_harmonic",  "支撑"),
    ("e-rd-fl-ha",  "rd_flexspline","rd_harmonic",  "核心件"),
    ("e-rd-gr-rv",  "rd_grinding",  "rd_rv",        "精密加工"),
    ("e-rd-ha-sa",  "rd_harmonic",  "rd_servo_asm", "集成"),
    ("e-rd-rv-sa",  "rd_rv",        "rd_servo_asm", "集成"),
    ("e-rd-pl-sa",  "rd_planet",    "rd_servo_asm", "集成"),
    ("e-rd-ha-ts",  "rd_harmonic",  "rd_tesla",     "供货"),
    ("e-rd-rv-ut",  "rd_rv",        "rd_unitree",   "供货"),
    ("e-rd-sa-dom", "rd_servo_asm", "rd_domestic",  "模组供货"),
    ("e-rd-pl-ind", "rd_planet",    "rd_indrobot",  "工业供货"),
]
for eid, src, tgt, lbl in RED_EDGES:
    upsert_edge(dict(
        industry_id="hm_reducer", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 17. hm_screw — 丝杠/线性执行器
# =============================================================================
print("写入 hm_screw ...")

SCREW_STOCKS = [
    ("300580", "贝斯特",  "A股"),
    ("603667", "五洲新春","A股"),
    ("603009", "北特科技","A股"),
    ("002527", "新时达",  "A股"),
    ("301368", "丰立智能","A股"),
]
add_stocks(SCREW_STOCKS, "hm_screw")
upsert_list(dict(
    industry_id="hm_screw",
    name="丝杠/线性执行器",
    sort_order=17,
    description="行星滚柱丝杆是人形机器人线性运动核心，替代传统液压缸，贝斯特/五洲新春国产化突破",
    icon="🔩",
    company_count=len(SCREW_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["贝斯特", "五洲新春", "北特科技", "丰立智能"], ensure_ascii=False),
    updated_at=NOW,
    tab="humanoid",
))
upsert_meta(dict(
    industry_id="hm_screw",
    sort_order=17,
    title="丝杠/线性执行器供应链",
    subtitle="行星滚柱丝杆为人形机器人专用，精度要求比工业高10倍",
    layer_labels=json.dumps(["L0 材料/钢材", "L1 精密加工", "L2 丝杆产品", "L3 线性执行器"], ensure_ascii=False),
    updated_at=NOW,
))

SCR_NODES = [
    ("sc_steel",    150,   0, "轴承钢/精密钢","🔩","丝杠用高纯度轴承钢GCr15",     "upstream","600516","A股",["600516"]),
    ("sc_grind",    500,   0, "螺纹磨床",     "⚙️","高精度螺纹磨削设备",           "upstream","STUDER","外资",[]),
    ("sc_rolling",  850,   0, "精密滚动体",   "⚫","行星滚子/钢球，关键耗材",      "upstream","300850","A股",["300850"]),
    ("sc_coating", 1200,   0, "DLC镀膜",      "🔬","类金刚石镀膜延长寿命",         "upstream","688037","A股",["688037"]),
    ("sc_nut",     1550,   0, "精密螺母",     "🔩","高精度滚珠丝杠螺母",           "upstream","603009","A股",["603009"]),

    ("sc_ballscrew",200, 210, "滚珠丝杠",    "🔩","C3/C5级精密滚珠丝杠，工业标配",  "core","603667","A股",["603667","603009"]),
    ("sc_planet",   600, 210, "行星滚柱丝杠", "🌀","高负载/高速，人形机器人专用",   "core","300580","A股",["300580","301368"]),
    ("sc_linear",  1050, 210, "线性导轨",    "📏","滚柱导轨，配合丝杆直线运动",    "core","002527","A股",["002527"]),
    ("sc_leadscrew",1450,210, "梯形丝杠",    "🔩","低成本场景，服务机器人常用",    "core","603667","A股",["603667"]),

    ("sc_linear_act",200,420, "线性执行器",  "🦾","丝杆+电机+传感器集成，关节推拉","downstream","300580","A股",["300580"]),
    ("sc_leg",      600, 420, "腿部关节",    "🦵","膝/踝关节线性驱动，步态核心",   "downstream","002050","A股",["002050"]),
    ("sc_arm",     1000, 420, "臂部关节",    "💪","肘/腕关节线性辅助",            "downstream","601689","A股",["601689"]),
    ("sc_tesla_sc",1400, 420, "特斯拉Optimus","🚀","单台丝杠用量约14根",           "downstream","TSLA","美股",[]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in SCR_NODES:
    upsert_node(dict(
        industry_id="hm_screw", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

SCR_EDGES = [
    ("e-sc-st-bs", "sc_steel",   "sc_ballscrew","钢材"),
    ("e-sc-st-pl", "sc_steel",   "sc_planet",   "钢材"),
    ("e-sc-gr-pl", "sc_grind",   "sc_planet",   "磨削加工"),
    ("e-sc-ro-pl", "sc_rolling", "sc_planet",   "滚动体"),
    ("e-sc-co-pl", "sc_coating", "sc_planet",   "镀膜"),
    ("e-sc-nt-bs", "sc_nut",     "sc_ballscrew","螺母"),
    ("e-sc-bs-la", "sc_ballscrew","sc_linear_act","驱动"),
    ("e-sc-pl-la", "sc_planet",  "sc_linear_act","高精驱动"),
    ("e-sc-lg-la", "sc_linear",  "sc_linear_act","导向"),
    ("e-sc-la-leg","sc_linear_act","sc_leg",     "腿部"),
    ("e-sc-la-arm","sc_linear_act","sc_arm",     "臂部"),
    ("e-sc-leg-ts","sc_leg",     "sc_tesla_sc", "供货"),
    ("e-sc-arm-ts","sc_arm",     "sc_tesla_sc", "供货"),
]
for eid, src, tgt, lbl in SCR_EDGES:
    upsert_edge(dict(
        industry_id="hm_screw", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 18. hm_motor — 电机与伺服驱动
# =============================================================================
print("写入 hm_motor ...")

MOTOR_STOCKS = [
    ("603728", "鸣志电器", "A股"),
    ("300124", "汇川技术", "A股"),
    ("002979", "雷赛智能", "A股"),
    ("002527", "新时达",   "A股"),
    ("603025", "大豪科技", "A股"),
    ("688188", "柏楚电子", "A股"),
]
add_stocks(MOTOR_STOCKS, "hm_motor")
upsert_list(dict(
    industry_id="hm_motor",
    name="电机与伺服驱动",
    sort_order=18,
    description="无框力矩电机/空心杯BLDC是人形机器人关节核心，汇川技术/鸣志电器/雷赛智能国产三强",
    icon="⚡",
    company_count=len(MOTOR_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["鸣志电器", "汇川技术", "雷赛智能", "柏楚电子"], ensure_ascii=False),
    updated_at=NOW,
    tab="humanoid",
))
upsert_meta(dict(
    industry_id="hm_motor",
    sort_order=18,
    title="电机与伺服驱动供应链",
    subtitle="高转矩密度无框电机是人形机器人关节驱动核心",
    layer_labels=json.dumps(["L0 磁材/硅钢", "L1 电机本体", "L2 驱动控制", "L3 执行器集成"], ensure_ascii=False),
    updated_at=NOW,
))

MOT_NODES = [
    ("mt_magnet",   150,   0, "钕铁硼磁材",  "🧲","N52/N55高性能永磁体，电机核心",  "upstream","000831","A股",["000831"]),
    ("mt_silicon",  500,   0, "硅钢片",      "⚡","高频低损耗硅钢，降低铁损",       "upstream","600022","A股",["600022"]),
    ("mt_winding",  850,   0, "精密绕线",    "🔌","高槽满率绕组，提升效率",         "upstream","002952","A股",["002952"]),
    ("mt_encoder", 1200,   0, "多圈编码器",  "📡","位置精度0.001°，关节必备",       "upstream","688188","A股",["688188"]),
    ("mt_foc_chip",1550,   0, "FOC控制芯片", "💻","无刷电机磁场定向控制IC",         "upstream","300671","A股",["300671"]),

    ("mt_hollow",   200, 210, "空心杯电机",  "⚡","低转动惯量，手部/小关节专用",    "core","603728","A股",["603728"]),
    ("mt_frameless",600, 210, "无框力矩电机","🔋","直驱，高转矩密度，主关节核心",   "core","002979","A股",["002979","300124"]),
    ("mt_bldc",    1050, 210, "BLDC无刷电机","⚡","高效率，腿部大功率驱动",         "core","300124","A股",["300124","603728"]),
    ("mt_linear_mt",1450,210, "直线电机",    "➡️","精确线性驱动，部分关节应用",     "core","002527","A股",["002527"]),

    ("mt_servo_drv",200, 420, "伺服驱动器",  "🖥️","电流/速度/位置三环控制",         "downstream","002979","A股",["002979","603025"]),
    ("mt_motion_ctrl",650,420,"运动控制器",  "💻","多轴协调，EtherCAT总线",         "downstream","688188","A股",["688188","603025"]),
    ("mt_joint_mod",1100,420, "关节模组",    "🦾","电机+减速+传感一体化",           "downstream","002050","A股",["002050","601689"]),
    ("mt_tesla_mot",1500,420, "特斯拉Optimus","🚀","全身28个电机，年需求千万级",     "downstream","TSLA","美股",[]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in MOT_NODES:
    upsert_node(dict(
        industry_id="hm_motor", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

MOT_EDGES = [
    ("e-mt-mg-hl",  "mt_magnet",  "mt_hollow",    "磁体"),
    ("e-mt-mg-fl",  "mt_magnet",  "mt_frameless", "磁体"),
    ("e-mt-si-bl",  "mt_silicon", "mt_bldc",      "硅钢片"),
    ("e-mt-wd-hl",  "mt_winding", "mt_hollow",    "绕组"),
    ("e-mt-wd-fl",  "mt_winding", "mt_frameless", "绕组"),
    ("e-mt-ec-sd",  "mt_encoder", "mt_servo_drv", "位置反馈"),
    ("e-mt-fc-sd",  "mt_foc_chip","mt_servo_drv", "控制IC"),
    ("e-mt-hl-sd",  "mt_hollow",  "mt_servo_drv", "驱动"),
    ("e-mt-fl-sd",  "mt_frameless","mt_servo_drv","驱动"),
    ("e-mt-bl-sd",  "mt_bldc",    "mt_servo_drv", "驱动"),
    ("e-mt-sd-mc",  "mt_servo_drv","mt_motion_ctrl","指令"),
    ("e-mt-mc-jm",  "mt_motion_ctrl","mt_joint_mod","协调"),
    ("e-mt-jm-ts",  "mt_joint_mod","mt_tesla_mot", "供货"),
    ("e-mt-fl-jm",  "mt_frameless","mt_joint_mod", "电机"),
]
for eid, src, tgt, lbl in MOT_EDGES:
    upsert_edge(dict(
        industry_id="hm_motor", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 19. hm_sensor — 传感器（力/视觉/IMU）
# =============================================================================
print("写入 hm_sensor ...")

SENSOR_STOCKS = [
    ("688213", "思特威",  "A股"),
    ("002975", "博杰股份","A股"),
    ("688516", "奥比中光","A股"),
    ("688188", "柏楚电子","A股"),
    ("603893", "瑞芯微",  "A股"),
    ("300223", "北京君正","A股"),
]
add_stocks(SENSOR_STOCKS, "hm_sensor")
upsert_list(dict(
    industry_id="hm_sensor",
    name="传感器（力/视觉/IMU）",
    sort_order=19,
    description="六维力传感器+3D视觉+IMU构成机器人感知系统，思特威/奥比中光/博杰股份国产布局",
    icon="👁️",
    company_count=len(SENSOR_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["思特威", "奥比中光", "博杰股份", "瑞芯微"], ensure_ascii=False),
    updated_at=NOW,
    tab="humanoid",
))
upsert_meta(dict(
    industry_id="hm_sensor",
    sort_order=19,
    title="传感器供应链",
    subtitle="感知层决定机器人与环境交互能力，三类传感器缺一不可",
    layer_labels=json.dumps(["L0 敏感元件", "L1 传感器产品", "L2 感知模组", "L3 整机集成"], ensure_ascii=False),
    updated_at=NOW,
))

SEN_NODES = [
    ("sn_cmos",     150,   0, "CMOS图像芯片", "📸","高帧率/低功耗CMOS，视觉核心",   "upstream","688213","A股",["688213"]),
    ("sn_tof_chip", 480,   0, "ToF/LiDAR芯片","📡","飞行时间测距，3D深度感知",      "upstream","300223","A股",["300223"]),
    ("sn_mems_imu", 810,   0, "MEMS传感芯片", "🔬","加速度计/陀螺仪MEMS芯片",       "upstream","688213","A股",["688213"]),
    ("sn_strain",  1140,   0, "应变计/应变片", "📏","力传感器敏感元件",              "upstream","002975","A股",["002975"]),
    ("sn_edge_ai", 1470,   0, "边缘AI芯片",   "💻","传感数据实时处理，瑞芯微RK系列", "upstream","603893","A股",["603893","300223"]),

    ("sn_6dof",     200, 210, "六维力矩传感器","🦾","关节力控反馈，柔顺操作核心",   "core","002975","A股",["002975"]),
    ("sn_depth_cam",600, 210, "3D深度相机",   "📷","RGB-D/结构光，物体识别抓取",    "core","688516","A股",["688516"]),
    ("sn_imu",     1000, 210, "IMU惯导模组",  "🌀","姿态解算/平衡控制，步态核心",  "core","688213","A股",["688213"]),
    ("sn_tactile", 1400, 210, "触觉传感器",   "✋","手指触力感知，灵巧操作",        "core","002975","A股",["002975"]),

    ("sn_percept",  200, 420, "感知融合模组", "🧠","力+视觉+IMU多模态融合",        "downstream","603893","A股",["603893","688516"]),
    ("sn_grasp",    600, 420, "灵巧手控制",  "✋","多指协调，力控抓取",            "downstream","002050","A股",["002050"]),
    ("sn_balance",  950, 420, "平衡控制",    "⚖️","动态平衡/步态规划",             "downstream","688256","A股",["688256"]),
    ("sn_tesla_s", 1350, 420, "特斯拉Optimus","🚀","全身200+传感器，感知网络",      "downstream","TSLA","美股",[]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in SEN_NODES:
    upsert_node(dict(
        industry_id="hm_sensor", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

SEN_EDGES = [
    ("e-sn-cm-dc",  "sn_cmos",    "sn_depth_cam","视觉芯片"),
    ("e-sn-tf-dc",  "sn_tof_chip","sn_depth_cam","深度芯片"),
    ("e-sn-mi-im",  "sn_mems_imu","sn_imu",      "MEMS元件"),
    ("e-sn-st-6d",  "sn_strain",  "sn_6dof",     "应变感知"),
    ("e-sn-ea-pf",  "sn_edge_ai", "sn_percept",  "AI芯片"),
    ("e-sn-6d-pf",  "sn_6dof",    "sn_percept",  "力数据"),
    ("e-sn-dc-pf",  "sn_depth_cam","sn_percept", "视觉数据"),
    ("e-sn-im-bl",  "sn_imu",     "sn_balance",  "姿态数据"),
    ("e-sn-tc-gr",  "sn_tactile", "sn_grasp",    "触力反馈"),
    ("e-sn-pf-gr",  "sn_percept", "sn_grasp",    "感知融合"),
    ("e-sn-pf-bl",  "sn_percept", "sn_balance",  "环境感知"),
    ("e-sn-gr-ts",  "sn_grasp",   "sn_tesla_s",  "灵巧手"),
    ("e-sn-bl-ts",  "sn_balance", "sn_tesla_s",  "平衡"),
]
for eid, src, tgt, lbl in SEN_EDGES:
    upsert_edge(dict(
        industry_id="hm_sensor", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 20. hm_body — 本体/整机集成
# =============================================================================
print("写入 hm_body ...")

BODY_STOCKS = [
    ("002747", "埃斯顿",  "A股"),
    ("688165", "埃夫特",  "A股"),
    ("601689", "拓普集团","A股"),
    ("002050", "三花智控","A股"),
    ("300024", "机器人",  "A股"),
    ("002527", "新时达",  "A股"),
]
add_stocks(BODY_STOCKS, "hm_body")
upsert_list(dict(
    industry_id="hm_body",
    name="本体/整机集成",
    sort_order=20,
    description="人形机器人整机系统集成商，埃斯顿/拓普集团/三花智控等Tier1供应商切入整机赛道",
    icon="🦿",
    company_count=len(BODY_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["埃斯顿", "拓普集团", "三花智控", "埃夫特"], ensure_ascii=False),
    updated_at=NOW,
    tab="humanoid",
))
upsert_meta(dict(
    industry_id="hm_body",
    sort_order=20,
    title="本体/整机集成供应链",
    subtitle="整机集成是系统工程，Tier1供应商向模组/整机延伸",
    layer_labels=json.dumps(["L0 材料/结构件", "L1 核心零部件", "L2 子系统模组", "L3 整机/应用"], ensure_ascii=False),
    updated_at=NOW,
))

BODY_NODES = [
    ("bd_carbon",   150,   0, "碳纤维结构件","🧵","CFRP骨架，轻量化40%",          "upstream","000768","A股",["000768"]),
    ("bd_alum",     480,   0, "铝合金精铸",  "⚙️","高强铝合金压铸/锻造骨架",      "upstream","600516","A股",["600516"]),
    ("bd_rubber",   810,   0, "硅橡胶蒙皮",  "🧤","仿生外皮/柔性关节密封",        "upstream","600309","A股",["600309"]),
    ("bd_pcb_fpc", 1140,   0, "机器人PCB/FPC","📟","关节信号FPC/主控板",           "upstream","002938","A股",["002938"]),
    ("bd_battery", 1470,   0, "锂电池/电池组","🔋","高能量密度pack，续航4h+",      "upstream","300014","A股",["300014"]),

    ("bd_joint",    200, 210, "关节执行器",  "⚙️","减速器+电机+传感集成模组",     "core","601689","A股",["601689","002050"]),
    ("bd_hand",     580, 210, "灵巧手",      "✋","多指/欠驱动手，精密组装",      "core","002050","A股",["002050"]),
    ("bd_leg",      960, 210, "腿部总成",    "🦵","双足步态，承重100kg+",         "core","601689","A股",["601689"]),
    ("bd_torso",   1340, 210, "躯干/背包",   "🔧","电池+控制器+散热集成",         "core","002050","A股",["002050"]),

    ("bd_humanoid", 200, 420, "人形机器人整机","🤖","1.7m/60kg，43自由度",         "downstream","002747","A股",["002747","688165"]),
    ("bd_cobotarm", 600, 420, "协作机器人臂", "🦾","6轴协作臂，工厂/服务场景",     "downstream","688165","A股",["688165","002747"]),
    ("bd_quadruped",1000,420, "四足机器人",  "🐕","宇树/波士顿动力路线",          "downstream","300024","A股",["300024"]),
    ("bd_service",  1400,420, "服务机器人",  "🏠","家庭/医疗/物流场景",           "downstream","688169","A股",["688169"]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in BODY_NODES:
    upsert_node(dict(
        industry_id="hm_body", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

BODY_EDGES = [
    ("e-bd-cf-hm",  "bd_carbon",  "bd_humanoid", "骨架"),
    ("e-bd-al-lg",  "bd_alum",    "bd_leg",      "结构件"),
    ("e-bd-rb-hm",  "bd_rubber",  "bd_humanoid", "蒙皮"),
    ("e-bd-fpc-ts2","bd_pcb_fpc", "bd_torso",    "线路板"),
    ("e-bd-bat-ts2","bd_battery", "bd_torso",    "供电"),
    ("e-bd-jt-hm",  "bd_joint",   "bd_humanoid", "关节"),
    ("e-bd-jt-ca",  "bd_joint",   "bd_cobotarm", "关节"),
    ("e-bd-hd-hm",  "bd_hand",    "bd_humanoid", "灵巧手"),
    ("e-bd-lg-hm",  "bd_leg",     "bd_humanoid", "腿部"),
    ("e-bd-to-hm",  "bd_torso",   "bd_humanoid", "躯干"),
    ("e-bd-jt-qd",  "bd_joint",   "bd_quadruped","关节"),
    ("e-bd-hm-sv",  "bd_humanoid","bd_service",  "衍生"),
]
for eid, src, tgt, lbl in BODY_EDGES:
    upsert_edge(dict(
        industry_id="hm_body", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 21. hm_brain — AI大脑/具身智能
# =============================================================================
print("写入 hm_brain ...")

BRAIN_STOCKS = [
    ("688256", "寒武纪",  "A股"),
    ("688041", "海光信息","A股"),
    ("300223", "北京君正","A股"),
    ("603893", "瑞芯微",  "A股"),
    ("688188", "柏楚电子","A股"),
    ("002527", "新时达",  "A股"),
]
add_stocks(BRAIN_STOCKS, "hm_brain")
upsert_list(dict(
    industry_id="hm_brain",
    name="AI大脑/具身智能",
    sort_order=21,
    description="端到端强化学习+多模态大模型赋予机器人通用操作能力，寒武纪/北京君正/瑞芯微布局边缘AI",
    icon="🧠",
    company_count=len(BRAIN_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["寒武纪", "北京君正", "瑞芯微", "柏楚电子"], ensure_ascii=False),
    updated_at=NOW,
    tab="humanoid",
))
upsert_meta(dict(
    industry_id="hm_brain",
    sort_order=21,
    title="AI大脑/具身智能供应链",
    subtitle="从感知到决策到控制，端到端神经网络是人形机器人通用化关键",
    layer_labels=json.dumps(["L0 AI芯片/算力", "L1 感知/理解", "L2 决策/规划", "L3 运动生成"], ensure_ascii=False),
    updated_at=NOW,
))

BRAIN_NODES = [
    ("br_npu",      150,   0, "机器人NPU",    "🔮","边缘推理芯片，寒武纪/北京君正", "upstream","688256","A股",["688256","300223"]),
    ("br_cpu",      480,   0, "高性能CPU/SoC","💻","机器人主控SoC，瑞芯微RK3588",   "upstream","603893","A股",["603893","300223"]),
    ("br_mem",      810,   0, "LPDDR5内存",   "💾","大模型推理需32GB+内存",         "upstream","688008","A股",["688008"]),
    ("br_stor",    1140,   0, "UFS/NVMe存储", "💿","模型权重存储，大容量低功耗",     "upstream","688008","A股",["688008"]),
    ("br_5g_wifi", 1470,   0, "5G/WiFi模组",  "📶","云端大模型协同通信",            "upstream","300136","A股",["300136"]),

    ("br_percept",  200, 210, "感知模型",     "👁️","CLIP/ViT多模态视觉理解",       "core","300223","A股",["300223","688256"]),
    ("br_llm",      600, 210, "具身大语言模型","🗣️","指令理解/任务规划，GPT-4o级",  "core","688256","A股",["688256"]),
    ("br_world_mdl",1000,210, "世界模型",     "🌍","环境建模/预测，离线强化学习",   "core","688041","A股",["688041"]),
    ("br_motion",  1400, 210, "运动生成模型", "🦾","从意图到关节轨迹端到端生成",    "core","688188","A股",["688188"]),

    ("br_e2e",      200, 420, "端到端控制",   "⚡","感知→决策→执行一体化神经网络",  "downstream","688256","A股",["688256"]),
    ("br_sim",      600, 420, "仿真训练平台", "🎮","Isaac Sim/MuJoCo大规模训练",    "downstream","688256","A股",["688256"]),
    ("br_cloud",   1000, 420, "云端大模型协同","☁️","云端推理+边缘执行分层架构",    "downstream","688041","A股",["688041"]),
    ("br_openai",  1400, 420, "OpenAI/NVIDIA","🌟","GR00T/Pi0具身基础模型",         "downstream","NVDA","美股",[]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in BRAIN_NODES:
    upsert_node(dict(
        industry_id="hm_brain", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

BRAIN_EDGES = [
    ("e-br-npu-e2e","br_npu",     "br_e2e",    "推理芯片"),
    ("e-br-cpu-e2e","br_cpu",     "br_e2e",    "主控"),
    ("e-br-mem-llm","br_mem",     "br_llm",    "内存"),
    ("e-br-5g-cl",  "br_5g_wifi", "br_cloud",  "通信"),
    ("e-br-pe-e2e", "br_percept", "br_e2e",    "感知"),
    ("e-br-ll-e2e", "br_llm",     "br_e2e",    "规划"),
    ("e-br-wm-e2e", "br_world_mdl","br_e2e",   "世界模型"),
    ("e-br-mo-e2e", "br_motion",  "br_e2e",    "运动"),
    ("e-br-si-wm",  "br_sim",     "br_world_mdl","训练数据"),
    ("e-br-cl-ll",  "br_cloud",   "br_llm",    "云端大模型"),
    ("e-br-e2e-op", "br_e2e",     "br_openai", "对标"),
    ("e-br-cl-op",  "br_cloud",   "br_openai", "协作"),
]
for eid, src, tgt, lbl in BRAIN_EDGES:
    upsert_edge(dict(
        industry_id="hm_brain", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 22. hm_actuator — 关节/执行器模组（Tier1集成商）
# =============================================================================
print("写入 hm_actuator ...")

ACT_STOCKS = [
    ("002050", "三花智控","A股"),
    ("601689", "拓普集团","A股"),
    ("002979", "雷赛智能","A股"),
    ("300124", "汇川技术","A股"),
    ("002527", "新时达",  "A股"),
    ("603025", "大豪科技","A股"),
]
add_stocks(ACT_STOCKS, "hm_actuator")
upsert_list(dict(
    industry_id="hm_actuator",
    name="关节/执行器模组",
    sort_order=22,
    description="关节执行器是人形机器人核心模组，三花智控/拓普集团作为Tier1向模组延伸，汇川/雷赛控制系统配套",
    icon="🦾",
    company_count=len(ACT_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["三花智控", "拓普集团", "汇川技术", "雷赛智能"], ensure_ascii=False),
    updated_at=NOW,
    tab="humanoid",
))
upsert_meta(dict(
    industry_id="hm_actuator",
    sort_order=22,
    title="关节/执行器模组供应链",
    subtitle="Tier1模组集成商整合减速器+电机+传感器，直接供整机厂",
    layer_labels=json.dumps(["L0 关键零部件", "L1 执行器单元", "L2 模组集成", "L3 整机厂"], ensure_ascii=False),
    updated_at=NOW,
))

ACT_NODES = [
    ("ac_reducer",  150,   0, "谐波减速器",  "⚙️","绿的谐波/丰立智能，关节传动",   "upstream","688017","A股",["688017","301368"]),
    ("ac_motor",    450,   0, "无框电机",    "⚡","鸣志/汇川，关节驱动",           "upstream","603728","A股",["603728","300124"]),
    ("ac_encoder",  750,   0, "绝对值编码器","📡","多圈/高分辨率，位置反馈",       "upstream","688188","A股",["688188"]),
    ("ac_torque_s", 1050,  0, "力矩传感器",  "📏","博杰/宝隆，关节力控",           "upstream","002975","A股",["002975"]),
    ("ac_screw",   1350,   0, "丝杠/连杆",   "🔩","贝斯特/五洲新春，线性传动",     "upstream","300580","A股",["300580","603667"]),
    ("ac_driver_ic",1650,  0, "驱动IC",      "💻","FOC/BLDC驱动芯片",             "upstream","300671","A股",["300671"]),

    ("ac_rotary",   200, 210, "旋转执行器",  "🔄","旋转关节：肩/肘/腕/髋/膝/踝", "core","002050","A股",["002050","601689"]),
    ("ac_linear",   600, 210, "线性执行器",  "➡️","腿部推杆，丝杆驱动",           "core","601689","A股",["601689","300580"]),
    ("ac_servo_unit",1050,210,"伺服驱动单元","🖥️","三环控制+EtherCAT通信",        "core","002979","A股",["002979","300124"]),
    ("ac_hand_act", 1450, 210, "手部执行器", "✋","多指/欠驱动，灵巧抓取",        "core","002050","A股",["002050"]),

    ("ac_joint_mod",200, 420, "关节模组",    "🦾","完整关节集成，即插即用",        "downstream","002050","A股",["002050","601689"]),
    ("ac_leg_asm",  600, 420, "腿部总成",    "🦵","双腿6关节组合，步态系统",       "downstream","601689","A股",["601689"]),
    ("ac_arm_asm", 1000, 420, "臂部总成",    "💪","双臂14关节，操作系统",          "downstream","002050","A股",["002050"]),
    ("ac_tesla_tier","1400",420,"特斯拉Optimus","🚀","三花/拓普Tier1直接供货",     "downstream","TSLA","美股",[]),
]
for i, (nid, x, y, label, icon, desc, layer, ticker, market, stocks) in enumerate(ACT_NODES):
    upsert_node(dict(
        industry_id="hm_actuator", node_id=nid, x=int(str(x).strip('"')), y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

ACT_EDGES = [
    ("e-ac-rd-ro",  "ac_reducer", "ac_rotary",   "传动"),
    ("e-ac-mt-ro",  "ac_motor",   "ac_rotary",   "驱动"),
    ("e-ac-mt-li",  "ac_motor",   "ac_linear",   "驱动"),
    ("e-ac-ec-su",  "ac_encoder", "ac_servo_unit","位置"),
    ("e-ac-ts-li",  "ac_torque_s","ac_servo_unit","力矩"),
    ("e-ac-sc-li",  "ac_screw",   "ac_linear",   "丝杆"),
    ("e-ac-di-su",  "ac_driver_ic","ac_servo_unit","控制IC"),
    ("e-ac-su-ro",  "ac_servo_unit","ac_rotary",  "控制"),
    ("e-ac-su-li",  "ac_servo_unit","ac_linear",  "控制"),
    ("e-ac-ro-jm",  "ac_rotary",  "ac_joint_mod","旋转关节"),
    ("e-ac-li-la",  "ac_linear",  "ac_leg_asm",  "腿部推杆"),
    ("e-ac-ha-am",  "ac_hand_act","ac_arm_asm",  "手部"),
    ("e-ac-ro-am",  "ac_rotary",  "ac_arm_asm",  "臂部关节"),
    ("e-ac-jm-ts",  "ac_joint_mod","ac_tesla_tier","模组"),
    ("e-ac-la-ts",  "ac_leg_asm", "ac_tesla_tier","腿部"),
    ("e-ac-am-ts",  "ac_arm_asm", "ac_tesla_tier","臂部"),
]
for eid, src, tgt, lbl in ACT_EDGES:
    upsert_edge(dict(
        industry_id="hm_actuator", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# Commit
# =============================================================================
db.commit()
db.close()

print("=== humanoid v2 seed complete ===")

from db import SessionLocal as S2, IndustryList as IL, IndustryMeta as IM
from db import IndustryNode as IN, IndustryEdge as IE, StockMeta as SM

d2 = S2()
hm_ids = ["hm_overview","hm_reducer","hm_screw","hm_motor","hm_sensor","hm_body","hm_brain","hm_actuator"]
for iid in hm_ids:
    nc = d2.query(IN).filter(IN.industry_id==iid).count()
    ec = d2.query(IE).filter(IE.industry_id==iid).count()
    r = d2.query(IL).filter(IL.industry_id==iid).first()
    print(f"  {iid}: nodes={nc} edges={ec} tab={r.tab if r else 'NOT FOUND'}")
d2.close()
