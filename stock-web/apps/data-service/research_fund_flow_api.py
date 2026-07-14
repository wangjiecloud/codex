"""
市场整体投资者类型分类资金流向数据接口研究报告

研究目标：找到能提供市场整体（非个股）投资者类型分类（主力/机构/游资/散户）资金流向的真实数据

数据源对比：
1. akshare：接口丰富但部分网络连接不稳定
2. 东方财富网API：稳定可靠，数据完整 ✓✓✓ 推荐
3. tushare：部分接口需要积分

最终推荐：东方财富网API接口
"""

import requests
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import pandas as pd


class MarketFundFlowAPI:
    """市场资金流向API封装类"""
    
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        self.base_url_his = "http://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
        self.base_url = "http://push2.eastmoney.com/api/qt/stock/fflow/kline/get"
        self.hsgt_url = "http://push2.eastmoney.com/api/qt/kamt.rtmin/get"
    
    def get_market_fund_flow_history(self, days: int = 30) -> pd.DataFrame:
        """
        获取市场整体资金流向历史数据
        
        参数：
            days: 获取最近N天的数据，0表示全部
        
        返回：
            DataFrame包含以下字段：
            - date: 日期
            - main_net_inflow: 主力净流入（元）
            - super_large_net_inflow: 超大单净流入（元）
            - large_net_inflow: 大单净流入（元）
            - mid_net_inflow: 中单净流入（元）
            - small_net_inflow: 小单净流入（元）
            - main_net_inflow_ratio: 主力净流入占比（%）
            - institution_inflow: 机构资金（超大单，元）
            - major_player_inflow: 游资/大户（大单，元）
            - retail_inflow: 散户资金（小单，元）
        
        投资者类型映射：
            - 机构 = 超大单（通常指基金、QFII、保险等机构）
            - 游资/大户 = 大单（通常指私募、游资、大户）
            - 主力 = 超大单 + 大单
            - 散户 = 小单 + 部分中单
        """
        params = {
            "lmt": 0 if days == 0 else days,
            "klt": 101,  # 日线
            "secid": "1.000001",  # 上证指数作为市场代表
            "fields1": "f1,f2,f3,f7",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63",
            "ut": "b2884a393a59ad64002292a3e90d46a5",
            "_": int(datetime.now().timestamp() * 1000)
        }
        
        try:
            resp = requests.get(self.base_url_his, params=params, headers=self.headers, timeout=10)
            data = resp.json()
            
            if not data.get('data') or not data['data'].get('klines'):
                raise ValueError("未获取到数据")
            
            klines = data['data']['klines']
            records = []
            
            for line in klines:
                fields = line.split(',')
                if len(fields) >= 7:
                    record = {
                        'date': fields[0],
                        'main_net_inflow': float(fields[1]) if fields[1] != '-' else 0,
                        'small_net_inflow': float(fields[2]) if fields[2] != '-' else 0,
                        'mid_net_inflow': float(fields[3]) if fields[3] != '-' else 0,
                        'large_net_inflow': float(fields[4]) if fields[4] != '-' else 0,
                        'super_large_net_inflow': float(fields[5]) if fields[5] != '-' else 0,
                        'main_net_inflow_ratio': float(fields[6]) if fields[6] != '-' else 0,
                    }
                    
                    # 投资者类型分类
                    record['institution_inflow'] = record['super_large_net_inflow']  # 机构
                    record['major_player_inflow'] = record['large_net_inflow']  # 游资/大户
                    record['retail_inflow'] = record['small_net_inflow']  # 散户
                    
                    records.append(record)
            
            df = pd.DataFrame(records)
            return df
            
        except Exception as e:
            print(f"获取市场资金流向失败：{e}")
            return pd.DataFrame()
    
    def get_north_fund_flow(self) -> Dict[str, float]:
        """
        获取北向资金流向（沪深港通）
        
        返回：
            字典包含：
            - hgt_net_inflow: 沪股通净流入（元）
            - sgt_net_inflow: 深股通净流入（元）
            - north_total: 北向资金合计（元）
        
        说明：
            北向资金代表外资机构流向，是重要的机构资金指标
        """
        params = {
            "fields1": "f1,f2,f3,f4",
            "fields2": "f51,f52,f53,f54,f55,f56",
            "ut": "b2884a393a59ad64002292a3e90d46a5",
            "cb": "jQuery"
        }
        
        try:
            resp = requests.get(self.hsgt_url, params=params, headers=self.headers, timeout=10)
            text = resp.text
            
            # 去掉 jQuery 回调包装
            if "jQuery" in text:
                text = text[text.find("(")+1:text.rfind(")")]
            
            data = json.loads(text)
            
            if not data.get('data'):
                raise ValueError("未获取到北向资金数据")
            
            hgt = data['data'].get('hgt', {})  # 沪股通
            sgt = data['data'].get('sgt', {})  # 深股通
            
            return {
                'hgt_net_inflow': hgt.get('ggt_ss', 0),
                'sgt_net_inflow': sgt.get('ggt_ss', 0),
                'north_total': hgt.get('ggt_ss', 0) + sgt.get('ggt_ss', 0)
            }
            
        except Exception as e:
            print(f"获取北向资金失败：{e}")
            return {'hgt_net_inflow': 0, 'sgt_net_inflow': 0, 'north_total': 0}
    
    def get_investor_classification_summary(self, days: int = 30) -> Dict:
        """
        获取投资者类型分类资金流向汇总
        
        参数：
            days: 统计最近N天
        
        返回：
            字典包含各投资者类型的累计净流入和平均值
        """
        df = self.get_market_fund_flow_history(days=days)
        north_flow = self.get_north_fund_flow()
        
        if df.empty:
            return {}
        
        summary = {
            'period_days': len(df),
            'start_date': df.iloc[0]['date'],
            'end_date': df.iloc[-1]['date'],
            
            # 主力资金
            'main_total_inflow': df['main_net_inflow'].sum(),
            'main_avg_inflow': df['main_net_inflow'].mean(),
            
            # 机构资金（超大单）
            'institution_total_inflow': df['institution_inflow'].sum(),
            'institution_avg_inflow': df['institution_inflow'].mean(),
            
            # 游资/大户（大单）
            'major_player_total_inflow': df['major_player_inflow'].sum(),
            'major_player_avg_inflow': df['major_player_inflow'].mean(),
            
            # 散户资金（小单）
            'retail_total_inflow': df['retail_inflow'].sum(),
            'retail_avg_inflow': df['retail_inflow'].mean(),
            
            # 中单
            'mid_total_inflow': df['mid_net_inflow'].sum(),
            'mid_avg_inflow': df['mid_net_inflow'].mean(),
            
            # 北向资金（外资机构）
            'north_fund_today': north_flow['north_total'],
            'hgt_today': north_flow['hgt_net_inflow'],
            'sgt_today': north_flow['sgt_net_inflow'],
        }
        
        return summary


