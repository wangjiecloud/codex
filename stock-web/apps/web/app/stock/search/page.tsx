"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  Fragment,
} from "react";
import { useRouter } from "next/navigation";
import {
  saveStockSearchPageState,
  loadStockSearchPageState,
} from "@/lib/navStore";
import {
  clearSessionCache,
  clearSessionCacheByPrefix,
  readSessionCache,
  writeSessionCache,
} from "@/lib/sessionCache";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  BookOpen,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Check,
  Cpu,
  Loader2,
  Sparkles,
  GripVertical,
  ChevronsDownUp,
  ChevronsUpDown,
  CalendarDays,
  FileText,
  LineChart,
  Plus,
  LayoutGrid,
  ChevronUp,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReviewTab from "@/components/stock/ReviewTab";

const VISIBLE_DEFAULT = 50;
const VISIBLE_ALL = 100;

type SortMode = "hot" | "rise";
type MainTab = "stock" | "news" | "relation" | "memo" | "review";

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
  industry?: string | null; // 申万行业
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
    industry: typeof s.industry === "string" ? s.industry : null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 板块分布弹框组件
// ─────────────────────────────────────────────────────────────────────────────
interface BoardDistRow {
  boardCode: string;
  boardName: string;
  stockCount: number;
  avgPct: number;
  stocks: { code: string; name: string; pct: number | null }[];
}

type BoardSortKey = "avgPct" | "stockCount";

