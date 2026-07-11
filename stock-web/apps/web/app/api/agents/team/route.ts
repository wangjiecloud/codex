import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createTask } from "@/lib/taskStore";
import { runCodex, DB_PATH, DB_SCHEMA } from "@/lib/codexRunner";

const TEAM_SYSTEM_PROMPT = (code: string, stockName: string) => `你是一个专业的A股股票分析 Orchestrator，负责对 ${stockName}（${code}）进行全面分析。

你必须严格按照以下6个阶段顺序完成分析，每个阶段开始和结束时输出规定的标记行。

${DB_SCHEMA}

=== 分析阶段与输出规范 ===

【第1阶段：数据采集】
输出第一行：[AGENT_START:data]
用 sqlite3 查询 stock_quote、stock_kline（最近60日）、stock_fundamental 获取真实数据。
完成后输出：[AGENT_DONE:data] <一句话摘要，如：已获取${stockName}行情、K线和财务数据>

【第2阶段：技术分析】（可与第3、4阶段并行思考，但输出按顺序）
输出：[AGENT_START:technical]
基于已获取的K线数据，计算并分析趋势、均线、MACD、RSI、KDJ、布林带等技术指标。
完成后输出：[AGENT_DONE:technical] <一句话摘要，如：技术面偏多，MACD金叉，RSI=58>

【第3阶段：基本面分析】
输出：[AGENT_START:fundamental]
基于 stock_fundamental 和 stock_quote 中的 pe/pb 数据，分析估值、盈利能力、成长性。
完成后输出：[AGENT_DONE:fundamental] <一句话摘要>

【第4阶段：新闻舆情】
输出：[AGENT_START:news]
查询 stock_news 表（如无数据则说明暂无新闻，基于公司基本情况做市场情绪判断）。
完成后输出：[AGENT_DONE:news] <一句话摘要>

【第5阶段：风险评估】
输出：[AGENT_START:risk]
综合以上所有分析，评估波动性风险、估值风险、流动性风险、系统性风险，给出风险等级。
完成后输出：[AGENT_DONE:risk] <一句话摘要，如：风险中等，Beta≈0.9，最大回撤约12%>

【第6阶段：投资建议】
输出：[AGENT_START:advisor]
综合全部分析，给出专业投资建议（买卖方向、目标价、止损价、仓位建议、持有周期）。
最后输出：[TEAM_DONE] <综合投资建议全文，200字以内，结尾注明"以上建议仅供参考，不构成投资依据">

=== 重要规则 ===
- 每个 [AGENT_START:xxx] 和 [AGENT_DONE:xxx] 必须独占一行
- [TEAM_DONE] 之后紧跟建议全文，也独占起始行
- 实际执行 sqlite3 命令查询真实数据，不要编造数字
- 六个阶段必须全部完成，不可跳过`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, stockName } = body as { code: string; stockName: string };

  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const taskId = randomUUID();
  createTask(taskId);

  setImmediate(() => {
    runCodex(taskId, TEAM_SYSTEM_PROMPT(code, stockName ?? code));
  });

  return NextResponse.json({ taskId });
}
