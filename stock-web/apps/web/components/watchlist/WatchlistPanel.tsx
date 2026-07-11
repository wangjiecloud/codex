"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Search,
  X,
} from "lucide-react";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface Industry {
  id: string;
  name: string;
  tab?: string;
}

interface GraphNode {
  id: string;
  label: string;
  layer: string;
  group: string | null;
  stocks: string[];
}

interface SubGroup {
  id: string; // layer key，如 "upstream"
  name: string; // 显示名，如 "上游"
  layer: string;
  stocks: string[]; // 该 layer 全部股票（去重）
  groups: { name: string; stocks: string[] }[]; // 按 group_name 细分
  avgChange: number | null;
}

interface StockQuote {
  code: string;
  name: string;
  price: number;
  change: number;
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
  amplitude: number;
}

interface SearchResult {
  code: string;
  name: string;
  industryId: string;
  industryName: string;
  subGroupId: string;
  subGroupName: string;
}

/* ─────────────────────────────────────────────
   Formatting helpers
───────────────────────────────────────────── */
function fmtAmt(n: number): string {
  if (!n || isNaN(n)) return "--";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "万亿";
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(2) + "万";
  return n.toFixed(0);
}

function fmtVol(n: number): string {
  if (!n || isNaN(n)) return "--";
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(0) + "万";
  return n.toFixed(0);
}

function pctColor(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return "text-[var(--text-tertiary)]";
  if (v > 0) return "text-[#e84444]";
  if (v < 0) return "text-[#09d464]";
  return "text-[var(--text-tertiary)]";
}

