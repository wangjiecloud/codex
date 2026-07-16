#!/usr/bin/env python3
"""
使用 Playwright 从东方财富网页抓取大盘资金流向数据并存入数据库
"""

import asyncio
import sys
from datetime import datetime
from playwright.async_api import async_playwright

# 添加当前目录到路径
sys.path.insert(0, '.')

from db import SessionLocal, MarketDailyFundFlow


def parse_number(text):
    """解析数字，处理亿/万单位和百分号"""
    if not text or text == '--':
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


async def scrape_and_save():
    """抓取数据并保存到数据库"""
    
    async with async_playwright() as p:
        print("=" * 60)
        print("大盘资金流向数据抓取工具 (Playwright)")
        print("=" * 60)
        
        print("\n🚀 启动浏览器（可见模式，用于观察）...")
        browser = await p.chromium.launch(headless=False)  # 可见模式
        page = await browser.new_page(
            viewport={'width': 1920, 'height': 1080}
        )
        
        try:
            print("📄 访问网页: https://data.eastmoney.com/zjlx/dpzjlx.html")
            await page.goto("https://data.eastmoney.com/zjlx/dpzjlx.html", timeout=30000)
            
            # 等待5秒让页面初始加载
            print("⏳ 等待页面加载...")
            await asyncio.sleep(5)
            
            print("🚪 关闭弹窗...")
            await page.keyboard.press("Escape")
            await asyncio.sleep(1)
            
            # 再等待5秒让数据表格加载
            print("⏳ 等待数据表格加载（等待20秒观察）...")
            await asyncio.sleep(20)
            
            print("🔍 查找数据表格...")
            tables = await page.query_selector_all("table")
            print(f"找到 {len(tables)} 个表格")
            
            # 找到包含日期数据的表格（通常是最后一个大表格）
            target_table = None
            for idx, table in enumerate(tables):
                rows = await table.query_selector_all("tr")
                print(f"  表格{idx+1}: {len(rows)} 行")
                
                if len(rows) > 50:  # 历史数据表格行数较多
                    # 检查第一行
                    first_row_cells = await rows[0].query_selector_all("th, td")
                    print(f"    第1行有 {len(first_row_cells)} 个单元格")
                    
                    if len(first_row_cells) >= 7:  # 至少7个主要字段
                        first_texts = []
                        for cell in first_row_cells[:5]:
                            text = await cell.text_content()
                            first_texts.append(text.strip())
                        print(f"    前5个单元格: {first_texts}")
                        
                        # 检查是否包含"日期"
                        if any("日期" in text for text in first_texts):
                            target_table = table
                            print(f"✅ 找到目标表格（表格{idx+1}），共 {len(rows)} 行")
                            break
            
            if not target_table:
                print("❌ 未找到数据表格")
                return None
            
            # 提取表格数据
            print("📊 提取表格数据...")
            rows = await target_table.query_selector_all("tr")
            data = []
            
            for i, row in enumerate(rows):
                if i == 0:  # 跳过表头第1行
                    continue
                if i == 1:  # 跳过表头第2行（字段说明）
                    continue
                
                cells = await row.query_selector_all("td")
                if len(cells) < 15:
                    continue
                
                # 提取每个单元格的文本
                cell_texts = []
                for cell in cells[:15]:
                    text = await cell.text_content()
                    cell_texts.append(text.strip())
                
                # 解析数据
                row_data = {
                    "日期": cell_texts[0],
                    "上证-收盘价": parse_number(cell_texts[1]),
                    "上证-涨跌幅": parse_number(cell_texts[2]),
                    "深证-收盘价": parse_number(cell_texts[3]),
                    "深证-涨跌幅": parse_number(cell_texts[4]),
                    "主力净流入-净额": parse_number(cell_texts[5]),
                    "主力净流入-净占比": parse_number(cell_texts[6]),
                    "超大单净流入-净额": parse_number(cell_texts[7]),
                    "超大单净流入-净占比": parse_number(cell_texts[8]),
                    "大单净流入-净额": parse_number(cell_texts[9]),
                    "大单净流入-净占比": parse_number(cell_texts[10]),
                    "中单净流入-净额": parse_number(cell_texts[11]),
                    "中单净流入-净占比": parse_number(cell_texts[12]),
                    "小单净流入-净额": parse_number(cell_texts[13]),
                    "小单净流入-净占比": parse_number(cell_texts[14]),
                }
                
                # 验证日期格式
                if row_data["日期"] and len(row_data["日期"]) == 10:
                    data.append(row_data)
            
            print(f"✅ 成功提取 {len(data)} 条数据")
            if data:
                print(f"日期范围: {data[0]['日期']} ~ {data[-1]['日期']}")
                print(f"\n示例（第1条）:")
                print(f"  日期: {data[0]['日期']}")
                print(f"  上证收盘: {data[0]['上证-收盘价']:.2f}")
                print(f"  主力净流入: {data[0]['主力净流入-净额'] / 100000000:.2f}亿")
            
            # 截图保存
            print("\n📸 保存截图...")
            await page.screenshot(path="/tmp/market_fund_flow_final.png", full_page=False)
            
            await browser.close()
            
            return data
            
        except Exception as e:
            print(f"❌ 抓取失败: {e}")
            import traceback
            traceback.print_exc()
            await browser.close()
            return None


def save_to_database(data):
    """保存数据到数据库"""
    if not data:
        print("❌ 没有数据可保存")
        return 0
    
    print(f"\n💾 开始写入数据库...")
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
                
            except Exception as e:
                print(f"⚠️  处理 {item.get('日期', '?')} 时出错: {e}")
                errors += 1
        
        session.commit()
        print(f"✅ 数据库写入完成:")
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


async def main():
    """主函数"""
    # 抓取数据
    data = await scrape_and_save()
    
    if not data:
        print("\n❌ 未能获取数据，退出")
        return
    
    # 保存到数据库
    inserted = save_to_database(data)
    
    if inserted > 0:
        print(f"\n🎉 任务完成！共新增 {inserted} 条历史数据")
        print("现在可以访问前端页面查看数据了")
    else:
        print("\n⚠️  没有新增数据（可能已全部存在）")


if __name__ == "__main__":
    asyncio.run(main())
