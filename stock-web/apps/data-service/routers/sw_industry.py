from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from datetime import datetime, date, timedelta
import realtime_data
import akshare as ak
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def _latest_trade_date() -> str:
    today = date.today()
    weekday = today.weekday()
    if weekday == 5:
        today -= timedelta(days=1)
    elif weekday == 6:
        today -= timedelta(days=2)
    return today.strftime("%Y%m%d")


@router.get("")
async def get_sw_industries(
    sort: str = Query("change_pct"),
    order: str = Query("desc"),
):
    boards = await run_in_threadpool(realtime_data.fetch_industry_boards)
    sort_key_map = {
        "change_pct": "changePct",
        "turnover": "turnoverRate",
        "name": "name",
        "price": "price",
    }
    key = sort_key_map.get(sort, "changePct")
    boards.sort(key=lambda x: x.get(key, 0), reverse=(order != "asc"))
    return [
        {
            "code": b.get("code", ""),
            "name": b.get("name", ""),
            "level": "二级",
            "price": b.get("price", 0.0),
            "changePct": b.get("changePct", 0.0),
            "changeAmt": b.get("changeAmt", 0.0),
            "turnoverRate": b.get("turnoverRate", 0.0),
            "riseCount": b.get("riseCount", 0),
            "fallCount": b.get("fallCount", 0),
            "leadStock": b.get("leadStock", ""),
            "leadStockPct": b.get("leadStockPct", 0.0),
            "updatedAt": datetime.utcnow().isoformat(),
        }
        for b in boards
    ]


@router.get("/constituents/{board_code}")
async def get_sw_constituents(board_code: str):
    stocks = await run_in_threadpool(realtime_data.fetch_board_stocks, board_code)
    result = [
        {
            "code": s.get("code", ""),
            "name": s.get("name", ""),
            "price": s.get("price", 0.0),
            "changePct": s.get("changePct", 0.0),
            "changeAmt": s.get("changeAmt", 0.0),
            "open": s.get("open", 0.0),
            "prevClose": s.get("prevClose", 0.0),
            "high": s.get("high", 0.0),
            "low": s.get("low", 0.0),
            "volume": s.get("volume", 0.0),
            "turnover": s.get("turnover", 0.0),
            "turnoverRate": s.get("turnoverRate", 0.0),
            "updatedAt": datetime.utcnow().isoformat(),
        }
        for s in stocks
    ]
    result.sort(key=lambda x: x["changePct"], reverse=True)
    return result


@router.get("/kline/{board_code}")
async def get_sw_kline(
    board_code: str,
    period: str = Query(default="daily"),
    count: int = Query(default=110, ge=10, le=500),
):
    if count == 110:
        if period == "weekly":
            count = 156
        elif period == "monthly":
            count = 120
    bars = await run_in_threadpool(
        realtime_data.fetch_board_kline, board_code, period, count
    )
    return bars[-count:] if len(bars) > count else bars


@router.get("/boards-by-stock/{stock_code}")
async def get_boards_by_stock(stock_code: str):
    return []


@router.get("/detail/{board_code}")
async def get_sw_board_detail(board_code: str):
    boards = await run_in_threadpool(realtime_data.fetch_industry_boards)
    for b in boards:
        if b.get("code") == board_code:
            return {
                "code": b.get("code", ""),
                "name": b.get("name", ""),
                "level": "二级",
                "price": b.get("price", 0.0),
                "changePct": b.get("changePct", 0.0),
                "changeAmt": b.get("changeAmt", 0.0),
                "turnoverRate": b.get("turnoverRate", 0.0),
                "riseCount": b.get("riseCount", 0),
                "fallCount": b.get("fallCount", 0),
                "leadStock": b.get("leadStock", ""),
                "leadStockPct": b.get("leadStockPct", 0.0),
                "updatedAt": datetime.utcnow().isoformat(),
            }
    raise HTTPException(status_code=404, detail="板块不存在")


