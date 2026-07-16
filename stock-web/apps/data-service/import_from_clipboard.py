#!/usr/bin/env python3
"""
手动导入工具：从浏览器复制的表格数据导入数据库

使用方法：
1. 在浏览器打开 https://data.eastmoney.com/zjlx/dpzjlx.html
2. 等待数据加载完成
3. 选中整个表格（从表头到最后一行数据）
4. 复制（Cmd+C）
5. 粘贴到 /tmp/market_table.txt 文件中
6. 运行此脚本: python3 import_from_clipboard.py
"""

import sys
sys.path.insert(0, '.')

from db import SessionLocal, MarketDailyFundFlow


def parse_number(text):
    """解析数字，处理亿/万单位和百分号"""
    if not text or text in ('--', '-', ''):
        return 0.0
    
    text = text.strip().replace(',', '')
    
    # 处理百分号
    if '%' in text:
        text = text.replace('%', '')
        try:
            return float(text)
        except:
            return 0.0
    
    # 处理亿/万单位
    if '亿' in text:
        num_str = text.replace('亿', '').strip()
        try:
            return float(num_str) * 100000000
        except:
            return 0.0
    elif '万' in text:
        num_str = text.replace('万', '').strip()
        try:
            return float(num_str) * 10000
        except:
            return 0.0
    else:
        try:
            return float(text)
        except:
            return 0.0


def parse_table_data(file_path="/tmp/market_table.txt"):
    """解析从浏览器复制的表格数据"""
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"❌ 文件不存在: {file_path}")
        print("\n请按以下步骤操作:")
        print("1. 浏览器打开 https://data.eastmoney.com/zjlx/dpzjlx.html")
        print("2. 等待数据加载")
        print("3. 选中表格全部数据并复制")
        print("4. 粘贴到 /tmp/market_table.txt")
        print("5. 重新运行此脚本")
        return None
    
    data = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # 按制表符或多个空格分割
        import re
        parts = re.split(r'\t+|\s{2,}', line)
        
        # 过滤掉表头行
        if len(parts) < 15 or parts[0] in ('日期', '收盘价'):
            continue
        
        # 验证第一列是日期格式 YYYY-MM-DD
        if not re.match(r'\d{4}-\d{2}-\d{2}', parts[0]):
            continue
        
        try:
            row_data = {
                "日期": parts[0],
                "上证-收盘价": parse_number(parts[1]),
                "上证-涨跌幅": parse_number(parts[2]),
                "深证-收盘价": parse_number(parts[3]),
                "深证-涨跌幅": parse_number(parts[4]),
                "主力净流入-净额": parse_number(parts[5]),
                "主力净流入-净占比": parse_number(parts[6]),
                "超大单净流入-净额": parse_number(parts[7]),
                "超大单净流入-净占比": parse_number(parts[8]),
                "大单净流入-净额": parse_number(parts[9]),
                "大单净流入-净占比": parse_number(parts[10]),
                "中单净流入-净额": parse_number(parts[11]),
                "中单净流入-净占比": parse_number(parts[12]),
                "小单净流入-净额": parse_number(parts[13]),
                "小单净流入-净占比": parse_number(parts[14]),
            }
            data.append(row_data)
        except Exception as e:
            print(f"⚠️  解析行失败: {line[:50]}... - {e}")
            continue
    
    return data


def save_to_database(data):
    """保存数据到数据库"""
    if not data:
        print("❌ 没有数据可保存")
        return 0
    
    print(f"\n💾 开始写入数据库（共 {len(data)} 条）...")
    session = SessionLocal()
    inserted = 0
    skipped = 0
    errors = 0
    
    try:
        for item in data:
            try:
                trade_date = item["日期"]
                
                # 检查是否已存在
                exists = session.query(MarketDailyFundFlow).filter_by(trade_date=trade_date).first()
                if exists:
                    skipped += 1
                    continue
                
                # 创建新记录
                obj = MarketDailyFundFlow(
                    trade_date=trade_date,
                    sh_close=item["上证-收盘价"],
                    sh_change_pct=item["上证-涨跌幅"],
                    sz_close=item["深证-收盘价"],
                    sz_change_pct=item["深证-涨跌幅"],
                    main_net=item["主力净流入-净额"],
                    main_net_pct=item["主力净流入-净占比"],
                    super_net=item["超大单净流入-净额"],
                    super_net_pct=item["超大单净流入-净占比"],
                    big_net=item["大单净流入-净额"],
                    big_net_pct=item["大单净流入-净占比"],
                    mid_net=item["中单净流入-净额"],
                    mid_net_pct=item["中单净流入-净占比"],
                    small_net=item["小单净流入-净额"],
                    small_net_pct=item["小单净流入-净占比"],
                )
                session.add(obj)
                inserted += 1
                
                # 每100条提交一次
                if inserted % 100 == 0:
                    session.commit()
                    print(f"  已写入 {inserted} 条...")
                
            except Exception as e:
                print(f"⚠️  处理 {item.get('日期', '?')} 时出错: {e}")
                errors += 1
        
        session.commit()
        print(f"\n✅ 数据库写入完成:")
        print(f"   - 新增: {inserted} 条")
        print(f"   - 跳过: {skipped} 条")
        if errors > 0:
            print(f"   - 错误: {errors} 条")
        
        return inserted
        
    except Exception as e:
        session.rollback()
        print(f"❌ 数据库写入失败: {e}")
        import traceback
        traceback.print_exc()
        return 0
    finally:
        session.close()


def main():
    print("=" * 60)
    print("大盘资金流向 - 手动导入工具")
    print("=" * 60)
    
    # 解析表格数据
    data = parse_table_data()
    
    if not data:
        return
    
    print(f"\n✅ 成功解析 {len(data)} 条数据")
    print(f"日期范围: {data[0]['日期']} ~ {data[-1]['日期']}")
    print(f"\n示例（第1条）:")
    print(f"  日期: {data[0]['日期']}")
    print(f"  上证收盘: {data[0]['上证-收盘价']:.2f}")
    print(f"  主力净流入: {data[0]['主力净流入-净额'] / 100000000:.2f}亿")
    
    # 保存到数据库
    inserted = save_to_database(data)
    
    if inserted > 0:
        print(f"\n🎉 任务完成！共新增 {inserted} 条历史数据")
        print("现在可以访问前端页面查看数据了")
    else:
        print("\n⚠️  没有新增数据（可能已全部存在）")


if __name__ == "__main__":
    main()
