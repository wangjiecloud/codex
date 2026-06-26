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

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockEntry {
  code: string;
  name: string;
  price: number;
  change: number;
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
  stocks: StockEntry[];
  ticker?: string;
  market?: "A股" | "港股" | "美股" | "外资";
  isNvidia?: boolean;
  group?: string;
}

type ComponentNode = Node<ComponentData>;

// ─── Custom Node ──────────────────────────────────────────────────────────────

const LAYER_STYLES: Record<
  ComponentData["layer"],
  { bg: string; border: string; text: string; badge: string }
> = {
  upstream: {
    bg: "#1a1f2e",
    border: "#3b5bdb",
    text: "#93c5fd",
    badge: "#1e3a5f",
  },
  core: { bg: "#1f1a0e", border: "#f5a623", text: "#fbbf24", badge: "#3d2c00" },
  downstream: {
    bg: "#1a2430",
    border: "#10b981",
    text: "#6ee7b7",
    badge: "#0d3d2a",
  },
  application: {
    bg: "#1a1a2a",
    border: "#8b5cf6",
    text: "#c4b5fd",
    badge: "#2d1f4e",
  },
};

const MARKET_BADGE: Record<string, { bg: string; text: string }> = {
  A股: { bg: "#1e3a1a", text: "#4ade80" },
  港股: { bg: "#1a2e3a", text: "#38bdf8" },
  美股: { bg: "#1a1a3a", text: "#a78bfa" },
  外资: { bg: "#2a2a2a", text: "#9ca3af" },
};

