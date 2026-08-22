"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Zap,
  BarChart2,
  Activity,
  Target,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Star,
  Layers,
  LineChart,
  BarChart,
  Eye,
  X,
  AlertCircle,
  CheckCircle2,
  Info,
  ArrowUpRight,
  Loader2,
  Sparkles,
  Search,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

interface StrategyDef {
  id: string;
  name: string;
  category: string;
  description: string;
  signals: string[];
  entryNote: string;
  riskNote: string;
}

interface StrategyResult {
  strategyId: string;
  strategyName: string;
  columns: string[];
  rows: string[][];
  total: number;
  colIdx: Record<string, number>;
}

interface StockScore {
  code: string;
  name: string;
  price: number;
  change: number;
  industryBoard: string;
  entryPoint: string;
  totalScore: number;
  scores: Record<string, number>; // strategyId -> total_score in that strategy
  scoreDetails: Record<string, Record<string, number>>; // strategyId -> {dim -> score}
  hitStrategies: string[]; // 命中的策略ID列表
  rawRows: Record<string, string[]>; // strategyId -> raw row
  rawCols: Record<string, string[]>; // strategyId -> columns
  // 风控字段
  riskPenalty: number; // 风控总扣分（0-60）
  limitUp15d: number; // 近15日涨停次数
  riseFromLow: number; // 距近期低点涨幅%
  // 趋势风控
  bearishMaCount: number; // 空头排列均线数（0-4）
  priceBelowMaCount: number; // 价格在均线下方数（0-3）
  trendPenalty: number; // 趋势下跌扣分
  trendDesc: string; // 趋势风控说明
  // 历史高位风控
  pricePercentile: number; // 250日价格百分位（0-100）
  pctVs250High: number; // 距250日最高点偏离%
  highPosPenalty: number; // 高位惩罚分
  riskLevel: "low" | "medium" | "high"; // 综合风险等级
}

// ─── 诊断类型 ─────────────────────────────────────────────────────────────────

interface DiagnoseItem {
  label: string;
  actual: string;
  required: string;
  pass: boolean;
  desc?: string;
}

interface DiagnoseResult {
  code: string;
  name: string;
  price: number;
  change: number;
  industryBoard: string;
  strategyId: string;
  strategyName: string;
  items: DiagnoseItem[];
  summary: string;
  failCount: number;
  passCount: number;
}

// ─── 分类图标 ─────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    color: string;
    bg: string;
  }
