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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  StockChart,
  KLineBar,
  generateMockData,
} from "@/components/stock/StockChart";

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
}

const PERIOD_COUNT: Record<Period, number> = {
  daily: 130,
  weekly: 104,
  monthly: 120,
};

/* ── 全屏图表容器：自动测量高度传给 StockChart ── */
function FullscreenChart({
  data,
  activeMAs,
  onToggleMA,
  error,
  loading,
}: {
  data: KLineBar[];
  activeMAs: number[];
  onToggleMA: (p: number) => void;
  error: boolean;
  loading: boolean;
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
          activeIndicators={["VOL"]}
          activeMAs={activeMAs}
          onToggleMA={onToggleMA}
          containerHeight={height}
        />
      )}
    </div>
  );
}

function IndexCard({
  code,
  name,
  desc,
  period,
  klineApiBase = "/api/stock/kline",
}: IndexCardProps) {
  const [data, setData] = useState<KLineBar[]>(() => generateMockData(code));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeMAs, setActiveMAs] = useState<number[]>([5, 20]);
  const [fullscreen, setFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const latest = data[data.length - 1];
  const changePct = latest?.changePct ?? 0;
  const isUp = changePct > 0;
  const isDown = changePct < 0;

  const toggleMA = useCallback((p: number) => {
    setActiveMAs((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }, []);

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
      </div>

      <div className="flex items-center gap-2">
        {error && !loading && (
          <span className="text-[11px] text-[var(--text-tertiary)]">
            暂无数据
          </span>
        )}
        {loading && (
          <RefreshCw
            size={13}
            className="animate-spin text-[var(--text-tertiary)]"
          />
        )}
        {latest && !loading && (
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
          activeIndicators={["VOL"]}
          activeMAs={activeMAs}
          onToggleMA={toggleMA}
          containerHeight={320}
        />
      </div>
    </div>
  );

  /* ── 全屏弹窗（Portal） ── */
  const modal =
    mounted && fullscreen
      ? createPortal(
          <div className="fixed inset-0 z-[9999] flex flex-col bg-[var(--bg-primary)]">
            {cardHeader(true)}
            <FullscreenChart
              data={data}
              activeMAs={activeMAs}
              onToggleMA={toggleMA}
              error={error}
              loading={loading}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {card}
      {modal}
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
}

function CountryGroup({
  groupKey,
  label,
  flag,
  indices,
  period,
  extra,
  klineApiBase,
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
            {/* 个股自身 K 线图，排在首位 */}
            <IndexCard
              key={`stock-self-${selectedStock.code}-${period}`}
              code={selectedStock.code}
              name={selectedStock.name}
              desc="个股"
              period={period}
              klineApiBase="/api/stock/kline"
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
        />
      ))}
    </div>
  );
}
