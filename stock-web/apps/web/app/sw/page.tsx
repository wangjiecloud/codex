"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { saveSwPageState, loadSwPageState } from "@/lib/navStore";
import {
  ArrowUpDown,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Search,
  X,
  BarChart2,
  Trash2,
  TrendingUp,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";
const MIN_TOP_PX = 80;
const MIN_BOTTOM_PX = 60;

interface SwBoard {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  volume: number;
  turnover: number;
  peStatic: number;
  peTtm: number;
  pb: number;
  dividendYield: number;
  compCount: number;
  updatedAt: string | null;
}

interface SwConstituent {
  code: string;
  name: string;
  price: number;
  changePct: number;
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
  updatedAt: string | null;
}

interface StockSearchResult {
  code: string;
  name: string;
  price?: number;
  change?: number;
}

type SortKey =
  | "changePct"
  | "turnover"
  | "volume"
  | "peTtm"
  | "pb"
  | "compCount"
  | "name"
  | "price";

type ConsSortKey =
  | "changePct"
  | "price"
  | "turnover"
  | "marketCap"
  | "pe"
  | "pb"
  | "name";

function pct(v: number) {
  if (v > 0) return "text-[#e84444]";
  if (v < 0) return "text-[#09d464]";
  return "text-[var(--text-secondary)]";
}
function sgn(v: number) {
  return v > 0 ? "+" : "";
}
function fmt(v: number | null | undefined, dec = 2) {
  if (v === undefined || v === null || isNaN(v)) return "--";
  if (v === 0) return "--";
  return v.toFixed(dec);
}
function fmtNum(v: number) {
  if (!v) return "--";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(0);
}

function SortIcon({
  col,
  active,
  order,
}: {
  col: string;
  active: string;
  order: "asc" | "desc";
}) {
  if (col !== active)
    return (
      <ArrowUpDown size={11} className="text-[var(--text-tertiary)] ml-0.5" />
    );
  return order === "asc" ? (
    <ChevronUp size={11} className="text-[#e8a235] ml-0.5" />
  ) : (
    <ChevronDown size={11} className="text-[#e8a235] ml-0.5" />
  );
}

interface RotationBoard {
  code: string;
  name: string;
  tag: string | null;
  currentChangePct: number;
  data: (number | null)[];
}

interface RotationData {
  dates: string[];
  boards: RotationBoard[];
}

/* 产业板块 code 格式：{industry_id}_{layer}，industry_id 本身可含下划线 */
/* 合法 layer 取值：upstream / core / downstream / application */
const VALID_LAYERS = new Set(["upstream", "core", "downstream", "application"]);

/** 解析产业板块 code，返回 { industryId, layer } 或 null（非产业板块）
 *  industry_id 本身可含下划线（如 as_satellite），因此从右侧分割 "_" */
function parseIndustryBoardCode(
  code: string,
): { industryId: string; layer: string } | null {
  const lastUnderscore = code.lastIndexOf("_");
  if (lastUnderscore === -1) return null;
  const layer = code.slice(lastUnderscore + 1);
  if (!VALID_LAYERS.has(layer)) return null;
  const industryId = code.slice(0, lastUnderscore);
  if (!industryId) return null;
  return { industryId, layer };
}

/** L1 大类分组配置：大类名 -> 产业 ID 列表（按顺序） */
const L1_GROUPS: { label: string; icon: string; industries: string[] }[] = [
  {
    label: "AI 基础设施",
    icon: "🤖",
    industries: [
      "aigpu",
      "memory",
      "aiserver",
      "idc",
      "aipower",
      "liquidcool",
      "coppercable",
      "optics",
      "fiber",
      "pcb",
      "mlcc",
      "glasssub",
      "semieq",
      "dc_overview",
      "dc_chip",
      "dc_cpu",
      "dc_idc",
      "dc_liquid",
      "dc_memory",
      "dc_optics",
      "dc_power",
      "dc_server",
      "dc_switch",
      "nvidia_chain",
      "changxin_chain",
    ],
  },
  {
    label: "大模型与AI应用",
    icon: "🧠",
    industries: [
      "llm_overview",
      "llm_model",
      "llm_infra",
      "llm_framework",
      "llm_data",
      "llm_app_consumer",
      "llm_app_enterprise",
      "llm_vertical",
      "llm_agent",
    ],
  },
  {
    label: "人形机器人",
    icon: "🦾",
    industries: [
      "hm_overview",
      "hm_brain",
      "hm_body",
      "hm_motor",
      "hm_reducer",
      "hm_actuator",
      "hm_sensor",
      "hm_screw",
      "ir_overview",
      "ir_controller",
      "ir_integrator",
      "ir_reducer",
      "ir_servo",
    ],
  },
  {
    label: "低空经济",
    icon: "✈️",
    industries: [
      "la_overview",
      "la_uav",
      "la_evtol",
      "la_airtraffic",
      "la_engine",
      "la_materials",
    ],
  },
  {
    label: "航天卫星",
    icon: "🛰️",
    industries: [
      "as_overview",
      "as_satellite",
      "as_satnav",
      "as_satcom",
      "as_rocket",
      "as_payload",
      "as_remote",
      "as_ground",
    ],
  },
  {
    label: "通信网络",
    icon: "📡",
    industries: [
      "tc_overview",
      "tc_basestation",
      "tc_antenna",
      "tc_chip",
      "tc_network",
    ],
  },
  {
    label: "航空与国防",
    icon: "🚀",
    industries: [
      "avt_overview",
      "avt_airframe",
      "avt_avionics",
      "avt_engine",
      "avt_material",
    ],
  },
  {
    label: "储能",
    icon: "🔋",
    industries: [
      "es_overview",
      "es_battery",
      "es_bms",
      "es_ems",
      "es_pcs",
      "es_system",
    ],
  },
  {
    label: "生物医药",
    icon: "💊",
    industries: ["bp_overview", "bp_drug", "bp_biotech", "bp_device", "bp_cxo"],
  },
  {
    label: "全景概览",
    icon: "🌐",
    industries: ["overview"],
  },
];

/** 产业 ID -> L1 大类标签（动态生成） */
const INDUSTRY_TO_L1: Record<string, string> = {};
for (const g of L1_GROUPS) {
  for (const id of g.industries) {
    INDUSTRY_TO_L1[id] = g.label;
  }
}

/** layer 显示名称 */
const LAYER_LABELS: Record<string, string> = {
  upstream: "上游",
  core: "核心",
  downstream: "下游",
  application: "应用",
};

/** 产业 ID -> 显示名称（短名） */
const INDUSTRY_DISPLAY: Record<string, string> = {
  overview: "全景概览",
  aigpu: "AI算力芯片",
  pcb: "PCB印制电路板",
  mlcc: "MLCC电容",
  memory: "存储芯片",
  optics: "光模块与CPO",
  fiber: "光纤光缆",
  liquidcool: "液冷散热",
  aipower: "AI供配电",
  coppercable: "高速铜连接",
  idc: "智算中心IDC",
  glasssub: "玻璃基板",
  aiserver: "AI服务器",
  semieq: "半导体设备",
  // 算力基础设施子链
  dc_overview: "数据中心全景",
  dc_chip: "数据中心芯片",
  dc_cpu: "CPU处理器",
  dc_idc: "IDC运营",
  dc_liquid: "液冷散热",
  dc_memory: "数据中心存储",
  dc_optics: "数据中心光模块",
  dc_power: "数据中心供电",
  dc_server: "服务器整机",
  dc_switch: "交换机",
  nvidia_chain: "英伟达产业链",
  changxin_chain: "长鑫产业链",
  // 大模型
  llm_overview: "大模型全景",
  llm_model: "基础大模型",
  llm_infra: "模型基础设施",
  llm_framework: "训练框架",
  llm_data: "数据与标注",
  llm_app_consumer: "消费端应用",
  llm_app_enterprise: "企业端应用",
  llm_vertical: "垂直大模型",
  llm_agent: "AI Agent",
  // 人形机器人
  hm_overview: "人形机器人全景",
  hm_brain: "控制大脑",
  hm_body: "机体结构",
  hm_motor: "电机",
  hm_reducer: "减速器",
  hm_actuator: "执行器",
  hm_sensor: "传感器",
  hm_screw: "丝杆",
  ir_overview: "工业机器人全景",
  ir_controller: "控制系统",
  ir_integrator: "系统集成",
  ir_reducer: "精密减速器",
  ir_servo: "伺服系统",
  // 低空经济
  la_overview: "低空经济全景",
  la_uav: "无人机",
  la_evtol: "eVTOL飞行器",
  la_airtraffic: "空中交通管理",
  la_engine: "低空动力",
  la_materials: "低空材料",
  // 航天卫星
  as_overview: "航天卫星全景",
  as_satellite: "卫星平台",
  as_satnav: "卫星导航",
  as_satcom: "卫星通信",
  as_rocket: "运载火箭",
  as_payload: "卫星载荷",
  as_remote: "遥感对地观测",
  as_ground: "地面站系统",
  // 通信
  tc_overview: "通信全景",
  tc_basestation: "基站设备",
  tc_antenna: "天线/射频",
  tc_chip: "通信芯片",
  tc_network: "核心网",
  // 航空国防
  avt_overview: "航空全景",
  avt_airframe: "机体结构",
  avt_avionics: "航电系统",
  avt_engine: "发动机",
  avt_material: "航空材料",
  // 储能
  es_overview: "储能全景",
  es_battery: "电芯",
  es_bms: "BMS管理系统",
  es_ems: "EMS能量管理",
  es_pcs: "PCS变流器",
  es_system: "储能系统集成",
  // 生物医药
  bp_overview: "生物医药全景",
  bp_drug: "创新药",
  bp_biotech: "生物技术",
  bp_device: "医疗器械",
  bp_cxo: "CXO",
};

function heatColor(v: number | null): string {
  if (v === null || v === undefined) return "var(--bg-tertiary)";
  const clamped = Math.max(-5, Math.min(5, v));
  if (clamped >= 0) {
    const intensity = clamped / 5;
    const r = Math.round(100 + intensity * 132);
    const g = Math.round(40 - intensity * 15);
    const b = Math.round(40 - intensity * 15);
    return `rgb(${r},${g},${b})`;
  } else {
    const intensity = Math.abs(clamped) / 5;
    const r = Math.round(20 - intensity * 10);
    const g = Math.round(140 + intensity * 72);
    const b = Math.round(60 + intensity * 60);
    return `rgb(${r},${g},${b})`;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 资金流向弹窗
// ──────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// 实时流向弹窗（直接调东方财富 push2delay 接口，无需后端）
// ─────────────────────────────────────────────────────────────────

interface LiveFlowSector {
  /** 板块代码 */
  code: string;
  /** 板块名称 */
  name: string;
  /** 涨跌幅 % */
  changePct: number;
  /** 主力净流入（元） */
  mainNetflow: number;
  /** 主力净占比 % */
  mainNetRatio: number;
  /** 超大单净流入（元） */
  superNetflow: number;
  /** 超大单净占比 % */
  superNetRatio: number;
  /** 大单净流入（元） */
  bigNetflow: number;
  /** 大单净占比 % */
  bigNetRatio: number;
  /** 中单净流入（元） */
  midNetflow: number;
  /** 中单净占比 % */
  midNetRatio: number;
  /** 小单净流入（元） */
  smallNetflow: number;
  /** 小单净占比 % */
  smallNetRatio: number;
  /** 主力净流入最大股名称 */
  topStockName: string;
  /** 主力净流入最大股代码 */
  topStockCode: string;
  /** 数据时间戳（秒） */
  ts: number;
}

const EM_FIELDS =
  "f12,f14,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f204,f205,f124";
const EM_BASE = "https://push2delay.eastmoney.com/api/qt/clist/get";

function buildEmUrl(
  boardType: "concept" | "industry",
  order: "desc" | "asc",
  pz = 200,
) {
  const t = boardType === "concept" ? 3 : 2;
  const po = order === "desc" ? 1 : 0;
  return `${EM_BASE}?pn=1&pz=${pz}&po=${po}&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f62&fs=m:90+t:${t}&fields=${EM_FIELDS}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEmItem(raw: any): LiveFlowSector {
  return {
    code: raw.f12 ?? "",
    name: raw.f14 ?? "",
    changePct: raw.f3 ?? 0,
    mainNetflow: raw.f62 ?? 0,
    mainNetRatio: raw.f184 ?? 0,
    superNetflow: raw.f66 ?? 0,
    superNetRatio: raw.f69 ?? 0,
    bigNetflow: raw.f72 ?? 0,
    bigNetRatio: raw.f75 ?? 0,
    midNetflow: raw.f78 ?? 0,
    midNetRatio: raw.f81 ?? 0,
    smallNetflow: raw.f84 ?? 0,
    smallNetRatio: raw.f87 ?? 0,
    topStockName: raw.f204 ?? "",
    topStockCode: raw.f205 ?? "",
    ts: raw.f124 ?? 0,
  };
}

function fmtYi(val: number): string {
  const yi = val / 1e8;
  return (yi >= 0 ? "+" : "") + yi.toFixed(2) + "亿";
}

type LiveSortField =
  | "mainNetflow"
  | "mainNetRatio"
  | "superNetflow"
  | "superNetRatio"
  | "bigNetflow"
  | "bigNetRatio"
  | "midNetflow"
  | "smallNetflow"
  | "changePct";

function LiveFlowModal({ onClose }: { onClose: () => void }) {
  const [boardType, setBoardType] = useState<"concept" | "industry">("concept");
  const [sortOrder, setLiveSortOrder] = useState<"desc" | "asc">("desc");
  const [items, setItems] = useState<LiveFlowSector[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 本地列排序（独立于接口排序参数）
  const [localSortField, setLocalSortField] = useState<LiveSortField | null>(
    null,
  );
  const [localSortDir, setLocalSortDir] = useState<"desc" | "asc">("desc");

  const fetchLive = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = buildEmUrl(boardType, sortOrder);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const raw = json?.data?.diff ?? [];
      setItems(raw.map(parseEmItem));
      if (raw.length > 0) {
        const ts: number = raw[0].f124 ?? 0;
        if (ts) {
          setLastUpdated(
            new Date(ts * 1000).toLocaleTimeString("zh-CN", { hour12: false }),
          );
        } else {
          setLastUpdated(
            new Date().toLocaleTimeString("zh-CN", { hour12: false }),
          );
        }
      }
    } catch {
      setError("数据获取失败（东方财富接口，请稍后重试）");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [boardType, sortOrder]);

  // 首次加载 & 依赖变更时拉数据
  useEffect(() => {
    fetchLive();
  }, [fetchLive]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(fetchLive, 30000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, fetchLive]);

  const filtered = searchText.trim()
    ? items.filter(
        (i) =>
          i.name.includes(searchText.trim()) ||
          i.topStockName.includes(searchText.trim()) ||
          i.topStockCode.includes(searchText.trim()),
      )
    : items;

  // 本地列排序
  const sorted = localSortField
    ? [...filtered].sort((a, b) => {
        const av = a[localSortField] as number;
        const bv = b[localSortField] as number;
        return localSortDir === "desc" ? bv - av : av - bv;
      })
    : filtered;

  const toggleLocalSort = (field: LiveSortField) => {
    if (localSortField === field) {
      setLocalSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setLocalSortField(field);
      setLocalSortDir("desc");
    }
  };

  // 用于横向条形图的最大绝对值
  const maxAbs = Math.max(...sorted.map((i) => Math.abs(i.mainNetflow)), 1);

  // 统计摘要
  const topIn = sorted.reduce<LiveFlowSector | null>(
    (a, b) => (a === null || b.mainNetflow > a.mainNetflow ? b : a),
    null,
  );
  const topOut = sorted.reduce<LiveFlowSector | null>(
    (a, b) => (a === null || b.mainNetflow < a.mainNetflow ? b : a),
    null,
  );
  const totalIn = sorted
    .filter((i) => i.mainNetflow > 0)
    .reduce((s, i) => s + i.mainNetflow, 0);
  const totalOut = sorted
    .filter((i) => i.mainNetflow < 0)
    .reduce((s, i) => s + i.mainNetflow, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden"
        style={{ width: "min(1200px, 96vw)", maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 标题栏 ── */}
        <div className="flex flex-col gap-2 px-5 pt-3 pb-2.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex-shrink-0">
          {/* 第一行 */}
          <div className="flex items-center gap-3 flex-wrap">
            <Activity size={15} className="text-[#e84444] flex-shrink-0" />
            <span className="text-[14px] font-bold text-[var(--text-primary)]">
              实时资金流向
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              来源：东方财富
            </span>

            {/* 板块类型切换 */}
            <div className="flex items-center gap-1">
              {(["concept", "industry"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setBoardType(t)}
                  className={cn(
                    "px-2.5 py-0.5 rounded text-[11px] transition-colors",
                    boardType === t
                      ? "bg-[#e84444] text-white font-medium"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                  )}
                >
                  {t === "concept" ? "概念板块" : "行业板块"}
                </button>
              ))}
            </div>

            {/* 排序方向 */}
            <div className="flex items-center gap-1">
              {(["desc", "asc"] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setLiveSortOrder(o)}
                  className={cn(
                    "px-2.5 py-0.5 rounded text-[11px] transition-colors",
                    sortOrder === o
                      ? "bg-[var(--accent)] text-black font-medium"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                  )}
                >
                  {o === "desc" ? "净流入↓" : "净流出↓"}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* 搜索 */}
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索板块/股票..."
                className="px-2 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors w-28"
              />
              {/* 自动刷新 */}
              <label className="flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-3 h-3 accent-[var(--accent)]"
                />
                <span className="text-[11px] text-[var(--text-secondary)]">
                  30s自动刷新
                </span>
              </label>
              {/* 手动刷新 */}
              <button
                onClick={fetchLive}
                disabled={loading}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <RefreshCw
                  size={11}
                  className={cn(loading && "animate-spin")}
                />
                刷新
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 第二行：摘要统计 */}
          {!loading && sorted.length > 0 && (
            <div className="flex items-center gap-4 text-[11px]">
              <span className="text-[var(--text-tertiary)]">
                共 <b className="text-[var(--text-primary)]">{sorted.length}</b>{" "}
                个板块
              </span>
              {topIn && (
                <span>
                  <span className="text-[var(--text-tertiary)]">
                    净流入最多：
                  </span>
                  <span className="text-[#e84444] font-medium">
                    {topIn.name}
                  </span>
                  <span className="text-[#e84444] ml-1">
                    {fmtYi(topIn.mainNetflow)}
                  </span>
                </span>
              )}
              {topOut && (
                <span>
                  <span className="text-[var(--text-tertiary)]">
                    净流出最多：
                  </span>
                  <span className="text-[#09d464] font-medium">
                    {topOut.name}
                  </span>
                  <span className="text-[#09d464] ml-1">
                    {fmtYi(topOut.mainNetflow)}
                  </span>
                </span>
              )}
              <span>
                <span className="text-[var(--text-tertiary)]">流入合计：</span>
                <span className="text-[#e84444]">{fmtYi(totalIn)}</span>
              </span>
              <span>
                <span className="text-[var(--text-tertiary)]">流出合计：</span>
                <span className="text-[#09d464]">{fmtYi(totalOut)}</span>
              </span>
              {lastUpdated && (
                <span className="ml-auto text-[var(--text-tertiary)]">
                  数据时间 {lastUpdated}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── 内容区 ── */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-[var(--text-tertiary)] text-sm gap-2">
              <RefreshCw size={14} className="animate-spin" />
              拉取东方财富实时数据...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <span className="text-[var(--text-tertiary)] text-sm">
                {error}
              </span>
              <button
                onClick={fetchLive}
                className="px-3 py-1.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] text-sm"
              >
                重试
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-[var(--text-tertiary)] text-sm">
              暂无数据
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
                <tr>
                  <th className="px-3 py-2 text-center text-[var(--text-tertiary)] font-medium w-8">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium whitespace-nowrap min-w-[90px]">
                    板块名称
                  </th>
                  <th className="px-3 py-2 text-right text-[var(--text-tertiary)] font-medium whitespace-nowrap w-40">
                    净流向可视化
                  </th>
                  {(
                    [
                      {
                        field: "mainNetflow" as LiveSortField,
                        label: "主力净流入",
                        align: "right",
                      },
                      {
                        field: "mainNetRatio" as LiveSortField,
                        label: "主力净占比",
                        align: "right",
                      },
                      {
                        field: "superNetflow" as LiveSortField,
                        label: "超大单净流入",
                        align: "right",
                      },
                      {
                        field: "superNetRatio" as LiveSortField,
                        label: "超大单占比",
                        align: "right",
                      },
                      {
                        field: "bigNetflow" as LiveSortField,
                        label: "大单净流入",
                        align: "right",
                      },
                      {
                        field: "bigNetRatio" as LiveSortField,
                        label: "大单占比",
                        align: "right",
                      },
                      {
                        field: "midNetflow" as LiveSortField,
                        label: "中单净流入",
                        align: "right",
                      },
                      {
                        field: "smallNetflow" as LiveSortField,
                        label: "小单净流入",
                        align: "right",
                      },
                      {
                        field: "changePct" as LiveSortField,
                        label: "涨跌幅",
                        align: "right",
                      },
                    ] as const
                  ).map(({ field, label }) => {
                    const active = localSortField === field;
                    return (
                      <th
                        key={field}
                        onClick={() => toggleLocalSort(field)}
                        className={cn(
                          "px-3 py-2 text-right font-medium whitespace-nowrap cursor-pointer select-none transition-colors",
                          active
                            ? "text-[var(--accent)]"
                            : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                        )}
                      >
                        <span className="inline-flex items-center justify-end gap-0.5">
                          {label}
                          {active ? (
                            localSortDir === "desc" ? (
                              <ChevronDown
                                size={10}
                                className="text-[var(--accent)]"
                              />
                            ) : (
                              <ChevronUp
                                size={10}
                                className="text-[var(--accent)]"
                              />
                            )
                          ) : (
                            <ArrowUpDown size={10} className="opacity-30" />
                          )}
                        </span>
                      </th>
                    );
                  })}
                  <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium whitespace-nowrap">
                    领涨股
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, idx) => {
                  const isPos = item.mainNetflow >= 0;
                  const barPct = Math.abs(item.mainNetflow) / maxAbs;
                  return (
                    <tr
                      key={item.code + idx}
                      className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      {/* # */}
                      <td className="px-3 py-1.5 text-center text-[var(--text-tertiary)]">
                        {idx + 1}
                      </td>

                      {/* 板块名称 */}
                      <td className="px-3 py-1.5 font-medium text-[var(--text-primary)] whitespace-nowrap">
                        {item.name}
                      </td>

                      {/* 条形图（仿图2样式，左侧板块名，右侧横向条+数值） */}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <div
                            className="relative h-3.5 rounded overflow-hidden bg-[var(--bg-tertiary)]"
                            style={{ width: 120 }}
                          >
                            {isPos ? (
                              <div
                                className="absolute right-0 top-0 h-full rounded bg-[#e84444]"
                                style={{ width: `${barPct * 100}%` }}
                              />
                            ) : (
                              <div
                                className="absolute left-0 top-0 h-full rounded bg-[#09d464]"
                                style={{ width: `${barPct * 100}%` }}
                              />
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 主力净流入 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono font-semibold whitespace-nowrap",
                          isPos ? "text-[#e84444]" : "text-[#09d464]",
                        )}
                      >
                        {fmtYi(item.mainNetflow)}
                      </td>

                      {/* 主力净占比 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono whitespace-nowrap text-[11px]",
                          item.mainNetRatio > 0
                            ? "text-[#e84444]"
                            : "text-[#09d464]",
                        )}
                      >
                        {item.mainNetRatio > 0 ? "+" : ""}
                        {item.mainNetRatio.toFixed(2)}%
                      </td>

                      {/* 超大单净流入 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono whitespace-nowrap text-[11px]",
                          item.superNetflow >= 0
                            ? "text-[#e84444]"
                            : "text-[#09d464]",
                        )}
                      >
                        {fmtYi(item.superNetflow)}
                      </td>

                      {/* 超大单净占比 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono whitespace-nowrap text-[11px]",
                          item.superNetRatio > 0
                            ? "text-[#e84444]"
                            : "text-[#09d464]",
                        )}
                      >
                        {item.superNetRatio > 0 ? "+" : ""}
                        {item.superNetRatio.toFixed(2)}%
                      </td>

                      {/* 大单净流入 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono whitespace-nowrap text-[11px]",
                          item.bigNetflow >= 0
                            ? "text-[#e84444]"
                            : "text-[#09d464]",
                        )}
                      >
                        {fmtYi(item.bigNetflow)}
                      </td>

                      {/* 大单占比 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono whitespace-nowrap text-[11px]",
                          item.bigNetRatio > 0
                            ? "text-[#e84444]"
                            : "text-[#09d464]",
                        )}
                      >
                        {item.bigNetRatio > 0 ? "+" : ""}
                        {item.bigNetRatio.toFixed(2)}%
                      </td>

                      {/* 中单净流入 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono whitespace-nowrap text-[11px]",
                          item.midNetflow >= 0
                            ? "text-[#e84444]"
                            : "text-[#09d464]",
                        )}
                      >
                        {fmtYi(item.midNetflow)}
                      </td>

                      {/* 小单净流入 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono whitespace-nowrap text-[11px]",
                          item.smallNetflow >= 0
                            ? "text-[#e84444]"
                            : "text-[#09d464]",
                        )}
                      >
                        {fmtYi(item.smallNetflow)}
                      </td>

                      {/* 涨跌幅 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono whitespace-nowrap",
                          item.changePct > 0
                            ? "text-[#e84444]"
                            : item.changePct < 0
                              ? "text-[#09d464]"
                              : "text-[var(--text-secondary)]",
                        )}
                      >
                        {item.changePct > 0 ? "+" : ""}
                        {item.changePct.toFixed(2)}%
                      </td>

                      {/* 领涨股 */}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-[var(--text-primary)] text-[11px]">
                            {item.topStockName || "--"}
                          </span>
                          {item.topStockCode && (
                            <span className="text-[9px] text-[var(--text-tertiary)]">
                              {item.topStockCode}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── 底栏 ── */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex-shrink-0 text-[10px] text-[var(--text-tertiary)]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-sm bg-[#e84444]" />
            主力净流入
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-sm bg-[#09d464]" />
            主力净流出
          </div>
          <span>
            超大单 = 单笔 ≥ 100万；大单 = 20~100万；中单 = 4~20万；小单 &lt; 4万
          </span>
          <span className="ml-auto">
            数据来源：东方财富 · 仅供参考，不构成投资建议
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────

interface FundFlowItem {
  name: string;
  index: number | null;
  changePct: number | null;
  inflow: number | null;
  outflow: number | null;
  netflow: number | null;
  compCount: number | null;
  topStock: string;
  topStockChangePct: number | null;
  topStockPrice: number | null;
}

// /dates 接口返回格式：{ today: [...], "3d": [...], "5d": [...], "10d": [...] }
type DatesMap = Partial<Record<"today" | "3d" | "5d" | "10d", string[]>>;

const PERIOD_LABELS: Record<string, string> = {
  "today": "今日",
  "3d": "3日",
  "5d": "5日",
  "10d": "10日",
};

function FundFlowModal({ onClose }: { onClose: () => void }) {
  const [boardType, setBoardType] = useState<"concept" | "industry">("concept");
  const [period, setPeriod] = useState<"today" | "3d" | "5d" | "10d">("today");
  // selectedDate: null = 今日（实时或读今日库存），非 null = 历史日期
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // datesMap: 各 period 下有数据的交易日列表
  const [datesMap, setDatesMap] = useState<DatesMap>({});
  const [sortField, setSortField] = useState<
    "netflow" | "inflow" | "outflow" | "changePct"
  >("netflow");
  const [sortOrder, setSortOrderFF] = useState<"desc" | "asc">("desc");
  const [items, setItems] = useState<FundFlowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");

  // 组件挂载时：1) 触发后台异步快照 2) 获取各 period 的已有快照日期
  useEffect(() => {
    // 后台静默拉取最新数据入库，不阻塞 UI
    fetch(`${API}/api/fund-flow/snapshot`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
    // 获取日期列表
    fetch(`${API}/api/fund-flow/dates`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: DatesMap) => setDatesMap(d))
      .catch(() => {});
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        sort: sortField,
        order: sortOrder,
        limit: "500",
        period,
      });
      if (selectedDate) {
        params.set("trade_date", selectedDate);
      }
      const res = await fetch(`${API}/api/fund-flow/${boardType}?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError("数据获取失败，请稍后重试");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [boardType, period, selectedDate, sortField, sortOrder]);

  const fmtFlow = (v: number | null) => {
    if (v === null || v === undefined) return "--";
    return v.toFixed(2) + "亿";
  };

  const maxAbsNetflow = Math.max(
    ...items.map((i) => Math.abs(i.netflow ?? 0)),
    1,
  );

  const filteredItems = searchText.trim()
    ? items.filter((i) => {
        const search = searchText.trim().toLowerCase();
        // 支持搜索板块名称或领涨股名称
        return (
          i.name.toLowerCase().includes(search) ||
          i.topStock.toLowerCase().includes(search)
        );
      })
    : items;

  // 日期维度 tabs：T（今日）+ T-1~T-5（取 today period 的历史日期）
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayDates = datesMap["today"] ?? [];
  // 历史日期：排除今天，最多5条
  const histDates = todayDates.filter((d) => d < todayStr).slice(0, 5);

  const SORT_FIELDS = [
    { key: "netflow", label: "净流入" },
    { key: "inflow", label: "流入" },
    { key: "outflow", label: "流出" },
    { key: "changePct", label: "涨跌幅" },
  ] as const;

  const toggleSortFF = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrderFF((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortOrderFF("desc");
    }
  };

  // 切换日期
  const handleDateSelect = (d: string | null) => {
    setSelectedDate(d);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden"
        style={{ width: "min(1100px, 95vw)", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex flex-col gap-2 px-5 pt-3 pb-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex-shrink-0">
          {/* 第一行：标题 + 板块类型 + 搜索 + 关闭 */}
          <div className="flex items-center gap-3">
            <TrendingUp size={15} className="text-[var(--accent)]" />
            <span className="text-[14px] font-bold text-[var(--text-primary)]">
              板块主力资金流向
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              来源：同花顺数据中心
            </span>

            {/* 板块类型 */}
            <div className="flex items-center gap-1 ml-2">
              {(["concept", "industry"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setBoardType(t)}
                  className={cn(
                    "px-2.5 py-0.5 rounded text-[11px] transition-colors",
                    boardType === t
                      ? "bg-[var(--accent)] text-black font-medium"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                  )}
                >
                  {t === "concept" ? "概念板块" : "行业板块"}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索板块/股票..."
                className="px-2 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors w-28"
              />
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <RefreshCw
                  size={11}
                  className={cn(loading && "animate-spin")}
                />
                刷新
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 第二行：日期 tabs（T / T-1 ~ T-5）+ period sub-tabs（今日/3日/5日/10日） */}
          <div className="flex items-center gap-3">
            {/* 日期维度 */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--text-tertiary)] mr-0.5">
                日期
              </span>
              {/* T：今日 */}
              <button
                onClick={() => handleDateSelect(null)}
                disabled={period !== "today"}
                className={cn(
                  "px-2 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                  selectedDate === null
                    ? "bg-[var(--accent)] text-black font-medium"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                  period !== "today" && "opacity-30 cursor-not-allowed",
                )}
              >
                T
              </button>
              {/* T-1 ~ T-5 */}
              {histDates.length === 0 ? (
                <span className="text-[10px] text-[var(--text-tertiary)] opacity-50 ml-1">
                  T-1~T-5 每日积累
                </span>
              ) : (
                histDates.map((d, i) => {
                  const mm = d.slice(5, 7);
                  const dd = d.slice(8, 10);
                  return (
                    <button
                      key={d}
                      onClick={() => handleDateSelect(d)}
                      disabled={period !== "today"}
                      className={cn(
                        "px-2 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                        selectedDate === d
                          ? "bg-[var(--accent)] text-black font-medium"
                          : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                        period !== "today" && "opacity-30 cursor-not-allowed",
                      )}
                    >
                      T-{i + 1}
                      <span className="ml-0.5 text-[9px] opacity-60">
                        ({mm}/{dd})
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="w-px h-3 bg-[var(--border-color)]" />

            {/* Period 维度：今日/3日/5日/10日 */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--text-tertiary)] mr-0.5">
                周期范围
              </span>
              {(["today", "3d", "5d", "10d"] as const).map((p) => {
                return (
                  <button
                    key={p}
                    onClick={() => {
                      setPeriod(p);
                      // 切换到累计周期时，重置日期为今日
                      if (p !== "today" && selectedDate !== null) {
                        setSelectedDate(null);
                      }
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                      period === p
                        ? "bg-[var(--accent)] text-black font-medium"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                    )}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                );
              })}
            </div>

            {selectedDate && (
              <span className="text-[10px] text-[var(--accent)] ml-1">
                历史快照 {selectedDate}
              </span>
            )}
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-[var(--text-tertiary)] text-sm gap-2">
              <RefreshCw size={14} className="animate-spin" />
              {selectedDate
                ? "读取历史快照..."
                : "拉取数据中（同花顺接口约需5-10秒）..."}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <span className="text-[var(--text-tertiary)] text-sm">
                {error}
              </span>
              <button
                onClick={fetchData}
                className="px-3 py-1.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] text-sm"
              >
                重试
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-[var(--text-tertiary)] text-sm">
              {selectedDate
                ? `${selectedDate} ${PERIOD_LABELS[period]} 暂无历史快照数据`
                : "今日暂无数据（非交易时段或接口未返回数据）"}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium w-6 text-center">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium whitespace-nowrap">
                    板块名称
                  </th>
                  <th className="px-3 py-2 text-right text-[var(--text-tertiary)] font-medium whitespace-nowrap w-36">
                    净流入可视化
                  </th>
                  {SORT_FIELDS.map((f) => (
                    <th
                      key={f.key}
                      onClick={() => toggleSortFF(f.key)}
                      className="px-3 py-2 text-right text-[var(--text-tertiary)] font-medium whitespace-nowrap cursor-pointer hover:text-[var(--text-primary)] select-none"
                    >
                      <span className="inline-flex items-center justify-end gap-0.5">
                        {f.label}
                        {sortField === f.key ? (
                          sortOrder === "desc" ? (
                            <ChevronDown
                              size={10}
                              className="text-[var(--accent)]"
                            />
                          ) : (
                            <ChevronUp
                              size={10}
                              className="text-[var(--accent)]"
                            />
                          )
                        ) : (
                          <ArrowUpDown size={10} className="opacity-40" />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right text-[var(--text-tertiary)] font-medium whitespace-nowrap">
                    家数
                  </th>
                  <th className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium whitespace-nowrap">
                    领涨股
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const netflow = item.netflow ?? 0;
                  const barPct = Math.abs(netflow) / maxAbsNetflow;
                  const isPositive = netflow >= 0;
                  return (
                    <tr
                      key={item.name + idx}
                      className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-3 py-1.5 text-center text-[var(--text-tertiary)]">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-[var(--text-primary)] whitespace-nowrap">
                        {item.name}
                      </td>
                      {/* 条形图 */}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-28 h-3 bg-[var(--bg-tertiary)] rounded-full overflow-hidden flex">
                            {isPositive ? (
                              <div
                                className="h-full rounded-full ml-auto bg-[#e84444]"
                                style={{ width: `${barPct * 100}%` }}
                              />
                            ) : (
                              <div
                                className="h-full rounded-full bg-[#09d464]"
                                style={{ width: `${barPct * 100}%` }}
                              />
                            )}
                          </div>
                        </div>
                      </td>
                      {/* 净额 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono font-semibold whitespace-nowrap",
                          netflow > 0
                            ? "text-[#e84444]"
                            : netflow < 0
                              ? "text-[#09d464]"
                              : "text-[var(--text-secondary)]",
                        )}
                      >
                        {netflow > 0 ? "+" : ""}
                        {fmtFlow(item.netflow)}
                      </td>
                      {/* 流入 */}
                      <td className="px-3 py-1.5 text-right font-mono text-[#e84444] whitespace-nowrap">
                        {fmtFlow(item.inflow)}
                      </td>
                      {/* 流出 */}
                      <td className="px-3 py-1.5 text-right font-mono text-[#09d464] whitespace-nowrap">
                        {fmtFlow(item.outflow)}
                      </td>
                      {/* 涨跌幅 */}
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono whitespace-nowrap",
                          (item.changePct ?? 0) > 0
                            ? "text-[#e84444]"
                            : (item.changePct ?? 0) < 0
                              ? "text-[#09d464]"
                              : "text-[var(--text-secondary)]",
                        )}
                      >
                        {item.changePct !== null
                          ? `${item.changePct > 0 ? "+" : ""}${item.changePct?.toFixed(2)}%`
                          : "--"}
                      </td>
                      {/* 家数 */}
                      <td className="px-3 py-1.5 text-right text-[var(--text-secondary)]">
                        {item.compCount ?? "--"}
                      </td>
                      {/* 领涨股 */}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[var(--text-primary)]">
                            {item.topStock || "--"}
                          </span>
                          {item.topStockChangePct !== null &&
                            item.topStockChangePct !== undefined && (
                              <span
                                className={cn(
                                  "text-[10px] font-mono",
                                  item.topStockChangePct > 0
                                    ? "text-[#e84444]"
                                    : "text-[#09d464]",
                                )}
                              >
                                {item.topStockChangePct > 0 ? "+" : ""}
                                {item.topStockChangePct.toFixed(2)}%
                              </span>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 底栏 */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex-shrink-0 text-[10px] text-[var(--text-tertiary)]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-sm bg-[#e84444]" />
            主力净流入
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-sm bg-[#09d464]" />
            主力净流出
          </div>
          <span>共 {filteredItems.length} 个板块</span>
          <span className="ml-auto">
            数据来源：同花顺数据中心 · 仅供参考，不构成投资建议
          </span>
        </div>
      </div>
    </div>
  );
}

function RotationModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<RotationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);
  const [sortBy, setSortBy] = useState<
    "name" | "recent" | "cumulative" | `date_${number}`
  >("recent");
  const [rotationSortOrder, setRotationSortOrder] = useState<"desc" | "asc">(
    "desc",
  );
  const [onlyIndustry, setOnlyIndustry] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [syncing, setSyncingRotation] = useState(false);
  // 三层折叠状态：key 为 L1 标签 / industryId / "industryId_layer"
  const [expandedL1, setExpandedL1] = useState<Set<string>>(new Set());
  const [expandedL2, setExpandedL2] = useState<Set<string>>(new Set());
  const [expandedL3, setExpandedL3] = useState<Set<string>>(new Set());

  function toggleL1(label: string) {
    setExpandedL1((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }
  function toggleL2(industryId: string) {
    setExpandedL2((prev) => {
      const next = new Set(prev);
      if (next.has(industryId)) next.delete(industryId);
      else next.add(industryId);
      return next;
    });
  }
  function toggleL3(key: string) {
    setExpandedL3((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const handleForceSync = async () => {
    setSyncingRotation(true);
    try {
      // Step 1: 同时触发申万 K 线同步 + 产业成分股缺失 K 线补全
      await Promise.all([
        fetch(`${API}/api/sw-industry/sync-klines?force=true`, {
          method: "POST",
          cache: "no-store",
        }),
        fetch(`${API}/api/board/sync-industry-stocks`, {
          method: "POST",
          cache: "no-store",
        }),
      ]);
      // 等待成分股 K 线补全（新产业较多时可能需要更长时间）
      await new Promise((r) => setTimeout(r, 30000));

      // Step 2: 强制重算产业板块聚合 K 线
      await fetch(`${API}/api/board/calc-industry-kline?force=true&days=60`, {
        method: "POST",
        cache: "no-store",
      });
      // 等待聚合计算完成
      await new Promise((r) => setTimeout(r, 15000));

      // Step 3: 重新拉取热力图数据
      setLoading(true);
      const endpoint = onlyIndustry
        ? `${API}/api/board/industry-rotation?days=${days}`
        : `${API}/api/sw-industry/rotation?days=${days}`;
      const r = await fetch(endpoint);
      const d = await r.json();
      if (d && Array.isArray(d.boards)) setData(d);
    } catch {
      // ignore
    } finally {
      setSyncingRotation(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    // 申万板块 K 线（常规补全）
    fetch(`${API}/api/sw-industry/sync-klines`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
    // 产业板块成分股缺失 K 线补全（新增产业后会自动补）
    fetch(`${API}/api/board/sync-industry-stocks`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
    // 产业板块 K 线聚合计算（含新产业检测）
    fetch(`${API}/api/board/calc-industry-kline`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const endpoint = onlyIndustry
      ? `${API}/api/board/industry-rotation?days=${days}`
      : `${API}/api/sw-industry/rotation?days=${days}`;
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.boards)) {
          setData(d);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days, onlyIndustry]);

  const allBoards = data && Array.isArray(data.boards) ? data.boards : [];

  const sortedBoards = [...allBoards]
    .filter((b) => !onlyIndustry || parseIndustryBoardCode(b.code) !== null)
    .filter((b) => {
      if (!searchText.trim()) return true;
      const q = searchText.trim().toLowerCase();
      return b.name.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === "recent") {
        return rotationSortOrder === "desc"
          ? b.currentChangePct - a.currentChangePct
          : a.currentChangePct - b.currentChangePct;
      }
      if (sortBy === "cumulative") {
        const sumA =
          a.data.reduce<number>((acc, v) => acc + (v ?? 0), 0) +
          a.currentChangePct;
        const sumB =
          b.data.reduce<number>((acc, v) => acc + (v ?? 0), 0) +
          b.currentChangePct;
        return rotationSortOrder === "desc" ? sumB - sumA : sumA - sumB;
      }
      if (sortBy.startsWith("date_")) {
        const idx = parseInt(sortBy.slice(5), 10);
        const av = a.data[idx] ?? -Infinity;
        const bv = b.data[idx] ?? -Infinity;
        return rotationSortOrder === "desc" ? bv - av : av - bv;
      }
      return a.name.localeCompare(b.name);
    });

  const dates = data?.dates ?? [];

  // ── 辅助：对一组 boards 聚合平均每日涨跌幅、今日实时、累计
  function aggregateBoards(bds: RotationBoard[], dateCount: number) {
    if (bds.length === 0) {
      return {
        data: Array(dateCount).fill(null) as (number | null)[],
        currentChangePct: 0,
        cumulative: 0,
      };
    }
    const data: (number | null)[] = Array(dateCount).fill(null);
    for (let i = 0; i < dateCount; i++) {
      const vals = bds
        .map((b) => b.data[i])
        .filter((v) => v !== null && v !== undefined) as number[];
      data[i] =
        vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    }
    const currentChangePct =
      bds.reduce((s, b) => s + b.currentChangePct, 0) / bds.length;
    const cumulative =
      bds.reduce(
        (s, b) =>
          s +
          b.data.reduce<number>((a, v) => a + (v ?? 0), 0) +
          b.currentChangePct,
        0,
      ) / bds.length;
    return { data, currentChangePct, cumulative };
  }

  // 三层树形结构：仅产业板块模式下使用
  // L1 -> L2(industryId) -> L3(layer) -> boards[]
  type AggData = {
    data: (number | null)[];
    currentChangePct: number;
    cumulative: number;
  };
  type L3Group = { layer: string; boards: RotationBoard[]; agg: AggData };
  type L2Group = { industryId: string; layers: L3Group[]; agg: AggData };
  type L1Group = {
    label: string;
    icon: string;
    industries: L2Group[];
    agg: AggData;
  };

  const industryTree: L1Group[] = [];
  if (onlyIndustry) {
    // 把 sortedBoards 按 industryId -> layer 分组
    const byIndustry = new Map<string, Map<string, RotationBoard[]>>();
    for (const board of sortedBoards) {
      const info = parseIndustryBoardCode(board.code);
      if (!info) continue;
      if (!byIndustry.has(info.industryId))
        byIndustry.set(info.industryId, new Map());
      const byLayer = byIndustry.get(info.industryId)!;
      if (!byLayer.has(info.layer)) byLayer.set(info.layer, []);
      byLayer.get(info.layer)!.push(board);
    }

    const layerOrder = ["upstream", "core", "downstream", "application"];

    for (const l1Config of L1_GROUPS) {
      const l2Groups: L2Group[] = [];
      for (const industryId of l1Config.industries) {
        const byLayer = byIndustry.get(industryId);
        if (!byLayer || byLayer.size === 0) continue;
        const layers: L3Group[] = layerOrder
          .filter((l) => byLayer.has(l))
          .map((l) => {
            const bds = byLayer.get(l)!;
            return {
              layer: l,
              boards: bds,
              agg: aggregateBoards(bds, dates.length),
            };
          });
        // 追加未知 layer
        for (const [l, bds] of byLayer) {
          if (!layerOrder.includes(l))
            layers.push({
              layer: l,
              boards: bds,
              agg: aggregateBoards(bds, dates.length),
            });
        }
        const allL2Boards = layers.flatMap((l) => l.boards);
        l2Groups.push({
          industryId,
          layers,
          agg: aggregateBoards(allL2Boards, dates.length),
        });
      }
      // 兜底：追加不在 L1_GROUPS 里的产业
      if (l1Config === L1_GROUPS[L1_GROUPS.length - 1]) {
        for (const [industryId, byLayer] of byIndustry) {
          if (INDUSTRY_TO_L1[industryId]) continue;
          const layers: L3Group[] = layerOrder
            .filter((l) => byLayer.has(l))
            .map((l) => {
              const bds = byLayer.get(l)!;
              return {
                layer: l,
                boards: bds,
                agg: aggregateBoards(bds, dates.length),
              };
            });
          for (const [l, bds] of byLayer) {
            if (!layerOrder.includes(l))
              layers.push({
                layer: l,
                boards: bds,
                agg: aggregateBoards(bds, dates.length),
              });
          }
          const allL2Boards = layers.flatMap((l) => l.boards);
          l2Groups.push({
            industryId,
            layers,
            agg: aggregateBoards(allL2Boards, dates.length),
          });
        }
      }
      if (l2Groups.length > 0) {
        const allL1Boards = l2Groups.flatMap((l2) =>
          l2.layers.flatMap((l3) => l3.boards),
        );
        industryTree.push({
          label: l1Config.label,
          icon: l1Config.icon,
          industries: l2Groups,
          agg: aggregateBoards(allL1Boards, dates.length),
        });
      }
    }

    // 按 sortBy 对 L1、L2 分组重新排序
    if (sortBy === "cumulative") {
      industryTree.sort((a, b) =>
        rotationSortOrder === "desc"
          ? b.agg.cumulative - a.agg.cumulative
          : a.agg.cumulative - b.agg.cumulative,
      );
      for (const l1 of industryTree) {
        l1.industries.sort((a, b) =>
          rotationSortOrder === "desc"
            ? b.agg.cumulative - a.agg.cumulative
            : a.agg.cumulative - b.agg.cumulative,
        );
      }
    } else if (sortBy === "recent") {
      industryTree.sort((a, b) =>
        rotationSortOrder === "desc"
          ? b.agg.currentChangePct - a.agg.currentChangePct
          : a.agg.currentChangePct - b.agg.currentChangePct,
      );
      for (const l1 of industryTree) {
        l1.industries.sort((a, b) =>
          rotationSortOrder === "desc"
            ? b.agg.currentChangePct - a.agg.currentChangePct
            : a.agg.currentChangePct - b.agg.currentChangePct,
        );
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden"
        style={{ width: "min(1100px, 95vw)", maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-0 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex-shrink-0">
          {/* 第一行：标题 + 搜索 + 关闭 */}
          <div className="flex items-center gap-3 px-5 pt-3 pb-2">
            <BarChart2 size={15} className="text-[var(--accent)]" />
            <span className="text-[14px] font-bold text-[var(--text-primary)]">
              板块轮动热力图
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)] hidden sm:inline">
              颜色越红=涨幅越大，越绿=跌幅越大
            </span>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索板块..."
              className="ml-auto px-2.5 py-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors w-32"
            />
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
          {/* 第二行：所有控件 */}
          <div className="flex items-center gap-1.5 px-5 pb-2.5 flex-wrap">
            {/* 仅产业板块 */}
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyIndustry}
                onChange={(e) => setOnlyIndustry(e.target.checked)}
                className="w-3 h-3 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                仅产业板块
              </span>
            </label>

            <div className="w-px h-3 bg-[var(--border-color)] mx-1 flex-shrink-0" />

            {/* 周期 */}
            <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">
              周期
            </span>
            {[7, 10, 14, 21].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "px-2.5 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                  days === d
                    ? "bg-[var(--accent)] text-black font-semibold"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
                )}
              >
                {d}天
              </button>
            ))}

            <div className="w-px h-3 bg-[var(--border-color)] mx-1 flex-shrink-0" />

            {/* 排序 */}
            <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">
              排序
            </span>
            <button
              onClick={() => {
                if (sortBy === "recent") {
                  setRotationSortOrder((o) => (o === "desc" ? "asc" : "desc"));
                } else {
                  setSortBy("recent");
                  setRotationSortOrder("desc");
                }
              }}
              className={cn(
                "px-2.5 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                sortBy === "recent"
                  ? "bg-[var(--accent)] text-black font-semibold"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
              )}
            >
              最新涨幅
            </button>
            <button
              onClick={() => setSortBy("name")}
              className={cn(
                "px-2.5 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap",
                sortBy === "name"
                  ? "bg-[var(--accent)] text-black font-semibold"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]",
              )}
            >
              板块名称
            </button>

            {/* 补全数据 — 推到最右 */}
            <button
              onClick={handleForceSync}
              disabled={syncing}
              className={cn(
                "ml-auto flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] transition-colors whitespace-nowrap flex-shrink-0",
                syncing
                  ? "border-[var(--accent)]/40 text-[var(--accent)] opacity-70 cursor-not-allowed"
                  : "border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50",
              )}
            >
              <RefreshCw size={11} className={cn(syncing && "animate-spin")} />
              {syncing ? "同步中..." : "补全数据"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-[var(--text-tertiary)] text-sm">
              加载中...
            </div>
          ) : !data ||
            !Array.isArray(data.boards) ||
            data.boards.length === 0 ||
            dates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="text-[var(--text-tertiary)] text-sm">
                暂无K线缓存数据
              </span>
              <span className="text-[var(--text-tertiary)] text-xs">
                请先在板块详情页查看K线以触发数据缓存，或在系统监控页执行一键刷新
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="border-collapse text-xs"
                style={{ minWidth: dates.length * 52 + 260 }}
              >
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[var(--bg-primary)] px-3 py-1.5 text-left text-[var(--text-tertiary)] font-medium whitespace-nowrap w-44 min-w-44">
                      板块
                    </th>
                    {dates.map((d, i) => {
                      const dateKey = `date_${i}` as const;
                      const active = sortBy === dateKey;
                      return (
                        <th
                          key={d}
                          className={cn(
                            "px-1 py-1.5 text-center font-normal whitespace-nowrap cursor-pointer select-none transition-colors group",
                            active
                              ? "text-[var(--accent)]"
                              : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                          )}
                          style={{ minWidth: 48 }}
                          onClick={() => {
                            if (active) {
                              setRotationSortOrder((o) =>
                                o === "desc" ? "asc" : "desc",
                              );
                            } else {
                              setSortBy(dateKey);
                              setRotationSortOrder("desc");
                            }
                          }}
                        >
                          <span className="inline-flex flex-col items-center gap-0">
                            <span className="text-[10px]">{d.slice(5)}</span>
                            <span className="h-2.5 flex items-center">
                              {active ? (
                                rotationSortOrder === "desc" ? (
                                  <ChevronDown
                                    size={9}
                                    className="text-[var(--accent)]"
                                  />
                                ) : (
                                  <ChevronUp
                                    size={9}
                                    className="text-[var(--accent)]"
                                  />
                                )
                              ) : (
                                <ArrowUpDown
                                  size={8}
                                  className="opacity-0 group-hover:opacity-30 transition-opacity"
                                />
                              )}
                            </span>
                          </span>
                        </th>
                      );
                    })}
                    <th className="px-3 py-1.5 text-center font-medium whitespace-nowrap text-[10px]">
                      <span className="text-[var(--accent)]">今日实时</span>
                    </th>
                    <th
                      className="px-3 py-1.5 text-center font-medium whitespace-nowrap text-[10px] cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors"
                      onClick={() => {
                        if (sortBy === "cumulative") {
                          setRotationSortOrder((o) =>
                            o === "desc" ? "asc" : "desc",
                          );
                        } else {
                          setSortBy("cumulative");
                          setRotationSortOrder("desc");
                        }
                      }}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5",
                          sortBy === "cumulative"
                            ? "text-[var(--accent)]"
                            : "text-[var(--text-secondary)]",
                        )}
                      >
                        累计涨幅
                        {sortBy === "cumulative" ? (
                          rotationSortOrder === "desc" ? (
                            <ChevronDown
                              size={10}
                              className="text-[var(--accent)]"
                            />
                          ) : (
                            <ChevronUp
                              size={10}
                              className="text-[var(--accent)]"
                            />
                          )
                        ) : (
                          <ArrowUpDown size={10} className="opacity-40" />
                        )}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {onlyIndustry
                    ? // ── 三层折叠模式 ──
                      industryTree.map((l1) => {
                        const l1Open = expandedL1.has(l1.label);
                        return (
                          <React.Fragment key={`l1frag-${l1.label}`}>
                            {/* ── L1 大类行 ── */}
                            <tr
                              className="cursor-pointer select-none"
                              onClick={() => toggleL1(l1.label)}
                            >
                              <td
                                className="sticky left-0 z-10 px-3 py-1.5 whitespace-nowrap"
                                style={{
                                  background: "var(--bg-tertiary)",
                                  borderTop: "1px solid var(--border-color)",
                                }}
                              >
                                <div className="flex items-center gap-1.5">
                                  <ChevronDown
                                    size={13}
                                    className={cn(
                                      "flex-shrink-0 transition-transform",
                                      l1Open
                                        ? "text-[var(--accent)]"
                                        : "text-[var(--text-tertiary)] -rotate-90",
                                    )}
                                  />
                                  <span className="text-[11px]">{l1.icon}</span>
                                  <span className="text-[12px] font-bold text-[var(--text-primary)]">
                                    {l1.label}
                                  </span>
                                  <span className="text-[10px] text-[var(--text-tertiary)]">
                                    {l1.industries.length} 个产业
                                  </span>
                                </div>
                              </td>
                              {dates.map((_, i) => {
                                const v = l1.agg.data[i];
                                return (
                                  <td
                                    key={i}
                                    className="px-0.5 py-0.5"
                                    style={{
                                      background: "var(--bg-tertiary)",
                                      borderTop:
                                        "1px solid var(--border-color)",
                                    }}
                                  >
                                    <div
                                      className="rounded flex items-center justify-center font-mono"
                                      style={{
                                        background: heatColor(v),
                                        width: 44,
                                        height: 22,
                                        fontSize: 9,
                                        color:
                                          v === null
                                            ? "var(--text-tertiary)"
                                            : "#fff",
                                        opacity: v === null ? 0.4 : 0.85,
                                      }}
                                    >
                                      {v === null
                                        ? "·"
                                        : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                                    </div>
                                  </td>
                                );
                              })}
                              <td
                                className="px-3 py-1 text-center"
                                style={{
                                  background: "var(--bg-tertiary)",
                                  borderTop: "1px solid var(--border-color)",
                                }}
                              >
                                <span
                                  className={cn(
                                    "text-[11px] font-mono font-bold",
                                    l1.agg.currentChangePct > 0
                                      ? "text-[#e84444]"
                                      : l1.agg.currentChangePct < 0
                                        ? "text-[#09d464]"
                                        : "text-[var(--text-secondary)]",
                                  )}
                                >
                                  {l1.agg.currentChangePct !== 0 &&
                                    (l1.agg.currentChangePct > 0 ? "+" : "")}
                                  {l1.agg.currentChangePct.toFixed(2)}%
                                </span>
                              </td>
                              <td
                                className="px-3 py-1 text-center"
                                style={{
                                  background: "var(--bg-tertiary)",
                                  borderTop: "1px solid var(--border-color)",
                                }}
                              >
                                <span
                                  className={cn(
                                    "text-[11px] font-mono font-bold",
                                    l1.agg.cumulative > 0
                                      ? "text-[#e84444]"
                                      : l1.agg.cumulative < 0
                                        ? "text-[#09d464]"
                                        : "text-[var(--text-secondary)]",
                                  )}
                                >
                                  {l1.agg.cumulative > 0 ? "+" : ""}
                                  {l1.agg.cumulative.toFixed(2)}%
                                </span>
                              </td>
                            </tr>

                            {l1Open &&
                              l1.industries.map((l2) => {
                                const l2Open = expandedL2.has(l2.industryId);
                                return (
                                  <React.Fragment
                                    key={`l2frag-${l2.industryId}`}
                                  >
                                    {/* ── L2 产业行 ── */}
                                    <tr
                                      className="cursor-pointer select-none"
                                      onClick={() => toggleL2(l2.industryId)}
                                    >
                                      <td
                                        className="sticky left-0 z-10 px-3 py-1 whitespace-nowrap"
                                        style={{
                                          background: "var(--bg-secondary)",
                                        }}
                                      >
                                        <div className="flex items-center gap-1.5 pl-5">
                                          <ChevronDown
                                            size={11}
                                            className={cn(
                                              "flex-shrink-0 transition-transform",
                                              l2Open
                                                ? "text-[var(--accent)]"
                                                : "text-[var(--text-tertiary)] -rotate-90",
                                            )}
                                          />
                                          <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                                            {INDUSTRY_DISPLAY[l2.industryId] ??
                                              l2.industryId}
                                          </span>
                                          <span className="text-[10px] text-[var(--text-tertiary)]">
                                            {l2.layers.length} 层
                                          </span>
                                        </div>
                                      </td>
                                      {dates.map((_, i) => {
                                        const v = l2.agg.data[i];
                                        return (
                                          <td
                                            key={i}
                                            className="px-0.5 py-0.5"
                                            style={{
                                              background: "var(--bg-secondary)",
                                            }}
                                          >
                                            <div
                                              className="rounded flex items-center justify-center font-mono"
                                              style={{
                                                background: heatColor(v),
                                                width: 44,
                                                height: 22,
                                                fontSize: 9,
                                                color:
                                                  v === null
                                                    ? "var(--text-tertiary)"
                                                    : "#fff",
                                                opacity: v === null ? 0.3 : 0.8,
                                              }}
                                            >
                                              {v === null
                                                ? "·"
                                                : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                                            </div>
                                          </td>
                                        );
                                      })}
                                      <td
                                        className="px-3 py-1 text-center"
                                        style={{
                                          background: "var(--bg-secondary)",
                                        }}
                                      >
                                        <span
                                          className={cn(
                                            "text-[11px] font-mono font-semibold",
                                            l2.agg.currentChangePct > 0
                                              ? "text-[#e84444]"
                                              : l2.agg.currentChangePct < 0
                                                ? "text-[#09d464]"
                                                : "text-[var(--text-secondary)]",
                                          )}
                                        >
                                          {l2.agg.currentChangePct !== 0 &&
                                            (l2.agg.currentChangePct > 0
                                              ? "+"
                                              : "")}
                                          {l2.agg.currentChangePct.toFixed(2)}%
                                        </span>
                                      </td>
                                      <td
                                        className="px-3 py-1 text-center"
                                        style={{
                                          background: "var(--bg-secondary)",
                                        }}
                                      >
                                        <span
                                          className={cn(
                                            "text-[11px] font-mono font-semibold",
                                            l2.agg.cumulative > 0
                                              ? "text-[#e84444]"
                                              : l2.agg.cumulative < 0
                                                ? "text-[#09d464]"
                                                : "text-[var(--text-secondary)]",
                                          )}
                                        >
                                          {l2.agg.cumulative > 0 ? "+" : ""}
                                          {l2.agg.cumulative.toFixed(2)}%
                                        </span>
                                      </td>
                                    </tr>

                                    {l2Open &&
                                      l2.layers.map((l3) => {
                                        const l3Key = `${l2.industryId}_${l3.layer}`;
                                        const l3Open = expandedL3.has(l3Key);
                                        return (
                                          <React.Fragment
                                            key={`l3frag-${l3Key}`}
                                          >
                                            {/* ── L3 层级行 ── */}
                                            <tr
                                              className="cursor-pointer select-none"
                                              onClick={() => toggleL3(l3Key)}
                                            >
                                              <td className="sticky left-0 z-10 bg-[var(--bg-primary)] px-3 py-1 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5 pl-9">
                                                  <ChevronDown
                                                    size={10}
                                                    className={cn(
                                                      "flex-shrink-0 transition-transform",
                                                      l3Open
                                                        ? "text-[var(--accent)]"
                                                        : "text-[var(--text-tertiary)] -rotate-90",
                                                    )}
                                                  />
                                                  <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                                                    {LAYER_LABELS[l3.layer] ??
                                                      l3.layer}
                                                  </span>
                                                  <span className="text-[9px] text-[var(--text-tertiary)]">
                                                    {l3.boards.length} 个
                                                  </span>
                                                </div>
                                              </td>
                                              {dates.map((_, i) => {
                                                const v = l3.agg.data[i];
                                                return (
                                                  <td
                                                    key={i}
                                                    className="px-0.5 py-0.5"
                                                  >
                                                    <div
                                                      className="rounded flex items-center justify-center font-mono"
                                                      style={{
                                                        background:
                                                          heatColor(v),
                                                        width: 44,
                                                        height: 20,
                                                        fontSize: 9,
                                                        color:
                                                          v === null
                                                            ? "var(--text-tertiary)"
                                                            : "#fff",
                                                        opacity:
                                                          v === null
                                                            ? 0.25
                                                            : 0.7,
                                                      }}
                                                    >
                                                      {v === null
                                                        ? "·"
                                                        : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                                                    </div>
                                                  </td>
                                                );
                                              })}
                                              <td className="px-3 py-1 text-center">
                                                <span
                                                  className={cn(
                                                    "text-[10px] font-mono",
                                                    l3.agg.currentChangePct > 0
                                                      ? "text-[#e84444]"
                                                      : l3.agg
                                                            .currentChangePct <
                                                          0
                                                        ? "text-[#09d464]"
                                                        : "text-[var(--text-secondary)]",
                                                  )}
                                                >
                                                  {l3.agg.currentChangePct !==
                                                    0 &&
                                                    (l3.agg.currentChangePct > 0
                                                      ? "+"
                                                      : "")}
                                                  {l3.agg.currentChangePct.toFixed(
                                                    2,
                                                  )}
                                                  %
                                                </span>
                                              </td>
                                              <td className="px-3 py-1 text-center">
                                                <span
                                                  className={cn(
                                                    "text-[10px] font-mono",
                                                    l3.agg.cumulative > 0
                                                      ? "text-[#e84444]"
                                                      : l3.agg.cumulative < 0
                                                        ? "text-[#09d464]"
                                                        : "text-[var(--text-secondary)]",
                                                  )}
                                                >
                                                  {l3.agg.cumulative > 0
                                                    ? "+"
                                                    : ""}
                                                  {l3.agg.cumulative.toFixed(2)}
                                                  %
                                                </span>
                                              </td>
                                            </tr>

                                            {/* L3 展开后的板块行 */}
                                            {l3Open &&
                                              l3.boards.map((board) => {
                                                const industryInfo =
                                                  parseIndustryBoardCode(
                                                    board.code,
                                                  );
                                                return (
                                                  <tr
                                                    key={board.code}
                                                    className="hover:bg-[var(--bg-hover)] transition-colors"
                                                  >
                                                    <td className="sticky left-0 z-10 bg-[var(--bg-primary)] px-3 py-1 whitespace-nowrap">
                                                      <div className="flex items-center gap-1.5 pl-14">
                                                        {industryInfo ? (
                                                          <button
                                                            className="text-[11px] text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors text-left"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              window.open(
                                                                `/industry/${industryInfo.industryId}?tab=chain&layer=${industryInfo.layer}`,
                                                                "_blank",
                                                              );
                                                            }}
                                                          >
                                                            {board.name}
                                                          </button>
                                                        ) : (
                                                          <span className="text-[11px] text-[var(--text-primary)]">
                                                            {board.name}
                                                          </span>
                                                        )}
                                                        {board.tag && (
                                                          <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] leading-none">
                                                            {board.tag}
                                                          </span>
                                                        )}
                                                      </div>
                                                    </td>
                                                    {board.data.map((v, i) => (
                                                      <td
                                                        key={i}
                                                        className="px-0.5 py-0.5"
                                                      >
                                                        <div
                                                          className="rounded flex items-center justify-center font-mono"
                                                          style={{
                                                            background:
                                                              heatColor(v),
                                                            width: 44,
                                                            height: 26,
                                                            fontSize: 10,
                                                            color:
                                                              v === null
                                                                ? "var(--text-tertiary)"
                                                                : "#fff",
                                                            opacity:
                                                              v === null
                                                                ? 0.4
                                                                : 1,
                                                          }}
                                                        >
                                                          {v === null
                                                            ? "--"
                                                            : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                                                        </div>
                                                      </td>
                                                    ))}
                                                    <td className="px-3 py-1 text-center">
                                                      <span
                                                        className={cn(
                                                          "text-[11px] font-mono font-semibold",
                                                          board.currentChangePct >
                                                            0
                                                            ? "text-[#e84444]"
                                                            : board.currentChangePct <
                                                                0
                                                              ? "text-[#09d464]"
                                                              : "text-[var(--text-secondary)]",
                                                        )}
                                                      >
                                                        {board.currentChangePct >
                                                        0
                                                          ? "+"
                                                          : ""}
                                                        {board.currentChangePct.toFixed(
                                                          2,
                                                        )}
                                                        %
                                                      </span>
                                                    </td>
                                                    <td className="px-3 py-1 text-center">
                                                      {(() => {
                                                        const sum =
                                                          board.data.reduce<number>(
                                                            (acc, v) =>
                                                              acc + (v ?? 0),
                                                            0,
                                                          ) +
                                                          board.currentChangePct;
                                                        return (
                                                          <span
                                                            className={cn(
                                                              "text-[11px] font-mono font-semibold",
                                                              sum > 0
                                                                ? "text-[#e84444]"
                                                                : sum < 0
                                                                  ? "text-[#09d464]"
                                                                  : "text-[var(--text-secondary)]",
                                                            )}
                                                          >
                                                            {sum > 0 ? "+" : ""}
                                                            {sum.toFixed(2)}%
                                                          </span>
                                                        );
                                                      })()}
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                          </React.Fragment>
                                        );
                                      })}
                                  </React.Fragment>
                                );
                              })}
                          </React.Fragment>
                        );
                      })
                    : // ── 平铺模式（申万板块）──
                      sortedBoards.map((board) => {
                        const industryInfo = parseIndustryBoardCode(board.code);
                        return (
                          <tr
                            key={board.code}
                            className="hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            <td className="sticky left-0 z-10 bg-[var(--bg-primary)] px-3 py-1 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {industryInfo ? (
                                  <button
                                    className="text-[12px] text-[var(--text-primary)] font-medium hover:text-[var(--accent)] transition-colors text-left"
                                    onClick={() =>
                                      window.open(
                                        `/industry/${industryInfo.industryId}?tab=chain&layer=${industryInfo.layer}`,
                                        "_blank",
                                      )
                                    }
                                  >
                                    {board.name}
                                  </button>
                                ) : (
                                  <span className="text-[12px] text-[var(--text-primary)] font-medium">
                                    {board.name}
                                  </span>
                                )}
                                {board.tag && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] leading-none">
                                    {board.tag}
                                  </span>
                                )}
                              </div>
                            </td>
                            {board.data.map((v, i) => (
                              <td key={i} className="px-0.5 py-0.5">
                                <div
                                  className="rounded flex items-center justify-center font-mono"
                                  style={{
                                    background: heatColor(v),
                                    width: 44,
                                    height: 26,
                                    fontSize: 10,
                                    color:
                                      v === null
                                        ? "var(--text-tertiary)"
                                        : "#fff",
                                    opacity: v === null ? 0.4 : 1,
                                  }}
                                >
                                  {v === null
                                    ? "--"
                                    : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                                </div>
                              </td>
                            ))}
                            <td className="px-3 py-1 text-center">
                              <span
                                className={cn(
                                  "text-[11px] font-mono font-semibold",
                                  board.currentChangePct > 0
                                    ? "text-[#e84444]"
                                    : board.currentChangePct < 0
                                      ? "text-[#09d464]"
                                      : "text-[var(--text-secondary)]",
                                )}
                              >
                                {board.currentChangePct > 0 ? "+" : ""}
                                {board.currentChangePct.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-3 py-1 text-center">
                              {(() => {
                                const sum =
                                  board.data.reduce<number>(
                                    (acc, v) => acc + (v ?? 0),
                                    0,
                                  ) + board.currentChangePct;
                                return (
                                  <span
                                    className={cn(
                                      "text-[11px] font-mono font-semibold",
                                      sum > 0
                                        ? "text-[#e84444]"
                                        : sum < 0
                                          ? "text-[#09d464]"
                                          : "text-[var(--text-secondary)]",
                                    )}
                                  >
                                    {sum > 0 ? "+" : ""}
                                    {sum.toFixed(2)}%
                                  </span>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-2.5 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex-shrink-0">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            涨跌幅色阶：
          </span>
          {[-5, -3, -1, 0, 1, 3, 5].map((v) => (
            <div key={v} className="flex items-center gap-1">
              <div
                className="rounded"
                style={{ width: 20, height: 12, background: heatColor(v) }}
              />
              <span className="text-[9px] text-[var(--text-tertiary)]">
                {v > 0 ? "+" : ""}
                {v}%
              </span>
            </div>
          ))}
          <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
            Top20涨跌幅板块 + 产业分析关联板块 · 数据来源: K线缓存
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SwIndustryPage() {
  const router = useRouter();

  // ── 从 sessionStorage 恢复上次的 UI 状态 ──
  const restoredState = useRef<ReturnType<typeof loadSwPageState>>(null);
  useEffect(() => {
    restoredState.current = loadSwPageState();
  }, []);

  const [boards, setBoards] = useState<SwBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const s = loadSwPageState();
    return (s?.sortKey as SortKey) ?? "changePct";
  });
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    const s = loadSwPageState();
    return s?.sortOrder ?? "desc";
  });
  const [selectedBoard, setSelectedBoard] = useState<SwBoard | null>(null);
  const [constituents, setConstituents] = useState<SwConstituent[]>([]);
  const [consLoading, setConsLoading] = useState(false);
  const [consSortKey, setConsSortKey] = useState<ConsSortKey>(() => {
    const s = loadSwPageState();
    return (s?.consSortKey as ConsSortKey) ?? "changePct";
  });
  const [consSortOrder, setConsSortOrder] = useState<"asc" | "desc">(() => {
    const s = loadSwPageState();
    return s?.consSortOrder ?? "desc";
  });
  const [syncing, setSyncing] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [showFundFlow, setShowFundFlow] = useState(false);
  const [showLiveFlow, setShowLiveFlow] = useState(false);
  const [onlyIndustryBoards, setOnlyIndustryBoards] = useState(() => {
    const s = loadSwPageState();
    return s?.onlyIndustryBoards ?? false;
  });
  const [deletingBoard, setDeletingBoard] = useState<string | null>(null);
  // 高亮股票（从个股详情返回时使用）
  const [highlightStockCode, setHighlightStockCode] = useState<string | null>(
    () => {
      const s = loadSwPageState();
      return s?.highlightStockCode ?? null;
    },
  );
  // 板块列表三层折叠状态（从 sessionStorage 恢复）
  const [listExpandedL1, setListExpandedL1] = useState<Set<string>>(() => {
    const s = loadSwPageState();
    return s?.listExpandedL1 ? new Set(s.listExpandedL1) : new Set();
  });
  const [listExpandedL2, setListExpandedL2] = useState<Set<string>>(() => {
    const s = loadSwPageState();
    return s?.listExpandedL2 ? new Set(s.listExpandedL2) : new Set();
  });
  const [listExpandedL3, setListExpandedL3] = useState<Set<string>>(() => {
    const s = loadSwPageState();
    return s?.listExpandedL3 ? new Set(s.listExpandedL3) : new Set();
  });

  // 滚动容器 ref（板块列表区域）
  const boardListScrollRef = useRef<HTMLDivElement>(null);
  const consScrollRef = useRef<HTMLDivElement>(null);
  // 高亮行的 ref，用于自动滚动
  const highlightRowRef = useRef<HTMLTableRowElement>(null);

  function toggleListL1(label: string) {
    setListExpandedL1((prev) => {
      const n = new Set(prev);
      n.has(label) ? n.delete(label) : n.add(label);
      saveSwPageState({ listExpandedL1: Array.from(n) });
      return n;
    });
  }
  function toggleListL2(id: string) {
    setListExpandedL2((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      saveSwPageState({ listExpandedL2: Array.from(n) });
      return n;
    });
  }
  function toggleListL3(key: string) {
    setListExpandedL3((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      saveSwPageState({ listExpandedL3: Array.from(n) });
      return n;
    });
  }

  // ── 状态持久化：关键状态变化时同步保存 ──
  useEffect(() => {
    saveSwPageState({ sortKey, sortOrder, onlyIndustryBoards });
  }, [sortKey, sortOrder, onlyIndustryBoards]);

  useEffect(() => {
    saveSwPageState({ consSortKey, consSortOrder });
  }, [consSortKey, consSortOrder]);

  useEffect(() => {
    if (selectedBoard) {
      saveSwPageState({ selectedBoardCode: selectedBoard.code });
    }
  }, [selectedBoard]);

  // ── 滚动位置恢复 ──
  // 1. 板块列表滚动位置（返回页面时恢复）
  const savedScrollRestored = useRef(false);
  useEffect(() => {
    if (loading || savedScrollRestored.current) return;
    const savedState = loadSwPageState();
    if (!savedState) return;
    savedScrollRestored.current = true;
    // 延迟一帧等待渲染完成
    requestAnimationFrame(() => {
      if (boardListScrollRef.current && savedState.scrollTop) {
        boardListScrollRef.current.scrollTop = savedState.scrollTop;
      }
    });
  }, [loading]);

  // 2. 高亮股票自动滚动（从个股详情返回，成分股列表中找到对应股票）
  useEffect(() => {
    if (!highlightStockCode || !highlightRowRef.current) return;
    const timer = setTimeout(() => {
      highlightRowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      // 高亮3秒后自动清除
      const clearTimer = setTimeout(() => {
        setHighlightStockCode(null);
        saveSwPageState({ highlightStockCode: null });
      }, 3000);
      return () => clearTimeout(clearTimer);
    }, 300);
    return () => clearTimeout(timer);
  }, [highlightStockCode, constituents]);

  // ── 板块列表滚动时保存位置 ──
  const handleBoardListScroll = useCallback(() => {
    if (boardListScrollRef.current) {
      saveSwPageState({
        scrollTop: boardListScrollRef.current.scrollTop,
      });
    }
  }, []);

  const [topHeight, setTopHeight] = useState(() => {
    const s = loadSwPageState();
    return s?.topHeight ?? 300;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const onResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartHeight.current = topHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerH = containerRef.current.clientHeight;
      const delta = e.clientY - dragStartY.current;
      const next = dragStartHeight.current + delta;
      const clamped = Math.min(
        Math.max(next, MIN_TOP_PX),
        containerH - MIN_BOTTOM_PX - 4,
      );
      setTopHeight(clamped);
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // 拖拽结束时保存分割线位置
      saveSwPageState({ topHeight: dragStartHeight.current });
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const [stockQuery, setStockQuery] = useState("");
  const [stockResults, setStockResults] = useState<StockSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(
    null,
  );
  const [stockBoards, setStockBoards] = useState<
    { code: string; name: string }[]
  >([]);
  const [industryBoards, setIndustryBoards] = useState<SwBoard[]>([]);
  const [boardNameFilter, setBoardNameFilter] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBoards = useCallback(async () => {
    try {
      const r = await fetch(
        `${API}/api/sw-industry?sort=${sortKey}&order=${sortOrder}`,
      );
      if (r.ok) {
        const data = await r.json();
        setBoards(data);
        // 恢复上次选中的板块（数据加载完后）
        const savedState = loadSwPageState();
        if (savedState?.selectedBoardCode) {
          const board = data.find(
            (b: SwBoard) => b.code === savedState.selectedBoardCode,
          );
          if (board) {
            // 自动加载成分股（不清除高亮）
            setSelectedBoard(board);
            const endpoint = `${API}/api/sw-industry/constituents/${board.code}`;
            fetch(endpoint)
              .then((r2) => r2.json())
              .then((cons: SwConstituent[]) => setConstituents(cons))
              .catch(() => {});
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [sortKey, sortOrder]);

  const fetchIndustryBoards = useCallback(async () => {
    try {
      const r = await fetch(
        `${API}/api/board/industry?sort=${sortKey === "changePct" ? "change_pct" : sortKey}&limit=200`,
      );
      if (r.ok) {
        const data = await r.json();
        setIndustryBoards(data);
      }
    } catch (err) {
      console.error("Failed to fetch industry boards:", err);
    }
  }, [sortKey]);

  useEffect(() => {
    fetchBoards();
    if (onlyIndustryBoards) {
      fetchIndustryBoards();
    }
  }, [fetchBoards, onlyIndustryBoards, fetchIndustryBoards]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleStockInput = (val: string) => {
    setStockQuery(val);
    setBoardNameFilter(val.trim());
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setStockResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `${API}/api/search?q=${encodeURIComponent(val)}&limit=8`,
        );
        if (r.ok) {
          const data = await r.json();
          setStockResults(data.results ?? []);
          setShowDropdown(true);
        }
      } catch {
        setStockResults([]);
      }
    }, 200);
  };

  const handleSelectStock = async (stock: StockSearchResult) => {
    setSelectedStock(stock);
    setStockQuery(`${stock.name} ${stock.code}`);
    setShowDropdown(false);
    setStockResults([]);
    const r = await fetch(
      `${API}/api/sw-industry/boards-by-stock/${stock.code}`,
    );
    if (r.ok) {
      const data: { code: string; name: string }[] = await r.json();
      setStockBoards(data);
      if (data.length === 1) {
        const board = boards.find((b) => b.code === data[0].code);
        if (board) fetchConstituents(board);
      } else {
        setSelectedBoard(null);
        setConstituents([]);
      }
    } else {
      setStockBoards([]);
    }
  };

  const clearStockFilter = () => {
    setSelectedStock(null);
    setStockBoards([]);
    setStockQuery("");
    setStockResults([]);
    setShowDropdown(false);
    setBoardNameFilter("");
  };

  const fetchConstituents = async (board: SwBoard) => {
    setSelectedBoard(board);
    setConsLoading(true);
    // 清除高亮（手动点击选择新板块时，清除之前的高亮）
    setHighlightStockCode(null);
    saveSwPageState({
      selectedBoardCode: board.code,
      highlightStockCode: null,
    });
    try {
      const endpoint = onlyIndustryBoards
        ? `${API}/api/board/industry-constituents/${board.code}`
        : `${API}/api/sw-industry/constituents/${board.code}`;
      const r = await fetch(endpoint);
      if (r.ok) {
        const data: SwConstituent[] = await r.json();
        setConstituents(data);
      }
    } finally {
      setConsLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      if (onlyIndustryBoards) {
        // 产业板块模式：同步成分股行情（stock_quote），完成后刷新产业板块列表
        await fetch(`${API}/api/sync/quotes`, { method: "POST" });
        setTimeout(() => {
          fetchIndustryBoards();
          setSyncing(false);
        }, 5000);
      } else {
        // 申万模式：同步申万行业指数
        await fetch(`${API}/api/sw-industry/sync`, { method: "POST" });
        setTimeout(() => {
          fetchBoards();
          setSyncing(false);
        }, 4000);
      }
    } catch {
      setSyncing(false);
    }
  };

  const handleDeleteBoard = async (boardCode: string, boardName: string) => {
    if (
      !confirm(
        `确定要删除板块"${boardName}"吗？\n\n此操作将删除该板块的所有节点数据，不可恢复！`,
      )
    ) {
      return;
    }

    setDeletingBoard(boardCode);
    try {
      const r = await fetch(`${API}/api/board/industry/${boardCode}`, {
        method: "DELETE",
      });
      if (r.ok) {
        if (selectedBoard?.code === boardCode) {
          setSelectedBoard(null);
          setConstituents([]);
        }
        fetchIndustryBoards();
      } else {
        const data = await r.json();
        alert(`删除失败: ${data.detail || "未知错误"}`);
      }
    } catch (error) {
      alert("删除失败，请稍后重试");
    } finally {
      setDeletingBoard(null);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const sortedCons = [...constituents].sort((a, b) => {
    if (selectedStock) {
      if (a.code === selectedStock.code) return -1;
      if (b.code === selectedStock.code) return 1;
    }
    const v = (x: SwConstituent) => {
      switch (consSortKey) {
        case "changePct":
          return x.changePct;
        case "price":
          return x.price;
        case "turnover":
          return x.turnover;
        case "marketCap":
          return x.marketCap;
        case "pe":
          return x.pe;
        case "pb":
          return x.pb;
        case "name":
          return 0;
        default:
          return 0;
      }
    };
    if (consSortKey === "name") {
      return consSortOrder === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    }
    return consSortOrder === "asc" ? v(a) - v(b) : v(b) - v(a);
  });

  const toggleConSort = (key: ConsSortKey) => {
    if (consSortKey === key) {
      setConsSortOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setConsSortKey(key);
      setConsSortOrder("desc");
    }
  };

  const filteredBoards = onlyIndustryBoards
    ? boardNameFilter
      ? industryBoards.filter((b) =>
          b.name.toLowerCase().includes(boardNameFilter.toLowerCase()),
        )
      : industryBoards
    : stockBoards.length > 0
      ? boards.filter((b) => stockBoards.some((sb) => sb.code === b.code))
      : boardNameFilter
        ? boards.filter((b) =>
            b.name.toLowerCase().includes(boardNameFilter.toLowerCase()),
          )
        : boards;

  // 板块列表三层树形（仅 onlyIndustryBoards 模式）
  type ListL3 = { layer: string; boards: SwBoard[]; avgChangePct: number };
  type ListL2 = { industryId: string; layers: ListL3[]; avgChangePct: number };
  type ListL1 = {
    label: string;
    icon: string;
    industries: ListL2[];
    avgChangePct: number;
  };
  const listTree: ListL1[] = [];
  if (onlyIndustryBoards) {
    const byIndustry = new Map<string, Map<string, SwBoard[]>>();
    for (const b of filteredBoards) {
      const info = parseIndustryBoardCode(b.code);
      if (!info) continue;
      if (!byIndustry.has(info.industryId))
        byIndustry.set(info.industryId, new Map());
      const byLayer = byIndustry.get(info.industryId)!;
      if (!byLayer.has(info.layer)) byLayer.set(info.layer, []);
      byLayer.get(info.layer)!.push(b);
    }
    const layerOrder = ["upstream", "core", "downstream", "application"];
    for (const l1Config of L1_GROUPS) {
      const l2Groups: ListL2[] = [];
      for (const industryId of l1Config.industries) {
        const byLayer = byIndustry.get(industryId);
        if (!byLayer || byLayer.size === 0) continue;
        const layers: ListL3[] = layerOrder
          .filter((l) => byLayer.has(l))
          .map((l) => {
            const bds = byLayer.get(l)!;
            return {
              layer: l,
              boards: bds,
              avgChangePct:
                bds.reduce((s, b) => s + b.changePct, 0) / bds.length,
            };
          });
        for (const [l, bds] of byLayer) {
          if (!layerOrder.includes(l))
            layers.push({
              layer: l,
              boards: bds,
              avgChangePct:
                bds.reduce((s, b) => s + b.changePct, 0) / bds.length,
            });
        }
        const allBds = layers.flatMap((l) => l.boards);
        l2Groups.push({
          industryId,
          layers,
          avgChangePct:
            allBds.reduce((s, b) => s + b.changePct, 0) / allBds.length,
        });
      }
      // 兜底
      if (l1Config === L1_GROUPS[L1_GROUPS.length - 1]) {
        for (const [industryId, byLayer] of byIndustry) {
          if (INDUSTRY_TO_L1[industryId]) continue;
          const layers: ListL3[] = layerOrder
            .filter((l) => byLayer.has(l))
            .map((l) => {
              const bds = byLayer.get(l)!;
              return {
                layer: l,
                boards: bds,
                avgChangePct:
                  bds.reduce((s, b) => s + b.changePct, 0) / bds.length,
              };
            });
          for (const [l, bds] of byLayer) {
            if (!layerOrder.includes(l))
              layers.push({
                layer: l,
                boards: bds,
                avgChangePct:
                  bds.reduce((s, b) => s + b.changePct, 0) / bds.length,
              });
          }
          const allBds = layers.flatMap((l) => l.boards);
          l2Groups.push({
            industryId,
            layers,
            avgChangePct:
              allBds.reduce((s, b) => s + b.changePct, 0) / allBds.length,
          });
        }
      }
      if (l2Groups.length > 0) {
        const allBds = l2Groups.flatMap((l2) =>
          l2.layers.flatMap((l3) => l3.boards),
        );
        listTree.push({
          label: l1Config.label,
          icon: l1Config.icon,
          industries: l2Groups,
          avgChangePct:
            allBds.reduce((s, b) => s + b.changePct, 0) / allBds.length,
        });
      }
    }
  }

  type ColKey = SortKey | "action";
  const BOARD_COLS: { key: ColKey; label: string; align?: string }[] = [
    { key: "name", label: "板块名称" },
    { key: "changePct", label: "涨跌幅" },
    { key: "price", label: "最新价" },
    { key: "turnover", label: "成交额" },
    { key: "volume", label: "成交量" },
    { key: "peTtm", label: "PE(TTM)" },
    { key: "pb", label: "市净率" },
    { key: "compCount", label: "成分数" },
  ];

  const BOARD_COLS_WITH_ACTION: {
    key: ColKey;
    label: string;
    align?: string;
  }[] = [...BOARD_COLS, { key: "action", label: "操作", align: "center" }];

  const CON_COLS: { key: ConsSortKey; label: string }[] = [
    { key: "name", label: "股票名称" },
    { key: "changePct", label: "涨跌幅" },
    { key: "price", label: "最新价" },
    { key: "turnover", label: "成交额" },
    { key: "marketCap", label: "市值" },
    { key: "pe", label: "市盈率" },
    { key: "pb", label: "市净率" },
  ];

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-color)] flex-shrink-0">
        <span className="text-[15px] font-bold text-[var(--text-primary)]">
          申万行业板块
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          · 申万二级行业 ·{" "}
          {stockBoards.length > 0
            ? `${filteredBoards.length} 个板块`
            : `${boards.length} 个板块`}
        </span>

        <div ref={searchRef} className="relative ml-2">
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors",
              "bg-[var(--bg-secondary)] border-[var(--border-color)]",
              "focus-within:border-[#3b82f6] focus-within:ring-1 focus-within:ring-[#3b82f6]/30",
            )}
          >
            <Search
              size={12}
              className="text-[var(--text-tertiary)] flex-shrink-0"
            />
            <input
              type="text"
              value={stockQuery}
              onChange={(e) => handleStockInput(e.target.value)}
              onFocus={() => {
                if (stockResults.length > 0) setShowDropdown(true);
              }}
              placeholder="搜索股票或板块名称..."
              className="w-40 bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] text-[11px]"
            />
            {selectedStock && (
              <button
                onClick={clearStockFilter}
                className="flex-shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {showDropdown && stockResults.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md shadow-lg z-50 overflow-hidden">
              {stockResults.map((s) => (
                <button
                  key={s.code}
                  onMouseDown={() => handleSelectStock(s)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[var(--text-tertiary)]">
                      {s.code}
                    </span>
                    <span className="text-[12px] text-[var(--text-primary)]">
                      {s.name}
                    </span>
                  </div>
                  {s.price !== undefined && (
                    <span
                      className={cn(
                        "text-[11px] font-mono",
                        s.change !== undefined ? pct(s.change) : "",
                      )}
                    >
                      {s.price.toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedStock && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#3b82f6]/10 border border-[#3b82f6]/30">
            <span className="text-[10px] text-[#3b82f6] font-medium">
              {selectedStock.name}
            </span>
            {stockBoards.length === 0 && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                · 未找到所属板块
              </span>
            )}
            {stockBoards.length > 1 && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                · 点击板块查看成分股
              </span>
            )}
          </div>
        )}

        <button
          onClick={() => setShowRotation(true)}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors border border-[var(--border-color)] hover:border-[var(--accent)]/50 px-2.5 py-1 rounded-md"
        >
          <BarChart2 size={13} />
          板块轮动
        </button>

        <button
          onClick={() => setShowLiveFlow(true)}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[#e84444] transition-colors border border-[var(--border-color)] hover:border-[#e84444]/50 px-2.5 py-1 rounded-md"
        >
          <Activity size={13} />
          实时流向
        </button>

        <button
          onClick={() => setShowFundFlow(true)}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[#e84444] transition-colors border border-[var(--border-color)] hover:border-[#e84444]/50 px-2.5 py-1 rounded-md"
        >
          <TrendingUp size={13} />
          资金流向
        </button>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyIndustryBoards}
            onChange={(e) => setOnlyIndustryBoards(e.target.checked)}
            className="w-3 h-3 accent-[var(--accent)] cursor-pointer"
          />
          <span className="text-xs text-[var(--text-secondary)]">
            仅产业板块
          </span>
        </label>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
          {syncing ? "同步中..." : "刷新"}
        </button>
      </div>

      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
        <div
          ref={boardListScrollRef}
          className="border-b border-[var(--border-color)] overflow-auto flex-shrink-0"
          style={{ height: topHeight }}
          onScroll={handleBoardListScroll}
        >
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
              <tr>
                <td className="px-3 py-2 text-[var(--text-tertiary)] font-medium w-6 text-center">
                  #
                </td>
                {(onlyIndustryBoards ? BOARD_COLS_WITH_ACTION : BOARD_COLS).map(
                  (col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "px-3 py-2 text-left text-[var(--text-tertiary)] font-medium whitespace-nowrap select-none",
                        col.key === "action"
                          ? "text-center"
                          : "cursor-pointer hover:text-[var(--text-primary)]",
                      )}
                      onClick={() =>
                        col.key !== "action" && toggleSort(col.key as SortKey)
                      }
                    >
                      <span className="inline-flex items-center">
                        {col.label}
                        {col.key !== "action" && (
                          <SortIcon
                            col={col.key as SortKey}
                            active={sortKey}
                            order={sortOrder}
                          />
                        )}
                      </span>
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({
                      length:
                        (onlyIndustryBoards
                          ? BOARD_COLS_WITH_ACTION.length
                          : BOARD_COLS.length) + 1,
                    }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <div className="h-3 bg-[var(--bg-tertiary)] rounded animate-pulse w-16" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading && onlyIndustryBoards
                ? // ── 产业板块三层折叠模式 ──
                  listTree.map((l1) => {
                    const l1Open = listExpandedL1.has(l1.label);
                    const colSpan = BOARD_COLS_WITH_ACTION.length + 1;
                    return (
                      <React.Fragment key={`list-l1-${l1.label}`}>
                        {/* L1 大类行 */}
                        <tr
                          className="cursor-pointer select-none"
                          onClick={() => toggleListL1(l1.label)}
                        >
                          <td
                            className="px-2 py-1.5 text-center text-[var(--text-tertiary)] text-[10px]"
                            style={{
                              background: "var(--bg-tertiary)",
                              borderTop: "1px solid var(--border-color)",
                            }}
                          >
                            {l1Open ? "▾" : "▸"}
                          </td>
                          <td
                            className="px-3 py-1.5 font-bold text-[12px] text-[var(--text-primary)] whitespace-nowrap"
                            style={{
                              background: "var(--bg-tertiary)",
                              borderTop: "1px solid var(--border-color)",
                            }}
                            colSpan={1}
                          >
                            <span className="mr-1.5">{l1.icon}</span>
                            {l1.label}
                            <span className="ml-2 text-[10px] font-normal text-[var(--text-tertiary)]">
                              {l1.industries.length} 个产业
                            </span>
                          </td>
                          <td
                            className={cn(
                              "px-3 py-1.5 font-mono font-bold text-[12px]",
                              pct(l1.avgChangePct),
                            )}
                            style={{
                              background: "var(--bg-tertiary)",
                              borderTop: "1px solid var(--border-color)",
                            }}
                          >
                            {sgn(l1.avgChangePct)}
                            {l1.avgChangePct.toFixed(2)}%
                          </td>
                          {Array.from({ length: colSpan - 3 }).map((_, i) => (
                            <td
                              key={i}
                              style={{
                                background: "var(--bg-tertiary)",
                                borderTop: "1px solid var(--border-color)",
                              }}
                            />
                          ))}
                        </tr>
                        {l1Open &&
                          l1.industries.map((l2) => {
                            const l2Open = listExpandedL2.has(l2.industryId);
                            return (
                              <React.Fragment key={`list-l2-${l2.industryId}`}>
                                {/* L2 产业行 */}
                                <tr
                                  className="cursor-pointer select-none border-b border-[var(--border-color)]"
                                  onClick={() => toggleListL2(l2.industryId)}
                                >
                                  <td
                                    className="px-2 py-1 text-center text-[var(--text-tertiary)] text-[10px]"
                                    style={{
                                      background: "var(--bg-secondary)",
                                    }}
                                  >
                                    {l2Open ? "▾" : "▸"}
                                  </td>
                                  <td
                                    className="px-3 py-1 font-semibold text-[11px] whitespace-nowrap"
                                    style={{
                                      background: "var(--bg-secondary)",
                                    }}
                                    colSpan={1}
                                  >
                                    <span className="pl-4 text-[var(--text-primary)]">
                                      {INDUSTRY_DISPLAY[l2.industryId] ??
                                        l2.industryId}
                                    </span>
                                    <span className="ml-2 text-[10px] font-normal text-[var(--text-tertiary)]">
                                      {l2.layers.length} 层
                                    </span>
                                  </td>
                                  <td
                                    className={cn(
                                      "px-3 py-1 font-mono font-semibold text-[11px]",
                                      pct(l2.avgChangePct),
                                    )}
                                    style={{
                                      background: "var(--bg-secondary)",
                                    }}
                                  >
                                    {sgn(l2.avgChangePct)}
                                    {l2.avgChangePct.toFixed(2)}%
                                  </td>
                                  {Array.from({ length: colSpan - 3 }).map(
                                    (_, i) => (
                                      <td
                                        key={i}
                                        style={{
                                          background: "var(--bg-secondary)",
                                        }}
                                      />
                                    ),
                                  )}
                                </tr>
                                {l2Open &&
                                  l2.layers.map((l3) => {
                                    const l3Key = `${l2.industryId}_${l3.layer}`;
                                    const l3Open = listExpandedL3.has(l3Key);
                                    return (
                                      <React.Fragment key={`list-l3-${l3Key}`}>
                                        {/* L3 层级行 */}
                                        <tr
                                          className="cursor-pointer select-none border-b border-[var(--border-color)]"
                                          onClick={() => toggleListL3(l3Key)}
                                        >
                                          <td className="px-2 py-1 text-center text-[var(--text-tertiary)] text-[10px]">
                                            {l3Open ? "▾" : "▸"}
                                          </td>
                                          <td className="px-3 py-1 text-[10px] font-medium text-[var(--text-secondary)] whitespace-nowrap">
                                            <span className="pl-8">
                                              {LAYER_LABELS[l3.layer] ??
                                                l3.layer}
                                            </span>
                                            <span className="ml-2 text-[9px] text-[var(--text-tertiary)]">
                                              {l3.boards.length} 个板块
                                            </span>
                                          </td>
                                          <td
                                            className={cn(
                                              "px-3 py-1 font-mono text-[10px]",
                                              pct(l3.avgChangePct),
                                            )}
                                          >
                                            {sgn(l3.avgChangePct)}
                                            {l3.avgChangePct.toFixed(2)}%
                                          </td>
                                          {Array.from({
                                            length: colSpan - 3,
                                          }).map((_, i) => (
                                            <td key={i} />
                                          ))}
                                        </tr>
                                        {/* L3 展开后的具体板块行 */}
                                        {l3Open &&
                                          l3.boards.map((b) => {
                                            const isSelected =
                                              selectedBoard?.code === b.code;
                                            const industryInfo =
                                              parseIndustryBoardCode(b.code);
                                            return (
                                              <tr
                                                key={b.code}
                                                onClick={() =>
                                                  fetchConstituents(b)
                                                }
                                                className={cn(
                                                  "cursor-pointer border-b border-[var(--border-color)] transition-colors",
                                                  isSelected
                                                    ? "bg-[var(--bg-hover)] border-l-2 border-l-[#e8a235]"
                                                    : "hover:bg-[var(--bg-hover)]",
                                                )}
                                              >
                                                <td className="px-3 py-1.5 text-center text-[var(--text-tertiary)] text-[10px]" />
                                                <td className="px-3 py-1.5 font-medium whitespace-nowrap">
                                                  <span className="pl-12">
                                                    {industryInfo ? (
                                                      <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          window.open(
                                                            `/industry/${industryInfo.industryId}?tab=chain&layer=${industryInfo.layer}`,
                                                            "_blank",
                                                          );
                                                        }}
                                                        className="text-[#3b82f6] hover:underline transition-colors text-[11px]"
                                                      >
                                                        {b.name}
                                                      </button>
                                                    ) : (
                                                      <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          saveSwPageState({
                                                            scrollTop:
                                                              boardListScrollRef
                                                                .current
                                                                ?.scrollTop ??
                                                              0,
                                                          });
                                                          router.push(
                                                            `/sw/${b.code}?bn=${encodeURIComponent(b.name)}`,
                                                          );
                                                        }}
                                                        className="text-[#3b82f6] hover:underline transition-colors text-[11px]"
                                                      >
                                                        {b.name}
                                                      </button>
                                                    )}
                                                  </span>
                                                  <span className="ml-1.5 text-[9px] text-[var(--text-tertiary)]">
                                                    {b.code}
                                                  </span>
                                                </td>
                                                <td
                                                  className={cn(
                                                    "px-3 py-1.5 font-mono font-semibold",
                                                    pct(b.changePct),
                                                  )}
                                                >
                                                  {sgn(b.changePct)}
                                                  {fmt(b.changePct)}%
                                                </td>
                                                <td className="px-3 py-1.5 font-mono text-[var(--text-primary)]">
                                                  {fmt(b.price, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                                                  {fmtNum(b.turnover)}
                                                </td>
                                                <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                                                  {fmtNum(b.volume)}
                                                </td>
                                                <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                                                  {fmt(b.peTtm, 1)}
                                                </td>
                                                <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                                                  {fmt(b.pb, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-[var(--text-secondary)] text-center">
                                                  {b.compCount || "--"}
                                                </td>
                                                <td className="px-3 py-1.5 text-center">
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleDeleteBoard(
                                                        b.code,
                                                        b.name,
                                                      );
                                                    }}
                                                    disabled={
                                                      deletingBoard === b.code
                                                    }
                                                    className={cn(
                                                      "p-1 rounded hover:bg-red-500/10 transition-colors",
                                                      deletingBoard === b.code
                                                        ? "opacity-50 cursor-not-allowed"
                                                        : "text-[var(--text-tertiary)] hover:text-red-500",
                                                    )}
                                                    title="删除板块"
                                                  >
                                                    <Trash2 size={14} />
                                                  </button>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                      </React.Fragment>
                                    );
                                  })}
                              </React.Fragment>
                            );
                          })}
                      </React.Fragment>
                    );
                  })
                : // ── 平铺模式（申万 / 非产业模式）──
                  !loading &&
                  filteredBoards.map((b, idx) => {
                    const isSelected = selectedBoard?.code === b.code;
                    const isStockBoard = stockBoards.some(
                      (sb) => sb.code === b.code,
                    );
                    return (
                      <tr
                        key={b.code}
                        onClick={() => fetchConstituents(b)}
                        className={cn(
                          "cursor-pointer border-b border-[var(--border-color)] transition-colors",
                          isSelected
                            ? "bg-[var(--bg-hover)] border-l-2 border-l-[#e8a235]"
                            : isStockBoard
                              ? "bg-[#3b82f6]/5 border-l-2 border-l-[#3b82f6]"
                              : "hover:bg-[var(--bg-hover)]",
                        )}
                      >
                        <td className="px-3 py-1.5 text-center text-[var(--text-tertiary)]">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-1.5 font-medium whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // 保存当前状态，传递板块名称给详情页
                              saveSwPageState({
                                scrollTop:
                                  boardListScrollRef.current?.scrollTop ?? 0,
                              });
                              router.push(
                                `/sw/${b.code}?bn=${encodeURIComponent(b.name)}`,
                              );
                            }}
                            className="text-[#3b82f6] hover:underline transition-colors"
                          >
                            {b.name}
                          </button>
                          <span className="ml-1.5 text-[10px] text-[var(--text-tertiary)]">
                            {b.code}
                          </span>
                        </td>
                        <td
                          className={cn(
                            "px-3 py-1.5 font-mono font-semibold",
                            pct(b.changePct),
                          )}
                        >
                          {sgn(b.changePct)}
                          {fmt(b.changePct)}%
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[var(--text-primary)]">
                          {fmt(b.price, 2)}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                          {fmtNum(b.turnover)}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                          {fmtNum(b.volume)}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                          {fmt(b.peTtm, 1)}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                          {fmt(b.pb, 2)}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)] text-center">
                          {b.compCount || "--"}
                        </td>
                        {onlyIndustryBoards && (
                          <td className="px-3 py-1.5 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteBoard(b.code, b.name);
                              }}
                              disabled={deletingBoard === b.code}
                              className={cn(
                                "p-1 rounded hover:bg-red-500/10 transition-colors",
                                deletingBoard === b.code
                                  ? "opacity-50 cursor-not-allowed"
                                  : "text-[var(--text-tertiary)] hover:text-red-500",
                              )}
                              title="删除板块"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        <div
          onMouseDown={onResizerMouseDown}
          className="h-1 flex-shrink-0 bg-[var(--border-color)] hover:bg-[#3b82f6]/60 cursor-row-resize transition-colors group relative"
        >
          <div className="absolute inset-x-0 -top-1 -bottom-1" />
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-color)] flex-shrink-0 bg-[var(--bg-secondary)]">
            {selectedBoard ? (
              <>
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {selectedBoard.name}
                </span>
                <span
                  className={cn(
                    "text-[12px] font-mono font-semibold",
                    pct(selectedBoard.changePct),
                  )}
                >
                  {sgn(selectedBoard.changePct)}
                  {fmt(selectedBoard.changePct)}%
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  · 成分股 {constituents.length} 只
                </span>
              </>
            ) : (
              <span className="text-xs text-[var(--text-tertiary)]">
                {selectedStock && stockBoards.length > 1
                  ? `${selectedStock.name} 属于 ${stockBoards.map((b) => b.name).join("、")} 等 ${stockBoards.length} 个板块，点击上方板块查看成分股`
                  : "点击上方板块查看成分股"}
              </span>
            )}
          </div>

          {!selectedBoard && (
            <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)] text-sm">
              {selectedStock && stockBoards.length > 1
                ? `${selectedStock.name} 属于多个板块，请点击上方板块查看成分股详情`
                : "点击上方任意板块查看成分股详情"}
            </div>
          )}

          {selectedBoard && (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
                  <tr>
                    <td className="px-3 py-2 text-[var(--text-tertiary)] w-6 text-center">
                      #
                    </td>
                    {CON_COLS.map((col) => (
                      <th
                        key={col.key}
                        className="px-3 py-2 text-left text-[var(--text-tertiary)] font-medium cursor-pointer hover:text-[var(--text-primary)] whitespace-nowrap select-none"
                        onClick={() => toggleConSort(col.key)}
                      >
                        <span className="inline-flex items-center">
                          {col.label}
                          <SortIcon
                            col={col.key}
                            active={consSortKey}
                            order={consSortOrder}
                          />
                        </span>
                      </th>
                    ))}
                    <td className="px-3 py-2 text-[var(--text-tertiary)]">
                      操作
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {consLoading &&
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: CON_COLS.length + 2 }).map(
                          (_, j) => (
                            <td key={j} className="px-3 py-2">
                              <div className="h-3 bg-[var(--bg-tertiary)] rounded animate-pulse w-14" />
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  {!consLoading &&
                    sortedCons.map((s, idx) => {
                      const isSearchedStock = selectedStock?.code === s.code;
                      const isHighlighted = highlightStockCode === s.code;
                      // 构建跳转到个股详情的 URL，携带来源（板块列表页+当前板块）
                      const stockDetailUrl = selectedBoard
                        ? `/stock/${s.code}?src=sw_list&bc=${encodeURIComponent(selectedBoard.code)}&bn=${encodeURIComponent(selectedBoard.name)}`
                        : `/stock/${s.code}?src=sw_list`;
                      return (
                        <tr
                          key={s.code}
                          ref={isHighlighted ? highlightRowRef : undefined}
                          className={cn(
                            "border-b border-[var(--border-color)] transition-colors",
                            isHighlighted
                              ? "bg-[var(--accent)]/10 border-l-2 border-l-[var(--accent)]"
                              : isSearchedStock
                                ? "bg-[#3b82f6]/10 border-l-2 border-l-[#3b82f6]"
                                : "hover:bg-[var(--bg-hover)]",
                          )}
                        >
                          <td className="px-3 py-1.5 text-center text-[var(--text-tertiary)]">
                            {idx + 1}
                          </td>
                          <td
                            className="px-3 py-1.5 cursor-pointer"
                            onClick={() => router.push(stockDetailUrl)}
                          >
                            <div
                              className={cn(
                                "font-medium hover:underline",
                                isHighlighted
                                  ? "text-[var(--accent)]"
                                  : isSearchedStock
                                    ? "text-[#3b82f6]"
                                    : "text-[var(--text-primary)]",
                              )}
                            >
                              {s.name}
                            </div>
                            <div className="text-[10px] text-[var(--text-tertiary)]">
                              {s.code}
                            </div>
                          </td>
                          <td
                            className={cn(
                              "px-3 py-1.5 font-mono font-semibold",
                              pct(s.changePct),
                            )}
                          >
                            {sgn(s.changePct)}
                            {fmt(s.changePct)}%
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[var(--text-primary)]">
                            {fmt(s.price)}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                            {fmtNum(s.turnover)}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                            {fmtNum(s.marketCap)}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                            {fmt(s.pe, 1)}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                            {fmt(s.pb, 2)}
                          </td>
                          <td className="px-3 py-1.5">
                            <button
                              onClick={() => {
                                const url = selectedBoard
                                  ? `/stock/${s.code}?src=sw_list&bc=${encodeURIComponent(selectedBoard.code)}&bn=${encodeURIComponent(selectedBoard.name)}`
                                  : `/stock/${s.code}?src=sw_list`;
                                router.push(url);
                              }}
                              className="text-[10px] text-[#3b82f6] hover:underline whitespace-nowrap"
                            >
                              详情
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showRotation && <RotationModal onClose={() => setShowRotation(false)} />}
      {showFundFlow && <FundFlowModal onClose={() => setShowFundFlow(false)} />}
      {showLiveFlow && <LiveFlowModal onClose={() => setShowLiveFlow(false)} />}
    </div>
  );
}