> = {
  自定义: {
    icon: Sparkles,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  趋势跟踪: {
    icon: TrendingUp,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  突破策略: { icon: Zap, color: "text-yellow-400", bg: "bg-yellow-400/10" },
  形态识别: {
    icon: BarChart2,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
  },
  量价关系: { icon: Activity, color: "text-blue-400", bg: "bg-blue-400/10" },
  技术指标: {
    icon: LineChart,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
  },
  多周期共振: { icon: Layers, color: "text-cyan-400", bg: "bg-cyan-400/10" },
  基本面: { icon: BarChart, color: "text-pink-400", bg: "bg-pink-400/10" },
  事件驱动: { icon: Target, color: "text-red-400", bg: "bg-red-400/10" },
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function fmtPct(v: number) {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

function scoreBar(score: number, max = 100) {
  const pct = Math.min(100, (score / max) * 100);
  let color = "bg-red-500";
  if (pct >= 80) color = "bg-emerald-500";
  else if (pct >= 60) color = "bg-yellow-500";
  else if (pct >= 40) color = "bg-orange-500";
  return { pct, color };
}

// 维度名称映射
const DIM_NAMES: Record<string, string> = {
  trend_score: "趋势",
  volume_score: "量能",
  price_pos_score: "价格位置",
  momentum_score: "动量",
  breakout_score: "突破力度",
  position_score: "位置",
  reversal_score: "反转信号",
  ma_score: "均线",
  shrink_score: "量能收缩",
  ma_order_score: "均线排列",
  daily_score: "日线",
  weekly_score: "周线",
  monthly_score: "月线",
  resonance_score: "共振",
  new_high_score: "新高突破",
  yang_score: "阳线形态",
  rsi_score: "RSI",
  support_score: "支撑位",
  candle_score: "K线形态",
  roe_score: "ROE",
  growth_score: "成长性",
  valuation_score: "估值",
  tech_score: "技术面",
  limit_up_score: "涨停次数",
  pullback_score: "回调质量",
  adj_range_score: "调整幅度",
  strength_score: "强势度",
  pullback_pos_score: "回调位置",
  pullback_range_score: "回调幅度",
  macd_score: "MACD金叉",
  bar_score: "柱状图",
  zero_axis_score: "零轴位置",
  // 资金异动策略维度
  low_score: "低位横盘",
  stable_score: "企稳信号",
  sector_score: "板块共振",
  report_board_score: "报告板块",
  report_stock_score: "报告龙头",
};

// ─── 个股诊断弹窗 ─────────────────────────────────────────────────────────────

function DiagnoseModal({
  result,
  onClose,
}: {
  result: DiagnoseResult;
  onClose: () => void;
}) {
  const router = useRouter();
  const passCount = result.passCount;
  const failCount = result.failCount;
  const total = passCount + failCount;
  const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg flex flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl overflow-hidden max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-5 border-b border-[var(--border-color)] shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Search size={14} className="text-[var(--accent)]" />
                <span className="text-xs font-medium text-[var(--text-tertiary)]">
                  策略诊断分析
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-base font-bold text-[var(--text-primary)]">
                  {result.name}
                </span>
                <span className="text-xs font-mono text-[var(--text-tertiary)]">
                  {result.code}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    result.change > 0
                      ? "text-[var(--color-up)]"
                      : result.change < 0
                        ? "text-[var(--color-down)]"
                        : "text-[var(--text-tertiary)]",
                  )}
                >
                  {result.change >= 0 ? "+" : ""}
                  {result.change.toFixed(2)}%
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded-full">
                  {result.industryBoard}
                </span>
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-secondary)]">
                策略：
                <span className="font-medium text-[var(--accent)]">
                  {result.strategyName}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.open(`/stock/${result.code}`, "_blank")}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[#f5a623] text-black rounded-lg font-medium hover:bg-[#e09510] transition-colors"
              >
                <ArrowUpRight size={11} />
                详情
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 通过率条 */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  passRate >= 80
                    ? "bg-emerald-500"
                    : passRate >= 50
                      ? "bg-yellow-500"
                      : "bg-red-500",
                )}
                style={{ width: `${passRate}%` }}
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 size={11} />
                {passCount} 项达标
              </span>
              {failCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <XCircle size={11} />
                  {failCount} 项不满足
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 综合总结 */}
        <div
          className={cn(
            "mx-6 mt-4 p-3 rounded-xl border shrink-0 text-xs leading-relaxed",
            failCount === 0
              ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
              : failCount <= 2
                ? "bg-yellow-500/5 border-yellow-500/20 text-yellow-400"
                : "bg-red-500/5 border-red-500/20 text-red-400",
          )}
        >
          {result.summary}
        </div>

        {/* 条件列表 */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 mt-4 space-y-2">
          {result.items.map((item, i) => (
            <div
              key={i}
              className={cn(
                "p-3 rounded-xl border",
                item.pass
                  ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                  : "border-red-500/20 bg-red-500/[0.04]",
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 mt-0.5">
                  {item.pass ? (
                    <CheckCircle2 size={13} className="text-emerald-400" />
                  ) : (
                    <XCircle size={13} className="text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        item.pass
                          ? "text-emerald-400"
                          : "text-[var(--text-primary)]",
                      )}
                    >
                      {item.label}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-mono shrink-0",
                        item.pass
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400",
                      )}
                    >
                      {item.pass ? "✓ 满足" : "✗ 不满足"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-[var(--text-tertiary)] shrink-0">
                        当前值：
                      </span>
                      <span
                        className={cn(
                          "font-mono",
                          item.pass ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        {item.actual}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-[var(--text-tertiary)] shrink-0">
                        要求：
                      </span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {item.required}
                      </span>
                    </div>
                    {item.desc && !item.pass && (
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
                        {item.desc}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 策略详情弹窗 ──────────────────────────────────────────────────────────────

function StrategyDetailModal({
  strategy,
  onClose,
}: {
  strategy: StrategyDef;
  onClose: () => void;
}) {
  const cfg = CATEGORY_CONFIG[strategy.category] ?? CATEGORY_CONFIG["技术指标"];
  const Icon = cfg.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg flex flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className={cn("px-6 py-5 border-b border-[var(--border-color)]")}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn("p-2.5 rounded-xl", cfg.bg)}>
                <Icon size={18} className={cfg.color} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {strategy.name}
                </h3>
                <span
                  className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block",
                    cfg.bg,
                    cfg.color,
                  )}
                >
                  {strategy.category}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
            {strategy.description}
          </p>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">
          {/* 选股信号 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                选股信号
              </span>
            </div>
            <div className="space-y-2">
              {strategy.signals.map((signal, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-emerald-400/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm text-[var(--text-secondary)]">
                    {signal}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 买入点 */}
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Target size={13} className="text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">
                买入时机
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {strategy.entryNote}
            </p>
          </div>

          {/* 风险提示 */}
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={13} className="text-red-400" />
              <span className="text-xs font-semibold text-red-400">
                风险提示
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {strategy.riskNote}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 个股评分详情弹窗 ────────────────────────────────────────────────────────

function StockDetailModal({
  stock,
  strategies,
  onClose,
}: {
  stock: StockScore;
  strategies: StrategyDef[];
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-2xl flex flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl overflow-hidden max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-5 border-b border-[var(--border-color)] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-[var(--text-primary)]">
                    {stock.name}
                  </span>
                  <span className="text-sm font-mono text-[var(--text-tertiary)]">
                    {stock.code}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xl font-bold text-[var(--text-primary)]">
                    ¥{stock.price.toFixed(2)}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      stock.change > 0
                        ? "text-[var(--color-up)]"
                        : stock.change < 0
                          ? "text-[var(--color-down)]"
                          : "text-[var(--text-tertiary)]",
                    )}
                  >
                    {fmtPct(stock.change)}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full">
                    {stock.industryBoard}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.open(`/stock/${stock.code}`, "_blank")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#f5a623] text-black rounded-lg font-medium hover:bg-[#e09510] transition-colors"
              >
                <ArrowUpRight size={12} />
                详情
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 综合评分 */}
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-tertiary)]">
                综合评分
              </span>
              <span
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  scoreColor(stock.totalScore),
                )}
              >
                {stock.totalScore}
              </span>
            </div>
            <div className="flex-1 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  scoreBar(stock.totalScore).color,
                )}
                style={{ width: `${scoreBar(stock.totalScore).pct}%` }}
              />
            </div>
            <span className="text-xs text-[var(--text-tertiary)]">
              命中 {stock.hitStrategies.length} 个策略
            </span>
          </div>
        </div>

        {/* 买入建议 */}
        <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 shrink-0">
          <div className="flex items-center gap-2">
            <Target size={12} className="text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-400">
              买入建议
            </span>
            <span className="text-xs text-[var(--text-secondary)]">
              {stock.entryPoint}
            </span>
          </div>
        </div>

        {/* 风控提示（如有） */}
        {stock.riskPenalty > 0 && (
          <div
            className={cn(
              "mx-6 mt-3 p-3 rounded-xl border shrink-0 space-y-2",
              stock.riskLevel === "high"
                ? "bg-red-500/5 border-red-500/20"
                : "bg-orange-500/5 border-orange-500/20",
            )}
          >
            <div className="flex items-center gap-2">
              <AlertCircle
                size={12}
                className={
                  stock.riskLevel === "high"
                    ? "text-red-400"
                    : "text-orange-400"
                }
              />
              <span
                className={cn(
                  "text-xs font-semibold",
                  stock.riskLevel === "high"
                    ? "text-red-400"
                    : "text-orange-400",
                )}
              >
                风控预警（综合分已扣 {stock.riskPenalty} 分）
              </span>
            </div>

            {/* 高位连板行 */}
            {stock.limitUp15d >= 1 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 pl-5">
                <span className="text-xs text-[var(--text-secondary)]">
                  📈 近15日涨停{" "}
                  <span className="font-bold text-orange-400">
                    {stock.limitUp15d}
                  </span>{" "}
                  次
                </span>
                {stock.riseFromLow >= 20 && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    距近期低点涨{" "}
                    <span className="font-bold text-red-400">
                      +{stock.riseFromLow.toFixed(0)}%
                    </span>
                  </span>
                )}
                {stock.riskLevel === "high" && stock.limitUp15d >= 3 && (
                  <span className="text-xs text-red-400">
                    高位追板风险极大，建议观望
                  </span>
                )}
              </div>
            )}

            {/* 趋势下跌 + 高位风控行 */}
            {stock.trendPenalty > 0 && stock.trendDesc && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 pl-5">
                {stock.highPosPenalty > 0 && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    🏔 高位风控{" "}
                    <span className="font-bold text-orange-400">
                      -{stock.highPosPenalty}分
                    </span>
                    ：
                    {stock.pricePercentile >= 75 && (
                      <span>
                        250日分位{" "}
                        <span className="font-bold text-red-400">
                          {stock.pricePercentile.toFixed(0)}%
                        </span>
                      </span>
                    )}
                    {stock.pctVs250High >= -8 && (
                      <span className="ml-2">
                        距年高点{" "}
                        <span
                          className={cn(
                            "font-bold",
                            stock.pctVs250High >= -3
                              ? "text-red-400"
                              : "text-orange-400",
                          )}
                        >
                          {stock.pctVs250High.toFixed(1)}%
                        </span>
                      </span>
                    )}
                  </span>
                )}
                {stock.trendPenalty - stock.highPosPenalty > 0 && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    📉 趋势风控{" "}
                    <span className="font-bold text-orange-400">
                      -{stock.trendPenalty - stock.highPosPenalty}分
                    </span>
                    {stock.trendDesc
                      .split(" · ")
                      .filter(
                        (d) =>
                          !d.includes("历史分位") &&
                          !d.includes("年度高点") &&
                          !d.includes("MA60"),
                      ).length > 0 && (
                      <span>
                        ：
                        {stock.trendDesc
                          .split(" · ")
                          .filter(
                            (d) =>
                              !d.includes("历史分位") &&
                              !d.includes("年度高点") &&
                              !d.includes("MA60达") &&
                              !d.includes("偏离MA60"),
                          )
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* 策略评分详情 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
            各策略评分详情
          </div>
          {stock.hitStrategies.map((sid) => {
            const strategy = strategies.find((s) => s.id === sid);
            if (!strategy) return null;
            const cfg =
              CATEGORY_CONFIG[strategy.category] ?? CATEGORY_CONFIG["技术指标"];
            const Icon = cfg.icon;
            const totalScore = stock.scores[sid] ?? 0;
            const dims = stock.scoreDetails[sid] ?? {};
            const rawRow = stock.rawRows[sid] ?? [];
            const rawCols = stock.rawCols[sid] ?? [];

            return (
              <div
                key={sid}
                className="border border-[var(--border-color)] rounded-xl overflow-hidden"
              >
                {/* 策略头部 */}
                <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-secondary)]">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg", cfg.bg)}>
                      <Icon size={12} className={cfg.color} />
                    </div>
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {strategy.name}
                    </span>
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded-full",
                        cfg.bg,
                        cfg.color,
                      )}
                    >
                      {strategy.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-lg font-bold tabular-nums",
                        scoreColor(totalScore),
                      )}
                    >
                      {totalScore}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      / 100
                    </span>
                  </div>
                </div>

                {/* 维度评分 */}
                <div className="p-4 space-y-2">
                  {Object.entries(dims).map(([dim, score]) => {
                    const dimName = DIM_NAMES[dim] ?? dim;
                    const bar = scoreBar(score, 40);
                    return (
                      <div key={dim} className="flex items-center gap-3">
                        <span className="text-xs text-[var(--text-tertiary)] w-20 shrink-0 text-right">
                          {dimName}
                        </span>
                        <div className="flex-1 h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", bar.color)}
                            style={{ width: `${bar.pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium tabular-nums w-6 text-right text-[var(--text-secondary)]">
                          {score}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 关键指标数据 */}
                <div className="px-4 pb-4 flex flex-wrap gap-x-4 gap-y-1">
                  {rawCols.map((col, i) => {
                    if (
                      [
                        "code",
                        "name",
                        "industry_board",
                        "entry_point",
                      ].includes(col)
                    )
                      return null;
                    if (col.endsWith("_score") || col === "total_score")
                      return null;
                    const val = rawRow[i];
                    if (!val || val === "") return null;
                    const label = DIM_NAMES[col] ?? col;
                    return (
                      <div key={col} className="flex items-center gap-1">
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          {label}:
                        </span>
                        <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                          {val}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── 策略运行状态类型 ──────────────────────────────────────────────────────────

type StrategyRunStatus = "idle" | "pending" | "running" | "done" | "error";

interface StrategyRunState {
  status: StrategyRunStatus;
  total: number;
  errorMsg?: string;
  startedAt?: number;
  doneAt?: number;
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function ScreenerPanel() {
  const [strategies, setStrategies] = useState<StrategyDef[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<Set<string>>(
    new Set(),
  );
  const [isRunning, setIsRunning] = useState(false);
  // 每个策略独立的运行状态（包含结果数）
  const [strategyStatus, setStrategyStatus] = useState<
    Record<string, StrategyRunState>
  >({});
  const [mergedStocks, setMergedStocks] = useState<StockScore[]>([]);
  const [detailStrategy, setDetailStrategy] = useState<StrategyDef | null>(
    null,
  );
  const [detailStock, setDetailStock] = useState<StockScore | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<Set<string>>(
    new Set(),
  );
  const [filterStrategyId, setFilterStrategyId] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"score" | "hits" | "change">("score");
  const [progressCollapsed, setProgressCollapsed] = useState(false);
  // 盘面报告上下文（capital_surge 策略扫描时从 SSE 接收）
  const [reportCtx, setReportCtx] = useState<{
    hasReport: boolean;
    sessionTitle?: string;
    reportDate?: string;
    hotBoards?: string[];
    leadingStocks?: string[];
    topPickStocks?: string[];
    outflowBoards?: string[];
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 用 ref 缓存最新 results，避免 mergeResults 闭包问题
  const resultsRef = useRef<Map<string, StrategyResult>>(new Map());
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 风控数据：code -> {limit_up_15d, limit_up_5d, rise_from_low_20d, ...trend fields}
  const riskMapRef = useRef<
    Record<
      string,
      {
        limit_up_15d: number;
        limit_up_5d: number;
        rise_from_low_20d: number;
        today_change: number;
        bearish_ma_count: number;
        price_below_ma_count: number;
        ma20_turning_up: number;
        ma60_turning_up: number;
        ma120_turning_up: number;
        volume_shrinking: number;
        pct_vs_ma60: number;
        pct_vs_250high: number;
        pct_vs_60high: number;
        price_percentile_250d: number;
      }
    >
  >({});

  // ── 诊断分析 state ──────────────────────────────────────────────────────────
  const [diagnoseCode, setDiagnoseCode] = useState(""); // 已选中的股票代码
  const [diagnoseStockName, setDiagnoseStockName] = useState(""); // 已选中的股票名称
  const [diagnoseQuery, setDiagnoseQuery] = useState(""); // 搜索框文字
  const [diagnoseSearchResults, setDiagnoseSearchResults] = useState<
    { code: string; name: string; price?: number; change?: number }[]
  >([]);
  const [diagnoseSearchOpen, setDiagnoseSearchOpen] = useState(false);
  const [diagnoseSearchLoading, setDiagnoseSearchLoading] = useState(false);
  const [diagnoseStrategyId, setDiagnoseStrategyId] = useState("");
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<DiagnoseResult | null>(
    null,
  );
  const [diagnoseError, setDiagnoseError] = useState<string | null>(null);
  const diagnoseSearchRef = useRef<HTMLDivElement>(null);
  const diagnoseSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        diagnoseSearchRef.current &&
        !diagnoseSearchRef.current.contains(e.target as Node)
      ) {
        setDiagnoseSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 防抖搜索
  const handleDiagnoseQueryChange = useCallback((q: string) => {
    setDiagnoseQuery(q);
    // 有变动则清除已选中的股票
    setDiagnoseCode("");
    setDiagnoseStockName("");
    if (diagnoseSearchTimerRef.current)
      clearTimeout(diagnoseSearchTimerRef.current);
    if (!q.trim()) {
      setDiagnoseSearchResults([]);
      setDiagnoseSearchOpen(false);
      return;
    }
    diagnoseSearchTimerRef.current = setTimeout(async () => {
      setDiagnoseSearchLoading(true);
      try {
        const res = await fetch(
          `/api/stock/search?q=${encodeURIComponent(q.trim())}`,
        );
        if (res.ok) {
          const data = await res.json();
          const results = (data.results ?? []) as {
            code: string;
            name: string;
            price?: number;
            change?: number;
          }[];
          setDiagnoseSearchResults(results.slice(0, 8));
          setDiagnoseSearchOpen(results.length > 0);
        }
      } catch {
        // ignore
      } finally {
        setDiagnoseSearchLoading(false);
      }
    }, 250);
  }, []);

  const runDiagnose = useCallback(async () => {
    const code = diagnoseCode.trim();
    if (!code || !diagnoseStrategyId) return;
    setDiagnoseLoading(true);
    setDiagnoseError(null);
    setDiagnoseResult(null);
    try {
      const res = await fetch("/api/agents/screener/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, strategyId: diagnoseStrategyId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDiagnoseError(data.error ?? "分析失败");
      } else {
        setDiagnoseResult(data as DiagnoseResult);
      }
    } catch (e) {
      setDiagnoseError((e as Error).message);
    } finally {
      setDiagnoseLoading(false);
    }
  }, [diagnoseCode, diagnoseStrategyId]);

  // 加载策略列表
  useEffect(() => {
    fetch("/api/agents/screener")
      .then((r) => r.json())
      .then((data: { strategies: StrategyDef[] }) => {
        setStrategies(data.strategies);
        // 默认选3个核心策略（快速体验）
        setSelectedStrategies(
          new Set(["ma_bullish", "breakout_high", "volume_price_surge"]),
        );
        // 默认展开所有分类
        setExpandedCategory(new Set(data.strategies.map((s) => s.category)));
      })
      .catch(console.error);
  }, []);

  // 按分类分组策略
  const categorizedStrategies = strategies.reduce(
    (acc, s) => {
      if (!acc[s.category]) acc[s.category] = [];
      acc[s.category].push(s);
      return acc;
    },
    {} as Record<string, StrategyDef[]>,
  );

  // 合并多策略结果（纯函数，不依赖 state）
  const mergeResults = useCallback(
    (newResults: Map<string, StrategyResult>) => {
      const stockMap = new Map<string, StockScore>();

      newResults.forEach((result, strategyId) => {
        const { columns, rows } = result;
        const colIdx = columns.reduce(
          (acc, c, i) => {
            acc[c] = i;
            return acc;
          },
          {} as Record<string, number>,
        );

        rows.forEach((row) => {
          const code = row[colIdx["code"]] ?? "";
          const name = row[colIdx["name"]] ?? "";
          const price = parseFloat(row[colIdx["price"]] ?? "0") || 0;
          const change = parseFloat(row[colIdx["change"]] ?? "0") || 0;
          const industryBoard = row[colIdx["industry_board"]] ?? "未分类";
          const entryPoint = row[colIdx["entry_point"]] ?? "";
          const totalScore = parseFloat(row[colIdx["total_score"]] ?? "0") || 0;

          // 提取各维度分数
          const dims: Record<string, number> = {};
          columns.forEach((col, i) => {
            if (col.endsWith("_score") && col !== "total_score") {
              dims[col] = parseFloat(row[i] ?? "0") || 0;
            }
          });

          if (!stockMap.has(code)) {
            stockMap.set(code, {
              code,
              name,
              price,
              change,
              industryBoard,
              entryPoint,
              totalScore: 0,
              scores: {},
              scoreDetails: {},
              hitStrategies: [],
              rawRows: {},
              rawCols: {},
              riskPenalty: 0,
              limitUp15d: 0,
              riseFromLow: 0,
              bearishMaCount: 0,
              priceBelowMaCount: 0,
              trendPenalty: 0,
              trendDesc: "",
              pricePercentile: 50,
              pctVs250High: -100,
              highPosPenalty: 0,
              riskLevel: "low",
            });
          }

          const existing = stockMap.get(code)!;
          existing.scores[strategyId] = totalScore;
          existing.scoreDetails[strategyId] = dims;
          existing.hitStrategies.push(strategyId);
          existing.rawRows[strategyId] = row;
          existing.rawCols[strategyId] = columns;
          existing.entryPoint = entryPoint || existing.entryPoint;
        });
      });

      // 计算综合评分 + 风控惩罚
      const riskMap = riskMapRef.current;
      const stocks: StockScore[] = [];
      stockMap.forEach((stock) => {
        const scoreValues = Object.values(stock.scores);
        if (scoreValues.length === 0) return;
        const maxScore = Math.max(...scoreValues);
        const avgScore =
          scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
        // 综合分 = 最高分*60% + 均分*30% + 命中数*3分 (满分100)
        const hitBonus = Math.min(stock.hitStrategies.length * 3, 15);
        const baseScore = Math.min(
          100,
          Math.round(maxScore * 0.6 + avgScore * 0.3 + hitBonus),
        );

        const risk = riskMap[stock.code];
        let hotPenalty = 0; // 高位连板惩罚
        let trendPenalty = 0; // 趋势下跌惩罚
        let limitUp15d = 0;
        let riseFromLow = 0;
        let bearishMaCount = 0;
        let priceBelowMaCount = 0;
        const trendDescs: string[] = [];

        if (risk) {
          limitUp15d = risk.limit_up_15d;
          riseFromLow = risk.rise_from_low_20d;
          bearishMaCount = risk.bearish_ma_count;
          priceBelowMaCount = risk.price_below_ma_count;

          // ── A. 高位连板/过热惩罚 ──────────────────────────────────────
          if (limitUp15d >= 7) hotPenalty += 40;
          else if (limitUp15d >= 5) hotPenalty += 28;
          else if (limitUp15d >= 3) hotPenalty += 15;
          else if (limitUp15d >= 1) hotPenalty += 5;

          if (riseFromLow >= 100) hotPenalty += 20;
          else if (riseFromLow >= 60) hotPenalty += 12;
          else if (riseFromLow >= 40) hotPenalty += 6;

          if (risk.limit_up_5d >= 3 && risk.today_change >= 9.9)
            hotPenalty += 8;
          hotPenalty = Math.min(hotPenalty, 50);

          // ── B. 多周期下跌趋势惩罚 ─────────────────────────────────────
          // 规则：空头排列数越多、价格越在均线下方、均线没有拐头、量能萎缩
          // 最多额外扣 35 分

          // B1. 均线空头排列（MA5<MA20、MA20<MA60、MA60<MA120、MA120<MA250）
          // 每层多头=0分，全空头4层=重扣
          if (bearishMaCount >= 4) {
            trendPenalty += 20;
            trendDescs.push("四层空头排列");
          } else if (bearishMaCount === 3) {
            trendPenalty += 12;
            trendDescs.push("三层空头排列");
          } else if (bearishMaCount === 2) {
            trendPenalty += 6;
            trendDescs.push("双层空头排列");
          }

          // B2. 价格在中长期均线下方（收盘 < MA20/MA60/MA120）
          if (priceBelowMaCount >= 3) {
            trendPenalty += 10;
            trendDescs.push("价格跌破三重均线");
          } else if (priceBelowMaCount === 2) {
            trendPenalty += 5;
            trendDescs.push("价格跌破双均线");
          }

          // B3. 均线斜率全部向下（月线+季线+半年线均未拐头）→ 无企稳迹象
          const turningCount =
            risk.ma20_turning_up + risk.ma60_turning_up + risk.ma120_turning_up;
          if (turningCount === 0 && bearishMaCount >= 2) {
            trendPenalty += 8;
            trendDescs.push("月季半年线均未拐头");
          } else if (turningCount <= 1 && bearishMaCount >= 3) {
            trendPenalty += 4;
            trendDescs.push("长期趋势未企稳");
          }

          // B4. 量能萎缩（无买盘介入）
          if (risk.volume_shrinking === 1 && bearishMaCount >= 2) {
            trendPenalty += 5;
            trendDescs.push("成交量持续萎缩");
          }

          // B5. 跌幅过深（价格远低于MA60）
          if (risk.pct_vs_ma60 < -20) {
            trendPenalty += 5;
            trendDescs.push(
              `深跌MA60下方${Math.abs(risk.pct_vs_ma60).toFixed(0)}%`,
            );
          }

          trendPenalty = Math.min(trendPenalty, 35);
        }

        // ── C. 历史高位惩罚（价格接近或超越近一年高点）────────────────────
        // 逻辑：技术面再好，若价格已在历史高位，上方空间有限、回调风险大
        let highPosPenalty = 0;
        const highPosDescs: string[] = [];
        let pricePercentile = 50;
        let pctVs250High = -100;

        if (risk) {
          pricePercentile = risk.price_percentile_250d;
          pctVs250High = risk.pct_vs_250high;

          // C1. 价格在250日高位区间（百分位 >= 85%）
          if (pricePercentile >= 95) {
            highPosPenalty += 18;
            highPosDescs.push(`历史分位${pricePercentile.toFixed(0)}%极高`);
          } else if (pricePercentile >= 85) {
            highPosPenalty += 10;
            highPosDescs.push(`历史分位${pricePercentile.toFixed(0)}%偏高`);
          } else if (pricePercentile >= 75) {
            highPosPenalty += 4;
            highPosDescs.push(`历史分位${pricePercentile.toFixed(0)}%`);
          }

          // C2. 价格贴近250日最高点（在高点5%以内，阻力极大）
          if (pctVs250High >= -3) {
            highPosPenalty += 10;
            highPosDescs.push("紧贴年度高点阻力");
          } else if (pctVs250High >= -8) {
            highPosPenalty += 5;
            highPosDescs.push("接近年度高点");
          }

          // C3. 距MA60偏离过大（MA60偏离>15%，涨幅透支，均值回归风险）
          if (risk.pct_vs_ma60 >= 20) {
            highPosPenalty += 8;
            highPosDescs.push(`超MA60达${risk.pct_vs_ma60.toFixed(0)}%`);
          } else if (risk.pct_vs_ma60 >= 12) {
            highPosPenalty += 4;
            highPosDescs.push(`偏离MA60 ${risk.pct_vs_ma60.toFixed(0)}%`);
          }

          highPosPenalty = Math.min(highPosPenalty, 25);
          if (highPosPenalty > 0 && highPosDescs.length > 0) {
            trendDescs.push(...highPosDescs);
          }
        }

        const totalPenalty = Math.min(
          hotPenalty + trendPenalty + highPosPenalty,
          60,
        );
        let riskLevel: "low" | "medium" | "high" = "low";
        if (totalPenalty >= 30 || hotPenalty >= 28) riskLevel = "high";
        else if (totalPenalty >= 12) riskLevel = "medium";

        stock.riskPenalty = totalPenalty;
        stock.limitUp15d = limitUp15d;
        stock.riseFromLow = riseFromLow;
        stock.bearishMaCount = bearishMaCount;
        stock.priceBelowMaCount = priceBelowMaCount;
        stock.trendPenalty = trendPenalty + highPosPenalty;
        stock.trendDesc = trendDescs.join(" · ");
        stock.pricePercentile = pricePercentile;
        stock.pctVs250High = pctVs250High;
        stock.highPosPenalty = highPosPenalty;
        stock.riskLevel = riskLevel;
        stock.totalScore = Math.max(0, baseScore - totalPenalty);
        stocks.push(stock);
      });

      return stocks.sort((a, b) => b.totalScore - a.totalScore);
    },
    [],
  );

  // 防抖触发合并，避免频繁重计算
  const scheduleMerge = useCallback(() => {
    if (mergeTimerRef.current) clearTimeout(mergeTimerRef.current);
    mergeTimerRef.current = setTimeout(() => {
      const merged = mergeResults(resultsRef.current);
      setMergedStocks(merged);
    }, 500);
  }, [mergeResults]);

  // 运行选股扫描
  const runScreener = async () => {
    if (isRunning) {
      abortRef.current?.abort();
      return;
    }

    const idsToRun = Array.from(selectedStrategies);
    if (idsToRun.length === 0) return;

    setIsRunning(true);
    resultsRef.current = new Map();
    riskMapRef.current = {}; // 重置风控数据
    setMergedStocks([]);
    setProgressCollapsed(false);
    setFilterStrategyId("all"); // 重置策略筛选
    setReportCtx(null); // 重置报告上下文

    // 初始化所有策略为 pending
    const initStatus: Record<string, StrategyRunState> = {};
    idsToRun.forEach((id) => {
      initStatus[id] = { status: "pending", total: 0 };
    });
    setStrategyStatus(initStatus);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agents/screener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyIds: idsToRun }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "strategy_start") {
              setStrategyStatus((prev) => ({
                ...prev,
                [event.strategyId]: {
                  status: "running",
                  total: 0,
                  startedAt: Date.now(),
                },
              }));
            } else if (event.type === "strategy_result") {
              // 更新 ref（同步）
              resultsRef.current = new Map(resultsRef.current).set(
                event.strategyId,
                event as StrategyResult,
              );
              // 一次性更新 strategyStatus（React 18 自动批处理）
              setStrategyStatus((prev) => ({
                ...prev,
                [event.strategyId]: {
                  status: "done",
                  total: event.total,
                  startedAt: prev[event.strategyId]?.startedAt,
                  doneAt: Date.now(),
                },
              }));
              // 防抖 300ms 后合并并更新列表
              scheduleMerge();
            } else if (event.type === "strategy_error") {
              setStrategyStatus((prev) => ({
                ...prev,
                [event.strategyId]: {
                  status: "error",
                  total: 0,
                  errorMsg: event.message,
                },
              }));
            } else if (event.type === "risk_data") {
              // 风控数据到达后立即更新 ref，并触发最终一次合并
              riskMapRef.current = event.riskMap as typeof riskMapRef.current;
              scheduleMerge();
            } else if (event.type === "report_context") {
              // 盘面报告上下文（capital_surge 动态 SQL 使用的报告信息）
              setReportCtx(event as typeof reportCtx);
            } else if (event.type === "done") {
              break;
            }
          } catch {
            // ignore parse error
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error("选股扫描出错:", e);
      }
    } finally {
      // 最后再做一次完整合并
      const merged = mergeResults(resultsRef.current);
      setMergedStocks(merged);
      setIsRunning(false);
      // 扫描完成后 1.5s 自动折叠进度面板
      setTimeout(() => setProgressCollapsed(true), 1500);
    }
  };

  // 过滤和排序推荐列表
  const filteredStocks = mergedStocks
    .filter((s) => {
      if (filterStrategyId === "all") return true;
      return s.hitStrategies.includes(filterStrategyId);
    })
    .sort((a, b) => {
      if (sortBy === "score") return b.totalScore - a.totalScore;
      if (sortBy === "hits")
        return b.hitStrategies.length - a.hitStrategies.length;
      if (sortBy === "change") return b.change - a.change;
      return 0;
    });

  // 已扫描并有结果的策略列表（用于筛选下拉）
  const scannedStrategies = strategies.filter(
    (s) => strategyStatus[s.id]?.status === "done",
  );

  const allCategories = Object.keys(categorizedStrategies).sort((a, b) => {
    if (a === "自定义") return -1;
    if (b === "自定义") return 1;
    return 0;
  });

  return (
    <div className="flex gap-6 h-full">
      {/* ── 左侧：策略库 ──────────────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col gap-4">
        {/* 策略库标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-[var(--accent)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              策略库
            </span>
            <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded-full">
              {strategies.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setSelectedStrategies(new Set(strategies.map((s) => s.id)))
              }
              className="text-[10px] text-[var(--accent)] hover:underline"
            >
              全选
            </button>
            <span className="text-[var(--text-tertiary)] text-[10px]">/</span>
            <button
              onClick={() => setSelectedStrategies(new Set())}
              className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              清空
            </button>
          </div>
        </div>

        {/* 策略分类列表 */}
        <div className="space-y-2 overflow-y-auto flex-1">
          {allCategories.map((category) => {
            const strats = categorizedStrategies[category];
            const cfg =
              CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG["技术指标"];
            const Icon = cfg.icon;
            const isExpanded = expandedCategory.has(category);
            const selectedCount = strats.filter((s) =>
              selectedStrategies.has(s.id),
            ).length;

            return (
              <div
                key={category}
                className={cn(
                  "border rounded-xl overflow-hidden",
                  category === "自定义"
                    ? "border-amber-400/40 shadow-sm shadow-amber-400/10"
                    : "border-[var(--border-color)]",
                )}
              >
                {/* 分类头 */}
                <button
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--bg-secondary)] transition-colors",
                    category === "自定义" && "bg-amber-400/5",
                  )}
                  onClick={() =>
                    setExpandedCategory((prev) => {
                      const next = new Set(prev);
                      if (next.has(category)) next.delete(category);
                      else next.add(category);
                      return next;
                    })
                  }
                >
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1 rounded-md", cfg.bg)}>
                      <Icon size={11} className={cfg.color} />
                    </div>
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {category}
                    </span>
                    {category === "自定义" && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-400 border border-amber-400/30">
                        我的
                      </span>
                    )}
                    <span className={cn("text-[10px] font-medium", cfg.color)}>
                      {selectedCount}/{strats.length}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown
                      size={12}
                      className="text-[var(--text-tertiary)]"
                    />
                  ) : (
                    <ChevronRight
                      size={12}
                      className="text-[var(--text-tertiary)]"
                    />
                  )}
                </button>

                {/* 策略列表 */}
                {isExpanded && (
                  <div className="border-t border-[var(--border-color)] divide-y divide-[var(--border-color)]">
                    {strats.map((strategy) => {
                      const isSelected = selectedStrategies.has(strategy.id);
                      const runState = strategyStatus[strategy.id];

                      return (
                        <div
                          key={strategy.id}
                          className={cn(
                            "px-3 py-2.5 flex items-center gap-2 group",
                            isSelected
                              ? "bg-[var(--bg-secondary)]"
                              : "opacity-50",
                          )}
                        >
                          {/* 勾选框 */}
                          <button
                            onClick={() =>
                              setSelectedStrategies((prev) => {
                                const next = new Set(prev);
                                if (next.has(strategy.id))
                                  next.delete(strategy.id);
                                else next.add(strategy.id);
                                return next;
                              })
                            }
                            className={cn(
                              "w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors",
                              isSelected
                                ? `${cfg.bg} border-transparent`
                                : "border-[var(--border-color)]",
                            )}
                          >
                            {isSelected && (
                              <div
                                className={cn(
                                  "w-2 h-2 rounded-sm",
                                  cfg.color.replace("text-", "bg-"),
                                )}
                              />
                            )}
                          </button>

                          {/* 策略名 */}
                          <span className="text-xs text-[var(--text-primary)] flex-1 leading-snug">
                            {strategy.name}
                          </span>

                          {/* 结果数量 */}
                          {runState?.status === "done" && (
                            <span className="text-[10px] text-emerald-400 tabular-nums">
                              {runState.total}只
                            </span>
                          )}
                          {runState?.status === "running" && (
                            <Loader2
                              size={10}
                              className="animate-spin text-[#f5a623]"
                            />
                          )}

                          {/* 详情按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailStrategy(strategy);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
                          >
                            <Info size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 个股诊断入口 */}
        <div className="border border-[var(--border-color)] rounded-xl p-3 space-y-2.5 bg-[var(--bg-secondary)]/40">
          <div className="flex items-center gap-1.5">
            <Search size={11} className="text-[var(--accent)]" />
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              个股诊断
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              · 分析为何不满足策略
            </span>
          </div>

          {/* 股票搜索框（带下拉候选） */}
          <div ref={diagnoseSearchRef} className="relative">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-primary)] border rounded-lg transition-colors",
                diagnoseSearchOpen
                  ? "border-[var(--accent)]"
                  : "border-[var(--border-color)]",
              )}
            >
              {diagnoseSearchLoading ? (
                <Loader2
                  size={11}
                  className="text-[var(--text-tertiary)] shrink-0 animate-spin"
                />
              ) : (
                <Search
                  size={11}
                  className="text-[var(--text-tertiary)] shrink-0"
                />
              )}
              <input
                type="text"
                placeholder="输入代码或名称搜索，如 贵州茅台"
                value={
                  diagnoseCode
                    ? `${diagnoseStockName}（${diagnoseCode}）`
                    : diagnoseQuery
                }
                onChange={(e) => handleDiagnoseQueryChange(e.target.value)}
                onFocus={() => {
                  if (diagnoseCode) {
                    // 重新进入编辑：清空选中，回显 query
                    setDiagnoseCode("");
                    setDiagnoseStockName("");
                  }
                  if (diagnoseSearchResults.length > 0)
                    setDiagnoseSearchOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setDiagnoseSearchOpen(false);
                  if (e.key === "Enter" && diagnoseCode) runDiagnose();
                }}
                className="flex-1 min-w-0 text-xs bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none"
              />
              {(diagnoseCode || diagnoseQuery) && (
                <button
                  onClick={() => {
                    setDiagnoseCode("");
                    setDiagnoseStockName("");
                    setDiagnoseQuery("");
                    setDiagnoseSearchResults([]);
                    setDiagnoseSearchOpen(false);
                  }}
                  className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* 下拉候选列表 */}
            {diagnoseSearchOpen && diagnoseSearchResults.length > 0 && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-xl overflow-hidden">
                {diagnoseSearchResults.map((item) => (
                  <button
                    key={item.code}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDiagnoseCode(item.code);
                      setDiagnoseStockName(item.name);
                      setDiagnoseQuery("");
                      setDiagnoseSearchOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <span className="font-mono text-[11px] text-[var(--text-tertiary)] w-14 shrink-0">
                      {item.code}
                    </span>
                    <span className="text-xs text-[var(--text-primary)] flex-1 truncate">
                      {item.name}
                    </span>
                    {item.change !== undefined && (
                      <span
                        className={cn(
                          "text-[10px] font-mono shrink-0 tabular-nums",
                          item.change > 0
                            ? "text-[var(--color-up)]"
                            : item.change < 0
                              ? "text-[var(--color-down)]"
                              : "text-[var(--text-tertiary)]",
                        )}
                      >
                        {item.change >= 0 ? "+" : ""}
                        {item.change.toFixed(2)}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 策略选择 */}
          <select
            value={diagnoseStrategyId}
            onChange={(e) => setDiagnoseStrategyId(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] transition-colors"
          >
            <option value="">选择要诊断的策略</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* 诊断按钮 */}
          <button
            onClick={runDiagnose}
            disabled={
              !diagnoseCode.trim() || !diagnoseStrategyId || diagnoseLoading
            }
            className={cn(
              "w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all",
              diagnoseLoading
                ? "bg-[var(--bg-secondary)] text-[var(--text-tertiary)] cursor-not-allowed"
                : !diagnoseCode.trim() || !diagnoseStrategyId
                  ? "bg-[var(--bg-secondary)] text-[var(--text-tertiary)] cursor-not-allowed opacity-50"
                  : "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/20",
            )}
          >
            {diagnoseLoading ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Search size={11} />
                开始诊断分析
              </>
            )}
          </button>

          {/* 错误提示 */}
          {diagnoseError && (
            <div className="flex items-start gap-1.5 text-[10px] text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-2.5 py-2">
              <AlertCircle size={11} className="shrink-0 mt-0.5" />
              <span>{diagnoseError}</span>
            </div>
          )}
        </div>

        {/* 扫描按钮 */}
        <button
          onClick={runScreener}
          disabled={selectedStrategies.size === 0}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all",
            isRunning
              ? "bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20"
              : "bg-[#f5a623] text-black hover:bg-[#e09510] disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {isRunning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              停止扫描
            </>
          ) : (
            <>
              <Zap size={14} />
              开始选股扫描
              {selectedStrategies.size > 0 && (
                <span className="text-xs opacity-70">
                  ({selectedStrategies.size}个策略)
                </span>
              )}
            </>
          )}
        </button>
      </div>

      {/* ── 右侧：推荐列表 ──────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* 进度区域：策略级别状态 */}
        {isRunning || Object.keys(strategyStatus).length > 0 ? (
          <div className="border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-secondary)] shrink-0">
            {/* 总进度头（可点击折叠） */}
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
              onClick={() => setProgressCollapsed((v) => !v)}
            >
              <div className="flex items-center gap-2">
                {isRunning && (
                  <Loader2 size={13} className="animate-spin text-[#f5a623]" />
                )}
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  {isRunning ? "扫描进行中" : "扫描完成"}
                </span>
                {!isRunning && mergedStocks.length > 0 && (
                  <span className="text-[10px] text-emerald-400">
                    · 共 {mergedStocks.length} 只
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[var(--accent)] tabular-nums">
                  {
                    Object.values(strategyStatus).filter(
                      (s) => s.status === "done" || s.status === "error",
                    ).length
                  }
                  /{Object.keys(strategyStatus).length}
                </span>
                {progressCollapsed ? (
                  <ChevronRight
                    size={12}
                    className="text-[var(--text-tertiary)]"
                  />
                ) : (
                  <ChevronDown
                    size={12}
                    className="text-[var(--text-tertiary)]"
                  />
                )}
              </div>
            </button>
            {/* 总进度条（始终显示） */}
            {isRunning && (
              <div className="h-1 bg-[var(--bg-primary)]">
                <div
                  className="h-full bg-[#f5a623] transition-all duration-500"
                  style={{
                    width: `${
                      Object.keys(strategyStatus).length > 0
                        ? (Object.values(strategyStatus).filter(
                            (s) => s.status === "done" || s.status === "error",
                          ).length /
                            Object.keys(strategyStatus).length) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
            )}
            {/* 策略列表（可折叠） */}
            {!progressCollapsed && (
              <div className="divide-y divide-[var(--border-color)]">
                {Array.from(selectedStrategies).map((sid) => {
                  const st = strategies.find((s) => s.id === sid);
                  if (!st) return null;
                  const runState = strategyStatus[sid];
                  const cfg =
                    CATEGORY_CONFIG[st.category] ?? CATEGORY_CONFIG["技术指标"];

                  return (
                    <div
                      key={sid}
                      className="flex items-center gap-3 px-4 py-2"
                    >
                      {/* 状态图标 */}
                      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                        {!runState || runState.status === "idle" ? (
                          <div className="w-2 h-2 rounded-full bg-[var(--border-color)]" />
                        ) : runState.status === "pending" ? (
                          <div className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-pulse" />
                        ) : runState.status === "running" ? (
                          <Loader2
                            size={13}
                            className="animate-spin text-[#f5a623]"
                          />
                        ) : runState.status === "done" ? (
                          <CheckCircle2
                            size={13}
                            className="text-emerald-400"
                          />
                        ) : (
                          <AlertCircle size={13} className="text-red-400" />
                        )}
                      </div>
                      {/* 策略名 */}
                      <span
                        className={cn(
                          "text-xs flex-1",
                          runState?.status === "running"
                            ? "text-[var(--text-primary)] font-medium"
                            : runState?.status === "done"
                              ? "text-[var(--text-secondary)]"
                              : "text-[var(--text-tertiary)]",
                        )}
                      >
                        {st.name}
                      </span>
                      {/* 分类标签 */}
                      <span
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded-full hidden sm:inline",
                          cfg.bg,
                          cfg.color,
                        )}
                      >
                        {st.category}
                      </span>
                      {/* 结果数 / 状态 */}
                      <span className="text-[10px] font-mono tabular-nums w-12 text-right">
                        {runState?.status === "done" ? (
                          <span className="text-emerald-400">
                            {runState.total}只
                          </span>
                        ) : runState?.status === "running" ? (
                          <span className="text-[#f5a623]">扫描中</span>
                        ) : runState?.status === "error" ? (
                          <span className="text-red-400">出错</span>
                        ) : runState?.status === "pending" ? (
                          <span className="text-[var(--text-tertiary)]">
                            等待
                          </span>
                        ) : (
                          <span className="text-[var(--text-tertiary)]">-</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {/* 空状态 */}
        {mergedStocks.length === 0 &&
          !isRunning &&
          Object.keys(strategyStatus).length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 py-20">
              <div className="w-16 h-16 rounded-2xl bg-[var(--bg-secondary)] flex items-center justify-center">
                <Target
                  size={28}
                  className="text-[var(--text-tertiary)] opacity-50"
                />
              </div>
              <div className="text-center">
                {selectedStrategies.size > 0 ? (
                  <>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      已选 {selectedStrategies.size} 个策略，准备扫描
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      将遍历全市场股票，按多维度评分排序推荐
                    </p>
                    <div className="flex flex-wrap justify-center gap-1.5 mt-3 max-w-xs">
                      {Array.from(selectedStrategies).map((sid) => {
                        const st = strategies.find((s) => s.id === sid);
                        if (!st) return null;
                        const cfg =
                          CATEGORY_CONFIG[st.category] ??
                          CATEGORY_CONFIG["技术指标"];
                        return (
                          <span
                            key={sid}
                            className={cn(
                              "text-xs px-2 py-0.5 rounded-full",
                              cfg.bg,
                              cfg.color,
                            )}
                          >
                            {st.name}
                          </span>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      选择策略，开始智能选股
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      从左侧策略库勾选策略，系统将按评分排序推荐
                    </p>
                  </>
                )}
              </div>
              <button
                onClick={runScreener}
                disabled={selectedStrategies.size === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#f5a623] text-black rounded-xl text-sm font-semibold hover:bg-[#e09510] transition-colors disabled:opacity-40"
              >
                <Zap size={14} />
                {selectedStrategies.size > 0
                  ? `扫描 ${selectedStrategies.size} 个策略`
                  : "立即扫描"}
              </button>
            </div>
          )}

        {/* 结果列表 */}
        {mergedStocks.length > 0 && (
          <>
            {/* 结果头部 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star size={13} className="text-[#f5a623]" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  推荐标的
                </span>
                <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full">
                  {filteredStocks.length} 只
                </span>
                {isRunning && (
                  <span className="flex items-center gap-1 text-xs text-[#f5a623]">
                    <Loader2 size={11} className="animate-spin" />
                    实时更新中
                  </span>
                )}
              </div>

              {/* 过滤和排序 */}
              <div className="flex items-center gap-2">
                {/* 策略过滤（按具体策略，仅显示已扫描的） */}
                <select
                  value={filterStrategyId}
                  onChange={(e) => setFilterStrategyId(e.target.value)}
                  className="text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-[var(--text-secondary)] outline-none max-w-[140px]"
                >
                  <option value="all">全部策略</option>
                  {scannedStrategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                {/* 排序 */}
                <div className="flex items-center gap-0.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-0.5">
                  {[
                    { key: "score" as const, label: "评分" },
                    { key: "hits" as const, label: "命中数" },
                    { key: "change" as const, label: "涨幅" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setSortBy(key)}
                      className={cn(
                        "px-2.5 py-1 text-xs rounded-md transition-all",
                        sortBy === key
                          ? "bg-[#f5a623] text-black font-medium"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 报告精选说明卡片 */}
            {filterStrategyId === "report_picks" && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={13} className="text-amber-400 shrink-0" />
                    <span className="text-xs font-semibold text-amber-400">
                      报告精选 · 直接读取盘面报告推荐个股
                    </span>
                  </div>
                  {reportCtx?.hasReport && reportCtx.reportDate && (
                    <span className="text-[10px] text-amber-400/70 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                      已读取盘面报告 {reportCtx.reportDate}
                    </span>
                  )}
                </div>
                {reportCtx?.hasReport ? (
                  <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    无低位/量比硬过滤，直接展示报告龙头和核心推荐个股的技术面评分。
                    报告中的龙头个股额外加{" "}
                    <span className="text-amber-400 font-medium">+30分</span>
                    ，核心推荐加{" "}
                    <span className="text-amber-400 font-medium">+20分</span>，
                    所属报告推荐板块加{" "}
                    <span className="text-amber-400 font-medium">+15分</span>。
                  </div>
                ) : (
                  <div className="text-[11px] text-[var(--text-tertiary)]">
                    未找到盘面报告，无法展示精选个股。
                  </div>
                )}
              </div>
            )}

            {/* 资金异动策略说明卡片（仅当筛选器为「资金异动」或结果全部来自该策略时展示） */}
            {(filterStrategyId === "capital_surge" ||
              (filterStrategyId === "all" &&
                filteredStocks.length > 0 &&
                filteredStocks.every((s) =>
                  s.hitStrategies.includes("capital_surge"),
                ))) && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-4 space-y-3">
                {/* 标题行 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={13} className="text-amber-400 shrink-0" />
                    <span className="text-xs font-semibold text-amber-400">
                      资金异动策略 · 筛选逻辑说明
                    </span>
                  </div>
                  {reportCtx?.hasReport && reportCtx.reportDate && (
                    <span className="text-[10px] text-amber-400/70 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                      已读取盘面报告 {reportCtx.reportDate}
                    </span>
                  )}
                  {reportCtx && !reportCtx.hasReport && (
                    <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full">
                      未找到盘面报告，使用纯数据筛选
                    </span>
                  )}
                </div>

                {/* 报告识别结果（有报告时展示） */}
                {reportCtx?.hasReport && (
                  <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 space-y-2 text-[11px]">
                    <div className="flex items-center gap-1.5 font-medium text-amber-400">
                      <Info size={10} />
                      <span>
                        已从「{reportCtx.sessionTitle}
                        」报告中提取以下信息用于加分筛选
                      </span>
                    </div>
                    {/* 推荐板块 */}
                    {reportCtx.hotBoards && reportCtx.hotBoards.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[var(--text-secondary)] font-medium">
                          ⑤ 报告推荐板块
                          <span className="ml-1 text-[var(--text-tertiary)] font-normal">
                            · 所属板块在列表内额外 +15 分
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {reportCtx.hotBoards.map((b) => (
                            <span
                              key={b}
                              className="px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/20 text-[10px]"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 龙头/核心推荐个股 */}
                    {((reportCtx.leadingStocks &&
                      reportCtx.leadingStocks.length > 0) ||
                      (reportCtx.topPickStocks &&
                        reportCtx.topPickStocks.length > 0)) && (
                      <div className="space-y-1">
                        <div className="text-[var(--text-secondary)] font-medium">
                          ⑥ 报告龙头 / 核心推荐个股
                          <span className="ml-1 text-[var(--text-tertiary)] font-normal">
                            · 龙头 +20 分，核心推荐 +15 分
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[
                            ...new Set([
                              ...(reportCtx.leadingStocks ?? []),
                              ...(reportCtx.topPickStocks ?? []),
                            ]),
                          ].map((code) => {
                            const isLeading =
                              reportCtx.leadingStocks?.includes(code);
                            return (
                              <span
                                key={code}
                                className={cn(
                                  "px-2 py-0.5 rounded-full border text-[10px] font-mono",
                                  isLeading
                                    ? "bg-amber-400/20 text-amber-300 border-amber-400/40"
                                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)]",
                                )}
                              >
                                {code}
                                {isLeading && (
                                  <span className="ml-0.5 text-amber-400">
                                    ★
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* 净流出预警板块 */}
                    {reportCtx.outflowBoards &&
                      reportCtx.outflowBoards.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[var(--text-secondary)] font-medium">
                            ⚠ 报告预警板块
                            <span className="ml-1 text-[var(--text-tertiary)] font-normal">
                              · 不影响加分（风控减分由主系统处理）
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {reportCtx.outflowBoards.map((b) => (
                              <span
                                key={b}
                                className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[10px]"
                              >
                                {b}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                )}

                {/* 四维说明 */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 space-y-0.5">
                    <div className="font-medium text-[var(--text-primary)]">
                      ① 低位横盘
                    </div>
                    <div className="text-[var(--text-tertiary)] leading-relaxed">
                      价格处于 250 日高低价区间的低位（百分位 &lt;
                      35%）。排除了近期高位追涨风险，确保筹码成本低。
                    </div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 space-y-0.5">
                    <div className="font-medium text-[var(--text-primary)]">
                      ② 均线企稳
                    </div>
                    <div className="text-[var(--text-tertiary)] leading-relaxed">
                      MA20 斜率在 -0.3% ~ +2% 之间（走平或轻微上翘），MA60 斜率
                      &gt; -0.3%。说明下跌趋势已放缓，不是持续下跌中的股票。
                    </div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 space-y-0.5">
                    <div className="font-medium text-[var(--text-primary)]">
                      ③ 成交量异动
                    </div>
                    <div className="text-[var(--text-tertiary)] leading-relaxed">
                      近 5 日均量 ÷ 近 60 日均量 ≥
                      1.2x（量能突然放大）。这是资金介入最直接的信号，相比短期均量更难被单日放量干扰。
                    </div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 space-y-0.5">
                    <div className="font-medium text-[var(--text-primary)]">
                      ④ 板块共振
                    </div>
                    <div className="text-[var(--text-tertiary)] leading-relaxed">
                      个股所属申万二级板块：今日资金净流入 &gt; 0 亿，且近 5
                      交易日累计涨幅为正。数据来自{" "}
                      <span className="text-amber-400 font-medium">
                        盘面分析报告
                      </span>{" "}
                      （fund_flow_snapshot +
                      sw_industry_daily），确认板块整体有资金推动，非个股孤立异动。
                    </div>
                  </div>
                </div>

                {/* 数据来源说明 */}
                <div className="border-t border-amber-400/15 pt-2.5 text-[10px] text-[var(--text-tertiary)] space-y-1">
                  <div className="flex items-start gap-1.5">
                    <Info
                      size={10}
                      className="text-amber-400/70 mt-0.5 shrink-0"
                    />
                    <span>
                      <span className="text-[var(--text-secondary)]">
                        数据来源
                      </span>
                      ： 板块净流入来自东方财富申万行业资金流向（
                      <code className="text-amber-300/80">
                        fund_flow_snapshot.period=&apos;today&apos;
                      </code>
                      ）， 板块近5日涨幅来自申万行业日行情（
                      <code className="text-amber-300/80">
                        sw_industry_daily
                      </code>
                      ）， 与盘面分析 Agent
                      报告所用的数据源完全一致。当你在盘面报告中看到的强势板块出现在此列表中，说明个股已与板块形成共振。
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Info
                      size={10}
                      className="text-amber-400/70 mt-0.5 shrink-0"
                    />
                    <span>
                      <span className="text-[var(--text-secondary)]">
                        打分权重
                      </span>
                      ： 低位横盘 30分 · 企稳信号 25分 · 成交量异动 25分 ·
                      板块共振 20分
                      {reportCtx?.hasReport
                        ? "（基础100分）；另加：报告推荐板块 +15分 · 报告龙头 +20分 / 核心推荐 +15分"
                        : "，满分 100 分"}
                      。 最低入围门槛：低位（百分位&lt;35%）+
                      放量（×1.2）同时满足。
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Info
                      size={10}
                      className="text-amber-400/70 mt-0.5 shrink-0"
                    />
                    <span>
                      <span className="text-[var(--text-secondary)]">
                        操作建议
                      </span>
                      ： 优先选板块净流入靠前（board_netflow
                      越大越好）且量能倍比（vol_surge_ratio）最高的个股。
                      在板块放量当日或次日低开时介入，止损设近期低点下方 3%。
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 表格 */}
            <div className="overflow-auto flex-1">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
                    <th className="px-3 py-2.5 text-left font-semibold text-[var(--text-tertiary)] w-6">
                      #
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold text-[var(--text-tertiary)]">
                      股票
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold text-[var(--text-tertiary)]">
                      所属板块
                    </th>
                    <th className="px-3 py-2.5 text-right font-semibold text-[var(--text-tertiary)]">
                      现价
                    </th>
                    <th className="px-3 py-2.5 text-right font-semibold text-[var(--text-tertiary)]">
                      涨跌幅
                    </th>
                    <th className="px-3 py-2.5 text-center font-semibold text-[var(--text-tertiary)]">
                      命中策略
                    </th>
                    <th className="px-3 py-2.5 text-right font-semibold text-[var(--text-tertiary)] w-28">
                      综合评分
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold text-[var(--text-tertiary)]">
                      买入建议
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.slice(0, 200).map((stock, idx) => {
                    const bar = scoreBar(stock.totalScore);
                    return (
                      <tr
                        key={stock.code}
                        onClick={() => setDetailStock(stock)}
                        className={cn(
                          "border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors",
                          stock.hitStrategies.includes("capital_surge") &&
                            "bg-amber-400/[0.03]",
                          stock.hitStrategies.includes("report_picks") &&
                            "bg-amber-400/[0.05]",
                        )}
                      >
                        {/* 排名 */}
                        <td className="px-3 py-3 text-[var(--text-tertiary)] text-center tabular-nums">
                          {idx < 3 ? (
                            <span
                              className={cn(
                                "w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] mx-auto",
                                idx === 0
                                  ? "bg-yellow-500/20 text-yellow-400"
                                  : idx === 1
                                    ? "bg-gray-400/20 text-gray-400"
                                    : "bg-orange-700/20 text-orange-700",
                              )}
                            >
                              {idx + 1}
                            </span>
                          ) : (
                            <span className="text-[10px]">{idx + 1}</span>
                          )}
                        </td>

                        {/* 股票信息 */}
                        <td className="px-3 py-3">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-[var(--text-primary)]">
                                {stock.name}
                              </span>
                              {stock.hitStrategies.includes(
                                "capital_surge",
                              ) && (
                                <Sparkles
                                  size={10}
                                  className="text-amber-400 shrink-0"
                                />
                              )}
                              {stock.hitStrategies.includes("report_picks") && (
                                <Sparkles
                                  size={10}
                                  className="text-amber-500 shrink-0"
                                />
                              )}
                              {stock.riskLevel === "high" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium shrink-0">
                                  高位风险
                                </span>
                              )}
                              {stock.riskLevel === "medium" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium shrink-0">
                                  注意风险
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[var(--text-tertiary)] text-[10px]">
                                {stock.code}
                              </span>
                              {stock.limitUp15d >= 3 && (
                                <span className="text-[9px] text-orange-400 tabular-nums">
                                  {stock.limitUp15d}连板
                                </span>
                              )}
                              {stock.riseFromLow >= 40 && (
                                <span className="text-[9px] text-red-400 tabular-nums">
                                  +{stock.riseFromLow.toFixed(0)}%
                                </span>
                              )}
                              {stock.bearishMaCount >= 3 &&
                                stock.limitUp15d === 0 && (
                                  <span className="text-[9px] text-purple-400">
                                    {stock.bearishMaCount}层空头
                                  </span>
                                )}
                              {stock.pricePercentile >= 85 &&
                                stock.limitUp15d === 0 && (
                                  <span className="text-[9px] text-orange-400">
                                    位{stock.pricePercentile.toFixed(0)}%
                                  </span>
                                )}
                            </div>
                          </div>
                        </td>

                        {/* 板块 */}
                        <td className="px-3 py-3">
                          <span className="text-[var(--text-secondary)] text-[10px] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded-full">
                            {stock.industryBoard.split("/")[0]}
                          </span>
                        </td>

                        {/* 现价 */}
                        <td className="px-3 py-3 text-right tabular-nums font-medium text-[var(--text-primary)]">
                          {stock.price.toFixed(2)}
                        </td>

                        {/* 涨跌幅 */}
                        <td
                          className={cn(
                            "px-3 py-3 text-right tabular-nums font-medium",
                            stock.change > 0
                              ? "text-[var(--color-up)]"
                              : stock.change < 0
                                ? "text-[var(--color-down)]"
                                : "text-[var(--text-tertiary)]",
                          )}
                        >
                          {fmtPct(stock.change)}
                        </td>

                        {/* 命中策略 */}
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {stock.hitStrategies.slice(0, 3).map((sid) => {
                              const st = strategies.find((s) => s.id === sid);
                              if (!st) return null;
                              const cfg =
                                CATEGORY_CONFIG[st.category] ??
                                CATEGORY_CONFIG["技术指标"];
                              return (
                                <span
                                  key={sid}
                                  className={cn(
                                    "text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                                    cfg.bg,
                                    cfg.color,
                                  )}
                                >
                                  {st.name}
                                </span>
                              );
                            })}
                            {stock.hitStrategies.length > 3 && (
                              <span className="text-[9px] text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded-full">
                                +{stock.hitStrategies.length - 3}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 综合评分 */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-16 h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", bar.color)}
                                style={{ width: `${bar.pct}%` }}
                              />
                            </div>
                            <div className="text-right">
                              <span
                                className={cn(
                                  "text-sm font-bold tabular-nums",
                                  scoreColor(stock.totalScore),
                                )}
                              >
                                {stock.totalScore}
                              </span>
                              {stock.riskPenalty > 0 && (
                                <div className="text-[9px] text-red-400 tabular-nums leading-none mt-0.5">
                                  -{stock.riskPenalty}风控
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 买入建议 */}
                        <td className="px-3 py-3 text-[var(--text-tertiary)] max-w-[160px]">
                          <span className="text-[10px] leading-snug line-clamp-2">
                            {stock.entryPoint}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── 策略详情弹窗 ──────────────────────────────────────────────── */}
      {detailStrategy && (
        <StrategyDetailModal
          strategy={detailStrategy}
          onClose={() => setDetailStrategy(null)}
        />
      )}

      {/* ── 个股评分详情弹窗 ──────────────────────────────────────────── */}
      {detailStock && (
        <StockDetailModal
          stock={detailStock}
          strategies={strategies}
          onClose={() => setDetailStock(null)}
        />
      )}

      {/* ── 个股诊断弹窗 ──────────────────────────────────────────────── */}
      {diagnoseResult && (
        <DiagnoseModal
          result={diagnoseResult}
          onClose={() => setDiagnoseResult(null)}
        />
      )}
    </div>
  );
}
