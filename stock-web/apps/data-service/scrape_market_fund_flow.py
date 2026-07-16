#!/usr/bin/env python3
"""
大盘资金流向爬虫（Selenium 版本）
使用真实浏览器访问东方财富网页，等待数据加载后提取
"""
import sys
import time
import pandas as pd
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from db import SessionLocal, MarketDailyFundFlow


def scrape_market_fund_flow():
    """使用 Selenium 爬取大盘资金流向数据"""
    print("🚀 启动浏览器爬虫...")
    
    # 配置无头模式
    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_argument('user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')
    
    driver = None
    try:
        driver = webdriver.Chrome(options=chrome_options)
        driver.set_page_load_timeout(30)
        
        print("📡 访问东方财富大盘资金流向页面...")
        url = "https://data.eastmoney.com/zjlx/dpzjlx.html"
        driver.get(url)
        
        print("⏳ 等待表格数据加载...")
        # 等待表格出现（最多等 20 秒）
        wait = WebDriverWait(driver, 20)
        table = wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "table#dt_1"))
        )
        
        # 额外等待 2 秒确保数据完全加载
        time.sleep(2)
        
        print("📊 提取表格数据...")
        # 提取表头
        headers = []
        thead = driver.find_elements(By.CSS_SELECTOR, "table#dt_1 thead tr th")
        for th in thead:
            headers.append(th.text.strip())
        
        print(f"   表头: {headers}")
        
        # 提取数据行
        rows = []
        tbody_rows = driver.find_elements(By.CSS_SELECTOR, "table#dt_1 tbody tr")
        
        for tr in tbody_rows[:50]:  # 只取前 50 行（足够了）
            cells = tr.find_elements(By.TAG_NAME, "td")
            row_data = [cell.text.strip() for cell in cells]
            if row_data and row_data[0]:  # 跳过空行
                rows.append(row_data)
        
        print(f"✅ 提取到 {len(rows)} 行数据")
        
        if not rows:
            raise Exception("未能提取到任何数据行")
        
        # 构建 DataFrame
        df = pd.DataFrame(rows, columns=headers)
        print(f"\n数据预览:")
        print(df.head(3))
        
        return df
        
    except Exception as e:
        print(f"❌ 爬取失败: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        if driver:
            driver.quit()
            print("🔚 浏览器已关闭")


def save_to_database(df: pd.DataFrame):
    """将 DataFrame 数据保存到数据库"""
    print("\n📝 写入数据库...")
    
    session = SessionLocal()
    inserted = 0
    skipped = 0
    
    try:
        for _, row in df.iterrows():
            # 根据实际表头映射字段（这里需要根据实际爬取的列名调整）
            trade_date = row.get('日期') or row.iloc[0]
            
            # 检查是否已存在
            exists = session.query(MarketDailyFundFlow).filter_by(trade_date=trade_date).first()
            if exists:
                skipped += 1
                continue
            
            # TODO: 根据实际列名映射到数据库字段
            obj = MarketDailyFundFlow(
                trade_date=trade_date,
                sh_close=float(row.get('上证-收盘价', 0) or 0),
                sh_change_pct=float(row.get('上证-涨跌幅', 0) or 0),
                sz_close=float(row.get('深证-收盘价', 0) or 0),
                sz_change_pct=float(row.get('深证-涨跌幅', 0) or 0),
                main_net=float(row.get('主力净流入-净额', 0) or 0),
                main_net_pct=float(row.get('主力净流入-净占比', 0) or 0),
                super_net=float(row.get('超大单净流入-净额', 0) or 0),
                super_net_pct=float(row.get('超大单净流入-净占比', 0) or 0),
                big_net=float(row.get('大单净流入-净额', 0) or 0),
                big_net_pct=float(row.get('大单净流入-净占比', 0) or 0),
                mid_net=float(row.get('中单净流入-净额', 0) or 0),
                mid_net_pct=float(row.get('中单净流入-净占比', 0) or 0),
                small_net=float(row.get('小单净流入-净额', 0) or 0),
                small_net_pct=float(row.get('小单净流入-净占比', 0) or 0),
            )
            session.add(obj)
            inserted += 1
        
        session.commit()
        print(f"✅ 写入完成：新增 {inserted} 条，跳过 {skipped} 条")
        return inserted
        
    except Exception as e:
        session.rollback()
        print(f"❌ 写库失败: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    try:
        df = scrape_market_fund_flow()
        save_to_database(df)
        print("\n🎉 全部完成！")
    except Exception as e:
        print(f"\n💥 执行失败: {e}")
        sys.exit(1)
