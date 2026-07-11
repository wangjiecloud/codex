"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Plus, Star, X, Search } from "lucide-react";
import { StockChart, generateMockData } from "@/components/stock/StockChart";
import { AgentPanel } from "@/components/agents/AgentPanel";
import { cn, getPriceColor, formatPercent } from "@/lib/utils";

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

interface KLineBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnRate?: number;
  changePct?: number;
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
    const exists = recent.some((item) => item.code === code);

    if (!exists) {
      const updated = [{ code, name }, ...recent];
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
    } else if (
      recent.length > 0 &&
      recent[0].code === code &&
      recent[0].name !== name
    ) {
      recent[0].name = name;
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(recent));
    }
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
const PERIODS = ["日K", "周K", "月K"];
const BOTTOM_TABS = ["财务", "AI分析", "资讯", "公告"];

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
  const fromIndustryId = fromPath?.match(/^\/industry\/(.+)$/)?.[1] ?? null;
  const fromLabel = fromIndustryId
    ? (INDUSTRY_LABELS[fromIndustryId] ?? fromIndustryId)
    : null;
  const backUrl = (() => {
    if (!fromPath) return "/stock/search";
    const parts: string[] = [];
    if (fromTab) parts.push(`tab=${fromTab}`);
    if (fromNode) parts.push(`node=${fromNode}`);
    return parts.length > 0 ? `${fromPath}?${parts.join("&")}` : fromPath;
  })();

  const [quote, setQuote] = useState<QuoteData>(DEFAULT_QUOTE);
  const [klineData, setKlineData] = useState<KLineBar[]>(() =>
    generateMockData(code),
  );
  const [news, setNews] = useState<NewsItem[]>([]);
  const [activeIndicators, setActiveIndicators] = useState([
    "VOL",
    "MACD",
    "KDJ",
  ]);
  const [activePeriod, setActivePeriod] = useState("日K");
  const [activeTab, setActiveTab] = useState("财务");
  const [isStarred, setIsStarred] = useState(false);
  const [watchlist, setWatchlist] = useState<
    Array<{ code: string; name: string }>
  >([]);
  const [bottomHeight, setBottomHeight] = useState(180);
  const [isResizing, setIsResizing] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [fundamental, setFundamental] = useState<FundamentalData | null>(null);
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
    fetch(`http://localhost:8000/api/kline/${code}?period=${period}&count=110`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setKlineData(data);
        } else if (data.bars && data.bars.length > 0) {
          setKlineData(data.bars);
        }
      })
      .catch(() => {});
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
    fetch(`http://localhost:8000/api/fundamental/${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.data) setFundamental(data.data as FundamentalData);
      })
      .catch(() => {});
  }, [code]);

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

  const orderBookRows = Array.from({ length: 5 }, (_, i) => {
    const seed =
      Math.abs(Math.sin((quote.price * 1000 + i + 1) * 9301 + 49297)) * 233280;
    const vol = Math.floor((seed % 4500) + 500);
    const seed2 =
      Math.abs(Math.sin((quote.price * 1000 + i + 6) * 9301 + 49297)) * 233280;
    const vol2 = Math.floor((seed2 % 4500) + 500);
    return {
      sell: { price: (quote.price + (5 - i) * 0.001).toFixed(3), vol },
      buy: { price: (quote.price - (i + 1) * 0.001).toFixed(3), vol: vol2 },
    };
  });

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
      const minHeight = 150;
      const maxHeight = containerRect.height - 200;

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
        <button
          onClick={() => router.push(backUrl)}
          className="flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mr-2 shrink-0"
        >
          <ArrowLeft size={13} />
          {fromLabel && <span className="text-[11px]">{fromLabel}</span>}
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
                  onClick={() => router.push(`/stock/${s.code}`)}
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
          {/* Stock header */}
          <div className="flex items-start justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-primary)] shrink-0">
            <div>
              <div className="flex items-baseline gap-3">
                {quoteLoading ? (
                  <div className="h-7 w-48 bg-[var(--bg-tertiary)] animate-pulse rounded" />
                ) : (
                  <>
                    <span className="text-lg font-bold text-[var(--text-primary)]">
                      {displayName}
                    </span>
                    <span className="text-[var(--text-tertiary)]">
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
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border border-[var(--border-color)]">
                        {klineData[klineData.length - 1].time}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                {quoteLoading ? (
                  <div className="h-8 w-40 bg-[var(--bg-tertiary)] animate-pulse rounded" />
                ) : (
                  <>
                    <span
                      className={cn(
                        "text-2xl font-bold font-mono",
                        getPriceColor(quote.change),
                      )}
                    >
                      {quote.price > 0 ? quote.price.toFixed(3) : "--"}
                    </span>
                    <span
                      className={cn("text-sm", getPriceColor(quote.change))}
                    >
                      {quote.changeAmt >= 0 ? "+" : ""}
                      {quote.price > 0 ? quote.changeAmt.toFixed(3) : "--"}
                    </span>
                    <span
                      className={cn("text-sm", getPriceColor(quote.change))}
                    >
                      {quote.price > 0 ? formatPercent(quote.change) : "--"}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-right mt-1">
              {[
                ["今开", quote.open > 0 ? quote.open.toFixed(3) : "--"],
                ["最高", quote.high > 0 ? quote.high.toFixed(3) : "--"],
                [
                  "昨收",
                  quote.prevClose > 0 ? quote.prevClose.toFixed(3) : "--",
                ],
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
                <div key={label} className="flex gap-2 justify-end text-[11px]">
                  <span className="text-[var(--text-tertiary)]">{label}</span>
                  <span className="text-[var(--text-secondary)] font-mono">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* K-line chart */}
          <div className="flex-1 overflow-y-auto">
            <StockChart data={klineData} activeIndicators={activeIndicators} />
          </div>

          {/* Indicator selector */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-t border-[var(--border-color)] bg-[var(--bg-deep)] shrink-0 overflow-x-auto">
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
          </div>

          {/* Resizable divider */}
          <div
            onMouseDown={handleMouseDown}
            className={cn(
              "h-1 bg-[var(--border-color)] hover:bg-[#f5a623]/40 cursor-row-resize transition-colors shrink-0 relative group",
              isResizing && "bg-[#f5a623]/60",
            )}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-0.5 bg-[var(--text-tertiary)] group-hover:bg-[#f5a623] transition-colors rounded-full" />
            </div>
          </div>

          {/* Bottom tabs */}
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
                                    ? (item.readCount / 10000).toFixed(1) + "万"
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
              className="overflow-y-auto bg-[var(--bg-primary)] p-3"
              style={{ height: `${bottomHeight}px` }}
            >
              {!fundamental ? (
                <div className="text-center py-6 text-[var(--text-tertiary)] text-[11px]">
                  暂无财务数据
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-[10px] text-[var(--text-tertiary)]">
                    报告期: {fundamental.report_date || "--"}
                    {fundamental.updated_at && (
                      <span className="ml-3">
                        更新: {fundamental.updated_at}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    {[
                      ["营业总收入", fundamental.revenue],
                      ["收入同比", fundamental.revenue_yoy],
                      ["净利润", fundamental.net_profit],
                      ["净利润同比", fundamental.net_profit_yoy],
                      ["每股收益 EPS", fundamental.eps],
                      ["每股净资产", fundamental.nav_per_share],
                      ["净资产收益率 ROE", fundamental.roe],
                      ["销售毛利率", fundamental.gross_margin],
                      ["销售净利率", fundamental.net_margin],
                      ["资产负债率", fundamental.debt_ratio],
                      ["流动比率", fundamental.current_ratio],
                      ["速动比率", fundamental.quick_ratio],
                      ["存货周转率", fundamental.inventory_turnover],
                      ["应收账款周转天数", fundamental.ar_days],
                    ]
                      .filter(([, v]) => v && v !== "--")
                      .map(([label, val]) => (
                        <div
                          key={label}
                          className="flex justify-between items-center border-b border-[var(--border-color)] pb-1"
                        >
                          <span className="text-[10px] text-[var(--text-tertiary)]">
                            {label}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--text-primary)]">
                            {val}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel: order book + AI */}
        <div className="w-[200px] border-l border-[var(--border-color)] bg-[var(--bg-deep)] flex flex-col shrink-0 overflow-hidden">
          {activeTab === "AI分析" ? (
            <div className="flex-1 overflow-hidden">
              <AgentPanel code={code} stockName={displayName} />
            </div>
          ) : activeTab === "资讯" || activeTab === "公告" ? (
            <>
              {/* Guba sync panel */}
              <div className="px-2 py-2 border-b border-[var(--border-color)]">
                <div className="text-[10px] text-[var(--text-tertiary)] mb-2">
                  {activeTab === "资讯" ? "媒体资讯" : "公司公告"}
                </div>
                {gubaSyncing && (
                  <div className="text-[10px] text-[#f5a623] mb-1.5 flex items-center gap-1">
                    <svg
                      className="animate-spin"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    正在同步最新数据...
                  </div>
                )}
                <button
                  onClick={() => {
                    const postType = activeTab === "资讯" ? "news" : "notice";
                    setGubaSyncing(true);
                    fetch(`http://localhost:8000/api/guba/sync/${code}`, {
                      method: "POST",
                    })
                      .then(() =>
                        fetch(
                          `http://localhost:8000/api/guba/${code}?post_type=${postType}&count=50`,
                        ),
                      )
                      .then((r) => (r.ok ? r.json() : null))
                      .then((data) => {
                        if (data?.items) {
                          if (postType === "news")
                            setGubaNews(data.items as GubaItem[]);
                          else setGubaNotice(data.items as GubaItem[]);
                        }
                      })
                      .catch(() => {})
                      .finally(() => setGubaSyncing(false));
                  }}
                  disabled={gubaSyncing}
                  className="w-full py-1.5 text-[11px] bg-[#f5a623]/10 hover:bg-[#f5a623]/20 border border-[#f5a623]/30 text-[#f5a623] rounded transition-colors disabled:opacity-40"
                >
                  {gubaSyncing ? "同步中..." : "重新同步"}
                </button>
              </div>
              <div className="p-2 text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                <p>
                  {activeTab === "资讯"
                    ? "来源：东方财富股吧资讯"
                    : "来源：东方财富官方公告"}
                </p>
                <p className="mt-1">切换 tab 自动同步</p>
                <p className="mt-1">每日 17:30 自动更新</p>
              </div>
            </>
          ) : (
            <>
              {/* Order book */}
              <div className="px-2 py-1.5 border-b border-[var(--border-color)]">
                <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                  <span>委比</span>
                </div>
                {orderBookRows.reverse().map((row, i) => (
                  <div
                    key={`sell-${i}`}
                    className="flex justify-between py-0.5"
                  >
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      卖{5 - i}
                    </span>
                    <span className="text-[11px] text-[#09d464] font-mono">
                      {row.sell.price}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                      {row.sell.vol}
                    </span>
                  </div>
                ))}
                <div className="my-1 border-t border-[var(--border-color)]" />
                {[...orderBookRows].reverse().map((row, i) => (
                  <div key={`buy-${i}`} className="flex justify-between py-0.5">
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      买{i + 1}
                    </span>
                    <span className="text-[11px] text-[#e84444] font-mono">
                      {row.buy.price}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                      {row.buy.vol}
                    </span>
                  </div>
                ))}
              </div>

              {/* Quote stats */}
              <div className="px-2 py-1.5 border-b border-[var(--border-color)]">
                <div className="text-[10px] text-[var(--text-tertiary)] font-medium mb-1">
                  行情数据
                </div>
                {[
                  [
                    "昨收",
                    quote.prevClose > 0 ? quote.prevClose.toFixed(3) : "--",
                  ],
                  ["今开", quote.open > 0 ? quote.open.toFixed(3) : "--"],
                  ["最高", quote.high > 0 ? quote.high.toFixed(3) : "--"],
                  ["最低", quote.low > 0 ? quote.low.toFixed(3) : "--"],
                  [
                    "市值",
                    quote.marketCap > 0 ? formatAmount(quote.marketCap) : "--",
                  ],
                  ["市盈率", quote.pe > 0 ? quote.pe.toFixed(2) : "--"],
                  ["市净率", quote.pb > 0 ? quote.pb.toFixed(2) : "--"],
                  [
                    "成交额",
                    quote.turnover > 0 ? formatAmount(quote.turnover) : "--",
                  ],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between py-0.5">
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {label}
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)] font-mono">
                      {val}
                    </span>
                  </div>
                ))}
              </div>

              {/* AI Analysis shortcut */}
              <div className="p-2">
                <button
                  onClick={() => setActiveTab("AI分析")}
                  className="w-full py-2 bg-[#f5a623]/10 hover:bg-[#f5a623]/20 border border-[#f5a623]/30 text-[#f5a623] rounded-lg text-[11px] font-medium transition-colors"
                >
                  启动 AI 分析
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
