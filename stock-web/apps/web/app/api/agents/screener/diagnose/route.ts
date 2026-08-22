import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import * as os from "os";
import * as path from "path";

const DB_PATH =
  process.env.STOCK_DB_PATH ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/stock-web/apps/data-service/stock_data.db",
  );

// ─── 诊断结果类型 ─────────────────────────────────────────────────────────────

export interface DiagnoseItem {
  /** 条件名称 */
  label: string;
  /** 当前值（格式化字符串） */
  actual: string;
  /** 要求值（格式化字符串） */
  required: string;
  /** 是否满足 */
  pass: boolean;
  /** 描述说明 */
  desc?: string;
}

export interface DiagnoseResult {
  code: string;
  name: string;
  price: number;
  change: number;
  industryBoard: string;
  strategyId: string;
  strategyName: string;
  /** 各条件检查结果 */
  items: DiagnoseItem[];
  /** 综合总结 */
  summary: string;
  /** 不满足的条件数量 */
  failCount: number;
  /** 满足的条件数量 */
  passCount: number;
}

// ─── 策略条件诊断 SQL ─────────────────────────────────────────────────────────

/**
 * 通用 K 线指标查询：返回指定股票的所有技术指标数据
 */
function buildDiagnoseSql(code: string): string {
  const safeCode = code.replace(/[^0-9a-zA-Z]/g, "");
  return `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, turnover,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4   PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9   PRECEDING AND CURRENT ROW) AS ma10,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19  PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 24  PRECEDING AND 5 PRECEDING) AS ma20_5d_ago,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS ma60,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 64  PRECEDING AND 5 PRECEDING) AS ma60_5d_ago,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 119 PRECEDING AND CURRENT ROW) AS ma120,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 124 PRECEDING AND 5 PRECEDING) AS ma120_5d_ago,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9   PRECEDING AND 5 PRECEDING) AS ma5_prev5,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4   PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19  PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS vol_ma60,
    MAX(high)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS high_60d,
    MAX(high)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS high_250d,
    MIN(low)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS low_250d,
    MIN(low)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 179 PRECEDING AND CURRENT ROW) AS low_180d,
    MAX(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19  PRECEDING AND CURRENT ROW) AS close_high_20d,
    MIN(high)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9   PRECEDING AND CURRENT ROW) AS consolidate_low_10d,
    MAX(high)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9   PRECEDING AND CURRENT ROW) AS consolidate_high_10d,
    MAX(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS close_high_60d,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    -- 近3月最高价（用于强势股回调）
    MAX(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS max_close_60d,
    -- 近90日最低价（用于底部反转）
    MIN(low)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 89  PRECEDING AND CURRENT ROW) AS low_90d,
    -- 涨停判断
    change_pct,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND code = '${safeCode}'
    AND trade_date >= (SELECT date(MAX(trade_date), '-500 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
-- 涨停统计（近30日，用于同时覆盖 limit_up_15d 和 limit_up_25d）
limit_stats AS (
  SELECT code,
    SUM(CASE WHEN (code LIKE '30%' OR code LIKE '68%') AND change_pct >= 19.9 THEN 1
             WHEN (code NOT LIKE '30%' AND code NOT LIKE '68%') AND change_pct >= 9.9 THEN 1
             ELSE 0 END) AS limit_up_15d,
    SUM(CASE WHEN (code LIKE '30%' OR code LIKE '68%') AND change_pct >= 19.9 THEN 1
             WHEN (code NOT LIKE '30%' AND code NOT LIKE '68%') AND change_pct >= 9.9 THEN 1
             ELSE 0 END) AS limit_up_25d
  FROM stock_kline
  WHERE period = 'daily' AND code = '${safeCode}'
    AND trade_date >= (SELECT date(MAX(trade_date), '-30 days') FROM stock_kline WHERE period='daily')
),
-- 近期涨幅（用于强势股回调）
recent_perf AS (
  SELECT '${safeCode}' AS code,
    ROUND(
      (SELECT close FROM stock_kline WHERE period='daily' AND code='${safeCode}' ORDER BY trade_date DESC LIMIT 1) * 1.0 /
      NULLIF((SELECT close FROM stock_kline WHERE period='daily' AND code='${safeCode}' ORDER BY trade_date DESC LIMIT 1 OFFSET 60), 0) - 1,
    4) AS pct_3m
),
-- 板块信息
stock_board AS (
  SELECT sic.stock_code, si.name AS board_name
  FROM sw_industry_constituent sic
  JOIN sw_industry si ON si.code = sic.board_code AND si.level = '二级'
  WHERE sic.stock_code = '${safeCode}'
),
industry_flow AS (
  SELECT name, netflow
  FROM fund_flow_snapshot
  WHERE period = 'today' AND board_type = 'industry'
    AND trade_date = (SELECT MAX(trade_date) FROM fund_flow_snapshot WHERE period = 'today')
),
industry_recent AS (
  SELECT name AS board_name, SUM(change_pct) AS cum5_pct
  FROM sw_industry_daily
  WHERE trade_date >= (SELECT date(MAX(trade_date), '-9 days') FROM sw_industry_daily)
  GROUP BY name
)
SELECT
  l.code,
  q.name,
  ROUND(q.price, 2) AS price,
  ROUND(q.change, 2) AS change_pct_today,
  COALESCE(sb.board_name, '未分类') AS industry_board,
  -- 均线
  ROUND(l.ma5, 3)   AS ma5,
  ROUND(l.ma10, 3)  AS ma10,
  ROUND(l.ma20, 3)  AS ma20,
  ROUND(l.ma60, 3)  AS ma60,
  ROUND(l.ma120, 3) AS ma120,
  ROUND(l.ma20_5d_ago, 3) AS ma20_5d_ago,
  ROUND(l.ma60_5d_ago, 3) AS ma60_5d_ago,
  ROUND(l.ma120_5d_ago, 3) AS ma120_5d_ago,
  ROUND(l.ma5_prev5, 3) AS ma5_prev5,
  -- 均线斜率
  ROUND(CASE WHEN l.ma20_5d_ago > 0 THEN (l.ma20 - l.ma20_5d_ago) / l.ma20_5d_ago * 100 ELSE 0 END, 3) AS ma20_slope,
  ROUND(CASE WHEN l.ma60_5d_ago > 0 THEN (l.ma60 - l.ma60_5d_ago) / l.ma60_5d_ago * 100 ELSE 0 END, 3) AS ma60_slope,
  -- 量能
  ROUND(l.vol_ma5, 0)  AS vol_ma5,
  ROUND(l.vol_ma20, 0) AS vol_ma20,
  ROUND(l.vol_ma60, 0) AS vol_ma60,
  ROUND(CASE WHEN l.vol_ma60 > 0 THEN l.vol_ma5 / l.vol_ma60 ELSE 0 END, 2) AS vol_surge_ratio,
  ROUND(CASE WHEN l.vol_ma20 > 0 THEN l.vol_ma5 / l.vol_ma20 ELSE 0 END, 2) AS vol_vs_ma20,
  -- 价格相关
  ROUND(l.close, 3) AS close,
  ROUND(l.high_60d, 3) AS high_60d,
  ROUND(l.high_250d, 3) AS high_250d,
  ROUND(l.low_250d, 3) AS low_250d,
  ROUND(l.low_180d, 3) AS low_180d,
  ROUND(l.close_high_20d, 3) AS close_high_20d,
  ROUND(l.close_high_60d, 3) AS close_high_60d,
  ROUND(l.max_close_60d, 3) AS max_close_60d,
  ROUND(l.low_90d, 3) AS low_90d,
  ROUND(l.consolidate_low_10d, 3) AS consolidate_low_10d,
  ROUND(l.consolidate_high_10d, 3) AS consolidate_high_10d,
  -- 250日百分位
  ROUND(CASE WHEN (l.high_250d - l.low_250d) > 0
    THEN (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100
    ELSE 50 END, 1) AS price_pct_250d,
  -- 平台振幅（近10日最高-最低 / 最低）
  ROUND(CASE WHEN l.consolidate_low_10d > 0
    THEN (l.consolidate_high_10d - l.consolidate_low_10d) / l.consolidate_low_10d * 100
    ELSE 999 END, 1) AS consolidate_range_pct,
  -- 近期K线形态
  ROUND(l.open, 3) AS open_today,
  l.change_pct AS change_pct_raw,
  -- 涨停统计
  COALESCE(ls.limit_up_15d, 0) AS limit_up_15d,
  COALESCE(ls.limit_up_25d, 0) AS limit_up_25d,
  -- 近3月涨幅
  ROUND(COALESCE(rp.pct_3m, 0) * 100, 1) AS pct_3m,
  -- 距近期高点回撤
  ROUND(CASE WHEN l.max_close_60d > 0 THEN (l.close - l.max_close_60d) / l.max_close_60d * 100 ELSE 0 END, 1) AS drawdown_from_high,
  -- 距低点涨幅
  ROUND(CASE WHEN l.low_90d > 0 THEN (l.close - l.low_90d) / l.low_90d * 100 ELSE 0 END, 1) AS rise_from_90d_low,
  -- 板块资金
  ROUND(COALESCE(ifl.netflow, 0), 2) AS board_netflow,
  ROUND(COALESCE(irr.cum5_pct, 0), 2) AS board_cum5_pct,
  -- 日均成交额亿
  ROUND(l.amt_avg20 / 1e8, 2) AS amt_avg20_yi,
  -- 今日阳线实体比
  ROUND(CASE WHEN (l.high - l.low) > 0
    THEN ABS(l.close - l.open) / (l.high - l.low) * 100
    ELSE 0 END, 1) AS yang_body_pct,
  -- 今日涨幅（供形态判断）
  ROUND(l.change_pct, 2) AS today_pct
FROM latest l
LEFT JOIN stock_quote q ON q.code = l.code
LEFT JOIN stock_board sb ON sb.stock_code = l.code
LEFT JOIN industry_flow ifl ON ifl.name = sb.board_name
LEFT JOIN industry_recent irr ON irr.board_name = sb.board_name
LEFT JOIN limit_stats ls ON ls.code = l.code
LEFT JOIN recent_perf rp ON rp.code = l.code
`;
}

