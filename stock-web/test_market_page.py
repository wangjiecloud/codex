#!/usr/bin/env python3
"""
测试资金流向页面
"""
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    
    print("导航到资金流向页面...")
    page.goto('http://localhost:3000/market')
    page.wait_for_load_state('networkidle')
    
    # 等待页面加载完成
    time.sleep(2)
    
    print("截取页面全屏...")
    page.screenshot(path='/tmp/market_page_full.png', full_page=True)
    print("✓ 全屏截图已保存到: /tmp/market_page_full.png")
    
    # 检查关键元素
    print("\n检查页面元素...")
    
    # 检查标题
    title = page.locator('h1:text("市场资金流向")')
    if title.count() > 0:
        print("✓ 找到页面标题: 市场资金流向")
    else:
        print("✗ 未找到页面标题")
    
    # 检查大资金卡片
    big_money = page.locator('text=大资金')
    if big_money.count() > 0:
        print("✓ 找到大资金卡片")
    else:
        print("✗ 未找到大资金卡片")
    
    # 检查机构资金卡片
    institution = page.locator('text=机构资金')
    if institution.count() > 0:
        print("✓ 找到机构资金卡片")
    else:
        print("✗ 未找到机构资金卡片")
    
    # 检查散户资金卡片
    retail = page.locator('text=散户资金')
    if retail.count() > 0:
        print("✓ 找到散户资金卡片")
    else:
        print("✗ 未找到散户资金卡片")
    
    # 检查行业板块资金流向表
    industry_table = page.locator('text=行业板块资金流向')
    if industry_table.count() > 0:
        print("✓ 找到行业板块资金流向表")
    else:
        print("✗ 未找到行业板块资金流向表")
    
    # 检查概念板块资金流向表
    concept_table = page.locator('text=概念板块资金流向')
    if concept_table.count() > 0:
        print("✓ 找到概念板块资金流向表")
    else:
        print("✗ 未找到概念板块资金流向表")
    
    # 检查期货持仓表
    futures_table = page.locator('text=中信证券股指期货持仓')
    if futures_table.count() > 0:
        print("✓ 找到中信证券股指期货持仓表")
    else:
        print("✗ 未找到中信证券股指期货持仓表")
    
    # 等待数据加载
    print("\n等待数据加载...")
    time.sleep(3)
    
    # 截取加载后的页面
    print("截取数据加载后的页面...")
    page.screenshot(path='/tmp/market_page_loaded.png', full_page=True)
    print("✓ 数据加载后截图已保存到: /tmp/market_page_loaded.png")
    
    # 检查表格是否有数据
    table_rows = page.locator('tbody tr').count()
    print(f"\n表格行数: {table_rows}")
    
    if table_rows > 0:
        print("✓ 表格有数据")
    else:
        print("⚠ 表格暂无数据（可能需要先触发数据快照）")
    
    # 测试刷新按钮
    print("\n测试刷新功能...")
    refresh_buttons = page.locator('button:has-text("刷新")').all()
    print(f"找到 {len(refresh_buttons)} 个刷新按钮")
    
    # 保持浏览器打开以便查看
    print("\n页面测试完成！浏览器将保持打开状态10秒...")
    time.sleep(10)
    
    browser.close()
    print("\n✓ 测试完成")
