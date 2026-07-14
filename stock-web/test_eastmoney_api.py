#!/usr/bin/env python3
"""
测试东方财富资金流向API
"""
import requests
from datetime import datetime
import json


def fetch_market_fund_flow(days=30):
    """
    获取市场整体资金流向历史数据（按投资者类型分类）
    
    Args:
        days: 获取最近多少天的数据，0表示全部
        
    Returns:
        list of dict，每个dict包含一天的资金流向数据
    """
    url = "http://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
    
    params = {
        "lmt": days,  # 数据条数
        "klt": 101,   # 日线
        "secid": "1.000001",  # 上证指数
        "fields1": "f1,f2,f3,f7",
        "fields2": "f51,f52,f53,f54,f55,f56,f57",
        "ut": "b2884a393a59ad64002292a3e90d46a5",
        "_": int(datetime.now().timestamp() * 1000)
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        if data.get('data') and data['data'].get('klines'):
            result = []
            for line in data['data']['klines']:
                fields = line.split(',')
                result.append({
                    'date': fields[0],  # 日期
                    'retail_flow': float(fields[2]),  # 小单净流入（散户）
                    'medium_flow': float(fields[3]),  # 中单净流入
                    'big_flow': float(fields[4]),     # 大单净流入（游资/大户）
                    'super_flow': float(fields[5]),   # 超大单净流入（机构）
                    'main_flow': float(fields[1]),    # 主力净流入（超大单+大单）
                })
            return result
        else:
            return []
            
    except Exception as e:
        print(f'❌ 获取数据失败: {e}')
        return []


def fetch_northbound_flow():
    """
    获取北向资金（沪深港通）实时流向
    
    Returns:
        dict包含沪股通和深股通净流入
    """
    url = "http://push2.eastmoney.com/api/qt/kamt.rtmin/get"
    
    params = {
        "fields1": "f1,f2,f3,f4",
        "fields2": "f51,f52,f53,f54,f55,f56",
        "ut": "b2884a393a59ad64002292a3e90d46a5",
        "cb": "jQuery",
        "_": int(datetime.now().timestamp() * 1000)
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        resp.raise_for_status()
        
        # 移除JSONP包装
        text = resp.text
        if text.startswith('jQuery'):
            text = text[text.index('(')+1:text.rindex(')')]
        
        data = json.loads(text)
        
        if data.get('data'):
            hgt_flow = data['data']['hgt'].get('ggt_ss', 0)  # 沪股通净流入
            sgt_flow = data['data']['sgt'].get('ggt_ss', 0)  # 深股通净流入
            
            return {
                'northbound_flow': (hgt_flow + sgt_flow) / 10000.0,  # 转换为万元
                'hgt_flow': hgt_flow / 10000.0,
                'sgt_flow': sgt_flow / 10000.0
            }
        else:
            return None
            
    except Exception as e:
        print(f'❌ 获取北向资金失败: {e}')
        return None


if __name__ == '__main__':
    print('=== 测试东方财富资金流向API ===\n')
    
    # 测试1：获取最近5天市场资金流向
    print('📊 测试1：获取最近5天市场资金流向\n')
    fund_flow = fetch_market_fund_flow(days=5)
    
    if fund_flow:
        print(f'成功获取 {len(fund_flow)} 天数据\n')
        for item in fund_flow:
            print(f"{item['date']}:")
            print(f"  机构(超大单): {item['super_flow']/1e8:>8.2f}亿")
            print(f"  游资(大单):   {item['big_flow']/1e8:>8.2f}亿")
            print(f"  中单:         {item['medium_flow']/1e8:>8.2f}亿")
            print(f"  散户(小单):   {item['retail_flow']/1e8:>8.2f}亿")
            print(f"  主力合计:     {item['main_flow']/1e8:>8.2f}亿")
            print()
    else:
        print('❌ 获取失败\n')
    
    # 测试2：获取北向资金流向
    print('='*80)
    print('📊 测试2：获取北向资金实时流向\n')
    northbound = fetch_northbound_flow()
    
    if northbound:
        print(f"沪股通净流入: {northbound['hgt_flow']/1e4:>8.2f}亿")
        print(f"深股通净流入: {northbound['sgt_flow']/1e4:>8.2f}亿")
        print(f"北向资金合计: {northbound['northbound_flow']/1e4:>8.2f}亿")
    else:
        print('❌ 获取失败')
    
    # 测试3：统计30天资金流向
    print('\n' + '='*80)
    print('📊 测试3：最近30天资金流向汇总统计\n')
    fund_flow_30 = fetch_market_fund_flow(days=30)
    
    if fund_flow_30:
        total_super = sum(item['super_flow'] for item in fund_flow_30)
        total_big = sum(item['big_flow'] for item in fund_flow_30)
        total_main = sum(item['main_flow'] for item in fund_flow_30)
        total_retail = sum(item['retail_flow'] for item in fund_flow_30)
        
        print(f'统计周期: {fund_flow_30[0]["date"]} ~ {fund_flow_30[-1]["date"]} ({len(fund_flow_30)}个交易日)\n')
        print(f'机构(超大单)累计: {total_super/1e8:>10.2f}亿')
        print(f'游资(大单)累计:   {total_big/1e8:>10.2f}亿')
        print(f'主力合计累计:     {total_main/1e8:>10.2f}亿')
        print(f'散户(小单)累计:   {total_retail/1e8:>10.2f}亿')
        print()
        print(f'机构日均流向:     {total_super/len(fund_flow_30)/1e8:>10.2f}亿/天')
        print(f'游资日均流向:     {total_big/len(fund_flow_30)/1e8:>10.2f}亿/天')
        print(f'散户日均流向:     {total_retail/len(fund_flow_30)/1e8:>10.2f}亿/天')
        
        # 分析市场情绪
        print('\n📈 市场分析:')
        if total_main < 0 and total_retail > 0:
            print('  主力持续流出，散户持续流入 → 典型"散户接盘"行情')
        elif total_main > 0 and total_retail < 0:
            print('  主力持续流入，散户流出 → 机构建仓，市场可能启动')
        
        if abs(total_super) > abs(total_big):
            print(f'  机构资金主导市场（机构/游资比 = {abs(total_super/total_big):.1f}:1）')
        else:
            print(f'  游资活跃度更高（游资/机构比 = {abs(total_big/total_super):.1f}:1）')