// ─── 按策略诊断每个条件 ───────────────────────────────────────────────────────

type RawData = Record<string, string | number | null>;

function n(v: string | number | null | undefined): number {
  return parseFloat(String(v ?? "0")) || 0;
}

function fmt(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

function fmtPct(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function diagCapitalSurge(d: RawData): DiagnoseItem[] {
  const pricePct = n(d.price_pct_250d);
  const ma20Slope = n(d.ma20_slope);
  const ma60Slope = n(d.ma60_slope);
  const volSurge = n(d.vol_surge_ratio);
  const boardNetflow = n(d.board_netflow);
  const boardCum5 = n(d.board_cum5_pct);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
      desc: "流动性不足的股票过滤",
    },
    {
      label: "价格处于250日低位（百分位 < 35%）",
      actual: `${fmt(pricePct, 1)}%`,
      required: "< 35%",
      pass: pricePct < 35,
      desc: "当前价在近250日区间的位置，越低代表越接近历史低位",
    },
    {
      label: "MA20斜率 > -0.3%（均线企稳）",
      actual: fmtPct(ma20Slope),
      required: "> -0.3%",
      pass: ma20Slope > -0.3,
      desc: "20日均线斜率，负值表示仍在下行，需走平或向上",
    },
    {
      label: "MA60斜率 > -0.3%（均线企稳）",
      actual: fmtPct(ma60Slope),
      required: "> -0.3%",
      pass: ma60Slope > -0.3,
      desc: "60日均线斜率，负值表示趋势仍在下行",
    },
    {
      label: "5日均量 ≥ 60日均量 1.2倍（放量）",
      actual: `${fmt(volSurge, 2)}x`,
      required: "≥ 1.2x",
      pass: volSurge >= 1.2,
      desc: "近5日平均成交量相对60日均量的倍数，衡量资金异动程度",
    },
    {
      label: "所属板块今日资金净流入 > 0",
      actual:
        boardNetflow > 0
          ? `+${fmt(boardNetflow, 2)}亿`
          : `${fmt(boardNetflow, 2)}亿`,
      required: "> 0",
      pass: boardNetflow > 0,
      desc: "板块今日资金净流入，正值表示主力资金流入",
    },
    {
      label: "板块近5日累计涨幅 > 0",
      actual: fmtPct(boardCum5),
      required: "> 0%",
      pass: boardCum5 > 0,
      desc: "所属板块近5个交易日累计涨跌幅，正值表示板块趋势向上",
    },
  ];
}

