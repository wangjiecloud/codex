"""
seed_humanoid_v3.py
重写人形机器人8子产业 industry_node / industry_edge
每个节点 = 一家企业，label=企业名，stocks=[单个代码]
对齐 PCB 产业链图谱格式
"""
import json
from sqlalchemy import create_engine, text
from datetime import datetime

engine = create_engine("sqlite:///stock_data.db")

# ─────────────────────────────────────────────
# 节点/边数据定义
# y=0   upstream  上游零件/材料供应商
# y=210 core      核心制造商
# y=420 downstream 下游客户/整机厂
# ─────────────────────────────────────────────

INDUSTRIES = {}

# ──────────────── hm_overview ────────────────
INDUSTRIES["hm_overview"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"hmo_n01","label":"绿的谐波","desc":"谐波减速器龙头，机器人关节核心部件","layer":"upstream","ticker":"688017","stocks":["688017"],"group_name":"减速器","x":100,"y":0},
        {"node_id":"hmo_n02","label":"双环传动","desc":"RV减速器，工业机器人关节传动","layer":"upstream","ticker":"002472","stocks":["002472"],"group_name":"减速器","x":280,"y":0},
        {"node_id":"hmo_n03","label":"汇川技术","desc":"伺服电机+驱动器，机器人运动控制","layer":"upstream","ticker":"300124","stocks":["300124"],"group_name":"电机驱动","x":460,"y":0},
        {"node_id":"hmo_n04","label":"鸣志电器","desc":"步进/伺服电机，精密运动控制","layer":"upstream","ticker":"603728","stocks":["603728"],"group_name":"电机驱动","x":640,"y":0},
        {"node_id":"hmo_n05","label":"思特威","desc":"CMOS图像传感器，机器人视觉感知","layer":"upstream","ticker":"688213","stocks":["688213"],"group_name":"传感器","x":820,"y":0},
        {"node_id":"hmo_n06","label":"奥比中光","desc":"3D视觉感知，深度相机/结构光","layer":"upstream","ticker":"688516","stocks":["688516"],"group_name":"传感器","x":1000,"y":0},
        {"node_id":"hmo_n07","label":"寒武纪","desc":"AI推理芯片，机器人边缘智能","layer":"upstream","ticker":"688256","stocks":["688256"],"group_name":"控制芯片","x":1180,"y":0},
        {"node_id":"hmo_n08","label":"海光信息","desc":"x86兼容CPU，机器人计算平台","layer":"upstream","ticker":"688041","stocks":["688041"],"group_name":"控制芯片","x":1360,"y":0},
        # core y=210
        {"node_id":"hmo_n09","label":"埃斯顿","desc":"工业机器人本体+控制器，国产龙头","layer":"core","ticker":"002747","stocks":["002747"],"group_name":"机器人本体","x":150,"y":210},
        {"node_id":"hmo_n10","label":"埃夫特","desc":"焊接/喷涂机器人，汽车领域龙头","layer":"core","ticker":"688165","stocks":["688165"],"group_name":"机器人本体","x":400,"y":210},
        {"node_id":"hmo_n11","label":"拓普集团","desc":"特斯拉Optimus核心部件供应商","layer":"core","ticker":"601689","stocks":["601689"],"group_name":"人形机器人整机","x":650,"y":210},
        {"node_id":"hmo_n12","label":"三花智控","desc":"热管理+执行器，人形机器人零部件","layer":"core","ticker":"002050","stocks":["002050"],"group_name":"人形机器人整机","x":900,"y":210},
        {"node_id":"hmo_n13","label":"机器人","desc":"FANUC合资，焊接/搬运机器人","layer":"core","ticker":"300024","stocks":["300024"],"group_name":"工业机器人","x":1150,"y":210},
        {"node_id":"hmo_n14","label":"新时达","desc":"机器人控制系统，伺服驱动","layer":"core","ticker":"002527","stocks":["002527"],"group_name":"工业机器人","x":1400,"y":210},
        # downstream y=420
        {"node_id":"hmo_n15","label":"北京君正","desc":"边缘AI SoC，机器人视觉处理","layer":"downstream","ticker":"300223","stocks":["300223"],"group_name":"应用赋能","x":200,"y":420},
        {"node_id":"hmo_n16","label":"瑞芯微","desc":"AIoT SoC，机器人主控平台","layer":"downstream","ticker":"603893","stocks":["603893"],"group_name":"应用赋能","x":500,"y":420},
        {"node_id":"hmo_n17","label":"博杰股份","desc":"机器视觉检测，工业自动化","layer":"downstream","ticker":"002975","stocks":["002975"],"group_name":"系统集成","x":800,"y":420},
        {"node_id":"hmo_n18","label":"鹏鼎控股","desc":"FPC软板，机器人关节柔性电路","layer":"downstream","ticker":"002938","stocks":["002938"],"group_name":"柔性电路","x":1100,"y":420},
        {"node_id":"hmo_n19","label":"亿纬锂能","desc":"机器人/移动设备电池解决方案","layer":"downstream","ticker":"300014","stocks":["300014"],"group_name":"能源系统","x":1400,"y":420},
    ],
    "edges": [
        {"edge_id":"hmo_e01","source":"hmo_n01","target":"hmo_n09","layer":"upstream","label":"减速器供货"},
        {"edge_id":"hmo_e02","source":"hmo_n02","target":"hmo_n10","layer":"upstream","label":"RV减速器"},
        {"edge_id":"hmo_e03","source":"hmo_n03","target":"hmo_n09","layer":"upstream","label":"伺服系统"},
        {"edge_id":"hmo_e04","source":"hmo_n04","target":"hmo_n10","layer":"upstream","label":"电机供货"},
        {"edge_id":"hmo_e05","source":"hmo_n05","target":"hmo_n11","layer":"upstream","label":"视觉传感"},
        {"edge_id":"hmo_e06","source":"hmo_n06","target":"hmo_n11","layer":"upstream","label":"3D感知"},
        {"edge_id":"hmo_e07","source":"hmo_n07","target":"hmo_n13","layer":"upstream","label":"AI芯片"},
        {"edge_id":"hmo_e08","source":"hmo_n08","target":"hmo_n14","layer":"upstream","label":"计算平台"},
        {"edge_id":"hmo_e09","source":"hmo_n09","target":"hmo_n15","layer":"core","label":"机器人集成"},
        {"edge_id":"hmo_e10","source":"hmo_n11","target":"hmo_n16","layer":"core","label":"人形机器人"},
        {"edge_id":"hmo_e11","source":"hmo_n12","target":"hmo_n17","layer":"core","label":"执行器"},
        {"edge_id":"hmo_e12","source":"hmo_n13","target":"hmo_n18","layer":"core","label":"工业应用"},
        {"edge_id":"hmo_e13","source":"hmo_n14","target":"hmo_n19","layer":"core","label":"控制系统"},
    ]
}

