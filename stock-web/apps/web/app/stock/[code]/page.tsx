"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Star } from "lucide-react";
import { StockChart, generateMockData } from "@/components/stock/StockChart";
import { AgentPanel } from "@/components/agents/AgentPanel";
import { cn, getPriceColor, formatPercent } from "@/lib/utils";

const MOCK_QUOTES: Record<
  string,
  {
    name: string;
    price: number;
    change: number;
    changeAmt: number;
    open: number;
    prevClose: number;
    high: number;
    low: number;
    volume: string;
    turnover: string;
    marketCap: string;
    pe: string;
  }
> = {
  "600519": {
    name: "贵州茅台",
    price: 1642.0,
    change: 1.23,
    changeAmt: 19.9,
    open: 1625.0,
    prevClose: 1622.1,
    high: 1655.0,
    low: 1620.0,
    volume: "3.2万手",
    turnover: "52.4亿",
    marketCap: "20680亿",
    pe: "28.5",
  },
  "000001": {
    name: "平安银行",
    price: 12.45,
    change: 1.88,
    changeAmt: 0.23,
    open: 12.3,
    prevClose: 12.22,
    high: 12.51,
    low: 12.28,
    volume: "3.2亿手",
    turnover: "39.8亿",
    marketCap: "2415亿",
    pe: "5.2",
  },
  "300750": {
    name: "宁德时代",
    price: 238.5,
    change: -0.85,
    changeAmt: -2.04,
    open: 240.0,
    prevClose: 240.54,
    high: 242.1,
    low: 236.8,
    volume: "1.8亿手",
    turnover: "43.2亿",
    marketCap: "5552亿",
    pe: "22.1",
  },
  "688981": {
    name: "中芯国际",
    price: 87.3,
    change: 2.14,
    changeAmt: 1.83,
    open: 85.8,
    prevClose: 85.47,
    high: 88.5,
    low: 85.2,
    volume: "0.9亿手",
    turnover: "79.1亿",
    marketCap: "6921亿",
    pe: "45.8",
  },
};

const WATCHLIST = [
  { code: "600519", name: "贵州茅台", price: 1642.0, change: 1.23 },
  { code: "000001", name: "平安银行", price: 12.45, change: 1.88 },
  { code: "300750", name: "宁德时代", price: 238.5, change: -0.85 },
  { code: "002594", name: "比亚迪", price: 328.0, change: -1.32 },
  { code: "688981", name: "中芯国际", price: 87.3, change: 2.14 },
];

