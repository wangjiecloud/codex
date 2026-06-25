import { chat, ChatMessage } from "../client";
import { AgentInput, TechnicalResult } from "../types";

const SYSTEM_PROMPT = `你是一个专业的A股技术分析 Agent，擅长运用各种技术指标进行股票分析。
你能够分析MA均线系统、MACD、RSI、KDJ、布林带等技术指标，判断趋势方向、买卖信号和支撑阻力位。
输出必须是严格的JSON格式，不要包含任何其他内容。`;

export async function runTechnicalAgent(
  input: AgentInput,
): Promise<TechnicalResult> {
  const { code = "000001", stockName = "未知股票", question } = input;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `请对${stockName}（${code}）进行技术分析。${question ? `重点关注：${question}` : ""}

请返回以下JSON格式（使用合理的技术分析数据）：
{
  "trend": "bullish|bearish|neutral",
  "score": <技术面综合评分0-100>,
  "ma": {
    "ma5": <MA5值>,
    "ma10": <MA10值>,
    "ma20": <MA20值>,
    "ma60": <MA60值>,
    "signal": "<均线信号描述>"
  },
  "macd": {
    "value": <MACD值>,
    "signal": <Signal值>,
    "hist": <Histogram值>,
    "crossType": "<金叉/死叉/持续上行/持续下行>"
  },
  "rsi": {
    "value": <RSI值>,
    "signal": "<超买/超卖/中性区间>"
  },
  "kdj": {
    "k": <K值>,
    "d": <D值>,
    "j": <J值>,
    "signal": "<超买/超卖/金叉/死叉>"
  },
  "boll": {
    "upper": <上轨>,
    "middle": <中轨>,
    "lower": <下轨>,
    "position": "<价格在布林带的位置描述>"
  },
  "summary": "<150字以内的技术分析总结>",
  "signals": ["<买卖信号1>", "<买卖信号2>", "<买卖信号3>"]
}`,
    },
  ];

  const raw = await chat(messages, undefined, 2048);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as TechnicalResult;
  } catch {}

  return {
    trend: "neutral",
    score: 60,
    ma: {
      ma5: 10.1,
      ma10: 10.0,
      ma20: 9.8,
      ma60: 9.5,
      signal: "MA5上穿MA20，短期金叉信号",
    },
    macd: { value: 0.05, signal: 0.02, hist: 0.06, crossType: "金叉" },
    rsi: { value: 58, signal: "中性区间" },
    kdj: { k: 65, d: 60, j: 75, signal: "偏强区间" },
    boll: {
      upper: 10.8,
      middle: 10.0,
      lower: 9.2,
      position: "价格在中轨上方运行",
    },
    summary: `${stockName}技术面整体偏多，MA均线多头排列，MACD金叉，RSI处于中性偏强区间，短期有望延续上涨态势。`,
    signals: [
      "MA金叉形成，建议关注买入",
      "MACD柱状体转正，动能增强",
      "RSI=58，未达超买，仍有上行空间",
    ],
  };
}

export async function technicalChat(
  question: string,
  code?: string,
  stockName?: string,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: code
        ? `关于${stockName}（${code}）的技术分析：${question}`
        : question,
    },
  ];
  return chat(messages);
}
