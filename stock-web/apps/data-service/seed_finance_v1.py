import json
import os
import sqlite3
import sys
from datetime import datetime


BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "stock_data.db")
NOW = datetime.now().isoformat()


FINANCE_INDUSTRIES = [
    {
        "id": "fin_overview",
        "sort_order": 122,
        "tab": "finance",
        "name": "大金融产业链全景",
        "description": "覆盖银行、券商、保险、金融IT与支付清算五大环节，AI正在重塑投顾、风控、运营与清算基础设施",
        "icon": "Building2",
        "last_analyzed": "2026-07-21",
        "representatives": ["招商银行", "中信证券", "中国平安", "恒生电子"],
        "meta": {
            "title": "大金融产业链全景",
            "subtitle": "从银行负债端到资本市场、保险资管与金融科技基础设施的完整链路",
            "layer_labels": [
                "银行体系",
                "资本市场",
                "保险资管",
                "金融科技",
                "支付清算",
            ],
        },
        "stocks": [],
        "nodes": [
            {
                "node_id": "fin_ov_bank",
                "x": 180,
                "y": 0,
                "label": "银行",
                "icon": "🏦",
                "desc": "国有大行、股份行、城商行共同构成大金融资产负债表核心",
                "layer": "upstream",
                "ticker": "600036",
                "market": "A股",
                "group_name": "金融机构",
                "stocks": ["600036", "601166", "601398"],
            },
            {
                "node_id": "fin_ov_broker",
                "x": 560,
                "y": 0,
                "label": "券商",
                "icon": "📈",
                "desc": "自营、经纪、投行与财富管理是资本市场核心枢纽",
                "layer": "upstream",
                "ticker": "600030",
                "market": "A股",
                "group_name": "金融机构",
                "stocks": ["600030", "601211", "300059"],
            },
            {
                "node_id": "fin_ov_insurance",
                "x": 940,
                "y": 0,
                "label": "保险",
                "icon": "🛡️",
                "desc": "寿险、财险与资管资金提供长期资金来源和资产配置能力",
                "layer": "core",
                "ticker": "601318",
                "market": "A股",
                "group_name": "金融机构",
                "stocks": ["601318", "601601", "601628"],
            },
            {
                "node_id": "fin_ov_it",
                "x": 1320,
                "y": 0,
                "label": "金融IT",
                "icon": "💻",
                "desc": "交易系统、核心账务、风控与数据平台支撑金融数字化升级",
                "layer": "core",
                "ticker": "600570",
                "market": "A股",
                "group_name": "科技基础设施",
                "stocks": ["600570", "300033", "300674"],
            },
            {
                "node_id": "fin_ov_payment",
                "x": 620,
                "y": 210,
                "label": "支付清算",
                "icon": "💳",
                "desc": "支付受理、终端设备与数字人民币改造连接金融与消费场景",
                "layer": "downstream",
                "ticker": "300773",
                "market": "A股",
                "group_name": "科技基础设施",
                "stocks": ["300773", "300130", "002537"],
            },
            {
                "node_id": "fin_ov_ai",
                "x": 1100,
                "y": 210,
                "label": "AI金融应用",
                "icon": "🤖",
                "desc": "智能投顾、智能客服、反欺诈与投研 Copilot 成为金融新增长点",
                "layer": "application",
                "ticker": "300033",
                "market": "A股",
                "group_name": "应用场景",
                "stocks": ["300033", "688318", "300468"],
            },
        ],
        "edges": [
            (
                "e-finov-bank-broker",
                "fin_ov_bank",
                "fin_ov_broker",
                "存贷资金进入资本市场",
            ),
            ("e-finov-bank-ins", "fin_ov_bank", "fin_ov_insurance", "银保协同分销"),
            (
                "e-finov-broker-ins",
                "fin_ov_broker",
                "fin_ov_insurance",
                "资管与资产配置",
            ),
            ("e-finov-bank-it", "fin_ov_bank", "fin_ov_it", "核心系统升级"),
            ("e-finov-broker-it", "fin_ov_broker", "fin_ov_it", "交易与投顾系统"),
            ("e-finov-it-pay", "fin_ov_it", "fin_ov_payment", "支付与清算技术"),
            ("e-finov-pay-ai", "fin_ov_payment", "fin_ov_ai", "场景数据回流"),
            ("e-finov-it-ai", "fin_ov_it", "fin_ov_ai", "AI能力底座"),
        ],
    },
    {
        "id": "fin_bank",
        "sort_order": 123,
        "tab": "finance",
        "name": "银行",
        "description": "国有大行稳资产负债表，股份行强零售与对公，优质城商行提供区域金融弹性，是大金融估值中枢",
        "icon": "Building2",
        "last_analyzed": "2026-07-21",
        "representatives": ["招商银行", "工商银行", "兴业银行", "江苏银行"],
        "meta": {
            "title": "银行产业链",
            "subtitle": "从城商行与零售获客到全国性资产负债表管理，再到财富管理与国际对标",
            "layer_labels": ["区域/零售银行", "全国性银行", "财富管理银行", "海外对标"],
        },
        "stocks": [
            ("601398", "工商银行"),
            ("601288", "农业银行"),
            ("601939", "建设银行"),
            ("600036", "招商银行"),
            ("601166", "兴业银行"),
            ("600919", "江苏银行"),
            ("000001", "平安银行"),
            ("002142", "宁波银行"),
        ],
        "nodes": [
            {
                "node_id": "bank_js",
                "x": 260,
                "y": 0,
                "label": "江苏银行",
                "icon": "🏦",
                "desc": "优质城商行，区域信贷与零售扩张能力较强",
                "layer": "upstream",
                "ticker": "600919",
                "market": "A股",
                "group_name": "区域银行",
                "stocks": ["600919"],
            },
            {
                "node_id": "bank_nb",
                "x": 980,
                "y": 0,
                "label": "宁波银行",
                "icon": "🏦",
                "desc": "区域龙头城商行，对公与零售经营效率领先",
                "layer": "upstream",
                "ticker": "002142",
                "market": "A股",
                "group_name": "区域银行",
                "stocks": ["002142"],
            },
            {
                "node_id": "bank_icbc",
                "x": 120,
                "y": 210,
                "label": "工商银行",
                "icon": "🏛️",
                "desc": "国有大行龙头，资产规模和公司金融能力居前",
                "layer": "core",
                "ticker": "601398",
                "market": "A股",
                "group_name": "国有大行",
                "stocks": ["601398"],
            },
            {
                "node_id": "bank_ccb",
                "x": 560,
                "y": 210,
                "label": "建设银行",
                "icon": "🏛️",
                "desc": "住房金融与基建金融优势突出，分红稳健",
                "layer": "core",
                "ticker": "601939",
                "market": "A股",
                "group_name": "国有大行",
                "stocks": ["601939"],
            },
            {
                "node_id": "bank_cmb",
                "x": 1000,
                "y": 210,
                "label": "招商银行",
                "icon": "💼",
                "desc": "零售银行和财富管理龙头，手续费与客户经营能力领先",
                "layer": "core",
                "ticker": "600036",
                "market": "A股",
                "group_name": "股份行",
                "stocks": ["600036"],
            },
            {
                "node_id": "bank_cib",
                "x": 1440,
                "y": 210,
                "label": "兴业银行",
                "icon": "💼",
                "desc": "同业和绿色金融见长，对公客户基础深厚",
                "layer": "core",
                "ticker": "601166",
                "market": "A股",
                "group_name": "股份行",
                "stocks": ["601166"],
            },
            {
                "node_id": "bank_abc",
                "x": 420,
                "y": 420,
                "label": "农业银行",
                "icon": "🌾",
                "desc": "县域金融网络最强，涉农与普惠金融覆盖面广",
                "layer": "downstream",
                "ticker": "601288",
                "market": "A股",
                "group_name": "国有大行",
                "stocks": ["601288"],
            },
            {
                "node_id": "bank_pab",
                "x": 1120,
                "y": 420,
                "label": "平安银行",
                "icon": "💳",
                "desc": "信用卡、消费金融与零售客群运营能力较强",
                "layer": "downstream",
                "ticker": "000001",
                "market": "A股",
                "group_name": "股份行",
                "stocks": ["000001"],
            },
            {
                "node_id": "bank_jpm",
                "x": 760,
                "y": 630,
                "label": "摩根大通",
                "icon": "🌍",
                "desc": "全球系统重要性银行，对标零售、投行与资管协同能力",
                "layer": "application",
                "ticker": "JPM",
                "market": "美股",
                "group_name": "海外对标",
                "stocks": [],
            },
        ],
        "edges": [
            ("e-bank-js-cmb", "bank_js", "bank_cmb", "区域零售升级"),
            ("e-bank-nb-cib", "bank_nb", "bank_cib", "对公经营对标"),
            ("e-bank-icbc-abc", "bank_icbc", "bank_abc", "县域金融协同"),
            ("e-bank-ccb-cmb", "bank_ccb", "bank_cmb", "财富管理升级"),
            ("e-bank-cib-pab", "bank_cib", "bank_pab", "零售与同业联动"),
            ("e-bank-cmb-jpm", "bank_cmb", "bank_jpm", "零售银行对标"),
            ("e-bank-icbc-jpm", "bank_icbc", "bank_jpm", "综合化经营对标"),
        ],
    },
    {
        "id": "fin_broker",
        "sort_order": 124,
        "tab": "finance",
        "name": "券商",
        "description": "龙头券商吃投行与机构业务，小券商弹性看交易活跃度与并购预期，互联网券商重塑获客和财富管理入口",
        "icon": "Layers",
        "last_analyzed": "2026-07-21",
        "representatives": ["中信证券", "国泰海通", "华泰证券", "东方财富"],
        "meta": {
            "title": "券商产业链",
            "subtitle": "从流量获客到综合券商平台，再到财富管理和海外投行对标",
            "layer_labels": ["流量/零售入口", "综合券商", "财富管理与投行", "海外投行"],
        },
        "stocks": [
            ("600030", "中信证券"),
            ("601211", "国泰海通"),
            ("601066", "中信建投"),
            ("601688", "华泰证券"),
            ("601901", "方正证券"),
            ("300059", "东方财富"),
            ("601881", "中国银河"),
            ("600958", "东方证券"),
        ],
        "nodes": [
            {
                "node_id": "broker_eastmoney",
                "x": 260,
                "y": 0,
                "label": "东方财富",
                "icon": "📱",
                "desc": "互联网流量券商入口，基金销售和零售经纪优势突出",
                "layer": "upstream",
                "ticker": "300059",
                "market": "A股",
                "group_name": "互联网券商",
                "stocks": ["300059"],
            },
            {
                "node_id": "broker_founder",
                "x": 980,
                "y": 0,
                "label": "方正证券",
                "icon": "🧭",
                "desc": "高弹性零售券商，受益于市场成交回暖和并购预期",
                "layer": "upstream",
                "ticker": "601901",
                "market": "A股",
                "group_name": "零售券商",
                "stocks": ["601901"],
            },
            {
                "node_id": "broker_citic",
                "x": 120,
                "y": 210,
                "label": "中信证券",
                "icon": "🏛️",
                "desc": "综合实力最强的头部券商，投行与机构业务领先",
                "layer": "core",
                "ticker": "600030",
                "market": "A股",
                "group_name": "头部综合券商",
                "stocks": ["600030"],
            },
            {
                "node_id": "broker_gtht",
                "x": 560,
                "y": 210,
                "label": "国泰海通",
                "icon": "🏛️",
                "desc": "并购整合后的超大型券商平台，自营和财富管理能力突出",
                "layer": "core",
                "ticker": "601211",
                "market": "A股",
                "group_name": "头部综合券商",
                "stocks": ["601211"],
            },
            {
                "node_id": "broker_csc",
                "x": 1000,
                "y": 210,
                "label": "中信建投",
                "icon": "🏢",
                "desc": "股权融资与债券承销优势明显，投行业务景气度高",
                "layer": "core",
                "ticker": "601066",
                "market": "A股",
                "group_name": "头部综合券商",
                "stocks": ["601066"],
            },
            {
                "node_id": "broker_ht",
                "x": 1440,
                "y": 210,
                "label": "华泰证券",
                "icon": "🏢",
                "desc": "科技赋能财富管理，零售客户与量化服务能力强",
                "layer": "core",
                "ticker": "601688",
                "market": "A股",
                "group_name": "头部综合券商",
                "stocks": ["601688"],
            },
            {
                "node_id": "broker_cgalaxy",
                "x": 420,
                "y": 420,
                "label": "中国银河",
                "icon": "🌌",
                "desc": "网点覆盖广，经纪与财富管理客群基础较深",
                "layer": "downstream",
                "ticker": "601881",
                "market": "A股",
                "group_name": "财富管理券商",
                "stocks": ["601881"],
            },
            {
                "node_id": "broker_dfzq",
                "x": 1120,
                "y": 420,
                "label": "东方证券",
                "icon": "🪙",
                "desc": "资管特色鲜明，受益于权益市场修复和财富管理回暖",
                "layer": "downstream",
                "ticker": "600958",
                "market": "A股",
                "group_name": "财富管理券商",
                "stocks": ["600958"],
            },
            {
                "node_id": "broker_gs",
                "x": 760,
                "y": 630,
                "label": "高盛",
                "icon": "🌍",
                "desc": "全球头部投行，对标投行资本实力与机构业务深度",
                "layer": "application",
                "ticker": "GS",
                "market": "美股",
                "group_name": "海外投行",
                "stocks": [],
            },
        ],
        "edges": [
            ("e-broker-em-ht", "broker_eastmoney", "broker_ht", "线上获客导流"),
            (
                "e-broker-founder-citic",
                "broker_founder",
                "broker_citic",
                "成交活跃度外溢",
            ),
            ("e-broker-citic-csc", "broker_citic", "broker_csc", "投行业务竞合"),
            ("e-broker-gtht-ht", "broker_gtht", "broker_ht", "财富管理竞合"),
            (
                "e-broker-citic-galaxy",
                "broker_citic",
                "broker_cgalaxy",
                "机构到零售转化",
            ),
            ("e-broker-ht-dfzq", "broker_ht", "broker_dfzq", "资管协同"),
            ("e-broker-citic-gs", "broker_citic", "broker_gs", "国际投行对标"),
        ],
    },
    {
        "id": "fin_insurance",
        "sort_order": 125,
        "tab": "finance",
        "name": "保险",
        "description": "寿险看新业务价值和代理人修复，财险看承保利润与新能源车险，资管端则受益长端利率与权益修复",
        "icon": "Activity",
        "last_analyzed": "2026-07-21",
        "representatives": ["中国平安", "中国太保", "中国人寿", "中国人保"],
        "meta": {
            "title": "保险产业链",
            "subtitle": "从财险与寿险供给，到银保与资管协同，再到全球保险资管对标",
            "layer_labels": [
                "财险/寿险供给",
                "综合保险集团",
                "银保与资管协同",
                "海外对标",
            ],
        },
        "stocks": [
            ("601318", "中国平安"),
            ("601601", "中国太保"),
            ("601628", "中国人寿"),
            ("601336", "新华保险"),
            ("601319", "中国人保"),
        ],
        "nodes": [
            {
                "node_id": "ins_picc",
                "x": 300,
                "y": 0,
                "label": "中国人保",
                "icon": "🚗",
                "desc": "财险龙头，车险与非车险承保能力居前",
                "layer": "upstream",
                "ticker": "601319",
                "market": "A股",
                "group_name": "财险",
                "stocks": ["601319"],
            },
            {
                "node_id": "ins_nci",
                "x": 1100,
                "y": 0,
                "label": "新华保险",
                "icon": "👥",
                "desc": "寿险弹性较高，受益代理人和分红险结构改善",
                "layer": "upstream",
                "ticker": "601336",
                "market": "A股",
                "group_name": "寿险",
                "stocks": ["601336"],
            },
            {
                "node_id": "ins_pingan",
                "x": 160,
                "y": 210,
                "label": "中国平安",
                "icon": "🛡️",
                "desc": "寿险、财险、银行和资管协同最完整的综合金融集团",
                "layer": "core",
                "ticker": "601318",
                "market": "A股",
                "group_name": "综合保险集团",
                "stocks": ["601318"],
            },
            {
                "node_id": "ins_cp",
                "x": 760,
                "y": 210,
                "label": "中国太保",
                "icon": "🌊",
                "desc": "寿险改革和财险稳健并行，资管风格偏长久期配置",
                "layer": "core",
                "ticker": "601601",
                "market": "A股",
                "group_name": "综合保险集团",
                "stocks": ["601601"],
            },
            {
                "node_id": "ins_cl",
                "x": 1360,
                "y": 210,
                "label": "中国人寿",
                "icon": "🌟",
                "desc": "寿险龙头，长端利率与权益市场修复对估值影响显著",
                "layer": "core",
                "ticker": "601628",
                "market": "A股",
                "group_name": "综合保险集团",
                "stocks": ["601628"],
            },
            {
                "node_id": "ins_bankdist",
                "x": 420,
                "y": 420,
                "label": "中国平安银保",
                "icon": "🏦",
                "desc": "平安银行与寿险渠道协同，带动零售金融交叉销售",
                "layer": "downstream",
                "ticker": "601318",
                "market": "A股",
                "group_name": "银保协同",
                "stocks": ["601318"],
            },
            {
                "node_id": "ins_asset",
                "x": 1120,
                "y": 420,
                "label": "太保资管",
                "icon": "💹",
                "desc": "保险资金配置端代表，受益高股息和长久期债券配置",
                "layer": "downstream",
                "ticker": "601601",
                "market": "A股",
                "group_name": "资管协同",
                "stocks": ["601601"],
            },
            {
                "node_id": "ins_aia",
                "x": 760,
                "y": 630,
                "label": "友邦保险",
                "icon": "🌍",
                "desc": "亚洲寿险标杆，对标价值率和代理人经营效率",
                "layer": "application",
                "ticker": "1299.HK",
                "market": "港股",
                "group_name": "海外对标",
                "stocks": [],
            },
        ],
        "edges": [
            ("e-ins-picc-pingan", "ins_picc", "ins_pingan", "财险协同"),
            ("e-ins-nci-cl", "ins_nci", "ins_cl", "寿险对标"),
            ("e-ins-pingan-bankdist", "ins_pingan", "ins_bankdist", "银保交叉销售"),
            ("e-ins-cp-asset", "ins_cp", "ins_asset", "保险资管协同"),
            ("e-ins-cl-aia", "ins_cl", "ins_aia", "寿险价值率对标"),
            ("e-ins-pingan-aia", "ins_pingan", "ins_aia", "综合金融对标"),
        ],
    },
    {
        "id": "fin_it",
        "sort_order": 126,
        "tab": "finance",
        "name": "金融IT",
        "description": "核心交易系统、银行核心账务、财富终端与 AI 投研工具构成金融机构数字化升级主线，景气度与信创和 AI 投入共振",
        "icon": "Monitor",
        "last_analyzed": "2026-07-21",
        "representatives": ["恒生电子", "同花顺", "财富趋势", "宇信科技"],
        "meta": {
            "title": "金融IT产业链",
            "subtitle": "从行情终端与流量入口，到核心交易系统、银行核心与 AI 投研应用",
            "layer_labels": ["终端与流量", "核心系统", "AI/数字化应用", "海外对标"],
        },
        "stocks": [
            ("300033", "同花顺"),
            ("688318", "财富趋势"),
            ("600570", "恒生电子"),
            ("300674", "宇信科技"),
            ("300085", "银之杰"),
            ("300468", "四方精创"),
            ("300663", "科蓝软件"),
        ],
        "nodes": [
            {
                "node_id": "fit_ths",
                "x": 260,
                "y": 0,
                "label": "同花顺",
                "icon": "📲",
                "desc": "零售投资终端和金融信息流量龙头，AI 投顾弹性高",
                "layer": "upstream",
                "ticker": "300033",
                "market": "A股",
                "group_name": "终端与流量",
                "stocks": ["300033"],
            },
            {
                "node_id": "fit_ezt",
                "x": 980,
                "y": 0,
                "label": "财富趋势",
                "icon": "🖥️",
                "desc": "通达信终端覆盖广，券商行情与交易前端粘性强",
                "layer": "upstream",
                "ticker": "688318",
                "market": "A股",
                "group_name": "终端与流量",
                "stocks": ["688318"],
            },
            {
                "node_id": "fit_hs",
                "x": 120,
                "y": 210,
                "label": "恒生电子",
                "icon": "💻",
                "desc": "券商、基金、期货核心交易系统绝对龙头",
                "layer": "core",
                "ticker": "600570",
                "market": "A股",
                "group_name": "核心交易系统",
                "stocks": ["600570"],
            },
            {
                "node_id": "fit_yusys",
                "x": 760,
                "y": 210,
                "label": "宇信科技",
                "icon": "🏦",
                "desc": "银行核心系统和渠道改造龙头，深度服务国股行与城商行",
                "layer": "core",
                "ticker": "300674",
                "market": "A股",
                "group_name": "银行核心系统",
                "stocks": ["300674"],
            },
            {
                "node_id": "fit_sinosoft",
                "x": 1360,
                "y": 210,
                "label": "科蓝软件",
                "icon": "☁️",
                "desc": "互联网银行与分布式核心系统代表厂商",
                "layer": "core",
                "ticker": "300663",
                "market": "A股",
                "group_name": "银行核心系统",
                "stocks": ["300663"],
            },
            {
                "node_id": "fit_yinzhijie",
                "x": 420,
                "y": 420,
                "label": "银之杰",
                "icon": "🤖",
                "desc": "银行数字营销与信贷风控，AI 场景改造弹性较强",
                "layer": "downstream",
                "ticker": "300085",
                "market": "A股",
                "group_name": "AI应用",
                "stocks": ["300085"],
            },
            {
                "node_id": "fit_cfets",
                "x": 1120,
                "y": 420,
                "label": "四方精创",
                "icon": "🔗",
                "desc": "跨境支付与数字货币系统改造，受益 CBDC 与跨境结算升级",
                "layer": "downstream",
                "ticker": "300468",
                "market": "A股",
                "group_name": "AI应用",
                "stocks": ["300468"],
            },
            {
                "node_id": "fit_fis",
                "x": 760,
                "y": 630,
                "label": "FIS",
                "icon": "🌍",
                "desc": "全球金融软件与支付科技巨头，对标海外金融科技基础设施",
                "layer": "application",
                "ticker": "FIS",
                "market": "美股",
                "group_name": "海外对标",
                "stocks": [],
            },
        ],
        "edges": [
            ("e-fit-ths-hs", "fit_ths", "fit_hs", "投顾终端接入"),
            ("e-fit-ezt-hs", "fit_ezt", "fit_hs", "行情终端协同"),
            ("e-fit-hs-yzj", "fit_hs", "fit_yinzhijie", "AI投顾与风控"),
            ("e-fit-yusys-cfets", "fit_yusys", "fit_cfets", "跨境与核心改造"),
            ("e-fit-sinosoft-cfets", "fit_sinosoft", "fit_cfets", "数字货币底座"),
            ("e-fit-hs-fis", "fit_hs", "fit_fis", "国际软件对标"),
        ],
    },
    {
        "id": "fin_payment",
        "sort_order": 127,
        "tab": "finance",
        "name": "支付清算与数字人民币",
        "description": "受理终端、收单网络、跨境支付和数字人民币改造共同推动支付基础设施升级，是金融科技落地最快的高频场景",
        "icon": "Network",
        "last_analyzed": "2026-07-21",
        "representatives": ["拉卡拉", "新国都", "海联金汇", "四方精创"],
        "meta": {
            "title": "支付清算与数字人民币产业链",
            "subtitle": "从终端设备、收单网络到跨境清算与数字人民币系统改造的完整链路",
            "layer_labels": ["终端设备", "收单与清算", "数字人民币/跨境", "海外对标"],
        },
        "stocks": [
            ("300773", "拉卡拉"),
            ("300130", "新国都"),
            ("002537", "海联金汇"),
            ("300531", "优博讯"),
            ("603106", "恒银科技"),
            ("300248", "新开普"),
            ("300468", "四方精创"),
        ],
        "nodes": [
            {
                "node_id": "pay_hy",
                "x": 220,
                "y": 0,
                "label": "恒银科技",
                "icon": "🧾",
                "desc": "ATM、自助终端与金融机具供应商，受益网点设备更新",
                "layer": "upstream",
                "ticker": "603106",
                "market": "A股",
                "group_name": "终端设备",
                "stocks": ["603106"],
            },
            {
                "node_id": "pay_ubx",
                "x": 980,
                "y": 0,
                "label": "优博讯",
                "icon": "📟",
                "desc": "移动支付终端与行业手持设备龙头，覆盖零售和物流场景",
                "layer": "upstream",
                "ticker": "300531",
                "market": "A股",
                "group_name": "终端设备",
                "stocks": ["300531"],
            },
            {
                "node_id": "pay_lkl",
                "x": 120,
                "y": 210,
                "label": "拉卡拉",
                "icon": "💳",
                "desc": "线下收单龙头，商户数字化和支付分发能力强",
                "layer": "core",
                "ticker": "300773",
                "market": "A股",
                "group_name": "收单网络",
                "stocks": ["300773"],
            },
            {
                "node_id": "pay_xgd",
                "x": 560,
                "y": 210,
                "label": "新国都",
                "icon": "💰",
                "desc": "POS 与收单一体化布局，海外收单拓展带来新增量",
                "layer": "core",
                "ticker": "300130",
                "market": "A股",
                "group_name": "收单网络",
                "stocks": ["300130"],
            },
            {
                "node_id": "pay_hljh",
                "x": 1000,
                "y": 210,
                "label": "海联金汇",
                "icon": "🔐",
                "desc": "第三方支付与产业链金融平台，受益支付清算升级",
                "layer": "core",
                "ticker": "002537",
                "market": "A股",
                "group_name": "收单网络",
                "stocks": ["002537"],
            },
            {
                "node_id": "pay_newcapec",
                "x": 1440,
                "y": 210,
                "label": "新开普",
                "icon": "🏫",
                "desc": "校园和园区支付场景改造，为数字人民币落地提供高频入口",
                "layer": "core",
                "ticker": "300248",
                "market": "A股",
                "group_name": "场景入口",
                "stocks": ["300248"],
            },
            {
                "node_id": "pay_cfets",
                "x": 420,
                "y": 420,
                "label": "四方精创",
                "icon": "🪙",
                "desc": "跨境支付和数字货币系统服务商，受益 CBDC 与跨境结算升级",
                "layer": "downstream",
                "ticker": "300468",
                "market": "A股",
                "group_name": "数字人民币",
                "stocks": ["300468"],
            },
            {
                "node_id": "pay_paypal",
                "x": 1120,
                "y": 420,
                "label": "PayPal",
                "icon": "🌍",
                "desc": "全球支付网络巨头，对标跨境支付产品与商户运营能力",
                "layer": "application",
                "ticker": "PYPL",
                "market": "美股",
                "group_name": "海外对标",
                "stocks": [],
            },
        ],
        "edges": [
            ("e-pay-hy-lkl", "pay_hy", "pay_lkl", "终端投放"),
            ("e-pay-ubx-xgd", "pay_ubx", "pay_xgd", "POS设备协同"),
            ("e-pay-lkl-hljh", "pay_lkl", "pay_hljh", "支付清算协同"),
            ("e-pay-xgd-newcapec", "pay_xgd", "pay_newcapec", "场景扩展"),
            ("e-pay-hljh-cfets", "pay_hljh", "pay_cfets", "跨境与数字货币升级"),
            ("e-pay-cfets-paypal", "pay_cfets", "pay_paypal", "跨境支付对标"),
        ],
    },
]


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def merge_industry_ids(cur, code, industry_id):
    row = cur.execute(
        "SELECT industry_ids FROM stock_meta WHERE code = ?",
        (code,),
    ).fetchone()
    ids = []
    if row and row["industry_ids"]:
        try:
            ids = json.loads(row["industry_ids"])
        except Exception:
            ids = []
    if industry_id not in ids:
        ids.append(industry_id)
    return json.dumps(ids, ensure_ascii=False)