function ComponentNodeCard({ data, selected }: NodeProps<ComponentNode>) {
  const s = data.isNvidia
    ? {
        bg: "#0a0a1a",
        border: "#76b900",
        text: "#a3e635",
        badge: "#1a2e00",
      }
    : LAYER_STYLES[data.layer];
  const mb = data.market ? MARKET_BADGE[data.market] : null;
  return (
    <div
      style={{
        background: data.isNvidia
          ? "linear-gradient(135deg, #0a0a1a 0%, #0d1a00 100%)"
          : s.bg,
        border: `2px solid ${selected ? "#fff" : s.border}`,
        borderRadius: "14px",
        minWidth: data.isNvidia ? "200px" : "160px",
        boxShadow: data.isNvidia
          ? `0 0 0 3px #76b90055, 0 8px 40px #76b90033`
          : selected
            ? `0 0 0 3px ${s.border}55, 0 8px 32px #00000088`
            : `0 4px 16px #00000066, inset 0 1px 0 ${s.border}33`,
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
      <div style={{ padding: "12px 14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "6px",
          }}
        >
          <span style={{ fontSize: "20px" }}>{data.icon}</span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                color: s.text,
                fontWeight: 700,
                fontSize: "13px",
                lineHeight: 1.3,
              }}
            >
              {data.label}
            </div>
            {data.ticker && (
              <div
                style={{
                  color: "#6b7280",
                  fontSize: "10px",
                  marginTop: 1,
                  fontFamily: "monospace",
                }}
              >
                {data.ticker}
                {mb && (
                  <span
                    style={{
                      marginLeft: 4,
                      background: mb.bg,
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
            color: "#6b7280",
            fontSize: "11px",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {data.desc}
        </p>
        {!data.isNvidia && (
          <div
            style={{
              marginTop: "8px",
              background: s.badge,
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
  stocks: StockEntry[],
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
    labelStyle: { fill: "#9ca3af", fontSize: 9, fontWeight: 500 },
    labelBgStyle: { fill: "#0d1117", fillOpacity: 0.85 },
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

const PCB_NODES: ComponentNode[] = [
  n(
    "zgjs",
    60,
    0,
    "中国巨石",
    "🧵",
    "超薄高模量电子布 · ABF载板/HDI核心玻纤",
    "upstream",
    [{ code: "600176", name: "中国巨石", price: 14.6, change: 0.9 }],
    "600176",
    "A股",
    undefined,
    "玻纤布",
  ),
  n(
    "hhkt",
    280,
    0,
    "宏和科技",
    "🧶",
    "7628/1080超薄电子布 · ABF封装基板专用",
    "upstream",
    [{ code: "603256", name: "宏和科技", price: 28.4, change: 1.6 }],
    "603256",
    "A股",
    undefined,
    "玻纤布",
  ),
  n(
    "dckt",
    500,
    0,
    "东材科技",
    "🧪",
    "低损耗碳氢树脂/半固化片 · 高频AI服务器板材",
    "upstream",
    [{ code: "601208", name: "东材科技", price: 21.8, change: 0.7 }],
    "601208",
    "A股",
    undefined,
    "树脂材料",
  ),
  n(
    "lrxc",
    720,
    0,
    "联瑞新材",
    "⚪",
    "高纯球形硅微粉 · 低介电填料 · 高频CCL关键料",
    "upstream",
    [{ code: "688300", name: "联瑞新材", price: 45.2, change: 2.1 }],
    "688300",
    "A股",
    undefined,
    "硅微粉填料",
  ),
  n(
    "gdjy",
    940,
    0,
    "嘉元科技",
    "🟧",
    "电解铜箔 · HDI/高多层PCB核心材料",
    "upstream",
    [{ code: "688388", name: "嘉元科技", price: 18.9, change: 0.7 }],
    "688388",
    "A股",
    undefined,
    "电解铜箔",
  ),
  n(
    "tgty",
    1160,
    0,
    "铜冠铜箔",
    "🔶",
    "高速铜箔 · Blackwell/AI服务器PCB指定材料",
    "upstream",
    [{ code: "301217", name: "铜冠铜箔", price: 32.5, change: 1.8 }],
    "301217",
    "A股",
    undefined,
    "电解铜箔",
  ),
  n(
    "dfkt",
    1380,
    0,
    "德福科技",
    "🟫",
    "低轮廓/超薄高端铜箔 · HDI/封装基板专用",
    "upstream",
    [{ code: "301511", name: "德福科技", price: 28.8, change: 0.9 }],
    "301511",
    "A股",
    undefined,
    "电解铜箔",
  ),
  n(
    "xmty",
    1600,
    0,
    "厦门钨业",
    "🪨",
    "硬质合金棒材(WC-Co) · PCB钻针原料棒 · 国内第二大高端PCB棒材 · 供鼎泰高科/金洲精工等",
    "upstream",
    [{ code: "600549", name: "厦门钨业", price: 22.8, change: 1.2 }],
    "600549",
    "A股",
    undefined,
    "硬质合金棒材",
  ),

  n(
    "sykt",
    60,
    210,
    "生益科技",
    "📋",
    "全球第二CCL · M8供英伟达交换板 · M9已获N客户认证 · ABF载板材料",
    "upstream",
    [{ code: "600183", name: "生益科技", price: 140.6, change: 3.2 }],
    "600183",
    "A股",
    undefined,
    "覆铜板 CCL",
  ),
  n(
    "sydy",
    320,
    210,
    "生益电子",
    "📡",
    "生益科技子公司 · 高频高速AI服务器PCB制造 · 材料自供降本 · 净利同比+331%",
    "upstream",
    [{ code: "688183", name: "生益电子", price: 65.0, change: 4.5 }],
    "688183",
    "A股",
    undefined,
    "AI服务器PCB",
  ),
  n(
    "hzxc",
    580,
    210,
    "华正新材",
    "🔬",
    "高频高速CCL · 5G/AI服务器板材 · Rogers替代",
    "upstream",
    [{ code: "603186", name: "华正新材", price: 31.7, change: 0.9 }],
    "603186",
    "A股",
    undefined,
    "覆铜板 CCL",
  ),
  n(
    "neyc",
    820,
    210,
    "南亚新材",
    "📦",
    "FR4/高Tg覆铜板 · 服务器/工控PCB",
    "upstream",
    [{ code: "688519", name: "南亚新材", price: 38.2, change: 1.1 }],
    "688519",
    "A股",
    undefined,
    "覆铜板 CCL",
  ),
  n(
    "dtgk",
    1060,
    210,
    "鼎泰高科",
    "🔧",
    "PCB钻针全球市占率40%+(国内第一) · AI服务器HDI板核心耗材 · 硬质合金微钻",
    "upstream",
    [{ code: "301377", name: "鼎泰高科", price: 55.8, change: 2.3 }],
    "301377",
    "A股",
    undefined,
    "PCB钻针",
  ),
  n(
    "union",
    1300,
    210,
    "Union Tool",
    "🇯🇵",
    "日本钻针龙头 · 精密PCB微钻/铣刀 · 高端HDI/ABF基板专用刀具",
    "upstream",
    [],
    undefined,
    "外资",
    undefined,
    "PCB钻针",
  ),
  n(
    "zthx",
    1540,
    210,
    "中钨高新",
    "⚙️",
    "子公司金洲精工全球第二PCB钻针 · AI服务器高端钻针市占70-80% · 钨矿→粉末→棒材→钻针全产业链自给",
    "upstream",
    [{ code: "000657", name: "中钨高新", price: 12.4, change: 0.8 }],
    "000657",
    "A股",
    undefined,
    "PCB钻针",
  ),

  n(
    "sndl",
    60,
    420,
    "深南电路",
    "🔲",
    "高端多层PCB+封装基板双龙头 · AI服务器高速背板PCB主供英伟达/华为 · 国内PCB龙头",
    "core",
    [{ code: "002916", name: "深南电路", price: 68.5, change: 2.1 }],
    "002916",
    "A股",
    undefined,
    "AI服务器PCB",
  ),
  n(
    "xskt",
    300,
    420,
    "兴森科技",
    "🏆",
    "ABF封装基板国产龙头 · AI芯片封装基板国产化突破 · FC-BGA载板量产",
    "core",
    [{ code: "002436", name: "兴森科技", price: 22.8, change: 1.5 }],
    "002436",
    "A股",
    undefined,
    "ABF封装基板",
  ),
  n(
    "hdgf",
    540,
    420,
    "沪电股份",
    "🗂️",
    "AI服务器高端多层板 · 英特尔/英伟达主板供应商",
    "core",
    [{ code: "002463", name: "沪电股份", price: 19.8, change: 1.4 }],
    "002463",
    "A股",
    undefined,
    "AI服务器PCB",
  ),
  n(
    "shgx",
    780,
    420,
    "胜宏科技",
    "🔩",
    "AI服务器HDI板/高多层板 · 净利同比+50%以上",
    "core",
    [{ code: "300476", name: "胜宏科技", price: 28.3, change: -0.5 }],
    "300476",
    "A股",
    undefined,
    "AI服务器PCB",
  ),
  n(
    "pgdk",
    1020,
    420,
    "鹏鼎控股",
    "📱",
    "全球最大FPC · 苹果/华为/英伟达NVLink线缆",
    "core",
    [{ code: "002938", name: "鹏鼎控股", price: 22.1, change: 3.2 }],
    "002938",
    "A股",
    undefined,
    "FPC柔性电路板",
  ),

  n(
    "gyfl",
    60,
    630,
    "工业富联",
    "🏭",
    "AI服务器代工No.1 · 英伟达DGX/HGX整机代工 · 2025收入超6000亿",
    "downstream",
    [{ code: "601138", name: "工业富联", price: 26.5, change: 1.8 }],
    "601138",
    "A股",
    undefined,
    "AI服务器代工",
  ),
  n(
    "ljjm",
    330,
    630,
    "立讯精密",
    "🤖",
    "NVLink/InfiniBand线缆+连接器 · 英伟达GPU互连直接供应商",
    "downstream",
    [{ code: "002475", name: "立讯精密", price: 32.8, change: 1.6 }],
    "002475",
    "A股",
    undefined,
    "连接器组装",
  ),
  n(
    "smsh",
    600,
    630,
    "盛美上海",
    "⚡",
    "半导体清洗/电镀设备 · PCB高端电镀线 · AI服务器PCB制造关键设备",
    "downstream",
    [{ code: "688082", name: "盛美上海", price: 88.0, change: 3.1 }],
    "688082",
    "A股",
    undefined,
    "PCB制造设备",
  ),
  n(
    "tzkt",
    870,
    630,
    "天准科技",
    "🔍",
    "3D AOI精度±5μm · 已进入苹果/英伟达检测供应链",
    "downstream",
    [{ code: "688003", name: "天准科技", price: 42.5, change: 1.9 }],
    "688003",
    "A股",
    undefined,
    "PCB检测设备",
  ),
  n(
    "芯碁",
    1140,
    630,
    "芯碁微装",
    "💡",
    "LDI激光直接成像设备 · 绑定深南/沪电/胜宏等PCB厂 · 订单同比+70%",
    "downstream",
    [{ code: "688630", name: "芯碁微装", price: 38.6, change: 2.2 }],
    "688630",
    "A股",
    undefined,
    "PCB制造设备",
  ),

  n(
    "nvidia",
    200,
    840,
    "英伟达 NVIDIA",
    "🟢",
    "H100/H200/B200/Rubin GPU · AI算力霸主 · 2026-2027订单1万亿美元",
    "application",
    [],
    "NVDA",
    "美股",
    true,
  ),
  n(
    "microsoft",
    600,
    840,
    "微软 Microsoft",
    "🔵",
    "Azure云 · 英伟达GPU最大买家之一 · DGX Cloud",
    "application",
    [],
    "MSFT",
    "美股",
  ),
  n(
    "byd",
    1000,
    840,
    "比亚迪",
    "⚡",
    "新能源汽车电子 · PCB年采购超百亿",
    "application",
    [{ code: "002594", name: "比亚迪", price: 285.0, change: 2.5 }],
    "002594",
    "A股",
  ),
];

const PCB_EDGES: Edge[] = [
  // L0 → L1：原材料 → 覆铜板
  e("e-zgjs-sykt", "zgjs", "sykt", "upstream", "玻纤布"),
  e("e-hhkt-sykt", "hhkt", "sykt", "upstream", "超薄电子布"),
  e("e-hhkt-sndl", "hhkt", "sndl", "upstream", "ABF电子布"),
  e("e-dckt-sykt", "dckt", "sykt", "upstream", "低损耗树脂"),
  e("e-dckt-hzxc", "dckt", "hzxc", "upstream", "碳氢树脂"),
  e("e-lrxc-sykt", "lrxc", "sykt", "upstream", "球形硅微粉"),
  e("e-lrxc-hzxc", "lrxc", "hzxc", "upstream", "低介电填料"),
  e("e-gdjy-sykt", "gdjy", "sykt", "upstream", "电解铜箔"),
  e("e-gdjy-neyc", "gdjy", "neyc", "upstream", "铜箔"),
  e("e-tgty-sykt", "tgty", "sykt", "upstream", "高速铜箔"),
  e("e-tgty-sndl", "tgty", "sndl", "upstream", "ABF铜箔"),
  e("e-dfkt-sykt", "dfkt", "sykt", "upstream", "超薄铜箔"),
  e("e-dfkt-xskt", "dfkt", "xskt", "upstream", "封装基板铜箔"),
  e("e-xmty-dtgk", "xmty", "dtgk", "upstream", "硬质合金棒材"),
  e("e-xmty-union", "xmty", "union", "upstream", "WC-Co棒料"),
  e("e-xmty-zthx", "xmty", "zthx", "upstream", "棒材自用"),
  e("e-zthx-sndl", "zthx", "sndl", "upstream", "PCB钻针"),
  e("e-zthx-hdgf", "zthx", "hdgf", "upstream", "PCB钻针"),
  e("e-zthx-shgx", "zthx", "shgx", "upstream", "PCB钻针"),
  // L1 → L2：覆铜板 → PCB制造
  e("e-sykt-sndl", "sykt", "sndl", "upstream", "M8/ABF载板材料"),
  e("e-sykt-xskt", "sykt", "xskt", "upstream", "ABF封装基板材料"),
  e("e-sykt-hdgf", "sykt", "hdgf", "upstream", "高速CCL"),
  e("e-sykt-shgx", "sykt", "shgx", "upstream", "高速CCL"),
  e("e-sydy-sndl", "sydy", "sndl", "upstream", "高频PCB"),
  e("e-sydy-hdgf", "sydy", "hdgf", "upstream", "AI服务器板"),
  e("e-hzxc-hdgf", "hzxc", "hdgf", "upstream", "高频板材"),
  e("e-hzxc-pgdk", "hzxc", "pgdk", "upstream", "FPC材料"),
  e("e-neyc-hdgf", "neyc", "hdgf", "upstream", "FR4/高Tg"),
  e("e-neyc-shgx", "neyc", "shgx", "upstream", "板材"),
  e("e-dtgk-sndl", "dtgk", "sndl", "upstream", "PCB钻针"),
  e("e-dtgk-hdgf", "dtgk", "hdgf", "upstream", "PCB钻针"),
  e("e-dtgk-shgx", "dtgk", "shgx", "upstream", "PCB钻针"),
  e("e-dtgk-pgdk", "dtgk", "pgdk", "upstream", "FPC微钻"),
  e("e-union-sndl", "union", "sndl", "upstream", "高端HDI钻针"),
  e("e-union-xskt", "union", "xskt", "upstream", "ABF基板钻针"),

  // L2 → L3：PCB制造 → 组装/测试/设备
  e("e-sndl-gyfl", "sndl", "gyfl", "core", "GPU封装基板"),
  e("e-xskt-gyfl", "xskt", "gyfl", "core", "ABF封装基板"),
  e("e-hdgf-gyfl", "hdgf", "gyfl", "core", "服务器主板PCB"),
  e("e-pgdk-ljjm", "pgdk", "ljjm", "core", "NVLink FPC线缆"),
  e("e-shgx-gyfl", "shgx", "gyfl", "core", "AI服务器板"),
  e("e-sndl-tzkt", "sndl", "tzkt", "core", "PCB检测"),
  e("e-smsh-sndl", "smsh", "sndl", "core", "电镀设备"),
  e("e-smsh-hdgf", "smsh", "hdgf", "core", "电镀设备"),
  e("e-芯碁-sndl", "芯碁", "sndl", "core", "LDI曝光设备"),
  e("e-芯碁-hdgf", "芯碁", "hdgf", "core", "LDI曝光设备"),
  e("e-芯碁-shgx", "芯碁", "shgx", "core", "LDI曝光设备"),

  // L3 → L4：组装 → 终端客户
  e("e-gyfl-nvidia", "gyfl", "nvidia", "downstream", "AI服务器整机"),
  e("e-ljjm-nvidia", "ljjm", "nvidia", "downstream", "NVLink线缆/连接器"),
  e("e-sykt-nvidia", "sykt", "nvidia", "downstream", "M8/M9 CCL直供"),
  e("e-gyfl-microsoft", "gyfl", "microsoft", "downstream", "Azure服务器"),
  e("e-gyfl-byd", "gyfl", "byd", "downstream", "汽车电子PCB组装"),
];

// ─── MLCC 企业供应链图谱 (以英伟达为核心) ─────────────────────────────────────────
//
// 数据来源：同上
//   风华高科/三环集团 MLCC主要国产供应商，配套AI服务器
//   顺络电子 片式电感/滤波器，AI服务器VRM/去耦核心器件
//   洁美科技 MLCC载带全球第一，供村田/TDK等主要MLCC厂
//   工业富联 AI服务器代工，MLCC整板组装

const MLCC_NODES: ComponentNode[] = [
  n(
    "gjcl",
    80,
    0,
    "国瓷材料",
    "⚪",
    "钛酸钡粉体/MLCC介电材料 · 供村田/风华高科/三环集团",
    "upstream",
    [{ code: "300285", name: "国瓷材料", price: 18.7, change: 0.6 }],
    "300285",
    "A股",
    undefined,
    "介电陶瓷粉",
  ),
  n(
    "lbzl",
    320,
    0,
    "龙佰集团",
    "🤍",
    "电子级二氧化钛 · 钛白粉全球前三",
    "upstream",
    [{ code: "002601", name: "龙佰集团", price: 28.5, change: 0.9 }],
    "002601",
    "A股",
    undefined,
    "介电陶瓷粉",
  ),
  n(
    "zjky2",
    560,
    0,
    "紫金矿业",
    "🥈",
    "镍粉/贵金属 · MLCC内外电极原材料",
    "upstream",
    [{ code: "601899", name: "紫金矿业", price: 15.2, change: 1.1 }],
    "601899",
    "A股",
    undefined,
    "电极金属粉",
  ),
  n(
    "ynty",
    800,
    0,
    "云南铜业",
    "🟧",
    "电子级铜粉 · MLCC外电极端子材料",
    "upstream",
    [{ code: "000878", name: "云南铜业", price: 22.8, change: 0.5 }],
    "000878",
    "A股",
    undefined,
    "电极金属粉",
  ),

  n(
    "fhgk",
    80,
    210,
    "风华高科",
    "🔋",
    "国内MLCC龙头 · 通用/车规/高压全系 · AI服务器配套国产化",
    "upstream",
    [{ code: "000636", name: "风华高科", price: 45.6, change: 1.8 }],
    "000636",
    "A股",
    undefined,
    "MLCC",
  ),
  n(
    "shj",
    360,
    210,
    "三环集团",
    "🏆",
    "高端MLCC/陶瓷封装件 · 5G基站/汽车/AI服务器",
    "upstream",
    [{ code: "300408", name: "三环集团", price: 32.1, change: -0.9 }],
    "300408",
    "A股",
    undefined,
    "MLCC",
  ),
  n(
    "sldy",
    640,
    210,
    "顺络电子",
    "🌀",
    "片式电感/VRM电感 · AI服务器去耦/滤波核心 · 被动元件龙头",
    "upstream",
    [{ code: "002138", name: "顺络电子", price: 28.9, change: 2.3 }],
    "002138",
    "A股",
    undefined,
    "片式电感",
  ),
  n(
    "jmkt",
    920,
    210,
    "洁美科技",
    "📦",
    "MLCC载带包装 · 全球市占率第一 · 供村田/TDK/风华/三环",
    "upstream",
    [{ code: "002859", name: "洁美科技", price: 22.5, change: 0.9 }],
    "002859",
    "A股",
    undefined,
    "载带包装",
  ),

  n(
    "mrd",
    80,
    420,
    "村田制作所",
    "🇯🇵",
    "全球MLCC霸主 · 英伟达GPU板MLCC第一供应商",
    "core",
    [],
    "6981.T",
    "外资",
    undefined,
    "MLCC模组",
  ),
  n(
    "tdk",
    330,
    420,
    "TDK",
    "🇯🇵",
    "MLCC+电感模组 · AI服务器电源滤波主供",
    "core",
    [],
    "6762.T",
    "外资",
    undefined,
    "MLCC模组",
  ),
  n(
    "fhgk2",
    580,
    420,
    "风华高科(AI配套)",
    "🔋",
    "AI服务器/汽车MLCC国产替代 · 规格突破",
    "core",
    [
      { code: "000636", name: "风华高科", price: 45.6, change: 1.8 },
      { code: "300408", name: "三环集团", price: 32.1, change: -0.9 },
    ],
    "000636",
    "A股",
    undefined,
    "MLCC模组",
  ),
  n(
    "sldy2",
    860,
    420,
    "顺络电子(VRM模组)",
    "🌀",
    "AI服务器VRM电感/滤波器模组 · 绑定工业富联",
    "core",
    [{ code: "002138", name: "顺络电子", price: 28.9, change: 2.3 }],
    "002138",
    "A股",
    undefined,
    "VRM电感模组",
  ),

  n(
    "gyfml",
    80,
    630,
    "工业富联",
    "🏭",
    "AI服务器代工 · MLCC整板组装 · 英伟达最大组装厂",
    "downstream",
    [{ code: "601138", name: "工业富联", price: 26.5, change: 1.8 }],
    "601138",
    "A股",
    undefined,
    "AI服务器代工",
  ),
  n(
    "ljml",
    360,
    630,
    "立讯精密",
    "🤖",
    "精密连接器/线缆组件 · 苹果/AI服务器配套",
    "downstream",
    [{ code: "002475", name: "立讯精密", price: 32.8, change: 1.6 }],
    "002475",
    "A股",
    undefined,
    "连接器组装",
  ),
  n(
    "aopt2",
    640,
    630,
    "奥普特",
    "👁️",
    "AOI视觉检测 · MLCC外观/尺寸检测 · 进入AI供应链",
    "downstream",
    [{ code: "688686", name: "奥普特", price: 88.5, change: 2.8 }],
    "688686",
    "A股",
    undefined,
    "AOI检测设备",
  ),
  n(
    "jmkt2",
    900,
    630,
    "洁美科技(分发)",
    "📦",
    "编带包装出货 · 供村田/TDK成品出厂",
    "downstream",
    [{ code: "002859", name: "洁美科技", price: 22.5, change: 0.9 }],
    "002859",
    "A股",
    undefined,
    "编带分发",
  ),

  n(
    "nvidia2",
    140,
    840,
    "英伟达 NVIDIA",
    "🟢",
    "每块H100 GPU板约用3000~5000颗MLCC · B200需求更高",
    "application",
    [],
    "NVDA",
    "美股",
    true,
  ),
  n(
    "bydml",
    500,
    840,
    "比亚迪",
    "⚡",
    "新能源汽车BMS/逆变器 · 车规MLCC最大国内客户",
    "application",
    [{ code: "002594", name: "比亚迪", price: 285.0, change: 2.5 }],
    "002594",
    "A股",
  ),
  n(
    "appleml",
    860,
    840,
    "苹果 Apple",
    "🍎",
    "iPhone/MacBook · MLCC年采购超3000亿颗",
    "application",
    [],
    "AAPL",
    "美股",
  ),
];

const MLCC_EDGES: Edge[] = [
  // L0 → L1
  e("me-gjcl-fhgk", "gjcl", "fhgk", "upstream", "钛酸钡粉体"),
  e("me-gjcl-shj", "gjcl", "shj", "upstream", "介电材料"),
  e("me-lbzl-fhgk", "lbzl", "fhgk", "upstream", "TiO₂"),
  e("me-zjky2-sldy", "zjky2", "sldy", "upstream", "镍粉/导磁材料"),
  e("me-ynty-fhgk", "ynty", "fhgk", "upstream", "铜粉/外电极"),
  e("me-ynty-sldy", "ynty", "sldy", "upstream", "铜粉"),
  e("me-jmkt-mrd", "jmkt", "mrd", "upstream", "MLCC载带"),
  e("me-jmkt-tdk", "jmkt", "tdk", "upstream", "MLCC载带"),
  e("me-jmkt-fhgk2", "jmkt", "fhgk2", "upstream", "MLCC载带"),
  // L1 → L2
  e("me-fhgk-fhgk2", "fhgk", "fhgk2", "upstream", "MLCC本体"),
  e("me-shj-mrd", "shj", "mrd", "upstream", "陶瓷器件"),
  e("me-shj-fhgk2", "shj", "fhgk2", "upstream", "高端MLCC"),
  e("me-sldy-sldy2", "sldy", "sldy2", "upstream", "VRM电感"),
  // L2 → L3
  e("me-mrd-gyfml", "mrd", "gyfml", "core", "MLCC供货"),
  e("me-tdk-gyfml", "tdk", "gyfml", "core", "电感/MLCC"),
  e("me-fhgk2-gyfml", "fhgk2", "gyfml", "core", "国产MLCC"),
  e("me-fhgk2-ljml", "fhgk2", "ljml", "core", "MLCC"),
  e("me-sldy2-gyfml", "sldy2", "gyfml", "core", "VRM模组"),
  e("me-mrd-aopt2", "mrd", "aopt2", "core", "AOI检测"),
  e("me-fhgk2-jmkt2", "fhgk2", "jmkt2", "core", "编带出货"),
  // L3 → L4
  e("me-gyfml-nvidia2", "gyfml", "nvidia2", "downstream", "AI服务器整机"),
  e("me-ljml-nvidia2", "ljml", "nvidia2", "downstream", "连接器组件"),
  e("me-gyfml-bydml", "gyfml", "bydml", "downstream", "汽车电子组装"),
  e("me-gyfml-appleml", "gyfml", "appleml", "downstream", "消费电子组装"),
];

// ─── Memory Chip Supply Chain ─────────────────────────────────────────────────

const MEMORY_NODES: ComponentNode[] = [
  n(
    "youyan",
    80,
    0,
    "有研新材",
    "⚗️",
    "高纯靶材/溅射靶材 · DRAM/NAND制程关键材料 · 国内靶材龙头",
    "upstream",
    [{ code: "600206", name: "有研新材", price: 18.2, change: 1.5 }],
    "600206",
    "A股",
    undefined,
    "溅射靶材",
  ),
  n(
    "jiangfeng",
    380,
    0,
    "江丰电子",
    "🔩",
    "高纯溅射靶材（钨/钴/钛） · 供应全球主要晶圆厂 · HBM制程必备",
    "upstream",
    [{ code: "300666", name: "江丰电子", price: 52.4, change: 2.3 }],
    "300666",
    "A股",
    undefined,
    "溅射靶材",
  ),
  n(
    "yake",
    680,
    0,
    "雅克科技",
    "🧪",
    "半导体前驱体/特种电子气体 · CVD/ALD工艺关键材料",
    "upstream",
    [{ code: "002409", name: "雅克科技", price: 35.6, change: 0.8 }],
    "002409",
    "A股",
    undefined,
    "特种电子气体",
  ),
  n(
    "huate",
    980,
    0,
    "华特气体",
    "💨",
    "电子特种气体（氮气/氩气/氟化氢） · 晶圆刻蚀/清洗关键气源",
    "upstream",
    [{ code: "688268", name: "华特气体", price: 68.9, change: 1.2 }],
    "688268",
    "A股",
    undefined,
    "特种电子气体",
  ),

  n(
    "husi",
    80,
    210,
    "沪硅产业",
    "💎",
    "12英寸大硅片 · 国内唯一量产12寸硅片企业 · 存储芯片基底",
    "upstream",
    [{ code: "688126", name: "沪硅产业", price: 12.8, change: -0.6 }],
    "688126",
    "A股",
    undefined,
    "硅片基底",
  ),
  n(
    "lianjui",
    380,
    210,
    "联瑞新材",
    "⚪",
    "高纯球形硅微粉 · 封装基板填充材料 · HBM封装关键辅料",
    "upstream",
    [{ code: "688300", name: "联瑞新材", price: 45.3, change: 3.1 }],
    "688300",
    "A股",
    undefined,
    "封装填充材料",
  ),
  n(
    "anji",
    680,
    210,
    "安集科技",
    "🔬",
    "CMP抛光液 · 存储芯片化学机械平坦化工艺 · 国产替代领先",
    "upstream",
    [{ code: "688019", name: "安集科技", price: 98.7, change: 1.9 }],
    "688019",
    "A股",
    undefined,
    "CMP耗材",
  ),
  n(
    "dinglong",
    980,
    210,
    "鼎龙股份",
    "🟡",
    "CMP抛光垫 · 国产首款量产抛光垫 · 打破CMP材料进口依赖",
    "upstream",
    [{ code: "300054", name: "鼎龙股份", price: 22.1, change: 2.4 }],
    "300054",
    "A股",
    undefined,
    "CMP耗材",
  ),

  n(
    "cxmt",
    80,
    420,
    "长鑫存储(CXMT)",
    "🏭",
    "国产DRAM主力 · LPDDR5/DDR5量产 · AI服务器DRAM供应商",
    "core",
    [],
    undefined,
    undefined,
    undefined,
    "DRAM",
  ),
  n(
    "ymtc",
    330,
    420,
    "长江存储(YMTC)",
    "🏗️",
    "国产3D NAND · 232层X3-9070量产 · SSD/企业级存储主供",
    "core",
    [],
    undefined,
    undefined,
    undefined,
    "NAND Flash",
  ),
  n(
    "zhaoyi",
    580,
    420,
    "兆易创新",
    "💡",
    "NOR Flash龙头 · DRAM控制器芯片 · IoT/汽车电子核心供应商",
    "core",
    [{ code: "603986", name: "兆易创新", price: 86.5, change: 1.7 }],
    "603986",
    "A股",
    undefined,
    "NOR Flash",
  ),
  n(
    "lanqi",
    830,
    420,
    "澜起科技",
    "🔋",
    "内存接口芯片(RCD/MR) · 供SK海力士/美光HBM模组 · DDR5/HBM3e认证",
    "core",
    [{ code: "688008", name: "澜起科技", price: 42.3, change: 3.8 }],
    "688008",
    "A股",
    undefined,
    "HBM接口芯片",
  ),
  n(
    "skhynix",
    1080,
    420,
    "SK海力士",
    "🇰🇷",
    "HBM3e/HBM4主供英伟达 · 全球HBM市占率57% · A100/H100/B200核心供应商",
    "core",
    [],
    "000660.KS",
    "外资",
    undefined,
    "HBM存储",
  ),
  n(
    "samsung_mem",
    1280,
    420,
    "三星存储",
    "🇰🇷",
    "DRAM/NAND/HBM全线产品 · HBM市占22% · 全球最大存储厂商",
    "core",
    [],
    "005930.KS",
    "外资",
    undefined,
    "HBM存储",
  ),

  n(
    "beiwei",
    80,
    630,
    "佰维存储",
    "💾",
    "存储模组/消费级SSD · HBM概念A股龙头 · 涨幅535%",
    "downstream",
    [{ code: "688525", name: "佰维存储", price: 38.6, change: 5.2 }],
    "688525",
    "A股",
    undefined,
    "存储模组",
  ),
  n(
    "jiangblong",
    330,
    630,
    "江波龙",
    "📦",
    "存储模组/eMMC/UFS · 行业中游分销模组龙头 · 覆盖手机/汽车/工业",
    "downstream",
    [{ code: "301308", name: "江波龙", price: 55.2, change: 2.1 }],
    "301308",
    "A股",
    undefined,
    "存储模组",
  ),
  n(
    "shannon",
    580,
    630,
    "香农芯创",
    "📡",
    "HBM存储转销/二次销售 · HBM概念涨幅王 · 覆盖AI服务器存储需求",
    "downstream",
    [{ code: "300475", name: "香农芯创", price: 125.4, change: 8.6 }],
    "300475",
    "A股",
    undefined,
    "HBM分发",
  ),
  n(
    "jingzhi",
    830,
    630,
    "精智达",
    "🔭",
    "HBM测试设备 · HBM高温老化/电性测试 · 涨幅298%，国内稀缺标的",
    "downstream",
    [{ code: "688627", name: "精智达", price: 186.3, change: 4.5 }],
    "688627",
    "A股",
    undefined,
    "存储测试设备",
  ),
  n(
    "zhongke",
    1080,
    630,
    "中科飞测",
    "🔍",
    "晶圆检测/量测设备 · 存储芯片良率检测 · 国产半导体设备龙头",
    "downstream",
    [{ code: "688361", name: "中科飞测", price: 132.5, change: 1.8 }],
    "688361",
    "A股",
    undefined,
    "晶圆检测设备",
  ),

  n(
    "nvidia_mem",
    200,
    840,
    "英伟达 NVIDIA",
    "🟢",
    "H100/H200/B200 GPU · 每块B200配12颗HBM3e(96GB) · AI算力第一需求方",
    "application",
    [],
    "NVDA",
    "美股",
    true,
  ),
  n(
    "gyfml_mem",
    600,
    840,
    "工业富联",
    "🖥️",
    "AI服务器整机组装 · GB200 NVL72机柜 · 英伟达最大ODM合作伙伴",
    "application",
    [{ code: "601138", name: "工业富联", price: 26.8, change: 1.3 }],
    "601138",
    "A股",
  ),
  n(
    "inspur_mem",
    1000,
    840,
    "浪潮信息",
    "☁️",
    "AI服务器/存储系统 · 国内HPC存储需求大客户 · 采购HBM模组",
    "application",
    [{ code: "000977", name: "浪潮信息", price: 42.1, change: 0.9 }],
    "000977",
    "A股",
  ),
];

const MEMORY_EDGES: Edge[] = [
  // L0 → L1 原材料供应
  e("mem-youyan-husi", "youyan", "husi", "upstream", "硅片靶材"),
  e("mem-jiangfeng-husi", "jiangfeng", "husi", "upstream", "钨/钛靶材"),
  e("mem-jiangfeng-anji", "jiangfeng", "anji", "upstream", "CMP耗材"),
  e("mem-yake-cxmt", "yake", "cxmt", "upstream", "前驱体气体"),
  e("mem-yake-ymtc", "yake", "ymtc", "upstream", "CVD前驱体"),
  e("mem-huate-cxmt", "huate", "cxmt", "upstream", "特种气体"),
  e("mem-huate-ymtc", "huate", "ymtc", "upstream", "刻蚀气体"),
  // L1 → L2 关键材料供应
  e("mem-husi-cxmt", "husi", "cxmt", "upstream", "12英寸硅片"),
  e("mem-husi-ymtc", "husi", "ymtc", "upstream", "12英寸硅片"),
  e("mem-lianjui-skhynix", "lianjui", "skhynix", "upstream", "封装填充料"),
  e("mem-anji-cxmt", "anji", "cxmt", "upstream", "CMP抛光液"),
  e("mem-anji-ymtc", "anji", "ymtc", "upstream", "CMP抛光液"),
  e("mem-dinglong-cxmt", "dinglong", "cxmt", "upstream", "CMP抛光垫"),
  e("mem-dinglong-ymtc", "dinglong", "ymtc", "upstream", "CMP抛光垫"),
  // L2 → L3 核心制造供应链
  e("mem-cxmt-beiwei", "cxmt", "beiwei", "core", "DRAM颗粒"),
  e("mem-cxmt-jiangblong", "cxmt", "jiangblong", "core", "DRAM颗粒"),
  e("mem-ymtc-beiwei", "ymtc", "beiwei", "core", "NAND颗粒"),
  e("mem-ymtc-jiangblong", "ymtc", "jiangblong", "core", "NAND颗粒"),
  e("mem-zhaoyi-jiangblong", "zhaoyi", "jiangblong", "core", "NOR Flash"),
  e("mem-skhynix-shannon", "skhynix", "shannon", "core", "HBM3e"),
  e("mem-jingzhi-skhynix", "jingzhi", "skhynix", "core", "HBM老化测试设备"),
  e("mem-zhongke-cxmt", "zhongke", "cxmt", "core", "晶圆检测"),
  e("mem-zhongke-ymtc", "zhongke", "ymtc", "core", "量测设备"),
  // L3 → L4 终端交付
  e(
    "mem-shannon-nvidia_mem",
    "shannon",
    "nvidia_mem",
    "downstream",
    "HBM3e模组",
  ),
  e("mem-beiwei-gyfml_mem", "beiwei", "gyfml_mem", "downstream", "DDR5模组"),
  e(
    "mem-jiangblong-gyfml_mem",
    "jiangblong",
    "gyfml_mem",
    "downstream",
    "存储模组",
  ),
  e(
    "mem-jiangblong-inspur_mem",
    "jiangblong",
    "inspur_mem",
    "downstream",
    "服务器内存",
  ),
  e(
    "mem-skhynix-nvidia_mem",
    "skhynix",
    "nvidia_mem",
    "downstream",
    "HBM3e/HBM4",
  ),
  e("mem-beiwei-inspur_mem", "beiwei", "inspur_mem", "downstream", "SSD/DRAM"),
];

// ─── Optical Module + CPO Supply Chain ───────────────────────────────────────

const OPTICS_NODES: ComponentNode[] = [
  n(
    "op_siph",
    80,
    0,
    "光迅科技",
    "💡",
    "光芯片(EML/DFB/SiP)三大平台·PLC/SiP硅光平台·为中际旭创等模块厂供芯片",
    "upstream",
    [{ code: "002281", name: "光迅科技", price: 28.4, change: 2.1 }],
    "002281",
    "A股",
    undefined,
    "EML/DFB激光芯片",
  ),
  n(
    "op_yuanjie",
    380,
    0,
    "源杰科技",
    "🔬",
    "高速光芯片·EML激光器芯片·国产光芯片替代进口核心标的",
    "upstream",
    [{ code: "688498", name: "源杰科技", price: 68.6, change: 3.8 }],
    "688498",
    "A股",
    undefined,
    "EML/DFB激光芯片",
  ),
  n(
    "op_siph2",
    680,
    0,
    "长光华芯",
    "⚡",
    "高功率半导体激光器·VCSEL芯片·数据中心光互联光源",
    "upstream",
    [{ code: "688048", name: "长光华芯", price: 42.3, change: 2.6 }],
    "688048",
    "A股",
    undefined,
    "VCSEL激光芯片",
  ),
  n(
    "op_jiapu",
    980,
    0,
    "仕佳光子",
    "🌐",
    "PLC平面光波导芯片·光分路器芯片·AWG阵列波导光栅",
    "upstream",
    [{ code: "688313", name: "仕佳光子", price: 18.6, change: 1.4 }],
    "688313",
    "A股",
    undefined,
    "PLC/AWG芯片",
  ),
  n(
    "op_saaan",
    1280,
    0,
    "三安光电",
    "🔬",
    "InP磷化铟外延片·激光器芯片外延·GaAs/InP半导体材料垂直整合·光模块光芯片基础供应商",
    "upstream",
    [{ code: "600703", name: "三安光电", price: 18.2, change: 1.1 }],
    "600703",
    "A股",
    undefined,
    "InP/GaAs外延片",
  ),

  n(
    "op_tianfu",
    80,
    210,
    "天孚通信",
    "🏆",
    "英伟达CPO交换机1.6T光引擎一供·FA光纤阵列/POSA·Mellanox核心供应商",
    "core",
    [{ code: "300394", name: "天孚通信", price: 112.5, change: 4.6 }],
    "300394",
    "A股",
    undefined,
    "CPO光引擎组件",
  ),
  n(
    "op_guangku",
    380,
    210,
    "光库科技",
    "🔮",
    "铌酸锂调制器·MPO/MTP高密光纤连接器·400G/800G/1.6T光模块核心器件",
    "core",
    [{ code: "300620", name: "光库科技", price: 56.8, change: 3.2 }],
    "300620",
    "A股",
    undefined,
    "光调制器",
  ),
  n(
    "op_taichen",
    680,
    210,
    "太辰光",
    "✨",
    "英伟达CPO Shufflebox核心组件·MPO连接器·信号分配处理组件",
    "core",
    [{ code: "300570", name: "太辰光", price: 38.4, change: 5.1 }],
    "300570",
    "A股",
    undefined,
    "MPO连接器",
  ),
  n(
    "op_boa",
    980,
    210,
    "长芯博创",
    "🔧",
    "光芯片→光器件→光模块垂直整合·SFP/QSFP系列·CPO技术探索",
    "core",
    [{ code: "300548", name: "长芯博创", price: 32.6, change: 1.8 }],
    "300548",
    "A股",
    undefined,
    "光器件集成",
  ),

  n(
    "op_zhongji",
    80,
    420,
    "中际旭创",
    "🥇",
    "全球光模块龙头·800G市占第一·1.6T硅光全球率先量产·英伟达/谷歌核心供应商",
    "downstream",
    [{ code: "300308", name: "中际旭创", price: 186.5, change: 5.4 }],
    "300308",
    "A股",
    undefined,
    "800G/1.6T光模块",
  ),
  n(
    "op_xinyisheng",
    380,
    420,
    "新易盛",
    "🚀",
    "800G LPO通过英伟达验证·GB200服务器采用·收购Alpine布局1.6T硅光",
    "downstream",
    [{ code: "300502", name: "新易盛", price: 98.6, change: 6.2 }],
    "300502",
    "A股",
    undefined,
    "800G LPO光模块",
  ),
  n(
    "op_huagong",
    680,
    420,
    "华工科技",
    "🔆",
    "全系列光模块·CPO技术持续投入·激光加工+光通信双主业",
    "downstream",
    [{ code: "000988", name: "华工科技", price: 28.4, change: 2.3 }],
    "000988",
    "A股",
    undefined,
    "全系列光模块",
  ),
  n(
    "op_jianqiao",
    980,
    420,
    "剑桥科技",
    "💎",
    "800G/1.6T高速光模块·电信+数通双赛道·CPO布局中的新锐",
    "downstream",
    [{ code: "603083", name: "剑桥科技", price: 45.6, change: 3.1 }],
    "603083",
    "A股",
    undefined,
    "800G/1.6T光模块",
  ),

  n(
    "op_nvidia_end",
    140,
    630,
    "英伟达 NVIDIA",
    "🟢",
    "CPO交换机光引擎需求·GB200 NVL72每机架用800G光模块超500个·1.6T升级驱动",
    "application",
    [],
    "NVDA",
    "美股",
    true,
  ),
  n(
    "op_hyperscaler",
    500,
    630,
    "海外超大规模CSP",
    "☁️",
    "Meta/Google/AWS/微软·CPO出货量预计2027年达450万件·800G/1.6T主导",
    "application",
    [],
    undefined,
    undefined,
  ),
  n(
    "op_telecom",
    860,
    630,
    "三大运营商",
    "📡",
    "5G/6G建设用光模块·中国移动/联通/电信·骨干网+接入网光模块持续采购",
    "application",
    [],
    undefined,
    undefined,
  ),
];

const OPTICS_EDGES: Edge[] = [
  e("op-siph-tianfu", "op_siph", "op_tianfu", "upstream", "光芯片"),
  e("op-siph-zhongji", "op_siph", "op_zhongji", "upstream", "EML芯片"),
  e(
    "op-yuanjie-xinyisheng",
    "op_yuanjie",
    "op_xinyisheng",
    "upstream",
    "激光器芯片",
  ),
  e("op-yuanjie-zhongji", "op_yuanjie", "op_zhongji", "upstream", "光芯片"),
  e("op-siph2-tianfu", "op_siph2", "op_tianfu", "upstream", "VCSEL光源"),
  e("op-siph2-huagong", "op_siph2", "op_huagong", "upstream", "激光器"),
  e("op-jiapu-guangku", "op_jiapu", "op_guangku", "upstream", "AWG芯片"),
  e("op-jiapu-tianfu", "op_jiapu", "op_tianfu", "upstream", "PLC器件"),
  e("op-saaan-yuanjie", "op_saaan", "op_yuanjie", "upstream", "InP外延片"),
  e("op-saaan-siph", "op_saaan", "op_siph", "upstream", "InP/GaAs外延"),
  e("op-saaan-siph2", "op_saaan", "op_siph2", "upstream", "GaAs外延片"),
  e("op-tianfu-zhongji", "op_tianfu", "op_zhongji", "core", "1.6T光引擎"),
  e("op-tianfu-nvidia", "op_tianfu", "op_nvidia_end", "core", "CPO光引擎"),
  e("op-guangku-zhongji", "op_guangku", "op_zhongji", "core", "铌酸锂调制器"),
  e("op-guangku-xinyisheng", "op_guangku", "op_xinyisheng", "core", "光器件"),
  e(
    "op-taichen-nvidia",
    "op_taichen",
    "op_nvidia_end",
    "core",
    "Shufflebox组件",
  ),
  e("op-boa-huagong", "op_boa", "op_huagong", "core", "光模块器件"),
  e(
    "op-zhongji-nvidia",
    "op_zhongji",
    "op_nvidia_end",
    "downstream",
    "800G/1.6T模块",
  ),
  e(
    "op-zhongji-hyperscaler",
    "op_zhongji",
    "op_hyperscaler",
    "downstream",
    "高速光模块",
  ),
  e(
    "op-xinyisheng-nvidia",
    "op_xinyisheng",
    "op_nvidia_end",
    "downstream",
    "LPO光模块",
  ),
  e(
    "op-xinyisheng-hyperscaler",
    "op_xinyisheng",
    "op_hyperscaler",
    "downstream",
    "1.6T模块",
  ),
  e(
    "op-huagong-telecom",
    "op_huagong",
    "op_telecom",
    "downstream",
    "电信光模块",
  ),
  e(
    "op-jianqiao-hyperscaler",
    "op_jianqiao",
    "op_hyperscaler",
    "downstream",
    "800G模块",
  ),
  e(
    "op-jianqiao-telecom",
    "op_jianqiao",
    "op_telecom",
    "downstream",
    "数通模块",
  ),
];

// ─── Optical Fiber Supply Chain ───────────────────────────────────────────────

const FIBER_NODES: ComponentNode[] = [
  n(
    "fb_sio2",
    100,
    0,
    "菲利华",
    "⚪",
    "高纯石英玻璃·光纤预制棒核心原材料·石英坩埚/石英管光纤专用",
    "upstream",
    [{ code: "300395", name: "菲利华", price: 38.6, change: 1.8 }],
    "300395",
    "A股",
    undefined,
    "高纯石英",
  ),
  n(
    "fb_gas",
    450,
    0,
    "华特气体",
    "💨",
    "四氯化硅/四氯化锗特种气体·光纤预制棒CVD工艺气源",
    "upstream",
    [{ code: "688268", name: "华特气体", price: 68.9, change: 1.2 }],
    "688268",
    "A股",
    undefined,
    "CVD气体",
  ),
  n(
    "fb_coat",
    800,
    0,
    "华峰化学",
    "🟡",
    "丙烯酸酯涂料·光纤涂覆层材料·光纤柔韧性/机械强度保护",
    "upstream",
    [{ code: "002064", name: "华峰化学", price: 12.4, change: 0.8 }],
    "002064",
    "A股",
    undefined,
    "光纤涂覆材料",
  ),

  n(
    "fb_preform_cf",
    100,
    210,
    "长飞光纤(棒)",
    "🏭",
    "全球唯一同时掌握PCVD/OVD/VAD三技术·国内预制棒第一·G.654.E高端光纤",
    "core",
    [{ code: "601869", name: "长飞光纤", price: 22.6, change: 1.5 }],
    "601869",
    "A股",
    undefined,
    "光纤预制棒",
  ),
  n(
    "fb_preform_ht",
    450,
    210,
    "亨通光电(棒)",
    "🔵",
    "光棒-光纤-光缆一体化·特种光纤预制棒·海底光缆预制棒",
    "core",
    [{ code: "600487", name: "亨通光电", price: 18.4, change: 1.1 }],
    "600487",
    "A股",
    undefined,
    "光纤预制棒",
  ),
  n(
    "fb_preform_zt",
    800,
    210,
    "中天科技(棒)",
    "🟢",
    "棒-纤-缆一体化布局·5G/AI数据中心光纤预制棒·海洋系统用特种预制棒",
    "core",
    [{ code: "600522", name: "中天科技", price: 16.8, change: 0.9 }],
    "600522",
    "A股",
    undefined,
    "光纤预制棒",
  ),

  n(
    "fb_fiber_cf",
    100,
    420,
    "长飞光纤(纤缆)",
    "🥇",
    "中国移动光纤光缆集采连续第一·AI数据中心用OM5多模光纤·2024年市场份额第一",
    "downstream",
    [{ code: "601869", name: "长飞光纤", price: 22.6, change: 1.5 }],
    "601869",
    "A股",
    undefined,
    "陆地光缆",
  ),
  n(
    "fb_fiber_ht",
    380,
    420,
    "亨通光电(缆)",
    "🌊",
    "国内光纤光缆龙头·海底光缆全球TOP3·AI数据中心内部光纤互联",
    "downstream",
    [{ code: "600487", name: "亨通光电", price: 18.4, change: 1.1 }],
    "600487",
    "A股",
    undefined,
    "海底光缆",
  ),
  n(
    "fb_fiber_zt",
    660,
    420,
    "中天科技(缆)",
    "📡",
    "光纤复合架空地线·海底光电缆·数据中心骨干光缆",
    "downstream",
    [{ code: "600522", name: "中天科技", price: 16.8, change: 0.9 }],
    "600522",
    "A股",
    undefined,
    "陆地光缆",
  ),
  n(
    "fb_fiber_fn",
    940,
    420,
    "烽火通信",
    "🔥",
    "光通信全产业链·智慧光网解决方案·光芯片+光模块+光缆垂直整合",
    "downstream",
    [{ code: "600498", name: "烽火通信", price: 38.6, change: 2.4 }],
    "600498",
    "A股",
    undefined,
    "光通信整合",
  ),

  n(
    "fb_telecom_end",
    140,
    630,
    "三大运营商",
    "📶",
    "5G承载网/骨干网大规模建设·6G预研用特种光纤·年采购光纤光缆超1亿芯公里",
    "application",
    [],
    undefined,
    undefined,
  ),
  n(
    "fb_dc_end",
    500,
    630,
    "数据中心",
    "🏢",
    "AI数据中心内部光互联·超低损耗G.654.E骨干传输·需求随AI算力爆发增长",
    "application",
    [],
    undefined,
    undefined,
  ),
  n(
    "fb_submarine",
    860,
    630,
    "海底光缆工程",
    "🌊",
    "跨洋骨干网建设·华海通信/亨通海洋·2025年全球海缆建设投入超60亿美元",
    "application",
    [{ code: "600487", name: "亨通光电", price: 28.6, change: 3.2 }],
    "600487",
    "A股",
  ),
];

const FIBER_EDGES: Edge[] = [
  e("fb-sio2-preform-cf", "fb_sio2", "fb_preform_cf", "upstream", "石英原料"),
  e("fb-sio2-preform-ht", "fb_sio2", "fb_preform_ht", "upstream", "石英管棒"),
  e("fb-sio2-preform-zt", "fb_sio2", "fb_preform_zt", "upstream", "石英材料"),
  e("fb-gas-preform-cf", "fb_gas", "fb_preform_cf", "upstream", "CVD气体"),
  e("fb-gas-preform-ht", "fb_gas", "fb_preform_ht", "upstream", "特种气体"),
  e("fb-coat-fiber-cf", "fb_coat", "fb_fiber_cf", "upstream", "光纤涂料"),
  e("fb-coat-fiber-ht", "fb_coat", "fb_fiber_ht", "upstream", "涂覆材料"),
  e(
    "fb-preform-cf-fiber-cf",
    "fb_preform_cf",
    "fb_fiber_cf",
    "core",
    "光纤预制棒",
  ),
  e("fb-preform-ht-fiber-ht", "fb_preform_ht", "fb_fiber_ht", "core", "预制棒"),
  e("fb-preform-zt-fiber-zt", "fb_preform_zt", "fb_fiber_zt", "core", "预制棒"),
  e("fb-preform-cf-fn", "fb_preform_cf", "fb_fiber_fn", "core", "光纤原料"),
  e(
    "fb-fiber-cf-telecom",
    "fb_fiber_cf",
    "fb_telecom_end",
    "downstream",
    "G.652/G.654光纤",
  ),
  e("fb-fiber-cf-dc", "fb_fiber_cf", "fb_dc_end", "downstream", "数据中心光缆"),
  e(
    "fb-fiber-ht-telecom",
    "fb_fiber_ht",
    "fb_telecom_end",
    "downstream",
    "光纤光缆",
  ),
  e(
    "fb-fiber-ht-submarine",
    "fb_fiber_ht",
    "fb_submarine",
    "downstream",
    "海底光缆",
  ),
  e(
    "fb-fiber-zt-telecom",
    "fb_fiber_zt",
    "fb_telecom_end",
    "downstream",
    "骨干光缆",
  ),
  e("fb-fiber-zt-dc", "fb_fiber_zt", "fb_dc_end", "downstream", "数据中心光缆"),
  e(
    "fb-fiber-fn-telecom",
    "fb_fiber_fn",
    "fb_telecom_end",
    "downstream",
    "智慧光网",
  ),
  e("fb-fiber-fn-dc", "fb_fiber_fn", "fb_dc_end", "downstream", "光通信方案"),
];

// ─── Liquid Cooling Supply Chain ──────────────────────────────────────────────

const LIQUIDCOOL_NODES: ComponentNode[] = [
  n(
    "lc_tube",
    80,
    0,
    "川环科技",
    "🔵",
    "液冷管路系统·数据中心服务器液冷管已批量供货·柔性高压管",
    "upstream",
    [{ code: "300547", name: "川环科技", price: 28.6, change: 4.2 }],
    "300547",
    "A股",
    undefined,
    "液冷管路",
  ),
  n(
    "lc_fluid",
    400,
    0,
    "三氟化工",
    "💧",
    "电子氟化液·浸没式液冷冷却介质·全氟碳化物系列",
    "upstream",
    [],
    undefined,
    undefined,
    undefined,
    "氟化冷却液",
  ),
  n(
    "lc_copper_pipe",
    720,
    0,
    "金龙铜管",
    "🟠",
    "精密铜管·冷板式液冷换热管·数据中心专用高导热铜管",
    "upstream",
    [{ code: "601992", name: "金隅集团", price: 18.4, change: 0.6 }],
    "601992",
    "A股",
    undefined,
    "换热铜管",
  ),
  n(
    "lc_pump",
    1040,
    0,
    "腾龙股份",
    "⚙️",
    "液冷循环泵/阀件·冷却液驱动系统·服务器液冷回路核心部件",
    "upstream",
    [{ code: "605288", name: "凯迪股份", price: 32.1, change: 3.8 }],
    "605288",
    "A股",
    undefined,
    "循环泵阀",
  ),

  n(
    "lc_coldplate",
    160,
    210,
    "飞荣达",
    "❄️",
    "服务器冷板制造·GPU专用液冷冷板·英伟达AI服务器散热方案",
    "upstream",
    [{ code: "300602", name: "飞荣达", price: 45.2, change: 2.9 }],
    "300602",
    "A股",
    undefined,
    "GPU冷板",
  ),
  n(
    "lc_cdu",
    560,
    210,
    "申菱环境",
    "🌡️",
    "CDU冷却分配单元·数据中心液冷基础设施·机房级液冷整体方案",
    "upstream",
    [{ code: "301018", name: "申菱环境", price: 68.3, change: 1.7 }],
    "301018",
    "A股",
    undefined,
    "CDU分配单元",
  ),
  n(
    "lc_immerse",
    960,
    210,
    "高澜股份",
    "🌊",
    "浸没式液冷模组·为字节跳动等互联网大厂供货·12U浸没液冷模组",
    "upstream",
    [{ code: "300499", name: "高澜股份", price: 38.7, change: 5.1 }],
    "300499",
    "A股",
    undefined,
    "浸没式液冷",
  ),

  n(
    "lc_yingweike",
    160,
    420,
    "英维克",
    "🏆",
    "英伟达指定液冷厂商·已交付超500MW液冷项目·Coolinside全链条方案",
    "core",
    [{ code: "002837", name: "英维克", price: 42.6, change: 3.4 }],
    "002837",
    "A股",
    undefined,
    "液冷系统集成",
  ),
  n(
    "lc_shuguang",
    560,
    420,
    "曙光数创",
    "🌟",
    "浸没式液冷数据中心·全球最大液冷数据中心运营商·PUE低至1.04",
    "core",
    [{ code: "688861", name: "曙光数创", price: 185.3, change: 4.8 }],
    "688861",
    "A股",
    undefined,
    "液冷数据中心",
  ),
  n(
    "lc_yimikang",
    960,
    420,
    "依米康",
    "🔧",
    "数据中心温控液冷方案·冷板式液冷系统集成·AI服务器热管理",
    "core",
    [{ code: "300249", name: "依米康", price: 18.9, change: 2.3 }],
    "300249",
    "A股",
    undefined,
    "液冷系统集成",
  ),

  n(
    "lc_nvidia_end",
    160,
    630,
    "英伟达 NVIDIA",
    "🟢",
    "GB300全面液冷化·单机柜功率130kW·液冷已从可选变必选",
    "application",
    [],
    "NVDA",
    "美股",
    true,
  ),
  n(
    "lc_idc",
    560,
    630,
    "工业富联(IDC)",
    "🏢",
    "AI数据中心建设·液冷机房整体交付·GB200 NVL72机柜液冷集成",
    "application",
    [{ code: "601138", name: "工业富联", price: 26.8, change: 1.3 }],
    "601138",
    "A股",
  ),
  n(
    "lc_vertiv",
    960,
    630,
    "维谛技术 Vertiv",
    "🌐",
    "全球液冷龙头·2025Q2营收26.4亿美元超预期·液冷系统全球市占第一",
    "application",
    [],
    "VRT",
    "美股",
  ),
];

const LIQUIDCOOL_EDGES: Edge[] = [
  e("lc-tube-cdu", "lc_tube", "lc_cdu", "upstream", "液冷管路"),
  e("lc-tube-yingweike", "lc_tube", "lc_yingweike", "upstream", "管路系统"),
  e("lc-fluid-immerse", "lc_fluid", "lc_immerse", "upstream", "氟化冷却液"),
  e("lc-fluid-shuguang", "lc_fluid", "lc_shuguang", "upstream", "浸没介质"),
  e(
    "lc-copper-coldplate",
    "lc_copper_pipe",
    "lc_coldplate",
    "upstream",
    "铜管",
  ),
  e("lc-copper-cdu", "lc_copper_pipe", "lc_cdu", "upstream", "换热铜管"),
  e("lc-pump-cdu", "lc_pump", "lc_cdu", "upstream", "循环泵"),
  e("lc-pump-yingweike", "lc_pump", "lc_yingweike", "upstream", "泵阀"),
  e(
    "lc-coldplate-yingweike",
    "lc_coldplate",
    "lc_yingweike",
    "core",
    "GPU冷板",
  ),
  e("lc-coldplate-fii", "lc_coldplate", "lc_idc", "core", "冷板模组"),
  e("lc-cdu-yingweike", "lc_cdu", "lc_yingweike", "core", "CDU"),
  e("lc-cdu-shuguang", "lc_cdu", "lc_shuguang", "core", "CDU单元"),
  e("lc-immerse-shuguang", "lc_immerse", "lc_shuguang", "core", "浸没模组"),
  e("lc-immerse-yimikang", "lc_immerse", "lc_yimikang", "core", "液冷模组"),
  e(
    "lc-yingweike-nvidia",
    "lc_yingweike",
    "lc_nvidia_end",
    "downstream",
    "液冷方案",
  ),
  e("lc-yingweike-idc", "lc_yingweike", "lc_idc", "downstream", "液冷系统"),
  e("lc-shuguang-idc", "lc_shuguang", "lc_idc", "downstream", "液冷数据中心"),
  e("lc-yimikang-idc", "lc_yimikang", "lc_idc", "downstream", "温控方案"),
  e("lc-idc-vertiv", "lc_idc", "lc_vertiv", "downstream", "液冷竞合"),
];

// ─── AI Power Supply Chain ────────────────────────────────────────────────────

const AIPOWER_NODES: ComponentNode[] = [
  // L0 核心原材料 y=0
  n(
    "pw_capacitor",
    100,
    0,
    "法拉电子",
    "⚡",
    "铝电解电容·服务器电源滤波/储能·工业级高频电容龙头",
    "upstream",
    [{ code: "600563", name: "法拉电子", price: 68.2, change: 1.2 }],
    "600563",
    "A股",
    undefined,
    "铝电解电容",
  ),
  n(
    "pw_battery",
    400,
    0,
    "蔚蓝锂芯",
    "🔋",
    "BBU锂电池电芯·英伟达GB200 BBU备电方案·领先布局7品电芯",
    "upstream",
    [{ code: "002245", name: "蔚蓝锂芯", price: 28.4, change: 6.8 }],
    "002245",
    "A股",
    undefined,
    "BBU锂电池",
  ),
  n(
    "pw_sic_sub",
    700,
    0,
    "天科合达",
    "💠",
    "SiC碳化硅衬底片·N型4H-SiC单晶 · 国内SiC衬底龙头 · 供斯达半导/华润微等",
    "upstream",
    [{ code: "688601", name: "力芯微", price: 68.5, change: 1.8 }],
    "688601",
    "A股",
    undefined,
    "SiC衬底",
  ),
  n(
    "pw_sic",
    1000,
    0,
    "斯达半导",
    "💎",
    "碳化硅SiC功率器件·GB300电源模块引入SiC·每瓦价值量提升至6-7元",
    "upstream",
    [{ code: "603290", name: "斯达半导", price: 118.6, change: 2.4 }],
    "603290",
    "A股",
    undefined,
    "SiC功率器件",
  ),
  n(
    "pw_gan",
    1300,
    0,
    "华润微",
    "⚡",
    "GaN氮化镓功率器件/SiC MOSFET · AI服务器AC-DC/LLC电源高效转换 · 数据中心功率密度提升核心",
    "upstream",
    [{ code: "688396", name: "华润微", price: 32.4, change: 1.6 }],
    "688396",
    "A股",
    undefined,
    "GaN功率器件",
  ),
  n(
    "pw_transformer",
    1600,
    0,
    "特变电工",
    "🔌",
    "数据中心变压器/配电柜·超大型AI数据中心高压电力接入·国内配变电龙头·向IDC园区供高压侧设备",
    "upstream",
    [{ code: "600089", name: "特变电工", price: 14.8, change: 0.9 }],
    "600089",
    "A股",
    undefined,
    "变压器/高压配电",
  ),

  // L1 关键模块 y=210
  n(
    "pw_psu",
    100,
    210,
    "麦格米特",
    "⚙️",
    "英伟达官宣合作PSU电源·参与GB200系统创新设计·BBU电源领域抢占台达份额",
    "core",
    [{ code: "002851", name: "麦格米特", price: 52.6, change: 4.3 }],
    "002851",
    "A股",
    undefined,
    "PSU服务器电源",
  ),
  n(
    "pw_hvdc",
    500,
    210,
    "中恒电气",
    "🔆",
    "HVDC高压直流电源·数据中心巴拿马电源方案·AC/DC一级变换效率更高",
    "core",
    [{ code: "002364", name: "中恒电气", price: 18.9, change: 2.1 }],
    "002364",
    "A股",
    undefined,
    "HVDC高压直流",
  ),
  n(
    "pw_ups",
    900,
    210,
    "科华数据",
    "🛡️",
    "UPS不间断电源·数据中心备电方案·存量AI数据中心兼容方案",
    "core",
    [{ code: "002335", name: "科华数据", price: 22.4, change: 1.6 }],
    "002335",
    "A股",
    undefined,
    "UPS备电",
  ),
  n(
    "pw_bbu_pack",
    1300,
    210,
    "欧陆通",
    "📦",
    "BBU Pack电源模块·英伟达BB200配套·服务器电源模块ODM厂商",
    "core",
    [{ code: "300870", name: "欧陆通", price: 45.8, change: 3.2 }],
    "300870",
    "A股",
    undefined,
    "BBU Pack模块",
  ),

  // L2 供配电系统集成 y=420
  n(
    "pw_keshida",
    250,
    420,
    "科士达",
    "⚡",
    "UPS+精密配电一体化·数据中心供配电系统·华为昇腾AI服务器配套方案",
    "downstream",
    [{ code: "002518", name: "科士达", price: 16.8, change: 1.4 }],
    "002518",
    "A股",
    undefined,
    "供配电系统集成",
  ),
  n(
    "pw_jinpan",
    750,
    420,
    "金盘科技",
    "🏭",
    "智能电气设备·数据中心配电系统·字节/腾讯/阿里数据中心供应商",
    "downstream",
    [{ code: "688676", name: "金盘科技", price: 32.5, change: 2.8 }],
    "688676",
    "A股",
    undefined,
    "供配电系统集成",
  ),
  n(
    "pw_kehua",
    1250,
    420,
    "科华数据(IDC)",
    "🔋",
    "模块化数据中心整体供配电方案·液冷+电源一体化·2025年AI订单大增",
    "downstream",
    [{ code: "002335", name: "科华数据", price: 22.4, change: 1.6 }],
    "002335",
    "A股",
    undefined,
    "供配电系统集成",
  ),

  // L3 终端 y=630
  n(
    "pw_nvidia_end",
    200,
    630,
    "英伟达 NVIDIA",
    "🟢",
    "GB200单机柜功率130kW·GB300引入BBU替代UPS·PSU模块功率13kW",
    "application",
    [],
    "NVDA",
    "美股",
    true,
  ),
  n(
    "pw_hyperscaler",
    700,
    630,
    "超大规模数据中心",
    "🌐",
    "Meta/Google/AWS/微软·资本开支合计超4000亿美元·全球AI算力主要买家",
    "application",
    [],
    undefined,
    undefined,
  ),
  n(
    "pw_cn_idc",
    1200,
    630,
    "国内云厂商",
    "☁️",
    "字节/阿里/腾讯/百度·国内数据中心建设提速·2025年资本开支同比+40%",
    "application",
    [],
    undefined,
    undefined,
  ),
];

const AIPOWER_EDGES: Edge[] = [
  e("pw-cap-psu", "pw_capacitor", "pw_psu", "upstream", "储能电容"),
  e("pw-cap-hvdc", "pw_capacitor", "pw_hvdc", "upstream", "滤波电容"),
  e("pw-battery-bbu", "pw_battery", "pw_bbu_pack", "upstream", "BBU电芯"),
  e("pw-battery-psu", "pw_battery", "pw_psu", "upstream", "锂电池"),
  e("pw-sic-psu", "pw_sic", "pw_psu", "upstream", "SiC功率管"),
  e("pw-sic-hvdc", "pw_sic", "pw_hvdc", "upstream", "SiC器件"),
  e("pw-sic_sub-sic", "pw_sic_sub", "pw_sic", "upstream", "SiC衬底片"),
  e("pw-gan-psu", "pw_gan", "pw_psu", "upstream", "GaN功率器件"),
  e("pw-gan-hvdc", "pw_gan", "pw_hvdc", "upstream", "GaN高效转换"),
  e(
    "pw-transformer-keshida",
    "pw_transformer",
    "pw_keshida",
    "upstream",
    "配变电",
  ),
  e(
    "pw-transformer-jinpan",
    "pw_transformer",
    "pw_jinpan",
    "upstream",
    "变压器",
  ),
  e("pw-psu-keshida", "pw_psu", "pw_keshida", "core", "PSU模块"),
  e("pw-psu-nvidia", "pw_psu", "pw_nvidia_end", "core", "13kW电源模块"),
  e("pw-hvdc-keshida", "pw_hvdc", "pw_keshida", "core", "HVDC电源"),
  e("pw-hvdc-jinpan", "pw_hvdc", "pw_jinpan", "core", "HVDC方案"),
  e("pw-ups-kehua", "pw_ups", "pw_kehua", "core", "UPS方案"),
  e("pw-bbu-nvidia", "pw_bbu_pack", "pw_nvidia_end", "core", "BBU备电"),
  e(
    "pw-keshida-nvidia",
    "pw_keshida",
    "pw_nvidia_end",
    "downstream",
    "供配电系统",
  ),
  e(
    "pw-keshida-hyperscaler",
    "pw_keshida",
    "pw_hyperscaler",
    "downstream",
    "数据中心供电",
  ),
  e(
    "pw-jinpan-hyperscaler",
    "pw_jinpan",
    "pw_hyperscaler",
    "downstream",
    "配电系统",
  ),
  e("pw-jinpan-cn", "pw_jinpan", "pw_cn_idc", "downstream", "国内配电"),
  e("pw-kehua-cn", "pw_kehua", "pw_cn_idc", "downstream", "模块化IDC"),
];

// ─── Copper Interconnect Supply Chain ─────────────────────────────────────────

const COPPER_NODES: ComponentNode[] = [
  n(
    "cu_copper",
    120,
    0,
    "铜陵有色",
    "🟠",
    "电解铜原料·高纯铜导体·高速铜缆核心原材料",
    "upstream",
    [{ code: "000630", name: "铜陵有色", price: 8.4, change: 0.5 }],
    "000630",
    "A股",
    undefined,
    "电解铜",
  ),
  n(
    "cu_foil",
    480,
    0,
    "诺德股份",
    "📜",
    "HVLP/RTF铜箔·AI服务器高性能PCB关键材料·英伟达/字节跳动春节不停工采购",
    "upstream",
    [{ code: "600110", name: "诺德股份", price: 12.6, change: 2.8 }],
    "600110",
    "A股",
    undefined,
    "高性能铜箔",
  ),
  n(
    "cu_silver",
    840,
    0,
    "兴业银锡",
    "⚪",
    "镀银导体·高速铜缆DAC芯线镀银处理·降低高频信号损耗",
    "upstream",
    [],
    undefined,
    undefined,
    undefined,
    "镀银处理",
  ),

  n(
    "cu_wolcore",
    160,
    210,
    "沃尔核材",
    "🔗",
    "高速铜缆DAC直连铜缆·AI服务器GPU-Switch互联·56G/112G PAM4信号线",
    "core",
    [{ code: "002130", name: "沃尔核材", price: 22.8, change: 5.6 }],
    "002130",
    "A股",
    undefined,
    "DAC无源铜缆",
  ),
  n(
    "cu_zhaolong",
    560,
    210,
    "兆龙互连",
    "⚡",
    "AEC有源铜缆·Retimer信号增强·800G AEC已向AWS批量供货",
    "core",
    [{ code: "300913", name: "兆龙互连", price: 38.4, change: 7.2 }],
    "300913",
    "A股",
    undefined,
    "AEC有源铜缆",
  ),
  n(
    "cu_shenyu",
    960,
    210,
    "神宇股份",
    "🔌",
    "高速连接器/铜缆组件·机柜内短距互联·AI服务器机柜内部配线",
    "core",
    [{ code: "603465", name: "神宇股份", price: 28.6, change: 4.1 }],
    "603465",
    "A股",
    undefined,
    "高速连接器",
  ),

  n(
    "cu_dingtong",
    160,
    420,
    "鼎通科技",
    "🔧",
    "精密连接器·AI服务器背板连接·SFP/QSFP高速连接器",
    "downstream",
    [{ code: "603659", name: "璞泰来", price: 45.6, change: 3.5 }],
    "603659",
    "A股",
    undefined,
    "精密连接器",
  ),
  n(
    "cu_credo",
    560,
    420,
    "Credo(AEC龙头)",
    "🇺🇸",
    "AEC行业龙头·1.6T AEC产品·AWS占Credo收入34%·与AWS深度绑定",
    "downstream",
    [],
    "CRDO",
    "美股",
    undefined,
    "AEC系统",
  ),
  n(
    "cu_amphenol",
    960,
    420,
    "安费诺",
    "🌐",
    "全球高速连接器龙头·DAC/AEC线缆组件·AI服务器连接方案市占第一",
    "downstream",
    [],
    "APH",
    "美股",
    undefined,
    "高速连接方案",
  ),

  n(
    "cu_nvidia_end",
    160,
    630,
    "英伟达 NVIDIA",
    "🟢",
    "NVL72机柜铜缆价值量超10万美元·DAC短距无源铜缆主导·光进铜退争议",
    "application",
    [],
    "NVDA",
    "美股",
    true,
  ),
  n(
    "cu_aws",
    560,
    630,
    "亚马逊 AWS",
    "🟡",
    "400G AEC最大买家·年采购150万张GPU卡·Credo AEC收入34%来自AWS",
    "application",
    [],
    "AMZN",
    "美股",
  ),
  n(
    "cu_domestic",
    960,
    630,
    "国内云厂商",
    "☁️",
    "字节跳动/百度/阿里·国内AI集群铜缆用量高速增长·800G→1.6T升级窗口",
    "application",
    [],
    undefined,
    undefined,
  ),
];

const COPPER_EDGES: Edge[] = [
  e("cu-copper-wolcore", "cu_copper", "cu_wolcore", "upstream", "高纯铜"),
  e("cu-copper-zhaolong", "cu_copper", "cu_zhaolong", "upstream", "铜导体"),
  e("cu-foil-wolcore", "cu_foil", "cu_wolcore", "upstream", "HVLP铜箔"),
  e("cu-foil-shenyu", "cu_foil", "cu_shenyu", "upstream", "铜箔材料"),
  e("cu-silver-wolcore", "cu_silver", "cu_wolcore", "upstream", "镀银芯线"),
  e("cu-silver-zhaolong", "cu_silver", "cu_zhaolong", "upstream", "镀银导体"),
  e("cu-wolcore-dingtong", "cu_wolcore", "cu_dingtong", "core", "DAC铜缆"),
  e("cu-wolcore-nvidia", "cu_wolcore", "cu_nvidia_end", "core", "DAC直连铜缆"),
  e("cu-zhaolong-credo", "cu_zhaolong", "cu_credo", "core", "AEC竞合"),
  e("cu-zhaolong-aws", "cu_zhaolong", "cu_aws", "core", "800G AEC"),
  e("cu-shenyu-dingtong", "cu_shenyu", "cu_dingtong", "core", "连接器件"),
  e("cu-shenyu-amphenol", "cu_shenyu", "cu_amphenol", "core", "配套供货"),
  e(
    "cu-dingtong-nvidia",
    "cu_dingtong",
    "cu_nvidia_end",
    "downstream",
    "背板连接器",
  ),
  e("cu-credo-aws", "cu_credo", "cu_aws", "downstream", "AEC线缆"),
  e("cu-credo-nvidia", "cu_credo", "cu_nvidia_end", "downstream", "1.6T AEC"),
  e(
    "cu-amphenol-nvidia",
    "cu_amphenol",
    "cu_nvidia_end",
    "downstream",
    "连接方案",
  ),
  e("cu-amphenol-aws", "cu_amphenol", "cu_aws", "downstream", "连接器"),
  e(
    "cu-wolcore-domestic",
    "cu_wolcore",
    "cu_domestic",
    "downstream",
    "国产铜缆",
  ),
  e(
    "cu-zhaolong-domestic",
    "cu_zhaolong",
    "cu_domestic",
    "downstream",
    "AEC方案",
  ),
];

// ─── AI GPU Chip Supply Chain ─────────────────────────────────────────────────

const AIGPU_NODES: ComponentNode[] = [
  n(
    "gpu_eda",
    100,
    0,
    "华大九天",
    "🛠️",
    "国内EDA龙头·模拟电路EDA·AI芯片设计仿真必备工具链",
    "upstream",
    [{ code: "301269", name: "华大九天", price: 68.4, change: 2.1 }],
    "301269",
    "A股",
    undefined,
    "EDA工具",
  ),
  n(
    "gpu_ip",
    400,
    0,
    "芯原股份",
    "💡",
    "半导体IP提供商·GPU IP授权·为国产AI芯片提供图形/神经网络IP",
    "upstream",
    [{ code: "688521", name: "芯原股份", price: 32.6, change: 1.8 }],
    "688521",
    "A股",
    undefined,
    "半导体IP",
  ),
  n(
    "gpu_tsmc",
    700,
    0,
    "台积电 TSMC",
    "🏭",
    "N4P/N3制程代工·英伟达B200/GB300芯片代工·全球最先进AI芯片制造",
    "upstream",
    [],
    "TSM",
    "美股",
    undefined,
    "晶圆代工",
  ),
  n(
    "gpu_packaging",
    1000,
    0,
    "长电科技",
    "📦",
    "先进封装测试 · HBM+GPU异构集成封装测试 · 国内先进封装龙头 · CoWoS封装辅助测试",
    "upstream",
    [{ code: "600584", name: "长电科技", price: 28.6, change: 1.4 }],
    "600584",
    "A股",
    undefined,
    "先进封装",
  ),

  n(
    "gpu_nvidia",
    100,
    210,
    "英伟达 NVIDIA",
    "🟢",
    "H100/B200/GB200·全球AI训练市占率80%+·CUDA生态护城河极深",
    "core",
    [],
    "NVDA",
    "美股",
    true,
    "AI GPU",
  ),
  n(
    "gpu_cambricon",
    400,
    210,
    "寒武纪",
    "🔥",
    "国内AI芯片龙头·思元590云端推理·MLU系列训练芯片·华为昇腾外唯一国产云端AI芯片",
    "core",
    [{ code: "688256", name: "寒武纪", price: 486.5, change: 8.6 }],
    "688256",
    "A股",
    undefined,
    "AI NPU",
  ),
  n(
    "gpu_hygon",
    700,
    210,
    "海光信息",
    "🔷",
    "兼容x86架构DCU·国内唯一x86 GPU·金融/政务信创算力首选·大基金持股",
    "core",
    [{ code: "688041", name: "海光信息", price: 68.4, change: 3.2 }],
    "688041",
    "A股",
    undefined,
    "x86 GPU/DCU",
  ),
  n(
    "gpu_jingjia",
    1000,
    210,
    "景嘉微",
    "🎮",
    "国内GPU芯片先行者·JM9系列·军工+政务显卡市场·完全自主知识产权",
    "core",
    [{ code: "300474", name: "景嘉微", price: 82.6, change: 4.8 }],
    "300474",
    "A股",
    undefined,
    "自主GPU",
  ),

  n(
    "gpu_sugon_sys",
    150,
    420,
    "中科曙光(算力)",
    "🌅",
    "海光DCU算力集群·自主可控AI服务器·政府/金融算力采购第一",
    "downstream",
    [{ code: "603019", name: "中科曙光", price: 58.4, change: 1.4 }],
    "603019",
    "A股",
    undefined,
    "AI算力服务器",
  ),
  n(
    "gpu_inspur_sys",
    500,
    420,
    "浪潮信息(算力)",
    "🖥️",
    "英伟达AI服务器国内最大代理·海光DCU服务器·算力租赁+整机销售",
    "downstream",
    [{ code: "000977", name: "浪潮信息", price: 42.1, change: 0.9 }],
    "000977",
    "A股",
    undefined,
    "AI算力服务器",
  ),
  n(
    "gpu_huawei_sys",
    850,
    420,
    "华为昇腾",
    "📱",
    "Ascend 910B/910C·国内最强国产AI芯片·与英伟达H100训练效能持平",
    "downstream",
    [],
    undefined,
    undefined,
    undefined,
    "国产AI芯片",
  ),

  n(
    "gpu_bytedance_end",
    150,
    630,
    "字节跳动",
    "🎵",
    "豆包/剪映大模型·全球最大GPU采购商之一·自研豆芯芯片规划中",
    "application",
    [],
    undefined,
    undefined,
  ),
  n(
    "gpu_baidu_end",
    500,
    630,
    "百度",
    "🔵",
    "文心大模型·昆仑AI芯片自研·飞桨深度学习框架·AI云服务龙头",
    "application",
    [{ code: "9888.HK", name: "百度", price: 98.5, change: 1.2 }],
    "9888.HK",
    "港股",
  ),
  n(
    "gpu_gov_end",
    850,
    630,
    "政务/金融算力",
    "🏛️",
    "信创AI算力采购·海光DCU+昇腾主导·国产算力替代英伟达核心市场",
    "application",
    [],
    undefined,
    undefined,
  ),
];

const AIGPU_EDGES: Edge[] = [
  e("gp-eda-cambricon", "gpu_eda", "gpu_cambricon", "upstream", "EDA工具"),
  e("gp-eda-hygon", "gpu_eda", "gpu_hygon", "upstream", "芯片设计"),
  e("gp-ip-cambricon", "gpu_ip", "gpu_cambricon", "upstream", "神经网络IP"),
  e("gp-tsmc-nvidia", "gpu_tsmc", "gpu_nvidia", "upstream", "N4P代工"),
  e("gp-tsmc-cambricon", "gpu_tsmc", "gpu_cambricon", "upstream", "先进制程"),
  e(
    "gp-packaging-nvidia",
    "gpu_packaging",
    "gpu_nvidia",
    "upstream",
    "封装测试服务",
  ),
  e(
    "gp-packaging-cambricon",
    "gpu_packaging",
    "gpu_cambricon",
    "upstream",
    "先进封装",
  ),
  e("gp-nvidia-inspur", "gpu_nvidia", "gpu_inspur_sys", "core", "H100/B200"),
  e("gp-cambricon-sugon", "gpu_cambricon", "gpu_sugon_sys", "core", "思元590"),
  e("gp-hygon-sugon", "gpu_hygon", "gpu_sugon_sys", "core", "DCU"),
  e("gp-hygon-inspur", "gpu_hygon", "gpu_inspur_sys", "core", "DCU服务器"),
  e("gp-huawei-sugon", "gpu_huawei_sys", "gpu_sugon_sys", "core", "昇腾方案"),
  e(
    "gp-sugon-bytedance",
    "gpu_sugon_sys",
    "gpu_bytedance_end",
    "downstream",
    "算力集群",
  ),
  e("gp-sugon-gov", "gpu_sugon_sys", "gpu_gov_end", "downstream", "信创算力"),
  e(
    "gp-inspur-bytedance",
    "gpu_inspur_sys",
    "gpu_bytedance_end",
    "downstream",
    "AI服务器",
  ),
  e(
    "gp-inspur-baidu",
    "gpu_inspur_sys",
    "gpu_baidu_end",
    "downstream",
    "AI算力",
  ),
  e("gp-huawei-baidu", "gpu_huawei_sys", "gpu_baidu_end", "downstream", "昇腾"),
  e("gp-huawei-gov", "gpu_huawei_sys", "gpu_gov_end", "downstream", "政务算力"),
];

// ─── IDC / Smart Data Center Supply Chain ─────────────────────────────────────

const IDC_NODES: ComponentNode[] = [
  n(
    "idc_land",
    100,
    0,
    "中国铁塔",
    "🗼",
    "数据中心机房建设·边缘算力节点·5G基站配套算力·运营商共享基础设施",
    "upstream",
    [{ code: "0788.HK", name: "中国铁塔", price: 1.28, change: 0.8 }],
    "0788.HK",
    "港股",
    undefined,
    "机房选址/建设",
  ),
  n(
    "idc_elec",
    450,
    0,
    "国家电网/南方电网",
    "⚡",
    "数据中心供电接入·大型IDC专线供电·AI算力中心用电保障",
    "upstream",
    [],
    undefined,
    undefined,
    undefined,
    "供电接入",
  ),
  n(
    "idc_construct",
    800,
    0,
    "中兴通讯",
    "🏗️",
    "数据中心配套通信设备·基础网络设施·5G+算力融合基础设施",
    "upstream",
    [{ code: "000063", name: "中兴通讯", price: 28.4, change: 1.2 }],
    "000063",
    "A股",
    undefined,
    "通信基础设施",
  ),

  n(
    "idc_ups",
    100,
    210,
    "科士达",
    "🔋",
    "UPS不间断电源+精密配电·数据中心电源一体化方案·华为/字节IDC配套",
    "upstream",
    [{ code: "002518", name: "科士达", price: 16.8, change: 1.4 }],
    "002518",
    "A股",
    undefined,
    "UPS供配电",
  ),
  n(
    "idc_cool",
    450,
    210,
    "英维克",
    "❄️",
    "精密温控/液冷·英伟达指定液冷厂商·数据中心机房级热管理",
    "upstream",
    [{ code: "002837", name: "英维克", price: 42.6, change: 3.4 }],
    "002837",
    "A股",
    undefined,
    "精密温控",
  ),
  n(
    "idc_cabinet",
    800,
    210,
    "佳力图",
    "📦",
    "数据中心机柜/微模块·AI专用高密机柜·液冷机柜一体化解决方案",
    "upstream",
    [{ code: "603912", name: "佳力图", price: 18.6, change: 2.8 }],
    "603912",
    "A股",
    undefined,
    "AI专用机柜",
  ),

  n(
    "idc_runze",
    150,
    420,
    "润泽科技",
    "🌊",
    "AI专属超大规模数据中心·廊坊算力基地·A股最纯正IDC+AI算力标的",
    "core",
    [{ code: "300442", name: "润泽科技", price: 12.8, change: 3.6 }],
    "300442",
    "A股",
    undefined,
    "超大规模IDC",
  ),
  n(
    "idc_aofei",
    500,
    420,
    "奥飞数据",
    "🚀",
    "智算中心运营商·算力租赁毛利率60%+·广州/北京智算中心已投产",
    "core",
    [{ code: "300738", name: "奥飞数据", price: 38.6, change: 4.2 }],
    "300738",
    "A股",
    undefined,
    "智算中心运营",
  ),
  n(
    "idc_guanghuan",
    850,
    420,
    "光环新网",
    "💫",
    "超大规模数据中心·液冷数据中心·采购英伟达GPU用于算力租赁",
    "core",
    [{ code: "300383", name: "光环新网", price: 22.4, change: 1.6 }],
    "300383",
    "A股",
    undefined,
    "超大规模IDC",
  ),

  n(
    "idc_bytedance_end",
    150,
    630,
    "字节/快手/B站",
    "🎬",
    "短视频/推荐算法大模型训练·IDC机房最大租赁客户群·自建算力+外购并行",
    "application",
    [],
    undefined,
    undefined,
  ),
  n(
    "idc_cloud",
    500,
    630,
    "云计算/政务云",
    "☁️",
    "阿里云/腾讯云/华为云·政务数字化·算力租赁年增速40%+",
    "application",
    [],
    undefined,
    undefined,
  ),
  n(
    "idc_operator",
    850,
    630,
    "三大运营商",
    "📶",
    "中国移动/联通/电信·国家算力网络骨干节点·算网一体化战略",
    "application",
    [],
    undefined,
    undefined,
  ),
];

const IDC_EDGES: Edge[] = [
  e("idc-land-runze", "idc_land", "idc_runze", "upstream", "机房选址/建设"),
  e("idc-elec-runze", "idc_elec", "idc_runze", "upstream", "专线供电"),
  e("idc-elec-aofei", "idc_elec", "idc_aofei", "upstream", "高压供电"),
  e(
    "idc-construct-runze",
    "idc_construct",
    "idc_runze",
    "upstream",
    "通信基础设施",
  ),
  e("idc-ups-runze", "idc_ups", "idc_runze", "upstream", "机房供配电"),
  e("idc-ups-aofei", "idc_ups", "idc_aofei", "upstream", "UPS配电"),
  e("idc-cool-runze", "idc_cool", "idc_runze", "upstream", "液冷系统"),
  e("idc-cool-aofei", "idc_cool", "idc_aofei", "upstream", "精密温控"),
  e("idc-cool-guanghuan", "idc_cool", "idc_guanghuan", "upstream", "液冷方案"),
  e("idc-cabinet-runze", "idc_cabinet", "idc_runze", "upstream", "高密机柜"),
  e("idc-cabinet-aofei", "idc_cabinet", "idc_aofei", "upstream", "AI机柜"),
  e(
    "idc-runze-bytedance",
    "idc_runze",
    "idc_bytedance_end",
    "downstream",
    "算力租赁",
  ),
  e("idc-runze-cloud", "idc_runze", "idc_cloud", "downstream", "IDC托管"),
  e(
    "idc-aofei-bytedance",
    "idc_aofei",
    "idc_bytedance_end",
    "downstream",
    "智算服务",
  ),
  e("idc-aofei-cloud", "idc_aofei", "idc_cloud", "downstream", "算力服务"),
  e(
    "idc-guanghuan-cloud",
    "idc_guanghuan",
    "idc_cloud",
    "downstream",
    "云基础设施",
  ),
  e(
    "idc-guanghuan-operator",
    "idc_guanghuan",
    "idc_operator",
    "downstream",
    "数据中心",
  ),
];

const INDUSTRY_REGISTRY: Record<
  string,
  { title: string; subtitle: string; nodes: ComponentNode[]; edges: Edge[] }
> = {
  pcb: {
    title: "PCB 企业供应链",
    subtitle: "以英伟达为核心的高端PCB产业企业关系图谱",
    nodes: PCB_NODES,
    edges: PCB_EDGES,
  },
  mlcc: {
    title: "MLCC 企业供应链",
    subtitle: "以英伟达为核心的被动元件产业企业关系图谱",
    nodes: MLCC_NODES,
    edges: MLCC_EDGES,
  },
  memory: {
    title: "存储芯片企业供应链",
    subtitle: "以英伟达HBM需求为核心的存储芯片产业企业关系图谱",
    nodes: MEMORY_NODES,
    edges: MEMORY_EDGES,
  },
  optics: {
    title: "光模块与CPO供应链",
    subtitle: "以英伟达CPO交换机为核心的光模块/共封装光学产业链图谱",
    nodes: OPTICS_NODES,
    edges: OPTICS_EDGES,
  },
  fiber: {
    title: "光纤光缆供应链",
    subtitle: "从光纤预制棒到光缆的全产业链图谱（AI数据中心+5G/6G驱动）",
    nodes: FIBER_NODES,
    edges: FIBER_EDGES,
  },
  liquidcool: {
    title: "液冷散热供应链",
    subtitle: "AI芯片功耗突破1.2kW驱动液冷从可选变必选的产业链图谱",
    nodes: LIQUIDCOOL_NODES,
    edges: LIQUIDCOOL_EDGES,
  },
  aipower: {
    title: "AI供配电供应链",
    subtitle: "GB200/GB300机柜供配电体系（PSU/BBU/HVDC）产业图谱",
    nodes: AIPOWER_NODES,
    edges: AIPOWER_EDGES,
  },
  coppercable: {
    title: "高速铜连接供应链",
    subtitle: "AI机柜内GPU-Switch短距互联铜缆（DAC/AEC）产业图谱",
    nodes: COPPER_NODES,
    edges: COPPER_EDGES,
  },
  aigpu: {
    title: "AI算力芯片供应链",
    subtitle: "以英伟达GPU为核心、国产替代加速推进的AI算力芯片产业链图谱",
    nodes: AIGPU_NODES,
    edges: AIGPU_EDGES,
  },
  idc: {
    title: "智算中心/IDC供应链",
    subtitle: "AI算力基础设施载体——智算中心建设与运营产业链图谱",
    nodes: IDC_NODES,
    edges: IDC_EDGES,
  },
  overview: {
    title: "AI算力产业链全景概览",
    subtitle: "从芯片到数据中心——AI算力全产业链关系图谱",
    nodes: [],
    edges: [],
  },
};

const LAYER_LABEL: Record<ComponentData["layer"], string> = {
  upstream: "上游供应商",
  core: "核心制造商",
  downstream: "组装/分销",
  application: "终端客户",
};

// ─── 3D Process Flow View ─────────────────────────────────────────────────────

const LAYER_META: Record<
  string,
  { label: string; color: string; border: string; glow: string; bg: string }
> = {
  upstream: {
    label: "上游原材料",
    color: "#3b82f6",
    border: "#3b82f644",
    glow: "#3b82f633",
    bg: "#0f1a2e",
  },
  core: {
    label: "核心制造",
    color: "#f5a623",
    border: "#f5a62344",
    glow: "#f5a62333",
    bg: "#1e1200",
  },
  downstream: {
    label: "中游加工",
    color: "#10b981",
    border: "#10b98144",
    glow: "#10b98133",
    bg: "#001e12",
  },
  application: {
    label: "下游应用",
    color: "#8b5cf6",
    border: "#8b5cf644",
    glow: "#8b5cf633",
    bg: "#0e0a1e",
  },
};

const LAYER_ORDER: ComponentData["layer"][] = [
  "upstream",
  "upstream",
  "core",
  "downstream",
  "application",
];

const PCB_LAYER_LABELS = [
  "L0 原材料企业",
  "L1 覆铜板/钻针企业",
  "L2 PCB制造企业",
  "L3 组装/测试企业",
  "L4 终端客户",
];
const MLCC_LAYER_LABELS = [
  "L0 材料企业",
  "L1 关键部件企业",
  "L2 核心器件企业",
  "L3 组装/分销企业",
  "L4 终端客户",
];
const MEMORY_LAYER_LABELS = [
  "L0 原材料企业",
  "L1 关键材料企业",
  "L2 核心制造企业",
  "L3 封测/模组/设备",
  "L4 终端客户",
];
const OPTICS_LAYER_LABELS = [
  "L0 光芯片/硅光材料",
  "L1 光器件/组件",
  "L2 高速光模块",
  "L3 终端客户",
];
const FIBER_LAYER_LABELS = [
  "L0 原材料",
  "L1 光纤预制棒",
  "L2 光纤/光缆制造",
  "L3 终端客户",
];
const LIQUIDCOOL_LAYER_LABELS = [
  "L0 液冷材料/管路",
  "L1 冷板/CDU组件",
  "L2 液冷系统集成",
  "L3 终端交付",
];
const AIPOWER_LAYER_LABELS = [
  "L0 核心原材料",
  "L1 关键电源模块",
  "L2 供配电系统集成",
  "L3 终端客户",
];
const COPPER_LAYER_LABELS = [
  "L0 原材料",
  "L1 线缆/连接器制造",
  "L2 高速互联模组",
  "L3 终端客户",
];
const AIGPU_LAYER_LABELS = [
  "L0 EDA/制程/封装",
  "L1 核心算力芯片",
  "L2 AI算力系统",
  "L3 算力应用",
];
const IDC_LAYER_LABELS = [
  "L0 基础设施建设",
  "L1 机房配套设备",
  "L2 智算中心运营",
  "L3 算力服务客户",
];

function ProcessFlowView({
  nodes,
  selectedId,
  onSelect,
  layerLabels,
  perfData,
}: {
  nodes: ComponentNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  layerLabels: string[];
  perfData: Record<string, { ytd: number | null; m5: number | null }>;
}) {
  const [tick, setTick] = React.useState(0);
  const [zoom, setZoom] = React.useState(1);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 50);
    return () => clearInterval(id);
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
    { accent: "#3b82f6", bg: "#050d1a", border: "#1d3a6e" },
    { accent: "#06b6d4", bg: "#050f14", border: "#0e4050" },
    { accent: "#f5a623", bg: "#14100002", border: "#6e4200" },
    { accent: "#10b981", bg: "#02140a", border: "#0a4a28" },
    { accent: "#8b5cf6", bg: "#0a051a", border: "#3a1a7e" },
  ];

  const particleOffset = (tick * 2) % 100;

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
        borderBottom: "1px solid #1e2332",
        color: "#9ca3af",
        fontSize: 14,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background = "#1e2332")
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
      className="flex-1 flex flex-col bg-[#060810] overflow-hidden"
      style={{ fontFamily: "monospace" }}
    >
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#1e2332] bg-[#0d1117] flex-shrink-0">
        <span className="text-xs text-gray-500">
          3D加工流程图 · 点击节点查看 A 股龙头企业 · Ctrl+滚轮缩放
        </span>
        <div className="ml-auto flex items-center gap-3">
          {layers.map((layer, i) => (
            <div key={i} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: LAYER_COLORS[i]?.accent ?? "#888" }}
              />
              <span className="text-xs text-gray-500">{layer.label}</span>
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
                                    color: isSel ? lc.accent : "#e2e8f0",
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {nd.data.label}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "#94a3b8",
                                  lineHeight: 1.4,
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
                                  {nd.data.stocks.map((stock) => {
                                    const perf = perfData[stock.code];
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
                                        : "#6b7280";
                                    const m5Color =
                                      perf?.m5 != null
                                        ? perf.m5 >= 0
                                          ? "#ef4444"
                                          : "#22c55e"
                                        : "#6b7280";
                                    return (
                                      <div
                                        key={stock.code}
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
                                            color: "#cbd5e1",
                                            fontWeight: 600,
                                            minWidth: 52,
                                          }}
                                        >
                                          {stock.name}
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
            background: "#151821",
            border: "1px solid #1e2332",
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
  stocks: StockEntry[];
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
          color: "#94a3b8",
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
    style: { stroke: "#334155", strokeWidth: 1.5 },
    labelStyle: { fontSize: 9, fill: "#64748b", fontFamily: "monospace" },
    labelBgStyle: { fill: "#0f1117", fillOpacity: 0.85 },
    labelBgPadding: [3, 4] as [number, number],
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#334155",
      width: 12,
      height: 12,
    },
  }));

  return (
    <div className="flex-1 flex flex-col bg-[#060810]">
      <div className="px-5 py-2.5 border-b border-[#1e2332] bg-[#0d1117] flex items-center gap-3 flex-shrink-0">
        <span style={{ fontSize: 14, fontWeight: 700, color: "#f5a623" }}>
          AI算力产业链全景图
        </span>
        <span className="text-xs text-gray-500">
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
              <span className="text-xs text-gray-500">{label}</span>
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
            color="#1a1f2e"
            gap={28}
            size={1}
          />
          <Controls
            style={{
              background: "#151821",
              border: "1px solid #1e2332",
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
  overrideStocks: Record<string, StockEntry[]>;
  liveQuotes: Record<string, LiveQuote>;
  onOverride: (id: string, stocks: StockEntry[]) => void;
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
  const [addForm, setAddForm] = useState({
    code: "",
    name: "",
    price: "",
    change: "",
  });
  const [showAdd, setShowAdd] = useState(false);

  const baseStocks = item?.stocks ?? [];
  const currentStocks = ((item && overrideStocks[item.id]) ?? baseStocks).map(
    (s) => {
      const live = liveQuotes[s.code];
      if (!live) return s;
      return { ...s, price: live.price, change: live.change };
    },
  );

  const handleDelete = (code: string) => {
    if (!item) return;
    onOverride(
      item.id,
      currentStocks.filter((s) => s.code !== code),
    );
  };

  const handleAdd = () => {
    if (!item || !addForm.code || !addForm.name) return;
    onOverride(item.id, [
      ...currentStocks,
      {
        code: addForm.code.trim(),
        name: addForm.name.trim(),
        price: parseFloat(addForm.price) || 0,
        change: parseFloat(addForm.change) || 0,
      },
    ]);
    setAddForm({ code: "", name: "", price: "", change: "" });
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
        className="px-4 py-4 border-b border-[#1e2332] flex-shrink-0"
        style={{ background: s.bg, borderBottom: `1px solid ${s.border}33` }}
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
              <div className="text-gray-500 text-xs mt-0.5">{item.desc}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-400 p-1"
          >
            <X size={14} />
          </button>
        </div>
        <div
          className="mt-2 text-xs px-2 py-0.5 rounded inline-block"
          style={{ background: s.badge, color: s.text }}
        >
          {LAYER_LABEL[item.layer]}
        </div>
      </div>

      {relatedItems &&
        (relatedItems.upstream.length > 0 ||
          relatedItems.downstream.length > 0) && (
          <div className="border-b border-[#1e2332] flex-shrink-0">
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
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#0f1a2e] hover:bg-[#1a2a3e] border border-[#1d3a6e] text-left transition-colors w-full"
                    >
                      {r.icon && <span className="text-sm">{r.icon}</span>}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#93c5fd] font-medium truncate">
                          {r.label}
                        </div>
                        <div className="text-[10px] text-gray-600 truncate">
                          {r.relation}
                        </div>
                      </div>
                      <ChevronRight
                        size={10}
                        className="text-gray-600 flex-shrink-0"
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
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#021a0e] hover:bg-[#0a2a1a] border border-[#0a4a28] text-left transition-colors w-full"
                    >
                      {r.icon && <span className="text-sm">{r.icon}</span>}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#6ee7b7] font-medium truncate">
                          {r.label}
                        </div>
                        <div className="text-[10px] text-gray-600 truncate">
                          {r.relation}
                        </div>
                      </div>
                      <ChevronRight
                        size={10}
                        className="text-gray-600 flex-shrink-0"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      <div className="px-4 py-2 border-b border-[#1e2332] flex items-center justify-between flex-shrink-0">
        <span className="text-xs text-gray-400 font-medium">
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
        <div className="px-4 py-3 border-b border-[#1e2332] bg-[#1a1f2e] flex-shrink-0">
          <div className="grid grid-cols-2 gap-2 mb-2">
            {(["code", "name", "price", "change"] as const).map((f) => (
              <input
                key={f}
                className="bg-[#0f1219] border border-[#2a3045] rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#f5a623]/50"
                placeholder={
                  f === "code"
                    ? "股票代码"
                    : f === "name"
                      ? "公司名称"
                      : f === "price"
                        ? "现价(选填)"
                        : "涨跌幅(选填)"
                }
                value={addForm[f]}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, [f]: e.target.value }))
                }
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!addForm.code || !addForm.name}
              className="flex-1 bg-[#f5a623] hover:bg-[#f5a623]/90 disabled:opacity-40 text-black text-xs font-semibold py-1.5 rounded-lg"
            >
              确认添加
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 text-xs text-gray-500 hover:text-gray-300 border border-[#2a3045] rounded-lg"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {currentStocks.length === 0 ? (
          <div className="text-center text-gray-600 text-xs py-8">
            暂无企业，点击「添加」手动录入
          </div>
        ) : (
          currentStocks.map((stock) => (
            <div
              key={stock.code + stock.name}
              className="flex items-center justify-between px-4 py-3 hover:bg-[#1a1f2e] border-b border-[#1a1f2e] transition-colors group"
            >
              <button
                className="flex-1 flex items-center gap-3 text-left"
                onClick={() => onNavigate(stock.code)}
              >
                <div className="w-8 h-8 rounded-lg bg-[#1e2332] flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                  {stock.name[0]}
                </div>
                <div className="min-w-0">
                  <div className="text-white text-sm font-medium truncate">
                    {stock.name}
                  </div>
                  <div className="text-gray-600 text-xs">{stock.code}</div>
                </div>
                <div className="text-right flex-shrink-0 ml-auto mr-2">
                  {stock.price > 0 && (
                    <>
                      <div className="text-white text-xs font-mono">
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
                  className="p-1 text-gray-600 hover:text-[#f5a623]"
                  title="查看详情"
                >
                  <ExternalLink size={12} />
                </button>
                <button
                  onClick={() => handleDelete(stock.code)}
                  className="p-1 text-gray-600 hover:text-red-400"
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

export default function IndustryCanvasPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const industryId = params.name as string;
  const industry = INDUSTRY_REGISTRY[industryId];

  const [nodes, setNodes, onNodesChange] = useNodesState<ComponentNode>(
    industry?.nodes ?? [],
  );
  const [edges, , onEdgesChange] = useEdgesState(industry?.edges ?? []);

  const [activeTab, setActiveTab] = useState<ViewTab>("chain");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelVisible, setPanelVisible] = useState(true);
  const [stockOverrides, setStockOverrides] = useState<
    Record<string, StockEntry[]>
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
    if (!industry?.nodes || Object.keys(liveQuotes).length === 0) return;

    const updatedNodes = industry.nodes.map((node) => {
      const updatedStocks = node.data.stocks.map((stock) => {
        const liveQuote = liveQuotes[stock.code];
        if (liveQuote) {
          return {
            ...stock,
            price: liveQuote.price,
            change: liveQuote.change,
          };
        }
        return stock;
      });

      return {
        ...node,
        data: {
          ...node.data,
          stocks: updatedStocks,
        },
      };
    });

    setNodes(updatedNodes);
  }, [liveQuotes, industry?.nodes, setNodes]);

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
      stocks.forEach((stock) => {
        if (
          stock.code.toLowerCase().includes(query) ||
          stock.name.toLowerCase().includes(query)
        ) {
          results.push({
            code: stock.code,
            name: stock.name,
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
      return stocks.some((stock) => stock.code === stockCode);
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

  const handleOverride = useCallback((id: string, stocks: StockEntry[]) => {
    setStockOverrides((prev) => ({ ...prev, [id]: stocks }));
  }, []);

  const handleNodeClick: NodeMouseHandler<ComponentNode> = useCallback(
    (_evt, node) => {
      setSelectedId(node.id);
    },
    [],
  );

  const isPcb = industryId === "pcb";
  const layerLabelsMap: Record<string, string[]> = {
    pcb: PCB_LAYER_LABELS,
    mlcc: MLCC_LAYER_LABELS,
    memory: MEMORY_LAYER_LABELS,
    optics: OPTICS_LAYER_LABELS,
    fiber: FIBER_LAYER_LABELS,
    liquidcool: LIQUIDCOOL_LAYER_LABELS,
    aipower: AIPOWER_LAYER_LABELS,
    coppercable: COPPER_LAYER_LABELS,
    aigpu: AIGPU_LAYER_LABELS,
    idc: IDC_LAYER_LABELS,
  };
  const flowLayerLabels = layerLabelsMap[industryId] ?? PCB_LAYER_LABELS;

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

  const quickItems = (industry?.nodes.slice(0, 4) ?? []).map((item) => {
    const node = item as ComponentNode;
    return {
      id: node.id,
      icon: node.data.icon,
      label: node.data.label,
      count: node.data.stocks.length,
    };
  });

  if (!industry) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        产业数据不存在
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
            {industry.title}
          </span>
          <span
            className="text-xs ml-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            {industry.subtitle}
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
                  activeTab === "chain" ? "text-white" : "",
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
                  activeTab === "anatomy" ? "text-white" : "",
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
          <div className="flex-1 bg-[#080b12] relative">
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
                color="#1a1f2e"
                gap={24}
                size={1}
              />
              <Controls
                style={{
                  background: "#151821",
                  border: "1px solid #1e2332",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              />
            </ReactFlow>
            {!selectedId ? (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1f2e]/90 border border-[#2a3045] text-gray-400 text-xs px-4 py-2 rounded-full pointer-events-none">
                点击任意企业节点 → 高亮上下游关系 · 查看相关 A 股
              </div>
            ) : (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1f2e]/90 border border-[#f5a623]/40 text-[#f5a623] text-xs px-4 py-2 rounded-full pointer-events-none flex items-center gap-2">
                <span>↑↓ 已高亮</span>
                <span className="font-semibold">
                  {selectedFlowNode?.data.label}
                </span>
                <span>的 {connectedNodeIds.size - 1} 个上下游企业</span>
                <span className="text-gray-500 ml-1">· 点击空白处取消</span>
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
                background: "#151821",
                border: "1px solid #1e2332",
                borderRight: panelVisible ? "none" : "1px solid #1e2332",
                borderRadius: panelVisible ? "6px 0 0 6px" : "0 6px 6px 0",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#6b7280",
                fontSize: 10,
                transition: "right 0.2s ease",
              }}
              title={panelVisible ? "隐藏面板" : "显示面板"}
            >
              {panelVisible ? "›" : "‹"}
            </button>
            {panelVisible && (
              <div className="w-80 border-l border-[#1e2332] bg-[#0f1219] flex flex-col overflow-hidden flex-shrink-0">
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
                background: "#151821",
                border: "1px solid #1e2332",
                borderRight: panelVisible ? "none" : "1px solid #1e2332",
                borderRadius: panelVisible ? "6px 0 0 6px" : "0 6px 6px 0",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#6b7280",
                fontSize: 10,
                transition: "right 0.2s ease",
              }}
              title={panelVisible ? "隐藏面板" : "显示面板"}
            >
              {panelVisible ? "›" : "‹"}
            </button>
            {panelVisible && (
              <div className="w-80 border-l border-[#1e2332] bg-[#0f1219] flex flex-col overflow-hidden flex-shrink-0">
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