# ──────────────── hm_reducer ────────────────
INDUSTRIES["hm_reducer"] = {
    "nodes": [
        # upstream y=0 原材料
        {"node_id":"hmr_n01","label":"中科三环","desc":"钕铁硼永磁材料，减速器磁性材料","layer":"upstream","ticker":"000831","stocks":["000831"],"group_name":"磁性材料","x":100,"y":0},
        {"node_id":"hmr_n02","label":"宁波韵升","desc":"钕铁硼永磁体，精密磁性器件","layer":"upstream","ticker":"600366","stocks":["600366"],"group_name":"磁性材料","x":300,"y":0},
        {"node_id":"hmr_n03","label":"北特科技","desc":"精密轴承钢，减速器基础材料","layer":"upstream","ticker":"603009","stocks":["603009"],"group_name":"精密钢材","x":500,"y":0},
        {"node_id":"hmr_n04","label":"五洲新春","desc":"精密滚珠丝杠，谐波减速器配件","layer":"upstream","ticker":"603667","stocks":["603667"],"group_name":"精密零件","x":700,"y":0},
        {"node_id":"hmr_n05","label":"贝斯特","desc":"精密零部件加工，减速器壳体","layer":"upstream","ticker":"300580","stocks":["300580"],"group_name":"精密零件","x":900,"y":0},
        {"node_id":"hmr_n06","label":"丰立智能","desc":"精密小模数齿轮，RV减速器核心","layer":"upstream","ticker":"301368","stocks":["301368"],"group_name":"精密齿轮","x":1100,"y":0},
        # core y=210 减速器制造
        {"node_id":"hmr_n07","label":"绿的谐波","desc":"谐波减速器国产龙头，占比全球第二","layer":"core","ticker":"688017","stocks":["688017"],"group_name":"谐波减速器","x":150,"y":210},
        {"node_id":"hmr_n08","label":"双环传动","desc":"RV减速器，打入国际主流供应链","layer":"core","ticker":"002472","stocks":["002472"],"group_name":"RV减速器","x":400,"y":210},
        {"node_id":"hmr_n09","label":"中大力德","desc":"RV/谐波减速器，精密传动部件","layer":"core","ticker":"002896","stocks":["002896"],"group_name":"RV减速器","x":650,"y":210},
        {"node_id":"hmr_n10","label":"秦川机床","desc":"RV减速器制造，数控机床主轴","layer":"core","ticker":"000837","stocks":["000837"],"group_name":"RV减速器","x":900,"y":210},
        {"node_id":"hmr_n11","label":"国茂股份","desc":"工业减速机，机器人关节模组","layer":"core","ticker":"603915","stocks":["603915"],"group_name":"工业减速机","x":1150,"y":210},
        {"node_id":"hmr_n12","label":"昊盛工业","desc":"精密行星减速器，协作机器人关节","layer":"core","ticker":"301118","stocks":["301118"],"group_name":"行星减速器","x":1400,"y":210},
        # downstream y=420
        {"node_id":"hmr_n13","label":"埃斯顿","desc":"工业机器人，国产减速器最大买家","layer":"downstream","ticker":"002747","stocks":["002747"],"group_name":"工业机器人","x":150,"y":420},
        {"node_id":"hmr_n14","label":"拓普集团","desc":"人形机器人关节模组，Optimus供应商","layer":"downstream","ticker":"601689","stocks":["601689"],"group_name":"人形机器人","x":450,"y":420},
        {"node_id":"hmr_n15","label":"汇川技术","desc":"协作机器人，减速器下游整合","layer":"downstream","ticker":"300124","stocks":["300124"],"group_name":"协作机器人","x":750,"y":420},
        {"node_id":"hmr_n16","label":"三花智控","desc":"执行器模组，人形机器人关节","layer":"downstream","ticker":"002050","stocks":["002050"],"group_name":"人形机器人","x":1050,"y":420},
        {"node_id":"hmr_n17","label":"新时达","desc":"机器人关节控制，减速器集成","layer":"downstream","ticker":"002527","stocks":["002527"],"group_name":"工业机器人","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"hmr_e01","source":"hmr_n01","target":"hmr_n07","layer":"upstream","label":"磁性材料"},
        {"edge_id":"hmr_e02","source":"hmr_n02","target":"hmr_n08","layer":"upstream","label":"永磁体"},
        {"edge_id":"hmr_e03","source":"hmr_n03","target":"hmr_n09","layer":"upstream","label":"轴承钢"},
        {"edge_id":"hmr_e04","source":"hmr_n04","target":"hmr_n07","layer":"upstream","label":"配件供货"},
        {"edge_id":"hmr_e05","source":"hmr_n05","target":"hmr_n08","layer":"upstream","label":"壳体加工"},
        {"edge_id":"hmr_e06","source":"hmr_n06","target":"hmr_n10","layer":"upstream","label":"齿轮供货"},
        {"edge_id":"hmr_e07","source":"hmr_n07","target":"hmr_n13","layer":"core","label":"谐波减速器"},
        {"edge_id":"hmr_e08","source":"hmr_n07","target":"hmr_n14","layer":"core","label":"人形关节"},
        {"edge_id":"hmr_e09","source":"hmr_n08","target":"hmr_n13","layer":"core","label":"RV减速器"},
        {"edge_id":"hmr_e10","source":"hmr_n08","target":"hmr_n15","layer":"core","label":"协作机器人"},
        {"edge_id":"hmr_e11","source":"hmr_n09","target":"hmr_n16","layer":"core","label":"关节传动"},
        {"edge_id":"hmr_e12","source":"hmr_n10","target":"hmr_n17","layer":"core","label":"减速器集成"},
        {"edge_id":"hmr_e13","source":"hmr_n11","target":"hmr_n15","layer":"core","label":"工业减速机"},
        {"edge_id":"hmr_e14","source":"hmr_n12","target":"hmr_n14","layer":"core","label":"行星减速器"},
    ]
}

# ──────────────── hm_screw (丝杠/螺旋传动) ────────────────
INDUSTRIES["hm_screw"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"hms_n01","label":"北特科技","desc":"轴承钢、精密钢棒，滚珠丝杠原材料","layer":"upstream","ticker":"603009","stocks":["603009"],"group_name":"精密钢材","x":100,"y":0},
        {"node_id":"hms_n02","label":"南钢股份","desc":"特种钢材，丝杠钢棒供应","layer":"upstream","ticker":"600282","stocks":["600282"],"group_name":"精密钢材","x":300,"y":0},
        {"node_id":"hms_n03","label":"贝斯特","desc":"精密零件加工，丝杠壳体/螺母","layer":"upstream","ticker":"300580","stocks":["300580"],"group_name":"精密零件","x":500,"y":0},
        {"node_id":"hms_n04","label":"丰立智能","desc":"精密齿轮/螺纹件，配套丝杠组件","layer":"upstream","ticker":"301368","stocks":["301368"],"group_name":"精密零件","x":700,"y":0},
        {"node_id":"hms_n05","label":"五洲新春","desc":"精密滚珠丝杠，机器人关节驱动","layer":"upstream","ticker":"603667","stocks":["603667"],"group_name":"滚珠丝杠","x":900,"y":0},
        {"node_id":"hms_n06","label":"中国巨石","desc":"玻纤增强复合材料，轻量化丝杠","layer":"upstream","ticker":"600176","stocks":["600176"],"group_name":"复合材料","x":1100,"y":0},
        # core y=210 丝杠制造
        {"node_id":"hms_n07","label":"秦川机床","desc":"精密滚珠丝杠，机床/机器人进给轴","layer":"core","ticker":"000837","stocks":["000837"],"group_name":"滚珠丝杠","x":100,"y":210},
        {"node_id":"hms_n08","label":"华中数控","desc":"数控系统+丝杠集成，开放式平台","layer":"core","ticker":"300161","stocks":["300161"],"group_name":"数控系统","x":350,"y":210},
        {"node_id":"hms_n09","label":"汇川技术","desc":"直线模组+伺服，丝杠驱动系统","layer":"core","ticker":"300124","stocks":["300124"],"group_name":"直线模组","x":600,"y":210},
        {"node_id":"hms_n10","label":"雷赛智能","desc":"直线电机/模组，高精度位移控制","layer":"core","ticker":"002979","stocks":["002979"],"group_name":"直线模组","x":850,"y":210},
        {"node_id":"hms_n11","label":"大豪科技","desc":"缝制机电控，丝杠传动控制系统","layer":"core","ticker":"603025","stocks":["603025"],"group_name":"传动控制","x":1100,"y":210},
        {"node_id":"hms_n12","label":"博实股份","desc":"机器人末端执行器，丝杠驱动手爪","layer":"core","ticker":"002698","stocks":["002698"],"group_name":"执行器","x":1350,"y":210},
        # downstream y=420
        {"node_id":"hms_n13","label":"埃斯顿","desc":"工业机器人，丝杠直线轴主要客户","layer":"downstream","ticker":"002747","stocks":["002747"],"group_name":"工业机器人","x":150,"y":420},
        {"node_id":"hms_n14","label":"拓普集团","desc":"人形机器人线性执行器，丝杠集成","layer":"downstream","ticker":"601689","stocks":["601689"],"group_name":"人形机器人","x":450,"y":420},
        {"node_id":"hms_n15","label":"三花智控","desc":"机器人执行器，线性驱动模组","layer":"downstream","ticker":"002050","stocks":["002050"],"group_name":"人形机器人","x":750,"y":420},
        {"node_id":"hms_n16","label":"机器人","desc":"FANUC合资机器人，丝杠进给轴","layer":"downstream","ticker":"300024","stocks":["300024"],"group_name":"工业机器人","x":1050,"y":420},
        {"node_id":"hms_n17","label":"新时达","desc":"机器人关节控制，直线轴集成","layer":"downstream","ticker":"002527","stocks":["002527"],"group_name":"工业机器人","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"hms_e01","source":"hms_n01","target":"hms_n07","layer":"upstream","label":"丝杠钢材"},
        {"edge_id":"hms_e02","source":"hms_n02","target":"hms_n08","layer":"upstream","label":"特种钢"},
        {"edge_id":"hms_e03","source":"hms_n03","target":"hms_n09","layer":"upstream","label":"精密零件"},
        {"edge_id":"hms_e04","source":"hms_n04","target":"hms_n10","layer":"upstream","label":"螺纹件"},
        {"edge_id":"hms_e05","source":"hms_n05","target":"hms_n07","layer":"upstream","label":"滚珠丝杠"},
        {"edge_id":"hms_e06","source":"hms_n06","target":"hms_n12","layer":"upstream","label":"复合材料"},
        {"edge_id":"hms_e07","source":"hms_n07","target":"hms_n13","layer":"core","label":"丝杠供货"},
        {"edge_id":"hms_e08","source":"hms_n08","target":"hms_n16","layer":"core","label":"数控系统"},
        {"edge_id":"hms_e09","source":"hms_n09","target":"hms_n14","layer":"core","label":"直线模组"},
        {"edge_id":"hms_e10","source":"hms_n10","target":"hms_n15","layer":"core","label":"直线电机"},
        {"edge_id":"hms_e11","source":"hms_n11","target":"hms_n13","layer":"core","label":"控制系统"},
        {"edge_id":"hms_e12","source":"hms_n12","target":"hms_n14","layer":"core","label":"执行器"},
        {"edge_id":"hms_e13","source":"hms_n07","target":"hms_n17","layer":"core","label":"丝杠进给"},
    ]
}