def upsert_industry_list(cur, industry):
    cur.execute(
        (
            "INSERT INTO industry_list ("
            "industry_id, name, description, icon, company_count, "
            "last_analyzed, representatives, sort_order, tab, updated_at"
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(industry_id) DO UPDATE SET "
            "name = excluded.name, "
            "description = excluded.description, "
            "icon = excluded.icon, "
            "last_analyzed = excluded.last_analyzed, "
            "representatives = excluded.representatives, "
            "sort_order = excluded.sort_order, "
            "tab = excluded.tab, "
            "updated_at = excluded.updated_at"
        ),
        (
            industry["id"],
            industry["name"],
            industry["description"],
            industry["icon"],
            0,
            industry["last_analyzed"],
            json.dumps(industry["representatives"], ensure_ascii=False),
            industry["sort_order"],
            industry["tab"],
            NOW,
        ),
    )


def upsert_industry_meta(cur, industry):
    meta = industry["meta"]
    cur.execute(
        (
            "INSERT INTO industry_meta ("
            "industry_id, title, subtitle, layer_labels, sort_order, updated_at"
            ") VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(industry_id) DO UPDATE SET "
            "title = excluded.title, "
            "subtitle = excluded.subtitle, "
            "layer_labels = excluded.layer_labels, "
            "sort_order = excluded.sort_order, "
            "updated_at = excluded.updated_at"
        ),
        (
            industry["id"],
            meta["title"],
            meta["subtitle"],
            json.dumps(meta["layer_labels"], ensure_ascii=False),
            industry["sort_order"],
            NOW,
        ),
    )


