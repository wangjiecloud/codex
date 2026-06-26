"use client";

import { useTheme } from "@/app/theme-provider";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="fixed top-6 right-6 z-50 p-3 rounded-full border transition-all shadow-lg"
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
  );
}
