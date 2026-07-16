/**
 * navStore.ts
 * 导航状态管理：使用 sessionStorage 持久化各页面的 UI 状态，
 * 使得用户从详情页返回列表页时，能精确恢复上次的位置和状态。
 */

// ─────────────────────────────────────────
// SW 板块列表页状态
// ─────────────────────────────────────────
export interface SwPageState {
  sortKey: string;
  sortOrder: "asc" | "desc";
  selectedBoardCode: string | null;
  boardNameFilter: string;
  onlyIndustryBoards: boolean;
  topHeight: number;
  scrollTop: number; // 板块列表区域滚动位置
  listExpandedL1: string[];
  listExpandedL2: string[];
  listExpandedL3: string[];
  // 右侧成分股区域
  consSortKey: string;
  consSortOrder: "asc" | "desc";
  consScrollTop: number;
  // 高亮来源：从个股详情返回时，高亮对应的股票
  highlightStockCode: string | null;
}

const SW_STATE_KEY = "sw_page_state";
const SW_CONS_SCROLL_KEY = "sw_cons_scroll";

export function saveSwPageState(state: Partial<SwPageState>) {
  try {
    const prev = loadSwPageState();
    sessionStorage.setItem(SW_STATE_KEY, JSON.stringify({ ...prev, ...state }));
  } catch {}
}

export function loadSwPageState(): SwPageState | null {
  try {
    const raw = sessionStorage.getItem(SW_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSwHighlight() {
  try {
    const prev = loadSwPageState();
    if (prev) {
      prev.highlightStockCode = null;
      sessionStorage.setItem(SW_STATE_KEY, JSON.stringify(prev));
    }
  } catch {}
}

// ─────────────────────────────────────────
// SW 板块详情页状态（/sw/[code]）
// ─────────────────────────────────────────
export interface SwDetailPageState {
  sortKey: string;
  sortOrder: "asc" | "desc";
  scrollTop: number;
  // 来源信息：从哪个板块进来的
  fromBoardCode: string | null;
  fromBoardName: string | null;
}

const SW_DETAIL_STATE_KEY = "sw_detail_page_state";

export function saveSwDetailPageState(state: Partial<SwDetailPageState>) {
  try {
    const prev = loadSwDetailPageState();
    sessionStorage.setItem(
      SW_DETAIL_STATE_KEY,
      JSON.stringify({ ...prev, ...state }),
    );
  } catch {}
}

export function loadSwDetailPageState(): SwDetailPageState | null {
  try {
    const raw = sessionStorage.getItem(SW_DETAIL_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────
// 选股页（/stock/search）状态
// ─────────────────────────────────────────
export interface StockSearchPageState {
  mainTab: string;
  sortMode: string;
  scrollTop: number;
}

const STOCK_SEARCH_STATE_KEY = "stock_search_page_state";

export function saveStockSearchPageState(state: Partial<StockSearchPageState>) {
  try {
    const prev = loadStockSearchPageState();
    sessionStorage.setItem(
      STOCK_SEARCH_STATE_KEY,
      JSON.stringify({ ...prev, ...state }),
    );
  } catch {}
}

export function loadStockSearchPageState(): StockSearchPageState | null {
  try {
    const raw = sessionStorage.getItem(STOCK_SEARCH_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────
// 自选股页（/watchlist）状态
// ─────────────────────────────────────────
export interface WatchlistPageState {
  activeTab: string; // "industry" | "watchlist" | "portfolio"
  // WatchlistPanel（产业股Tab）内部状态
  industryActiveId: string; // 当前选中的产业 ID，如 "optics"
  subGroupActiveId: string; // 当前选中的层级 Tab ID，如 "upstream" 或 "__all__"
  industryActiveName: string; // 当前产业名称（用于个股页面包屑显示）
  subGroupActiveName: string; // 当前层级名称（用于个股页面包屑显示）
  listScrollTop: number; // 股票列表滚动位置
}

const WATCHLIST_STATE_KEY = "watchlist_page_state";

export function saveWatchlistPageState(state: Partial<WatchlistPageState>) {
  try {
    const prev = loadWatchlistPageState();
    sessionStorage.setItem(
      WATCHLIST_STATE_KEY,
      JSON.stringify({ ...prev, ...state }),
    );
  } catch {}
}

export function loadWatchlistPageState(): WatchlistPageState | null {
  try {
    const raw = sessionStorage.getItem(WATCHLIST_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────
// 导航面包屑 breadcrumb 工具
// ─────────────────────────────────────────
export interface BreadcrumbItem {
  label: string;
  href: string;
}

/**
 * 根据 URL 参数和当前路径，构建面包屑层级
 */
export function buildStockDetailBreadcrumb(params: {
  code: string;
  stockName?: string;
  fromPath: string | null;
  fromTab: string | null;
  fromNode: string | null;
  fromBoardCode: string | null;
  fromBoardName: string | null;
  fromLabel: string | null;
  fromSource: string | null; // "sw" | "industry" | "watchlist" | "search" | null
}): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [];

  if (params.fromSource === "sw" && params.fromBoardCode) {
    // 来自申万板块列表 → 板块详情 → 个股
    crumbs.push({ label: "板块", href: "/sw" });
    crumbs.push({
      label: params.fromBoardName ?? params.fromBoardCode,
      href: `/sw/${params.fromBoardCode}?from=sw`,
    });
  } else if (params.fromSource === "sw_list") {
    // 来自申万板块列表（直接点击）
    crumbs.push({ label: "板块", href: "/sw" });
  } else if (params.fromPath?.startsWith("/industry/")) {
    // 来自产业详情
    crumbs.push({ label: "产业分析", href: "/industry" });
    if (params.fromLabel) {
      const parts: string[] = [];
      if (params.fromTab) parts.push(`tab=${params.fromTab}`);
      if (params.fromNode) parts.push(`node=${params.fromNode}`);
      const query = parts.length > 0 ? `?${parts.join("&")}` : "";
      crumbs.push({
        label: params.fromLabel,
        href: `${params.fromPath}${query}`,
      });
    }
  } else if (params.fromSource === "watchlist") {
    crumbs.push({ label: "自选股", href: "/watchlist" });
  } else {
    crumbs.push({ label: "选股", href: "/stock/search" });
  }

  crumbs.push({
    label: params.stockName ?? params.code,
    href: `/stock/${params.code}`,
  });

  return crumbs;
}