def upsert_industry_nodes(cur, industry):
    for node in industry["nodes"]:
        cur.execute(
            (
                "INSERT INTO industry_node ("
                "industry_id, node_id, x, y, label, icon, desc, "
                "layer, ticker, market, group_name, stocks, updated_at"
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(industry_id, node_id) DO UPDATE SET "
                "x = excluded.x, "
                "y = excluded.y, "
                "label = excluded.label, "
                "icon = excluded.icon, "
                "desc = excluded.desc, "
                "layer = excluded.layer, "
                "ticker = excluded.ticker, "
                "market = excluded.market, "
                "group_name = excluded.group_name, "
                "stocks = excluded.stocks, "
                "updated_at = excluded.updated_at"
            ),
            (
                industry["id"],
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
                json.dumps(node["stocks"], ensure_ascii=False),
                NOW,
            ),
        )


def upsert_industry_edges(cur, industry):
    for edge_id, source, target, label in industry["edges"]:
        cur.execute(
            (
                "INSERT INTO industry_edge ("
                "industry_id, edge_id, source, target, layer, label, updated_at"
                ") VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(industry_id, edge_id) DO UPDATE SET "
                "source = excluded.source, "
                "target = excluded.target, "
                "layer = excluded.layer, "
                "label = excluded.label, "
                "updated_at = excluded.updated_at"
            ),
            (industry["id"], edge_id, source, target, "", label, NOW),
        )


