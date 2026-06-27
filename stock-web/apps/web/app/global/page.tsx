"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────

interface FlashItem {
  id: string;
  title: string;
  digest: string;
  url: string;
  ctime: string;
}

interface Theme {
  themeId: string;
  themeName: string;
}

interface ContentTab {
  id: number;
  name: string;
}

interface ThemeMeta {
  themeId: string;
  title: string;
  content: string;
  indexCode: string | null;
  contentId: number | null;
  contentName: string | null;
  contentTabs: ContentTab[];
}

interface StockItem {
  code: string;
  name: string;
  market: string;
  gain: number;
  latest?: number | null;
  change?: number | null;
}

interface ThemeStocks {
  blockName: string;
  gain: number;
  latest?: number | null;
  prevClose?: number | null;
  change?: number | null;
  stocks: StockItem[];
}

interface TrendPoint {
  time: number;
  price: number;
}

interface TrendData {
  basePrice: number;
  points: TrendPoint[];
}

interface NewsItem {
  id: string;
  title: string;
  abstract: string;
  picUrl: string;
  source: string;
  time: number;
  url: string;
  tag?: string;
  stocks: { name: string; code: string; market: string }[];
}

// ── Helpers ───────────────────────────────────────────────────

const FLASH_CATS = [
  { key: "important", label: "重要" },
  { key: "a", label: "A股" },
  { key: "hk", label: "港股" },
  { key: "us", label: "美股" },
  { key: "abnormal", label: "异动" },
  { key: "notice", label: "公告" },
];