function diagMaBullish(d: RawData): DiagnoseItem[] {
  const ma5 = n(d.ma5);
  const ma10 = n(d.ma10);
  const ma20 = n(d.ma20);
  const ma60 = n(d.ma60);
  const close = n(d.close);
  const volMa5 = n(d.vol_ma5);
  const volMa20 = n(d.vol_ma20);
  const ma5Prev5 = n(d.ma5_prev5);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "MA5 > MA10（短期多头）",
      actual: `MA5=${fmt(ma5, 2)} MA10=${fmt(ma10, 2)}`,
      required: "MA5 > MA10",
      pass: ma5 > ma10,
      desc: "短期均线多头，5日均线站上10日均线",
    },
    {
      label: "MA10 > MA20（中期多头）",
      actual: `MA10=${fmt(ma10, 2)} MA20=${fmt(ma20, 2)}`,
      required: "MA10 > MA20",
      pass: ma10 > ma20,
      desc: "中期均线多头，10日均线站上20日均线",
    },
    {
      label: "MA20 > MA60（长期多头）",
      actual: `MA20=${fmt(ma20, 2)} MA60=${fmt(ma60, 2)}`,
      required: "MA20 > MA60",
      pass: ma20 > ma60,
      desc: "中长期均线多头排列，决定趋势分数能否满分",
    },
    {
      label: "价格站上MA5",
      actual: `收=${fmt(close, 2)} MA5=${fmt(ma5, 2)}`,
      required: "收盘 > MA5",
      pass: close > ma5,
      desc: "价格必须站上MA5才能算价格位置满分",
    },
    {
      label: "5日均量 > 20日均量（量能配合）",
      actual: `vol5/vol20=${fmt(volMa5 / (volMa20 || 1), 2)}x`,
      required: "> 1.0x",
      pass: volMa5 > volMa20,
      desc: "近期成交量需高于均量，量能配合趋势",
    },
    {
      label: "MA5斜率向上（MA5 > 5日前MA5）",
      actual: `MA5=${fmt(ma5, 2)} 5日前MA5=${fmt(ma5Prev5, 2)}`,
      required: "MA5 > 5日前MA5",
      pass: ma5 > ma5Prev5,
      desc: "5日均线需持续向上，确保动量",
    },
  ];
}

