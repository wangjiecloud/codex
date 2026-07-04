"""
seed_aerospace_v3.py
重写商业航天8子产业 industry_node / industry_edge
每个节点 = 一家企业，label=企业名，stocks=[单个代码]
对齐 PCB 产业链图谱格式
"""
import json
from sqlalchemy import create_engine, text
from datetime import datetime

engine = create_engine("sqlite:///stock_data.db")

INDUSTRIES = {}

# ──────────────── as_overview ────────────────
INDUSTRIES["as_overview"] = {
    "nodes": [
        # upstream y=0 材料/部件供应
        {"node_id":"aso_n01","label":"光威复材","desc":"碳纤维复合材料，运载火箭/卫星结构件","layer":"upstream","ticker":"300699","stocks":["300699"],"group_name":"碳纤维材料","x":100,"y":0},
        {"node_id":"aso_n02","label":"中简科技","desc":"高强/高模碳纤维，航天高温结构","layer":"upstream","ticker":"300777","stocks":["300777"],"group_name":"碳纤维材料","x":300,"y":0},
        {"node_id":"aso_n03","label":"斯瑞新材","desc":"钼铜合金/导热材料，卫星热控","layer":"upstream","ticker":"688102","stocks":["688102"],"group_name":"特种金属","x":500,"y":0},
        {"node_id":"aso_n04","label":"铂力特","desc":"金属3D打印，火箭发动机精密件","layer":"upstream","ticker":"688333","stocks":["688333"],"group_name":"增材制造","x":700,"y":0},
        {"node_id":"aso_n05","label":"国光电气","desc":"微波管/行波管，卫星通信载荷","layer":"upstream","ticker":"688776","stocks":["688776"],"group_name":"微波器件","x":900,"y":0},
        {"node_id":"aso_n06","label":"振华风光","desc":"宇航级集成电路，卫星核心芯片","layer":"upstream","ticker":"688439","stocks":["688439"],"group_name":"宇航电子","x":1100,"y":0},
        # core y=210 整星/整箭制造
        {"node_id":"aso_n07","label":"航天电子","desc":"卫星/火箭电子系统，电连接器","layer":"core","ticker":"600879","stocks":["600879"],"group_name":"航天电子","x":100,"y":210},
        {"node_id":"aso_n08","label":"中国卫星","desc":"遥感/通信卫星研制，整星制造","layer":"core","ticker":"600118","stocks":["600118"],"group_name":"卫星制造","x":350,"y":210},
        {"node_id":"aso_n09","label":"航天晨光","desc":"运载火箭结构件，地面配套设备","layer":"core","ticker":"600501","stocks":["600501"],"group_name":"火箭结构","x":600,"y":210},
        {"node_id":"aso_n10","label":"航天环宇","desc":"商业卫星研制，SAR/光学遥感","layer":"core","ticker":"688523","stocks":["688523"],"group_name":"商业卫星","x":850,"y":210},
        {"node_id":"aso_n11","label":"航天电器","desc":"高可靠连接器，火箭/卫星配套","layer":"core","ticker":"002025","stocks":["002025"],"group_name":"航天连接器","x":1100,"y":210},
        {"node_id":"aso_n12","label":"四创电子","desc":"雷达/电子对抗，卫星信号处理","layer":"core","ticker":"600990","stocks":["600990"],"group_name":"星载电子","x":1350,"y":210},
        # downstream y=420 应用服务
        {"node_id":"aso_n13","label":"中国卫通","desc":"卫星通信运营，GEO卫星广播","layer":"downstream","ticker":"601698","stocks":["601698"],"group_name":"卫星运营","x":100,"y":420},
        {"node_id":"aso_n14","label":"北斗星通","desc":"北斗/GNSS导航终端，位置服务","layer":"downstream","ticker":"002151","stocks":["002151"],"group_name":"导航服务","x":350,"y":420},
        {"node_id":"aso_n15","label":"中科星图","desc":"卫星遥感数据分析，地理信息服务","layer":"downstream","ticker":"688568","stocks":["688568"],"group_name":"遥感应用","x":600,"y":420},
        {"node_id":"aso_n16","label":"四维图新","desc":"高精地图/导航数据，卫星数据应用","layer":"downstream","ticker":"002405","stocks":["002405"],"group_name":"数据服务","x":850,"y":420},
        {"node_id":"aso_n17","label":"海格通信","desc":"短波/卫星通信终端，军民两用","layer":"downstream","ticker":"002465","stocks":["002465"],"group_name":"卫星通信","x":1100,"y":420},
        {"node_id":"aso_n18","label":"华测导航","desc":"高精度GNSS接收机，卫星导航应用","layer":"downstream","ticker":"300627","stocks":["300627"],"group_name":"导航服务","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"aso_e01","source":"aso_n01","target":"aso_n09","layer":"upstream","label":"碳纤维结构"},
        {"edge_id":"aso_e02","source":"aso_n02","target":"aso_n10","layer":"upstream","label":"高模碳纤维"},
        {"edge_id":"aso_e03","source":"aso_n03","target":"aso_n08","layer":"upstream","label":"热控材料"},
        {"edge_id":"aso_e04","source":"aso_n04","target":"aso_n09","layer":"upstream","label":"3D打印件"},
        {"edge_id":"aso_e05","source":"aso_n05","target":"aso_n12","layer":"upstream","label":"行波管"},
        {"edge_id":"aso_e06","source":"aso_n06","target":"aso_n07","layer":"upstream","label":"宇航芯片"},
        {"edge_id":"aso_e07","source":"aso_n07","target":"aso_n13","layer":"core","label":"卫星电子"},
        {"edge_id":"aso_e08","source":"aso_n08","target":"aso_n13","layer":"core","label":"卫星平台"},
        {"edge_id":"aso_e09","source":"aso_n09","target":"aso_n15","layer":"core","label":"火箭结构"},
        {"edge_id":"aso_e10","source":"aso_n10","target":"aso_n15","layer":"core","label":"商业卫星"},
        {"edge_id":"aso_e11","source":"aso_n11","target":"aso_n16","layer":"core","label":"连接器配套"},
        {"edge_id":"aso_e12","source":"aso_n12","target":"aso_n17","layer":"core","label":"信号处理"},
        {"edge_id":"aso_e13","source":"aso_n08","target":"aso_n14","layer":"core","label":"导航卫星"},
    ]
}

# ──────────────── as_rocket ────────────────
INDUSTRIES["as_rocket"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"asr_n01","label":"光威复材","desc":"碳纤维预浸料，火箭壳体/整流罩","layer":"upstream","ticker":"300699","stocks":["300699"],"group_name":"碳纤维复材","x":100,"y":0},
        {"node_id":"asr_n02","label":"中简科技","desc":"高强碳纤维，固体发动机壳体","layer":"upstream","ticker":"300777","stocks":["300777"],"group_name":"碳纤维复材","x":300,"y":0},
        {"node_id":"asr_n03","label":"斯瑞新材","desc":"钼铜合金，发动机喉衬/热防护","layer":"upstream","ticker":"688102","stocks":["688102"],"group_name":"耐高温材料","x":500,"y":0},
        {"node_id":"asr_n04","label":"铂力特","desc":"激光增材制造，发动机推力室","layer":"upstream","ticker":"688333","stocks":["688333"],"group_name":"增材制造","x":700,"y":0},
        {"node_id":"asr_n05","label":"北摩高科","desc":"高温合金/刹车系统，火箭回收","layer":"upstream","ticker":"002985","stocks":["002985"],"group_name":"高温合金","x":900,"y":0},
        {"node_id":"asr_n06","label":"振华风光","desc":"宇航级IC，控制计算机核心芯片","layer":"upstream","ticker":"688439","stocks":["688439"],"group_name":"宇航电子","x":1100,"y":0},
        # core y=210 火箭系统
        {"node_id":"asr_n07","label":"航天晨光","desc":"运载火箭地面设备，发射配套","layer":"core","ticker":"600501","stocks":["600501"],"group_name":"发射配套","x":100,"y":210},
        {"node_id":"asr_n08","label":"航天电子","desc":"火箭飞控/电气系统，控制计算机","layer":"core","ticker":"600879","stocks":["600879"],"group_name":"飞控系统","x":350,"y":210},
        {"node_id":"asr_n09","label":"航天电器","desc":"高可靠连接器，飞箭弹射接口","layer":"core","ticker":"002025","stocks":["002025"],"group_name":"连接器","x":600,"y":210},
        {"node_id":"asr_n10","label":"四创电子","desc":"测量遥测设备，火箭外测系统","layer":"core","ticker":"600990","stocks":["600990"],"group_name":"测量系统","x":850,"y":210},
        {"node_id":"asr_n11","label":"国光电气","desc":"高功率微波，火箭遥测/引信电子","layer":"core","ticker":"688776","stocks":["688776"],"group_name":"微波电子","x":1100,"y":210},
        {"node_id":"asr_n12","label":"普天科技","desc":"地面通信设备，火箭测控站","layer":"core","ticker":"002544","stocks":["002544"],"group_name":"测控通信","x":1350,"y":210},
        # downstream y=420
        {"node_id":"asr_n13","label":"中国卫通","desc":"卫星发射服务客户，GEO轨道运营","layer":"downstream","ticker":"601698","stocks":["601698"],"group_name":"卫星运营","x":150,"y":420},
        {"node_id":"asr_n14","label":"航天环宇","desc":"商业小卫星，商业火箭主要载荷","layer":"downstream","ticker":"688523","stocks":["688523"],"group_name":"商业卫星","x":450,"y":420},
        {"node_id":"asr_n15","label":"中国卫星","desc":"遥感/通信卫星，国家级发射客户","layer":"downstream","ticker":"600118","stocks":["600118"],"group_name":"国家卫星","x":750,"y":420},
        {"node_id":"asr_n16","label":"盟升电子","desc":"卫星通信终端，星链竞品地面站","layer":"downstream","ticker":"688311","stocks":["688311"],"group_name":"地面终端","x":1050,"y":420},
        {"node_id":"asr_n17","label":"铖昌科技","desc":"相控阵T/R芯片，卫星天线配套","layer":"downstream","ticker":"001270","stocks":["001270"],"group_name":"卫星天线","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"asr_e01","source":"asr_n01","target":"asr_n07","layer":"upstream","label":"碳纤维结构"},
        {"edge_id":"asr_e02","source":"asr_n02","target":"asr_n08","layer":"upstream","label":"壳体材料"},
        {"edge_id":"asr_e03","source":"asr_n03","target":"asr_n08","layer":"upstream","label":"耐高温材料"},
        {"edge_id":"asr_e04","source":"asr_n04","target":"asr_n07","layer":"upstream","label":"3D打印件"},
        {"edge_id":"asr_e05","source":"asr_n05","target":"asr_n07","layer":"upstream","label":"高温合金"},
        {"edge_id":"asr_e06","source":"asr_n06","target":"asr_n08","layer":"upstream","label":"宇航芯片"},
        {"edge_id":"asr_e07","source":"asr_n07","target":"asr_n13","layer":"core","label":"发射配套"},
        {"edge_id":"asr_e08","source":"asr_n08","target":"asr_n14","layer":"core","label":"飞控系统"},
        {"edge_id":"asr_e09","source":"asr_n09","target":"asr_n15","layer":"core","label":"连接器"},
        {"edge_id":"asr_e10","source":"asr_n10","target":"asr_n13","layer":"core","label":"遥测系统"},
        {"edge_id":"asr_e11","source":"asr_n11","target":"asr_n16","layer":"core","label":"微波电子"},
        {"edge_id":"asr_e12","source":"asr_n12","target":"asr_n17","layer":"core","label":"测控通信"},
        {"edge_id":"asr_e13","source":"asr_n08","target":"asr_n16","layer":"core","label":"飞控配套"},
    ]
}

