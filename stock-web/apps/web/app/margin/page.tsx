"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

const API_BASE = "http://localhost:8000";

interface HistoryRow {
  tradeDate: string;
  marginBalance: number | null;
  rzBalance: number | null;
  rqBalance: number | null;
  rzBuy: number | null;
  rzRepay: number | null;
}

interface LatestData {
  date: string | null;
  total: {
    marginBalance: number | null;
    rzBalance: number | null;
    rqBalance: number | null;
    rzBuy: number | null;
    rzRepay: number | null;
  } | null;
  sh: {
    rzBalance: number | null;
    rzBuy: number | null;
    rqBalance: number | null;
    marginBalance: number | null;
  } | null;
  sz: {
    rzBalance: number | null;
    rzBuy: number | null;
    rqBalance: number | null;
    marginBalance: number | null;
  } | null;
  bj: {
    rzBalance: number | null;
    rzBuy: number | null;
    rqBalance: number | null;
    marginBalance: number | null;
  } | null;
}

interface TableRow {
  tradeDate: string;
  sh: {
    rzBalance: number | null;
    rzBuy: number | null;
    rqBalance: number | null;
    marginBalance: number | null;
  };
  sz: {
    rzBalance: number | null;
    rzBuy: number | null;
    rqBalance: number | null;
    marginBalance: number | null;
  };
  bj: {
    rzBalance: number | null;
    rzBuy: number | null;
    rqBalance: number | null;
    marginBalance: number | null;
  };
  total: {
    rzBalance: number | null;
    rzBuy: number | null;
    rqBalance: number | null;
    marginBalance: number | null;
  };
}

interface StockSnapshotRow {
  code: string;
  name: string;
  rzBalance: number | null;
  rzBuy: number | null;
  rzRepay: number | null;
  rzNet: number | null;
  rqQty: number | null;
  rqSell: number | null;
  rqBalance: number | null;
  marginBalance: number | null;
}

interface StockHistoryRow {
  tradeDate: string;
  rzBalance: number | null;
  rzBuy: number | null;
  rzRepay: number | null;
  rzNet: number | null;
  rzBalanceRatio: number | null;
  rqQty: number | null;
  rqSell: number | null;
  rqNet: number | null;
  marginBalance: number | null;
}

interface SearchResult {
  code: string;
  name: string;
}

type ChartMetric =
  | "marginBalance"
  | "rzBuy"
  | "rzRepay"
  | "rzBalance"
  | "rqBalance";
type StockMetric = "rzBalance" | "rzBuy" | "rzNet" | "rqQty" | "marginBalance";

const METRIC_LABELS: Record<ChartMetric, string> = {
  marginBalance: "融资融券余额",
  rzBuy: "融资买入",
  rzRepay: "融资偿还",
  rzBalance: "融资余额",
  rqBalance: "融券余额",
};

const STOCK_METRIC_LABELS: Record<StockMetric, string> = {
  rzBalance: "融资余额",
  rzBuy: "融资买入",
  rzNet: "融资净买入",
  rqQty: "融券余量",
  marginBalance: "融资融券余额",
};

const METRICS: ChartMetric[] = [
  "marginBalance",
  "rzBuy",
  "rzRepay",
  "rzBalance",
  "rqBalance",
];
const STOCK_METRICS: StockMetric[] = [
  "rzBalance",
  "rzBuy",
  "rzNet",
  "rqQty",
  "marginBalance",
];

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return "--";
  return v.toFixed(decimals);
}

interface TooltipState {
  x: number;
  y: number;
  date: string;
  value: number;
  label: string;
  visible: boolean;
}

