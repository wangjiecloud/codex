"use client";

import { useState, useEffect } from "react";
import { Star, DollarSign, Layers } from "lucide-react";
import { WatchlistPanel } from "@/components/watchlist/WatchlistPanel";
import { PortfolioPanel } from "@/components/watchlist/PortfolioPanel";
import { CustomWatchlistPanel } from "@/components/watchlist/CustomWatchlistPanel";
import { cn } from "@/lib/utils";
import { saveWatchlistPageState, loadWatchlistPageState } from "@/lib/navStore";

const TABS = [
  { key: "industry", label: "产业股", icon: Layers },
  { key: "watchlist", label: "自选股", icon: Star },
  { key: "portfolio", label: "持仓", icon: DollarSign },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("industry");
  const [mounted, setMounted] = useState(false);

  // 客户端挂载后恢复 sessionStorage 状态
  useEffect(() => {
    const s = loadWatchlistPageState();
    if (s?.activeTab) setActiveTab(s.activeTab as TabKey);
    setMounted(true);
  }, []);

  // 仅在挂载后（用户主动切换时）才持久化，避免覆盖已保存的值
  useEffect(() => {
    if (!mounted) return;
    saveWatchlistPageState({ activeTab });
  }, [activeTab, mounted]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0 px-4 pt-3 gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.key
                ? "text-[var(--accent)] border-[var(--accent)]"
                : "text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)]",
            )}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "industry" && <WatchlistPanel />}
        {activeTab === "watchlist" && <CustomWatchlistPanel />}
        {activeTab === "portfolio" && <PortfolioPanel />}
      </div>
    </div>
  );
}
