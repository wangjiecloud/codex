"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Search,
  X,
  BarChart2,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";
const MIN_TOP_PX = 80;
const MIN_BOTTOM_PX = 60;

interface SwBoard {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  volume: number;
  turnover: number;
  peStatic: number;
  peTtm: number;
  pb: number;
  dividendYield: number;
  compCount: number;
  updatedAt: string | null;
}

interface SwConstituent {
  code: string;
  name: string;
  price: number;
  changePct: number;
  changeAmt: number;
  open: number;
  prevClose: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
  marketCap: number;
  pe: number;
  pb: number;
  turnoverRate: number;
  updatedAt: string | null;
}

interface StockSearchResult {
  code: string;
  name: string;
  price?: number;
  change?: number;
}

type SortKey =
  | "changePct"
  | "turnover"
  | "volume"
  | "peTtm"
  | "pb"
  | "compCount"
  | "name"
  | "price";

type ConsSortKey =
  | "changePct"
  | "price"
  | "turnover"
  | "marketCap"
  | "pe"
  | "pb"
  | "name";

function pct(v: number) {
  if (v > 0) return "text-[#e84444]";
  if (v < 0) return "text-[#09d464]";
  return "text-[var(--text-secondary)]";
}
function sgn(v: number) {
  return v > 0 ? "+" : "";
}
function fmt(v: number | null | undefined, dec = 2) {
  if (v === undefined || v === null || isNaN(v)) return "--";
  if (v === 0) return "--";
  return v.toFixed(dec);
}
function fmtNum(v: number) {
  if (!v) return "--";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(0);
}

function SortIcon({
  col,
  active,
  order,
}: {
  col: string;
  active: string;
  order: "asc" | "desc";
}) {
  if (col !== active)
    return (
      <ArrowUpDown size={11} className="text-[var(--text-tertiary)] ml-0.5" />
    );
  return order === "asc" ? (
    <ChevronUp size={11} className="text-[#e8a235] ml-0.5" />
  ) : (
    <ChevronDown size={11} className="text-[#e8a235] ml-0.5" />
  );
}

interface RotationBoard {
  code: string;
  name: string;
  tag: string | null;
  currentChangePct: number;
  data: (number | null)[];
}

interface RotationData {
  dates: string[];
  boards: RotationBoard[];
}

/* 产业板块 code 格式：{industry_id}_{layer}，如 pcb_core / aigpu_upstream */
const INDUSTRY_IDS = new Set([
  "overview",
  "aigpu",
  "pcb",
  "mlcc",
  "memory",
  "optics",
  "fiber",
  "liquidcool",
  "aipower",
  "coppercable",
  "idc",
  "glasssub",
  "aiserver",
  "semieq",
]);

/** 解析产业板块 code，返回 { industryId, layer } 或 null（非产业板块）*/
function parseIndustryBoardCode(
  code: string,
): { industryId: string; layer: string } | null {
  const lastUnderscore = code.lastIndexOf("_");
  if (lastUnderscore === -1) return null;
  const industryId = code.slice(0, lastUnderscore);
  const layer = code.slice(lastUnderscore + 1);
  if (!INDUSTRY_IDS.has(industryId)) return null;
  return { industryId, layer };
}