# ──────────────── as_satellite ────────────────
INDUSTRIES["as_satellite"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"assat_n01","label":"振华风光","desc":"宇航级IC/ADC，卫星核心芯片","layer":"upstream","ticker":"688439","stocks":["688439"],"group_name":"宇航芯片","x":100,"y":0},
        {"node_id":"assat_n02","label":"紫光国微","desc":"宇航级FPGA/存储，卫星计算平台","layer":"upstream","ticker":"002049","stocks":["002049"],"group_name":"宇航芯片","x":300,"y":0},
        {"node_id":"assat_n03","label":"斯瑞新材","desc":"钼铜/铝基复合材料，卫星热控","layer":"upstream","ticker":"688102","stocks":["688102"],"group_name":"热控材料","x":500,"y":0},
        {"node_id":"assat_n04","label":"铂力特","desc":"金属3D打印，卫星结构件复杂形状","layer":"upstream","ticker":"688333","stocks":["688333"],"group_name":"增材制造","x":700,"y":0},
        {"node_id":"assat_n05","label":"光威复材","desc":"碳纤维复合材料，卫星桁架/天线","layer":"upstream","ticker":"300699","stocks":["300699"],"group_name":"碳纤维复材","x":900,"y":0},
        {"node_id":"assat_n06","label":"国光电气","desc":"行波管放大器，卫星通信载荷","layer":"upstream","ticker":"688776","stocks":["688776"],"group_name":"微波器件","x":1100,"y":0},
        # core y=210
        {"node_id":"assat_n07","label":"中国卫星","desc":"整星设计制造，国家级遥感/通信","layer":"core","ticker":"600118","stocks":["600118"],"group_name":"整星制造","x":100,"y":210},
        {"node_id":"assat_n08","label":"航天环宇","desc":"商业SAR卫星，低轨遥感星座","layer":"core","ticker":"688523","stocks":["688523"],"group_name":"商业整星","x":350,"y":210},
        {"node_id":"assat_n09","label":"航天电子","desc":"卫星星务/姿控计算机，飞控系统","layer":"core","ticker":"600879","stocks":["600879"],"group_name":"星载电子","x":600,"y":210},
        {"node_id":"assat_n10","label":"四创电子","desc":"SAR载荷信号处理，雷达卫星电子","layer":"core","ticker":"600990","stocks":["600990"],"group_name":"载荷电子","x":850,"y":210},
        {"node_id":"assat_n11","label":"航天电器","desc":"空间连接器，卫星舱间电气接口","layer":"core","ticker":"002025","stocks":["002025"],"group_name":"空间连接器","x":1100,"y":210},
        {"node_id":"assat_n12","label":"铖昌科技","desc":"相控阵T/R组件，卫星通信天线","layer":"core","ticker":"001270","stocks":["001270"],"group_name":"相控阵天线","x":1350,"y":210},
        # downstream y=420
        {"node_id":"assat_n13","label":"中国卫通","desc":"GEO卫星广播/宽带服务运营","layer":"downstream","ticker":"601698","stocks":["601698"],"group_name":"卫星运营","x":100,"y":420},
        {"node_id":"assat_n14","label":"中科星图","desc":"卫星遥感数据分析，时空大数据","layer":"downstream","ticker":"688568","stocks":["688568"],"group_name":"遥感应用","x":350,"y":420},
        {"node_id":"assat_n15","label":"四维图新","desc":"高精地图，卫星遥感数据深加工","layer":"downstream","ticker":"002405","stocks":["002405"],"group_name":"地理信息","x":600,"y":420},
        {"node_id":"assat_n16","label":"北斗星通","desc":"北斗导航终端，低轨星座服务","layer":"downstream","ticker":"002151","stocks":["002151"],"group_name":"导航应用","x":850,"y":420},
        {"node_id":"assat_n17","label":"盟升电子","desc":"卫星通信终端，低轨宽带接收","layer":"downstream","ticker":"688311","stocks":["688311"],"group_name":"通信终端","x":1100,"y":420},
        {"node_id":"assat_n18","label":"海格通信","desc":"军用卫星通信终端，车载/便携","layer":"downstream","ticker":"002465","stocks":["002465"],"group_name":"通信终端","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"assat_e01","source":"assat_n01","target":"assat_n07","layer":"upstream","label":"宇航芯片"},
        {"edge_id":"assat_e02","source":"assat_n02","target":"assat_n09","layer":"upstream","label":"星载计算"},
        {"edge_id":"assat_e03","source":"assat_n03","target":"assat_n08","layer":"upstream","label":"热控材料"},
        {"edge_id":"assat_e04","source":"assat_n04","target":"assat_n07","layer":"upstream","label":"3D打印件"},
        {"edge_id":"assat_e05","source":"assat_n05","target":"assat_n08","layer":"upstream","label":"碳纤维结构"},
        {"edge_id":"assat_e06","source":"assat_n06","target":"assat_n10","layer":"upstream","label":"行波管"},
        {"edge_id":"assat_e07","source":"assat_n07","target":"assat_n13","layer":"core","label":"整星交付"},
        {"edge_id":"assat_e08","source":"assat_n08","target":"assat_n14","layer":"core","label":"遥感数据"},
        {"edge_id":"assat_e09","source":"assat_n09","target":"assat_n15","layer":"core","label":"飞控数据"},
        {"edge_id":"assat_e10","source":"assat_n10","target":"assat_n14","layer":"core","label":"SAR数据"},
        {"edge_id":"assat_e11","source":"assat_n11","target":"assat_n16","layer":"core","label":"连接配套"},
        {"edge_id":"assat_e12","source":"assat_n12","target":"assat_n17","layer":"core","label":"相控阵天线"},
        {"edge_id":"assat_e13","source":"assat_n08","target":"assat_n18","layer":"core","label":"通信卫星"},
    ]
}

