"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  RefreshCw,
  GripVertical,
  ArrowRightLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────
   行业大类映射表
   key = 申万行业名称（含 Ⅱ 后缀），value = 大类名称
───────────────────────────────────────────── */
const INDUSTRY_CATEGORY_MAP: Record<string, string> = {
  // 医药
  化学制药: "医药",
  医疗服务: "医药",
  医疗器械: "医药",
  生物制品: "医药",
  中药Ⅱ: "医药",
  医药商业: "医药",
  动物保健Ⅱ: "医药",

  // 科技
  半导体: "科技",
  软件开发: "科技",
  IT服务Ⅱ: "科技",
  计算机设备: "科技",
  通信设备: "科技",
  通信服务: "科技",
  消费电子: "科技",
  光学光电子: "科技",
  电子化学品Ⅱ: "科技",
  其他电子Ⅱ: "科技",
  军工电子Ⅱ: "科技",
  数字媒体: "科技",
  游戏Ⅱ: "科技",
  互联网电商: "科技",

  // 新能源
  电池: "新能源",
  光伏设备: "新能源",
  风电设备: "新能源",
  电网设备: "新能源",
  其他电源设备Ⅱ: "新能源",
  能源金属: "新能源",
  电机Ⅱ: "新能源",

  // 军工
  航天装备Ⅱ: "军工",
  航空装备Ⅱ: "军工",
  航海装备Ⅱ: "军工",
  地面兵装Ⅱ: "军工",

  // 金融
  国有大型银行Ⅱ: "金融",
  股份制银行Ⅱ: "金融",
  城商行Ⅱ: "金融",
  农商行Ⅱ: "金融",
  保险Ⅱ: "金融",
  多元金融: "金融",
  证券Ⅱ: "金融",

  // 消费
  白酒Ⅱ: "消费",
  非白酒: "消费",
  食品加工: "消费",
  饮料乳品: "消费",
  休闲食品: "消费",
  调味发酵品Ⅱ: "消费",
  农产品加工: "消费",
  白色家电: "消费",
  黑色家电: "消费",
  厨卫电器: "消费",
  小家电: "消费",
  家居用品: "消费",
  服装家纺: "消费",
  个护用品: "消费",
  化妆品: "消费",
  饰品: "消费",
  一般零售: "消费",
  专业连锁Ⅱ: "消费",
  酒店餐饮: "消费",
  旅游及景区: "消费",

  // 工业
  通用设备: "工业",
  专用设备: "工业",
  自动化设备: "工业",
  工程机械: "工业",
  轨交设备Ⅱ: "工业",
  航运港口: "工业",
  航空机场: "工业",
  铁路公路: "工业",
  物流: "工业",
  工程咨询服务Ⅱ: "工业",
  专业工程: "工业",
  基础建设: "工业",
  房屋建设Ⅱ: "工业",
  装修装饰Ⅱ: "工业",
  装修建材: "工业",

  // 材料
  工业金属: "材料",
  小金属: "材料",
  贵金属: "材料",
  金属新材料: "材料",
  冶钢原料: "材料",
  普钢: "材料",
  特钢Ⅱ: "材料",
  化学原料: "材料",
  化学制品: "材料",
  化学纤维: "材料",
  橡胶: "材料",
  塑料: "材料",
  玻璃玻纤: "材料",
  非金属材料Ⅱ: "材料",
  包装印刷: "材料",
  造纸: "材料",
  水泥: "材料",
  元件: "材料",

  // 能源
  煤炭开采: "能源",
  炼化及贸易: "能源",
  油服工程: "能源",
  焦炭Ⅱ: "能源",
  电力: "能源",
  燃气Ⅱ: "能源",

  // 农业
  养殖业: "农业",
  种植业: "农业",
  渔业: "农业",
  饲料: "农业",
  农化制品: "农业",

  // 汽车
  乘用车: "汽车",
  商用车: "汽车",
  汽车零部件: "汽车",
  汽车服务: "汽车",
  摩托车及其他: "汽车",

  // 地产
  房地产开发: "地产",
  房地产服务: "地产",

  // 环保
  环保设备Ⅱ: "环保",
  环境治理: "环保",

  // 传媒
  出版: "传媒",
  影视院线: "传媒",
  电视广播Ⅱ: "传媒",
  广告营销: "传媒",
  教育: "传媒",
  文娱用品: "传媒",

  // 纺织
  纺织制造: "纺织",

  // 其他
  综合Ⅱ: "其他",
  贸易Ⅱ: "其他",
  照明设备Ⅱ: "其他",
  专业服务: "其他",
};