function MiniSvgChart({
  data,
  metric,
  metricLabel,
  color = "#e84c4c",
  unit = "亿",
}: {
  data: HistoryRow[] | StockHistoryRow[];
  metric: string;
  metricLabel: string;
  color?: string;
  unit?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    x: 0,
    y: 0,
    date: "",
    value: 0,
    label: "",
    visible: false,
  });

  const values = data
    .map(
      (r) => (r as unknown as Record<string, unknown>)[metric] as number | null,
    )
    .filter((v): v is number => v != null);
  if (values.length < 2) return <div className="w-full h-full" />;

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const rawRange = maxV - minV || 1;
  const pad = rawRange * 0.08;
  const domainMin = minV - pad;
  const domainMax = maxV + pad;
  const range = domainMax - domainMin;

  const W = 900;
  const H = 220;
  const PAD = { top: 24, bottom: 36, left: 72, right: 24 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const toX = (i: number) => PAD.left + (i / (values.length - 1)) * innerW;
  const toY = (v: number) => PAD.top + (1 - (v - domainMin) / range) * innerH;

  const pts = values.map((v, i): [number, number] => [toX(i), toY(v)]);

  const smoothPath = pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x},${y}`;
      const [px, py] = pts[i - 1];
      const cpx = (px + x) / 2;
      return `C${cpx},${py} ${cpx},${y} ${x},${y}`;
    })
    .join(" ");

  const areaPath = `${smoothPath} L${pts[pts.length - 1][0]},${H - PAD.bottom} L${pts[0][0]},${H - PAD.bottom} Z`;

  const tickCount = 6;
  const rawStep = rawRange / (tickCount - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep = Math.ceil(rawStep / magnitude) * magnitude || magnitude;
  const niceStart = Math.floor(minV / niceStep) * niceStep;
  const yTicks: number[] = [];
  for (let v = niceStart; v <= maxV + niceStep; v += niceStep) {
    if (v >= domainMin && v <= domainMax) yTicks.push(v);
  }

  const showEvery = Math.max(1, Math.ceil(values.length / 8));
  const xTickIdxs = values
    .map((_, i) => i)
    .filter((i) => i % showEvery === 0 || i === values.length - 1);

  const gradId = `grad-${metric}`;
  const glowId = `glow-${metric}`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const fraction = (relX - PAD.left) / innerW;
    const idx = Math.min(
      Math.max(Math.round(fraction * (values.length - 1)), 0),
      values.length - 1,
    );
    const val = values[idx];
    const dateRaw = (data[idx] as unknown as Record<string, unknown>)[
      "tradeDate"
    ] as string;
    setTooltip({
      x: pts[idx][0],
      y: pts[idx][1],
      date: dateRaw,
      value: val,
      label: metricLabel,
      visible: true,
    });
  };

  const handleMouseLeave = () => setTooltip((t) => ({ ...t, visible: false }));

  const tooltipW = 148;
  const tooltipH = 56;
  const tx =
    tooltip.x + tooltipW + 12 > W - PAD.right
      ? tooltip.x - tooltipW - 12
      : tooltip.x + 12;
  const ty =
    tooltip.y - tooltipH - 10 < PAD.top
      ? tooltip.y + 10
      : tooltip.y - tooltipH - 10;

  const fmtTick = (v: number) => {
    if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1) + "万";
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    if (Math.abs(v) >= 100) return v.toFixed(1);
    return v.toFixed(2);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full cursor-crosshair"
      preserveAspectRatio="xMidYMid meet"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="60%" stopColor={color} stopOpacity="0.06" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        x={PAD.left}
        y={PAD.top}
        width={innerW}
        height={innerH}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.06"
        strokeWidth="0.5"
      />

      {yTicks.map((v, i) => {
        const y = toY(v);
        return (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={v === 0 ? 0.25 : 0.08}
              strokeWidth={v === 0 ? 0.8 : 0.5}
              strokeDasharray={v === 0 ? undefined : "4,4"}
            />
            <text
              x={PAD.left - 8}
              y={y + 4}
              fontSize="11"
              fill="currentColor"
              fillOpacity="0.55"
              textAnchor="end"
              fontFamily="monospace"
            >
              {fmtTick(v)}
              {unit}
            </text>
          </g>
        );
      })}

      {xTickIdxs.map((idx) => {
        const x = pts[idx][0];
        const dateStr =
          (data[idx] as unknown as Record<string, unknown>)?.["tradeDate"]
            ?.toString()
            ?.slice(5) ?? "";
        return (
          <text
            key={idx}
            x={x}
            y={H - 8}
            fontSize="10"
            fill="currentColor"
            fillOpacity="0.45"
            textAnchor="middle"
          >
            {dateStr}
          </text>
        );
      })}

      <path d={areaPath} fill={`url(#${gradId})`} />

      <path
        d={smoothPath}
        fill="none"
        stroke={color}
        strokeOpacity="0.25"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={smoothPath}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      />

      {tooltip.visible && (
        <>
          <line
            x1={tooltip.x}
            x2={tooltip.x}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke={color}
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="4,3"
          />
          <circle
            cx={tooltip.x}
            cy={tooltip.y}
            r="5"
            fill={color}
            fillOpacity="0.2"
            stroke={color}
            strokeWidth="0"
          />
          <circle
            cx={tooltip.x}
            cy={tooltip.y}
            r="3.5"
            fill={color}
            stroke="white"
            strokeWidth="1.5"
          />
          <rect
            x={tx}
            y={ty}
            width={tooltipW}
            height={tooltipH}
            rx="6"
            fill="var(--bg-primary)"
            stroke={color}
            strokeOpacity="0.45"
            strokeWidth="1"
          />
          <rect
            x={tx}
            y={ty}
            width={tooltipW}
            height="20"
            rx="6"
            fill={color}
            fillOpacity="0.1"
          />
          <rect
            x={tx}
            y={ty + 14}
            width={tooltipW}
            height="6"
            fill={color}
            fillOpacity="0.1"
          />
          <text
            x={tx + 10}
            y={ty + 13}
            fontSize="10"
            fill="currentColor"
            fillOpacity="0.6"
          >
            {tooltip.date}
          </text>
          <text
            x={tx + 10}
            y={ty + 39}
            fontSize="14"
            fill={color}
            fontWeight="bold"
          >
            {tooltip.value.toFixed(2)}
            {unit}
          </text>
        </>
      )}
    </svg>
  );
}

