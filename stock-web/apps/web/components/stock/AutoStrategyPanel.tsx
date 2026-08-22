"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Wand2,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Pencil,
  Play,
  Trophy,
  BarChart2,
  AlertCircle,
  Save,
  X,
  Info,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface AutoStrategyResult {
  rank: number;
  id: string;
  label: string;
  indicators: string[];
  sql: string;
  stop_profit: number;
  stop_loss: number;
  max_hold_days: number;
  trade_count: number;
  win_rate: number;
  avg_return: number;
  signal_count: number;
  score: number;
  backtest_period: { start: string; end: string; days: number };
}

interface AutoStrategyResponse {
  code: string;
  name: string;
  total_candidates: number;
  valid_candidates: number;
  backtest_period: { start: string; end: string; days: number };
  top_strategies: AutoStrategyResult[];
}

interface UserStrategy {
  id: number;
  name: string;
  description: string;
  for_code: string | null;
  for_name: string | null;
  sql_text: string;
  stop_profit: number;
  stop_loss: number;
  max_hold_days: number;
  win_rate: number | null;
  avg_return: number | null;
  trade_count: number | null;
  score: number | null;
  indicators: string | null;
  source: string;
  created_at: string;
}

interface Props {
  stock: { code: string; name: string };
  onApplyStrategy: (
    sql: string,
    stopProfit: number,
    stopLoss: number,
    maxHoldDays: number,
    label: string,
  ) => void;
  onClose?: () => void;
}

// ── 辅助组件 ──────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const w = Math.min(Math.max(score, 0), 100);
  const color = score >= 60 ? "#e84444" : score >= 40 ? "#f5a623" : "#888";
  return (
    <div className="w-14 h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${w}%`, backgroundColor: color }}
      />
    </div>
  );
}

function pctColor(v: number) {
  return v > 0
    ? "text-[#e84444]"
    : v < 0
      ? "text-[#09d464]"
      : "text-[var(--text-secondary)]";
}

function fmtPct(v: number, digits = 1) {
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

// ── 指标标签颜色 ──────────────────────────────────────────────────────────────

const INDICATOR_COLORS: Record<string, string> = {
  MACD: "bg-blue-500/15 text-blue-400",
  RSI: "bg-purple-500/15 text-purple-400",
  KDJ: "bg-orange-500/15 text-orange-400",
  MA: "bg-emerald-500/15 text-emerald-400",
  BOLL: "bg-cyan-500/15 text-cyan-400",
  VOL: "bg-yellow-500/15 text-yellow-400",
  RIGHT_BREAK: "bg-[#f5a623]/15 text-[#f5a623]",
  LOW: "bg-red-500/15 text-red-400",
};

function IndicatorTag({ ind }: { ind: string }) {
  const cls =
    INDICATOR_COLORS[ind] ??
    "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]";
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium", cls)}>
      {ind}
    </span>
  );
}

// ── 候选策略卡片 ──────────────────────────────────────────────────────────────

