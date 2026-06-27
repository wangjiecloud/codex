"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import React from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
  NodeProps,
  Handle,
  Position,
  NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Bot,
  Plus,
  Trash2,
  ExternalLink,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { cn, getPriceColor, formatPercent } from "@/lib/utils";
import { useTheme } from "@/app/theme-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockEntry {
  code: string;
  name: string;
}

interface LiveQuote {
  code: string;
  name: string;
  price: number;
  change: number;
  changeAmt: number;
  open: number;
  prevClose: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
  marketCap: number;
  pe: number;
  pb: number;
  turnoverRate: number;
  amplitude: number;
  updatedAt: string | null;
}

interface ComponentData extends Record<string, unknown> {
  label: string;
  icon: string;
  desc: string;
  layer: "upstream" | "core" | "downstream" | "application";
  stocks: string[];
  ticker?: string;
  market?: "A股" | "港股" | "美股" | "外资";
  isNvidia?: boolean;
  group?: string;
}

type ComponentNode = Node<ComponentData>;

// ─── Custom Node ──────────────────────────────────────────────────────────────

const LAYER_STYLES: Record<
  ComponentData["layer"],
  { border: string; text: string; badge: string }
> = {
  upstream: {
    border: "#3b5bdb",
    text: "#3b5bdb",
    badge: "#1e3a5f",
  },
  core: { border: "#f5a623", text: "#d97706", badge: "#3d2c00" },
  downstream: {
    border: "#10b981",
    text: "#059669",
    badge: "#0d3d2a",
  },
  application: {
    border: "#8b5cf6",
    text: "#7c3aed",
    badge: "#2d1f4e",
  },
};

const MARKET_BADGE: Record<string, { text: string }> = {
  A股: { text: "#16a34a" },
  港股: { text: "#0284c7" },
  美股: { text: "#7c3aed" },
  外资: { text: "var(--text-tertiary)" },
};

