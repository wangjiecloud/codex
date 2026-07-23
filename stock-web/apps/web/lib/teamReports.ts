export type TeamReportStatus = "idle" | "running" | "ready" | "error";

export interface TeamReport {
  code: string;
  name: string;
  status: TeamReportStatus;
  createdAt: number;
  updatedAt?: number;
  report?: string;
  error?: string;
}

export const TEAM_REPORTS_STORAGE_KEY = "team_reports_v1";

export const DEFAULT_TEAM_REPORTS: TeamReport[] = [
  {
    code: "600547",
    name: "山东黄金",
    status: "idle",
    createdAt: Date.now(),
  },
];

export function loadTeamReports(): TeamReport[] {
  if (typeof window === "undefined") return DEFAULT_TEAM_REPORTS;
  try {
    const raw = window.localStorage.getItem(TEAM_REPORTS_STORAGE_KEY);
    if (!raw) return DEFAULT_TEAM_REPORTS;
    const parsed = JSON.parse(raw) as TeamReport[];
    return parsed.length > 0 ? parsed : DEFAULT_TEAM_REPORTS;
  } catch {
    return DEFAULT_TEAM_REPORTS;
  }
}

export function saveTeamReports(reports: TeamReport[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    TEAM_REPORTS_STORAGE_KEY,
    JSON.stringify(reports),
  );
}

export function upsertTeamReport(
  reports: TeamReport[],
  nextReport: TeamReport,
): TeamReport[] {
  const existing = reports.find((item) => item.code === nextReport.code);
  const merged = existing
    ? reports.map((item) =>
        item.code === nextReport.code ? { ...item, ...nextReport } : item,
      )
    : [nextReport, ...reports];
  saveTeamReports(merged);
  return merged;
}

export function removeTeamReportByCode(
  reports: TeamReport[],
  code: string,
): TeamReport[] {
  const next = reports.filter((item) => item.code !== code);
  saveTeamReports(next);
  return next;
}

export function getTeamReport(code: string): TeamReport | undefined {
  return loadTeamReports().find((item) => item.code === code);
}

export function getTeamReportPath(code: string): string {
  return `/agents/reports/${encodeURIComponent(code)}`;
}

export function formatReportDate(timestamp?: number): string {
  if (!timestamp) return "未生成";
  return new Date(timestamp).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildStoredReportMarkdown(
  name: string,
  code: string,
  content: string,
  updatedAt: number,
): string {
  return `# ${name}（${code}）Team 分析报告\n\n生成时间：${formatReportDate(updatedAt)}\n\n${content.trim()}`;
}
