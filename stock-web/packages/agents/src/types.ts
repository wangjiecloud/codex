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
  summary: string;
  signals: string[];
}

export interface FundamentalResult {
  healthScore: number; // 0-100
  valuation: "undervalued" | "fair" | "overvalued";
  pe: number;
  pb: number;
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  debtRatio: number;
  cashFlowStatus: string;
  advantages: string[];
  risks: string[];
  summary: string;
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

export interface RiskResult {
  riskLevel: "low" | "medium" | "high" | "very_high";
  score: number; // 0-100, higher=riskier
  volatility: string;
  maxDrawdown: string;
  betaCoefficient: number;
  systemicRisk: string;
  specificRisks: string[];
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
  risk: RiskResult;
  advice: AdvisorResult;
}

export interface AgentInput {
  code?: string;
  stockName?: string;
  question?: string;
  context?: Partial<TeamAnalysisResult>;
}