function fmtPct(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return "--";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

function fmtNum(v: number | undefined | null, d = 2): string {
  if (v == null || isNaN(v) || v === 0) return "--";
  return v.toFixed(d);
}

function avg(values: (number | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v !== undefined && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

const LAYER_LABELS: Record<string, string> = {
  upstream: "上游",
  downstream: "中游",
  core: "核心",
  application: "下游",
};
const LAYER_ORDER = ["upstream", "core", "downstream", "application"];

function _buildSubGroups(nodes: GraphNode[]): SubGroup[] {
  // 先按 layer → group_name 两级聚合
  const layerGroupMap = new Map<string, Map<string, string[]>>();

  nodes.forEach((node) => {
    if (!node.stocks?.length) return;
    const aCodes = node.stocks.filter((c) => /^[036]/.test(c));
    if (!aCodes.length) return;
    const layer = node.layer ?? "other";
    const groupName = node.group?.trim() || LAYER_LABELS[layer] || layer;

    if (!layerGroupMap.has(layer)) layerGroupMap.set(layer, new Map());
    const gMap = layerGroupMap.get(layer)!;
    if (!gMap.has(groupName)) gMap.set(groupName, []);
    gMap.get(groupName)!.push(...aCodes);
  });

  // 按 LAYER_ORDER 排序层级
  const orderedLayers = [
    ...LAYER_ORDER.filter((l) => layerGroupMap.has(l)),
    ...[...layerGroupMap.keys()].filter((l) => !LAYER_ORDER.includes(l)),
  ];

  const sgs: SubGroup[] = orderedLayers.map((layer) => {
    const gMap = layerGroupMap.get(layer)!;
    // 同层内 group 按名称排序
    const groups = [...gMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "zh"))
      .map(([name, codes]) => ({ name, stocks: [...new Set(codes)] }));
    const allCodes = [...new Set(groups.flatMap((g) => g.stocks))];
    return {
      id: layer,
      name: LAYER_LABELS[layer] ?? layer,
      layer,
      stocks: allCodes,
      groups,
      avgChange: null,
    };
  });

  const allCodes = [...new Set(sgs.flatMap((sg) => sg.stocks))];
  return [
    {
      id: "__all__",
      name: "全部",
      layer: "",
      stocks: allCodes,
      groups: [],
      avgChange: null,
    },
    ...sgs,
  ];
}

/* ─────────────────────────────────────────────
   AvgBadge
───────────────────────────────────────────── */
function AvgBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <span
      className={
        "text-[10px] font-mono px-1 rounded " +
        (value > 0
          ? "text-[#e84444]"
          : value < 0
            ? "text-[#09d464]"
            : "text-[var(--text-tertiary)]")
      }
    >
      {value >= 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

/* ─────────────────────────────────────────────
   Column definitions
───────────────────────────────────────────── */
const COLS = [
  { key: "_idx", label: "#", align: "center" as const, noSort: true },
  { key: "code", label: "代码", align: "left" as const },
  { key: "name", label: "名称", align: "left" as const },
  { key: "change", label: "涨幅%", align: "right" as const },
  { key: "price", label: "现价", align: "right" as const },
  { key: "changeAmt", label: "涨跌", align: "right" as const },
  { key: "turnoverRate", label: "换手%", align: "right" as const },
  { key: "volume", label: "现量", align: "right" as const },
  { key: "turnover", label: "总金额", align: "right" as const },
  { key: "pe", label: "市盈TTM", align: "right" as const },
  { key: "marketCap", label: "流通市值", align: "right" as const },
  { key: "high", label: "最高", align: "right" as const },
  { key: "low", label: "最低", align: "right" as const },
  { key: "prevClose", label: "昨收", align: "right" as const },
  { key: "amplitude", label: "振幅%", align: "right" as const },
];

/* ─────────────────────────────────────────────
   Stock Table
───────────────────────────────────────────── */
function StockTable({
  stocks,
  groups,
  loading,
  highlightCode,
  highlightRowRef,
}: {
  stocks: StockQuote[];
  groups?: { name: string; stocks: string[] }[];
  loading: boolean;
  highlightCode?: string | null;
  highlightRowRef?: React.MutableRefObject<HTMLTableRowElement | null>;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState("change");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // 折叠状态：key = group name，value = 是否收起（默认全部展开）
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // 当 groups 变化时重置折叠状态（全部展开）
  useEffect(() => {
    setCollapsed({});
  }, [groups?.map((g) => g.name).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (key: string) => {
    if (key === "_idx") return;
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortStocks = (list: StockQuote[]) =>
    [...list].sort((a, b) => {
      const ra = a as unknown as Record<string, unknown>;
      const rb = b as unknown as Record<string, unknown>;
      if (sortKey === "code" || sortKey === "name") {
        const av = (ra[sortKey] as string) ?? "";
        const bv = (rb[sortKey] as string) ?? "";
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const av = (ra[sortKey] as number) ?? 0;
      const bv = (rb[sortKey] as number) ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });

  if (loading) {
    return (
      <div className="flex-1 overflow-auto p-3 space-y-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-7 bg-[var(--bg-tertiary)] animate-pulse rounded"
          />
        ))}
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)] text-[12px]">
        暂无数据
      </div>
    );
  }

  // 用 groups 分组渲染（当 groups 非空时）
  const useGroups = groups && groups.length > 0;

  // 将 stocks 转为 code→quote 的 map，方便按 code 查找
  const quoteByCode = Object.fromEntries(stocks.map((s) => [s.code, s]));

  const renderRow = (s: StockQuote, idx: number, globalIdx?: number) => {
    const isHighlight = s.code === highlightCode;
    return (
      <tr
        key={s.code}
        ref={isHighlight ? highlightRowRef : undefined}
        onClick={() => router.push(`/stock/${s.code}`)}
        className={
          "border-b border-[var(--border-color)]/30 cursor-pointer transition-colors " +
          (isHighlight
            ? "bg-[var(--accent)]/10 outline outline-1 outline-[var(--accent)]/40"
            : "hover:bg-[var(--bg-hover)]")
        }
      >
        <td className="px-2 py-1.5 text-center text-[10px] text-[var(--text-tertiary)]">
          {globalIdx !== undefined ? globalIdx + 1 : idx + 1}
        </td>
        <td
          className={
            "px-2 py-1.5 font-mono " +
            (isHighlight
              ? "text-[var(--accent)] font-semibold"
              : "text-[var(--text-tertiary)]")
          }
        >
          {s.code}
        </td>
        <td
          className={
            "px-2 py-1.5 font-medium whitespace-nowrap " +
            (isHighlight
              ? "text-[var(--accent)]"
              : "text-[var(--text-secondary)]")
          }
        >
          {s.name || "--"}
        </td>
        <td
          className={
            "px-2 py-1.5 text-right font-mono font-semibold " +
            pctColor(s.change)
          }
        >
          {fmtPct(s.change)}
        </td>
        <td
          className={"px-2 py-1.5 text-right font-mono " + pctColor(s.change)}
        >
          {s.price > 0 ? s.price.toFixed(2) : "--"}
        </td>
        <td
          className={
            "px-2 py-1.5 text-right font-mono " + pctColor(s.changeAmt)
          }
        >
          {s.changeAmt !== 0
            ? (s.changeAmt >= 0 ? "+" : "") + s.changeAmt.toFixed(2)
            : "--"}
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-[var(--text-secondary)]">
          {fmtNum(s.turnoverRate)}
        </td>
        <td className="px-2 py-1.5 text-right text-[var(--text-secondary)]">
          {fmtVol(s.volume)}
        </td>
        <td className="px-2 py-1.5 text-right text-[var(--text-secondary)]">
          {fmtAmt(s.turnover)}
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-[var(--text-secondary)]">
          {s.pe > 0 ? s.pe.toFixed(2) : "--"}
        </td>
        <td className="px-2 py-1.5 text-right text-[var(--text-secondary)]">
          {fmtAmt(s.marketCap)}
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-[#e84444]/80">
          {s.high > 0 ? s.high.toFixed(2) : "--"}
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-[#09d464]/80">
          {s.low > 0 ? s.low.toFixed(2) : "--"}
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-[var(--text-tertiary)]">
          {s.prevClose > 0 ? s.prevClose.toFixed(2) : "--"}
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-[var(--text-tertiary)]">
          {fmtNum(s.amplitude)}
        </td>
      </tr>
    );
  };

  const colCount = COLS.length;

  return (
    <div className="flex-1 overflow-auto">
      <table
        className="w-full text-[11px] border-collapse"
        style={{ minWidth: "960px" }}
      >
        <thead className="sticky top-0 z-10 bg-[var(--bg-secondary)]">
          <tr className="border-b border-[var(--border-color)]">
            {COLS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={
                  "px-2 py-2 font-medium text-[10px] whitespace-nowrap select-none " +
                  (col.align === "right"
                    ? "text-right "
                    : col.align === "center"
                      ? "text-center "
                      : "text-left ") +
                  (!col.noSort
                    ? "cursor-pointer hover:text-[var(--text-secondary)] transition-colors "
                    : "") +
                  (sortKey === col.key
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-tertiary)]")
                }
              >
                <span className="inline-flex items-center gap-0.5">
                  {col.label}
                  {!col.noSort && sortKey === col.key && (
                    <ArrowUpDown size={8} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {useGroups
            ? (() => {
                let globalIdx = 0;
                return groups!.map((grp) => {
                  const grpStocks = sortStocks(
                    grp.stocks
                      .map((c) => quoteByCode[c])
                      .filter((q): q is StockQuote => !!q),
                  );
                  if (grpStocks.length === 0) return null;
                  const isCollapsed = collapsed[grp.name] ?? false;
                  const grpAvg = avg(grpStocks.map((s) => s.change)) ?? null;
                  const startIdx = globalIdx;
                  if (!isCollapsed) globalIdx += grpStocks.length;
                  return (
                    <React.Fragment key={`grp-${grp.name}`}>
                      {/* 分组标题行 */}
                      <tr
                        className="bg-[var(--bg-tertiary)]/60 border-b border-[var(--border-color)]/40 cursor-pointer select-none hover:bg-[var(--bg-tertiary)] transition-colors"
                        onClick={() =>
                          setCollapsed((prev) => ({
                            ...prev,
                            [grp.name]: !prev[grp.name],
                          }))
                        }
                      >
                        <td colSpan={colCount} className="px-3 py-1">
                          <div className="flex items-center gap-2">
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 8 8"
                              className={
                                "text-[var(--text-tertiary)] transition-transform duration-150 shrink-0 " +
                                (isCollapsed ? "-rotate-90" : "")
                              }
                              fill="currentColor"
                            >
                              <path d="M0 2l4 4 4-4z" />
                            </svg>
                            <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                              {grp.name}
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              {grpStocks.length} 只
                            </span>
                            {grpAvg !== null && (
                              <span
                                className={
                                  "text-[10px] font-mono " + pctColor(grpAvg)
                                }
                              >
                                {fmtPct(grpAvg)}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* 该分组的股票行 */}
                      {!isCollapsed &&
                        grpStocks.map((s, i) => renderRow(s, i, startIdx + i))}
                    </React.Fragment>
                  );
                });
              })()
            : sortStocks(stocks).map((s, idx) => renderRow(s, idx))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */
export function WatchlistPanel() {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [activeIndustry, setActiveIndustry] = useState("");
  const [activeSubGroup, setActiveSubGroup] = useState("");

  const [subGroupsMap, setSubGroupsMap] = useState<Record<string, SubGroup[]>>(
    {},
  );
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});

  const [initLoading, setInitLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(false);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ refreshed: number; failed: number } | null>(null);

  const loadedGraphs = useRef<Set<string>>(new Set());
  const quotesLoaded = useRef(false);
  // 搜索选中后，记录待切换的 subGroup，防止被 activeIndustry effect 覆盖
  const pendingSubGroupRef = useRef<string | null>(null);

  // ── 搜索相关 state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 搜索过滤：从 subGroupsMap + quotes 本地过滤，跳过虚拟"全部"分组
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }
      const q = query.toLowerCase();
      const results: SearchResult[] = [];
      const seen = new Set<string>();
      Object.entries(subGroupsMap).forEach(([industryId, sgs]) => {
        const ind = industries.find((i) => i.id === industryId);
        sgs.forEach((sg) => {
          if (sg.id === "__all__") return;
          sg.stocks.forEach((code) => {
            if (seen.has(code)) return;
            const name = quotes[code]?.name ?? code;
            if (
              code.toLowerCase().includes(q) ||
              name.toLowerCase().includes(q)
            ) {
              seen.add(code);
              // 找该股票所在的具体细分组名
              const groupName =
                sg.groups.find((g) => g.stocks.includes(code))?.name ?? sg.name;
              results.push({
                code,
                name,
                industryId,
                industryName: ind?.name ?? industryId,
                subGroupId: sg.id,
                subGroupName: `${sg.name} · ${groupName}`,
              });
            }
          });
        });
      });
      setSearchResults(results.slice(0, 20));
      setShowDropdown(results.length > 0);
    },
    [subGroupsMap, quotes, industries],
  );

  // 选中：切换产业 tab → 切换 subGroup tab → 高亮
  const handleSelect = useCallback(
    (item: SearchResult) => {
      if (item.industryId === activeIndustry) {
        // 产业未变，effect 不会重触发，直接设置 subGroup
        setActiveSubGroup(item.subGroupId);
      } else {
        // 先把目标 subGroup 存入 ref，让 Step 2 effect 读取并应用
        pendingSubGroupRef.current = item.subGroupId;
        setActiveIndustry(item.industryId);
      }
      setHighlightCode(item.code);
      setSearchQuery("");
      setShowDropdown(false);
    },
    [activeIndustry],
  );

  // 高亮后自动滚动到目标行（等待渲染完成）
  useEffect(() => {
    if (!highlightCode) return;
    const timer = setTimeout(() => {
      if (highlightRowRef.current) {
        highlightRowRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [highlightCode, activeSubGroup]);

  /* ── Step 1: load all industries + all quotes + all graphs in parallel at mount ── */
  useEffect(() => {
    setInitLoading(true);
    quotesLoaded.current = false;

    Promise.all([
      fetch("http://localhost:8000/api/industry/list").then((r) => r.json()),
      fetch("http://localhost:8000/api/industry/stocks").then((r) => r.json()),
    ])
      .then(
        ([listData, stocksData]: [
          { industries: Industry[] },
          { quotes: Record<string, StockQuote> },
        ]) => {
          const filtered = listData.industries.filter(
            (i) => i.id !== "overview",
          );
          setIndustries(filtered);
          if (filtered.length > 0) setActiveIndustry(filtered[0].id);

          const allQuotes = stocksData.quotes ?? {};
          setQuotes(allQuotes);
          quotesLoaded.current = true;

          filtered.forEach((ind) => {
            if (loadedGraphs.current.has(ind.id)) return;
            fetch(`http://localhost:8000/api/industry/graph/${ind.id}`)
              .then((r) => r.json())
              .then((data: { nodes: GraphNode[] }) => {
                const sgs = _buildSubGroups(data.nodes);
                loadedGraphs.current.add(ind.id);
                setSubGroupsMap((prev) => {
                  if (prev[ind.id]) return prev;
                  return { ...prev, [ind.id]: sgs };
                });
              })
              .catch(() => {});
          });
        },
      )
      .catch(() => {})
      .finally(() => setInitLoading(false));
  }, [refreshSeed]);

  /* ── Step 2: load graph for active industry (lazy, cached) ── */
  useEffect(() => {
    if (!activeIndustry) return;
    if (loadedGraphs.current.has(activeIndustry)) {
      const sgs = subGroupsMap[activeIndustry];
      if (sgs && sgs.length > 0) {
        const pending = pendingSubGroupRef.current;
        pendingSubGroupRef.current = null;
        const targetId =
          pending && sgs.some((sg) => sg.id === pending) ? pending : sgs[0].id;
        setActiveSubGroup(targetId);
      }
      return;
    }

    setGraphLoading(true);
    fetch(`http://localhost:8000/api/industry/graph/${activeIndustry}`)
      .then((r) => r.json())
      .then((data: { nodes: GraphNode[] }) => {
        const finalSgs = _buildSubGroups(data.nodes);
        loadedGraphs.current.add(activeIndustry);
        setSubGroupsMap((prev) => ({ ...prev, [activeIndustry]: finalSgs }));
        const pending = pendingSubGroupRef.current;
        pendingSubGroupRef.current = null;
        const targetId =
          pending && finalSgs.some((sg) => sg.id === pending)
            ? pending
            : finalSgs[0].id;
        setActiveSubGroup(targetId);
      })
      .catch(() => {})
      .finally(() => setGraphLoading(false));
  }, [activeIndustry]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Step 3: compute avgChange for subgroups ── */
  useEffect(() => {
    if (!activeIndustry || !quotes || !Object.keys(quotes).length) return;
    const sgs = subGroupsMap[activeIndustry];
    if (!sgs) return;

    const updated = sgs.map((sg) => {
      const changeVals = sg.stocks
        .map((c) => quotes[c]?.change)
        .filter((v): v is number => v !== undefined);
      return { ...sg, avgChange: avg(changeVals) };
    });

    setSubGroupsMap((prev) => ({ ...prev, [activeIndustry]: updated }));
  }, [
    activeIndustry,
    subGroupsMap[activeIndustry]?.length,
    Object.keys(quotes).length,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Step 4: compute avgChange for ALL industries ── */
  useEffect(() => {
    if (!Object.keys(quotes).length || !industries.length) return;
    setSubGroupsMap((prev) => {
      const next = { ...prev };
      Object.entries(next).forEach(([industryId, sgs]) => {
        next[industryId] = sgs.map((sg) => {
          const vals = sg.stocks
            .map((c) => quotes[c]?.change)
            .filter((v): v is number => v !== undefined);
          return { ...sg, avgChange: avg(vals) };
        });
      });
      return next;
    });
  }, [Object.keys(quotes).length, Object.keys(subGroupsMap).length]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Load quotes for missing stocks ── */
  const currentSgs = subGroupsMap[activeIndustry] ?? [];
  const currentSg = currentSgs.find((sg) => sg.id === activeSubGroup);
  const visibleCodes = currentSg?.stocks ?? [];

  useEffect(() => {
    if (!visibleCodes.length) return;
    const missing = visibleCodes.filter((c) => !quotes[c]);
    if (!missing.length) return;
    setQuotesLoading(true);
    fetch(
      `http://localhost:8000/api/industry/stocks?codes=${missing.join(",")}`,
    )
      .then((r) => r.json())
      .then((data: { quotes: Record<string, StockQuote> }) => {
        setQuotes((prev) => ({ ...prev, ...data.quotes }));
      })
      .catch(() => {})
      .finally(() => setQuotesLoading(false));
  }, [activeIndustry, activeSubGroup, visibleCodes.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── helpers ── */
  function getIndustryAvg(id: string): number | null {
    const sgs = subGroupsMap[id];
    if (!sgs) return null;
    return sgs.find((sg) => sg.id === "__all__")?.avgChange ?? null;
  }

  const displayStocks: StockQuote[] = visibleCodes
    .map((c) => quotes[c])
    .filter((q): q is StockQuote => !!q);

  /* ── Sync quotes for currently visible stocks ── */
  const handleSyncQuotes = useCallback(async () => {
    if (syncing || !visibleCodes.length) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(
        "http://localhost:8000/api/industry/sync/quotes/batch",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codes: visibleCodes }),
        },
      );
      const data = await res.json();
      setSyncResult({ refreshed: data.refreshed ?? 0, failed: data.failed ?? 0 });
      // 用返回的新行情直接更新本地 state（无需重新全量拉取）
      if (data.quotes && Object.keys(data.quotes).length > 0) {
        setQuotes((prev) => ({ ...prev, ...data.quotes }));
      }
    } catch {
      setSyncResult({ refreshed: 0, failed: visibleCodes.length });
    } finally {
      setSyncing(false);
      // 3 秒后清除提示
      setTimeout(() => setSyncResult(null), 3000);
    }
  }, [syncing, visibleCodes]);

  const upCount = displayStocks.filter((s) => s.change > 0).length;
  const dnCount = displayStocks.filter((s) => s.change < 0).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── L1: Industry tabs ── */}
      <div className="shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] relative">
        <div className="flex flex-wrap items-center pr-8">
          {initLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="mx-1 my-2 w-24 h-6 bg-[var(--bg-tertiary)] animate-pulse rounded"
                />
              ))
            : industries.map((ind) => {
                const active = activeIndustry === ind.id;
                const indAvg = getIndustryAvg(ind.id);
                return (
                  <button
                    key={ind.id}
                    onClick={() => setActiveIndustry(ind.id)}
                    className={
                      "flex items-center gap-1.5 px-3 py-2.5 text-[11px] whitespace-nowrap border-b-2 shrink-0 transition-colors " +
                      (active
                        ? "text-[var(--accent)] border-[var(--accent)] font-medium"
                        : "text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)]")
                    }
                  >
                    <span>
                      {ind.tab === "ai_infra" && (
                        <span className="text-[var(--text-tertiary)] mr-0.5">
                          AI-
                        </span>
                      )}
                      {ind.tab === "humanoid" && (
                        <span className="text-[var(--text-tertiary)] mr-0.5">
                          人机-
                        </span>
                      )}
                      {ind.tab === "aerospace" && (
                        <span className="text-[var(--text-tertiary)] mr-0.5">
                          商航-
                        </span>
                      )}
                      {ind.name}
                    </span>
                    <AvgBadge value={indAvg} />
                  </button>
                );
              })}
        </div>
        <div className="absolute top-1 right-1 flex items-center gap-1.5">
          {syncResult && (
            <span className={
              "text-[10px] font-mono px-1.5 py-0.5 rounded " +
              (syncResult.failed === 0
                ? "text-[#09d464] bg-[#09d464]/10"
                : "text-[#e84444] bg-[#e84444]/10")
            }>
              {syncResult.failed === 0
                ? `已刷新 ${syncResult.refreshed} 只`
                : `${syncResult.refreshed} 成功 / ${syncResult.failed} 失败`}
            </span>
          )}
          <button
            onClick={handleSyncQuotes}
            disabled={syncing || !visibleCodes.length}
            title={syncing ? "刷新中…" : `刷新当前 ${visibleCodes.length} 只股票行情`}
            className={
              "p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed " +
              (syncing ? "animate-spin text-[var(--accent)]" : "")
            }
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* ── L2: SubGroup tabs ── */}
      <div className="shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-deep)]">
        <div className="flex items-center">
          {graphLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="mx-1 my-1.5 w-16 h-5 bg-[var(--bg-tertiary)] animate-pulse rounded"
                />
              ))
            : currentSgs.map((sg) => {
                const active = activeSubGroup === sg.id;
                return (
                  <button
                    key={sg.id}
                    onClick={() => setActiveSubGroup(sg.id)}
                    className={
                      "flex items-center gap-1 px-3 py-2 text-[11px] whitespace-nowrap border-b-2 shrink-0 transition-colors " +
                      (active
                        ? "text-[var(--accent)] border-[var(--accent)] font-medium"
                        : "text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)]")
                    }
                  >
                    <span>{sg.name}</span>
                    <AvgBadge value={sg.avgChange} />
                  </button>
                );
              })}
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="shrink-0 flex items-center gap-3 px-3 py-1 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-[10px]">
        <span className="text-[var(--text-tertiary)]">
          共{" "}
          <span className="text-[var(--text-secondary)]">
            {visibleCodes.length}
          </span>{" "}
          只
          {displayStocks.length > 0 &&
            displayStocks.length < visibleCodes.length && (
              <span className="text-[var(--text-tertiary)]">
                {" "}
                · 已加载 {displayStocks.length}
              </span>
            )}
        </span>
        {displayStocks.length > 0 && (
          <>
            <span className="flex items-center gap-0.5 text-[#e84444]">
              <TrendingUp size={9} /> {upCount}
            </span>
            <span className="flex items-center gap-0.5 text-[#09d464]">
              <TrendingDown size={9} /> {dnCount}
            </span>
          </>
        )}

        {/* ── 搜索框 ── */}
        <div className="ml-auto relative" ref={searchBoxRef}>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--accent)]/40 bg-[var(--bg-deep)] text-[11px] w-52 focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)]/20 transition-all">
            <Search size={12} className="text-[var(--accent)] shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索股票名称/代码"
              className="flex-1 bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] min-w-0 text-[11px]"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setShowDropdown(false);
                  setHighlightCode(null);
                }}
              >
                <X
                  size={11}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                />
              </button>
            )}
          </div>

          {/* 下拉候选列表 */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-60 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-xl z-50 overflow-hidden">
              {searchResults.map((item) => (
                <button
                  key={item.code}
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  <span className="font-medium text-[var(--text-primary)] shrink-0">
                    {item.name}
                  </span>
                  <span className="font-mono text-[var(--text-tertiary)] shrink-0">
                    {item.code}
                  </span>
                  <span className="text-[var(--text-tertiary)] truncate ml-auto text-right leading-tight">
                    <span className="block opacity-70">
                      {item.industryName}
                    </span>
                    <span className="block text-[9px]">
                      {item.subGroupName}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {quotesLoading && (
          <span className="text-[var(--text-tertiary)] animate-pulse">
            加载中…
          </span>
        )}
      </div>

      {/* ── Stock table ── */}
      <StockTable
        stocks={displayStocks}
        groups={currentSg?.groups?.length ? currentSg.groups : undefined}
        loading={graphLoading || (quotesLoading && displayStocks.length === 0)}
        highlightCode={highlightCode}
        highlightRowRef={highlightRowRef}
      />
    </div>
  );
}
