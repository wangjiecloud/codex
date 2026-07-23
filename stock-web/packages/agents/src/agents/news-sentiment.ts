import { execFileSync } from "child_process";
import * as os from "os";
import * as path from "path";

import { chat, ChatMessage } from "../client";
import { AgentInput, NewsSentimentResult } from "../types";

const DB_PATH =
  process.env.STOCK_DB_PATH ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/stock-web/apps/data-service/stock_data.db",
  );

const SYSTEM_PROMPT = `你是专业的A股新闻舆情分析专家，只能基于真实新闻标题和确定性统计结果回答，不得编造新闻事实。

规则：
- 只解释已有新闻，不补充数据库中不存在的事件。
- 若无法匹配到相关新闻，明确写“数据不足”。
- 用中文回答，重点说明情绪方向、热点主题和主要利好利空。`;

interface NewsRow {
  title: string | null;
  publishedAt: string | null;
}

const POSITIVE_KEYWORDS = [
  "增长",
  "预增",
  "上调",
  "买入",
  "增持",
  "突破",
  "签约",
  "中标",
  "分红",
  "回购",
  "新高",
  "盈利",
  "净利润",
  "利好",
  "超预期",
  "订单",
  "融资流入",
];

const NEGATIVE_KEYWORDS = [
  "下滑",
  "预减",
  "下调",
  "减持",
  "亏损",
  "跌停",
  "处罚",
  "诉讼",
  "风险",
  "违约",
  "终止",
  "延期",
  "问询",
  "质押",
  "暴跌",
  "利空",
  "裁员",
];

const TOPIC_KEYWORDS = [
  "业绩",
  "分红",
  "减持",
  "回购",
  "机构",
  "调研",
  "订单",
  "中标",
  "融资",
  "政策",
  "AI",
  "算力",
  "芯片",
  "光模块",
  "机器人",
  "新能源",
  "军工",
  "半导体",
  "服务器",
  "并购",
];

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

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function parsePublishedAt(value: string | null): number {
  if (!value) return 0;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function fetchNewsRows(stockName: string, code?: string, limit = 20): string[] {
  const safeName = stockName.trim();
  const flashRows = safeName
    ? runSql<NewsRow>(`
        SELECT title, ctime AS publishedAt
        FROM news_flash
        WHERE title LIKE ${sqlString(`%${escapeLike(safeName)}%`)} ESCAPE '\\'
        ORDER BY ctime DESC
        LIMIT ${limit};
      `)
    : [];
  const themeRows = safeName
    ? runSql<NewsRow>(`
        SELECT title, pub_time AS publishedAt
        FROM theme_news
        WHERE title LIKE ${sqlString(`%${escapeLike(safeName)}%`)} ESCAPE '\\'
           OR theme_name LIKE ${sqlString(`%${escapeLike(safeName)}%`)} ESCAPE '\\'
        ORDER BY pub_time DESC
        LIMIT ${limit};
      `)
    : [];
  const gubaRows = code
    ? runSql<NewsRow>(`
        SELECT title, pub_time AS publishedAt
        FROM stock_guba
        WHERE code = ${sqlString(code)}
          AND post_type IN ('news', 'notice')
        ORDER BY pub_time DESC
        LIMIT ${limit};
      `)
    : [];
  const seen = new Set<string>();
  return [...flashRows, ...themeRows, ...gubaRows]
    .map((row) => ({
      title: row.title?.trim() ?? "",
      publishedAt: parsePublishedAt(row.publishedAt),
    }))
    .filter((row) => Boolean(row.title))
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter((row) => {
      if (seen.has(row.title)) return false;
      seen.add(row.title);
      return true;
    })
    .map((row) => row.title)
    .slice(0, limit);
}

function countKeywordMatches(titles: string[], keywords: string[]): number {
  return titles.reduce(
    (sum, title) =>
      sum +
      keywords.reduce(
        (acc, keyword) => acc + (title.includes(keyword) ? 1 : 0),
        0,
      ),
    0,
  );
}

function extractTopics(titles: string[]): string[] {
  const topicCounts = new Map<string, number>();
  for (const title of titles) {
    for (const keyword of TOPIC_KEYWORDS) {
      if (title.includes(keyword)) {
        topicCounts.set(keyword, (topicCounts.get(keyword) ?? 0) + 1);
      }
    }
  }
  return [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([keyword]) => keyword);
}

function pickTitlesByKeywords(titles: string[], keywords: string[]): string[] {
  return titles
    .filter((title) => keywords.some((keyword) => title.includes(keyword)))
    .slice(0, 3);
}

function buildSummary(params: {
  stockName: string;
  sentiment: NewsSentimentResult["sentiment"];
  score: number;
  newsCount: number;
  keyTopics: string[];
  positivePoints: string[];
  negativePoints: string[];
}): string {
  const sentimentText =
    params.sentiment === "positive"
      ? "偏正面"
      : params.sentiment === "negative"
        ? "偏负面"
        : "中性";
  const topicText = params.keyTopics.length
    ? params.keyTopics.join("、")
    : "缺少明确热点主题";
  const positiveText = params.positivePoints[0] ?? "暂无明显利好";
  const negativeText = params.negativePoints[0] ?? "暂无明显利空";
  return `${params.stockName}近期舆情整体${sentimentText}，共匹配到${params.newsCount}条相关新闻，主要话题集中在${topicText}。当前主要利好是${positiveText}；主要风险点是${negativeText}。`;
}

function emptyResult(stockName: string): NewsSentimentResult {
  return {
    sentiment: "neutral",
    score: 50,
    newsCount: 0,
    keyTopics: [],
    positivePoints: [],
    negativePoints: ["数据不足"],
    summary: `${stockName}暂无可用于舆情分析的相关新闻数据。`,
  };
}

export async function runNewsSentimentAgent(
  input: AgentInput,
): Promise<NewsSentimentResult> {
  const { code, stockName = "未知股票" } = input;
  const titles = fetchNewsRows(stockName, code, 20);
  if (!titles.length) {
    return emptyResult(stockName);
  }

  const positiveHits = countKeywordMatches(titles, POSITIVE_KEYWORDS);
  const negativeHits = countKeywordMatches(titles, NEGATIVE_KEYWORDS);
  const rawScore = 50 + positiveHits * 6 - negativeHits * 6;
  const score = Math.min(100, Math.max(0, rawScore));
  const sentiment: NewsSentimentResult["sentiment"] =
    score >= 60 ? "positive" : score <= 40 ? "negative" : "neutral";
  const keyTopics = extractTopics(titles);
  const positivePoints = pickTitlesByKeywords(titles, POSITIVE_KEYWORDS);
  const negativePoints = pickTitlesByKeywords(titles, NEGATIVE_KEYWORDS);

  return {
    sentiment,
    score,
    newsCount: titles.length,
    keyTopics,
    positivePoints,
    negativePoints,
    summary: buildSummary({
      stockName,
      sentiment,
      score,
      newsCount: titles.length,
      keyTopics,
      positivePoints,
      negativePoints,
    }),
  };
}

export async function newsChat(
  question: string,
  code?: string,
  stockName?: string,
): Promise<string> {
  if (stockName) {
    const result = await runNewsSentimentAgent({ code, stockName, question });
    return `${stockName}${code ? `（${code}）` : ""}舆情分析：${result.summary}\n利好：${result.positivePoints.join("；") || "暂无明显利好"}\n利空：${result.negativePoints.join("；") || "暂无明显利空"}`;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];
  return chat(messages);
}