@router.get("/limit-up-ladder")
async def get_limit_up_ladder(date_str: str = Query(default="")):
    trade_date = date_str.replace("-", "") if date_str else _latest_trade_date()

    def _fetch():
        df = ak.stock_zt_pool_em(date=trade_date)
        if df is None or df.empty:
            return [], trade_date
        ladder_map: dict[int, list] = {}
        sector_count: dict[str, int] = {}
        for _, row in df.iterrows():
            days = int(row.get("连板数", 1))
            code = str(row.get("代码", ""))
            name = str(row.get("名称", ""))
            pct = float(row.get("涨跌幅", 0))
            industry = str(row.get("所属行业", ""))
            seal_time_raw = str(row.get("首次封板时间", ""))
            seal_time = ""
            if seal_time_raw and len(seal_time_raw) == 6:
                seal_time = f"{seal_time_raw[:2]}:{seal_time_raw[2:4]}"
            broken_count = int(row.get("炸板次数", 0))
            is_yizi = broken_count == 0 and pct >= 9.9
            stock = {
                "code": code,
                "name": name,
                "consecutiveDays": days,
                "changePct": round(pct, 2),
                "isYizi": is_yizi,
                "sealTime": seal_time,
                "industry": industry,
                "boards": [],
            }
            if days not in ladder_map:
                ladder_map[days] = []
            ladder_map[days].append(stock)
            if industry:
                sector_count[industry] = sector_count.get(industry, 0) + 1
        ladder = [
            {"days": d, "stocks": sorted(s, key=lambda x: -x["changePct"])}
            for d, s in sorted(ladder_map.items(), key=lambda x: -x[0])
        ]
        all_sectors = sorted(
            [{"name": k, "count": v} for k, v in sector_count.items()],
            key=lambda x: -x["count"],
        )
        return ladder, all_sectors, len(df)

    try:
        result = await run_in_threadpool(_fetch)
        ladder, all_sectors, total = result if len(result) == 3 else (result[0], [], 0)
        return {
            "date": f"{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:8]}",
            "totalCount": total,
            "ladder": ladder,
            "sectorSummary": [],
            "allSectors": all_sectors,
        }
    except Exception as e:
        logger.error(f"get_limit_up_ladder error: {e}")
        return {
            "date": f"{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:8]}",
            "totalCount": 0,
            "ladder": [],
            "sectorSummary": [],
            "allSectors": [],
        }


@router.get("/limit-up-broken")
async def get_limit_up_broken(date_str: str = Query(default="")):
    trade_date = date_str.replace("-", "") if date_str else _latest_trade_date()

    def _fetch():
        df = ak.stock_zt_pool_zbgc_em(date=trade_date)
        if df is None or df.empty:
            return [], trade_date
        broken_map: dict[int, list] = {}
        sector_count: dict[str, int] = {}
        for _, row in df.iterrows():
            zt_stat = str(row.get("涨停统计", ""))
            prev_days = 1
            if "/" in zt_stat:
                parts = zt_stat.split("/")
                prev_days = int(parts[0]) if parts[0].isdigit() else 1
            code = str(row.get("代码", ""))
            name = str(row.get("名称", ""))
            pct = float(row.get("涨跌幅", 0))
            industry = str(row.get("所属行业", ""))
            broken_count = int(row.get("炸板次数", 0))
            is_prev_yizi = broken_count == 0
            seal_time_raw = str(row.get("首次封板时间", ""))
            prev_seal_time = ""
            if seal_time_raw and len(seal_time_raw) == 6:
                prev_seal_time = f"{seal_time_raw[:2]}:{seal_time_raw[2:4]}"
            stock = {
                "code": code,
                "name": name,
                "prevConsecutiveDays": prev_days,
                "changePct": round(pct, 2),
                "isPrevYizi": is_prev_yizi,
                "prevSealTime": prev_seal_time,
                "industry": industry,
            }
            if prev_days not in broken_map:
                broken_map[prev_days] = []
            broken_map[prev_days].append(stock)
            if industry:
                sector_count[industry] = sector_count.get(industry, 0) + 1
        broken = [
            {"days": d, "stocks": sorted(s, key=lambda x: -x["changePct"])}
            for d, s in sorted(broken_map.items(), key=lambda x: -x[0])
        ]
        all_sectors = sorted(
            [{"name": k, "count": v} for k, v in sector_count.items()],
            key=lambda x: -x["count"],
        )
        return broken, all_sectors, len(df)

    try:
        result = await run_in_threadpool(_fetch)
        broken, all_sectors, total = result if len(result) == 3 else (result[0], [], 0)
        return {
            "date": f"{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:8]}",
            "totalCount": total,
            "broken": broken,
            "allSectors": all_sectors,
        }
    except Exception as e:
        logger.error(f"get_limit_up_broken error: {e}")
        return {
            "date": f"{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:8]}",
            "totalCount": 0,
            "broken": [],
            "allSectors": [],
        }


