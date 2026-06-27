"use client";

import { useTheme } from "@/app/theme-provider";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="fixed top-6 right-6 z-50 flex items-center gap-2">
      <button
        onClick={toggleTheme}
        title={theme === "dark" ? "切换为白天模式" : "切换为夜间模式"}
        className="p-3 rounded-full border transition-all shadow-lg"
        style={{
          background: "var(--bg-tertiary)",
          borderColor: "var(--border-color)",
        }}
        aria-label="切换主题"
      >
        {theme === "dark" ? (
          <Sun size={20} style={{ color: "var(--accent)" }} />
        ) : (
          <Moon size={20} style={{ color: "var(--text-secondary)" }} />
        )}
      </button>
    </div>
  );
}
