import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import { createTask, pushEvent, completeTask } from "@/lib/taskStore";
import { DB_PATH, initSession, runCodexAsync } from "@/lib/codexRunner";
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

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH, { readonly: true });
  return db;
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
  const explicitCode = normalizeCode(input.code);
  if (explicitCode) {
    const matchedByCode = getDb()
      .prepare(
        `SELECT code, name
         FROM stock_meta
         WHERE code = ?
         LIMIT 1`,
      )
      .get(explicitCode) as { code: string; name: string } | undefined;

    return {
      code: explicitCode,
      stockName: input.stockName?.trim() || matchedByCode?.name || explicitCode,
    };
  }

  const question = input.question?.trim();
  if (!question) {
    return null;
  }

  const codeFromQuestion = question.match(A_SHARE_CODE_IN_TEXT_RE)?.[1];
  if (codeFromQuestion) {
    const matchedByCode = getDb()
      .prepare(
        `SELECT code, name
         FROM stock_meta
         WHERE code = ?
         LIMIT 1`,
      )
      .get(codeFromQuestion) as { code: string; name: string } | undefined;

    return {
      code: codeFromQuestion,
      stockName: matchedByCode?.name || codeFromQuestion,
    };
  }

  const matches = getDb()
    .prepare(
      `SELECT code, name
       FROM stock_meta
       WHERE instr(?, name) > 0
         AND (code LIKE '0%' OR code LIKE '3%' OR code LIKE '6%')
       ORDER BY length(name) DESC, code ASC
       LIMIT 5`,
    )
    .all(question) as { code: string; name: string }[];

  if (matches.length === 1) {
    return {
      code: matches[0].code,
      stockName: matches[0].name,
    };
  }

  if (matches.length > 1) {
    const candidates = matches
      .map((item) => `${item.name}（${item.code}）`)
      .join("、");
    throw new Error(
      `识别到多只股票：${candidates}，请明确提供一只股票代码或名称`,
    );
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
    "我是 Team 协同分析 Agent。",
    "我的角色是 Orchestrator 主控调度，不是单一的技术分析 Agent。",
    "我会根据问题组织技术分析、盘面分析、基本面分析、新闻舆情、投资建议等子 agent，并汇总成一份综合结论。",
    "如果你的问题涉及具体股票，我会先识别股票，再串联多阶段分析。",
    "如果你的问题是一般性问题，我会直接回答，必要时再调用合适的子 agent。",
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

  if (question?.trim() && TEAM_IDENTITY_RE.test(question.trim())) {
    const taskId = randomUUID();
    createTask(taskId);
    setImmediate(() => {
      pushEvent(taskId, { type: "team_done", advice: getTeamIntro() });
      pushEvent(taskId, { type: "done" });
      completeTask(taskId);
    });
    return NextResponse.json({ taskId });
  }

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
