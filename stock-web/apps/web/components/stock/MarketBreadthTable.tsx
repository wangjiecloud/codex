"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────── types ─────────────────── */
export interface MarketBreadthRow {
  trade_date: string;
  up_count: number;
  down_count: number;
  flat_count: number;
  limit_up: number;
  limit_down: number;
  st_limit_up: number;
  st_limit_down: number;
  total: number;
}

interface MarketBreadthSummary {
  trade_date: string | null;
  sentiment_score: number | null;
  sentiment_level: string | null;
  sentiment_state: string | null;
  score_change_1d: number | null;
  score_change_5d: number | null;
  recent_5d_avg_score: number | null;
  latest: {
    up_count: number;
    down_count: number;
    flat_count: number;
    limit_up: number;
    limit_down: number;
    st_limit_up: number;
    st_limit_down: number;
    total: number;
    advance_decline_ratio: number;
    breadth_pct: number;
    limit_diff: number;
  } | null;
  signals: string[];
}

function getSentimentTone(level: string | null) {
  switch (level) {
    case "过热":
      return { color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
    case "偏热":
      return { color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
    case "中性":
      return { color: "#94a3b8", bg: "rgba(148,163,184,0.14)" };
    case "偏冷":
      return { color: "#22c55e", bg: "rgba(34,197,94,0.12)" };
    case "冰点":
      return { color: "#38bdf8", bg: "rgba(56,189,248,0.12)" };
    default:
      return { color: "var(--text-secondary)", bg: "var(--bg-tertiary)" };
  }
}

function formatSigned(value: number | null, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/* ─────────────────── Skeleton ─────────────────── */
function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <div
            className="h-4 rounded animate-pulse"
            style={{
              background: "var(--bg-tertiary)",
              width: i === 0 ? "80px" : "48px",
            }}
          />
        </td>
      ))}
    </tr>
  );
}