_HOTMONEY_SHORT_NAMES = {
    "机构专用": "机构专用",
    "深股通专用": "深股通专用",
    "沪股通专用": "沪股通专用",
    "京股通专用": "京股通专用",
}

# 知名游资席位关键词映射（按关键词匹配营业部名称）
_HOTMONEY_KEYWORD_MAP: list[tuple[str, str]] = [
    # 章盟主
    ("江苏路", "章盟主"),
    ("延安路", "章盟主"),
    ("四季路", "章盟主"),
    ("彩虹北路", "章盟主"),
    ("建国西路", "章盟主"),
    ("文晖路", "章盟主"),
    ("海阳西路", "章盟主"),
    ("广福街", "章盟主"),
    # 赵老哥
    ("绍兴", "赵老哥"),
    ("解放北路", "赵老哥"),
    ("阜成路", "赵老哥"),
    ("嘉善路", "赵老哥"),
    ("双子大厦", "赵老哥"),
    # 炒股养家
    ("宛平南路", "炒股养家"),
    ("茅台路", "炒股养家"),
    ("红宝石路", "炒股养家"),
    ("沧海路", "炒股养家"),
    ("松江", "炒股养家"),
    ("海德路", "炒股养家"),
    ("西大街", "炒股养家"),
    # 作手新一
    ("南京太平南路", "作手新一"),
    ("南京金融城", "作手新一"),
    # 方新侠
    ("朱雀大街", "方新侠"),
    ("陕西分公司", "方新侠"),
    ("西安南广济街", "方新侠"),
    ("台州中心大道", "方新侠"),
    # 孙哥
    ("溧阳路", "孙哥"),
    ("淮海中路", "孙哥"),
    ("庆春路", "孙哥"),
    # 欢乐海岸
    ("欢乐海岸", "欢乐海岸"),
    ("益田路荣超", "欢乐海岸"),
    ("益田路", "欢乐海岸"),
    # 小鳄鱼
    ("大钟亭", "小鳄鱼"),
    # 陈小群
    ("大连黄河路", "陈小群"),
    ("大连金马路", "陈小群"),
    ("苏州留园路", "陈小群"),
    # 深南哥/金田路
    ("金田路", "深南哥"),
    ("深南大道", "深南哥"),
    # 佛山无影脚
    ("绿景路", "佛山无影脚"),
    ("季华路", "佛山无影脚"),
    ("祖庙路", "佛山无影脚"),
    ("三亚迎宾路", "佛山系"),
    # 拉萨天团
    ("拉萨团结路", "拉萨天团"),
    ("拉萨东环路", "拉萨天团"),
    ("拉萨东城区", "拉萨天团"),
    ("拉萨金融城", "拉萨天团"),
    ("山南香曲东路", "拉萨天团"),
    ("昌都两江大道", "拉萨天团"),
    # 92科比
    ("鼓楼南路", "92科比"),
    ("天元东路", "92科比"),
    # 上塘路
    ("上塘路", "上塘路"),
    ("体育馆路", "上塘路"),
    # 呼家楼
    ("呼家楼", "呼家楼"),
    ("凯滨路", "呼家楼"),
    # 六一中路
    ("六一中路", "六一中路"),
    ("东丽开发区二纬路", "六一中路"),
    # 消闲派
    ("珍珠路", "消闲派"),
    # 余哥
    ("普陀山", "余哥"),
    # 乔帮主
    ("蛇口工业七路", "乔帮主"),
    ("蛇口工业三路", "乔帮主"),
    # 宁波桑田路
    ("桑田路", "宁波桑田路"),
    # 思明南路
    ("思明南路", "思明南路"),
    # 腾得系
    ("干将东路", "腾得系"),
    ("五星路", "腾得系"),
    # 紫阳东路
    ("紫阳东路", "紫阳东路"),
    # 量化基金
    ("中金公司", "量化基金"),
    ("中国国际金融股份有限公司上海分公司", "量化基金"),
    ("湖滨路", "量化基金"),
    ("华泰证券股份有限公司总部", "量化基金"),
    # 葛老大
    ("成都北一环路", "葛老大"),
    ("南一环路", "葛老大"),
    # 著名刺客
    ("阜外大街", "著名刺客"),
    # 炒新一族
    ("武定路", "炒新一族"),
    # 北京炒家
    ("飞云大道", "北京炒家"),
    # 职业炒手（校长）
    ("成都南一环路", "职业炒手"),
    # 瑞鹤仙
    ("宜昌解放路", "瑞鹤仙"),
    # 猪肉荣
    ("宁波彩虹北路", "猪肉荣"),
]