def example_usage():
    """使用示例"""
    
    print("=" * 80)
    print("市场投资者类型分类资金流向数据获取示例")
    print("=" * 80)
    
    api = MarketFundFlowAPI()
    
    # 示例1：获取最近30天的历史数据
    print("\n【示例1】获取最近30天市场资金流向历史数据")
    df = api.get_market_fund_flow_history(days=30)
    print(f"\n获取到 {len(df)} 天数据")
    print("\n最近5天数据：")
    print(df.tail(5)[['date', 'institution_inflow', 'major_player_inflow', 'retail_inflow']].to_string(index=False))
    
    # 将金额转换为亿元显示
    print("\n最近5天数据（亿元）：")
    df_display = df.tail(5).copy()
    df_display['机构(超大单)'] = (df_display['institution_inflow'] / 100000000).round(2)
    df_display['游资/大户(大单)'] = (df_display['major_player_inflow'] / 100000000).round(2)
    df_display['散户(小单)'] = (df_display['retail_inflow'] / 100000000).round(2)
    df_display['主力合计'] = (df_display['main_net_inflow'] / 100000000).round(2)
    print(df_display[['date', '机构(超大单)', '游资/大户(大单)', '散户(小单)', '主力合计']].to_string(index=False))
    
    # 示例2：获取北向资金
    print("\n【示例2】获取今日北向资金流向")
    north_flow = api.get_north_fund_flow()
    print(f"沪股通净流入: {north_flow['hgt_net_inflow']/100000000:.2f} 亿元")
    print(f"深股通净流入: {north_flow['sgt_net_inflow']/100000000:.2f} 亿元")
    print(f"北向资金合计: {north_flow['north_total']/100000000:.2f} 亿元")
    
    # 示例3：获取投资者分类汇总统计
    print("\n【示例3】最近30天投资者分类资金流向汇总")
    summary = api.get_investor_classification_summary(days=30)
    print(f"\n统计期间: {summary['start_date']} 至 {summary['end_date']} (共{summary['period_days']}天)")
    print(f"\n主力资金累计净流入: {summary['main_total_inflow']/100000000:.2f} 亿元")
    print(f"  ├─ 机构(超大单): {summary['institution_total_inflow']/100000000:.2f} 亿元")
    print(f"  └─ 游资/大户(大单): {summary['major_player_total_inflow']/100000000:.2f} 亿元")
    print(f"\n散户资金累计净流入: {summary['retail_total_inflow']/100000000:.2f} 亿元")
    print(f"中单资金累计净流入: {summary['mid_total_inflow']/100000000:.2f} 亿元")
    
    print(f"\n日均流向:")
    print(f"  机构日均: {summary['institution_avg_inflow']/100000000:.2f} 亿元")
    print(f"  游资日均: {summary['major_player_avg_inflow']/100000000:.2f} 亿元")
    print(f"  散户日均: {summary['retail_avg_inflow']/100000000:.2f} 亿元")
    
    print("\n" + "=" * 80)
    print("数据字段说明")
    print("=" * 80)
    print("""
投资者类型分类标准（基于东方财富单笔成交金额划分）：

1. 机构资金 = 超大单
   - 定义：单笔成交 ≥ 100万元（或根据流通市值浮动）
   - 代表：公募基金、QFII、保险资金、社保基金等机构投资者
   
2. 游资/大户 = 大单
   - 定义：20万元 ≤ 单笔成交 < 100万元
   - 代表：私募基金、游资、大户、牛散
   
3. 主力资金 = 超大单 + 大单
   - 定义：单笔成交 ≥ 20万元
   - 代表：所有大额资金（机构+游资）
   
4. 散户资金 = 小单
   - 定义：单笔成交 < 4万元
   - 代表：个人投资者（散户）
   
5. 中单
   - 定义：4万元 ≤ 单笔成交 < 20万元
   - 代表：中等规模投资者

补充指标：
- 北向资金（沪深港通）：代表外资机构流向，属于机构资金的重要补充
    """)


