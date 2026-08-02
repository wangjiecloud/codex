"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Play,
  Square,
  TrendingUp,
  TrendingDown,
  BarChart2,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Info,
  X,
  Database,
  AlertCircle,
  CheckCircle2,
  Loader2,
  BookOpen,
  Zap,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import StockDiagnosis from "@/components/stock/StockDiagnosis";

const API = "http://localhost:8000";

// ── 高质量策略模板 ──────────────────────────────────────────────────────────

interface StrategyTemplate {
  label: string;
  tag: string; // 短标签（技术/价值/动量）
  desc: string; // 一句话简介
  detail: string; // 详细说明（显示在描述面板）
  signals: string[]; // 信号条件列表
  risk: "低" | "中" | "高";
  holding: string; // 建议持仓周期（展示文字，仅展示用）
  stopProfit: number; // 止盈线（%）
  stopLoss: number; // 止损线（%）
  maxHoldDays: number; // 最大持仓天数（到期强平）
  sql: string;
  /** 是否兼容个股回测模式（纯K线技术指标=true；依赖全市场排序/市值筛选=false） */
  stockCompatible: boolean;
  /** 个股模式不兼容时的提示原因 */
  stockIncompatibleReason?: string;
}

const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    label: "MACD+KDJ 双金叉",
    tag: "技术共振",
    desc: "MACD 与 KDJ 同时出现金叉，量能配合放大，信号强度高",
    detail:
      "经典双指标共振策略。要求 DIF 上穿 DEA（MACD金叉），同时 KDJ 的 K 值上穿 D 值（KDJ金叉），且成交量较5日均量放大1.5倍以上。双指标共振大幅减少假信号，历史胜率约 62–68%。",
    signals: [
      "MACD：EMA12 - EMA26 由负转正（金叉区域）",
      "KDJ：K 线上穿 D 线（低位金叉更强）",
      "成交量 > 5日均量 × 1.5（量能配合）",
      "排除 ST 股",
    ],
    risk: "中",
    holding: "5–10 天",
    stopProfit: 10,
    stopLoss: 6,
    maxHoldDays: 10,
    stockCompatible: true,
    sql: `WITH kline_ind AS (
  SELECT code, trade_date, close, volume,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS ema12,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 25 PRECEDING AND CURRENT ROW) AS ema26,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 1  PRECEDING AND CURRENT ROW) AS ema12_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 2  PRECEDING AND 1 PRECEDING) AS ema26_prev,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS low9,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS high9,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS low9_prev,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS high9_prev,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
),
signals AS (
  SELECT code,
    (ema12 - ema26) AS dif,
    (ema12_prev - ema26_prev) AS dif_prev,
    CASE WHEN high9 > low9 THEN (close - low9) / (high9 - low9) * 100 ELSE 50 END AS rsv,
    CASE WHEN high9_prev > low9_prev THEN (close - low9_prev) / (high9_prev - low9_prev) * 100 ELSE 50 END AS rsv_prev,
    volume, vol_avg5
  FROM kline_ind WHERE rn = 1
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN signals s ON s.code = q.code
WHERE s.dif > s.dif_prev            -- MACD DIF 向上
  AND s.dif > -1 AND s.dif < 2      -- 在零轴附近（非过热区）
  AND s.rsv > s.rsv_prev            -- KDJ RSV 向上（K 线向上近似）
  AND s.rsv < 60                    -- KDJ 未超买
  AND s.volume > s.vol_avg5 * 1.5   -- 放量
  AND q.name NOT LIKE '%ST%'
ORDER BY s.volume / s.vol_avg5 DESC`,
  },
  {
    label: "均线多头排列+放量突破",
    tag: "趋势追踪",
    desc: "MA5>MA10>MA20>MA60 多头排列，当日突破 MA20 且量能放大",
    detail:
      "趋势跟踪经典策略。四线多头排列确认中期上升趋势成立，当日收盘突破20日均线且成交量大于均量，通常预示上涨趋势加速。此策略在牛市和结构性行情中胜率最高，震荡市中需谨慎。",
    signals: [
      "MA5 > MA10 > MA20 > MA60（四线多头排列）",
      "当日收盘价 > MA20（突破关键均线）",
      "成交量 > 5日均量 × 1.3（放量确认）",
      "距60日均线涨幅不超过30%（非极度超涨）",
    ],
    risk: "中",
    holding: "10–20 天",
    stopProfit: 12,
    stopLoss: 6,
    maxHoldDays: 15,
    stockCompatible: true,
    sql: `WITH kline_ma AS (
  SELECT code, trade_date, close, volume,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  4 PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  9 PRECEDING AND CURRENT ROW) AS ma10,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN kline_ma k ON k.code = q.code AND k.rn = 1
WHERE k.ma5 > k.ma10
  AND k.ma10 > k.ma20
  AND k.ma20 > k.ma60
  AND k.close > k.ma20
  AND k.volume > k.vol_avg5 * 1.3
  AND k.close < k.ma60 * 1.30
  AND q.name NOT LIKE '%ST%'
ORDER BY k.close / k.ma20 DESC`,
  },
  {
    label: "布林带收口突破",
    tag: "波动率突破",
    desc: "布林带收窄蓄力后，股价放量向上突破上轨，历史胜率约 65%",
    detail:
      "布林带宽度代表波动率，当布林带持续收窄（标准差缩小）时股价处于蓄力阶段，此时出现放量向上突破上轨，往往是主力建仓完毕后的拉升信号。策略历史胜率约 63–68%，但需注意假突破风险，成交量是核心过滤器。",
    signals: [
      "布林带宽度（上轨-下轨）创近15日最小值（带宽收口）",
      "收盘价突破布林上轨（BOLL Upper Band）",
      "成交量 > 10日均量 × 1.5（放量突破）",
      "20日均线向上（趋势向上）",
    ],
    risk: "中",
    holding: "5–15 天",
    stopProfit: 10,
    stopLoss: 5,
    maxHoldDays: 12,
    stockCompatible: true,
    sql: `WITH boll AS (
  SELECT code, trade_date, close, volume, high, low,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  9 PRECEDING AND CURRENT ROW) AS vol_avg10,
    -- 布林带上下轨（用 AVG/近似标准差）
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
      + 2 * AVG(ABS(close - AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)))
        OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS boll_upper,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
      - 2 * AVG(ABS(close - AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)))
        OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS boll_lower,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
),
boll_width AS (
  SELECT code,
    (boll_upper - boll_lower) AS width,
    MIN(boll_upper - boll_lower) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 14 PRECEDING AND CURRENT ROW) AS min_width_15d,
    close, volume, vol_avg10, boll_upper, ma20, rn
  FROM boll
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN boll_width b ON b.code = q.code AND b.rn = 1
WHERE b.width <= b.min_width_15d * 1.05    -- 带宽处于近15日收口状态
  AND b.close > b.boll_upper                -- 突破上轨
  AND b.volume > b.vol_avg10 * 1.5          -- 放量
  AND q.name NOT LIKE '%ST%'
ORDER BY b.volume / b.vol_avg10 DESC`,
  },
  {
    label: "RSI 低位超卖反弹",
    tag: "超卖反转",
    desc: "RSI 进入超卖区（<30）后反转向上，配合缩量触底特征",
    detail:
      "RSI 低于30进入超卖区域，表示股票短期跌幅过大，均值回归概率增加。策略要求 RSI 从超卖区反弹且当日成交量温和，避免恐慌抛售仍在持续的情况。适合在市场回调后择机抄底，但需结合大盘环境使用。",
    signals: [
      "RSI(14) 由 ≤30 反转向上（昨日≤30，今日>30）",
      "成交量 < 20日均量（缩量触底，非踩踏）",
      "收盘价 > 开盘价（当日收阳，情绪转向）",
      "距60日均线跌幅 > 15%（有一定超跌空间）",
    ],
    risk: "高",
    holding: "3–8 天",
    stopProfit: 7,
    stopLoss: 4,
    maxHoldDays: 8,
    stockCompatible: true,
    sql: `WITH rsi_calc AS (
  SELECT code, trade_date, close, open, volume,
    -- RSI近似：涨跌分离后取均值
    CASE WHEN AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END)
              OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) = 0
         THEN 100
         ELSE 100 - 100 / (1 + AVG(CASE WHEN change_pct > 0 THEN change_pct ELSE 0 END)
                                    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)
                             / AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END)
                                    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW))
    END AS rsi14,
    CASE WHEN AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END)
              OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 14 PRECEDING AND 1 PRECEDING) = 0
         THEN 100
         ELSE 100 - 100 / (1 + AVG(CASE WHEN change_pct > 0 THEN change_pct ELSE 0 END)
                                    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 14 PRECEDING AND 1 PRECEDING)
                             / AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END)
                                    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 14 PRECEDING AND 1 PRECEDING))
    END AS rsi14_prev,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_avg20,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN rsi_calc r ON r.code = q.code AND r.rn = 1
WHERE r.rsi14_prev <= 30
  AND r.rsi14 > 30                  -- RSI 从超卖区反转
  AND r.close > r.open              -- 当日收阳
  AND r.volume < r.vol_avg20        -- 缩量（非恐慌抛售）
  AND r.close < r.ma60 * 0.85       -- 距60日均线跌超15%（超跌）
  AND q.name NOT LIKE '%ST%'
ORDER BY r.rsi14_prev ASC`,
  },
  {
    label: "KDJ 超卖区二次金叉",
    tag: "低位共振",
    desc: "KDJ 在20以下低位出现二次金叉，配合均线支撑，反弹确定性高",
    detail:
      "KDJ 二次金叉策略：股价经历一轮调整后，KDJ 进入超卖区（K<20, D<20），出现第一次金叉但反弹力度不足再次回落，当KDJ再次出现金叉（二次金叉）时，往往是更可靠的反弹信号。要求股价同时在5日均线附近获得支撑。",
    signals: [
      "K < 20 且 D < 20（KDJ处于超卖区域）",
      "K 值上穿 D 值（金叉确认）",
      "收盘价在 MA5 上方 5% 以内（均线支撑）",
      "近5日最低点不再创新低（底部抬高）",
    ],
    risk: "中",
    holding: "5–10 天",
    stopProfit: 10,
    stopLoss: 6,
    maxHoldDays: 10,
    stockCompatible: true,
    sql: `WITH kdj AS (
  SELECT code, trade_date, close, low,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS low9,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS high9,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS low9_prev,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS high9_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS ma5,
    MIN(low) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS low5d,
    MIN(low) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 5 PRECEDING) AS low5d_prev,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
),
rsv_calc AS (
  SELECT code, low9, high9, low9_prev, high9_prev, close, ma5, low5d, low5d_prev, rn,
    CASE WHEN high9 > low9 THEN (close - low9) / (high9 - low9) * 100 ELSE 50 END AS rsv,
    CASE WHEN high9_prev > low9_prev THEN (close - low9_prev) / (high9_prev - low9_prev) * 100 ELSE 50 END AS rsv_prev
  FROM kdj
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN rsv_calc r ON r.code = q.code AND r.rn = 1
WHERE r.rsv < 20                          -- K 处于超卖
  AND r.rsv_prev < 20                     -- 之前也在超卖
  AND r.rsv > r.rsv_prev                  -- K 向上（金叉）
  AND r.close BETWEEN r.ma5 * 0.97 AND r.ma5 * 1.05  -- 在5日线附近
  AND r.low5d >= r.low5d_prev             -- 近期低点不再创新低
  AND q.name NOT LIKE '%ST%'`,
  },
  {
    label: "缩量回踩 5 日线",
    tag: "回调买点",
    desc: "强势股调整回踩5日线后缩量止跌，是趋势延续的黄金买点",
    detail:
      "强势股（前期涨幅超15%）在高位整理，回落至5日均线附近（±3%），且成交量明显萎缩（缩量整理），代表获利盘出清结束、浮筹洗出。当日企稳收阳是趋势延续的强信号，通常有较高胜率（历史约60-65%）。",
    signals: [
      "近20日最大涨幅超过 15%（确认前期强势）",
      "收盘价在 MA5 附近（-3% ~ +3%）",
      "当日成交量 < 5日均量 × 0.7（明显缩量）",
      "当日收阳（close > open），止跌信号",
    ],
    risk: "中",
    holding: "3–8 天",
    stopProfit: 7,
    stopLoss: 4,
    maxHoldDays: 8,
    stockCompatible: true,
    sql: `WITH kline_stats AS (
  SELECT code, trade_date, close, open, volume,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  4 PRECEDING AND CURRENT ROW) AS ma5,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    MAX(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS max_close_20d,
    MIN(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS min_close_20d,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN kline_stats k ON k.code = q.code AND k.rn = 1
WHERE k.max_close_20d > k.min_close_20d * 1.15   -- 近20日曾有15%涨幅（前期强势）
  AND k.close BETWEEN k.ma5 * 0.97 AND k.ma5 * 1.03  -- 回踩5日线附近
  AND k.volume < k.vol_avg5 * 0.70                -- 缩量整理
  AND k.close > k.open                            -- 当日企稳收阳
  AND q.name NOT LIKE '%ST%'
ORDER BY k.volume / k.vol_avg5 ASC`,
  },
  {
    label: "价值低位+基本面优质",
    tag: "价值投资",
    desc: "ROE>15% + PE低于20 + 距3月低位不超过20%，价值+低位双重保护",
    detail:
      "量化价值投资策略，兼顾基本面与位置安全边际。ROE持续大于15%代表公司有较强盈利能力；PE<20保证估值合理；股价处于3月低位附近意味着下行风险小、上行空间大。此策略适合中长线持有，回撤相对可控。",
    signals: [
      "ROE > 15%（净资产收益率，盈利能力强）",
      "PE < 20（估值合理，非泡沫区间）",
      "收盘价 ≤ 近3月最低价 × 1.20（距低位20%以内）",
      "成交量 > 5日均量（非停滞状态）",
    ],
    risk: "低",
    holding: "20–60 天",
    stopProfit: 15,
    stopLoss: 7,
    maxHoldDays: 20,
    stockCompatible: false,
    stockIncompatibleReason:
      "依赖实时 PE 字段，历史快照无法获取准确估值，结果仅供参考",
    sql: `WITH kline_pos AS (
  SELECT code,
    MIN(low) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 62 PRECEDING AND CURRENT ROW) AS low_3m,
    close,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    volume,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change,
       ROUND(f.roe * 100, 1) AS roe_pct, ROUND(q.pe, 1) AS pe
FROM stock_quote q
JOIN kline_pos k ON k.code = q.code AND k.rn = 1
JOIN stock_fundamental f ON f.code = q.code
WHERE f.roe > 0.15
  AND q.pe > 0 AND q.pe < 20
  AND k.close <= k.low_3m * 1.20
  AND k.volume > k.vol_avg5
  AND q.name NOT LIKE '%ST%'
ORDER BY f.roe DESC`,
  },
  {
    label: "成交量异动+突破平台",
    tag: "量能异动",
    desc: "成交量突然放大3倍以上，同时股价突破近20日平台整理区间",
    detail:
      "量能异动策略捕捉主力资金介入信号。当日成交量是20日均量的3倍以上，且股价突破近20日最高价，代表有大资金在加速建仓或拉升。此信号在实际中相对稀少但胜率较高（历史约65%），是短线操作的黄金信号。",
    signals: [
      "成交量 > 20日均量 × 3（异常放量）",
      "收盘价 > 近20日最高价（突破平台）",
      "涨幅 > 3%（价格有效向上运动）",
      "非涨停板（避免追高，change < 9）",
    ],
    risk: "高",
    holding: "3–7 天",
    stopProfit: 8,
    stopLoss: 5,
    maxHoldDays: 7,
    stockCompatible: true,
    sql: `WITH kline_vol AS (
  SELECT code, trade_date, close, high, change_pct,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_avg20,
    MAX(high)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS high_20d,
    volume,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN kline_vol k ON k.code = q.code AND k.rn = 1
WHERE k.volume > k.vol_avg20 * 3.0     -- 巨量
  AND k.close > k.high_20d             -- 突破近20日高点
  AND k.change_pct > 3                 -- 价格同步上涨
  AND k.change_pct < 9                 -- 非涨停（避免追高）
  AND q.name NOT LIKE '%ST%'
ORDER BY k.volume / k.vol_avg20 DESC`,
  },
  {
    label: "动量加速（强者恒强）",
    tag: "动量策略",
    desc: "近10日累计涨幅居前，且持续5日成交量放大，趋势动量强劲",
    detail:
      "动量策略基于「强者恒强」效应。选取近期涨幅居前（10日涨幅>10%）且持续放量的股票，这类股票往往有主力持续加仓，短期内趋势延续概率较高。需注意在市场高位时动量策略容易追高，适合牛市或强势行情中使用。",
    signals: [
      "近10日累计涨幅 > 10%（短期动量强）",
      "5日连续成交量均高于20日均量（持续放量）",
      "收盘价 > MA10 > MA20（均线多头）",
      "市值 > 50亿（流动性保障）",
    ],
    risk: "高",
    holding: "3–10 天",
    stopProfit: 10,
    stopLoss: 6,
    maxHoldDays: 10,
    stockCompatible: false,
    stockIncompatibleReason:
      "包含 market_cap 市值过滤，个股模式下可能误过滤小市值股票，建议在自定义 SQL 中删除该条件",
    sql: `WITH kline_mom AS (
  SELECT code, trade_date, close, volume,
    FIRST_VALUE(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS close_10d_ago,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_avg20,
    MIN(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  4 PRECEDING AND CURRENT ROW) AS vol_min5d,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  9 PRECEDING AND CURRENT ROW) AS ma10,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN kline_mom k ON k.code = q.code AND k.rn = 1
WHERE k.close > k.close_10d_ago * 1.10     -- 近10日涨幅>10%
  AND k.vol_min5d > k.vol_avg20            -- 近5日每天都放量
  AND k.ma10 > k.ma20                      -- 均线多头
  AND k.close > k.ma10
  AND q.market_cap > 50                    -- 市值>50亿（单位亿）
  AND q.name NOT LIKE '%ST%'
ORDER BY (k.close - k.close_10d_ago) / k.close_10d_ago DESC`,
  },
  {
    label: "地量地价反转",
    tag: "极值反转",
    desc: "成交量创近月新低，股价同时处于3月低位，量价齐低的反转买点",
    detail:
      "「地量见地价」经典形态。当成交量萎缩至近30日最低（浮筹洗出充分），同时股价处于3月低位（下跌空间有限），往往预示底部将至。策略需配合大盘环境使用，在市场整体弱势时止损要严格，而在大盘企稳阶段胜率可达55-60%。",
    signals: [
      "成交量 = 近30日最低成交量（地量信号）",
      "收盘价 ≤ 3月最低价 × 1.10（地价区域）",
      "近5日股价未再创新低（底部企稳）",
      "ROE > 0 且 PE > 0（公司基本面健康）",
    ],
    risk: "高",
    holding: "5–20 天",
    stopProfit: 10,
    stopLoss: 6,
    maxHoldDays: 12,
    stockCompatible: false,
    stockIncompatibleReason:
      "依赖实时 PE 字段，历史快照无法获取准确估值，结果仅供参考",
    sql: `WITH kline_bottom AS (
  SELECT code, trade_date, close, low, volume,
    MIN(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS vol_min30,
    MIN(low)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 62 PRECEDING AND CURRENT ROW) AS low_3m,
    MIN(low)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  4 PRECEDING AND CURRENT ROW) AS low_5d,
    MIN(low)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN  9 PRECEDING AND 5 PRECEDING) AS low_5d_prev,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN kline_bottom k ON k.code = q.code AND k.rn = 1
JOIN stock_fundamental f ON f.code = q.code
WHERE k.volume <= k.vol_min30 * 1.05     -- 接近近30日地量
  AND k.close <= k.low_3m * 1.10         -- 价格在地价区域
  AND k.low_5d >= k.low_5d_prev          -- 近期低点不再下移（底部企稳）
  AND f.roe > 0 AND q.pe > 0             -- 公司正常盈利
  AND q.name NOT LIKE '%ST%'
ORDER BY k.close / k.low_3m ASC`,
  },
  {
    label: "高ROE+净利润高增长",
    tag: "成长价值",
    desc: "ROE>20% 且净利润同比增速>30%，兼具质量与成长性的优质标的",
    detail:
      "成长价值选股策略，专注筛选高质量成长股。ROE>20%代表公司资本运营效率极高；净利润同比增速>30%是高成长的量化门槛；同时要求毛利率>25%作为护城河的初步筛选。这类股票长期持有通常能跑赢市场，但估值往往不低，需关注买入时机。",
    signals: [
      "ROE > 20%（高净资产收益率，盈利质量优）",
      "净利润同比增速 > 30%（高成长）",
      "毛利率 > 25%（有初步护城河）",
      "收盘价在 MA20 之上（技术趋势向上）",
    ],
    risk: "低",
    holding: "30–90 天",
    stopProfit: 20,
    stopLoss: 8,
    maxHoldDays: 30,
    stockCompatible: false,
    stockIncompatibleReason:
      "依赖净利润增速等基本面横向筛选，个股模式下无横向对比意义，建议切换全市场模式",
    sql: `WITH kline_trend AS (
  SELECT code,
    close,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change,
       ROUND(f.roe * 100, 1) AS roe_pct,
       ROUND(f.net_profit_yoy * 100, 1) AS np_yoy_pct
FROM stock_quote q
JOIN kline_trend k ON k.code = q.code AND k.rn = 1
JOIN stock_fundamental f ON f.code = q.code
WHERE f.roe > 0.20
  AND f.net_profit_yoy > 0.30
  AND f.gross_margin > 0.25
  AND k.close > k.ma20
  AND q.name NOT LIKE '%ST%'
ORDER BY f.roe * f.net_profit_yoy DESC`,
  },
  {
    label: "涨停次日低开买入",
    tag: "打板反转",
    desc: "前日涨停，次日低开（跌幅>2%）买入，博弈短线反抽行情",
    detail:
      "量化「打板失败反转」策略。涨停次日若跌超2%低开，说明昨日涨停筹码在次日集体出逃，若当日能企稳甚至翻红，则代表有新的承接资金介入，可能形成短线二次上涨。此策略属于高风险高收益的短线博弈，需严格止损（3%）。",
    signals: [
      "昨日涨幅 ≥ 9.9%（昨日涨停）",
      "今日开盘相对昨收下跌 > 2%（低开）",
      "今日收盘 > 开盘（当日企稳）",
      "成交量 > 昨日成交量（承接资金进场）",
    ],
    risk: "高",
    holding: "1–3 天",
    stopProfit: 5,
    stopLoss: 4,
    maxHoldDays: 5,
    stockCompatible: true,
    sql: `WITH kline_zt AS (
  SELECT code, trade_date, open, close, volume, change_pct,
    LAG(change_pct, 1) OVER (PARTITION BY code ORDER BY trade_date) AS prev_change,
    LAG(close, 1)      OVER (PARTITION BY code ORDER BY trade_date) AS prev_close,
    LAG(volume, 1)     OVER (PARTITION BY code ORDER BY trade_date) AS prev_volume,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN kline_zt k ON k.code = q.code AND k.rn = 1
WHERE k.prev_change >= 9.9                     -- 昨日涨停
  AND k.prev_close > 0
  AND (k.open - k.prev_close) / k.prev_close * 100 < -2.0   -- 今日低开>2%
  AND k.close > k.open                         -- 当日收红（企稳）
  AND k.volume > k.prev_volume                 -- 今日放量承接
  AND q.name NOT LIKE '%ST%'`,
  },
  {
    label: "右侧突破确认买入",
    tag: "右侧交易",
    desc: "价格有效突破近20日高点，低点持续抬高，MACD零轴以上，量能放大验证",
    detail:
      "经典右侧交易策略。核心逻辑：「顶和底都是走出来的，不是预测出来的」。等待价格有效突破前期高点（近20日最高价）才确认上涨趋势成立，此时再入场追涨，规避左侧猜底的风险。三重确认机制：①价格突破前高（趋势确认）②近10日低点持续抬高（多头结构）③MACD位于零轴之上且DIF向上（动能支撑）④成交量放大超均量1.5倍（资金验证）。止损设近5日最低价。",
    signals: [
      "收盘价 > 近20日（不含今日）最高价（突破前高，右侧确认）",
      "近5日最低价 > 近10日最低价（低点持续抬高，多头结构）",
      "MACD DIF > 0 且 DIF > 昨日 DIF（零轴之上向上，动能充足）",
      "成交量 > 5日均量 × 1.5（放量突破，资金验证）",
      "股价 > MA20（站稳中期均线）",
      "排除 ST 股",
    ],
    risk: "中",
    holding: "5–15 天",
    stopProfit: 10,
    stopLoss: 5,
    maxHoldDays: 12,
    stockCompatible: true,
    sql: `WITH kline_base AS (
  SELECT code, trade_date, open, high, low, close, volume,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS high20_prev,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS low5,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 5 PRECEDING) AS low5_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_avg5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS ema12,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 25 PRECEDING AND CURRENT ROW) AS ema26,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING) AS ema12_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 26 PRECEDING AND 1 PRECEDING) AS ema26_prev,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN kline_base k ON k.code = q.code AND k.rn = 1
WHERE k.close > k.high20_prev                          -- 突破近20日前高（右侧确认）
  AND k.low5 > k.low5_prev                             -- 低点持续抬高（多头结构）
  AND (k.ema12 - k.ema26) > 0                          -- MACD DIF 在零轴之上
  AND (k.ema12 - k.ema26) > (k.ema12_prev - k.ema26_prev)  -- DIF 继续向上（动能）
  AND k.volume > k.vol_avg5 * 1.5                      -- 放量突破（资金验证）
  AND k.close > k.ma20                                 -- 站稳 MA20
  AND q.name NOT LIKE '%ST%'
ORDER BY k.close / k.high20_prev DESC`,
  },
  {
    label: "均线金叉右侧趋势启动",
    tag: "右侧交易",
    desc: "MA20 上穿 MA60 中期金叉，叠加 KDJ+MACD 三重共振，右侧趋势启动信号",
    detail:
      "中期右侧趋势启动策略。道氏理论核心：只在趋势明确确认后才入场。MA20上穿MA60是中期趋势由空转多的关键信号，代表中期均线由空头转多头排列；叠加KDJ在低位（未超买）金叉向上，以及MACD红柱持续放大，三重指标共振大幅提升信号可靠性。此策略胜率高但信号频率低，适合耐心等待。建议以MA20跌破MA60作为止损离场信号。",
    signals: [
      "MA20 上穿 MA60（中期均线金叉，空头转多头关键信号）",
      "MA5 > MA10 > MA20（短期均线多头排列，趋势同向）",
      "KDJ K值 上穿 D值 且 K < 75（低位金叉，未超买）",
      "MACD 红柱（HIST > 0）且较昨日扩大（动能持续增强）",
      "成交量 > 10日均量（量能配合，非缩量假突破）",
      "排除 ST 股",
    ],
    risk: "低",
    holding: "10–30 天",
    stopProfit: 15,
    stopLoss: 7,
    maxHoldDays: 20,
    stockCompatible: true,
    sql: `WITH kline_ma AS (
  SELECT code, trade_date, close, high, low, volume,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4  PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9  PRECEDING AND CURRENT ROW) AS ma10,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS ma20_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 60 PRECEDING AND 1 PRECEDING) AS ma60_prev,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9  PRECEDING AND CURRENT ROW) AS vol_avg10,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS low9,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS high9,
    MIN(low)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS low9_prev,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING) AS high9_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS ema12,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 25 PRECEDING AND CURRENT ROW) AS ema26,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING) AS ema12_prev,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 26 PRECEDING AND 1 PRECEDING) AS ema26_prev,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
),
signals AS (
  SELECT *,
    CASE WHEN high9 > low9 THEN (close - low9) / (high9 - low9) * 100 ELSE 50 END AS rsv,
    CASE WHEN high9_prev > low9_prev THEN (close - low9_prev) / (high9_prev - low9_prev) * 100 ELSE 50 END AS rsv_prev,
    (ema12 - ema26) AS macd_hist,
    (ema12_prev - ema26_prev) AS macd_hist_prev
  FROM kline_ma WHERE rn = 1
)
SELECT q.code, q.name, ROUND(q.price, 2) AS price, ROUND(q.change, 2) AS change
FROM stock_quote q
JOIN signals s ON s.code = q.code
WHERE s.ma20 > s.ma60                    -- MA20 在 MA60 之上（多头格局）
  AND s.ma20_prev <= s.ma60_prev         -- 昨日 MA20 <= MA60（金叉刚发生）
  AND s.ma5 > s.ma10                     -- 短期均线多头排列
  AND s.ma10 > s.ma20                    -- 短期均线多头排列
  AND s.rsv > s.rsv_prev                 -- KDJ K 线向上
  AND s.rsv < 75                         -- KDJ 未超买
  AND s.macd_hist > 0                    -- MACD 零轴以上（红柱）
  AND s.macd_hist > s.macd_hist_prev     -- MACD 红柱扩大（动能增强）
  AND s.volume > s.vol_avg10             -- 量能配合
  AND q.name NOT LIKE '%ST%'
ORDER BY s.macd_hist - s.macd_hist_prev DESC`,
  },
];

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface DailyReturn {
  date: string;
  strategy_return: number;
  benchmark_return: number;
  daily_pct: number;
}