# ──────────────── as_payload (载荷) ────────────────
INDUSTRIES["as_payload"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"aspl_n01","label":"振华风光","desc":"宇航级ADC/DAC，载荷信号链芯片","layer":"upstream","ticker":"688439","stocks":["688439"],"group_name":"宇航芯片","x":100,"y":0},
        {"node_id":"aspl_n02","label":"紫光国微","desc":"宇航级FPGA，载荷数据处理","layer":"upstream","ticker":"002049","stocks":["002049"],"group_name":"宇航FPGA","x":300,"y":0},
        {"node_id":"aspl_n03","label":"国光电气","desc":"行波管/TWT，通信载荷功率放大","layer":"upstream","ticker":"688776","stocks":["688776"],"group_name":"微波管","x":500,"y":0},
        {"node_id":"aspl_n04","label":"铖昌科技","desc":"相控阵T/R芯片，SAR/通信天线","layer":"upstream","ticker":"001270","stocks":["001270"],"group_name":"相控阵芯片","x":700,"y":0},
        {"node_id":"aspl_n05","label":"斯瑞新材","desc":"微波吸波材料，载荷屏蔽防护","layer":"upstream","ticker":"688102","stocks":["688102"],"group_name":"微波材料","x":900,"y":0},
        {"node_id":"aspl_n06","label":"铂力特","desc":"金属3D打印，载荷精密结构件","layer":"upstream","ticker":"688333","stocks":["688333"],"group_name":"精密制造","x":1100,"y":0},
        # core y=210
        {"node_id":"aspl_n07","label":"四创电子","desc":"SAR图像雷达载荷，信号处理","layer":"core","ticker":"600990","stocks":["600990"],"group_name":"SAR载荷","x":100,"y":210},
        {"node_id":"aspl_n08","label":"航天电子","desc":"遥感相机/光学载荷，成像系统","layer":"core","ticker":"600879","stocks":["600879"],"group_name":"光学载荷","x":350,"y":210},
        {"node_id":"aspl_n09","label":"中国卫星","desc":"整星+载荷集成，遥感卫星总体","layer":"core","ticker":"600118","stocks":["600118"],"group_name":"载荷集成","x":600,"y":210},
        {"node_id":"aspl_n10","label":"七一二","desc":"机载/星载通信设备，数据链","layer":"core","ticker":"603712","stocks":["603712"],"group_name":"通信载荷","x":850,"y":210},
        {"node_id":"aspl_n11","label":"盟升电子","desc":"相控阵通信载荷，星地链路","layer":"core","ticker":"688311","stocks":["688311"],"group_name":"通信载荷","x":1100,"y":210},
        {"node_id":"aspl_n12","label":"航天环宇","desc":"SAR商业卫星载荷，低轨遥感","layer":"core","ticker":"688523","stocks":["688523"],"group_name":"SAR载荷","x":1350,"y":210},
        # downstream y=420
        {"node_id":"aspl_n13","label":"中科星图","desc":"SAR/光学遥感数据处理分析","layer":"downstream","ticker":"688568","stocks":["688568"],"group_name":"遥感应用","x":150,"y":420},
        {"node_id":"aspl_n14","label":"四维图新","desc":"遥感数据制图，高精地图更新","layer":"downstream","ticker":"002405","stocks":["002405"],"group_name":"地理信息","x":450,"y":420},
        {"node_id":"aspl_n15","label":"中国卫通","desc":"GEO通信载荷运营，广播/宽带","layer":"downstream","ticker":"601698","stocks":["601698"],"group_name":"卫星运营","x":750,"y":420},
        {"node_id":"aspl_n16","label":"海格通信","desc":"卫星通信终端，载荷信号接收","layer":"downstream","ticker":"002465","stocks":["002465"],"group_name":"终端应用","x":1050,"y":420},
        {"node_id":"aspl_n17","label":"华测导航","desc":"GNSS/SAR数据应用，测绘导航","layer":"downstream","ticker":"300627","stocks":["300627"],"group_name":"测绘应用","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"aspl_e01","source":"aspl_n01","target":"aspl_n07","layer":"upstream","label":"信号链芯片"},
        {"edge_id":"aspl_e02","source":"aspl_n02","target":"aspl_n08","layer":"upstream","label":"FPGA处理"},
        {"edge_id":"aspl_e03","source":"aspl_n03","target":"aspl_n11","layer":"upstream","label":"行波管"},
        {"edge_id":"aspl_e04","source":"aspl_n04","target":"aspl_n12","layer":"upstream","label":"T/R芯片"},
        {"edge_id":"aspl_e05","source":"aspl_n05","target":"aspl_n07","layer":"upstream","label":"微波材料"},
        {"edge_id":"aspl_e06","source":"aspl_n06","target":"aspl_n09","layer":"upstream","label":"精密结构"},
        {"edge_id":"aspl_e07","source":"aspl_n07","target":"aspl_n13","layer":"core","label":"SAR数据"},
        {"edge_id":"aspl_e08","source":"aspl_n08","target":"aspl_n14","layer":"core","label":"光学数据"},
        {"edge_id":"aspl_e09","source":"aspl_n09","target":"aspl_n15","layer":"core","label":"载荷集成"},
        {"edge_id":"aspl_e10","source":"aspl_n10","target":"aspl_n16","layer":"core","label":"通信载荷"},
        {"edge_id":"aspl_e11","source":"aspl_n11","target":"aspl_n16","layer":"core","label":"相控阵通信"},
        {"edge_id":"aspl_e12","source":"aspl_n12","target":"aspl_n13","layer":"core","label":"商业遥感"},
        {"edge_id":"aspl_e13","source":"aspl_n07","target":"aspl_n17","layer":"core","label":"SAR测绘"},
    ]
}

