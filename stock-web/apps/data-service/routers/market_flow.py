"""
市场资金流向汇总
按资金性质分类：主力（机构+游资）、机构、游资、散户、北向资金
"""

from datetime import date, datetime, timedelta
from fastapi import APIRouter, HTTPException, Query
import threading
import akshare as ak
import requests
from typing import Optional

router = APIRouter()

# 全局锁保护 akshare 调用
_ak_lock = threading.Lock()

# 导入数据库模型
from db import SessionLocal, MarketFundFlowSnapshot, FuturesPositionSnapshot, MarketDailyFundFlow


def _get_north_bound_flow() -> dict:
    """
    获取北向资金流向（沪股通+深股通）
    返回: { inflow, outflow, netflow, sh_netflow, sz_netflow, date }
    """
    try:
        with _ak_lock:
            df = ak.stock_hsgt_fund_flow_summary_em()
        
        # 筛选北向资金（资金方向=='北向'）
        north = df[df['资金方向'] == '北向']
        
        if len(north) == 0:
            return {
                "inflow": 0.0,
                "outflow": 0.0,
                "netflow": 0.0,
                "sh_netflow": 0.0,
                "sz_netflow": 0.0,
                "date": None,
            }
        
        # 汇总沪股通和深股通
        total_netflow = north['资金净流入'].sum()
        
        # 分别获取沪股通和深股通
        sh_netflow = north[north['板块'] == '沪股通']['资金净流入'].values[0] if len(north[north['板块'] == '沪股通']) > 0 else 0.0
        sz_netflow = north[north['板块'] == '深股通']['资金净流入'].values[0] if len(north[north['板块'] == '深股通']) > 0 else 0.0
        
        # 北向资金通常只有净流入数据，假设净流入为正时全部是流入，为负时全部是流出
        inflow = total_netflow if total_netflow > 0 else 0.0
        outflow = -total_netflow if total_netflow < 0 else 0.0
        
        trade_date = north['交易日'].iloc[0] if len(north) > 0 else None
        
        return {
            "inflow": float(inflow) * 10000,  # 转换为元（原始单位是万元）
            "outflow": float(outflow) * 10000,
            "netflow": float(total_netflow) * 10000,
            "sh_netflow": float(sh_netflow) * 10000,
            "sz_netflow": float(sz_netflow) * 10000,
            "date": str(trade_date) if trade_date else None,
        }
    except Exception as e:
        print(f"[market_flow] get_north_bound_flow error: {e}")
        return {
            "inflow": 0.0,
            "outflow": 0.0,
            "netflow": 0.0,
            "sh_netflow": 0.0,
            "sz_netflow": 0.0,
            "date": None,
        }


