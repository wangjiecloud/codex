"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Plus, Star, X } from "lucide-react";
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
  post_id: string;
  title: string;
  author: string;
  time: string;
  post_date: string;
  reads: string;
  replies: string;
  url: string;
  category: string;
}

interface GubaPageData {
  items: GubaItem[];
  total: number;
  total_pages: number;
  syncing: boolean;
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

const INDICATORS = ["VOL", "MACD", "KDJ", "BOLL", "RSI", "DMI", "CCI", "W&R"];
const PERIODS = ["日K", "周K", "月K"];
const BOTTOM_TABS = ["全部", "公告", "研报", "资讯", "财务", "AI分析"];

const TAB_CATEGORY_MAP: Record<string, string> = {
  全部: "all",
  公告: "announcement",
  研报: "research",
  资讯: "news",
};

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

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [quote, setQuote] = useState<QuoteData>(DEFAULT_QUOTE);
  const [klineData, setKlineData] = useState<KLineBar[]>(() =>
    generateMockData(code),
  );
  const [news, setNews] = useState<NewsItem[]>([]);
  const [gubaItems, setGubaItems] = useState<GubaItem[]>([]);
  const [gubaMeta, setGubaMeta] = useState({
    total: 0,
    total_pages: 1,
    syncing: false,
  });
  const [gubaCurrentPage, setGubaCurrentPage] = useState(1);
  const [gubaLoadingMore, setGubaLoadingMore] = useState(false);
  const gubaListRef = useRef<HTMLDivElement>(null);
  const [activeIndicators, setActiveIndicators] = useState([
    "VOL",
    "MACD",
    "KDJ",
  ]);
  const [activePeriod, setActivePeriod] = useState("日K");
  const [activeTab, setActiveTab] = useState("全部");
  const [isStarred, setIsStarred] = useState(false);
  const [watchlist, setWatchlist] = useState<
    Array<{ code: string; name: string }>
  >([]);
  const [selectedPost, setSelectedPost] = useState<GubaItem | null>(null);
  const [postContent, setPostContent] = useState<string | null>(null);
  const [postLoading, setPostLoading] = useState(false);
  const [bottomHeight, setBottomHeight] = useState(180);
  const [isResizing, setIsResizing] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [gubaLoading, setGubaLoading] = useState(true);
  const [fundamental, setFundamental] = useState<FundamentalData | null>(null);

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
    fetch(`http://localhost:8000/api/kline/${code}?period=${period}&count=120`)
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

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const isFirstPage = gubaCurrentPage === 1;

    const fetchGuba = (pg: number) => {
      if (isFirstPage) {
        setGubaLoading(true);
      } else {
        setGubaLoadingMore(true);
      }
      const category = TAB_CATEGORY_MAP[activeTab] ?? "all";
      fetch(
        `http://localhost:8000/api/guba/${code}?category=${category}&page=${pg}&page_size=20`,
      )
        .then((r) => r.json())
        .then((data) => {
          setGubaMeta({
            total: data.total ?? 0,
            total_pages: data.total_pages ?? 1,
            syncing: data.syncing ?? false,
          });
          if (isFirstPage) {
            setGubaItems(data.items ?? []);
          } else {
            setGubaItems((prev) => [...prev, ...(data.items ?? [])]);
          }
          if (data.syncing) {
            timer = setTimeout(() => fetchGuba(pg), 3000);
          }
        })
        .catch(() => {})
        .finally(() => {
          setGubaLoading(false);
          setGubaLoadingMore(false);
        });
    };