# ──────────────── as_satcom (卫星通信) ────────────────
INDUSTRIES["as_satcom"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"assc_n01","label":"铖昌科技","desc":"相控阵T/R组件，卫星通信天线芯片","layer":"upstream","ticker":"001270","stocks":["001270"],"group_name":"相控阵芯片","x":100,"y":0},
        {"node_id":"assc_n02","label":"国光电气","desc":"行波管放大器，卫星通信功率","layer":"upstream","ticker":"688776","stocks":["688776"],"group_name":"微波管","x":300,"y":0},
        {"node_id":"assc_n03","label":"振华风光","desc":"宇航级变换器，星载通信电源","layer":"upstream","ticker":"688439","stocks":["688439"],"group_name":"宇航电子","x":500,"y":0},
        {"node_id":"assc_n04","label":"紫光国微","desc":"卫星通信调制解调芯片","layer":"upstream","ticker":"002049","stocks":["002049"],"group_name":"通信芯片","x":700,"y":0},
        {"node_id":"assc_n05","label":"七一二","desc":"数据链/卫通终端，机载/舰载","layer":"upstream","ticker":"603712","stocks":["603712"],"group_name":"通信模块","x":900,"y":0},
        {"node_id":"assc_n06","label":"斯瑞新材","desc":"微波基板材料，天线介质基板","layer":"upstream","ticker":"688102","stocks":["688102"],"group_name":"微波材料","x":1100,"y":0},
        # core y=210
        {"node_id":"assc_n07","label":"中国卫通","desc":"GEO通信卫星运营，广播/宽带","layer":"core","ticker":"601698","stocks":["601698"],"group_name":"卫星运营","x":100,"y":210},
        {"node_id":"assc_n08","label":"盟升电子","desc":"LEO低轨通信卫星终端，星链竞品","layer":"core","ticker":"688311","stocks":["688311"],"group_name":"LEO终端","x":350,"y":210},
        {"node_id":"assc_n09","label":"海格通信","desc":"军民两用卫星通信终端系统","layer":"core","ticker":"002465","stocks":["002465"],"group_name":"通信终端","x":600,"y":210},
        {"node_id":"assc_n10","label":"四创电子","desc":"卫星信号处理，通信载荷电子","layer":"core","ticker":"600990","stocks":["600990"],"group_name":"载荷电子","x":850,"y":210},
        {"node_id":"assc_n11","label":"航天电子","desc":"星地通信链路设备，卫通系统","layer":"core","ticker":"600879","stocks":["600879"],"group_name":"链路设备","x":1100,"y":210},
        {"node_id":"assc_n12","label":"华力创通","desc":"卫星导航/通信测试设备，仿真","layer":"core","ticker":"300045","stocks":["300045"],"group_name":"测试系统","x":1350,"y":210},
        # downstream y=420
        {"node_id":"assc_n13","label":"北斗星通","desc":"北斗卫星通信终端，工程通信","layer":"downstream","ticker":"002151","stocks":["002151"],"group_name":"通信应用","x":150,"y":420},
        {"node_id":"assc_n14","label":"华测导航","desc":"卫星通信+GNSS一体化终端","layer":"downstream","ticker":"300627","stocks":["300627"],"group_name":"综合终端","x":450,"y":420},
        {"node_id":"assc_n15","label":"中科星图","desc":"卫星通信数据分发，遥感平台","layer":"downstream","ticker":"688568","stocks":["688568"],"group_name":"数据平台","x":750,"y":420},
        {"node_id":"assc_n16","label":"普天科技","desc":"卫星地面站设备，测控通信","layer":"downstream","ticker":"002544","stocks":["002544"],"group_name":"地面站","x":1050,"y":420},
        {"node_id":"assc_n17","label":"四维图新","desc":"卫星通信+高精地图，车联应用","layer":"downstream","ticker":"002405","stocks":["002405"],"group_name":"行业应用","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"assc_e01","source":"assc_n01","target":"assc_n08","layer":"upstream","label":"相控阵天线"},
        {"edge_id":"assc_e02","source":"assc_n02","target":"assc_n07","layer":"upstream","label":"行波管"},
        {"edge_id":"assc_e03","source":"assc_n03","target":"assc_n07","layer":"upstream","label":"星载电源"},
        {"edge_id":"assc_e04","source":"assc_n04","target":"assc_n09","layer":"upstream","label":"调制解调"},
        {"edge_id":"assc_e05","source":"assc_n05","target":"assc_n09","layer":"upstream","label":"通信模块"},
        {"edge_id":"assc_e06","source":"assc_n06","target":"assc_n08","layer":"upstream","label":"天线基板"},
        {"edge_id":"assc_e07","source":"assc_n07","target":"assc_n13","layer":"core","label":"卫星通信"},
        {"edge_id":"assc_e08","source":"assc_n08","target":"assc_n14","layer":"core","label":"LEO宽带"},
        {"edge_id":"assc_e09","source":"assc_n09","target":"assc_n15","layer":"core","label":"通信终端"},
        {"edge_id":"assc_e10","source":"assc_n10","target":"assc_n16","layer":"core","label":"载荷电子"},
        {"edge_id":"assc_e11","source":"assc_n11","target":"assc_n16","layer":"core","label":"链路设备"},
        {"edge_id":"assc_e12","source":"assc_n12","target":"assc_n17","layer":"core","label":"测试设备"},
        {"edge_id":"assc_e13","source":"assc_n07","target":"assc_n17","layer":"core","label":"卫星服务"},
    ]
}

