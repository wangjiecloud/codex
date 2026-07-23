"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { MarkdownMessage } from "@/components/agents/MarkdownMessage";
import {
  buildStoredReportMarkdown,
  formatReportDate,
  getTeamReport,
  TeamReport,
  upsertTeamReport,
  loadTeamReports,
} from "@/lib/teamReports";

async function runTeamReport(
  baseReport: TeamReport,
  onStatus: (report: TeamReport) => void,
) {
  const running = {
    ...baseReport,
    status: "running" as const,
    error: undefined,
  };
  onStatus(running);

  const res = await fetch("/api/agents/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: baseReport.code, stockName: baseReport.name }),
  });
  const body = (await res.json()) as { taskId?: string; error?: string };
  if (!res.ok || !body.taskId) {
    throw new Error(body.error || "报告分析启动失败");
  }

  await new Promise<void>((resolve, reject) => {
    const sse = new EventSource(`/api/agents/stream/${body.taskId}`);
    sse.onmessage = (event) => {
      const data = JSON.parse(event.data) as {
        type: string;
        advice?: string;
        message?: string;
        text?: string;
      };

      if (data.type === "team_done") {
        const now = Date.now();
        const nextReport: TeamReport = {
          ...baseReport,
          status: "ready",
          updatedAt: now,
          report: buildStoredReportMarkdown(
            baseReport.name,
            baseReport.code,
            data.advice || data.message || data.text || "分析完成",
            now,
          ),
          error: undefined,
        };
        onStatus(nextReport);
      }

      if (data.type === "done") {
        sse.close();
        resolve();
      }

      if (data.type === "error") {
        sse.close();
        reject(new Error(data.message || "报告分析失败"));
      }
    };

    sse.onerror = () => {
      sse.close();
      reject(new Error("报告流连接中断，请重试"));
    };
  });
}

export default function TeamReportPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const [report, setReport] = useState<TeamReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!code) return;
    setReport(getTeamReport(code) ?? null);
  }, [code]);

  const handleStatus = useCallback((nextReport: TeamReport) => {
    setReport(nextReport);
    upsertTeamReport(loadTeamReports(), nextReport);
  }, []);

  const refreshReport = useCallback(async () => {
    if (!report || loading) return;
    setLoading(true);
    try {
      await runTeamReport(report, handleStatus);
    } catch (error) {
      handleStatus({
        ...report,
        status: "error",
        error: error instanceof Error ? error.message : "报告分析失败",
      });
    } finally {
      setLoading(false);
    }
  }, [handleStatus, loading, report]);

  useEffect(() => {
    if (!report || report.report || report.status !== "idle") return;
    void refreshReport();
  }, [refreshReport, report]);

  const reportDate = useMemo(
    () => formatReportDate(report?.updatedAt ?? report?.createdAt),
    [report?.createdAt, report?.updatedAt],
  );

  const canRefresh = !!report && !loading;

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] px-6 py-8 text-[var(--text-primary)]">
      <main className="mx-auto max-w-5xl rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => router.back()}
              className="mb-3 flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[#f5a623]"
            >
              <ArrowLeft size={14} /> 返回
            </button>
            <h1 className="text-2xl font-bold">{report?.name ?? code} 报告</h1>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              最新时间：{reportDate}
              {report?.status === "running" ? " · 正在更新中" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshReport()}
            disabled={!canRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[#f5a623] hover:text-[#f5a623] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            更新报告
          </button>
        </div>

        {report?.error && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
            {report.error}
          </div>
        )}

        {report?.report ? (
          <MarkdownMessage content={report.report} />
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-12 text-center text-sm text-[var(--text-tertiary)]">
            {loading ? "正在生成报告，请稍候..." : "暂无报告内容"}
          </div>
        )}
      </main>
    </div>
  );
}
