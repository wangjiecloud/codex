"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, TrendingUp, Clock, ChevronRight, Star } from "lucide-react";
import { cn, getPriceColor, formatPercent } from "@/lib/utils";

const HOT_STOCKS = [
  { code: "600519", name: "贵州茅台", price: 1642.0, change: 1.23 },
  { code: "300750", name: "宁德时代", price: 238.5, change: -0.85 },
  { code: "688981", name: "中芯国际", price: 87.3, change: 2.14 },
  { code: "600036", name: "招商银行", price: 42.8, change: 0.47 },
  { code: "002594", name: "比亚迪", price: 328.0, change: -1.32 },
  { code: "601012", name: "隆基绿能", price: 56.4, change: 3.08 },
];

const RECENT_ANALYSIS = [
  {
    code: "000001",
    name: "平安银行",
    time: "2小时前",
    advice: "建议持有",
    adviceType: "hold",
  },
  {
    code: "300750",
    name: "宁德时代",
    time: "昨天",
    advice: "建议关注",
    adviceType: "watch",
  },
  {
    code: "600519",
    name: "贵州茅台",
    time: "3天前",
    advice: "建议买入",
    adviceType: "buy",
  },
];

const HOT_SECTORS = [
  "银行",
  "新能源",
  "半导体",
  "消费",
  "医药",
  "军工",
  "AI概念",
  "光伏",
];

const ADVICE_STYLES: Record<string, string> = {
  buy: "text-[#e84444] bg-[#e84444]/10",
  hold: "text-[#f5a623] bg-[#f5a623]/10",
  watch: "text-blue-400 bg-blue-400/10",
  sell: "text-[#09d464] bg-[#09d464]/10",
};

export default function StockSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/stock/${query.trim()}`);
    }
  };

  const handleStockClick = (code: string) => {
    router.push(`/stock/${code}`);
  };

  return (
    <div className="min-h-full p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">选股</h1>
        <p className="text-[var(--text-tertiary)] text-sm">搜索 A 股股票，获取 AI 智能分析</p>
      </div>

      {/* Search bar */}
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

      {/* Hot sectors */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-[#f5a623]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">热门板块</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {HOT_SECTORS.map((sector) => (
            <button
              key={sector}
              className="px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[#f5a623]/50 transition-all"
            >
              {sector}
            </button>
          ))}
        </div>
      </div>

      {/* Hot stocks grid */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Star size={16} className="text-[#f5a623]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">热门股票</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {HOT_STOCKS.map((stock) => (
            <button
              key={stock.code}
              onClick={() => handleStockClick(stock.code)}
              className="p-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-left hover:border-[#f5a623]/40 hover:bg-[var(--bg-hover)] transition-all group"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-[var(--text-primary)] font-medium text-sm">
                    {stock.name}
                  </div>
                  <div className="text-[var(--text-tertiary)] text-xs mt-0.5">
                    {stock.code}
                  </div>
                </div>
                <ChevronRight
                  size={14}
                  className="text-[var(--text-tertiary)] group-hover:text-[#f5a623] mt-0.5 transition-colors"
                />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[var(--text-primary)] font-mono text-base">
                  ¥{stock.price}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    getPriceColor(stock.change),
                  )}
                >
                  {formatPercent(stock.change)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent analysis */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} className="text-[#f5a623]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">最近分析记录</h2>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
          {RECENT_ANALYSIS.map((item, idx) => (
            <button
              key={item.code}
              onClick={() => handleStockClick(item.code)}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left",
                idx < RECENT_ANALYSIS.length - 1 && "border-b border-[var(--border-color)]",
              )}
            >
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-[var(--text-primary)] text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="text-[var(--text-tertiary)] text-xs ml-2">
                    {item.code}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[var(--text-tertiary)] text-xs">{item.time}</span>
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    ADVICE_STYLES[item.adviceType],
                  )}
                >
                  {item.advice}
                </span>
                <ChevronRight size={14} className="text-[var(--text-tertiary)]" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