# ──────────────── as_satnav (卫星导航) ────────────────
INDUSTRIES["as_satnav"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"assn_n01","label":"振华风光","desc":"宇航级GNSS信号处理IC","layer":"upstream","ticker":"688439","stocks":["688439"],"group_name":"宇航芯片","x":100,"y":0},
        {"node_id":"assn_n02","label":"紫光国微","desc":"北斗导航基带芯片，高精度","layer":"upstream","ticker":"002049","stocks":["002049"],"group_name":"导航芯片","x":300,"y":0},
        {"node_id":"assn_n03","label":"铖昌科技","desc":"导航天线T/R芯片，相控阵测向","layer":"upstream","ticker":"001270","stocks":["001270"],"group_name":"天线芯片","x":500,"y":0},
        {"node_id":"assn_n04","label":"斯瑞新材","desc":"导航天线介质基板，微波材料","layer":"upstream","ticker":"688102","stocks":["688102"],"group_name":"天线材料","x":700,"y":0},
        {"node_id":"assn_n05","label":"航天电子","desc":"北斗星载原子钟，高精度时频","layer":"upstream","ticker":"600879","stocks":["600879"],"group_name":"时频基准","x":900,"y":0},
        {"node_id":"assn_n06","label":"振华科技","desc":"宇航电阻/电容，导航卫星无源器件","layer":"upstream","ticker":"000733","stocks":["000733"],"group_name":"无源器件","x":1100,"y":0},
        # core y=210
        {"node_id":"assn_n07","label":"北斗星通","desc":"北斗核心芯片+模块，导航终端","layer":"core","ticker":"002151","stocks":["002151"],"group_name":"导航芯片模组","x":100,"y":210},
        {"node_id":"assn_n08","label":"华测导航","desc":"高精度GNSS测量型接收机","layer":"core","ticker":"300627","stocks":["300627"],"group_name":"高精度接收机","x":350,"y":210},
        {"node_id":"assn_n09","label":"中海达","desc":"北斗RTK测量仪，工程测绘","layer":"core","ticker":"300177","stocks":["300177"],"group_name":"测量型接收机","x":600,"y":210},
        {"node_id":"assn_n10","label":"盟升电子","desc":"卫星导航抗干扰/增强模块","layer":"core","ticker":"688311","stocks":["688311"],"group_name":"增强系统","x":850,"y":210},
        {"node_id":"assn_n11","label":"华力创通","desc":"北斗导航仿真测试设备","layer":"core","ticker":"300045","stocks":["300045"],"group_name":"测试设备","x":1100,"y":210},
        {"node_id":"assn_n12","label":"七一二","desc":"军用导航/定位系统，组合导航","layer":"core","ticker":"603712","stocks":["603712"],"group_name":"军用导航","x":1350,"y":210},
        # downstream y=420
        {"node_id":"assn_n13","label":"四维图新","desc":"高精地图，导航数据深度应用","layer":"downstream","ticker":"002405","stocks":["002405"],"group_name":"地图服务","x":150,"y":420},
        {"node_id":"assn_n14","label":"中科星图","desc":"北斗时空数据，遥感+导航融合","layer":"downstream","ticker":"688568","stocks":["688568"],"group_name":"时空平台","x":450,"y":420},
        {"node_id":"assn_n15","label":"普天科技","desc":"北斗地面增强站，差分基准","layer":"downstream","ticker":"002544","stocks":["002544"],"group_name":"增强网络","x":750,"y":420},
        {"node_id":"assn_n16","label":"海格通信","desc":"北斗军用定位终端，特种应用","layer":"downstream","ticker":"002465","stocks":["002465"],"group_name":"特种应用","x":1050,"y":420},
        {"node_id":"assn_n17","label":"航天晨光","desc":"北斗地面运控设备，配套系统","layer":"downstream","ticker":"600501","stocks":["600501"],"group_name":"地面系统","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"assn_e01","source":"assn_n01","target":"assn_n07","layer":"upstream","label":"导航IC"},
        {"edge_id":"assn_e02","source":"assn_n02","target":"assn_n08","layer":"upstream","label":"基带芯片"},
        {"edge_id":"assn_e03","source":"assn_n03","target":"assn_n10","layer":"upstream","label":"天线芯片"},
        {"edge_id":"assn_e04","source":"assn_n04","target":"assn_n08","layer":"upstream","label":"天线材料"},
        {"edge_id":"assn_e05","source":"assn_n05","target":"assn_n07","layer":"upstream","label":"原子钟"},
        {"edge_id":"assn_e06","source":"assn_n06","target":"assn_n12","layer":"upstream","label":"无源器件"},
        {"edge_id":"assn_e07","source":"assn_n07","target":"assn_n13","layer":"core","label":"导航模组"},
        {"edge_id":"assn_e08","source":"assn_n08","target":"assn_n14","layer":"core","label":"高精接收机"},
        {"edge_id":"assn_e09","source":"assn_n09","target":"assn_n15","layer":"core","label":"RTK测量"},
        {"edge_id":"assn_e10","source":"assn_n10","target":"assn_n16","layer":"core","label":"抗干扰模块"},
        {"edge_id":"assn_e11","source":"assn_n11","target":"assn_n15","layer":"core","label":"测试设备"},
        {"edge_id":"assn_e12","source":"assn_n12","target":"assn_n16","layer":"core","label":"军用导航"},
        {"edge_id":"assn_e13","source":"assn_n07","target":"assn_n17","layer":"core","label":"北斗终端"},
    ]
}

