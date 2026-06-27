"use client";

import { useState, useEffect, useRef } from "react";
import {
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  X,
  ChevronDown,
  ChevronRight,
  Edit2,
} from "lucide-react";
import { cn, getPriceColor, formatPercent } from "@/lib/utils";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
type TradeType = "buy" | "sell";

interface TradeRecord {
  id: string;
  type: TradeType;
  date: string;
  price: number;
  shares: number; // 股数（手 * 100）
  note: string;
}

interface HoldingStock {
  id: string;
  code: string;
  name: string;
  costPrice: number; // 成本价
  shares: number; // 持仓股数
  currentPrice?: number;
  trades: TradeRecord[];
}

const PORTFOLIO_KEY = "portfolio_holdings";
const PASSWORD = "111";

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
function calcPnl(stock: HoldingStock): {
  pnl: number;
  pnlPct: number;
  marketValue: number;
  costValue: number;
} {
  const costValue = stock.costPrice * stock.shares;
  const currentPrice = stock.currentPrice ?? stock.costPrice;
  const marketValue = currentPrice * stock.shares;
  const pnl = marketValue - costValue;
  const pnlPct = costValue > 0 ? (pnl / costValue) * 100 : 0;
  return { pnl, pnlPct, marketValue, costValue };
}

function loadHoldings(): HoldingStock[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(PORTFOLIO_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHoldings(holdings: HoldingStock[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(holdings));
  } catch {}
}

function formatMoney(n: number): string {
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + "万";
  return n.toFixed(2);
}

/* ─────────────────────────────────────────────
   Password Modal
───────────────────────────────────────────── */
function PasswordModal({
  onSuccess,
  onCancel,
  title = "输入密码",
}: {
  onSuccess: () => void;
  onCancel: () => void;
  title?: string;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (input === PASSWORD) {
      onSuccess();
    } else {
      setError(true);
      setInput("");
      setTimeout(() => setError(false), 1500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onCancel}
    >
      <div
        className="w-72 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-[var(--accent)]/15 flex items-center justify-center">
            <Lock size={18} className="text-[var(--accent)]" />
          </div>
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            {title}
          </span>
          <span className="text-[11px] text-[var(--text-tertiary)]">
            持仓信息受密码保护
          </span>
        </div>
        <div>
          <input
            ref={inputRef}
            type="password"
            maxLength={20}
            placeholder="请输入密码"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className={cn(
              "w-full px-3 py-2.5 rounded-xl text-center text-[14px] tracking-[0.4em] font-mono bg-[var(--bg-tertiary)] border outline-none transition-colors",
              error
                ? "border-red-500/70 animate-shake"
                : "border-[var(--border-color)] focus:border-[var(--accent)]",
            )}
          />
          {error && (
            <p className="text-center text-[11px] text-red-400 mt-1.5">
              密码错误
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl border border-[var(--border-color)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={submit}
            className="flex-1 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[12px] font-medium transition-colors"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Add / Edit Holding Modal
───────────────────────────────────────────── */
interface HoldingFormProps {
  initial?: HoldingStock;
  onSave: (stock: HoldingStock) => void;
  onClose: () => void;
}

function HoldingFormModal({ initial, onSave, onClose }: HoldingFormProps) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [costPrice, setCostPrice] = useState(
    initial?.costPrice ? String(initial.costPrice) : "",
  );
  const [shares, setShares] = useState(
    initial?.shares ? String(initial.shares) : "",
  );

  const handleSave = () => {
    const cp = parseFloat(costPrice);
    const sh = parseInt(shares);
    if (!code.trim() || isNaN(cp) || isNaN(sh) || cp <= 0 || sh <= 0) return;

    const stock: HoldingStock = {
      id: initial?.id ?? `holding-${Date.now()}`,
      code: code.trim(),
      name: name.trim() || code.trim(),
      costPrice: cp,
      shares: sh,
      currentPrice: initial?.currentPrice,
      trades: initial?.trades ?? [],
    };
    onSave(stock);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-96 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
          {initial ? "编辑持仓" : "添加持仓"}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] block mb-1">
              股票代码 *
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] text-[12px] outline-none focus:border-[var(--accent)]"
              placeholder="如 002463"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!!initial}
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] block mb-1">
              股票名称
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] text-[12px] outline-none focus:border-[var(--accent)]"
              placeholder="如 沪电股份"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] block mb-1">
              成本价 (元) *
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] text-[12px] font-mono outline-none focus:border-[var(--accent)]"
              placeholder="0.00"
              type="number"
              min="0"
              step="0.001"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] block mb-1">
              持仓股数 *
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] text-[12px] font-mono outline-none focus:border-[var(--accent)]"
              placeholder="100"
              type="number"
              min="1"
              step="100"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-[12px] rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-[12px] rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Add Trade Modal
