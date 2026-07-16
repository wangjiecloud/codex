#!/usr/bin/env python3
"""
使用 Playwright 抓取东方财富大盘资金流向数据
通过浏览器渲染页面，等待JS加载完成后提取表格数据
"""

import asyncio
import json
import re
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_market_fund_flow():
    """使用 Playwright 抓取大盘资金流向数据"""
    
    async with async_playwright() as p:
        print("🚀 启动浏览器...")
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        # 监听网络请求，拦截API响应
        api_data = []
        
        async def handle_response(response):
            """拦截API响应"""
            if "push2his.eastmoney.com" in response.url and "fflow/daykline" in response.url:
                try:
                    text = await response.text()
                    print(f"✅ 拦截到API响应，长度: {len(text)}")
                    api_data.append(text)
                except Exception as e:
                    print(f"❌ 解析响应失败: {e}")
        
        page.on("response", handle_response)
        
        try:
            print("📄 访问网页: https://data.eastmoney.com/zjlx/dpzjlx.html")
            # 不等待networkidle，因为被限制的API会阻塞
            await page.goto("https://data.eastmoney.com/zjlx/dpzjlx.html", wait_until="domcontentloaded", timeout=30000)
            
            # 等待2秒
            await asyncio.sleep(2)
            
            # 关闭弹窗（如果有）
            print("🚪 尝试关闭弹窗...")
            close_buttons = await page.query_selector_all("img[src*='ic_close'], [onclick*='close'], .close, button:has-text('关闭'), span:has-text('×')")
            for btn in close_buttons[:3]:  # 最多点击3个关闭按钮
                try:
                    await btn.click(timeout=1000)
                    print("✅ 关闭了一个弹窗")
                    await asyncio.sleep(0.5)
                except:
                    pass
            
            # 再等待3秒让API请求执行
            print("⏳ 等待数据加载...")
            await asyncio.sleep(3)
            
            # 尝试执行页面上的数据加载函数（如果有）
            print("🔧 尝试手动触发数据加载...")
            await page.evaluate("""
                () => {
                    // 尝试触发常见的数据加载函数
                    if (typeof loadData === 'function') loadData();
                    if (typeof initTable === 'function') initTable();
                    if (typeof refreshData === 'function') refreshData();
                }
            """)
            
            # 再等待2秒
            await asyncio.sleep(2)
            
            # 截图保存
            screenshot_path = "/tmp/market_fund_flow.png"
            await page.screenshot(path=screenshot_path, full_page=True)
            print(f"📸 截图已保存: {screenshot_path}")
            
            # 方法1: 如果拦截到了API响应
            if api_data:
                print("✅ 使用拦截的API响应数据")
                return parse_api_response(api_data[0])
            
            # 方法2: 尝试从页面JavaScript全局变量获取数据
            print("⚠️  未拦截到API响应，尝试从页面变量获取...")
            js_data = await page.evaluate("""
                () => {
                    // 查找可能存储数据的全局变量
                    const possibleVars = ['klineData', 'tableData', 'dpData', 'fundFlowData', 'dataList'];
                    for (const varName of possibleVars) {
                        if (window[varName] && Array.isArray(window[varName]) && window[varName].length > 0) {
                            console.log('Found data in:', varName);
                            return { source: varName, data: window[varName] };
                        }
                    }
                    
                    // 尝试从DOM中提取iframe内容
                    const iframes = document.querySelectorAll('iframe');
                    console.log('Found iframes:', iframes.length);
                    
                    return null;
                }
            """)
            
            if js_data and js_data.get('data'):
                print(f"✅ 从JavaScript变量 '{js_data['source']}' 获取到数据")
                return js_data['data']
            
            # 方法3: 从页面提取表格数据（即使为空也试试）
            print("⚠️  尝试解析页面表格...")
            table_data = await extract_table_data(page)
            if table_data:
                print(f"✅ 从页面提取到 {len(table_data)} 条数据")
                return table_data
            
            print("❌ 所有方法都未能提取到数据")
            return None
            
        except Exception as e:
            print(f"❌ 抓取失败: {e}")
            import traceback
            traceback.print_exc()
            return None
        finally:
            await browser.close()


async def extract_table_data(page):
    """从页面提取表格数据"""
    try:
        # 获取所有表格行
        rows = await page.query_selector_all("table.default_tab tbody tr")
        data = []
        
        for row in rows:
            cells = await row.query_selector_all("td")
            if len(cells) >= 15:
                row_data = []
                for cell in cells[:15]:
                    text = await cell.text_content()
                    row_data.append(text.strip())
                
                data.append({
                    "日期": row_data[0],
                    "上证-收盘价": row_data[1],
                    "上证-涨跌幅": row_data[2],
                    "深证-收盘价": row_data[3],
                    "深证-涨跌幅": row_data[4],
                    "主力净流入-净额": row_data[5],
                    "主力净流入-净占比": row_data[6],
                    "超大单净流入-净额": row_data[7],
                    "超大单净流入-净占比": row_data[8],
                    "大单净流入-净额": row_data[9],
                    "大单净流入-净占比": row_data[10],
                    "中单净流入-净额": row_data[11],
                    "中单净流入-净占比": row_data[12],
                    "小单净流入-净额": row_data[13],
                    "小单净流入-净占比": row_data[14],
                })
        
        return data if data else None
    except Exception as e:
        print(f"表格提取错误: {e}")
        return None