# ──────────────── as_remote (遥感) ────────────────
INDUSTRIES["as_remote"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"asrm_n01","label":"振华风光","desc":"宇航级ADC，遥感相机信号采集","layer":"upstream","ticker":"688439","stocks":["688439"],"group_name":"宇航芯片","x":100,"y":0},
        {"node_id":"asrm_n02","label":"紫光国微","desc":"宇航FPGA，图像处理计算平台","layer":"upstream","ticker":"002049","stocks":["002049"],"group_name":"图像处理芯片","x":300,"y":0},
        {"node_id":"asrm_n03","label":"铖昌科技","desc":"SAR天线T/R组件，合成孔径雷达","layer":"upstream","ticker":"001270","stocks":["001270"],"group_name":"SAR组件","x":500,"y":0},
        {"node_id":"asrm_n04","label":"光威复材","desc":"碳纤维光学支撑，相机结构件","layer":"upstream","ticker":"300699","stocks":["300699"],"group_name":"光学结构","x":700,"y":0},
        {"node_id":"asrm_n05","label":"铂力特","desc":"3D打印精密支架，遥感载荷结构","layer":"upstream","ticker":"688333","stocks":["688333"],"group_name":"精密结构","x":900,"y":0},
        {"node_id":"asrm_n06","label":"斯瑞新材","desc":"光学镀膜/特种玻璃，相机窗口","layer":"upstream","ticker":"688102","stocks":["688102"],"group_name":"光学材料","x":1100,"y":0},
        # core y=210
        {"node_id":"asrm_n07","label":"中国卫星","desc":"光学/红外遥感整星，国家主力","layer":"core","ticker":"600118","stocks":["600118"],"group_name":"光学遥感","x":100,"y":210},
        {"node_id":"asrm_n08","label":"航天环宇","desc":"SAR商业遥感卫星，全天候成像","layer":"core","ticker":"688523","stocks":["688523"],"group_name":"SAR遥感","x":350,"y":210},
        {"node_id":"asrm_n09","label":"四创电子","desc":"星载SAR信号处理，图像重建","layer":"core","ticker":"600990","stocks":["600990"],"group_name":"SAR处理","x":600,"y":210},
        {"node_id":"asrm_n10","label":"航天电子","desc":"遥感相机电控，星上图像压缩","layer":"core","ticker":"600879","stocks":["600879"],"group_name":"载荷电控","x":850,"y":210},
        {"node_id":"asrm_n11","label":"七一二","desc":"遥感数据传输，高速下行链路","layer":"core","ticker":"603712","stocks":["603712"],"group_name":"数据传输","x":1100,"y":210},
        {"node_id":"asrm_n12","label":"华力创通","desc":"遥感卫星仿真测试，验证平台","layer":"core","ticker":"300045","stocks":["300045"],"group_name":"测试验证","x":1350,"y":210},
        # downstream y=420
        {"node_id":"asrm_n13","label":"中科星图","desc":"遥感大数据平台，AI图像解译","layer":"downstream","ticker":"688568","stocks":["688568"],"group_name":"数据分析","x":150,"y":420},
        {"node_id":"asrm_n14","label":"四维图新","desc":"遥感制图，高精地图更新维护","layer":"downstream","ticker":"002405","stocks":["002405"],"group_name":"测绘制图","x":450,"y":420},
        {"node_id":"asrm_n15","label":"华测导航","desc":"遥感+测绘一体化，工程勘测","layer":"downstream","ticker":"300627","stocks":["300627"],"group_name":"测绘应用","x":750,"y":420},
        {"node_id":"asrm_n16","label":"北斗星通","desc":"遥感数据+导航融合，位置服务","layer":"downstream","ticker":"002151","stocks":["002151"],"group_name":"时空服务","x":1050,"y":420},
        {"node_id":"asrm_n17","label":"中国卫通","desc":"遥感数据传输，卫星宽带回传","layer":"downstream","ticker":"601698","stocks":["601698"],"group_name":"数据传输","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"asrm_e01","source":"asrm_n01","target":"asrm_n07","layer":"upstream","label":"ADC采集"},
        {"edge_id":"asrm_e02","source":"asrm_n02","target":"asrm_n09","layer":"upstream","label":"图像FPGA"},
        {"edge_id":"asrm_e03","source":"asrm_n03","target":"asrm_n08","layer":"upstream","label":"SAR天线"},
        {"edge_id":"asrm_e04","source":"asrm_n04","target":"asrm_n07","layer":"upstream","label":"光学结构"},
        {"edge_id":"asrm_e05","source":"asrm_n05","target":"asrm_n08","layer":"upstream","label":"精密支架"},
        {"edge_id":"asrm_e06","source":"asrm_n06","target":"asrm_n07","layer":"upstream","label":"光学窗口"},
        {"edge_id":"asrm_e07","source":"asrm_n07","target":"asrm_n13","layer":"core","label":"光学遥感"},
        {"edge_id":"asrm_e08","source":"asrm_n08","target":"asrm_n13","layer":"core","label":"SAR数据"},
        {"edge_id":"asrm_e09","source":"asrm_n09","target":"asrm_n14","layer":"core","label":"SAR处理"},
        {"edge_id":"asrm_e10","source":"asrm_n10","target":"asrm_n15","layer":"core","label":"图像压缩"},
        {"edge_id":"asrm_e11","source":"asrm_n11","target":"asrm_n17","layer":"core","label":"数据下行"},
        {"edge_id":"asrm_e12","source":"asrm_n12","target":"asrm_n16","layer":"core","label":"验证测试"},
        {"edge_id":"asrm_e13","source":"asrm_n07","target":"asrm_n16","layer":"core","label":"遥感应用"},
    ]
}