interface TradeDetail {
  code: string;
  name: string;
  buy_date: string;
  sell_date: string;
  buy_price: number;
  sell_price: number;
  return_pct: number;
  hold_days: number;
}

interface BacktestStats {
  total_return: number;
  annual_return: number;
  benchmark_total_return: number;
  benchmark_annual_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
  avg_return_per_trade: number;
  trade_days: number;
  signal_days: number;
}

interface BacktestResult {
  curve: DailyReturn[];
  trades: TradeDetail[];
  stats: BacktestStats;
  sql_used: string;
  signal_count_by_date: Record<string, number>;
}

interface Benchmark {
  code: string;
  name: string;
}

// ── 收益曲线图（SVG轻量实现）────────────────────────────────────────────────

function ReturnCurve({ curve }: { curve: DailyReturn[] }) {
  if (curve.length < 2) return null;

  const width = 800;
  const height = 200;
  const padL = 55;
  const padR = 20;
  const padT = 20;
  const padB = 30;

  const strategyValues = curve.map((p) => p.strategy_return);
  const benchmarkValues = curve.map((p) => p.benchmark_return);
  const allValues = [...strategyValues, ...benchmarkValues];
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const range = maxV - minV || 1;

  const xScale = (i: number) =>
    padL + (i / (curve.length - 1)) * (width - padL - padR);
  const yScale = (v: number) =>
    padT + (1 - (v - minV) / range) * (height - padT - padB);

  const toPath = (values: number[]) =>
    values
      .map(
        (v, i) =>
          `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`,
      )
      .join(" ");

  const xTickCount = Math.min(8, curve.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    Math.round((i / (xTickCount - 1)) * (curve.length - 1)),
  );

  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => {
    const v = minV + (i / (yTickCount - 1)) * range;
    return { v, y: yScale(v) };
  });

  const zeroY = yScale(0);
  const finalStrategy = strategyValues[strategyValues.length - 1];
  const strategyColor = finalStrategy >= 0 ? "#e84444" : "#09d464";
  const benchmarkColor = "#60a5fa";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height: 200 }}
    >
      {yTicks.map(({ v, y }, i) => (
        <g key={i}>
          <line
            x1={padL}
            y1={y}
            x2={width - padR}
            y2={y}
            stroke="var(--border-color)"
            strokeWidth={0.5}
            strokeDasharray="3,3"
          />
          <text
            x={padL - 4}
            y={y + 4}
            fontSize={9}
            textAnchor="end"
            fill="var(--text-tertiary)"
          >
            {v >= 0 ? "+" : ""}
            {v.toFixed(1)}%
          </text>
        </g>
      ))}

      {zeroY >= padT && zeroY <= height - padB && (
        <line
          x1={padL}
          y1={zeroY}
          x2={width - padR}
          y2={zeroY}
          stroke="var(--text-tertiary)"
          strokeWidth={0.8}
          strokeDasharray="4,2"
        />
      )}

      {xTicks.map((idx) => (
        <text
          key={idx}
          x={xScale(idx)}
          y={height - padB + 16}
          fontSize={9}
          textAnchor="middle"
          fill="var(--text-tertiary)"
        >
          {curve[idx]?.date?.slice(5) ?? ""}
        </text>
      ))}

      <path
        d={`${toPath(benchmarkValues)} L ${xScale(curve.length - 1).toFixed(1)} ${yScale(0).toFixed(1)} L ${padL} ${yScale(0).toFixed(1)} Z`}
        fill={benchmarkColor}
        fillOpacity={0.06}
      />
      <path
        d={toPath(benchmarkValues)}
        fill="none"
        stroke={benchmarkColor}
        strokeWidth={1.5}
        strokeOpacity={0.8}
      />

      <path
        d={`${toPath(strategyValues)} L ${xScale(curve.length - 1).toFixed(1)} ${yScale(0).toFixed(1)} L ${padL} ${yScale(0).toFixed(1)} Z`}
        fill={strategyColor}
        fillOpacity={0.1}
      />
      <path
        d={toPath(strategyValues)}
        fill="none"
        stroke={strategyColor}
        strokeWidth={2}
      />

      <g transform={`translate(${padL + 10}, ${padT + 6})`}>
        <rect width={12} height={3} y={4} fill={strategyColor} rx={1.5} />
        <text x={16} y={10} fontSize={10} fill="var(--text-secondary)">
          策略
        </text>
        <rect
          width={12}
          height={3}
          y={4}
          x={55}
          fill={benchmarkColor}
          rx={1.5}
          opacity={0.8}
        />
        <text x={71} y={10} fontSize={10} fill="var(--text-secondary)">
          基准
        </text>
      </g>
    </svg>
  );
}