/* ─────────────────── RatioBar ─────────────────── */
function RatioBar({ up, down }: { up: number; down: number }) {
  const total = up + down;
  if (total === 0)
    return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
  const upPct = (up / total) * 100;
  const downPct = (down / total) * 100;
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex-1 flex h-2 rounded-full overflow-hidden"
        style={{ background: "var(--bg-tertiary)", minWidth: 60 }}
      >
        <div
          style={{
            width: `${upPct}%`,
            background: "rgba(232, 68, 68, 0.75)",
            borderRadius: "9999px 0 0 9999px",
            transition: "width 0.3s ease",
          }}
        />
        <div
          style={{
            width: `${downPct}%`,
            background: "rgba(9, 212, 100, 0.75)",
            borderRadius: "0 9999px 9999px 0",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span
        className="text-[10px] font-mono tabular-nums"
        style={{
          color: "var(--text-tertiary)",
          minWidth: 44,
          textAlign: "right",
        }}
      >
        {upPct.toFixed(0)}:{downPct.toFixed(0)}
      </span>
    </div>
  );
}

/* ─────────────────── Row background ─────────────────── */
function getRowBg(row: MarketBreadthRow): string {
  const limitUpScore = row.limit_up + row.st_limit_up;
  const limitDownScore = row.limit_down + row.st_limit_down;
  const diff = limitUpScore - limitDownScore;
  const maxDiff = 20; // 超过20个涨停/跌停时颜色饱和
  const clamped = Math.max(-maxDiff, Math.min(maxDiff, diff));
  const ratio = clamped / maxDiff;

  if (ratio > 0) {
    const alpha = ratio * 0.06;
    return `rgba(232, 68, 68, ${alpha})`;
  } else if (ratio < 0) {
    const alpha = Math.abs(ratio) * 0.06;
    return `rgba(9, 212, 100, ${alpha})`;
  }
  return "transparent";
}

/* ─────────────────── Main Component ─────────────────── */
export function MarketBreadthTable() {
  const [rows, setRows] = useState<MarketBreadthRow[]>([]);
  const [summary, setSummary] = useState<MarketBreadthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [listRes, summaryRes] = await Promise.all([
        fetch("/api/market-breadth?days=60", {
          cache: "no-store",
        }),
        fetch("/api/market-breadth?summary=1&days=20", {
          cache: "no-store",
        }),
      ]);
      if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
      if (!summaryRes.ok) throw new Error(`HTTP ${summaryRes.status}`);
      const [listData, summaryData] = await Promise.all([
        listRes.json() as Promise<MarketBreadthRow[]>,
        summaryRes.json() as Promise<MarketBreadthSummary>,
      ]);
      setRows(listData);
      setSummary(summaryData);
      setLastUpdated(new Date().toLocaleTimeString("zh-CN"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {summary?.latest && (
        <div
          className="grid grid-cols-1 md:grid-cols-4 gap-3 px-4 py-3 border-b"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-primary)",
          }}
        >
          <div
            className="rounded-xl px-3 py-3"
            style={{
              background: getSentimentTone(summary.sentiment_level).bg,
              border: `1px solid ${getSentimentTone(summary.sentiment_level).bg}`,
            }}
          >
            <div
              className="text-[11px] mb-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              情绪分
            </div>
            <div className="flex items-end gap-2">
              <span
                className="text-2xl font-semibold leading-none"
                style={{
                  color: getSentimentTone(summary.sentiment_level).color,
                }}
              >
                {summary.sentiment_score?.toFixed(1) ?? "—"}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-md"
                style={{
                  color: getSentimentTone(summary.sentiment_level).color,
                  background: getSentimentTone(summary.sentiment_level).bg,
                }}
              >
                {summary.sentiment_level ?? "未知"}
              </span>
            </div>
            <div
              className="mt-2 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              当前状态：{summary.sentiment_state ?? "—"}
            </div>
          </div>

          <div
            className="rounded-xl px-3 py-3"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div
              className="text-[11px] mb-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              情绪变化
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: "var(--text-secondary)" }}>较昨日</span>
                <span
                  className="font-mono"
                  style={{
                    color:
                      (summary.score_change_1d ?? 0) > 0
                        ? "#ef4444"
                        : (summary.score_change_1d ?? 0) < 0
                          ? "#22c55e"
                          : "var(--text-secondary)",
                  }}
                >
                  {formatSigned(summary.score_change_1d)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: "var(--text-secondary)" }}>
                  较5日均值
                </span>
                <span
                  className="font-mono"
                  style={{
                    color:
                      (summary.score_change_5d ?? 0) > 0
                        ? "#ef4444"
                        : (summary.score_change_5d ?? 0) < 0
                          ? "#22c55e"
                          : "var(--text-secondary)",
                  }}
                >
                  {formatSigned(summary.score_change_5d)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: "var(--text-secondary)" }}>5日均分</span>
                <span
                  className="font-mono"
                  style={{ color: "var(--text-primary)" }}
                >
                  {summary.recent_5d_avg_score?.toFixed(1) ?? "—"}
                </span>
              </div>
            </div>
          </div>

          <div
            className="rounded-xl px-3 py-3"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div
              className="text-[11px] mb-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              宽度概览
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: "var(--text-secondary)" }}>涨跌比</span>
                <span
                  className="font-mono"
                  style={{ color: "var(--text-primary)" }}
                >
                  {summary.latest.advance_decline_ratio.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: "var(--text-secondary)" }}>宽度差</span>
                <span
                  className="font-mono"
                  style={{
                    color:
                      summary.latest.breadth_pct > 0
                        ? "#ef4444"
                        : summary.latest.breadth_pct < 0
                          ? "#22c55e"
                          : "var(--text-secondary)",
                  }}
                >
                  {formatSigned(summary.latest.breadth_pct, 2)}%
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: "var(--text-secondary)" }}>涨跌停差</span>
                <span
                  className="font-mono"
                  style={{
                    color:
                      summary.latest.limit_diff > 0
                        ? "#ef4444"
                        : summary.latest.limit_diff < 0
                          ? "#22c55e"
                          : "var(--text-secondary)",
                  }}
                >
                  {formatSigned(summary.latest.limit_diff, 0)}
                </span>
              </div>
            </div>
          </div>

          <div
            className="rounded-xl px-3 py-3"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div
              className="text-[11px] mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              关键信号
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(summary.signals.length > 0
                ? summary.signals
                : [summary.sentiment_state ?? "暂无"]
              )
                .slice(0, 3)
                .map((signal) => (
                  <span
                    key={signal}
                    className="px-2 py-1 rounded-md text-[11px]"
                    style={{
                      background: "var(--bg-tertiary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {signal}
                  </span>
                ))}
            </div>
            <div
              className="mt-2 text-[11px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              交易日：{summary.trade_date ?? "—"}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <TrendingUp size={14} style={{ color: "#e84444" }} />
            <TrendingDown size={14} style={{ color: "#09d464" }} />
          </div>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            市场情绪 · 涨跌分布
          </span>
          {lastUpdated && (
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              更新于 {lastUpdated}
            </span>
          )}
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing || loading}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all",
            "border",
            refreshing || loading
              ? "opacity-50 cursor-not-allowed"
              : "hover:border-[var(--accent)] hover:text-[var(--accent)]",
          )}
          style={{
            background: "var(--bg-tertiary)",
            borderColor: "var(--border-color)",
            color: "var(--text-secondary)",
          }}
        >
          <RefreshCw size={12} className={cn(refreshing && "animate-spin")} />
          刷新
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div
          className="px-4 py-3 text-sm"
          style={{ color: "#e84444", background: "rgba(232,68,68,0.06)" }}
        >
          数据加载失败：{error}
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-auto" style={{ maxHeight: 520 }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr
              className="sticky top-0 z-10"
              style={{ background: "var(--bg-secondary)" }}
            >
              {[
                { label: "日期", align: "left" },
                { label: "涨", align: "right" },
                { label: "跌", align: "right" },
                { label: "平", align: "right" },
                { label: "涨停", align: "right" },
                { label: "跌停", align: "right" },
                { label: "ST涨停", align: "right" },
                { label: "涨跌比", align: "left" },
              ].map(({ label, align }) => (
                <th
                  key={label}
                  className={cn(
                    "px-3 py-2 text-xs font-medium border-b",
                    align === "right" ? "text-right" : "text-left",
                  )}
                  style={{
                    color: "var(--text-tertiary)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))
              : rows.map((row, idx) => (
                  <tr
                    key={row.trade_date}
                    className="transition-colors"
                    style={{
                      background: getRowBg(row),
                      borderBottom:
                        idx < rows.length - 1
                          ? "1px solid var(--border-color)"
                          : undefined,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        getRowBg(row);
                    }}
                  >
                    {/* 日期 */}
                    <td
                      className="px-3 py-2 text-left font-mono text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {row.trade_date}
                    </td>

                    {/* 涨家数 */}
                    <td
                      className="px-3 py-2 text-right font-mono tabular-nums text-xs"
                      style={{ color: "#e84444" }}
                    >
                      {row.up_count.toLocaleString()}
                    </td>

                    {/* 跌家数 */}
                    <td
                      className="px-3 py-2 text-right font-mono tabular-nums text-xs"
                      style={{ color: "#09d464" }}
                    >
                      {row.down_count.toLocaleString()}
                    </td>

                    {/* 平盘 */}
                    <td
                      className="px-3 py-2 text-right font-mono tabular-nums text-xs"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {row.flat_count.toLocaleString()}
                    </td>

                    {/* 涨停 */}
                    <td
                      className="px-3 py-2 text-right font-mono tabular-nums text-xs font-bold"
                      style={{ color: "#e84444" }}
                    >
                      {row.limit_up > 0 ? (
                        <span
                          className="inline-flex items-center justify-center rounded-md px-1.5 py-0.5"
                          style={{
                            background: "rgba(232, 68, 68, 0.12)",
                            color: "#e84444",
                          }}
                        >
                          {row.limit_up}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>0</span>
                      )}
                    </td>

                    {/* 跌停 */}
                    <td
                      className="px-3 py-2 text-right font-mono tabular-nums text-xs font-bold"
                      style={{ color: "#09d464" }}
                    >
                      {row.limit_down > 0 ? (
                        <span
                          className="inline-flex items-center justify-center rounded-md px-1.5 py-0.5"
                          style={{
                            background: "rgba(9, 212, 100, 0.10)",
                            color: "#09d464",
                          }}
                        >
                          {row.limit_down}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>0</span>
                      )}
                    </td>

                    {/* ST涨停（st_limit_up / st_limit_down 合并显示） */}
                    <td
                      className="px-3 py-2 text-right font-mono tabular-nums text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {row.st_limit_up > 0 || row.st_limit_down > 0 ? (
                        <span>
                          <span style={{ color: "#e84444" }}>
                            {row.st_limit_up}
                          </span>
                          <span style={{ color: "var(--text-tertiary)" }}>
                            {" "}
                            /{" "}
                          </span>
                          <span style={{ color: "#09d464" }}>
                            {row.st_limit_down}
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>
                          0 / 0
                        </span>
                      )}
                    </td>

                    {/* 涨跌比进度条 */}
                    <td className="px-3 py-2" style={{ minWidth: 120 }}>
                      <RatioBar up={row.up_count} down={row.down_count} />
                    </td>
                  </tr>
                ))}

            {/* 空状态 */}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-sm"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer stats ── */}
      {!loading && rows.length > 0 && (
        <div
          className="flex items-center gap-4 px-4 py-2 border-t text-xs"
          style={{
            borderColor: "var(--border-color)",
            color: "var(--text-tertiary)",
          }}
        >
          <span>共 {rows.length} 个交易日</span>
          {rows[0] && (
            <>
              <span>
                最新：
                <span style={{ color: "#e84444" }}>涨{rows[0].up_count}</span>
                {" / "}
                <span style={{ color: "#09d464" }}>跌{rows[0].down_count}</span>
              </span>
              <span>
                涨停{" "}
                <span style={{ color: "#e84444", fontWeight: 700 }}>
                  {rows[0].limit_up}
                </span>
                {" / "}
                跌停{" "}
                <span style={{ color: "#09d464", fontWeight: 700 }}>
                  {rows[0].limit_down}
                </span>
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
