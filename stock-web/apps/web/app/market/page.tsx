"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  RefreshCw,
  Calendar,
  BarChart3,
  Activity,
  Target,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = "http://localhost:8000";

// 类型定义
interface FundFlowData {
  inflow: number;
  outflow: number;
  netflow: number;
}

interface MarketFlowSummary {
  north_bound: FundFlowData & {
    sh_netflow: number;
    sz_netflow: number;
    date: string | null;
  };
  investor_type: {
    main: FundFlowData;
    institution: FundFlowData;
    hot_money: FundFlowData;
    retail: FundFlowData;
    total: FundFlowData;
  };
  updated_at: string;
}

interface FundFlowItem {
  name: string;
  changePct: number | null;
  inflow: number | null;
  outflow: number | null;
  netflow: number | null;
  topStock: string;
  topStockChangePct: number | null;
}

interface FuturesPosition {
  date: string;
  longPosition: number;
  shortPosition: number;
  netPosition: number;
}

interface MarketDailyRecord {
  trade_date: string;
  sh_close: number;
  sh_change_pct: number;
  sz_close: number;
  sz_change_pct: number;
  main_net: number;
  main_net_pct: number;
  super_net: number;
  super_net_pct: number;
  big_net: number;
  big_net_pct: number;
  mid_net: number;
  mid_net_pct: number;
  small_net: number;
  small_net_pct: number;
}

interface DailyHistoryResp {
  total: number;
  page: number;
  page_size: number;
  items: MarketDailyRecord[];
}

// 工具函数
function formatMoney(val: number | null): string {
  if (val === null || val === undefined) return "--";
  const absVal = Math.abs(val);
  if (absVal >= 100000000) return `${(val / 100000000).toFixed(2)}亿`;
  if (absVal >= 10000) return `${(val / 10000).toFixed(2)}万`;
  return val.toFixed(2);
}

function formatPercent(val: number | null): string {
  if (val === null) return "--";
  return `${val > 0 ? "+" : ""}${val.toFixed(2)}%`;
}