/**
 * 根据申万行业名称获取大类
 */
function getCategory(industry: string): string {
  // 直接匹配
  if (INDUSTRY_CATEGORY_MAP[industry]) return INDUSTRY_CATEGORY_MAP[industry];
  // 去掉 Ⅱ 后缀再匹配
  const stripped = industry.replace(/[ⅡII]+$/, "").trim();
  if (INDUSTRY_CATEGORY_MAP[stripped]) return INDUSTRY_CATEGORY_MAP[stripped];
  // 产业链/供应链 -> 科技
  if (
    industry.includes("供应链") ||
    industry.includes("产业链") ||
    industry.includes("全景概览")
  ) {
    return "科技";
  }
  return "其他";
}

const API = "http://localhost:8000";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface StockQuote {
  code: string;
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
  amplitude: number;
}

interface SearchResult {
  code: string;
  name: string;
  market: string;
}

interface IndustryGroup {
  industry: string;
  stocks: StockQuote[];
  expanded: boolean;
  avgChange: number;
}

/* ─────────────────────────────────────────────
   Formatting helpers
───────────────────────────────────────────── */
function fmtAmt(n: number): string {
  if (!n || isNaN(n)) return "--";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "万亿";
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(2) + "万";
  return n.toFixed(0);
}

function pctColor(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return "text-[var(--text-tertiary)]";
  if (v > 0) return "text-[#e84444]";
  if (v < 0) return "text-[#09d464]";
  return "text-[var(--text-tertiary)]";
}

