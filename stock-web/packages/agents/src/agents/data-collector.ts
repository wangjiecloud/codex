import { execFileSync } from "child_process";
import * as os from "os";
import * as path from "path";

import { chat, ChatMessage } from "../client";
import { AgentInput, DataCollectorResult } from "../types";

const DB_PATH =
  process.env.STOCK_DB_PATH ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/stock-web/apps/data-service/stock_data.db",
  );

const SYSTEM_PROMPT = `你是专业的A股数据采集专家，必须基于真实数据库数据回答，不得编造任何行情、财务或新闻内容。

规则：
- 只使用数据库已有字段组织回答。
- 若缺数据，明确写“数据不足”。
- 用中文回答，结论直接简洁。`;

interface QuoteRow {
  code: string;
  name: string | null;
  price: number | null;
  change: number | null;
  changeAmt: number | null;
  open: number | null;
  prevClose: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  turnover: number | null;
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
}

interface FundamentalRow {
  reportDate: string | null;
  roe: number | null;
  revenue: number | null;
  netProfit: number | null;
}

interface NewsRow {
  title: string | null;
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

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatLargeNumber(value: number, unit = ""): string {
  if (!Number.isFinite(value) || value === 0) return "数据不足";
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿${unit}`;
  if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(2)}万${unit}`;
  return `${value.toFixed(2)}${unit}`;
}

function formatRatio(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "数据不足";
  return `${value.toFixed(2)}%`;
}

function fetchQuote(code: string): QuoteRow | null {
  const rows = runSql<QuoteRow>(`
    SELECT
      code,
      name,
      price,
      change,
      change_amt AS changeAmt,
      open,
      prev_close AS prevClose,
      high,
      low,
      volume,
      turnover,
      market_cap AS marketCap,
      pe,
      pb
    FROM stock_quote
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
      revenue,
      net_profit AS netProfit
    FROM stock_fundamental
    WHERE code = ${sqlString(code)}
    ORDER BY report_date DESC
    LIMIT 1;
  `);
  return rows[0] ?? null;
}

function fetchRecentNews(): string[] {
  const rows = runSql<NewsRow>(`
    SELECT title
    FROM news_flash
    WHERE category IN ('a', 'important')
    ORDER BY ctime DESC
    LIMIT 3;
  `);
  return rows
    .map((row) => row.title?.trim())
    .filter((title): title is string => Boolean(title));
}

function buildSummary(result: DataCollectorResult): string {
  return `${result.name}（${result.code}）数据采集完成，最新价${result.price.toFixed(2)}元，涨跌幅${result.change.toFixed(2)}%，市盈率${result.pe}，市净率${result.pb}。`;
}

function emptyResult(code: string, stockName: string): DataCollectorResult {
  return {
    code,
    name: stockName,
    price: 0,
    change: 0,
    changeAmt: 0,
    open: 0,
    prevClose: 0,
    high: 0,
    low: 0,
    volume: "数据不足",
    turnover: "数据不足",
    marketCap: "数据不足",
    pe: "数据不足",
    pb: "数据不足",
    roe: "数据不足",
    revenue: "数据不足",
    netProfit: "数据不足",
    recentNews: ["暂无可用新闻数据"],
    summary: `${stockName}（${code}）缺少足够的行情或财务数据。`,
  };
}

export async function runDataCollectorAgent(
  input: AgentInput,
): Promise<DataCollectorResult> {
  const { code = "000001", stockName = "未知股票" } = input;

  const quote = fetchQuote(code);
  const fundamental = fetchFundamental(code);
  const recentNews = fetchRecentNews();

  if (!quote) {
    return emptyResult(code, stockName);
  }

  const result: DataCollectorResult = {
    code,
    name: quote.name || stockName,
    price: toNumber(quote.price),
    change: toNumber(quote.change),
    changeAmt: toNumber(quote.changeAmt),
    open: toNumber(quote.open),
    prevClose: toNumber(quote.prevClose),
    high: toNumber(quote.high),
    low: toNumber(quote.low),
    volume: formatLargeNumber(toNumber(quote.volume), "手"),
    turnover: formatLargeNumber(toNumber(quote.turnover), "元"),
    marketCap: formatLargeNumber(toNumber(quote.marketCap), "元"),
    pe: formatLargeNumber(toNumber(quote.pe)),
    pb: formatLargeNumber(toNumber(quote.pb)),
    roe: formatRatio(toNumber(fundamental?.roe)),
    revenue: formatLargeNumber(toNumber(fundamental?.revenue), "元"),
    netProfit: formatLargeNumber(toNumber(fundamental?.netProfit), "元"),
    recentNews: recentNews.length ? recentNews : ["暂无可用新闻数据"],
    summary: "",
  };

  result.summary = buildSummary(result);
  return result;
}

export async function dataCollectorChat(
  question: string,
  code?: string,
  stockName?: string,
): Promise<string> {
  if (code) {
    const result = await runDataCollectorAgent({ code, stockName, question });
    return `${result.summary}\n近期新闻：${result.recentNews.join("；")}`;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];
  return chat(messages);
}
