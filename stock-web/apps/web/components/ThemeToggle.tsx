"use client";

import { useTheme } from "@/app/theme-provider";
import { Moon, Sun, Monitor, RefreshCw } from "lucide-react";
import { useState, useEffect, useRef } from "react";

function useSyncStatus() {
  const [status, setStatus] = useState<{
    running: boolean;
    total: number;
    done: number;
    current: string;
  }>({ running: false, total: 0, done: 0, current: "" });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      fetch("http://localhost:8000/api/sync/status")
        .then((r) => r.json())
        .then((d) => {
          setStatus({
            running: d.running,
            total: d.total,
            done: d.done,
            current: d.current,
          });
          if (!d.running && timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        })
        .catch(() => {});
    }, 2000);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const triggerSync = () => {
    fetch("http://localhost:8000/api/sync/all", { method: "POST" })
      .then((r) => r.json())
      .then(() => {
        setStatus((s) => ({ ...s, running: true }));
        startPolling();
      })
      .catch(() => {});
  };

  return { status, triggerSync };
}

export function ThemeToggle() {
  const { theme, isManual, toggleTheme, resetTheme } = useTheme();
  const { status, triggerSync } = useSyncStatus();

  const syncTitle = status.running
    ? `同步中 ${status.done}/${status.total}${status.current ? ` · ${status.current}` : ""}`
    : "同步股票行情和K线数据";

  return (
    <div className="fixed top-6 right-6 z-50 flex items-center gap-2">
      <button
        onClick={triggerSync}
        disabled={status.running}
        title={syncTitle}
        className="p-2 rounded-full border transition-all shadow-md"
        style={{
          background: "var(--bg-tertiary)",
          borderColor: "var(--border-color)",
          opacity: status.running ? 0.7 : 1,
        }}
      >
        <RefreshCw
          size={14}
          style={{ color: "var(--text-secondary)" }}
          className={status.running ? "animate-spin" : ""}
        />
      </button>
      {isManual && (
        <button
          onClick={resetTheme}
          title="恢复跟随系统"
          className="p-2 rounded-full border transition-all shadow-md opacity-60 hover:opacity-100"
          style={{
            background: "var(--bg-tertiary)",
            borderColor: "var(--border-color)",
          }}
        >
          <Monitor size={14} style={{ color: "var(--text-secondary)" }} />
        </button>
      )}
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