const INDICATORS = ["VOL", "MACD", "KDJ", "BOLL", "RSI", "DMI", "CCI", "W&R"];
const PERIODS = [
  "分时",
  "日K",
  "周K",
  "月K",
  "120分",
  "60分",
  "30分",
  "15分",
  "5分",
];
const BOTTOM_TABS = ["新闻资讯", "持仓股", "快捷交易", "股市便签", "AI分析"];

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const quote = MOCK_QUOTES[code] ?? {
    name: `股票${code}`,
    price: 10.0,
    change: 0,
    changeAmt: 0,
    open: 10.0,
    prevClose: 10.0,
    high: 10.5,
    low: 9.8,
    volume: "0",
    turnover: "0",
    marketCap: "0",
    pe: "0",
  };

  const [klineData] = useState(() => generateMockData(code));
  const [activeIndicators, setActiveIndicators] = useState([
    "VOL",
    "MACD",
    "KDJ",
  ]);
  const [activePeriod, setActivePeriod] = useState("日K");
  const [activeTab, setActiveTab] = useState("新闻资讯");
  const [isStarred, setIsStarred] = useState(false);

  const toggleIndicator = (ind: string) => {
    setActiveIndicators((prev) =>
      prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind],
    );
  };

  const orderBookRows = Array.from({ length: 5 }, (_, i) => ({
    sell: {
      price: (quote.price + (5 - i) * 0.001).toFixed(3),
      vol: Math.floor(Math.random() * 5000 + 500),
    },
    buy: {
      price: (quote.price - (i + 1) * 0.001).toFixed(3),
      vol: Math.floor(Math.random() * 5000 + 500),
    },
  }));

  return (
    <div className="flex flex-col h-full text-xs overflow-hidden">
      {/* Top toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#1e2332] bg-[#151821] shrink-0 overflow-x-auto">
        <button
          onClick={() => router.push("/stock/search")}
          className="flex items-center gap-1 text-gray-500 hover:text-white mr-2 shrink-0"
        >
          <ArrowLeft size={13} />
        </button>
        <button
          onClick={() => setIsStarred((s) => !s)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded border mr-2 shrink-0 transition-colors",
            isStarred
              ? "border-[#f5a623]/50 text-[#f5a623] bg-[#f5a623]/10"
              : "border-[#1e2332] text-gray-500",
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
                : "text-gray-500 hover:text-white",
            )}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Watchlist */}
        <div className="w-[140px] border-r border-[#1e2332] bg-[#0d1018] flex flex-col shrink-0 overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#1e2332]">
            <span className="text-gray-600 text-[10px]">名称</span>
            <span className="text-gray-600 text-[10px]">涨幅/现价</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {WATCHLIST.map((s) => (
              <button
                key={s.code}
                onClick={() => router.push(`/stock/${s.code}`)}
                className={cn(
                  "w-full flex items-center justify-between px-2 py-1.5 border-b border-[#1a1f2e] hover:bg-[#1a1f2e] transition-colors",
                  s.code === code && "bg-[#1e2332]",
                )}
              >
                <div className="text-left">
                  <div
                    className={cn(
                      "text-[11px] font-medium",
                      s.code === code ? "text-white" : "text-gray-300",
                    )}
                  >
                    {s.name}
                  </div>
                  <div className="text-[10px] text-gray-600">{s.code}</div>
                </div>
                <div className="text-right">
                  <div className={cn("text-[11px]", getPriceColor(s.change))}>
                    {formatPercent(s.change)}
                  </div>
                  <div className="text-[11px] text-gray-400 font-mono">
                    {s.price}
                  </div>
                </div>
              </button>
            ))}
            <button className="w-full flex items-center gap-1 justify-center py-2 text-gray-600 hover:text-gray-400 text-[10px]">
              <Plus size={10} /> 添加股票
            </button>
          </div>
        </div>

        {/* Main chart area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Stock header */}
          <div className="flex items-start justify-between px-4 py-2 border-b border-[#1e2332] bg-[#0f1117] shrink-0">
            <div>
              <div className="flex items-baseline gap-3">
                <span className="text-lg font-bold text-white">
                  {quote.name}
                </span>
                <span className="text-gray-600">{code}</span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span
                  className={cn(
                    "text-2xl font-bold font-mono",
                    getPriceColor(quote.change),
                  )}
                >
                  {quote.price.toFixed(3)}
                </span>
                <span className={cn("text-sm", getPriceColor(quote.change))}>
                  {quote.changeAmt >= 0 ? "+" : ""}
                  {quote.changeAmt.toFixed(3)}
                </span>
                <span className={cn("text-sm", getPriceColor(quote.change))}>
                  {formatPercent(quote.change)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-right mt-1">
              {[
                ["今开", quote.open.toFixed(3)],
                ["最高", quote.high.toFixed(3)],
                ["昨收", quote.prevClose.toFixed(3)],
                ["最低", quote.low.toFixed(3)],
                ["成交量", quote.volume],
                ["换手率", "1.2%"],
              ].map(([label, val]) => (
                <div key={label} className="flex gap-2 justify-end text-[11px]">
                  <span className="text-gray-600">{label}</span>
                  <span className="text-gray-300 font-mono">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* K-line chart */}
          <div className="flex-1 overflow-y-auto">
            <StockChart data={klineData} activeIndicators={activeIndicators} />
          </div>

          {/* Indicator selector */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-t border-[#1e2332] bg-[#0d1018] shrink-0 overflow-x-auto">
            {INDICATORS.map((ind) => (
              <button
                key={ind}
                onClick={() => toggleIndicator(ind)}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors",
                  activeIndicators.includes(ind)
                    ? "bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/40"
                    : "text-gray-500 hover:text-gray-300 border border-transparent hover:border-[#1e2332]",
                )}
              >
                {ind}
              </button>
            ))}
          </div>

          {/* Bottom tabs */}
          <div className="flex items-center border-t border-[#1e2332] bg-[#151821] shrink-0">
            {BOTTOM_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 text-[11px] whitespace-nowrap transition-colors border-b-2",
                  activeTab === tab
                    ? "text-[#f5a623] border-[#f5a623]"
                    : "text-gray-500 border-transparent hover:text-gray-300",
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab !== "AI分析" && (
            <div className="h-32 overflow-y-auto p-3 bg-[#0f1117] text-gray-500 text-[11px]">
              {activeTab === "新闻资讯" && (
                <div className="space-y-2">
                  {[
                    `${quote.name}发布2025年三季报，净利润同比增长12.3%`,
                    `机构调研 ${quote.name}，多家券商维持买入评级`,
                    `${quote.name} 入选沪深300指数成分股调整名单`,
                  ].map((news, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 py-1 border-b border-[#1e2332]"
                    >
                      <span className="text-gray-700 shrink-0">
                        {new Date(Date.now() - i * 3600000).toLocaleTimeString(
                          "zh-CN",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </span>
                      <span className="text-gray-400">{news}</span>
                    </div>
                  ))}
                </div>
              )}
              {activeTab !== "新闻资讯" && (
                <div className="flex items-center justify-center h-full text-gray-700">
                  {activeTab} 功能开发中...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel: order book + AI */}
        <div className="w-[200px] border-l border-[#1e2332] bg-[#0d1018] flex flex-col shrink-0 overflow-hidden">
          {activeTab === "AI分析" ? (
            <div className="flex-1 overflow-hidden">
              <AgentPanel code={code} stockName={quote.name} />
            </div>
          ) : (
            <>
              {/* Order book */}
              <div className="px-2 py-1.5 border-b border-[#1e2332]">
                <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                  <span>
                    委比 <span className="text-[#e84444]">-11.90%</span>
                  </span>
                </div>
                {/* Sell side */}
                {orderBookRows.reverse().map((row, i) => (
                  <div
                    key={`sell-${i}`}
                    className="flex justify-between py-0.5"
                  >
                    <span className="text-[10px] text-gray-600">卖{5 - i}</span>
                    <span className="text-[11px] text-[#09d464] font-mono">
                      {row.sell.price}
                    </span>
                    <span className="text-[10px] text-gray-600 font-mono">
                      {row.sell.vol}
                    </span>
                  </div>
                ))}
                <div className="my-1 border-t border-[#1e2332]" />
                {/* Buy side */}
                {[...orderBookRows].reverse().map((row, i) => (
                  <div key={`buy-${i}`} className="flex justify-between py-0.5">
                    <span className="text-[10px] text-gray-600">买{i + 1}</span>
                    <span className="text-[11px] text-[#e84444] font-mono">
                      {row.buy.price}
                    </span>
                    <span className="text-[10px] text-gray-600 font-mono">
                      {row.buy.vol}
                    </span>
                  </div>
                ))}
              </div>

              {/* Quote stats */}
              <div className="px-2 py-1.5 border-b border-[#1e2332]">
                <div className="text-[10px] text-gray-500 font-medium mb-1">
                  行情数据
                </div>
                {[
                  ["昨收", quote.prevClose.toFixed(3)],
                  ["今开", quote.open.toFixed(3)],
                  ["最高", quote.high.toFixed(3)],
                  ["最低", quote.low.toFixed(3)],
                  ["市值", quote.marketCap],
                  ["市盈率", quote.pe],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between py-0.5">
                    <span className="text-[10px] text-gray-600">{label}</span>
                    <span className="text-[11px] text-gray-300 font-mono">
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
                  🤖 启动 AI 分析
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
