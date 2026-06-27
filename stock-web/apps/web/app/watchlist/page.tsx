"use client";

import { useState } from "react";
import { Star, DollarSign } from "lucide-react";
import { WatchlistPanel } from "@/components/watchlist/WatchlistPanel";
import { PortfolioPanel } from "@/components/watchlist/PortfolioPanel";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "watchlist", label: "自选股", icon: Star },
  { key: "portfolio", label: "持仓", icon: DollarSign },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("watchlist");

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
        {activeTab === "watchlist" && <WatchlistPanel />}
        {activeTab === "portfolio" && <PortfolioPanel />}
      </div>
    </div>
  );
}
