"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  BarChart2,
  LineChart,
  Bot,
  TrendingUp,
  Activity,
  Globe,
  Star,
  Layers,
  DollarSign,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Suspense } from "react";

const INDUSTRY_LABELS: Record<string, string> = {
  overview: "全景概览",
  aigpu: "AI算力芯片",
  pcb: "PCB电路板",
  mlcc: "MLCC电容",
  memory: "存储芯片",
  optics: "光模块CPO",
  fiber: "光纤光缆",
  liquidcool: "液冷散热",
  aipower: "AI供配电",
  coppercable: "高速铜连接",
  idc: "智算中心",
  glasssub: "玻璃基板",
  aiserver: "AI服务器",
  semieq: "半导体设备",
};

const navItems = [
  {
    href: "/stock/search",
    label: "选股",
    icon: Search,
    match: (p: string) => p.startsWith("/stock/search"),
  },
  {
    href: "/industry",
    label: "产业分析",
    icon: BarChart2,
    match: (p: string) => p.startsWith("/industry"),
  },
  {
    href: "/stock/detail",
    label: "个股",
    icon: LineChart,
    match: (p: string) =>
      p.startsWith("/stock/") && !p.startsWith("/stock/search"),
  },
  {
    href: "/sw",
    label: "板块",
    icon: Layers,
    match: (p: string) => p.startsWith("/sw"),
  },
  {
    href: "/watchlist",
    label: "自选股",
    icon: Star,
    match: (p: string) => p.startsWith("/watchlist"),
  },
  {
    href: "/market",
    label: "资金流向",
    icon: DollarSign,
    match: (p: string) => p.startsWith("/market"),
  },
  {
    href: "/global",
    label: "全球",
    icon: Globe,
    match: (p: string) => p.startsWith("/global"),
  },
  {
    href: "/agents",
    label: "AI Agent",
    icon: Bot,
    match: (p: string) => p.startsWith("/agents"),
  },
  {
    href: "/system",
    label: "系统监控",
    icon: Activity,
    match: (p: string) => p.startsWith("/system"),
  },
];

// ── 面包屑构建：根据当前路径+URL参数生成导航层级 ──
interface Crumb {
  label: string;
  href: string;
  isActive?: boolean;
}

function buildBreadcrumbs(
  pathname: string,
  searchParams: URLSearchParams,
): Crumb[] {
  // 个股详情页 /stock/{code}
  if (pathname.startsWith("/stock/") && !pathname.startsWith("/stock/search")) {
    const code = pathname.split("/")[2];
    const fromPath = searchParams.get("from");
    const fromTab = searchParams.get("tab");
    const fromNode = searchParams.get("node");
    const fromSource = searchParams.get("src"); // "sw" | "sw_detail" | "watchlist"
    const fromBoardName = searchParams.get("bn"); // 板块名称（来自申万板块详情）
    const fromBoardCode = searchParams.get("bc"); // 板块代码

    const crumbs: Crumb[] = [];

    if (fromSource === "sw" && fromBoardCode) {
      // 板块列表 → 板块详情 → 个股
      crumbs.push({ label: "板块", href: "/sw" });
      crumbs.push({
        label: fromBoardName ?? fromBoardCode,
        href: `/sw/${fromBoardCode}`,
      });
    } else if (fromSource === "sw_list") {
      // 板块列表直接跳个股
      crumbs.push({ label: "板块", href: "/sw" });
    } else if (fromSource === "watchlist") {
      crumbs.push({ label: "自选股", href: "/watchlist" });
    } else if (fromPath?.startsWith("/industry/")) {
      const industryId = fromPath.split("/")[2];
      crumbs.push({ label: "产业分析", href: "/industry" });
      const industryLabel = INDUSTRY_LABELS[industryId] ?? industryId;
      const parts: string[] = [];
      if (fromTab) parts.push(`tab=${fromTab}`);
      if (fromNode) parts.push(`node=${fromNode}`);
      const query = parts.length ? `?${parts.join("&")}` : "";
      crumbs.push({ label: industryLabel, href: `${fromPath}${query}` });
    } else {
      crumbs.push({ label: "选股", href: "/stock/search" });
    }

    crumbs.push({ label: code, href: pathname, isActive: true });
    return crumbs;
  }

  // 申万板块详情 /sw/{code}
  if (pathname.startsWith("/sw/") && pathname !== "/sw/") {
    const fromBoardName = searchParams.get("bn");
    crumbs: {
      return [
        { label: "板块", href: "/sw" },
        {
          label: fromBoardName ?? pathname.split("/")[2],
          href: pathname,
          isActive: true,
        },
      ];
    }
  }

  // 产业详情 /industry/{name}
  if (pathname.startsWith("/industry/") && pathname !== "/industry/") {
    const name = pathname.split("/")[2];
    const fromIndustry = searchParams.get("from");
    const crumbs: Crumb[] = [{ label: "产业分析", href: "/industry" }];
    if (fromIndustry) {
      crumbs.push({
        label: INDUSTRY_LABELS[fromIndustry] ?? fromIndustry,
        href: `/industry/${fromIndustry}`,
      });
    }
    crumbs.push({
      label: INDUSTRY_LABELS[name] ?? name,
      href: pathname,
      isActive: true,
    });
    return crumbs;
  }

  return [];
}

function BreadcrumbNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const crumbs = buildBreadcrumbs(pathname, searchParams);

  if (crumbs.length === 0) return null;

  return (
    <div
      className="w-full px-1.5 py-2 border-t mt-1"
      style={{ borderColor: "var(--border-color)" }}
    >
      <div className="flex flex-col gap-0.5">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <div key={crumb.href + idx} className="flex items-center">
              {idx > 0 && (
                <ChevronRight
                  size={8}
                  className="text-[var(--text-tertiary)] mr-0.5 flex-shrink-0"
                />
              )}
              {crumb.isActive ? (
                <span
                  className="text-[9px] font-medium truncate max-w-[48px]"
                  style={{ color: "var(--accent)" }}
                  title={crumb.label}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-[9px] truncate max-w-[48px] hover:underline transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                  title={crumb.label}
                >
                  {crumb.label}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-16 flex flex-col items-center border-r py-4 shrink-0"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="mb-6 flex flex-col items-center">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#f5a623] to-[#e8831a] flex items-center justify-center">
          <TrendingUp size={20} className="text-[var(--text-primary)]" />
        </div>
      </div>

      <nav className="flex flex-col items-center gap-1 w-full px-2">
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "w-full flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] transition-all",
                active
                  ? "text-[var(--accent)]"
                  : "hover:text-[var(--text-secondary)]",
              )}
              style={active ? { background: "var(--bg-tertiary)" } : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 导航面包屑：显示当前页面的层级路径 */}
      <Suspense fallback={null}>
        <BreadcrumbNav />
      </Suspense>

      {/* 换肤按钮放在 sidebar 底部，不遮挡任何页面内容 */}
      <div className="mt-auto pt-4">
        <ThemeToggle sidebar />
      </div>
    </aside>
  );
}