function diagBreakoutHigh(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const high60d = n(d.high_60d);
  const volMa5 = n(d.vol_ma5);
  const volMa20 = n(d.vol_ma20);
  const ma20 = n(d.ma20);
  const amtAvg20 = n(d.amt_avg20_yi);
  const todayPct = n(d.today_pct);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "收盘突破近60日最高价",
      actual: `收=${fmt(close, 2)} 60日高=${fmt(high60d, 2)}`,
      required: "收盘 ≥ 60日高点",
      pass: close >= high60d * 0.998,
      desc: "今日收盘价需突破或非常接近近60日的最高点",
    },
    {
      label: "成交量 > 20日均量 1.2倍（放量突破）",
      actual: `vol5/vol20=${fmt(volMa5 / (volMa20 || 1), 2)}x`,
      required: "≥ 1.2x",
      pass: volMa5 >= volMa20 * 1.2,
      desc: "突破必须有量能配合，否则为假突破",
    },
    {
      label: "价格站上MA20",
      actual: `收=${fmt(close, 2)} MA20=${fmt(ma20, 2)}`,
      required: "收盘 > MA20",
      pass: close > ma20,
      desc: "站上20日均线确认中期趋势健康",
    },
    {
      label: "今日为阳线（涨幅 > 0）",
      actual: fmtPct(todayPct),
      required: "> 0%",
      pass: todayPct > 0,
      desc: "突破当日需为阳线",
    },
  ];
}

function diagBottomReversal(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const low180d = n(d.low_180d);
  const volMa5 = n(d.vol_ma5);
  const volMa20 = n(d.vol_ma20);
  const todayPct = n(d.today_pct);
  const ma20 = n(d.ma20);
  const amtAvg20 = n(d.amt_avg20_yi);
  const riseFrom180dLow =
    low180d > 0 ? ((close - low180d) / low180d) * 100 : 999;

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "距6月低点涨幅 < 30%（低位）",
      actual: `距180日低点 +${fmt(riseFrom180dLow, 1)}%`,
      required: "< 30%",
      pass: riseFrom180dLow < 30,
      desc: "需处于近半年低位区域，距最低点涨幅不超过30%",
    },
    {
      label: "今日涨幅 ≥ 2%（放量长阳）",
      actual: fmtPct(todayPct),
      required: "≥ 2%",
      pass: todayPct >= 2,
      desc: "底部反转需要出现明显上涨，当日涨幅至少2%",
    },
    {
      label: "成交量 > 20日均量 1.2倍（放量）",
      actual: `vol5/vol20=${fmt(volMa5 / (volMa20 || 1), 2)}x`,
      required: "≥ 1.2x",
      pass: volMa5 >= volMa20 * 1.2,
      desc: "反转信号需要量能放大确认",
    },
    {
      label: "价格靠近MA20（支撑位置）",
      actual: `收=${fmt(close, 2)} MA20=${fmt(ma20, 2)} 偏差=${fmt(close > 0 ? ((close - ma20) / ma20) * 100 : 0, 1)}%`,
      required: "在MA20附近±5%",
      pass: Math.abs(close - ma20) / (ma20 || 1) <= 0.05,
      desc: "底部反转应在均线支撑附近发生，偏离过大则不典型",
    },
  ];
}

function diagMacdGolden(d: RawData): DiagnoseItem[] {
  const ma20 = n(d.ma20);
  const close = n(d.close);
  const amtAvg20 = n(d.amt_avg20_yi);

  // MACD 需要从 stock_indicator 表读，这里用均线替代说明
  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "价格站上MA20（趋势健康）",
      actual: `收=${fmt(close, 2)} MA20=${fmt(ma20, 2)}`,
      required: "收盘 > MA20",
      pass: close > ma20,
      desc: "站上20日均线是MACD金叉有效的前提条件",
    },
    {
      label: "MACD DIF上穿DEA（金叉）",
      actual: "需查看指标数据",
      required: "DIF > DEA 且 5日前 DIF < DEA",
      pass: false,
      desc: "需要 DIF 线从下方上穿 DEA 线，形成金叉信号（需实时指标数据）",
    },
    {
      label: "MACD柱（DIFF-DEA）由负转正",
      actual: "需查看指标数据",
      required: "MACD柱 > 0",
      pass: false,
      desc: "MACD柱由负转正确认趋势反转（需实时指标数据）",
    },
  ];
}