function fmtPct(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return "--";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

function fmtNum(v: number | undefined | null, d = 2): string {
  if (v == null || isNaN(v) || v === 0) return "--";
  return v.toFixed(d);
}

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */
export function CustomWatchlistPanel() {
  const router = useRouter();
  const [watchlistCodes, setWatchlistCodes] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [industryGroups, setIndustryGroups] = useState<IndustryGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("全部");
  // 自定义分类覆盖：{ industry名 -> 自定义分类名 }
  const [categoryOverrides, setCategoryOverrides] = useState<
    Record<string, string>
  >({});
  // 当前展开移动菜单的板块名
  const [movingIndustry, setMovingIndustry] = useState<string | null>(null);
  const moveMenuRef = useRef<HTMLDivElement>(null);

  // 关闭移动菜单（点击外部）
  useEffect(() => {
    if (!movingIndustry) return;
    const handleClick = (e: MouseEvent) => {
      if (
        moveMenuRef.current &&
        !moveMenuRef.current.contains(e.target as Node)
      ) {
        setMovingIndustry(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [movingIndustry]);

  // 加载 categoryOverrides
  useEffect(() => {
    try {
      const saved = localStorage.getItem("industry-category-overrides");
      if (saved) setCategoryOverrides(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  // 获取板块的有效分类（优先用自定义覆盖）
  const getEffectiveCategory = useCallback(
    (industry: string): string => {
      if (categoryOverrides[industry]) return categoryOverrides[industry];
      return getCategory(industry);
    },
    [categoryOverrides],
  );

  // 移动板块到目标分类
  const moveGroupToCategory = useCallback(
    (industry: string, targetCategory: string) => {
      const newOverrides = { ...categoryOverrides, [industry]: targetCategory };
      setCategoryOverrides(newOverrides);
      localStorage.setItem(
        "industry-category-overrides",
        JSON.stringify(newOverrides),
      );
      setMovingIndustry(null);

      // 原分类是否还有板块？若无则切回全部
      const oldCategory = getEffectiveCategory(industry);
      if (oldCategory !== targetCategory && activeCategory === oldCategory) {
        // 检查移动后原分类下是否还有其他板块
        const remainingInOld = industryGroups.some(
          (g) =>
            g.industry !== industry &&
            (newOverrides[g.industry] ?? getCategory(g.industry)) ===
              oldCategory,
        );
        if (!remainingInOld) {
          setActiveCategory("全部");
        }
      }
    },
    [categoryOverrides, getEffectiveCategory, activeCategory, industryGroups],
  );

  // 计算各大类的平均涨跌幅，用于 Tab 标题
  const categoryTabs = useMemo(() => {
    if (industryGroups.length === 0) return [{ name: "全部", avgChange: null }];

    const catMap = new Map<string, { totalChange: number; count: number }>();
    industryGroups.forEach((g) => {
      const cat = categoryOverrides[g.industry] ?? getCategory(g.industry);
      if (!catMap.has(cat)) catMap.set(cat, { totalChange: 0, count: 0 });
      const entry = catMap.get(cat)!;
      entry.totalChange += g.avgChange * g.stocks.length;
      entry.count += g.stocks.length;
    });

    const tabs: { name: string; avgChange: number }[] = Array.from(
      catMap.entries(),
    ).map(([name, { totalChange, count }]) => ({
      name,
      avgChange: count > 0 ? totalChange / count : 0,
    }));
    tabs.sort((a, b) => b.avgChange - a.avgChange);

    return [{ name: "全部", avgChange: null as number | null }, ...tabs];
  }, [industryGroups, categoryOverrides]);

  // 所有现有的分类名（不含"全部"），用于移动菜单
  const availableCategories = useMemo(
    () => categoryTabs.filter((t) => t.name !== "全部").map((t) => t.name),
    [categoryTabs],
  );

  // 过滤后的 groups（根据当前 Tab）
  const filteredGroups = useMemo(() => {
    if (activeCategory === "全部") return industryGroups;
    return industryGroups.filter(
      (g) =>
        (categoryOverrides[g.industry] ?? getCategory(g.industry)) ===
        activeCategory,
    );
  }, [industryGroups, activeCategory, categoryOverrides]);

  // Load watchlist from API（首次加载时自动迁移 localStorage 旧数据）
  useEffect(() => {
    const INIT_FLAG = "watchlist-popular-injected-v1";
    const MIGRATE_FLAG = "watchlist-migrated-to-db-v1";

    const loadAndMigrate = async () => {
      // 1. 先从 API 拉取数据库中的自选股
      let dbCodes: string[] = [];
      try {
        const res = await fetch(`${API}/api/watchlist`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          dbCodes = data.codes || [];
        }
      } catch {
        // API 不可用时降级读 localStorage
        const saved = localStorage.getItem("custom-watchlist");
        if (saved) {
          try {
            dbCodes = JSON.parse(saved) as string[];
          } catch {
            dbCodes = [];
          }
        }
        setWatchlistCodes(dbCodes);
        return;
      }

      // 2. 如果数据库已有数据，直接使用
      if (dbCodes.length > 0) {
        setWatchlistCodes(dbCodes);
        return;
      }

      // 3. 数据库为空：尝试从 localStorage 迁移旧数据
      const alreadyMigrated = localStorage.getItem(MIGRATE_FLAG);
      const savedLocal = localStorage.getItem("custom-watchlist");
      let localCodes: string[] = [];
      if (savedLocal) {
        try {
          localCodes = JSON.parse(savedLocal) as string[];
        } catch {
          localCodes = [];
        }
      }

      if (!alreadyMigrated && localCodes.length > 0) {
        // 把 localStorage 数据迁移到数据库
        try {
          await fetch(`${API}/api/watchlist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codes: localCodes }),
          });
          localStorage.setItem(MIGRATE_FLAG, "1");
          setWatchlistCodes(localCodes);
        } catch {
          setWatchlistCodes(localCodes);
        }
        return;
      }

      // 4. 完全空白且未注入过人气榜：首次自动注入
      const alreadyInjected = localStorage.getItem(INIT_FLAG);
      if (!alreadyInjected) {
        try {
          const r = await fetch(`${API}/api/theme/popular-stocks?sort=hot`, {
            cache: "no-store",
          });
          const data = await r.json();
          const popularCodes: string[] = (data.stocks || []).map(
            (s: { code: string }) => s.code,
          );
          await fetch(`${API}/api/watchlist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codes: popularCodes }),
          });
          localStorage.setItem(INIT_FLAG, "1");
          setWatchlistCodes(popularCodes);
        } catch {
          setWatchlistCodes([]);
        }
      } else {
        setWatchlistCodes([]);
      }
    };

    loadAndMigrate();
  }, []);

  // Fetch quotes for watchlist stocks
  useEffect(() => {
    if (watchlistCodes.length === 0) {
      setQuotes([]);
      setIndustryGroups([]);
      return;
    }

    const fetchQuotes = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        watchlistCodes.forEach((code) => params.append("codes", code));
        const res = await fetch(`${API}/api/quote/batch?${params}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setQuotes(data.quotes || []);
        }
      } catch (err) {
        console.error("Failed to fetch quotes:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, 3000);
    return () => clearInterval(interval);
  }, [watchlistCodes]);

  // Group quotes by industry
  useEffect(() => {
    if (quotes.length === 0) {
      setIndustryGroups([]);
      return;
    }

    const fetchIndustries = async () => {
      try {
        // 获取每只股票的行业信息
        const params = new URLSearchParams();
        quotes.forEach((q) => params.append("codes", q.code));
        const res = await fetch(`${API}/api/quote/industries?${params}`, {
          cache: "no-store",
        });

        if (res.ok) {
          const data = await res.json();
          const industryMap = new Map<string, StockQuote[]>();

          quotes.forEach((quote) => {
            const industry = data[quote.code] || "未分类";
            if (!industryMap.has(industry)) {
              industryMap.set(industry, []);
            }
            industryMap.get(industry)!.push(quote);
          });

          let groups: IndustryGroup[] = Array.from(industryMap.entries()).map(
            ([industry, stocks]) => {
              const avgChange =
                stocks.reduce((sum, s) => sum + (s.change || 0), 0) /
                stocks.length;
              return {
                industry,
                stocks: stocks.sort(
                  (a, b) => (b.change || 0) - (a.change || 0),
                ),
                expanded: true,
                avgChange,
              };
            },
          );

          // 先按平均涨跌幅排序
          groups.sort((a, b) => b.avgChange - a.avgChange);

          // 尝试从 localStorage 恢复用户自定义顺序
          const savedOrder = localStorage.getItem("industry-groups-order");
          if (savedOrder) {
            try {
              const orderMap = JSON.parse(savedOrder) as string[];
              groups = groups.sort((a, b) => {
                const aIndex = orderMap.indexOf(a.industry);
                const bIndex = orderMap.indexOf(b.industry);
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
              });
            } catch {
              // 忽略错误，使用默认排序
            }
          }

          setIndustryGroups(groups);
        } else {
          // Fallback: 所有股票归到"未分类"
          setIndustryGroups([
            {
              industry: "未分类",
              stocks: [...quotes].sort(
                (a, b) => (b.change || 0) - (a.change || 0),
              ),
              expanded: true,
              avgChange:
                quotes.reduce((sum, s) => sum + (s.change || 0), 0) /
                quotes.length,
            },
          ]);
        }
      } catch {
        // Fallback
        setIndustryGroups([
          {
            industry: "未分类",
            stocks: [...quotes].sort(
              (a, b) => (b.change || 0) - (a.change || 0),
            ),
            expanded: true,
            avgChange:
              quotes.reduce((sum, s) => sum + (s.change || 0), 0) /
              quotes.length,
          },
        ]);
      }
    };

    fetchIndustries();
  }, [quotes]);

  // Search stocks with debounce
  useEffect(() => {
    if (!searchText.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/api/quote/search?q=${encodeURIComponent(searchText)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setSearchLoading(false);
      }
    }, 300); // 300ms 防抖

    return () => clearTimeout(timeoutId);
  }, [searchText]);

  const addStock = async (code: string) => {
    if (!watchlistCodes.includes(code)) {
      try {
        await fetch(`${API}/api/watchlist/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
      } catch {
        // ignore
      }
      setWatchlistCodes([...watchlistCodes, code]);
    }
    setShowAddModal(false);
    setSearchText("");
    setSearchResults([]);
  };

  const removeStock = async (code: string) => {
    try {
      await fetch(`${API}/api/watchlist/${code}`, { method: "DELETE" });
    } catch {
      // ignore
    }
    setWatchlistCodes(watchlistCodes.filter((c) => c !== code));
  };

  const toggleGroup = (industry: string) => {
    setIndustryGroups(
      industryGroups.map((g) =>
        g.industry === industry ? { ...g, expanded: !g.expanded } : g,
      ),
    );
  };

  const navigateToStock = (code: string) => {
    router.push(`/stock/${code}?src=watchlist`);
  };

  // 拖拽处理函数
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // 添加半透明效果
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIndex(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    // 拖拽操作基于 filteredGroups（当前可见的列表）
    // 需要把 filteredGroups 中的 index 映射回 industryGroups 中的真实 index
    const draggedGroup = filteredGroups[draggedIndex];
    const dropGroup = filteredGroups[dropIndex];

    const realDraggedIdx = industryGroups.findIndex(
      (g) => g.industry === draggedGroup.industry,
    );
    const realDropIdx = industryGroups.findIndex(
      (g) => g.industry === dropGroup.industry,
    );

    if (realDraggedIdx === -1 || realDropIdx === -1) return;

    const newGroups = [...industryGroups];
    const [draggedItem] = newGroups.splice(realDraggedIdx, 1);
    newGroups.splice(realDropIdx, 0, draggedItem);
    setIndustryGroups(newGroups);

    // 保存顺序到 localStorage
    const orderMap = newGroups.map((g) => g.industry);
    localStorage.setItem("industry-groups-order", JSON.stringify(orderMap));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
        <span className="text-[12px] font-medium text-[var(--text-primary)]">
          自选股 ({watchlistCodes.length})
        </span>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] rounded bg-[var(--accent)] text-black hover:opacity-90 transition-opacity"
        >
          <Plus size={11} />
          添加
        </button>
        {/* 分类 Tabs */}
        {categoryTabs.length > 1 && (
          <div className="flex items-center gap-1 ml-2 flex-1 overflow-x-auto scrollbar-none">
            {categoryTabs.map((tab) => {
              const isActive = activeCategory === tab.name;
              const pctStr =
                tab.avgChange != null
                  ? (tab.avgChange >= 0 ? "+" : "") +
                    tab.avgChange.toFixed(1) +
                    "%"
                  : null;
              const pctCls =
                tab.avgChange == null
                  ? ""
                  : tab.avgChange > 0
                    ? "text-[#e84444]"
                    : tab.avgChange < 0
                      ? "text-[#09d464]"
                      : "text-[var(--text-tertiary)]";
              return (
                <button
                  key={tab.name}
                  onClick={() => setActiveCategory(tab.name)}
                  className={cn(
                    "flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors flex-shrink-0",
                    isActive
                      ? "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent",
                  )}
                >
                  <span>{tab.name}</span>
                  {pctStr && (
                    <span className={cn("font-mono font-medium", pctCls)}>
                      {pctStr}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5 text-[9px] text-[var(--text-tertiary)] flex-shrink-0">
          {loading && (
            <>
              <RefreshCw size={10} className="animate-spin" />
              刷新中...
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {watchlistCodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-tertiary)]">
            <span className="text-[13px]">暂无自选股</span>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] rounded border border-[var(--border-color)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              <Plus size={12} />
              添加第一只股票
            </button>
          </div>
        ) : (
          <div className="p-2">
            {/* Masonry layout using CSS columns */}
            <div
              style={{
                columnCount: "auto",
                columnWidth: "260px",
                columnGap: "8px",
              }}
            >
              {filteredGroups.map((group, index) => {
                // 判断是否为产业链（包含"供应链"、"产业链"关键字）
                const isIndustryChain =
                  group.industry.includes("供应链") ||
                  group.industry.includes("产业链") ||
                  group.industry.includes("全景概览");

                return (
                  <div
                    key={group.industry}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    style={{ breakInside: "avoid", marginBottom: "8px" }}
                    className={cn(
                      "border rounded overflow-hidden flex flex-col cursor-move transition-opacity",
                      isIndustryChain
                        ? "border-[#e8a235]/40 bg-[#e8a235]/5"
                        : "border-[var(--border-color)]",
                      draggedIndex === index && "opacity-50",
                    )}
                  >
                    {/* Industry Header */}
                    <div
                      className={cn(
                        "group/header flex items-center gap-1 px-1.5 py-1 transition-colors",
                        isIndustryChain
                          ? "bg-[#e8a235]/15 border-b border-[#e8a235]/30"
                          : "bg-[var(--bg-tertiary,#2a2a2a)] border-b border-[var(--border-color)]",
                      )}
                    >
                      <GripVertical
                        size={11}
                        className="text-[var(--text-tertiary)] cursor-move flex-shrink-0 hover:text-[var(--text-secondary)]"
                      />
                      <div
                        onClick={() => toggleGroup(group.industry)}
                        className="flex items-center gap-1 flex-1 cursor-pointer hover:opacity-80 transition-opacity min-w-0"
                      >
                        {group.expanded ? (
                          <ChevronDown
                            size={11}
                            className={cn(
                              "flex-shrink-0",
                              isIndustryChain
                                ? "text-[#e8a235]"
                                : "text-[var(--text-secondary)]",
                            )}
                          />
                        ) : (
                          <ChevronRight
                            size={11}
                            className={cn(
                              "flex-shrink-0",
                              isIndustryChain
                                ? "text-[#e8a235]"
                                : "text-[var(--text-secondary)]",
                            )}
                          />
                        )}
                        <span
                          className={cn(
                            "text-[11px] font-semibold truncate",
                            isIndustryChain
                              ? "text-[#e8a235]"
                              : "text-[var(--text-primary)]",
                          )}
                        >
                          {group.industry}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-[12px] font-mono font-bold flex-shrink-0",
                          pctColor(group.avgChange),
                        )}
                      >
                        {fmtPct(group.avgChange)}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] flex-shrink-0 px-1 py-0 rounded",
                          isIndustryChain
                            ? "text-[#e8a235]/80 bg-[#e8a235]/10"
                            : "text-[var(--text-tertiary)] bg-[var(--bg-secondary)]",
                        )}
                      >
                        {group.stocks.length}
                      </span>

                      {/* 移动到其他分类按钮 */}
                      <div
                        className="relative flex-shrink-0"
                        ref={
                          movingIndustry === group.industry
                            ? moveMenuRef
                            : undefined
                        }
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMovingIndustry(
                              movingIndustry === group.industry
                                ? null
                                : group.industry,
                            );
                          }}
                          title="移动到其他分类"
                          className={cn(
                            "p-0.5 rounded transition-colors",
                            movingIndustry === group.industry
                              ? "text-[var(--accent)] bg-[var(--accent)]/10"
                              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] opacity-0 group-hover/header:opacity-100",
                          )}
                        >
                          <ArrowRightLeft size={10} />
                        </button>

                        {/* 移动菜单 */}
                        {movingIndustry === group.industry && (
                          <div
                            className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-xl py-1 min-w-[110px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="px-2.5 py-1 text-[9px] text-[var(--text-tertiary)] border-b border-[var(--border-color)] mb-0.5">
                              移动到
                            </div>
                            {availableCategories
                              .filter(
                                (cat) =>
                                  cat !==
                                  (categoryOverrides[group.industry] ??
                                    getCategory(group.industry)),
                              )
                              .map((cat) => (
                                <button
                                  key={cat}
                                  onClick={() =>
                                    moveGroupToCategory(group.industry, cat)
                                  }
                                  className="w-full text-left px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                                >
                                  {cat}
                                </button>
                              ))}
                            {availableCategories.filter(
                              (cat) =>
                                cat !==
                                (categoryOverrides[group.industry] ??
                                  getCategory(group.industry)),
                            ).length === 0 && (
                              <div className="px-2.5 py-1.5 text-[10px] text-[var(--text-tertiary)]">
                                无其他分类
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stocks List — chip layout */}
                    {group.expanded && (
                      <div className="grid grid-cols-3 gap-1 p-1.5">
                        {group.stocks.map((stock) => (
                          <div
                            key={stock.code}
                            className="group relative flex items-center gap-0 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer overflow-hidden min-w-0"
                            onClick={() => navigateToStock(stock.code)}
                          >
                            {/* left color bar based on change */}
                            <div
                              className={cn(
                                "w-[3px] self-stretch flex-shrink-0",
                                stock.change > 0
                                  ? "bg-[#e84444]/70"
                                  : stock.change < 0
                                    ? "bg-[#26a69a]/70"
                                    : "bg-[var(--border-color)]",
                              )}
                            />
                            <div className="px-1.5 py-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-medium text-[var(--text-primary)] whitespace-nowrap">
                                  {stock.name}
                                </span>
                                <span className="text-[9px] text-[var(--text-tertiary)] font-mono">
                                  {stock.code.slice(-4)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] font-mono text-[var(--text-secondary)]">
                                  ¥{fmtNum(stock.price)}
                                </span>
                                <span
                                  className={cn(
                                    "text-[9px] font-mono font-medium",
                                    pctColor(stock.change),
                                  )}
                                >
                                  {fmtPct(stock.change)}
                                </span>
                              </div>
                            </div>
                            {/* delete button on hover */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeStock(stock.code);
                              }}
                              className="absolute top-0.5 right-0.5 p-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:text-[#e84444] transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={8} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add Stock Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => {
            setShowAddModal(false);
            setSearchText("");
            setSearchResults([]);
          }}
        >
          <div
            className="relative bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-2xl w-[480px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
              <span className="text-[13px] font-medium text-[var(--text-primary)]">
                添加自选股
              </span>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSearchText("");
                  setSearchResults([]);
                }}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Search Input with Dropdown */}
            <div className="p-4">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-[11px] text-[var(--text-tertiary)] z-10"
                />
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="搜索股票代码或名称..."
                  className="w-full pl-9 pr-3 py-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                  autoFocus
                />

                {/* Dropdown Results */}
                {searchText.trim() && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-[360px] overflow-auto z-20">
                    {searchLoading ? (
                      <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)] text-[11px]">
                        <RefreshCw size={12} className="animate-spin mr-1.5" />
                        搜索中...
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)] text-[11px]">
                        未找到相关股票
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border-color)]">
                        {searchResults.map((result) => {
                          const isAdded = watchlistCodes.includes(result.code);
                          return (
                            <div
                              key={result.code}
                              onClick={() => !isAdded && addStock(result.code)}
                              className={cn(
                                "flex items-center justify-between px-3 py-2 transition-colors",
                                isAdded
                                  ? "bg-[var(--bg-tertiary)] cursor-not-allowed opacity-50"
                                  : "cursor-pointer hover:bg-[var(--bg-hover)]",
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                                    {result.name}
                                  </span>
                                  <span className="text-[10px] text-[var(--text-tertiary)] font-mono flex-shrink-0">
                                    {result.code}
                                  </span>
                                </div>
                                <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                                  {result.market}
                                </div>
                              </div>
                              {isAdded && (
                                <span className="text-[10px] text-[var(--accent)] ml-2 flex-shrink-0">
                                  已添加
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tip */}
            <div className="px-4 pb-4 text-[11px] text-[var(--text-tertiary)]">
              输入股票代码或名称进行模糊搜索，点击添加到自选股
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
