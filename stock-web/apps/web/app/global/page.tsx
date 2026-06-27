"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronRight, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

interface CnIndex {
  code: string;
  name: string;
  price: number;
  changePct: number;
  changeAmt: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

interface TrendPoint {
  time: string;
  price: number;
  preClose: number;
}

interface Overview {
  todayTurnover: number;
  prevTurnover: number;
}

interface FlashItem {
  id: string;
  title: string;
  digest: string;
  url: string;
  ctime: string;
}

interface BoardItem {
  code: string;
  name: string;
  changePct: number;
  leadStock: string;
  leadStockPct: number;
}

interface GlobalIndex {
  code: string;
  name: string;
  region: string;
  price: number;
  changePct: number;
  changeAmt: number;
  high: number;
  low: number;
  prevClose: number;
  marketTime: string;
}

const FLASH_CATS = [
  { key: "a", label: "A股" },
  { key: "important", label: "重要" },
  { key: "notice", label: "公告" },
  { key: "futures", label: "期货" },
  { key: "abnormal", label: "异动" },
  { key: "hk", label: "港股" },
  { key: "us", label: "美股" },
];

const REGION_ORDER = ["cn", "us", "eu", "asia", "other"];
const REGION_LABELS: Record<string, string> = {
  cn: "港股",
  us: "美股",
  eu: "欧洲",
  asia: "亚太",
  other: "大宗商品",
};
const CN_FEATURED = ["000001", "399001", "399006", "000688", "000300"];

function pc(v: number) {
  if (v > 0) return "text-[#e84444]";
  if (v < 0) return "text-[#09d464]";
  return "text-[var(--text-secondary)]";
}
function pbg(v: number) {
  if (v > 0) return "bg-[#e84444]/8 border-[#e84444]/20";
  if (v < 0) return "bg-[#09d464]/8 border-[#09d464]/20";
  return "bg-[var(--bg-tertiary)] border-[var(--border-color)]";
}
function fmt(v: number, dec = 2) {
  if (v === undefined || v === null || isNaN(v)) return "--";
  if (v >= 10000)
    return v.toLocaleString("zh-CN", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  return v.toFixed(dec);
}
function fmtTo(v: number) {
  if (!v) return "--";
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "万亿";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  return v.toFixed(0);
}
function sgn(v: number) {
  return v >= 0 ? "+" : "";
}

function SparkLine({
  data,
  preClose,
}: {
  data: TrendPoint[];
  preClose: number;
}) {
  const W = 340;
  const H = 80;
  if (!data.length)
    return (
      <div
        style={{ width: W, height: H }}
        className="bg-[var(--bg-deep)] rounded opacity-30"
      />
    );

  const prices = data.map((d) => d.price);
  const allVals = [...prices, preClose];
  const minP = Math.min(...allVals) * 0.9997;
  const maxP = Math.max(...allVals) * 1.0003;
  const range = maxP - minP || 1;
  const tx = (_: TrendPoint, i: number) =>
    (i / Math.max(data.length - 1, 1)) * W;
  const ty = (p: number) => H - ((p - minP) / range) * (H - 6) - 3;

  const pts = data.map((d, i) => `${tx(d, i)},${ty(d.price)}`).join(" ");
  const fill = `0,${H} ` + pts + ` ${W},${H}`;
  const lastP = prices[prices.length - 1];
  const col = lastP >= preClose ? "#e84444" : "#09d464";
  const preY = ty(preClose);
  const lastX = tx(data[data.length - 1], data.length - 1);
  const lastY = ty(lastP);

  return (
    <svg width={W} height={H} className="overflow-visible">
      <line
        x1={0}
        y1={preY}
        x2={W}
        y2={preY}
        stroke="var(--border-color)"
        strokeWidth={0.6}
        strokeDasharray="4,3"
      />
      <polygon points={fill} fill={col} fillOpacity={0.1} />
      <polyline
        points={pts}
        fill="none"
        stroke={col}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={col} />
      <rect
        x={lastX - 22}
        y={lastY - 14}
        width={44}
        height={12}
        rx={2}
        fill={col}
        fillOpacity={0.85}
      />
      <text
        x={lastX}
        y={lastY - 5}
        fontSize={8.5}
        fill="#fff"
        textAnchor="middle"
        fontFamily="monospace"
      >
        {fmt(lastP)}
      </text>
    </svg>
  );
}

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

function GlobalTable({ rows }: { rows: GlobalIndex[] }) {
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="bg-[var(--bg-secondary)] text-[var(--text-tertiary)] text-[10px]">
          <th className="px-3 py-1.5 text-left font-normal">名称</th>
          <th className="px-3 py-1.5 text-right font-normal">最新价</th>
          <th className="px-3 py-1.5 text-right font-normal">涨跌额</th>
          <th className="px-3 py-1.5 text-right font-normal">涨跌幅</th>
          <th className="px-3 py-1.5 text-right font-normal hidden lg:table-cell">
            最高
          </th>
          <th className="px-3 py-1.5 text-right font-normal hidden lg:table-cell">
            最低
          </th>
          <th className="px-3 py-1.5 text-right font-normal hidden xl:table-cell">
            昨收
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.code}
            className="border-t border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <td className="px-3 py-2">
              <div className="text-[12px] font-medium text-[var(--text-primary)]">
                {r.name}
              </div>
              <div className="text-[9px] text-[var(--text-tertiary)]">
                {r.code}
              </div>
            </td>
            <td
              className={cn(
                "px-3 py-2 text-right font-mono font-bold text-[12px]",
                pc(r.changePct),
              )}
            >
              {fmt(r.price)}
            </td>
            <td
              className={cn(
                "px-3 py-2 text-right font-mono text-[11px]",
                pc(r.changePct),
              )}
            >
              {sgn(r.changeAmt)}
              {fmt(r.changeAmt)}
            </td>
            <td
              className={cn(
                "px-3 py-2 text-right font-mono text-[11px]",
                pc(r.changePct),
              )}
            >
              {sgn(r.changePct)}
              {fmt(r.changePct)}%
            </td>
            <td className="px-3 py-2 text-right font-mono text-[11px] text-[var(--text-tertiary)] hidden lg:table-cell">
              {fmt(r.high)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-[11px] text-[var(--text-tertiary)] hidden lg:table-cell">
              {fmt(r.low)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-[11px] text-[var(--text-tertiary)] hidden xl:table-cell">
              {fmt(r.prevClose)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function GlobalPage() {
  const [cnIndices, setCnIndices] = useState<CnIndex[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [flashCat, setFlashCat] = useState("a");
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [globalIndices, setGlobalIndices] = useState<GlobalIndex[]>([]);
  const [syncing, setSyncing] = useState(false);
  const hasSynced = useRef(false);

  const fetchCore = useCallback(async () => {
    const [cnRes, trendRes, ovRes, boardRes, globalRes] =
      await Promise.allSettled([
        fetch(`${API}/api/global/cn_indices`).then((r) => r.json()),
        fetch(`${API}/api/global/sh_trend`).then((r) => r.json()),
        fetch(`${API}/api/global/overview`).then((r) => r.json()),
        fetch(`${API}/api/board?limit=30`).then((r) => r.json()),
        fetch(`${API}/api/global/indices`).then((r) => r.json()),
      ]);
    if (cnRes.status === "fulfilled") setCnIndices(cnRes.value);
    if (trendRes.status === "fulfilled") setTrendData(trendRes.value);
    if (ovRes.status === "fulfilled") setOverview(ovRes.value);
    if (boardRes.status === "fulfilled") setBoards(boardRes.value);
    if (globalRes.status === "fulfilled") setGlobalIndices(globalRes.value);
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    await Promise.allSettled([
      fetch(`${API}/api/global/sync`, { method: "POST" }),
      fetch(`${API}/api/flash/sync`, { method: "POST" }),
      fetch(`${API}/api/board/sync`, { method: "POST" }),
    ]);
    await new Promise((r) => setTimeout(r, 4500));
    await fetchCore();
    setSyncing(false);
  }, [fetchCore]);

  useEffect(() => {
    fetchCore();
    if (!hasSynced.current) {
      hasSynced.current = true;
      triggerSync();
    }
    const id = setInterval(fetchCore, 30000);
    return () => clearInterval(id);
  }, [fetchCore, triggerSync]);

  const shIndex = cnIndices.find((c) => c.code === "000001");
  const byRegion = REGION_ORDER.reduce<Record<string, GlobalIndex[]>>(
    (acc, reg) => {
      acc[reg] = globalIndices.filter(
        (g) => g.region === reg && !CN_FEATURED.includes(g.code),
      );
      return acc;
    },
    {},
  );
  const cnGlobal = globalIndices.filter((g) => CN_FEATURED.includes(g.code));

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          全球市场
        </span>
        <button
          onClick={triggerSync}
          disabled={syncing}
          className={cn(
            "flex items-center gap-1 text-[10px] px-2.5 py-1 rounded border transition-colors",
            syncing
              ? "border-[var(--border-color)] text-[var(--text-tertiary)]"
              : "border-[#f5a623]/40 text-[#f5a623] hover:bg-[#f5a623]/10",
          )}
        >
          <RefreshCw size={10} className={syncing ? "animate-spin" : ""} />
          {syncing ? "同步中…" : "刷新"}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 主内容区 */}
        <div className="flex-1 overflow-y-auto min-w-0">
          {/* 区块1：A股指数 + 分时图 + 成交额 */}
          <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
            <div className="flex">
              <div className="flex-1 min-w-0 px-4 pt-3 pb-4">
                {cnIndices.length > 0 ? (
                  <>
                    <div className="flex items-start gap-4 flex-wrap mb-3">
                      {cnIndices.map((idx) => (
                        <div key={idx.code} className="flex flex-col">
                          <span className="text-[11px] text-[var(--text-tertiary)]">
                            {idx.name}
                          </span>
                          <span
                            className={cn(
                              "text-[18px] font-bold font-mono leading-tight",
                              pc(idx.changePct),
                            )}
                          >
                            {sgn(idx.changePct)}
                            {fmt(idx.changePct)}%
                          </span>
                        </div>
                      ))}
                      <button className="ml-auto mt-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                        <ChevronRight size={14} />
                      </button>
                    </div>

                    {shIndex && (
                      <div className="flex gap-4 text-[10px] text-[var(--text-tertiary)] font-mono mb-3">
                        <span>
                          最新{" "}
                          <span className={pc(shIndex.changePct)}>
                            {fmt(shIndex.price)}
                          </span>
                        </span>
                        <span>最高 {fmt(shIndex.high)}</span>
                        <span>最低 {fmt(shIndex.low)}</span>
                        <span>
                          成交额 {fmtTo(overview?.todayTurnover ?? 0)}
                        </span>
                      </div>
                    )}

                    {trendData.length > 0 && shIndex && (
                      <div>
                        <SparkLine
                          data={trendData}
                          preClose={shIndex.prevClose}
                        />
                        <div className="flex justify-between text-[9px] text-[var(--text-tertiary)] mt-1 px-0.5">
                          <span>09:30</span>
                          <span>11:30</span>
                          <span>15:00</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-28 flex items-center justify-center text-[var(--text-tertiary)] text-[11px] animate-pulse">
                    加载中…
                  </div>
                )}
              </div>

              {overview && (
                <div className="border-l border-[var(--border-color)] px-4 py-3 min-w-[155px] flex flex-col gap-3 shrink-0">
                  <div>
                    <div className="text-[10px] text-[var(--text-tertiary)] mb-0.5">
                      今日实时成交额
                    </div>
                    <div className="text-[22px] font-bold text-[var(--text-primary)] leading-tight">
                      {fmtTo(overview.todayTurnover)}
                    </div>
                    <div
                      className={cn(
                        "text-[10px] mt-0.5",
                        overview.todayTurnover - overview.prevTurnover >= 0
                          ? "text-[#e84444]"
                          : "text-[#09d464]",
                      )}
                    >
                      {(() => {
                        const diff =
                          overview.todayTurnover - overview.prevTurnover;
                        return `较上一日 ${diff >= 0 ? "+" : "-"}${fmtTo(Math.abs(diff))}`;
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 区块2：概念板块热词 */}
          {boards.length > 0 && (
            <div className="border-b border-[var(--border-color)] px-4 py-2.5 bg-[var(--bg-secondary)]">
              <div className="flex flex-wrap gap-2">
                {boards.slice(0, 24).map((b) => (
                  <span
                    key={b.code}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border",
                      pbg(b.changePct),
                    )}
                  >
                    <span className="text-[var(--text-primary)]">{b.name}</span>
                    <span className={pc(b.changePct)}>
                      {sgn(b.changePct)}
                      {fmt(b.changePct)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 区块3：全球指数表 */}
          <div className="p-4 space-y-5">
            {cnGlobal.length > 0 && (
              <section>
                <div className="text-[11px] font-semibold text-[var(--text-tertiary)] mb-2">
                  中国 A 股
                </div>
                <div className="rounded-lg border border-[var(--border-color)] overflow-hidden">
                  <GlobalTable rows={cnGlobal} />
                </div>
              </section>
            )}

            {REGION_ORDER.map((region) => {
              const rows = byRegion[region] ?? [];
              if (!rows.length) return null;
              const label = region === "cn" ? "港股" : REGION_LABELS[region];
              return (
                <section key={region}>
                  <div className="text-[11px] font-semibold text-[var(--text-tertiary)] mb-2">
                    {label}
                  </div>
                  <div className="rounded-lg border border-[var(--border-color)] overflow-hidden">
                    <GlobalTable rows={rows} />
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/* 右侧快讯 */}
        <div className="w-[290px] shrink-0 border-l border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col overflow-hidden">
          <FlashPanel activeKey={flashCat} onSwitch={setFlashCat} />
        </div>
      </div>
    </div>
  );
}
