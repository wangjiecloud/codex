"""
商业航天产业链完整seed脚本（v2）
- 删除旧的单一 aerospace 产业
- 新增 as_overview + 7个细分子产业
- tab 统一为 "aerospace"

产业结构:
  as_overview  - 商业航天产业链全景       (sort=23)
  as_rocket    - 运载火箭/发动机           (sort=24)
  as_satellite - 卫星平台/制造             (sort=25)
  as_payload   - 有效载荷/载荷             (sort=26)
  as_satcom    - 卫星通信                  (sort=27)
  as_satnav    - 卫星导航/北斗             (sort=28)
  as_remote    - 遥感/对地观测             (sort=29)
  as_ground    - 地面站/测控系统           (sort=30)
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

print("删除旧的单一aerospace产业...")
delete_industry("aerospace")
db.commit()

# =============================================================================
# 23. as_overview — 商业航天产业链全景
# =============================================================================
print("写入 as_overview ...")

upsert_list(dict(
    industry_id="as_overview",
    name="商业航天产业链全景",
    sort_order=23,
    description="覆盖运载火箭/卫星制造/有效载荷/通信导航遥感/地面测控全链路，中国商业航天进入爆发期",
    icon="🚀",
    company_count=0,
    last_analyzed="2026-07-02",
    representatives=json.dumps(["中国卫星", "航天电子", "航天环宇", "北斗星通"], ensure_ascii=False),
    updated_at=NOW,
    tab="aerospace",
))
upsert_meta(dict(
    industry_id="as_overview",
    sort_order=23,
    title="商业航天产业链全景概览",
    subtitle="从运载火箭到卫星应用，国产化加速突破",
    layer_labels=json.dumps(["发射/运载层", "卫星平台层", "载荷/通信层", "应用/地面层"], ensure_ascii=False),
    updated_at=NOW,
))

OV_NODES = [
    ("as_ov_rocket",   150,   0, "运载火箭",    "🚀", "液体/固体火箭，商业发射服务",     "upstream",   "未上市",  "未上市", []),
    ("as_ov_engine",   470,   0, "火箭发动机",  "🔥", "液氧煤油/甲烷发动机，核心推力",   "upstream",   "600879",  "A股",   ["600879"]),
    ("as_ov_structure",790,   0, "火箭结构件",  "🔩", "碳纤维/钛合金箭体结构",           "upstream",   "600501",  "A股",   ["600501"]),
    ("as_ov_special",  1110,  0, "特种材料",    "🧲", "碳纤维/铝锂合金/钛合金",          "upstream",   "300699",  "A股",   ["300699","300777"]),
    ("as_ov_elec",     1430, 0, "特种电子",    "💻", "宇航级芯片/FPGA/SoC",             "upstream",   "002049",  "A股",   ["002049","000733"]),

    ("as_ov_satplat",  200,  210, "卫星平台",   "🛰️", "卫星本体/结构/热控/姿控",        "core",       "600118",  "A股",   ["600118"]),
    ("as_ov_payload",  570,  210, "有效载荷",   "📡", "通信/遥感/导航载荷",             "core",       "688523",  "A股",   ["688523","600990"]),
    ("as_ov_satcom",   940,  210, "卫星通信",   "📶", "通信卫星/VSAT/终端",             "core",       "601698",  "A股",   ["601698","688311"]),
    ("as_ov_satnav",  1310,  210, "卫星导航",   "📍", "北斗/GNSS芯片/模组/终端",        "core",       "002151",  "A股",   ["002151","002465"]),

    ("as_ov_remote",   200,  420, "遥感应用",   "🌍", "卫星遥感数据/GIS/AI解译",        "downstream", "688568",  "A股",   ["688568","002405"]),
    ("as_ov_ground",   580,  420, "地面测控",   "📡", "发射场/测控站/数据处理",         "downstream", "600990",  "A股",   ["600990","600879"]),
    ("as_ov_spacex",  1000,  420, "SpaceX",     "🌟", "猎鹰9/星链，全球商业航天标杆",   "application","SPCE",    "美股",  []),
    ("as_ov_amazon",  1400,  420, "亚马逊柯伊伯","☁️", "3236颗LEO星座，挑战星链",       "application","AMZN",   "美股",  []),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in OV_NODES:
    upsert_node(dict(
        industry_id="as_overview", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

OV_EDGES = [
    ("e-asov-eng-rkt",  "as_ov_engine",    "as_ov_rocket",   "推进"),
    ("e-asov-str-rkt",  "as_ov_structure", "as_ov_rocket",   "箭体"),
    ("e-asov-spe-rkt",  "as_ov_special",   "as_ov_structure","材料"),
    ("e-asov-ele-pay",  "as_ov_elec",      "as_ov_payload",  "芯片"),
    ("e-asov-rkt-sat",  "as_ov_rocket",    "as_ov_satplat",  "发射"),
    ("e-asov-plat-pay", "as_ov_satplat",   "as_ov_payload",  "集成"),
    ("e-asov-pay-com",  "as_ov_payload",   "as_ov_satcom",   "通信载荷"),
    ("e-asov-pay-nav",  "as_ov_payload",   "as_ov_satnav",   "导航载荷"),
    ("e-asov-com-rmt",  "as_ov_satcom",    "as_ov_remote",   "数据"),
    ("e-asov-nav-rmt",  "as_ov_satnav",    "as_ov_remote",   "位置"),
    ("e-asov-rmt-gnd",  "as_ov_remote",    "as_ov_ground",   "测控"),
    ("e-asov-gnd-sx",   "as_ov_ground",    "as_ov_spacex",   "对标"),
    ("e-asov-gnd-amz",  "as_ov_ground",    "as_ov_amazon",   "对标"),
]
for eid, src, tgt, lbl in OV_EDGES:
    upsert_edge(dict(
        industry_id="as_overview", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 24. as_rocket — 运载火箭/发动机
# =============================================================================
print("写入 as_rocket ...")

ROCKET_STOCKS = [
    ("600879", "航天电子",  "A股"),
    ("600501", "航天晨光",  "A股"),
    ("002025", "航天电器",  "A股"),
    ("300699", "光威复材",  "A股"),
    ("300777", "中简科技",  "A股"),
    ("688102", "斯瑞新材",  "A股"),
]
add_stocks(ROCKET_STOCKS, "as_rocket")
upsert_list(dict(
    industry_id="as_rocket",
    name="运载火箭/发动机",
    sort_order=24,
    description="液体/固体运载火箭是商业航天入轨门票，碳纤维箭体/高温合金发动机/航天电子为核心配套",
    icon="🚀",
    company_count=len(ROCKET_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["航天电子", "航天晨光", "光威复材", "斯瑞新材"], ensure_ascii=False),
    updated_at=NOW,
    tab="aerospace",
))
upsert_meta(dict(
    industry_id="as_rocket",
    sort_order=24,
    title="运载火箭/发动机供应链",
    subtitle="商业火箭降本可复用是核心趋势，液氧甲烷发动机引领下一代",
    layer_labels=json.dumps(["L0 原材料/特种材料", "L1 关键零部件", "L2 系统集成", "L3 发射服务"], ensure_ascii=False),
    updated_at=NOW,
))

RKT_NODES = [
    ("rk_cf",      130,   0, "碳纤维复合材料","🧵","T800/T1000级航天用碳纤维",        "upstream","300699","A股",["300699","300777"]),
    ("rk_superal",  430,  0, "高温合金",      "🔥","涡轮泵/燃烧室用镍基高温合金",     "upstream","688102","A股",["688102"]),
    ("rk_titan",    730,  0, "钛合金结构件",  "⚙️","阀门/管路精密钛合金铸件",         "upstream","002025","A股",["002025"]),
    ("rk_seal",    1030,  0, "密封/连接器",   "🔌","航天级连接器/密封组件",            "upstream","002025","A股",["002025"]),
    ("rk_comp",    1330,  0, "航天电子元器件","💻","抗辐射元器件/EMC器件",             "upstream","000733","A股",["000733","600879"]),
    ("rk_gyro",    1630,  0, "惯性器件",      "🌀","光纤陀螺/MEMS-IMU，制导核心",     "upstream","600879","A股",["600879"]),

    ("rk_engine",   200, 210, "液氧煤油发动机","🔥","推力120吨级，国内商业主力",       "core","未上市","未上市",[]),
    ("rk_solid",    560, 210, "固体发动机",    "💥","快速响应，小卫星发射首选",        "core","600879","A股",["600879"]),
    ("rk_stage",    920, 210, "箭体结构/级间段","🔩","碳纤维网格壁结构，减重30%",      "core","600501","A股",["600501"]),
    ("rk_avionics",1280, 210, "飞控/制导系统", "🖥️","箭载计算机/制导系统集成",        "core","600879","A股",["600879"]),
    ("rk_tvc",     1620, 210, "推力矢量控制",  "🎯","电动TVC代替液压，降重降本",       "core","002025","A股",["002025"]),

    ("rk_lcv",      200, 420, "液体火箭整箭", "🚀","长征/朱雀/星河，LEO>10吨",       "downstream","未上市","未上市",[]),
    ("rk_scv",      600, 420, "固体火箭整箭", "🚀","快舟/力箭/谷神星，快速入轨",     "downstream","未上市","未上市",[]),
    ("rk_reuse",   1000, 420, "可复用火箭",   "♻️","一子级回收，成本降低80%",        "downstream","未上市","未上市",[]),
    ("rk_spacex",  1400, 420, "SpaceX猎鹰9", "🌟","全球复用标杆，$2800/kg",          "downstream","SPCE","美股",[]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in RKT_NODES:
    upsert_node(dict(
        industry_id="as_rocket", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

RKT_EDGES = [
    ("e-rk-cf-stg",  "rk_cf",      "rk_stage",    "碳纤维"),
    ("e-rk-sa-eng",  "rk_superal", "rk_engine",   "高温合金"),
    ("e-rk-ti-eng",  "rk_titan",   "rk_engine",   "钛合金"),
    ("e-rk-se-eng",  "rk_seal",    "rk_engine",   "密封"),
    ("e-rk-co-av",   "rk_comp",    "rk_avionics", "元器件"),
    ("e-rk-gy-av",   "rk_gyro",    "rk_avionics", "惯导"),
    ("e-rk-eng-lcv", "rk_engine",  "rk_lcv",      "液体推进"),
    ("e-rk-sol-scv", "rk_solid",   "rk_scv",      "固体推进"),
    ("e-rk-stg-lcv", "rk_stage",   "rk_lcv",      "箭体"),
    ("e-rk-stg-scv", "rk_stage",   "rk_scv",      "箭体"),
    ("e-rk-av-lcv",  "rk_avionics","rk_lcv",      "制导"),
    ("e-rk-tvc-lcv", "rk_tvc",     "rk_lcv",      "姿控"),
    ("e-rk-lcv-reu", "rk_lcv",     "rk_reuse",    "可复用"),
    ("e-rk-reu-sx",  "rk_reuse",   "rk_spacex",   "对标"),
]
for eid, src, tgt, lbl in RKT_EDGES:
    upsert_edge(dict(
        industry_id="as_rocket", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 25. as_satellite — 卫星平台/制造
# =============================================================================
print("写入 as_satellite ...")

SAT_STOCKS = [
    ("600118", "中国卫星",  "A股"),
    ("600879", "航天电子",  "A股"),
    ("002049", "紫光国微",  "A股"),
    ("000733", "振华科技",  "A股"),
    ("002025", "航天电器",  "A股"),
    ("002985", "北摩高科",  "A股"),
]
add_stocks(SAT_STOCKS, "as_satellite")
upsert_list(dict(
    industry_id="as_satellite",
    name="卫星平台/制造",
    sort_order=25,
    description="卫星本体平台集成结构/热控/姿轨控/供配电，中国卫星/紫光国微/振华科技为国内核心供应商",
    icon="🛰️",
    company_count=len(SAT_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["中国卫星", "紫光国微", "振华科技", "航天电子"], ensure_ascii=False),
    updated_at=NOW,
    tab="aerospace",
))
upsert_meta(dict(
    industry_id="as_satellite",
    sort_order=25,
    title="卫星平台/制造供应链",
    subtitle="低轨星座大批量制造推动卫星成本从1亿降至百万级",
    layer_labels=json.dumps(["L0 关键元器件", "L1 平台分系统", "L2 卫星总装", "L3 星座部署"], ensure_ascii=False),
    updated_at=NOW,
))

SAT_NODES = [
    ("st_rad_chip",  130,   0, "抗辐射芯片",  "💻","宇航级FPGA/MCU/存储器",           "upstream","002049","A股",["002049"]),
    ("st_passiv",    430,   0, "被动元件",    "🔌","航天级电阻/电容/晶振",             "upstream","000733","A股",["000733"]),
    ("st_solar",     730,   0, "砷化镓太阳能电池","☀️","三结GaAs电池，效率28%+",       "upstream","000733","A股",["000733"]),
    ("st_battery",  1030,   0, "锂离子蓄电池","🔋","航天级高可靠电池组",               "upstream","000733","A股",["000733"]),
    ("st_bearing",  1330,   0, "精密轴承",    "⚙️","飞轮/CMG用精密轴承",              "upstream","002985","A股",["002985"]),
    ("st_connector",1630,   0, "航天连接器",  "🔌","高可靠射频/电连接器",              "upstream","002025","A股",["002025"]),

    ("st_structure", 200, 210, "卫星结构舱",  "🔩","铝蜂窝/碳纤维主结构",             "core","600118","A股",["600118"]),
    ("st_thermal",   560, 210, "热控系统",    "🌡️","热管/散热板/MLI多层隔热",         "core","600118","A股",["600118"]),
    ("st_adcs",      920, 210, "姿轨控系统",  "🌀","陀螺仪+星敏+磁力矩器",            "core","600879","A股",["600879"]),
    ("st_eps",      1280, 210, "供配电系统",  "⚡","PCDU/蓄电池/太阳帆板调控",        "core","000733","A股",["000733"]),
    ("st_obc",      1620, 210, "星务计算机",  "💻","卫星中央管理单元，抗辐射",         "core","002049","A股",["002049"]),

    ("st_leo",       200, 420, "LEO小卫星",   "🛰️","100-500kg，互联网/遥感星座",     "downstream","600118","A股",["600118"]),
    ("st_geo",       600, 420, "GEO大卫星",   "🛰️","3-6吨，广播/固定通信",           "downstream","600118","A股",["600118"]),
    ("st_constel",  1050, 420, "大规模星座",  "🌐","千颗以上，星链/G60路线",          "downstream","601698","A股",["601698"]),
    ("st_spacex_s", 1450, 420, "SpaceX星链",  "🌟","6000+颗，全球首大星座",           "downstream","SPCE","美股",[]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in SAT_NODES:
    upsert_node(dict(
        industry_id="as_satellite", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

SAT_EDGES = [
    ("e-st-rc-obc",  "st_rad_chip",  "st_obc",      "宇航芯片"),
    ("e-st-pa-eps",  "st_passiv",    "st_eps",       "被动件"),
    ("e-st-sl-eps",  "st_solar",     "st_eps",       "发电"),
    ("e-st-ba-eps",  "st_battery",   "st_eps",       "储能"),
    ("e-st-be-adcs", "st_bearing",   "st_adcs",      "飞轮轴承"),
    ("e-st-co-obc",  "st_connector", "st_obc",       "连接"),
    ("e-st-str-leo", "st_structure", "st_leo",       "结构"),
    ("e-st-th-leo",  "st_thermal",   "st_leo",       "热控"),
    ("e-st-ad-leo",  "st_adcs",      "st_leo",       "姿控"),
    ("e-st-ep-leo",  "st_eps",       "st_leo",       "供电"),
    ("e-st-ob-leo",  "st_obc",       "st_leo",       "计算"),
    ("e-st-str-geo", "st_structure", "st_geo",       "结构"),
    ("e-st-leo-con", "st_leo",       "st_constel",   "星座"),
    ("e-st-con-sx",  "st_constel",   "st_spacex_s",  "对标"),
]
for eid, src, tgt, lbl in SAT_EDGES:
    upsert_edge(dict(
        industry_id="as_satellite", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 26. as_payload — 有效载荷
# =============================================================================
print("写入 as_payload ...")

PAYLOAD_STOCKS = [
    ("688523", "航天环宇",  "A股"),
    ("600990", "四创电子",  "A股"),
    ("688776", "国光电气",  "A股"),
    ("688439", "振华风光",  "A股"),
    ("001270", "铖昌科技",  "A股"),
    ("600879", "航天电子",  "A股"),
]
add_stocks(PAYLOAD_STOCKS, "as_payload")
upsert_list(dict(
    industry_id="as_payload",
    name="有效载荷/载荷电子",
    sort_order=26,
    description="载荷是卫星功能实现核心，行波管放大器/特种半导体/相控阵天线决定卫星通信遥感性能",
    icon="📡",
    company_count=len(PAYLOAD_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["航天环宇", "国光电气", "四创电子", "铖昌科技"], ensure_ascii=False),
    updated_at=NOW,
    tab="aerospace",
))
upsert_meta(dict(
    industry_id="as_payload",
    sort_order=26,
    title="有效载荷供应链",
    subtitle="卫星载荷决定功能，行波管/相控阵/特种芯片是卡脖子环节",
    layer_labels=json.dumps(["L0 核心元件", "L1 载荷子系统", "L2 载荷总成", "L3 卫星应用"], ensure_ascii=False),
    updated_at=NOW,
))

PAY_NODES = [
    ("py_twt",      130,   0, "行波管放大器", "📡","卫星通信/雷达核心功率器件",       "upstream","688776","A股",["688776"]),
    ("py_spe_ic",   430,   0, "特种半导体",   "💻","GaAs/GaN/SiGe射频芯片",          "upstream","688439","A股",["688439","001270"]),
    ("py_optical",  730,   0, "空间光学镜头", "🔭","遥感相机光学系统",                "upstream","688523","A股",["688523"]),
    ("py_detector", 1030,  0, "红外/多光谱探测器","🌡️","TDI-CCD/CMOS星载探测器",     "upstream","688523","A股",["688523"]),
    ("py_antenna",  1330,  0, "相控阵天线单元","📡","T/R组件，氮化镓功放",            "upstream","001270","A股",["001270","600990"]),
    ("py_filter",   1630,  0, "微波滤波器",   "🔧","星载高Q值腔体滤波器",             "upstream","688523","A股",["688523"]),

    ("py_comm_pl",  200,  210, "通信载荷",    "📶","转发器/相控阵天线，信号中继",     "core","688776","A股",["688776","001270"]),
    ("py_sar",      560,  210, "SAR雷达载荷", "📡","合成孔径雷达，全天时成像",        "core","600990","A股",["600990","688523"]),
    ("py_optical_pl",920, 210, "光学遥感载荷","🔭","可见/红外/多光谱相机",            "core","688523","A股",["688523"]),
    ("py_nav_pl",  1280,  210, "导航载荷",    "📍","原子钟/导航信号生成器",           "core","688439","A股",["688439"]),
    ("py_sci",     1620,  210, "科学探测载荷","🔬","空间环境/粒子探测器",             "core","600879","A股",["600879"]),

    ("py_comm_sat", 200,  420, "通信卫星",    "📶","GEO/LEO宽带通信卫星",           "downstream","601698","A股",["601698"]),
    ("py_obs_sat",  600,  420, "遥感卫星",    "🌍","光学/SAR遥感星座",              "downstream","600118","A股",["600118"]),
    ("py_nav_sat",  1050, 420, "导航卫星",    "📍","北斗三号IGSO/MEO",              "downstream","600118","A股",["600118"]),
    ("py_spacex_pl",1450, 420, "SpaceX星链载荷","🌟","相控阵Ka/Ku波段，全球宽带",   "downstream","SPCE","美股",[]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in PAY_NODES:
    upsert_node(dict(
        industry_id="as_payload", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

PAY_EDGES = [
    ("e-py-twt-cp",  "py_twt",      "py_comm_pl",   "功率放大"),
    ("e-py-si-cp",   "py_spe_ic",   "py_comm_pl",   "射频芯片"),
    ("e-py-op-opl",  "py_optical",  "py_optical_pl","光学系统"),
    ("e-py-dt-opl",  "py_detector", "py_optical_pl","探测器"),
    ("e-py-ant-cp",  "py_antenna",  "py_comm_pl",   "相控阵"),
    ("e-py-ant-sar", "py_antenna",  "py_sar",       "雷达天线"),
    ("e-py-flt-cp",  "py_filter",   "py_comm_pl",   "滤波"),
    ("e-py-si-np",   "py_spe_ic",   "py_nav_pl",    "时钟芯片"),
    ("e-py-cp-cs",   "py_comm_pl",  "py_comm_sat",  "通信载荷"),
    ("e-py-opl-os",  "py_optical_pl","py_obs_sat",  "遥感载荷"),
    ("e-py-sar-os",  "py_sar",      "py_obs_sat",   "SAR载荷"),
    ("e-py-np-ns",   "py_nav_pl",   "py_nav_sat",   "导航载荷"),
    ("e-py-cp-sx",   "py_comm_pl",  "py_spacex_pl", "对标"),
]
for eid, src, tgt, lbl in PAY_EDGES:
    upsert_edge(dict(
        industry_id="as_payload", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 27. as_satcom — 卫星通信
# =============================================================================
print("写入 as_satcom ...")

SATCOM_STOCKS = [
    ("601698", "中国卫通",  "A股"),
    ("688311", "盟升电子",  "A股"),
    ("300045", "华力创通",  "A股"),
    ("002465", "海格通信",  "A股"),
    ("603712", "七一二",    "A股"),
    ("002544", "普天科技",  "A股"),
]
add_stocks(SATCOM_STOCKS, "as_satcom")
upsert_list(dict(
    industry_id="as_satcom",
    name="卫星通信",
    sort_order=27,
    description="GEO/LEO卫星互联网提供全球覆盖宽带接入，中国卫通/盟升电子/海格通信为核心运营与设备商",
    icon="📶",
    company_count=len(SATCOM_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["中国卫通", "盟升电子", "海格通信", "华力创通"], ensure_ascii=False),
    updated_at=NOW,
    tab="aerospace",
))
upsert_meta(dict(
    industry_id="as_satcom",
    sort_order=27,
    title="卫星通信供应链",
    subtitle="GEO高通量+LEO低轨星座双轮驱动，卫星互联网进入商业爆发期",
    layer_labels=json.dumps(["L0 芯片/部件", "L1 卫星/地面设备", "L2 网络运营", "L3 行业应用"], ensure_ascii=False),
    updated_at=NOW,
))

COM_NODES = [
    ("cm_modem_chip", 130,  0, "卫星调制解调芯片","💻","DVB-S2X/DVB-RCS2 ASIC",        "upstream","688311","A股",["688311"]),
    ("cm_pa",         430,  0, "功率放大器PA",   "📡","GaN SSPA/TWTA功放",              "upstream","688776","A股",["688776"]),
    ("cm_lnb",        730,  0, "低噪声放大器",   "📡","LNB/LNA，灵敏度核心",            "upstream","688311","A股",["688311"]),
    ("cm_antenna_dish",1030,0, "天线/碟形天线",  "📡","VSAT固定天线/相控阵平板天线",    "upstream","688311","A股",["688311","300045"]),
    ("cm_router",     1330, 0, "卫星路由/调制器","🔧","基带处理/调制解调一体机",         "upstream","300045","A股",["300045","603712"]),
    ("cm_encrypt",    1630, 0, "加密/安全模块",  "🔒","卫星通信数据加密芯片",            "upstream","002049","A股",["002049"]),

    ("cm_geo_sat",    200, 210, "GEO高通量卫星","🛰️","HTS高通量转发器，100Gbps+",       "core","601698","A股",["601698"]),
    ("cm_leo_sat",    560, 210, "LEO互联网星座","🌐","低轨宽带，低延迟20ms",             "core","601698","A股",["601698"]),
    ("cm_vsat_gw",    920, 210, "VSAT关口站",   "📡","地面网关站，信号汇聚上行",        "core","688311","A股",["688311"]),
    ("cm_terminal",  1280, 210, "卫星终端",     "📱","船/车/机载/手持用户终端",         "core","300045","A股",["300045","002465"]),
    ("cm_ntn",       1620, 210, "NTN非地面网络","📶","3GPP NTN手机直连卫星",            "core","603712","A股",["603712","002544"]),

    ("cm_maritime",   200, 420, "海事通信",     "🚢","船舶宽带/AIS/导航集成",          "downstream","002465","A股",["002465"]),
    ("cm_aviation",   600, 420, "航空宽带",     "✈️","飞机Wi-Fi，Ka波段高通量",        "downstream","688311","A股",["688311"]),
    ("cm_rural",     1000, 420, "偏远地区接入", "🌄","农村/海岛卫星宽带",              "downstream","601698","A股",["601698"]),
    ("cm_starlink",  1400, 420, "SpaceX星链",   "🌟","200Mbps/25ms，全球2M+用户",      "downstream","SPCE","美股",[]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in COM_NODES:
    upsert_node(dict(
        industry_id="as_satcom", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

COM_EDGES = [
    ("e-cm-md-vg",   "cm_modem_chip","cm_vsat_gw",  "调制解调"),
    ("e-cm-pa-geo",  "cm_pa",       "cm_geo_sat",   "功率放大"),
    ("e-cm-lnb-tm",  "cm_lnb",      "cm_terminal",  "低噪接收"),
    ("e-cm-ant-vg",  "cm_antenna_dish","cm_vsat_gw","天线"),
    ("e-cm-rt-vg",   "cm_router",   "cm_vsat_gw",   "路由"),
    ("e-cm-enc-ntn", "cm_encrypt",  "cm_ntn",       "加密"),
    ("e-cm-geo-mr",  "cm_geo_sat",  "cm_maritime",  "海事"),
    ("e-cm-geo-av",  "cm_geo_sat",  "cm_aviation",  "航空"),
    ("e-cm-leo-ru",  "cm_leo_sat",  "cm_rural",     "宽带"),
    ("e-cm-vg-geo",  "cm_vsat_gw",  "cm_geo_sat",   "上行"),
    ("e-cm-tm-ntn",  "cm_terminal", "cm_ntn",       "终端"),
    ("e-cm-leo-sl",  "cm_leo_sat",  "cm_starlink",  "对标"),
]
for eid, src, tgt, lbl in COM_EDGES:
    upsert_edge(dict(
        industry_id="as_satcom", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 28. as_satnav — 卫星导航/北斗
# =============================================================================
print("写入 as_satnav ...")

NAV_STOCKS = [
    ("002151", "北斗星通",  "A股"),
    ("002465", "海格通信",  "A股"),
    ("300177", "中海达",    "A股"),
    ("300627", "华测导航",  "A股"),
    ("002405", "四维图新",  "A股"),
    ("688568", "中科星图",  "A股"),
]
add_stocks(NAV_STOCKS, "as_satnav")
upsert_list(dict(
    industry_id="as_satnav",
    name="卫星导航/北斗",
    sort_order=28,
    description="北斗三号全球组网完成，北斗芯片/高精度模组/行业终端进入爆发期，北斗星通/海格通信/中海达国内龙头",
    icon="📍",
    company_count=len(NAV_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["北斗星通", "中海达", "华测导航", "海格通信"], ensure_ascii=False),
    updated_at=NOW,
    tab="aerospace",
))
upsert_meta(dict(
    industry_id="as_satnav",
    sort_order=28,
    title="卫星导航/北斗供应链",
    subtitle="北斗三号已完全替代GPS在国内应用，高精度定位进入厘米级",
    layer_labels=json.dumps(["L0 芯片/基础", "L1 模组/板卡", "L2 终端产品", "L3 行业应用"], ensure_ascii=False),
    updated_at=NOW,
))

NAV_NODES = [
    ("nv_bdchip",   130,   0, "北斗基带芯片", "💻","多频多系统GNSS基带SOC",           "upstream","002151","A股",["002151"]),
    ("nv_rfchip",   430,   0, "射频芯片",     "📡","GNSS射频前端芯片",                "upstream","001270","A股",["001270"]),
    ("nv_atomclk",  730,   0, "高精度时钟",   "⏱️","铷原子钟/OCXO，授时基础",         "upstream","688439","A股",["688439"]),
    ("nv_inertial", 1030,  0, "惯性传感器",   "🌀","MEMS-IMU，组合导航必备",          "upstream","002151","A股",["002151"]),
    ("nv_map",      1330,  0, "高精地图数据", "🗺️","车道级地图，厘米精度",            "upstream","002405","A股",["002405"]),
    ("nv_antenna_g",1630,  0, "GNSS天线",     "📡","高增益低噪声导航天线",            "upstream","002151","A股",["002151"]),

    ("nv_module",   200,  210, "GNSS模组",    "📦","北斗/GPS/GLONASS多频模组",        "core","002151","A股",["002151","300177"]),
    ("nv_hpgnss",   560,  210, "高精度GNSS板卡","📏","RTK厘米级定位，测量/无人机",   "core","300177","A股",["300177","300627"]),
    ("nv_ins",      920,  210, "组合导航系统", "🌀","GNSS+IMU融合，无缝定位",         "core","002465","A股",["002465","300177"]),
    ("nv_timing",  1280,  210, "北斗授时",    "⏱️","高精度授时服务，ns级精度",        "core","002151","A股",["002151"]),
    ("nv_sbas",    1620,  210, "增强系统",    "📡","SBAS/CORS差分增强网络",           "core","300627","A股",["300627"]),

    ("nv_auto",     200,  420, "车载导航",    "🚗","高精地图+L3/L4自动驾驶定位",     "downstream","002405","A股",["002405","002151"]),
    ("nv_survey",   600,  420, "测量/工程",   "📐","RTK测绘仪/工程机械定位",         "downstream","300177","A股",["300177","300627"]),
    ("nv_agri",    1000,  420, "精准农业",    "🌾","农机自动驾驶/播种导航",           "downstream","300177","A股",["300177"]),
    ("nv_gis",     1400,  420, "GIS/遥感融合","🌍","位置+遥感数据叠加分析",          "downstream","688568","A股",["688568","002405"]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in NAV_NODES:
    upsert_node(dict(
        industry_id="as_satnav", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

NAV_EDGES = [
    ("e-nv-bc-md",  "nv_bdchip",   "nv_module",   "基带"),
    ("e-nv-rf-md",  "nv_rfchip",   "nv_module",   "射频"),
    ("e-nv-clk-tm", "nv_atomclk",  "nv_timing",   "时钟"),
    ("e-nv-ine-ins","nv_inertial", "nv_ins",      "惯性"),
    ("e-nv-map-au", "nv_map",      "nv_auto",     "地图"),
    ("e-nv-ant-md", "nv_antenna_g","nv_module",   "天线"),
    ("e-nv-md-hp",  "nv_module",   "nv_hpgnss",   "基础"),
    ("e-nv-hp-ins", "nv_hpgnss",   "nv_ins",      "GNSS"),
    ("e-nv-ins-au", "nv_ins",      "nv_auto",     "定位"),
    ("e-nv-sb-hp",  "nv_sbas",     "nv_hpgnss",   "增强"),
    ("e-nv-hp-sv",  "nv_hpgnss",   "nv_survey",   "RTK"),
    ("e-nv-hp-ag",  "nv_hpgnss",   "nv_agri",     "农机"),
    ("e-nv-gis-md", "nv_module",   "nv_gis",      "位置"),
    ("e-nv-gis-gs", "nv_gis",      "nv_gis",      "融合"),
]
for eid, src, tgt, lbl in NAV_EDGES:
    upsert_edge(dict(
        industry_id="as_satnav", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 29. as_remote — 遥感/对地观测
# =============================================================================
print("写入 as_remote ...")

REMOTE_STOCKS = [
    ("688568", "中科星图",  "A股"),
    ("002405", "四维图新",  "A股"),
    ("300627", "华测导航",  "A股"),
    ("600118", "中国卫星",  "A股"),
    ("688523", "航天环宇",  "A股"),
    ("600990", "四创电子",  "A股"),
]
add_stocks(REMOTE_STOCKS, "as_remote")
upsert_list(dict(
    industry_id="as_remote",
    name="遥感/对地观测",
    sort_order=29,
    description="光学/SAR/高光谱卫星遥感数据+AI解译构成数字地球底座，中科星图/四维图新为国内领军企业",
    icon="🌍",
    company_count=len(REMOTE_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["中科星图", "四维图新", "中国卫星", "四创电子"], ensure_ascii=False),
    updated_at=NOW,
    tab="aerospace",
))
upsert_meta(dict(
    industry_id="as_remote",
    sort_order=29,
    title="遥感/对地观测供应链",
    subtitle="遥感卫星+AI解译+GIS平台，构建数字地球实时感知体系",
    layer_labels=json.dumps(["L0 传感器/载荷", "L1 遥感卫星", "L2 数据处理", "L3 行业应用"], ensure_ascii=False),
    updated_at=NOW,
))

RMT_NODES = [
    ("rm_optical_s", 130,  0, "高分光学相机",  "🔭","0.5m分辨率光学载荷",             "upstream","688523","A股",["688523"]),
    ("rm_sar_s",     430,  0, "SAR合成孔径雷达","📡","全天时成像，穿云穿雨",           "upstream","600990","A股",["600990"]),
    ("rm_hyper",     730,  0, "高光谱传感器",  "🌈","200波段，农业/矿产勘测",          "upstream","688523","A股",["688523"]),
    ("rm_lidar",    1030,  0, "激光雷达载荷",  "💚","DEM数字高程，精度cm级",           "upstream","300627","A股",["300627"]),
    ("rm_ai_chip",  1330,  0, "AI推理芯片",    "💻","星上智能处理，减少回传数据量",    "upstream","002049","A股",["002049"]),
    ("rm_downlink", 1630,  0, "高速下行链路",  "📡","X/Ka波段数据传输，10Gbps+",       "upstream","600990","A股",["600990"]),

    ("rm_optical_sat",200, 210,"光学遥感卫星", "🛰️","0.5-2m分辨率，全球重访<1天",    "core","600118","A股",["600118"]),
    ("rm_sar_sat",    560, 210,"SAR遥感卫星",  "📡","1m SAR，夜间/云覆盖成像",       "core","600118","A股",["600118"]),
    ("rm_data_proc",  920, 210,"地面数据处理", "💻","辐射定标/几何校正/正射",        "core","688568","A股",["688568"]),
    ("rm_ai_interp", 1280, 210,"AI智能解译",   "🧠","目标检测/变化检测/语义分割",    "core","688568","A股",["688568","002405"]),
    ("rm_gis_plat",  1620, 210,"GIS时空平台",  "🌐","多源遥感数据融合与分析",        "core","688568","A股",["688568"]),

    ("rm_agri",      200,  420,"精准农业",     "🌾","作物长势/病虫害/产量预估",       "downstream","688568","A股",["688568"]),
    ("rm_disaster",  600,  420,"灾害应急",     "🆘","洪涝/地震/火灾快速评估",        "downstream","688568","A股",["688568"]),
    ("rm_urban",    1000,  420,"城市规划",     "🏙️","变化监测/数字城市底座",          "downstream","002405","A股",["002405"]),
    ("rm_planet",   1400,  420,"Planet Labs",  "🌟","行星实验室，全球每日一拍",       "downstream","PL","美股",[]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in RMT_NODES:
    upsert_node(dict(
        industry_id="as_remote", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

RMT_EDGES = [
    ("e-rm-ops-os", "rm_optical_s",  "rm_optical_sat","光学载荷"),
    ("e-rm-ss-ss",  "rm_sar_s",      "rm_sar_sat",   "SAR载荷"),
    ("e-rm-hy-os",  "rm_hyper",      "rm_optical_sat","光谱"),
    ("e-rm-li-dp",  "rm_lidar",      "rm_data_proc", "高程"),
    ("e-rm-ai-ai",  "rm_ai_chip",    "rm_ai_interp", "星上AI"),
    ("e-rm-dl-dp",  "rm_downlink",   "rm_data_proc", "下行数据"),
    ("e-rm-os-dp",  "rm_optical_sat","rm_data_proc", "影像"),
    ("e-rm-ss-dp",  "rm_sar_sat",    "rm_data_proc", "SAR数据"),
    ("e-rm-dp-ai",  "rm_data_proc",  "rm_ai_interp", "处理后数据"),
    ("e-rm-ai-gis", "rm_ai_interp",  "rm_gis_plat",  "解译结果"),
    ("e-rm-gis-ag", "rm_gis_plat",   "rm_agri",      "农业应用"),
    ("e-rm-gis-di", "rm_gis_plat",   "rm_disaster",  "应急"),
    ("e-rm-gis-ur", "rm_gis_plat",   "rm_urban",     "城市"),
    ("e-rm-os-pl",  "rm_optical_sat","rm_planet",    "对标"),
]
for eid, src, tgt, lbl in RMT_EDGES:
    upsert_edge(dict(
        industry_id="as_remote", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# 30. as_ground — 地面站/测控系统
# =============================================================================
print("写入 as_ground ...")

GND_STOCKS = [
    ("600990", "四创电子",  "A股"),
    ("603712", "七一二",    "A股"),
    ("600879", "航天电子",  "A股"),
    ("688311", "盟升电子",  "A股"),
    ("002985", "北摩高科",  "A股"),
    ("600118", "中国卫星",  "A股"),
]
add_stocks(GND_STOCKS, "as_ground")
upsert_list(dict(
    industry_id="as_ground",
    name="地面站/测控系统",
    sort_order=30,
    description="地面测控是卫星运营管理命脉，测控雷达/遥测遥控/数据处理构成地面段，四创电子/七一二为国内龙头",
    icon="📡",
    company_count=len(GND_STOCKS),
    last_analyzed="2026-07-02",
    representatives=json.dumps(["四创电子", "七一二", "航天电子", "盟升电子"], ensure_ascii=False),
    updated_at=NOW,
    tab="aerospace",
))
upsert_meta(dict(
    industry_id="as_ground",
    sort_order=30,
    title="地面站/测控系统供应链",
    subtitle="测控系统是卫星在轨运行的神经中枢，覆盖从发射到退役全生命周期",
    layer_labels=json.dumps(["L0 核心设备", "L1 地面站系统", "L2 测控网络", "L3 卫星运营"], ensure_ascii=False),
    updated_at=NOW,
))

GND_NODES = [
    ("gd_radar_comp",130,  0, "相控阵雷达组件","📡","T/R模块/天线阵面，测控/侦察",    "upstream","600990","A股",["600990"]),
    ("gd_hpa",        430, 0, "高功率放大器",  "📡","TWT/SSPA，上行站发射链路",       "upstream","688776","A股",["688776"]),
    ("gd_lna",        730, 0, "低噪声放大器",  "📡","下行链路接收，低噪声关键",       "upstream","688311","A股",["688311"]),
    ("gd_modem",     1030, 0, "测控调制解调器","💻","遥测遥控信号处理",               "upstream","603712","A股",["603712"]),
    ("gd_timing",    1330, 0, "高精度授时设备","⏱️","氢钟/铷钟，ns级时间基准",        "upstream","688439","A股",["688439"]),
    ("gd_bearing_g", 1630, 0, "大型精密轴承",  "⚙️","天线座架转动轴承",              "upstream","002985","A股",["002985"]),

    ("gd_tcc",        200, 210,"测控站系统",   "📡","遥测/遥控/跟踪一体化地面站",    "core","600990","A股",["600990","603712"]),
    ("gd_data_center",560, 210,"数据处理中心", "💻","卫星数据接收/存档/分发",        "core","600879","A股",["600879"]),
    ("gd_moc",        920, 210,"卫星控制中心", "🖥️","MOC任务运控/卫星状态监控",      "core","600118","A股",["600118"]),
    ("gd_gateway",   1280, 210,"卫星网关站",   "📡","通信卫星信关站/波束管理",       "core","688311","A股",["688311"]),
    ("gd_laser",     1620, 210,"激光测距站",   "💚","厘米级轨道精测，SLR激光站",     "core","600879","A股",["600879"]),

    ("gd_launch_ctrl",200, 420,"发射测控",     "🚀","火箭遥测/安控/轨道测量",       "downstream","600879","A股",["600879"]),
    ("gd_orbit_ops",  600, 420,"在轨运营",     "🛰️","轨道维持/姿态控制/寿命管理",   "downstream","600118","A股",["600118"]),
    ("gd_data_svc",  1050, 420,"数据服务",     "📊","卫星数据增值服务/API接口",     "downstream","688568","A股",["688568"]),
    ("gd_ground_net",1450, 420,"全球测控网",   "🌐","多国地面站组网，全弧段覆盖",   "downstream","600118","A股",["600118"]),
]
for nid, x, y, label, icon, desc, layer, ticker, market, stocks in GND_NODES:
    upsert_node(dict(
        industry_id="as_ground", node_id=nid, x=x, y=y,
        label=label, icon=icon, desc=desc, layer=layer,
        ticker=ticker, market=market, stocks=json.dumps(stocks), updated_at=NOW,
    ))

GND_EDGES = [
    ("e-gd-rc-tcc",  "gd_radar_comp","gd_tcc",      "雷达"),
    ("e-gd-hp-tcc",  "gd_hpa",       "gd_tcc",      "发射"),
    ("e-gd-lna-tcc", "gd_lna",       "gd_tcc",      "接收"),
    ("e-gd-md-tcc",  "gd_modem",     "gd_tcc",      "调制"),
    ("e-gd-tm-moc",  "gd_timing",    "gd_moc",      "授时"),
    ("e-gd-be-tcc",  "gd_bearing_g", "gd_tcc",      "转台"),
    ("e-gd-tcc-dc",  "gd_tcc",       "gd_data_center","遥测数据"),
    ("e-gd-tcc-moc", "gd_tcc",       "gd_moc",      "控制链"),
    ("e-gd-gw-moc",  "gd_gateway",   "gd_moc",      "网关数据"),
    ("e-gd-ls-moc",  "gd_laser",     "gd_moc",      "精轨"),
    ("e-gd-moc-lc",  "gd_moc",       "gd_launch_ctrl","发射指控"),
    ("e-gd-moc-oo",  "gd_moc",       "gd_orbit_ops","在轨控制"),
    ("e-gd-dc-ds",   "gd_data_center","gd_data_svc", "数据"),
    ("e-gd-oo-gn",   "gd_orbit_ops", "gd_ground_net","组网"),
]
for eid, src, tgt, lbl in GND_EDGES:
    upsert_edge(dict(
        industry_id="as_ground", edge_id=eid, source=src, target=tgt,
        layer="", label=lbl, updated_at=NOW,
    ))

# =============================================================================
# Commit
# =============================================================================
db.commit()
db.close()

print("=== aerospace v2 seed complete ===")

from db import SessionLocal as S2, IndustryList as IL
from db import IndustryNode as IN, IndustryEdge as IE

d2 = S2()
as_ids = ["as_overview","as_rocket","as_satellite","as_payload","as_satcom","as_satnav","as_remote","as_ground"]
for iid in as_ids:
    nc = d2.query(IN).filter(IN.industry_id==iid).count()
    ec = d2.query(IE).filter(IE.industry_id==iid).count()
    r = d2.query(IL).filter(IL.industry_id==iid).first()
    print(f"  {iid}: nodes={nc} edges={ec} tab={r.tab if r else 'NOT FOUND'}")
d2.close()
