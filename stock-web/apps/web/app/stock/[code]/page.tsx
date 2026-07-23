"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Plus, Star, X, Search } from "lucide-react";
import { StockChart, KLineBar } from "@/components/stock/StockChart";
import MinuteChartModal from "@/components/stock/MinuteChartModal";
import { AgentPanel } from "@/components/agents/AgentPanel";
import { cn, getPriceColor, formatPercent } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface QuoteData {
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
}

interface NewsItem {
  code: string;
  title: string;
  url: string;
  source: string;
  pubTime: string;
}

interface GubaItem {
  title: string;
  url: string;
  author: string;
  readCount: number;
  replyCount: number;
  pubTime: string;
}

interface StockSearchResult {
  code: string;
  name: string;
  price?: number;
  change?: number;
}

interface FundamentalData {
  report_date?: string;
  revenue?: string;
  revenue_yoy?: string;
  net_profit?: string;
  net_profit_yoy?: string;
  deducted_profit?: string;
  eps?: string;
  nav_per_share?: string;
  cfps?: string;
  net_margin?: string;
  gross_margin?: string;
  roe?: string;
  debt_ratio?: string;
  current_ratio?: string;
  quick_ratio?: string;
  inventory_turnover?: string;
  ar_days?: string;
  updated_at?: string;
}

interface BusinessBreakdownItem {
  name: string;
  ratio: number;
  revenue?: number;
  yoy?: number;
}

interface IncomeHistoryItem {
  report_date: string;
  revenue?: number;
  revenue_yoy?: number;
  net_profit?: number;
  net_profit_yoy?: number;
  gross_margin?: number;
  net_margin?: number;
  roe_weighted?: number;
  eps_basic?: number;
}

interface FinanceViewData {
  updated_at?: string;
  has_data: boolean;
  business_breakdown: BusinessBreakdownItem[];
  income_history: IncomeHistoryItem[];
  syncing: boolean;
}

const DEFAULT_QUOTE: QuoteData = {
  name: "",
  price: 0,
  change: 0,
  changeAmt: 0,
  open: 0,
  prevClose: 0,
  high: 0,
  low: 0,
  volume: 0,
  turnover: 0,
  marketCap: 0,
  pe: 0,
  pb: 0,
  turnoverRate: 0,
};

const WATCHLIST_KEY = "stock_recently_viewed";

function getRecentlyViewed(): Array<{ code: string; name: string }> {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(WATCHLIST_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    const seen = new Set<string>();
    const deduped = parsed.filter((item: { code: string; name: string }) => {
      if (seen.has(item.code)) return false;
      if (item.code === "000001") return false;
      if (item.code === "688208") return false;
      if (item.code === "detail") return false;
      if (!item.code || !item.name) return false;
      seen.add(item.code);
      return true;
    });

    if (deduped.length !== parsed.length) {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(deduped));
    }

    return deduped;
  } catch {
    return [];
  }
}

function addToRecentlyViewed(code: string, name: string) {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentlyViewed();
    // 无论是否已存在，都移到第一位（已存在则先移除再插到头部）
    const filtered = recent.filter((item) => item.code !== code);
    const updated = [{ code, name }, ...filtered];
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
  } catch {}
}

function removeFromRecentlyViewed(code: string) {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentlyViewed();
    const updated = recent.filter((item) => item.code !== code);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
  } catch {}
}

const API = "http://localhost:8000";
const INDICATORS = ["VOL", "MACD", "KDJ", "BOLL", "RSI", "DMI", "CCI", "W&R"];
const MA_PERIODS = [5, 10, 20, 30, 60];
const PERIODS = ["日K", "周K", "月K"];
const BOTTOM_TABS = ["财务", "资讯", "公告"];

const PERIOD_MAP: Record<string, string> = {
  日K: "daily",
  周K: "weekly",
  月K: "monthly",
};

function getMarketBadge(code: string): {
  label: string;
  bg: string;
  text: string;
} {
  if (/^688/.test(code))
    return { label: "科创", bg: "bg-blue-500/15", text: "text-blue-400" };
  if (/^300|^301/.test(code))
    return { label: "创业", bg: "bg-green-500/15", text: "text-green-400" };
  if (/^60/.test(code))
    return { label: "沪市", bg: "bg-red-500/15", text: "text-red-400" };
  if (/^00/.test(code))
    return { label: "深市", bg: "bg-orange-500/15", text: "text-orange-400" };
  if (/^43|^83|^87/.test(code))
    return { label: "北交", bg: "bg-cyan-500/15", text: "text-cyan-400" };
  return {
    label: "其他",
    bg: "bg-[var(--bg-tertiary)]",
    text: "text-[var(--text-tertiary)]",
  };
}

function formatVolume(vol: number): string {
  if (vol >= 1e8) return (vol / 1e8).toFixed(2) + "亿手";
  if (vol >= 1e4) return (vol / 1e4).toFixed(2) + "万手";
  return vol.toFixed(0) + "手";
}