function heatColor(v: number | null): string {
  if (v === null || v === undefined) return "var(--bg-tertiary)";
  const clamped = Math.max(-5, Math.min(5, v));
  if (clamped >= 0) {
    const intensity = clamped / 5;
    const r = Math.round(100 + intensity * 132);
    const g = Math.round(40 - intensity * 15);
    const b = Math.round(40 - intensity * 15);
    return `rgb(${r},${g},${b})`;
  } else {
    const intensity = Math.abs(clamped) / 5;
    const r = Math.round(20 - intensity * 10);
    const g = Math.round(140 + intensity * 72);
    const b = Math.round(60 + intensity * 60);
    return `rgb(${r},${g},${b})`;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 资金流向弹窗
// ──────────────────────────────────────────────────────────────────────────────

interface FundFlowItem {
  name: string;
  index: number | null;
  changePct: number | null;
  inflow: number | null;
  outflow: number | null;
  netflow: number | null;
  compCount: number | null;
  topStock: string;
  topStockChangePct: number | null;
  topStockPrice: number | null;
}

// /dates 接口返回格式：{ today: [...], "3d": [...], "5d": [...], "10d": [...] }
type DatesMap = Partial<Record<"today" | "3d" | "5d" | "10d", string[]>>;

const PERIOD_LABELS: Record<string, string> = {
  "today": "今日",
  "3d": "3日",
  "5d": "5日",
  "10d": "10日",
};

function FundFlowModal({ onClose }: { onClose: () => void }) {
  const [boardType, setBoardType] = useState<"concept" | "industry">("concept");
  const [period, setPeriod] = useState<"today" | "3d" | "5d" | "10d">("today");
  // selectedDate: null = 今日（实时或读今日库存），非 null = 历史日期
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // datesMap: 各 period 下有数据的交易日列表
  const [datesMap, setDatesMap] = useState<DatesMap>({});
  const [sortField, setSortField] = useState<
    "netflow" | "inflow" | "outflow" | "changePct"
  >("netflow");
  const [sortOrder, setSortOrderFF] = useState<"desc" | "asc">("desc");
  const [items, setItems] = useState<FundFlowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");

  // 组件挂载时：1) 触发后台异步快照 2) 获取各 period 的已有快照日期
  useEffect(() => {
    // 后台静默拉取最新数据入库，不阻塞 UI
    fetch(`${API}/api/fund-flow/snapshot`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
    // 获取日期列表
    fetch(`${API}/api/fund-flow/dates`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: DatesMap) => setDatesMap(d))
      .catch(() => {});
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        sort: sortField,
        order: sortOrder,
        limit: "500",
        period,
      });
      if (selectedDate) {
        params.set("trade_date", selectedDate);
      }
      const res = await fetch(`${API}/api/fund-flow/${boardType}?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError("数据获取失败，请稍后重试");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [boardType, period, selectedDate, sortField, sortOrder]);

  const fmtFlow = (v: number | null) => {
    if (v === null || v === undefined) return "--";
    return v.toFixed(2) + "亿";
  };

  const maxAbsNetflow = Math.max(
    ...items.map((i) => Math.abs(i.netflow ?? 0)),
    1,
  );

  const filteredItems = searchText.trim()
    ? items.filter((i) => {
        const search = searchText.trim().toLowerCase();
        // 支持搜索板块名称或领涨股名称
        return (
          i.name.toLowerCase().includes(search) ||
          i.topStock.toLowerCase().includes(search)
        );
      })
    : items;

  // 日期维度 tabs：T（今日）+ T-1~T-5（取 today period 的历史日期）
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayDates = datesMap["today"] ?? [];
  // 当前 period 有数据的日期集合
  const periodDates = new Set(datesMap[period] ?? []);
  // 历史日期：排除今天，最多5条
  const histDates = todayDates.filter((d) => d < todayStr).slice(0, 5);

  const SORT_FIELDS = [
    { key: "netflow", label: "净流入" },
    { key: "inflow", label: "流入" },
    { key: "outflow", label: "流出" },
    { key: "changePct", label: "涨跌幅" },
  ] as const;

  const toggleSortFF = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrderFF((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortOrderFF("desc");
    }
  };

  // 切换日期时，若历史日期下当前 period 无数据，自动回退到 today
  const handleDateSelect = (d: string | null) => {
    setSelectedDate(d);
    if (d && !periodDates.has(d) && period !== "today") {
      setPeriod("today");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden"
        style={{ width: "min(1100px, 95vw)", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex flex-col gap-2 px-5 pt-3 pb-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex-shrink-0">
          {/* 第一行：标题 + 板块类型 + 搜索 + 关闭 */}
          <div className="flex items-center gap-3">
            <TrendingUp size={15} className="text-[var(--accent)]" />
            <span className="text-[14px] font-bold text-[var(--text-primary)]">
              板块主力资金流向
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              来源：同花顺数据中心
            </span>

            {/* 板块类型 */}
            <div className="flex items-center gap-1 ml-2">
              {(["concept", "industry"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setBoardType(t)}
                  className={cn(
                    "px-2.5 py-0.5 rounded text-[11px] transition-colors",
                    boardType === t
                      ? "bg-[var(--accent)] text-black font-medium"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                  )}
                >
                  {t === "concept" ? "概念板块" : "行业板块"}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索板块/股票..."
                className="px-2 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors w-28"
              />
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <RefreshCw
                  size={11}
                  className={cn(loading && "animate-spin")}
                />
                刷新
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 第二行：日期 tabs（T / T-1 ~ T-5）+ period sub-tabs（今日/3日/5日/10日） */}
          <div className="flex items-center gap-3">
            {/* 日期维度 */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--text-tertiary)] mr-0.5">
                日期
              </span>
              {/* T：今日 */}
              <button
                onClick={() => handleDateSelect(null)}
                className={cn(
                  "px-2 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                  selectedDate === null
                    ? "bg-[var(--accent)] text-black font-medium"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                )}
              >
                T
              </button>
              {/* T-1 ~ T-5 */}
              {histDates.length === 0 ? (
                <span className="text-[10px] text-[var(--text-tertiary)] opacity-50 ml-1">
                  T-1~T-5 每日积累
                </span>
              ) : (
                histDates.map((d, i) => {
                  const mm = d.slice(5, 7);
                  const dd = d.slice(8, 10);
                  return (
                    <button
                      key={d}
                      onClick={() => handleDateSelect(d)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                        selectedDate === d
                          ? "bg-[var(--accent)] text-black font-medium"
                          : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                      )}
                    >
                      T-{i + 1}
                      <span className="ml-0.5 text-[9px] opacity-60">
                        ({mm}/{dd})
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="w-px h-3 bg-[var(--border-color)]" />

            {/* Period 维度：今日/3日/5日/10日 */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--text-tertiary)] mr-0.5">
                周期
              </span>
              {(["today", "3d", "5d", "10d"] as const).map((p) => {
                // 历史日期下：仅当该 period 有当天数据时可点击
                const disabled =
                  selectedDate !== null && !periodDates.has(selectedDate);
                const unavailable =
                  selectedDate !== null && !periodDates.has(selectedDate);
                return (
                  <button
                    key={p}
                    onClick={() => !unavailable && setPeriod(p)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                      period === p
                        ? "bg-[var(--accent)] text-black font-medium"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                      unavailable && p !== "today"
                        ? "opacity-30 cursor-not-allowed"
                        : "",
                    )}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                );
              })}
            </div>

            {selectedDate && (
              <span className="text-[10px] text-[var(--accent)] ml-1">
                历史快照 {selectedDate}
              </span>
            )}
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-[var(--text-tertiary)] text-sm gap-2">
              <RefreshCw size={14} className="animate-spin" />
              {selectedDate
                ? "读取历史快照..."
                : "拉取数据中（同花顺接口约需5-10秒）..."}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <span className="text-[var(--text-tertiary)] text-sm">
                {error}
              </span>
              <button
                onClick={fetchData}
                className="px-3 py-1.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] text-sm"
              >
                重试
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-[var(--text-tertiary)] text-sm">
              {selectedDate
                ? `${selectedDate} ${PERIOD_LABELS[period]} 暂无历史快照数据`
                : "今日暂无数据（非交易时段或接口未返回数据）"}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium w-6 text-center">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium whitespace-nowrap">
                    板块名称
                  </th>
                  <th className="px-3 py-2 text-right text-[var(--text-tertiary)] font-medium whitespace-nowrap w-36">
                    净流入可视化
                  </th>
                  {SORT_FIELDS.map((f) => (
                    <th
                      key={f.key}
                      onClick={() => toggleSortFF(f.key)}
                      className="px-3 py-2 text-right text-[var(--text-tertiary)] font-medium whitespace-nowrap cursor-pointer hover:text-[var(--text-primary)] select-none"
                    >
                      <span className="inline-flex items-center justify-end gap-0.5">
                        {f.label}
                        {sortField === f.key ? (
                          sortOrder === "desc" ? (
                            <ChevronDown
                              size={10}
                              className="text-[var(--accent)]"
                            />
                          ) : (
                            <ChevronUp
                              size={10}
                              className="text-[var(--accent)]"
                            />
                          )
                        ) : (
                          <ArrowUpDown size={10} className="opacity-40" />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right text-[var(--text-tertiary)] font-medium whitespace-nowrap">
                    家数
                  </th>
                  <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium whitespace-nowrap">
                    领涨股
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const netflow = item.netflow ?? 0;
                  const barPct = Math.abs(netflow) / maxAbsNetflow;
                  const isPositive = netflow >= 0;
                  return (
                    <tr
                      key={item.name + idx}
                      className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-3 py-1.5 text-center text-[var(--text-tertiary)]">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-[var(--text-primary)] whitespace-nowrap">
                        {item.name}
                      </td>
                      {/* 条形图 */}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-28 h-3 bg-[var(--bg-tertiary)] rounded-full overflow-hidden flex">
                            {isPositive ? (
                              <div
                                className="h-full rounded-full ml-auto bg-[#e84444]"
                                style={{ width: `${barPct * 100}%` }}
                              />
                            ) : (
                              <div
                                className="h-full rounded-full bg-[#09d464]"
                                style={{ width: `${barPct * 100}%` }}
                              />
                            )}
                          </div>
                        </div>
                      </td>
                      {/* 净额 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono font-semibold whitespace-nowrap",
                          netflow > 0
                            ? "text-[#e84444]"
                            : netflow < 0
                              ? "text-[#09d464]"
                              : "text-[var(--text-secondary)]",
                        )}
                      >
                        {netflow > 0 ? "+" : ""}
                        {fmtFlow(item.netflow)}
                      </td>
                      {/* 流入 */}
                      <td className="px-3 py-1.5 text-right font-mono text-[#e84444] whitespace-nowrap">
                        {fmtFlow(item.inflow)}
                      </td>
                      {/* 流出 */}
                      <td className="px-3 py-1.5 text-right font-mono text-[#09d464] whitespace-nowrap">
                        {fmtFlow(item.outflow)}
                      </td>
                      {/* 涨跌幅 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono whitespace-nowrap",
                          (item.changePct ?? 0) > 0
                            ? "text-[#e84444]"
                            : (item.changePct ?? 0) < 0
                              ? "text-[#09d464]"
                              : "text-[var(--text-secondary)]",
                        )}
                      >
                        {item.changePct !== null
                          ? `${item.changePct > 0 ? "+" : ""}${item.changePct?.toFixed(2)}%`
                          : "--"}
                      </td>
                      {/* 家数 */}
                      <td className="px-3 py-1.5 text-right text-[var(--text-secondary)]">
                        {item.compCount ?? "--"}
                      </td>
                      {/* 领涨股 */}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[var(--text-primary)]">
                            {item.topStock || "--"}
                          </span>
                          {item.topStockChangePct !== null &&
                            item.topStockChangePct !== undefined && (
                              <span
                                className={cn(
                                  "text-[10px] font-mono",
                                  item.topStockChangePct > 0
                                    ? "text-[#e84444]"
                                    : "text-[#09d464]",
                                )}
                              >
                                {item.topStockChangePct > 0 ? "+" : ""}
                                {item.topStockChangePct.toFixed(2)}%
                              </span>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 底栏 */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex-shrink-0 text-[10px] text-[var(--text-tertiary)]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-sm bg-[#e84444]" />
            主力净流入
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-sm bg-[#09d464]" />
            主力净流出
          </div>
          <span>共 {filteredItems.length} 个板块</span>
          <span className="ml-auto">
            数据来源：同花顺数据中心 · 仅供参考，不构成投资建议
          </span>
        </div>
      </div>
    </div>
  );
}

function RotationModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<RotationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);
  const [sortBy, setSortBy] = useState<"name" | "recent" | "cumulative">(
    "recent",
  );
  const [rotationSortOrder, setRotationSortOrder] = useState<"desc" | "asc">(
    "desc",
  );
  const [onlyIndustry, setOnlyIndustry] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [syncing, setSyncingRotation] = useState(false);

  const handleForceSync = async () => {
    setSyncingRotation(true);
    try {
      await fetch(`${API}/api/sw-industry/sync-klines?force=true`, {
        method: "POST",
        cache: "no-store",
      });
      // 等待后台同步完成（force 模式只补日K，约15秒），再重新拉 rotation 数据
      await new Promise((r) => setTimeout(r, 15000));
      setLoading(true);
      const endpoint = onlyIndustry
        ? `${API}/api/board/industry-rotation?days=${days}`
        : `${API}/api/sw-industry/rotation?days=${days}`;
      const r = await fetch(endpoint);
      const d = await r.json();
      if (d && Array.isArray(d.boards)) setData(d);
    } catch {
      // ignore
    } finally {
      setSyncingRotation(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    // 申万板块 K 线
    fetch(`${API}/api/sw-industry/sync-klines`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
    // 产业板块 K 线聚合计算
    fetch(`${API}/api/board/calc-industry-kline`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const endpoint = onlyIndustry
      ? `${API}/api/board/industry-rotation?days=${days}`
      : `${API}/api/sw-industry/rotation?days=${days}`;
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.boards)) {
          setData(d);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days, onlyIndustry]);

  const sortedBoards =
    data && Array.isArray(data.boards)
      ? [...data.boards]
          .filter((b) => !onlyIndustry || b.tag !== null)
          .filter((b) => {
            if (!searchText.trim()) return true;
            const q = searchText.trim().toLowerCase();
            return b.name.toLowerCase().includes(q);
          })
          .sort((a, b) => {
            if (sortBy === "recent") {
              return rotationSortOrder === "desc"
                ? b.currentChangePct - a.currentChangePct
                : a.currentChangePct - b.currentChangePct;
            }
            if (sortBy === "cumulative") {
              const sumA =
                a.data.reduce<number>((acc, v) => acc + (v ?? 0), 0) +
                a.currentChangePct;
              const sumB =
                b.data.reduce<number>((acc, v) => acc + (v ?? 0), 0) +
                b.currentChangePct;
              return rotationSortOrder === "desc" ? sumB - sumA : sumA - sumB;
            }
            return a.name.localeCompare(b.name);
          })
      : [];

  const dates = data?.dates ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden"
        style={{ width: "min(1100px, 95vw)", maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-0 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex-shrink-0">
          {/* 第一行：标题 + 搜索 + 关闭 */}
          <div className="flex items-center gap-3 px-5 pt-3 pb-2">
            <BarChart2 size={15} className="text-[var(--accent)]" />
            <span className="text-[14px] font-bold text-[var(--text-primary)]">
              板块轮动热力图
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)] hidden sm:inline">
              颜色越红=涨幅越大，越绿=跌幅越大
            </span>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索板块..."
              className="ml-auto px-2.5 py-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors w-32"
            />
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
          {/* 第二行：所有控件 */}
          <div className="flex items-center gap-1.5 px-5 pb-2.5 flex-wrap">
            {/* 仅产业板块 */}
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyIndustry}
                onChange={(e) => setOnlyIndustry(e.target.checked)}
                className="w-3 h-3 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                仅产业板块
              </span>
            </label>

            <div className="w-px h-3 bg-[var(--border-color)] mx-1 flex-shrink-0" />

            {/* 周期 */}
            <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">
              周期
            </span>
            {[7, 10, 14, 21].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "px-2.5 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                  days === d
                    ? "bg-[var(--accent)] text-black font-semibold"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                )}
              >
                {d}天
              </button>
            ))}

            <div className="w-px h-3 bg-[var(--border-color)] mx-1 flex-shrink-0" />

            {/* 排序 */}
            <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">
              排序
            </span>
            <button
              onClick={() => {
                if (sortBy === "recent") {
                  setRotationSortOrder((o) => (o === "desc" ? "asc" : "desc"));
                } else {
                  setSortBy("recent");
                  setRotationSortOrder("desc");
                }
              }}
              className={cn(
                "px-2.5 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                sortBy === "recent"
                  ? "bg-[var(--accent)] text-black font-semibold"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
              )}
            >
              最新涨幅
            </button>
            <button
              onClick={() => setSortBy("name")}
              className={cn(
                "px-2.5 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                sortBy === "name"
                  ? "bg-[var(--accent)] text-black font-semibold"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
              )}
            >
              板块名称
            </button>

            {/* 补全数据 — 推到最右 */}
            <button
              onClick={handleForceSync}
              disabled={syncing}
              className={cn(
                "ml-auto flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] transition-colors whitespace-nowrap flex-shrink-0",
                syncing
                  ? "border-[var(--accent)]/40 text-[var(--accent)] opacity-70 cursor-not-allowed"
                  : "border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50",
              )}
            >
              <RefreshCw size={11} className={cn(syncing && "animate-spin")} />
              {syncing ? "同步中..." : "补全数据"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-[var(--text-tertiary)] text-sm">
              加载中...
            </div>
          ) : !data ||
            !Array.isArray(data.boards) ||
            data.boards.length === 0 ||
            dates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="text-[var(--text-tertiary)] text-sm">
                暂无K线缓存数据
              </span>
              <span className="text-[var(--text-tertiary)] text-xs">
                请先在板块详情页查看K线以触发数据缓存，或在系统监控页执行一键刷新
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="border-collapse text-xs"
                style={{ minWidth: dates.length * 52 + 260 }}
              >
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[var(--bg-primary)] px-3 py-1.5 text-left text-[var(--text-tertiary)] font-medium whitespace-nowrap w-44 min-w-44">
                      板块
                    </th>
                    {dates.map((d) => (
                      <th
                        key={d}
                        className="px-1 py-1.5 text-center text-[var(--text-tertiary)] font-normal whitespace-nowrap"
                        style={{ minWidth: 48 }}
                      >
                        <span className="text-[10px]">{d.slice(5)}</span>
                      </th>
                    ))}
                    <th className="px-3 py-1.5 text-center font-medium whitespace-nowrap text-[10px]">
                      <span className="text-[var(--accent)]">今日实时</span>
                    </th>
                    <th
                      className="px-3 py-1.5 text-center font-medium whitespace-nowrap text-[10px] cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors"
                      onClick={() => {
                        if (sortBy === "cumulative") {
                          setRotationSortOrder((o) =>
                            o === "desc" ? "asc" : "desc",
                          );
                        } else {
                          setSortBy("cumulative");
                          setRotationSortOrder("desc");
                        }
                      }}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5",
                          sortBy === "cumulative"
                            ? "text-[var(--accent)]"
                            : "text-[var(--text-secondary)]",
                        )}
                      >
                        累计涨幅
                        {sortBy === "cumulative" ? (
                          rotationSortOrder === "desc" ? (
                            <ChevronDown
                              size={10}
                              className="text-[var(--accent)]"
                            />
                          ) : (
                            <ChevronUp
                              size={10}
                              className="text-[var(--accent)]"
                            />
                          )
                        ) : (
                          <ArrowUpDown size={10} className="opacity-40" />
                        )}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBoards.map((board) => {
                    const industryInfo = parseIndustryBoardCode(board.code);
                    return (
                      <tr
                        key={board.code}
                        className="hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <td className="sticky left-0 z-10 bg-[var(--bg-primary)] px-3 py-1 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {industryInfo ? (
                              <button
                                className="text-[12px] text-[var(--text-primary)] font-medium hover:text-[var(--accent)] transition-colors text-left"
                                onClick={() =>
                                  window.open(
                                    `/industry/${industryInfo.industryId}?tab=chain&layer=${industryInfo.layer}`,
                                    "_blank",
                                  )
                                }
                              >
                                {board.name}
                              </button>
                            ) : (
                              <span className="text-[12px] text-[var(--text-primary)] font-medium">
                                {board.name}
                              </span>
                            )}
                            {board.tag && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] leading-none">
                                {board.tag}
                              </span>
                            )}
                          </div>
                        </td>
                        {board.data.map((v, i) => (
                          <td key={i} className="px-0.5 py-0.5">
                            <div
                              className="rounded flex items-center justify-center font-mono"
                              style={{
                                background: heatColor(v),
                                width: 44,
                                height: 26,
                                fontSize: 10,
                                color:
                                  v === null ? "var(--text-tertiary)" : "#fff",
                                opacity: v === null ? 0.4 : 1,
                              }}
                            >
                              {v === null
                                ? "--"
                                : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                            </div>
                          </td>
                        ))}
                        <td className="px-3 py-1 text-center">
                          <span
                            className={cn(
                              "text-[11px] font-mono font-semibold",
                              board.currentChangePct > 0
                                ? "text-[#e84444]"
                                : board.currentChangePct < 0
                                  ? "text-[#09d464]"
                                  : "text-[var(--text-secondary)]",
                            )}
                          >
                            {board.currentChangePct > 0 ? "+" : ""}
                            {board.currentChangePct.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-3 py-1 text-center">
                          {(() => {
                            const sum =
                              board.data.reduce<number>(
                                (acc, v) => acc + (v ?? 0),
                                0,
                              ) + board.currentChangePct;
                            return (
                              <span
                                className={cn(
                                  "text-[11px] font-mono font-semibold",
                                  sum > 0
                                    ? "text-[#e84444]"
                                    : sum < 0
                                      ? "text-[#09d464]"
                                      : "text-[var(--text-secondary)]",
                                )}
                              >
                                {sum > 0 ? "+" : ""}
                                {sum.toFixed(2)}%
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-2.5 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex-shrink-0">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            涨跌幅色阶：
          </span>
          {[-5, -3, -1, 0, 1, 3, 5].map((v) => (
            <div key={v} className="flex items-center gap-1">
              <div
                className="rounded"
                style={{ width: 20, height: 12, background: heatColor(v) }}
              />
              <span className="text-[9px] text-[var(--text-tertiary)]">
                {v > 0 ? "+" : ""}
                {v}%
              </span>
            </div>
          ))}
          <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
            Top20涨跌幅板块 + 产业分析关联板块 · 数据来源: K线缓存
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SwIndustryPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<SwBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("changePct");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedBoard, setSelectedBoard] = useState<SwBoard | null>(null);
  const [constituents, setConstituents] = useState<SwConstituent[]>([]);
  const [consLoading, setConsLoading] = useState(false);
  const [consSortKey, setConsSortKey] = useState<ConsSortKey>("changePct");
  const [consSortOrder, setConsSortOrder] = useState<"asc" | "desc">("desc");
  const [syncing, setSyncing] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [showFundFlow, setShowFundFlow] = useState(false);
  const [onlyIndustryBoards, setOnlyIndustryBoards] = useState(false);
  const [deletingBoard, setDeletingBoard] = useState<string | null>(null);

  const [topHeight, setTopHeight] = useState(300);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const onResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartHeight.current = topHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerH = containerRef.current.clientHeight;
      const delta = e.clientY - dragStartY.current;
      const next = dragStartHeight.current + delta;
      const clamped = Math.min(
        Math.max(next, MIN_TOP_PX),
        containerH - MIN_BOTTOM_PX - 4,
      );
      setTopHeight(clamped);
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const [stockQuery, setStockQuery] = useState("");
  const [stockResults, setStockResults] = useState<StockSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(
    null,
  );
  const [stockBoards, setStockBoards] = useState<
    { code: string; name: string }[]
  >([]);
  const [industryBoards, setIndustryBoards] = useState<SwBoard[]>([]);
  const [boardNameFilter, setBoardNameFilter] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBoards = useCallback(async () => {
    try {
      const r = await fetch(
        `${API}/api/sw-industry?sort=${sortKey}&order=${sortOrder}`,
      );
      if (r.ok) {
        const data = await r.json();
        setBoards(data);
      }
    } finally {
      setLoading(false);
    }
  }, [sortKey, sortOrder]);

  const fetchIndustryBoards = useCallback(async () => {
    try {
      const r = await fetch(
        `${API}/api/board/industry?sort=${sortKey === "changePct" ? "change_pct" : sortKey}&limit=200`,
      );
      if (r.ok) {
        const data = await r.json();
        setIndustryBoards(data);
      }
    } catch (err) {
      console.error("Failed to fetch industry boards:", err);
    }
  }, [sortKey]);

  useEffect(() => {
    fetchBoards();
    if (onlyIndustryBoards) {
      fetchIndustryBoards();
    }
  }, [fetchBoards, onlyIndustryBoards, fetchIndustryBoards]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleStockInput = (val: string) => {
    setStockQuery(val);
    setBoardNameFilter(val.trim());
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setStockResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `${API}/api/search?q=${encodeURIComponent(val)}&limit=8`,
        );
        if (r.ok) {
          const data = await r.json();
          setStockResults(data.results ?? []);
          setShowDropdown(true);
        }
      } catch {
        setStockResults([]);
      }
    }, 200);
  };

  const handleSelectStock = async (stock: StockSearchResult) => {
    setSelectedStock(stock);
    setStockQuery(`${stock.name} ${stock.code}`);
    setShowDropdown(false);
    setStockResults([]);
    const r = await fetch(
      `${API}/api/sw-industry/boards-by-stock/${stock.code}`,
    );
    if (r.ok) {
      const data: { code: string; name: string }[] = await r.json();
      setStockBoards(data);
      if (data.length === 1) {
        const board = boards.find((b) => b.code === data[0].code);
        if (board) fetchConstituents(board);
      } else {
        setSelectedBoard(null);
        setConstituents([]);
      }
    } else {
      setStockBoards([]);
    }
  };

  const clearStockFilter = () => {
    setSelectedStock(null);
    setStockBoards([]);
    setStockQuery("");
    setStockResults([]);
    setShowDropdown(false);
    setBoardNameFilter("");
  };

  const fetchConstituents = async (board: SwBoard) => {
    setSelectedBoard(board);
    setConsLoading(true);
    try {
      const endpoint = onlyIndustryBoards
        ? `${API}/api/board/industry-constituents/${board.code}`
        : `${API}/api/sw-industry/constituents/${board.code}`;
      const r = await fetch(endpoint);
      if (r.ok) {
        const data: SwConstituent[] = await r.json();
        setConstituents(data);
      }
    } finally {
      setConsLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`${API}/api/sw-industry/sync`, { method: "POST" });
      setTimeout(() => {
        fetchBoards();
        setSyncing(false);
      }, 4000);
    } catch {
      setSyncing(false);
    }
  };

  const handleDeleteBoard = async (boardCode: string, boardName: string) => {
    if (
      !confirm(
        `确定要删除板块"${boardName}"吗？\n\n此操作将删除该板块的所有节点数据，不可恢复！`,
      )
    ) {
      return;
    }

    setDeletingBoard(boardCode);
    try {
      const r = await fetch(`${API}/api/board/industry/${boardCode}`, {
        method: "DELETE",
      });
      if (r.ok) {
        if (selectedBoard?.code === boardCode) {
          setSelectedBoard(null);
          setConstituents([]);
        }
        fetchIndustryBoards();
      } else {
        const data = await r.json();
        alert(`删除失败: ${data.detail || "未知错误"}`);
      }
    } catch (error) {
      alert("删除失败，请稍后重试");
    } finally {
      setDeletingBoard(null);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const sortedCons = [...constituents].sort((a, b) => {
    if (selectedStock) {
      if (a.code === selectedStock.code) return -1;
      if (b.code === selectedStock.code) return 1;
    }
    const v = (x: SwConstituent) => {
      switch (consSortKey) {
        case "changePct":
          return x.changePct;
        case "price":
          return x.price;
        case "turnover":
          return x.turnover;
        case "marketCap":
          return x.marketCap;
        case "pe":
          return x.pe;
        case "pb":
          return x.pb;
        case "name":
          return 0;
        default:
          return 0;
      }
    };
    if (consSortKey === "name") {
      return consSortOrder === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    }
    return consSortOrder === "asc" ? v(a) - v(b) : v(b) - v(a);
  });

  const toggleConSort = (key: ConsSortKey) => {
    if (consSortKey === key) {
      setConsSortOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setConsSortKey(key);
      setConsSortOrder("desc");
    }
  };

  const filteredBoards = onlyIndustryBoards
    ? boardNameFilter
      ? industryBoards.filter((b) =>
          b.name.toLowerCase().includes(boardNameFilter.toLowerCase()),
        )
      : industryBoards
    : stockBoards.length > 0
      ? boards.filter((b) => stockBoards.some((sb) => sb.code === b.code))
      : boardNameFilter
        ? boards.filter((b) =>
            b.name.toLowerCase().includes(boardNameFilter.toLowerCase()),
          )
        : boards;

  type ColKey = SortKey | "action";
  const BOARD_COLS: { key: ColKey; label: string; align?: string }[] = [
    { key: "name", label: "板块名称" },
    { key: "changePct", label: "涨跌幅" },
    { key: "price", label: "最新价" },
    { key: "turnover", label: "成交额" },
    { key: "volume", label: "成交量" },
    { key: "peTtm", label: "PE(TTM)" },
    { key: "pb", label: "市净率" },
    { key: "compCount", label: "成分数" },
  ];

  const BOARD_COLS_WITH_ACTION: {
    key: ColKey;
    label: string;
    align?: string;
  }[] = [...BOARD_COLS, { key: "action", label: "操作", align: "center" }];

  const CON_COLS: { key: ConsSortKey; label: string }[] = [
    { key: "name", label: "股票名称" },
    { key: "changePct", label: "涨跌幅" },
    { key: "price", label: "最新价" },
    { key: "turnover", label: "成交额" },
    { key: "marketCap", label: "市值" },
    { key: "pe", label: "市盈率" },
    { key: "pb", label: "市净率" },
  ];

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-color)] flex-shrink-0">
        <span className="text-[15px] font-bold text-[var(--text-primary)]">
          申万行业板块
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          · 申万二级行业 ·{" "}
          {stockBoards.length > 0
            ? `${filteredBoards.length} 个板块`
            : `${boards.length} 个板块`}
        </span>

        <div ref={searchRef} className="relative ml-2">
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors",
              "bg-[var(--bg-secondary)] border-[var(--border-color)]",
              "focus-within:border-[#3b82f6] focus-within:ring-1 focus-within:ring-[#3b82f6]/30",
            )}
          >
            <Search
              size={12}
              className="text-[var(--text-tertiary)] flex-shrink-0"
            />
            <input
              type="text"
              value={stockQuery}
              onChange={(e) => handleStockInput(e.target.value)}
              onFocus={() => {
                if (stockResults.length > 0) setShowDropdown(true);
              }}
              placeholder="搜索股票或板块名称..."
              className="w-40 bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] text-[11px]"
            />
            {selectedStock && (
              <button
                onClick={clearStockFilter}
                className="flex-shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {showDropdown && stockResults.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md shadow-lg z-50 overflow-hidden">
              {stockResults.map((s) => (
                <button
                  key={s.code}
                  onMouseDown={() => handleSelectStock(s)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[var(--text-tertiary)]">
                      {s.code}
                    </span>
                    <span className="text-[12px] text-[var(--text-primary)]">
                      {s.name}
                    </span>
                  </div>
                  {s.price !== undefined && (
                    <span
                      className={cn(
                        "text-[11px] font-mono",
                        s.change !== undefined ? pct(s.change) : "",
                      )}
                    >
                      {s.price.toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedStock && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#3b82f6]/10 border border-[#3b82f6]/30">
            <span className="text-[10px] text-[#3b82f6] font-medium">
              {selectedStock.name}
            </span>
            {stockBoards.length === 0 && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                · 未找到所属板块
              </span>
            )}
            {stockBoards.length > 1 && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                · 点击板块查看成分股
              </span>
            )}
          </div>
        )}

        <button
          onClick={() => setShowRotation(true)}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors border border-[var(--border-color)] hover:border-[var(--accent)]/50 px-2.5 py-1 rounded-md"
        >
          <BarChart2 size={13} />
          板块轮动
        </button>

        <button
          onClick={() => setShowFundFlow(true)}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[#e84444] transition-colors border border-[var(--border-color)] hover:border-[#e84444]/50 px-2.5 py-1 rounded-md"
        >
          <TrendingUp size={13} />
          资金流向
        </button>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyIndustryBoards}
            onChange={(e) => setOnlyIndustryBoards(e.target.checked)}
            className="w-3 h-3 accent-[var(--accent)] cursor-pointer"
          />
          <span className="text-xs text-[var(--text-secondary)]">
            仅产业板块
          </span>
        </label>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
          {syncing ? "同步中..." : "刷新"}
        </button>
      </div>

      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
        <div
          className="border-b border-[var(--border-color)] overflow-auto flex-shrink-0"
          style={{ height: topHeight }}
        >
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
              <tr>
                <td className="px-3 py-2 text-[var(--text-tertiary)] font-medium w-6 text-center">
                  #
                </td>
                {(onlyIndustryBoards ? BOARD_COLS_WITH_ACTION : BOARD_COLS).map(
                  (col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "px-3 py-2 text-left text-[var(--text-tertiary)] font-medium whitespace-nowrap select-none",
                        col.key === "action"
                          ? "text-center"
                          : "cursor-pointer hover:text-[var(--text-primary)]",
                      )}
                      onClick={() =>
                        col.key !== "action" && toggleSort(col.key as SortKey)
                      }
                    >
                      <span className="inline-flex items-center">
                        {col.label}
                        {col.key !== "action" && (
                          <SortIcon
                            col={col.key as SortKey}
                            active={sortKey}
                            order={sortOrder}
                          />
                        )}
                      </span>
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({
                      length:
                        (onlyIndustryBoards
                          ? BOARD_COLS_WITH_ACTION.length
                          : BOARD_COLS.length) + 1,
                    }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-3 bg-[var(--bg-tertiary)] rounded animate-pulse w-16" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading &&
                filteredBoards.map((b, idx) => {
                  const isSelected = selectedBoard?.code === b.code;
                  const isStockBoard = stockBoards.some(
                    (sb) => sb.code === b.code,
                  );
                  return (
                    <tr
                      key={b.code}
                      onClick={() => fetchConstituents(b)}
                      className={cn(
                        "cursor-pointer border-b border-[var(--border-color)] transition-colors",
                        isSelected
                          ? "bg-[var(--bg-hover)] border-l-2 border-l-[#e8a235]"
                          : isStockBoard
                            ? "bg-[#3b82f6]/5 border-l-2 border-l-[#3b82f6]"
                            : "hover:bg-[var(--bg-hover)]",
                      )}
                    >
                      <td className="px-3 py-1.5 text-center text-[var(--text-tertiary)]">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/sw/${b.code}`);
                          }}
                          className="text-[#3b82f6] hover:underline transition-colors"
                        >
                          {b.name}
                        </button>
                        <span className="ml-1.5 text-[10px] text-[var(--text-tertiary)]">
                          {b.code}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 font-mono font-semibold",
                          pct(b.changePct),
                        )}
                      >
                        {sgn(b.changePct)}
                        {fmt(b.changePct)}%
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[var(--text-primary)]">
                        {fmt(b.price, 2)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                        {fmtNum(b.turnover)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                        {fmtNum(b.volume)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                        {fmt(b.peTtm, 1)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                        {fmt(b.pb, 2)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)] text-center">
                        {b.compCount || "--"}
                      </td>
                      {onlyIndustryBoards && (
                        <td className="px-3 py-1.5 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBoard(b.code, b.name);
                            }}
                            disabled={deletingBoard === b.code}
                            className={cn(
                              "p-1 rounded hover:bg-red-500/10 transition-colors",
                              deletingBoard === b.code
                                ? "opacity-50 cursor-not-allowed"
                                : "text-[var(--text-tertiary)] hover:text-red-500",
                            )}
                            title="删除板块"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div
          onMouseDown={onResizerMouseDown}
          className="h-1 flex-shrink-0 bg-[var(--border-color)] hover:bg-[#3b82f6]/60 cursor-row-resize transition-colors group relative"
        >
          <div className="absolute inset-x-0 -top-1 -bottom-1" />
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-color)] flex-shrink-0 bg-[var(--bg-secondary)]">
            {selectedBoard ? (
              <>
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {selectedBoard.name}
                </span>
                <span
                  className={cn(
                    "text-[12px] font-mono font-semibold",
                    pct(selectedBoard.changePct),
                  )}
                >
                  {sgn(selectedBoard.changePct)}
                  {fmt(selectedBoard.changePct)}%
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  · 成分股 {constituents.length} 只
                </span>
              </>
            ) : (
              <span className="text-xs text-[var(--text-tertiary)]">
                {selectedStock && stockBoards.length > 1
                  ? `${selectedStock.name} 属于 ${stockBoards.map((b) => b.name).join("、")} 等 ${stockBoards.length} 个板块，点击上方板块查看成分股`
                  : "点击上方板块查看成分股"}
              </span>
            )}
          </div>

          {!selectedBoard && (
            <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)] text-sm">
              {selectedStock && stockBoards.length > 1
                ? `${selectedStock.name} 属于多个板块，请点击上方板块查看成分股详情`
                : "点击上方任意板块查看成分股详情"}
            </div>
          )}

          {selectedBoard && (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
                  <tr>
                    <td className="px-3 py-2 text-[var(--text-tertiary)] w-6 text-center">
                      #
                    </td>
                    {CON_COLS.map((col) => (
                      <th
                        key={col.key}
                        className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium cursor-pointer hover:text-[var(--text-primary)] whitespace-nowrap select-none"
                        onClick={() => toggleConSort(col.key)}
                      >
                        <span className="inline-flex items-center">
                          {col.label}
                          <SortIcon
                            col={col.key}
                            active={consSortKey}
                            order={consSortOrder}
                          />
                        </span>
                      </th>
                    ))}
                    <td className="px-3 py-2 text-[var(--text-tertiary)]">
                      操作
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {consLoading &&
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: CON_COLS.length + 2 }).map(
                          (_, j) => (
                            <td key={j} className="px-3 py-2">
                              <div className="h-3 bg-[var(--bg-tertiary)] rounded animate-pulse w-14" />
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  {!consLoading &&
                    sortedCons.map((s, idx) => {
                      const isSearchedStock = selectedStock?.code === s.code;
                      return (
                        <tr
                          key={s.code}
                          className={cn(
                            "border-b border-[var(--border-color)] transition-colors",
                            isSearchedStock
                              ? "bg-[#3b82f6]/10 border-l-2 border-l-[#3b82f6]"
                              : "hover:bg-[var(--bg-hover)]",
                          )}
                        >
                          <td className="px-3 py-1.5 text-center text-[var(--text-tertiary)]">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-1.5">
                            <div
                              className={cn(
                                "font-medium",
                                isSearchedStock
                                  ? "text-[#3b82f6]"
                                  : "text-[var(--text-primary)]",
                              )}
                            >
                              {s.name}
                            </div>
                            <div className="text-[10px] text-[var(--text-tertiary)]">
                              {s.code}
                            </div>
                          </td>
                          <td
                            className={cn(
                              "px-3 py-1.5 font-mono font-semibold",
                              pct(s.changePct),
                            )}
                          >
                            {sgn(s.changePct)}
                            {fmt(s.changePct)}%
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[var(--text-primary)]">
                            {fmt(s.price)}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                            {fmtNum(s.turnover)}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                            {fmtNum(s.marketCap)}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                            {fmt(s.pe, 1)}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                            {fmt(s.pb, 2)}
                          </td>
                          <td className="px-3 py-1.5">
                            <button
                              onClick={() => router.push(`/stock/${s.code}`)}
                              className="text-[10px] text-[#3b82f6] hover:underline whitespace-nowrap"
                            >
                              详情↗
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showRotation && <RotationModal onClose={() => setShowRotation(false)} />}
      {showFundFlow && <FundFlowModal onClose={() => setShowFundFlow(false)} />}
    </div>
  );
}
