"use client";

import { useTheme } from "@/app/theme-provider";
import { Moon, Sun } from "lucide-react";

interface Props {
  sidebar?: boolean;
}

export function ThemeToggle({ sidebar }: Props) {
  const { theme, toggleTheme } = useTheme();

  if (sidebar) {
    return (
      <button
        onClick={toggleTheme}
        title={theme === "dark" ? "切换为白天模式" : "切换为夜间模式"}
        className="w-9 h-9 rounded-lg border flex items-center justify-center transition-all"
        style={{
          background: "var(--bg-tertiary)",
          borderColor: "var(--border-color)",
        }}
        aria-label="切换主题"
      >
        {theme === "dark" ? (
          <Sun size={16} style={{ color: "var(--accent)" }} />
        ) : (
          <Moon size={16} style={{ color: "var(--text-secondary)" }} />
        )}
      </button>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
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