function formatAmount(amt: number): string {
  if (amt >= 1e8) return (amt / 1e8).toFixed(2) + "亿";
  if (amt >= 1e4) return (amt / 1e4).toFixed(2) + "万";
  return amt.toFixed(0);
}

// ── 财务 Tab 辅助 ──────────────────────────────────────
const PIE_COLORS = [
  "#4f9cf5",
  "#36bfa6",
  "#f5a623",
  "#e74c6f",
  "#9b59b6",
  "#2ecc71",
  "#e67e22",
  "#1abc9c",
  "#e91e63",
];

function formatRevenue(val?: number | null): string {
  if (val == null) return "--";
  const abs = Math.abs(val);
  if (abs >= 1e8) return (val / 1e8).toFixed(2) + "亿";
  if (abs >= 1e4) return (val / 1e4).toFixed(2) + "万";
  return val.toFixed(2);
}

function formatYoy(val?: number | null): string {
  if (val == null) return "--";
  return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
}

function formatPct(val?: number | null): string {
  if (val == null) return "--";
  return val.toFixed(2) + "%";
}

function getChangeColor(val?: number | null): string {
  if (val == null) return "text-[var(--text-tertiary)]";
  if (val > 0) return "text-[#f03e3e]"; // A股习惯：红涨
  if (val < 0) return "text-[#16a34a]"; // 绿跌
  return "text-[var(--text-secondary)]";
}
// ── /财务 Tab 辅助 ─────────────────────────────────────

