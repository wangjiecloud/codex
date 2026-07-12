"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import MinuteChart, { MinuteBar } from "./MinuteChart";

const API = "";

interface MinuteChartModalProps {
  /** 是否显示弹框 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 股票代码 */
  code: string;
  /** 股票名称（可选，用于显示标题） */
  name?: string;
  /** K线日期 YYYY-MM-DD（双击的那根K线对应的日期） */
  date: string;
}

export default function MinuteChartModal({
  open,
  onClose,
  code,
  name,
  date,
}: MinuteChartModalProps) {
  const [bars, setBars] = useState<MinuteBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfRange, setOutOfRange] = useState(false);
  const [source, setSource] = useState<"cache" | "remote" | null>(null);
  const [barMode, setBarMode] = useState<"1min" | "5min">("1min");
  const backdropRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    if (!code || !date) return;
    setLoading(true);
    setError(null);
    setOutOfRange(false);
    try {
      const res = await fetch(`${API}/api/minute/${code}?date=${date}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = json.detail || `请求失败 ${res.status}`;
        if (res.status === 404) {
          setOutOfRange(true);
        } else {
          throw new Error(msg);
        }
        setBars([]);
        return;
      }
      const json = await res.json();
      setBars(json.bars ?? []);
      setSource(json.source ?? null);
      setBarMode(json.mode === "5min" ? "5min" : "1min");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
      setBars([]);
    } finally {
      setLoading(false);
    }
  }, [code, date]);

  useEffect(() => {
    if (open) {
      setBars([]);
      setError(null);
      fetchData();
    }
  }, [open, fetchData]);

  /* ESC 关闭 */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const title = name ? `${name}（${code}）` : code;

  return (
    <div
      ref={backdropRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          borderRadius: 10,
          width: "min(1100px, 96vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 48px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-color)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {title} 分时图
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {date}
            </span>
            {source && (
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background:
                    source === "cache"
                      ? "rgba(9,212,100,0.12)"
                      : "rgba(232,68,68,0.12)",
                  color: source === "cache" ? "#09d464" : "#e84444",
                }}
              >
                {source === "cache" ? "缓存" : "实时"}
              </span>
            )}
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 4,
                background:
                  barMode === "1min"
                    ? "rgba(59,130,246,0.12)"
                    : "rgba(245,166,35,0.12)",
                color: barMode === "1min" ? "#3b82f6" : "#f5a623",
              }}
            >
              {barMode === "1min" ? "1分钟" : "5分钟"}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 4,
              color: "var(--text-secondary)",
              fontSize: 18,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
            }}
            title="关闭 (Esc)"
          >
            ×
          </button>
        </div>

        {/* 图表区域 */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 0 8px 0" }}>
          {loading && (
            <div
              style={{
                height: 360,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-tertiary)",
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    border: "2px solid var(--border-color)",
                    borderTopColor: "#e84444",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <span>加载分时数据...</span>
              </div>
            </div>
          )}
          {!loading && error && (
            <div
              style={{
                height: 360,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                color: "var(--text-secondary)",
                fontSize: 13,
              }}
            >
              <span style={{ color: "#e84444" }}>⚠ {error}</span>
              <button
                onClick={fetchData}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                重试
              </button>
            </div>
          )}
          {!loading && !error && outOfRange && (
            <div
              style={{
                height: 360,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                color: "var(--text-tertiary)",
                fontSize: 13,
              }}
            >
              <span style={{ fontSize: 28, lineHeight: 1 }}>📅</span>
              <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                无分时数据
              </span>
              <span
                style={{ fontSize: 12, textAlign: "center", maxWidth: 320 }}
              >
                {/^(000|399)\d{3}$/.test(code)
                  ? `指数分时数据仅支持最近约8个交易日，${date} 超出范围。`
                  : `${date} 可能是非交易日或该股票停牌，暂无5分钟K线数据。`}
              </span>
            </div>
          )}
          {!loading && !error && !outOfRange && bars.length === 0 && (
            <div
              style={{
                height: 360,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-tertiary)",
                fontSize: 13,
              }}
            >
              该交易日暂无分时数据（可能为非交易日）
            </div>
          )}
          {!loading && !error && bars.length > 0 && (
            <MinuteChart
              data={bars}
              height={420}
              stockName={name}
              mode={barMode}
            />
          )}
        </div>
      </div>

      {/* 旋转动画 */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