def upsert_stocks(cur, industry):
    for code, name in industry["stocks"]:
        industry_ids = merge_industry_ids(cur, code, industry["id"])
        cur.execute(
            (
                "INSERT INTO stock_meta (code, name, market, industry_ids, updated_at) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(code) DO UPDATE SET "
                "name = excluded.name, "
                "market = excluded.market, "
                "industry_ids = excluded.industry_ids, "
                "updated_at = excluded.updated_at"
            ),
            (code, name, "A股", industry_ids, NOW),
        )
        cur.execute(
            (
                "INSERT INTO stock_quote ("
                "code, name, price, change, change_amt, open, prev_close, "
                "high, low, volume, turnover, market_cap, pe, pb, "
                "turnover_rate, amplitude, updated_at"
                ") VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL) "
                "ON CONFLICT(code) DO NOTHING"
            ),
            (code, name),
        )


def refresh_company_count(cur, industry_id):
    rows = cur.execute(
        "SELECT stocks FROM industry_node WHERE industry_id = ?",
        (industry_id,),
    ).fetchall()
    codes = set()
    for row in rows:
        try:
            stock_codes = json.loads(row["stocks"] or "[]")
        except Exception:
            stock_codes = []
        for code in stock_codes:
            if isinstance(code, str) and len(code) == 6 and code[:1] in {"0", "3", "6"}:
                codes.add(code)
    cur.execute(
        "UPDATE industry_list SET company_count = ?, updated_at = ? WHERE industry_id = ?",
        (len(codes), NOW, industry_id),
    )
    return len(codes)