def _safe_float(v, default=0.0):
    try:
        f = float(v) if v is not None else default
        if f != f or f in (float("inf"), float("-inf")):
            return default
        return f
    except (ValueError, TypeError):
        return default


def _shorten_dept_name(name: str) -> str:
    if not name:
        return ""
    if name in _HOTMONEY_SHORT_NAMES:
        return _HOTMONEY_SHORT_NAMES[name]
    if "机构" in name and "专用" in name:
        return "机构专用"
    if "深股通" in name:
        return "深股通专用"
    if "沪股通" in name:
        return "沪股通专用"
    # 匹配知名游资席位
    for keyword, hotmoney_name in _HOTMONEY_KEYWORD_MAP:
        if keyword in name:
            return hotmoney_name
    # 未匹配知名游资，提取券商简称 + 营业部关键词
    broker_short = ""
    for broker in [
        "国泰君安",
        "国泰海通",
        "中信证券",
        "中信建投",
        "华泰证券",
        "海通证券",
        "招商证券",
        "广发证券",
        "兴业证券",
        "东方财富",
        "东方证券",
        "中国银河",
        "银河证券",
        "浙商证券",
        "财通证券",
        "国信证券",
        "国盛证券",
        "国元证券",
        "华鑫证券",
        "平安证券",
        "中投证券",
        "中金公司",
        "中国国际金融",
        "长城证券",
        "光大证券",
        "东吴证券",
        "方正证券",
        "湘财证券",
        "东亚前海",
        "联储证券",
        "申港证券",
        "中泰证券",
        "申万宏源",
        "中天证券",
        "财信证券",
        "南京证券",
        "开源证券",
        "国联民生",
        "国金证券",
        "东方财富证券",
        "国新证券",
        "华源证券",
        "中投证券",
        "国投证券",
        "华宝证券",
        "华安证券",
        "西南证券",
        "长江证券",
        "太平洋证券",
        "国都证券",
        "德邦证券",
        "瑞银证券",
        "摩根大通证券",
        "瑞信证券",
        "汇丰前海证券",
    ]:
        if broker in name:
            broker_short = broker.replace("股份有限公司", "").replace(
                "有限责任公司", ""
            )
            break
    short = name
    for sep in ["股份有限公司", "有限责任公司"]:
        idx = short.find(sep)
        if idx >= 0:
            short = short[idx + len(sep) :]
            break
    for suffix in ["证券营业部", "营业部", "分公司", "证券营业中心"]:
        if short.endswith(suffix):
            short = short[: -len(suffix)]
            break
    short = short.strip()
    # 如果缩短后只剩城市名（太模糊），加上券商简称
    vague_names = {
        "北京",
        "深圳",
        "上海",
        "浙江",
        "四川",
        "陕西",
        "宁波",
        "杭州",
        "成都",
        "广州",
        "南京",
        "无锡",
        "西安",
        "武汉",
        "山东",
        "安徽",
        "江苏",
        "福建",
        "重庆",
        "天津",
        "河北",
        "河南",
        "湖北",
        "湖南",
        "江西",
        "辽宁",
        "吉林",
        "黑龙江",
        "云南",
        "贵州",
        "甘肃",
        "青海",
        "海南",
        "广东",
        "广西",
        "内蒙古",
        "新疆",
        "西藏",
        "宁夏",
        "山西",
        "总部",
    }
    if short in vague_names and broker_short:
        return broker_short + "·" + short
    return short


