#!/usr/bin/env python3
"""
简化版：直接访问网页、关闭弹窗、截图、解析表格
"""

import asyncio
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        print("🚀 启动浏览器...")
        browser = await p.chromium.launch(headless=False)  # 用可见模式观察
        page = await browser.new_page(
            viewport={'width': 1920, 'height': 1080}
        )
        
        print("📄 访问网页...")
        await page.goto("https://data.eastmoney.com/zjlx/dpzjlx.html")
        
        # 等待页面基本加载
        await asyncio.sleep(3)
        
        print("🚪 尝试关闭弹窗（通过ESC键）...")
        # 按ESC键关闭弹窗更安全
        await page.keyboard.press("Escape")
        await asyncio.sleep(1)
        
        # 或者尝试点击页面空白处
        try:
            await page.click("body", position={"x": 10, "y": 10}, timeout=1000)
        except:
            pass
        
        # 再等待一下
        await asyncio.sleep(3)
        
        print("📸 截图...")
        await page.screenshot(path="/tmp/market_page.png", full_page=False)
        
        print("🔍 提取表格数据...")
        # 查找所有表格
        tables = await page.query_selector_all("table")
        print(f"找到 {len(tables)} 个表格")
        
        for i, table in enumerate(tables):
            rows = await table.query_selector_all("tr")
            print(f"\n表格 {i+1}: {len(rows)} 行")
            
            # 显示前3行内容
            for j, row in enumerate(rows[:3]):
                cells = await row.query_selector_all("td, th")
                texts = []
                for cell in cells[:10]:  # 只显示前10列
                    text = await cell.text_content()
                    texts.append(text.strip()[:20])
                print(f"  行{j+1}: {' | '.join(texts)}")
        
        print("\n等待30秒供观察，然后关闭浏览器...")
        await asyncio.sleep(30)
        
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
