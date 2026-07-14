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
from db import SessionLocal, MarketFundFlowSnapshot, FuturesPositionSnapshot


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