@router.get("/lhb-hotmoney")
async def get_lhb_hotmoney(date_str: str = Query(default="")):
    trade_date = date_str.replace("-", "") if date_str else _latest_trade_date()

    def _fetch_one(code, name):
        seats = []
        try:
            detail = ak.stock_lhb_stock_detail_em(
                symbol=str(code), date=trade_date, flag="买入"
            )
            if detail is not None and not detail.empty:
                for _, row in detail.iterrows():
                    dept = str(row.get("交易营业部名称", "")).strip()
                    buy = _safe_float(row.get("买入金额"))
                    sell = _safe_float(row.get("卖出金额"))
                    net = _safe_float(row.get("净额"))
                    if not dept:
                        continue
                    seats.append(
                        {
                            "code": str(code),
                            "name": str(name),
                            "dept": dept,
                            "shortName": _shorten_dept_name(dept),
                            "buy": buy,
                            "sell": sell,
                            "net": net,
                        }
                    )
        except Exception as e:
            logger.warning(f"stock_lhb_stock_detail_em error for {code}: {e}")
        return seats

    def _fetch():
        import concurrent.futures as cf

        df = ak.stock_lhb_detail_em(start_date=trade_date, end_date=trade_date)
        if df is None or df.empty:
            return [], trade_date, 0
        codes = df[["代码", "名称"]].drop_duplicates().values.tolist()
        all_seats = []
        with cf.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(_fetch_one, code, name) for code, name in codes]
            for f in cf.as_completed(futures):
                try:
                    all_seats.extend(f.result())
                except Exception as e:
                    logger.warning(f"future error: {e}")

        dept_map: dict[str, dict] = {}
        for s in all_seats:
            key_name = s["shortName"] or s["dept"]
            if key_name not in dept_map:
                dept_map[key_name] = {
                    "dept": s["dept"],
                    "shortName": s["shortName"],
                    "stocks": {},
                    "totalNet": 0.0,
                    "stockCount": 0,
                }
            entry = dept_map[key_name]
            key = s["code"]
            if key not in entry["stocks"]:
                entry["stocks"][key] = {
                    "code": s["code"],
                    "name": s["name"],
                    "buy": 0.0,
                    "sell": 0.0,
                    "net": 0.0,
                }
                entry["stockCount"] += 1
            stk = entry["stocks"][key]
            stk["buy"] += s["buy"]
            stk["sell"] += s["sell"]
            stk["net"] += s["net"]
            entry["totalNet"] += s["net"]

        groups = []
        for dept, info in dept_map.items():
            stocks = sorted(info["stocks"].values(), key=lambda x: -abs(x["net"]))
            groups.append(
                {
                    "dept": info["dept"],
                    "shortName": info["shortName"],
                    "totalNet": round(info["totalNet"], 2),
                    "stockCount": info["stockCount"],
                    "stocks": [
                        {
                            "code": stk["code"],
                            "name": stk["name"],
                            "buy": round(stk["buy"], 2),
                            "sell": round(stk["sell"], 2),
                            "net": round(stk["net"], 2),
                        }
                        for stk in stocks
                    ],
                }
            )
        groups.sort(key=lambda x: -abs(x["totalNet"]))
        return groups, trade_date, len(codes)

    try:
        result = await run_in_threadpool(_fetch)
        groups, td, total = result
        return {
            "date": f"{td[:4]}-{td[4:6]}-{td[6:8]}",
            "totalCount": total,
            "groups": groups,
        }
    except Exception as e:
        logger.error(f"get_lhb_hotmoney error: {e}", exc_info=True)
        return {
            "date": f"{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:8]}",
            "totalCount": 0,
            "groups": [],
        }