function CircleCard({
  value,
  label,
  active,
  onClick,
}: {
  value: number | null | undefined;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const r = 58;
  const cx = 75;
  const cy = 75;
  const circumference = 2 * Math.PI * r;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 cursor-pointer transition-opacity",
        onClick ? "hover:opacity-80" : "cursor-default",
      )}
    >
      <div className="relative w-[150px] h-[150px]">
        <svg viewBox="0 0 150 150" className="w-full h-full -rotate-90">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={active ? "#e84c4c" : "#e5e5e5"}
            strokeOpacity={active ? 1 : 0.3}
            strokeWidth="6"
            strokeDasharray={`${circumference * 0.85} ${circumference * 0.15}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "text-xl font-bold leading-tight",
              active ? "text-[#e84c4c]" : "text-[var(--text-primary)]",
            )}
          >
            {fmt(value)}亿
          </span>
          <span className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {label}
          </span>
        </div>
      </div>
    </button>
  );
}

function StockDetailTab({
  code,
  name,
  onClose,
}: {
  code: string;
  name: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<
    "loading" | "syncing" | "done" | "error"
  >("loading");
  const [historyRows, setHistoryRows] = useState<StockHistoryRow[]>([]);
  const [activeMetric, setActiveMetric] = useState<StockMetric>("rzBalance");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAndLoad = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/margin-trading/stock/${code}/status`,
      );
      const data = await res.json();

      if (data.status === "done" && data.rowCount > 0) {
        const histRes = await fetch(
          `${API_BASE}/api/margin-trading/stock/${code}/history?limit=200`,
        );
        const rows = await histRes.json();
        setHistoryRows(Array.isArray(rows) ? rows : []);
        setStatus("done");
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }

      if (data.status === "none" || data.status === "pending") {
        await fetch(`${API_BASE}/api/margin-trading/stock/${code}/trigger`, {
          method: "POST",
        });
        setStatus("syncing");
      } else if (data.status === "syncing") {
        setStatus("syncing");
      } else if (data.status === "failed") {
        setStatus("error");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {
      setStatus("error");
    }
  }, [code]);

  useEffect(() => {
    checkAndLoad();
    pollRef.current = setInterval(checkAndLoad, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkAndLoad]);

  const metricUnit: Record<StockMetric, string> = {
    rzBalance: "亿",
    rzBuy: "亿",
    rzNet: "亿",
    rqQty: "万股",
    marginBalance: "亿",
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <span className="font-bold text-base text-[var(--text-primary)]">
          {name}
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">{code}</span>
        <button
          onClick={onClose}
          className="ml-auto text-xs text-[var(--text-tertiary)] hover:text-[#e84c4c] px-2 py-0.5 rounded border border-[var(--border-color)]"
        >
          关闭
        </button>
      </div>

      {status === "loading" && (
        <div className="py-12 text-center text-[var(--text-tertiary)] text-sm">
          加载中...
        </div>
      )}
      {status === "syncing" && (
        <div className="py-12 text-center space-y-2">
          <div className="text-sm text-[var(--text-secondary)]">
            后台更新中，请稍候...
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            正在从同花顺获取 {name}（{code}）的融资融券历史数据
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="py-12 text-center text-red-400 text-sm">
          数据获取失败，请稍后重试
        </div>
      )}

      {status === "done" && historyRows.length > 0 && (
        <>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
            <div className="flex flex-wrap gap-2 mb-3">
              {STOCK_METRICS.map((m) => (
                <button
                  key={m}
                  onClick={() => setActiveMetric(m)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                    activeMetric === m
                      ? "bg-[#e84c4c] text-white"
                      : "bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#e84c4c] hover:text-[#e84c4c]",
                  )}
                >
                  {STOCK_METRIC_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="h-[220px]">
              <MiniSvgChart
                data={historyRows}
                metric={activeMetric}
                metricLabel={STOCK_METRIC_LABELS[activeMetric]}
                color="#e84c4c"
                unit={metricUnit[activeMetric]}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
            <div className="flex items-center px-4 py-2 bg-[#1e3a6e]">
              <span className="text-white font-semibold text-xs">
                历史数据（共 {historyRows.length} 条）
              </span>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                  <tr>
                    {[
                      "日期",
                      "融资余额(亿)",
                      "融资买入(亿)",
                      "融资偿还(亿)",
                      "融资净买入(亿)",
                      "余额占比(%)",
                      "融券余量(万股)",
                      "融券卖出(万股)",
                      "融券净卖出(万股)",
                      "融资融券余额(亿)",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-2 py-1.5 border border-[var(--border-color)] font-medium text-center whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...historyRows].reverse().map((row, idx) => (
                    <tr
                      key={row.tradeDate}
                      className={cn(
                        "hover:bg-[var(--bg-tertiary)]",
                        idx % 2 === 0
                          ? "bg-[var(--bg-secondary)]"
                          : "bg-[var(--bg-primary)]",
                      )}
                    >
                      <td className="px-2 py-1.5 border border-[var(--border-color)] text-center whitespace-nowrap">
                        {row.tradeDate}
                      </td>
                      <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                        {fmt(row.rzBalance)}
                      </td>
                      <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                        {fmt(row.rzBuy)}
                      </td>
                      <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                        {fmt(row.rzRepay)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 border border-[var(--border-color)] text-right font-medium",
                          row.rzNet != null && row.rzNet > 0
                            ? "text-[#e84c4c]"
                            : row.rzNet != null && row.rzNet < 0
                              ? "text-green-500"
                              : "",
                        )}
                      >
                        {fmt(row.rzNet)}
                      </td>
                      <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                        {fmt(row.rzBalanceRatio)}
                      </td>
                      <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                        {fmt(row.rqQty)}
                      </td>
                      <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                        {fmt(row.rqSell)}
                      </td>
                      <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                        {fmt(row.rqNet)}
                      </td>
                      <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                        {fmt(row.marginBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface StockTab {
  code: string;
  name: string;
}

export default function MarginTradingPage() {
  const [activeMetric, setActiveMetric] =
    useState<ChartMetric>("marginBalance");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [latest, setLatest] = useState<LatestData | null>(null);
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [noData, setNoData] = useState(false);

  const [tablePage, setTablePage] = useState(1);
  const TABLE_PAGE_SIZE = 10;

  const [stockRows, setStockRows] = useState<StockSnapshotRow[]>([]);
  const [stockTotal, setStockTotal] = useState(0);
  const [stockDate, setStockDate] = useState<string | null>(null);
  const [stockPage, setStockPage] = useState(1);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockSortBy, setStockSortBy] = useState("rz_net");
  const STOCK_PAGE_SIZE = 50;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tabs, setTabs] = useState<StockTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("market");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [histRes, latestRes, tableRes] = await Promise.all([
          fetch(
            `${API_BASE}/api/margin-trading/history?market=total&limit=120`,
          ),
          fetch(`${API_BASE}/api/margin-trading/latest`),
          fetch(`${API_BASE}/api/margin-trading/table?limit=60`),
        ]);
        const [hist, lat, tbl] = await Promise.all([
          histRes.json(),
          latestRes.json(),
          tableRes.json(),
        ]);
        setHistory(Array.isArray(hist) ? hist : []);
        setLatest(lat);
        setTableRows(Array.isArray(tbl) ? tbl : []);
        if (!Array.isArray(hist) || hist.length === 0) setNoData(true);
      } catch {
        setNoData(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const loadStockPage = useCallback(async (page: number, sortBy: string) => {
    setStockLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/margin-trading/stocks?page=${page}&page_size=${STOCK_PAGE_SIZE}&sort_by=${sortBy}`,
      );
      const data = await res.json();
      setStockRows(Array.isArray(data.rows) ? data.rows : []);
      setStockTotal(data.total || 0);
      setStockDate(data.date || null);
    } catch {
      setStockRows([]);
    } finally {
      setStockLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStockPage(1, "rz_net");
  }, [loadStockPage]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSearchInput = (v: string) => {
    setSearchQuery(v);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!v.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/search?q=${encodeURIComponent(v)}&limit=10`,
        );
        const data = await res.json();
        const results = Array.isArray(data)
          ? data.map((d: { code: string; name: string }) => ({
              code: d.code,
              name: d.name,
            }))
          : Array.isArray(data.results)
            ? data.results.map((d: { code: string; name: string }) => ({
                code: d.code,
                name: d.name,
              }))
            : [];
        setSearchResults(results);
        setSearchOpen(results.length > 0);
      } catch {
        setSearchResults([]);
      }
    }, 300);
  };

  const openStockTab = (code: string, name: string) => {
    setSearchQuery("");
    setSearchOpen(false);
    if (!tabs.find((t) => t.code === code)) {
      setTabs((prev) => [...prev, { code, name }]);
    }
    setActiveTab(code);
  };

  const closeTab = (code: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.code !== code);
      if (activeTab === code) {
        setActiveTab(next.length > 0 ? next[next.length - 1].code : "market");
      }
      return next;
    });
  };

  const stockTotalPages = Math.ceil(stockTotal / STOCK_PAGE_SIZE);
  const tableTotalPages = Math.ceil(tableRows.length / TABLE_PAGE_SIZE);
  const pagedTableRows = tableRows.slice(
    (tablePage - 1) * TABLE_PAGE_SIZE,
    tablePage * TABLE_PAGE_SIZE,
  );

  const total = latest?.total;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-0 px-4 pt-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <button
          onClick={() => setActiveTab("market")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "market"
              ? "border-[#e84c4c] text-[#e84c4c]"
              : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
        >
          市场总览
        </button>
        {tabs.map((tab) => (
          <div
            key={tab.code}
            className={cn(
              "flex items-center gap-1 px-3 py-2 border-b-2 cursor-pointer text-sm transition-colors",
              activeTab === tab.code
                ? "border-[#e84c4c] text-[#e84c4c]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
            onClick={() => setActiveTab(tab.code)}
          >
            <span>{tab.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.code);
              }}
              className="w-4 h-4 rounded-full text-xs flex items-center justify-center hover:bg-[var(--bg-tertiary)]"
            >
              ×
            </button>
          </div>
        ))}

        <div ref={searchRef} className="ml-auto relative mb-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="搜索股票代码/名称..."
            className="w-48 px-3 py-1 text-xs rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[#e84c4c]"
          />
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-lg z-50 max-h-60 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={r.code}
                  onClick={() => openStockTab(r.code, r.name)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--bg-tertiary)] text-left"
                >
                  <span className="text-[var(--text-tertiary)] w-14 shrink-0">
                    {r.code}
                  </span>
                  <span className="text-[var(--text-primary)]">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab !== "market" ? (
          <StockDetailTab
            code={activeTab}
            name={tabs.find((t) => t.code === activeTab)?.name ?? activeTab}
            onClose={() => closeTab(activeTab)}
          />
        ) : (
          <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-[var(--text-primary)]">
                融资融券
              </h1>
              <span className="text-xs text-[var(--text-tertiary)]">
                {latest?.date ? `最新数据：${latest.date}` : "数据来源：同花顺"}
              </span>
            </div>

            {noData && !loading && (
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-8 text-center">
                <p className="text-[var(--text-secondary)] mb-2">暂无数据</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  请在系统监控页面手动触发「融资融券数据」任务完成首次同步
                </p>
              </div>
            )}

            {!noData && (
              <>
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {METRICS.map((m) => (
                      <button
                        key={m}
                        onClick={() => setActiveMetric(m)}
                        className={cn(
                          "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                          activeMetric === m
                            ? "bg-[#e84c4c] text-white"
                            : "bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#e84c4c] hover:text-[#e84c4c]",
                        )}
                      >
                        {METRIC_LABELS[m]}
                      </button>
                    ))}
                  </div>
                  {loading ? (
                    <div className="h-[220px] flex items-center justify-center text-[var(--text-tertiary)] text-sm">
                      加载中...
                    </div>
                  ) : (
                    <div className="h-[220px]">
                      <MiniSvgChart
                        data={history}
                        metric={activeMetric}
                        metricLabel={METRIC_LABELS[activeMetric]}
                        color="#e84c4c"
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
                  <div className="flex flex-wrap justify-around gap-4">
                    <CircleCard
                      value={total?.marginBalance}
                      label="融资融券余额"
                      active={activeMetric === "marginBalance"}
                      onClick={() => setActiveMetric("marginBalance")}
                    />
                    <CircleCard
                      value={total?.rzBuy}
                      label="融资买入"
                      active={activeMetric === "rzBuy"}
                      onClick={() => setActiveMetric("rzBuy")}
                    />
                    <CircleCard
                      value={total?.rzRepay}
                      label="融资偿还"
                      active={activeMetric === "rzRepay"}
                      onClick={() => setActiveMetric("rzRepay")}
                    />
                    <CircleCard
                      value={total?.rzBalance}
                      label="融资余额"
                      active={activeMetric === "rzBalance"}
                      onClick={() => setActiveMetric("rzBalance")}
                    />
                    <CircleCard
                      value={total?.rqBalance}
                      label="融券余额"
                      active={activeMetric === "rqBalance"}
                      onClick={() => setActiveMetric("rqBalance")}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-[#1e3a6e]">
                    <span className="text-white font-semibold text-sm">
                      ⊞ 融资融券历史数据
                    </span>
                    <span className="text-xs text-blue-200 ml-1">
                      共 {tableRows.length} 条
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                          <th
                            rowSpan={2}
                            className="px-3 py-2 border border-[var(--border-color)] font-medium"
                          >
                            交易日期
                          </th>
                          <th
                            colSpan={4}
                            className="px-3 py-2 border border-[var(--border-color)] font-medium text-center"
                          >
                            本日融资余额(亿元)
                          </th>
                          <th
                            colSpan={4}
                            className="px-3 py-2 border border-[var(--border-color)] font-medium text-center"
                          >
                            本日融资买入额(亿元)
                          </th>
                          <th
                            colSpan={4}
                            className="px-3 py-2 border border-[var(--border-color)] font-medium text-center"
                          >
                            本日融券余量余额(亿元)
                          </th>
                          <th
                            colSpan={4}
                            className="px-3 py-2 border border-[var(--border-color)] font-medium text-center"
                          >
                            本日融资融券余额(亿元)
                          </th>
                        </tr>
                        <tr className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                          {[
                            "上海",
                            "深圳",
                            "北京",
                            "合计",
                            "上海",
                            "深圳",
                            "北京",
                            "合计",
                            "上海",
                            "深圳",
                            "北京",
                            "合计",
                            "上海",
                            "深圳",
                            "北京",
                            "合计",
                          ].map((m, i) => (
                            <th
                              key={i}
                              className="px-2 py-1.5 border border-[var(--border-color)] font-medium text-center"
                            >
                              {m}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td
                              colSpan={17}
                              className="py-8 text-center text-[var(--text-tertiary)]"
                            >
                              加载中...
                            </td>
                          </tr>
                        ) : tableRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={17}
                              className="py-8 text-center text-[var(--text-tertiary)]"
                            >
                              暂无历史数据
                            </td>
                          </tr>
                        ) : (
                          pagedTableRows.map((row, idx) => (
                            <tr
                              key={row.tradeDate}
                              className={cn(
                                "hover:bg-[var(--bg-tertiary)] transition-colors",
                                idx % 2 === 0
                                  ? "bg-[var(--bg-secondary)]"
                                  : "bg-[var(--bg-primary)]",
                              )}
                            >
                              <td className="px-3 py-2 border border-[var(--border-color)] text-[var(--text-secondary)] whitespace-nowrap">
                                {row.tradeDate.replace(/-/g, "–")}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.sh.rzBalance)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.sz.rzBalance)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.bj.rzBalance)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right font-medium">
                                {fmt(row.total.rzBalance)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.sh.rzBuy)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.sz.rzBuy)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.bj.rzBuy)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right font-medium">
                                {fmt(row.total.rzBuy)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.sh.rqBalance)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.sz.rqBalance)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.bj.rqBalance)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right font-medium">
                                {fmt(row.total.rqBalance)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.sh.marginBalance)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.sz.marginBalance)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right">
                                {fmt(row.bj.marginBalance)}
                              </td>
                              <td className="px-2 py-2 border border-[var(--border-color)] text-right font-medium">
                                {fmt(row.total.marginBalance)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {tableTotalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 p-3 border-t border-[var(--border-color)]">
                      <button
                        disabled={tablePage <= 1}
                        onClick={() => setTablePage((p) => p - 1)}
                        className="px-3 py-1 text-xs rounded border border-[var(--border-color)] disabled:opacity-40 hover:border-[#e84c4c] transition-colors"
                      >
                        上一页
                      </button>
                      {Array.from({ length: tableTotalPages }, (_, i) => i + 1)
                        .filter(
                          (p) =>
                            p === 1 ||
                            p === tableTotalPages ||
                            Math.abs(p - tablePage) <= 2,
                        )
                        .reduce<(number | "...")[]>((acc, p, i, arr) => {
                          if (i > 0 && p - (arr[i - 1] as number) > 1)
                            acc.push("...");
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) =>
                          p === "..." ? (
                            <span
                              key={`ellipsis-${i}`}
                              className="text-xs text-[var(--text-tertiary)] px-1"
                            >
                              …
                            </span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setTablePage(p as number)}
                              className={cn(
                                "w-7 h-7 text-xs rounded transition-colors",
                                tablePage === p
                                  ? "bg-[#e84c4c] text-white font-medium"
                                  : "border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#e84c4c]",
                              )}
                            >
                              {p}
                            </button>
                          ),
                        )}
                      <button
                        disabled={tablePage >= tableTotalPages}
                        onClick={() => setTablePage((p) => p + 1)}
                        className="px-3 py-1 text-xs rounded border border-[var(--border-color)] disabled:opacity-40 hover:border-[#e84c4c] transition-colors"
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-[#1e3a6e]">
                    <span className="text-white font-semibold text-sm">
                      ⊞ 个股融资融券一览
                    </span>
                    {stockDate && (
                      <span className="text-xs text-blue-200">{stockDate}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-blue-200">排序：</span>
                      {[
                        { key: "rz_net", label: "融资净买入" },
                        { key: "rz_balance", label: "融资余额" },
                        { key: "margin_balance", label: "融资融券余额" },
                      ].map((s) => (
                        <button
                          key={s.key}
                          onClick={() => {
                            setStockSortBy(s.key);
                            setStockPage(1);
                            loadStockPage(1, s.key);
                          }}
                          className={cn(
                            "px-2 py-0.5 rounded text-xs transition-colors",
                            stockSortBy === s.key
                              ? "bg-white text-[#1e3a6e] font-medium"
                              : "text-blue-200 hover:text-white",
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                          {[
                            "序号",
                            "代码",
                            "名称",
                            "融资余额(亿)",
                            "融资买入(亿)",
                            "融资偿还(亿)",
                            "融资净买入(亿)",
                            "融券余量(万股)",
                            "融券卖出(万股)",
                            "融券余额(亿)",
                            "融资融券余额(亿)",
                            "详情",
                          ].map((h) => (
                            <th
                              key={h}
                              className="px-2 py-2 border border-[var(--border-color)] font-medium text-center whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stockLoading ? (
                          <tr>
                            <td
                              colSpan={12}
                              className="py-8 text-center text-[var(--text-tertiary)]"
                            >
                              加载中...
                            </td>
                          </tr>
                        ) : stockRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={12}
                              className="py-8 text-center text-[var(--text-tertiary)]"
                            >
                              暂无数据，请先触发个股一览同步任务
                            </td>
                          </tr>
                        ) : (
                          stockRows.map((row, idx) => (
                            <tr
                              key={row.code}
                              className={cn(
                                "hover:bg-[var(--bg-tertiary)] transition-colors",
                                idx % 2 === 0
                                  ? "bg-[var(--bg-secondary)]"
                                  : "bg-[var(--bg-primary)]",
                              )}
                            >
                              <td className="px-2 py-1.5 border border-[var(--border-color)] text-center text-[var(--text-tertiary)]">
                                {(stockPage - 1) * STOCK_PAGE_SIZE + idx + 1}
                              </td>
                              <td className="px-2 py-1.5 border border-[var(--border-color)] text-center font-mono text-[var(--text-secondary)]">
                                {row.code}
                              </td>
                              <td className="px-2 py-1.5 border border-[var(--border-color)] text-center text-[var(--text-primary)]">
                                {row.name}
                              </td>
                              <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                                {fmt(row.rzBalance)}
                              </td>
                              <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                                {fmt(row.rzBuy)}
                              </td>
                              <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                                {fmt(row.rzRepay)}
                              </td>
                              <td
                                className={cn(
                                  "px-2 py-1.5 border border-[var(--border-color)] text-right font-medium",
                                  row.rzNet != null && row.rzNet > 0
                                    ? "text-[#e84c4c]"
                                    : row.rzNet != null && row.rzNet < 0
                                      ? "text-green-500"
                                      : "",
                                )}
                              >
                                {fmt(row.rzNet)}
                              </td>
                              <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                                {fmt(row.rqQty)}
                              </td>
                              <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                                {fmt(row.rqSell)}
                              </td>
                              <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                                {fmt(row.rqBalance)}
                              </td>
                              <td className="px-2 py-1.5 border border-[var(--border-color)] text-right">
                                {fmt(row.marginBalance)}
                              </td>
                              <td className="px-2 py-1.5 border border-[var(--border-color)] text-center">
                                <button
                                  onClick={() =>
                                    openStockTab(row.code, row.name)
                                  }
                                  className="text-[#e84c4c] hover:underline text-xs"
                                >
                                  历史
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {stockTotalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 p-3 border-t border-[var(--border-color)]">
                      <button
                        disabled={stockPage <= 1}
                        onClick={() => {
                          const p = stockPage - 1;
                          setStockPage(p);
                          loadStockPage(p, stockSortBy);
                        }}
                        className="px-3 py-1 text-xs rounded border border-[var(--border-color)] disabled:opacity-40 hover:border-[#e84c4c]"
                      >
                        上一页
                      </button>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {stockPage} / {stockTotalPages}（共 {stockTotal} 条）
                      </span>
                      <button
                        disabled={stockPage >= stockTotalPages}
                        onClick={() => {
                          const p = stockPage + 1;
                          setStockPage(p);
                          loadStockPage(p, stockSortBy);
                        }}
                        className="px-3 py-1 text-xs rounded border border-[var(--border-color)] disabled:opacity-40 hover:border-[#e84c4c]"
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
