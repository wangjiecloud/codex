"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  X,
  Maximize2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  StockChart,
  KLineBar,
  generateMockData,
} from "@/components/stock/StockChart";
import MinuteChartModal from "@/components/stock/MinuteChartModal";
import MinuteChart, { MinuteBar } from "@/components/stock/MinuteChart";
import { MarketBreadthTable } from "@/components/stock/MarketBreadthTable";

/* ─────────────────── 类型 ─────────────────── */
type Period = "daily" | "weekly" | "monthly";

/* ─────────────────── 指数配置 ─────────────────── */
interface IndexConfig {
  code: string;
  name: string;
  desc?: string;
}

const INDEX_GROUPS: {
  key: string;
  label: string;
  flag: string;
  indices: IndexConfig[];
}[] = [
  {
    key: "cn",
    label: "中国 A 股",
    flag: "🇨🇳",
    indices: [
      { code: "000001", name: "上证指数", desc: "上交所综合" },
      { code: "399006", name: "创业板指", desc: "深交所创业" },
      { code: "000016", name: "上证50", desc: "沪市蓝筹" },
      { code: "000300", name: "沪深300", desc: "A股宽基" },
      { code: "000680", name: "科创综指", desc: "科创板综合" },
      { code: "000047", name: "上证全指", desc: "全市场A股" },
    ],
  },
  {
    key: "hk",
    label: "港股",
    flag: "🇭🇰",
    indices: [
      { code: "HSI", name: "恒生指数", desc: "港股蓝筹" },
      { code: "HSTECH", name: "恒生科技", desc: "港股科技" },
      { code: "HSCEI", name: "恒生国企", desc: "H股/国企" },
    ],
  },
  {
    key: "us",
    label: "美股",
    flag: "🇺🇸",
    indices: [
      { code: "NDX", name: "纳斯达克100", desc: "科技龙头" },
      { code: "SPX", name: "标普500", desc: "美股广基" },
      { code: "DJIA", name: "道琼斯", desc: "工业蓝筹" },
    ],
  },
  {
    key: "jp",
    label: "日本",
    flag: "🇯🇵",
    indices: [{ code: "N225", name: "日经225", desc: "日本蓝筹" }],
  },
  {
    key: "kr",
    label: "韩国",
    flag: "🇰🇷",
    indices: [{ code: "KS11", name: "KOSPI指数", desc: "韩国综合" }],
  },
];

/* ─────────────────── 单个指数卡片 ─────────────────── */
interface IndexCardProps {
  code: string;
  name: string;
  desc?: string;
  period: Period;
  /** 自定义 kline 接口路径前缀，默认 /api/stock/kline */
  klineApiBase?: string;
  /** 是否启用双击K线查看分时图（仅A股个股支持） */
  enableMinute?: boolean;
  /** 是否启用内嵌分时图 tab（仅上证指数支持），数据来自 /api/global/sh-trend */
  enableTimeshare?: boolean;
}

/** 东方财富 sh_trend 原始条目 → MinuteBar 转换 */
function shTrendToMinuteBars(
  raw: { time: string; price: number; preClose: number }[],
): MinuteBar[] {
  if (!raw.length) return [];
  const preClose = raw[0].preClose;
  const bars: MinuteBar[] = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    const prev = i === 0 ? preClose : raw[i - 1].price;
    bars.push({
      time: cur.time,
      open: prev,
      high: Math.max(prev, cur.price),
      low: Math.min(prev, cur.price),
      close: cur.price,
      volume: 0,
      amount: 0,
      avgPrice: cur.price,
      prevClose: preClose,
    });
  }
  return bars;
}

const PERIOD_COUNT: Record<Period, number> = {
  daily: 130,
  weekly: 104,
  monthly: 120,
};

const CARD_INDICATORS = ["VOL", "MACD", "KDJ", "BOLL", "RSI"];
const CARD_MA_PERIODS = [5, 10, 20, 30, 60];

function formatVolCard(v: number): string {
  if (!v) return "--";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(0);
}