function CandidateCard({
  s,
  onSave,
  onApply,
}: {
  s: AutoStrategyResult;
  onSave: (s: AutoStrategyResult) => void;
  onApply: (s: AutoStrategyResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
      {/* 主行 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left"
      >
        {/* 排名 */}
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
            s.rank === 1
              ? "bg-[#f5a623] text-black"
              : s.rank === 2
                ? "bg-[var(--text-tertiary)]/30 text-[var(--text-primary)]"
                : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]",
          )}
        >
          {s.rank}
        </div>

        {/* 策略名 + 指标标签 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-[var(--text-primary)] truncate">
              {s.label}
            </span>
            {s.indicators.map((ind) => (
              <IndicatorTag key={ind} ind={ind} />
            ))}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-[var(--text-tertiary)]">
            <span>{s.trade_count} 笔交易</span>
            <span>信号 {s.signal_count} 次</span>
            <span>
              止盈 +{s.stop_profit}% / 止损 -{s.stop_loss}% / 最长{" "}
              {s.max_hold_days}天
            </span>
          </div>
        </div>

        {/* 统计数字 */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <div className="text-[10px] text-[var(--text-tertiary)]">胜率</div>
            <div
              className={cn(
                "text-sm font-bold font-mono",
                s.win_rate >= 60
                  ? "text-[#e84444]"
                  : s.win_rate >= 50
                    ? "text-[#f5a623]"
                    : "text-[var(--text-secondary)]",
              )}
            >
              {s.win_rate.toFixed(1)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[var(--text-tertiary)]">
              均收益
            </div>
            <div
              className={cn(
                "text-sm font-bold font-mono",
                pctColor(s.avg_return),
              )}
            >
              {fmtPct(s.avg_return)}
            </div>
          </div>
          <div className="text-right flex items-center gap-1.5">
            <ScoreBar score={s.score} />
            <div
              className={cn(
                "text-sm font-bold w-8 text-right",
                s.score >= 60
                  ? "text-[#e84444]"
                  : s.score >= 40
                    ? "text-[#f5a623]"
                    : "text-[var(--text-secondary)]",
              )}
            >
              {s.score.toFixed(0)}
            </div>
          </div>
          {expanded ? (
            <ChevronUp size={12} className="text-[var(--text-tertiary)]" />
          ) : (
            <ChevronDown size={12} className="text-[var(--text-tertiary)]" />
          )}
        </div>
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="border-t border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-3 space-y-3">
          {/* SQL 预览 */}
          <div>
            <div className="text-[10px] font-medium text-[var(--text-tertiary)] mb-1.5">
              策略 SQL（可在回测中修改）
            </div>
            <pre className="text-[10px] font-mono text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-lg p-3 overflow-x-auto max-h-40 leading-relaxed">
              {s.sql}
            </pre>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onApply(s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#f5a623] text-black hover:bg-[#e8961a] transition-all"
            >
              <Play size={11} fill="currentColor" />
              应用到回测
            </button>
            <button
              onClick={async () => {
                if (saving || saved) return;
                setSaving(true);
                await onSave(s);
                setSaving(false);
                setSaved(true);
              }}
              disabled={saving || saved}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                saved
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 cursor-default"
                  : "bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#f5a623]/40 hover:text-[#f5a623]",
              )}
            >
              {saving ? (
                <Loader2 size={11} className="animate-spin" />
              ) : saved ? (
                <CheckCircle2 size={11} />
              ) : (
                <Save size={11} />
              )}
              {saved ? "已保存" : "保存策略"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 已保存策略卡片 ────────────────────────────────────────────────────────────

function SavedStrategyCard({
  s,
  onApply,
  onDelete,
  onEdit,
}: {
  s: UserStrategy;
  onApply: (s: UserStrategy) => void;
  onDelete: (id: number) => void;
  onEdit: (s: UserStrategy) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="border border-[var(--border-color)] rounded-xl px-4 py-3 hover:border-[#f5a623]/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
              {s.name}
            </span>
            {s.for_code && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#f5a623]/15 text-[#f5a623] font-medium shrink-0">
                专属 {s.for_name ?? s.for_code}
              </span>
            )}
            <span
              className={cn(
                "text-[9px] px-1 py-0.5 rounded shrink-0",
                s.source === "auto"
                  ? "bg-purple-500/15 text-purple-400"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]",
              )}
            >
              {s.source === "auto" ? "AI定制" : "手工"}
            </span>
          </div>
          {s.description && (
            <p className="text-[10px] text-[var(--text-tertiary)] mb-1.5 leading-relaxed">
              {s.description}
            </p>
          )}
          <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
            {s.win_rate !== null && (
              <span>
                胜率{" "}
                <span
                  className={cn(
                    "font-mono font-medium",
                    s.win_rate >= 60
                      ? "text-[#e84444]"
                      : s.win_rate >= 50
                        ? "text-[#f5a623]"
                        : "",
                  )}
                >
                  {s.win_rate.toFixed(1)}%
                </span>
              </span>
            )}
            {s.avg_return !== null && (
              <span>
                均收益{" "}
                <span
                  className={cn(
                    "font-mono font-medium",
                    pctColor(s.avg_return),
                  )}
                >
                  {fmtPct(s.avg_return)}
                </span>
              </span>
            )}
            {s.trade_count !== null && <span>{s.trade_count} 笔</span>}
            <span>
              止盈 +{s.stop_profit}% / 止损 -{s.stop_loss}%
            </span>
          </div>
        </div>

        {/* 操作 */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onApply(s)}
            title="应用到回测"
            className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-tertiary)] hover:text-[#f5a623] hover:bg-[#f5a623]/10 transition-all"
          >
            <Play size={11} fill="currentColor" />
          </button>
          <button
            onClick={() => onEdit(s)}
            title="编辑"
            className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-tertiary)] hover:text-blue-400 hover:bg-blue-500/10 transition-all"
          >
            <Pencil size={10} />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1 ml-1">
              <span className="text-[10px] text-red-400">确认删除?</span>
              <button
                onClick={async () => {
                  setDeleting(true);
                  await onDelete(s.id);
                  setDeleting(false);
                  setConfirmDelete(false);
                }}
                disabled={deleting}
                className="text-[10px] text-red-400 hover:text-red-300 font-medium"
              >
                {deleting ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  "是"
                )}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                否
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="删除"
              className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 编辑弹窗 ──────────────────────────────────────────────────────────────────