# ──────────────── hm_motor (电机) ────────────────
INDUSTRIES["hm_motor"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"hmmo_n01","label":"中科三环","desc":"钕铁硼永磁体，伺服电机磁钢核心","layer":"upstream","ticker":"000831","stocks":["000831"],"group_name":"永磁材料","x":100,"y":0},
        {"node_id":"hmmo_n02","label":"宁波韵升","desc":"高性能钕铁硼，机器人电机磁钢","layer":"upstream","ticker":"600366","stocks":["600366"],"group_name":"永磁材料","x":300,"y":0},
        {"node_id":"hmmo_n03","label":"铜陵有色","desc":"电解铜、铜线，电机绕组材料","layer":"upstream","ticker":"000630","stocks":["000630"],"group_name":"铜材/绕组","x":500,"y":0},
        {"node_id":"hmmo_n04","label":"精达股份","desc":"漆包线/绕组线，电机线圈绕制","layer":"upstream","ticker":"600577","stocks":["600577"],"group_name":"铜材/绕组","x":700,"y":0},
        {"node_id":"hmmo_n05","label":"宝钢股份","desc":"电工钢片，电机定子/转子铁芯","layer":"upstream","ticker":"600019","stocks":["600019"],"group_name":"硅钢片","x":900,"y":0},
        {"node_id":"hmmo_n06","label":"无锡新宏泰","desc":"电机绝缘材料，定子线圈绝缘","layer":"upstream","ticker":"603679","stocks":["603679"],"group_name":"绝缘材料","x":1100,"y":0},
        # core y=210 电机制造
        {"node_id":"hmmo_n07","label":"汇川技术","desc":"伺服电机+驱动器龙头，机器人核心","layer":"core","ticker":"300124","stocks":["300124"],"group_name":"伺服电机","x":100,"y":210},
        {"node_id":"hmmo_n08","label":"鸣志电器","desc":"步进/伺服电机，精密传动控制","layer":"core","ticker":"603728","stocks":["603728"],"group_name":"伺服电机","x":350,"y":210},
        {"node_id":"hmmo_n09","label":"雷赛智能","desc":"伺服驱动器+电机，协作机器人关节","layer":"core","ticker":"002979","stocks":["002979"],"group_name":"伺服驱动","x":600,"y":210},
        {"node_id":"hmmo_n10","label":"大豪科技","desc":"电控系统，工业电机驱动方案","layer":"core","ticker":"603025","stocks":["603025"],"group_name":"电机控制","x":850,"y":210},
        {"node_id":"hmmo_n11","label":"英威腾","desc":"变频器+伺服，工业驱动系统","layer":"core","ticker":"002334","stocks":["002334"],"group_name":"变频/伺服","x":1100,"y":210},
        {"node_id":"hmmo_n12","label":"新时达","desc":"机器人伺服系统，电机驱控一体","layer":"core","ticker":"002527","stocks":["002527"],"group_name":"伺服驱动","x":1350,"y":210},
        # downstream y=420
        {"node_id":"hmmo_n13","label":"埃斯顿","desc":"工业机器人，伺服电机最大下游","layer":"downstream","ticker":"002747","stocks":["002747"],"group_name":"工业机器人","x":150,"y":420},
        {"node_id":"hmmo_n14","label":"拓普集团","desc":"人形机器人空心杯/线性电机方案","layer":"downstream","ticker":"601689","stocks":["601689"],"group_name":"人形机器人","x":450,"y":420},
        {"node_id":"hmmo_n15","label":"三花智控","desc":"直线执行器，无刷电机集成","layer":"downstream","ticker":"002050","stocks":["002050"],"group_name":"人形机器人","x":750,"y":420},
        {"node_id":"hmmo_n16","label":"机器人","desc":"多关节机器人，伺服系统集成","layer":"downstream","ticker":"300024","stocks":["300024"],"group_name":"工业机器人","x":1050,"y":420},
        {"node_id":"hmmo_n17","label":"博实股份","desc":"搬运/码垛机器人，电机驱动应用","layer":"downstream","ticker":"002698","stocks":["002698"],"group_name":"工业机器人","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"hmmo_e01","source":"hmmo_n01","target":"hmmo_n07","layer":"upstream","label":"磁钢供货"},
        {"edge_id":"hmmo_e02","source":"hmmo_n02","target":"hmmo_n08","layer":"upstream","label":"永磁体"},
        {"edge_id":"hmmo_e03","source":"hmmo_n03","target":"hmmo_n07","layer":"upstream","label":"铜线绕组"},
        {"edge_id":"hmmo_e04","source":"hmmo_n04","target":"hmmo_n09","layer":"upstream","label":"漆包线"},
        {"edge_id":"hmmo_e05","source":"hmmo_n05","target":"hmmo_n10","layer":"upstream","label":"硅钢片"},
        {"edge_id":"hmmo_e06","source":"hmmo_n06","target":"hmmo_n11","layer":"upstream","label":"绝缘材料"},
        {"edge_id":"hmmo_e07","source":"hmmo_n07","target":"hmmo_n13","layer":"core","label":"伺服系统"},
        {"edge_id":"hmmo_e08","source":"hmmo_n07","target":"hmmo_n14","layer":"core","label":"空心杯电机"},
        {"edge_id":"hmmo_e09","source":"hmmo_n08","target":"hmmo_n16","layer":"core","label":"步进电机"},
        {"edge_id":"hmmo_e10","source":"hmmo_n09","target":"hmmo_n13","layer":"core","label":"伺服驱动"},
        {"edge_id":"hmmo_e11","source":"hmmo_n10","target":"hmmo_n17","layer":"core","label":"电控方案"},
        {"edge_id":"hmmo_e12","source":"hmmo_n11","target":"hmmo_n16","layer":"core","label":"变频驱动"},
        {"edge_id":"hmmo_e13","source":"hmmo_n12","target":"hmmo_n15","layer":"core","label":"电机集成"},
    ]
}