def _get_market_fund_by_investor_type() -> dict:
    """
    获取市场资金流向（按投资者类型分类）
    
    数据来源：东方财富网资金流向API
    
    资金性质分类（按单笔成交金额）：
    1. 机构资金 = 超大单（单笔 ≥100万元）
    2. 游资/大户 = 大单（单笔20万~100万元）
    3. 主力资金 = 机构 + 游资（单笔 ≥20万元）
    4. 散户资金 = 小单（单笔 <4万元）
    5. 中单 = 4万~20万元（中等规模投资者）
    
    注：此分类基于东方财富网的成交单笔金额统计，非按投资者账户类型
    """
    try:
        # 调用东方财富API获取最新的市场资金流向
        url = "http://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
        params = {
            "lmt": 1,  # 只获取最新1天数据
            "klt": 101,  # 日线
            "secid": "1.000001",  # 上证指数
            "fields1": "f1,f2,f3,f7",
            "fields2": "f51,f52,f53,f54,f55,f56,f57",
            "ut": "b2884a393a59ad64002292a3e90d46a5",
            "_": int(datetime.now().timestamp() * 1000)
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        if not data.get('data') or not data['data'].get('klines'):
            raise Exception("No data returned from API")
        
        # 解析最新一天的数据
        line = data['data']['klines'][-1]
        fields = line.split(',')
        
        # 字段说明：
        # fields[0] = 日期
        # fields[1] = 主力净流入 (f52)
        # fields[2] = 小单净流入 (f53) - 散户
        # fields[3] = 中单净流入 (f54)
        # fields[4] = 大单净流入 (f55) - 游资/大户
        # fields[5] = 超大单净流入 (f56) - 机构
        
        retail_netflow = float(fields[2])  # 散户（小单）
        medium_netflow = float(fields[3])  # 中单
        big_netflow = float(fields[4])     # 游资/大户（大单）
        super_netflow = float(fields[5])   # 机构（超大单）
        main_netflow = float(fields[1])    # 主力（超大单+大单）
        
        # 东方财富API返回的是净流入，需要推算流入和流出
        # 假设：净流入 = 流入 - 流出，流入和流出的比例与净流入一致
        def calc_inflow_outflow(netflow):
            """根据净流入估算流入和流出（简化模型）"""
            if netflow > 0:
                # 净流入为正，假设流出是流入的80%
                inflow = abs(netflow) / 0.2
                outflow = inflow - abs(netflow)
            elif netflow < 0:
                # 净流入为负（净流出），假设流入是流出的80%
                outflow = abs(netflow) / 0.2
                inflow = outflow - abs(netflow)
            else:
                inflow = outflow = 0.0
            return inflow, outflow
        
        # 计算各类资金的流入流出
        inst_in, inst_out = calc_inflow_outflow(super_netflow)
        hot_in, hot_out = calc_inflow_outflow(big_netflow)
        retail_in, retail_out = calc_inflow_outflow(retail_netflow)
        main_in, main_out = calc_inflow_outflow(main_netflow)
        
        return {
            # 主力资金（机构 + 游资）
            "main": {
                "inflow": float(main_in),
                "outflow": float(main_out),
                "netflow": float(main_netflow),
            },
            # 机构资金（超大单）
            "institution": {
                "inflow": float(inst_in),
                "outflow": float(inst_out),
                "netflow": float(super_netflow),
            },
            # 游资/大户（大单）
            "hot_money": {
                "inflow": float(hot_in),
                "outflow": float(hot_out),
                "netflow": float(big_netflow),
            },
            # 散户资金（小单）
            "retail": {
                "inflow": float(retail_in),
                "outflow": float(retail_out),
                "netflow": float(retail_netflow),
            },
            # 市场总计
            "total": {
                "inflow": float(main_in + retail_in),
                "outflow": float(main_out + retail_out),
                "netflow": float(main_netflow + retail_netflow),
            },
            # 额外返回交易日期
            "date": fields[0],
        }
    except Exception as e:
        print(f"[market_flow] get_market_fund_by_investor_type error: {e}")
        return {
            "main": {"inflow": 0.0, "outflow": 0.0, "netflow": 0.0},
            "institution": {"inflow": 0.0, "outflow": 0.0, "netflow": 0.0},
            "hot_money": {"inflow": 0.0, "outflow": 0.0, "netflow": 0.0},
            "retail": {"inflow": 0.0, "outflow": 0.0, "netflow": 0.0},
            "total": {"inflow": 0.0, "outflow": 0.0, "netflow": 0.0},
            "date": None,
        }


@router.get("/summary")
def get_market_fund_flow_summary(trade_date: Optional[str] = Query(None, description="交易日期，格式YYYY-MM-DD，默认为最新数据")):
    """
    市场资金流向汇总（支持历史日期查询）
    
    参数:
      trade_date: 交易日期（YYYY-MM-DD），默认为最新数据
      
    逻辑:
      1. 如果指定了trade_date，优先从数据库快照读取
      2. 如果快照不存在或未指定日期，则调用实时API获取最新数据
    
    返回:
    {
      "north_bound": { inflow, outflow, netflow, sh_netflow, sz_netflow, date },
      "investor_type": {
        "main": { inflow, outflow, netflow },        // 主力资金（机构+游资）
        "institution": { inflow, outflow, netflow }, // 机构资金
        "hot_money": { inflow, outflow, netflow },   // 游资
        "retail": { inflow, outflow, netflow },      // 散户资金
        "total": { inflow, outflow, netflow }        // 总计
      },
      "trade_date": "2026-07-13",
      "data_source": "snapshot" | "realtime",
      "updated_at": "2026-07-13 15:00:00"
    }
    """
    try:
        data_source = "realtime"
        
        # 如果指定了日期，尝试从数据库读取快照
        if trade_date:
            session = SessionLocal()
            try:
                snapshots = session.query(MarketFundFlowSnapshot).filter_by(trade_date=trade_date).all()
                
                if len(snapshots) > 0:
                    # 从快照重建数据结构
                    investor_type = {
                        "main": {"inflow": 0.0, "outflow": 0.0, "netflow": 0.0},
                        "institution": {"inflow": 0.0, "outflow": 0.0, "netflow": 0.0},
                        "hot_money": {"inflow": 0.0, "outflow": 0.0, "netflow": 0.0},
                        "retail": {"inflow": 0.0, "outflow": 0.0, "netflow": 0.0},
                        "total": {"inflow": 0.0, "outflow": 0.0, "netflow": 0.0},
                        "date": trade_date,
                    }
                    
                    north_bound = {
                        "inflow": 0.0,
                        "outflow": 0.0,
                        "netflow": 0.0,
                        "sh_netflow": 0.0,
                        "sz_netflow": 0.0,
                        "date": trade_date,
                    }
                    
                    for snap in snapshots:
                        if snap.investor_type == "north_bound":
                            north_bound["inflow"] = snap.inflow
                            north_bound["outflow"] = snap.outflow
                            north_bound["netflow"] = snap.netflow
                        elif snap.investor_type in investor_type:
                            investor_type[snap.investor_type]["inflow"] = snap.inflow
                            investor_type[snap.investor_type]["outflow"] = snap.outflow
                            investor_type[snap.investor_type]["netflow"] = snap.netflow
                    
                    data_source = "snapshot"
                    
                    return {
                        "north_bound": north_bound,
                        "investor_type": investor_type,
                        "trade_date": trade_date,
                        "data_source": data_source,
                        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    }
            finally:
                session.close()
        
        # 否则获取实时数据
        north_bound = _get_north_bound_flow()
        investor_type = _get_market_fund_by_investor_type()
        
        return {
            "north_bound": north_bound,
            "investor_type": investor_type,
            "trade_date": investor_type.get("date") or datetime.now().strftime("%Y-%m-%d"),
            "data_source": data_source,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/north-bound")
def get_north_bound_flow_only():
    """
    仅获取北向资金流向
    """
    return _get_north_bound_flow()


@router.get("/north-bound/history")
def get_north_bound_flow_history(days: int = 10):
    """
    获取北向资金历史流向（最近N天）
    """
    try:
        with _ak_lock:
            df = ak.stock_hsgt_hist_em(symbol="北向资金")
        
        # 取最近N天
        df = df.tail(days)
        
        records = []
        for _, row in df.iterrows():
            records.append({
                "date": str(row['日期']),
                "netflow": float(row['当日成交净买额']),
                "close": float(row['当日收盘价']) if '当日收盘价' in row else None,
                "change_pct": float(row['当日涨跌幅']) if '当日涨跌幅' in row else None,
            })
        
        return {
            "items": records,
            "total": len(records),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _get_citic_futures_position(date_str: str = None, variety: str = 'IF') -> dict:
    """
    获取中信证券在指定期货品种主力合约的持仓
    
    Args:
        date_str: 日期字符串，格式YYYYMMDD，默认为前一个交易日
        variety: 期货品种，默认IF（沪深300股指期货）
        
    Returns:
        dict包含多单、空单、净持仓等信息
    """
    if date_str is None:
        # 默认查询昨天（避免今天数据未更新）
        date_str = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')
    
    try:
        # 获取持仓排名数据
        with _ak_lock:
            result = ak.get_cffex_rank_table(date=date_str, vars_list=[variety])
        
        if not result:
            return {'error': f'No data for {date_str}'}
        
        # 识别主力合约（持仓量最大的合约）
        max_oi = 0
        main_contract = None
        main_df = None
        
        for symbol, df in result.items():
            total_oi = df['long_open_interest'].sum() + df['short_open_interest'].sum()
            if total_oi > max_oi:
                max_oi = total_oi
                main_contract = symbol
                main_df = df
        
        if main_contract is None or main_df is None:
            return {'error': 'Failed to identify main contract'}
        
        # 提取中信证券持仓
        long_positions = []
        short_positions = []
        
        # 查找多单持仓（含"中信"的会员）
        citic_long = main_df[main_df['long_party_name'].str.contains('中信', na=False)]
        for _, row in citic_long.iterrows():
            long_positions.append({
                'name': row['long_party_name'],
                'rank': int(row['rank']),
                'position': int(row['long_open_interest']),
                'change': int(row['long_open_interest_chg'])
            })
        
        # 查找空单持仓
        citic_short = main_df[main_df['short_party_name'].str.contains('中信', na=False)]
        for _, row in citic_short.iterrows():
            short_positions.append({
                'name': row['short_party_name'],
                'rank': int(row['rank']),
                'position': int(row['short_open_interest']),
                'change': int(row['short_open_interest_chg'])
            })
        
        # 计算净持仓
        total_long = sum(p['position'] for p in long_positions)
        total_short = sum(p['position'] for p in short_positions)
        net_position = total_long - total_short
        
        return {
            'date': date_str,
            'variety': variety,
            'contract': main_contract,
            'total_open_interest': int(max_oi),
            'long_positions': long_positions,
            'short_positions': short_positions,
            'total_long': total_long,
            'total_short': total_short,
            'net_position': net_position,
        }
        
    except Exception as e:
        print(f"[market_flow] get_citic_futures_position error: {e}")
        return {'error': str(e)}


def sync_market_daily_fund_flow():
    """
    从东方财富拉取大盘资金流向历史数据，落库到 market_daily_fund_flow 表。
    每次调用会拉取全量历史，已有日期用 IGNORE 跳过。
    返回写入条数。失败时自动重试最多 3 次（间隔 5s）。
    使用 curl_cffi 模拟浏览器请求 JSONP API。
    """
    import pandas as pd
    import time as _time
    import re
    import json
    from curl_cffi import requests as cffi_requests
    from routers.system import sched_log

    sched_log("info", "[大盘资金流向] 开始同步（curl_cffi + 东方财富 JSONP API）", source="market_flow")

    # 东方财富 JSONP API（网页动态加载）
    url = (
        "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
        "?lmt=0&klt=101&fields1=f1,f2,f3,f7"
        "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65"
        "&ut=b2884a393a59ad64002292a3e90d46a5&secid=1.000001&secid2=0.399001"
        f"&cb=jQuery_callback&_={int(datetime.now().timestamp() * 1000)}"
    )
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Referer": "https://data.eastmoney.com/zjlx/dpzjlx.html",
        "Accept": "*/*",
    }

    # 最多重试 3 次
    df = None
    last_err = None
    for attempt in range(1, 4):
        try:
            # 使用 curl_cffi 模拟 Chrome 124 浏览器（与 guba.py 相同）
            resp = cffi_requests.get(url, headers=headers, timeout=30, impersonate="chrome124")
            text = resp.text
            
            # 解析 JSONP: jQuery_callback({...})
            m = re.search(r'jQuery_callback\((\{.*\})\)', text, re.DOTALL)
            if not m:
                # 降级：找括号
                if "jQuery_callback(" not in text:
                    raise ValueError(f"响应格式异常: {text[:200]}")
                start = text.index("jQuery_callback(") + 16
                end = text.rindex(")")
                data = json.loads(text[start:end])
            else:
                data = json.loads(m.group(1))
            
            if not data.get('data') or not data['data'].get('klines'):
                raise Exception("API 返回数据为空")
            
            # 解析 klines
            klines = data['data']['klines']
            rows = []
            for line in klines:
                fields = line.split(',')
                rows.append({
                    "日期": fields[0],
                    "主力净流入-净额": float(fields[1]),
                    "小单净流入-净额": float(fields[2]),
                    "中单净流入-净额": float(fields[3]),
                    "大单净流入-净额": float(fields[4]),
                    "超大单净流入-净额": float(fields[5]),
                    "主力净流入-净占比": float(fields[6]),
                    "小单净流入-净占比": float(fields[7]),
                    "中单净流入-净占比": float(fields[8]),
                    "大单净流入-净占比": float(fields[9]),
                    "超大单净流入-净占比": float(fields[10]),
                    "上证-收盘价": float(fields[11]),
                    "上证-涨跌幅": float(fields[12]),
                    "深证-收盘价": float(fields[13]),
                    "深证-涨跌幅": float(fields[14]),
                })
            df = pd.DataFrame(rows)
            break
        except Exception as e:
            last_err = e
            sched_log("warn", f"[大盘资金流向] 第 {attempt} 次拉取失败: {e}，{'重试中...' if attempt < 3 else '已达最大重试次数'}", source="market_flow")
            if attempt < 3:
                _time.sleep(5)

    if df is None or df.empty:
        sched_log("warn", f"[大盘资金流向] 拉取失败，同步终止: {last_err}", source="market_flow")
        raise RuntimeError(f"东方财富 API 拉取失败: {last_err}")

    total_rows = len(df)
    sched_log("info", f"[大盘资金流向] 获取到 {total_rows} 条历史记录，开始写库...", source="market_flow")

    session = SessionLocal()
    inserted = 0
    skipped = 0
    try:
        for _, row in df.iterrows():
            trade_date = str(row["日期"])  # date → str YYYY-MM-DD
            exists = session.query(MarketDailyFundFlow).filter_by(trade_date=trade_date).first()
            if exists:
                skipped += 1
                continue
            obj = MarketDailyFundFlow(
                trade_date=trade_date,
                sh_close=float(row.get("上证-收盘价") or 0),
                sh_change_pct=float(row.get("上证-涨跌幅") or 0),
                sz_close=float(row.get("深证-收盘价") or 0),
                sz_change_pct=float(row.get("深证-涨跌幅") or 0),
                main_net=float(row.get("主力净流入-净额") or 0),
                main_net_pct=float(row.get("主力净流入-净占比") or 0),
                super_net=float(row.get("超大单净流入-净额") or 0),
                super_net_pct=float(row.get("超大单净流入-净占比") or 0),
                big_net=float(row.get("大单净流入-净额") or 0),
                big_net_pct=float(row.get("大单净流入-净占比") or 0),
                mid_net=float(row.get("中单净流入-净额") or 0),
                mid_net_pct=float(row.get("中单净流入-净占比") or 0),
                small_net=float(row.get("小单净流入-净额") or 0),
                small_net_pct=float(row.get("小单净流入-净占比") or 0),
            )
            session.add(obj)
            inserted += 1
        session.commit()
        sched_log("success", f"[大盘资金流向] 同步完成，新增 {inserted} 条，跳过已有 {skipped} 条", source="market_flow")
        return inserted
    except Exception as e:
        session.rollback()
        sched_log("warn", f"[大盘资金流向] 写库失败: {e}", source="market_flow")
        raise
    finally:
        session.close()


@router.get("/daily-history")
def get_market_daily_fund_flow_history(
    page: int = Query(1, ge=1, description="页码，从1开始"),
    page_size: int = Query(10, ge=1, le=100, description="每页条数"),
):
    """
    分页查询大盘资金流向历史（来源：AKShare stock_market_fund_flow 落库数据）

    返回：
    {
      "total": 120,
      "page": 1,
      "page_size": 10,
      "items": [
        {
          "trade_date": "2026-07-14",
          "sh_close": 3456.78,
          "sh_change_pct": 1.23,
          "sz_close": 11234.56,
          "sz_change_pct": 0.98,
          "main_net": 1234567890,
          "main_net_pct": 2.34,
          "super_net": 987654321,
          "super_net_pct": 1.89,
          "big_net": 246913569,
          "big_net_pct": 0.45,
          "mid_net": -123456789,
          "mid_net_pct": -0.23,
          "small_net": -456789012,
          "small_net_pct": -0.87
        }, ...
      ]
    }
    """
    session = SessionLocal()
    try:
        query = session.query(MarketDailyFundFlow).order_by(
            MarketDailyFundFlow.trade_date.desc()
        )
        total = query.count()
        rows = query.offset((page - 1) * page_size).limit(page_size).all()
        items = []
        for r in rows:
            items.append({
                "trade_date": r.trade_date,
                "sh_close": r.sh_close,
                "sh_change_pct": r.sh_change_pct,
                "sz_close": r.sz_close,
                "sz_change_pct": r.sz_change_pct,
                "main_net": r.main_net,
                "main_net_pct": r.main_net_pct,
                "super_net": r.super_net,
                "super_net_pct": r.super_net_pct,
                "big_net": r.big_net,
                "big_net_pct": r.big_net_pct,
                "mid_net": r.mid_net,
                "mid_net_pct": r.mid_net_pct,
                "small_net": r.small_net,
                "small_net_pct": r.small_net_pct,
            })
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": items,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.post("/daily-history/sync")
def trigger_sync_market_daily_fund_flow():
    """手动触发大盘资金流向数据同步（后台线程执行）"""
    import threading

    def _run():
        try:
            sync_market_daily_fund_flow()
        except Exception as e:
            print(f"[market_flow] 手动同步失败: {e}")

    threading.Thread(target=_run, daemon=True).start()
    return {"status": "started", "message": "大盘资金流向同步已在后台启动"}


@router.get("/futures/citic")
def get_citic_futures_position(date: str = None, variety: str = 'IF'):
    """
    获取中信证券在股指期货主力合约的持仓
    
    Args:
        date: 交易日期，格式YYYYMMDD，默认为前一个交易日
        variety: 期货品种，默认IF（沪深300股指期货），可选IH/IC/IM
        
    Returns:
        {
            "date": "20260710",
            "variety": "IF",
            "contract": "IF2609",
            "total_open_interest": 480102,
            "long_positions": [{"name": "中信期货(代客)", "rank": 2, "position": 17658, "change": -313}, ...],
            "short_positions": [{"name": "中信期货(代客)", "rank": 1, "position": 25997, "change": 259}],
            "total_long": 19865,
            "total_short": 25997,
            "net_position": -6132
        }
    """
    result = _get_citic_futures_position(date, variety)
    if 'error' in result:
        raise HTTPException(status_code=404, detail=result['error'])
    return result