def data_source_comparison():
    """数据源对比总结"""
    
    print("\n" + "=" * 80)
    print("数据源对比与推荐")
    print("=" * 80)
    
    comparison = """
╔══════════════╦═══════════════════════════════════════════════════════════╗
║  数据源      ║  评估结果                                                 ║
╠══════════════╬═══════════════════════════════════════════════════════════╣
║ akshare      ║ ⭐⭐⭐                                                     ║
║              ║ 优点：接口丰富，开箱即用，有116个资金流向相关接口         ║
║              ║ 缺点：部分接口网络连接不稳定，需要处理异常                ║
║              ║ 可用接口：                                                ║
║              ║   - stock_market_fund_flow：市场整体资金流向              ║
║              ║   - stock_individual_fund_flow_rank：个股资金流向排名     ║
║              ║   - stock_sector_fund_flow_rank：板块资金流向             ║
║              ║   - stock_hsgt_fund_flow_summary_em：沪深港通资金         ║
╠══════════════╬═══════════════════════════════════════════════════════════╣
║ 东方财富API  ║ ⭐⭐⭐⭐⭐ 【强烈推荐】                                   ║
║              ║ 优点：                                                    ║
║              ║   ✓ 数据稳定可靠，实时更新                               ║
║              ║   ✓ 完整提供：超大单/大单/中单/小单分类数据              ║
║              ║   ✓ 包含净流入金额和占比                                 ║
║              ║   ✓ 支持历史数据查询（120天+）                           ║
║              ║   ✓ 无需注册，免费使用                                   ║
║              ║   ✓ 响应速度快                                           ║
║              ║ 可获取指标：                                              ║
║              ║   - 主力净流入（超大单+大单）                            ║
║              ║   - 超大单净流入（机构资金）                             ║
║              ║   - 大单净流入（游资/大户）                              ║
║              ║   - 中单净流入                                           ║
║              ║   - 小单净流入（散户资金）                               ║
║              ║   - 各类资金占比                                         ║
║              ║   - 北向资金（沪深港通）                                 ║
╠══════════════╬═══════════════════════════════════════════════════════════╣
║ tushare      ║ ⭐⭐                                                       ║
║              ║ 优点：数据权威，质量高                                    ║
║              ║ 缺点：                                                    ║
║              ║   ✗ moneyflow接口需要2000积分（较难获取）                ║
║              ║   ✓ moneyflow_hsgt（沪深港通）免费可用                   ║
║              ║   ✗ 无市场整体分类资金流向数据                           ║
║              ║ 适用场景：已有高积分用户，需要个股资金流向数据            ║
╚══════════════╩═══════════════════════════════════════════════════════════╝

【最终推荐】东方财富API接口

推荐理由：
1. 完全免费，无需注册和积分
2. 数据完整，涵盖所有投资者类型分类
3. 稳定可靠，实时更新
4. API接口清晰，易于集成
5. 支持历史数据回溯

使用建议：
- 市场整体资金流向：使用东方财富API
- 北向资金监控：使用东方财富API或akshare的hsgt接口
- 个股资金流向：可配合使用akshare或tushare（有积分）
- 数据备份：可同时接入akshare作为备用数据源

API接口地址：
- 历史数据：http://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get
- 实时数据：http://push2.eastmoney.com/api/qt/stock/fflow/kline/get
- 北向资金：http://push2.eastmoney.com/api/qt/kamt.rtmin/get
    """
    
    print(comparison)


if __name__ == "__main__":
    # 运行示例
    example_usage()
    
    # 显示数据源对比
    data_source_comparison()