# ──────────────── hm_sensor (传感器) ────────────────
INDUSTRIES["hm_sensor"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"hmse_n01","label":"士兰微","desc":"MEMS传感器芯片，压力/加速度感知","layer":"upstream","ticker":"600460","stocks":["600460"],"group_name":"MEMS芯片","x":100,"y":0},
        {"node_id":"hmse_n02","label":"芯动联科","desc":"MEMS惯性传感器，IMU核心芯片","layer":"upstream","ticker":"688582","stocks":["688582"],"group_name":"MEMS芯片","x":300,"y":0},
        {"node_id":"hmse_n03","label":"敏芯股份","desc":"MEMS麦克风/压力传感芯片","layer":"upstream","ticker":"688286","stocks":["688286"],"group_name":"MEMS芯片","x":500,"y":0},
        {"node_id":"hmse_n04","label":"思特威","desc":"CMOS图像传感器ISP，机器视觉核心","layer":"upstream","ticker":"688213","stocks":["688213"],"group_name":"图像传感器","x":700,"y":0},
        {"node_id":"hmse_n05","label":"格科微","desc":"CMOS图像传感器，消费/工业相机","layer":"upstream","ticker":"688728","stocks":["688728"],"group_name":"图像传感器","x":900,"y":0},
        {"node_id":"hmse_n06","label":"苏奥传感","desc":"力矩/压力传感器，机器人触觉感知","layer":"upstream","ticker":"300507","stocks":["300507"],"group_name":"力觉传感","x":1100,"y":0},
        # core y=210
        {"node_id":"hmse_n07","label":"奥比中光","desc":"3D结构光/TOF深度相机，机器人眼睛","layer":"core","ticker":"688516","stocks":["688516"],"group_name":"3D视觉","x":100,"y":210},
        {"node_id":"hmse_n08","label":"禾赛科技","desc":"激光雷达，机器人空间感知导航","layer":"core","ticker":"HSAI","stocks":[],"group_name":"激光雷达","x":350,"y":210},
        {"node_id":"hmse_n09","label":"华测导航","desc":"高精度GNSS/IMU，机器人定位导航","layer":"core","ticker":"300627","stocks":["300627"],"group_name":"导航定位","x":600,"y":210},
        {"node_id":"hmse_n10","label":"北斗星通","desc":"GNSS芯片/模块，高精度定位","layer":"core","ticker":"002151","stocks":["002151"],"group_name":"导航定位","x":850,"y":210},
        {"node_id":"hmse_n11","label":"博杰股份","desc":"机器视觉检测系统，工业传感集成","layer":"core","ticker":"002975","stocks":["002975"],"group_name":"机器视觉","x":1100,"y":210},
        {"node_id":"hmse_n12","label":"奥普特","desc":"机器视觉光源+相机，表面检测","layer":"core","ticker":"688686","stocks":["688686"],"group_name":"机器视觉","x":1350,"y":210},
        # downstream y=420
        {"node_id":"hmse_n13","label":"埃斯顿","desc":"工业机器人，视觉+力觉传感集成","layer":"downstream","ticker":"002747","stocks":["002747"],"group_name":"工业机器人","x":150,"y":420},
        {"node_id":"hmse_n14","label":"拓普集团","desc":"人形机器人传感系统集成供应商","layer":"downstream","ticker":"601689","stocks":["601689"],"group_name":"人形机器人","x":450,"y":420},
        {"node_id":"hmse_n15","label":"汇川技术","desc":"协作机器人，力控/视觉传感应用","layer":"downstream","ticker":"300124","stocks":["300124"],"group_name":"协作机器人","x":750,"y":420},
        {"node_id":"hmse_n16","label":"北京君正","desc":"边缘AI SoC，传感器数据融合处理","layer":"downstream","ticker":"300223","stocks":["300223"],"group_name":"AI处理","x":1050,"y":420},
        {"node_id":"hmse_n17","label":"瑞芯微","desc":"视觉AI SoC，传感器信号处理","layer":"downstream","ticker":"603893","stocks":["603893"],"group_name":"AI处理","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"hmse_e01","source":"hmse_n01","target":"hmse_n09","layer":"upstream","label":"MEMS惯导"},
        {"edge_id":"hmse_e02","source":"hmse_n02","target":"hmse_n09","layer":"upstream","label":"IMU芯片"},
        {"edge_id":"hmse_e03","source":"hmse_n03","target":"hmse_n11","layer":"upstream","label":"MEMS压力"},
        {"edge_id":"hmse_e04","source":"hmse_n04","target":"hmse_n07","layer":"upstream","label":"图像传感"},
        {"edge_id":"hmse_e05","source":"hmse_n05","target":"hmse_n12","layer":"upstream","label":"CMOS传感"},
        {"edge_id":"hmse_e06","source":"hmse_n06","target":"hmse_n11","layer":"upstream","label":"力觉传感"},
        {"edge_id":"hmse_e07","source":"hmse_n07","target":"hmse_n14","layer":"core","label":"3D视觉"},
        {"edge_id":"hmse_e08","source":"hmse_n08","target":"hmse_n13","layer":"core","label":"激光雷达"},
        {"edge_id":"hmse_e09","source":"hmse_n09","target":"hmse_n15","layer":"core","label":"导航定位"},
        {"edge_id":"hmse_e10","source":"hmse_n10","target":"hmse_n14","layer":"core","label":"高精度GNSS"},
        {"edge_id":"hmse_e11","source":"hmse_n11","target":"hmse_n13","layer":"core","label":"视觉检测"},
        {"edge_id":"hmse_e12","source":"hmse_n12","target":"hmse_n16","layer":"core","label":"视觉系统"},
        {"edge_id":"hmse_e13","source":"hmse_n07","target":"hmse_n17","layer":"core","label":"传感融合"},
    ]
}