function SectorDistModal({
  open,
  onClose,
  stocks,
  sortMode,
}: {
  open: boolean;
  onClose: () => void;
  stocks: PopularStock[];
  sortMode: SortMode;
}) {
  const [rows, setRows] = useState<BoardDistRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [sortKey, setSortKey] = useState<BoardSortKey>("stockCount");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedBoard, setExpandedBoard] = useState<string | null>(null);

  useEffect(() => {
    if (!open || stocks.length === 0) return;
    let cancelled = false;
    setLoadingRows(true);
    setRows([]);
    setExpandedBoard(null);

    (async () => {
      // 批量并发查每只股票所属板块（每批10个）
      const codeToBoards: Record<string, { code: string; name: string }[]> = {};
      const batchSize = 10;
      for (let i = 0; i < stocks.length; i += batchSize) {
        if (cancelled) return;
        const batch = stocks.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (s) => {
            try {
              const res = await fetch(
                `/api/sw-industry/boards-by-stock/${s.code}`,
                { cache: "no-store" },
              );
              if (res.ok) {
                const boards: { code: string; name: string }[] =
                  await res.json();
                codeToBoards[s.code] = boards;
              } else {
                codeToBoards[s.code] = [];
              }
            } catch {
              codeToBoards[s.code] = [];
            }
          }),
        );
      }

      if (cancelled) return;

      // 3. 按板块 code 聚合
      const boardMap: Record<
        string,
        {
          boardCode: string;
          boardName: string;
          stockList: { code: string; name: string; pct: number | null }[];
        }
      > = {};

      stocks.forEach((s) => {
        const boards = codeToBoards[s.code] ?? [];
        boards.forEach((b) => {
          if (!boardMap[b.code]) {
            boardMap[b.code] = {
              boardCode: b.code,
              boardName: b.name,
              stockList: [],
            };
          }
          boardMap[b.code].stockList.push({
            code: s.code,
            name: s.name,
            pct: s.pct,
          });
        });
      });

      // 4. 计算均值涨幅
      const result: BoardDistRow[] = Object.values(boardMap).map((b) => {
        const validPcts = b.stockList
          .filter((s) => s.pct !== null)
          .map((s) => s.pct as number);
        const avgPct =
          validPcts.length > 0
            ? validPcts.reduce((a, c) => a + c, 0) / validPcts.length
            : 0;
        return {
          boardCode: b.boardCode,
          boardName: b.boardName,
          stockCount: b.stockList.length,
          avgPct,
          stocks: b.stockList,
        };
      });

      if (!cancelled) {
        setRows(result);
        setLoadingRows(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, stocks, sortMode]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      return sortAsc ? va - vb : vb - va;
    });
  }, [rows, sortKey, sortAsc]);

  const handleSort = (key: BoardSortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ k }: { k: BoardSortKey }) => {
    if (sortKey !== k) return <ArrowUpDown size={11} className="opacity-30" />;
    return sortAsc ? (
      <ChevronUp size={11} className="text-[var(--accent)]" />
    ) : (
      <ChevronDown size={11} className="text-[var(--accent)]" />
    );
  };

  const fmtPct = (v: number) => {
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
  };
  const pctColor = (v: number) =>
    v > 0
      ? "text-[var(--color-up)]"
      : v < 0
        ? "text-[var(--color-down)]"
        : "text-[var(--text-tertiary)]";

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 w-[680px] max-h-[80vh] flex flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] shrink-0">
          <div className="flex items-center gap-2">
            <LayoutGrid size={15} className="text-[var(--accent)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              板块分布
            </span>
            <span className="text-xs text-[var(--text-tertiary)] ml-1">
              {sortMode === "hot" ? "人气榜" : "飙升榜"} · Top {stocks.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded"
          >
            <X size={14} />
          </button>
        </div>

        {/* 说明 */}
        <div className="px-5 pt-3 pb-0 shrink-0">
          <p className="text-[11px] text-[var(--text-tertiary)]">
            统计榜单内股票所属申万二级板块，涨幅均值为该板块内上榜股票的平均涨跌幅，点击行可展开查看成分股
          </p>
        </div>

        {/* 表格 */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loadingRows ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2
                size={22}
                className="animate-spin text-[var(--accent)]"
              />
              <span className="text-xs text-[var(--text-tertiary)]">
                正在查询 {stocks.length} 支股票所属板块…
              </span>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-xs text-[var(--text-tertiary)]">
              暂无数据
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[var(--text-tertiary)] border-b border-[var(--border-color)]">
                  <th className="text-left py-2 pr-3 font-medium">板块名称</th>
                  <th
                    className="text-right py-2 px-2 font-medium cursor-pointer hover:text-[var(--text-primary)] transition-colors select-none whitespace-nowrap"
                    onClick={() => handleSort("stockCount")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      上榜股数 <SortIcon k="stockCount" />
                    </span>
                  </th>
                  <th
                    className="text-right py-2 pl-2 font-medium cursor-pointer hover:text-[var(--text-primary)] transition-colors select-none whitespace-nowrap"
                    onClick={() => handleSort("avgPct")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      均值涨幅 <SortIcon k="avgPct" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <Fragment key={row.boardCode}>
                    <tr
                      className="border-b border-[var(--border-color)]/40 hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors"
                      onClick={() =>
                        setExpandedBoard(
                          expandedBoard === row.boardCode
                            ? null
                            : row.boardCode,
                        )
                      }
                    >
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-[var(--text-primary)]">
                          {row.boardName}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-[var(--text-secondary)]">
                        {row.stockCount}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 pl-2 text-right font-bold text-sm",
                          pctColor(row.avgPct),
                        )}
                      >
                        {fmtPct(row.avgPct)}
                      </td>
                    </tr>
                    {expandedBoard === row.boardCode && (
                      <tr key={`${row.boardCode}-detail`}>
                        <td colSpan={3} className="pb-2 pt-0">
                          <div className="ml-0 bg-[var(--bg-secondary)] rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
                            {row.stocks.map((s) => (
                              <span
                                key={s.code}
                                className="flex items-center gap-1.5 text-[11px]"
                              >
                                <span className="text-[var(--text-secondary)]">
                                  {s.name}
                                </span>
                                <span
                                  className={cn(
                                    "font-bold text-sm",
                                    pctColor(s.pct ?? 0),
                                  )}
                                >
                                  {s.pct !== null ? fmtPct(s.pct) : "--"}
                                </span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 底部统计 */}
        {!loadingRows && sorted.length > 0 && (
          <div className="px-5 py-3 border-t border-[var(--border-color)] shrink-0 flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-tertiary)]">
              共 {sorted.length} 个板块
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              点击行展开 / 收起成分股
            </span>
          </div>
        )}
      </div>
    </div>
  );
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
    done: number; // 产业：已完成股票数 / 单股：帖子已抓数
    total: number; // 产业：总股票数 / 单股：总帖子数
    message: string;
    // 产业同步时额外携带的当前股票帖子进度
    postDone?: number;
    postTotal?: number;
    currentCode?: string;
    industryMode?: boolean;
  } | null>(null);
  const [error, setError] = useState("");

  // 解析后端 status 响应，提取产业层面进度和帖子层面进度
  const parseStatus = (s: {
    done: number;
    total: number;
    message: string;
    mode?: string;
    post_done?: number;
    post_total?: number;
    code?: string;
  }) => {
    // 直接读后端 mode 字段；兜底用 message 中是否含 [产业同步] 前缀
    const isIndustry =
      s.mode === "industry" || s.message.includes("[产业同步]");
    // 直接读后端帖子层进度字段，不再靠 message 解析
    const postDone = (s.post_done ?? 0) > 0 ? s.post_done : undefined;
    const postTotal = (s.post_total ?? 0) > 0 ? s.post_total : undefined;
    // currentCode 从 message 里提取（格式：正在抓取 CODE...）或直接用 s.code
    const codeMatch = s.message.match(/抓取正文\s+(\w+)/);
    return {
      done: s.done,
      total: s.total,
      message: s.message,
      industryMode: isIndustry,
      postDone,
      postTotal,
      currentCode: codeMatch ? codeMatch[1] : s.code,
    };
  };
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 产业同步 ──
  const [showIndustryPicker, setShowIndustryPicker] = useState(false);
  const [industryList, setIndustryList] = useState<
    { id: string; name: string }[]
  >([]);
  const industryPickerRef = useRef<HTMLDivElement>(null);

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

  // 点击产业选择器外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        industryPickerRef.current &&
        !industryPickerRef.current.contains(e.target as Node)
      ) {
        setShowIndustryPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 拉取产业列表
  useEffect(() => {
    fetch(`${REL_API}/api/industry/list`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.industries ?? [])
          .filter((i: { id: string }) => i.id !== "overview")
          .map((i: { id: string; name: string }) => ({
            id: i.id,
            name: i.name,
          }));
        setIndustryList(list);
      })
      .catch(() => {});
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

  // 产业同步：对产业内所有 A 股逐一抓取股吧帖子，统计关联关系（复用 syncing/syncProgress/pollRef）
  const startIndustrySync = async (
    industryId: string,
    industryName: string,
  ) => {
    setShowIndustryPicker(false);
    setSyncing(true);
    setSyncProgress({
      done: 0,
      total: 0,
      message: `正在启动 ${industryName} 产业关联同步...`,
      industryMode: true,
    });
    try {
      await fetch(`${REL_API}/api/relation/sync/industry/${industryId}`, {
        method: "POST",
      });
      stopPoll();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${REL_API}/api/relation/status`, {
            cache: "no-store",
          });
          const s = await res.json();
          setSyncProgress(parseStatus(s));
          if (!s.running) {
            stopPoll();
            setSyncing(false);
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
        setSyncProgress(parseStatus(s));
        stopPoll();
        pollRef.current = setInterval(async () => {
          try {
            const r = await fetch("/api/relation/status", {
              cache: "no-store",
            });
            const st = await r.json();
            setSyncProgress(parseStatus(st));
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

        {/* 产业同步 — 选择产业后批量同步该产业内所有个股的 kline + fundamental */}
        <div className="relative" ref={industryPickerRef}>
          <button
            type="button"
            onClick={() => setShowIndustryPicker((v) => !v)}
            disabled={syncing}
            title="选择产业，抓取该产业内所有个股的股吧帖子并分析关联关系"
            className="flex items-center gap-1.5 border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[#f5a623]/50 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 rounded-xl text-sm transition-all whitespace-nowrap"
          >
            <Network size={14} />
            {syncing ? "同步中..." : "产业同步"}
            <ChevronDown
              size={12}
              className={cn(
                "transition-transform",
                showIndustryPicker && "rotate-180",
              )}
            />
          </button>
          {showIndustryPicker && industryList.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-lg z-50 py-1 max-h-72 overflow-y-auto">
              {industryList.map((ind) => (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => startIndustrySync(ind.id, ind.name)}
                  className="w-full text-left px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  {ind.name}
                </button>
              ))}
            </div>
          )}
        </div>
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
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-3 space-y-2.5">
          {/* 产业整体进度（仅产业同步模式） */}
          {syncProgress.industryMode && syncProgress.total > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  产业整体进度
                </span>
                <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
                  {syncProgress.done}/{syncProgress.total} 只股票
                </span>
              </div>
              <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (syncProgress.done / syncProgress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
          {/* 当前股票帖子进度 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--text-secondary)] truncate max-w-[75%]">
                {syncProgress.industryMode && syncProgress.currentCode
                  ? `正在抓取 ${syncProgress.currentCode}`
                  : syncProgress.message}
              </span>
              <span className="text-xs text-[var(--text-tertiary)] tabular-nums shrink-0">
                {syncProgress.postTotal && syncProgress.postDone !== undefined
                  ? `${syncProgress.postDone}/${syncProgress.postTotal}`
                  : syncProgress.total === -1
                    ? "获取列表中..."
                    : syncProgress.total === 0
                      ? ""
                      : !syncProgress.industryMode
                        ? `${syncProgress.done}/${syncProgress.total}`
                        : ""}
              </span>
            </div>
            {(syncProgress.postTotal ?? syncProgress.total) > 0 && (
              <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#f5a623] rounded-full transition-all duration-300"
                  style={{
                    width:
                      syncProgress.postTotal &&
                      syncProgress.postDone !== undefined
                        ? `${Math.min(100, (syncProgress.postDone / syncProgress.postTotal) * 100)}%`
                        : `${Math.min(100, (syncProgress.done / syncProgress.total) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
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
// AI 智能选股面板
// ─────────────────────────────────────────────────────────────────────────────
interface AITableColumn {
  key: string;
  label: string;
}

interface AIQueryState {
  status: "idle" | "loading" | "done" | "error";
  statusMsg: string;
  sql: string;
  columns: AITableColumn[];
  rows: string[][];
  total: number;
  errorMsg: string;
}

interface AIBoardGroup {
  boardName: string;
  avgChange: number | null;
  rows: string[][];
}

const PAGE_SIZE_AI = 50;

function AISearchPanel() {
  const [aiQuery, setAiQuery] = useState("");
  const [state, setState] = useState<AIQueryState>({
    status: "idle",
    statusMsg: "",
    sql: "",
    columns: [],
    rows: [],
    total: 0,
    errorMsg: "",
  });
  const [page, setPage] = useState(1);
  const [expandedBoards, setExpandedBoards] = useState<Record<string, boolean>>(
    {},
  );

  // 市值同步
  const [marketCapSyncing, setMarketCapSyncing] = useState(false);
  const [marketCapMsg, setMarketCapMsg] = useState("");

  const handleSyncMarketCap = async () => {
    if (marketCapSyncing) return;
    setMarketCapSyncing(true);
    setMarketCapMsg("启动中...");
    try {
      const res = await fetch(
        "http://localhost:8000/api/quote/sync-market-cap",
        { method: "POST" },
      );
      if (res.ok) {
        const d = (await res.json()) as { total?: number };
        setMarketCapMsg(`后台同步 ${d.total ?? "?"} 只股票市值，约90分钟完成`);
      } else {
        setMarketCapMsg("启动失败，请检查后端服务");
      }
    } catch {
      setMarketCapMsg("请求失败，请检查后端是否运行");
    } finally {
      setMarketCapSyncing(false);
      setTimeout(() => setMarketCapMsg(""), 8000);
    }
  };

  // 模型选择
  const [modelInfo, setModelInfo] = useState<{
    model: string;
    models: { name: string; model: string }[];
  } | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [switchingModel, setSwitchingModel] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    fetch("/api/agents/config")
      .then((r) => r.json())
      .then(
        (d: {
          currentModel?: string;
          models?: { name: string; model: string }[];
        }) => {
          setModelInfo({
            model: d.currentModel ?? "unknown",
            models: d.models ?? [],
          });
        },
      )
      .catch(() => {});
  }, []);

  const switchModel = async (model: string) => {
    if (!modelInfo || switchingModel) return;
    setSwitchingModel(true);
    setModelDropdownOpen(false);
    try {
      const res = await fetch("/api/agents/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (res.ok) setModelInfo((prev) => (prev ? { ...prev, model } : prev));
    } catch {
      /* ignore */
    } finally {
      setSwitchingModel(false);
    }
  };

  const handleAISearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim() || state.status === "loading") return;

    setState({
      status: "loading",
      statusMsg: "正在理解查询条件...",
      sql: "",
      columns: [],
      rows: [],
      total: 0,
      errorMsg: "",
    });
    setPage(1);
    setExpandedBoards({});

    try {
      const res = await fetch("/api/agents/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiQuery }),
      });

      if (!res.ok || !res.body) {
        setState((s) => ({
          ...s,
          status: "error",
          errorMsg: "请求失败，请检查服务状态",
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as {
              type: string;
              message?: string;
              sql?: string;
              columns?: AITableColumn[];
              rows?: string[][];
              total?: number;
            };
            if (ev.type === "status") {
              setState((s) => ({ ...s, statusMsg: ev.message ?? "" }));
            } else if (ev.type === "sql") {
              setState((s) => ({ ...s, sql: ev.sql ?? "" }));
            } else if (ev.type === "result") {
              // 保留 sql 字段（通过 functional update 保留之前 setState 的 sql）
              setState((s) => ({
                ...s,
                status: "done",
                statusMsg: "",
                columns: ev.columns ?? [],
                rows: ev.rows ?? [],
                total: ev.total ?? 0,
                errorMsg: "",
              }));
            } else if (ev.type === "empty") {
              // 保留 sql 字段，方便排查为什么没有结果
              setState((s) => ({ ...s, status: "done", rows: [], total: 0 }));
            } else if (ev.type === "error") {
              setState((s) => ({
                ...s,
                status: "error",
                errorMsg: ev.message ?? "查询出错",
              }));
            }
          } catch {
            /* ignore */
          }
        }
      }
      setState((s) => (s.status === "loading" ? { ...s, status: "done" } : s));
    } catch {
      setState((s) => ({
        ...s,
        status: "error",
        errorMsg: "请求失败，请检查服务状态",
      }));
    }
  };

  const loading = state.status === "loading";
  const hasResult = state.status === "done" && state.rows.length > 0;
  const isEmpty = state.status === "done" && state.rows.length === 0;
  const hasError = state.status === "error";

  // 涨跌幅列索引（用于着色）
  const changeColIdx = state.columns.findIndex(
    (c) => c.key === "change" || c.key === "change_pct",
  );
  const boardColIdx = state.columns.findIndex(
    (c) =>
      c.key === "industry_board" ||
      c.key === "sw_board" ||
      c.key === "board_name",
  );
  const detailColumns =
    boardColIdx >= 0
      ? state.columns.filter((_, idx) => idx !== boardColIdx)
      : state.columns;

  const groupedBoards = useMemo<AIBoardGroup[]>(() => {
    if (!hasResult) return [];

    const groups = new Map<string, string[][]>();
    state.rows.forEach((row) => {
      const rawBoards = boardColIdx >= 0 ? (row[boardColIdx] ?? "") : "";
      const boardNames = rawBoards
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean);
      const uniqueBoards =
        boardNames.length > 0 ? [...new Set(boardNames)] : ["未分类"];
      uniqueBoards.forEach((boardName) => {
        const existed = groups.get(boardName);
        if (existed) existed.push(row);
        else groups.set(boardName, [row]);
      });
    });

    const items = Array.from(groups.entries()).map(([boardName, rows]) => {
      const values = rows
        .map((row) => {
          if (changeColIdx < 0) return NaN;
          return Number.parseFloat(row[changeColIdx] ?? "");
        })
        .filter((value) => !Number.isNaN(value));
      const avgChange =
        values.length > 0
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null;
      return { boardName, avgChange, rows };
    });

    return items.sort((a, b) => {
      const diff =
        (b.avgChange ?? Number.NEGATIVE_INFINITY) -
        (a.avgChange ?? Number.NEGATIVE_INFINITY);
      if (diff !== 0) return diff;
      return b.rows.length - a.rows.length;
    });
  }, [boardColIdx, changeColIdx, hasResult, state.rows]);

  const boardTotalPages = Math.ceil(groupedBoards.length / PAGE_SIZE_AI);
  const pagedBoardGroups = groupedBoards.slice(
    (page - 1) * PAGE_SIZE_AI,
    page * PAGE_SIZE_AI,
  );

  const toggleBoard = (boardName: string) => {
    setExpandedBoards((prev) => ({ ...prev, [boardName]: !prev[boardName] }));
  };

  const formatPct = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return "--";
    return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  return (
    <div className="mb-8 bg-gradient-to-br from-[#f5a623]/5 to-[#f5a623]/10 border border-[#f5a623]/20 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#f5a623]/10 flex items-center justify-center">
            <Sparkles size={16} className="text-[#f5a623]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              AI 智能选股
            </h3>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              用自然语言描述选股条件，AI 帮你从数据库筛选
            </p>
          </div>
        </div>

        {/* 右侧操作区 */}
        <div className="flex items-center gap-2">
          {/* 同步市值按钮 */}
          <button
            onClick={handleSyncMarketCap}
            disabled={marketCapSyncing}
            title="后台异步同步全部股票市值（约90分钟）"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[#f5a623]/50 transition-all disabled:opacity-60 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] whitespace-nowrap"
          >
            <DatabaseZap
              size={11}
              className={cn(marketCapSyncing && "animate-pulse text-[#f5a623]")}
            />
            {marketCapSyncing ? "启动中..." : "同步市值"}
          </button>

          {/* 模型选择 */}
          {modelInfo && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setModelDropdownOpen((v) => !v)}
                disabled={switchingModel}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[#f5a623]/50 transition-all disabled:opacity-60 text-xs"
                title="点击切换模型"
              >
                <Cpu size={11} className="text-[#f5a623]" />
                <span className="text-[var(--text-tertiary)] font-mono max-w-[80px] truncate">
                  {switchingModel ? "切换中…" : modelInfo.model}
                </span>
                <ChevronDown
                  size={10}
                  className={cn(
                    "text-[var(--text-tertiary)] transition-transform",
                    modelDropdownOpen && "rotate-180",
                  )}
                />
              </button>
              {modelDropdownOpen && modelInfo.models.length > 0 && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                  {modelInfo.models.map((m) => (
                    <button
                      key={m.model}
                      onClick={() => switchModel(m.model)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2",
                        m.model === modelInfo.model
                          ? "bg-[#f5a623]/10 text-[#f5a623]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
                      )}
                    >
                      <span className="font-medium truncate">{m.name}</span>
                      <span className="font-mono text-[9px] text-[var(--text-tertiary)] shrink-0 truncate max-w-[60px]">
                        {m.model}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 市值同步提示 */}
      {marketCapMsg && (
        <div className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-3 py-2 mb-3">
          {marketCapMsg}
        </div>
      )}

      {/* 搜索框 */}
      <form onSubmit={handleAISearch} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            placeholder="例如：今天跌停的股票有哪些、市盈率低于20且ROE大于15%、PCB行业龙头"
            className="flex-1 px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[#f5a623]/50 focus:ring-1 focus:ring-[#f5a623]/30 transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !aiQuery.trim()}
            className="px-5 py-3 bg-[#f5a623] hover:bg-[#e8961a] text-black font-medium rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                AI 选股
              </>
            )}
          </button>
        </div>
      </form>

      {/* 状态提示 */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] py-2">
          <Loader2 size={14} className="animate-spin text-[#f5a623]" />
          <span>{state.statusMsg}</span>
          {state.sql && (
            <span className="text-[11px] text-[var(--text-tertiary)] truncate max-w-xs font-mono">
              {state.sql.slice(0, 60)}…
            </span>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {hasError && (
        <div className="space-y-2">
          <div className="text-xs text-[#e84444] bg-[#e84444]/10 border border-[#e84444]/20 rounded-lg px-3 py-2">
            {state.errorMsg}
          </div>
          {state.sql && (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-3">
              <div className="text-[11px] text-[var(--text-tertiary)] mb-1.5 font-medium">
                执行的 SQL：
              </div>
              <pre className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
                {state.sql}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 空结果 */}
      {isEmpty && (
        <div className="py-4">
          <div className="text-sm text-[var(--text-tertiary)] text-center mb-3">
            未找到符合条件的股票，请调整查询条件后重试
          </div>
          {state.sql && (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-3">
              <div className="text-[11px] text-[var(--text-tertiary)] mb-1.5 font-medium">
                执行的 SQL：
              </div>
              <pre className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
                {state.sql}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 结果表格 */}
      {hasResult && (
        <div className="mt-2">
          {/* 表格顶栏 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                共{" "}
                <span className="text-[#f5a623] font-bold">{state.total}</span>{" "}
                只股票
              </span>
              {state.sql && (
                <details className="inline">
                  <summary className="text-[11px] text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)] select-none">
                    查看 SQL
                  </summary>
                  <div className="absolute z-10 mt-1 max-w-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-3 shadow-xl">
                    <pre className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap font-mono">
                      {state.sql}
                    </pre>
                  </div>
                </details>
              )}
            </div>
            {/* 分页信息 */}
            {boardTotalPages > 1 && (
              <span className="text-[11px] text-[var(--text-tertiary)]">
                第 {page} / {boardTotalPages} 页（每页 {PAGE_SIZE_AI} 个板块）
              </span>
            )}
          </div>

          {/* 表格 */}
          <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--text-tertiary)] whitespace-nowrap w-8">
                    #
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--text-tertiary)] whitespace-nowrap">
                    板块
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-[var(--text-tertiary)] whitespace-nowrap">
                    个股数
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-[var(--text-tertiary)] whitespace-nowrap">
                    平均涨跌幅
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedBoardGroups.map((group, ri) => {
                  const globalIdx = (page - 1) * PAGE_SIZE_AI + ri + 1;
                  const expanded = !!expandedBoards[group.boardName];
                  const avgNum = group.avgChange ?? NaN;
                  const avgUp = !Number.isNaN(avgNum) && avgNum > 0;
                  const avgDown = !Number.isNaN(avgNum) && avgNum < 0;
                  return (
                    <Fragment key={group.boardName}>
                      <tr
                        onClick={() => toggleBoard(group.boardName)}
                        className={cn(
                          "border-b border-[var(--border-color)] transition-colors cursor-pointer hover:bg-[var(--bg-hover)]",
                          ri % 2 === 0
                            ? "bg-transparent"
                            : "bg-[var(--bg-secondary)]/30",
                        )}
                      >
                        <td className="px-3 py-2.5 text-[11px] text-[var(--text-tertiary)] tabular-nums">
                          {globalIdx}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                            {expanded ? (
                              <ChevronDown
                                size={14}
                                className="text-[var(--text-tertiary)]"
                              />
                            ) : (
                              <ChevronRight
                                size={14}
                                className="text-[var(--text-tertiary)]"
                              />
                            )}
                            {group.boardName}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-sm text-[var(--text-primary)]">
                          {group.rows.length}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-sm font-semibold",
                            avgUp && "text-[#e84444]",
                            avgDown && "text-[#09d464]",
                            !avgUp && !avgDown && "text-[var(--text-tertiary)]",
                          )}
                        >
                          {formatPct(group.avgChange)}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-[var(--border-color)] last:border-0 bg-[var(--bg-secondary)]/35">
                          <td colSpan={4} className="px-3 py-3">
                            <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]/70 bg-[var(--bg-primary)]">
                              <table className="w-full text-sm border-collapse">
                                <thead>
                                  <tr className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/60">
                                    {detailColumns.map((col) => (
                                      <th
                                        key={col.key}
                                        className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--text-tertiary)] whitespace-nowrap"
                                      >
                                        {col.label}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.rows.map((row, rowIdx) => {
                                    const code =
                                      row[
                                        state.columns.findIndex(
                                          (c) => c.key === "code",
                                        )
                                      ] ?? "";
                                    return (
                                      <tr
                                        key={`${group.boardName}-${code}-${rowIdx}`}
                                        onClick={() =>
                                          code &&
                                          window.open(
                                            `/stock/${code}`,
                                            "_blank",
                                          )
                                        }
                                        className={cn(
                                          "border-b border-[var(--border-color)] last:border-0 transition-colors",
                                          code
                                            ? "cursor-pointer hover:bg-[var(--bg-hover)]"
                                            : "",
                                          rowIdx % 2 === 0
                                            ? "bg-transparent"
                                            : "bg-[var(--bg-secondary)]/20",
                                        )}
                                      >
                                        {row.map((cell, ci) => {
                                          if (ci === boardColIdx) return null;
                                          const isChange = ci === changeColIdx;
                                          const num = isChange
                                            ? Number.parseFloat(cell)
                                            : NaN;
                                          const isUp =
                                            isChange &&
                                            !Number.isNaN(num) &&
                                            num > 0;
                                          const isDown =
                                            isChange &&
                                            !Number.isNaN(num) &&
                                            num < 0;
                                          const isCode =
                                            state.columns[ci]?.key === "code";
                                          return (
                                            <td
                                              key={`${group.boardName}-${code}-${ci}`}
                                              className={cn(
                                                "px-3 py-2.5 whitespace-nowrap tabular-nums",
                                                isCode &&
                                                  "font-mono text-[var(--text-secondary)] text-xs",
                                                !isCode &&
                                                  "text-sm text-[var(--text-primary)]",
                                                isUp &&
                                                  "text-[#e84444] font-medium",
                                                isDown &&
                                                  "text-[#09d464] font-medium",
                                              )}
                                            >
                                              {isChange && !Number.isNaN(num)
                                                ? formatPct(num)
                                                : cell}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 分页控件 */}
          {boardTotalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2.5 py-1.5 text-xs rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#f5a623]/50 hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                首页
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2.5 py-1.5 text-xs rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#f5a623]/50 hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                上一页
              </button>

              {/* 页码按钮 */}
              {Array.from({ length: boardTotalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 || p === boardTotalPages || Math.abs(p - page) <= 2,
                )
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                    acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="px-1 text-xs text-[var(--text-tertiary)]"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={cn(
                        "w-7 h-7 text-xs rounded border transition-all",
                        page === p
                          ? "bg-[#f5a623] border-[#f5a623] text-black font-medium"
                          : "border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#f5a623]/50 hover:text-[var(--text-primary)]",
                      )}
                    >
                      {p}
                    </button>
                  ),
                )}

              <button
                onClick={() => setPage((p) => Math.min(boardTotalPages, p + 1))}
                disabled={page === boardTotalPages}
                className="px-2.5 py-1.5 text-xs rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#f5a623]/50 hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                下一页
              </button>
              <button
                onClick={() => setPage(boardTotalPages)}
                disabled={page === boardTotalPages}
                className="px-2.5 py-1.5 text-xs rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#f5a623]/50 hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                末页
              </button>
            </div>
          )}
        </div>
      )}

      {/* 预设查询示例（仅在空闲时显示） */}
      {state.status === "idle" && (
        <div className="flex flex-wrap gap-2">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            试试：
          </span>
          {[
            "今天跌停的股票有哪些",
            "今天涨停的股票有哪些",
            "PCB行业的股票",
            "市盈率低于20且ROE大于15%",
          ].map((example) => (
            <button
              key={example}
              onClick={() => setAiQuery(example)}
              className="text-[11px] text-[#f5a623] hover:text-[#e8961a] bg-[#f5a623]/10 hover:bg-[#f5a623]/20 px-2.5 py-1 rounded-md transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 资讯 Tab 内容
// ─────────────────────────────────────────────────────────────────────────────
function NewsPanel() {
  const THEME_STATS_CACHE_KEY = "stock-search:theme-news-stats";
  const THEME_STATS_TTL = 5 * 60 * 1000;
  const NEWS_LIST_TTL = 2 * 60 * 1000;
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
  const newsCacheKey = useCallback(
    (themeId: string, keyword: string, pageNum: number) =>
      `stock-search:theme-news:${themeId || "all"}:${keyword || "all"}:${pageNum}`,
    [],
  );

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
    const cached = readSessionCache<ThemeOption[]>(THEME_STATS_CACHE_KEY);
    if (cached?.length) {
      setThemeOptions(cached);
      return;
    }

    fetch("/api/theme/news-stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const themes = (data.themes || []).map((t: ThemeOption) => ({
          themeId: t.themeId,
          themeName: t.themeName,
          count: t.count,
        }));
        setThemeOptions(themes);
        writeSessionCache(THEME_STATS_CACHE_KEY, themes, THEME_STATS_TTL);
      })
      .catch(() => {});
  }, []);

  // 拉取新闻列表
  const fetchNews = useCallback(
    async (pageNum: number, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const cacheKey = newsCacheKey(selectedTheme, searchKeyword, pageNum);
        const cached = readSessionCache<{
          items: ThemeNewsItem[];
          total: number;
          hasMore: boolean;
        }>(cacheKey);
        if (cached) {
          setNews((prev) =>
            append ? [...prev, ...cached.items] : cached.items,
          );
          setTotal(cached.total);
          setHasMore(cached.hasMore);
          return;
        }

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
        writeSessionCache(
          cacheKey,
          {
            items,
            total: data.total || 0,
            hasMore: data.hasMore || false,
          },
          NEWS_LIST_TTL,
        );
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
      clearSessionCache(THEME_STATS_CACHE_KEY);
      clearSessionCacheByPrefix("stock-search:theme-news:");
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
  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [stocks, setStocks] = useState<PopularStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_DEFAULT);
  const [watchlistCodes, setWatchlistCodes] = useState<string[]>([]);
  const [addAllToast, setAddAllToast] = useState<string | null>(null);
  const [sectorModalOpen, setSectorModalOpen] = useState(false);

  // 客户端挂载后从 localStorage 恢复持久化状态（避免 SSR hydration 不匹配）
  useEffect(() => {
    const s = loadStockSearchPageState();
    if (s?.mainTab) setMainTab(s.mainTab as MainTab);
    if (s?.sortMode) setSortMode(s.sortMode as SortMode);
  }, []);

  // 读取自选股列表
  useEffect(() => {
    fetch(`${REL_API}/api/watchlist`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setWatchlistCodes(data.codes || []))
      .catch(() => {
        // API 不可用时降级读 localStorage
        try {
          const saved = localStorage.getItem("custom-watchlist");
          if (saved) setWatchlistCodes(JSON.parse(saved) as string[]);
        } catch {
          /* ignore */
        }
      });
  }, []);

  // 一键加入自选股（去重）
  const handleAddAllToWatchlist = useCallback(async () => {
    if (stocks.length === 0) return;
    try {
      // 从 API 读取当前自选股
      let existing: string[] = watchlistCodes;
      try {
        const res = await fetch(`${REL_API}/api/watchlist`, {
          cache: "no-store",
        });
        if (res.ok) existing = (await res.json()).codes || [];
      } catch {
        /* 用 state 中的数据 */
      }

      const newCodes = stocks
        .map((s) => s.code)
        .filter((c) => !existing.includes(c));
      const merged = [...existing, ...newCodes];

      await fetch(`${REL_API}/api/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: merged }),
      });
      setWatchlistCodes(merged);
      const msg =
        newCodes.length > 0
          ? `已添加 ${newCodes.length} 只（跳过 ${stocks.length - newCodes.length} 只重复）`
          : `全部 ${stocks.length} 只已在自选股中，无需重复添加`;
      setAddAllToast(msg);
      setTimeout(() => setAddAllToast(null), 3000);
    } catch {
      // ignore
    }
  }, [stocks]);

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

  // 持久化 mainTab 和 sortMode
  useEffect(() => {
    saveStockSearchPageState({ mainTab, sortMode });
  }, [mainTab, sortMode]);

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
    <div
      className={cn(
        "min-h-full p-6",
        mainTab !== "review" && "max-w-5xl mx-auto",
      )}
    >
      {/* Header：标题 + 主 Tab */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {mainTab === "stock"
                ? "选股"
                : mainTab === "news"
                  ? "资讯"
                  : mainTab === "relation"
                    ? "关联"
                    : mainTab === "review"
                      ? "复盘"
                      : "备忘录"}
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
              <button
                onClick={() => setMainTab("memo")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  mainTab === "memo"
                    ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm border border-[var(--border-color)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <BookOpen size={12} />
                备忘录
              </button>
              <button
                onClick={() => setMainTab("review")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  mainTab === "review"
                    ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm border border-[var(--border-color)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <LineChart size={12} />
                复盘
              </button>
            </div>
          </div>
          <p className="text-[var(--text-tertiary)] text-sm">
            {mainTab === "stock"
              ? "AI 智能选股，热门股票榜单实时更新"
              : mainTab === "news"
                ? "热门板块最新资讯，每 15 分钟自动更新"
                : mainTab === "relation"
                  ? "基于股吧帖子正文挖掘的股票共现关联关系"
                  : mainTab === "review"
                    ? "全球主要指数 K 线一览，支持日/周/月周期切换"
                    : "记录你的投资思考与分析笔记"}
          </p>
        </div>
      </div>

      {mainTab === "stock" ? (
        <>
          {/* AI 智能选股 */}
          <AISearchPanel />

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
                {stocks.length > 0 && (
                  <button
                    onClick={() => setSectorModalOpen(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 transition-all"
                  >
                    <LayoutGrid size={11} />
                    板块分布
                  </button>
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
                {stocks.length > 0 && (
                  <button
                    onClick={handleAddAllToWatchlist}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                  >
                    <Plus size={11} />
                    全部加入自选
                  </button>
                )}
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
                                <div className="text-[var(--text-tertiary)] text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  <span>{stock.code}</span>
                                  {stock.industry && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                                      {stock.industry}
                                    </span>
                                  )}
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
                            <div className="min-w-0 flex items-center gap-2 flex-wrap">
                              <span className="text-[var(--text-primary)] text-sm font-medium">
                                {stock.name}
                              </span>
                              <span className="text-[var(--text-tertiary)] text-xs">
                                {stock.code}
                              </span>
                              {stock.industry && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)] whitespace-nowrap">
                                  {stock.industry}
                                </span>
                              )}
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

            {/* 添加成功 Toast */}
            {addAllToast && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--accent)]/40 shadow-xl text-[12px] text-[var(--text-primary)] flex items-center gap-2 animate-fade-in">
                <span className="text-[var(--accent)]">✓</span>
                {addAllToast}
              </div>
            )}

            {/* 板块分布弹框 */}
            <SectorDistModal
              open={sectorModalOpen}
              onClose={() => setSectorModalOpen(false)}
              stocks={stocks}
              sortMode={sortMode}
            />
          </div>
        </>
      ) : mainTab === "news" ? (
        <NewsPanel />
      ) : mainTab === "relation" ? (
        <RelationPanel />
      ) : mainTab === "review" ? (
        <ReviewTab />
      ) : (
        <MemoPanel />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 备忘录 Tab 内容
// ─────────────────────────────────────────────────────────────────────────────
interface MemoItem {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

/** 将复盘文本按「数字、日期 内容」拆分成日期块 */
interface DailyEntry {
  idx: number; // 条目序号（如 1 / 2 / 3）
  date: string; // 日期字符串（如 20260707）
  label: string; // 格式化后的日期标签（如 2026/07/07）
  body: string; // 该条目正文
}

function parseDailyEntries(content: string): DailyEntry[] | null {
  // 匹配模式：数字+顿号+8位数字日期（如 1、20260707 或 2、20260708，或行首 -- 20260707 格式）
  // 同时支持两种写法：「1、20260707」 和 「1、20260707,」
  const RE = /(?:^|\n)(\d+)[、,，]\s*(\d{8})/g;
  const matches: { idx: number; date: string; matchStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = RE.exec(content)) !== null) {
    matches.push({
      idx: parseInt(m[1]),
      date: m[2],
      matchStart: m.index === 0 ? 0 : m.index + 1,
    });
  }
  if (matches.length < 2) return null; // 不足2个日期块，不做拆分

  const entries: DailyEntry[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nextStart =
      i + 1 < matches.length ? matches[i + 1].matchStart : content.length;
    const body = content.slice(cur.matchStart, nextStart).trim();
    const d = cur.date;
    const label = `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
    entries.push({ idx: cur.idx, date: cur.date, label, body });
  }
  return entries;
}

/** 从文本提取摘要（去掉日期标记后的前 N 个字符） */
function extractSummary(content: string, maxLen = 80): string {
  const clean = content
    .replace(/\d+[、,，]\s*\d{8}/g, "") // 去掉日期标记
    .replace(/--\s*\d{8}/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + "…" : clean;
}

const MEMO_COLLAPSE_KEY = "memo_collapsed_ids";

function MemoPanel() {
  const API = "http://localhost:8000/api/memo";

  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 持仓股列表
  const [holdings, setHoldings] = useState<{ code: string; name: string }[]>(
    [],
  );

  // 折叠状态：存储已展开的 id 集合（默认全部折叠，只有主动展开的才记录）
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(MEMO_COLLAPSE_KEY);
      if (raw) return new Set(JSON.parse(raw) as number[]);
    } catch {
      /* ignore */
    }
    return new Set<number>();
  });

  // 拖拽排序
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const dragItemId = useRef<number | null>(null);

  // 新建/编辑表单
  const [editingId, setEditingId] = useState<number | null>(null); // null = 新建
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"text" | "plan">("text");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 操作预案表格行
  interface PlanRow {
    code: string;
    name: string;
    dir: string;
    trigger: string;
    target: string;
    stop: string;
    pos: string;
    note: string;
  }
  const EMPTY_ROW: PlanRow = {
    code: "",
    name: "",
    dir: "买入",
    trigger: "",
    target: "",
    stop: "",
    pos: "",
    note: "",
  };
  const [planDate, setPlanDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [planRows, setPlanRows] = useState<PlanRow[]>([{ ...EMPTY_ROW }]);

  const addPlanRow = () => setPlanRows((r) => [...r, { ...EMPTY_ROW }]);
  const delPlanRow = (i: number) =>
    setPlanRows((r) => (r.length <= 1 ? r : r.filter((_, idx) => idx !== i)));
  const setPlanCell = (i: number, field: keyof PlanRow, val: string) =>
    setPlanRows((r) =>
      r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)),
    );

  // 将表格序列化为存储内容（JSON 前缀标记）
  const serializePlan = () =>
    JSON.stringify({ _type: "plan", date: planDate, rows: planRows });

  // 解析内容：判断是否是操作预案 JSON
  const parsePlan = (
    content: string,
  ): { date: string; rows: PlanRow[] } | null => {
    try {
      const obj = JSON.parse(content) as {
        _type?: string;
        date?: string;
        rows?: PlanRow[];
      };
      if (obj._type === "plan" && obj.rows)
        return { date: obj.date ?? "", rows: obj.rows };
    } catch {
      /* not json */
    }
    return null;
  };

  const fetchWithTimeout = (url: string, opts?: RequestInit, ms = 8000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() =>
      clearTimeout(timer),
    );
  };

  const fetchMemos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(API);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MemoItem[] = await res.json();
      setMemos(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("abort")
          ? "请求超时，请检查后端服务是否运行"
          : `加载失败：${msg}`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // 折叠/展开切换（持久化到 localStorage）
  const toggleCollapse = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(MEMO_COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // 日期块折叠：key = `${memoId}-${dateStr}`，默认只展开最后一天
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

  const toggleDateEntry = (key: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 卡片展开时，自动把旧日期全部折叠（只保留最后一天展开）
  const expandMemo = (memoId: number, entries: DailyEntry[]) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(memoId);
      try {
        localStorage.setItem(MEMO_COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
    // 除最后一天，其余折叠
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      entries.slice(0, -1).forEach((e) => next.add(`${memoId}-${e.date}`));
      return next;
    });
  };

  // 全部展开 / 全部折叠
  const expandAll = () => {
    const all = new Set(memos.map((m) => m.id));
    setExpandedIds(all);
    try {
      localStorage.setItem(MEMO_COLLAPSE_KEY, JSON.stringify([...all]));
    } catch {
      /* ignore */
    }
  };
  const collapseAll = () => {
    setExpandedIds(new Set());
    try {
      localStorage.setItem(MEMO_COLLAPSE_KEY, JSON.stringify([]));
    } catch {
      /* ignore */
    }
  };

  // 拖拽处理
  const handleDragStart = (id: number) => {
    dragItemId.current = id;
  };

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (dragItemId.current !== id) setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    const sourceId = dragItemId.current;
    if (sourceId === null || sourceId === targetId) {
      setDragOverId(null);
      return;
    }
    setMemos((prev) => {
      const arr = [...prev];
      const srcIdx = arr.findIndex((m) => m.id === sourceId);
      const tgtIdx = arr.findIndex((m) => m.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      const [item] = arr.splice(srcIdx, 1);
      arr.splice(tgtIdx, 0, item);
      return arr;
    });
    setDragOverId(null);
    dragItemId.current = null;
  };

  const handleDragEnd = () => {
    setDragOverId(null);
    dragItemId.current = null;
  };

  useEffect(() => {
    fetchMemos();
    // 拉取持仓股列表
    fetch("http://localhost:8000/api/portfolio")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { code: string; name: string }[]) => {
        setHoldings(data.map((h) => ({ code: h.code, name: h.name })));
      })
      .catch(() => {});
  }, [fetchMemos]);

  const openNew = () => {
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
    setFormMode("text");
    setSaveError(null);
    setShowForm(true);
  };

  const openNewPlan = () => {
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
    setFormMode("plan");
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setPlanDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
    setPlanRows([{ ...EMPTY_ROW }]);
    setSaveError(null);
    setShowForm(true);
  };

  const openEdit = (m: MemoItem) => {
    setEditingId(m.id);
    setFormTitle(m.title);
    setFormContent(m.content);
    const plan = parsePlan(m.content);
    if (plan) {
      setFormMode("plan");
      setPlanDate(plan.date);
      setPlanRows(plan.rows);
    } else {
      setFormMode("text");
    }
    setSaveError(null);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
    setFormMode("text");
    setSaveError(null);
  };

  const saveMemo = async () => {
    const content = formMode === "plan" ? serializePlan() : formContent;
    if (formMode === "text" && !content.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      let res: Response;
      if (editingId === null) {
        res = await fetchWithTimeout(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: formTitle, content }),
        });
      } else {
        res = await fetchWithTimeout(`${API}/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: formTitle, content }),
        });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cancelForm();
      await fetchMemos();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveError(
        msg.includes("abort") ? "请求超时，请检查后端服务" : `保存失败：${msg}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteMemo = async (id: number) => {
    if (!confirm("确认删除这条备忘录？")) return;
    try {
      await fetchWithTimeout(`${API}/${id}`, { method: "DELETE" });
      await fetchMemos();
    } catch {
      // ignore
    }
  };

  const togglePin = async (m: MemoItem) => {
    try {
      await fetchWithTimeout(`${API}/${m.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !m.pinned }),
      });
      await fetchMemos();
    } catch {
      // ignore
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso + "Z");
      return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-tertiary)]">
            共 {memos.length} 条
          </span>
          {memos.length > 0 && (
            <>
              <button
                onClick={expandAll}
                title="全部展开"
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <ChevronsUpDown size={11} />
                全展开
              </button>
              <button
                onClick={collapseAll}
                title="全部折叠"
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <ChevronsDownUp size={11} />
                全折叠
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openNewPlan}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-secondary)] border border-[#f5a623]/50 text-[#f5a623] rounded-lg text-xs font-medium hover:bg-[#f5a623]/10 transition-colors"
          >
            <BarChart2 size={12} />
            新建操作预案
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f5a623] text-black rounded-lg text-xs font-medium hover:bg-[#e09510] transition-colors"
          >
            <Pencil size={12} />
            新建备忘录
          </button>
        </div>
      </div>

      {/* 新建 / 编辑表单 */}
      {showForm && (
        <div className="bg-[var(--bg-secondary)] border border-[#f5a623]/40 rounded-xl p-4 space-y-3">
          {/* 标题 */}
          <input
            autoFocus
            type="text"
            placeholder={
              formMode === "plan"
                ? "标题（如：操作预案 07/10）"
                : "标题（可选）"
            }
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="w-full bg-transparent text-sm font-medium text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none border-b border-[var(--border-color)] pb-2"
          />

          {formMode === "plan" ? (
            /* ── 操作预案表格编辑器 ── */
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-tertiary)]">
                  预案日期：
                </span>
                <input
                  type="date"
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                  className="text-xs bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1 text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50"
                />
              </div>
              <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                      {[
                        "名称",
                        "方向",
                        "触发条件",
                        "目标价",
                        "止损价",
                        "仓位%",
                        "备注",
                        "",
                      ].map((h, hi) => (
                        <th
                          key={hi}
                          className="px-2 py-2 text-left font-semibold text-[var(--text-tertiary)] whitespace-nowrap first:pl-3"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {planRows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-[var(--border-color)] last:border-0"
                      >
                        {/* 名称（持仓股下拉） */}
                        <td className="px-1 py-1 pl-2">
                          <select
                            value={row.code}
                            onChange={(e) => {
                              const h = holdings.find(
                                (h) => h.code === e.target.value,
                              );
                              setPlanRows((r) =>
                                r.map((row, idx) =>
                                  idx === i
                                    ? {
                                        ...row,
                                        code: e.target.value,
                                        name: h?.name ?? "",
                                      }
                                    : row,
                                ),
                              );
                            }}
                            className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1.5 py-1 text-xs outline-none focus:border-[#f5a623]/50 text-[var(--text-primary)] min-w-[120px]"
                          >
                            <option value="">选择持仓股...</option>
                            {holdings.map((h) => (
                              <option key={h.code} value={h.code}>
                                {h.name}（{h.code}）
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* 方向 */}
                        <td className="px-1 py-1">
                          <select
                            value={row.dir}
                            onChange={(e) =>
                              setPlanCell(i, "dir", e.target.value)
                            }
                            className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1.5 py-1 text-xs outline-none focus:border-[#f5a623]/50 text-[var(--text-primary)]"
                          >
                            <option>买入</option>
                            <option>加仓</option>
                            <option>减仓</option>
                            <option>止损</option>
                            <option>止盈</option>
                            <option>观察</option>
                          </select>
                        </td>
                        {/* 触发条件 */}
                        <td className="px-1 py-1">
                          <input
                            value={row.trigger}
                            onChange={(e) =>
                              setPlanCell(i, "trigger", e.target.value)
                            }
                            placeholder="如：站上5日线+放量"
                            className="w-[160px] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1.5 py-1 text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50 text-xs"
                          />
                        </td>
                        {/* 目标价 */}
                        <td className="px-1 py-1">
                          <input
                            value={row.target}
                            onChange={(e) =>
                              setPlanCell(i, "target", e.target.value)
                            }
                            placeholder="—"
                            className="w-[60px] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1.5 py-1 text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50 text-xs text-center"
                          />
                        </td>
                        {/* 止损价 */}
                        <td className="px-1 py-1">
                          <input
                            value={row.stop}
                            onChange={(e) =>
                              setPlanCell(i, "stop", e.target.value)
                            }
                            placeholder="—"
                            className="w-[60px] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1.5 py-1 text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50 text-xs text-center"
                          />
                        </td>
                        {/* 仓位% */}
                        <td className="px-1 py-1">
                          <input
                            value={row.pos}
                            onChange={(e) =>
                              setPlanCell(i, "pos", e.target.value)
                            }
                            placeholder="10%"
                            className="w-[50px] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1.5 py-1 text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50 text-xs text-center"
                          />
                        </td>
                        {/* 备注 */}
                        <td className="px-1 py-1">
                          <input
                            value={row.note}
                            onChange={(e) =>
                              setPlanCell(i, "note", e.target.value)
                            }
                            placeholder="备注"
                            className="w-[100px] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1.5 py-1 text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50 text-xs"
                          />
                        </td>
                        {/* 删除 */}
                        <td className="px-1 py-1 pr-2">
                          <button
                            onClick={() => delPlanRow(i)}
                            disabled={planRows.length <= 1}
                            className="p-1 text-[var(--text-tertiary)] hover:text-red-400 disabled:opacity-20 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={addPlanRow}
                className="flex items-center gap-1 text-xs text-[#f5a623] hover:text-[#e09510] transition-colors py-0.5"
              >
                <span className="text-base leading-none">+</span> 添加一行
              </button>
            </div>
          ) : (
            /* ── 普通文本备忘录 ── */
            <textarea
              placeholder="写下你的投资思考、分析笔记..."
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={6}
              className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none resize-none leading-relaxed"
            />
          )}

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-color)]">
            {saveError && (
              <p className="flex-1 text-xs text-red-400">{saveError}</p>
            )}
            <button
              onClick={cancelForm}
              className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              取消
            </button>
            <button
              onClick={saveMemo}
              disabled={(formMode === "text" && !formContent.trim()) || saving}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#f5a623] text-black rounded-lg text-xs font-medium disabled:opacity-40 hover:bg-[#e09510] transition-colors"
            >
              <Check size={12} />
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}

      {/* 备忘录列表 */}
      {loading ? (
        <div className="text-center py-12 text-[var(--text-tertiary)] text-sm">
          加载中...
        </div>
      ) : error ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={fetchMemos}
            className="text-xs text-[var(--text-tertiary)] underline hover:text-[var(--text-primary)]"
          >
            重试
          </button>
        </div>
      ) : memos.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <BookOpen
            size={32}
            className="mx-auto text-[var(--text-tertiary)] opacity-40"
          />
          <p className="text-sm text-[var(--text-tertiary)]">还没有备忘录</p>
          <p className="text-xs text-[var(--text-tertiary)] opacity-70">
            点击「新建备忘录」开始记录
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {memos.map((m) => {
            const isExpanded = expandedIds.has(m.id);
            const isDragTarget = dragOverId === m.id;
            const plan = parsePlan(m.content);
            const dailyEntries = !plan ? parseDailyEntries(m.content) : null;
            const isDailyLog =
              dailyEntries !== null && dailyEntries.length >= 2;
            const summary = !plan ? extractSummary(m.content) : null;

            // 计算标题展示
            const displayTitle =
              m.title ||
              (plan
                ? `操作预案 ${parsePlan(m.content)?.date}（${parsePlan(m.content)?.rows.length} 行）`
                : isDailyLog
                  ? `${dailyEntries[0].label} — ${dailyEntries[dailyEntries.length - 1].label}（${dailyEntries.length} 天）`
                  : m.content.slice(0, 40).replace(/\n/g, " ") +
                    (m.content.length > 40 ? "..." : ""));

            return (
              <div
                key={m.id}
                draggable
                onDragStart={() => handleDragStart(m.id)}
                onDragOver={(e) => handleDragOver(e, m.id)}
                onDrop={(e) => handleDrop(e, m.id)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "group flex bg-[var(--bg-secondary)] border rounded-xl transition-all",
                  m.pinned
                    ? "border-[#f5a623]/40"
                    : "border-[var(--border-color)] hover:border-[var(--border-hover)]",
                  isDragTarget &&
                    "border-[#f5a623]/60 bg-[#f5a623]/5 scale-[1.01] shadow-md",
                  dragItemId.current === m.id && "opacity-40",
                )}
              >
                {/* 左侧控制栏 */}
                <div className="flex flex-col items-center justify-start gap-0.5 px-1.5 pt-3 pb-3 shrink-0 border-r border-[var(--border-color)]">
                  <div
                    className="cursor-grab active:cursor-grabbing p-1 rounded text-[var(--text-tertiary)] opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                    title="拖拽排序"
                  >
                    <GripVertical size={13} />
                  </div>
                  <button
                    onClick={() =>
                      isExpanded
                        ? toggleCollapse(m.id)
                        : isDailyLog
                          ? expandMemo(m.id, dailyEntries)
                          : toggleCollapse(m.id)
                    }
                    title={isExpanded ? "折叠" : "展开"}
                    className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-all"
                  >
                    {isExpanded ? (
                      <ChevronDown size={13} />
                    ) : (
                      <ChevronRight size={13} />
                    )}
                  </button>
                </div>

                {/* 卡片主体 */}
                <div className="flex-1 min-w-0 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* ── 标题行 ── */}
                      <div
                        className="flex items-center gap-2 cursor-pointer select-none mb-1"
                        onClick={() =>
                          isExpanded
                            ? toggleCollapse(m.id)
                            : isDailyLog
                              ? expandMemo(m.id, dailyEntries)
                              : toggleCollapse(m.id)
                        }
                      >
                        {m.pinned && (
                          <Pin size={11} className="text-[#f5a623] shrink-0" />
                        )}
                        {/* 类型图标 */}
                        {plan ? (
                          <BarChart2
                            size={12}
                            className="text-[var(--text-tertiary)] shrink-0"
                          />
                        ) : isDailyLog ? (
                          <CalendarDays
                            size={12}
                            className="text-[#60a5fa] shrink-0"
                          />
                        ) : (
                          <FileText
                            size={12}
                            className="text-[var(--text-tertiary)] shrink-0"
                          />
                        )}
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {displayTitle}
                        </p>
                        {/* 日期范围 badge（复盘日记专属） */}
                        {isDailyLog && !isExpanded && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[#60a5fa]/10 text-[#60a5fa]">
                            {dailyEntries.length} 天
                          </span>
                        )}
                      </div>

                      {/* ── 折叠时：摘要 ── */}
                      {!isExpanded && (
                        <div
                          className="cursor-pointer"
                          onClick={() =>
                            isDailyLog
                              ? expandMemo(m.id, dailyEntries)
                              : toggleCollapse(m.id)
                          }
                        >
                          {plan ? (
                            <p className="text-xs text-[var(--text-tertiary)]">
                              📋 {plan.date} · {plan.rows.length} 条操作计划
                            </p>
                          ) : isDailyLog ? (
                            <div className="space-y-1">
                              {/* 日期条目预览 */}
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {dailyEntries.map((e, ei) => (
                                  <span
                                    key={`${e.date}-${ei}`}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] font-mono"
                                  >
                                    {e.label}
                                  </span>
                                ))}
                              </div>
                              {/* 文本摘要 */}
                              {summary && (
                                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed line-clamp-2 mt-1">
                                  {summary}
                                </p>
                              )}
                            </div>
                          ) : (
                            summary && (
                              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed line-clamp-2">
                                {summary}
                              </p>
                            )
                          )}
                          <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">
                            {formatTime(m.updated_at)}
                          </p>
                        </div>
                      )}

                      {/* ── 展开时：完整内容 ── */}
                      {isExpanded && (
                        <>
                          {plan ? (
                            /* 操作预案表格 */
                            <div className="mt-2 space-y-1.5">
                              <p className="text-[11px] text-[var(--text-tertiary)]">
                                📋 {plan.date}
                              </p>
                              <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                                      {[
                                        "代码",
                                        "名称",
                                        "方向",
                                        "触发条件",
                                        "目标价",
                                        "止损价",
                                        "仓位%",
                                        "备注",
                                      ].map((h) => (
                                        <th
                                          key={h}
                                          className="px-3 py-2 text-left font-semibold text-[var(--text-tertiary)] whitespace-nowrap"
                                        >
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {plan.rows.map((row, ri) => {
                                      const DIR_COLOR: Record<string, string> =
                                        {
                                          买入: "text-[#e84444]",
                                          加仓: "text-[#e84444]",
                                          止损: "text-[#09d464]",
                                          减仓: "text-[#09d464]",
                                          止盈: "text-[#09d464]",
                                          观察: "text-[var(--text-tertiary)]",
                                        };
                                      return (
                                        <tr
                                          key={ri}
                                          className={cn(
                                            "border-b border-[var(--border-color)] last:border-0",
                                            ri % 2 === 1 &&
                                              "bg-[var(--bg-secondary)]/40",
                                          )}
                                        >
                                          <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">
                                            {row.code || "—"}
                                          </td>
                                          <td className="px-3 py-2 text-[var(--text-primary)] font-medium whitespace-nowrap">
                                            {row.name || "—"}
                                          </td>
                                          <td
                                            className={cn(
                                              "px-3 py-2 font-semibold whitespace-nowrap",
                                              DIR_COLOR[row.dir] ??
                                                "text-[var(--text-secondary)]",
                                            )}
                                          >
                                            {row.dir}
                                          </td>
                                          <td className="px-3 py-2 text-[var(--text-secondary)]">
                                            {row.trigger || "—"}
                                          </td>
                                          <td className="px-3 py-2 tabular-nums text-[var(--text-primary)]">
                                            {row.target || "—"}
                                          </td>
                                          <td className="px-3 py-2 tabular-nums text-[var(--text-primary)]">
                                            {row.stop || "—"}
                                          </td>
                                          <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">
                                            {row.pos || "—"}
                                          </td>
                                          <td className="px-3 py-2 text-[var(--text-tertiary)]">
                                            {row.note || ""}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : isDailyLog ? (
                            /* 复盘日记：按日期分块，每块可独立折叠 */
                            <div className="mt-3 space-y-0">
                              {dailyEntries.map((entry, ei) => {
                                const dateKey = `${m.id}-${entry.date}`;
                                const isDateCollapsed =
                                  collapsedDates.has(dateKey);
                                const bodyText = entry.body
                                  .replace(/^\d+[、,，]\s*\d{8}\s*/, "")
                                  .replace(/--\s*\d{8}/g, "")
                                  .trim();
                                const bodyPreview =
                                  bodyText.slice(0, 60).replace(/\n/g, " ") +
                                  (bodyText.length > 60 ? "…" : "");

                                return (
                                  <div
                                    key={`${entry.date}-${ei}`}
                                    className={cn(
                                      "relative pl-4",
                                      ei < dailyEntries.length - 1 && "pb-3",
                                    )}
                                  >
                                    {/* 时间轴线 */}
                                    {ei < dailyEntries.length - 1 && (
                                      <div className="absolute left-[5px] top-5 bottom-0 w-px bg-[var(--border-color)]" />
                                    )}
                                    {/* 圆点：折叠时实心，展开时空心 */}
                                    <div
                                      className={cn(
                                        "absolute left-0 top-[5px] w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-secondary)] transition-colors",
                                        isDateCollapsed
                                          ? "bg-[var(--border-color)]"
                                          : "bg-[#60a5fa]/70",
                                      )}
                                    />

                                    {/* 日期标题行（可点击折叠） */}
                                    <button
                                      onClick={() => toggleDateEntry(dateKey)}
                                      className="w-full flex items-center gap-2 mb-1.5 group/date"
                                    >
                                      <span className="text-[11px] font-semibold text-[#60a5fa] font-mono tracking-wide">
                                        {entry.label}
                                      </span>
                                      <div className="flex-1 h-px bg-[var(--border-color)]" />
                                      {isDateCollapsed ? (
                                        <ChevronRight
                                          size={11}
                                          className="text-[var(--text-tertiary)] shrink-0"
                                        />
                                      ) : (
                                        <ChevronDown
                                          size={11}
                                          className="text-[var(--text-tertiary)] shrink-0"
                                        />
                                      )}
                                    </button>

                                    {/* 折叠时：一行摘要 */}
                                    {isDateCollapsed && (
                                      <p
                                        className="text-xs text-[var(--text-tertiary)] leading-relaxed mb-1 cursor-pointer"
                                        onClick={() => toggleDateEntry(dateKey)}
                                      >
                                        {bodyPreview}
                                      </p>
                                    )}

                                    {/* 展开时：完整正文 */}
                                    {!isDateCollapsed && (
                                      <div className="memo-markdown text-sm text-[var(--text-secondary)] leading-relaxed">
                                        <ReactMarkdown
                                          remarkPlugins={[remarkGfm]}
                                        >
                                          {bodyText}
                                        </ReactMarkdown>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            /* 普通 markdown 内容 */
                            <div className="mt-2 memo-markdown text-sm text-[var(--text-secondary)] leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {m.content}
                              </ReactMarkdown>
                            </div>
                          )}
                          <p className="mt-3 text-[11px] text-[var(--text-tertiary)]">
                            {formatTime(m.updated_at)}
                          </p>
                        </>
                      )}
                    </div>

                    {/* 操作按钮（hover显示） */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => togglePin(m)}
                        title={m.pinned ? "取消置顶" : "置顶"}
                        className="p-1.5 rounded-md hover:bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:text-[#f5a623] transition-colors"
                      >
                        {m.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                      </button>
                      <button
                        onClick={() => openEdit(m)}
                        title="编辑"
                        className="p-1.5 rounded-md hover:bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => deleteMemo(m.id)}
                        title="删除"
                        className="p-1.5 rounded-md hover:bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
