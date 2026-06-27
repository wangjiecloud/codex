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
  Search,
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  Loader2,
  X,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SystemStats {
  totalStocks: number;
  totalData: number;
  dataByType?: {
    guba: number;
    quote: number;
    fundamental: number;
  };
  stocksByDataType?: {
    guba: number;
    quote: number;
    fundamental: number;
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
}

interface SyncTask {
  code: string;
  status: "pending" | "running" | "success" | "failed";
  progress: number;
  message: string;
  startTime?: string;
  endTime?: string;
}

interface LogEntry {
  time: string;
  level: "info" | "success" | "error" | "warning";
  message: string;
}

export default function SystemMonitorPage() {
  const [stats, setStats] = useState<SystemStats>({
    totalStocks: 0,
    totalData: 0,
    categories: { announcement: 0, research: 0, news: 0 },
    recentUpdates: [],
  });
  const [tasks, setTasks] = useState<Record<string, SyncTask>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchCode, setSearchCode] = useState("");
  const [syncQueue, setSyncQueue] = useState<string[]>([]);
  const [syncRunning, setSyncRunning] = useState(false);
  const [allStocks, setAllStocks] = useState<
    Array<{ code: string; name: string }>
  >([]);
  const [searchResults, setSearchResults] = useState<
    Array<{ code: string; name: string }>
  >([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [stockNameMap, setStockNameMap] = useState<Record<string, string>>({});
  const [currentSyncInfo, setCurrentSyncInfo] = useState<{
    phase: string;
    progress: number;
    current: string;
    done: number;
    total: number;
  } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const getPhaseDisplayName = (phase: string): string => {
    const phaseNames: Record<string, string> = {
      quotes: "实时行情",
      klines: "K线数据",
      stock_info: "基本信息",
      fundamental: "财务数据",
      guba: "股吧数据",
      guba_all: "全部讨论",
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
      if (response.ok) {
        const data = await response.json();
        setStats(data);
        setLastUpdated(
          new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        );
      }
    } catch (error) {
      addLog("error", `获取统计数据失败: ${error}`);
    }
  };

  const triggerSync = async (code: string) => {
    if (tasks[code]?.status === "running") {
      addLog("warning", `股票 ${code} 正在同步中，请勿重复触发`);
      return;
    }

    setTasks((prev) => ({
      ...prev,
      [code]: {
        code,
        status: "running",
        progress: 0,
        message: "正在爬取数据...",
        startTime: new Date().toISOString(),
      },
    }));

    addLog("info", `开始同步股票 ${code}`);

    try {
      const response = await fetch(
        `http://localhost:8000/api/guba/sync/${code}`,
        { method: "POST" },
      );

      if (response.ok) {
        pollTaskStatus(code);
      } else {
        throw new Error("触发同步失败");
      }
    } catch (error) {
      setTasks((prev) => ({
        ...prev,
        [code]: {
          ...prev[code],
          status: "failed",
          message: `同步失败: ${error}`,
          endTime: new Date().toISOString(),
        },
      }));
      addLog("error", `股票 ${code} 同步失败: ${error}`);
    }
  };

  const pollTaskStatus = async (code: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/api/guba/${code}?category=all&page=1&page_size=1`,
        );
        const data = await response.json();

        if (!data.syncing) {
          setTasks((prev) => ({
            ...prev,
            [code]: {
              ...prev[code],
              status: "success",
              progress: 100,
              message: `同步完成，共 ${data.total} 条数据`,
              endTime: new Date().toISOString(),
            },
          }));
          addLog("success", `股票 ${code} 同步完成，共 ${data.total} 条数据`);
          fetchStats();
          return;
        }

        attempts++;
        const progress = Math.min(95, (attempts / maxAttempts) * 100);
        setTasks((prev) => ({
          ...prev,
          [code]: {
            ...prev[code],
            progress,
            message: `正在爬取中... (${Math.round(progress)}%)`,
          },
        }));

        if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
        } else {
          throw new Error("同步超时");
        }
      } catch (error) {
        setTasks((prev) => ({
          ...prev,
          [code]: {
            ...prev[code],
            status: "failed",
            message: `同步失败: ${error}`,
            endTime: new Date().toISOString(),
          },
        }));
        addLog("error", `股票 ${code} 同步失败: ${error}`);
      }
    };

    poll();
  };

  const batchSync = async () => {
    if (syncQueue.length === 0) {
      addLog("warning", "请先添加需要同步的股票代码");
      return;
    }

    addLog("info", `开始批量同步 ${syncQueue.length} 只股票`);

    for (const code of syncQueue) {
      await triggerSync(code);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  };

  const triggerBatchSync = async (
    syncType: "guba" | "quote" | "stock_info" | "fundamental" | "guba_all",
  ) => {
    if (syncRunning) {
      addLog("warning", "已有同步任务正在运行，请稍后再试");
      return;
    }

    setSyncRunning(true);
    const typeNames = {
      guba: "股吧数据",
      guba_all: "全部讨论",
      quote: "实时行情",
      stock_info: "基本信息",
      fundamental: "财务数据",
    };
    const typeName = typeNames[syncType];

    addLog("info", `开始批量同步${typeName}...`);

    try {
      let endpoint = "";
      switch (syncType) {
        case "guba":
          addLog("info", "股吧数据需要单独同步，请使用输入框单独同步");
          setSyncRunning(false);
          return;
        case "guba_all":
          endpoint = "/api/guba/sync/all/batch";
          break;
        case "quote":
          endpoint = "/api/sync/all";
          break;
        case "stock_info":
          endpoint = "/api/sync/stock_info";
          break;
        case "fundamental":
          endpoint = "/api/sync/fundamental";
          break;
      }

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
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      addLog("error", `启动${typeName}同步失败: ${error}`);
      setSyncRunning(false);
    }
  };

  const pollBatchSyncStatus = async (syncType: string, typeName: string) => {
    const maxAttempts = 200;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/sync/status");
        const data = await response.json();

        if (!data.running) {
          addLog(
            "success",
            `${typeName}同步完成！共处理 ${data.done}/${data.total} 只股票`,
          );
          setSyncRunning(false);
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
        addLog("error", `${typeName}同步状态查询失败: ${error}`);
        setSyncRunning(false);
      }
    };

    poll();
  };

  const triggerFullRefresh = async () => {
    if (syncRunning) {
      addLog("warning", "已有同步任务正在运行，请稍后再试");
      return;
    }

    setSyncRunning(true);
    addLog("info", "开始一键全量刷新：行情 → 基本信息 → 财务数据 → 股吧数据");

    try {
      addLog("info", "[1/4] 同步实时行情数据...");
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

      addLog("info", "[4/4] 同步股吧数据（公告/研报/资讯）...");
      const gubaResponse = await fetch(
        "http://localhost:8000/api/guba/sync/batch",
        { method: "POST" },
      );

      if (gubaResponse.ok) {
        const gubaData = await gubaResponse.json();
        if (gubaData.status === "started") {
          await waitForSyncComplete("股吧数据");
        }
      }

      addLog("success", "✨ 一键全量刷新完成！所有数据已更新");
      setSyncRunning(false);
      fetchStats();
    } catch (error) {
      addLog("error", `一键刷新失败: ${error}`);
      setSyncRunning(false);
    }
  };

  const waitForSyncComplete = async (typeName: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const maxAttempts = 200;
      let attempts = 0;
      let lastLoggedProgress = -1;

      const poll = async () => {
        try {
          const response = await fetch("http://localhost:8000/api/sync/status");
          const data = await response.json();

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

          // 每10%输出一次日志，或者每5次轮询（10秒）输出一次
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

          if (attempts < maxAttempts) {
            setTimeout(poll, 2000);
          } else {
            reject(new Error("同步超时"));
          }
        } catch (error) {
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

      if (data.running) {
        setSyncRunning(true);

        const phaseNames: Record<string, string> = {
          quotes: "实时行情",
          klines: "K线数据",
          stock_info: "基本信息",
          fundamental: "财务数据",
          guba: "股吧数据",
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
    addLog("info", "系统监控已启动");
    checkAndResumeSyncStatus();
  }, []);

  useEffect(() => {
    fetch("http://localhost:8000/api/industry/stocks")
      .then((r) => r.json())
      .then(
        (data: { quotes: Record<string, { code: string; name: string }> }) => {
          const stocks = Object.values(data.quotes);
          setAllStocks(stocks);
          const nameMap: Record<string, string> = {};
          stocks.forEach((stock) => {
            nameMap[stock.code] = stock.name;
          });
          setStockNameMap(nameMap);
        },
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (searchCode.trim().length === 0) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const query = searchCode.toLowerCase();
    const results = allStocks.filter(
      (stock) =>
        stock.code.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query),
    );

    setSearchResults(results.slice(0, 20));
    setShowSearchDropdown(results.length > 0);
  }, [searchCode, allStocks]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as HTMLElement)
      ) {
        setShowSearchDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!autoRefresh && !syncRunning) return;
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, syncRunning]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const getStatusIcon = (status: SyncTask["status"]) => {
    switch (status) {
      case "running":
        return <Loader2 size={16} className="animate-spin text-blue-400" />;
      case "success":
        return <CheckCircle size={16} className="text-green-400" />;
      case "failed":
        return <AlertCircle size={16} className="text-red-400" />;
      default:
        return <Clock size={16} className="text-gray-400" />;
    }
  };

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
              disabled={syncRunning}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                syncRunning
                  ? "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 shadow-lg",
              )}
            >
              <RefreshCw
                size={16}
                className={syncRunning ? "animate-spin" : ""}
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
            label="运行任务"
            value={
              Object.values(tasks).filter((t) => t.status === "running").length
            }
            color="green"
          />
          <StatCard
            icon={<CheckCircle size={20} />}
            label="成功任务"
            value={
              Object.values(tasks).filter((t) => t.status === "success").length
            }
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
                    • 股吧数据（公告/研报/资讯）：{stats.stocksByDataType.guba}/
                    {stats.totalStocks} 只股票
                  </div>
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

        {syncRunning && (
          <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-2 border-blue-500/50 rounded-xl p-5 animate-pulse">
            <div className="flex items-center gap-4">
              <Loader2
                size={32}
                className="animate-spin text-blue-400 shrink-0"
              />
              <div className="flex-1">
                <div className="text-lg font-bold text-blue-400 mb-1">
                  🔄 数据同步进行中...
                </div>
                <div className="text-sm text-[var(--text-secondary)]">
                  系统正在后台同步数据，您可以切换到其他页面，同步会继续进行。请查看下方日志了解详细进度。
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-400">
                  {Object.values(tasks).filter((t) => t.status === "running")
                    .length || "批量"}
                </div>
                <div className="text-xs text-[var(--text-tertiary)]">
                  任务运行中
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Category Stats */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5">
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">
            数据分类统计
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <CategoryStat
              label="公告"
              value={stats.categories.announcement}
              color="#3b82f6"
            />
            <CategoryStat
              label="研报"
              value={stats.categories.research}
              color="#8b5cf6"
            />
            <CategoryStat
              label="资讯"
              value={stats.categories.news}
              color="#10b981"
            />
          </div>
        </div>

        {/* Sync Control */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5">
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">
            数据同步控制
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <button
              onClick={() => triggerBatchSync("guba")}
              disabled={syncRunning}
              className="px-4 py-3 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/20 transition-all flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Database size={20} />
              <span>同步股吧数据</span>
              <span className="text-xs text-[var(--text-tertiary)]">
                公告/研报/资讯
              </span>
            </button>

            <button
              onClick={() => triggerBatchSync("guba_all")}
              disabled={syncRunning}
              className="px-4 py-3 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-sm font-medium hover:bg-cyan-500/20 transition-all flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MessageSquare size={20} />
              <span>同步全部讨论</span>
              <span className="text-xs text-[var(--text-tertiary)]">
                用户帖子+官方
              </span>
            </button>

            <button
              onClick={() => triggerBatchSync("quote")}
              disabled={syncRunning}
              className="px-4 py-3 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-lg text-sm font-medium hover:bg-purple-500/20 transition-all flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrendingUp size={20} />
              <span>同步实时行情</span>
              <span className="text-xs text-[var(--text-tertiary)]">
                价格/涨跌幅
              </span>
            </button>

            <button
              onClick={() => triggerBatchSync("stock_info")}
              disabled={syncRunning}
              className="px-4 py-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/20 transition-all flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Activity size={20} />
              <span>同步基本信息</span>
              <span className="text-xs text-[var(--text-tertiary)]">
                名称/行业
              </span>
            </button>

            <button
              onClick={() => triggerBatchSync("fundamental")}
              disabled={syncRunning}
              className="px-4 py-3 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-lg text-sm font-medium hover:bg-orange-500/20 transition-all flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle size={20} />
              <span>同步财务数据</span>
              <span className="text-xs text-[var(--text-tertiary)]">
                营收/利润
              </span>
            </button>
          </div>

          <div className="flex gap-3 mb-4">
            <div className="flex-1 relative" ref={searchInputRef}>
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
              />
              <input
                type="text"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                placeholder="搜索股票名称或代码单独同步股吧数据 (如: 中国巨石 或 600176)"
                className="w-full pl-10 pr-10 py-2.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchCode.trim()) {
                    if (searchResults.length > 0) {
                      triggerSync(searchResults[0].code);
                      setSearchCode("");
                      setShowSearchDropdown(false);
                    } else {
                      triggerSync(searchCode.trim());
                      setSearchCode("");
                    }
                  }
                }}
              />
              {searchCode && (
                <button
                  onClick={() => {
                    setSearchCode("");
                    setShowSearchDropdown(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X size={14} />
                </button>
              )}

              {showSearchDropdown && searchResults.length > 0 && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-xl max-h-80 overflow-y-auto z-50"
                  style={{
                    background: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  {searchResults.map((result) => (
                    <button
                      key={result.code}
                      onClick={() => {
                        triggerSync(result.code);
                        setSearchCode("");
                        setShowSearchDropdown(false);
                      }}
                      className="w-full px-4 py-2.5 text-left transition-colors border-b last:border-b-0 hover:bg-[var(--bg-tertiary)]"
                      style={{ borderColor: "var(--border-color)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="font-medium text-sm"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {result.name}
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {result.code}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                if (searchCode.trim()) {
                  if (searchResults.length > 0) {
                    triggerSync(searchResults[0].code);
                  } else {
                    triggerSync(searchCode.trim());
                  }
                  setSearchCode("");
                  setShowSearchDropdown(false);
                }
              }}
              disabled={syncRunning}
              className="px-6 py-2.5 bg-[var(--accent)] text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={16} />
              同步单个股票
            </button>
          </div>

          {syncRunning && (
            <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-2 border-blue-500/50 rounded-xl p-5">
              <div className="flex items-center gap-4">
                <Loader2
                  size={32}
                  className="animate-spin text-blue-400 shrink-0"
                />
                <div className="flex-1">
                  <div className="text-lg font-bold text-blue-400 mb-1 flex items-center gap-3">
                    🔄 数据同步进行中
                    {currentSyncInfo && (
                      <span className="text-sm font-normal text-[var(--text-secondary)]">
                        {currentSyncInfo.done}/{currentSyncInfo.total} (
                        {Math.round(currentSyncInfo.progress)}%)
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-[var(--text-secondary)] mb-2">
                    {currentSyncInfo ? (
                      <>
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
                      </>
                    ) : (
                      "系统正在后台同步数据，您可以切换到其他页面，同步会继续进行。"
                    )}
                  </div>
                  {currentSyncInfo && (
                    <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${currentSyncInfo.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Task List */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {Object.values(tasks).length === 0 ? (
              <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
                暂无同步任务
              </div>
            ) : (
              Object.values(tasks)
                .reverse()
                .map((task) => (
                  <div
                    key={task.code}
                    className="flex items-center gap-3 p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg"
                  >
                    {getStatusIcon(task.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {stockNameMap[task.code] && (
                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            {stockNameMap[task.code]}
                          </span>
                        )}
                        <span
                          className="text-sm text-[var(--text-secondary)]"
                          style={
                            !stockNameMap[task.code]
                              ? {
                                  fontWeight: 500,
                                  color: "var(--text-primary)",
                                }
                              : {}
                          }
                        >
                          {task.code}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {task.message}
                        </span>
                      </div>
                      {task.status === "running" && (
                        <div className="mt-2 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-tertiary)]">
                      {task.startTime &&
                        new Date(task.startTime).toLocaleTimeString("zh-CN", {
                          hour12: false,
                        })}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* System Logs */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              系统日志
            </h2>
            <div className="flex gap-2">
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
            </div>
          </div>
          <div className="bg-[var(--bg-deep)] border border-[var(--border-color)] rounded-lg p-4 h-80 overflow-y-auto font-mono text-xs">
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

function CategoryStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold mb-1" style={{ color }}>
        {value.toLocaleString()}
      </div>
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
    </div>
  );
}
