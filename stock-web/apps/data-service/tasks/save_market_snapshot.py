#!/usr/bin/env python3
"""
定时任务：保存市场资金流向每日快照
每天收盘后（16:00）执行，将当日市场资金流向数据写入数据库
"""
import sys
import os

# 设置工作目录为data-service根目录
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, '.')

from datetime import datetime, timedelta
from db import SessionLocal, MarketFundFlowSnapshot, FuturesPositionSnapshot
from routers.market_flow import _get_north_bound_flow, _get_market_fund_by_investor_type, _get_citic_futures_position


def save_market_fund_flow_snapshot(trade_date: str = None):
    """
    保存市场资金流向快照
    
    Args:
        trade_date: 交易日期，格式YYYY-MM-DD，默认为今天
    """
    if trade_date is None:
        trade_date = datetime.now().strftime('%Y-%m-%d')
    
    session = SessionLocal()
    try:
        print(f'[{datetime.now()}] 开始保存 {trade_date} 市场资金流向快照...')
        
        # 1. 获取北向资金流向
        north_bound = _get_north_bound_flow()
        if north_bound['date']:
            snapshot = MarketFundFlowSnapshot(
                trade_date=trade_date,
                investor_type='north_bound',
                inflow=north_bound['inflow'],
                outflow=north_bound['outflow'],
                netflow=north_bound['netflow']
            )
            session.merge(snapshot)
            print(f'  ✅ 北向资金: 净流入 {north_bound["netflow"]/1e8:.2f}亿')
        
        # 2. 获取投资者类型分类数据
        investor_data = _get_market_fund_by_investor_type()
        
        if investor_data.get('date'):
            # 保存主力、机构、游资、散户数据
            for inv_type in ['main', 'institution', 'hot_money', 'retail']:
                if inv_type in investor_data:
                    data = investor_data[inv_type]
                    snapshot = MarketFundFlowSnapshot(
                        trade_date=trade_date,
                        investor_type=inv_type,
                        inflow=data['inflow'],
                        outflow=data['outflow'],
                        netflow=data['netflow']
                    )
                    session.merge(snapshot)
                    print(f'  ✅ {inv_type}: 净流入 {data["netflow"]/1e8:.2f}亿')
        
        session.commit()
        print(f'  ✅ 市场资金流向快照保存成功')
        return True
        
    except Exception as e:
        session.rollback()
        print(f'  ❌ 保存市场资金流向快照失败: {e}')
        return False
    finally:
        session.close()


def save_futures_position_snapshot(trade_date: str = None):
    """
    保存期货持仓快照（中信证券IF主力合约）
    
    Args:
        trade_date: 交易日期，格式YYYYMMDD，默认为昨天
    """
    if trade_date is None:
        # 期货数据通常T+1更新，查询昨天的数据
        trade_date = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')
    
    session = SessionLocal()
    try:
        print(f'[{datetime.now()}] 开始保存 {trade_date} 期货持仓快照...')
        
        # 获取中信证券IF主力合约持仓
        position = _get_citic_futures_position(trade_date, 'IF')
        
        if 'error' not in position:
            snapshot = FuturesPositionSnapshot(
                trade_date=trade_date,
                variety=position['variety'],
                contract=position['contract'],
                broker='中信',
                long_position=position['total_long'],
                short_position=position['total_short'],
                net_position=position['net_position'],
                total_oi=position['total_open_interest']
            )
            session.merge(snapshot)
            session.commit()
            
            direction = '做多' if position['net_position'] > 0 else '做空'
            print(f'  ✅ 中信证券 {position["contract"]}: '
                  f'净持仓{position["net_position"]:+,}手 ({direction})')
            return True
        else:
            print(f'  ⚠️  期货持仓数据获取失败: {position["error"]}')
            return False
            
    except Exception as e:
        session.rollback()
        print(f'  ❌ 保存期货持仓快照失败: {e}')
        return False
    finally:
        session.close()


def run_daily_snapshot():
    """
    每日快照任务主函数
    推荐执行时间：每天16:30（收盘后30分钟）
    """
    print('='*80)
    print(f'市场数据每日快照任务开始 - {datetime.now()}')
    print('='*80)
    
    # 1. 保存市场资金流向快照
    save_market_fund_flow_snapshot()
    
    # 2. 保存期货持仓快照
    save_futures_position_snapshot()
    
    print('='*80)
    print(f'市场数据每日快照任务完成 - {datetime.now()}')
    print('='*80)


if __name__ == '__main__':
    # 支持命令行参数指定日期
    if len(sys.argv) > 1:
        date_arg = sys.argv[1]
        print(f'手动执行快照任务，日期: {date_arg}')
        save_market_fund_flow_snapshot(date_arg)
        save_futures_position_snapshot(date_arg.replace('-', ''))
    else:
        # 默认执行今日快照
        run_daily_snapshot()
