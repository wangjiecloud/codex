import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createTask, pushEvent, completeTask } from "@/lib/taskStore";
import { initSession, runCodexAsync } from "@/lib/codexRunner";
import { SYSTEM_PROMPTS } from "@/app/api/agents/[agentId]/route";

const AGENT_LABELS: Record<string, string> = {
  technical: "技术分析",
  fundamental: "基本面",
  market: "盘面分析",
  news: "新闻舆情",
  advisor: "投资建议",
};

const PIPELINE: Array<keyof typeof SYSTEM_PROMPTS> = [
  "technical",
  "market",
  "fundamental",
  "news",
  "advisor",
];

const TEAM_IDENTITY_RE =
  /(你是谁|你的定义|你的职责|你是干什么的|介绍一下你自己|自我介绍)/;

const A_SHARE_CODE_RE = /^[036]\d{5}$/;
const A_SHARE_CODE_IN_TEXT_RE = /([036]\d{5})/;

// ─── 选股模式检测 ─────────────────────────────────────────────────────────

const SCREEN_INTENT_RE =
  /(筛选|筛出|找出|选出|选股|符合条件|满足条件|帮我找|找一下|查找|有哪些股票|哪些股票|选择|过滤|符合.+股票|找.*股票|筛.*股票)/;

function isScreenIntent(question: string): boolean {
  return SCREEN_INTENT_RE.test(question);
}

// ─── Agent 执行辅助 ────────────────────────────────────────────────────────

async function runAgent(
  taskId: string,
  agentId: keyof typeof SYSTEM_PROMPTS,
  agentLabel: string,
  prompt: string,
): Promise<string> {
  pushEvent(taskId, { type: "agent_start", agentId, agentLabel });
  const systemPrompt = SYSTEM_PROMPTS[agentId];
  const threadId = await initSession(systemPrompt);
  const output = await runCodexAsync(taskId, prompt, threadId);
  pushEvent(taskId, {
    type: "agent_done",
    agentId,
    agentLabel,
    result: output.split("\n").find((l) => l.trim()) ?? "完成",
  });
  return output;
}

// ─── 从 data agent 输出中提取股票代码 ──────────────────────────────────────

const CODE_IN_TEXT_RE = /\b([036]\d{5})\b/g;

function extractStockCodes(text: string, maxCount: number = 5): string[] {
  const matches = text.match(CODE_IN_TEXT_RE);
  if (!matches) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const code of matches) {
    if (!seen.has(code)) {
      seen.add(code);
      result.push(code);
      if (result.length >= maxCount) break;
    }
  }
  return result;
}

// ─── 选股模式主流程（全 Agent 协同） ───────────────────────────────────────

