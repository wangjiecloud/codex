import { execFileSync } from "child_process";
import * as os from "os";
import * as path from "path";

import { chat, ChatMessage } from "../client";
import { AgentInput, FundamentalResult } from "../types";

const DB_PATH =
  process.env.STOCK_DB_PATH ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/stock-web/apps/data-service/stock_data.db",
  );

const SYSTEM_PROMPT = `你是专业的A股基本面分析专家，只能基于真实数据库数据回答，不得编造财务指标、机构预测或分红信息。

规则：
- 优先使用 F10 快照和机构预测数据。
- 若数据不足，明确写“数据不足”。
- 默认以判断为主，用户明确要数字时再强调具体值。`;

interface SnapshotRow {
  reportPeriod: string | null;
  peTtm: number | null;
  pb: number | null;
  roeWeighted: number | null;
  revenueYoy: number | null;
  netProfitYoy: number | null;
  grossMargin: number | null;
  debtRatio: number | null;
}

interface FundamentalRow {
  reportDate: string | null;
  roe: number | null;
  revenueYoy: number | null;
  netProfitYoy: number | null;
  debtRatio: number | null;
}

interface ForecastRow {
  year: string | null;
  rating: string | null;
  epsForecast: number | null;
}

interface DividendRow {
  reportPeriod: string | null;
  dividendPlan: string | null;
  status: string | null;
}

interface BusinessRow {
  businessReview: string | null;
  coreCompetence: string | null;
}