───────────────────────────────────────────── */
interface TradeFormProps {
  stockCode: string;
  stockName: string;
  onSave: (trade: TradeRecord) => void;
  onClose: () => void;
}

function TradeFormModal({
  stockCode,
  stockName,
  onSave,
  onClose,
}: TradeFormProps) {
  const [type, setType] = useState<TradeType>("buy");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [price, setPrice] = useState("");
  const [shares, setShares] = useState("");
  const [note, setNote] = useState("");

  const handleSave = () => {
    const p = parseFloat(price);
    const sh = parseInt(shares);
    if (isNaN(p) || isNaN(sh) || p <= 0 || sh <= 0) return;
    onSave({
      id: `trade-${Date.now()}`,
      type,
      date,
      price: p,
      shares: sh,
      note: note.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-96 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
          添加交易记录 · {stockName}({stockCode})
        </h3>

        {/* Type toggle */}
        <div className="flex rounded-lg bg-[var(--bg-tertiary)] p-0.5 border border-[var(--border-color)]">
          {(["buy", "sell"] as TradeType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                "flex-1 py-1.5 text-[12px] rounded-md font-medium transition-colors",
                type === t
                  ? t === "buy"
                    ? "bg-[#e84444] text-white"
                    : "bg-[#09d464] text-[#0a0e1a]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
              )}
            >
              {t === "buy" ? "买入" : "卖出"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-[11px] text-[var(--text-tertiary)] block mb-1">
              交易日期
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] text-[12px] outline-none focus:border-[var(--accent)]"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] block mb-1">
              {type === "buy" ? "买入价" : "卖出价"} (元)
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] text-[12px] font-mono outline-none focus:border-[var(--accent)]"
              placeholder="0.00"
              type="number"
              min="0"
              step="0.001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] block mb-1">
              {type === "buy" ? "买入股数" : "卖出股数"}
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] text-[12px] font-mono outline-none focus:border-[var(--accent)]"
              placeholder="100"
              type="number"
              min="100"
              step="100"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] text-[var(--text-tertiary)] block mb-1">
              备注
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] text-[12px] outline-none focus:border-[var(--accent)]"
              placeholder="可选，如：突破20日均线买入"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        {price && shares && (
          <div className="text-[11px] text-[var(--text-tertiary)] text-center">
            成交额：
            <span className="text-[var(--text-secondary)] font-mono">
              {formatMoney(parseFloat(price) * parseInt(shares) || 0)}
            </span>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-[12px] rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className={cn(
              "px-4 py-1.5 text-[12px] rounded-lg text-white font-medium",
              type === "buy"
                ? "bg-[#e84444] hover:bg-[#c43333]"
                : "bg-[#09d464] hover:bg-[#07b355] text-[#0a0e1a]",
            )}
          >
            确认{type === "buy" ? "买入" : "卖出"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Holding Card
───────────────────────────────────────────── */
interface HoldingCardProps {
  stock: HoldingStock;
  blurred: boolean;
  onAddTrade: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteTrade: (tradeId: string) => void;
}

function HoldingCard({
  stock,
  blurred,
  onAddTrade,
  onEdit,
  onDelete,
  onDeleteTrade,
}: HoldingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { pnl, pnlPct, marketValue, costValue } = calcPnl(stock);
  const isProfit = pnl >= 0;

  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-secondary)] hover:border-[var(--border-secondary)] transition-colors">
      {/* Card Header */}
      <div className="flex items-start gap-3 p-3">
        {/* Left: stock info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-[13px] font-semibold text-[var(--text-primary)] transition-all duration-300",
                blurred && "blur-sm select-none",
              )}
            >
              {stock.name}
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {stock.code}
            </span>
          </div>
          <div
            className={cn(
              "flex items-center gap-4 mt-1.5 text-[11px] transition-all duration-300",
              blurred && "blur-sm select-none",
            )}
          >
            <div>
              <span className="text-[var(--text-tertiary)]">持仓 </span>
              <span className="text-[var(--text-secondary)] font-mono">
                {stock.shares.toLocaleString()}股
              </span>
            </div>
            <div>
              <span className="text-[var(--text-tertiary)]">成本 </span>
              <span className="text-[var(--text-secondary)] font-mono">
                ¥{stock.costPrice.toFixed(3)}
              </span>
            </div>
            {stock.currentPrice && (
              <div>
                <span className="text-[var(--text-tertiary)]">现价 </span>
                <span className={cn("font-mono", getPriceColor(pnlPct))}>
                  ¥{stock.currentPrice.toFixed(3)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: PnL */}
        <div
          className={cn(
            "text-right transition-all duration-300",
            blurred && "blur-sm select-none",
          )}
        >
          <div
            className={cn(
              "text-[14px] font-bold font-mono",
              isProfit ? "text-[#e84444]" : "text-[#09d464]",
            )}
          >
            {isProfit ? "+" : ""}
            {formatMoney(pnl)}
          </div>
          <div
            className={cn(
              "text-[11px] font-mono",
              isProfit ? "text-[#e84444]" : "text-[#09d464]",
            )}
          >
            {isProfit ? "+" : ""}
            {pnlPct.toFixed(2)}%
          </div>
          <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
            市值 {formatMoney(marketValue)}
          </div>
        </div>
      </div>

      {/* Cost bar */}
      <div
        className={cn(
          "mx-3 mb-2 transition-all duration-300",
          blurred && "blur-sm",
        )}
      >
        <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
          <span>成本 {formatMoney(costValue)}</span>
          <span>市值 {formatMoney(marketValue)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--bg-deep)] overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isProfit ? "bg-[#e84444]" : "bg-[#09d464]",
            )}
            style={{
              width: `${Math.min(100, Math.max(5, 50 + pnlPct * 2))}%`,
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center border-t border-[var(--border-color)] bg-[var(--bg-deep)]">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 flex-1 px-3 py-1.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          交易记录 ({stock.trades.length})
        </button>
        <button
          onClick={onAddTrade}
          className="px-3 py-1.5 text-[11px] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors border-l border-[var(--border-color)] flex items-center gap-1"
        >
          <Plus size={10} /> 记录
        </button>
        <button
          onClick={onEdit}
          className="px-3 py-1.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors border-l border-[var(--border-color)]"
        >
          <Edit2 size={10} />
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 text-[11px] text-[var(--text-tertiary)] hover:text-red-400 hover:bg-[var(--bg-hover)] transition-colors border-l border-[var(--border-color)]"
        >
          <Trash2 size={10} />
        </button>
      </div>

      {/* Trade records */}
      {expanded && (
        <div
          className={cn(
            "border-t border-[var(--border-color)] bg-[var(--bg-primary)] transition-all duration-300",
            blurred && "blur-sm select-none",
          )}
        >
          {stock.trades.length === 0 ? (
            <div className="text-center py-4 text-[11px] text-[var(--text-tertiary)]">
              暂无交易记录，点击"记录"添加
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-[var(--border-color)] text-[var(--text-tertiary)] text-[10px]">
                  <th className="px-3 py-1.5 text-left">类型</th>
                  <th className="px-3 py-1.5 text-left">日期</th>
                  <th className="px-3 py-1.5 text-right">价格</th>
                  <th className="px-3 py-1.5 text-right">股数</th>
                  <th className="px-3 py-1.5 text-right">金额</th>
                  <th className="px-3 py-1.5 text-left">备注</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {stock.trades
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((trade) => (
                    <tr
                      key={trade.id}
                      className="border-b border-[var(--border-color)]/50 hover:bg-[var(--bg-hover)] transition-colors group/trade"
                    >
                      <td className="px-3 py-1.5">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium",
                            trade.type === "buy"
                              ? "text-[#e84444] bg-[#e84444]/10"
                              : "text-[#09d464] bg-[#09d464]/10",
                          )}
                        >
                          {trade.type === "buy" ? "买入" : "卖出"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-tertiary)] font-mono">
                        {trade.date}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[var(--text-secondary)]">
                        {trade.price.toFixed(3)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[var(--text-secondary)]">
                        {trade.shares.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[var(--text-secondary)]">
                        {formatMoney(trade.price * trade.shares)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-tertiary)] truncate max-w-[80px]">
                        {trade.note || "--"}
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => onDeleteTrade(trade.id)}
                          className="opacity-0 group-hover/trade:opacity-100 p-0.5 rounded hover:text-red-400 text-[var(--text-tertiary)] transition-all"
                        >
                          <X size={10} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Summary Bar
───────────────────────────────────────────── */
function SummaryBar({
  holdings,
  blurred,
}: {
  holdings: HoldingStock[];
  blurred: boolean;
}) {
  const totalCost = holdings.reduce(
    (sum, s) => sum + s.costPrice * s.shares,
    0,
  );
  const totalMarket = holdings.reduce((sum, s) => {
    const price = s.currentPrice ?? s.costPrice;
    return sum + price * s.shares;
  }, 0);
  const totalPnl = totalMarket - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const isProfit = totalPnl >= 0;

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
      <div
        className={cn(
          "flex-1 transition-all duration-300",
          blurred && "blur-sm select-none",
        )}
      >
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)]">
              总市值
            </div>
            <div className="text-[14px] font-bold font-mono text-[var(--text-primary)]">
              ¥{formatMoney(totalMarket)}
            </div>
          </div>
          <div className="w-px h-8 bg-[var(--border-color)]" />
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)]">
              总成本
            </div>
            <div className="text-[13px] font-mono text-[var(--text-secondary)]">
              ¥{formatMoney(totalCost)}
            </div>
          </div>
          <div className="w-px h-8 bg-[var(--border-color)]" />
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)]">
              总盈亏
            </div>
            <div
              className={cn(
                "text-[13px] font-bold font-mono",
                isProfit ? "text-[#e84444]" : "text-[#09d464]",
              )}
            >
              {isProfit ? "+" : ""}¥{formatMoney(totalPnl)}
              <span className="text-[11px] ml-1">
                ({isProfit ? "+" : ""}
                {totalPnlPct.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="text-[10px] text-[var(--text-tertiary)]">
        {holdings.length} 只持仓
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */
export function PortfolioPanel() {
  const [holdings, setHoldings] = useState<HoldingStock[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [editingHolding, setEditingHolding] = useState<HoldingStock | null>(
    null,
  );
  const [addingTradeFor, setAddingTradeFor] = useState<HoldingStock | null>(
    null,
  );

  useEffect(() => {
    setHoldings(loadHoldings());
  }, []);

  useEffect(() => {
    if (holdings.length > 0 || localStorage.getItem(PORTFOLIO_KEY)) {
      saveHoldings(holdings);
    }
  }, [holdings]);

  // fetch current prices
  useEffect(() => {
    holdings.forEach(async (stock) => {
      try {
        const r = await fetch(
          `http://localhost:8000/api/kline/${stock.code}?period=daily&count=2`,
        );
        const data = await r.json();
        const bars = Array.isArray(data) ? data : (data?.bars ?? []);
        const last = bars[bars.length - 1];
        if (last) {
          setHoldings((prev) =>
            prev.map((s) =>
              s.code === stock.code ? { ...s, currentPrice: last.close } : s,
            ),
          );
        }
      } catch {}
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const requireAuth = (action: () => void) => {
    if (unlocked) {
      action();
    } else {
      setPendingAction(() => action);
      setShowPasswordModal(true);
    }
  };

  const handleUnlock = () => {
    setUnlocked(true);
    setShowPasswordModal(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const handleLock = () => {
    setUnlocked(false);
  };

  const handleSaveHolding = (stock: HoldingStock) => {
    setHoldings((prev) => {
      const exists = prev.find((s) => s.id === stock.id);
      if (exists) return prev.map((s) => (s.id === stock.id ? stock : s));
      return [...prev, stock];
    });
    setShowAddHolding(false);
    setEditingHolding(null);
  };

  const handleDeleteHolding = (id: string) => {
    setHoldings((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAddTrade = (trade: TradeRecord) => {
    if (!addingTradeFor) return;
    setHoldings((prev) =>
      prev.map((s) =>
        s.id === addingTradeFor.id ? { ...s, trades: [...s.trades, trade] } : s,
      ),
    );
    setAddingTradeFor(null);
  };

  const handleDeleteTrade = (holdingId: string, tradeId: string) => {
    setHoldings((prev) =>
      prev.map((s) =>
        s.id === holdingId
          ? { ...s, trades: s.trades.filter((t) => t.id !== tradeId) }
          : s,
      ),
    );
  };

  const blurred = !unlocked;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            持仓管理
          </span>
          <span
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
              unlocked
                ? "text-[#09d464] border-[#09d464]/30 bg-[#09d464]/10"
                : "text-[var(--text-tertiary)] border-[var(--border-color)] bg-[var(--bg-tertiary)]",
            )}
          >
            {unlocked ? <Unlock size={9} /> : <Lock size={9} />}
            {unlocked ? "已解锁" : "已锁定"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {unlocked ? (
            <>
              <button
                onClick={() => setShowAddHolding(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] text-[11px] border border-[var(--accent)]/30 transition-colors"
              >
                <Plus size={11} /> 添加持仓
              </button>
              <button
                onClick={handleLock}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-color)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-[11px] hover:bg-[var(--bg-hover)] transition-colors"
                title="锁定"
              >
                <Lock size={11} />
                锁定
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] text-[11px] border border-[var(--accent)]/30 transition-colors"
            >
              <Eye size={11} /> 查看
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {holdings.length > 0 && (
        <SummaryBar holdings={holdings} blurred={blurred} />
      )}

      {/* Holdings list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-[var(--text-tertiary)] text-[12px] gap-3">
            <DollarSign size={28} className="opacity-30" />
            <span>暂无持仓，点击"添加持仓"开始记录</span>
            <button
              onClick={() => requireAuth(() => setShowAddHolding(true))}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] text-[12px] border border-[var(--accent)]/30 transition-colors"
            >
              <Plus size={13} /> 添加第一条持仓
            </button>
          </div>
        ) : (
          holdings.map((stock) => (
            <HoldingCard
              key={stock.id}
              stock={stock}
              blurred={blurred}
              onAddTrade={() => requireAuth(() => setAddingTradeFor(stock))}
              onEdit={() => requireAuth(() => setEditingHolding(stock))}
              onDelete={() => requireAuth(() => handleDeleteHolding(stock.id))}
              onDeleteTrade={(tradeId) =>
                requireAuth(() => handleDeleteTrade(stock.id, tradeId))
              }
            />
          ))
        )}
      </div>

      {/* Locked overlay hint */}
      {blurred && holdings.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--border-color)] bg-[var(--bg-deep)] flex items-center justify-center gap-2">
          <Lock size={11} className="text-[var(--text-tertiary)]" />
          <span className="text-[11px] text-[var(--text-tertiary)]">
            持仓已隐藏 ·
          </span>
          <button
            onClick={() => setShowPasswordModal(true)}
            className="text-[11px] text-[var(--accent)] hover:underline"
          >
            输入密码查看
          </button>
        </div>
      )}

      {/* Modals */}
      {showPasswordModal && (
        <PasswordModal
          onSuccess={handleUnlock}
          onCancel={() => {
            setShowPasswordModal(false);
            setPendingAction(null);
          }}
        />
      )}

      {(showAddHolding || editingHolding) && (
        <HoldingFormModal
          initial={editingHolding ?? undefined}
          onSave={handleSaveHolding}
          onClose={() => {
            setShowAddHolding(false);
            setEditingHolding(null);
          }}
        />
      )}

      {addingTradeFor && (
        <TradeFormModal
          stockCode={addingTradeFor.code}
          stockName={addingTradeFor.name}
          onSave={handleAddTrade}
          onClose={() => setAddingTradeFor(null)}
        />
      )}
    </div>
  );
}
