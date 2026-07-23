import { execFileSync } from "child_process";
import * as os from "os";
import * as path from "path";

import { chat, ChatMessage } from "../client";
import { AgentInput, TechnicalResult } from "../types";

const DB_PATH =
  process.env.STOCK_DB_PATH ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/stock-web/apps/data-service/stock_data.db",
  );

const SYSTEM_PROMPT = `你是专业的A股技术分析专家，必须基于真实行情数据进行分析，不得编造任何技术指标数值。

你的分析框架必须覆盖以下维度：
1. 趋势：日线趋势、均线排列、短中期强弱、关键支撑阻力。
2. 动量：MACD、RSI、KDJ 的方向、金叉死叉、背离风险。
3. 波动：布林带位置、振幅、是否进入趋势扩张或收敛阶段。
4. 量价：成交量、换手率、放量突破或缩量回踩是否成立。
5. 市场环境：如提供市场宽度、大盘或板块背景，需要说明个股信号是否得到环境确认。

规则：
- 数值必须来自数据库已有字段或确定性公式计算结果。
- 你只负责解释结构化指标，不负责臆造指标值。
- 若某项指标缺少足够数据，必须明确指出“数据不足”，不能脑补。
- 分析风格偏右侧交易，且采用严格过滤原则：宁可错过，不做左侧抄底，不在趋势未确认时给偏积极结论。
- 输出用中文，结论直接，重点说明趋势、信号、风险与确认条件。`;

interface QuoteRow {
  price: number | null;
  change: number | null;
  turnoverRate: number | null;
  amplitude: number | null;
}

interface KlineRow {
  tradeDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  turnover: number | null;
  changePct: number | null;
  turnRate: number | null;
}

interface IndicatorRow {
  tradeDate: string;
  kdjK: number | null;
  kdjD: number | null;
  kdjJ: number | null;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  macdDiff: number | null;
  macdDea: number | null;
  macdHist: number | null;
  rsi14: number | null;
  bollUpper: number | null;
  bollMiddle: number | null;
  bollLower: number | null;
}

interface SwBoardRow {
  boardCode: string;
  boardName: string;
  price: number | null;
}

interface SectorCandidate {
  boardCode: string;
  boardName: string;
  matchedBoardCount: number;
  selectionReason: string;
  trend: TechnicalResult["trend"];
  score: number;
  ma: TechnicalResult["ma"];
  macd: TechnicalResult["macd"];
  rsi: TechnicalResult["rsi"];
  kdj: TechnicalResult["kdj"];
  boll: TechnicalResult["boll"];
  rightSide: TechnicalResult["rightSide"];
  summary: string;
  signals: string[];
}