# ──────────────── as_ground (地面系统) ────────────────
INDUSTRIES["as_ground"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"asgr_n01","label":"振华科技","desc":"电阻/电容器件，地面站关键无源","layer":"upstream","ticker":"000733","stocks":["000733"],"group_name":"无源器件","x":100,"y":0},
        {"node_id":"asgr_n02","label":"振华风光","desc":"宇航级IC，地面测控计算机芯片","layer":"upstream","ticker":"688439","stocks":["688439"],"group_name":"关键芯片","x":300,"y":0},
        {"node_id":"asgr_n03","label":"国光电气","desc":"行波管/速调管，测控雷达发射机","layer":"upstream","ticker":"688776","stocks":["688776"],"group_name":"微波器件","x":500,"y":0},
        {"node_id":"asgr_n04","label":"铖昌科技","desc":"相控阵天线T/R，地面站天线阵","layer":"upstream","ticker":"001270","stocks":["001270"],"group_name":"天线组件","x":700,"y":0},
        {"node_id":"asgr_n05","label":"斯瑞新材","desc":"微波吸波/屏蔽材料，天线罩","layer":"upstream","ticker":"688102","stocks":["688102"],"group_name":"微波材料","x":900,"y":0},
        {"node_id":"asgr_n06","label":"铂力特","desc":"3D打印天线反射面，特殊结构件","layer":"upstream","ticker":"688333","stocks":["688333"],"group_name":"天线结构","x":1100,"y":0},
        # core y=210
        {"node_id":"asgr_n07","label":"普天科技","desc":"卫星地面站系统，测控通信配套","layer":"core","ticker":"002544","stocks":["002544"],"group_name":"地面站系统","x":100,"y":210},
        {"node_id":"asgr_n08","label":"华力创通","desc":"卫星导航地面测试，仿真验证","layer":"core","ticker":"300045","stocks":["300045"],"group_name":"测试系统","x":350,"y":210},
        {"node_id":"asgr_n09","label":"四创电子","desc":"雷达/测控系统，地面跟踪天线","layer":"core","ticker":"600990","stocks":["600990"],"group_name":"测控雷达","x":600,"y":210},
        {"node_id":"asgr_n10","label":"盟升电子","desc":"LEO卫星地面终端，小型化站","layer":"core","ticker":"688311","stocks":["688311"],"group_name":"地面终端","x":850,"y":210},
        {"node_id":"asgr_n11","label":"七一二","desc":"数据链/地面通信，运控中心","layer":"core","ticker":"603712","stocks":["603712"],"group_name":"运控通信","x":1100,"y":210},
        {"node_id":"asgr_n12","label":"航天电子","desc":"地面综测设备，星箭测试系统","layer":"core","ticker":"600879","stocks":["600879"],"group_name":"综测设备","x":1350,"y":210},
        # downstream y=420
        {"node_id":"asgr_n13","label":"中国卫通","desc":"地面站网络运营，广播/宽带服务","layer":"downstream","ticker":"601698","stocks":["601698"],"group_name":"运营服务","x":150,"y":420},
        {"node_id":"asgr_n14","label":"北斗星通","desc":"北斗差分地面站，精度增强网","layer":"downstream","ticker":"002151","stocks":["002151"],"group_name":"增强网络","x":450,"y":420},
        {"node_id":"asgr_n15","label":"华测导航","desc":"CORS基准站，RTK地面增强","layer":"downstream","ticker":"300627","stocks":["300627"],"group_name":"增强基站","x":750,"y":420},
        {"node_id":"asgr_n16","label":"中科星图","desc":"地面数据处理中心，遥感平台","layer":"downstream","ticker":"688568","stocks":["688568"],"group_name":"数据中心","x":1050,"y":420},
        {"node_id":"asgr_n17","label":"海格通信","desc":"短波/超短波/卫星综合通信","layer":"downstream","ticker":"002465","stocks":["002465"],"group_name":"综合通信","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"asgr_e01","source":"asgr_n01","target":"asgr_n07","layer":"upstream","label":"无源器件"},
        {"edge_id":"asgr_e02","source":"asgr_n02","target":"asgr_n08","layer":"upstream","label":"测试芯片"},
        {"edge_id":"asgr_e03","source":"asgr_n03","target":"asgr_n09","layer":"upstream","label":"微波管"},
        {"edge_id":"asgr_e04","source":"asgr_n04","target":"asgr_n10","layer":"upstream","label":"天线阵列"},
        {"edge_id":"asgr_e05","source":"asgr_n05","target":"asgr_n07","layer":"upstream","label":"天线材料"},
        {"edge_id":"asgr_e06","source":"asgr_n06","target":"asgr_n09","layer":"upstream","label":"天线结构"},
        {"edge_id":"asgr_e07","source":"asgr_n07","target":"asgr_n13","layer":"core","label":"地面站系统"},
        {"edge_id":"asgr_e08","source":"asgr_n08","target":"asgr_n14","layer":"core","label":"测试验证"},
        {"edge_id":"asgr_e09","source":"asgr_n09","target":"asgr_n15","layer":"core","label":"测控雷达"},
        {"edge_id":"asgr_e10","source":"asgr_n10","target":"asgr_n16","layer":"core","label":"低轨终端"},
        {"edge_id":"asgr_e11","source":"asgr_n11","target":"asgr_n13","layer":"core","label":"运控通信"},
        {"edge_id":"asgr_e12","source":"asgr_n12","target":"asgr_n17","layer":"core","label":"综测设备"},
        {"edge_id":"asgr_e13","source":"asgr_n07","target":"asgr_n16","layer":"core","label":"地面处理"},
    ]
}