function diagVolumeShrinkPullback(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const ma20 = n(d.ma20);
  const ma60 = n(d.ma60);
  const volMa5 = n(d.vol_ma5);
  const volMa20 = n(d.vol_ma20);
  const ma20Slope = n(d.ma20_slope);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "5日均量 < 20日均量的80%（缩量）",
      actual: `vol5/vol20=${fmt(volMa5 / (volMa20 || 1), 2)}x`,
      required: "< 0.80x",
      pass: volMa5 < volMa20 * 0.8,
      desc: "回调阶段需要明显缩量，否则是主力出货",
    },
    {
      label: "价格在MA20与MA60之间（蓄势区间）",
      actual: `收=${fmt(close, 2)} MA20=${fmt(ma20, 2)} MA60=${fmt(ma60, 2)}`,
      required: "MA60 < 收盘 < MA20",
      pass: close > ma60 && close < ma20,
      desc: "价格回调到MA20与MA60之间的蓄势区间",
    },
    {
      label: "MA20方向向上（斜率 > 0）",
      actual: fmtPct(ma20Slope),
      required: "> 0%",
      pass: ma20Slope > 0,
      desc: "20日均线需持续向上，确认中期趋势没有破坏",
    },
  ];
}

function diagStrongPullback(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const ma60 = n(d.ma60);
  const pct3m = n(d.pct_3m);
  const drawdown = n(d.drawdown_from_high);
  const volMa5 = n(d.vol_ma5);
  const volMa20 = n(d.vol_ma20);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "近3月涨幅 > 30%（强势股）",
      actual: fmtPct(pct3m),
      required: "> 30%",
      pass: pct3m > 30,
      desc: "近60个交易日（约3个月）累计涨幅需超过30%，证明是强势股",
    },
    {
      label: "距近期高点回调 5%~35%（合理回撤）",
      actual: `回撤=${fmt(drawdown, 1)}%`,
      required: "在 -35% ~ -5% 区间",
      pass: drawdown >= -35 && drawdown <= -5,
      desc: "回调幅度太小不值得介入，回调太大说明趋势破坏",
    },
    {
      label: "价格站上MA60（趋势仍健康）",
      actual: `收=${fmt(close, 2)} MA60=${fmt(ma60, 2)}`,
      required: "收盘 > MA60",
      pass: close > ma60,
      desc: "60日均线是中长期趋势线，价格不能跌破",
    },
    {
      label: "近期缩量（vol5 < vol20）",
      actual: `vol5/vol20=${fmt(volMa5 / (volMa20 || 1), 2)}x`,
      required: "< 1.0x（缩量）",
      pass: volMa5 < volMa20,
      desc: "回调阶段缩量是健康的，放量回调需谨慎",
    },
  ];
}

function diagBigYangBreakout(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const closeHigh20d = n(d.close_high_20d);
  const todayPct = n(d.today_pct);
  const volMa5 = n(d.vol_ma5);
  const volMa20 = n(d.vol_ma20);
  const yangBody = n(d.yang_body_pct);
  const ma20 = n(d.ma20);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "今日涨幅 ≥ 5%（大阳线）",
      actual: fmtPct(todayPct),
      required: "≥ 5%",
      pass: todayPct >= 5,
      desc: "大阳线需要涨幅至少5%",
    },
    {
      label: "成交量 ≥ 均量 1.5倍（放量）",
      actual: `vol5/vol20=${fmt(volMa5 / (volMa20 || 1), 2)}x`,
      required: "≥ 1.5x",
      pass: volMa5 >= volMa20 * 1.5,
      desc: "大阳线需要量能大幅放大确认",
    },
    {
      label: "创20日阶段新高",
      actual: `收=${fmt(close, 2)} 20日最高=${fmt(closeHigh20d, 2)}`,
      required: "收盘 ≥ 20日最高收盘价",
      pass: close >= closeHigh20d * 0.998,
      desc: "大阳线应突破近期高点，形成新高信号",
    },
    {
      label: "阳线实体比 > 50%（实体大）",
      actual: `实体比=${fmt(yangBody, 1)}%`,
      required: "> 50%",
      pass: yangBody > 50,
      desc: "实体占振幅比例，过小说明上下影线大，力度不够",
    },
    {
      label: "价格站上MA20",
      actual: `收=${fmt(close, 2)} MA20=${fmt(ma20, 2)}`,
      required: "收盘 > MA20",
      pass: close > ma20,
      desc: "站上20日均线确认中期多头",
    },
  ];
}

function diagConsolidationBreakout(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const consolidateRange = n(d.consolidate_range_pct);
  const consolidateHigh10d = n(d.consolidate_high_10d);
  const volMa5 = n(d.vol_ma5);
  const volMa20 = n(d.vol_ma20);
  const ma20 = n(d.ma20);
  const ma60 = n(d.ma60);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "近10日振幅 < 8%（横盘整理）",
      actual: `振幅=${fmt(consolidateRange, 1)}%`,
      required: "< 8%",
      pass: consolidateRange < 8,
      desc: "近10个交易日最高价与最低价的振幅，振幅小表示充分整理",
    },
    {
      label: "今日放量突破10日最高价",
      actual: `收=${fmt(close, 2)} 10日高=${fmt(consolidateHigh10d, 2)} vol/vol20=${fmt(volMa5 / (volMa20 || 1), 2)}x`,
      required: "收盘突破10日高点 且 量≥1.4x",
      pass: close >= consolidateHigh10d * 0.998 && volMa5 >= volMa20 * 1.4,
      desc: "突破整理平台的上轨，同时成交量放大1.4倍以上",
    },
    {
      label: "MA20 > MA60（均线多头）",
      actual: `MA20=${fmt(ma20, 2)} MA60=${fmt(ma60, 2)}`,
      required: "MA20 > MA60",
      pass: ma20 > ma60,
      desc: "均线多头排列确保大趋势向上",
    },
    {
      label: "价格站上MA20",
      actual: `收=${fmt(close, 2)} MA20=${fmt(ma20, 2)}`,
      required: "收盘 > MA20",
      pass: close > ma20,
      desc: "整理期间价格不应跌破MA20",
    },
  ];
}