// 大盘资金流向历史分页列表
function MarketDailyHistoryTable() {
  const [data, setData] = useState<DailyHistoryResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchData = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/market-flow/daily-history?page=${p}&page_size=${PAGE_SIZE}`,
      );
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to fetch daily history:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(page);
  }, [page, fetchData]);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  function NetCell({ val, pct }: { val: number; pct: number }) {
    const pos = val >= 0;
    return (
      <td className="px-3 py-2.5 text-right tabular-nums">
        <div
          className={cn(
            "text-sm font-medium",
            pos ? "text-[#e84444]" : "text-[#09d464]",
          )}
        >
          {pos ? "+" : ""}
          {formatMoney(val)}
        </div>
        <div
          className={cn(
            "text-[10px]",
            pos ? "text-[#e84444]/70" : "text-[#09d464]/70",
          )}
        >
          {pos ? "+" : ""}
          {pct.toFixed(2)}%
        </div>
      </td>
    );
  }

  function ChangePctBadge({ val }: { val: number }) {
    const pos = val >= 0;
    return (
      <span
        className={cn(
          "text-[10px] font-medium",
          pos ? "text-[#e84444]/80" : "text-[#09d464]/80",
        )}
      >
        {pos ? "+" : ""}
        {val.toFixed(2)}%
      </span>
    );
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[#f5a623]" />
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            大盘资金流向历史
          </h3>
          {data && (
            <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded">
              共 {data.total} 个交易日
            </span>
          )}
        </div>
        <button
          onClick={() => fetchData(page)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={cn(loading && "animate-spin")} />
          刷新
        </button>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-tertiary)]">
              <th className="px-3 py-3 text-left font-medium min-w-[90px] sticky left-0 bg-[var(--bg-tertiary)]">
                日期
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[80px]">
                上证-收盘价
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[80px]">
                上证-涨跌幅
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[80px]">
                深证-收盘价
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[80px]">
                深证-涨跌幅
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[110px]">
                主力净流入-净额
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[80px]">
                主力净流入-净占比
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[110px]">
                超大单净流入-净额
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[80px]">
                超大单净流入-净占比
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[110px]">
                大单净流入-净额
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[80px]">
                大单净流入-净占比
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[110px]">
                中单净流入-净额
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[80px]">
                中单净流入-净占比
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[110px]">
                小单净流入-净额
              </th>
              <th className="px-3 py-3 text-right font-medium min-w-[80px]">
                小单净流入-净占比
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={15} className="px-4 py-10 text-center">
                  <div className="flex items-center justify-center gap-2 text-[var(--text-tertiary)]">
                    <RefreshCw size={16} className="animate-spin" />
                    <span className="text-sm">加载中...</span>
                  </div>
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-10 text-center">
                  <span className="text-sm text-[var(--text-tertiary)]">
                    暂无数据，请先触发同步
                  </span>
                </td>
              </tr>
            ) : (
              data.items.map((row) => (
                <tr
                  key={row.trade_date}
                  className="border-t border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  {/* 日期 */}
                  <td className="px-3 py-2.5 text-sm text-[var(--text-secondary)] tabular-nums font-medium sticky left-0 bg-[var(--bg-secondary)]">
                    {row.trade_date}
                  </td>
                  {/* 上证收盘价 */}
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-[var(--text-primary)]">
                    {row.sh_close.toFixed(2)}
                  </td>
                  {/* 上证涨跌幅 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums font-medium",
                      row.sh_change_pct >= 0
                        ? "text-[#e84444]"
                        : "text-[#09d464]",
                    )}
                  >
                    {row.sh_change_pct >= 0 ? "+" : ""}
                    {row.sh_change_pct.toFixed(2)}%
                  </td>
                  {/* 深证收盘价 */}
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-[var(--text-primary)]">
                    {row.sz_close.toFixed(2)}
                  </td>
                  {/* 深证涨跌幅 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums font-medium",
                      row.sz_change_pct >= 0
                        ? "text-[#e84444]"
                        : "text-[#09d464]",
                    )}
                  >
                    {row.sz_change_pct >= 0 ? "+" : ""}
                    {row.sz_change_pct.toFixed(2)}%
                  </td>
                  {/* 主力净流入-净额 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums font-medium",
                      row.main_net >= 0 ? "text-[#e84444]" : "text-[#09d464]",
                    )}
                  >
                    {row.main_net >= 0 ? "+" : ""}
                    {formatMoney(row.main_net)}
                  </td>
                  {/* 主力净流入-净占比 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums",
                      row.main_net_pct >= 0
                        ? "text-[#e84444]"
                        : "text-[#09d464]",
                    )}
                  >
                    {row.main_net_pct >= 0 ? "+" : ""}
                    {row.main_net_pct.toFixed(2)}%
                  </td>
                  {/* 超大单净流入-净额 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums font-medium",
                      row.super_net >= 0 ? "text-[#e84444]" : "text-[#09d464]",
                    )}
                  >
                    {row.super_net >= 0 ? "+" : ""}
                    {formatMoney(row.super_net)}
                  </td>
                  {/* 超大单净流入-净占比 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums",
                      row.super_net_pct >= 0
                        ? "text-[#e84444]"
                        : "text-[#09d464]",
                    )}
                  >
                    {row.super_net_pct >= 0 ? "+" : ""}
                    {row.super_net_pct.toFixed(2)}%
                  </td>
                  {/* 大单净流入-净额 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums font-medium",
                      row.big_net >= 0 ? "text-[#e84444]" : "text-[#09d464]",
                    )}
                  >
                    {row.big_net >= 0 ? "+" : ""}
                    {formatMoney(row.big_net)}
                  </td>
                  {/* 大单净流入-净占比 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums",
                      row.big_net_pct >= 0
                        ? "text-[#e84444]"
                        : "text-[#09d464]",
                    )}
                  >
                    {row.big_net_pct >= 0 ? "+" : ""}
                    {row.big_net_pct.toFixed(2)}%
                  </td>
                  {/* 中单净流入-净额 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums font-medium",
                      row.mid_net >= 0 ? "text-[#e84444]" : "text-[#09d464]",
                    )}
                  >
                    {row.mid_net >= 0 ? "+" : ""}
                    {formatMoney(row.mid_net)}
                  </td>
                  {/* 中单净流入-净占比 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums",
                      row.mid_net_pct >= 0
                        ? "text-[#e84444]"
                        : "text-[#09d464]",
                    )}
                  >
                    {row.mid_net_pct >= 0 ? "+" : ""}
                    {row.mid_net_pct.toFixed(2)}%
                  </td>
                  {/* 小单净流入-净额 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums font-medium",
                      row.small_net >= 0 ? "text-[#e84444]" : "text-[#09d464]",
                    )}
                  >
                    {row.small_net >= 0 ? "+" : ""}
                    {formatMoney(row.small_net)}
                  </td>
                  {/* 小单净流入-净占比 */}
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right text-sm tabular-nums",
                      row.small_net_pct >= 0
                        ? "text-[#e84444]"
                        : "text-[#09d464]",
                    )}
                  >
                    {row.small_net_pct >= 0 ? "+" : ""}
                    {row.small_net_pct.toFixed(2)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {data && totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-color)]">
          <span className="text-xs text-[var(--text-tertiary)]">
            第 {page} / {totalPages} 页，共 {data.total} 条
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} className="text-[var(--text-secondary)]" />
            </button>
            {/* 页码按钮（最多显示5个） */}
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  disabled={loading}
                  className={cn(
                    "min-w-[28px] h-7 rounded text-xs transition-colors",
                    page === pageNum
                      ? "bg-[#f5a623] text-black font-medium"
                      : "hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 transition-colors"
            >
              <ChevronRight
                size={14}
                className="text-[var(--text-secondary)]"
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 板块资金表格
function SectorTable({
  title,
  icon,
  data,
  loading,
  onRefresh,
}: {
  title: string;
  icon: React.ReactNode;
  data: FundFlowItem[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [sortField, setSortField] = useState<
    "netflow" | "changePct" | "inflow"
  >("netflow");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
  });

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <div className="text-[#f5a623]">{icon}</div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded">
            {data.length} 个板块
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={cn(loading && "animate-spin")} />
          刷新
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-tertiary)]">
              <th className="px-4 py-3 text-left font-medium w-8">#</th>
              <th className="px-4 py-3 text-left font-medium min-w-[120px]">
                板块名称
              </th>
              <th
                className="px-4 py-3 text-right font-medium cursor-pointer hover:text-[var(--text-primary)] transition-colors min-w-[100px]"
                onClick={() => handleSort("netflow")}
              >
                <span className="inline-flex items-center gap-1">
                  净流入
                  {sortField === "netflow" && (
                    <span className="text-[#f5a623]">
                      {sortOrder === "desc" ? "↓" : "↑"}
                    </span>
                  )}
                </span>
              </th>
              <th
                className="px-4 py-3 text-right font-medium cursor-pointer hover:text-[var(--text-primary)] transition-colors min-w-[100px]"
                onClick={() => handleSort("inflow")}
              >
                <span className="inline-flex items-center gap-1">
                  流入资金
                  {sortField === "inflow" && (
                    <span className="text-[#f5a623]">
                      {sortOrder === "desc" ? "↓" : "↑"}
                    </span>
                  )}
                </span>
              </th>
              <th className="px-4 py-3 text-right font-medium min-w-[100px]">
                流出资金
              </th>
              <th
                className="px-4 py-3 text-right font-medium cursor-pointer hover:text-[var(--text-primary)] transition-colors min-w-[80px]"
                onClick={() => handleSort("changePct")}
              >
                <span className="inline-flex items-center gap-1">
                  涨跌幅
                  {sortField === "changePct" && (
                    <span className="text-[#f5a623]">
                      {sortOrder === "desc" ? "↓" : "↑"}
                    </span>
                  )}
                </span>
              </th>
              <th className="px-4 py-3 text-left font-medium min-w-[100px]">
                领涨股
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center">
                  <div className="flex items-center justify-center gap-2 text-[var(--text-tertiary)]">
                    <RefreshCw size={16} className="animate-spin" />
                    <span className="text-sm">加载中...</span>
                  </div>
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center">
                  <span className="text-sm text-[var(--text-tertiary)]">
                    暂无数据
                  </span>
                </td>
              </tr>
            ) : (
              sortedData.slice(0, 20).map((item, idx) => {
                const netflowPositive = (item.netflow ?? 0) > 0;
                const changePctPositive = (item.changePct ?? 0) > 0;
                return (
                  <tr
                    key={idx}
                    className="border-t border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <td className="px-4 py-3 text-[11px] text-[var(--text-tertiary)] tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
                      {item.name}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-sm font-bold text-right tabular-nums",
                        netflowPositive ? "text-[#e84444]" : "text-[#09d464]",
                      )}
                    >
                      {formatMoney(item.netflow)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[#e84444] tabular-nums">
                      {formatMoney(item.inflow)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[#09d464] tabular-nums">
                      {formatMoney(item.outflow)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-sm font-medium text-right tabular-nums",
                        changePctPositive ? "text-[#e84444]" : "text-[#09d464]",
                      )}
                    >
                      {formatPercent(item.changePct)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                      {item.topStock}
                      {item.topStockChangePct !== null && (
                        <span
                          className={cn(
                            "ml-1 tabular-nums",
                            (item.topStockChangePct ?? 0) > 0
                              ? "text-[#e84444]"
                              : "text-[#09d464]",
                          )}
                        >
                          {formatPercent(item.topStockChangePct)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 期货持仓
function FuturesPositionPanel({
  data,
  loading,
}: {
  data: FuturesPosition[];
  loading: boolean;
}) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <div className="text-[#f5a623]">
            <Target size={18} />
          </div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            中信证券股指期货持仓 (IF主力合约)
          </h3>
        </div>
      </div>

      <div className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] text-[var(--text-tertiary)] border-b border-[var(--border-color)]">
                <th className="px-3 py-3 text-left font-medium">日期</th>
                <th className="px-3 py-3 text-right font-medium">多单</th>
                <th className="px-3 py-3 text-right font-medium">空单</th>
                <th className="px-3 py-3 text-right font-medium">净持仓</th>
                <th className="px-3 py-3 text-right font-medium">多空比</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-[var(--text-tertiary)]">
                      <RefreshCw size={16} className="animate-spin" />
                      <span className="text-sm">加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <span className="text-sm text-[var(--text-tertiary)]">
                      暂无数据
                    </span>
                  </td>
                </tr>
              ) : (
                data.map((item, idx) => {
                  const ratio =
                    item.shortPosition > 0
                      ? (item.longPosition / item.shortPosition).toFixed(2)
                      : "--";
                  const netPositive = item.netPosition > 0;
                  return (
                    <tr
                      key={idx}
                      className="border-t border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-3 py-3 text-sm text-[var(--text-secondary)] tabular-nums">
                        {item.date}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-[#e84444] font-medium tabular-nums">
                        {item.longPosition.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-[#09d464] font-medium tabular-nums">
                        {item.shortPosition.toLocaleString()}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-sm text-right font-bold tabular-nums",
                          netPositive ? "text-[#e84444]" : "text-[#09d464]",
                        )}
                      >
                        {netPositive ? "+" : ""}
                        {item.netPosition.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-[var(--text-primary)] tabular-nums">
                        {ratio}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 主页面
export default function MarketPage() {
  const [marketSummary, setMarketSummary] = useState<MarketFlowSummary | null>(
    null,
  );
  const [industryData, setIndustryData] = useState<FundFlowItem[]>([]);
  const [conceptData, setConceptData] = useState<FundFlowItem[]>([]);
  const [futuresData, setFuturesData] = useState<FuturesPosition[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [industryLoading, setIndustryLoading] = useState(false);
  const [conceptLoading, setConceptLoading] = useState(false);
  const [futuresLoading, setFuturesLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");

  const fetchMarketSummary = async () => {
    setSummaryLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.set("trade_date", selectedDate);
      const url = `${API_BASE}/api/market-flow/summary${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMarketSummary(data);
      }
    } catch (e) {
      console.error("Failed to fetch market summary:", e);
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchIndustryData = async () => {
    setIndustryLoading(true);
    try {
      const params = new URLSearchParams({ period: "today", limit: "50" });
      if (selectedDate) params.set("trade_date", selectedDate);
      const res = await fetch(`${API_BASE}/api/fund-flow/industry?${params}`);
      if (res.ok) {
        const data = await res.json();
        setIndustryData(data.items ?? []);
      }
    } catch (e) {
      console.error("Failed to fetch industry data:", e);
    } finally {
      setIndustryLoading(false);
    }
  };

  const fetchConceptData = async () => {
    setConceptLoading(true);
    try {
      const params = new URLSearchParams({ period: "today", limit: "50" });
      if (selectedDate) params.set("trade_date", selectedDate);
      const res = await fetch(`${API_BASE}/api/fund-flow/concept?${params}`);
      if (res.ok) {
        const data = await res.json();
        setConceptData(data.items ?? []);
      }
    } catch (e) {
      console.error("Failed to fetch concept data:", e);
    } finally {
      setConceptLoading(false);
    }
  };

  const fetchFuturesPosition = async () => {
    setFuturesLoading(true);
    try {
      // 获取最近5个交易日的数据
      const dates = [];
      for (let i = 0; i < 10; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split("T")[0].replace(/-/g, ""));
      }

      const results = [];
      for (const date of dates) {
        try {
          const res = await fetch(
            `${API_BASE}/api/market-flow/futures/citic?date=${date}&variety=IF`,
          );
          if (res.ok) {
            const data = await res.json();
            results.push({
              date:
                data.date.slice(0, 4) +
                "-" +
                data.date.slice(4, 6) +
                "-" +
                data.date.slice(6, 8),
              longPosition: data.total_long,
              shortPosition: data.total_short,
              netPosition: data.net_position,
            });
          }
        } catch (e) {
          // 跳过获取失败的日期
        }
        if (results.length >= 5) break;
      }

      setFuturesData(results);
    } catch (e) {
      console.error("Failed to fetch futures data:", e);
    } finally {
      setFuturesLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketSummary();
    fetchIndustryData();
    fetchConceptData();
    fetchFuturesPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  return (
    <div className="min-h-full p-6 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
              市场资金流向
            </h1>
            <p className="text-sm text-[var(--text-tertiary)]">
              实时监控主力、机构、游资、散户以及北向资金的流向动态
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-3 py-2">
              <Calendar size={14} className="text-[var(--text-tertiary)]" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm text-[var(--text-primary)] outline-none"
              />
            </div>
            <button
              onClick={() => {
                fetchMarketSummary();
                fetchIndustryData();
                fetchConceptData();
              }}
              className="flex items-center gap-2 bg-[#f5a623] hover:bg-[#e8961a] text-black font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <RefreshCw size={14} />
              全部刷新
            </button>
          </div>
        </div>
      </div>

      {/* 大盘资金流向分类（标题行） */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[#f5a623]" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            市场资金流向分类
          </h2>
          <span className="text-xs text-[var(--text-tertiary)]">
            今日A股整体资金流向
          </span>
        </div>
      </div>

      {/* 大盘资金流向历史分页表（替换原5卡片区域） */}
      <div className="mb-6">
        <MarketDailyHistoryTable />
      </div>

      {/* 板块资金流向 */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <SectorTable
          title="行业板块资金流向"
          icon={<BarChart3 size={18} />}
          data={industryData}
          loading={industryLoading}
          onRefresh={fetchIndustryData}
        />
        <SectorTable
          title="概念板块资金流向"
          icon={<Activity size={18} />}
          data={conceptData}
          loading={conceptLoading}
          onRefresh={fetchConceptData}
        />
      </div>

      {/* 期货持仓 */}
      <FuturesPositionPanel data={futuresData} loading={futuresLoading} />

      {/* 更新时间 */}
      {marketSummary && (
        <div className="mt-4 text-xs text-[var(--text-tertiary)] text-center">
          数据更新时间: {marketSummary.updated_at}
        </div>
      )}
    </div>
  );
}