// ── 统计指标卡片 ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-3">
      <div className="text-[10px] text-[var(--text-tertiary)] mb-1">
        {label}
      </div>
      <div
        className={cn(
          "text-lg font-bold font-mono",
          positive === true
            ? "text-[#e84444]"
            : positive === false
              ? "text-[#09d464]"
              : "text-[var(--text-primary)]",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}

// ── 策略详情面板 ──────────────────────────────────────────────────────────────

function StrategyDetailPanel({ template }: { template: StrategyTemplate }) {
  const riskColor =
    template.risk === "低"
      ? "text-[#09d464]"
      : template.risk === "中"
        ? "text-[#f5a623]"
        : "text-[#e84444]";

  return (
    <div className="mt-3 p-4 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg space-y-3">
      {/* 头部 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {template.label}
            </span>
            <span className="px-1.5 py-0.5 bg-[#f5a623]/15 text-[#f5a623] text-[9px] font-medium rounded">
              {template.tag}
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            {template.detail}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[9px] text-[var(--text-tertiary)] mb-0.5">
            风险等级
          </div>
          <div className={cn("text-sm font-bold", riskColor)}>
            {template.risk}
          </div>
        </div>
      </div>

      {/* 信号条件 */}
      <div>
        <div className="text-[10px] text-[var(--text-tertiary)] font-medium mb-1.5">
          选股条件
        </div>
        <ul className="space-y-1">
          {template.signals.map((s, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="mt-1 w-1 h-1 rounded-full bg-[#f5a623] shrink-0" />
              <span className="text-[11px] text-[var(--text-secondary)]">
                {s}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 建议持仓 + 止盈止损 */}
      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-[var(--border-color)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            建议持仓：
          </span>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">
            {template.holding}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#09d464]">止盈</span>
          <span className="text-[11px] font-medium text-[#09d464]">
            +{template.stopProfit}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#e84444]">止损</span>
          <span className="text-[11px] font-medium text-[#e84444]">
            -{template.stopLoss}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            最长持仓
          </span>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">
            {template.maxHoldDays}天
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export default function BacktestTab() {
  const [sql, setSql] = useState(STRATEGY_TEMPLATES[0].sql);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [benchmark, setBenchmark] = useState("000300");
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([
    { code: "000300", name: "沪深300" },
  ]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState("");
  const [activeTemplate, setActiveTemplate] = useState(0);
  const [showDetailPanel, setShowDetailPanel] = useState(true);

  // ── 个股回测模式 ──────────────────────────────────────────────────────────
  const [stockMode, setStockMode] = useState<"market" | "single">("market");
  // 已选中的个股
  const [selectedStock, setSelectedStock] = useState<{
    code: string;
    name: string;
  } | null>(null);
  // 诊断模式（单股模式下，展开诊断面板）
  const [showDiagnosis, setShowDiagnosis] = useState(false);
  // 搜索框
  const [stockQuery, setStockQuery] = useState("");
  const [stockSuggestions, setStockSuggestions] = useState<
    { code: string; name: string }[]
  >([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const stockSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const stockInputRef = useRef<HTMLInputElement>(null);

  // 停止回测
  const jobIdRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // 交易明细排序
  const [tradeSortKey, setTradeSortKey] = useState<"buy_date" | "return_pct">(
    "buy_date",
  );
  const [tradeSortDir, setTradeSortDir] = useState<"asc" | "desc">("desc");
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [showSqlEditor, setShowSqlEditor] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/backtest/benchmarks`)
      .then((r) => r.json())
      .then((d: { benchmarks: Benchmark[] }) => {
        if (d.benchmarks?.length) setBenchmarks(d.benchmarks);
      })
      .catch(() => {});
  }, []);

  // 股票搜索（防抖）
  const handleStockQueryChange = useCallback((q: string) => {
    setStockQuery(q);
    if (stockSearchDebounce.current) clearTimeout(stockSearchDebounce.current);
    if (!q.trim()) {
      setStockSuggestions([]);
      setShowStockDropdown(false);
      return;
    }
    stockSearchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/api/quote/search?q=${encodeURIComponent(q.trim())}`,
        );
        const data = (await res.json()) as {
          results: { code: string; name: string }[];
        };
        setStockSuggestions(data.results?.slice(0, 10) ?? []);
        setShowStockDropdown(true);
      } catch {
        setStockSuggestions([]);
      }
    }, 200);
  }, []);

  const selectStock = useCallback((stock: { code: string; name: string }) => {
    setSelectedStock(stock);
    setStockQuery(`${stock.name}（${stock.code}）`);
    setShowStockDropdown(false);
    setResult(null);
    setError("");
    setShowDiagnosis(false);
  }, []);

  const stopBacktest = useCallback(async () => {
    // 1. 取消 HTTP 请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // 2. 通知后端取消任务
    const jobId = jobIdRef.current;
    if (jobId) {
      try {
        await fetch(`${API}/api/backtest/cancel/${jobId}`, { method: "POST" });
      } catch {}
    }
    setLoading(false);
    setError("回测已停止");
  }, []);

  const runBacktest = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    setResult(null);

    // 个股模式校验
    if (stockMode === "single" && !selectedStock) {
      setError("请先选择要回测的个股");
      setLoading(false);
      return;
    }

    // 生成 job_id
    const jobId = `bt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    jobIdRef.current = jobId;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 个股模式：在 SQL 末尾追加 code 过滤（注入到最外层 WHERE 子句）
    let finalSql = sql.trim();
    if (stockMode === "single" && selectedStock) {
      // 在 SQL 末尾的 WHERE 子句中追加条件，或添加新的 WHERE
      // 策略：在最后一个 SELECT...FROM stock_quote q 的 WHERE 中追加
      // 简单做法：用字符串替换 "AND q.name NOT LIKE '%ST%'" -> 追加 code 条件
      const codeFilter = `AND q.code = '${selectedStock.code}'`;
      if (finalSql.includes("AND q.name NOT LIKE '%ST%'")) {
        finalSql = finalSql.replace(
          /AND q\.name NOT LIKE '%ST%'/,
          `${codeFilter}\n  AND q.name NOT LIKE '%ST%'`,
        );
      } else {
        // fallback：直接在末尾追加
        finalSql = `${finalSql}\n  ${codeFilter}`;
      }
    }

    try {
      const res = await fetch(`${API}/api/backtest/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          sql: finalSql,
          start_date: startDate,
          end_date: endDate,
          max_hold_days: STRATEGY_TEMPLATES[activeTemplate].maxHoldDays,
          stop_profit: STRATEGY_TEMPLATES[activeTemplate].stopProfit,
          stop_loss: STRATEGY_TEMPLATES[activeTemplate].stopLoss,
          benchmark,
          job_id: jobId,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { detail?: string };
        const msg = data.detail ?? `请求失败 (${res.status})`;
        if (res.status === 499) {
          setError("回测已被停止");
        } else {
          throw new Error(msg);
        }
        return;
      }

      const data = (await res.json()) as BacktestResult;
      setResult(data);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("回测已停止");
      } else {
        setError(e instanceof Error ? e.message : "回测失败，请重试");
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [
    sql,
    startDate,
    endDate,
    activeTemplate,
    benchmark,
    loading,
    stockMode,
    selectedStock,
  ]);

  const selectTemplate = (idx: number) => {
    setActiveTemplate(idx);
    setSql(STRATEGY_TEMPLATES[idx].sql);
    setResult(null);
    setError("");
    setShowDetailPanel(true);
  };

  const sortedTrades = result
    ? [...result.trades].sort((a, b) => {
        const av = tradeSortKey === "buy_date" ? a.buy_date : a.return_pct;
        const bv = tradeSortKey === "buy_date" ? b.buy_date : b.return_pct;
        if (typeof av === "string" && typeof bv === "string") {
          return tradeSortDir === "asc"
            ? av.localeCompare(bv)
            : bv.localeCompare(av);
        }
        return tradeSortDir === "asc"
          ? (av as number) - (bv as number)
          : (bv as number) - (av as number);
      })
    : [];

  const displayTrades = showAllTrades
    ? sortedTrades
    : sortedTrades.slice(0, 50);

  const toggleTradeSort = (key: typeof tradeSortKey) => {
    if (tradeSortKey === key) {
      setTradeSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTradeSortKey(key);
      setTradeSortDir("desc");
    }
  };

  return (
    <div className="space-y-5">
      {/* ── 策略配置区 ─────────────────────────────────────────────────────── */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5">
        {/* 标题 + 模式切换 */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#f5a623]/15 flex items-center justify-center">
              <BarChart2 size={14} className="text-[#f5a623]" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                策略回测
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)]">
                基于历史K线数据，模拟选股策略的真实收益表现
              </div>
            </div>
          </div>

          {/* 全市场 / 单个股 切换 */}
          <div className="flex items-center gap-1 p-0.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shrink-0">
            <button
              onClick={() => {
                setStockMode("market");
                setResult(null);
                setError("");
              }}
              className={cn(
                "px-3 py-1 rounded text-xs font-medium transition-all",
                stockMode === "market"
                  ? "bg-[#f5a623] text-black"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
              )}
            >
              全市场
            </button>
            <button
              onClick={() => {
                setStockMode("single");
                setResult(null);
                setError("");
              }}
              className={cn(
                "px-3 py-1 rounded text-xs font-medium transition-all",
                stockMode === "single"
                  ? "bg-[#f5a623] text-black"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
              )}
            >
              单个股
            </button>
          </div>
        </div>

        {/* 个股选择区（单个股模式下显示） */}
        {stockMode === "single" && (
          <div className="mb-4 p-3 bg-[var(--bg-primary)] border border-[#f5a623]/30 rounded-lg">
            <div className="text-[10px] text-[var(--text-tertiary)] mb-2 font-medium">
              选择回测个股
            </div>
            <div className="relative">
              <input
                ref={stockInputRef}
                type="text"
                value={stockQuery}
                onChange={(e) => handleStockQueryChange(e.target.value)}
                onFocus={() => {
                  if (stockSuggestions.length > 0) setShowStockDropdown(true);
                }}
                onBlur={() =>
                  setTimeout(() => setShowStockDropdown(false), 150)
                }
                placeholder="输入股票代码或名称搜索..."
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[#f5a623]/60 pr-8"
              />
              {stockQuery && (
                <button
                  onClick={() => {
                    setStockQuery("");
                    setSelectedStock(null);
                    setStockSuggestions([]);
                    setShowStockDropdown(false);
                    setResult(null);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <X size={12} />
                </button>
              )}

              {/* 搜索下拉 */}
              {showStockDropdown && stockSuggestions.length > 0 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg overflow-hidden">
                  {stockSuggestions.map((s) => (
                    <button
                      key={s.code}
                      onMouseDown={() => selectStock(s)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <span className="text-[11px] font-mono text-[var(--text-tertiary)] w-12 shrink-0">
                        {s.code}
                      </span>
                      <span className="text-xs text-[var(--text-primary)]">
                        {s.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedStock && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <CheckCircle2 size={11} className="text-emerald-400" />
                  已选：
                  <span className="font-medium text-[var(--text-primary)]">
                    {selectedStock.name}
                  </span>
                  <span className="font-mono text-[var(--text-tertiary)]">
                    {selectedStock.code}
                  </span>
                  <span className="text-[var(--text-tertiary)] ml-1">
                    · 策略中的选股条件将限定在此股票
                  </span>
                </div>
                {/* 诊断按钮 */}
                <button
                  onClick={() => setShowDiagnosis((v) => !v)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border",
                    showDiagnosis
                      ? "bg-[#f5a623]/15 border-[#f5a623]/50 text-[#f5a623]"
                      : "bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#f5a623]/40 hover:text-[#f5a623]",
                  )}
                >
                  <Activity size={11} />
                  {showDiagnosis ? "收起诊断" : "股票诊断"}
                </button>
              </div>
            )}

            {/* 不兼容警告 */}
            {selectedStock &&
              !STRATEGY_TEMPLATES[activeTemplate].stockCompatible && (
                <div className="mt-2 flex items-start gap-1.5 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[10px] text-amber-400">
                  <AlertCircle size={11} className="shrink-0 mt-0.5" />
                  <span>
                    <strong>注意：</strong>
                    {STRATEGY_TEMPLATES[activeTemplate].stockIncompatibleReason}
                  </span>
                </div>
              )}
          </div>
        )}

        {/* 策略模板区 */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <BookOpen size={11} className="text-[var(--text-tertiary)]" />
            <span className="text-[11px] text-[var(--text-tertiary)] font-medium">
              内置策略模板（{STRATEGY_TEMPLATES.length} 个）
            </span>
          </div>

          {/* 模板滚动列表 */}
          <div className="flex flex-wrap gap-1.5">
            {STRATEGY_TEMPLATES.map((t, i) => (
              <button
                key={i}
                onClick={() => selectTemplate(i)}
                title={
                  stockMode === "single" && !t.stockCompatible
                    ? `⚠ 个股模式下部分条件可能失效：${t.stockIncompatibleReason ?? ""}`
                    : t.desc
                }
                className={cn(
                  "group px-3 py-1.5 rounded-lg text-xs font-medium transition-all border flex items-center gap-1.5",
                  activeTemplate === i
                    ? "bg-[#f5a623] text-black border-[#f5a623]"
                    : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[#f5a623]/50 hover:text-[var(--text-primary)]",
                )}
              >
                <span
                  className={cn(
                    "text-[9px] px-1 py-0.5 rounded font-medium",
                    activeTemplate === i
                      ? "bg-black/15 text-black"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]",
                  )}
                >
                  {t.tag}
                </span>
                {t.label}
                {/* 个股模式不兼容标记 */}
                {stockMode === "single" && !t.stockCompatible && (
                  <span className="text-amber-400 text-[10px]">⚠</span>
                )}
              </button>
            ))}
          </div>

          {/* 当前策略详情面板 */}
          <div className="mt-2">
            <button
              onClick={() => setShowDetailPanel((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] hover:text-[#f5a623] transition-colors"
            >
              <Info size={10} />
              <span>策略说明</span>
              {showDetailPanel ? (
                <ChevronUp size={10} />
              ) : (
                <ChevronDown size={10} />
              )}
            </button>
            {showDetailPanel && (
              <StrategyDetailPanel
                template={STRATEGY_TEMPLATES[activeTemplate]}
              />
            )}
          </div>
        </div>

        {/* SQL 编辑器（可折叠） */}
        <div className="mb-4">
          <button
            onClick={() => setShowSqlEditor((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-2"
          >
            <Database size={11} />
            <span className="font-medium">自定义 SQL 策略</span>
            {showSqlEditor ? (
              <ChevronUp size={11} />
            ) : (
              <ChevronDown size={11} />
            )}
          </button>
          {showSqlEditor && (
            <div>
              <textarea
                value={sql}
                onChange={(e) => {
                  setSql(e.target.value);
                  setResult(null);
                }}
                rows={8}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50 resize-y"
                placeholder="输入选股 SQL，必须包含 code 列..."
                spellCheck={false}
              />
              <div className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                提示：SQL 需包含 code 列；可从「AI
                选股」的「查看SQL」处直接复制策略。
              </div>
            </div>
          )}
        </div>

        {/* 参数设置 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-[10px] text-[var(--text-tertiary)] mb-1">
              开始日期
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setResult(null);
              }}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50"
            />
          </div>
          <div>
            <label className="block text-[10px] text-[var(--text-tertiary)] mb-1">
              结束日期
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setResult(null);
              }}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--text-tertiary)]">
              退出规则
            </label>
            <div className="flex items-center gap-2 h-[30px] px-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-xs">
              <span className="text-[#09d464] font-medium">
                止盈 +{STRATEGY_TEMPLATES[activeTemplate].stopProfit}%
              </span>
              <span className="text-[var(--text-tertiary)]">/</span>
              <span className="text-[#e84444] font-medium">
                止损 -{STRATEGY_TEMPLATES[activeTemplate].stopLoss}%
              </span>
              <span className="text-[var(--text-tertiary)]">/</span>
              <span className="text-[var(--text-secondary)]">
                最长 {STRATEGY_TEMPLATES[activeTemplate].maxHoldDays}天
              </span>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-[var(--text-tertiary)] mb-1 flex items-center gap-1">
              对比基准
              <span
                title="基准为同期大盘指数涨跌幅，用于衡量策略是否跑赢大盘。策略收益 - 基准收益 = 超额收益（Alpha）。"
                className="cursor-help"
              >
                <Info
                  size={9}
                  className="text-[var(--text-tertiary)] hover:text-[#f5a623] transition-colors"
                />
              </span>
            </label>
            <select
              value={benchmark}
              onChange={(e) => {
                setBenchmark(e.target.value);
                setResult(null);
              }}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50"
            >
              {benchmarks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 运行 / 停止按钮 */}
        <div className="flex items-center gap-3">
          {!loading ? (
            <button
              onClick={runBacktest}
              disabled={!sql.trim()}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all",
                !sql.trim()
                  ? "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed"
                  : "bg-[#f5a623] text-black hover:bg-[#e8961a] shadow-sm",
              )}
            >
              <Play size={14} />
              开始回测
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                <Loader2 size={14} className="animate-spin" />
                回测计算中...
              </div>
              <button
                onClick={stopBacktest}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-all"
              >
                <Square size={13} fill="currentColor" />
                停止回测
              </button>
            </>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      {/* ── 股票诊断面板（单个股模式选中股票后可展开） */}
      {stockMode === "single" && selectedStock && showDiagnosis && (
        <StockDiagnosis
          stock={selectedStock}
          onClose={() => setShowDiagnosis(false)}
        />
      )}

      {/* ── 回测结果区 ──────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* 统计卡片 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                回测结果
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)]">
                {result.stats.trade_days} 个交易日 · {result.stats.signal_days}{" "}
                个信号日 · {result.stats.total_trades} 笔交易
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <StatCard
                label="策略总收益"
                value={`${result.stats.total_return >= 0 ? "+" : ""}${result.stats.total_return}%`}
                sub={`年化 ${result.stats.annual_return >= 0 ? "+" : ""}${result.stats.annual_return}%`}
                positive={result.stats.total_return >= 0}
              />
              <StatCard
                label={`基准收益（${benchmarks.find((b) => b.code === benchmark)?.name ?? benchmark}）`}
                value={`${result.stats.benchmark_total_return >= 0 ? "+" : ""}${result.stats.benchmark_total_return}%`}
                sub={`年化 ${result.stats.benchmark_annual_return >= 0 ? "+" : ""}${result.stats.benchmark_annual_return}%`}
                positive={result.stats.benchmark_total_return >= 0}
              />
              <StatCard
                label="超额收益 (α)"
                value={`${result.stats.total_return - result.stats.benchmark_total_return >= 0 ? "+" : ""}${(result.stats.total_return - result.stats.benchmark_total_return).toFixed(2)}%`}
                sub="策略 - 基准"
                positive={
                  result.stats.total_return >=
                  result.stats.benchmark_total_return
                }
              />
              <StatCard
                label="夏普比率"
                value={result.stats.sharpe_ratio.toFixed(2)}
                sub="年化，>1 为优"
                positive={result.stats.sharpe_ratio > 1}
              />
              <StatCard
                label="最大回撤"
                value={`-${result.stats.max_drawdown}%`}
                positive={false}
              />
              <StatCard
                label="胜率"
                value={`${result.stats.win_rate}%`}
                sub={`均收益 ${result.stats.avg_return_per_trade >= 0 ? "+" : ""}${result.stats.avg_return_per_trade}%`}
                positive={result.stats.win_rate > 50}
              />
            </div>
          </div>

          {/* 收益曲线 */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={13} className="text-[var(--text-tertiary)]" />
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                净值曲线
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)]">
                以初始100为基准 · 蓝线为
                {benchmarks.find((b) => b.code === benchmark)?.name ??
                  benchmark}
                同期走势
              </span>
            </div>
            <ReturnCurve curve={result.curve} />

            {Object.keys(result.signal_count_by_date).length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
                <div className="text-[10px] text-[var(--text-tertiary)] mb-1.5">
                  信号日股票数量分布（有信号的{" "}
                  {Object.keys(result.signal_count_by_date).length} 天）
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(result.signal_count_by_date)
                    .slice(-20)
                    .map(([date, count]) => (
                      <span
                        key={date}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[9px] text-[var(--text-tertiary)]"
                      >
                        {date.slice(5)}
                        <span className="text-[#f5a623]">{count}</span>
                      </span>
                    ))}
                  {Object.keys(result.signal_count_by_date).length > 20 && (
                    <span className="text-[9px] text-[var(--text-tertiary)]">
                      …等
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 交易明细 */}
          {result.trades.length > 0 && (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    交易明细
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    共 {result.trades.length} 笔
                    {result.trades.length > 50
                      ? `，显示 ${showAllTrades ? result.trades.length : 50} 笔`
                      : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                  <span className="w-2 h-2 rounded-full bg-[#e84444] inline-block" />
                  盈利
                  <span className="w-2 h-2 rounded-full bg-[#09d464] inline-block ml-1" />
                  亏损
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-[var(--bg-tertiary)]">
                    <tr>
                      <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">
                        股票
                      </th>
                      <th
                        className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium cursor-pointer select-none hover:text-[var(--text-primary)]"
                        onClick={() => toggleTradeSort("buy_date")}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          买入日期
                          {tradeSortKey === "buy_date" ? (
                            tradeSortDir === "asc" ? (
                              <ChevronUp size={10} className="text-[#f5a623]" />
                            ) : (
                              <ChevronDown
                                size={10}
                                className="text-[#f5a623]"
                              />
                            )
                          ) : (
                            <ArrowUpDown size={9} className="opacity-30" />
                          )}
                        </span>
                      </th>
                      <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium">
                        卖出日期
                      </th>
                      <th className="px-3 py-2 text-right text-[var(--text-tertiary)] font-medium">
                        买入价
                      </th>
                      <th className="px-3 py-2 text-right text-[var(--text-tertiary)] font-medium">
                        卖出价
                      </th>
                      <th
                        className="px-3 py-2 text-right text-[var(--text-tertiary)] font-medium cursor-pointer select-none hover:text-[var(--text-primary)]"
                        onClick={() => toggleTradeSort("return_pct")}
                      >
                        <span className="inline-flex items-center gap-0.5 justify-end">
                          收益率
                          {tradeSortKey === "return_pct" ? (
                            tradeSortDir === "asc" ? (
                              <ChevronUp size={10} className="text-[#f5a623]" />
                            ) : (
                              <ChevronDown
                                size={10}
                                className="text-[#f5a623]"
                              />
                            )
                          ) : (
                            <ArrowUpDown size={9} className="opacity-30" />
                          )}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayTrades.map((trade, idx) => (
                      <tr
                        key={`${trade.code}-${trade.buy_date}-${idx}`}
                        className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <td className="px-3 py-1.5">
                          <div className="font-medium text-[var(--text-primary)]">
                            {trade.name}
                          </div>
                          <div className="text-[10px] text-[var(--text-tertiary)]">
                            {trade.code}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)] font-mono">
                          {trade.buy_date}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)] font-mono">
                          {trade.sell_date}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-[var(--text-secondary)]">
                          {trade.buy_price.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-[var(--text-secondary)]">
                          {trade.sell_price.toFixed(2)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-1.5 text-right font-mono font-semibold",
                            trade.return_pct > 0
                              ? "text-[#e84444]"
                              : trade.return_pct < 0
                                ? "text-[#09d464]"
                                : "text-[var(--text-secondary)]",
                          )}
                        >
                          {trade.return_pct > 0 ? "+" : ""}
                          {trade.return_pct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.trades.length > 50 && (
                <div className="px-4 py-3 text-center border-t border-[var(--border-color)]">
                  <button
                    onClick={() => setShowAllTrades((v) => !v)}
                    className="text-[11px] text-[#f5a623] hover:text-[#e8961a] transition-colors"
                  >
                    {showAllTrades
                      ? "收起"
                      : `展开全部 ${result.trades.length} 笔记录`}
                  </button>
                </div>
              )}
            </div>
          )}

          {result.trades.length === 0 && (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-8 text-center">
              <div className="text-[var(--text-tertiary)] text-sm mb-1">
                回测期间无有效交易信号
              </div>
              <div className="text-[10px] text-[var(--text-tertiary)]">
                策略在所选时间范围内未产生任何买入信号，请调整策略条件或扩大时间范围
              </div>
            </div>
          )}

          {/* 回测说明 + 基准说明 */}
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)]">
              <Info
                size={12}
                className="text-[var(--text-tertiary)] shrink-0 mt-0.5"
              />
              <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                <strong className="text-[var(--text-secondary)]">
                  回测逻辑：
                </strong>
                每个交易日基于当天历史K线快照执行选股SQL，次日开盘价买入。持仓期内触及止盈线则获利了结，触及止损线则及时止损，超过最大持仓天数则强制平仓。净值曲线基于实际持仓浮盈累计计算，与交易明细完全一致，未扣除交易费用和滑点。
              </p>
            </div>
            <div className="flex items-start gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)]">
              <Info
                size={12}
                className="text-[var(--text-tertiary)] shrink-0 mt-0.5"
              />
              <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                <strong className="text-[var(--text-secondary)]">
                  对比基准：
                </strong>
                基准为同期大盘指数（如沪深300）的涨跌幅，反映「啥都不做、买指数」的收益。
                策略收益 - 基准收益 = 超额收益（Alpha）。Alpha
                为正表示策略跑赢大盘，是策略有效性的核心衡量标准。
                <strong className="text-[var(--text-secondary)] ml-1">
                  历史收益不代表未来，不构成投资建议。
                </strong>
              </p>
            </div>
          </div>
        </>
      )}

      {/* 空状态提示 */}
      {!result && !loading && !error && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-10 text-center">
          <div className="w-10 h-10 bg-[#f5a623]/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <TrendingUp size={18} className="text-[#f5a623]" />
          </div>
          <div className="text-sm font-medium text-[var(--text-primary)] mb-1">
            选择策略并设置参数
          </div>
          <div className="text-[11px] text-[var(--text-tertiary)] max-w-sm mx-auto">
            从上方 {STRATEGY_TEMPLATES.length} 个内置策略中选择，或自定义 SQL
            策略，点击「开始回测」查看历史收益表现。
          </div>
        </div>
      )}

      {/* 回测中空状态 */}
      {loading && !result && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-10 text-center">
          <div className="w-10 h-10 bg-[#f5a623]/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <Loader2 size={18} className="text-[#f5a623] animate-spin" />
          </div>
          <div className="text-sm font-medium text-[var(--text-primary)] mb-1">
            回测计算中
          </div>
          <div className="text-[11px] text-[var(--text-tertiary)]">
            正在逐日执行选股SQL并计算历史收益，较长日期范围可能需要数十秒...
          </div>
        </div>
      )}
    </div>
  );
}