# ──────────────── hm_body (本体结构) ────────────────
INDUSTRIES["hm_body"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"hmb_n01","label":"爱柯迪","desc":"铝合金压铸件，机器人轻量化骨架","layer":"upstream","ticker":"600933","stocks":["600933"],"group_name":"轻量化材料","x":100,"y":0},
        {"node_id":"hmb_n02","label":"旭升集团","desc":"铝合金精密压铸，新能源/机器人结构件","layer":"upstream","ticker":"603305","stocks":["603305"],"group_name":"轻量化材料","x":300,"y":0},
        {"node_id":"hmb_n03","label":"光威复材","desc":"碳纤维复合材料，人形机器人骨骼","layer":"upstream","ticker":"300699","stocks":["300699"],"group_name":"碳纤维材料","x":500,"y":0},
        {"node_id":"hmb_n04","label":"中简科技","desc":"高强碳纤维，机器人骨架轻量化","layer":"upstream","ticker":"300777","stocks":["300777"],"group_name":"碳纤维材料","x":700,"y":0},
        {"node_id":"hmb_n05","label":"华峰铝业","desc":"高强铝合金，轻量化结构件基材","layer":"upstream","ticker":"601702","stocks":["601702"],"group_name":"铝合金材料","x":900,"y":0},
        {"node_id":"hmb_n06","label":"贝斯特","desc":"精密加工零件，机器人本体零部件","layer":"upstream","ticker":"300580","stocks":["300580"],"group_name":"精密机加","x":1100,"y":0},
        # core y=210
        {"node_id":"hmb_n07","label":"拓普集团","desc":"人形机器人本体结构件，Optimus核心供应","layer":"core","ticker":"601689","stocks":["601689"],"group_name":"人形机器人结构","x":100,"y":210},
        {"node_id":"hmb_n08","label":"三花智控","desc":"机器人执行器+本体集成，人形机器人","layer":"core","ticker":"002050","stocks":["002050"],"group_name":"人形机器人结构","x":350,"y":210},
        {"node_id":"hmb_n09","label":"博实股份","desc":"机器人末端执行器，夹爪/工具头","layer":"core","ticker":"002698","stocks":["002698"],"group_name":"末端执行器","x":600,"y":210},
        {"node_id":"hmb_n10","label":"埃夫特","desc":"机器人本体制造，多关节机械臂","layer":"core","ticker":"688165","stocks":["688165"],"group_name":"工业机器人本体","x":850,"y":210},
        {"node_id":"hmb_n11","label":"埃斯顿","desc":"工业机器人本体，国产6轴机械臂","layer":"core","ticker":"002747","stocks":["002747"],"group_name":"工业机器人本体","x":1100,"y":210},
        {"node_id":"hmb_n12","label":"新松机器人","desc":"特种机器人本体，AGV/协作机械臂","layer":"core","ticker":"300024","stocks":["300024"],"group_name":"特种机器人","x":1350,"y":210},
        # downstream y=420
        {"node_id":"hmb_n13","label":"富士康","desc":"消费电子代工，机器人组装线主要买家","layer":"downstream","ticker":None,"stocks":[],"group_name":"整机组装","x":150,"y":420},
        {"node_id":"hmb_n14","label":"汇川技术","desc":"协作机器人整机，本体+控制集成","layer":"downstream","ticker":"300124","stocks":["300124"],"group_name":"整机集成","x":450,"y":420},
        {"node_id":"hmb_n15","label":"亿纬锂能","desc":"机器人动力电池，本体能源系统","layer":"downstream","ticker":"300014","stocks":["300014"],"group_name":"能源系统","x":750,"y":420},
        {"node_id":"hmb_n16","label":"鹏鼎控股","desc":"FPC柔性电路板，关节信号传输","layer":"downstream","ticker":"002938","stocks":["002938"],"group_name":"柔性连接","x":1050,"y":420},
        {"node_id":"hmb_n17","label":"精研科技","desc":"精密结构件，微型机器人精密壳体","layer":"downstream","ticker":"300709","stocks":["300709"],"group_name":"精密结构","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"hmb_e01","source":"hmb_n01","target":"hmb_n07","layer":"upstream","label":"铝合金压铸"},
        {"edge_id":"hmb_e02","source":"hmb_n02","target":"hmb_n08","layer":"upstream","label":"精密压铸"},
        {"edge_id":"hmb_e03","source":"hmb_n03","target":"hmb_n07","layer":"upstream","label":"碳纤维骨架"},
        {"edge_id":"hmb_e04","source":"hmb_n04","target":"hmb_n10","layer":"upstream","label":"高强碳纤维"},
        {"edge_id":"hmb_e05","source":"hmb_n05","target":"hmb_n11","layer":"upstream","label":"铝合金材料"},
        {"edge_id":"hmb_e06","source":"hmb_n06","target":"hmb_n09","layer":"upstream","label":"精密零件"},
        {"edge_id":"hmb_e07","source":"hmb_n07","target":"hmb_n14","layer":"core","label":"本体结构"},
        {"edge_id":"hmb_e08","source":"hmb_n08","target":"hmb_n14","layer":"core","label":"执行器集成"},
        {"edge_id":"hmb_e09","source":"hmb_n09","target":"hmb_n13","layer":"core","label":"末端执行"},
        {"edge_id":"hmb_e10","source":"hmb_n10","target":"hmb_n13","layer":"core","label":"机械臂"},
        {"edge_id":"hmb_e11","source":"hmb_n11","target":"hmb_n15","layer":"core","label":"工业机器人"},
        {"edge_id":"hmb_e12","source":"hmb_n12","target":"hmb_n16","layer":"core","label":"特种机器人"},
        {"edge_id":"hmb_e13","source":"hmb_n07","target":"hmb_n17","layer":"core","label":"精密结构件"},
    ]
}

