import { chat, ChatMessage } from "../client";
import { AgentInput, DataCollectorResult } from "../types";

const SYSTEM_PROMPT = `你是一个专业的A股数据采集 Agent。
你的职责是收集并整理指定股票的基础数据，包括：实时行情、K线数据摘要、财务数据、近期新闻。
当前接入的是模拟数据服务（AKShare），请以专业、简洁的方式整理并汇报数据。
输出必须是严格的JSON格式，不要包含任何其他内容。`;

export async function runDataCollectorAgent(
  input: AgentInput,
): Promise<DataCollectorResult> {
  const { code = "000001", stockName = "未知股票", question } = input;

  const userMessage = question
    ? `请获取${stockName}（${code}）的数据，并回答：${question}`
    : `请获取${stockName}（${code}）的完整基础数据。`;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${userMessage}

请返回以下JSON格式（严格按此结构，数值使用合理的模拟数据）：
{
  "code": "${code}",
  "name": "${stockName}",
  "price": <当前价格>,
  "change": <涨跌幅百分比>,
  "changeAmt": <涨跌额>,
  "open": <今开>,
  "prevClose": <昨收>,
  "high": <最高>,
  "low": <最低>,
  "volume": "<成交量>",
  "turnover": "<成交额>",
  "marketCap": "<总市值>",
  "pe": "<市盈率>",
  "pb": "<市净率>",
  "roe": "<净资产收益率>",
  "revenue": "<最近年营收>",
  "netProfit": "<最近年净利润>",
  "recentNews": ["<近期新闻1>", "<近期新闻2>", "<近期新闻3>"],
  "summary": "<100字以内数据概述>"
}`,
    },
  ];

  const raw = await chat(messages, undefined, 2048);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as DataCollectorResult;
  } catch {}

  // Fallback mock
  return {
    code,
    name: stockName,
    price: 10.0,
    change: 0.5,
    changeAmt: 0.05,
    open: 9.98,
    prevClose: 9.95,
    high: 10.2,
    low: 9.9,
    volume: "1亿手",
    turnover: "10亿",
    marketCap: "500亿",
    pe: "15",
    pb: "1.5",
    roe: "12%",
    revenue: "100亿",
    netProfit: "15亿",
    recentNews: [
      `${stockName}发布最新财报`,
      `机构调研${stockName}`,
      `${stockName}获融资资金流入`,
    ],
    summary: `${stockName}（${code}）数据采集完成，股价10.00元，今日小幅上涨0.5%。`,
  };
}

export async function dataCollectorChat(
  question: string,
  code?: string,
  stockName?: string,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: code ? `关于${stockName}（${code}），${question}` : question,
    },
  ];
  return chat(messages);
}
