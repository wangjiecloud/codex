#!/usr/bin/env python3
import sys
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ".")

import akshare as ak

try:
    df = ak.stock_sector_fund_flow_hist(symbol="软件开发")
    print("columns:", df.columns.tolist())
    print("shape:", df.shape)
    print(df.tail(10).to_string())
except Exception as e:
    print("ERROR:", type(e).__name__, e)
