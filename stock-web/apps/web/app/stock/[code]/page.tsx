"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Star } from "lucide-react";
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
  author: string;
  time: string;
  reads: string;
  replies: string;
  url: string;
  category: string;
}

interface GubaData {
  announcement: GubaItem[];
  research: GubaItem[];
  news: GubaItem[];
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

const WATCHLIST = [
  { code: "600519", name: "贵州茅台" },
  { code: "300750", name: "宁德时代" },
  { code: "002594", name: "比亚迪" },
  { code: "688981", name: "中芯国际" },
  { code: "601208", name: "东材科技" },
];

const INDICATORS = ["VOL", "MACD", "KDJ", "BOLL", "RSI", "DMI", "CCI", "W&R"];
const PERIODS = ["日K", "周K", "月K"];
const BOTTOM_TABS = ["公告", "研报", "资讯", "AI分析"];

const PERIOD_MAP: Record<string, string> = {
  日K: "daily",
  周K: "weekly",
  月K: "monthly",
};

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
  const [gubaData, setGubaData] = useState<GubaData>({
    announcement: [],
    research: [],
    news: [],
  });
  const [activeIndicators, setActiveIndicators] = useState([
    "VOL",
    "MACD",
    "KDJ",
  ]);
  const [activePeriod, setActivePeriod] = useState("日K");
  const [activeTab, setActiveTab] = useState("公告");
  const [isStarred, setIsStarred] = useState(false);
  const [watchlist, setWatchlist] = useState<
    Array<{ code: string; name: string }>
  >([]);

  useEffect(() => {
    setWatchlist(getRecentlyViewed());
  }, []);

  useEffect(() => {
    if (quote.name) {
      addToRecentlyViewed(code, quote.name);
    }
  }, [code, quote.name]);

