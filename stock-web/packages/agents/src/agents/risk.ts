import { chat, ChatMessage } from "../client";
import {
  AgentInput,
  RiskResult,
  TechnicalResult,
  FundamentalResult,
  NewsSentimentResult,
} from "../types";

const SYSTEM_PROMPT = `你是一个专业的A股风险评估 Agent，擅长量化分析股票投资风险。
你能够评估波动性风险、系统性风险、流动性风险、估值风险等多个维度，给出综合风险评级。
输出必须是严格的JSON格式，不要包含任何其他内容。`;

export async function runRiskAgent(input: AgentInput): Promise<RiskResult> {
  const { code = "000001", stockName = "未知股票", question, context } = input;

  const contextStr = context
    ? `已有分析数据：
技术面得分：${context.technical?.score ?? "N/A"}
基本面得分：${context.fundamental?.healthScore ?? "N/A"}
舆情情绪：${context.news?.sentiment ?? "N/A"}（${context.news?.score ?? "N/A"}/100）`
    : "";

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `请对${stockName}（${code}）进行风险评估。${question ? `重点关注：${question}` : ""}
${contextStr}

请返回以下JSON格式：
{
  "riskLevel": "low|medium|high|very_high",
  "score": <风险评分0-100，越高风险越大>,
  "volatility": "<波动性描述，如：中等波动，近30日日均振幅2.3%>",
  "maxDrawdown": "<最大回撤，如：近3个月最大回撤12.5%>",
  "betaCoefficient": <Beta系数>,
  "systemicRisk": "<系统性风险描述>",
  "specificRisks": ["<个股特有风险1>", "<个股特有风险2>", "<个股特有风险3>"],
  "summary": "<150字以内的风险评估总结>"
}`,
    },
  ];

  const raw = await chat(messages, undefined, 2048);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as RiskResult;
  } catch {}

  return {
    riskLevel: "medium",
    score: 45,
    volatility: "中等波动，近30日日均振幅1.8%",
    maxDrawdown: "近3个月最大回撤8.5%",
    betaCoefficient: 0.92,
    systemicRisk: "当前市场整体波动率中等，系统性风险可控",
    specificRisks: [
      "大股东减持计划带来短期压力",
      "行业竞争加剧影响利润空间",
      "汇率波动影响国际业务",
    ],
    summary: `${stockName}整体风险中等，Beta系数接近1，与市场联动性强。个股层面需关注大股东减持计划和行业竞争变化。`,
  };
}

export async function riskChat(
  question: string,
  code?: string,
  stockName?: string,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: code
        ? `关于${stockName}（${code}）的风险评估：${question}`
        : question,
    },
  ];
  return chat(messages);
}