/* ── 指标切换栏（卡片和全屏共用） ── */
function IndicatorBar({
  activeIndicators,
  onToggleIndicator,
  activeMAs,
  onToggleMA,
}: {
  activeIndicators: string[];
  onToggleIndicator: (ind: string) => void;
  activeMAs: number[];
  onToggleMA: (p: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-deep)] overflow-x-auto shrink-0">
      {CARD_INDICATORS.map((ind) => (
        <button
          key={ind}
          onClick={() => onToggleIndicator(ind)}
          className={cn(
            "px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors",
            activeIndicators.includes(ind)
              ? "bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/40"
              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-transparent hover:border-[var(--border-color)]",
          )}
        >
          {ind}
        </button>
      ))}
      <div className="w-px h-3 bg-[var(--border-color)] mx-0.5 shrink-0" />
      {CARD_MA_PERIODS.map((p) => (
        <button
          key={`ma${p}`}
          onClick={() => onToggleMA(p)}
          className={cn(
            "px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors",
            activeMAs.includes(p)
              ? "bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/40"
              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-transparent hover:border-[var(--border-color)]",
          )}
        >
          MA{p}
        </button>
      ))}
    </div>
  );
}

/* ── 全屏图表容器：自动测量高度传给 StockChart ── */
function FullscreenChart({
  data,
  activeIndicators,
  onToggleIndicator,
  activeMAs,
  onToggleMA,
  error,
  loading,
  onBarDoubleClick,
}: {
  data: KLineBar[];
  activeIndicators: string[];
  onToggleIndicator: (ind: string) => void;
  activeMAs: number[];
  onToggleMA: (p: number) => void;
  error: boolean;
  loading: boolean;
  onBarDoubleClick?: (bar: KLineBar) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeight(Math.floor(entry.contentRect.height));
      }
    });
    ro.observe(el);
    setHeight(Math.floor(el.getBoundingClientRect().height));
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <IndicatorBar
        activeIndicators={activeIndicators}
        onToggleIndicator={onToggleIndicator}
        activeMAs={activeMAs}
        onToggleMA={onToggleMA}
      />
      <div ref={containerRef} className="flex-1 relative min-h-0">
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-[13px] text-[var(--text-tertiary)]">
              暂无 K 线数据
            </span>
          </div>
        )}
        {height > 0 && (
          <StockChart
            data={data}
            activeIndicators={activeIndicators}
            activeMAs={activeMAs}
            onToggleMA={onToggleMA}
            containerHeight={height}
            onBarDoubleClick={onBarDoubleClick}
          />
        )}
      </div>
    </div>
  );
}