function diagRsiOversold(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const ma20 = n(d.ma20);
  const ma60 = n(d.ma60);
  const volMa5 = n(d.vol_ma5);
  const volMa20 = n(d.vol_ma20);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "RSI14 前值 < 35（超卖区）",
      actual: "需查看指标数据",
      required: "RSI14前值 < 35",
      pass: false,
      desc: "RSI14需要先进入超卖区（<35），再回升才有反弹意义（需实时指标数据）",
    },
    {
      label: "RSI14 当前值 > 前值（回升中）",
      actual: "需查看指标数据",
      required: "RSI回升",
      pass: false,
      desc: "RSI从超卖区回升，形成超卖反弹信号（需实时指标数据）",
    },
    {
      label: "价格靠近MA20或MA60（支撑位）",
      actual: `收=${fmt(close, 2)} MA20=${fmt(ma20, 2)} MA60=${fmt(ma60, 2)}`,
      required: "在均线支撑附近",
      pass:
        Math.abs(close - ma20) / (ma20 || 1) <= 0.05 ||
        Math.abs(close - ma60) / (ma60 || 1) <= 0.05,
      desc: "在均线支撑位出现超卖反弹信号更可靠",
    },
    {
      label: "成交量 > 均量（量能配合）",
      actual: `vol5/vol20=${fmt(volMa5 / (volMa20 || 1), 2)}x`,
      required: "> 1.0x",
      pass: volMa5 > volMa20,
      desc: "反弹需要量能配合",
    },
  ];
}

function diagFundamentalsGrowth(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const ma60 = n(d.ma60);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "价格站上MA60（技术面支撑）",
      actual: `收=${fmt(close, 2)} MA60=${fmt(ma60, 2)}`,
      required: "收盘 > MA60",
      pass: close > ma60,
      desc: "技术面需确认，价格站上60日均线",
    },
    {
      label: "ROE ≥ 10%（盈利能力）",
      actual: "需查看基本面数据",
      required: "ROE ≥ 10%",
      pass: false,
      desc: "净资产收益率，反映公司盈利能力（需基本面数据库）",
    },
    {
      label: "营收增速 > 0%（成长性）",
      actual: "需查看基本面数据",
      required: "营收同比 > 0",
      pass: false,
      desc: "营收同比增长，确认公司在成长（需基本面数据库）",
    },
    {
      label: "净利润增速 > 0%（盈利成长）",
      actual: "需查看基本面数据",
      required: "净利润同比 > 0",
      pass: false,
      desc: "净利润同比增长，双增验证（需基本面数据库）",
    },
    {
      label: "市盈率 PE < 30（估值合理）",
      actual: "需查看基本面数据",
      required: "PE < 30",
      pass: false,
      desc: "市盈率过高估值风险大（需基本面数据库）",
    },
  ];
}

function diagLimitUpPullback(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const ma5 = n(d.ma5);
  const limitUp15d = n(d.limit_up_15d);
  const volMa5 = n(d.vol_ma5);
  const volMa20 = n(d.vol_ma20);
  const todayPct = n(d.today_pct);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "近10日 ≥ 2次涨停（强势基础）",
      actual: `近15日涨停${limitUp15d}次`,
      required: "≥ 2次",
      pass: limitUp15d >= 2,
      desc: "需要近期有涨停板走势，证明主力在推升",
    },
    {
      label: "今日收阴缩量（回调整理）",
      actual: `涨跌=${fmtPct(todayPct)} vol5/vol20=${fmt(volMa5 / (volMa20 || 1), 2)}x`,
      required: "今日收阴 且 缩量",
      pass: todayPct < 0 && volMa5 < volMa20,
      desc: "涨停后回调应为缩量阴线，否则是主力出货",
    },
    {
      label: "价格在MA5上方（仍强势）",
      actual: `收=${fmt(close, 2)} MA5=${fmt(ma5, 2)}`,
      required: "收盘 > MA5",
      pass: close > ma5,
      desc: "回调不应跌破MA5，否则短期趋势破坏",
    },
  ];
}

