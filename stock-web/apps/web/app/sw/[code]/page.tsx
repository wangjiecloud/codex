"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { StockChart, generateMockData } from "@/components/stock/StockChart";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

interface BoardDetail {
  code: string;
  name: string;
  level: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  volume: number;
  turnover: number;
  peStatic: number;
  peTtm: number;
  pb: number;
  dividendYield: number;
  compCount: number;
  updatedAt: string | null;
}

interface KLineBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnRate: number;
  changePct: number;
}

interface Constituent {
  code: string;
  name: string;
  price: number;
  changePct: number;
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

type ConsSortKey =
  | "changePct"
  | "price"
  | "turnover"
  | "marketCap"
  | "pe"
  | "pb"
  | "name";

const PERIOD_MAP: Record<string, string> = {
  日K: "daily",
  周K: "weekly",
  月K: "monthly",
};

function pct(v: number) {
  if (v > 0) return "text-[#e84444]";
  if (v < 0) return "text-[#09d464]";
  return "text-[var(--text-secondary)]";
}
function sgn(v: number) {
  return v > 0 ? "+" : "";
}
function fmt(v: number | null | undefined, dec = 2) {
  if (v === undefined || v === null || isNaN(v) || v === 0) return "--";
  return v.toFixed(dec);
}
function fmtNum(v: number) {
  if (!v) return "--";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(0);
}

function SortIcon({
  col,
  active,
  order,
}: {
  col: string;
  active: string;
  order: "asc" | "desc";
}) {
  if (col !== active)
    return (
      <ArrowUpDown size={11} className="text-[var(--text-tertiary)] ml-0.5" />
    );
  return order === "asc" ? (
    <ChevronUp size={11} className="text-[#e8a235] ml-0.5" />
  ) : (
    <ChevronDown size={11} className="text-[#e8a235] ml-0.5" />
  );
}

export default function SwBoardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [klineData, setKlineData] = useState<KLineBar[]>(
    generateMockData(code) as KLineBar[],
  );
  const [constituents, setConstituents] = useState<Constituent[]>([]);
  const [consLoading, setConsLoading] = useState(true);
  const [klineLoading, setKlineLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState("日K");
  const [activeIndicators, setActiveIndicators] = useState([
    "VOL",
    "MACD",
    "KDJ",
  ]);
  const [consSortKey, setConsSortKey] = useState<ConsSortKey>("changePct");
  const [consSortOrder, setConsSortOrder] = useState<"asc" | "desc">("desc");
  const [topHeight, setTopHeight] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/api/sw-industry/detail/${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setBoard(data);
      })
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    const period = PERIOD_MAP[activePeriod] ?? "daily";
    // 日K~120根(约6月)，周K~104根(约2年)，月K~96根(约8年)
    const countMap: Record<string, number> = {
      daily: 120,
      weekly: 104,
      monthly: 96,
    };
    const count = countMap[period] ?? 120;
    setKlineLoading(true);
    fetch(
      `${API}/api/sw-industry/kline/${code}?period=${period}&count=${count}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setKlineData(data);
      })
      .catch(() => {})
      .finally(() => setKlineLoading(false));
  }, [code, activePeriod]);

  useEffect(() => {
    setConsLoading(true);
    fetch(`${API}/api/sw-industry/constituents/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setConstituents(data);
      })
      .catch(() => {})
      .finally(() => setConsLoading(false));
  }, [code]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newHeight = e.clientY - rect.top;
      const minHeight = 200;
      const maxHeight = rect.height - 180;
      setTopHeight(Math.min(Math.max(newHeight, minHeight), maxHeight));
    };

    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const sortedCons = [...constituents].sort((a, b) => {
    if (consSortKey === "name") {
      return consSortOrder === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    }
    const val = (x: Constituent): number => {
      switch (consSortKey) {
        case "changePct":
          return x.changePct;
        case "price":
          return x.price;
        case "turnover":
          return x.turnover;
        case "marketCap":
          return x.marketCap;
        case "pe":
          return x.pe;
        case "pb":
          return x.pb;
        default:
          return 0;
      }
    };
    return consSortOrder === "asc" ? val(a) - val(b) : val(b) - val(a);
  });

  const toggleConSort = (key: ConsSortKey) => {
    if (consSortKey === key) {
      setConsSortOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setConsSortKey(key);
      setConsSortOrder("desc");
    }
  };

  const INDICATORS = ["VOL", "MACD", "KDJ", "RSI", "BOLL"];
  const CON_COLS: { key: ConsSortKey; label: string }[] = [
    { key: "name", label: "股票名称" },
    { key: "changePct", label: "涨跌幅" },
    { key: "price", label: "最新价" },
    { key: "turnover", label: "成交额" },
    { key: "marketCap", label: "市值" },
    { key: "pe", label: "市盈率" },
    { key: "pb", label: "市净率" },
  ];

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-color)] flex-shrink-0">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-[var(--text-primary)]">
            {board?.name ?? code}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">{code}</span>
          {board && (
            <span
              className={cn(
                "text-[13px] font-mono font-semibold",
                pct(board.changePct),
              )}
            >
              {sgn(board.changePct)}
              {board.changePct.toFixed(2)}%
            </span>
          )}
        </div>
        {board && (
          <span className="ml-auto text-[12px] font-mono text-[var(--text-primary)]">
            {board.price.toFixed(2)}
          </span>
        )}
      </div>

      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
        {/* 上半：K线区 */}
        <div
          className="flex-shrink-0 overflow-y-auto"
          style={{ height: topHeight }}
        >
          {/* 行情基本信息 */}
          {board && (
            <div className="flex items-center gap-5 px-5 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  今开
                </span>
                <span className="text-[12px] font-mono text-[var(--text-primary)]">
                  {fmt(board.open)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  昨收
                </span>
                <span className="text-[12px] font-mono text-[var(--text-primary)]">
                  {fmt(board.prevClose)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  最高
                </span>
                <span className="text-[12px] font-mono text-[#e84444]">
                  {fmt(board.high)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  最低
                </span>
                <span className="text-[12px] font-mono text-[#09d464]">
                  {fmt(board.low)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  成交额
                </span>
                <span className="text-[12px] font-mono text-[var(--text-primary)]">
                  {fmtNum(board.turnover)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  PE(TTM)
                </span>
                <span className="text-[12px] font-mono text-[var(--text-primary)]">
                  {fmt(board.peTtm, 1)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  市净率
                </span>
                <span className="text-[12px] font-mono text-[var(--text-primary)]">
                  {fmt(board.pb)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  成分股
                </span>
                <span className="text-[12px] font-mono text-[var(--text-primary)]">
                  {board.compCount}
                </span>
              </div>
            </div>
          )}

          {/* 周期切换 + 指标 */}
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[var(--border-color)]">
            <div className="flex gap-1">
              {Object.keys(PERIOD_MAP).map((p) => (
                <button
                  key={p}
                  onClick={() => setActivePeriod(p)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] transition-colors",
                    activePeriod === p
                      ? "bg-[var(--accent)] text-black font-medium"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="w-px h-3 bg-[var(--border-color)] mx-1" />
            <div className="flex gap-1">
              {INDICATORS.map((ind) => (
                <button
                  key={ind}
                  onClick={() =>
                    setActiveIndicators((prev) =>
                      prev.includes(ind)
                        ? prev.filter((i) => i !== ind)
                        : [...prev, ind],
                    )
                  }
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] transition-colors",
                    activeIndicators.includes(ind)
                      ? "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {ind}
                </button>
              ))}
            </div>
            {klineLoading && (
              <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                加载中...
              </span>
            )}
            {!klineLoading && klineData.length > 0 && (
              <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                {klineData[klineData.length - 1].time}
              </span>
            )}
          </div>

          {/* K线图 */}
          <div className="overflow-hidden">
            <StockChart
              data={klineData}
              activeIndicators={activeIndicators}
              activeMAs={[5, 10, 20, 60]}
            />
          </div>
        </div>

        {/* 拖拽分隔条 */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          className={cn(
            "h-1 flex-shrink-0 bg-[var(--border-color)] hover:bg-[var(--accent)]/40 cursor-row-resize transition-colors relative group",
            isResizing && "bg-[var(--accent)]/60",
          )}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-0.5 bg-[var(--text-tertiary)] group-hover:bg-[var(--accent)] transition-colors rounded-full" />
          </div>
        </div>

        {/* 下半：成分股列表 */}
        <div className="flex-1 flex flex-col overflow-hidden border-t border-[var(--border-color)]">
          <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              成分股
            </span>
            {!consLoading && (
              <span className="text-xs text-[var(--text-tertiary)]">
                · {sortedCons.length} 只
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
                <tr>
                  <td className="px-3 py-2 text-[var(--text-tertiary)] w-6 text-center">
                    #
                  </td>
                  {CON_COLS.map((col) => (
                    <th
                      key={col.key}
                      className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium cursor-pointer hover:text-[var(--text-primary)] whitespace-nowrap select-none"
                      onClick={() => toggleConSort(col.key)}
                    >
                      <span className="inline-flex items-center">
                        {col.label}
                        <SortIcon
                          col={col.key}
                          active={consSortKey}
                          order={consSortOrder}
                        />
                      </span>
                    </th>
                  ))}
                  <td className="px-3 py-2 text-[var(--text-tertiary)]">
                    操作
                  </td>
                </tr>
              </thead>
              <tbody>
                {consLoading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: CON_COLS.length + 2 }).map(
                        (_, j) => (
                          <td key={j} className="px-3 py-2">
                            <div className="h-3 bg-[var(--bg-tertiary)] rounded animate-pulse w-14" />
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                {!consLoading &&
                  sortedCons.map((s, idx) => (
                    <tr
                      key={s.code}
                      className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-3 py-1.5 text-center text-[var(--text-tertiary)]">
                        {idx + 1}
                      </td>
                      <td
                        className="px-3 py-1.5 cursor-pointer"
                        onClick={() =>
                          window.open(`/stock/${s.code}`, "_blank")
                        }
                      >
                        <div className="font-medium text-[var(--text-primary)] hover:underline">
                          {s.name}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">
                          {s.code}
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 font-mono font-semibold",
                          pct(s.changePct),
                        )}
                      >
                        {sgn(s.changePct)}
                        {fmt(s.changePct)}%
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[var(--text-primary)]">
                        {fmt(s.price)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                        {fmtNum(s.turnover)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                        {fmtNum(s.marketCap)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                        {fmt(s.pe, 1)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                        {fmt(s.pb, 2)}
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          onClick={() =>
                            window.open(`/stock/${s.code}`, "_blank")
                          }
                          className="text-[10px] text-[#3b82f6] hover:underline whitespace-nowrap"
                        >
                          详情↗
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
