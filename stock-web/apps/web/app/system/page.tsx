"use client";

import { useState, useEffect, useRef } from "react";
import {
  Activity,
  Database,
  RefreshCw,
  Play,
  Pause,
  Trash2,
  Download,
  CheckCircle,
  TrendingUp,
  Loader2,
  Zap,
  StopCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SystemStats {
  totalStocks: number;
  totalData: number;
  dataByType?: {
    quote: number;
    fundamental: number;
    stock_info: number;
    kline: number;
  };
  stocksByDataType?: {
    quote: number;
    fundamental: number;
    stock_info: number;
    kline: number;
  };
  categories: {
    announcement: number;
    research: number;
    news: number;
  };
  recentUpdates: Array<{
    code: string;
    name?: string;
    count: number;
    updatedAt: string;
  }>;
  quoteLastSync?: string | null;
  fundamentalLastSync?: string | null;
  klineLastSync?: string | null;
  stockInfoLastSync?: string | null;
}

interface LogEntry {
  time: string;
  level: "info" | "success" | "error" | "warning";
  message: string;
}

interface FlashCatStat {
  key: string;
  label: string;
  count: number;
  latestCtime: string | null;
  lastSync: string | null;
  syncing: boolean;
}

interface ThemeNewsStat {
  themeId: string;
  themeName: string;
  count: number;
  latestPubTime: string | null;
  lastSync: string | null;
}

interface GubaStat {
  newsCount: number;
  noticeCount: number;
  stockCount: number;
  lastSync: string | null;
  syncing: boolean;
}

// ── Inline 变体（嵌入分组卡片，无外层边框） ──────────────────────────────

function SwIndustryMonitorInline({
  onTaskClick,
}: {
  onTaskClick?: (taskId: string) => void;
}) {
  const [boardCount, setBoardCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch("http://localhost:8000/api/sw-industry");
        if (r.ok) {
          const d = await r.json();
          setBoardCount(d.length);
          if (d[0]?.updatedAt) setLastSync(d[0].updatedAt);
        }
      } catch {}
    };
    fetch_();
  }, []);
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp size={12} className="text-[#e8a235]" />
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          申万行业板块
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
          每交易日
        </span>
      </div>
      <div className="flex gap-4">
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            板块数量
          </div>
          <button
            onClick={() => onTaskClick?.("daily_klines_incremental")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {boardCount || "--"}
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            最近同步
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {lastSync
              ? new Date(lastSync)
                  .toLocaleString("zh-CN", { hour12: false })
                  .slice(5)
              : "--"}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConceptBoardMonitorInline({
  onTaskClick,
}: {
  onTaskClick?: (taskId: string) => void;
}) {
  const [count, setCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch("http://localhost:8000/api/board");
        if (r.ok) {
          const d = await r.json();
          const boards = Array.isArray(d) ? d : d.boards || [];
          setCount(boards.length);
          const times = boards
            .map(
              (b: { updatedAt?: string; updated_at?: string }) =>
                b.updatedAt || b.updated_at,
            )
            .filter(Boolean) as string[];
          if (times.length > 0) setLastSync(times.sort().reverse()[0]);
        }
      } catch {}
    };
    fetch_();
  }, []);
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Database size={12} className="text-[#8b5cf6]" />
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          概念板块
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
          每日 19:00
        </span>
      </div>
      <div className="flex gap-4">
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            板块数量
          </div>
          <button
            onClick={() => onTaskClick?.("concept_board_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {count || "--"}
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            最近同步
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {lastSync
              ? new Date(lastSync)
                  .toLocaleString("zh-CN", { hour12: false })
                  .slice(5)
              : "--"}
          </div>
        </div>
      </div>
    </div>
  );
}

function FundFlowMonitorInline({
  onTaskClick,
}: {
  onTaskClick?: (taskId: string) => void;
}) {
  const [dates, setDates] = useState<string[]>([]);
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch("http://localhost:8000/api/fund-flow/dates");
        if (r.ok) {
          const d = await r.json();
          setDates((d["10d"] || []).slice().sort());
        }
      } catch {}
    };
    fetch_();
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const hasTodaySnapshot = dates.includes(today);
  const latestDate = dates.length > 0 ? dates[dates.length - 1] : null;
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp size={12} className="text-[#22c55e]" />
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          资金流向快照
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
          每日 16:00
        </span>
      </div>
      <div className="flex gap-4">
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            累计天数
          </div>
          <button
            onClick={() => onTaskClick?.("fund_flow_snapshot")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {dates.length || "--"}
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">今日</div>
          <div
            className={cn(
              "text-xs font-medium",
              hasTodaySnapshot ? "text-green-400" : "text-yellow-400",
            )}
          >
            {hasTodaySnapshot ? "✅ 已快照" : "⚠️ 待快照"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">最新</div>
          <div className="text-xs text-[var(--text-secondary)]">
            {latestDate || "--"}
          </div>
        </div>
      </div>
    </div>
  );
}