const INDUSTRY_LABELS: Record<string, string> = {
  overview: "AI算力全景",
  aigpu: "AI算力芯片",
  pcb: "PCB",
  mlcc: "MLCC",
  memory: "存储芯片",
  optics: "光模块与CPO",
  fiber: "光纤光缆",
  liquidcool: "液冷散热",
  aipower: "AI供配电",
  coppercable: "高速铜连接",
  idc: "智算中心/IDC",
  glasssub: "玻璃基板",
  aiserver: "AI服务器",
  semieq: "半导体设备",
};

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = params.code as string;
  const fromPath = searchParams.get("from") ?? null;
  const fromTab = searchParams.get("tab") ?? null;
  const fromNode = searchParams.get("node") ?? null;
  // 来源类型：sw（板块详情→个股）/ sw_list（板块列表→个股）/ watchlist / null
  const fromSource = searchParams.get("src") ?? null;
  // 来源板块信息（来自申万板块时使用）
  const fromBoardCode = searchParams.get("bc") ?? null;
  const fromBoardName = searchParams.get("bn") ?? null;
  // 来自自选股产业股Tab时的产业名和层级名
  const fromIndustryName = searchParams.get("in")
    ? decodeURIComponent(searchParams.get("in")!)
    : null;
  const fromSubGroupName = searchParams.get("isn")
    ? decodeURIComponent(searchParams.get("isn")!)
    : null;

  const fromIndustryId = fromPath?.match(/^\/industry\/(.+)$/)?.[1] ?? null;
  const fromLabel = fromIndustryId
    ? (INDUSTRY_LABELS[fromIndustryId] ?? fromIndustryId)
    : null;

  // 构建面包屑显示文本和返回 URL
  const { backUrl, backLabel, backParentLabel, backParentUrl } = (() => {
    // 来自申万板块详情（板块列表 → 板块详情 → 个股）
    if (fromSource === "sw" && fromBoardCode) {
      return {
        backUrl: `/sw/${fromBoardCode}?bn=${encodeURIComponent(fromBoardName ?? fromBoardCode)}`,
        backLabel: fromBoardName ?? fromBoardCode,
        backParentLabel: "板块",
        backParentUrl: "/sw",
      };
    }
    // 来自板块列表直接跳转（板块列表 → 个股）
    if (fromSource === "sw_list") {
      return {
        backUrl: "/sw",
        backLabel: fromBoardName ? `${fromBoardName}成分股` : "板块列表",
        backParentLabel: null,
        backParentUrl: null,
      };
    }
    // 来自自选股
    if (fromSource === "watchlist") {
      // 如果有产业名和层级名，展示更细致的面包屑
      if (fromIndustryName && fromSubGroupName) {
        return {
          backUrl: "/watchlist",
          backLabel: `${fromSubGroupName}`,
          backParentLabel: `自选股 · ${fromIndustryName}`,
          backParentUrl: "/watchlist",
        };
      }
      if (fromIndustryName) {
        return {
          backUrl: "/watchlist",
          backLabel: fromIndustryName,
          backParentLabel: "自选股",
          backParentUrl: "/watchlist",
        };
      }
      return {
        backUrl: "/watchlist",
        backLabel: "自选股",
        backParentLabel: null,
        backParentUrl: null,
      };
    }
    // 来自产业详情（原有逻辑）
    if (fromPath) {
      const parts: string[] = [];
      if (fromTab) parts.push(`tab=${fromTab}`);
      if (fromNode) parts.push(`node=${fromNode}`);
      const url =
        parts.length > 0 ? `${fromPath}?${parts.join("&")}` : fromPath;
      return {
        backUrl: url,
        backLabel: fromLabel ?? fromPath,
        backParentLabel: "产业分析",
        backParentUrl: "/industry",
      };
    }
    // 默认返回选股页
    return {
      backUrl: "/stock/search",
      backLabel: "选股",
      backParentLabel: null,
      backParentUrl: null,
    };
  })();

  const [quote, setQuote] = useState<QuoteData>(DEFAULT_QUOTE);
  const [klineData, setKlineData] = useState<KLineBar[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [activeIndicators, setActiveIndicators] = useState(["VOL", "MACD"]);
  const [activeMAs, setActiveMAs] = useState<number[]>([5, 10, 20, 30, 60]);
  const toggleMA = (period: number) => {
    setActiveMAs((prev) =>
      prev.includes(period)
        ? prev.filter((p) => p !== period)
        : [...prev, period],
    );
  };
  const [activePeriod, setActivePeriod] = useState("日K");
  const [activeTab, setActiveTab] = useState("财务");
  const [isStarred, setIsStarred] = useState(false);
  const [watchlist, setWatchlist] = useState<
    Array<{ code: string; name: string }>
  >([]);
  const [bottomHeight, setBottomHeight] = useState(150);
  const [isResizing, setIsResizing] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [chartAreaHeight, setChartAreaHeight] = useState(0);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [fundamental, setFundamental] = useState<FundamentalData | null>(null);
  const [financeView, setFinanceView] = useState<FinanceViewData | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [gubaNews, setGubaNews] = useState<GubaItem[]>([]);
  const [gubaNotice, setGubaNotice] = useState<GubaItem[]>([]);
  const [gubaLoading, setGubaLoading] = useState(false); // 首次加载（无数据时）
  const [gubaSyncing, setGubaSyncing] = useState(false); // 后台静默同步中
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchDropdownPos, setSearchDropdownPos] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 分时图弹框状态
  const [minuteModalOpen, setMinuteModalOpen] = useState(false);
  const [minuteModalDate, setMinuteModalDate] = useState("");
  const [minuteSyncing, setMinuteSyncing] = useState(false);
  const [minuteSyncMsg, setMinuteSyncMsg] = useState<string | null>(null);

  // 双击K线：打开分时弹框
  const handleBarDoubleClick = useCallback((bar: KLineBar) => {
    setMinuteModalDate(bar.time);
    setMinuteModalOpen(true);
  }, []);

  // 同步分时数据按钮：同步自选股（watchlist）中所有A股当日分时数据到DB
  const handleSyncMinute = useCallback(async () => {
    if (minuteSyncing) return;
    setMinuteSyncing(true);
    setMinuteSyncMsg(null);
    try {
      // 收集 watchlist 中的 A 股 codes（加上当前股票）
      const watchlistCodes = watchlist.map((s) => s.code);
      const allCodes = Array.from(new Set([code, ...watchlistCodes])).filter(
        (c) => /^[036]\d{5}$/.test(c),
      );
      const res = await fetch("/api/minute/sync-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: allCodes }),
      });
      const json = await res.json();
      if (res.ok) {
        const { ok = 0, cached = 0, error = 0, total = 0 } = json;
        const newCount = ok;
        if (total === 0) {
          setMinuteSyncMsg("无可同步股票");
        } else if (error > 0) {
          setMinuteSyncMsg(`同步完成：新增${newCount}条，${error}只失败`);
        } else {
          setMinuteSyncMsg(
            cached === total
              ? `${total}只已有缓存`
              : `新增${newCount}只，共${total}只`,
          );
        }
      } else {
        setMinuteSyncMsg(json.detail ?? "同步失败");
      }
    } catch {
      setMinuteSyncMsg("同步失败");
    } finally {
      setMinuteSyncing(false);
      setTimeout(() => setMinuteSyncMsg(null), 4000);
    }
  }, [code, minuteSyncing, watchlist]);

  useEffect(() => {
    setWatchlist(getRecentlyViewed());

    if (code === "detail" || !code || code === "undefined") {
      const recent = getRecentlyViewed();
      if (recent.length > 0) {
        router.replace(`/stock/${recent[0].code}`);
      }
    }
  }, [code, router]);

  useEffect(() => {
    if (quote.name) {
      addToRecentlyViewed(code, quote.name);
      // 置顶后同步刷新左侧列表 UI
      setWatchlist(getRecentlyViewed());
    }
  }, [code, quote.name]);

  useEffect(() => {
    setQuoteLoading(true);
    fetch(`http://localhost:8000/api/quote/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.price !== undefined) setQuote(data as QuoteData);
      })
      .catch(() => {})
      .finally(() => setQuoteLoading(false));
  }, [code]);

  useEffect(() => {
    const period = PERIOD_MAP[activePeriod];
    if (!period) return;
    setKlineData([]);
    fetch(`http://localhost:8000/api/kline/${code}?period=${period}&count=110`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setKlineData(data);
        } else if (data.bars && data.bars.length > 0) {
          setKlineData(data.bars);
        } else {
          setKlineData([]);
        }
      })
      .catch(() => {
        setKlineData([]);
      });
  }, [code, activePeriod]);

  useEffect(() => {
    fetch(`http://localhost:8000/api/news/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.news) setNews(data.news);
      })
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    // 当切换到财务 tab 时：先从数据库加载 finance-view 数据，同时后台同步
    if (activeTab !== "财务") return;
    setFinanceLoading(true);
    fetch(`http://localhost:8000/api/fundamental/${code}/finance-view`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setFinanceView(data as FinanceViewData);
      })
      .catch(() => {})
      .finally(() => setFinanceLoading(false));
  }, [code, activeTab]);

  // 当切换到资讯/公告 tab 时：先读库展示已有数据，同时后台静默同步
  useEffect(() => {
    if (activeTab !== "资讯" && activeTab !== "公告") return;
    const postType = activeTab === "资讯" ? "news" : "notice";

    const loadFromDb = () =>
      fetch(
        `http://localhost:8000/api/guba/${code}?post_type=${postType}&count=50`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.items) {
            if (postType === "news") setGubaNews(data.items as GubaItem[]);
            else setGubaNotice(data.items as GubaItem[]);
          }
          return data?.items ?? [];
        })
        .catch(() => [] as GubaItem[]);

    // 先从数据库加载：有数据直接展示，无数据显示 loading
    loadFromDb().then((items) => {
      if (items.length === 0) setGubaLoading(true);

      // 后台静默同步（不影响列表展示）
      setGubaSyncing(true);
      fetch(`http://localhost:8000/api/guba/sync/${code}`, { method: "POST" })
        .then(() => loadFromDb())
        .catch(() => {})
        .finally(() => {
          setGubaLoading(false);
          setGubaSyncing(false);
        });
    });
  }, [code, activeTab]);

  const toggleIndicator = (ind: string) => {
    setActiveIndicators((prev) =>
      prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind],
    );
  };

  const displayName = quote.name || `股票${code}`;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById("main-chart-container");
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;
      const minHeight = 120;
      const maxHeight = containerRect.height - 300;

      setBottomHeight(Math.min(Math.max(newHeight, minHeight), maxHeight));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 监听图表区容器高度变化，传给 StockChart 做自适应分配
  useEffect(() => {
    const el = chartAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setChartAreaHeight(el.clientHeight);
    });
    ro.observe(el);
    setChartAreaHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

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
        const url = `${API}/api/search?q=${encodeURIComponent(val)}&limit=10`;
        console.log("[Stock Search] Fetching:", url);
        const r = await fetch(url);
        console.log("[Stock Search] Response status:", r.status);
        if (r.ok) {
          const data = await r.json();
          console.log(
            "[Stock Search] Results:",
            data.results?.length ?? 0,
            "items",
          );
          setSearchResults(data.results ?? []);
          if ((data.results?.length ?? 0) > 0 && searchInputRef.current) {
            const rect = searchInputRef.current.getBoundingClientRect();
            setSearchDropdownPos({
              top: rect.bottom + 4,
              left: rect.left,
              width: 240,
            });
          }
          setShowSearchDropdown(true);
        } else {
          console.error("[Stock Search] Error:", r.status, r.statusText);
        }
      } catch (err) {
        console.error("[Stock Search] Fetch error:", err);
        setSearchResults([]);
      }
    }, 200);
  };

  const handleSelectStock = (stock: StockSearchResult) => {
    addToRecentlyViewed(stock.code, stock.name);
    setSearchQuery("");
    setShowSearchDropdown(false);
    setSearchResults([]);
    router.push(`/stock/${stock.code}`);
  };

  return (
    <div className="flex flex-col h-full text-xs overflow-hidden">
      {/* Top toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0 overflow-x-auto">
        {/* 面包屑导航返回按钮 */}
        {backParentUrl && (
          <>
            <button
              onClick={() => router.push(backParentUrl)}
              className="flex items-center gap-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] shrink-0 transition-colors"
            >
              <span className="text-[11px]">{backParentLabel}</span>
            </button>
            <span className="text-[var(--text-tertiary)] text-[11px] shrink-0">
              /
            </span>
          </>
        )}
        <button
          onClick={() => router.push(backUrl)}
          className="flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mr-2 shrink-0 transition-colors"
          title={`返回${backLabel}`}
        >
          <ArrowLeft size={13} />
          <span className="text-[11px]">{backLabel}</span>
        </button>
        <button
          onClick={() => setIsStarred((s) => !s)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded border mr-2 shrink-0 transition-colors",
            isStarred
              ? "border-[#f5a623]/50 text-[#f5a623] bg-[#f5a623]/10"
              : "border-[var(--border-color)] text-[var(--text-tertiary)]",
          )}
        >
          <Star size={12} fill={isStarred ? "currentColor" : "none"} />
          自选股
        </button>

        <div ref={searchRef} className="relative mr-2 shrink-0">
          <div className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-deep)] w-[140px]">
            <Search size={11} className="text-[var(--text-tertiary)]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder="搜索股票"
              className="flex-1 bg-transparent outline-none text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  setShowSearchDropdown(false);
                }}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X size={10} />
              </button>
            )}
          </div>
          {showSearchDropdown && searchResults.length > 0 && (
            <div
              style={{
                position: "fixed",
                top: searchDropdownPos.top,
                left: searchDropdownPos.left,
                width: searchDropdownPos.width,
              }}
              className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-lg z-[9999] max-h-[320px] overflow-y-auto"
            >
              {searchResults.map((stock) => (
                <button
                  key={stock.code}
                  onClick={() => handleSelectStock(stock)}
                  className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border-color)] last:border-0"
                >
                  <div className="flex flex-col items-start">
                    <span className="text-[11px] text-[var(--text-primary)]">
                      {stock.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {stock.code}
                    </span>
                  </div>
                  {stock.change !== undefined && (
                    <span
                      className={cn(
                        "text-[10px]",
                        stock.change > 0
                          ? "text-[#e84444]"
                          : stock.change < 0
                            ? "text-[#09d464]"
                            : "text-[var(--text-secondary)]",
                      )}
                    >
                      {stock.change > 0 ? "+" : ""}
                      {stock.change.toFixed(2)}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setActivePeriod(p)}
            className={cn(
              "px-2 py-1 rounded whitespace-nowrap transition-colors shrink-0",
              activePeriod === p
                ? "text-[#f5a623] bg-[#f5a623]/10"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
            )}
          >
            {p}
          </button>
        ))}

        {/* 同步分时按钮 */}
        <div className="w-px h-4 bg-[var(--border-color)] mx-1 shrink-0" />
        <button
          onClick={handleSyncMinute}
          disabled={minuteSyncing}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded border whitespace-nowrap transition-colors shrink-0 text-[11px]",
            minuteSyncing
              ? "border-[var(--border-color)] text-[var(--text-tertiary)] opacity-60 cursor-wait"
              : "border-[var(--border-color)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[#f5a623]/50",
          )}
          title="同步自选股当日分时数据到数据库（每日收盘后自动执行，也可手动触发）"
        >
          {minuteSyncing ? (
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                border: "1.5px solid var(--border-color)",
                borderTopColor: "#e84444",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
          ) : (
            <svg
              width="11"
              height="11"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M10 6A4 4 0 1 1 6 2" strokeLinecap="round" />
              <path d="M6 1v3l2-1.5L6 1z" fill="currentColor" stroke="none" />
            </svg>
          )}
          同步分时
        </button>
        {minuteSyncMsg && (
          <span
            className={cn(
              "text-[10px] shrink-0",
              minuteSyncMsg.includes("失败")
                ? "text-[#e84444]"
                : "text-[#09d464]",
            )}
          >
            {minuteSyncMsg}
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Watchlist */}
        <div className="w-[140px] border-r border-[var(--border-color)] bg-[var(--bg-deep)] flex flex-col shrink-0 overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--border-color)]">
            <span className="text-[var(--text-tertiary)] text-[10px]">
              名称
            </span>
            <span className="text-[var(--text-tertiary)] text-[10px]">
              代码
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {watchlist.map((s) => (
              <div
                key={s.code}
                className={cn(
                  "group relative w-full flex items-center justify-between border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors",
                  s.code === code && "bg-[var(--bg-tertiary)]",
                )}
              >
                <button
                  onClick={() => {
                    addToRecentlyViewed(s.code, s.name);
                    setWatchlist(getRecentlyViewed());
                    router.push(`/stock/${s.code}`);
                  }}
                  className="flex-1 flex items-center justify-between px-2 py-1.5"
                >
                  <div className="text-left">
                    <div
                      className={cn(
                        "text-[11px] font-medium",
                        s.code === code
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)]",
                      )}
                    >
                      {s.name}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">
                      {s.code}
                    </div>
                  </div>
                </button>
                {watchlist.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromRecentlyViewed(s.code);
                      const updated = watchlist.filter(
                        (item) => item.code !== s.code,
                      );
                      setWatchlist(updated);
                      if (s.code === code && updated.length > 0) {
                        router.push(`/stock/${updated[0].code}`);
                      }
                    }}
                    className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    title="删除"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            ))}
            <button className="w-full flex items-center gap-1 justify-center py-2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-[10px]">
              <Plus size={10} /> 添加股票
            </button>
          </div>
        </div>

        {/* Main chart area */}
        <div
          id="main-chart-container"
          className="flex-1 flex flex-col overflow-hidden"
        >
          {/* Stock header — 紧凑单行布局 */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-primary)] shrink-0 gap-4">
            {/* 左：名称 + 代码 + 标签 + 价格 */}
            <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
              {quoteLoading ? (
                <div className="h-5 w-48 bg-[var(--bg-tertiary)] animate-pulse rounded" />
              ) : (
                <>
                  <span className="text-sm font-bold text-[var(--text-primary)] whitespace-nowrap">
                    {displayName}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    ({code})
                  </span>
                  {(() => {
                    const badge = getMarketBadge(code);
                    return (
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                          badge.bg,
                          badge.text,
                        )}
                      >
                        {badge.label}
                      </span>
                    );
                  })()}
                  {klineData.length > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border border-[var(--border-color)]">
                      {klineData[klineData.length - 1].time}
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-lg font-bold font-mono whitespace-nowrap",
                      getPriceColor(quote.change),
                    )}
                  >
                    {quote.price > 0 ? quote.price.toFixed(3) : "--"}
                  </span>
                  <span className={cn("text-xs", getPriceColor(quote.change))}>
                    {quote.changeAmt >= 0 ? "+" : ""}
                    {quote.price > 0 ? quote.changeAmt.toFixed(3) : "--"}
                  </span>
                  <span className={cn("text-xs", getPriceColor(quote.change))}>
                    {quote.price > 0 ? formatPercent(quote.change) : "--"}
                  </span>
                </>
              )}
            </div>
            {/* 右：行情数据横排 */}
            <div className="flex items-center gap-3 shrink-0 text-[11px] whitespace-nowrap">
              {[
                ["今开", quote.open > 0 ? quote.open.toFixed(3) : "--"],
                [
                  "昨收",
                  quote.prevClose > 0 ? quote.prevClose.toFixed(3) : "--",
                ],
                ["最高", quote.high > 0 ? quote.high.toFixed(3) : "--"],
                ["最低", quote.low > 0 ? quote.low.toFixed(3) : "--"],
                [
                  "成交量",
                  quote.volume > 0 ? formatVolume(quote.volume) : "--",
                ],
                [
                  "换手率",
                  quote.turnoverRate > 0
                    ? quote.turnoverRate.toFixed(2) + "%"
                    : "--",
                ],
              ].map(([label, val]) => (
                <div
                  key={label}
                  className="flex flex-col items-end leading-tight"
                >
                  <span className="text-[var(--text-tertiary)] text-[10px]">
                    {label}
                  </span>
                  <span className="text-[var(--text-secondary)] font-mono">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* K-line chart + indicator selector */}
          <div
            ref={chartAreaRef}
            className="flex-1 overflow-hidden flex flex-col min-h-0"
          >
            {/* Indicator selector — sticky */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-deep)] overflow-x-auto shrink-0">
              {INDICATORS.map((ind) => (
                <button
                  key={ind}
                  onClick={() => toggleIndicator(ind)}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors",
                    activeIndicators.includes(ind)
                      ? "bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/40"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-transparent hover:border-[var(--border-color)]",
                  )}
                >
                  {ind}
                </button>
              ))}
              {/* MA 均线切换按钮 */}
              <div className="w-px h-4 bg-[var(--border-color)] mx-1 shrink-0" />
              {MA_PERIODS.map((p) => {
                const active = activeMAs.includes(p);
                return (
                  <button
                    key={`ma${p}`}
                    onClick={() => toggleMA(p)}
                    className={cn(
                      "px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors",
                      active
                        ? "bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/40"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-transparent hover:border-[var(--border-color)]",
                    )}
                  >
                    MA{p}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <StockChart
                data={klineData}
                activeIndicators={activeIndicators}
                activeMAs={activeMAs}
                onToggleMA={toggleMA}
                containerHeight={
                  chartAreaHeight > 0 ? chartAreaHeight - 36 : undefined
                }
                onBarDoubleClick={handleBarDoubleClick}
              />
            </div>
          </div>

          {/* Resizable divider */}
          <div
            onMouseDown={bottomCollapsed ? undefined : handleMouseDown}
            className={cn(
              "h-1 bg-[var(--border-color)] transition-colors shrink-0 relative group",
              !bottomCollapsed && "hover:bg-[#f5a623]/40 cursor-row-resize",
              isResizing && "bg-[#f5a623]/60",
            )}
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-0.5 bg-[var(--text-tertiary)] group-hover:bg-[#f5a623]/30 transition-colors rounded-full" />
            </div>
            {/* 折叠/展开切换按钮 — 居中 */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setBottomCollapsed((v) => !v)}
              className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-5 rounded hover:bg-[#f5a623]/20 transition-colors text-[var(--text-tertiary)] hover:text-[#f5a623]"
              title={bottomCollapsed ? "展开面板" : "收起面板"}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="currentColor"
                className={cn(
                  "transition-transform duration-200",
                  bottomCollapsed ? "rotate-180" : "",
                )}
              >
                <path d="M5 3L9 7H1L5 3Z" />
              </svg>
            </button>
          </div>

          {/* Bottom tabs */}
          <div
            className={cn(
              "flex flex-col overflow-hidden transition-all duration-200 shrink-0",
              bottomCollapsed ? "h-0" : "",
            )}
          >
            <div className="flex items-center border-t border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
              {BOTTOM_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                  }}
                  className={cn(
                    "px-4 py-2 text-[11px] whitespace-nowrap transition-colors border-b-2",
                    activeTab === tab
                      ? "text-[#f5a623] border-[#f5a623]"
                      : "text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)]",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {(activeTab === "资讯" || activeTab === "公告") && (
              <div
                className="overflow-y-auto bg-[var(--bg-primary)]"
                style={{ height: `${bottomHeight}px` }}
              >
                {gubaLoading ? (
                  <div className="flex items-center justify-center py-6 text-[var(--text-tertiary)] text-[11px]">
                    <svg
                      className="animate-spin mr-2"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    加载中...
                  </div>
                ) : (
                  (() => {
                    const items = activeTab === "资讯" ? gubaNews : gubaNotice;
                    if (items.length === 0)
                      return (
                        <div className="text-center py-6 text-[var(--text-tertiary)] text-[11px]">
                          {gubaLoading ? "同步中，请稍候..." : "暂无数据"}
                        </div>
                      );
                    return (
                      <div className="divide-y divide-[var(--border-color)]">
                        {items.map((item, idx) => (
                          <a
                            key={idx}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-start gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors group"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] text-[var(--text-primary)] group-hover:text-[#f5a623] line-clamp-2 leading-relaxed">
                                {item.title}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-tertiary)]">
                                <span>{item.author || "匿名"}</span>
                                {item.readCount > 0 && (
                                  <span>
                                    阅读{" "}
                                    {item.readCount >= 10000
                                      ? (item.readCount / 10000).toFixed(1) +
                                        "万"
                                      : item.readCount}
                                  </span>
                                )}
                                {item.replyCount > 0 && (
                                  <span>评论 {item.replyCount}</span>
                                )}
                                <span className="ml-auto">
                                  {item.pubTime?.slice(0, 16) || ""}
                                </span>
                              </div>
                            </div>
                            <ExternalLink
                              size={10}
                              className="text-[var(--text-tertiary)] shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </a>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {activeTab === "财务" && (
              <div
                className="overflow-y-auto bg-[var(--bg-primary)]"
                style={{ height: `${bottomHeight}px` }}
              >
                {financeLoading && !financeView ? (
                  <div className="flex items-center justify-center h-full text-[var(--text-tertiary)] text-[11px]">
                    加载中...
                  </div>
                ) : !financeView || !financeView.has_data ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-tertiary)]">
                    <span className="text-[11px]">
                      暂无财务数据，正在后台同步...
                    </span>
                    {financeView?.syncing && (
                      <span className="text-[10px] opacity-60">
                        首次加载约需 2-3 分钟，请稍后刷新
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-0 h-full">
                    {/* 左侧：营收业务占比饼图 */}
                    <div className="w-[240px] flex-shrink-0 border-r border-[var(--border-color)] flex flex-col">
                      <div className="px-3 pt-2 pb-1">
                        <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                          营收业务占比
                        </span>
                        {financeView.updated_at && (
                          <span className="ml-2 text-[9px] text-[var(--text-tertiary)]">
                            {financeView.updated_at}
                          </span>
                        )}
                      </div>
                      {financeView.business_breakdown.length > 0 ? (
                        <div className="flex-1 min-h-0 flex flex-col">
                          {/* 饼图区域 */}
                          <div className="flex-1 min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={financeView.business_breakdown}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius="40%"
                                  outerRadius="68%"
                                  dataKey="ratio"
                                  nameKey="name"
                                  paddingAngle={1}
                                >
                                  {financeView.business_breakdown.map(
                                    (entry, index) => (
                                      <Cell
                                        key={`cell-${index}`}
                                        fill={
                                          PIE_COLORS[index % PIE_COLORS.length]
                                        }
                                      />
                                    ),
                                  )}
                                </Pie>
                                <ReTooltip
                                  formatter={(value) => [
                                    typeof value === "number"
                                      ? `${value.toFixed(1)}%`
                                      : `${value}%`,
                                    "",
                                  ]}
                                  contentStyle={{
                                    background: "var(--bg-secondary)",
                                    border: "1px solid var(--border-color)",
                                    borderRadius: 4,
                                    fontSize: 10,
                                    color: "var(--text-primary)",
                                    padding: "4px 8px",
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          {/* 自定义图例：名称左对齐 + 百分比右对齐 */}
                          <div className="px-3 pb-2 space-y-[3px] flex-shrink-0">
                            {financeView.business_breakdown.map(
                              (item, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-1.5"
                                >
                                  <span
                                    className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                                    style={{
                                      background:
                                        PIE_COLORS[index % PIE_COLORS.length],
                                    }}
                                  />
                                  <span
                                    className="flex-1 text-[9px] text-[var(--text-secondary)] truncate"
                                    title={item.name}
                                  >
                                    {item.name}
                                  </span>
                                  <span
                                    className="text-[9px] font-medium flex-shrink-0 tabular-nums"
                                    style={{
                                      color:
                                        PIE_COLORS[index % PIE_COLORS.length],
                                    }}
                                  >
                                    {Number(item.ratio).toFixed(1)}%
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      ) : (
                        /* 饼图暂无数据时，显示最新期快照指标 */
                        <div className="flex-1 px-3 py-2 space-y-1.5 overflow-auto">
                          {financeView.income_history[0] &&
                            (() => {
                              const latest = financeView.income_history[0];
                              const metrics: [string, string | undefined][] = [
                                [
                                  "毛利率",
                                  latest.gross_margin != null
                                    ? formatPct(latest.gross_margin)
                                    : undefined,
                                ],
                                [
                                  "净利率",
                                  latest.net_margin != null
                                    ? formatPct(latest.net_margin)
                                    : undefined,
                                ],
                                [
                                  "ROE",
                                  latest.roe_weighted != null
                                    ? formatPct(latest.roe_weighted)
                                    : undefined,
                                ],
                                [
                                  "EPS",
                                  latest.eps_basic != null
                                    ? latest.eps_basic.toFixed(3)
                                    : undefined,
                                ],
                                [
                                  "收入同比",
                                  latest.revenue_yoy != null
                                    ? formatYoy(latest.revenue_yoy)
                                    : undefined,
                                ],
                                [
                                  "利润同比",
                                  latest.net_profit_yoy != null
                                    ? formatYoy(latest.net_profit_yoy)
                                    : undefined,
                                ],
                              ].filter(([, v]) => v != null) as [
                                string,
                                string,
                              ][];
                              return metrics.map(([label, val]) => (
                                <div
                                  key={label}
                                  className="flex justify-between items-center border-b border-[var(--border-color)] pb-1"
                                >
                                  <span className="text-[9.5px] text-[var(--text-tertiary)]">
                                    {label}
                                  </span>
                                  <span className="text-[10px] font-mono text-[var(--text-primary)]">
                                    {val}
                                  </span>
                                </div>
                              ));
                            })()}
                          <div className="pt-1 text-[9px] text-[var(--text-tertiary)] opacity-60 text-center">
                            分项数据同步中...
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 右侧：近5年财报收入表格 */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="px-3 pt-2 pb-1 flex-shrink-0">
                        <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                          近期财报
                        </span>
                      </div>
                      <div className="flex-1 overflow-auto">
                        {financeView.income_history.length > 0 ? (
                          <table className="w-full text-[9.5px] border-collapse">
                            <thead>
                              <tr className="sticky top-0 bg-[var(--bg-secondary)]">
                                {[
                                  "报告期",
                                  "营业收入",
                                  "收入同比",
                                  "净利润",
                                  "净利润同比",
                                  "毛利率",
                                  "ROE",
                                  "EPS",
                                ].map((h) => (
                                  <th
                                    key={h}
                                    className="px-2 py-1 text-right first:text-left font-normal text-[var(--text-tertiary)] border-b border-[var(--border-color)] whitespace-nowrap"
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {financeView.income_history.map((row, i) => (
                                <tr
                                  key={row.report_date}
                                  className={cn(
                                    "border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]/50 transition-colors",
                                    i % 2 === 0 ? "" : "bg-[var(--bg-primary)]",
                                  )}
                                >
                                  <td className="px-2 py-1 text-left text-[var(--text-secondary)] whitespace-nowrap font-mono">
                                    {row.report_date}
                                  </td>
                                  <td className="px-2 py-1 text-right text-[var(--text-primary)] font-mono whitespace-nowrap">
                                    {formatRevenue(row.revenue)}
                                  </td>
                                  <td
                                    className={cn(
                                      "px-2 py-1 text-right font-mono whitespace-nowrap",
                                      getChangeColor(row.revenue_yoy),
                                    )}
                                  >
                                    {formatYoy(row.revenue_yoy)}
                                  </td>
                                  <td className="px-2 py-1 text-right text-[var(--text-primary)] font-mono whitespace-nowrap">
                                    {formatRevenue(row.net_profit)}
                                  </td>
                                  <td
                                    className={cn(
                                      "px-2 py-1 text-right font-mono whitespace-nowrap",
                                      getChangeColor(row.net_profit_yoy),
                                    )}
                                  >
                                    {formatYoy(row.net_profit_yoy)}
                                  </td>
                                  <td className="px-2 py-1 text-right text-[var(--text-primary)] font-mono whitespace-nowrap">
                                    {formatPct(row.gross_margin)}
                                  </td>
                                  <td className="px-2 py-1 text-right text-[var(--text-primary)] font-mono whitespace-nowrap">
                                    {formatPct(row.roe_weighted)}
                                  </td>
                                  <td className="px-2 py-1 text-right text-[var(--text-primary)] font-mono whitespace-nowrap">
                                    {row.eps_basic != null
                                      ? row.eps_basic.toFixed(3)
                                      : "--"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="flex items-center justify-center h-full text-[10px] text-[var(--text-tertiary)]">
                            暂无历史数据
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* /bottom-collapse-wrapper */}
        </div>
      </div>

      {/* 分时图弹框 */}
      <MinuteChartModal
        open={minuteModalOpen}
        onClose={() => setMinuteModalOpen(false)}
        code={code}
        name={quote.name || undefined}
        date={minuteModalDate}
      />

      {/* 旋转动画（同步分时按钮用） */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