interface ProfileRow {
  mainBusiness: string | null;
  coreCompetence: string | null;
  industryBackground: string | null;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickNumber(...values: Array<number | null>): number | null {
  for (const value of values) {
    if (value != null) return value;
  }
  return null;
}

function fetchSnapshot(code: string): SnapshotRow | null {
  const rows = runSql<SnapshotRow>(`
    SELECT
      report_period AS reportPeriod,
      pe_ttm AS peTtm,
      pb,
      roe_weighted AS roeWeighted,
      revenue_yoy AS revenueYoy,
      net_profit_yoy AS netProfitYoy,
      gross_margin AS grossMargin,
      debt_ratio AS debtRatio
    FROM stock_f10_snapshot
    WHERE code = ${sqlString(code)}
    LIMIT 1;
  `);
  return rows[0] ?? null;
}

function fetchFundamental(code: string): FundamentalRow | null {
  const rows = runSql<FundamentalRow>(`
    SELECT
      report_date AS reportDate,
      roe,
      revenue_yoy AS revenueYoy,
      net_profit_yoy AS netProfitYoy,
      debt_ratio AS debtRatio
    FROM stock_fundamental
    WHERE code = ${sqlString(code)}
    ORDER BY report_date DESC
    LIMIT 1;
  `);
  return rows[0] ?? null;
}

function fetchForecasts(code: string): ForecastRow[] {
  return runSql<ForecastRow>(`
    SELECT year, rating, eps_forecast AS epsForecast
    FROM stock_f10_institution_forecast
    WHERE code = ${sqlString(code)}
    ORDER BY report_date DESC, year ASC
    LIMIT 12;
  `);
}

function fetchDividends(code: string): DividendRow[] {
  return runSql<DividendRow>(`
    SELECT report_period AS reportPeriod, dividend_plan AS dividendPlan, status
    FROM stock_f10_dividend_history
    WHERE code = ${sqlString(code)}
    ORDER BY announce_date DESC
    LIMIT 5;
  `);
}

function fetchBusiness(code: string): BusinessRow | null {
  const rows = runSql<BusinessRow>(`
    SELECT business_review AS businessReview, core_competence AS coreCompetence
    FROM stock_f10_business_analysis
    WHERE code = ${sqlString(code)}
    LIMIT 1;
  `);
  return rows[0] ?? null;
}

function fetchProfile(code: string): ProfileRow | null {
  const rows = runSql<ProfileRow>(`
    SELECT
      main_business AS mainBusiness,
      core_competence AS coreCompetence,
      industry_background AS industryBackground
    FROM stock_f10_company_profile
    WHERE code = ${sqlString(code)}
    LIMIT 1;
  `);
  return rows[0] ?? null;
}

function buildValuation(
  pe: number | null,
  pb: number | null,
): {
  valuation: FundamentalResult["valuation"];
  judge: string;
} {
  if (pe == null && pb == null) {
    return { valuation: "fair", judge: "估值数据不足" };
  }
  if ((pe != null && pe <= 15) || (pb != null && pb <= 1.5)) {
    return {
      valuation: "undervalued",
      judge: "当前估值处于偏低或合理偏低区间",
    };
  }
  if ((pe != null && pe >= 35) || (pb != null && pb >= 4)) {
    return {
      valuation: "overvalued",
      judge: "当前估值偏高，后续需要业绩持续兑现",
    };
  }
  return { valuation: "fair", judge: "当前估值大体处于合理区间" };
}

function buildProfitability(
  roe: number | null,
  grossMargin: number | null,
): string {
  if (roe == null && grossMargin == null) return "盈利能力数据不足";
  if (
    (roe != null && roe >= 15) ||
    (grossMargin != null && grossMargin >= 30)
  ) {
    return "盈利能力较强，核心利润质量具备一定支撑";
  }
  if ((roe != null && roe <= 8) || (grossMargin != null && grossMargin <= 15)) {
    return "盈利能力偏弱，利润质量仍需继续观察";
  }
  return "盈利能力整体中性，具备一定经营韧性";
}

function buildGrowth(
  revenueYoy: number | null,
  profitYoy: number | null,
): string {
  if (revenueYoy == null && profitYoy == null) return "成长性数据不足";
  if ((revenueYoy ?? -999) >= 20 || (profitYoy ?? -999) >= 20) {
    return "营收或利润保持较快增长，成长性偏强";
  }
  if ((revenueYoy ?? 999) < 0 || (profitYoy ?? 999) < 0) {
    return "营收或利润出现下滑，成长性承压";
  }
  return "成长性整体平稳，暂未看到明显加速或失速";
}

function buildCashflow(dividends: DividendRow[]): string {
  if (!dividends.length) return "现金流与股东回报数据不足";
  return "近年存在持续分红记录，经营现金流质量可结合分红延续性辅助判断";
}

function buildDebt(debtRatio: number | null): string {
  if (debtRatio == null) return "债务结构数据不足";
  if (debtRatio >= 65) return "资产负债率偏高，财务杠杆压力较大";
  if (debtRatio <= 35) return "资产负债率处于较稳健区间，债务压力可控";
  return "债务结构整体中性，需继续跟踪资产负债率变化";
}

function buildDividend(dividends: DividendRow[]): string {
  if (!dividends.length) return "分红记录不足，股东回报判断有限";
  const latest = dividends[0];
  return `近年存在分红记录，最新方案为${latest.dividendPlan ?? "数据不足"}，当前状态${latest.status ?? "未知"}`;
}

function buildInstitution(forecasts: ForecastRow[]): string {
  if (!forecasts.length) return "机构预测数据不足";
  const ratings = forecasts
    .map((row) => row.rating)
    .filter(Boolean) as string[];
  const buyLike = ratings.filter((rating) =>
    /买入|增持|推荐/.test(rating),
  ).length;
  if (buyLike >= Math.max(2, Math.floor(ratings.length / 2))) {
    return "机构观点整体偏积极，主流评级以买入或增持为主";
  }
  return "机构观点分化，需结合后续业绩兑现情况继续跟踪";
}

function buildAdvantages(
  profile: ProfileRow | null,
  business: BusinessRow | null,
): string[] {
  const values = [
    profile?.coreCompetence,
    profile?.mainBusiness,
    business?.coreCompetence,
    business?.businessReview,
  ]
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value));
  if (!values.length) return ["核心竞争力数据不足"];
  return values.slice(0, 3);
}

function buildRisks(params: {
  valuation: FundamentalResult["valuation"];
  profitYoy: number | null;
  debtRatio: number | null;
  forecasts: ForecastRow[];
}): string[] {
  const risks: string[] = [];
  if (params.valuation === "overvalued")
    risks.push("估值偏高，需警惕业绩兑现不及预期");
  if ((params.profitYoy ?? 999) < 0) risks.push("净利润同比下滑，短期业绩承压");
  if ((params.debtRatio ?? 0) >= 65)
    risks.push("资产负债率偏高，偿债和杠杆风险需关注");
  if (!params.forecasts.length)
    risks.push("机构预测覆盖不足，外部一致预期有限");
  if (!risks.length) risks.push("当前未见显著财务失衡，但仍需关注业绩波动");
  return risks.slice(0, 3);
}

function buildSummary(params: {
  stockName: string;
  valuationJudge: string;
  profitabilityJudge: string;
  growthJudge: string;
  debtJudge: string;
}): string {
  return `${params.stockName}当前基本面整体以${params.valuationJudge}为主，${params.profitabilityJudge}，${params.growthJudge}，同时${params.debtJudge}。`;
}