function GlobalIndexMonitorInline({
  onTaskClick,
}: {
  onTaskClick?: (taskId: string) => void;
}) {
  const [indexCount, setIndexCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch("http://localhost:8000/api/global/indices");
        if (r.ok) {
          const d = await r.json();
          setIndexCount(Array.isArray(d) ? d.length : 0);
          // 找出最近更新的时间
          if (Array.isArray(d) && d.length > 0) {
            const times = d
              .map((item: { updatedAt?: string }) => item.updatedAt)
              .filter(Boolean) as string[];
            if (times.length > 0) {
              setLastSync(times.sort().reverse()[0]);
            }
          }
        }
      } catch {}
    };
    fetch_();
  }, []);
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Activity size={12} className="text-[#f59e0b]" />
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          全球指数
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
          每日 17:00/18:00
        </span>
      </div>
      <div className="flex gap-4">
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            指数数量
          </div>
          <button
            onClick={() => onTaskClick?.("global_index_snapshot_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {indexCount > 0 ? indexCount : "--"}
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            最近同步
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {lastSync
              ? new Date(lastSync)
                  .toLocaleString("zh-CN", { hour12: false })
                  .slice(5)
              : "--"}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeNewsMonitorInline({
  onTaskClick,
}: {
  onTaskClick?: (taskId: string) => void;
}) {
  const [total, setTotal] = useState(0);
  const [themeCount, setThemeCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch("http://localhost:8000/api/theme/news-stats");
        if (r.ok) {
          const d = await r.json();
          setTotal(d.total || 0);
          setThemeCount((d.themes || []).length);
          const times = (d.themes || [])
            .map((t: ThemeNewsStat) => t.lastSync)
            .filter(Boolean);
          if (times.length > 0) setLastSync(times.sort().reverse()[0]);
        }
      } catch {}
    };
    fetch_();
    const t = setInterval(fetch_, 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Zap size={12} className="text-green-400" />
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          板块新闻
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
          每 15 分钟
        </span>
      </div>
      <div className="flex gap-4">
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">总新闻</div>
          <button
            onClick={() => onTaskClick?.("theme_news_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {total > 0 ? total.toLocaleString() : "--"}
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            已收录板块
          </div>
          <button
            onClick={() => onTaskClick?.("theme_news_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {themeCount || "--"}
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            最近同步
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {lastSync
              ? new Date(lastSync)
                  .toLocaleString("zh-CN", { hour12: false })
                  .slice(5)
              : "--"}
          </div>
        </div>
      </div>
    </div>
  );
}

function GubaMonitorInline({
  onTaskClick,
}: {
  onTaskClick?: (taskId: string) => void;
}) {
  const [stat, setStat] = useState<GubaStat>({
    newsCount: 0,
    noticeCount: 0,
    stockCount: 0,
    lastSync: null,
    syncing: false,
  });
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch("http://localhost:8000/api/guba/stats/summary");
        if (r.ok) setStat(await r.json());
      } catch {}
    };
    fetch_();
    const t = setInterval(fetch_, 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Activity size={12} className="text-orange-400" />
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          股吧资讯与公告
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
          每日 19:30
        </span>
      </div>
      <div className="flex gap-4">
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">资讯</div>
          <button
            onClick={() => onTaskClick?.("guba_daily_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {stat.newsCount > 0 ? stat.newsCount.toLocaleString() : "--"}
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">公告</div>
          <button
            onClick={() => onTaskClick?.("guba_daily_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {stat.noticeCount > 0 ? stat.noticeCount.toLocaleString() : "--"}
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            覆盖股票
          </div>
          <button
            onClick={() => onTaskClick?.("guba_daily_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {stat.stockCount || "--"}
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            最近同步
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {stat.lastSync
              ? new Date(stat.lastSync)
                  .toLocaleString("zh-CN", { hour12: false })
                  .slice(5)
              : "--"}
          </div>
        </div>
      </div>
    </div>
  );
}

function MinuteSyncMonitorInline({
  onTaskClick,
}: {
  onTaskClick?: (taskId: string) => void;
}) {
  const [stats, setStats] = useState<{
    industry_total: number;
    covered_codes: number;
    latest_date: string;
    latest_covered: number;
    distinct_dates: number;
    total_bars: number;
    sync_status: {
      running: boolean;
      total: number;
      done: number;
      ok: number;
      cached: number;
      error: number;
      current: string;
      trade_date: string;
      finished_at: string | null;
    };
  } | null>(null);
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch("/api/minute/stats");
        if (r.ok) setStats(await r.json());
      } catch {}
    };
    fetch_();
    const t = setInterval(fetch_, 30000);
    return () => clearInterval(t);
  }, []);
  const s = stats?.sync_status;
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp size={12} className="text-[#3b82f6]" />
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          产业链分时
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
          每日 19:05
        </span>
      </div>
      <div className="flex gap-4 flex-wrap">
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            产业链股票
          </div>
          <button
            onClick={() => onTaskClick?.("minute_daily_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {stats?.industry_total ?? "--"}
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            今日已同步
          </div>
          <button
            onClick={() => onTaskClick?.("minute_daily_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {stats?.latest_covered ?? "--"}
            <span className="text-[10px] text-[var(--text-tertiary)] ml-1">
              {stats?.latest_date}
            </span>
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            历史天数
          </div>
          <button
            onClick={() => onTaskClick?.("minute_daily_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {stats?.distinct_dates ?? "--"}
          </button>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">总Bar数</div>
          <button
            onClick={() => onTaskClick?.("minute_daily_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {stats ? stats.total_bars.toLocaleString() : "--"}
          </button>
        </div>
        {s?.finished_at && (
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)]">
              完成时间
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              {new Date(s.finished_at + "Z")
                .toLocaleString("zh-CN", { hour12: false })
                .slice(5)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function F10MonitorInline({
  onTaskClick,
}: {
  onTaskClick?: (taskId: string) => void;
}) {
  const [syncedCount, setSyncedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const isReportingSeason = () =>
    [1, 2, 3, 4, 8, 10, 11].includes(new Date().getMonth() + 1);
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch("http://localhost:8000/api/system/stats");
        if (r.ok) {
          const d = await r.json();
          setSyncedCount(d.stocksByDataType?.fundamental ?? 0);
          setTotalCount(d.totalStocks ?? 0);
          setLastSync(d.fundamentalLastSync ?? null);
        }
      } catch {}
    };
    fetch_();
    const t = setInterval(fetch_, 30000);
    return () => clearInterval(t);
  }, []);
  const reporting = isReportingSeason();
  const monthName = new Date().getMonth() + 1;
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Database size={12} className="text-[#8b5cf6]" />
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          F10 财务数据
        </span>
        <span
          className={cn(
            "ml-auto text-[10px] px-1.5 py-0.5 rounded",
            reporting
              ? "bg-orange-500/10 text-orange-400"
              : "text-[var(--text-tertiary)]",
          )}
        >
          {reporting ? `⚠️ 财报季 ${monthName}月` : `每周日 02:00`}
        </span>
      </div>
      <div className="flex gap-4 flex-wrap">
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            已同步股票
          </div>
          <button
            onClick={() => onTaskClick?.("weekly_fundamental_sync")}
            className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
          >
            {syncedCount > 0 ? syncedCount.toLocaleString() : "--"}
          </button>
        </div>
        {totalCount > 0 && (
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)]">
              覆盖率
            </div>
            <button
              onClick={() => onTaskClick?.("weekly_fundamental_sync")}
              className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
            >
              {((syncedCount / totalCount) * 100).toFixed(1)}%
            </button>
          </div>
        )}
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            最近同步
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {lastSync
              ? new Date(lastSync + "Z").toLocaleString("zh-CN", {
                  hour12: false,
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "--"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 任务状态总览 ───────────────────────────────────────────────────────────
interface TaskInfo {
  id: string;
  name: string;
  nextRun: string | null;
  trigger: string;
  lastRun?: string | null;
}

// 任务触发结果
interface TaskResult {
  status: "ok" | "error" | "triggered";
  msg?: string;
}

// 任务ID → 中文标签（模块级，供 handleTrigger 和模板共用）
const TASK_LABELS_MAP: Record<string, string> = {
  daily_sync: "每日全量同步",
  guba_daily_sync: "股吧资讯同步",
  minute_daily_sync: "产业链分时",
  fund_flow_snapshot: "资金流向快照",
  global_index_snapshot_sync: "全球指数快照",
  global_index_kline_sync: "全球指数K线",
  indices_minute_daily_sync: "宽基指数分时",
  news_flash_sync: "快讯同步",
  theme_news_sync: "板块新闻",
  daily_cleanup: "数据清理",
  concept_board_sync: "概念板块同步",
  daily_klines_incremental: "K线增量同步",
  weekly_fundamental_sync: "F10财务（周日低频）",
  market_breadth_daily_sync: "市场情绪·涨跌统计",
  wal_checkpoint: "WAL合并清理",
  market_daily_fund_flow_sync: "大盘资金流向历史",
};

// 直接调用同步接口（而非 trigger-task）的任务映射
const DIRECT_SYNC_URLS: Record<string, string> = {
  market_breadth_daily_sync: "http://localhost:8000/api/market-breadth/sync",
  fund_flow_snapshot: "http://localhost:8000/api/fund-flow/snapshot",
};

// 支持「补历史」的任务及其接口
const BACKFILL_URL = "http://localhost:8000/api/market-breadth/backfill";
const BACKFILL_PROGRESS_URL =
  "http://localhost:8000/api/market-breadth/backfill/progress";
const BACKFILL_TASK_IDS = new Set(["market_breadth_daily_sync"]);

interface BackfillProgress {
  running: boolean;
  done: number;
  total: number;
  last_date: string;
  errors: string[];
}

function TaskStatusTable({
  onLog,
  highlightId,
}: {
  onLog?: (
    level: "info" | "success" | "error" | "warning",
    msg: string,
  ) => void;
  highlightId?: string | null;
}) {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [taskResults, setTaskResults] = useState<Record<string, TaskResult>>(
    {},
  );
  // 每个任务的行内进度：{ done, total, running, phase? }
  const [taskProgress, setTaskProgress] = useState<
    Record<
      string,
      { done: number; total: number; running: boolean; phase?: string }
    >
  >({});
  const taskPollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>(
    {},
  );

  const [backfillDays, setBackfillDays] = useState(60);
  const [backfillProgress, setBackfillProgress] =
    useState<BackfillProgress | null>(null);
  const backfillPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 启动针对 daily_sync 的进度轮询（走 /api/sync/status）
  const startSyncStatusPoll = (taskId: string, label: string) => {
    if (taskPollRefs.current[taskId]) return;
    taskPollRefs.current[taskId] = setInterval(async () => {
      try {
        const r = await fetch("http://localhost:8000/api/sync/status");
        if (!r.ok) return;
        const data = await r.json();
        if (!data.running) {
          setTaskProgress((prev) => {
            const next = { ...prev };
            delete next[taskId];
            return next;
          });
          clearInterval(taskPollRefs.current[taskId]);
          delete taskPollRefs.current[taskId];
          onLog?.(
            "success",
            `[完成] ${label} done=${data.done} total=${data.total}`,
          );
          setTaskResults((prev) => ({
            ...prev,
            [taskId]: { status: "ok", msg: `完成 ${data.done}/${data.total}` },
          }));
        } else {
          setTaskProgress((prev) => ({
            ...prev,
            [taskId]: {
              running: true,
              done: data.done ?? 0,
              total: data.total ?? 0,
              phase: data.phase,
            },
          }));
        }
      } catch {
        clearInterval(taskPollRefs.current[taskId]);
        delete taskPollRefs.current[taskId];
      }
    }, 2000);
  };

  // 其他任务：只标记 running，完成后清除（无进度接口，靠 scheduler-logs 通知结果）
  const startGenericRunningMark = (taskId: string) => {
    setTaskProgress((prev) => ({
      ...prev,
      [taskId]: { running: true, done: 0, total: 0 },
    }));
    // 30 秒后自动清除 running 标记（兜底，避免永久显示）
    setTimeout(() => {
      setTaskProgress((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    }, 30000);
  };

  // 轮询补历史进度
  const startBackfillPoll = () => {
    if (backfillPollRef.current) return;
    backfillPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(BACKFILL_PROGRESS_URL);
        const data: BackfillProgress = await r.json();
        setBackfillProgress(data);
        if (!data.running) {
          clearInterval(backfillPollRef.current!);
          backfillPollRef.current = null;
        }
      } catch {
        clearInterval(backfillPollRef.current!);
        backfillPollRef.current = null;
      }
    }, 1500);
  };

  const handleBackfill = async () => {
    try {
      const r = await fetch(`${BACKFILL_URL}?days=${backfillDays}`, {
        method: "POST",
      });
      const data = await r.json();
      if (data.status === "started" || data.status === "already_running") {
        setBackfillProgress(
          data.progress ?? {
            running: true,
            done: 0,
            total: backfillDays,
            last_date: "",
            errors: [],
          },
        );
        startBackfillPoll();
      }
    } catch (e) {
      alert("启动失败: " + String(e));
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const r = await fetch("http://localhost:8000/api/system/task-status");
      if (r.ok) {
        const data = await r.json();
        setTasks(data.tasks || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleTrigger = async (taskId: string, force?: boolean) => {
    const triggerKey = force ? `${taskId}__force` : taskId;
    setTriggering(triggerKey);
    setTaskResults((prev) => ({
      ...prev,
      [taskId]: {
        status: "triggered",
        msg: force ? "强制全量执行中…" : "执行中…",
      },
    }));
    try {
      const directUrl = DIRECT_SYNC_URLS[taskId];
      const label = TASK_LABELS_MAP[taskId] || taskId;
      if (directUrl && !force) {
        onLog?.("info", `[触发] ${label} 开始执行…`);
        const r = await fetch(directUrl, { method: "POST" });
        const data = await r.json();
        if (data.status === "ok") {
          const detail =
            data.up_count != null
              ? `涨${data.up_count} 跌${data.down_count} 涨停${data.limit_up} 跌停${data.limit_down}`
              : data.msg || "同步成功";
          setTaskResults((prev) => ({
            ...prev,
            [taskId]: { status: "ok", msg: detail },
          }));
          onLog?.("success", `[完成] ${label}: ${detail}`);
        } else {
          const errMsg = data.msg || data.detail || "失败";
          setTaskResults((prev) => ({
            ...prev,
            [taskId]: { status: "error", msg: errMsg },
          }));
          onLog?.("error", `[失败] ${label}: ${errMsg}`);
        }
      } else {
        const forceParam = force ? "?force=true" : "";
        onLog?.(
          "info",
          `[触发] ${label}${force ? "（强制全量）" : ""} 已提交，后台执行中…`,
        );
        const r = await fetch(
          `http://localhost:8000/api/system/trigger-task/${taskId}${forceParam}`,
          { method: "POST" },
        );
        const data = await r.json();
        if (data.status === "triggered") {
          setTaskResults((prev) => ({
            ...prev,
            [taskId]: {
              status: "ok",
              msg: force ? "已触发强制全量，后台执行中" : "已触发，后台执行中",
            },
          }));
          onLog?.("success", `[触发成功] ${label} 已加入调度队列`);
          // daily_sync 有进度接口，轮询；其他任务只标 running
          if (taskId === "daily_sync") {
            startSyncStatusPoll(taskId, label);
          } else {
            startGenericRunningMark(taskId);
          }
        } else {
          const errMsg = data.message || "触发失败";
          setTaskResults((prev) => ({
            ...prev,
            [taskId]: { status: "error", msg: errMsg },
          }));
          onLog?.("error", `[触发失败] ${label}: ${errMsg}`);
        }
        setTimeout(fetchTasks, 1000);
      }
    } catch (e) {
      const errMsg = String(e);
      setTaskResults((prev) => ({
        ...prev,
        [taskId]: { status: "error", msg: errMsg },
      }));
      onLog?.(
        "error",
        `[错误] ${TASK_LABELS_MAP[taskId] || taskId}: ${errMsg}`,
      );
    } finally {
      setTriggering(null);
    }
  };

  useEffect(() => {
    fetchTasks();
    // 页面加载时主动查一次补历史进度，如果正在运行则自动开始轮询
    fetch(BACKFILL_PROGRESS_URL)
      .then((r) => r.json())
      .then((data: BackfillProgress) => {
        if (data && (data.running || data.total > 0)) {
          setBackfillProgress(data);
          if (data.running) startBackfillPoll();
        }
      })
      .catch(() => {});
  }, []);

  const TASK_LABELS: Record<string, string> = TASK_LABELS_MAP;

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Zap size={16} className="text-[#f59e0b]" />
          定时任务总览
        </h2>
        <button
          onClick={fetchTasks}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-primary)] transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      </div>
      {tasks.length === 0 ? (
        <div className="text-xs text-[var(--text-tertiary)] py-4 text-center">
          {loading ? "加载中..." : "暂无任务信息（服务未运行或接口未响应）"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="text-left text-[var(--text-tertiary)] pb-2 pr-4 font-medium">
                  任务
                </th>
                <th className="text-left text-[var(--text-tertiary)] pb-2 pr-4 font-medium">
                  ID
                </th>
                <th className="text-left text-[var(--text-tertiary)] pb-2 pr-4 font-medium">
                  下次执行
                </th>
                <th className="text-left text-[var(--text-tertiary)] pb-2 pr-4 font-medium">
                  上次完成
                </th>
                <th className="text-left text-[var(--text-tertiary)] pb-2 font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.flatMap((task) => {
                const progressRow = taskProgress[task.id] ? (
                  <tr key={`${task.id}-progress`} className="bg-blue-500/5">
                    <td colSpan={5} className="px-2 pb-2 pt-0">
                      <div className="flex items-center gap-2">
                        <Loader2
                          size={10}
                          className="animate-spin text-blue-400 shrink-0"
                        />
                        {taskProgress[task.id].total > 0 ? (
                          <>
                            <div className="flex-1 h-1.5 rounded-full bg-[var(--border-color)] overflow-hidden">
                              <div
                                className="h-full bg-blue-400 rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.round((taskProgress[task.id].done / taskProgress[task.id].total) * 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-[var(--text-tertiary)] shrink-0 tabular-nums">
                              {taskProgress[task.id].done}/
                              {taskProgress[task.id].total}
                              {taskProgress[task.id].phase
                                ? ` · ${taskProgress[task.id].phase}`
                                : ""}
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-[var(--text-tertiary)]">
                            后台执行中…
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null;
                return [
                  <tr
                    key={task.id}
                    id={`task-${task.id}`}
                    className={cn(
                      "border-b border-[var(--border-color)]/50 hover:bg-[var(--bg-primary)]/50 transition-colors duration-300",
                      highlightId === task.id &&
                        "bg-yellow-500/10 ring-1 ring-inset ring-yellow-500/40",
                    )}
                  >
                    <td className="py-2 pr-4 text-[var(--text-primary)] font-medium">
                      {TASK_LABELS[task.id] || task.name}
                    </td>
                    <td className="py-2 pr-4 text-[var(--text-tertiary)] font-mono">
                      {task.id}
                    </td>
                    <td className="py-2 pr-4 text-[var(--text-secondary)]">
                      {task.nextRun
                        ? new Date(task.nextRun)
                            .toLocaleString("zh-CN", { hour12: false })
                            .slice(5)
                        : "--"}
                    </td>
                    <td className="py-2 pr-4">
                      {task.lastRun ? (
                        <span className="text-xs text-green-400">
                          {task.lastRun}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-tertiary)]">
                          --
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTrigger(task.id)}
                          disabled={
                            triggering === task.id ||
                            triggering === `${task.id}__force`
                          }
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded hover:bg-blue-500/20 transition-colors disabled:opacity-40"
                        >
                          <Play
                            size={10}
                            className={
                              triggering === task.id ? "animate-spin" : ""
                            }
                          />
                          {triggering === task.id ? "执行中…" : "立即触发"}
                        </button>
                        {taskResults[task.id] &&
                          triggering !== task.id &&
                          triggering !== `${task.id}__force` && (
                            <span
                              className="text-xs"
                              style={{
                                color:
                                  taskResults[task.id].status === "ok"
                                    ? "#22c55e"
                                    : taskResults[task.id].status ===
                                        "triggered"
                                      ? "#f5a623"
                                      : "#ef4444",
                              }}
                            >
                              {taskResults[task.id].status === "ok"
                                ? "✓ "
                                : taskResults[task.id].status === "error"
                                  ? "✗ "
                                  : ""}
                              {taskResults[task.id].msg}
                            </span>
                          )}
                        {/* 强制全量按钮（仅 weekly_fundamental_sync） */}
                        {task.id === "weekly_fundamental_sync" && (
                          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-[var(--border-color)]">
                            <button
                              onClick={() => handleTrigger(task.id, true)}
                              disabled={
                                triggering === task.id ||
                                triggering === `${task.id}__force`
                              }
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded hover:bg-orange-500/20 transition-colors disabled:opacity-40"
                              title="忽略已有数据，强制重新同步所有股票的F10财务数据（用于补二季报等）"
                            >
                              <RefreshCw
                                size={9}
                                className={
                                  triggering === `${task.id}__force`
                                    ? "animate-spin"
                                    : ""
                                }
                              />
                              {triggering === `${task.id}__force`
                                ? "同步中…"
                                : "强制全量"}
                            </button>
                          </div>
                        )}
                        {/* 补历史按钮（仅 market_breadth_daily_sync） */}
                        {BACKFILL_TASK_IDS.has(task.id) && (
                          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-[var(--border-color)]">
                            <input
                              type="number"
                              min={1}
                              max={250}
                              value={backfillDays}
                              onChange={(e) =>
                                setBackfillDays(Number(e.target.value))
                              }
                              className="w-14 px-1.5 py-0.5 text-xs rounded border bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)] text-center"
                              title="补充最近N个交易日"
                            />
                            <span className="text-xs text-[var(--text-tertiary)]">
                              天
                            </span>
                            <button
                              onClick={handleBackfill}
                              disabled={backfillProgress?.running}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded hover:bg-orange-500/20 transition-colors disabled:opacity-40"
                            >
                              <RefreshCw
                                size={9}
                                className={
                                  backfillProgress?.running
                                    ? "animate-spin"
                                    : ""
                                }
                              />
                              补历史
                            </button>
                            {backfillProgress && (
                              <div className="flex items-center gap-1.5">
                                {backfillProgress.running ? (
                                  <>
                                    <div className="w-20 h-1.5 rounded-full bg-[var(--border-color)] overflow-hidden">
                                      <div
                                        className="h-full bg-orange-400 rounded-full transition-all"
                                        style={{
                                          width:
                                            backfillProgress.total > 0
                                              ? `${Math.round((backfillProgress.done / backfillProgress.total) * 100)}%`
                                              : "0%",
                                        }}
                                      />
                                    </div>
                                    <span className="text-xs text-[var(--text-tertiary)]">
                                      {backfillProgress.done}/
                                      {backfillProgress.total}
                                    </span>
                                  </>
                                ) : (
                                  <span
                                    className="text-xs"
                                    style={{
                                      color:
                                        backfillProgress.errors.length > 0
                                          ? "#f5a623"
                                          : "#22c55e",
                                    }}
                                  >
                                    {backfillProgress.errors.length > 0
                                      ? `✓ 完成，${backfillProgress.errors.length} 个错误`
                                      : `✓ 已补 ${backfillProgress.done} 天`}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>,
                  ...(progressRow ? [progressRow] : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SystemMonitorPage() {
  const [stats, setStats] = useState<SystemStats>({
    totalStocks: 0,
    totalData: 0,
    categories: { announcement: 0, research: 0, news: 0 },
    recentUpdates: [],
  });
  // 日志初始为空，挂载后从 localStorage 恢复（避免 SSR hydration 不匹配）
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [failedStocks, setFailedStocks] = useState<
    Array<{
      code: string;
      name: string;
      reason: string;
      syncType: string;
      time: string;
    }>
  >([]);
  const [logTab, setLogTab] = useState<"logs" | "failed">("logs");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [syncRunning, setSyncRunning] = useState(false);
  const [currentSyncType, setCurrentSyncType] = useState<string | null>(null);
  const [currentSyncInfo, setCurrentSyncInfo] = useState<{
    phase: string;
    progress: number;
    current: string;
    done: number;
    total: number;
  } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [flashStats, setFlashStats] = useState<FlashCatStat[]>([]);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const schedLogSeq = useRef<number>(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // 客户端挂载后从 localStorage 恢复日志和 seq（SSR 阶段不访问 localStorage）
  useEffect(() => {
    try {
      const saved = localStorage.getItem("system_monitor_logs");
      if (saved) setLogs(JSON.parse(saved) as LogEntry[]);
      const seq = Number(localStorage.getItem("system_monitor_seq") ?? 0);
      if (seq > 0) schedLogSeq.current = seq;
    } catch {}
  }, []);

  const getPhaseDisplayName = (phase: string): string => {
    const phaseNames: Record<string, string> = {
      quotes: "实时行情",
      klines: "K线数据",
      sw_industry: "申万板块行情",
      stock_info: "基本信息",
      fundamental: "财务数据",
      done: "完成",
    };
    return phaseNames[phase] || phase;
  };

  const addLog = (level: LogEntry["level"], message: string) => {
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setLogs((prev) => {
      const next = [...prev.slice(-299), { time, level, message }];
      try {
        localStorage.setItem("system_monitor_logs", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const scrollToTask = (taskId: string) => {
    setHighlightTaskId(taskId);
    setTimeout(() => {
      document
        .getElementById(`task-${taskId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    setTimeout(() => setHighlightTaskId(null), 3000);
  };

  const fetchStats = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/system/stats");
      if (response.ok && !unmountedRef.current) {
        const data = await response.json();
        setStats(data);
        setLastUpdated(
          new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        );
      }
    } catch (error) {
      if (!unmountedRef.current) addLog("error", `获取统计数据失败: ${error}`);
    }
  };

  const fetchFlashStats = async () => {
    try {
      const r = await fetch("http://localhost:8000/api/system/flash-stats");
      if (r.ok && !unmountedRef.current) setFlashStats(await r.json());
    } catch {}
  };

  const fetchSchedulerLogs = async () => {
    try {
      const r = await fetch(
        `http://localhost:8000/api/system/scheduler-logs?since=${schedLogSeq.current}`,
      );
      if (!r.ok || unmountedRef.current) return;
      const data: {
        logs: Array<{
          seq: number;
          time: string;
          level: string;
          message: string;
          source?: string;
        }>;
        latest_seq: number;
      } = await r.json();
      if (data.logs.length > 0 && !unmountedRef.current) {
        setLogs((prev) => {
          const newEntries: LogEntry[] = data.logs.map((l) => ({
            time: l.time,
            level: l.level as LogEntry["level"],
            message:
              l.source === "scheduler" ? `[定时] ${l.message}` : l.message,
          }));
          const next = [...prev, ...newEntries].slice(-300);
          try {
            localStorage.setItem("system_monitor_logs", JSON.stringify(next));
          } catch {}
          return next;
        });
        schedLogSeq.current = data.latest_seq;
        try {
          localStorage.setItem("system_monitor_seq", String(data.latest_seq));
        } catch {}
      }
    } catch {}
  };

  const fetchFailedStocks = async () => {
    try {
      const r = await fetch("http://localhost:8000/api/system/failed-stocks");
      if (r.ok) {
        const data = await r.json();
        setFailedStocks(data.failed || []);
      }
    } catch {}
  };

  const retryFailedStocks = async (codes?: string[]) => {
    try {
      await fetch("http://localhost:8000/api/system/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(codes ? codes : null),
      });
      addLog(
        "info",
        codes ? `开始重试 ${codes.length} 只股票` : "开始重试所有失败股票",
      );
      setTimeout(fetchFailedStocks, 2000);
    } catch (e) {
      addLog("error", `重试失败: ${e}`);
    }
  };

  const clearFailedStocks = async () => {
    try {
      await fetch("http://localhost:8000/api/system/failed-stocks", {
        method: "DELETE",
      });
      setFailedStocks([]);
      addLog("success", "失败记录已清空");
    } catch {}
  };

  const syncFlashCategory = async (key: string, label: string) => {
    addLog("info", `开始同步快讯: ${label}`);
    try {
      const r = await fetch(`http://localhost:8000/api/flash/sync/${key}`, {
        method: "POST",
      });
      if (r.ok) {
        addLog("success", `${label}快讯同步任务已启动`);
        setTimeout(fetchFlashStats, 2000);
        setTimeout(fetchFlashStats, 8000);
      }
    } catch (e) {
      addLog("error", `${label}快讯同步失败: ${e}`);
    }
  };

  const syncAllFlash = async () => {
    addLog("info", "开始同步所有分类快讯...");
    try {
      const r = await fetch("http://localhost:8000/api/flash/sync", {
        method: "POST",
      });
      if (r.ok) {
        addLog("success", "所有快讯同步任务已启动");
        setTimeout(fetchFlashStats, 3000);
        setTimeout(fetchFlashStats, 10000);
      }
    } catch (e) {
      addLog("error", `快讯同步失败: ${e}`);
    }
  };

  const triggerBatchSync = async (
    syncType: "quote" | "stock_info" | "fundamental" | "kline",
  ) => {
    setSyncRunning(true);
    setCurrentSyncType(syncType);
    const typeNames: Record<string, string> = {
      kline: "K线数据",
      quote: "实时行情",
      stock_info: "基本信息",
      fundamental: "财务数据",
    };
    const typeName = typeNames[syncType] || syncType;

    try {
      let endpoint = "";
      switch (syncType) {
        case "kline":
          endpoint = "/api/sync/klines";
          break;
        case "quote":
          endpoint = "/api/sync/quotes";
          break;
        case "stock_info":
          endpoint = "/api/sync/stock_info";
          break;
        case "fundamental":
          endpoint = "/api/sync/fundamental";
          break;
      }

      addLog("info", `开始批量同步${typeName}，接口: ${endpoint}`);

      const response = await fetch(`http://localhost:8000${endpoint}`, {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === "started") {
          addLog("success", `${typeName}同步任务已启动`);
          pollBatchSyncStatus(syncType, typeName);
        } else if (data.status === "already_running") {
          addLog("warning", `${typeName}同步任务已在运行中`);
          setSyncRunning(false);
          setCurrentSyncType(null);
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      addLog("error", `启动${typeName}同步失败: ${error}`);
      setSyncRunning(false);
      setCurrentSyncType(null);
    }
  };

  const pollBatchSyncStatus = async (syncType: string, typeName: string) => {
    const maxAttempts = 200;
    let attempts = 0;

    const poll = async () => {
      if (unmountedRef.current) return;
      try {
        const response = await fetch("http://localhost:8000/api/sync/status");
        const data = await response.json();

        if (unmountedRef.current) return;

        if (!data.running) {
          addLog(
            "success",
            `${typeName}同步完成！共处理 ${data.done}/${data.total} 只股票`,
          );
          setSyncRunning(false);
          setCurrentSyncType(null);
          setCurrentSyncInfo(null);
          fetchStats();
          return;
        }

        setCurrentSyncInfo({
          phase: getPhaseDisplayName(data.phase),
          progress: data.total > 0 ? (data.done / data.total) * 100 : 0,
          current: data.current,
          done: data.done,
          total: data.total,
        });

        attempts++;
        const progress = data.total > 0 ? (data.done / data.total) * 100 : 0;

        if (attempts % 5 === 0) {
          fetchStats();
        }

        fetchSchedulerLogs();

        if (attempts % 10 === 0) {
          addLog(
            "info",
            `${typeName}同步进度: ${data.done}/${data.total} (${Math.round(progress)}%) - ${data.phase} - ${data.current}`,
          );
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          throw new Error("同步超时");
        }
      } catch (error) {
        if (unmountedRef.current) return;
        addLog("error", `${typeName}同步状态查询失败: ${error}`);
        setSyncRunning(false);
      }
    };

    poll();
  };

  const triggerFullRefresh = async () => {
    if (currentSyncType === "full") {
      addLog("warning", "全量同步已在运行中");
      return;
    }

    if (syncRunning) {
      addLog("warning", "检测到其他同步任务，正在停止...");
      await stopAllSync();
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    setSyncRunning(true);
    setCurrentSyncType("full");
    addLog(
      "info",
      "开始一键全量刷新：行情+申万板块 → 基本信息 → 财务数据 → 快讯 → 股吧资讯",
    );

    try {
      addLog("info", "[1/5] 同步实时行情 + 申万板块行情 + K线数据...");
      const quoteResponse = await fetch("http://localhost:8000/api/sync/all", {
        method: "POST",
      });

      if (quoteResponse.ok) {
        const quoteData = await quoteResponse.json();
        if (quoteData.status === "started") {
          await waitForSyncComplete("实时行情");
        }
      }

      addLog("info", "[2/5] 同步股票基本信息...");
      const infoResponse = await fetch(
        "http://localhost:8000/api/sync/stock_info",
        { method: "POST" },
      );

      if (infoResponse.ok) {
        const infoData = await infoResponse.json();
        if (infoData.status === "started") {
          await waitForSyncComplete("基本信息");
        }
      }

      addLog("info", "[3/5] 同步财务数据...");
      const fundamentalResponse = await fetch(
        "http://localhost:8000/api/sync/fundamental",
        { method: "POST" },
      );

      if (fundamentalResponse.ok) {
        const fundamentalData = await fundamentalResponse.json();
        if (fundamentalData.status === "started") {
          await waitForSyncComplete("财务数据");
        }
      }

      addLog("info", "[4/5] 同步快讯（6个分类）...");
      const flashResponse = await fetch(
        "http://localhost:8000/api/flash/sync",
        {
          method: "POST",
        },
      );
      if (flashResponse.ok) {
        addLog("info", "快讯同步已启动，后台增量抓取中...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await fetchFlashStats();
        addLog("success", "快讯同步完成");
      }

      addLog("info", "[5/5] 同步股吧资讯与公告...");
      try {
        const gubaResponse = await fetch(
          "http://localhost:8000/api/guba/sync",
          {
            method: "POST",
          },
        );
        if (gubaResponse.ok) {
          addLog("info", "股吧资讯同步已启动（后台批量抓取，耗时较长）...");
        }
      } catch (e) {
        addLog("error", `股吧资讯同步失败: ${e}`);
      }

      addLog("success", "✨ 一键全量刷新完成！所有数据已更新");
      setSyncRunning(false);
      setCurrentSyncType(null);
    } catch (error) {
      addLog("error", `同步失败: ${error}`);
      setSyncRunning(false);
      setCurrentSyncType(null);
    } finally {
      fetchStats();
    }
  };

  const stopAllSync = async () => {
    try {
      addLog("warning", "正在停止所有同步任务...");
      const response = await fetch("http://localhost:8000/api/sync/stop", {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        addLog("warning", data.message || "停止请求已发送");
        setTimeout(() => {
          setSyncRunning(false);
          setCurrentSyncType(null);
          setCurrentSyncInfo(null);
          fetchStats();
        }, 2000);
      }
    } catch (error) {
      addLog("error", `停止同步失败: ${error}`);
    }
  };

  const waitForSyncComplete = async (typeName: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const maxAttempts = 900; // 900 × 2s = 30分钟，覆盖K线3300只全量同步
      let attempts = 0;
      let lastLoggedProgress = -1;
      let confirmedStarted = false;
      let startCheckAttempts = 0;
      const maxStartChecks = 6;

      const poll = async () => {
        if (unmountedRef.current) {
          resolve();
          return;
        }
        try {
          const response = await fetch("http://localhost:8000/api/sync/status");
          const data = await response.json();

          if (unmountedRef.current) {
            resolve();
            return;
          }

          if (!confirmedStarted) {
            if (data.running) {
              confirmedStarted = true;
            } else {
              startCheckAttempts++;
              if (startCheckAttempts >= maxStartChecks) {
                resolve();
                return;
              }
              setTimeout(poll, 500);
              return;
            }
          }

          if (!data.running) {
            addLog(
              "success",
              `${typeName}同步完成 (${data.done}/${data.total})`,
            );
            setCurrentSyncInfo(null);
            resolve();
            return;
          }

          setCurrentSyncInfo({
            phase: getPhaseDisplayName(data.phase),
            progress: data.total > 0 ? (data.done / data.total) * 100 : 0,
            current: data.current,
            done: data.done,
            total: data.total,
          });

          attempts++;
          const progress =
            data.total > 0 ? Math.floor((data.done / data.total) * 100) : 0;

          if (
            (progress !== lastLoggedProgress && progress % 10 === 0) ||
            attempts % 5 === 1
          ) {
            addLog(
              "info",
              `${typeName}: ${progress}% (${data.done}/${data.total})`,
            );
            lastLoggedProgress = progress;
          }

          fetchSchedulerLogs();

          if (attempts < maxAttempts) {
            setTimeout(poll, 2000);
          } else {
            addLog(
              "warning",
              `${typeName}等待超时（30分钟），继续执行后续步骤`,
            );
            resolve();
          }
        } catch (error) {
          if (unmountedRef.current) {
            resolve();
            return;
          }
          reject(error);
        }
      };

      poll();
    });
  };

  const clearLogs = () => {
    setLogs([]);
    try {
      localStorage.removeItem("system_monitor_logs");
      localStorage.removeItem("system_monitor_seq");
    } catch {}
    schedLogSeq.current = 0;
    addLog("info", "日志已清空");
  };

  const checkAndResumeSyncStatus = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/sync/status");
      const data = await response.json();

      if (unmountedRef.current) return;

      if (data.running) {
        setSyncRunning(true);

        const phaseNames: Record<string, string> = {
          quotes: "实时行情",
          klines: "K线数据",
          stock_info: "基本信息",
          fundamental: "财务数据",
        };

        const phaseName = phaseNames[data.phase] || data.phase;
        const progress =
          data.total > 0 ? Math.floor((data.done / data.total) * 100) : 0;

        addLog("warning", `检测到同步任务正在运行中...`);
        addLog(
          "info",
          `当前进度: ${phaseName} ${progress}% (${data.done}/${data.total})`,
        );
        addLog(
          "info",
          `开始时间: ${new Date(data.started_at).toLocaleString("zh-CN")}`,
        );

        pollBatchSyncStatus("resume", "恢复的同步任务");
      }
    } catch (error) {
      console.error("检查同步状态失败:", error);
    }
  };

  const exportLogs = () => {
    const content = logs
      .map((log) => `[${log.time}] ${log.level.toUpperCase()}: ${log.message}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `system-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addLog("success", "日志已导出");
  };

  useEffect(() => {
    fetchStats();
    fetchFlashStats();
    fetchSchedulerLogs();
    addLog("info", "系统监控已启动");
    checkAndResumeSyncStatus();
  }, []);

  useEffect(() => {
    if (!autoRefresh && !syncRunning) return;
    const interval = setInterval(() => {
      fetchStats();
      fetchFlashStats();
      fetchSchedulerLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, syncRunning]);

  useEffect(() => {
    fetchFailedStocks();
    if (!autoRefresh) return;
    const interval = setInterval(fetchFailedStocks, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop =
        logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border-color)] shrink-0">
        <div className="flex items-center justify-between mr-32">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Activity size={24} className="text-[var(--accent)]" />
              系统监控
            </h1>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              实时监控数据爬取、任务状态与系统日志
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={triggerFullRefresh}
              disabled={currentSyncType === "full"}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                currentSyncType === "full"
                  ? "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 shadow-lg",
              )}
            >
              <RefreshCw
                size={16}
                className={currentSyncType === "full" ? "animate-spin" : ""}
              />
              一键刷新全部
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                autoRefresh
                  ? "bg-[var(--accent)] text-black"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
              )}
            >
              {autoRefresh ? <Pause size={16} /> : <Play size={16} />}
              {autoRefresh ? "自动刷新中" : "已暂停"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Last Updated Info */}
        {lastUpdated && (
          <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
            <span>数据最后更新时间: {lastUpdated}</span>
            <button
              onClick={fetchStats}
              className="flex items-center gap-1 px-2 py-1 rounded hover:text-[var(--text-primary)] transition-colors"
            >
              <RefreshCw size={12} />
              立即刷新
            </button>
          </div>
        )}

        {/* Flash News Management */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4">
          <div className="flex items-center mb-2">
            <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Zap size={14} className="text-yellow-400" />
              快讯数据
            </h2>
          </div>

          <div className="text-xs text-[var(--text-tertiary)] mb-3">
            快讯每 3 分钟自动增量同步，下表显示各分类当前数据量及最后同步时间。
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {flashStats.length === 0
              ? [1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-12 bg-[var(--bg-tertiary)] animate-pulse rounded-lg"
                  />
                ))
              : flashStats.map((cat) => (
                  <div
                    key={cat.key}
                    className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 flex flex-col gap-0.5"
                  >
                    <div className="flex items-center gap-1">
                      {cat.syncing ? (
                        <Loader2
                          size={10}
                          className="animate-spin text-yellow-400 shrink-0"
                        />
                      ) : (
                        <CheckCircle
                          size={10}
                          className="text-green-400 shrink-0"
                        />
                      )}
                      <span className="text-xs font-medium text-[var(--text-secondary)] truncate">
                        {cat.label}
                      </span>
                    </div>
                    <button
                      onClick={() => scrollToTask("news_flash_sync")}
                      className="text-sm font-semibold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] hover:underline underline-offset-2 transition-colors text-left"
                    >
                      {cat.count.toLocaleString()}
                    </button>
                    {cat.lastSync && (
                      <div className="text-[10px] text-[var(--text-tertiary)] truncate">
                        {new Date(cat.lastSync)
                          .toLocaleString("zh-CN", { hour12: false })
                          .slice(5)}
                      </div>
                    )}
                  </div>
                ))}
          </div>
        </div>

        {/* ── 行情 / 板块 / 指数 ── */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4">
          <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
            行情 · 板块 · 指数
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SwIndustryMonitorInline onTaskClick={scrollToTask} />
            <ConceptBoardMonitorInline onTaskClick={scrollToTask} />
            <FundFlowMonitorInline onTaskClick={scrollToTask} />
            <GlobalIndexMonitorInline onTaskClick={scrollToTask} />
          </div>
        </div>

        {/* ── 新闻 / 资讯 ── */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4">
          <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
            新闻 · 资讯
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ThemeNewsMonitorInline onTaskClick={scrollToTask} />
            <GubaMonitorInline onTaskClick={scrollToTask} />
          </div>
        </div>

        {/* ── 量化数据 ── */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4">
          <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
            量化数据
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <MinuteSyncMonitorInline onTaskClick={scrollToTask} />
            <F10MonitorInline onTaskClick={scrollToTask} />
          </div>
        </div>

        {/* Task Status Table */}
        <TaskStatusTable onLog={addLog} highlightId={highlightTaskId} />

        {/* System Logs & Failed Stocks */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setLogTab("logs")}
                className={cn(
                  "text-sm font-semibold pb-2 border-b-2 transition-colors",
                  logTab === "logs"
                    ? "text-[var(--text-primary)] border-[var(--accent)]"
                    : "text-[var(--text-tertiary)] border-transparent",
                )}
              >
                系统日志
              </button>
              <button
                onClick={() => setLogTab("failed")}
                className={cn(
                  "text-sm font-semibold pb-2 border-b-2 transition-colors flex items-center gap-1",
                  logTab === "failed"
                    ? "text-[var(--text-primary)] border-[var(--accent)]"
                    : "text-[var(--text-tertiary)] border-transparent",
                )}
              >
                失败记录
                {failedStocks.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">
                    {failedStocks.length}
                  </span>
                )}
              </button>
            </div>
            <div className="flex gap-2">
              {logTab === "logs" ? (
                <>
                  <button
                    onClick={exportLogs}
                    className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
                  >
                    <Download size={14} />
                    导出
                  </button>
                  <button
                    onClick={clearLogs}
                    className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={14} />
                    清空
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => retryFailedStocks()}
                    disabled={failedStocks.length === 0}
                    className="px-3 py-1.5 text-xs bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded hover:bg-blue-500/20 transition-colors flex items-center gap-1 disabled:opacity-40"
                  >
                    <RefreshCw size={14} />
                    重试全部
                  </button>
                  <button
                    onClick={clearFailedStocks}
                    className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={14} />
                    清空
                  </button>
                </>
              )}
            </div>
          </div>

          {logTab === "logs" ? (
            <div
              ref={logsContainerRef}
              className="bg-[var(--bg-deep)] border border-[var(--border-color)] rounded-lg p-4 h-80 overflow-y-auto font-mono text-xs"
            >
              {logs.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-tertiary)]">
                  暂无日志
                </div>
              ) : (
                logs.map((log, i) => (
                  <div
                    key={i}
                    className={cn(
                      "py-1",
                      log.level === "error" && "text-red-400",
                      log.level === "success" && "text-green-400",
                      log.level === "warning" && "text-yellow-400",
                      log.level === "info" && "text-[var(--text-secondary)]",
                    )}
                  >
                    <span className="text-[var(--text-tertiary)]">
                      [{log.time}]
                    </span>{" "}
                    <span className="font-semibold">
                      {log.level.toUpperCase()}
                    </span>
                    : {log.message}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          ) : (
            <div className="bg-[var(--bg-deep)] border border-[var(--border-color)] rounded-lg p-4 h-80 overflow-y-auto">
              {failedStocks.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
                  暂无失败记录
                </div>
              ) : (
                <div className="space-y-2">
                  {failedStocks.map((item) => (
                    <div
                      key={`${item.syncType}:${item.code}`}
                      className="flex items-center justify-between p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg hover:border-red-500/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            {item.code}
                          </span>
                          <span className="text-sm text-[var(--text-secondary)]">
                            {item.name}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded">
                            {item.syncType === "kline"
                              ? "K线"
                              : item.syncType === "sw_kline"
                                ? "申万板块K线"
                                : item.syncType}
                          </span>
                        </div>
                        <div className="text-xs text-red-400 mt-1">
                          {item.reason}
                        </div>
                        <div className="text-xs text-[var(--text-tertiary)] mt-1">
                          {new Date(item.time).toLocaleString("zh-CN", {
                            hour12: false,
                          })}
                        </div>
                      </div>
                      <button
                        onClick={() => retryFailedStocks([item.code])}
                        className="ml-3 px-3 py-1.5 text-xs bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded hover:bg-blue-500/20 transition-colors flex items-center gap-1"
                      >
                        <RefreshCw size={12} />
                        重试
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: "blue" | "purple" | "green" | "orange";
}) {
  const colorMap = {
    blue: "from-blue-500/20 to-blue-600/20 border-blue-500/30",
    purple: "from-purple-500/20 to-purple-600/20 border-purple-500/30",
    green: "from-green-500/20 to-green-600/20 border-green-500/30",
    orange: "from-orange-500/20 to-orange-600/20 border-orange-500/30",
  };

  return (
    <div
      className={cn("bg-gradient-to-br border rounded-xl p-5", colorMap[color])}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[var(--text-primary)]">{icon}</div>
        <span className="text-2xl font-bold text-[var(--text-primary)]">
          {value}
        </span>
      </div>
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
    </div>
  );
}

const colorTokens: Record<
  string,
  { bg: string; border: string; text: string; icon: string }
> = {
  blue: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
    icon: "text-blue-400",
  },
  purple: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-400",
    icon: "text-purple-400",
  },
  green: {
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-400",
    icon: "text-green-400",
  },
  orange: {
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-400",
    icon: "text-orange-400",
  },
  cyan: {
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    text: "text-cyan-400",
    icon: "text-cyan-400",
  },
};

function SyncDataCard({
  label,
  sub,
  icon,
  color,
  count,
  stocks,
  totalStocks,
  syncing,
  lastSync,
  onSync,
}: {
  label: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
  count?: number;
  stocks?: number;
  totalStocks: number;
  syncing: boolean;
  lastSync?: string | null;
  onSync: () => void;
}) {
  const tokens = colorTokens[color] ?? colorTokens.blue;

  return (
    <div
      className={cn(
        "rounded-lg p-3 border flex flex-col gap-2",
        tokens.bg,
        tokens.border,
      )}
    >
      <div className="flex items-center justify-between">
        <div className={cn("flex items-center gap-1.5", tokens.icon)}>
          {icon}
          <span className={cn("text-[13px] font-semibold", tokens.text)}>
            {label}
          </span>
        </div>
        <button
          onClick={onSync}
          disabled={syncing}
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-1",
            tokens.bg,
            tokens.border,
            "border",
            tokens.text,
            "hover:opacity-80 disabled:opacity-40",
            syncing ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <RefreshCw size={10} className={syncing ? "animate-spin" : ""} />
          {syncing ? "同步中" : "同步"}
        </button>
      </div>
      {count !== undefined ? (
        <div className="text-[22px] font-bold text-[var(--text-primary)]">
          {count.toLocaleString()}
        </div>
      ) : (
        <div className="text-[22px] font-bold text-[var(--text-tertiary)]">
          —
        </div>
      )}
      <div className="text-[10px] text-[var(--text-tertiary)] space-y-0.5">
        <div>{sub}</div>
        {stocks !== undefined && totalStocks > 0 && stocks <= totalStocks && (
          <div>
            覆盖: {stocks}/{totalStocks} 只股票
          </div>
        )}
        {lastSync && (
          <div>
            同步:{" "}
            {new Date(lastSync).toLocaleString("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
    </div>
  );
}