# ──────────────── hm_brain (控制与AI) ────────────────
INDUSTRIES["hm_brain"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"hmbr_n01","label":"寒武纪","desc":"AI推理NPU，机器人边缘智能核心","layer":"upstream","ticker":"688256","stocks":["688256"],"group_name":"AI芯片","x":100,"y":0},
        {"node_id":"hmbr_n02","label":"海光信息","desc":"x86兼容CPU，机器人高性能计算","layer":"upstream","ticker":"688041","stocks":["688041"],"group_name":"计算芯片","x":300,"y":0},
        {"node_id":"hmbr_n03","label":"北京君正","desc":"边缘AI SoC，低功耗机器人主控","layer":"upstream","ticker":"300223","stocks":["300223"],"group_name":"SoC芯片","x":500,"y":0},
        {"node_id":"hmbr_n04","label":"瑞芯微","desc":"AIoT SoC，视觉AI处理平台","layer":"upstream","ticker":"603893","stocks":["603893"],"group_name":"SoC芯片","x":700,"y":0},
        {"node_id":"hmbr_n05","label":"紫光国微","desc":"安全MCU/FPGA，机器人控制器芯片","layer":"upstream","ticker":"002049","stocks":["002049"],"group_name":"MCU/FPGA","x":900,"y":0},
        {"node_id":"hmbr_n06","label":"复旦微电","desc":"FPGA/MCU，嵌入式控制芯片","layer":"upstream","ticker":"688385","stocks":["688385"],"group_name":"MCU/FPGA","x":1100,"y":0},
        # core y=210
        {"node_id":"hmbr_n07","label":"汇川技术","desc":"机器人控制器+PLC，运动控制系统","layer":"core","ticker":"300124","stocks":["300124"],"group_name":"运动控制","x":100,"y":210},
        {"node_id":"hmbr_n08","label":"华中数控","desc":"开放式数控系统，机器人自主平台","layer":"core","ticker":"300161","stocks":["300161"],"group_name":"控制系统","x":350,"y":210},
        {"node_id":"hmbr_n09","label":"柏楚电子","desc":"激光切割控制系统，运动控制专家","layer":"core","ticker":"688188","stocks":["688188"],"group_name":"运动控制","x":600,"y":210},
        {"node_id":"hmbr_n10","label":"埃斯顿","desc":"机器人控制器，自研运动控制","layer":"core","ticker":"002747","stocks":["002747"],"group_name":"机器人控制器","x":850,"y":210},
        {"node_id":"hmbr_n11","label":"新时达","desc":"机器人控制器，伺服驱动一体化","layer":"core","ticker":"002527","stocks":["002527"],"group_name":"机器人控制器","x":1100,"y":210},
        {"node_id":"hmbr_n12","label":"雷赛智能","desc":"运动控制卡/EtherCAT主站","layer":"core","ticker":"002979","stocks":["002979"],"group_name":"运动控制","x":1350,"y":210},
        # downstream y=420
        {"node_id":"hmbr_n13","label":"拓普集团","desc":"人形机器人整机，AI控制系统集成","layer":"downstream","ticker":"601689","stocks":["601689"],"group_name":"人形机器人","x":150,"y":420},
        {"node_id":"hmbr_n14","label":"埃夫特","desc":"焊接机器人，视觉AI控制应用","layer":"downstream","ticker":"688165","stocks":["688165"],"group_name":"工业机器人","x":450,"y":420},
        {"node_id":"hmbr_n15","label":"博杰股份","desc":"机器视觉AI，质检机器人应用","layer":"downstream","ticker":"002975","stocks":["002975"],"group_name":"视觉AI应用","x":750,"y":420},
        {"node_id":"hmbr_n16","label":"三花智控","desc":"执行器智能控制，人形机器人应用","layer":"downstream","ticker":"002050","stocks":["002050"],"group_name":"人形机器人","x":1050,"y":420},
        {"node_id":"hmbr_n17","label":"机器人","desc":"工业机器人，控制系统集成商","layer":"downstream","ticker":"300024","stocks":["300024"],"group_name":"工业机器人","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"hmbr_e01","source":"hmbr_n01","target":"hmbr_n07","layer":"upstream","label":"AI推理芯片"},
        {"edge_id":"hmbr_e02","source":"hmbr_n02","target":"hmbr_n08","layer":"upstream","label":"CPU计算"},
        {"edge_id":"hmbr_e03","source":"hmbr_n03","target":"hmbr_n09","layer":"upstream","label":"边缘SoC"},
        {"edge_id":"hmbr_e04","source":"hmbr_n04","target":"hmbr_n10","layer":"upstream","label":"视觉AI芯片"},
        {"edge_id":"hmbr_e05","source":"hmbr_n05","target":"hmbr_n11","layer":"upstream","label":"安全MCU"},
        {"edge_id":"hmbr_e06","source":"hmbr_n06","target":"hmbr_n12","layer":"upstream","label":"FPGA控制"},
        {"edge_id":"hmbr_e07","source":"hmbr_n07","target":"hmbr_n13","layer":"core","label":"运动控制"},
        {"edge_id":"hmbr_e08","source":"hmbr_n08","target":"hmbr_n14","layer":"core","label":"数控系统"},
        {"edge_id":"hmbr_e09","source":"hmbr_n09","target":"hmbr_n15","layer":"core","label":"激光控制"},
        {"edge_id":"hmbr_e10","source":"hmbr_n10","target":"hmbr_n13","layer":"core","label":"机器人控制器"},
        {"edge_id":"hmbr_e11","source":"hmbr_n11","target":"hmbr_n16","layer":"core","label":"伺服控制"},
        {"edge_id":"hmbr_e12","source":"hmbr_n12","target":"hmbr_n17","layer":"core","label":"EtherCAT"},
        {"edge_id":"hmbr_e13","source":"hmbr_n07","target":"hmbr_n16","layer":"core","label":"AI控制"},
    ]
}

