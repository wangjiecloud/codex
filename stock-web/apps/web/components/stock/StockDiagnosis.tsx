"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity,
  Trophy,
  Zap,
  BarChart2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Target,
  Shield,
  XCircle,
  Info,
  Brain,
  Sparkles,
  CheckCircle2,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface SignalSnapshot {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  change_pct: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  rsi14?: number;
  macd_dif?: number;
  vol_ratio?: number;
  boll_upper?: number;
  boll_lower?: number;
  vs_ma5?: number;
  vs_ma20?: number;
  vs_ma60?: number;
}

interface BuyDetail {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  gap_pct?: number | null;
  reason: string;
}

interface ExitDetail {
  trigger: string;
  threshold_pct?: number | null;
  day_high?: number;
  day_high_pct?: number;
  day_low?: number;
  day_low_pct?: number;
  sell_price: number;
  note: string;
}

interface TradeDetail {
  signal_date: string;
  buy_date: string;
  buy_price: number;
  sell_date: string;
  sell_price: number;
  return_pct: number;
  hold_days: number;
  exit_reason: string;
  signal_snapshot?: SignalSnapshot;
  buy_detail?: BuyDetail;
  exit_detail?: ExitDetail;
}

interface AtrStop {
  atr14: number | null;
  atr_pct: number | null;
  volatility_level: "low" | "medium" | "high" | "extreme" | "unknown";
  dynamic_stop_profit: number;
  dynamic_stop_loss: number;
  default_stop_profit: number;
  default_stop_loss: number;
  adjusted: boolean;
  adjust_reason: string;
}

interface StrategyRankItem {
  rank: number;
  id: string;
  label: string;
  stop_profit: number;
  stop_loss: number;
  max_hold_days: number;
  conditions: string[];
  trade_count: number;
  win_rate: number;
  avg_return: number;
  total_return: number;
  score: number;
  trades: TradeDetail[];
  signal_dates: string[];
  atr_stop?: AtrStop;
}

interface TechnicalData {
  current_price: number;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  boll_upper: number | null;
  boll_mid: number | null;
  boll_lower: number | null;
  support_levels: number[];
  resistance_levels: number[];
  vol_ratio: number;
  vs_ma5: number | null;
  vs_ma20: number | null;
  vs_ma60: number | null;
  vs_boll_upper: number | null;
  vs_boll_lower: number | null;
}

