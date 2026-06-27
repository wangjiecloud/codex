"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowUpDown, TrendingUp, TrendingDown } from "lucide-react";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface Industry {
  id: string;
  name: string;
}

interface GraphNode {
  id: string;
  label: string;
  layer: string;
  group: string | null;
  stocks: string[];
}

interface SubGroup {
  id: string;
  name: string;
  stocks: string[];
  avgChange: number | null; // from quote.change %
}

interface StockQuote {
  code: string;
  name: string;
  price: number;
  change: number; // % change (涨幅)
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

function _buildSubGroups(nodes: GraphNode[]): SubGroup[] {
  const groupMap = new Map<string, { name: string; codes: string[] }>();
  nodes.forEach((node) => {
    if (!node.stocks?.length) return;
    const aCodes = node.stocks.filter((c) => /^[036]/.test(c));
    if (!aCodes.length) return;
    const key = node.group ?? node.id;
    const name = node.group ?? node.label;
    if (groupMap.has(key)) {
      groupMap.get(key)!.codes.push(...aCodes);
    } else {
      groupMap.set(key, { name, codes: aCodes });
    }
  });
  const sgs: SubGroup[] = Array.from(groupMap.entries()).map(([id, g]) => ({
    id,
    name: g.name,
    stocks: [...new Set(g.codes)],
    avgChange: null,
  }));
  const allCodes = [...new Set(sgs.flatMap((sg) => sg.stocks))];
  return [
    { id: "__all__", name: "全部", stocks: allCodes, avgChange: null },
    ...sgs,
  ];
}

/* ─────────────────────────────────────────────
   AvgBadge — shown in tabs
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
  loading,
}: {
  stocks: StockQuote[];
  loading: boolean;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState("change");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: string) => {
    if (key === "_idx") return;
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...stocks].sort((a, b) => {
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
          {sorted.map((s, idx) => (
            <tr
              key={s.code}
              onClick={() => router.push(`/stock/${s.code}`)}
              className="border-b border-[var(--border-color)]/30 hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
            >
              <td className="px-2 py-1.5 text-center text-[10px] text-[var(--text-tertiary)]">
                {idx + 1}
              </td>
              <td className="px-2 py-1.5 font-mono text-[var(--text-tertiary)]">
                {s.code}
              </td>
              <td className="px-2 py-1.5 font-medium text-[var(--text-secondary)] whitespace-nowrap">
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
                className={
                  "px-2 py-1.5 text-right font-mono " + pctColor(s.change)
                }
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
          ))}
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

  // subGroups per industry — built from graph nodes
  const [subGroupsMap, setSubGroupsMap] = useState<Record<string, SubGroup[]>>(
    {},
  );
  // all quotes keyed by code
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});

  const [initLoading, setInitLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(false);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);

  // track which industries have had graph loaded
  const loadedGraphs = useRef<Set<string>>(new Set());
  // all quotes loaded flag
  const quotesLoaded = useRef(false);

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
      if (sgs && sgs.length > 0) setActiveSubGroup(sgs[0].id);
      return;
    }

    setGraphLoading(true);
    fetch(`http://localhost:8000/api/industry/graph/${activeIndustry}`)
      .then((r) => r.json())
      .then((data: { nodes: GraphNode[] }) => {
        const finalSgs = _buildSubGroups(data.nodes);
        loadedGraphs.current.add(activeIndustry);
        setSubGroupsMap((prev) => ({ ...prev, [activeIndustry]: finalSgs }));
        setActiveSubGroup(finalSgs[0].id);
      })
      .catch(() => {})
      .finally(() => setGraphLoading(false));
  }, [activeIndustry]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Step 3: compute avgChange for subgroups using already-loaded quotes ── */
  useEffect(() => {
    if (!activeIndustry || !quotes || !Object.keys(quotes).length) return;
    const sgs = subGroupsMap[activeIndustry];
    if (!sgs) return;

    // compute avg using quote.change (涨幅%)
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

  /* ── Step 4: compute avgChange for ALL industries (for L1 tab badges) ── */
  useEffect(() => {
    if (!Object.keys(quotes).length || !industries.length) return;
    // For industries that already have subGroupsMap loaded, recompute their avgs
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

  /* ── Load quotes for missing stocks in current subgroup (fallback) ── */
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
                    <span>{ind.name}</span>
                    <AvgBadge value={indAvg} />
                  </button>
                );
              })}
        </div>
        <div className="absolute top-1 right-1">
          <button
            onClick={() => {
              loadedGraphs.current.clear();
              quotesLoaded.current = false;
              setSubGroupsMap({});
              setQuotes({});
              setRefreshSeed((s) => s + 1);
            }}
            title="刷新行情"
            className={
              "p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors " +
              (initLoading ? "animate-spin text-[var(--accent)]" : "")
            }
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* ── L2: SubGroup tabs ── */}
      <div className="shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-deep)]">
        <div className="flex flex-wrap items-center">
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
        {quotesLoading && (
          <span className="ml-auto text-[var(--text-tertiary)] animate-pulse">
            加载中…
          </span>
        )}
      </div>

      {/* ── Stock table ── */}
      <StockTable
        stocks={displayStocks}
        loading={graphLoading || (quotesLoading && displayStocks.length === 0)}
      />
    </div>
  );
}