function emptyResult(stockName: string): FundamentalResult {
  return {
    healthScore: 50,
    valuation: "fair",
    valuationJudge: "估值数据不足",
    profitabilityJudge: "盈利能力数据不足",
    growthJudge: "成长性数据不足",
    cashflowJudge: "现金流数据不足",
    debtJudge: "债务数据不足",
    dividendJudge: "分红数据不足",
    institutionJudge: "机构预测数据不足",
    pe: null,
    pb: null,
    roe: null,
    revenueGrowth: null,
    profitGrowth: null,
    debtRatio: null,
    advantages: ["数据不足"],
    risks: ["缺少足够的基本面数据"],
    summary: `${stockName}缺少足够的基本面数据，暂无法给出可靠判断。`,
  };
}

export async function runFundamentalAgent(
  input: AgentInput,
): Promise<FundamentalResult> {
  const { code = "000001", stockName = "未知股票", question } = input;
  const wantsNumbers = Boolean(
    question && /多少|具体|数值|数字|百分之几|exact|number/i.test(question),
  );

  const snapshot = fetchSnapshot(code);
  const fallback = fetchFundamental(code);
  const forecasts = fetchForecasts(code);
  const dividends = fetchDividends(code);
  const business = fetchBusiness(code);
  const profile = fetchProfile(code);

  if (!snapshot && !fallback && !forecasts.length && !dividends.length) {
    return emptyResult(stockName);
  }

  const pe = pickNumber(toNumber(snapshot?.peTtm));
  const pb = pickNumber(toNumber(snapshot?.pb));
  const roe = pickNumber(
    toNumber(snapshot?.roeWeighted),
    toNumber(fallback?.roe),
  );
  const revenueGrowth = pickNumber(
    toNumber(snapshot?.revenueYoy),
    toNumber(fallback?.revenueYoy),
  );
  const profitGrowth = pickNumber(
    toNumber(snapshot?.netProfitYoy),
    toNumber(fallback?.netProfitYoy),
  );
  const debtRatio = pickNumber(
    toNumber(snapshot?.debtRatio),
    toNumber(fallback?.debtRatio),
  );
  const grossMargin = toNumber(snapshot?.grossMargin);

  const { valuation, judge: valuationJudge } = buildValuation(pe, pb);
  const profitabilityJudge = buildProfitability(roe, grossMargin);
  const growthJudge = buildGrowth(revenueGrowth, profitGrowth);
  const cashflowJudge = buildCashflow(dividends);
  const debtJudge = buildDebt(debtRatio);
  const dividendJudge = buildDividend(dividends);
  const institutionJudge = buildInstitution(forecasts);
  const advantages = buildAdvantages(profile, business);
  const risks = buildRisks({
    valuation,
    profitYoy: profitGrowth,
    debtRatio,
    forecasts,
  });

  let healthScore = 55;
  if ((roe ?? 0) >= 15) healthScore += 12;
  else if ((roe ?? 0) >= 10) healthScore += 6;
  else if ((roe ?? 0) > 0) healthScore += 2;
  if ((profitGrowth ?? -999) >= 20) healthScore += 10;
  else if ((profitGrowth ?? -999) >= 0) healthScore += 4;
  else healthScore -= 8;
  if ((revenueGrowth ?? -999) >= 15) healthScore += 8;
  else if ((revenueGrowth ?? -999) < 0) healthScore -= 6;
  if ((debtRatio ?? 50) <= 35) healthScore += 8;
  else if ((debtRatio ?? 50) >= 65) healthScore -= 10;
  if (forecasts.length > 0) healthScore += 4;
  if (valuation === "overvalued") healthScore -= 6;
  if (valuation === "undervalued") healthScore += 4;
  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
    healthScore,
    valuation,
    valuationJudge,
    profitabilityJudge,
    growthJudge,
    cashflowJudge,
    debtJudge,
    dividendJudge,
    institutionJudge,
    pe: wantsNumbers ? pe : null,
    pb: wantsNumbers ? pb : null,
    roe: wantsNumbers ? roe : null,
    revenueGrowth: wantsNumbers ? revenueGrowth : null,
    profitGrowth: wantsNumbers ? profitGrowth : null,
    debtRatio: wantsNumbers ? debtRatio : null,
    advantages,
    risks,
    summary: buildSummary({
      stockName,
      valuationJudge,
      profitabilityJudge,
      growthJudge,
      debtJudge,
    }),
  };
}

export async function fundamentalChat(
  question: string,
  code?: string,
  stockName?: string,
): Promise<string> {
  if (code) {
    const result = await runFundamentalAgent({ code, stockName, question });
    return `${stockName ?? code}（${code}）基本面分析：${result.summary}\n优势：${result.advantages.join("；")}\n风险：${result.risks.join("；")}`;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];
  return chat(messages);
}
