#!/usr/bin/env python3
"""
测试获取中信证券在股指期货主力合约的持仓数据
"""
import akshare as ak
import pandas as pd
from datetime import datetime, timedelta


def get_main_contract(result_dict):
    """
    从返回的dict中识别主力合约（持仓量最大的合约）
    
    Args:
        result_dict: akshare返回的dict，key为合约代码，value为DataFrame
        
    Returns:
        主力合约代码和对应的DataFrame
    """
    max_oi = 0
    main_contract = None
    main_df = None
    
    for symbol, df in result_dict.items():
        # 计算该合约的总持仓量（多单+空单之和）
        total_oi = df['long_open_interest'].sum() + df['short_open_interest'].sum()
        if total_oi > max_oi:
            max_oi = total_oi
            main_contract = symbol
            main_df = df
    
    return main_contract, main_df, max_oi


def get_citic_position(df, contract):
    """
    从DataFrame中提取中信证券的持仓数据
    
    Args:
        df: 持仓排名DataFrame
        contract: 合约代码
        
    Returns:
        dict包含多单和空单信息
    """
    result = {
        'contract': contract,
        'long_positions': [],
        'short_positions': [],
        'net_position': 0
    }
    
    # 查找多单持仓
    citic_long = df[df['long_party_name'].str.contains('中信', na=False)]
    for _, row in citic_long.iterrows():
        result['long_positions'].append({
            'name': row['long_party_name'],
            'rank': int(row['rank']),
            'position': int(row['long_open_interest']),
            'change': int(row['long_open_interest_chg'])
        })
    
    # 查找空单持仓
    citic_short = df[df['short_party_name'].str.contains('中信', na=False)]
    for _, row in citic_short.iterrows():
        result['short_positions'].append({
            'name': row['short_party_name'],
            'rank': int(row['rank']),
            'position': int(row['short_open_interest']),
            'change': int(row['short_open_interest_chg'])
        })
    
    # 计算净持仓（多单-空单）
    total_long = sum(p['position'] for p in result['long_positions'])
    total_short = sum(p['position'] for p in result['short_positions'])
    result['net_position'] = total_long - total_short
    result['total_long'] = total_long
    result['total_short'] = total_short
    
    return result


def fetch_citic_futures_position(date_str=None, variety='IF'):
    """
    获取中信证券在指定品种主力合约的持仓
    
    Args:
        date_str: 日期字符串，格式YYYYMMDD，默认为前一个交易日
        variety: 期货品种，默认IF（沪深300股指期货）
        
    Returns:
        dict包含持仓详情
    """
    if date_str is None:
        # 默认查询昨天（避免今天数据未更新）
        date_str = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')
    
    try:
        # 获取持仓排名数据
        result = ak.get_cffex_rank_table(date=date_str, vars_list=[variety])
        
        if not result:
            return {'error': f'No data for {date_str}'}
        
        # 识别主力合约
        main_contract, main_df, total_oi = get_main_contract(result)
        
        if main_contract is None:
            return {'error': 'Failed to identify main contract'}
        
        # 提取中信证券持仓
        citic_data = get_citic_position(main_df, main_contract)
        citic_data['date'] = date_str
        citic_data['variety'] = variety
        citic_data['total_open_interest'] = int(total_oi)
        
        return citic_data
        
    except Exception as e:
        return {'error': str(e)}


if __name__ == '__main__':
    print('=== 测试获取中信证券期货持仓 ===\n')
    
    # 测试2026-07-10的数据
    date_str = '20260710'
    result = fetch_citic_futures_position(date_str, 'IF')
    
    if 'error' in result:
        print(f'❌ 错误: {result["error"]}')
    else:
        print(f'📅 日期: {result["date"]}')
        print(f'📊 品种: {result["variety"]}')
        print(f'📌 主力合约: {result["contract"]}')
        print(f'📈 合约总持仓: {result["total_open_interest"]:,}手\n')
        
        print('🟢 中信证券多单持仓:')
        for pos in result['long_positions']:
            print(f'  排名#{pos["rank"]:2d} {pos["name"]:15s} {pos["position"]:8,}手 (变动{pos["change"]:+6,})')
        print(f'  多单合计: {result["total_long"]:,}手\n')
        
        print('🔴 中信证券空单持仓:')
        for pos in result['short_positions']:
            print(f'  排名#{pos["rank"]:2d} {pos["name"]:15s} {pos["position"]:8,}手 (变动{pos["change"]:+6,})')
        print(f'  空单合计: {result["total_short"]:,}手\n')
        
        print(f'📊 净持仓: {result["net_position"]:+,}手 ', end='')
        if result['net_position'] > 0:
            print('(做多)')
        elif result['net_position'] < 0:
            print('(做空)')
        else:
            print('(中性)')
    
    # 测试多个日期
    print('\n' + '='*80)
    print('=== 最近5个交易日中信证券净持仓走势 ===\n')
    
    test_dates = ['20260706', '20260707', '20260708', '20260709', '20260710']
    for date in test_dates:
        result = fetch_citic_futures_position(date, 'IF')
        if 'error' not in result:
            net = result['net_position']
            direction = '多' if net > 0 else ('空' if net < 0 else '中性')
            print(f'{date}: {result["contract"]} 净持仓{net:+7,}手 ({direction}方向)')
        else:
            print(f'{date}: 数据获取失败 - {result["error"]}')
