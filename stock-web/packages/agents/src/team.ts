import { AgentInput, TeamAnalysisResult } from "./types";
import { runDataCollectorAgent } from "./agents/data-collector";
import { runTechnicalAgent } from "./agents/technical";
import { runFundamentalAgent } from "./agents/fundamental";
import { runNewsSentimentAgent } from "./agents/news-sentiment";
import { runRiskAgent } from "./agents/risk";
import { runAdvisorAgent } from "./agents/advisor";

export type TeamProgressEvent =
  | { type: "agent_start"; agentId: string; agentLabel: string }
  | { type: "agent_done"; agentId: string; agentLabel: string; result: string }
  | { type: "agent_error"; agentId: string; error: string }
  | { type: "team_done"; result: TeamAnalysisResult; advice: string }
  | { type: "error"; message: string };

export type ProgressCallback = (event: TeamProgressEvent) => void;

const AGENT_LABELS: Record<string, string> = {
  data: "数据采集",
  technical: "技术分析",
  fundamental: "基本面",
  news: "新闻舆情",
  risk: "风险评估",
  advisor: "投资建议",
};

/**
 * Orchestrator: runs the full agent team pipeline.
 *
 * Architecture (mirrors Codex multi-agent pattern):
 * 1. Phase 1 (parallel): data, technical, fundamental, news
 * 2. Phase 2 (sequential, depends on phase 1): risk
 * 3. Phase 3 (sequential, depends on risk): advisor
 */
export async function runTeamAnalysis(
  code: string,
  stockName: string,
  onProgress?: ProgressCallback,
): Promise<TeamAnalysisResult> {
  const emit = onProgress ?? (() => {});
  const input: AgentInput = { code, stockName };

  // ── Phase 1: parallel ──────────────────────────────────────
  emit({ type: "agent_start", agentId: "data", agentLabel: AGENT_LABELS.data });
  emit({
    type: "agent_start",
    agentId: "technical",
    agentLabel: AGENT_LABELS.technical,
  });
  emit({
    type: "agent_start",
    agentId: "fundamental",
    agentLabel: AGENT_LABELS.fundamental,
  });
  emit({ type: "agent_start", agentId: "news", agentLabel: AGENT_LABELS.news });

  const [dataResult, technicalResult, fundamentalResult, newsResult] =
    await Promise.all([
      runDataCollectorAgent(input).then((r) => {
        emit({
          type: "agent_done",
          agentId: "data",
          agentLabel: AGENT_LABELS.data,
          result: r.summary,
        });
        return r;
      }),
      runTechnicalAgent(input).then((r) => {
        emit({
          type: "agent_done",
          agentId: "technical",
          agentLabel: AGENT_LABELS.technical,
          result: r.summary,
        });
        return r;
      }),
      runFundamentalAgent(input).then((r) => {
        emit({
          type: "agent_done",
          agentId: "fundamental",
          agentLabel: AGENT_LABELS.fundamental,
          result: r.summary,
        });
        return r;
      }),
      runNewsSentimentAgent(input).then((r) => {
        emit({
          type: "agent_done",
          agentId: "news",
          agentLabel: AGENT_LABELS.news,
          result: r.summary,
        });
        return r;
      }),
    ]);

  const partialResult: Partial<TeamAnalysisResult> = {
    code,
    stockName,
    data: dataResult,
    technical: technicalResult,
    fundamental: fundamentalResult,
    news: newsResult,
  };

  // ── Phase 2: risk (depends on phase 1) ─────────────────────
  emit({ type: "agent_start", agentId: "risk", agentLabel: AGENT_LABELS.risk });
  const riskResult = await runRiskAgent({
    ...input,
    context: partialResult,
  }).then((r) => {
    emit({
      type: "agent_done",
      agentId: "risk",
      agentLabel: AGENT_LABELS.risk,
      result: r.summary,
    });
    return r;
  });

  const withRisk: Partial<TeamAnalysisResult> = {
    ...partialResult,
    risk: riskResult,
  };

  // ── Phase 3: advisor (depends on all above) ─────────────────
  emit({
    type: "agent_start",
    agentId: "advisor",
    agentLabel: AGENT_LABELS.advisor,
  });
  const advisorResult = await runAdvisorAgent({
    ...input,
    context: withRisk,
  }).then((r) => {
    emit({
      type: "agent_done",
      agentId: "advisor",
      agentLabel: AGENT_LABELS.advisor,
      result: r.summary,
    });
    return r;
  });

  const finalResult: TeamAnalysisResult = {
    code,
    stockName,
    analyzedAt: new Date().toISOString(),
    data: dataResult,
    technical: technicalResult,
    fundamental: fundamentalResult,
    news: newsResult,
    risk: riskResult,
    advice: advisorResult,
  };

  emit({
    type: "team_done",
    result: finalResult,
    advice: advisorResult.summary,
  });
  return finalResult;
}
