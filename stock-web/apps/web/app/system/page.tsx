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

function SwIndustryMonitor() {
  const [boardCount, setBoardCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const fetchCount = async () => {
    try {
      const r = await fetch("http://localhost:8000/api/sw-industry");
      if (r.ok) {
        const data = await r.json();
        setBoardCount(data.length);
        if (data.length > 0 && data[0].updatedAt)
          setLastSync(data[0].updatedAt);
      }
    } catch {}
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("http://localhost:8000/api/sw-industry/sync", {
        method: "POST",
      });
      setTimeout(fetchCount, 2000);
    } catch {
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchCount();
  }, []);

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <TrendingUp size={16} className="text-[#e8a235]" />
          申万行业板块
        </h2>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#e8a23510] border border-[#e8a23530] text-[#e8a235] rounded-lg hover:bg-[#e8a23520] transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
          {syncing ? "同步中..." : "立即同步"}
        </button>
      </div>
      <div className="text-xs text-[var(--text-tertiary)] mb-4">
        申万二级行业实时行情，每 3 分钟自动同步。
      </div>
      <div className="flex gap-6">
        <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-4 flex-1">
          <div className="text-xs text-[var(--text-tertiary)] mb-1">
            板块数量
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {boardCount || "--"}
          </div>
        </div>
        <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-4 flex-1">
          <div className="text-xs text-[var(--text-tertiary)] mb-1">
            最近同步
          </div>
          <div className="text-sm text-[var(--text-secondary)]">
            {lastSync
              ? new Date(lastSync)
                  .toLocaleString("zh-CN", { hour12: false })
                  .slice(5)
              : "--"}
          </div>
        </div>
        <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-4 flex-1">
          <div className="text-xs text-[var(--text-tertiary)] mb-1">
            同步频率
          </div>
          <div className="text-sm text-[var(--text-secondary)]">每 3 分钟</div>
        </div>
      </div>
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
    setLogs((prev) => [...prev.slice(-99), { time, level, message }]);
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
          return [...prev, ...newEntries].slice(-200);
        });
        schedLogSeq.current = data.latest_seq;
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
      "开始一键全量刷新：行情+申万板块 → 基本信息 → 财务数据 → 快讯",
    );

    try {
      addLog("info", "[1/4] 同步实时行情 + 申万板块行情 + K线数据...");
      const quoteResponse = await fetch("http://localhost:8000/api/sync/all", {
        method: "POST",
      });

      if (quoteResponse.ok) {
        const quoteData = await quoteResponse.json();
        if (quoteData.status === "started") {
          await waitForSyncComplete("实时行情");
        }
      }

      addLog("info", "[2/4] 同步股票基本信息...");
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

      addLog("info", "[3/4] 同步财务数据...");
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

      addLog("info", "[4/4] 同步快讯（6个分类）...");
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
      const maxAttempts = 200;
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
            reject(new Error("同步超时"));
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

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Database size={20} />}
            label="已收录股票"
            value={stats.totalStocks}
            color="blue"
          />
          <StatCard
            icon={<TrendingUp size={20} />}
            label="总数据量"
            value={stats.totalData.toLocaleString()}
            color="purple"
          />
          <StatCard
            icon={<Activity size={20} />}
            label="同步状态"
            value={syncRunning ? "进行中" : "空闲"}
            color="green"
          />
          <StatCard
            icon={<CheckCircle size={20} />}
            label="数据类型"
            value={4}
            color="orange"
          />
        </div>

        {/* Data Coverage Info */}
        {stats.stocksByDataType && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="text-blue-400 shrink-0">ℹ️</div>
              <div className="flex-1">
                <div className="text-sm font-medium text-blue-400 mb-2">
                  数据覆盖情况
                </div>
                <div className="text-xs text-[var(--text-secondary)] space-y-1">
                  <div>
                    • 实时行情数据：{stats.stocksByDataType.quote}/
                    {stats.totalStocks} 只股票
                  </div>
                  <div>
                    • 财务数据：{stats.stocksByDataType.fundamental}/
                    {stats.totalStocks} 只股票
                  </div>
                  {stats.totalStocks >
                    (stats.stocksByDataType.fundamental || 0) && (
                    <div className="mt-2 text-yellow-400">
                      ⚠️
                      注意：数据库中包含海外股票（美股/港股/日股/韩股），这些股票暂不支持财务数据同步
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sync Progress - always visible below coverage */}
        <div
          className={cn(
            "rounded-xl p-5 border-2 transition-all",
            syncRunning
              ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-blue-500/50"
              : "bg-[var(--bg-secondary)] border-[var(--border-color)]",
          )}
        >
          <div className="flex items-center gap-4">
            {syncRunning ? (
              <Loader2
                size={28}
                className="animate-spin text-blue-400 shrink-0"
              />
            ) : (
              <CheckCircle
                size={28}
                className="text-[var(--text-tertiary)] shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "text-sm font-semibold mb-1",
                  syncRunning ? "text-blue-400" : "text-[var(--text-tertiary)]",
                )}
              >
                {syncRunning ? "🔄 数据同步进行中..." : "暂无同步任务"}
              </div>
              {syncRunning && currentSyncInfo ? (
                <>
                  <div className="text-xs text-[var(--text-secondary)] mb-2">
                    当前阶段:{" "}
                    <span className="font-medium text-[var(--text-primary)]">
                      {currentSyncInfo.phase}
                    </span>
                    {currentSyncInfo.current && (
                      <>
                        {" "}
                        · 正在处理:{" "}
                        <span className="font-medium text-[var(--text-primary)]">
                          {currentSyncInfo.current}
                        </span>
                      </>
                    )}
                    <span className="ml-3 text-[var(--text-tertiary)]">
                      {currentSyncInfo.done}/{currentSyncInfo.total} (
                      {Math.round(currentSyncInfo.progress)}%)
                    </span>
                  </div>
                  <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                      style={{ width: `${currentSyncInfo.progress}%` }}
                    />
                  </div>
                </>
              ) : syncRunning ? (
                <div className="text-xs text-[var(--text-secondary)]">
                  系统正在后台同步数据，您可以切换到其他页面，同步会继续进行。
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Flash News Management */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Zap size={16} className="text-yellow-400" />
              快讯数据
            </h2>
            <button
              onClick={syncAllFlash}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-lg hover:bg-yellow-500/20 transition-colors"
            >
              <RefreshCw size={12} />
              同步全部
            </button>
          </div>

          <div className="text-xs text-[var(--text-tertiary)] mb-3">
            快讯每 3 分钟自动增量同步，下表显示各分类当前数据量及最后同步时间。
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {flashStats.length === 0
              ? [1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-24 bg-[var(--bg-tertiary)] animate-pulse rounded-lg"
                  />
                ))
              : flashStats.map((cat) => (
                  <div
                    key={cat.key}
                    className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {cat.syncing ? (
                          <Loader2
                            size={12}
                            className="animate-spin text-yellow-400"
                          />
                        ) : (
                          <CheckCircle size={12} className="text-green-400" />
                        )}
                        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                          {cat.label}
                        </span>
                      </div>
                      <button
                        onClick={() => syncFlashCategory(cat.key, cat.label)}
                        disabled={cat.syncing}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors"
                      >
                        同步
                      </button>
                    </div>
                    <div className="text-[22px] font-bold text-[var(--text-primary)]">
                      {cat.count.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)] space-y-0.5">
                      {cat.latestCtime && (
                        <div>最新: {cat.latestCtime.slice(0, 16)}</div>
                      )}
                      {cat.lastSync && (
                        <div>
                          同步:{" "}
                          {new Date(cat.lastSync)
                            .toLocaleString("zh-CN", { hour12: false })
                            .slice(5)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
          </div>
        </div>

        {/* SW Industry Monitor */}
        <SwIndustryMonitor />

        {/* Sync Control */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              数据同步
            </h2>
            <div className="flex gap-2">
              <button
                onClick={triggerFullRefresh}
                disabled={currentSyncType === "full"}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                  currentSyncType === "full"
                    ? "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 shadow-md",
                )}
              >
                <RefreshCw
                  size={12}
                  className={currentSyncType === "full" ? "animate-spin" : ""}
                />
                同步全部
              </button>
              {syncRunning && (
                <button
                  onClick={stopAllSync}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600 shadow-md"
                >
                  <StopCircle size={12} />
                  停止同步
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              {
                key: "quote",
                label: "实时行情",
                sub: "价格/涨跌幅",
                icon: <TrendingUp size={20} />,
                color: "purple",
                count: stats.dataByType?.quote,
                stocks: stats.stocksByDataType?.quote,
                syncType: "quote" as const,
                lastSync: stats.quoteLastSync,
              },
              {
                key: "stock_info",
                label: "基本信息",
                sub: "名称/行业/市场",
                icon: <Activity size={20} />,
                color: "green",
                count: stats.dataByType?.stock_info,
                stocks: undefined,
                syncType: "stock_info" as const,
                lastSync: stats.stockInfoLastSync,
              },
              {
                key: "fundamental",
                label: "财务数据",
                sub: "营收/利润",
                icon: <CheckCircle size={20} />,
                color: "orange",
                count: stats.dataByType?.fundamental,
                stocks: stats.stocksByDataType?.fundamental,
                syncType: "fundamental" as const,
                lastSync: stats.fundamentalLastSync,
              },
              {
                key: "kline",
                label: "K线数据",
                sub: "日K/历史行情",
                icon: <TrendingUp size={20} />,
                color: "cyan",
                count: stats.dataByType?.kline,
                stocks: stats.stocksByDataType?.kline,
                syncType: "kline" as const,
                lastSync: stats.klineLastSync,
              },
            ].map((item) => (
              <SyncDataCard
                key={item.key}
                label={item.label}
                sub={item.sub}
                icon={item.icon}
                color={item.color}
                count={item.count}
                stocks={item.stocks}
                totalStocks={stats.totalStocks}
                syncing={syncRunning && currentSyncType === item.syncType}
                lastSync={
                  "lastSync" in item
                    ? (item as { lastSync?: string | null }).lastSync
                    : undefined
                }
                onSync={() => triggerBatchSync(item.syncType)}
              />
            ))}
          </div>
        </div>

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
                            {item.syncType === "kline" ? "K线" : item.syncType}
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