  useEffect(() => {
    fetch(`http://localhost:8000/api/quote/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.price !== undefined) setQuote(data as QuoteData);
      })
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    const period = PERIOD_MAP[activePeriod];
    if (!period) return;
    fetch(`http://localhost:8000/api/kline/${code}?period=${period}&count=120`)
      .then((r) => r.json())
      .then((data) => {
        if (data.bars && data.bars.length > 0) setKlineData(data.bars);
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
    fetch(`http://localhost:8000/api/guba/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setGubaData(data.data);
        }
      })
      .catch(() => {});
  }, [code]);

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

  const displayName = quote.name || `股票${code}`;

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
            <span className="text-gray-600 text-[10px]">代码</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(watchlist.length > 0 ? watchlist : WATCHLIST).map((s) => (
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
                  {displayName}
                </span>
                <span className="text-gray-600">({code})</span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span
                  className={cn(
                    "text-2xl font-bold font-mono",
                    getPriceColor(quote.change),
                  )}
                >
                  {quote.price > 0 ? quote.price.toFixed(3) : "--"}
                </span>
                <span className={cn("text-sm", getPriceColor(quote.change))}>
                  {quote.changeAmt >= 0 ? "+" : ""}
                  {quote.price > 0 ? quote.changeAmt.toFixed(3) : "--"}
                </span>
                <span className={cn("text-sm", getPriceColor(quote.change))}>
                  {quote.price > 0 ? formatPercent(quote.change) : "--"}
                </span>
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
            <div className="h-32 overflow-y-auto bg-[#0f1117] text-[11px]">
              {activeTab === "公告" && (
                <div className="w-full">
                  {gubaData.announcement.length > 0 ? (
                    <table className="w-full">
                      <thead className="sticky top-0 bg-[#151821] border-b border-[#1e2332]">
                        <tr className="text-gray-500 text-[10px]">
                          <th className="px-2 py-1 text-center w-16">阅读</th>
                          <th className="px-2 py-1 text-center w-16">评论</th>
                          <th className="px-2 py-1 text-left">标题</th>
                          <th className="px-2 py-1 text-left w-24">作者</th>
                          <th className="px-2 py-1 text-center w-20">更新</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gubaData.announcement.map((item, i) => (
                          <tr
                            key={i}
                            className="border-b border-[#1e2332] hover:bg-[#1a1f2e] transition-colors"
                          >
                            <td className="px-2 py-1.5 text-center text-gray-500">
                              {item.reads}
                            </td>
                            <td className="px-2 py-1.5 text-center text-gray-500">
                              {item.replies}
                            </td>
                            <td className="px-2 py-1.5">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-[#f5a623] line-clamp-1"
                              >
                                {item.title}
                              </a>
                            </td>
                            <td className="px-2 py-1.5 text-gray-500 truncate">
                              {item.author}
                            </td>
                            <td className="px-2 py-1.5 text-center text-gray-600 text-[10px]">
                              {item.time}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center text-gray-600 py-8">
                      暂无公告数据
                    </div>
                  )}
                </div>
              )}
              {activeTab === "研报" && (
                <div className="w-full">
                  {gubaData.research.length > 0 ? (
                    <table className="w-full">
                      <thead className="sticky top-0 bg-[#151821] border-b border-[#1e2332]">
                        <tr className="text-gray-500 text-[10px]">
                          <th className="px-2 py-1 text-center w-16">阅读</th>
                          <th className="px-2 py-1 text-center w-16">评论</th>
                          <th className="px-2 py-1 text-left">标题</th>
                          <th className="px-2 py-1 text-left w-24">作者</th>
                          <th className="px-2 py-1 text-center w-20">更新</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gubaData.research.map((item, i) => (
                          <tr
                            key={i}
                            className="border-b border-[#1e2332] hover:bg-[#1a1f2e] transition-colors"
                          >
                            <td className="px-2 py-1.5 text-center text-gray-500">
                              {item.reads}
                            </td>
                            <td className="px-2 py-1.5 text-center text-gray-500">
                              {item.replies}
                            </td>
                            <td className="px-2 py-1.5">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-[#f5a623] line-clamp-1"
                              >
                                {item.title}
                              </a>
                            </td>
                            <td className="px-2 py-1.5 text-gray-500 truncate">
                              {item.author}
                            </td>
                            <td className="px-2 py-1.5 text-center text-gray-600 text-[10px]">
                              {item.time}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center text-gray-600 py-8">
                      暂无研报数据
                    </div>
                  )}
                </div>
              )}
              {activeTab === "资讯" && (
                <div className="w-full">
                  {gubaData.news.length > 0 ? (
                    <table className="w-full">
                      <thead className="sticky top-0 bg-[#151821] border-b border-[#1e2332]">
                        <tr className="text-gray-500 text-[10px]">
                          <th className="px-2 py-1 text-center w-16">阅读</th>
                          <th className="px-2 py-1 text-center w-16">评论</th>
                          <th className="px-2 py-1 text-left">标题</th>
                          <th className="px-2 py-1 text-left w-24">作者</th>
                          <th className="px-2 py-1 text-center w-20">更新</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gubaData.news.map((item, i) => (
                          <tr
                            key={i}
                            className="border-b border-[#1e2332] hover:bg-[#1a1f2e] transition-colors"
                          >
                            <td className="px-2 py-1.5 text-center text-gray-500">
                              {item.reads}
                            </td>
                            <td className="px-2 py-1.5 text-center text-gray-500">
                              {item.replies}
                            </td>
                            <td className="px-2 py-1.5">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-[#f5a623] line-clamp-1"
                              >
                                {item.title}
                              </a>
                            </td>
                            <td className="px-2 py-1.5 text-gray-500 truncate">
                              {item.author}
                            </td>
                            <td className="px-2 py-1.5 text-center text-gray-600 text-[10px]">
                              {item.time}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center text-gray-600 py-8">
                      暂无资讯数据
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel: order book + AI */}
        <div className="w-[200px] border-l border-[#1e2332] bg-[#0d1018] flex flex-col shrink-0 overflow-hidden">
          {activeTab === "AI分析" ? (
            <div className="flex-1 overflow-hidden">
              <AgentPanel code={code} stockName={displayName} />
            </div>
          ) : (
            <>
              {/* Order book */}
              <div className="px-2 py-1.5 border-b border-[#1e2332]">
                <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                  <span>委比</span>
                </div>
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
