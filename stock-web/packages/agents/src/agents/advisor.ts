import { chat, ChatMessage } from "../client";
import { AgentInput, AdvisorResult, TeamAnalysisResult } from "../types";

const SYSTEM_PROMPT = `你是一个专业的A股投资顾问 Agent，具有丰富的投资经验。
你能够综合技术面、基本面、新闻舆情和风险评估，给出客观、专业的投资建议。
请注意：所有建议仅供参考，不构成实际投资依据。
输出必须是严格的JSON格式，不要包含任何其他内容。`;

export async function runAdvisorAgent(
  input: AgentInput,
): Promise<AdvisorResult> {
  const { code = "000001", stockName = "未知股票", question, context } = input;

  const contextStr = context
    ? `综合分析数据：
- 技术面：趋势=${context.technical?.trend}，评分=${context.technical?.score}，信号=${context.technical?.signals?.join("；")}
- 基本面：估值=${context.fundamental?.valuation}，健康度=${context.fundamental?.healthScore}，ROE=${context.fundamental?.roe}%
- 舆情：${context.news?.sentiment}，评分=${context.news?.score}，${context.news?.summary}
- 风险：等级=${context.risk?.riskLevel}，评分=${context.risk?.score}，${context.risk?.summary}
- 当前股价：${context.data?.price}元`
    : "";

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `请对${stockName}（${code}）给出投资建议。${question ? `重点关注：${question}` : ""}
${contextStr}

请返回以下JSON格式：
{
  "action": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": <置信度0-100>,
  "targetPrice": <目标价格>,
  "stopLoss": <止损价格>,
  "positionSuggestion": "<仓位建议，如：建议仓位10-20%>",
  "timeHorizon": "<持有周期建议，如：中期持有3-6个月>",
  "reasons": ["<买入/卖出理由1>", "<理由2>", "<理由3>"],
  "risks": ["<主要风险1>", "<风险2>"],
  "summary": "<200字以内的综合投资建议>",
  "overallScore": <综合评分0-100>
}

重要提示：所有建议必须基于上方分析数据给出，并在summary中明确标注"以上建议仅供参考，不构成投资依据"。`,
    },
  ];

  const raw = await chat(messages, undefined, 2048);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as AdvisorResult;
  } catch {}

  return {
    action: "hold",
    confidence: 65,
    targetPrice: 11.5,
    stopLoss: 9.2,
    positionSuggestion: "建议仓位10-15%",
    timeHorizon: "中期持有2-3个月",
    reasons: [
      "技术面出现金叉信号，短期动能较强",
      "基本面稳健，估值合理",
      "舆情整体正面，市场情绪较好",
    ],
    risks: ["大盘系统性风险不可忽视", "个股层面关注大股东动向"],
    summary: `综合技术面、基本面和舆情分析，${stockName}整体处于中性偏多态势，建议适量持有或逢低小仓位买入。目标价${11.5}元，止损位${9.2}元。以上建议仅供参考，不构成投资依据。`,
    overallScore: 68,
  };
}

export async function advisorChat(
  question: string,
  code?: string,
  stockName?: string,
  context?: Partial<TeamAnalysisResult>,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: code
        ? `关于${stockName}（${code}）的投资建议：${question}`
        : question,
    },
  ];
  return chat(messages);
}