function IndexCard({
  code,
  name,
  desc,
  period,
  klineApiBase = "/api/stock/kline",
  enableMinute = false,
  enableTimeshare = false,
}: IndexCardProps) {
  const [data, setData] = useState<KLineBar[]>(() => generateMockData(code));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeMAs, setActiveMAs] = useState<number[]>([5, 20]);
  const [activeIndicators, setActiveIndicators] = useState<string[]>([
    "VOL",
    "MACD",
  ]);
  const [fullscreen, setFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 分时弹框状态
  const [minuteOpen, setMinuteOpen] = useState(false);
  const [minuteDate, setMinuteDate] = useState("");

  // 内嵌分时图状态（仅 enableTimeshare=true 时使用）
  const [chartTab, setChartTab] = useState<"kline" | "timeshare">("kline");
  const [trendData, setTrendData] = useState<MinuteBar[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendLastUpdate, setTrendLastUpdate] = useState<string>("");
  // 刷新间隔（毫秒），与东方财富接口推送频率对齐，3秒
  const REFRESH_INTERVAL = 3000;

  // 实时行情快照（直接来自东方财富，用于分时和K线模式头部显示）
  interface RealtimeQuote {
    price: number;
    changePct: number;
    changeAmt: number;
    high: number;
    low: number;
    open: number;
    prevClose: number;
    volume: number;
    amount: number;
  }
  const [realtimeQuote, setRealtimeQuote] = useState<RealtimeQuote | null>(
    null,
  );

  // 获取实时行情快照（直接从浏览器调东方财富，绕过服务器代理）
  const fetchRealtimeQuote = useCallback(async () => {
    if (!enableTimeshare) return;
    try {
      const url =
        `https://push2.eastmoney.com/api/qt/ulist.np/get` +
        `?fltt=2&invt=2&fields=f2,f3,f4,f12,f14,f15,f16,f17,f18,f47,f48` +
        `&secids=1.000001`;
      const res = await fetch(url, {
        headers: { Referer: "https://finance.eastmoney.com/" },
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      const items: Record<string, unknown>[] = json?.data?.diff ?? [];
      const item = items.find((x) => (x.f12 as string) === code);
      if (item && Number(item.f2) > 0) {
        setRealtimeQuote({
          price: Number(item.f2),
          changePct: Number(item.f3),
          changeAmt: Number(item.f4),
          high: Number(item.f15),
          low: Number(item.f16),
          open: Number(item.f17),
          prevClose: Number(item.f18),
          volume: Number(item.f47),
          amount: Number(item.f48),
        });
      }
    } catch {
      // 静默失败
    }
  }, [enableTimeshare, code]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ESC 关闭全屏
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [fullscreen]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const count = PERIOD_COUNT[period];
      const res = await fetch(
        `${klineApiBase}/${code}?period=${period}&count=${count}`,
      );
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      const bars: KLineBar[] = Array.isArray(json) ? json : (json.data ?? []);
      if (bars.length > 0) {
        setData(bars);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [code, period, klineApiBase]);

  // 是否是实时数据（决定是否高频刷新）
  const [isRealtime, setIsRealtime] = useState(false);

  // 获取分时走势数据：直接从浏览器调东方财富实时，为空则 fallback 到历史分时接口
  const fetchTrendData = useCallback(async () => {
    if (!enableTimeshare) return;
    setTrendLoading(true);
    try {
      // 1. 直接从浏览器请求东方财富实时分时数据
      const emUrl =
        "https://push2.eastmoney.com/api/qt/stock/trends2/get" +
        "?secid=1.000001&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11" +
        "&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscca=1";
      try {
        const res = await fetch(emUrl, {
          headers: { Referer: "https://finance.eastmoney.com/" },
          cache: "no-store",
        });
        if (res.ok) {
          const emJson = await res.json();
          const emData = emJson?.data ?? {};
          const preClose = Number(emData.preClose) || 0;
          const raw: string[] = emData.trends ?? [];
          const points: { time: string; price: number; preClose: number }[] =
            [];
          for (const item of raw) {
            const parts = String(item).split(",");
            if (parts.length < 3) continue;
            const t = (parts[0].split(" ").pop() ?? parts[0]).trim();
            const price = Number(parts[2]);
            if (price <= 0) continue;
            points.push({ time: t, price, preClose });
          }
          const bars = shTrendToMinuteBars(points);
          if (bars.length > 0) {
            setTrendData(bars);
            setIsRealtime(true);
            const now = new Date();
            setTrendLastUpdate(
              `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
            );
            return;
          }
        }
      } catch {
        // 东方财富请求失败，继续 fallback
      }
      // 2. 实时数据为空（非交易时段或请求失败），fallback 到历史分时接口（最新交易日）
      setIsRealtime(false);
      const res2 = await fetch(`/api/minute/${code}`, { cache: "no-store" });
      if (res2.ok) {
        const json2 = await res2.json();
        const rawBars: MinuteBar[] = json2.bars ?? json2.data ?? json2 ?? [];
        if (Array.isArray(rawBars) && rawBars.length > 0) {
          setTrendData(rawBars);
          const date: string = json2.date ?? "";
          setTrendLastUpdate(date ? `${date} 收盘` : "上一交易日");
        }
      }
    } catch {
      // 静默失败，保留上次数据
    } finally {
      setTrendLoading(false);
    }
  }, [enableTimeshare, code]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 分时图数据：切换到分时 tab 时立即拉取，实时模式下每 REFRESH_INTERVAL 秒刷新
  useEffect(() => {
    if (!enableTimeshare || chartTab !== "timeshare") return;
    fetchTrendData();
  }, [enableTimeshare, chartTab, fetchTrendData]);

  // 实时模式下定时刷新分时数据
  useEffect(() => {
    if (!enableTimeshare || chartTab !== "timeshare" || !isRealtime) return;
    const timer = setInterval(fetchTrendData, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [enableTimeshare, chartTab, isRealtime, fetchTrendData]);

  // K线图也按 REFRESH_INTERVAL 定时刷新（只在 daily 周期 + kline tab 时）
  useEffect(() => {
    if (!enableTimeshare || period !== "daily" || chartTab !== "kline") return;
    const timer = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [enableTimeshare, period, chartTab, fetchData]);

  // 实时行情快照：挂载时立即拉取，之后每 REFRESH_INTERVAL 刷新
  useEffect(() => {
    if (!enableTimeshare) return;
    fetchRealtimeQuote();
    const timer = setInterval(fetchRealtimeQuote, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [enableTimeshare, fetchRealtimeQuote]);

  const latest = data[data.length - 1];
  const changePct = latest?.changePct ?? 0;
  const isUp = changePct > 0;
  const isDown = changePct < 0;

  // 分时模式下的派生价格数据
  const trendLatest =
    trendData.length > 0 ? trendData[trendData.length - 1] : null;
  const trendPreClose = trendLatest?.prevClose ?? 0;

  // 优先用实时行情快照，fallback 到分时/K线数据
  const displayPrice =
    realtimeQuote?.price ?? trendLatest?.close ?? latest?.close ?? 0;
  const displayPrevClose =
    realtimeQuote?.prevClose ?? trendPreClose ?? latest?.close ?? 0;
  const displayChangePct =
    realtimeQuote?.changePct ??
    (displayPrevClose > 0
      ? ((displayPrice - displayPrevClose) / displayPrevClose) * 100
      : 0);
  const displayIsUp = displayChangePct > 0;
  const displayIsDown = displayChangePct < 0;

  const displayOpen =
    realtimeQuote?.open ??
    (trendData.length > 0 ? trendData[0].close : (latest?.open ?? 0));
  const displayHigh =
    realtimeQuote?.high ??
    (trendData.length > 0
      ? Math.max(...trendData.map((b) => b.close))
      : (latest?.high ?? 0));
  const displayLow =
    realtimeQuote?.low ??
    (trendData.length > 0
      ? Math.min(...trendData.map((b) => b.close))
      : (latest?.low ?? 0));
  const displayVolume =
    realtimeQuote?.amount ?? trendData.reduce((sum, b) => sum + b.volume, 0);

  const toggleMA = useCallback((p: number) => {
    setActiveMAs((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }, []);

  const toggleIndicator = useCallback((ind: string) => {
    setActiveIndicators((prev) =>
      prev.includes(ind) ? prev.filter((x) => x !== ind) : [...prev, ind],
    );
  }, []);

  const handleBarDoubleClick = useCallback(
    (bar: KLineBar) => {
      if (!enableMinute) return;
      setMinuteDate(bar.time);
      setMinuteOpen(true);
    },
    [enableMinute],
  );

  /* ── stats bar ── */
  const statsBar = (() => {
    // 分时模式：优先用实时行情快照，fallback 到分时数据汇总
    if (enableTimeshare && chartTab === "timeshare") {
      if (!realtimeQuote && !trendLatest) return null;
      // 成交额（亿元）
      const amountStr =
        realtimeQuote?.amount && realtimeQuote.amount > 0
          ? formatVolCard(realtimeQuote.amount)
          : "--";
      return (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-deep)] text-[10px] shrink-0 overflow-x-auto">
          {[
            ["今开", displayOpen > 0 ? displayOpen.toFixed(2) : "--"],
            ["最高", displayHigh > 0 ? displayHigh.toFixed(2) : "--"],
            ["最低", displayLow > 0 ? displayLow.toFixed(2) : "--"],
            ["成交额", amountStr],
            ["昨收", displayPrevClose > 0 ? displayPrevClose.toFixed(2) : "--"],
          ].map(([label, val]) => (
            <div
              key={label}
              className="flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span className="text-[var(--text-tertiary)]">{label}</span>
              <span className="font-mono text-[var(--text-secondary)]">
                {val}
              </span>
            </div>
          ))}
        </div>
      );
    }
    // K线模式：用K线 latest
    if (!latest || loading) return null;
    return (
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-deep)] text-[10px] shrink-0 overflow-x-auto">
        {[
          ["今开", latest.open > 0 ? latest.open.toFixed(2) : "--"],
          ["最高", latest.high > 0 ? latest.high.toFixed(2) : "--"],
          ["最低", latest.low > 0 ? latest.low.toFixed(2) : "--"],
          ["成交量", formatVolCard(latest.volume)],
          [
            "换手率",
            latest.turnRate != null && latest.turnRate > 0
              ? latest.turnRate.toFixed(2) + "%"
              : "--",
          ],
        ].map(([label, val]) => (
          <div
            key={label}
            className="flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span className="text-[var(--text-tertiary)]">{label}</span>
            <span className="font-mono text-[var(--text-secondary)]">
              {val}
            </span>
          </div>
        ))}
      </div>
    );
  })();

  /* ── 共用头部 ── */
  const cardHeader = (isFs: boolean) => (
    <div
      className={cn(
        "flex items-center justify-between px-4 border-b border-[var(--border-color)]",
        isFs ? "pt-4 pb-3" : "pt-3 pb-2",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "font-semibold text-[var(--text-primary)]",
            isFs ? "text-[16px]" : "text-[14px]",
          )}
        >
          {name}
        </span>
        {desc && (
          <span className="text-[11px] text-[var(--text-tertiary)] bg-[var(--bg-primary)] px-1.5 py-0.5 rounded">
            {desc}
          </span>
        )}
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
          {code}
        </span>
        {/* K线/分时 tab 切换 */}
        {enableTimeshare && (
          <div className="flex items-center gap-0.5 ml-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md p-0.5">
            <button
              onClick={() => setChartTab("kline")}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                chartTab === "kline"
                  ? "bg-[#f5a623] text-black"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
              )}
            >
              K线
            </button>
            <button
              onClick={() => setChartTab("timeshare")}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                chartTab === "timeshare"
                  ? "bg-[#f5a623] text-black"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
              )}
            >
              分时
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* 分时图刷新状态 */}
        {enableTimeshare && chartTab === "timeshare" && (
          <div className="flex items-center gap-1">
            {trendLoading ? (
              <RefreshCw
                size={11}
                className="animate-spin text-[var(--text-tertiary)]"
              />
            ) : trendLastUpdate ? (
              <span className="text-[9px] font-mono text-[var(--text-tertiary)]">
                {trendLastUpdate}
              </span>
            ) : null}
          </div>
        )}
        {error && !loading && chartTab === "kline" && (
          <span className="text-[11px] text-[var(--text-tertiary)]">
            暂无数据
          </span>
        )}
        {loading && chartTab === "kline" && (
          <RefreshCw
            size={13}
            className="animate-spin text-[var(--text-tertiary)]"
          />
        )}
        {/* 分时模式：显示分时最新价 */}
        {enableTimeshare &&
          chartTab === "timeshare" &&
          (realtimeQuote || trendLatest) && (
            <div className="flex items-center gap-2 text-right">
              <span
                className={cn(
                  "font-bold font-mono",
                  isFs ? "text-[18px]" : "text-[15px]",
                  displayIsUp
                    ? "text-[#ef4444]"
                    : displayIsDown
                      ? "text-[#22c55e]"
                      : "text-[var(--text-secondary)]",
                )}
              >
                {displayPrice.toFixed(2)}
              </span>
              <span
                className={cn(
                  "font-mono",
                  isFs ? "text-[14px]" : "text-[12px]",
                  displayIsUp
                    ? "text-[#ef4444]"
                    : displayIsDown
                      ? "text-[#22c55e]"
                      : "text-[var(--text-tertiary)]",
                )}
              >
                {displayIsUp ? "+" : ""}
                {displayChangePct.toFixed(2)}%
              </span>
            </div>
          )}
        {/* K线模式：显示K线最新价 */}
        {(!enableTimeshare || chartTab === "kline") && latest && !loading && (
          <div className="flex items-center gap-2 text-right">
            <span
              className={cn(
                "font-bold font-mono",
                isFs ? "text-[18px]" : "text-[15px]",
                isUp
                  ? "text-[#ef4444]"
                  : isDown
                    ? "text-[#22c55e]"
                    : "text-[var(--text-secondary)]",
              )}
            >
              {latest.close.toFixed(2)}
            </span>
            <span
              className={cn(
                "font-mono",
                isFs ? "text-[14px]" : "text-[12px]",
                isUp
                  ? "text-[#ef4444]"
                  : isDown
                    ? "text-[#22c55e]"
                    : "text-[var(--text-tertiary)]",
              )}
            >
              {isUp ? "+" : ""}
              {changePct.toFixed(2)}%
            </span>
          </div>
        )}
        {/* 全屏 / 关闭按钮 */}
        <button
          onClick={() => setFullscreen((v) => !v)}
          className="p-1 rounded hover:bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          title={isFs ? "关闭全屏" : "全屏查看"}
        >
          {isFs ? <X size={15} /> : <Maximize2 size={13} />}
        </button>
      </div>
    </div>
  );

  /* ── 卡片（非全屏） ── */
  const card = (
    <div className="flex flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden">
      {cardHeader(false)}
      {statsBar}
      {/* 分时图模式 */}
      {enableTimeshare && chartTab === "timeshare" ? (
        <div className="relative" style={{ height: 320 }}>
          {trendData.length === 0 && trendLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCw
                size={16}
                className="animate-spin text-[var(--text-tertiary)]"
              />
            </div>
          )}
          {trendData.length === 0 && !trendLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[12px] text-[var(--text-tertiary)]">
                暂无分时数据（非交易时段）
              </span>
            </div>
          )}
          {trendData.length > 0 && (
            <MinuteChart
              data={trendData}
              height={320}
              stockName={name}
              mode="1min"
            />
          )}
        </div>
      ) : (
        /* K线图模式 */
        <>
          <IndicatorBar
            activeIndicators={activeIndicators}
            onToggleIndicator={toggleIndicator}
            activeMAs={activeMAs}
            onToggleMA={toggleMA}
          />
          <div className="relative" style={{ height: 320 }}>
            {error && !loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[12px] text-[var(--text-tertiary)]">
                  暂无 K 线数据
                </span>
              </div>
            )}
            <StockChart
              data={data}
              activeIndicators={activeIndicators}
              activeMAs={activeMAs}
              onToggleMA={toggleMA}
              containerHeight={320}
              onBarDoubleClick={enableMinute ? handleBarDoubleClick : undefined}
            />
          </div>
        </>
      )}
    </div>
  );

  /* ── 全屏弹窗（Portal） ── */
  const modal =
    mounted && fullscreen
      ? createPortal(
          <div className="fixed inset-0 z-[9999] flex flex-col bg-[var(--bg-primary)]">
            {cardHeader(true)}
            {statsBar}
            {enableTimeshare && chartTab === "timeshare" ? (
              <div className="flex-1 relative min-h-0">
                {trendData.length === 0 && trendLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <RefreshCw
                      size={20}
                      className="animate-spin text-[var(--text-tertiary)]"
                    />
                  </div>
                )}
                {trendData.length === 0 && !trendLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[14px] text-[var(--text-tertiary)]">
                      暂无分时数据（非交易时段）
                    </span>
                  </div>
                )}
                {trendData.length > 0 && (
                  <MinuteChart
                    data={trendData}
                    height={600}
                    stockName={name}
                    mode="1min"
                  />
                )}
              </div>
            ) : (
              <FullscreenChart
                data={data}
                activeIndicators={activeIndicators}
                onToggleIndicator={toggleIndicator}
                activeMAs={activeMAs}
                onToggleMA={toggleMA}
                error={error}
                loading={loading}
                onBarDoubleClick={
                  enableMinute ? handleBarDoubleClick : undefined
                }
              />
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {card}
      {modal}
      {enableMinute && (
        <MinuteChartModal
          open={minuteOpen}
          onClose={() => setMinuteOpen(false)}
          code={code}
          name={name}
          date={minuteDate}
        />
      )}
    </>
  );
}

/* ─────────────────── 国家分组 ─────────────────── */
interface CountryGroupProps {
  groupKey: string;
  label: string;
  flag: string;
  indices: IndexConfig[];
  period: Period;
  extra?: IndexConfig[];
  klineApiBase?: string;
  enableMinute?: boolean;
}

function CountryGroup({
  groupKey,
  label,
  flag,
  indices,
  period,
  extra,
  klineApiBase,
  enableMinute = false,
}: CountryGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const allIndices = extra ? [...indices, ...extra] : indices;

  return (
    <div className="mb-6">
      {/* 分组标题 */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 mb-4 px-1 py-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <span className="text-lg leading-none">{flag}</span>
        <span className="text-[14px] font-semibold text-[var(--text-primary)]">
          {label}
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-[var(--bg-secondary)] text-[var(--text-tertiary)]">
          {allIndices.length}
        </span>
        <div className="flex-1" />
        {collapsed ? (
          <ChevronRight size={14} className="text-[var(--text-tertiary)]" />
        ) : (
          <ChevronDown size={14} className="text-[var(--text-tertiary)]" />
        )}
      </button>

      {/* 每行 2 个 */}
      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {allIndices.map((idx) => (
            <IndexCard
              key={`${groupKey}-${idx.code}-${period}`}
              code={idx.code}
              name={idx.name}
              desc={idx.desc}
              period={period}
              klineApiBase={klineApiBase}
              enableMinute={enableMinute}
              enableTimeshare={groupKey === "cn" && idx.code === "000001"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── 搜索结果类型 ─────────────────── */
interface SearchResult {
  code: string;
  name: string;
  price?: number;
  change?: number;
}

/* ─────────────────── 主组件 ReviewTab ─────────────────── */
export default function ReviewTab() {
  const [period, setPeriod] = useState<Period>("daily");
  const [showBreadthModal, setShowBreadthModal] = useState(false);

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null);
  const [sectorIndices, setSectorIndices] = useState<IndexConfig[]>([]);
  const [sectorLoading, setSectorLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // 搜索防抖
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/stock/search?q=${encodeURIComponent(searchQuery)}`,
        );
        const json = await res.json();
        const results: SearchResult[] = (json.results ?? json ?? []).slice(
          0,
          10,
        );
        setSearchResults(results);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 选中股票后获取所属申万板块
  const handleSelectStock = useCallback(async (stock: SearchResult) => {
    setSelectedStock(stock);
    setSearchQuery(stock.name);
    setShowDropdown(false);
    setSectorIndices([]);
    setSectorLoading(true);
    try {
      const res = await fetch(`/api/sw-industry/boards-by-stock/${stock.code}`);
      if (!res.ok) throw new Error("no data");
      const json = await res.json();
      const boards: { code: string; name: string }[] = Array.isArray(json)
        ? json
        : (json.boards ?? json.data ?? []);
      const configs: IndexConfig[] = boards.slice(0, 4).map((b) => ({
        code: b.code,
        name: b.name,
        desc: `${stock.name} 所属`,
      }));
      setSectorIndices(configs);
    } catch {
      setSectorIndices([]);
    } finally {
      setSectorLoading(false);
    }
  }, []);

  const clearSelectedStock = useCallback(() => {
    setSelectedStock(null);
    setSearchQuery("");
    setSectorIndices([]);
  }, []);

  const periodOptions: { value: Period; label: string }[] = [
    { value: "daily", label: "日K" },
    { value: "weekly", label: "周K" },
    { value: "monthly", label: "月K" },
  ];

  return (
    <div className="min-h-full">
      {/* ── 顶部控制栏 ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* 周期切换 */}
        <div className="flex items-center gap-0.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-0.5">
          {periodOptions.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                period === value
                  ? "bg-[#f5a623] text-black shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 股票搜索框 */}
        <div ref={searchRef} className="relative flex-1 max-w-sm">
          {" "}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm transition-all focus-within:border-[#f5a623]/50">
            <Search
              size={13}
              className="text-[var(--text-tertiary)] shrink-0"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索股票，展示所属板块指数…"
              className="flex-1 bg-transparent outline-none text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            />
            {searchLoading && (
              <RefreshCw
                size={12}
                className="animate-spin text-[var(--text-tertiary)] shrink-0"
              />
            )}
            {(searchQuery || selectedStock) && !searchLoading && (
              <button onClick={clearSelectedStock}>
                <X
                  size={12}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                />
              </button>
            )}
          </div>
          {/* 搜索下拉 */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-xl z-50 overflow-hidden">
              {searchResults.map((r) => {
                const isUp = (r.change ?? 0) > 0;
                const isDown = (r.change ?? 0) < 0;
                return (
                  <button
                    key={r.code}
                    onClick={() => handleSelectStock(r)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-primary)] transition-colors"
                  >
                    <span className="text-[12px] font-mono text-[var(--text-tertiary)] w-14 shrink-0">
                      {r.code}
                    </span>
                    <span className="flex-1 text-[13px] text-[var(--text-primary)]">
                      {r.name}
                    </span>
                    {r.change != null && (
                      <span
                        className={cn(
                          "text-[12px] font-mono",
                          isUp
                            ? "text-[#ef4444]"
                            : isDown
                              ? "text-[#22c55e]"
                              : "text-[var(--text-tertiary)]",
                        )}
                      >
                        {isUp ? "+" : ""}
                        {r.change.toFixed(2)}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 情绪按钮 */}
        <button
          onClick={() => setShowBreadthModal(true)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
            showBreadthModal
              ? "bg-[#f5a623]/15 border-[#f5a623]/40 text-[#f5a623]"
              : "bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#f5a623]/40 hover:text-[#f5a623]",
          )}
        >
          <TrendingUp size={12} />
          情绪
        </button>

        {/* 已选股票标签 */}
        {selectedStock && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#f5a623]/30 bg-[#f5a623]/8 text-[12px]">
            <span className="text-[var(--text-secondary)]">板块：</span>
            <span className="text-[#f5a623] font-medium">
              {selectedStock.name}
            </span>
            {sectorLoading && (
              <RefreshCw size={11} className="animate-spin text-[#f5a623]/60" />
            )}
          </div>
        )}
      </div>

      {/* ── 市场情绪 Modal（portal 到 body） ── */}
      {showBreadthModal &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px 16px",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowBreadthModal(false);
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 860,
                maxHeight: "85vh",
                display: "flex",
                flexDirection: "column",
                borderRadius: 14,
                overflow: "hidden",
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
              }}
            >
              {/* Modal 头部 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  borderBottom: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  市场情绪 · 近两个月涨跌分布
                </span>
                <button
                  onClick={() => setShowBreadthModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-tertiary)",
                    padding: 4,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              {/* Modal 内容 */}
              <div style={{ overflow: "auto", flex: 1 }}>
                <MarketBreadthTable />
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── 板块指数区域（如有） ── */}
      {sectorIndices.length > 0 && selectedStock && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="text-lg leading-none">📊</span>
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">
              {selectedStock.name} 所属板块
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-[var(--bg-secondary)] text-[var(--text-tertiary)]">
              {sectorIndices.length + 1}
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 个股自身 K 线图，排在首位，支持双击分时 */}
            <IndexCard
              key={`stock-self-${selectedStock.code}-${period}`}
              code={selectedStock.code}
              name={selectedStock.name}
              desc="个股"
              period={period}
              klineApiBase="/api/stock/kline"
              enableMinute={true}
            />
            {sectorIndices.map((idx) => (
              <IndexCard
                key={`sector-${idx.code}-${period}`}
                code={idx.code}
                name={idx.name}
                desc={idx.desc}
                period={period}
                klineApiBase="/api/sw-industry/kline"
              />
            ))}
          </div>
          <div className="mt-6 mb-1 h-px bg-[var(--border-color)]" />
        </div>
      )}

      {/* ── 各国指数分组 ── */}
      {INDEX_GROUPS.map((group) => (
        <CountryGroup
          key={group.key}
          groupKey={group.key}
          label={group.label}
          flag={group.flag}
          indices={group.indices}
          period={period}
          enableMinute={group.key === "cn"}
        />
      ))}
    </div>
  );
}