def parse_api_response(text):
    """解析API JSONP响应"""
    try:
        # 提取JSONP中的JSON数据
        m = re.search(r'jQuery\w+\((\{.*\})\)', text, re.DOTALL)
        if not m:
            # 降级：找括号
            start = text.index("(") + 1
            end = text.rindex(")")
            json_str = text[start:end]
        else:
            json_str = m.group(1)
        
        data = json.loads(json_str)
        klines = data.get('data', {}).get('klines', [])
        
        result = []
        for line in klines:
            fields = line.split(',')
            if len(fields) >= 15:
                result.append({
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
        
        return result
    except Exception as e:
        print(f"解析API响应失败: {e}")
        return None


def format_js_data(js_data):
    """格式化从JavaScript提取的数据"""
    def parse_num(s):
        """解析数字，处理万/亿单位和百分号"""
        if not s:
            return 0.0
        s = s.replace(',', '').replace('%', '').strip()
        
        # 处理万/亿单位
        if '亿' in s:
            return float(s.replace('亿', '')) * 100000000
        elif '万' in s:
            return float(s.replace('万', '')) * 10000
        else:
            try:
                return float(s)
            except:
                return 0.0
    
    result = []
    for item in js_data:
        result.append({
            "日期": item.get('date', ''),
            "上证-收盘价": parse_num(item.get('sh_close')),
            "上证-涨跌幅": parse_num(item.get('sh_change_pct')),
            "深证-收盘价": parse_num(item.get('sz_close')),
            "深证-涨跌幅": parse_num(item.get('sz_change_pct')),
            "主力净流入-净额": parse_num(item.get('main_net')),
            "主力净流入-净占比": parse_num(item.get('main_net_pct')),
            "超大单净流入-净额": parse_num(item.get('super_net')),
            "超大单净流入-净占比": parse_num(item.get('super_net_pct')),
            "大单净流入-净额": parse_num(item.get('big_net')),
            "大单净流入-净占比": parse_num(item.get('big_net_pct')),
            "中单净流入-净额": parse_num(item.get('mid_net')),
            "中单净流入-净占比": parse_num(item.get('mid_net_pct')),
            "小单净流入-净额": parse_num(item.get('small_net')),
            "小单净流入-净占比": parse_num(item.get('small_net_pct')),
        })
    
    return result


async def save_to_database(data):
    """保存数据到数据库"""
    import sys
    sys.path.insert(0, '.')
    
    from db import SessionLocal, MarketDailyFundFlow
    
    session = SessionLocal()
    inserted = 0
    skipped = 0
    
    try:
        for item in data:
            trade_date = str(item["日期"])
            exists = session.query(MarketDailyFundFlow).filter_by(trade_date=trade_date).first()
            if exists:
                skipped += 1
                continue
            
            obj = MarketDailyFundFlow(
                trade_date=trade_date,
                sh_close=float(item.get("上证-收盘价") or 0),
                sh_change_pct=float(item.get("上证-涨跌幅") or 0),
                sz_close=float(item.get("深证-收盘价") or 0),
                sz_change_pct=float(item.get("深证-涨跌幅") or 0),
                main_net=float(item.get("主力净流入-净额") or 0),
                main_net_pct=float(item.get("主力净流入-净占比") or 0),
                super_net=float(item.get("超大单净流入-净额") or 0),
                super_net_pct=float(item.get("超大单净流入-净占比") or 0),
                big_net=float(item.get("大单净流入-净额") or 0),
                big_net_pct=float(item.get("大单净流入-净占比") or 0),
                mid_net=float(item.get("中单净流入-净额") or 0),
                mid_net_pct=float(item.get("中单净流入-净占比") or 0),
                small_net=float(item.get("小单净流入-净额") or 0),
                small_net_pct=float(item.get("小单净流入-净占比") or 0),
            )
            session.add(obj)
            inserted += 1
        
        session.commit()
        print(f"✅ 数据库写入完成: 新增 {inserted} 条，跳过已有 {skipped} 条")
        return inserted
    except Exception as e:
        session.rollback()
        print(f"❌ 数据库写入失败: {e}")
        raise
    finally:
        session.close()


async def main():
    """主函数"""
    print("=" * 60)
    print("大盘资金流向数据抓取工具 (Playwright)")
    print("=" * 60)
    
    # 抓取数据
    data = await scrape_market_fund_flow()
    
    if not data:
        print("❌ 未能获取数据")
        return
    
    print(f"\n✅ 成功获取 {len(data)} 条数据")
    print(f"日期范围: {data[0]['日期']} ~ {data[-1]['日期']}")
    print(f"\n示例数据（第1条）:")
    print(json.dumps(data[0], indent=2, ensure_ascii=False))
    
    # 保存到JSON文件
    json_path = "/tmp/market_fund_flow_data.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n💾 数据已保存到: {json_path}")
    
    # 询问是否写入数据库
    print("\n是否写入数据库? (y/n): ", end='')
    import sys
    if sys.stdin.isatty():
        choice = input().strip().lower()
    else:
        choice = 'y'  # 非交互模式默认写入
    
    if choice == 'y':
        await save_to_database(data)
    else:
        print("⏭️  跳过数据库写入")


if __name__ == "__main__":
    asyncio.run(main())
