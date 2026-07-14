#!/usr/bin/env python3
"""
回填历史市场资金流向数据（使用东方财富历史数据API）
"""
import sys
import os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, '.')

import requests
from datetime import datetime
from db import SessionLocal, MarketFundFlowSnapshot

def backfill_market_flow_history(days=30):
    """
    回填历史市场资金流向数据
    
    Args:
        days: 回填最近多少天的数据
    """
    print(f'=== 回填最近{days}天市场资金流向数据 ===\n')
    
    # 调用东方财富历史数据API
    url = "http://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
    params = {
        "lmt": days,
        "klt": 101,
        "secid": "1.000001",
        "fields1": "f1,f2,f3,f7",
        "fields2": "f51,f52,f53,f54,f55,f56,f57",
        "ut": "b2884a393a59ad64002292a3e90d46a5",
        "_": int(datetime.now().timestamp() * 1000)
    }
    headers = {"User-Agent": "Mozilla/5.0"}
    
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        if not data.get('data') or not data['data'].get('klines'):
            print('❌ 获取历史数据失败')
            return 0
        
        # 解析历史数据
        klines = data['data']['klines']
        print(f'获取到 {len(klines)} 天数据\n')
        
        session = SessionLocal()
        success_count = 0
        
        for line in klines:
            fields = line.split(',')
            date_str = fields[0]  # YYYY-MM-DD
            
            try:
                # 检查是否已存在
                existing = session.query(MarketFundFlowSnapshot).filter_by(
                    trade_date=date_str
                ).first()
                
                if existing:
                    print(f'  ⚠️  {date_str} 已有数据，跳过')
                    continue
                
                # 解析数据
                main_netflow = float(fields[1])     # 主力净流入
                retail_netflow = float(fields[2])   # 小单（散户）
                medium_netflow = float(fields[3])   # 中单
                big_netflow = float(fields[4])      # 大单（游资）
                super_netflow = float(fields[5])    # 超大单（机构）
                
                # 计算流入流出（简化估算）
                def calc_inflow_outflow(netflow):
                    if netflow > 0:
                        inflow = abs(netflow) / 0.2
                        outflow = inflow - abs(netflow)
                    elif netflow < 0:
                        outflow = abs(netflow) / 0.2
                        inflow = outflow - abs(netflow)
                    else:
                        inflow = outflow = 0.0
                    return inflow, outflow
                
                # 保存各类资金快照
                snapshots_to_save = [
                    ('main', *calc_inflow_outflow(main_netflow), main_netflow),
                    ('institution', *calc_inflow_outflow(super_netflow), super_netflow),
                    ('hot_money', *calc_inflow_outflow(big_netflow), big_netflow),
                    ('retail', *calc_inflow_outflow(retail_netflow), retail_netflow),
                    ('north_bound', 0.0, 0.0, 0.0),  # 北向资金暂时设为0
                ]
                
                for inv_type, inflow, outflow, netflow in snapshots_to_save:
                    snapshot = MarketFundFlowSnapshot(
                        trade_date=date_str,
                        investor_type=inv_type,
                        inflow=inflow,
                        outflow=outflow,
                        netflow=netflow
                    )
                    session.merge(snapshot)
                
                session.commit()
                print(f'  ✅ {date_str}: 机构{super_netflow/1e8:>7.2f}亿, 游资{big_netflow/1e8:>7.2f}亿, 散户{retail_netflow/1e8:>7.2f}亿')
                success_count += 1
                
            except Exception as e:
                session.rollback()
                print(f'  ❌ {date_str} 保存失败: {e}')
                continue
        
        session.close()
        
        print(f'\n=== 回填完成，成功 {success_count}/{len(klines)} 条 ===')
        return success_count
        
    except Exception as e:
        print(f'❌ 回填失败: {e}')
        return 0


if __name__ == '__main__':
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    backfill_market_flow_history(days)