    fetchGuba(gubaCurrentPage);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [code, activeTab, gubaCurrentPage]);

  const handleLoadMore = useCallback(() => {
    if (
      gubaLoadingMore ||
      gubaLoading ||
      gubaCurrentPage >= gubaMeta.total_pages
    )
      return;
    setGubaCurrentPage((p) => p + 1);
  }, [gubaLoadingMore, gubaLoading, gubaCurrentPage, gubaMeta.total_pages]);

  useEffect(() => {
    const el = gubaListRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
        handleLoadMore();
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [handleLoadMore]);

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

  return (
    <div className="flex flex-col h-full text-xs overflow-hidden">
      {/* Top toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0 overflow-x-auto">
        <button
          onClick={() => router.push("/stock/search")}
          className="flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mr-2 shrink-0"
        >
          <ArrowLeft size={13} />
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
                  setGubaCurrentPage(1);
                  setGubaItems([]);
                  if (tab !== "AI分析" && tab !== "财务") {
                    fetch(`http://localhost:8000/api/guba/sync/${code}`, {
                      method: "POST",
                    }).catch(() => {});
                  }
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
            {gubaMeta.syncing && (
              <span className="ml-auto mr-3 text-[10px] text-[var(--text-tertiary)] animate-pulse">
                加载中…
              </span>
            )}
          </div>

          {/* Tab content */}
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

          {activeTab !== "AI分析" && activeTab !== "财务" && (
            <div
              className="flex flex-col"
              style={{ height: `${bottomHeight}px` }}
            >
              <div
                ref={gubaListRef}
                className="flex-1 overflow-y-auto bg-[var(--bg-primary)] text-[11px]"
              >
                {gubaLoading ? (
                  <div className="space-y-2 p-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="h-8 bg-[var(--bg-tertiary)] animate-pulse rounded"
                      />
                    ))}
                  </div>
                ) : gubaItems.length > 0 ? (
                  <table className="w-full">
                    <thead className="sticky top-0 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
                      <tr className="text-[var(--text-tertiary)] text-[10px]">
                        <th className="px-2 py-1 text-center w-16">阅读</th>
                        <th className="px-2 py-1 text-center w-16">评论</th>
                        <th className="px-2 py-1 text-left">标题</th>
                        <th className="px-2 py-1 text-left w-24">作者</th>
                        <th className="px-2 py-1 text-center w-20">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gubaItems.map((item, i) => (
                        <tr
                          key={`${item.post_id}-${i}`}
                          className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <td className="px-2 py-1.5 text-center text-[var(--text-tertiary)]">
                            {item.reads}
                          </td>
                          <td className="px-2 py-1.5 text-center text-[var(--text-tertiary)]">
                            {item.replies}
                          </td>
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() => {
                                setSelectedPost(item);
                                setPostContent(null);
                                setPostLoading(true);
                                fetch(
                                  `http://localhost:8000/api/guba/post/${item.post_id}`,
                                )
                                  .then((r) => r.json())
                                  .then((d) => {
                                    setPostContent(d.content || "");
                                    setPostLoading(false);
                                  })
                                  .catch(() => {
                                    setPostContent("");
                                    setPostLoading(false);
                                  });
                              }}
                              className="text-left text-[var(--text-secondary)] hover:text-[#f5a623] line-clamp-1 w-full text-[11px]"
                            >
                              {item.title}
                            </button>
                          </td>
                          <td className="px-2 py-1.5 text-[var(--text-tertiary)] truncate">
                            {item.author}
                          </td>
                          <td className="px-2 py-1.5 text-center text-[var(--text-tertiary)] text-[10px]">
                            {item.time}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center text-[var(--text-tertiary)] py-6">
                    {gubaMeta.syncing ? "正在抓取数据…" : "暂无数据"}
                  </div>
                )}

                {/* 底部加载更多状态 */}
                {gubaItems.length > 0 && (
                  <div className="py-2 text-center text-[10px] text-[var(--text-tertiary)]">
                    {gubaLoadingMore ? (
                      <span className="animate-pulse">加载中…</span>
                    ) : gubaCurrentPage >= gubaMeta.total_pages ? (
                      <span>共 {gubaMeta.total} 条，已全部加载</span>
                    ) : null}
                  </div>
                )}
              </div>

              {/* 总条数 */}
              {gubaMeta.total > 0 && (
                <div className="px-3 py-1 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    共 {gubaMeta.total} 条
                  </span>
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

      {/* Post detail modal */}
      {selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="relative w-[660px] max-w-[92vw] max-h-[82vh] flex flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">
                  {selectedPost.title}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--text-tertiary)]">
                  <span>{selectedPost.author}</span>
                  <span>{selectedPost.time}</span>
                  <span>阅读 {selectedPost.reads}</span>
                  <span>评论 {selectedPost.replies}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] border border-[var(--border-color)]">
                    {selectedPost.category === "announcement"
                      ? "公告"
                      : selectedPost.category === "research"
                        ? "研报"
                        : selectedPost.category === "news"
                          ? "资讯"
                          : "全部"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPost(null)}
                className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 text-[12px] text-[var(--text-secondary)] leading-relaxed">
              {postLoading ? (
                <div className="text-center text-[var(--text-tertiary)] py-8 animate-pulse">
                  正在加载内容…
                </div>
              ) : postContent ? (
                <div className="whitespace-pre-wrap">{postContent}</div>
              ) : (
                <div className="text-center text-[var(--text-tertiary)] py-8">
                  暂无正文内容
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex justify-end">
              <a
                href={selectedPost.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#f5a623]/10 hover:bg-[#f5a623]/20 border border-[#f5a623]/40 text-[#f5a623] text-[12px] font-medium transition-colors"
              >
                <ExternalLink size={13} />
                查看原文
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