# ─────────────────────────────────────────────
# 写入数据库
# ─────────────────────────────────────────────

def seed():
    with engine.begin() as db:
        for industry_id, data in INDUSTRIES.items():
            db.execute(text(f"DELETE FROM industry_node WHERE industry_id='{industry_id}'"))
            db.execute(text(f"DELETE FROM industry_edge WHERE industry_id='{industry_id}'"))
            print(f"[{industry_id}] 清空旧数据")

            for n in data["nodes"]:
                db.execute(text("""
                    INSERT INTO industry_node
                        (industry_id, node_id, x, y, label, icon, desc, layer, ticker, market, stocks, group_name, updated_at)
                    VALUES
                        (:industry_id, :node_id, :x, :y, :label, :icon, :desc, :layer, :ticker, :market, :stocks, :group_name, :updated_at)
                """), {
                    "industry_id": industry_id,
                    "node_id": n["node_id"],
                    "x": n["x"],
                    "y": n["y"],
                    "label": n["label"],
                    "icon": n.get("icon", ""),
                    "desc": n["desc"],
                    "layer": n["layer"],
                    "ticker": n.get("ticker"),
                    "market": "CN" if n.get("ticker") and n.get("stocks") else "US",
                    "stocks": json.dumps(n.get("stocks", []), ensure_ascii=False),
                    "group_name": n.get("group_name", ""),
                    "updated_at": datetime.now().isoformat(),
                })

            for e in data["edges"]:
                db.execute(text("""
                    INSERT INTO industry_edge
                        (industry_id, edge_id, source, target, layer, label, updated_at)
                    VALUES
                        (:industry_id, :edge_id, :source, :target, :layer, :label, :updated_at)
                """), {
                    "industry_id": industry_id,
                    "edge_id": e["edge_id"],
                    "source": e["source"],
                    "target": e["target"],
                    "layer": e["layer"],
                    "label": e.get("label", ""),
                    "updated_at": datetime.now().isoformat(),
                })

            print(f"[{industry_id}] 写入 {len(data['nodes'])} 节点, {len(data['edges'])} 边 ✓")

    print("\n✅ 商业航天 v3 节点数据写入完成")

if __name__ == "__main__":
    seed()