async function runScreenPipeline(taskId: string, question: string) {
  try {
    // ═══════════════════════════════════════════════════════════════
    // Step 1: data agent — 选股
    // 让 data agent 调用后端 API 获取全市场行情，按条件筛选
    // ═══════════════════════════════════════════════════════════════
    const dataPrompt =
      `用户的选股需求：${question}\n\n` +
      "请根据上述条件筛选股票。你可以通过以下方式获取数据：\n" +
      "- curl -s 'http://localhost:8000/api/quote/all_stocks' 获取全市场 A 股快照（含 code/name/price/changePct/turnoverRate/pe/pb/marketCap/industry 等字段）\n" +
      "- 也可以用 curl -s 'http://localhost:8000/api/quote/all_stocks?sort=f3&order=desc' 排序获取\n" +
      "- 根据用户条件在返回的数据中筛选，可以用 python3 处理 JSON 数据\n\n" +
      "## 筛选规则\n\n" +
      "**用户条件可能包含多个子条件，满足其中任意一条都算符合条件的股票**（即「或」关系，不是「且」关系）。请逐条拆解用户条件中的每个子条件，对每只股票逐条判断是否满足，并统计满足的条数。\n\n" +
      "## 输出要求\n\n" +
      "### 1. 筛选策略说明\n\n" +
      "先说明你从用户条件中拆解出了哪些子条件（逐条列出），以及你获取数据的方式。\n\n" +
      "### 2. 满足条件股票总表\n\n" +
      "用 Markdown 表格列出所有符合条件的股票（满足任意一条子条件即入选），**按满足程度从高到低排列**（满足条数多的排在前面，同条数按涨跌幅从高到低）。\n\n" +
      "表格列（必须全部包含）：\n\n" +
      "| 代码 | 名称 | 现价 | 涨跌幅(%) | 换手率(%) | PE | PB | 总市值(亿) | 流通市值(亿) | 行业 | 股东人数 | 满足条数 | 满足的条件 | 不满足的条件 |\n\n" +
      "**「满足的条件」列**：列出该股票满足了哪些子条件（用分号分隔）\n" +
      "**「不满足的条件」列**：列出该股票未满足哪些子条件（用分号分隔）\n" +
      "**「股东人数」列**：如果 curl -s 'http://localhost:8000/api/quote/all_stocks' 返回的数据中不包含股东人数，可调用 curl -s 'http://localhost:8000/api/quote/{code}' 获取详情；如果仍无法获取则填「N/A」\n" +
      "**「流通市值」列**：如果 all_stocks 返回的数据中有流通市值字段则直接使用，否则可用 curl -s 'http://localhost:8000/api/quote/{code}' 获取；如果无法获取则填「N/A」\n\n" +
      "### 3. 股票代码列表\n\n" +
      "表格后面列出筛选出的股票代码（每行一个代码），方便后续分析。\n\n" +
      "### 4. 数量限制\n\n" +
      "如果结果超过 10 只，只列前 10 只（按满足程度排序后的前 10 只）。\n\n" +
      "请确保表格中每只股票的代码都准确无误。";

    const dataOutput = await runAgent(taskId, "data", "数据选股", dataPrompt);

    // 提取 data agent 输出中的股票代码
    const stockCodes = extractStockCodes(dataOutput, 5);
    const hasStocks = stockCodes.length > 0;

    // ═══════════════════════════════════════════════════════════════
    // Step 2: market agent — 盘面定调
    // ═══════════════════════════════════════════════════════════════
    const marketPrompt =
      "请对当前 A 股市场进行全面盘面定调分析，必须包含以下板块，每个板块用独立标题和表格输出，不要把多段文字堆在一个段落里：\n\n" +
      "## 一、大盘概况\n" +
      "用表格输出：上证指数、深证成指、创业板指、科创50 的涨跌幅和走势判断\n\n" +
      "## 二、资金流向\n" +
      "1. 用表格输出主力资金净流入/流出、北向资金动向\n" +
      "2. 沪深两市成交额，对比近期是否缩量或放量\n\n" +
      "## 三、板块资金动向（核心）\n" +
      "**必须覆盖全市场所有板块，不要只分析用户给的板块**\n" +
      "1. **资金净流入 Top10 表格**：调用 curl -s 'http://localhost:8000/api/fund-flow/industry' 获取行业板块资金流向，按净流入从大到小排序取前10，表格列：板块名称 | 净流入(亿) | 涨跌幅(%) | 领涨股\n" +
      "2. **资金净流出 Top10 表格**：按净流入从小到大排序取前10（即流出最多的），表格列：板块名称 | 净流出(亿) | 涨跌幅(%) | 领跌股\n" +
      "3. **大资金动向总结**：3-5条要点，说明大资金正在流入哪些方向、撤离哪些方向，有无明显的风格切换信号\n\n" +
      "## 四、龙头连板分析（核心）\n" +
      "**找出最近板块中最先启动连板的龙一龙二龙三**\n" +
      "1. 调用 curl -s 'http://localhost:8000/api/sw-industry' 获取板块涨跌幅，找出今日涨幅 Top5 的板块\n" +
      "2. 对涨幅 Top3 的板块，调用 curl -s 'http://localhost:8000/api/sw-industry/constituents/{board_code}' 获取成分股\n" +
      "3. 对成分股调用 curl -s 'http://localhost:8000/api/kline/{code}?period=daily&count=15' 获取近15日K线，统计连板数（主板change_pct>=9.9为涨停，创业板/科创板>=19.9为涨停）\n" +
      "4. **用表格输出龙一龙二龙三**：\n" +
      "   - 龙一：连板数最多的股票（最先启动连板的）\n" +
      "   - 龙二：连板数第二的股票（跟进连板的）\n" +
      "   - 龙三：连板数第三或同板涨幅靠前的股票\n" +
      "   表格列：序号 | 角色(龙一/龙二/龙三) | 代码 | 名称 | 所属板块 | 连板数 | 今日涨幅(%) | 换手率(%) | 流通市值(亿)\n" +
      "5. 对龙一龙二龙三各用1-2段话分析其启动节奏、量价配合情况\n\n" +
      "## 五、市场情绪\n" +
      "用表格输出：涨跌家数、涨停/跌停数量、炸板率、综合情绪评级（冰点/偏冷/中性/偏热/过热）\n" +
      "调用 curl -s 'http://localhost:8000/api/market-breadth/summary?days=20' 获取情绪数据\n\n" +
      "## 六、盘面总结\n" +
      "3-5条要点，回答三个问题：\n" +
      "- 市场资金是在进还是出\n" +
      "- 热点是在扩散还是收缩\n" +
      "- 当前盘面偏进攻、震荡还是防守\n\n" +
      "**格式要求**：多用表格，少用长段落文字；每个板块独立标题；要点用列表不用段落。";

    const marketOutput = await runAgent(
      taskId,
      "market",
      "盘面定调",
      marketPrompt,
    );

    // 如果没有提取到股票代码，直接输出 data + market 结果
    if (!hasStocks) {
      const reportNoStocks = [
        "## 一、筛选结果\n\n" + dataOutput.trim(),
        "---\n\n## 二、盘面定调\n\n" + marketOutput.trim(),
      ].join("\n\n");
      pushEvent(taskId, { type: "team_done", advice: reportNoStocks });
      pushEvent(taskId, { type: "done" });
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // Step 3: fundamental agent — 基本面分析
    // ═══════════════════════════════════════════════════════════════
    const stockListForPrompt = stockCodes
      .map((code, i) => `${i + 1}. ${code}`)
      .join("\n");

    const fundamentalPrompt =
      `请对以下 ${stockCodes.length} 只股票做基本面分析：\n${stockListForPrompt}\n\n` +
      "对每只股票，请分析：\n" +
      "- 估值：PE/PB 水平是否合理\n" +
      "- 盈利能力：ROE、毛利率等\n" +
      "- 成长性：营收/利润增速\n" +
      "- 财务健康度\n\n" +
      "请用精简的 Markdown 表格输出，每只股票一个小节，用 🟢/🟡/🔴 标注各维度评价。";

    const fundamentalOutput = await runAgent(
      taskId,
      "fundamental",
      "基本面分析",
      fundamentalPrompt,
    );

    // ═══════════════════════════════════════════════════════════════
    // Step 4: technical agent — 技术面分析
    // ═══════════════════════════════════════════════════════════════
    const technicalPrompt =
      `请对以下 ${stockCodes.length} 只股票做技术面分析：\n${stockListForPrompt}\n\n` +
      "对每只股票，请分析：\n" +
      "- 趋势：MA5/10/20/60 均线排列\n" +
      "- 动量：MACD、RSI、KDJ 信号\n" +
      "- 量价：成交量、换手率是否配合\n" +
      "- 买卖信号：右侧交易信号是否确认\n\n" +
      "请用精简的 Markdown 表格输出，每只股票一个小节，用 🟢/🟡/🔴 标注各维度评价。";

    const technicalOutput = await runAgent(
      taskId,
      "technical",
      "技术面分析",
      technicalPrompt,
    );

    // ═══════════════════════════════════════════════════════════════
    // Step 5: news agent — 新闻舆情分析
    // ═══════════════════════════════════════════════════════════════
    const newsPrompt =
      `请对以下 ${stockCodes.length} 只股票做新闻舆情分析：\n${stockListForPrompt}\n\n` +
      "对每只股票，请分析：\n" +
      "- 近期新闻/公告是否有重大利好或利空\n" +
      "- 市场情绪和舆论趋势\n" +
      "- 是否存在需关注的风险事件\n\n" +
      "请用精简的 Markdown 输出，每只股票一个小节，用 🟢(利好)/🟡(中性)/🔴(利空) 标注舆情评价。";

    const newsOutput = await runAgent(taskId, "news", "新闻舆情", newsPrompt);

    // ═══════════════════════════════════════════════════════════════
    // Step 6: advisor agent — 投资建议
    // ═══════════════════════════════════════════════════════════════
    const advisorPrompt =
      `请对以下 ${stockCodes.length} 只股票做综合投资建议：\n${stockListForPrompt}\n\n` +
      "已有分析结论供参考：\n" +
      `【盘面定调】\n${marketOutput}\n\n` +
      `【基本面分析】\n${fundamentalOutput}\n\n` +
      `【技术面分析】\n${technicalOutput}\n\n` +
      `【新闻舆情】\n${newsOutput}\n\n` +
      "请综合以上分析，对每只股票给出：\n" +
      "- 买卖方向（买入/持有/卖出）\n" +
      "- 建议理由（技术面 + 基本面 + 盘面环境综合判断）\n" +
      "- 目标价位和止损价位\n" +
      "- 仓位建议（轻仓/中仓/重仓）\n" +
      "- 持有周期（短线/中线/长线）\n" +
      "用精简的 Markdown 表格输出，每只股票一个小节。\n" +
      "结尾必须注明「以上建议仅供参考，不构成投资依据，投资有风险，入市需谨慎」";

    const advisorOutput = await runAgent(
      taskId,
      "advisor",
      "投资建议",
      advisorPrompt,
    );

    // ═══════════════════════════════════════════════════════════════
    // 组装最终报告
    // ═══════════════════════════════════════════════════════════════
    const finalReport = [
      "## 一、盘面定调\n\n" + marketOutput.trim(),
      "---\n\n## 二、筛选结果\n\n" + dataOutput.trim(),
      "---\n\n## 三、基本面分析\n\n" + fundamentalOutput.trim(),
      "---\n\n## 四、技术面分析\n\n" + technicalOutput.trim(),
      "---\n\n## 五、新闻舆情\n\n" + newsOutput.trim(),
      "---\n\n## 六、投资建议\n\n" + advisorOutput.trim(),
    ].join("\n\n");

    pushEvent(taskId, { type: "team_done", advice: finalReport });
    pushEvent(taskId, { type: "done" });
  } catch (err) {
    pushEvent(taskId, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    completeTask(taskId);
  }
}

function normalizeCode(value?: string): string | null {
  const code = value?.trim();
  if (!code || !A_SHARE_CODE_RE.test(code)) return null;
  return code;
}

function resolveStockTarget(input: {
  code?: string;
  stockName?: string;
  question?: string;
}): { code: string; stockName: string } | null {
  // stock_meta 表不存在（行情数据实时获取，不入库），直接用传入的 code/stockName
  const explicitCode = normalizeCode(input.code);
  if (explicitCode) {
    return {
      code: explicitCode,
      stockName: input.stockName?.trim() || explicitCode,
    };
  }

  const question = input.question?.trim();
  if (!question) {
    return null;
  }

  const codeFromQuestion = question.match(A_SHARE_CODE_IN_TEXT_RE)?.[1];
  if (codeFromQuestion) {
    return {
      code: codeFromQuestion,
      stockName: codeFromQuestion,
    };
  }

  return null;
}

function buildTeamPrompt(input: {
  code?: string;
  stockName?: string;
  question?: string;
}): { prompt: string; code?: string; stockName?: string } {
  const question = input.question?.trim();
  const target = resolveStockTarget(input);

  if (target && question) {
    return {
      code: target.code,
      stockName: target.stockName,
      prompt: `${question}\n\n已识别股票：${target.stockName}（${target.code}）。请围绕该股票回答，并在需要时综合技术面、盘面、基本面、舆情和投资建议。`,
    };
  }

  if (target) {
    return {
      code: target.code,
      stockName: target.stockName,
      prompt: `请分析 ${target.stockName}（${target.code}）`,
    };
  }

  if (question) {
    return {
      prompt: `${question}\n\n如果问题缺少具体股票或必要上下文，请直接回答问题；若需要进一步信息，再明确说明还缺什么。`,
    };
  }

  throw new Error("请提供股票代码、股票名称或具体问题");
}

function getTeamIntro(): string {
  return [
    "## Team 协同分析 Agent",
    "",
    "我是 Orchestrator 主控调度，负责协调以下子 Agent 完成分析任务：",
    "",
    "| 子 Agent | 职责 |",
    "| --- | --- |",
    "| 技术分析 | MA/MACD/RSI/KDJ/布林带，判断趋势与买卖信号 |",
    "| 盘面分析 | 大盘资金流向、板块轮动、市场情绪 |",
    "| 基本面 | PE/ROE/营收/现金流，内在价值评估 |",
    "| 新闻舆情 | 相关新闻/公告/研报，情感分析 |",
    "| 投资建议 | 汇总结论，给出买卖点、仓位建议、目标价/止损价 |",
    "",
    "**支持两种模式：**",
    "",
    "1. **股票深度分析**：输入股票代码或名称（如「分析贵州茅台」「600519 走势如何」），串联全部子 Agent 输出综合报告",
    "2. **智能选股**：用自然语言描述筛选条件（如「筛选出换手率低于1%、PE小于30的半导体股票」「找出近3月地量整理的小盘股」），自动调度选股引擎 + 基本面点评",
    "",
    "请告诉我你想分析哪只股票，或描述你的选股条件。",
  ].join("\n");
}

function pickLineValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const match = text.match(new RegExp(`(?:^|\\n)${label}[：: ]+([^\\n]+)`));
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return null;
}

function buildInvestmentConclusion(
  technicalText: string,
  advisorText: string,
): string {
  const rightSideType =
    pickLineValue(technicalText, ["右侧交易类型"]) || "数据不足";
  const rightSideSignal =
    pickLineValue(technicalText, ["右侧交易建议", "右侧交易"]) || "数据不足";
  const action =
    pickLineValue(advisorText, ["买卖方向", "操作建议", "投资建议"]) ||
    "以投资建议原文为准";
  const position =
    pickLineValue(advisorText, ["仓位建议", "建议仓位"]) || "数据不足";
  const horizon =
    pickLineValue(advisorText, ["持有周期", "持有周期建议"]) || "数据不足";
  const target =
    pickLineValue(advisorText, ["目标价位", "目标价", "目标位", "第一目标"]) ||
    "数据不足";
  const stopLoss =
    pickLineValue(advisorText, ["止损价位", "止损价", "止损位"]) || "数据不足";
  const entry =
    pickLineValue(technicalText, [
      "参考介入区间",
      "新仓介入点",
      "买入区间",
      "介入点",
      "回踩买点",
    ]) ||
    pickLineValue(advisorText, ["新仓介入点", "买入价", "买入区间"]) ||
    "等待回踩或触发条件进一步确认";

  return [
    "# 投资结论",
    "",
    "| 项目 | 结论 |",
    "| --- | --- |",
    `| 买卖方向 | ${action} |`,
    `| 右侧买入信号 | ${rightSideSignal} |`,
    `| 仓位建议 | ${position} |`,
    `| 持有周期 | ${horizon} |`,
    `| 目标价位 | ${target} |`,
    `| 止损价位 | ${stopLoss} |`,
    `| 新仓介入点 | ${entry} |`,
    `| 右侧交易类型 | ${rightSideType} |`,
  ].join("\n");
}

function buildPipelinePrompt(
  agentId: keyof typeof SYSTEM_PROMPTS,
  baseQuestion: string,
  priorResults: Record<string, string>,
  hasStockTarget: boolean,
): string {
  const contextSummary = Object.entries(priorResults)
    .map(([id, text]) => `【${AGENT_LABELS[id]}】\n${text}`)
    .join("\n\n");

  const prompt = contextSummary
    ? `${baseQuestion}\n\n已有分析结论供参考：\n${contextSummary}`
    : baseQuestion;

  if (agentId !== "advisor" || !hasStockTarget) {
    return prompt;
  }

  return `${prompt}\n\n请在回复开头严格先输出一个 Markdown 表格，标题固定为“# 投资结论”，表格包含以下项目，顺序必须保持一致：买卖方向、右侧买入信号、仓位建议、持有周期、目标价位、止损价位、新仓介入点、右侧交易类型。\n若某项暂时无法给出明确价位，请写“数据不足”或“等待确认”，不要省略。表格后再补充简要理由和风险提示。`;
}

async function runPipeline(
  taskId: string,
  baseQuestion: string,
  hasStockTarget: boolean,
) {
  const results: Record<string, string> = {};

  try {
    for (const agentId of PIPELINE) {
      const label = AGENT_LABELS[agentId];

      pushEvent(taskId, { type: "agent_start", agentId, agentLabel: label });

      const systemPrompt = SYSTEM_PROMPTS[agentId];
      const threadId = await initSession(systemPrompt);

      const prompt = buildPipelinePrompt(
        agentId,
        baseQuestion,
        results,
        hasStockTarget,
      );

      const output = await runCodexAsync(taskId, prompt, threadId);
      results[agentId] = output;

      const summaryLine =
        output.split("\n").find((l) => l.trim()) ?? output.slice(0, 100);
      pushEvent(taskId, {
        type: "agent_done",
        agentId,
        agentLabel: label,
        result: summaryLine,
      });
    }

    const detailSections = PIPELINE.map((agentId) => {
      const label = AGENT_LABELS[agentId];
      const content = results[agentId]?.trim() || "暂无结果";
      return `## ${label}\n\n<details>\n<summary>展开查看${label}详情</summary>\n\n${content}\n\n</details>`;
    }).join("\n\n");

    const advice = results["advisor"] ?? "";
    const conclusion = hasStockTarget
      ? buildInvestmentConclusion(results["technical"] ?? "", advice)
      : "";
    const finalReport = conclusion
      ? `${conclusion}\n\n${advice.trim()}\n\n---\n\n# 分阶段详情\n\n${detailSections}`
      : `${advice.trim()}\n\n---\n\n# 分阶段详情\n\n${detailSections}`;
    pushEvent(taskId, { type: "team_done", advice: finalReport });
    pushEvent(taskId, { type: "done" });
  } catch (err) {
    pushEvent(taskId, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    completeTask(taskId);
  }
}

export async function POST(req: NextRequest) {
  const { code, stockName, question } = (await req.json()) as {
    code?: string;
    stockName?: string;
    question?: string;
  };

  const q = question?.trim() ?? "";

  // ── 1. 身份/介绍问题：直接返回静态文本（无需 LLM）
  if (q && TEAM_IDENTITY_RE.test(q)) {
    const taskId = randomUUID();
    createTask(taskId);
    setImmediate(() => {
      pushEvent(taskId, { type: "team_done", advice: getTeamIntro() });
      pushEvent(taskId, { type: "done" });
      completeTask(taskId);
    });
    return NextResponse.json({ taskId });
  }

  // ── 2. 选股模式：用户输入是自然语言筛股条件
  //    条件：有 question、没有 code/stockName 明确指定、且包含选股意图词
  if (q && !code && !stockName && isScreenIntent(q)) {
    const taskId = randomUUID();
    createTask(taskId);
    setImmediate(() => {
      runScreenPipeline(taskId, q);
    });
    return NextResponse.json({ taskId });
  }

  // ── 3. 常规模式：针对特定股票的综合分析
  let teamInput: { prompt: string; code?: string; stockName?: string };
  try {
    teamInput = buildTeamPrompt({ code, stockName, question });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "请提供股票代码或包含股票名称的分析问题",
      },
      { status: 400 },
    );
  }

  const taskId = randomUUID();
  createTask(taskId);

  setImmediate(() => {
    runPipeline(taskId, teamInput.prompt, Boolean(teamInput.code));
  });

  return NextResponse.json({ taskId });
}