function diagConsecutiveLimitPullback(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const ma5 = n(d.ma5);
  const limitUp15d = n(d.limit_up_15d);
  const volMa5 = n(d.vol_ma5);
  const volMa20 = n(d.vol_ma20);
  const todayPct = n(d.today_pct);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "近5日 ≥ 2连板（强势连板）",
      actual: `近15日涨停${limitUp15d}次`,
      required: "≥ 2次（近期连板）",
      pass: limitUp15d >= 2,
      desc: "需要近期有连续涨停板，形成连板龙头",
    },
    {
      label: "今日温和回调（-1%~-5%）",
      actual: fmtPct(todayPct),
      required: "-5% ~ -1%",
      pass: todayPct >= -5 && todayPct <= -1,
      desc: "回调幅度适中，不能太大也不能太小",
    },
    {
      label: "今日缩量回调",
      actual: `vol5/vol20=${fmt(volMa5 / (volMa20 || 1), 2)}x`,
      required: "< 1.0x（缩量）",
      pass: volMa5 < volMa20,
      desc: "缩量回调是洗盘行为，放量回调则是主力出货",
    },
    {
      label: "价格在MA5上方",
      actual: `收=${fmt(close, 2)} MA5=${fmt(ma5, 2)}`,
      required: "收盘 > MA5",
      pass: close > ma5,
      desc: "强势连板的回调不应跌破MA5",
    },
  ];
}

function diagWeeklyMonthlyResonance(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const ma20 = n(d.ma20);
  const ma60 = n(d.ma60);
  const ma120 = n(d.ma120);
  const ma5 = n(d.ma5);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "日线MA5 > MA20（短期多头）",
      actual: `MA5=${fmt(ma5, 2)} MA20=${fmt(ma20, 2)}`,
      required: "MA5 > MA20",
      pass: ma5 > ma20,
      desc: "日线短期多头，MA5在MA20上方",
    },
    {
      label: "MA20 > MA60（中期多头/周线共振）",
      actual: `MA20=${fmt(ma20, 2)} MA60=${fmt(ma60, 2)}`,
      required: "MA20 > MA60",
      pass: ma20 > ma60,
      desc: "MA20>MA60相当于周线的5周线>10周线多头排列",
    },
    {
      label: "价格站上MA120（月线共振）",
      actual: `收=${fmt(close, 2)} MA120=${fmt(ma120, 2)}`,
      required: "收盘 > MA120",
      pass: close > ma120,
      desc: "MA120是日线120日均线，相当于月线10月线，站上表示月线强势",
    },
  ];
}

function diagVolumePriceSurge(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const closeHigh20d = n(d.close_high_20d);
  const volMa5 = n(d.vol_ma5);
  const volMa20 = n(d.vol_ma20);
  const todayPct = n(d.today_pct);
  const ma20 = n(d.ma20);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "创近20日收盘新高",
      actual: `收=${fmt(close, 2)} 20日最高=${fmt(closeHigh20d, 2)}`,
      required: "收盘 ≥ 20日最高",
      pass: close >= closeHigh20d * 0.998,
      desc: "价格需创近20日收盘价的新高",
    },
    {
      label: "成交量 ≥ 均量 1.5倍（量能大幅放大）",
      actual: `vol5/vol20=${fmt(volMa5 / (volMa20 || 1), 2)}x`,
      required: "≥ 1.5x",
      pass: volMa5 >= volMa20 * 1.5,
      desc: "量价齐升，量能需放大1.5倍以上",
    },
    {
      label: "今日为阳线",
      actual: fmtPct(todayPct),
      required: "> 0%",
      pass: todayPct > 0,
      desc: "新高必须由阳线确认",
    },
    {
      label: "价格站上MA20",
      actual: `收=${fmt(close, 2)} MA20=${fmt(ma20, 2)}`,
      required: "收盘 > MA20",
      pass: close > ma20,
      desc: "站上20日均线确认趋势",
    },
  ];
}

function diagKdjGoldenCross(d: RawData): DiagnoseItem[] {
  const close = n(d.close);
  const ma20 = n(d.ma20);
  const amtAvg20 = n(d.amt_avg20_yi);

  return [
    {
      label: "日均成交额 ≥ 3000万",
      actual: `${fmt(amtAvg20, 2)}亿`,
      required: "≥ 0.03亿",
      pass: amtAvg20 >= 0.03,
    },
    {
      label: "KDJ K值 < 50（低位区间）",
      actual: "需查看指标数据",
      required: "K < 50",
      pass: false,
      desc: "KDJ金叉需在低位（K<50）出现才有意义（需实时指标数据）",
    },
    {
      label: "KDJ K线上穿D线（金叉）",
      actual: "需查看指标数据",
      required: "K > D 且 前值 K < D",
      pass: false,
      desc: "KDJ金叉形成，K从下方穿过D线（需实时指标数据）",
    },
    {
      label: "MACD柱 > 0（背离向好）",
      actual: "需查看指标数据",
      required: "MACD柱 > 0",
      pass: false,
      desc: "MACD柱由负转正，多个指标共振（需实时指标数据）",
    },
    {
      label: "价格靠近MA20（支撑位置）",
      actual: `收=${fmt(close, 2)} MA20=${fmt(ma20, 2)}`,
      required: "在MA20附近",
      pass: Math.abs(close - ma20) / (ma20 || 1) <= 0.08,
      desc: "在均线支撑附近出现KDJ金叉更可靠",
    },
  ];
}