function ComponentNodeCard({ data, selected }: NodeProps<ComponentNode>) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const s = data.isNvidia
    ? {
        border: "#76b900",
        text: "#76b900",
        badge: "#1a2e00",
      }
    : LAYER_STYLES[data.layer];
  const mb = data.market ? MARKET_BADGE[data.market] : null;
  const cardBg = data.isNvidia
    ? isLight
      ? "linear-gradient(135deg, #f0fff0 0%, #e8f5e9 100%)"
      : "linear-gradient(135deg, #0a0a1a 0%, #0d1a00 100%)"
    : isLight
      ? `linear-gradient(135deg, ${s.border}08 0%, var(--bg-secondary) 100%)`
      : `linear-gradient(135deg, ${s.border}18 0%, var(--bg-secondary) 100%)`;
  return (
    <div
      style={{
        background: cardBg,
        border: `2px solid ${selected ? "var(--text-primary)" : s.border}`,
        borderRadius: "14px",
        width: "200px",
        height: "148px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: data.isNvidia
          ? `0 0 0 3px #76b90055, 0 8px 40px #76b90033`
          : selected
            ? `0 0 0 3px ${s.border}55, 0 8px 32px ${isLight ? "#00000022" : "#00000088"}`
            : `0 4px 16px ${isLight ? "#00000011" : "#00000066"}, inset 0 1px 0 ${s.border}33`,
        transform: selected ? "scale(1.04)" : "scale(1)",
        transition: "all 0.15s ease",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: s.border, border: "none", width: 8, height: 8 }}
      />
      <div
        style={{
          padding: "10px 12px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "6px",
          }}
        >
          <span style={{ fontSize: "20px" }}>{data.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: s.text,
                fontWeight: 700,
                fontSize: "13px",
                lineHeight: 1.3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {data.label}
            </div>
            {data.ticker && (
              <div
                style={{
                  color: "var(--text-tertiary)",
                  fontSize: "10px",
                  marginTop: 1,
                  fontFamily: "monospace",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {data.ticker}
                {mb && (
                  <span
                    style={{
                      marginLeft: 4,
                      background: `${mb.text}18`,
                      color: mb.text,
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 3,
                      fontFamily: "sans-serif",
                    }}
                  >
                    {data.market}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <p
          style={{
            color: "var(--text-tertiary)",
            fontSize: "11px",
            margin: "0 0 6px 0",
            lineHeight: 1.4,
            flex: 1,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {data.desc}
        </p>
        {!data.isNvidia && (
          <div
            style={{
              marginTop: "8px",
              background: `${s.border}18`,
              borderRadius: "6px",
              padding: "3px 8px",
              display: "inline-block",
            }}
          >
            <span style={{ color: s.text, fontSize: "10px", fontWeight: 500 }}>
              {data.stocks.length} 家龙头
            </span>
          </div>
        )}
        {data.isNvidia && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#76b900",
                boxShadow: "0 0 6px #76b900",
              }}
            />
            <span style={{ color: "#76b900", fontSize: 10, fontWeight: 600 }}>
              全球 AI 算力核心客户
            </span>
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: s.border, border: "none", width: 8, height: 8 }}
      />
    </div>
  );
}

const nodeTypes = { component: ComponentNodeCard };

const LAYER_LABEL: Record<ComponentData["layer"], string> = {
  upstream: "上游供应商",
  core: "核心制造商",
  downstream: "组装/分销",
  application: "终端客户",
};

// ─── helpers ──────────────────────────────────────────────────────────────────
type Layer = ComponentData["layer"];
const n = (
  id: string,
  x: number,
  y: number,
  label: string,
  icon: string,
  desc: string,
  layer: Layer,
  stocks: string[],
  ticker?: string,
  market?: ComponentData["market"],
  isNvidia?: boolean,
  group?: string,
): ComponentNode => ({
  id,
  type: "component",
  position: { x, y },
  data: { label, icon, desc, layer, stocks, ticker, market, isNvidia, group },
});

const e = (
  id: string,
  src: string,
  tgt: string,
  layer: Layer,
  label?: string,
): Edge => {
  const colors: Record<Layer, string> = {
    upstream: "#3b5bdb",
    core: "#f5a623",
    downstream: "#10b981",
    application: "#8b5cf6",
  };
  const c = colors[layer];
  return {
    id,
    source: src,
    target: tgt,
    label,
    labelStyle: { fill: "var(--text-secondary)", fontSize: 9, fontWeight: 500 },
    labelBgStyle: { fill: "var(--bg-primary)", fillOpacity: 0.85 },
    labelBgPadding: [3, 5] as [number, number],
    labelBgBorderRadius: 3,
    style: { stroke: `${c}55`, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: c },
  };
};

// ─── PCB 企业供应链图谱 (以英伟达为核心) ──────────────────────────────────────────
//
// 数据来源：公司年报/招股书、中信证券/招商证券研报（2025-2026）
//   生益科技 M8产品已在英伟达交换板取得主要份额、M9获认证（直接供应英伟达）
//   深南电路 封装基板ABF为英伟达GPU封装核心基板
//   宏和科技 超薄电子布→ABF载板关键原材料
//   鼎泰高科 PCB钻针市占率60%+，AI服务器HDI板核心耗材
//   铜冠铜箔/德福科技 高端高速铜箔供PCB厂
//   联瑞新材/壹石通 球形硅微粉（低介电填料）→高频高速CCL

function ProcessFlowView({
  nodes,
  selectedId,
  onSelect,
  layerLabels,
  perfData,
  liveQuotes,
}: {
  nodes: ComponentNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  layerLabels: string[];
  perfData: Record<string, { ytd: number | null; m5: number | null }>;
  liveQuotes: Record<string, LiveQuote>;
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [zoom, setZoom] = React.useState(1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const tickRef = React.useRef(0);
  const frameRef = React.useRef<number | undefined>(undefined);
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  // 优化的动画循环: 使用 RAF 代替 setInterval，降低更新频率到 500ms
  React.useEffect(() => {
    let lastUpdate = Date.now();
    const animate = () => {
      const now = Date.now();
      if (now - lastUpdate >= 500) {
        // 每 500ms 更新一次 (从 150ms 降低)
        tickRef.current += 1;
        forceUpdate();
        lastUpdate = now;
      }
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => {
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        return Math.min(2, Math.max(0.3, +(z + delta).toFixed(2)));
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const yGroups = Array.from(new Set(nodes.map((n) => n.position.y))).sort(
    (a, b) => a - b,
  );

  const layers = yGroups.map((y, i) => ({
    y,
    label: layerLabels[i] ?? `L${i}`,
    nodes: nodes.filter((n) => n.position.y === y),
  }));

  const LAYER_COLORS = [
    {
      accent: "#3b82f6",
      bg: isLight ? "#3b82f608" : "#050d1a",
      border: isLight ? "#3b82f630" : "var(--bg-tertiary)",
    },
    {
      accent: "#06b6d4",
      bg: isLight ? "#06b6d408" : "#050f14",
      border: isLight ? "#06b6d430" : "#0e4050",
    },
    {
      accent: "#f5a623",
      bg: isLight ? "#f5a62308" : "#14100002",
      border: isLight ? "#f5a62330" : "#6e4200",
    },
    {
      accent: "#10b981",
      bg: isLight ? "#10b98108" : "#02140a",
      border: isLight ? "#10b98130" : "#0a4a28",
    },
    {
      accent: "#8b5cf6",
      bg: isLight ? "#8b5cf608" : "#0a051a",
      border: isLight ? "#8b5cf630" : "#3a1a7e",
    },
  ];

  const particleOffset = (tickRef.current * 2) % 100;

  const CtrlBtn = ({
    onClick,
    title,
    children,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--border-color)",
        color: "var(--text-secondary)",
        fontSize: 14,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background =
          "var(--bg-tertiary)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background =
          "transparent")
      }
    >
      {children}
    </button>
  );

  return (
    <div
      className="flex-1 flex flex-col bg-[var(--bg-primary)] overflow-hidden"
      style={{ fontFamily: "monospace" }}
    >
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-primary)] flex-shrink-0">
        <span className="text-xs text-[var(--text-tertiary)]">
          3D加工流程图 · 点击节点查看 A 股龙头企业 · Ctrl+滚轮缩放
        </span>
        <div className="ml-auto flex items-center gap-3">
          {layers.map((layer, i) => (
            <div key={i} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: LAYER_COLORS[i]?.accent ?? "#888" }}
              />
              <span className="text-xs text-[var(--text-tertiary)]">
                {layer.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <div
          className="w-full h-full overflow-y-auto overflow-x-auto"
          style={{ perspective: "1200px" }}
        >
          <div
            style={{
              transformStyle: "preserve-3d",
              transform: `scale(${zoom}) rotateX(8deg)`,
              transformOrigin: "50% 0%",
              paddingBottom: 48,
              minWidth: "max-content",
              width: "100%",
            }}
          >
            {layers.map((layer, li) => {
              const lc = LAYER_COLORS[li] ?? LAYER_COLORS[0];
              return (
                <div key={li} style={{ position: "relative" }}>
                  {li > 0 && (
                    <div
                      style={{
                        position: "relative",
                        height: 52,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          overflow: "visible",
                        }}
                      >
                        <defs>
                          <marker
                            id={`arr-${li}`}
                            markerWidth="8"
                            markerHeight="8"
                            refX="4"
                            refY="4"
                            orient="auto"
                          >
                            <path
                              d="M0,0 L8,4 L0,8 Z"
                              fill={lc.accent}
                              opacity="0.7"
                            />
                          </marker>
                        </defs>
                        {layer.nodes.slice(0, 6).map((nd, ni) => {
                          const prevLayer = layers[li - 1];
                          const srcNode =
                            prevLayer.nodes[
                              Math.min(ni, prevLayer.nodes.length - 1)
                            ];
                          const srcX =
                            ((srcNode ? prevLayer.nodes.indexOf(srcNode) : ni) +
                              0.5) *
                            (100 / prevLayer.nodes.length);
                          const dstX = (ni + 0.5) * (100 / layer.nodes.length);
                          const pts = (particleOffset / 100 + ni * 0.15) % 1;
                          const px = srcX + (dstX - srcX) * pts;
                          const py = pts * 52;
                          return (
                            <g key={nd.id}>
                              <line
                                x1={`${srcX}%`}
                                y1={0}
                                x2={`${dstX}%`}
                                y2={52}
                                stroke={lc.accent}
                                strokeWidth="1"
                                strokeOpacity="0.25"
                                strokeDasharray="4 6"
                                markerEnd={`url(#arr-${li})`}
                              />
                              <circle
                                cx={`${px}%`}
                                cy={py}
                                r="2.5"
                                fill={lc.accent}
                                opacity="0.8"
                              />
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  )}

                  <div
                    style={{
                      background: `linear-gradient(180deg, ${lc.bg} 0%, ${lc.bg}ee 100%)`,
                      border: `1px solid ${lc.border}`,
                      borderLeft: `3px solid ${lc.accent}`,
                      marginLeft: 16,
                      marginRight: 16,
                      borderRadius: 10,
                      padding: "12px 16px",
                      position: "relative",
                      boxShadow: `0 4px 24px ${lc.accent}18`,
                      minWidth: `${layer.nodes.length * 160 + 80}px`,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -10,
                        left: 20,
                        background: lc.accent,
                        color: "#000",
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "2px 10px",
                        borderRadius: 4,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {layer.label}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 12,
                        marginTop: 8,
                        minWidth: "max-content",
                        alignItems: "flex-start",
                      }}
                    >
                      {(() => {
                        const grouped: {
                          name: string;
                          nodes: typeof layer.nodes;
                        }[] = [];
                        const ungrouped: typeof layer.nodes = [];
                        layer.nodes.forEach((nd) => {
                          const g = nd.data.group as string | undefined;
                          if (g) {
                            const existing = grouped.find((x) => x.name === g);
                            if (existing) existing.nodes.push(nd);
                            else grouped.push({ name: g, nodes: [nd] });
                          } else {
                            ungrouped.push(nd);
                          }
                        });
                        const renderNode = (nd: ComponentNode) => {
                          const isSel = selectedId === nd.id;
                          return (
                            <button
                              key={nd.id}
                              onClick={() => onSelect(nd.id)}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                gap: 4,
                                padding: "10px 14px",
                                borderRadius: 8,
                                background: isSel
                                  ? `${lc.accent}22`
                                  : `${lc.accent}08`,
                                border: `1.5px solid ${isSel ? lc.accent : lc.border}`,
                                cursor: "pointer",
                                minWidth: 120,
                                transition: "all 0.18s ease",
                                boxShadow: isSel
                                  ? `0 0 16px ${lc.accent}44, inset 0 0 8px ${lc.accent}18`
                                  : "none",
                                transform: isSel ? "translateY(-2px)" : "none",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <span style={{ fontSize: 18 }}>
                                  {nd.data.icon}
                                </span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: isSel
                                      ? lc.accent
                                      : "var(--text-primary)",
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {nd.data.label}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "var(--text-tertiary)",
                                  lineHeight: 1.4,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {nd.data.desc}
                              </div>
                              {nd.data.stocks.length > 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 3,
                                    width: "100%",
                                  }}
                                >
                                  {nd.data.stocks.map((code) => {
                                    const perf = perfData[code];
                                    const fmtPct = (
                                      v: number | null | undefined,
                                    ) => {
                                      if (v == null) return null;
                                      const sign = v >= 0 ? "+" : "";
                                      return `${sign}${v.toFixed(2)}%`;
                                    };
                                    const ytdStr = fmtPct(perf?.ytd);
                                    const m5Str = fmtPct(perf?.m5);
                                    const ytdColor =
                                      perf?.ytd != null
                                        ? perf.ytd >= 0
                                          ? "#ef4444"
                                          : "#22c55e"
                                        : "var(--text-tertiary)";
                                    const m5Color =
                                      perf?.m5 != null
                                        ? perf.m5 >= 0
                                          ? "#ef4444"
                                          : "#22c55e"
                                        : "var(--text-tertiary)";
                                    return (
                                      <div
                                        key={code}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 4,
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: 10,
                                            color: "var(--text-secondary)",
                                            fontWeight: 600,
                                            minWidth: 52,
                                          }}
                                        >
                                          {(perfData[code]
                                            ? liveQuotes[code]?.name
                                            : undefined) ?? code}
                                        </span>
                                        {ytdStr && (
                                          <span
                                            style={{
                                              fontSize: 9,
                                              color: ytdColor,
                                              fontWeight: 700,
                                              background: `${ytdColor}18`,
                                              padding: "1px 4px",
                                              borderRadius: 3,
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            年 {ytdStr}
                                          </span>
                                        )}
                                        {m5Str && (
                                          <span
                                            style={{
                                              fontSize: 9,
                                              color: m5Color,
                                              fontWeight: 700,
                                              background: `${m5Color}18`,
                                              padding: "1px 4px",
                                              borderRadius: 3,
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            5月 {m5Str}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <div
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: lc.accent,
                                    opacity: 0.8,
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: lc.accent,
                                    fontWeight: 600,
                                  }}
                                >
                                  {nd.data.stocks.length} 家A股
                                </span>
                              </div>
                            </button>
                          );
                        };
                        return (
                          <>
                            {grouped.map((grp) => (
                              <div
                                key={grp.name}
                                style={{
                                  position: "relative",
                                  border: `1px solid ${lc.accent}44`,
                                  borderRadius: 10,
                                  padding: "18px 12px 10px",
                                  background: `${lc.accent}06`,
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 8,
                                  alignItems: "flex-start",
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    top: -9,
                                    left: 10,
                                    background: `${lc.accent}22`,
                                    border: `1px solid ${lc.accent}55`,
                                    color: lc.accent,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: "1px 8px",
                                    borderRadius: 4,
                                    whiteSpace: "nowrap",
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  {grp.name}
                                </div>
                                {grp.nodes.map(renderNode)}
                              </div>
                            ))}
                            {ungrouped.map(renderNode)}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 4px 16px #00000066",
            zIndex: 10,
          }}
        >
          <CtrlBtn
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}
            title="放大"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle
                cx="7"
                cy="7"
                r="6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="4"
                y1="7"
                x2="10"
                y2="7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="7"
                y1="4"
                x2="7"
                y2="10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </CtrlBtn>
          <CtrlBtn
            onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(1)))}
            title="缩小"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle
                cx="7"
                cy="7"
                r="6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="4"
                y1="7"
                x2="10"
                y2="7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </CtrlBtn>
          <CtrlBtn onClick={() => setZoom(1)} title="重置缩放">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 7C2 4.24 4.24 2 7 2c1.66 0 3.13.8 4.07 2.04M12 7c0 2.76-2.24 5-5 5-1.66 0-3.13-.8-4.07-2.04"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path d="M10.5 2.5L11.5 4.5H9.5L10.5 2.5Z" fill="currentColor" />
            </svg>
          </CtrlBtn>
        </div>
      </div>
    </div>
  );
}
// ─── Shared Right Panel ───────────────────────────────────────────────────────

interface RightPanelItem {
  id: string;
  label: string;
  icon?: string;
  desc: string;
  layer: ComponentData["layer"];
  stocks: string[];
  ticker?: string;
}

// ─── Overview View ────────────────────────────────────────────────────────────

const OVERVIEW_INDUSTRIES = [
  {
    id: "aigpu",
    label: "AI算力芯片",
    icon: "🔮",
    color: "#a78bfa",
    reps: ["寒武纪", "海光信息", "英伟达"],
    x: 560,
    y: 0,
  },
  {
    id: "memory",
    label: "存储芯片\nHBM/DRAM",
    icon: "💾",
    color: "#38bdf8",
    reps: ["SK海力士", "澜起科技", "兆易创新"],
    x: 980,
    y: 0,
  },
  {
    id: "pcb",
    label: "PCB\n印制电路板",
    icon: "🟦",
    color: "#34d399",
    reps: ["深南电路", "胜宏科技", "沪电股份"],
    x: 200,
    y: 220,
  },
  {
    id: "mlcc",
    label: "MLCC\n被动元件",
    icon: "🟡",
    color: "#fbbf24",
    reps: ["风华高科", "三环集团", "村田"],
    x: 620,
    y: 220,
  },
  {
    id: "coppercable",
    label: "高速铜连接\nDAC/AEC",
    icon: "🔗",
    color: "#f97316",
    reps: ["沃尔核材", "兆龙互连", "Credo"],
    x: 1060,
    y: 220,
  },
  {
    id: "optics",
    label: "光模块/CPO",
    icon: "💡",
    color: "#06b6d4",
    reps: ["中际旭创", "天孚通信", "新易盛"],
    x: 350,
    y: 440,
  },
  {
    id: "fiber",
    label: "光纤光缆",
    icon: "🌐",
    color: "#10b981",
    reps: ["长飞光纤", "亨通光电", "中天科技"],
    x: 840,
    y: 440,
  },
  {
    id: "liquidcool",
    label: "液冷散热",
    icon: "❄️",
    color: "#818cf8",
    reps: ["英维克", "高澜股份", "曙光数创"],
    x: 200,
    y: 660,
  },
  {
    id: "aipower",
    label: "AI供配电\nPSU/BBU",
    icon: "⚡",
    color: "#f59e0b",
    reps: ["麦格米特", "欧陆通", "蔚蓝锂芯"],
    x: 640,
    y: 660,
  },
  {
    id: "idc",
    label: "智算中心/IDC",
    icon: "🏢",
    color: "#e879f9",
    reps: ["润泽科技", "奥飞数据", "光环新网"],
    x: 1060,
    y: 660,
  },
  {
    id: "glasssub",
    label: "玻璃基板\n半导体封装",
    icon: "🔷",
    color: "#64748b",
    reps: ["洛阳玻璃", "彩虹股份", "深南电路"],
    x: 1350,
    y: 220,
  },
];

const OVERVIEW_EDGES_DEF = [
  { src: "aigpu", tgt: "pcb", label: "GPU芯片→PCB承载" },
  { src: "aigpu", tgt: "mlcc", label: "AI主板用MLCC" },
  { src: "aigpu", tgt: "coppercable", label: "GPU-Switch铜互联" },
  { src: "memory", tgt: "aigpu", label: "HBM直连GPU" },
  { src: "memory", tgt: "pcb", label: "内存模组PCB" },
  { src: "pcb", tgt: "optics", label: "光模块PCB载板" },
  { src: "pcb", tgt: "liquidcool", label: "冷板承载PCB" },
  { src: "mlcc", tgt: "aipower", label: "电源滤波MLCC" },
  { src: "coppercable", tgt: "optics", label: "机柜内光铜互补" },
  { src: "optics", tgt: "fiber", label: "光模块驱动光纤" },
  { src: "optics", tgt: "idc", label: "光互联入IDC" },
  { src: "fiber", tgt: "idc", label: "骨干光缆接入" },
  { src: "liquidcool", tgt: "idc", label: "液冷部署IDC" },
  { src: "aipower", tgt: "idc", label: "供配电支撑IDC" },
  { src: "aigpu", tgt: "idc", label: "GPU装入算力中心" },
  { src: "glasssub", tgt: "pcb", label: "IC载板→PCB基材" },
  { src: "glasssub", tgt: "aigpu", label: "先进封装基板" },
];

type OverviewNodeData = {
  ind: (typeof OVERVIEW_INDUSTRIES)[0];
  onNavigate: (id: string) => void;
} & Record<string, unknown>;

type OverviewNode = Node<OverviewNodeData>;

function OverviewClusterNode({ data }: NodeProps<OverviewNode>) {
  const ind = data.ind as (typeof OVERVIEW_INDUSTRIES)[0];
  const onNavigate = data.onNavigate as (id: string) => void;
  return (
    <div
      onClick={() => onNavigate(ind.id)}
      style={{
        background: `${ind.color}12`,
        border: `2px solid ${ind.color}66`,
        borderRadius: 14,
        padding: "12px 16px",
        minWidth: 160,
        cursor: "pointer",
        transition: "all 0.18s ease",
        boxShadow: `0 0 20px ${ind.color}22`,
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.border =
          `2px solid ${ind.color}`;
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          `0 0 28px ${ind.color}55`;
        (e.currentTarget as HTMLDivElement).style.transform =
          "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.border =
          `2px solid ${ind.color}66`;
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          `0 0 20px ${ind.color}22`;
        (e.currentTarget as HTMLDivElement).style.transform = "none";
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 20 }}>{ind.icon}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: ind.color,
            whiteSpace: "pre-line",
            lineHeight: 1.3,
          }}
        >
          {ind.label}
        </span>
      </div>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}
      >
        {ind.reps.map((r) => (
          <span
            key={r}
            style={{
              fontSize: 10,
              background: `${ind.color}20`,
              color: ind.color,
              padding: "1px 6px",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            {r}
          </span>
        ))}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: ind.color,
          }}
        />
        点击查看详细供应链
      </div>
    </div>
  );
}

function OverviewView({ onNavigate }: { onNavigate: (id: string) => void }) {
  const overviewNodeType = React.useMemo(
    () => ({
      overviewCluster: (props: NodeProps) => (
        <OverviewClusterNode {...(props as NodeProps<OverviewNode>)} />
      ),
    }),
    [],
  );

  const ovNodes: Node[] = OVERVIEW_INDUSTRIES.map((ind) => ({
    id: ind.id,
    type: "overviewCluster",
    position: { x: ind.x, y: ind.y },
    data: { ind, onNavigate },
  }));

  const ovEdges: Edge[] = OVERVIEW_EDGES_DEF.map((ed, i) => ({
    id: `ov-${i}`,
    source: ed.src,
    target: ed.tgt,
    label: ed.label,
    type: "smoothstep",
    style: { stroke: "var(--border-color)", strokeWidth: 1.5 },
    labelStyle: {
      fontSize: 9,
      fill: "var(--text-tertiary)",
      fontFamily: "monospace",
    },
    labelBgStyle: { fill: "var(--bg-primary)", fillOpacity: 0.85 },
    labelBgPadding: [3, 4] as [number, number],
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "var(--border-color)",
      width: 12,
      height: 12,
    },
  }));

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-primary)]">
      <div className="px-5 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-primary)] flex items-center gap-3 flex-shrink-0">
        <span style={{ fontSize: 14, fontWeight: 700, color: "#f5a623" }}>
          AI算力产业链全景图
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          · 点击任意产业节点 → 深入查看供应链详情
        </span>
        <div className="ml-auto flex items-center gap-4">
          {[
            { color: "#a78bfa", label: "芯片/存储" },
            { color: "#34d399", label: "板卡/互联" },
            { color: "#06b6d4", label: "光通信" },
            { color: "#818cf8", label: "数据中心配套" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: color }}
              />
              <span className="text-xs text-[var(--text-tertiary)]">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={ovNodes}
          edges={ovEdges}
          nodeTypes={overviewNodeType}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="var(--bg-hover)"
            gap={28}
            size={1}
          />
          <Controls
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}

function RightPanel({
  item,
  overrideStocks,
  liveQuotes,
  onOverride,
  onClose,
  onNavigate,
  quickItems,
  onSelectQuick,
  relatedItems,
}: {
  item: RightPanelItem | null;
  overrideStocks: Record<string, string[]>;
  liveQuotes: Record<string, LiveQuote>;
  onOverride: (id: string, codes: string[]) => void;
  onClose: () => void;
  onNavigate: (code: string) => void;
  quickItems: { id: string; icon?: string; label: string; count: number }[];
  onSelectQuick: (id: string) => void;
  relatedItems?: {
    upstream: { id: string; icon?: string; label: string; relation: string }[];
    downstream: {
      id: string;
      icon?: string;
      label: string;
      relation: string;
    }[];
  };
}) {
  const [addForm, setAddForm] = useState({ code: "" });
  const [showAdd, setShowAdd] = useState(false);

  const baseCodes = item?.stocks ?? [];
  const currentCodes = (item && overrideStocks[item.id]) ?? baseCodes;
  const currentStocks = currentCodes.map((code) => {
    const live = liveQuotes[code];
    return {
      code,
      name: live?.name ?? code,
      price: live?.price ?? 0,
      change: live?.change ?? 0,
    };
  });

  const handleDelete = (code: string) => {
    if (!item) return;
    onOverride(
      item.id,
      currentCodes.filter((c) => c !== code),
    );
  };

  const handleAdd = () => {
    if (!item || !addForm.code) return;
    const code = addForm.code.trim();
    if (!currentCodes.includes(code)) {
      onOverride(item.id, [...currentCodes, code]);
    }
    setAddForm({ code: "" });
    setShowAdd(false);
  };

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
          style={{ background: "var(--bg-tertiary)" }}
        >
          🔍
        </div>
        <div className="text-center">
          <div
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            选择企业节点
          </div>
          <div
            className="text-xs mt-1 leading-relaxed"
            style={{ color: "var(--text-tertiary)" }}
          >
            点击图谱中任意企业节点，查看上下游供应关系与相关 A 股
          </div>
        </div>
        <div className="w-full space-y-2">
          {quickItems.map((q) => (
            <button
              key={q.id}
              onClick={() => onSelectQuick(q.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
              style={{ background: "var(--bg-tertiary)" }}
            >
              {q.icon && <span className="text-base">{q.icon}</span>}
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {q.label}
              </span>
              <span
                className="ml-auto text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                {q.count} 家
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const s = LAYER_STYLES[item.layer];
  return (
    <>
      <div
        className="px-4 py-4 border-b border-[var(--border-color)] flex-shrink-0"
        style={{
          background: `${s.border}08`,
          borderBottom: `1px solid ${s.border}33`,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {item.icon && <span className="text-2xl">{item.icon}</span>}
            <div>
              <div className="font-semibold text-sm" style={{ color: s.text }}>
                {item.ticker ? (
                  <button
                    onClick={() => onNavigate(item.ticker!)}
                    className="hover:underline underline-offset-2 cursor-pointer text-left"
                    style={{ color: s.text }}
                  >
                    {item.label}
                    <span className="ml-1 text-[10px] opacity-60">↗</span>
                  </button>
                ) : (
                  item.label
                )}
              </div>
              <div className="text-[var(--text-tertiary)] text-xs mt-0.5">
                {item.desc}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] p-1"
          >
            <X size={14} />
          </button>
        </div>
        <div
          className="mt-2 text-xs px-2 py-0.5 rounded inline-block"
          style={{ background: `${s.border}18`, color: s.text }}
        >
          {LAYER_LABEL[item.layer]}
        </div>
      </div>

      {relatedItems &&
        (relatedItems.upstream.length > 0 ||
          relatedItems.downstream.length > 0) && (
          <div className="border-b border-[var(--border-color)] flex-shrink-0">
            {relatedItems.upstream.length > 0 && (
              <div className="px-4 pt-3 pb-2">
                <div className="text-xs text-[#3b82f6] font-semibold mb-1.5 flex items-center gap-1">
                  <span>↑</span> 上游供应商 · {relatedItems.upstream.length} 家
                </div>
                <div className="flex flex-col gap-1">
                  {relatedItems.upstream.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onSelectQuick(r.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-deep)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-left transition-colors w-full"
                    >
                      {r.icon && <span className="text-sm">{r.icon}</span>}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#93c5fd] font-medium truncate">
                          {r.label}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] truncate">
                          {r.relation}
                        </div>
                      </div>
                      <ChevronRight
                        size={10}
                        className="text-[var(--text-tertiary)] flex-shrink-0"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {relatedItems.downstream.length > 0 && (
              <div className="px-4 pt-2 pb-3">
                <div className="text-xs text-[#10b981] font-semibold mb-1.5 flex items-center gap-1">
                  <span>↓</span> 下游客户 · {relatedItems.downstream.length} 家
                </div>
                <div className="flex flex-col gap-1">
                  {relatedItems.downstream.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onSelectQuick(r.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-deep)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-left transition-colors w-full"
                    >
                      {r.icon && <span className="text-sm">{r.icon}</span>}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#6ee7b7] font-medium truncate">
                          {r.label}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] truncate">
                          {r.relation}
                        </div>
                      </div>
                      <ChevronRight
                        size={10}
                        className="text-[var(--text-tertiary)] flex-shrink-0"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      <div className="px-4 py-2 border-b border-[var(--border-color)] flex items-center justify-between flex-shrink-0">
        <span className="text-xs text-[var(--text-secondary)] font-medium">
          A 股龙头企业 · {currentStocks.length} 家
        </span>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 text-xs text-[#f5a623] hover:text-[#f5a623]/80"
        >
          <Plus size={12} />
          添加
        </button>
      </div>

      {showAdd && (
        <div className="px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-hover)] flex-shrink-0">
          <div className="mb-2">
            <input
              className="w-full bg-[var(--bg-deep)] border border-[var(--border-secondary)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-[#f5a623]/50"
              placeholder="股票代码（名称自动从后端获取）"
              value={addForm.code}
              onChange={(e) => setAddForm({ code: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!addForm.code}
              className="flex-1 bg-[#f5a623] hover:bg-[#f5a623]/90 disabled:opacity-40 text-black text-xs font-semibold py-1.5 rounded-lg"
            >
              确认添加
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-[var(--border-secondary)] rounded-lg"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {currentStocks.length === 0 ? (
          <div className="text-center text-[var(--text-tertiary)] text-xs py-8">
            暂无企业，点击「添加」手动录入
          </div>
        ) : (
          currentStocks.map((stock) => (
            <div
              key={stock.code + stock.name}
              className="flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)] border-b border-[var(--border-color)] transition-colors group"
            >
              <button
                className="flex-1 flex items-center gap-3 text-left"
                onClick={() => onNavigate(stock.code)}
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center text-xs font-bold text-[var(--text-tertiary)] flex-shrink-0">
                  {stock.name[0]}
                </div>
                <div className="min-w-0">
                  <div className="text-[var(--text-primary)] text-sm font-medium truncate">
                    {stock.name}
                  </div>
                  <div className="text-[var(--text-tertiary)] text-xs">
                    {stock.code}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-auto mr-2">
                  {stock.price > 0 && (
                    <>
                      <div className="text-[var(--text-primary)] text-xs font-mono">
                        ¥{stock.price}
                      </div>
                      <div
                        className={cn("text-xs", getPriceColor(stock.change))}
                      >
                        {formatPercent(stock.change)}
                      </div>
                    </>
                  )}
                </div>
              </button>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => onNavigate(stock.code)}
                  className="p-1 text-[var(--text-tertiary)] hover:text-[#f5a623]"
                  title="查看详情"
                >
                  <ExternalLink size={12} />
                </button>
                <button
                  onClick={() => handleDelete(stock.code)}
                  className="p-1 text-[var(--text-tertiary)] hover:text-red-400"
                  title="移除"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ViewTab = "chain" | "anatomy";

interface IndustryGraph {
  title: string;
  subtitle: string;
  layerLabels: string[];
  nodes: ComponentNode[];
  edges: Edge[];
}

function buildNode(raw: {
  id: string;
  x: number;
  y: number;
  label: string;
  icon: string;
  desc: string;
  layer: ComponentData["layer"];
  stocks: string[];
  ticker?: string;
  market?: ComponentData["market"];
  group?: string;
}): ComponentNode {
  return {
    id: raw.id,
    type: "component",
    position: { x: raw.x, y: raw.y },
    data: {
      label: raw.label,
      icon: raw.icon,
      desc: raw.desc,
      layer: raw.layer,
      stocks: raw.stocks,
      ticker: raw.ticker,
      market: raw.market,
      group: raw.group,
    },
  };
}

function buildEdge(raw: {
  id: string;
  source: string;
  target: string;
  layer: ComponentData["layer"];
  label?: string | null;
}): Edge {
  const colors: Record<string, string> = {
    upstream: "#3b5bdb",
    core: "#f5a623",
    downstream: "#10b981",
    application: "#8b5cf6",
  };
  const c = colors[raw.layer] ?? "var(--text-tertiary)";
  return {
    id: raw.id,
    source: raw.source,
    target: raw.target,
    label: raw.label ?? undefined,
    labelStyle: { fill: "var(--text-secondary)", fontSize: 9, fontWeight: 500 },
    labelBgStyle: { fill: "var(--bg-primary)", fillOpacity: 0.85 },
    labelBgPadding: [3, 5] as [number, number],
    labelBgBorderRadius: 3,
    style: { stroke: `${c}55`, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: c },
  };
}

export default function IndustryCanvasPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const industryId = params.name as string;

  const [graph, setGraph] = useState<IndustryGraph | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<ComponentNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [activeTab, setActiveTab] = useState<ViewTab>("chain");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelVisible, setPanelVisible] = useState(true);
  const [stockOverrides, setStockOverrides] = useState<
    Record<string, string[]>
  >({});

  const [liveQuotes, setLiveQuotes] = useState<Record<string, LiveQuote>>({});
  const [perfData, setPerfData] = useState<
    Record<string, { ytd: number | null; m5: number | null }>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ code: string; name: string; nodeId: string }>
  >([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/industry/stocks")
      .then((r) => r.json())
      .then((data: { quotes: Record<string, LiveQuote> }) =>
        setLiveQuotes(data.quotes),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("http://localhost:8000/api/industry/perf")
      .then((r) => r.json())
      .then(
        (data: {
          perf: Record<string, { ytd: number | null; m5: number | null }>;
        }) => setPerfData(data.perf),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`http://localhost:8000/api/industry/graph/${industryId}`)
      .then((r) => r.json())
      .then(
        (data: {
          title: string;
          subtitle: string;
          layerLabels: string[];
          nodes: {
            id: string;
            x: number;
            y: number;
            label: string;
            icon: string;
            desc: string;
            layer: ComponentData["layer"];
            stocks: string[];
            ticker?: string;
            market?: ComponentData["market"];
            group?: string;
          }[];
          edges: {
            id: string;
            source: string;
            target: string;
            layer: ComponentData["layer"];
            label?: string | null;
          }[];
        }) => {
          const builtNodes = data.nodes.map(buildNode);
          const builtEdges = data.edges.map(buildEdge);
          setGraph({
            title: data.title,
            subtitle: data.subtitle,
            layerLabels: data.layerLabels,
            nodes: builtNodes,
            edges: builtEdges,
          });
          setNodes(builtNodes);
          setEdges(builtEdges);
        },
      )
      .catch(() => {});
  }, [industryId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results: Array<{ code: string; name: string; nodeId: string }> = [];

    nodes.forEach((node) => {
      const stocks = node.data.stocks || [];
      stocks.forEach((code) => {
        const live = liveQuotes[code];
        const name = live?.name ?? code;
        if (
          code.toLowerCase().includes(query) ||
          name.toLowerCase().includes(query)
        ) {
          results.push({
            code,
            name,
            nodeId: node.id,
          });
        }
      });
    });

    setSearchResults(results);
    setShowSearchDropdown(results.length > 0);
  }, [searchQuery, nodes]);

  const handleSearchSelect = useCallback(
    (result: { code: string; name: string; nodeId: string }) => {
      setActiveTab("chain");
      setSelectedId(result.nodeId);
      setSearchQuery("");
      setShowSearchDropdown(false);
    },
    [],
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as HTMLElement)
      ) {
        setShowSearchDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const stockCode = searchParams.get("stock");
    if (!stockCode || nodes.length === 0) return;

    const targetNode = nodes.find((node) => {
      const stocks = node.data.stocks || [];
      return stocks.includes(stockCode);
    });

    if (targetNode) {
      setActiveTab("chain");
      setSelectedId(targetNode.id);

      setTimeout(() => {
        const element = document.querySelector(`[data-id="${targetNode.id}"]`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);

      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, [searchParams, nodes]);

  const handleOverride = useCallback((id: string, codes: string[]) => {
    setStockOverrides((prev) => ({ ...prev, [id]: codes }));
  }, []);

  const handleNodeClick: NodeMouseHandler<ComponentNode> = useCallback(
    (_evt, node) => {
      setSelectedId(node.id);
    },
    [],
  );

  const isPcb = industryId === "pcb";
  const flowLayerLabels = graph?.layerLabels ?? [];

  const selectedFlowNode = nodes.find((n) => n.id === selectedId) as
    | ComponentNode
    | undefined;

  const connectedNodeIds: Set<string> = (() => {
    if (!selectedId) return new Set();
    const ids = new Set<string>([selectedId]);
    edges.forEach((edge) => {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    });
    return ids;
  })();

  const rightPanelItem: RightPanelItem | null = (() => {
    if (!selectedFlowNode) return null;
    return {
      id: selectedFlowNode.id,
      label: selectedFlowNode.data.label,
      icon: selectedFlowNode.data.icon,
      desc: selectedFlowNode.data.desc,
      layer: selectedFlowNode.data.layer,
      stocks: selectedFlowNode.data.stocks,
      ticker: selectedFlowNode.data.ticker,
    };
  })();

  const relatedItems = (() => {
    if (!selectedId) return undefined;
    const upstream: {
      id: string;
      icon?: string;
      label: string;
      relation: string;
    }[] = [];
    const downstream: {
      id: string;
      icon?: string;
      label: string;
      relation: string;
    }[] = [];
    edges.forEach((edge) => {
      if (edge.source === selectedId) {
        const nd = nodes.find((n) => n.id === edge.target) as
          | ComponentNode
          | undefined;
        if (nd)
          downstream.push({
            id: nd.id,
            icon: nd.data.icon,
            label: nd.data.label,
            relation: (edge.label as string) ?? "供货",
          });
      }
      if (edge.target === selectedId) {
        const nd = nodes.find((n) => n.id === edge.source) as
          | ComponentNode
          | undefined;
        if (nd)
          upstream.push({
            id: nd.id,
            icon: nd.data.icon,
            label: nd.data.label,
            relation: (edge.label as string) ?? "采购",
          });
      }
    });
    return { upstream, downstream };
  })();

  const quickItems = nodes.slice(0, 4).map((node) => ({
    id: node.id,
    icon: node.data.icon,
    label: node.data.label,
    count: node.data.stocks.length,
  }));

  if (!graph && industryId !== "overview") {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-tertiary)]">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-3 px-6 py-3 border-b flex-shrink-0"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
        }}
      >
        <button
          onClick={() => router.push("/industry")}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={16} />
          产业列表
        </button>
        <span style={{ color: "var(--text-tertiary)" }}>/</span>
        <div>
          <span
            className="font-semibold text-sm"
            style={{ color: "var(--text-primary)" }}
          >
            {graph?.title}
          </span>
          <span
            className="text-xs ml-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            {graph?.subtitle}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-secondary)" }}
                size={14}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults.length > 0) {
                    handleSearchSelect(searchResults[0]);
                  } else if (e.key === "Escape") {
                    setSearchQuery("");
                    setShowSearchDropdown(false);
                  }
                }}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSearchDropdown(true);
                }}
                placeholder="搜索股票名称或代码..."
                className="w-64 pl-8 pr-8 py-1.5 border rounded-md text-sm focus:outline-none focus:border-[#3b5bdb]"
                style={{
                  background: "var(--bg-primary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setShowSearchDropdown(false);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {showSearchDropdown && searchResults.length > 0 && (
              <div
                className="absolute top-full mt-1 w-full border rounded-md shadow-xl z-50 max-h-80 overflow-y-auto"
                style={{
                  background: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              >
                {searchResults.map((result, idx) => (
                  <button
                    key={`${result.nodeId}-${result.code}`}
                    onClick={() => handleSearchSelect(result)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-left transition-colors",
                      idx === 0 && "rounded-t-md",
                      idx === searchResults.length - 1 && "rounded-b-md",
                    )}
                  >
                    <span
                      className="text-sm"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {result.name}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {result.code}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {industryId !== "overview" && (
            <div
              className="flex border rounded-lg p-0.5"
              style={{
                background: "var(--bg-primary)",
                borderColor: "var(--border-color)",
              }}
            >
              <button
                onClick={() => {
                  setActiveTab("chain");
                  setSelectedId(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  activeTab === "chain" ? "text-[var(--text-primary)]" : "",
                )}
                style={
                  activeTab === "chain"
                    ? {
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }
                    : { color: "var(--text-secondary)" }
                }
              >
                <span>🗺️</span> 供应链图谱
              </button>
              <button
                onClick={() => {
                  setActiveTab("anatomy");
                  setSelectedId(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  activeTab === "anatomy" ? "text-[var(--text-primary)]" : "",
                )}
                style={
                  activeTab === "anatomy"
                    ? {
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }
                    : { color: "var(--text-secondary)" }
                }
              >
                <span>🔬</span> 3D 解剖图
              </button>
            </div>
          )}

          {activeTab === "chain" && industryId !== "overview" && (
            <div className="flex items-center gap-3 ml-2">
              {(["upstream", "core", "downstream", "application"] as const).map(
                (layer) => (
                  <div key={layer} className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: LAYER_STYLES[layer].border }}
                    />
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {LAYER_LABEL[layer]}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}

          <button className="flex items-center gap-2 bg-[#f5a623]/10 hover:bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/30 px-3 py-1.5 rounded-lg text-xs transition-colors ml-1">
            <Bot size={13} />
            AI 分析
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {industryId === "overview" ? (
          <OverviewView onNavigate={(id) => router.push(`/industry/${id}`)} />
        ) : activeTab === "chain" ? (
          <div className="flex-1 bg-[var(--bg-primary)] relative">
            <ReactFlow
              nodes={nodes.map((n) => ({
                ...n,
                selected: n.id === selectedId,
                style: selectedId
                  ? connectedNodeIds.has(n.id)
                    ? { opacity: 1 }
                    : { opacity: 0.2, filter: "grayscale(0.6)" }
                  : { opacity: 1 },
              }))}
              edges={edges.map((edge) => {
                const isConnected =
                  !selectedId ||
                  edge.source === selectedId ||
                  edge.target === selectedId;
                return {
                  ...edge,
                  style: {
                    ...edge.style,
                    opacity: isConnected ? 1 : 0.08,
                    strokeWidth: isConnected && selectedId ? 2.5 : 1.5,
                  },
                  animated: isConnected && !!selectedId,
                  labelStyle: isConnected
                    ? edge.labelStyle
                    : { ...edge.labelStyle, opacity: 0 },
                  labelBgStyle: isConnected
                    ? edge.labelBgStyle
                    : { ...edge.labelBgStyle, fillOpacity: 0 },
                };
              })}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.4}
              maxZoom={2}
            >
              <Background
                variant={BackgroundVariant.Dots}
                color="var(--bg-hover)"
                gap={24}
                size={1}
              />
              <Controls
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              />
            </ReactFlow>
            {!selectedId ? (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[var(--bg-hover)]/90 border border-[var(--border-secondary)] text-[var(--text-secondary)] text-xs px-4 py-2 rounded-full pointer-events-none">
                点击任意企业节点 → 高亮上下游关系 · 查看相关 A 股
              </div>
            ) : (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[var(--bg-hover)]/90 border border-[#f5a623]/40 text-[#f5a623] text-xs px-4 py-2 rounded-full pointer-events-none flex items-center gap-2">
                <span>↑↓ 已高亮</span>
                <span className="font-semibold">
                  {selectedFlowNode?.data.label}
                </span>
                <span>的 {connectedNodeIds.size - 1} 个上下游企业</span>
                <span className="text-[var(--text-tertiary)] ml-1">
                  · 点击空白处取消
                </span>
              </div>
            )}
          </div>
        ) : (
          <ProcessFlowView
            nodes={nodes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            layerLabels={flowLayerLabels}
            perfData={perfData}
            liveQuotes={liveQuotes}
          />
        )}

        {activeTab === "chain" && industryId !== "overview" && (
          <>
            <button
              onClick={() => setPanelVisible((v) => !v)}
              style={{
                position: "absolute",
                right: panelVisible ? 320 : 0,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 20,
                width: 16,
                height: 48,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderRight: panelVisible
                  ? "none"
                  : "1px solid var(--border-color)",
                borderRadius: panelVisible ? "6px 0 0 6px" : "0 6px 6px 0",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-tertiary)",
                fontSize: 10,
                transition: "right 0.2s ease",
              }}
              title={panelVisible ? "隐藏面板" : "显示面板"}
            >
              {panelVisible ? "›" : "‹"}
            </button>
            {panelVisible && (
              <div className="w-80 border-l border-[var(--border-color)] bg-[var(--bg-deep)] flex flex-col overflow-hidden flex-shrink-0">
                <RightPanel
                  item={rightPanelItem}
                  overrideStocks={stockOverrides}
                  liveQuotes={liveQuotes}
                  onOverride={handleOverride}
                  onClose={() => setSelectedId(null)}
                  onNavigate={(code) => router.push(`/stock/${code}`)}
                  quickItems={quickItems}
                  onSelectQuick={setSelectedId}
                  relatedItems={relatedItems}
                />
              </div>
            )}
          </>
        )}
        {activeTab === "anatomy" && industryId !== "overview" && (
          <>
            <button
              onClick={() => setPanelVisible((v) => !v)}
              style={{
                position: "absolute",
                right: panelVisible ? 320 : 0,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 20,
                width: 16,
                height: 48,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderRight: panelVisible
                  ? "none"
                  : "1px solid var(--border-color)",
                borderRadius: panelVisible ? "6px 0 0 6px" : "0 6px 6px 0",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-tertiary)",
                fontSize: 10,
                transition: "right 0.2s ease",
              }}
              title={panelVisible ? "隐藏面板" : "显示面板"}
            >
              {panelVisible ? "›" : "‹"}
            </button>
            {panelVisible && (
              <div className="w-80 border-l border-[var(--border-color)] bg-[var(--bg-deep)] flex flex-col overflow-hidden flex-shrink-0">
                <RightPanel
                  item={rightPanelItem}
                  overrideStocks={stockOverrides}
                  liveQuotes={liveQuotes}
                  onOverride={handleOverride}
                  onClose={() => setSelectedId(null)}
                  onNavigate={(code) => router.push(`/stock/${code}`)}
                  quickItems={[]}
                  onSelectQuick={setSelectedId}
                  relatedItems={relatedItems}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