# ──────────────── hm_actuator (执行器) ────────────────
INDUSTRIES["hm_actuator"] = {
    "nodes": [
        # upstream y=0
        {"node_id":"hma_n01","label":"中科三环","desc":"钕铁硼永磁材料，直线执行器磁钢","layer":"upstream","ticker":"000831","stocks":["000831"],"group_name":"永磁材料","x":100,"y":0},
        {"node_id":"hma_n02","label":"五洲新春","desc":"精密滚珠丝杠，线性执行器传动","layer":"upstream","ticker":"603667","stocks":["603667"],"group_name":"传动零件","x":300,"y":0},
        {"node_id":"hma_n03","label":"贝斯特","desc":"精密金属零件，执行器壳体加工","layer":"upstream","ticker":"300580","stocks":["300580"],"group_name":"精密加工","x":500,"y":0},
        {"node_id":"hma_n04","label":"绿的谐波","desc":"谐波减速器，旋转执行器关节","layer":"upstream","ticker":"688017","stocks":["688017"],"group_name":"减速器","x":700,"y":0},
        {"node_id":"hma_n05","label":"丰立智能","desc":"精密齿轮组件，执行器传动系统","layer":"upstream","ticker":"301368","stocks":["301368"],"group_name":"传动零件","x":900,"y":0},
        {"node_id":"hma_n06","label":"双环传动","desc":"RV减速器，旋转执行器核心","layer":"upstream","ticker":"002472","stocks":["002472"],"group_name":"减速器","x":1100,"y":0},
        # core y=210 执行器制造
        {"node_id":"hma_n07","label":"拓普集团","desc":"线性执行器/空心杯电机，Optimus关节","layer":"core","ticker":"601689","stocks":["601689"],"group_name":"线性执行器","x":100,"y":210},
        {"node_id":"hma_n08","label":"三花智控","desc":"电控直线执行器，无刷电机驱动","layer":"core","ticker":"002050","stocks":["002050"],"group_name":"线性执行器","x":350,"y":210},
        {"node_id":"hma_n09","label":"汇川技术","desc":"一体化关节模组，伺服+减速器","layer":"core","ticker":"300124","stocks":["300124"],"group_name":"关节模组","x":600,"y":210},
        {"node_id":"hma_n10","label":"雷赛智能","desc":"直线电机模组，高精度执行单元","layer":"core","ticker":"002979","stocks":["002979"],"group_name":"直线模组","x":850,"y":210},
        {"node_id":"hma_n11","label":"博实股份","desc":"机器人末端夹爪，气动/电动执行器","layer":"core","ticker":"002698","stocks":["002698"],"group_name":"末端执行器","x":1100,"y":210},
        {"node_id":"hma_n12","label":"新时达","desc":"关节驱控系统，一体化执行器方案","layer":"core","ticker":"002527","stocks":["002527"],"group_name":"关节模组","x":1350,"y":210},
        # downstream y=420
        {"node_id":"hma_n13","label":"埃斯顿","desc":"工业机器人关节，执行器最大客户","layer":"downstream","ticker":"002747","stocks":["002747"],"group_name":"工业机器人","x":150,"y":420},
        {"node_id":"hma_n14","label":"埃夫特","desc":"焊接机器人关节，执行器集成","layer":"downstream","ticker":"688165","stocks":["688165"],"group_name":"工业机器人","x":450,"y":420},
        {"node_id":"hma_n15","label":"机器人","desc":"多关节机械臂，执行器系统集成","layer":"downstream","ticker":"300024","stocks":["300024"],"group_name":"工业机器人","x":750,"y":420},
        {"node_id":"hma_n16","label":"北特科技","desc":"汽车底盘执行器，EPS转向系统","layer":"downstream","ticker":"603009","stocks":["603009"],"group_name":"汽车执行器","x":1050,"y":420},
        {"node_id":"hma_n17","label":"精研科技","desc":"微型精密执行器，手机/可穿戴驱动","layer":"downstream","ticker":"300709","stocks":["300709"],"group_name":"微型执行器","x":1350,"y":420},
    ],
    "edges": [
        {"edge_id":"hma_e01","source":"hma_n01","target":"hma_n07","layer":"upstream","label":"永磁材料"},
        {"edge_id":"hma_e02","source":"hma_n02","target":"hma_n08","layer":"upstream","label":"滚珠丝杠"},
        {"edge_id":"hma_e03","source":"hma_n03","target":"hma_n09","layer":"upstream","label":"精密壳体"},
        {"edge_id":"hma_e04","source":"hma_n04","target":"hma_n09","layer":"upstream","label":"谐波减速器"},
        {"edge_id":"hma_e05","source":"hma_n05","target":"hma_n10","layer":"upstream","label":"传动齿轮"},
        {"edge_id":"hma_e06","source":"hma_n06","target":"hma_n12","layer":"upstream","label":"RV减速器"},
        {"edge_id":"hma_e07","source":"hma_n07","target":"hma_n13","layer":"core","label":"线性执行器"},
        {"edge_id":"hma_e08","source":"hma_n07","target":"hma_n14","layer":"core","label":"关节驱动"},
        {"edge_id":"hma_e09","source":"hma_n08","target":"hma_n13","layer":"core","label":"电控执行器"},
        {"edge_id":"hma_e10","source":"hma_n09","target":"hma_n15","layer":"core","label":"关节模组"},
        {"edge_id":"hma_e11","source":"hma_n10","target":"hma_n16","layer":"core","label":"直线电机"},
        {"edge_id":"hma_e12","source":"hma_n11","target":"hma_n13","layer":"core","label":"末端夹爪"},
        {"edge_id":"hma_e13","source":"hma_n12","target":"hma_n17","layer":"core","label":"微型执行器"},
    ]
}

# ─────────────────────────────────────────────
# 写入数据库
# ─────────────────────────────────────────────

def seed():
    with engine.begin() as db:
        for industry_id, data in INDUSTRIES.items():
            # 删除旧节点和边
            db.execute(text(f"DELETE FROM industry_node WHERE industry_id='{industry_id}'"))
            db.execute(text(f"DELETE FROM industry_edge WHERE industry_id='{industry_id}'"))
            print(f"[{industry_id}] 清空旧数据")

            # 写入新节点
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

            # 写入新边
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

    print("\n✅ 人形机器人 v3 节点数据写入完成")

if __name__ == "__main__":
    seed()
