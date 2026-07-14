"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  RefreshCw,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
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
  market: string;
}

interface IndustryGroup {
  industry: string;
  stocks: StockQuote[];
  expanded: boolean;
  avgChange: number;
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

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */
export function CustomWatchlistPanel() {
  const router = useRouter();
  const [watchlistCodes, setWatchlistCodes] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [industryGroups, setIndustryGroups] = useState<IndustryGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Load watchlist from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("custom-watchlist");
    if (saved) {
      try {
        const codes = JSON.parse(saved) as string[];
        setWatchlistCodes(codes);
      } catch {
        setWatchlistCodes([]);
      }
    }
  }, []);

  // Save watchlist to localStorage
  useEffect(() => {
    if (watchlistCodes.length > 0) {
      localStorage.setItem("custom-watchlist", JSON.stringify(watchlistCodes));
    } else {
      localStorage.removeItem("custom-watchlist");
    }
  }, [watchlistCodes]);

  // Fetch quotes for watchlist stocks
  useEffect(() => {
    if (watchlistCodes.length === 0) {
      setQuotes([]);
      setIndustryGroups([]);
      return;
    }

    const fetchQuotes = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        watchlistCodes.forEach((code) => params.append("codes", code));
        const res = await fetch(`${API}/api/quote/batch?${params}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setQuotes(data.quotes || []);
        }
      } catch (err) {
        console.error("Failed to fetch quotes:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, 3000);
    return () => clearInterval(interval);
  }, [watchlistCodes]);

  // Group quotes by industry
  useEffect(() => {
    if (quotes.length === 0) {
      setIndustryGroups([]);
      return;
    }

    const fetchIndustries = async () => {
      try {
        // 获取每只股票的行业信息
        const params = new URLSearchParams();
        quotes.forEach((q) => params.append("codes", q.code));
        const res = await fetch(`${API}/api/quote/industries?${params}`, {
          cache: "no-store",
        });

        if (res.ok) {
          const data = await res.json();
          const industryMap = new Map<string, StockQuote[]>();

          quotes.forEach((quote) => {
            const industry = data[quote.code] || "未分类";
            if (!industryMap.has(industry)) {
              industryMap.set(industry, []);
            }
            industryMap.get(industry)!.push(quote);
          });

          let groups: IndustryGroup[] = Array.from(industryMap.entries()).map(
            ([industry, stocks]) => {
              const avgChange =
                stocks.reduce((sum, s) => sum + (s.change || 0), 0) /
                stocks.length;
              return {
                industry,
                stocks: stocks.sort(
                  (a, b) => (b.change || 0) - (a.change || 0),
                ),
                expanded: true,
                avgChange,
              };
            },
          );

          // 先按平均涨跌幅排序
          groups.sort((a, b) => b.avgChange - a.avgChange);

          // 尝试从 localStorage 恢复用户自定义顺序
          const savedOrder = localStorage.getItem("industry-groups-order");
          if (savedOrder) {
            try {
              const orderMap = JSON.parse(savedOrder) as string[];
              groups = groups.sort((a, b) => {
                const aIndex = orderMap.indexOf(a.industry);
                const bIndex = orderMap.indexOf(b.industry);
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
              });
            } catch {
              // 忽略错误，使用默认排序
            }
          }

          setIndustryGroups(groups);
        } else {
          // Fallback: 所有股票归到"未分类"
          setIndustryGroups([
            {
              industry: "未分类",
              stocks: [...quotes].sort(
                (a, b) => (b.change || 0) - (a.change || 0),
              ),
              expanded: true,
              avgChange:
                quotes.reduce((sum, s) => sum + (s.change || 0), 0) /
                quotes.length,
            },
          ]);
        }
      } catch {
        // Fallback
        setIndustryGroups([
          {
            industry: "未分类",
            stocks: [...quotes].sort(
              (a, b) => (b.change || 0) - (a.change || 0),
            ),
            expanded: true,
            avgChange:
              quotes.reduce((sum, s) => sum + (s.change || 0), 0) /
              quotes.length,
          },
        ]);
      }
    };

    fetchIndustries();
  }, [quotes]);

  // Search stocks with debounce
  useEffect(() => {
    if (!searchText.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/api/quote/search?q=${encodeURIComponent(searchText)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setSearchLoading(false);
      }
    }, 300); // 300ms 防抖

    return () => clearTimeout(timeoutId);
  }, [searchText]);

  const addStock = (code: string) => {
    if (!watchlistCodes.includes(code)) {
      setWatchlistCodes([...watchlistCodes, code]);
    }
    setShowAddModal(false);
    setSearchText("");
    setSearchResults([]);
  };

  const removeStock = (code: string) => {
    setWatchlistCodes(watchlistCodes.filter((c) => c !== code));
  };

  const toggleGroup = (industry: string) => {
    setIndustryGroups(
      industryGroups.map((g) =>
        g.industry === industry ? { ...g, expanded: !g.expanded } : g,
      ),
    );
  };

  const navigateToStock = (code: string) => {
    router.push(`/stock/${code}`);
  };

  // 拖拽处理函数
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // 添加半透明效果
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIndex(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newGroups = [...industryGroups];
    const [draggedItem] = newGroups.splice(draggedIndex, 1);
    newGroups.splice(dropIndex, 0, draggedItem);
    setIndustryGroups(newGroups);

    // 保存顺序到 localStorage
    const orderMap = newGroups.map((g) => g.industry);
    localStorage.setItem("industry-groups-order", JSON.stringify(orderMap));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
        <span className="text-[12px] font-medium text-[var(--text-primary)]">
          自选股 ({watchlistCodes.length})
        </span>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] rounded bg-[var(--accent)] text-black hover:opacity-90 transition-opacity"
        >
          <Plus size={11} />
          添加
        </button>
        <div className="ml-auto flex items-center gap-1.5 text-[9px] text-[var(--text-tertiary)]">
          {loading && (
            <>
              <RefreshCw size={10} className="animate-spin" />
              刷新中...
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {watchlistCodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-tertiary)]">
            <span className="text-[13px]">暂无自选股</span>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] rounded border border-[var(--border-color)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              <Plus size={12} />
              添加第一只股票
            </button>
          </div>
        ) : (
          <div className="p-2">
            {/* Masonry layout using CSS columns */}
            <div
              style={{
                columnCount: "auto",
                columnWidth: "260px",
                columnGap: "8px",
              }}
            >
              {industryGroups.map((group, index) => {
                // 判断是否为产业链（包含"供应链"、"产业链"关键字）
                const isIndustryChain =
                  group.industry.includes("供应链") ||
                  group.industry.includes("产业链") ||
                  group.industry.includes("全景概览");

                return (
                  <div
                    key={group.industry}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    style={{ breakInside: "avoid", marginBottom: "8px" }}
                    className={cn(
                      "border rounded overflow-hidden flex flex-col cursor-move transition-opacity",
                      isIndustryChain
                        ? "border-[#e8a235]/40 bg-[#e8a235]/5"
                        : "border-[var(--border-color)]",
                      draggedIndex === index && "opacity-50",
                    )}
                  >
                    {/* Industry Header */}
                    <div
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 transition-colors",
                        isIndustryChain
                          ? "bg-[#e8a235]/10"
                          : "bg-[var(--bg-secondary)]",
                      )}
                    >
                      <GripVertical
                        size={11}
                        className="text-[var(--text-tertiary)] cursor-move flex-shrink-0 hover:text-[var(--text-secondary)]"
                      />
                      <div
                        onClick={() => toggleGroup(group.industry)}
                        className="flex items-center gap-1 flex-1 cursor-pointer hover:opacity-80 transition-opacity min-w-0"
                      >
                        {group.expanded ? (
                          <ChevronDown
                            size={11}
                            className="text-[var(--text-secondary)] flex-shrink-0"
                          />
                        ) : (
                          <ChevronRight
                            size={11}
                            className="text-[var(--text-secondary)] flex-shrink-0"
                          />
                        )}
                        <span
                          className={cn(
                            "text-[11px] font-medium truncate",
                            isIndustryChain
                              ? "text-[#e8a235]"
                              : "text-[var(--text-primary)]",
                          )}
                        >
                          {group.industry}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-tertiary)] flex-shrink-0">
                        {group.stocks.length}
                      </span>
                    </div>

                    {/* Average change row */}
                    <div
                      className={cn(
                        "px-1.5 py-0.5 border-t border-[var(--border-color)]",
                        isIndustryChain
                          ? "bg-[#e8a235]/5"
                          : "bg-[var(--bg-secondary)]/50",
                      )}
                    >
                      <span
                        className={cn(
                          "text-[10px] font-mono",
                          pctColor(group.avgChange),
                        )}
                      >
                        平均 {fmtPct(group.avgChange)}
                      </span>
                    </div>

                    {/* Stocks List */}
                    {group.expanded && (
                      <div className="divide-y divide-[var(--border-color)] max-h-[400px] overflow-y-auto">
                        {group.stocks.map((stock) => (
                          <div
                            key={stock.code}
                            className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-[var(--bg-hover)] transition-colors group"
                          >
                            <div
                              onClick={() => navigateToStock(stock.code)}
                              className="flex-1 cursor-pointer min-w-0"
                            >
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-medium text-[var(--text-primary)] truncate">
                                  {stock.name}
                                </span>
                                <span className="text-[9px] text-[var(--text-tertiary)] font-mono flex-shrink-0">
                                  {stock.code.slice(-4)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 mt-0">
                                <span className="text-[9px] font-mono text-[var(--text-primary)]">
                                  ¥{fmtNum(stock.price)}
                                </span>
                                <span
                                  className={cn(
                                    "text-[9px] font-mono",
                                    pctColor(stock.change),
                                  )}
                                >
                                  {fmtPct(stock.change)}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => removeStock(stock.code)}
                              className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[#e84444] transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add Stock Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => {
            setShowAddModal(false);
            setSearchText("");
            setSearchResults([]);
          }}
        >
          <div
            className="relative bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-2xl w-[480px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
              <span className="text-[13px] font-medium text-[var(--text-primary)]">
                添加自选股
              </span>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSearchText("");
                  setSearchResults([]);
                }}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Search Input with Dropdown */}
            <div className="p-4">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-[11px] text-[var(--text-tertiary)] z-10"
                />
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="搜索股票代码或名称..."
                  className="w-full pl-9 pr-3 py-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                  autoFocus
                />

                {/* Dropdown Results */}
                {searchText.trim() && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-[360px] overflow-auto z-20">
                    {searchLoading ? (
                      <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)] text-[11px]">
                        <RefreshCw size={12} className="animate-spin mr-1.5" />
                        搜索中...
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)] text-[11px]">
                        未找到相关股票
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border-color)]">
                        {searchResults.map((result) => {
                          const isAdded = watchlistCodes.includes(result.code);
                          return (
                            <div
                              key={result.code}
                              onClick={() => !isAdded && addStock(result.code)}
                              className={cn(
                                "flex items-center justify-between px-3 py-2 transition-colors",
                                isAdded
                                  ? "bg-[var(--bg-tertiary)] cursor-not-allowed opacity-50"
                                  : "cursor-pointer hover:bg-[var(--bg-hover)]",
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                                    {result.name}
                                  </span>
                                  <span className="text-[10px] text-[var(--text-tertiary)] font-mono flex-shrink-0">
                                    {result.code}
                                  </span>
                                </div>
                                <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                                  {result.market}
                                </div>
                              </div>
                              {isAdded && (
                                <span className="text-[10px] text-[var(--accent)] ml-2 flex-shrink-0">
                                  已添加
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tip */}
            <div className="px-4 pb-4 text-[11px] text-[var(--text-tertiary)]">
              输入股票代码或名称进行模糊搜索，点击添加到自选股
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