// ─── 策略诊断入口 ─────────────────────────────────────────────────────────────

const STRATEGY_NAMES: Record<string, string> = {
  capital_surge: "资金异动",
  report_picks: "报告精选",
  ma_bullish: "均线多头排列",
  breakout_high: "突破前高放量",
  bottom_reversal: "底部反转信号",
  macd_golden: "MACD金叉背离",
  volume_shrink_pullback: "缩量回调蓄势",
  strong_pullback: "强势股回调低吸",
  weekly_monthly_resonance: "周月K线共振",
  volume_price_surge: "量价齐升突破",
  rsi_oversold: "RSI超卖反弹",
  fundamentals_growth: "基本面成长筛选",
  limit_up_pullback: "涨停板后回踩",
  consecutive_limit_pullback: "连板龙头回调",
  big_yang_breakout: "大阳线启动",
  consolidation_breakout: "平台整理突破",
  kdj_golden_cross: "KDJ金叉低位共振",
};

function diagnoseStrategy(strategyId: string, d: RawData): DiagnoseItem[] {
  switch (strategyId) {
    case "capital_surge":
    case "report_picks":
      return diagCapitalSurge(d);
    case "ma_bullish":
      return diagMaBullish(d);
    case "breakout_high":
      return diagBreakoutHigh(d);
    case "bottom_reversal":
      return diagBottomReversal(d);
    case "macd_golden":
      return diagMacdGolden(d);
    case "volume_shrink_pullback":
      return diagVolumeShrinkPullback(d);
    case "strong_pullback":
      return diagStrongPullback(d);
    case "big_yang_breakout":
      return diagBigYangBreakout(d);
    case "consolidation_breakout":
      return diagConsolidationBreakout(d);
    case "rsi_oversold":
      return diagRsiOversold(d);
    case "fundamentals_growth":
      return diagFundamentalsGrowth(d);
    case "limit_up_pullback":
      return diagLimitUpPullback(d);
    case "consecutive_limit_pullback":
      return diagConsecutiveLimitPullback(d);
    case "weekly_monthly_resonance":
      return diagWeeklyMonthlyResonance(d);
    case "volume_price_surge":
      return diagVolumePriceSurge(d);
    case "kdj_golden_cross":
      return diagKdjGoldenCross(d);
    default:
      return [];
  }
}

// ─── API Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      code: string;
      strategyId: string;
    };

    const { code, strategyId } = body;

    if (!code || !strategyId) {
      return NextResponse.json(
        { error: "请提供股票代码和策略ID" },
        { status: 400 },
      );
    }

    // 安全验证
    const safeCode = code.replace(/[^0-9a-zA-Z]/g, "");
    if (!safeCode) {
      return NextResponse.json({ error: "无效的股票代码" }, { status: 400 });
    }

    const strategyName = STRATEGY_NAMES[strategyId];
    if (!strategyName) {
      return NextResponse.json({ error: "未知的策略ID" }, { status: 400 });
    }

    // 查询股票指标数据
    let db: Database.Database | null = null;
    let rawData: RawData;

    try {
      db = new Database(DB_PATH, { readonly: true });
      const sql = buildDiagnoseSql(safeCode);
      const row = db.prepare(sql).get() as RawData | undefined;

      if (!row) {
        return NextResponse.json(
          { error: `未找到股票 ${safeCode} 的数据，请确认代码是否正确` },
          { status: 404 },
        );
      }
      rawData = row;
    } finally {
      db?.close();
    }

    // 执行策略诊断
    const items = diagnoseStrategy(strategyId, rawData);
    const passCount = items.filter((i) => i.pass).length;
    const failCount = items.filter((i) => !i.pass).length;

    // 生成综合总结
    const failItems = items.filter((i) => !i.pass);
    let summary: string;
    if (failCount === 0) {
      summary = `${String(rawData.name)} 满足「${strategyName}」策略的所有条件，可以关注！`;
    } else if (failCount <= 2) {
      summary = `${String(rawData.name)} 有 ${failCount} 个条件未满足：${failItems.map((i) => i.label).join("、")}。接近满足，可以持续观察。`;
    } else {
      summary = `${String(rawData.name)} 有 ${failCount} 个条件未满足，距离「${strategyName}」策略要求还有较大差距，暂不符合入选条件。`;
    }

    const result: DiagnoseResult = {
      code: safeCode,
      name: String(rawData.name ?? safeCode),
      price: parseFloat(String(rawData.price ?? "0")) || 0,
      change: parseFloat(String(rawData.change_pct_today ?? "0")) || 0,
      industryBoard: String(rawData.industry_board ?? "未分类"),
      strategyId,
      strategyName,
      items,
      summary,
      failCount,
      passCount,
    };

    return NextResponse.json(result);
  } catch (e) {
    console.error("诊断分析出错:", e);
    return NextResponse.json(
      { error: `分析失败：${(e as Error).message}` },
      { status: 500 },
    );
  }
}