function EditModal({
  strategy,
  onSave,
  onClose,
}: {
  strategy: UserStrategy;
  onSave: (id: number, data: Partial<UserStrategy>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(strategy.name);
  const [desc, setDesc] = useState(strategy.description ?? "");
  const [sql, setSql] = useState(strategy.sql_text);
  const [stopProfit, setStopProfit] = useState(strategy.stop_profit);
  const [stopLoss, setStopLoss] = useState(strategy.stop_loss);
  const [maxHold, setMaxHold] = useState(strategy.max_hold_days);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl mx-4 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Pencil size={14} className="text-[#f5a623]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              编辑策略
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 名称 */}
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-tertiary)] mb-1">
              策略名称
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50"
            />
          </div>
          {/* 描述 */}
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-tertiary)] mb-1">
              策略描述
            </label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="简要描述策略逻辑（可选）"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50"
            />
          </div>
          {/* 参数 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "止盈 (%)", val: stopProfit, set: setStopProfit },
              { label: "止损 (%)", val: stopLoss, set: setStopLoss },
              { label: "最长持仓 (天)", val: maxHold, set: setMaxHold },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <label className="block text-[10px] font-medium text-[var(--text-tertiary)] mb-1">
                  {label}
                </label>
                <input
                  type="number"
                  value={val}
                  onChange={(e) => set(Number(e.target.value))}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50"
                />
              </div>
            ))}
          </div>
          {/* SQL */}
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-tertiary)] mb-1">
              选股 SQL
            </label>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={10}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50 resize-none"
            />
          </div>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border-color)]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={async () => {
              setSaving(true);
              await onSave(strategy.id, {
                name,
                description: desc,
                sql_text: sql,
                stop_profit: stopProfit,
                stop_loss: stopLoss,
                max_hold_days: maxHold,
              });
              setSaving(false);
              onClose();
            }}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-[#f5a623] text-black hover:bg-[#e8961a] transition-all"
          >
            {saving ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Save size={11} />
            )}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export default function AutoStrategyPanel({
  stock,
  onApplyStrategy,
  onClose,
}: Props) {
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<AutoStrategyResponse | null>(null);
  const [genError, setGenError] = useState("");
  const [days, setDays] = useState(120);
  const [elapsed, setElapsed] = useState(0);

  const [savedList, setSavedList] = useState<UserStrategy[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const [editTarget, setEditTarget] = useState<UserStrategy | null>(null);

  // 加载已保存策略
  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch(
        `${API}/api/backtest/user_strategies?code=${stock.code}`,
      );
      const d = (await res.json()) as { strategies: UserStrategy[] };
      setSavedList(d.strategies ?? []);
    } catch {
      // 静默
    } finally {
      setSavedLoading(false);
    }
  }, [stock.code]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  // 生成策略
  const generate = useCallback(async () => {
    setGenLoading(true);
    setGenError("");
    setGenResult(null);
    setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    try {
      const res = await fetch(
        `${API}/api/backtest/auto_strategy/${stock.code}?days=${days}&top_n=5`,
      );
      if (!res.ok) {
        const d = (await res.json()) as { detail?: string };
        throw new Error(d.detail ?? `请求失败 (${res.status})`);
      }
      const data = (await res.json()) as AutoStrategyResponse;
      setGenResult(data);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "生成失败，请重试");
    } finally {
      clearInterval(timer);
      setGenLoading(false);
    }
  }, [stock.code, days]);

  // 保存某个候选策略
  const saveCandidate = useCallback(
    async (s: AutoStrategyResult) => {
      try {
        await fetch(`${API}/api/backtest/user_strategies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${s.label}（${stock.name}专属）`,
            description: `AI 定制策略，指标：${s.indicators.join("+")}，回测期 ${s.backtest_period.start}~${s.backtest_period.end}`,
            for_code: stock.code,
            for_name: stock.name,
            sql_text: s.sql,
            stop_profit: s.stop_profit,
            stop_loss: s.stop_loss,
            max_hold_days: s.max_hold_days,
            win_rate: s.win_rate,
            avg_return: s.avg_return,
            trade_count: s.trade_count,
            score: s.score,
            indicators: s.indicators.join(","),
            source: "auto",
          }),
        });
        await loadSaved();
      } catch {
        // 静默
      }
    },
    [stock, loadSaved],
  );

  // 应用某个候选策略到回测
  const applyCandidate = useCallback(
    (s: AutoStrategyResult) => {
      onApplyStrategy(
        s.sql,
        s.stop_profit,
        s.stop_loss,
        s.max_hold_days,
        `${s.label}（${stock.name}专属）`,
      );
    },
    [stock.name, onApplyStrategy],
  );

  // 应用已保存策略到回测
  const applySaved = useCallback(
    (s: UserStrategy) => {
      onApplyStrategy(
        s.sql_text,
        s.stop_profit,
        s.stop_loss,
        s.max_hold_days,
        s.name,
      );
    },
    [onApplyStrategy],
  );

  // 删除已保存策略
  const deleteSaved = useCallback(
    async (id: number) => {
      try {
        await fetch(`${API}/api/backtest/user_strategies/${id}`, {
          method: "DELETE",
        });
        await loadSaved();
      } catch {
        // 静默
      }
    },
    [loadSaved],
  );

  // 编辑已保存策略
  const editSaved = useCallback(
    async (id: number, data: Partial<UserStrategy>) => {
      try {
        await fetch(`${API}/api/backtest/user_strategies/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        await loadSaved();
      } catch {
        // 静默
      }
    },
    [loadSaved],
  );

  return (
    <div className="space-y-4">
      {/* ── 面板头部 */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#f5a623]/15 flex items-center justify-center">
              <Wand2 size={14} className="text-[#f5a623]" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                AI 策略定制
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)]">
                枚举技术指标组合 × 参数变体，在历史 K
                线上反复验证，找出高胜率策略
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

        {/* 股票 + 参数 */}
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
              验证历史
            </span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50"
            >
              <option value={90}>90天（快速）</option>
              <option value={120}>120天（推荐）</option>
              <option value={150}>150天</option>
              <option value={180}>180天（最长）</option>
            </select>
          </div>
        </div>

        {/* 说明 */}
        <div className="mb-3 flex items-start gap-1.5 text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-primary)] rounded-lg p-2.5">
          <Info size={10} className="shrink-0 mt-0.5" />
          <span>
            系统将自动组合
            MACD、RSI、KDJ、均线突破、布林带、量能等指标的多种参数变体（约 65
            种组合）， 在该股历史 K 线上逐一回测，按胜率 × 均收益 ×
            信号频率综合评分，返回 Top 5 最优策略。
            验证天数越长结果越稳定，耗时约 30-120 秒。
          </span>
        </div>

        {/* 生成按钮 */}
        {!genLoading ? (
          <button
            onClick={generate}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[#f5a623] text-black hover:bg-[#e8961a] shadow-sm transition-all"
          >
            <Sparkles size={14} />
            {genResult ? "重新生成" : "开始定制策略"}
          </button>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] w-fit">
              <Loader2 size={14} className="animate-spin" />
              正在枚举指标组合并回测验证，请稍候...
              <span className="text-[#f5a623] font-mono">{elapsed}s</span>
            </div>
            <div className="text-[10px] text-[var(--text-tertiary)] pl-1">
              约 65 种组合 × {days} 天历史数据，耗时 30-120 秒
            </div>
          </div>
        )}

        {genError && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            {genError}
          </div>
        )}
      </div>

      {/* ── 候选策略结果 */}
      {genResult && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
            <Trophy size={13} className="text-[#f5a623]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              高胜率策略 Top {genResult.top_strategies.length}
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">
              共验证 {genResult.total_candidates} 种组合 · 有效{" "}
              {genResult.valid_candidates} 种 · 回测期{" "}
              {genResult.backtest_period.start} ~{" "}
              {genResult.backtest_period.end}
            </span>
          </div>
          <div className="divide-y divide-[var(--border-color)]">
            {genResult.top_strategies.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-[var(--text-tertiary)]">
                未找到有效策略，该股在此期间技术指标信号较少。
                <br />
                建议增大验证天数（180天），或换量能活跃、趋势波动更大的个股。
              </div>
            ) : (
              genResult.top_strategies.map((s) => (
                <CandidateCard
                  key={s.id}
                  s={s}
                  onSave={saveCandidate}
                  onApply={applyCandidate}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── 已保存策略 */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
          <BarChart2 size={13} className="text-emerald-400" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            已保存策略
          </span>
          {savedList.length > 0 && (
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {savedList.length} 个
            </span>
          )}
          <button
            onClick={loadSaved}
            className="ml-auto text-[10px] text-[var(--text-tertiary)] hover:text-[#f5a623] transition-colors"
          >
            刷新
          </button>
        </div>
        <div className="p-3 space-y-2">
          {savedLoading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-4 justify-center">
              <Loader2 size={12} className="animate-spin" />
              加载中...
            </div>
          ) : savedList.length === 0 ? (
            <div className="text-center py-6 text-xs text-[var(--text-tertiary)]">
              暂无已保存策略，生成后点击「保存策略」即可保存
            </div>
          ) : (
            savedList.map((s) => (
              <SavedStrategyCard
                key={s.id}
                s={s}
                onApply={applySaved}
                onDelete={deleteSaved}
                onEdit={(s) => setEditTarget(s)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── 编辑弹窗 */}
      {editTarget && (
        <EditModal
          strategy={editTarget}
          onSave={editSaved}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