def seed_finance_data():
    conn = connect()
    try:
        cur = conn.cursor()
        all_codes = set()
        for industry in FINANCE_INDUSTRIES:
            upsert_industry_list(cur, industry)
            upsert_industry_meta(cur, industry)
            upsert_industry_nodes(cur, industry)
            upsert_industry_edges(cur, industry)
            upsert_stocks(cur, industry)
            company_count = refresh_company_count(cur, industry["id"])
            print(f"[seed] {industry['id']} company_count={company_count}")
            for code, _ in industry["stocks"]:
                all_codes.add(code)
        conn.commit()
        return sorted(all_codes)
    finally:
        conn.close()


def sync_finance_codes(codes):
    from routers.industry import _sync_fundamental, _sync_klines
    from routers.quote import _fetch_and_cache_quote

    total = len(codes)
    for idx, code in enumerate(codes, start=1):
        print(f"[sync] ({idx}/{total}) {code} kline")
        try:
            _sync_klines(code, "daily")
        except Exception as exc:
            print(f"[sync] {code} kline failed: {exc}")
        print(f"[sync] ({idx}/{total}) {code} fundamental")
        try:
            _sync_fundamental(code)
        except Exception as exc:
            print(f"[sync] {code} fundamental failed: {exc}")
        print(f"[sync] ({idx}/{total}) {code} quote")
        try:
            _fetch_and_cache_quote(code)
        except Exception as exc:
            print(f"[sync] {code} quote failed: {exc}")


def main():
    sync_data = "--sync" in sys.argv
    codes = seed_finance_data()
    print(f"[seed] finance unique a-share codes={len(codes)}")
    if sync_data:
        sync_finance_codes(codes)


if __name__ == "__main__":
    sys.path.insert(0, BASE_DIR)
    main()
