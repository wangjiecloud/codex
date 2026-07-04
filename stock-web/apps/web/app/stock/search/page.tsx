"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  TrendingUp,
  ChevronRight,
  Flame,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Zap,
  Newspaper,
  BarChart2,
  X,
  Clock,
  ExternalLink,
  ChevronDown,
  Network,
  DatabaseZap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const VISIBLE_DEFAULT = 50;
const VISIBLE_ALL = 100;

type SortMode = "hot" | "rise";
type MainTab = "stock" | "news" | "relation";

// ─────────────────────────────────────────────────────────────────────────────
// 选股相关类型
// ─────────────────────────────────────────────────────────────────────────────
interface PopularStock {
  rank: number;
  code: string;
  name: string;
  price: number | null;
  pct: number | null;
  change: number | null;
  prevClose: number | null;
  hisRc: number;
}

function parseStocks(raw: Record<string, unknown>[]): PopularStock[] {
  return raw.map((s) => ({
    rank: Number(s.rank ?? 0),
    code: String(s.code ?? ""),
    name: String(s.name ?? ""),
    price: typeof s.price === "number" ? s.price : null,
    pct: typeof s.pct === "number" ? s.pct : null,
    change: typeof s.change === "number" ? s.change : null,
    prevClose: typeof s.prevClose === "number" ? s.prevClose : null,
    hisRc: typeof s.hisRc === "number" ? s.hisRc : 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 资讯相关类型
// ─────────────────────────────────────────────────────────────────────────────
interface ThemeNewsItem {
  id: string;
  themeId: string;
  themeName: string;
  title: string;
  source: string;
  pubTime: string;
  url: string;
}

interface ThemeOption {
  themeId: string;
  themeName: string;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 通用子组件
// ─────────────────────────────────────────────────────────────────────────────
function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined) {
    return <span className="text-xs text-[var(--text-tertiary)]">--</span>;
  }
  const isUp = pct > 0;
  const isDown = pct < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-sm font-medium tabular-nums",
        isUp && "text-[#e84444]",
        isDown && "text-[#09d464]",
        !isUp && !isDown && "text-[var(--text-tertiary)]",
      )}
    >
      {isUp ? (
        <ArrowUpRight size={13} />
      ) : isDown ? (
        <ArrowDownRight size={13} />
      ) : (
        <Minus size={13} />
      )}
      {isUp ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = {
    1: "bg-[#e84444] text-white",
    2: "bg-[#f5a623] text-black",
    3: "bg-[#f5a623]/60 text-black",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold flex-shrink-0",
        colors[rank] ?? "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]",
      )}
    >
      {rank}
    </span>
  );
}