interface DiagnosisResult {
  code: string;
  name: string;
  backtest_period: { start: string; end: string; days: number };
  strategy_ranking: StrategyRankItem[];
  best_strategy: StrategyRankItem | null;
  current_signals: string[];
  technical: TechnicalData;
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function pctColor(v: number | null) {
  if (v === null) return "text-[var(--text-tertiary)]";
  return v > 0
    ? "text-[#e84444]"
    : v < 0
      ? "text-[#09d464]"
      : "text-[var(--text-secondary)]";
}

function fmtPct(v: number | null, digits = 1) {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function scoreColor(score: number) {
  if (score >= 60) return "text-[#e84444]";
  if (score >= 30) return "text-[#f5a623]";
  if (score > 0) return "text-[var(--text-secondary)]";
  return "text-[var(--text-tertiary)]";
}

function ScoreBar({ score }: { score: number }) {
  const width = Math.min(Math.max(score, 0), 100);
  const color = score >= 60 ? "#e84444" : score >= 30 ? "#f5a623" : "#666";
  return (
    <div className="w-16 h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${width}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── 交易详情气泡弹窗 ─────────────────────────────────────────────────────────

function TradeInfoPopup({
  trade,
  type,
}: {
  trade: TradeDetail;
  type: "buy" | "sell";
}) {
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // 点击按钮时计算弹窗位置（fixed 定位，基于按钮的视口坐标）
  const handleToggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next && btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        const POPUP_W = 288; // w-72
        const POPUP_H = 420; // 估算高度
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // 水平方向：默认居中对齐按钮，超出边界时靠边
        let left = rect.left + rect.width / 2 - POPUP_W / 2;
        if (left + POPUP_W > vw - 8) left = vw - POPUP_W - 8;
        if (left < 8) left = 8;

        // 垂直方向：优先向上弹，空间不足时向下
        let top: number;
        if (rect.top - POPUP_H - 8 > 0) {
          top = rect.top - POPUP_H - 8; // 向上
        } else {
          top = rect.bottom + 8; // 向下
          // 向下也不够时，紧贴底部
          if (top + POPUP_H > vh - 8) top = vh - POPUP_H - 8;
        }

        setPopupStyle({ position: "fixed", top, left, zIndex: 9999 });
      }
      return next;
    });
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target as Node) &&
        popupRef.current &&
        !popupRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // 滚动时关闭弹窗（避免错位）
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [open]);

  const snap = trade.signal_snapshot;
  const buyD = trade.buy_detail;
  const exitD = trade.exit_detail;

  const isBuy = type === "buy";

  return (
    <div className="inline-flex items-center">
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="w-4 h-4 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-tertiary)] hover:border-[#f5a623]/60 hover:text-[#f5a623] transition-all flex items-center justify-center text-[9px] font-bold leading-none"
        title="查看详细信息"
      >
        ⓘ
      </button>

      {open && (
        <div
          ref={popupRef}
          style={popupStyle}
          className="w-72 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-xl text-[11px] overflow-hidden"
        >
          {isBuy ? (
            /* ── 买入详情 ─────────────────────────────── */
            <div>
              <div className="px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" />
                <span className="font-semibold text-[var(--text-primary)]">
                  买入依据
                </span>
                <span className="text-[var(--text-tertiary)] ml-auto">
                  {trade.signal_date} 触发 → {trade.buy_date} 开盘买入
                </span>
              </div>

              {/* 信号日数据 */}
              {snap && (
                <div className="px-3 py-2 border-b border-[var(--border-color)]">
                  <div className="text-[9px] font-medium text-[var(--text-tertiary)] mb-1.5">
                    信号日（{snap.date}）技术指标
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <Row label="收盘价" val={`¥${snap.close}`} />
                    <Row
                      label="涨跌幅"
                      val={`${snap.change_pct > 0 ? "+" : ""}${snap.change_pct}%`}
                      color={
                        snap.change_pct > 0
                          ? "#e84444"
                          : snap.change_pct < 0
                            ? "#09d464"
                            : undefined
                      }
                    />
                    {snap.rsi14 !== undefined && (
                      <Row
                        label="RSI14"
                        val={snap.rsi14.toFixed(1)}
                        color={
                          snap.rsi14 <= 30
                            ? "#09d464"
                            : snap.rsi14 >= 70
                              ? "#e84444"
                              : undefined
                        }
                      />
                    )}
                    {snap.macd_dif !== undefined && (
                      <Row
                        label="MACD DIF"
                        val={
                          snap.macd_dif > 0
                            ? `+${snap.macd_dif}`
                            : String(snap.macd_dif)
                        }
                        color={snap.macd_dif > 0 ? "#e84444" : "#09d464"}
                      />
                    )}
                    {snap.vol_ratio !== undefined && (
                      <Row
                        label="量比"
                        val={snap.vol_ratio.toFixed(2)}
                        color={snap.vol_ratio >= 1.5 ? "#e84444" : undefined}
                      />
                    )}
                    {snap.ma5 !== undefined && (
                      <Row
                        label="MA5"
                        val={`¥${snap.ma5}`}
                        sub={
                          snap.vs_ma5 !== undefined
                            ? `偏离 ${snap.vs_ma5 > 0 ? "+" : ""}${snap.vs_ma5}%`
                            : undefined
                        }
                      />
                    )}
                    {snap.ma20 !== undefined && (
                      <Row
                        label="MA20"
                        val={`¥${snap.ma20}`}
                        sub={
                          snap.vs_ma20 !== undefined
                            ? `偏离 ${snap.vs_ma20 > 0 ? "+" : ""}${snap.vs_ma20}%`
                            : undefined
                        }
                      />
                    )}
                    {snap.ma60 !== undefined && (
                      <Row
                        label="MA60"
                        val={`¥${snap.ma60}`}
                        sub={
                          snap.vs_ma60 !== undefined
                            ? `偏离 ${snap.vs_ma60 > 0 ? "+" : ""}${snap.vs_ma60}%`
                            : undefined
                        }
                      />
                    )}
                    {snap.boll_upper !== undefined && (
                      <Row label="布林上轨" val={`¥${snap.boll_upper}`} />
                    )}
                    {snap.boll_lower !== undefined && (
                      <Row label="布林下轨" val={`¥${snap.boll_lower}`} />
                    )}
                  </div>
                </div>
              )}

              {/* 买入日数据 */}
              {buyD && (
                <div className="px-3 py-2 border-b border-[var(--border-color)]">
                  <div className="text-[9px] font-medium text-[var(--text-tertiary)] mb-1.5">
                    买入日（{buyD.date}）开盘数据
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <Row
                      label="开盘价（买入价）"
                      val={`¥${buyD.open}`}
                      highlight
                    />
                    <Row
                      label="当日高/低"
                      val={`¥${buyD.high} / ¥${buyD.low}`}
                    />
                    <Row label="当日收盘" val={`¥${buyD.close}`} />
                    {buyD.gap_pct !== null && buyD.gap_pct !== undefined && (
                      <Row
                        label="跳空缺口"
                        val={`${buyD.gap_pct > 0 ? "+" : ""}${buyD.gap_pct}%`}
                        color={buyD.gap_pct > 0 ? "#e84444" : "#09d464"}
                      />
                    )}
                  </div>
                </div>
              )}

              {buyD && (
                <div className="px-3 py-2 text-[10px] text-[var(--text-secondary)] leading-relaxed">
                  {buyD.reason}
                </div>
              )}
            </div>
          ) : (
            /* ── 卖出详情 ─────────────────────────────── */
            <div>
              <div className="px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center gap-1.5">
                <div
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    exitD?.trigger === "止盈"
                      ? "bg-[#09d464]"
                      : exitD?.trigger === "止损"
                        ? "bg-[#e84444]"
                        : "bg-[var(--text-tertiary)]",
                  )}
                />
                <span className="font-semibold text-[var(--text-primary)]">
                  卖出依据
                </span>
                <span
                  className={cn(
                    "ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold",
                    exitD?.trigger === "止盈"
                      ? "bg-[#09d464]/15 text-[#09d464]"
                      : exitD?.trigger === "止损"
                        ? "bg-[#e84444]/15 text-[#e84444]"
                        : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]",
                  )}
                >
                  {exitD?.trigger ?? trade.exit_reason}
                </span>
              </div>

              {exitD && (
                <div className="px-3 py-2 border-b border-[var(--border-color)]">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <Row label="卖出日期" val={trade.sell_date} />
                    <Row
                      label="卖出价（收盘）"
                      val={`¥${exitD.sell_price}`}
                      highlight
                    />
                    {exitD.day_high !== undefined && (
                      <Row
                        label="当日最高价"
                        val={`¥${exitD.day_high}`}
                        sub={
                          exitD.day_high_pct !== undefined
                            ? `较买入 +${exitD.day_high_pct.toFixed(1)}%`
                            : undefined
                        }
                        color="#e84444"
                      />
                    )}
                    {exitD.day_low !== undefined && (
                      <Row
                        label="当日最低价"
                        val={`¥${exitD.day_low}`}
                        sub={
                          exitD.day_low_pct !== undefined
                            ? `较买入 ${exitD.day_low_pct.toFixed(1)}%`
                            : undefined
                        }
                        color="#09d464"
                      />
                    )}
                    {exitD.threshold_pct !== null &&
                      exitD.threshold_pct !== undefined && (
                        <Row
                          label="触发阈值"
                          val={`${exitD.threshold_pct > 0 ? "+" : ""}${exitD.threshold_pct}%`}
                        />
                      )}
                    <Row label="持仓" val={`${trade.hold_days} 交易日`} />
                    <Row
                      label="本笔盈亏"
                      val={`${trade.return_pct > 0 ? "+" : ""}${trade.return_pct.toFixed(2)}%`}
                      color={trade.return_pct > 0 ? "#e84444" : "#09d464"}
                    />
                  </div>
                </div>
              )}

              {exitD && (
                <div className="px-3 py-2 text-[10px] text-[var(--text-secondary)] leading-relaxed">
                  {exitD.note}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  val,
  sub,
  color,
  highlight,
}: {
  label: string;
  val: string;
  sub?: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-1 py-0.5">
      <span className="text-[var(--text-tertiary)] shrink-0">{label}</span>
      <div className="text-right">
        <span
          className={cn(
            "font-mono",
            highlight
              ? "font-bold text-[var(--text-primary)]"
              : "text-[var(--text-secondary)]",
          )}
          style={color ? { color } : undefined}
        >
          {val}
        </span>
        {sub && (
          <div className="text-[9px] text-[var(--text-tertiary)]">{sub}</div>
        )}
      </div>
    </div>
  );
}

// ── 策略展开详情（交易明细 + 不触发原因）────────────────────────────────────

function StrategyExpandPanel({
  s,
  isSignal,
  tech,
}: {
  s: StrategyRankItem;
  isSignal: boolean;
  tech: TechnicalData | null;
}) {
  const hasTraded = s.trade_count > 0;

  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg mx-2 mb-2 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-color)]">
        {/* 左侧：触发条件 */}
        <div className="p-3">
          <div className="text-[10px] font-medium text-[var(--text-tertiary)] mb-2">
            触发条件（全部满足才会产生信号）
          </div>
          <div className="space-y-1">
            {s.conditions.map((c, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <CircleDot
                  size={10}
                  className="text-[#f5a623] shrink-0 mt-0.5"
                />
                <span className="text-[11px] text-[var(--text-secondary)] leading-snug">
                  {c}
                </span>
              </div>
            ))}
          </div>

          {/* 如果 trade_count=0，给出原因分析 */}
          {!hasTraded && (
            <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-400 space-y-1">
              <div className="font-medium mb-1">
                回测期间未产生信号，可能原因：
              </div>
              {tech && (
                <>
                  {/* 针对各策略给出当前技术指标对比 */}
                  {s.id === "macd_kdj" && (
                    <>
                      <div>
                        • MACD：当前价距 MA5 {fmtPct(tech.vs_ma5)}，需 DIF
                        在零轴附近且同步 KDJ 金叉
                      </div>
                      <div>
                        • 需要量能放大 ≥ 1.5 倍均量，当前量比{" "}
                        {tech.vol_ratio?.toFixed(2) ?? "—"}
                      </div>
                    </>
                  )}
                  {s.id === "ma_breakout" && (
                    <>
                      <div>
                        • 需 MA5&gt;MA10&gt;MA20&gt;MA60 四线多头排列，当前价距
                        MA20: {fmtPct(tech.vs_ma20)}、距 MA60:{" "}
                        {fmtPct(tech.vs_ma60)}
                      </div>
                      <div>
                        •
                        均线多头排列要求趋势持续上涨，若处于震荡/下跌趋势中不满足
                      </div>
                    </>
                  )}
                  {s.id === "boll_breakout" && (
                    <>
                      <div>
                        • 需收盘价突破布林上轨（距上轨{" "}
                        {fmtPct(tech.vs_boll_upper)}），当前未突破
                      </div>
                      <div>• 需布林带近15日收窄（波动率降低），且放量突破</div>
                    </>
                  )}
                  {s.id === "rsi_oversold" && (
                    <>
                      <div>
                        • 需 RSI14 前日≤30（超卖）且当日&gt;30 反转，当前价距
                        MA60 {fmtPct(tech.vs_ma60)}
                      </div>
                      <div>
                        • 该策略需股价处于深度低位（低于 MA60 的
                        85%），不适合趋势强股
                      </div>
                    </>
                  )}
                  {s.id === "kdj_double_cross" && (
                    <>
                      <div>
                        • 需 KDJ
                        连续两日在超卖区（RSV&lt;20）形成二次金叉，信号严格
                      </div>
                      <div>
                        • 若股价处于上升趋势或震荡中，KDJ 不会进入超卖区
                      </div>
                    </>
                  )}
                  {s.id === "pullback_ma5" && (
                    <>
                      <div>
                        • 需近20日涨幅≥15%（有过一波行情）+ 精准回踩 MA5 ± 3%
                      </div>
                      <div>
                        • 当前价距 MA5: {fmtPct(tech.vs_ma5)}，需在 ±3%
                        之间才触发
                      </div>
                    </>
                  )}
                  {s.id === "vol_breakout" && (
                    <>
                      <div>
                        • 需成交量为20日均量的3倍以上，当前量比{" "}
                        {tech.vol_ratio?.toFixed(2) ?? "—"}
                      </div>
                      <div>
                        • 需同时突破近20日最高价，且涨幅在 3%~9%
                        之间，信号较稀少
                      </div>
                    </>
                  )}
                  {s.id === "right_breakout" && (
                    <>
                      <div>
                        • 需收盘价突破近20日最高价（当前价距前高见上方压力位）
                      </div>
                      <div>
                        • 还需 MACD 多头 + 低点抬升 +
                        放量，多条件同时满足难度较高
                      </div>
                    </>
                  )}
                  {s.id === "ma_golden_cross" && (
                    <>
                      <div>
                        • 需 MA20 从下向上穿越 MA60（金叉），当前距 MA60:{" "}
                        {fmtPct(tech.vs_ma60)}
                      </div>
                      <div>• 中期均线金叉是大级别信号，回测期内不一定出现</div>
                    </>
                  )}
                </>
              )}
              <div className="mt-1 pt-1 border-t border-amber-500/20 text-[9px] opacity-70">
                以上为基于当前技术指标的定性分析，历史回测期内各日期具体指标值不同
              </div>
            </div>
          )}

          {/* 退出规则 + ATR 动态建议 */}
          <div className="mt-3 space-y-2">
            {/* 策略默认止盈止损 */}
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-[var(--text-tertiary)]">策略默认：</span>
              <span className="text-[#09d464]">止盈 +{s.stop_profit}%</span>
              <span className="text-[#e84444]">止损 -{s.stop_loss}%</span>
              <span className="text-[var(--text-secondary)]">
                最长 {s.max_hold_days} 天
              </span>
            </div>
            {/* ATR 动态建议 */}
            {s.atr_stop && (
              <div
                className={cn(
                  "p-2 rounded text-[10px] border",
                  s.atr_stop.adjusted
                    ? "bg-blue-500/10 border-blue-500/25 text-blue-300"
                    : "bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-tertiary)]",
                )}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium">ATR 动态建议：</span>
                  <span
                    className={cn(
                      "px-1 py-0.5 rounded text-[9px] font-medium",
                      s.atr_stop.volatility_level === "low"
                        ? "bg-sky-500/20 text-sky-300"
                        : s.atr_stop.volatility_level === "medium"
                          ? "bg-[#f5a623]/20 text-[#f5a623]"
                          : s.atr_stop.volatility_level === "high"
                            ? "bg-orange-500/20 text-orange-300"
                            : "bg-red-500/20 text-red-300",
                    )}
                  >
                    {s.atr_stop.volatility_level === "low"
                      ? "低波动"
                      : s.atr_stop.volatility_level === "medium"
                        ? "中等波动"
                        : s.atr_stop.volatility_level === "high"
                          ? "高波动"
                          : s.atr_stop.volatility_level === "extreme"
                            ? "极高波动"
                            : "未知"}
                  </span>
                  {s.atr_stop.atr_pct !== null && (
                    <span className="text-[var(--text-tertiary)]">
                      ATR14 = {s.atr_stop.atr_pct.toFixed(1)}%/天
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mb-1">
                  <span
                    className={
                      s.atr_stop.adjusted
                        ? "text-[#09d464] font-medium"
                        : "text-[var(--text-tertiary)]"
                    }
                  >
                    建议止盈 +{s.atr_stop.dynamic_stop_profit}%
                  </span>
                  <span
                    className={
                      s.atr_stop.adjusted
                        ? "text-[#e84444] font-medium"
                        : "text-[var(--text-tertiary)]"
                    }
                  >
                    建议止损 -{s.atr_stop.dynamic_stop_loss}%
                  </span>
                </div>
                <div className="text-[9px] opacity-80">
                  {s.atr_stop.adjust_reason}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：交易明细 */}
        <div className="p-3">
          <div className="text-[10px] font-medium text-[var(--text-tertiary)] mb-2">
            历史交易明细（回测期内共 {s.trade_count} 笔）
          </div>
          {hasTraded ? (
            <div className="space-y-1.5">
              {s.trades.map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 p-2 rounded border text-[11px]",
                    t.return_pct > 0
                      ? "bg-[#e84444]/05 border-[#e84444]/20"
                      : t.return_pct < 0
                        ? "bg-[#09d464]/05 border-[#09d464]/20"
                        : "bg-[var(--bg-secondary)] border-[var(--border-color)]",
                  )}
                >
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[var(--text-tertiary)] text-[9px]">
                        信号 {t.signal_date}
                      </span>
                      <span className="text-[9px] text-[var(--text-tertiary)]">
                        →
                      </span>
                      <span className="font-medium text-[var(--text-secondary)] flex items-center gap-1">
                        买入 {t.buy_date}{" "}
                        <span className="text-[9px] font-normal text-[var(--text-tertiary)]">
                          开盘
                        </span>{" "}
                        @ {t.buy_price}
                        <TradeInfoPopup trade={t} type="buy" />
                      </span>
                      <span className="text-[9px] text-[var(--text-tertiary)]">
                        →
                      </span>
                      <span className="font-medium text-[var(--text-secondary)] flex items-center gap-1">
                        卖出 {t.sell_date}{" "}
                        <span className="text-[9px] font-normal text-[var(--text-tertiary)]">
                          收盘
                        </span>{" "}
                        @ {t.sell_price}
                        <TradeInfoPopup trade={t} type="sell" />
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="text-[var(--text-tertiary)]">
                        持仓 {t.hold_days} 天
                      </span>
                      <span className="text-[var(--text-tertiary)]">·</span>
                      <span className="text-[var(--text-tertiary)]">
                        {t.exit_reason}
                      </span>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "font-mono font-bold text-sm shrink-0",
                      pctColor(t.return_pct),
                    )}
                  >
                    {fmtPct(t.return_pct, 2)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <XCircle size={20} className="text-[var(--text-tertiary)]" />
              <div className="text-[11px] text-[var(--text-tertiary)]">
                回测期内未产生任何买入信号
              </div>
              <div className="text-[10px] text-[var(--text-tertiary)] max-w-[180px]">
                该策略的触发条件在此股票的回测时间范围内均未满足
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 技术分析区块（内联在策略之后）────────────────────────────────────────────

function TechnicalPanel({ tech }: { tech: TechnicalData }) {
  const [expanded, setExpanded] = useState(false);

  const PriceRow = ({
    label,
    targetPrice,
    vsPct,
    desc,
  }: {
    label: string;
    targetPrice: number | null;
    vsPct: number | null;
    desc: string;
  }) => {
    if (targetPrice === null || vsPct === null) return null;
    return (
      <div className="flex items-center gap-3 py-1.5 border-b border-[var(--border-color)] last:border-0">
        <div className="w-16 text-[11px] text-[var(--text-tertiary)] shrink-0">
          {label}
        </div>
        <div className="flex-1 text-[11px] text-[var(--text-secondary)]">
          {desc}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "text-sm font-mono font-bold w-16 text-right",
              pctColor(vsPct),
            )}
          >
            {fmtPct(vsPct)}
          </span>
          <span className="text-[11px] font-mono text-[var(--text-tertiary)] w-12 text-right">
            {targetPrice.toFixed(2)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart2 size={13} className="text-[#f5a623]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            技术指标参考
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)]">
            当前价 {tech.current_price.toFixed(2)} · 量比{" "}
            <span className={tech.vol_ratio >= 1.5 ? "text-[#e84444]" : ""}>
              {tech.vol_ratio?.toFixed(2) ?? "—"}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {expanded ? "收起" : "查看均线/布林带/支撑压力位"}
          </span>
          {expanded ? (
            <ChevronUp size={14} className="text-[var(--text-tertiary)]" />
          ) : (
            <ChevronDown size={14} className="text-[var(--text-tertiary)]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-[var(--border-color)]">
          {/* 说明 */}
          <div className="flex items-start gap-2 mt-3 p-2.5 bg-[var(--bg-tertiary)] rounded-lg">
            <Info
              size={11}
              className="text-[var(--text-tertiary)] shrink-0 mt-0.5"
            />
            <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
              <strong className="text-[var(--text-secondary)]">
                百分比含义：
              </strong>
              当前价格相对该指标价位的涨跌幅。 正数（红色）=
              当前价高于该指标位，说明已突破/在上方； 负数（绿色）=
              当前价低于该指标位，说明仍在下方/未突破。
              <br />
              <strong className="text-[var(--text-secondary)] mt-1 block">
                支撑位 / 压力位
              </strong>
              支撑位（绿色）= 近期回调的低点密集区，可作为买入参考；
              压力位（红色）= 近期高点密集区，可作为止盈参考或观察突破位。
            </p>
          </div>

          {/* 均线水位 */}
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)] font-medium mb-1">
              均线水位（当前价相对各均线的偏离度）
            </div>
            <PriceRow
              label="MA5（5日）"
              targetPrice={tech.ma5}
              vsPct={tech.vs_ma5}
              desc={
                tech.vs_ma5 !== null
                  ? tech.vs_ma5 > 0
                    ? "当前价高于5日均线，短期趋势偏强"
                    : "当前价低于5日均线，短期走弱或回踩"
                  : ""
              }
            />
            <PriceRow
              label="MA20（20日）"
              targetPrice={tech.ma20}
              vsPct={tech.vs_ma20}
              desc={
                tech.vs_ma20 !== null
                  ? tech.vs_ma20 > 0
                    ? "在20日均线上方，中期趋势较好"
                    : "在20日均线下方，中期趋势偏弱"
                  : ""
              }
            />
            <PriceRow
              label="MA60（60日）"
              targetPrice={tech.ma60}
              vsPct={tech.vs_ma60}
              desc={
                tech.vs_ma60 !== null
                  ? tech.vs_ma60 > 0
                    ? "站稳60日均线，长期趋势偏多"
                    : "位于60日均线下方，长期压力较大"
                  : ""
              }
            />
          </div>

          {/* 布林带 */}
          {tech.boll_upper !== null && (
            <div>
              <div className="text-[10px] text-[var(--text-tertiary)] font-medium mb-1">
                布林带位置（20日布林带，±2倍标准差）
              </div>
              <PriceRow
                label="上轨（压力）"
                targetPrice={tech.boll_upper}
                vsPct={tech.vs_boll_upper}
                desc={
                  tech.vs_boll_upper !== null
                    ? tech.vs_boll_upper >= 0
                      ? "已突破布林上轨，超买风险，注意止盈"
                      : `距上轨还有 ${Math.abs(tech.vs_boll_upper).toFixed(1)}%，上轨为近期压力位`
                    : ""
                }
              />
              {tech.boll_mid !== null && (
                <PriceRow
                  label="中轨（均衡）"
                  targetPrice={tech.boll_mid}
                  vsPct={
                    tech.boll_mid > 0
                      ? ((tech.current_price - tech.boll_mid) / tech.boll_mid) *
                        100
                      : null
                  }
                  desc="中轨（20日MA）为多空均衡线，站上偏多，跌破偏空"
                />
              )}
              <PriceRow
                label="下轨（支撑）"
                targetPrice={tech.boll_lower}
                vsPct={tech.vs_boll_lower}
                desc={
                  tech.vs_boll_lower !== null
                    ? tech.vs_boll_lower > 0
                      ? "当前价高于下轨，布林带内运行"
                      : "当前价跌破下轨，超卖信号，可关注反弹"
                    : ""
                }
              />
            </div>
          )}

          {/* 支撑 / 压力 */}
          {(tech.support_levels.length > 0 ||
            tech.resistance_levels.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Shield size={11} className="text-[#09d464]" />
                  <span className="text-[10px] text-[var(--text-tertiary)] font-medium">
                    支撑位（近期低点密集区，可作买入参考）
                  </span>
                </div>
                <div className="space-y-1">
                  {tech.support_levels.map((v, i) => {
                    const pct = ((tech.current_price - v) / v) * 100;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between px-2 py-1 bg-[#09d464]/05 border border-[#09d464]/20 rounded text-[11px]"
                      >
                        <span className="font-mono font-semibold text-[#09d464]">
                          {v.toFixed(2)}
                        </span>
                        <span
                          className={cn("font-mono text-[10px]", pctColor(pct))}
                        >
                          当前高 {fmtPct(pct)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Target size={11} className="text-[#e84444]" />
                  <span className="text-[10px] text-[var(--text-tertiary)] font-medium">
                    压力位（近期高点密集区，可作止盈参考）
                  </span>
                </div>
                <div className="space-y-1">
                  {tech.resistance_levels.map((v, i) => {
                    const pct =
                      ((v - tech.current_price) / tech.current_price) * 100;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between px-2 py-1 bg-[#e84444]/05 border border-[#e84444]/20 rounded text-[11px]"
                      >
                        <span className="font-mono font-semibold text-[#e84444]">
                          {v.toFixed(2)}
                        </span>
                        <span
                          className={cn("font-mono text-[10px]", pctColor(pct))}
                        >
                          距此 +{fmtPct(pct)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── AI 综合研判 ───────────────────────────────────────────────────────────────

function AIJudgment({ data }: { data: DiagnosisResult }) {
  const [loading, setLoading] = useState(false);
  const [judgment, setJudgment] = useState<string>("");
  const [error, setError] = useState("");

  const generate = useCallback(async () => {
    setLoading(true);
    setError("");
    setJudgment("");

    const best = data.best_strategy;
    const tech = data.technical;
    const hasSignal = data.current_signals.length > 0;

    const prompt = `你是专业股票技术分析师，请对以下股票给出简洁的综合研判（约200字，中文，使用Markdown格式）：

股票：${data.name}（${data.code}）
当前价：${tech.current_price}元
回测周期：${data.backtest_period.start} ~ ${data.backtest_period.end}

【策略回测排名（前3名）】
${data.strategy_ranking
  .slice(0, 3)
  .map(
    (s) =>
      `- ${s.rank}. ${s.label}：交易${s.trade_count}次，胜率${s.win_rate.toFixed(1)}%，均收益${fmtPct(s.avg_return)}，得分${s.score}`,
  )
  .join("\n")}

【当前触发信号策略】：${hasSignal ? data.current_signals.map((id) => data.strategy_ranking.find((s) => s.id === id)?.label ?? id).join("、") : "无"}

【技术指标】
- vs MA5: ${fmtPct(tech.vs_ma5)}，vs MA20: ${fmtPct(tech.vs_ma20)}，vs MA60: ${fmtPct(tech.vs_ma60)}
- 布林带：距上轨 ${fmtPct(tech.vs_boll_upper)}，距下轨 ${fmtPct(tech.vs_boll_lower)}
- 量比：${tech.vol_ratio?.toFixed(2) ?? "—"}
- 支撑位：${tech.support_levels.map((v) => v.toFixed(2)).join("、") || "—"}
- 压力位：${tech.resistance_levels.map((v) => v.toFixed(2)).join("、") || "—"}
${best ? `\n最佳策略：${best.label}（止盈+${best.stop_profit}%/止损-${best.stop_loss}%/最长${best.max_hold_days}天）` : ""}

请输出三个维度：
1. 当前技术面形态研判（多/空/震荡）
2. 关键价格区间（买入参考/压力/止盈）
3. 操作建议（结合最佳策略）`;

    try {
      const res = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system:
            "你是专业股票技术分析师，请给出简洁、客观的操作研判，使用Markdown格式输出，不构成投资建议。",
          prompt,
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "AI 服务异常");
      }
      const d = (await res.json()) as { result?: string };
      setJudgment(d.result ?? "AI 未返回内容");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 分析失败");
    } finally {
      setLoading(false);
    }
  }, [data]);

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-500/15 flex items-center justify-center">
            <Brain size={12} className="text-purple-400" />
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            AI 综合研判
          </span>
        </div>
        {!judgment && !loading && (
          <button
            onClick={generate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 transition-all border border-purple-500/30"
          >
            <Sparkles size={11} />
            生成分析
          </button>
        )}
        {judgment && !loading && (
          <button
            onClick={generate}
            className="text-[10px] text-[var(--text-tertiary)] hover:text-purple-400 transition-colors"
          >
            重新生成
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-4 justify-center">
          <Loader2 size={13} className="animate-spin text-purple-400" />
          AI 正在分析中...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 p-2 bg-red-500/10 rounded-lg">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {judgment && !loading && (
        <div
          className="prose prose-sm prose-invert max-w-none text-[12px] leading-relaxed
          [&_h1]:text-[var(--text-primary)] [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-3
          [&_h2]:text-[var(--text-primary)] [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-3
          [&_h3]:text-[var(--text-primary)] [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-2.5
          [&_p]:text-[var(--text-secondary)] [&_p]:mb-2 [&_p]:leading-relaxed
          [&_strong]:text-[var(--text-primary)] [&_strong]:font-semibold
          [&_ul]:space-y-0.5 [&_ul]:mb-2 [&_li]:text-[var(--text-secondary)]
          [&_table]:w-full [&_table]:text-[11px] [&_table]:border-collapse
          [&_th]:text-left [&_th]:text-[var(--text-tertiary)] [&_th]:font-medium [&_th]:py-1 [&_th]:px-2 [&_th]:border-b [&_th]:border-[var(--border-color)]
          [&_td]:py-1 [&_td]:px-2 [&_td]:text-[var(--text-secondary)] [&_td]:border-b [&_td]:border-[var(--border-color)]
          [&_blockquote]:border-l-2 [&_blockquote]:border-purple-500/40 [&_blockquote]:pl-3 [&_blockquote]:text-[var(--text-tertiary)] [&_blockquote]:italic
          [&_code]:text-[#f5a623] [&_code]:bg-[var(--bg-tertiary)] [&_code]:px-1 [&_code]:rounded [&_code]:text-[11px]
          "
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{judgment}</ReactMarkdown>
        </div>
      )}

      {!judgment && !loading && !error && (
        <div className="text-[11px] text-[var(--text-tertiary)] text-center py-3">
          点击「生成分析」，AI 将综合策略回测与技术指标给出操作建议
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

interface StockDiagnosisProps {
  stock: { code: string; name: string };
  onClose?: () => void;
}

export default function StockDiagnosis({
  stock,
  onClose,
}: StockDiagnosisProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState("");
  const [showAllStrategies, setShowAllStrategies] = useState(false);
  const [days, setDays] = useState(120);
  // 展开的策略行
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    setData(null);
    setExpandedIds(new Set());
    try {
      const res = await fetch(
        `${API}/api/backtest/analyze/${stock.code}?days=${days}`,
      );
      if (!res.ok) {
        const d = (await res.json()) as { detail?: string };
        throw new Error(d.detail ?? `请求失败 (${res.status})`);
      }
      const result = (await res.json()) as DiagnosisResult;
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "诊断失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [stock.code, days]);

  const tech = data?.technical ?? null;
  const ranking = data?.strategy_ranking ?? [];
  const displayRanking = showAllStrategies ? ranking : ranking.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* ── 头部 */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#f5a623]/15 flex items-center justify-center">
              <Activity size={14} className="text-[#f5a623]" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                股票诊断
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)]">
                跑全部策略历史回测，筛选最佳策略 + 技术面分析
              </div>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ChevronUp size={16} />
            </button>
          )}
        </div>

        {/* 股票信息 + 参数 */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f5a623]/10 border border-[#f5a623]/30 rounded-lg">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {stock.name}
            </span>
            <span className="text-[11px] font-mono text-[var(--text-tertiary)]">
              {stock.code}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--text-tertiary)]">
              回测天数
            </span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50"
            >
              <option value={60}>60天</option>
              <option value={120}>120天</option>
              <option value={180}>180天</option>
              <option value={240}>240天</option>
            </select>
          </div>
        </div>

        {/* 运行按钮 */}
        {!loading ? (
          <button
            onClick={run}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[#f5a623] text-black hover:bg-[#e8961a] shadow-sm transition-all"
          >
            <Zap size={14} />
            开始诊断
          </button>
        ) : (
          <div className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] w-fit">
            <Loader2 size={14} className="animate-spin" />
            诊断中，跑全部策略回测...
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      {/* ── 诊断结果 */}
      {data && (
        <>
          {/* 概览栏 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-3 text-center">
              <div className="text-[10px] text-[var(--text-tertiary)] mb-1">
                当前价格
              </div>
              <div className="text-lg font-bold font-mono text-[var(--text-primary)]">
                {tech?.current_price?.toFixed(2) ?? "—"}
              </div>
              <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                {data.backtest_period.start} ~ {data.backtest_period.end}
              </div>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-3 text-center">
              <div className="text-[10px] text-[var(--text-tertiary)] mb-1">
                当前触发信号
              </div>
              {data.current_signals.length > 0 ? (
                <div className="flex flex-wrap gap-1 justify-center">
                  {data.current_signals.map((id) => {
                    const s = ranking.find((r) => r.id === id);
                    return (
                      <span
                        key={id}
                        className="px-1.5 py-0.5 bg-[#e84444]/15 border border-[#e84444]/40 text-[#e84444] text-[9px] rounded font-medium"
                      >
                        {s?.label ?? id}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                  <XCircle size={12} />
                  暂无信号
                </div>
              )}
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-3 text-center">
              <div className="text-[10px] text-[var(--text-tertiary)] mb-1">
                最佳策略
              </div>
              {data.best_strategy ? (
                <>
                  <div className="text-xs font-semibold text-[#f5a623] leading-tight mb-1">
                    {data.best_strategy.label}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[10px]">
                    <span className="text-[#09d464]">
                      胜率 {data.best_strategy.win_rate.toFixed(0)}%
                    </span>
                    <span className={pctColor(data.best_strategy.avg_return)}>
                      均收 {fmtPct(data.best_strategy.avg_return)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-[var(--text-tertiary)]">—</div>
              )}
            </div>
          </div>

          {/* 策略排名表（可点击展开详情） */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <Trophy size={13} className="text-[#f5a623]" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  策略历史回测排名
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  共 {ranking.length} 个策略 · 点击行展开交易明细
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Info size={10} className="text-[var(--text-tertiary)]" />
                <span className="text-[9px] text-[var(--text-tertiary)]">
                  综合得分 = 胜率×0.4 + 均收益×0.4 + 信号频率×0.2
                </span>
              </div>
            </div>

            {/* 列标题行 */}
            <div className="grid grid-cols-[32px_1fr_80px_64px_80px_120px_100px_32px] items-center px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)]">
              <div className="text-[9px] text-[var(--text-tertiary)] font-medium">
                #
              </div>
              <div className="text-[9px] text-[var(--text-tertiary)] font-medium">
                策略名称
              </div>
              <div className="text-[9px] text-[var(--text-tertiary)] font-medium text-right">
                交易次数
              </div>
              <div className="text-[9px] text-[var(--text-tertiary)] font-medium text-right">
                胜率
              </div>
              <div className="text-[9px] text-[var(--text-tertiary)] font-medium text-right">
                均收益
              </div>
              <div className="text-[9px] text-[var(--text-tertiary)] font-medium text-right">
                退出规则
              </div>
              <div className="text-[9px] text-[var(--text-tertiary)] font-medium text-right">
                综合得分
              </div>
              <div />
            </div>

            {displayRanking.map((s) => {
              const isSignal = data.current_signals.includes(s.id);
              const isBest = s.rank === 1 && s.score > 0;
              const isExpanded = expandedIds.has(s.id);

              return (
                <div
                  key={s.id}
                  className="border-b border-[var(--border-color)] last:border-0"
                >
                  {/* 主行（可点击展开） */}
                  <button
                    onClick={() => toggleExpand(s.id)}
                    className={cn(
                      "w-full text-left transition-colors",
                      isSignal
                        ? "bg-[#e84444]/05 hover:bg-[#e84444]/10"
                        : "hover:bg-[var(--bg-hover)]",
                    )}
                  >
                    <div className="grid grid-cols-[32px_1fr_80px_64px_80px_120px_100px_32px] items-center px-3 py-2.5 text-xs">
                      {/* 排名 */}
                      <div>
                        {isBest ? (
                          <Trophy size={12} className="text-[#f5a623]" />
                        ) : (
                          <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                            {s.rank}
                          </span>
                        )}
                      </div>
                      {/* 策略名 */}
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "font-medium",
                            isBest
                              ? "text-[#f5a623]"
                              : "text-[var(--text-primary)]",
                          )}
                        >
                          {s.label}
                        </span>
                        {isSignal && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-[#e84444]/15 border border-[#e84444]/40 text-[#e84444] text-[8px] rounded font-bold">
                            <Zap size={8} />
                            当前信号
                          </span>
                        )}
                      </div>
                      {/* 交易次数 */}
                      <div className="text-right font-mono text-[var(--text-secondary)]">
                        {s.trade_count > 0 ? (
                          s.trade_count
                        ) : (
                          <span className="text-[var(--text-tertiary)]">—</span>
                        )}
                      </div>
                      {/* 胜率 */}
                      <div className="text-right">
                        {s.trade_count > 0 ? (
                          <span
                            className={cn(
                              "font-mono font-semibold",
                              s.win_rate >= 60
                                ? "text-[#e84444]"
                                : s.win_rate >= 40
                                  ? "text-[#f5a623]"
                                  : "text-[#09d464]",
                            )}
                          >
                            {s.win_rate.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-[var(--text-tertiary)] font-mono">
                            —
                          </span>
                        )}
                      </div>
                      {/* 均收益 */}
                      <div className="text-right">
                        {s.trade_count > 0 ? (
                          <span
                            className={cn(
                              "font-mono font-semibold",
                              pctColor(s.avg_return),
                            )}
                          >
                            {fmtPct(s.avg_return)}
                          </span>
                        ) : (
                          <span className="text-[var(--text-tertiary)] font-mono">
                            —
                          </span>
                        )}
                      </div>
                      {/* 退出规则 */}
                      <div className="flex items-center justify-end gap-1 text-[10px]">
                        <span className="text-[#09d464]">
                          +{s.stop_profit}%
                        </span>
                        <span className="text-[var(--text-tertiary)]">/</span>
                        <span className="text-[#e84444]">-{s.stop_loss}%</span>
                        <span className="text-[var(--text-tertiary)]">/</span>
                        <span className="text-[var(--text-secondary)]">
                          {s.max_hold_days}天
                        </span>
                      </div>
                      {/* 综合得分 */}
                      <div className="flex items-center justify-end gap-2">
                        <ScoreBar score={s.score} />
                        <span
                          className={cn(
                            "font-mono font-bold text-sm w-8 text-right",
                            scoreColor(s.score),
                          )}
                        >
                          {s.score > 0 ? s.score.toFixed(0) : "—"}
                        </span>
                      </div>
                      {/* 展开箭头 */}
                      <div className="flex justify-center">
                        {isExpanded ? (
                          <ChevronUp
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
                    </div>
                  </button>

                  {/* 展开面板 */}
                  {isExpanded && (
                    <StrategyExpandPanel
                      s={s}
                      isSignal={isSignal}
                      tech={tech}
                    />
                  )}
                </div>
              );
            })}

            {/* 列标题（放在最上方数据行之前，通过 CSS 处理） */}
            {/* 展开/收起按钮 */}
            {ranking.length > 5 && (
              <div className="px-4 py-2 border-t border-[var(--border-color)] text-center">
                <button
                  onClick={() => setShowAllStrategies((v) => !v)}
                  className="flex items-center gap-1 mx-auto text-[11px] text-[#f5a623] hover:text-[#e8961a] transition-colors"
                >
                  {showAllStrategies ? (
                    <>
                      <ChevronUp size={12} /> 收起
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} /> 展开全部 {ranking.length} 个策略
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 技术指标参考（可折叠） */}
          {tech && <TechnicalPanel tech={tech} />}

          {/* AI 综合研判 */}
          <AIJudgment data={data} />
        </>
      )}
    </div>
  );
}
