// All agent output type definitions

export interface DataCollectorResult {
  code: string;
  name: string;
  price: number;
  change: number;
  changeAmt: number;
  open: number;
  prevClose: number;
  high: number;
  low: number;
  volume: string;
  turnover: string;
  marketCap: string;
  pe: string;
  pb: string;
  roe: string;
  revenue: string;
  netProfit: string;
  recentNews: string[];
  summary: string;
}

export interface TechnicalResult {
  trend: "bullish" | "bearish" | "neutral";
  score: number; // 0-100
  ma: { ma5: number; ma10: number; ma20: number; ma60: number; signal: string };
  macd: { value: number; signal: number; hist: number; crossType: string };
  rsi: { value: number; signal: string };
  kdj: { k: number; d: number; j: number; signal: string };
  boll: { upper: number; middle: number; lower: number; position: string };
  rightSide: {
    stance: "favorable" | "watch" | "avoid";
    pattern: "breakout_follow" | "pullback_confirm" | "no_chase" | "wait";
    patternLabel: string;
    signal: string;
    reason: string;
    triggers: string[];
    risk: string;
  };
  summary: string;
  signals: string[];
  sector: {
    boardCode: string;
    boardName: string;
    matchedBoardCount: number;
    selectionReason: string;
    trend: "bullish" | "bearish" | "neutral";
    score: number;
    ma: {
      ma5: number;
      ma10: number;
      ma20: number;
      ma60: number;
      signal: string;
    };
    macd: { value: number; signal: number; hist: number; crossType: string };
    rsi: { value: number; signal: string };
    kdj: { k: number; d: number; j: number; signal: string };
    boll: { upper: number; middle: number; lower: number; position: string };
    summary: string;
    signals: string[];
  } | null;
}

export interface FundamentalResult {
  healthScore: number; // 0-100 财务健康度
  valuation: "undervalued" | "fair" | "overvalued";
  // 判断性描述（默认输出这些，不直接给数字）
  valuationJudge: string; // 估值水平判断总结
  profitabilityJudge: string; // 盈利能力判断
  growthJudge: string; // 成长性判断
  cashflowJudge: string; // 现金流判断
  debtJudge: string; // 债务风险判断
  dividendJudge: string; // 股东回报/分红判断
  institutionJudge: string; // 机构观点判断
  // 具体数值（仅用户明确要求时填写，否则 null）
  pe: number | null;
  pb: number | null;
  roe: number | null;
  revenueGrowth: number | null;
  profitGrowth: number | null;
  debtRatio: number | null;
  // 结构化输出
  advantages: string[];
  risks: string[];
  summary: string; // 综合判断总结（重点给结论和投资逻辑）
}

export interface NewsSentimentResult {
  sentiment: "positive" | "neutral" | "negative";
  score: number; // 0-100, 50=neutral
  newsCount: number;
  keyTopics: string[];
  positivePoints: string[];
  negativePoints: string[];
  summary: string;
}

export interface AdvisorResult {
  action: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
  confidence: number; // 0-100
  targetPrice: number;
  stopLoss: number;
  positionSuggestion: string;
  timeHorizon: string;
  reasons: string[];
  risks: string[];
  summary: string;
  overallScore: number; // 0-100
}

export interface TeamAnalysisResult {
  code: string;
  stockName: string;
  analyzedAt: string;
  data: DataCollectorResult;
  technical: TechnicalResult;
  fundamental: FundamentalResult;
  news: NewsSentimentResult;
  advice: AdvisorResult;
}

export interface AgentInput {
  code?: string;
  stockName?: string;
  question?: string;
  context?: Partial<TeamAnalysisResult>;
}