function RiseBadge({ hisRc }: { hisRc: number }) {
  if (!hisRc || hisRc <= 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#e84444] tabular-nums">
      <ArrowUpRight size={11} />+{hisRc}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 关联 Tab — 力导向图
// ─────────────────────────────────────────────────────────────────────────────
interface RelNode {
  id: string;
  name: string;
  size: number;
  isCenter: boolean;
  count?: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
}
interface RelLink {
  source: string | RelNode;
  target: string | RelNode;
  value: number;
}

interface SearchSuggestion {
  code: string;
  name: string;
  price: number;
  change: number;
}

const REL_API = "http://localhost:8000";

function RelationPanel() {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);

  // ── 搜索框（完全照抄个股页实现）──
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchDropdownPos, setSearchDropdownPos] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 当前选中股票 ──
  const [centerCode, setCenterCode] = useState("");
  const [centerName, setCenterName] = useState("");

  // ── 图数据 ──
  const [graphData, setGraphData] = useState<{
    nodes: RelNode[];
    links: RelLink[];
    synced: boolean;
    updatedAt: string | null;
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    done: number;
    total: number;
    message: string;
  } | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 点击搜索框外部关闭下拉（与个股页完全相同）
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 搜索输入处理（与个股页完全相同）
  const handleSearchInput = (val: string) => {
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!val.trim()) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const url = `${REL_API}/api/search?q=${encodeURIComponent(val)}&limit=10`;
        const r = await fetch(url);
        if (r.ok) {
          const data = await r.json();
          setSearchResults(data.results ?? []);
          if ((data.results?.length ?? 0) > 0 && searchInputRef.current) {
            const rect = searchInputRef.current.getBoundingClientRect();
            setSearchDropdownPos({
              top: rect.bottom + 4,
              left: rect.left,
              width: rect.width,
            });
          }
          setShowSearchDropdown(true);
        }
      } catch {
        setSearchResults([]);
      }
    }, 200);
  };

  const handleSelectStock = (s: SearchSuggestion) => {
    setCenterCode(s.code);
    setCenterName(s.name);
    setSearchQuery(`${s.name}（${s.code}）`);
    setShowSearchDropdown(false);
    setSearchResults([]);
    fetchGraph(s.code);
  };

  const fetchGraph = async (code: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/relation/${code}`, { cache: "no-store" });
      if (!res.ok) throw new Error("查询失败");
      const data = await res.json();
      setGraphData(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const getActiveCode = () => {
    if (centerCode) return centerCode;
    const raw = searchQuery.trim();
    const m = raw.match(/[（(](\d{6})[）)]$/);
    if (m) return m[1];
    if (/^\d{6}$/.test(raw)) return raw;
    return "";
  };

  // 同步：有选中股票则只同步该股票，否则全量同步未完成的
  const startSync = async () => {
    const code = getActiveCode();
    const url = code ? `/api/relation/sync/${code}` : "/api/relation/sync/all";
    setSyncing(true);
    setSyncProgress({
      done: 0,
      total: code ? -1 : 0,
      message: code ? `正在获取 ${code} 帖子列表...` : "启动中...",
    });
    try {
      await fetch(url, { method: "POST" });
      stopPoll();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch("/api/relation/status", {
            cache: "no-store",
          });
          const s = await res.json();
          setSyncProgress({ done: s.done, total: s.total, message: s.message });
          if (!s.running) {
            stopPoll();
            setSyncing(false);
            if (code) await fetchGraph(code);
          }
        } catch {
          stopPoll();
          setSyncing(false);
        }
      }, 1000);
    } catch {
      setSyncing(false);
    }
  };

  const fetchAllGraph = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/relation/all?top=5&min_count=2", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("查询失败");
      const data = await res.json();
      setGraphData(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    const code = getActiveCode();
    if (code) fetchGraph(code);
    else fetchAllGraph();
  };

  // 挂载时检查后端是否有正在进行的同步，有则立即恢复轮询
  useEffect(() => {
    const checkOnMount = async () => {
      try {
        const res = await fetch("/api/relation/status", { cache: "no-store" });
        const s = await res.json();
        if (!s.running) return;
        // 后端正在同步，恢复 UI 状态
        setSyncing(true);
        setSyncProgress({ done: s.done, total: s.total, message: s.message });
        stopPoll();
        pollRef.current = setInterval(async () => {
          try {
            const r = await fetch("/api/relation/status", {
              cache: "no-store",
            });
            const st = await r.json();
            setSyncProgress({
              done: st.done,
              total: st.total,
              message: st.message,
            });
            if (!st.running) {
              stopPoll();
              setSyncing(false);
              const code = getActiveCode();
              if (code) await fetchGraph(code);
            }
          } catch {
            stopPoll();
            setSyncing(false);
          }
        }, 1000);
      } catch {
        // 忽略
      }
    };
    checkOnMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 清理
  useEffect(
    () => () => {
      stopPoll();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    },
    [],
  );

  // D3 渲染
  useEffect(() => {
    if (!graphData || !svgRef.current) return;
    const { nodes: rawNodes, links: rawLinks } = graphData;
    if (!rawNodes.length) return;

    import("d3").then((d3) => {
      const svg = d3.select(svgRef.current!);
      svg.selectAll("*").remove();

      const W = svgRef.current!.clientWidth || 680;
      const H = svgRef.current!.clientHeight || 460;

      const nodes: RelNode[] = rawNodes.map((n) => ({ ...n }));
      const links: RelLink[] = rawLinks.map((l) => ({ ...l }));
      const maxVal = Math.max(1, ...links.map((l) => l.value as number));

      const simulation = d3
        .forceSimulation<RelNode>(nodes)
        .force(
          "link",
          d3
            .forceLink<RelNode, RelLink>(links)
            .id((d) => d.id)
            .distance(130),
        )
        .force("charge", d3.forceManyBody().strength(-320))
        .force("center", d3.forceCenter(W / 2, H / 2))
        .force(
          "collision",
          d3.forceCollide<RelNode>().radius((d) => d.size + 14),
        );

      const g = svg.append("g");
      svg.call(
        d3
          .zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.4, 3])
          .on("zoom", (event) => g.attr("transform", event.transform)),
      );

      const link = g
        .append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", "#f5a623")
        .attr("stroke-opacity", 0.45)
        .attr("stroke-width", (d) =>
          Math.max(1, ((d.value as number) / maxVal) * 4),
        );

      const linkLabel = g
        .append("g")
        .selectAll("text")
        .data(links)
        .join("text")
        .attr("text-anchor", "middle")
        .attr("fill", "#f5a623")
        .attr("font-size", "10px")
        .attr("opacity", 0.75)
        .text((d) => `×${d.value}`);

      const node = g
        .append("g")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .style("cursor", "pointer")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .call(
          d3
            .drag<SVGGElement, RelNode>()
            .on("start", (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on("drag", (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on("end", (event, d) => {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            }) as any,
        )
        .on("click", (_event, d) => router.push(`/stock/${d.id}`));

      node
        .append("circle")
        .attr("r", (d) => d.size)
        .attr("fill", (d) =>
          d.isCenter ? "#f5a623" : "var(--bg-secondary, #1e1e2e)",
        )
        .attr("stroke", (d) => (d.isCenter ? "#e8961a" : "#f5a623"))
        .attr("stroke-width", (d) => (d.isCenter ? 3 : 1.5))
        .attr("stroke-opacity", 0.8);

      node
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", (d) => (d.isCenter ? "0.1em" : "-0.25em"))
        .attr("fill", (d) =>
          d.isCenter ? "#000" : "var(--text-primary, #fff)",
        )
        .attr("font-size", (d) => (d.isCenter ? "11px" : "9px"))
        .attr("font-weight", "bold")
        .text((d) => d.id);

      node
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", (d) => (d.isCenter ? "1.4em" : "1.15em"))
        .attr("fill", (d) =>
          d.isCenter ? "#000" : "var(--text-secondary, #aaa)",
        )
        .attr("font-size", "9px")
        .text((d) => d.name);

      simulation.on("tick", () => {
        link
          .attr("x1", (d) => (d.source as RelNode).x ?? 0)
          .attr("y1", (d) => (d.source as RelNode).y ?? 0)
          .attr("x2", (d) => (d.target as RelNode).x ?? 0)
          .attr("y2", (d) => (d.target as RelNode).y ?? 0);
        linkLabel
          .attr(
            "x",
            (d) =>
              (((d.source as RelNode).x ?? 0) +
                ((d.target as RelNode).x ?? 0)) /
              2,
          )
          .attr(
            "y",
            (d) =>
              (((d.source as RelNode).y ?? 0) +
                ((d.target as RelNode).y ?? 0)) /
                2 -
              4,
          );
        node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });
    });
  }, [graphData, router]);

  return (
    <div className="space-y-4">
      {/* 搜索栏 + 操作按钮 */}
      <div className="flex items-center gap-2">
        {/* 搜索框 — 完全照抄个股页：fixed 定位下拉，searchRef 包住整体，onClick 选中 */}
        <div ref={searchRef} className="relative flex-1">
          <div className="flex items-center gap-2 px-3 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl focus-within:border-[#f5a623]/50 focus-within:ring-1 focus-within:ring-[#f5a623]/30 transition-all">
            <Search
              size={15}
              className="text-[var(--text-tertiary)] flex-shrink-0"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                handleSearchInput(e.target.value);
                setCenterCode("");
              }}
              placeholder="搜索股票代码或名称，如 东材科技 / 601208"
              className="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  setShowSearchDropdown(false);
                  setCenterCode("");
                }}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex-shrink-0"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {/* 下拉：fixed 定位，不受父容器 overflow 影响 */}
          {showSearchDropdown && searchResults.length > 0 && (
            <div
              style={{
                position: "fixed",
                top: searchDropdownPos.top,
                left: searchDropdownPos.left,
                width: searchDropdownPos.width,
              }}
              className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl shadow-xl z-[9999] max-h-[320px] overflow-y-auto"
            >
              {searchResults.map((stock) => {
                const isUp = stock.change > 0;
                const isDown = stock.change < 0;
                return (
                  <button
                    key={stock.code}
                    onClick={() => handleSelectStock(stock)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border-color)] last:border-0"
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-sm text-[var(--text-primary)]">
                        {stock.name}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {stock.code}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium tabular-nums",
                        isUp && "text-[#e84444]",
                        isDown && "text-[#09d464]",
                        !isUp && !isDown && "text-[var(--text-tertiary)]",
                      )}
                    >
                      {isUp ? "+" : ""}
                      {stock.change?.toFixed(2)}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 数据同步 — 有选中股票则只同步该股，否则全量同步 */}
        <button
          type="button"
          onClick={startSync}
          disabled={syncing}
          title={
            getActiveCode()
              ? `同步 ${getActiveCode()} 的股吧帖子`
              : "全量同步所有未完成股票的股吧帖子"
          }
          className="flex items-center gap-1.5 border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[#f5a623]/50 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 rounded-xl text-sm transition-all whitespace-nowrap"
        >
          <DatabaseZap size={14} />
          {syncing ? "同步中..." : "数据同步"}
        </button>

        {/* 刷新 — 始终可点：有选中股票时刷新单股图，否则刷新全图 */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          title={
            getActiveCode()
              ? `刷新 ${centerName || getActiveCode()} 的关联图`
              : "刷新全部股票关联图"
          }
          className="flex items-center gap-1.5 border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[#f5a623]/50 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 rounded-xl text-sm transition-all whitespace-nowrap"
        >
          <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          刷新
        </button>
      </div>

      {/* 已选中股票标签 */}
      {centerCode && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <span className="bg-[#f5a623]/10 text-[#f5a623] border border-[#f5a623]/20 px-2 py-0.5 rounded-full font-medium">
            {centerName}（{centerCode}）
          </span>
          <span>点击「刷新」加载关联图，或先「数据同步」后再刷新</span>
        </div>
      )}

      {/* 同步进度条 */}
      {syncing && syncProgress && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-[var(--text-secondary)]">
              {syncProgress.message}
            </span>
            <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
              {syncProgress.total === -1
                ? "获取列表中..."
                : syncProgress.total === 0
                  ? ""
                  : `${syncProgress.done}/${syncProgress.total}`}
            </span>
          </div>
          {syncProgress.total > 0 && (
            <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#f5a623] rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (syncProgress.done / syncProgress.total) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div className="text-xs text-[#e84444] bg-[#e84444]/10 rounded-lg px-3 py-2 border border-[#e84444]/20">
          {error}
        </div>
      )}

      {/* 图区域 */}
      {graphData ? (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-2">
              <Network size={14} className="text-[#f5a623]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {graphData.name}（{centerCode}）关联图
              </span>
              {graphData.nodes.length > 1 && (
                <span className="text-[10px] bg-[#f5a623]/10 text-[#f5a623] px-1.5 py-0.5 rounded">
                  {graphData.nodes.length - 1} 只关联
                </span>
              )}
            </div>
            {graphData.updatedAt && (
              <span className="text-[11px] text-[var(--text-tertiary)]">
                同步于{" "}
                {new Date(graphData.updatedAt).toLocaleDateString("zh-CN")}
              </span>
            )}
          </div>

          {graphData.nodes.length <= 1 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Network size={32} className="text-[var(--text-tertiary)]" />
              <p className="text-sm text-[var(--text-tertiary)]">
                暂无关联数据，请点击「数据同步」爬取股吧帖子
              </p>
            </div>
          ) : (
            <svg ref={svgRef} className="w-full" style={{ height: 460 }} />
          )}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-[var(--text-tertiary)]">
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : !error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-[var(--text-tertiary)]">
          <Network size={48} strokeWidth={1} className="opacity-30" />
          <div className="text-center">
            <p className="text-sm font-medium mb-1">搜索股票，查看关联关系图</p>
            <p className="text-xs opacity-70">
              输入代码或名称 → 从下拉中选中 → 点击「数据同步」抓取帖子 →
              查看力导向图
            </p>
          </div>
        </div>
      ) : null}

      {/* 图例 */}
      {graphData && graphData.nodes.length > 1 && (
        <div className="flex items-center gap-4 text-[11px] text-[var(--text-tertiary)]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-[#f5a623]" />
            中心股票（点击跳转）
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full border border-[#f5a623] bg-[var(--bg-secondary)]" />
            关联股票（×N = 共现次数）
          </span>
          <span className="opacity-60">可拖拽 · 滚轮缩放</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 资讯 Tab 内容
// ─────────────────────────────────────────────────────────────────────────────
function NewsPanel() {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [selectedTheme, setSelectedTheme] = useState("");
  const [themeOptions, setThemeOptions] = useState<ThemeOption[]>([]);
  const [news, setNews] = useState<ThemeNewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState<"incremental" | "full">(
    "incremental",
  );
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const syncMenuRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 30;

  // 关闭下拉框
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setThemeDropdownOpen(false);
      }
      if (
        syncMenuRef.current &&
        !syncMenuRef.current.contains(e.target as Node)
      ) {
        setSyncMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 加载板块列表
  useEffect(() => {
    fetch("/api/theme/news-stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setThemeOptions(
          (data.themes || []).map((t: ThemeOption) => ({
            themeId: t.themeId,
            themeName: t.themeName,
            count: t.count,
          })),
        );
      })
      .catch(() => {});
  }, []);

  // 拉取新闻列表
  const fetchNews = useCallback(
    async (pageNum: number, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          page_size: String(PAGE_SIZE),
        });
        if (selectedTheme) params.set("theme_id", selectedTheme);
        if (searchKeyword) params.set("q", searchKeyword);

        const res = await fetch(`/api/theme/news-db?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("fetch error");
        const data = await res.json();
        const items: ThemeNewsItem[] = data.items || [];
        setNews((prev) => (append ? [...prev, ...items] : items));
        setTotal(data.total || 0);
        setHasMore(data.hasMore || false);
      } catch {
        // 静默失败
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [selectedTheme, searchKeyword],
  );

  // 条件变化时重置到第1页
  useEffect(() => {
    setPage(1);
    setNews([]);
    fetchNews(1, false);
  }, [fetchNews]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchKeyword(inputValue.trim());
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNews(nextPage, true);
  };

  // 触发同步（增量或全量），完成后刷新列表和板块统计
  const handleSync = async (mode: "incremental" | "full" = syncMode) => {
    if (syncing) return;
    setSyncing(true);
    setSyncMenuOpen(false);
    const endpoint =
      mode === "full" ? "/api/theme/sync-news-full" : "/api/theme/sync-news";
    try {
      await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
      });
      // 全量同步等待更长时间
      await new Promise((r) => setTimeout(r, mode === "full" ? 8000 : 4000));
      // 重新加载板块统计
      const statsRes = await fetch("/api/theme/news-stats", {
        cache: "no-store",
      });
      if (statsRes.ok) {
        const data = await statsRes.json();
        setThemeOptions(
          (data.themes || []).map((t: ThemeOption) => ({
            themeId: t.themeId,
            themeName: t.themeName,
            count: t.count,
          })),
        );
      }
      // 重新加载新闻列表（回第1页）
      setPage(1);
      setNews([]);
      fetchNews(1, false);
    } catch {
      // 静默失败
    } finally {
      setSyncing(false);
    }
  };

  const formatTime = (t: string) => {
    if (!t) return "";
    // 仅显示月-日 时:分
    return t.slice(5, 16);
  };

  const currentThemeName =
    themeOptions.find((o) => o.themeId === selectedTheme)?.themeName ||
    "全部板块";

  return (
    <div className="space-y-4">
      {/* 搜索 + 板块筛选 */}
      <div className="flex gap-3">
        {/* 搜索框 */}
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
            size={15}
          />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="搜索新闻标题关键词..."
            className="w-full pl-10 pr-10 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[#f5a623]/50 focus:ring-1 focus:ring-[#f5a623]/30 transition-all"
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => {
                setInputValue("");
                setSearchKeyword("");
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <X size={14} />
            </button>
          )}
        </form>

        {/* 板块下拉 */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setThemeDropdownOpen((v) => !v)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[#f5a623]/40 transition-all whitespace-nowrap min-w-[120px] justify-between"
          >
            <span className="truncate max-w-[90px]">{currentThemeName}</span>
            <ChevronDown
              size={13}
              className={cn(
                "flex-shrink-0 transition-transform",
                themeDropdownOpen && "rotate-180",
              )}
            />
          </button>

          {themeDropdownOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-52 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl shadow-xl overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                <button
                  onClick={() => {
                    setSelectedTheme("");
                    setThemeDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-[var(--bg-hover)] transition-colors",
                    !selectedTheme
                      ? "text-[#f5a623] font-medium"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  <span>全部板块</span>
                  {!selectedTheme && (
                    <span className="text-[10px] bg-[#f5a623]/15 text-[#f5a623] px-1.5 py-0.5 rounded">
                      {total}
                    </span>
                  )}
                </button>
                {themeOptions.map((opt) => (
                  <button
                    key={opt.themeId}
                    onClick={() => {
                      setSelectedTheme(opt.themeId);
                      setThemeDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-[var(--bg-hover)] transition-colors",
                      selectedTheme === opt.themeId
                        ? "text-[#f5a623] font-medium"
                        : "text-[var(--text-secondary)]",
                    )}
                  >
                    <span className="truncate">{opt.themeName}</span>
                    <span className="text-[10px] text-[var(--text-tertiary)] ml-2 flex-shrink-0">
                      {opt.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 同步按钮（分裂按钮：左侧触发、右侧下拉选模式） */}
        <div className="relative flex flex-shrink-0" ref={syncMenuRef}>
          <button
            onClick={() => handleSync(syncMode)}
            disabled={syncing}
            className={cn(
              "flex items-center gap-1.5 pl-3.5 pr-2.5 py-2.5 rounded-l-xl text-sm font-medium border-y border-l transition-all whitespace-nowrap",
              syncing
                ? "bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-tertiary)] cursor-not-allowed"
                : "bg-[#f5a623]/10 border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/20",
            )}
          >
            <RefreshCw size={13} className={cn(syncing && "animate-spin")} />
            {syncing
              ? "同步中..."
              : syncMode === "full"
                ? "全量补抓"
                : "增量同步"}
          </button>
          <button
            onClick={() => !syncing && setSyncMenuOpen((v) => !v)}
            disabled={syncing}
            className={cn(
              "flex items-center px-2 py-2.5 rounded-r-xl text-sm font-medium border transition-all",
              syncing
                ? "bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-tertiary)] cursor-not-allowed"
                : "bg-[#f5a623]/10 border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/20",
            )}
          >
            <ChevronDown
              size={12}
              className={cn(
                "transition-transform",
                syncMenuOpen && "rotate-180",
              )}
            />
          </button>
          {syncMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-40 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl shadow-xl overflow-hidden">
              <button
                onClick={() => {
                  setSyncMode("incremental");
                  handleSync("incremental");
                }}
                className={cn(
                  "w-full flex flex-col px-3.5 py-2.5 text-sm hover:bg-[var(--bg-hover)] transition-colors text-left",
                  syncMode === "incremental"
                    ? "text-[#f5a623] font-medium"
                    : "text-[var(--text-secondary)]",
                )}
              >
                <span>增量同步</span>
                <span className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                  仅拉取最新数据
                </span>
              </button>
              <button
                onClick={() => {
                  setSyncMode("full");
                  handleSync("full");
                }}
                className={cn(
                  "w-full flex flex-col px-3.5 py-2.5 text-sm hover:bg-[var(--bg-hover)] transition-colors text-left",
                  syncMode === "full"
                    ? "text-[#f5a623] font-medium"
                    : "text-[var(--text-secondary)]",
                )}
              >
                <span>全量补抓</span>
                <span className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                  每板块最多50页
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 结果统计行 */}
      {!loading && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-[var(--text-tertiary)]">
            {searchKeyword || selectedTheme ? (
              <span>
                找到{" "}
                <span className="text-[var(--text-secondary)] font-medium">
                  {total}
                </span>{" "}
                条结果
                {searchKeyword && (
                  <span>
                    {" "}
                    ·{" "}
                    <span className="text-[#f5a623]">
                      &quot;{searchKeyword}&quot;
                    </span>
                  </span>
                )}
                {selectedTheme && (
                  <span>
                    {" "}
                    · <span className="text-[#f5a623]">{currentThemeName}</span>
                  </span>
                )}
              </span>
            ) : (
              <span>
                共{" "}
                <span className="text-[var(--text-secondary)] font-medium">
                  {total.toLocaleString()}
                </span>{" "}
                条板块资讯
              </span>
            )}
          </div>
          {(searchKeyword || selectedTheme) && (
            <button
              onClick={() => {
                setInputValue("");
                setSearchKeyword("");
                setSelectedTheme("");
              }}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] flex items-center gap-1 transition-colors"
            >
              <X size={11} />
              清除筛选
            </button>
          )}
        </div>
      )}

      {/* 新闻列表 */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[62px] rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] animate-pulse"
            />
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Newspaper
            size={36}
            className="text-[var(--text-tertiary)] mb-3 opacity-40"
          />
          <p className="text-sm text-[var(--text-tertiary)]">
            {searchKeyword || selectedTheme
              ? "没有找到相关新闻"
              : "暂无资讯，稍后自动同步"}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
          {news.map((item, idx) => (
            <a
              key={item.id}
              href={item.url || "#"}
              target={item.url ? "_blank" : undefined}
              rel="noopener noreferrer"
              className={cn(
                "group flex items-start gap-3 px-4 py-3.5 hover:bg-[var(--bg-hover)] transition-colors",
                idx < news.length - 1 &&
                  "border-b border-[var(--border-color)]",
              )}
            >
              {/* 左侧板块标签 */}
              <div className="flex-shrink-0 mt-0.5">
                <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#f5a623]/10 text-[#f5a623] whitespace-nowrap max-w-[64px] truncate">
                  {item.themeName || "资讯"}
                </span>
              </div>

              {/* 中间标题 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text-primary)] leading-snug group-hover:text-[#f5a623] transition-colors line-clamp-2">
                  {item.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    {item.source}
                  </span>
                  <span className="text-[var(--text-tertiary)] text-[11px]">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--text-tertiary)]">
                    <Clock size={10} />
                    {formatTime(item.pubTime)}
                  </span>
                </div>
              </div>

              {/* 右侧外链图标 */}
              {item.url && (
                <ExternalLink
                  size={13}
                  className="flex-shrink-0 mt-1 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
                />
              )}
            </a>
          ))}
        </div>
      )}

      {/* 加载更多 */}
      {hasMore && !loading && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="w-full py-3 rounded-xl border border-[#f5a623]/30 text-xs font-medium text-[#f5a623] hover:bg-[#f5a623]/5 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loadingMore ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              加载中...
            </>
          ) : (
            <>
              <ChevronDown size={12} />
              加载更多（已显示 {news.length} / {total} 条）
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────────────────────────────────────
export default function StockSearchPage() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<MainTab>("stock");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [stocks, setStocks] = useState<PopularStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_DEFAULT);

  // 从数据库缓存读取榜单
  const fetchFromCache = useCallback(async (mode: SortMode) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/theme/popular-stocks?sort=${mode}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("fetch error");
      const data = await res.json();
      setStocks(parseStocks(data?.stocks ?? []));
      setUpdatedAt(data?.updatedAt ?? null);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, []);

  // 刷新：调后端实时拉取并存库，完成后更新当前榜单
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/theme/popular-stocks/refresh?sort=${sortMode}`,
        { method: "POST", cache: "no-store" },
      );
      if (!res.ok) throw new Error("refresh error");
      const data = await res.json();
      setStocks(parseStocks(data?.stocks ?? []));
      setUpdatedAt(data?.updatedAt ?? null);
      setVisibleCount(VISIBLE_DEFAULT);
    } catch {
      // 静默失败
    } finally {
      setRefreshing(false);
    }
  }, [sortMode]);

  // 切换选股 Tab 时读缓存并重置可见数量
  useEffect(() => {
    if (mainTab !== "stock") return;
    setVisibleCount(VISIBLE_DEFAULT);
    fetchFromCache(sortMode);
  }, [sortMode, fetchFromCache, mainTab]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/stock/${q}`);
  };

  const formatUpdatedAt = (iso: string | null) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
      if (diffSec < 10) return "刚刚更新";
      if (diffSec < 60) return `${diffSec}秒前`;
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
      return d.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  // 每15秒刷新时间显示
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const visibleStocks = stocks.slice(0, visibleCount);
  const topThree = visibleStocks.slice(0, 3);
  const restStocks = visibleStocks.slice(3);
  const hasMore = visibleCount < stocks.length;

  return (
    <div className="min-h-full p-6 max-w-5xl mx-auto">
      {/* Header：标题 + 主 Tab */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {mainTab === "stock"
                ? "选股"
                : mainTab === "news"
                  ? "资讯"
                  : "关联"}
            </h1>
            {/* 主 Tab 切换 */}
            <div className="flex items-center gap-0.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-0.5">
              <button
                onClick={() => setMainTab("stock")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  mainTab === "stock"
                    ? "bg-[#f5a623] text-black shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <BarChart2 size={12} />
                选股
              </button>
              <button
                onClick={() => setMainTab("news")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  mainTab === "news"
                    ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm border border-[var(--border-color)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <Newspaper size={12} />
                资讯
              </button>
              <button
                onClick={() => setMainTab("relation")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  mainTab === "relation"
                    ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm border border-[var(--border-color)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <Network size={12} />
                关联
              </button>
            </div>
          </div>
          <p className="text-[var(--text-tertiary)] text-sm">
            {mainTab === "stock"
              ? "搜索 A 股股票，获取 AI 智能分析"
              : mainTab === "news"
                ? "热门板块最新资讯，每 15 分钟自动更新"
                : "基于股吧帖子正文挖掘的股票共现关联关系"}
          </p>
        </div>
      </div>

      {mainTab === "stock" ? (
        <>
          {/* 搜索框 */}
          <form onSubmit={handleSearch} className="mb-8">
            <div className="relative">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
                size={18}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="输入股票代码或名称，如：600519 或 贵州茅台"
                className="w-full pl-12 pr-4 py-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[#f5a623]/50 focus:ring-1 focus:ring-[#f5a623]/30 text-base transition-all"
              />
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#f5a623] hover:bg-[#e8961a] text-black font-medium px-5 py-2 rounded-lg text-sm transition-colors"
              >
                搜索
              </button>
            </div>
          </form>

          {/* 榜单模块 */}
          <div>
            {/* 标题栏 + Tab + 刷新 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-0.5">
                  <button
                    onClick={() => setSortMode("hot")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      sortMode === "hot"
                        ? "bg-[#f5a623] text-black shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <Flame size={12} />
                    人气榜
                  </button>
                  <button
                    onClick={() => setSortMode("rise")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      sortMode === "rise"
                        ? "bg-[#e84444] text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <Zap size={12} />
                    飙升榜
                  </button>
                </div>
                {stocks.length > 0 && (
                  <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-1.5 py-0.5">
                    Top {stocks.length}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {updatedAt && (
                  <span
                    className="text-[11px] text-[var(--text-tertiary)]"
                    suppressHydrationWarning
                  >
                    {formatUpdatedAt(updatedAt)}
                    {tick > -1 ? "" : ""}
                  </span>
                )}
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-40"
                >
                  <RefreshCw
                    size={11}
                    className={cn(refreshing && "animate-spin")}
                  />
                  {refreshing ? "更新中..." : "刷新"}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-24 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] animate-pulse"
                    />
                  ))}
                </div>
                <div className="h-80 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] animate-pulse" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* 前3名大卡 */}
                {topThree.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {topThree.map((stock) => {
                      const isUp = (stock.pct ?? 0) > 0;
                      const isDown = (stock.pct ?? 0) < 0;
                      return (
                        <button
                          key={stock.code}
                          onClick={() => router.push(`/stock/${stock.code}`)}
                          className={cn(
                            "group relative p-4 bg-[var(--bg-secondary)] border rounded-xl text-left transition-all hover:scale-[1.01]",
                            sortMode === "hot"
                              ? "hover:border-[#f5a623]/40"
                              : "hover:border-[#e84444]/40",
                            "border-[var(--border-color)]",
                          )}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <RankBadge rank={stock.rank} />
                              <div>
                                <div className="text-[var(--text-primary)] font-semibold text-sm leading-tight">
                                  {stock.name}
                                </div>
                                <div className="text-[var(--text-tertiary)] text-[11px] mt-0.5 flex items-center gap-1.5">
                                  {stock.code}
                                  {sortMode === "rise" && stock.hisRc > 0 && (
                                    <RiseBadge hisRc={stock.hisRc} />
                                  )}
                                </div>
                              </div>
                            </div>
                            <ChevronRight
                              size={14}
                              className={cn(
                                "text-[var(--text-tertiary)] transition-colors mt-0.5 flex-shrink-0",
                                sortMode === "hot"
                                  ? "group-hover:text-[#f5a623]"
                                  : "group-hover:text-[#e84444]",
                              )}
                            />
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span
                              className={cn(
                                "font-mono text-lg font-bold",
                                isUp && "text-[#e84444]",
                                isDown && "text-[#09d464]",
                                !isUp &&
                                  !isDown &&
                                  "text-[var(--text-primary)]",
                              )}
                            >
                              {stock.price != null
                                ? `¥${stock.price.toFixed(2)}`
                                : "--"}
                            </span>
                            <PctBadge pct={stock.pct} />
                          </div>
                          <div
                            className={cn(
                              "absolute bottom-0 left-0 h-[2px] rounded-b-xl",
                              sortMode === "hot"
                                ? stock.rank === 1
                                  ? "w-full bg-[#e84444]/60"
                                  : stock.rank === 2
                                    ? "w-3/4 bg-[#f5a623]/60"
                                    : "w-1/2 bg-[#f5a623]/30"
                                : stock.rank === 1
                                  ? "w-full bg-[#e84444]/70"
                                  : stock.rank === 2
                                    ? "w-3/4 bg-[#e84444]/50"
                                    : "w-1/2 bg-[#e84444]/30",
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 4名以后的列表 */}
                {restStocks.length > 0 && (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
                    {restStocks.map((stock, idx) => {
                      const isUp = (stock.pct ?? 0) > 0;
                      const isDown = (stock.pct ?? 0) < 0;
                      return (
                        <button
                          key={stock.code}
                          onClick={() => router.push(`/stock/${stock.code}`)}
                          className={cn(
                            "group w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left",
                            idx < restStocks.length - 1 &&
                              "border-b border-[var(--border-color)]",
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <RankBadge rank={stock.rank} />
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="text-[var(--text-primary)] text-sm font-medium">
                                {stock.name}
                              </span>
                              <span className="text-[var(--text-tertiary)] text-xs">
                                {stock.code}
                              </span>
                              {sortMode === "rise" && stock.hisRc > 0 && (
                                <RiseBadge hisRc={stock.hisRc} />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0">
                            <span
                              className={cn(
                                "font-mono text-sm tabular-nums",
                                isUp && "text-[#e84444]",
                                isDown && "text-[#09d464]",
                                !isUp &&
                                  !isDown &&
                                  "text-[var(--text-primary)]",
                              )}
                            >
                              {stock.price != null
                                ? `¥${stock.price.toFixed(2)}`
                                : "--"}
                            </span>
                            <div className="w-16 text-right">
                              <PctBadge pct={stock.pct} />
                            </div>
                            <ChevronRight
                              size={14}
                              className={cn(
                                "text-[var(--text-tertiary)] transition-colors",
                                sortMode === "hot"
                                  ? "group-hover:text-[#f5a623]"
                                  : "group-hover:text-[#e84444]",
                              )}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 查看更多 */}
                {hasMore && (
                  <button
                    onClick={() => setVisibleCount(VISIBLE_ALL)}
                    className={cn(
                      "w-full py-3 rounded-xl border text-xs font-medium transition-all",
                      sortMode === "hot"
                        ? "border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/5"
                        : "border-[#e84444]/30 text-[#e84444] hover:bg-[#e84444]/5",
                    )}
                  >
                    查看更多（共 {stocks.length} 条，当前显示 {visibleCount}{" "}
                    条）
                  </button>
                )}

                {stocks.length === 0 && (
                  <div className="text-center py-12 text-[var(--text-tertiary)] text-sm">
                    暂无数据，请点击右上角刷新按钮获取最新榜单
                  </div>
                )}
              </div>
            )}

            {/* 数据来源说明 */}
            <div className="flex items-center gap-1.5 mt-3">
              <TrendingUp size={11} className="text-[var(--text-tertiary)]" />
              <p className="text-[10px] text-[var(--text-tertiary)]">
                {sortMode === "hot"
                  ? "数据来源：东方财富人气榜（访问+关注+社区热度）· 点击刷新获取最新数据"
                  : "数据来源：东方财富飙升榜（今日排名上升幅度）· 点击刷新获取最新数据"}
              </p>
            </div>
          </div>
        </>
      ) : mainTab === "news" ? (
        <NewsPanel />
      ) : (
        <RelationPanel />
      )}
    </div>
  );
}
