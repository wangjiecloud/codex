"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, BarChart2, LineChart, Bot, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

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
    href: "/agents",
    label: "AI Agent",
    icon: Bot,
    match: (p: string) => p.startsWith("/agents"),
  },
];

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
          <TrendingUp size={20} className="text-white" />
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
                active ? "text-[#f5a623]" : "hover:text-gray-300",
              )}
              style={active ? { background: "var(--bg-tertiary)" } : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