function pc(v: number) {
  if (v > 0) return "text-[#e84444]";
  if (v < 0) return "text-[#09d464]";
  return "text-[var(--text-secondary)]";
}
function sgn(v: number) {
  return v > 0 ? "+" : "";
}
function fmt(v: number | null | undefined, dec = 2) {
  if (v === undefined || v === null || isNaN(v)) return "--";
  return v.toFixed(dec);
}
function fmtTime(ms: number) {
  if (!ms) return "";
  const d = new Date(ms < 1e12 ? ms * 1000 : ms);
  const now = new Date();
  const diffH = Math.floor((now.getTime() - d.getTime()) / 3600000);
  const diffD = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffH < 1) return "刚刚";
  if (diffH < 24) return `${diffH}小时前`;
  if (diffD < 7) return `${diffD}天前`;
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtDate(ms: number) {
  if (!ms) return "";
  const d = new Date(ms < 1e12 ? ms * 1000 : ms);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── MiniChart (分时图) ─────────────────────────────────────────

function MiniTrendChart({ data, gain }: { data: TrendData; gain: number }) {
  if (!data.points.length) return null;
  const W = 340;
  const H = 100;
  const pad = { t: 6, b: 18, l: 48, r: 8 };
  const prices = data.points.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const times = data.points.map((p) => p.time);
  const minT = times[0];
  const maxT = times[times.length - 1];
  const tRange = maxT - minT || 1;

  const cx = (t: number) => pad.l + ((t - minT) / tRange) * (W - pad.l - pad.r);
  const cy = (p: number) =>
    pad.t + (1 - (p - minP) / range) * (H - pad.t - pad.b);

  const pathD = data.points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${cx(p.time).toFixed(1)},${cy(p.price).toFixed(1)}`,
    )
    .join(" ");

  const fillD =
    pathD +
    ` L${cx(times[times.length - 1]).toFixed(1)},${(H - pad.b).toFixed(1)} L${cx(times[0]).toFixed(1)},${(H - pad.b).toFixed(1)} Z`;

  const color = gain < 0 ? "#09d464" : "#e84444";
  const baseCy = cy(data.basePrice);

  // Y-axis labels
  const yLabels = [maxP, (maxP + minP) / 2, minP];

  // X-axis labels: 09:30 and 15:00
  const xLabels = [
    { t: minT, label: "09:30" },
    { t: maxT, label: "15:00" },
  ];

  return (
    <svg width={W} height={H} className="overflow-visible">
      {/* base price dashed line */}
      <line
        x1={pad.l}
        y1={baseCy}
        x2={W - pad.r}
        y2={baseCy}
        stroke="var(--border-color)"
        strokeWidth={0.8}
        strokeDasharray="3,2"
      />
      {/* fill */}
      <path d={fillD} fill={color} fillOpacity={0.12} />
      {/* line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.2} />
      {/* Y labels */}
      {yLabels.map((v, i) => (
        <text
          key={i}
          x={pad.l - 4}
          y={cy(v) + 3}
          textAnchor="end"
          fontSize={9}
          fill="var(--text-tertiary)"
        >
          {v.toFixed(2)}
        </text>
      ))}
      {/* X labels */}
      {xLabels.map((xl, i) => (
        <text
          key={i}
          x={cx(xl.t)}
          y={H - 2}
          textAnchor={i === 0 ? "start" : "end"}
          fontSize={9}
          fill="var(--text-tertiary)"
        >
          {xl.label}
        </text>
      ))}
    </svg>
  );
}

// ── StockTable ──────────────────────────────────────────────────

function StockTable({ stocks }: { stocks: StockItem[] }) {
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-[var(--text-tertiary)] text-[10px] border-b border-[var(--border-color)]">
          <th className="py-2 px-3 text-left font-normal">股票名称</th>
          <th className="py-2 px-3 text-right font-normal">最新</th>
          <th className="py-2 px-3 text-right font-normal">涨幅</th>
          <th className="py-2 px-3 text-right font-normal">涨跌</th>
        </tr>
      </thead>
      <tbody>
        {stocks.map((s) => (
          <tr
            key={s.code}
            className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)]"
          >
            <td className="py-2 px-3 text-[var(--text-primary)]">{s.name}</td>
            <td className={cn("py-2 px-3 text-right font-mono", pc(s.gain))}>
              {fmt(s.latest)}
            </td>
            <td
              className={cn(
                "py-2 px-3 text-right font-mono font-semibold",
                pc(s.gain),
              )}
            >
              {sgn(s.gain)}
              {fmt(s.gain)}%
            </td>
            <td className={cn("py-2 px-3 text-right font-mono", pc(s.gain))}>
              {s.change != null
                ? `${sgn(s.change || 0)}${fmt(s.change)}`
                : "--"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── NewsGrid ────────────────────────────────────────────────────

function NewsGrid({
  items,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
}: {
  items: NewsItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loading, onLoadMore]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-0">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex gap-3 p-4 border-b border-r border-[var(--border-color)]"
          >
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-[var(--bg-tertiary)] animate-pulse rounded w-full" />
              <div className="h-4 bg-[var(--bg-tertiary)] animate-pulse rounded w-4/5" />
              <div className="h-3 bg-[var(--bg-tertiary)] animate-pulse rounded w-2/3" />
            </div>
            <div className="w-20 h-16 bg-[var(--bg-tertiary)] animate-pulse rounded shrink-0" />
          </div>
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="text-center text-[var(--text-tertiary)] text-[12px] py-8">
        暂无动态
      </div>
    );
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-0">
        {items.map((it) => (
          <a
            key={it.id}
            href={it.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 p-4 border-b border-r border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-[var(--text-primary)] font-medium leading-snug line-clamp-3 mb-2">
                {it.title}
              </div>
              {it.stocks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {it.stocks.slice(0, 2).map((s) => (
                    <span
                      key={s.code}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-[var(--text-tertiary)]">
                {it.source && <span className="mr-2">{it.source}</span>}
                <span>{fmtDate(it.time)}</span>
              </div>
            </div>
            {it.picUrl && (
              <img
                src={it.picUrl}
                alt=""
                className="w-20 h-16 object-cover rounded shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </a>
        ))}
      </div>
      <div ref={bottomRef} className="py-3 flex justify-center">
        {loadingMore && (
          <Loader2
            size={14}
            className="animate-spin text-[var(--text-tertiary)]"
          />
        )}
        {!hasMore && items.length > 0 && (
          <span className="text-[10px] text-[var(--text-tertiary)]">
            已加载全部
          </span>
        )}
      </div>
    </div>
  );
}

// ── HeadlineList (头条无限滚动) ─────────────────────────────────

function HeadlineList() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState("99999999999999999");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (cursor: string, append: boolean) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const r = await fetch(`${API}/api/theme/headline?cursor=${cursor}`);
      const d = await r.json();
      if (append) {
        setItems((prev) => [...prev, ...(d.items ?? [])]);
      } else {
        setItems(d.items ?? []);
      }
      setHasMore(d.hasMore ?? false);
      setNextCursor(d.nextCursor ?? "");
    } catch {}
    if (!append) setLoading(false);
    else setLoadingMore(false);
  }, []);

  useEffect(() => {
    load("99999999999999999", false);
  }, [load]);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !loadingMore &&
          !loading &&
          nextCursor
        ) {
          load(nextCursor, true);
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loading, nextCursor, load]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-0">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex gap-3 p-4 border-b border-r border-[var(--border-color)]"
          >
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-[var(--bg-tertiary)] animate-pulse rounded" />
              <div className="h-4 bg-[var(--bg-tertiary)] animate-pulse rounded w-4/5" />
              <div className="h-3 bg-[var(--bg-tertiary)] animate-pulse rounded w-1/2" />
            </div>
            <div className="w-20 h-16 bg-[var(--bg-tertiary)] animate-pulse rounded shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-0">
        {items.map((it) => (
          <a
            key={it.id}
            href={it.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 p-4 border-b border-r border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-[var(--text-primary)] font-medium leading-snug line-clamp-3 mb-2">
                {it.title}
              </div>
              {it.tag && (
                <div className="mb-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                    {it.tag}
                  </span>
                </div>
              )}
              <div className="text-[10px] text-[var(--text-tertiary)]">
                {it.source && <span className="mr-2">{it.source}</span>}
                <span>{fmtTime(it.time)}</span>
              </div>
            </div>
            {it.picUrl && (
              <img
                src={it.picUrl}
                alt=""
                className="w-20 h-16 object-cover rounded shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </a>
        ))}
      </div>
      <div ref={bottomRef} className="py-3 flex justify-center">
        {loadingMore && (
          <Loader2
            size={14}
            className="animate-spin text-[var(--text-tertiary)]"
          />
        )}
        {!hasMore && items.length > 0 && (
          <span className="text-[10px] text-[var(--text-tertiary)]">
            已加载全部
          </span>
        )}
      </div>
    </div>
  );
}

// ── ThemeNewsPanel (主题新闻/产业图谱，含无限滚动) ─────────────

function ThemeNewsPanel({
  themeId,
  contentTabs,
}: {
  themeId: string;
  contentTabs: ContentTab[];
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [newsMap, setNewsMap] = useState<Record<number, NewsItem[]>>({});
  const [pageMap, setPageMap] = useState<Record<number, number>>({});
  const [loadingMap, setLoadingMap] = useState<Record<number, boolean>>({});
  const [loadingMoreMap, setLoadingMoreMap] = useState<Record<number, boolean>>(
    {},
  );
  const [hasMoreMap, setHasMoreMap] = useState<Record<number, boolean>>({});

  const currentTab = contentTabs[activeTab];

  const loadPage = useCallback(
    async (tabIdx: number, page: number, append: boolean) => {
      const tab = contentTabs[tabIdx];
      if (!tab) return;
      if (!append) setLoadingMap((m) => ({ ...m, [tabIdx]: true }));
      else setLoadingMoreMap((m) => ({ ...m, [tabIdx]: true }));
      try {
        const r = await fetch(
          `${API}/api/theme/${themeId}/news?content_id=${tab.id}&page=${page}&size=15`,
        );
        const d = await r.json();
        setNewsMap((m) => ({
          ...m,
          [tabIdx]: append
            ? [...(m[tabIdx] || []), ...(d.items ?? [])]
            : (d.items ?? []),
        }));
        setHasMoreMap((m) => ({ ...m, [tabIdx]: d.hasMore ?? false }));
        setPageMap((m) => ({ ...m, [tabIdx]: page }));
      } catch {}
      if (!append) setLoadingMap((m) => ({ ...m, [tabIdx]: false }));
      else setLoadingMoreMap((m) => ({ ...m, [tabIdx]: false }));
    },
    [themeId, contentTabs],
  );

  // Load first page when tab becomes active
  useEffect(() => {
    if (newsMap[activeTab] === undefined) {
      loadPage(activeTab, 1, false);
    }
  }, [activeTab, newsMap, loadPage]);

  const handleLoadMore = useCallback(() => {
    const nextPage = (pageMap[activeTab] ?? 1) + 1;
    loadPage(activeTab, nextPage, true);
  }, [activeTab, pageMap, loadPage]);

  if (!contentTabs.length) return null;

  return (
    <div>
      {/* Sub-tab selector */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        {contentTabs.map((tab, idx) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(idx)}
            className={cn(
              "text-[13px] px-3 py-1 rounded-full transition-colors",
              idx === activeTab
                ? "font-semibold text-[#e84444] bg-[#e84444]/10"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-tertiary)]",
            )}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <NewsGrid
        items={newsMap[activeTab] ?? []}
        loading={loadingMap[activeTab] ?? true}
        loadingMore={loadingMoreMap[activeTab] ?? false}
        hasMore={hasMoreMap[activeTab] ?? true}
        onLoadMore={handleLoadMore}
      />
    </div>
  );
}

// ── FlashPanel ─────────────────────────────────────────────────

function FlashPanel({
  activeKey,
  onSwitch,
}: {
  activeKey: string;
  onSwitch: (k: string) => void;
}) {
  const [items, setItems] = useState<FlashItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;

  const fetchPage = useCallback(
    async (cat: string, pg: number, replace: boolean) => {
      if (pg === 1) replace ? setLoading(true) : null;
      else setLoadingMore(true);
      try {
        const r = await fetch(
          `${API}/api/flash?category=${cat}&page=${pg}&page_size=20`,
        );
        const d = await r.json();
        if (activeKeyRef.current !== cat) return;
        if (replace || pg === 1) {
          setItems(d.items ?? []);
        } else {
          setItems((prev) => [...prev, ...(d.items ?? [])]);
        }
        setHasMore(d.hasMore ?? false);
        setSyncing(d.syncing ?? false);
      } catch {}
      if (pg === 1) setLoading(false);
      else setLoadingMore(false);
    },
    [],
  );

  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    setLoading(true);
    fetchPage(activeKey, 1, true);
  }, [activeKey, fetchPage]);

  useEffect(() => {
    if (page <= 1) return;
    fetchPage(activeKey, page, false);
  }, [page, activeKey, fetchPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (
        el.scrollHeight - el.scrollTop - el.clientHeight < 100 &&
        hasMore &&
        !loadingMore &&
        !loading
      ) {
        setPage((p) => p + 1);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMore, loadingMore, loading]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1 shrink-0">
        <span className="text-[14px] font-bold text-[var(--text-primary)]">
          快讯
        </span>
        <span className="text-[9px] font-bold bg-[#e84444] text-white rounded px-1 py-0.5">
          7×24
        </span>
        {syncing && (
          <Loader2
            size={10}
            className="animate-spin text-[var(--text-tertiary)] ml-auto mr-1"
          />
        )}
      </div>
      <div className="flex items-end gap-3 px-3 pb-1.5 border-b border-[var(--border-color)] shrink-0 overflow-x-auto">
        {FLASH_CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => onSwitch(c.key)}
            className={cn(
              "text-[11px] whitespace-nowrap pb-1.5 transition-colors shrink-0",
              activeKey === c.key
                ? "text-[#e84444] border-b-2 border-[#e84444] font-semibold"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-4 p-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2.5 w-10 bg-[var(--bg-tertiary)] animate-pulse rounded" />
                <div className="h-4 w-full bg-[var(--bg-tertiary)] animate-pulse rounded" />
                <div className="h-3 w-4/5 bg-[var(--bg-tertiary)] animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-[var(--text-tertiary)] text-[11px] py-10">
            暂无数据
          </div>
        ) : (
          <>
            <div className="divide-y divide-[var(--border-color)]">
              {items.map((it) => (
                <a
                  key={it.id}
                  href={it.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-3 py-3 hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="text-[10px] text-[var(--text-tertiary)] mb-1">
                    {it.ctime?.slice(11, 16) ?? ""}
                  </div>
                  <div className="text-[12px] text-[var(--text-primary)] font-medium leading-snug line-clamp-2">
                    {it.title}
                  </div>
                  {it.digest && it.digest !== it.title && (
                    <div className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">
                      {it.digest}
                    </div>
                  )}
                </a>
              ))}
            </div>
            {loadingMore && (
              <div className="flex justify-center py-4">
                <Loader2
                  size={14}
                  className="animate-spin text-[var(--text-tertiary)]"
                />
              </div>
            )}
            {!hasMore && items.length > 0 && (
              <div className="text-center text-[10px] text-[var(--text-tertiary)] py-4">
                已加载全部
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function GlobalPage() {
  const [flashCat, setFlashCat] = useState("important");
  const [themes, setThemes] = useState<Theme[]>([]);
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);
  const [themeMeta, setThemeMeta] = useState<ThemeMeta | null>(null);
  const [themeStocks, setThemeStocks] = useState<ThemeStocks | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/api/theme/hot`)
      .then((r) => r.json())
      .then((data: Theme[]) => {
        setThemes(data);
        if (data.length > 0) setActiveTheme(data[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeTheme) return;
    setThemeMeta(null);
    setThemeStocks(null);
    setTrendData(null);
    setStocksLoading(false);
    setTrendLoading(false);

    if (activeTheme.themeId === "headline") return; // 头条无需meta

    setStocksLoading(true);
    setTrendLoading(true);

    fetch(`${API}/api/theme/${activeTheme.themeId}`)
      .then((r) => r.json())
      .then((meta: ThemeMeta) => {
        setThemeMeta(meta);

        if (meta.indexCode) {
          // 股票排行
          fetch(
            `${API}/api/theme/${activeTheme.themeId}/stocks?index_code=${meta.indexCode}`,
          )
            .then((r) => r.json())
            .then((d: ThemeStocks) => {
              setThemeStocks(d);
              setStocksLoading(false);
            })
            .catch(() => setStocksLoading(false));

          // 分时图
          fetch(
            `${API}/api/theme/${activeTheme.themeId}/trend?index_code=${meta.indexCode}`,
          )
            .then((r) => r.json())
            .then((d: TrendData) => {
              setTrendData(d);
              setTrendLoading(false);
            })
            .catch(() => setTrendLoading(false));
        } else {
          setStocksLoading(false);
          setTrendLoading(false);
        }
      })
      .catch(() => {
        setStocksLoading(false);
        setTrendLoading(false);
      });
  }, [activeTheme]);

  const isHeadline = activeTheme?.themeId === "headline";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]">
      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Tab bar */}
          <div
            ref={tabsRef}
            className="flex items-center gap-0 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0 overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {themes.map((t) => (
              <button
                key={t.themeId}
                onClick={() => setActiveTheme(t)}
                className={cn(
                  "px-4 py-3 text-[13px] whitespace-nowrap transition-colors shrink-0",
                  activeTheme?.themeId === t.themeId
                    ? "text-[#e84444] border-b-2 border-[#e84444] font-semibold bg-[var(--bg-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
                )}
              >
                {t.themeName}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {themes.length === 0 && (
              <div className="flex items-center justify-center h-32 text-[var(--text-tertiary)] text-[12px]">
                <Loader2 size={16} className="animate-spin mr-2" />
                加载中…
              </div>
            )}

            {/* 头条 tab */}
            {isHeadline && <HeadlineList />}

            {/* 主题 tab */}
            {!isHeadline && activeTheme && (
              <>
                {/* Header: 分时图 + 股票表 */}
                <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
                  <div className="flex gap-6">
                    {/* Left: 板块名 + 涨跌 + 分时图 */}
                    <div className="flex-1 min-w-0">
                      {themeMeta && (
                        <div className="mb-2">
                          <span className="text-[15px] font-bold text-[var(--text-primary)]">
                            {themeStocks?.blockName ?? themeMeta.title}
                          </span>
                        </div>
                      )}
                      {themeStocks && (
                        <div className="flex items-baseline gap-2 mb-3">
                          <span
                            className={cn(
                              "text-[20px] font-bold font-mono",
                              pc(themeStocks.gain),
                            )}
                          >
                            {fmt(themeStocks.latest, 2)}
                          </span>
                          <span
                            className={cn(
                              "text-[14px] font-mono",
                              pc(themeStocks.gain),
                            )}
                          >
                            {themeStocks.change != null
                              ? `${sgn(themeStocks.change || 0)}${fmt(themeStocks.change, 2)}`
                              : ""}
                          </span>
                          <span
                            className={cn(
                              "text-[14px] font-mono font-semibold",
                              pc(themeStocks.gain),
                            )}
                          >
                            {sgn(themeStocks.gain)}
                            {fmt(themeStocks.gain)}%
                          </span>
                        </div>
                      )}
                      {!themeStocks && stocksLoading && (
                        <div className="h-8 w-40 bg-[var(--bg-tertiary)] animate-pulse rounded mb-3" />
                      )}
                      {/* 分时图 */}
                      {trendLoading && (
                        <div className="h-[100px] w-[340px] bg-[var(--bg-tertiary)] animate-pulse rounded" />
                      )}
                      {trendData && trendData.points.length > 0 && (
                        <MiniTrendChart
                          data={trendData}
                          gain={themeStocks?.gain ?? 0}
                        />
                      )}
                      {!trendData &&
                        !trendLoading &&
                        themeMeta &&
                        !themeMeta.indexCode && (
                          <div className="text-[13px] text-[var(--text-secondary)] line-clamp-2">
                            {themeMeta.content}
                          </div>
                        )}
                    </div>

                    {/* Right: 股票排行表 */}
                    {themeStocks && themeStocks.stocks.length > 0 && (
                      <div className="w-[320px] shrink-0 border border-[var(--border-color)] rounded-lg overflow-hidden">
                        <StockTable stocks={themeStocks.stocks.slice(0, 8)} />
                      </div>
                    )}
                    {stocksLoading && (
                      <div className="w-[320px] shrink-0 h-44 bg-[var(--bg-tertiary)] animate-pulse rounded-lg" />
                    )}
                  </div>
                </div>

                {/* 最新动态 / 产业图谱 tabs + news */}
                {themeMeta && themeMeta.contentTabs.length > 0 && (
                  <ThemeNewsPanel
                    themeId={activeTheme.themeId}
                    contentTabs={themeMeta.contentTabs}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Flash panel */}
        <div className="w-[290px] shrink-0 border-l border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col overflow-hidden">
          <FlashPanel activeKey={flashCat} onSwitch={setFlashCat} />
        </div>
      </div>
    </div>
  );
}