interface TechnicalSnapshot {
  trend: TechnicalResult["trend"];
  score: number;
  ma: TechnicalResult["ma"];
  macd: TechnicalResult["macd"];
  rsi: TechnicalResult["rsi"];
  kdj: TechnicalResult["kdj"];
  boll: TechnicalResult["boll"];
  rightSide: TechnicalResult["rightSide"];
  summary: string;
  signals: string[];
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pickIndicatorValue(
  value: number | string | null | undefined,
  fallback: number,
  useIndicator: boolean,
): number {
  if (!useIndicator) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function runSql<T>(sql: string): T[] {
  try {
    const raw = execFileSync("sqlite3", ["-json", DB_PATH, sql], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function fetchQuote(code: string): QuoteRow | null {
  const rows = runSql<QuoteRow>(`
    SELECT
      price,
      change,
      turnover_rate AS turnoverRate,
      amplitude
    FROM stock_quote
    WHERE code = ${sqlString(code)}
    LIMIT 1;
  `);
  return rows[0] ?? null;
}

function fetchDailyKlines(code: string, limit = 180): KlineRow[] {
  const rows = runSql<KlineRow>(`
    SELECT
      trade_date AS tradeDate,
      open,
      high,
      low,
      close,
      volume,
      turnover,
      change_pct AS changePct,
      turn_rate AS turnRate
    FROM stock_kline
    WHERE code = ${sqlString(code)} AND period = 'daily'
    ORDER BY trade_date DESC
    LIMIT ${limit};
  `);
  return rows.reverse();
}

function fetchLatestIndicator(code: string): IndicatorRow | null {
  const rows = runSql<IndicatorRow>(`
    SELECT
      trade_date AS tradeDate,
      kdj_k AS kdjK,
      kdj_d AS kdjD,
      kdj_j AS kdjJ,
      ma5,
      ma10,
      ma20,
      ma60,
      macd_diff AS macdDiff,
      macd_dea AS macdDea,
      macd_hist AS macdHist,
      rsi14,
      boll_upper AS bollUpper,
      boll_middle AS bollMiddle,
      boll_lower AS bollLower
    FROM stock_indicator
    WHERE code = ${sqlString(code)} AND period = 'daily'
    ORDER BY trade_date DESC
    LIMIT 1;
  `);
  return rows[0] ?? null;
}

function fetchSwBoardsByStock(code: string): SwBoardRow[] {
  return runSql<SwBoardRow>(`
    SELECT
      s.code AS boardCode,
      s.name AS boardName,
      s.price AS price
    FROM sw_industry_constituent c
    JOIN sw_industry s ON s.code = c.board_code
    WHERE c.stock_code = ${sqlString(code)}
    ORDER BY s.code ASC
  `);
}

function describeSectorSelection(params: {
  boardName: string;
  matchedBoardCount: number;
  boardTrend: TechnicalResult["trend"];
  boardScore: number;
  stockTrend: TechnicalResult["trend"];
}): string {
  const { boardName, matchedBoardCount, boardTrend, boardScore, stockTrend } =
    params;
  if (matchedBoardCount <= 1) {
    return `唯一匹配到的申万板块 ${boardName}`;
  }
  if (boardTrend === stockTrend && stockTrend !== "neutral") {
    return `在${matchedBoardCount}个申万板块中，${boardName} 与个股趋势共振且评分最高`;
  }
  if (boardTrend === stockTrend) {
    return `在${matchedBoardCount}个申万板块中，${boardName} 与个股趋势一致且评分最高`;
  }
  return `在${matchedBoardCount}个申万板块中，${boardName} 技术评分最高（${boardScore}）`;
}

function pickBestSectorCandidate(
  stockTrend: TechnicalResult["trend"],
  candidates: Omit<SectorCandidate, "matchedBoardCount" | "selectionReason">[],
): SectorCandidate | null {
  if (!candidates.length) return null;
  const matchedBoardCount = candidates.length;
  const sorted = [...candidates].sort((a, b) => {
    const aResonance =
      a.trend === stockTrend && stockTrend !== "neutral" ? 1 : 0;
    const bResonance =
      b.trend === stockTrend && stockTrend !== "neutral" ? 1 : 0;
    if (bResonance !== aResonance) return bResonance - aResonance;

    const aSameTrend = a.trend === stockTrend ? 1 : 0;
    const bSameTrend = b.trend === stockTrend ? 1 : 0;
    if (bSameTrend !== aSameTrend) return bSameTrend - aSameTrend;

    if (b.score !== a.score) return b.score - a.score;
    return a.boardCode.localeCompare(b.boardCode);
  });

  const best = sorted[0];
  return {
    ...best,
    matchedBoardCount,
    selectionReason: describeSectorSelection({
      boardName: best.boardName,
      matchedBoardCount,
      boardTrend: best.trend,
      boardScore: best.score,
      stockTrend,
    }),
  };
}

function calcMA(closes: number[], period: number): number[] {
  return closes.map((_, i) => {
    const start = Math.max(0, i - period + 1);
    const slice = closes.slice(start, i + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

function calcMACD(
  closes: number[],
): { diff: number; dea: number; hist: number }[] {
  if (!closes.length) return [];
  const k = (period: number) => 2 / (period + 1);
  const ema12: number[] = [];
  const ema26: number[] = [];

  closes.forEach((close, i) => {
    if (i === 0) {
      ema12.push(close);
      ema26.push(close);
      return;
    }
    ema12.push(close * k(12) + ema12[i - 1] * (1 - k(12)));
    ema26.push(close * k(26) + ema26[i - 1] * (1 - k(26)));
  });

  const diffs = ema12.map((value, i) => value - ema26[i]);
  const deas: number[] = [];
  diffs.forEach((value, i) => {
    if (i === 0) {
      deas.push(value);
      return;
    }
    deas.push(value * k(9) + deas[i - 1] * (1 - k(9)));
  });

  return diffs.map((diff, i) => ({
    diff,
    dea: deas[i],
    hist: (diff - deas[i]) * 2,
  }));
}

function calcRSI(closes: number[], period = 14): number[] {
  if (closes.length === 0) return [];
  const result: number[] = [50];

  for (let i = 1; i < closes.length; i += 1) {
    const start = Math.max(1, i - period + 1);
    let gains = 0;
    let losses = 0;
    for (let j = start; j <= i; j += 1) {
      const diff = closes[j] - closes[j - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const range = i - start + 1;
    const avgGain = gains / range;
    const avgLoss = losses / range;
    if (avgLoss === 0) {
      result.push(100);
      continue;
    }
    const rs = avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }

  return result;
}

function calcBoll(
  closes: number[],
  period = 20,
  multiplier = 2,
): { upper: number; middle: number; lower: number }[] {
  return closes.map((_, i) => {
    const start = Math.max(0, i - period + 1);
    const slice = closes.slice(start, i + 1);
    const middle = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    const variance =
      slice.reduce((sum, value) => sum + (value - middle) ** 2, 0) /
      slice.length;
    const std = Math.sqrt(variance);
    return {
      upper: middle + multiplier * std,
      middle,
      lower: middle - multiplier * std,
    };
  });
}

function calcKDJ(
  highs: number[],
  lows: number[],
  closes: number[],
): { k: number; d: number; j: number }[] {
  if (!closes.length) return [];
  let k = 50;
  let d = 50;
  return closes.map((close, i) => {
    const start = Math.max(0, i - 8);
    const high = Math.max(...highs.slice(start, i + 1));
    const low = Math.min(...lows.slice(start, i + 1));
    const rsv = high === low ? 50 : ((close - low) / (high - low)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
    return { k, d, j: 3 * k - 2 * d };
  });
}

function buildMaSignal(
  price: number,
  ma5: number,
  ma10: number,
  ma20: number,
  ma60: number,
): string {
  if (price > ma5 && ma5 > ma10 && ma10 > ma20 && ma20 > ma60) {
    return "价格站稳短中长期均线之上，均线呈多头排列";
  }
  if (price < ma5 && ma5 < ma10 && ma10 < ma20 && ma20 < ma60) {
    return "价格跌破短中长期均线，均线呈空头排列";
  }
  if (price > ma20 && ma5 > ma10) {
    return "短线均线偏强，价格运行在中期均线之上";
  }
  if (price < ma20 && ma5 < ma10) {
    return "短线均线承压，价格运行在中期均线之下";
  }
  return "均线结构分化，短线方向仍需等待确认";
}

function buildMacdSignal(
  current: { diff: number; dea: number; hist: number },
  previous: { diff: number; dea: number; hist: number } | undefined,
): string {
  if (previous && previous.diff <= previous.dea && current.diff > current.dea) {
    return "金叉";
  }
  if (previous && previous.diff >= previous.dea && current.diff < current.dea) {
    return "死叉";
  }
  if (current.hist > 0 && (!previous || current.hist >= previous.hist)) {
    return "持续上行";
  }
  if (current.hist < 0 && (!previous || current.hist <= previous.hist)) {
    return "持续下行";
  }
  return "震荡";
}

function buildRsiSignal(rsi: number): string {
  if (rsi >= 70) return "超买区间";
  if (rsi <= 30) return "超卖区间";
  if (rsi >= 60) return "中性偏强";
  if (rsi <= 40) return "中性偏弱";
  return "中性区间";
}

function buildKdjSignal(
  current: { k: number; d: number; j: number },
  previous: { k: number; d: number; j: number } | undefined,
): string {
  if (current.k >= 80 && current.d >= 80) return "高位钝化";
  if (current.k <= 20 && current.d <= 20) return "低位钝化";
  if (previous && previous.k <= previous.d && current.k > current.d)
    return "金叉";
  if (previous && previous.k >= previous.d && current.k < current.d)
    return "死叉";
  return current.k >= current.d ? "偏强区间" : "偏弱区间";
}

function buildBollPosition(
  price: number,
  boll: { upper: number; middle: number; lower: number },
): string {
  if (price >= boll.upper) return "价格贴近或突破上轨，短线偏强但需警惕过热";
  if (price <= boll.lower) return "价格贴近或跌破下轨，短线偏弱或存在超跌";
  if (price >= boll.middle) return "价格运行在中轨上方，趋势仍偏强";
  return "价格运行在中轨下方，趋势仍偏弱";
}

function buildSignals(params: {
  price: number;
  ma20: number;
  ma60: number;
  macdCrossType: string;
  rsiValue: number;
  kdjSignal: string;
  bollUpper: number;
  bollLower: number;
  turnoverRate: number;
}): string[] {
  const signals: string[] = [];
  if (params.price > params.ma20 && params.price > params.ma60) {
    signals.push("价格位于 MA20 和 MA60 上方，中期趋势维持偏强");
  } else if (params.price < params.ma20 && params.price < params.ma60) {
    signals.push("价格位于 MA20 和 MA60 下方，中期趋势维持偏弱");
  }

  if (params.macdCrossType === "金叉" || params.macdCrossType === "死叉") {
    signals.push(`MACD 出现${params.macdCrossType}，短线动能正在切换`);
  } else if (params.macdCrossType === "持续上行") {
    signals.push("MACD 红柱延续，动能仍在修复和放大");
  } else if (params.macdCrossType === "持续下行") {
    signals.push("MACD 绿柱延续，短线动能仍偏弱");
  }

  if (params.rsiValue >= 70) {
    signals.push("RSI 进入超买区，追涨需要等待回踩确认");
  } else if (params.rsiValue <= 30) {
    signals.push("RSI 进入超卖区，可关注止跌反弹信号");
  }

  if (params.kdjSignal === "金叉" || params.kdjSignal === "死叉") {
    signals.push(`KDJ 出现${params.kdjSignal}，短线拐点信号增强`);
  }

  if (params.price >= params.bollUpper) {
    signals.push("价格靠近布林上轨，趋势强但波动放大");
  } else if (params.price <= params.bollLower) {
    signals.push("价格靠近布林下轨，注意超跌反抽或继续破位");
  }

  if (params.turnoverRate > 0) {
    signals.push(
      `最新换手率约 ${round(params.turnoverRate, 2)}%，可结合量价确认趋势持续性`,
    );
  }

  return signals.slice(0, 5);
}

function buildSummary(params: {
  stockName: string;
  trend: TechnicalResult["trend"];
  maSignal: string;
  macdCrossType: string;
  rsiSignal: string;
  kdjSignal: string;
  bollPosition: string;
  rightSideSignal: string;
}): string {
  const trendText =
    params.trend === "bullish"
      ? "整体偏多"
      : params.trend === "bearish"
        ? "整体偏弱"
        : "整体震荡中性";

  return `${params.stockName}技术面${trendText}，${params.maSignal}；MACD ${params.macdCrossType}，RSI 处于${params.rsiSignal}，KDJ 为${params.kdjSignal}，${params.bollPosition}。右侧交易判断：${params.rightSideSignal}。`;
}

function buildRightSideAssessment(params: {
  price: number;
  ma20: number;
  ma60: number;
  macdHist: number;
  macdCrossType: string;
  rsiValue: number;
  kdjSignal: string;
  turnoverRate: number;
  trend: TechnicalResult["trend"];
  sectorTrend?: TechnicalResult["trend"];
  sectorScore?: number;
}): TechnicalResult["rightSide"] {
  const aboveMa20 = params.price > params.ma20;
  const aboveMa60 = params.price > params.ma60;
  const trendConfirmed = aboveMa20 && aboveMa60;
  const momentumConfirmed =
    params.macdHist > 0 &&
    (params.macdCrossType === "金叉" ||
      params.macdCrossType === "持续上行" ||
      params.kdjSignal === "金叉" ||
      params.kdjSignal === "偏强区间");
  const turnoverConfirmed = params.turnoverRate >= 2;
  const sectorConfirmed =
    params.sectorTrend == null
      ? true
      : params.sectorTrend === "bullish" && (params.sectorScore ?? 0) >= 60;
  const overheated = params.rsiValue >= 75;
  const strongTrend =
    params.trend === "bullish" && aboveMa20 && aboveMa60 && params.macdHist > 0;
  const earlyBreakout =
    strongTrend &&
    turnoverConfirmed &&
    sectorConfirmed &&
    (params.macdCrossType === "金叉" || params.kdjSignal === "金叉");
  const trendPullbackReady =
    strongTrend && !turnoverConfirmed && sectorConfirmed && !overheated;

  if (
    trendConfirmed &&
    momentumConfirmed &&
    turnoverConfirmed &&
    sectorConfirmed &&
    !overheated
  ) {
    const isBreakoutFollow = earlyBreakout;
    return {
      stance: "favorable",
      pattern: isBreakoutFollow ? "breakout_follow" : "pullback_confirm",
      patternLabel: isBreakoutFollow ? "突破跟随" : "回踩确认",
      signal: "可考虑右侧跟随",
      reason:
        "趋势已站上中期与长期均线，动量转强且量价具备确认，板块环境也基本配合，更符合严格过滤后的右侧参与条件。",
      triggers: [
        "回踩 MA20 或突破位后企稳再考虑跟随",
        "下一次放量上攻时不能明显缩量转弱",
        "所属板块继续维持强势，不出现同步走弱",
      ],
      risk: "若重新跌回 MA20/MA60 下方，或 MACD 再度走弱，应视为右侧条件被破坏。",
    };
  }

  if (trendConfirmed && momentumConfirmed && !overheated) {
    return {
      stance: "watch",
      pattern: trendPullbackReady ? "pullback_confirm" : "wait",
      patternLabel: trendPullbackReady ? "回踩确认" : "继续等待",
      signal: "先观察，不急于右侧跟进",
      reason:
        "趋势和动量已有改善，但量价确认或板块共振仍不够完整，按严格右侧交易标准还差最后一步确认。",
      triggers: [
        turnoverConfirmed
          ? "等待板块进一步共振走强"
          : "等待放量确认，不做无量突破",
        "关注回踩 MA20 后是否缩量企稳",
        "MACD 红柱需继续放大，避免一日脉冲后回落",
      ],
      risk: "如果确认不足就提前介入，容易演变成震荡追高，回撤容错会明显变差。",
    };
  }

  return {
    stance: "avoid",
    pattern: overheated && strongTrend ? "no_chase" : "wait",
    patternLabel: overheated && strongTrend ? "禁止追高" : "继续等待",
    signal: "不符合右侧交易条件",
    reason:
      "当前趋势、动量、量价或板块环境至少有一项未完成确认，按严格过滤型右侧交易，不应把这类位置当成有效介入点。",
    triggers: [
      "先等价格重新站稳 MA20 和 MA60",
      "等待 MACD/KDJ 至少一项重新转强",
      "等待板块重新转强或个股出现放量确认",
    ],
    risk: "此时贸然参与更接近左侧博弈，容易在反弹失败或板块拖累中承受被动回撤。",
  };
}

function analyzeTechnicalSnapshot(params: {
  stockName: string;
  price: number;
  turnoverRate: number;
  klines: KlineRow[];
  indicator: IndicatorRow | null;
  sectorTrend?: TechnicalResult["trend"];
  sectorScore?: number;
}): TechnicalSnapshot {
  const {
    stockName,
    price,
    turnoverRate,
    klines,
    indicator,
    sectorTrend,
    sectorScore,
  } = params;
  const closes = klines.map((row) => toNumber(row.close));
  const highs = klines.map((row) => toNumber(row.high));
  const lows = klines.map((row) => toNumber(row.low));

  const ma5Series = calcMA(closes, 5);
  const ma10Series = calcMA(closes, 10);
  const ma20Series = calcMA(closes, 20);
  const ma60Series = calcMA(closes, 60);
  const macdSeries = calcMACD(closes);
  const rsiSeries = calcRSI(closes);
  const bollSeries = calcBoll(closes);
  const kdjSeries = calcKDJ(highs, lows, closes);

  const latestTradeDate = klines[klines.length - 1]?.tradeDate;
  const indicatorIsFresh = indicator?.tradeDate === latestTradeDate;
  const ma5 = pickIndicatorValue(
    indicator?.ma5,
    ma5Series[ma5Series.length - 1] || 0,
    indicatorIsFresh,
  );
  const ma10 = pickIndicatorValue(
    indicator?.ma10,
    ma10Series[ma10Series.length - 1] || 0,
    indicatorIsFresh,
  );
  const ma20 = pickIndicatorValue(
    indicator?.ma20,
    ma20Series[ma20Series.length - 1] || 0,
    indicatorIsFresh,
  );
  const ma60 = pickIndicatorValue(
    indicator?.ma60,
    ma60Series[ma60Series.length - 1] || 0,
    indicatorIsFresh,
  );

  const fallbackMacd = macdSeries[macdSeries.length - 1] ?? {
    diff: 0,
    dea: 0,
    hist: 0,
  };
  const macd = {
    diff: pickIndicatorValue(
      indicator?.macdDiff,
      fallbackMacd.diff,
      indicatorIsFresh,
    ),
    dea: pickIndicatorValue(
      indicator?.macdDea,
      fallbackMacd.dea,
      indicatorIsFresh,
    ),
    hist: pickIndicatorValue(
      indicator?.macdHist,
      fallbackMacd.hist,
      indicatorIsFresh,
    ),
  };
  const prevMacd = macdSeries[macdSeries.length - 2];
  const rsiValue = pickIndicatorValue(
    indicator?.rsi14,
    rsiSeries[rsiSeries.length - 1] || 0,
    indicatorIsFresh,
  );
  const fallbackBoll = bollSeries[bollSeries.length - 1] ?? {
    upper: price,
    middle: price,
    lower: price,
  };
  const boll = {
    upper: pickIndicatorValue(
      indicator?.bollUpper,
      fallbackBoll.upper,
      indicatorIsFresh,
    ),
    middle: pickIndicatorValue(
      indicator?.bollMiddle,
      fallbackBoll.middle,
      indicatorIsFresh,
    ),
    lower: pickIndicatorValue(
      indicator?.bollLower,
      fallbackBoll.lower,
      indicatorIsFresh,
    ),
  };
  const currentKdj =
    indicatorIsFresh &&
    indicator?.kdjK != null &&
    indicator?.kdjD != null &&
    indicator?.kdjJ != null
      ? {
          k: toNumber(indicator.kdjK),
          d: toNumber(indicator.kdjD),
          j: toNumber(indicator.kdjJ),
        }
      : (kdjSeries[kdjSeries.length - 1] ?? { k: 0, d: 0, j: 0 });
  const prevKdj = kdjSeries[kdjSeries.length - 2];

  const maSignal = buildMaSignal(price, ma5, ma10, ma20, ma60);
  const macdCrossType = buildMacdSignal(macd, prevMacd);
  const rsiSignal = buildRsiSignal(rsiValue);
  const kdjSignal = buildKdjSignal(currentKdj, prevKdj);
  const bollPosition = buildBollPosition(price, boll);

  let score = 50;
  score += price > ma20 ? 8 : -8;
  score += price > ma60 ? 8 : -8;
  score += ma5 > ma10 ? 6 : -6;
  score += ma10 > ma20 ? 6 : -6;
  score += macd.hist > 0 ? 10 : -10;
  score += macdCrossType === "金叉" ? 8 : 0;
  score += macdCrossType === "死叉" ? -8 : 0;
  score += rsiValue >= 45 && rsiValue <= 65 ? 4 : 0;
  score += rsiValue > 70 ? -4 : 0;
  score += rsiValue < 30 ? 4 : 0;
  score += currentKdj.k >= currentKdj.d ? 4 : -4;
  score += price >= boll.middle ? 4 : -4;
  score = clamp(score, 0, 100);

  const trend: TechnicalResult["trend"] =
    score >= 60 ? "bullish" : score <= 40 ? "bearish" : "neutral";

  const signals = buildSignals({
    price,
    ma20,
    ma60,
    macdCrossType,
    rsiValue,
    kdjSignal,
    bollUpper: boll.upper,
    bollLower: boll.lower,
    turnoverRate,
  });

  const rightSide = buildRightSideAssessment({
    price,
    ma20,
    ma60,
    macdHist: macd.hist,
    macdCrossType,
    rsiValue,
    kdjSignal,
    turnoverRate,
    trend,
    sectorTrend,
    sectorScore,
  });

  return {
    trend,
    score,
    ma: {
      ma5: round(ma5),
      ma10: round(ma10),
      ma20: round(ma20),
      ma60: round(ma60),
      signal: maSignal,
    },
    macd: {
      value: round(macd.diff),
      signal: round(macd.dea),
      hist: round(macd.hist),
      crossType: macdCrossType,
    },
    rsi: {
      value: round(rsiValue, 2),
      signal: rsiSignal,
    },
    kdj: {
      k: round(currentKdj.k, 2),
      d: round(currentKdj.d, 2),
      j: round(currentKdj.j, 2),
      signal: kdjSignal,
    },
    boll: {
      upper: round(boll.upper),
      middle: round(boll.middle),
      lower: round(boll.lower),
      position: bollPosition,
    },
    rightSide,
    summary: buildSummary({
      stockName,
      trend,
      maSignal,
      macdCrossType,
      rsiSignal,
      kdjSignal,
      bollPosition,
      rightSideSignal: rightSide.signal,
    }),
    signals: [rightSide.reason, ...signals].slice(0, 5),
  };
}

function emptyResult(stockName: string): TechnicalResult {
  return {
    trend: "neutral",
    score: 0,
    ma: { ma5: 0, ma10: 0, ma20: 0, ma60: 0, signal: "暂无足够K线数据" },
    macd: { value: 0, signal: 0, hist: 0, crossType: "数据不足" },
    rsi: { value: 0, signal: "数据不足" },
    kdj: { k: 0, d: 0, j: 0, signal: "数据不足" },
    boll: { upper: 0, middle: 0, lower: 0, position: "数据不足" },
    rightSide: {
      stance: "avoid",
      pattern: "wait",
      patternLabel: "继续等待",
      signal: "不符合右侧交易条件",
      reason: "当前缺少足够日线数据，无法验证趋势确认、量价确认与板块共振。",
      triggers: ["等待更多有效日线数据后再评估"],
      risk: "数据不足时贸然执行右侧交易判断，容易把噪音误判成趋势确认。",
    },
    summary: `${stockName}暂无足够的日线数据，无法完成可靠的技术分析。`,
    signals: ["至少需要近期日线K线数据后才能计算技术指标"],
    sector: null,
  };
}

export async function runTechnicalAgent(
  input: AgentInput,
): Promise<TechnicalResult> {
  const { code = "000001", stockName = "未知股票" } = input;

  const klines = fetchDailyKlines(code);
  if (klines.length < 30) {
    return emptyResult(stockName);
  }

  const quote = fetchQuote(code);
  const indicator = fetchLatestIndicator(code);
  const price =
    toNumber(quote?.price) || toNumber(klines[klines.length - 1]?.close);
  const baseMain = analyzeTechnicalSnapshot({
    stockName,
    price,
    turnoverRate: toNumber(quote?.turnoverRate),
    klines,
    indicator,
  });

  const swBoards = fetchSwBoardsByStock(code);
  let sector: TechnicalResult["sector"] = null;
  if (swBoards.length > 0) {
    const candidates: Omit<
      SectorCandidate,
      "matchedBoardCount" | "selectionReason"
    >[] = [];
    swBoards.forEach((swBoard) => {
      const boardKlines = fetchDailyKlines(swBoard.boardCode);
      if (boardKlines.length < 30) return;
      const boardIndicator = fetchLatestIndicator(swBoard.boardCode);
      const boardPrice =
        toNumber(swBoard.price) ||
        toNumber(boardKlines[boardKlines.length - 1]?.close);
      const boardResult = analyzeTechnicalSnapshot({
        stockName: swBoard.boardName,
        price: boardPrice,
        turnoverRate: 0,
        klines: boardKlines,
        indicator: boardIndicator,
      });
      candidates.push({
        boardCode: swBoard.boardCode,
        boardName: swBoard.boardName,
        ...boardResult,
      });
    });
    sector = pickBestSectorCandidate(baseMain.trend, candidates);
  }

  const main = analyzeTechnicalSnapshot({
    stockName,
    price,
    turnoverRate: toNumber(quote?.turnoverRate),
    klines,
    indicator,
    sectorTrend: sector?.trend,
    sectorScore: sector?.score,
  });

  const sectorSummary =
    sector == null
      ? null
      : sector.matchedBoardCount > 1
        ? `${sector.selectionReason}。${sector.summary}`
        : sector.summary;

  const sectorSignal =
    sector == null
      ? null
      : sector.matchedBoardCount > 1
        ? `优选申万板块${sector.boardName}，评分 ${sector.score}`
        : `所属申万板块${sector.boardName}评分 ${sector.score}`;

  return {
    ...main,
    summary: sectorSummary
      ? `${main.summary} 所属申万板块也需要一起看，${sectorSummary}`
      : main.summary,
    signals: sectorSignal
      ? [...main.signals, sectorSignal, ...main.rightSide.triggers].slice(0, 6)
      : main.signals,
    sector: sector
      ? {
          ...sector,
          summary: sectorSummary,
        }
      : null,
  };
}

export async function technicalChat(
  question: string,
  code?: string,
  stockName?: string,
): Promise<string> {
  if (code) {
    const result = await runTechnicalAgent({ code, stockName, question });
    const sectorText = result.sector
      ? `\n板块分析：${result.sector.boardName}（${result.sector.boardCode}），评分 ${result.sector.score}，${result.sector.summary}`
      : "";
    return `${stockName ?? code}（${code}）技术分析：${result.summary}\n综合评分：${result.score}\n右侧交易类型：${result.rightSide.patternLabel}\n右侧交易：${result.rightSide.signal}；${result.rightSide.reason}\n右侧触发条件：${result.rightSide.triggers.join("；")}\n风险提示：${result.rightSide.risk}\n重点信号：${result.signals.join("；")}${sectorText}`;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];
  return chat(messages);
}
