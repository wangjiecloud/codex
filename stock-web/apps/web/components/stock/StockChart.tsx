"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useTheme } from "@/app/theme-provider";

/* ─────────────────── types ─────────────────── */
export interface KLineBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnRate?: number;
  changePct?: number;
}

interface StockChartProps {
  data: KLineBar[];
  activeIndicators: string[];
  activeMAs: number[]; // 当前激活显示的 MA 周期列表（外部控制）
  onToggleMA?: (period: number) => void; // 点击 MA 标签回调
  containerHeight?: number; // 外部传入的可用高度，用于自适应分配各子图
  /** 双击某根K线时回调，传入该K线的数据（包含日期）*/
  onBarDoubleClick?: (bar: KLineBar) => void;
}

/* ─────────────────── mock data ─────────────────── */
function generateMockKLine(code: string): KLineBar[] {
  const bars: KLineBar[] = [];
  let base = 10 + Math.abs(Math.sin(code.length * 7)) * 40;
  const now = new Date("2025-01-01");
  for (let i = 0; i < 120; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const open = base;
    const change = (Math.random() - 0.48) * base * 0.04;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * base * 0.02;
    const low = Math.min(open, close) - Math.random() * base * 0.02;
    const volume = Math.floor(Math.random() * 5000000 + 500000);
    bars.push({
      time: date.toISOString().split("T")[0],
      open: parseFloat(open.toFixed(3)),
      high: parseFloat(high.toFixed(3)),
      low: parseFloat(low.toFixed(3)),
      close: parseFloat(close.toFixed(3)),
      volume,
      changePct: parseFloat(((change / open) * 100).toFixed(2)),
      turnRate: parseFloat((Math.random() * 5).toFixed(2)),
    });
    base = close;
  }
  return bars;
}

/* ─────────────────── calc helpers ─────────────────── */
function calcMA(data: KLineBar[], period: number): (number | null)[] {
  return data.map((_, i) => {
    // warmup 期用已有根数做均值，让左侧也有线
    const start = Math.max(0, i - period + 1);
    const slice = data.slice(start, i + 1);
    return slice.reduce((s, b) => s + b.close, 0) / slice.length;
  });
}

function calcVolMA(data: KLineBar[], period: number): (number | null)[] {
  return data.map((_, i) => {
    // warmup 期用已有根数做均值，让左侧也有线
    const start = Math.max(0, i - period + 1);
    const slice = data.slice(start, i + 1);
    return slice.reduce((s, b) => s + b.volume, 0) / slice.length;
  });
}

function calcMACD(
  data: KLineBar[],
): { macd: number; signal: number; hist: number }[] {
  const k = (p: number) => 2 / (p + 1);
  const ema12: number[] = [];
  const ema26: number[] = [];
  data.forEach((bar, i) => {
    if (i === 0) {
      ema12.push(bar.close);
      ema26.push(bar.close);
      return;
    }
    ema12.push(bar.close * k(12) + ema12[i - 1] * (1 - k(12)));
    ema26.push(bar.close * k(26) + ema26[i - 1] * (1 - k(26)));
  });
  const dif = ema12.map((v, i) => v - ema26[i]);
  const dea: number[] = [];
  dif.forEach((v, i) => {
    if (i === 0) {
      dea.push(v);
      return;
    }
    dea.push(v * k(9) + dea[i - 1] * (1 - k(9)));
  });
  return data.map((_, i) => ({
    macd: parseFloat((dif[i] - dea[i]).toFixed(4)),
    signal: parseFloat(dea[i].toFixed(4)),
    hist: parseFloat(((dif[i] - dea[i]) * 2).toFixed(4)),
  }));
}

function calcKDJ(data: KLineBar[]): { k: number; d: number; j: number }[] {
  const rsv = data.map((_, i) => {
    const start = Math.max(0, i - 8);
    const slice = data.slice(start, i + 1);
    const high = Math.max(...slice.map((b) => b.high));
    const low = Math.min(...slice.map((b) => b.low));
    if (high === low) return 50;
    return ((data[i].close - low) / (high - low)) * 100;
  });
  const K: number[] = [];
  const D: number[] = [];
  rsv.forEach((r, i) => {
    if (i === 0) {
      K.push(50);
      D.push(50);
      return;
    }
    K.push((2 / 3) * K[i - 1] + (1 / 3) * r);
    D.push((2 / 3) * D[i - 1] + (1 / 3) * K[i]);
  });
  return data.map((_, i) => ({
    k: parseFloat(K[i].toFixed(2)),
    d: parseFloat(D[i].toFixed(2)),
    j: parseFloat((3 * K[i] - 2 * D[i]).toFixed(2)),
  }));
}

function calcBOLL(data: KLineBar[], period = 20, mult = 2) {
  return data.map((_, i) => {
    // warmup 期用已有根数，让左侧也有线
    const start = Math.max(0, i - period + 1);
    const slice = data.slice(start, i + 1);
    const closes = slice.map((b) => b.close);
    const mid = closes.reduce((s, v) => s + v, 0) / closes.length;
    const std = Math.sqrt(
      closes.reduce((s, v) => s + (v - mid) ** 2, 0) / closes.length,
    );
    return { upper: mid + mult * std, middle: mid, lower: mid - mult * std };
  });
}

/* detect golden/death cross: returns array of cross type per bar */
function detectCross(
  a: (number | null)[],
  b: (number | null)[],
): ("golden" | "death" | null)[] {
  return a.map((av, i) => {
    if (i === 0 || av == null || b[i] == null) return null;
    const pA = a[i - 1],
      pB = b[i - 1];
    if (pA == null || pB == null) return null;
    if (pA <= pB && av > b[i]!) return "golden";
    if (pA >= pB && av < b[i]!) return "death";
    return null;
  });
}

function formatVol(vol: number): string {
  if (vol >= 1e8) return (vol / 1e8).toFixed(2) + "亿手";
  if (vol >= 1e4) return (vol / 1e4).toFixed(2) + "万手";
  return vol.toFixed(0) + "手";
}

function formatVolShort(vol: number): string {
  if (vol >= 1e8) return (vol / 1e8).toFixed(2) + "亿";
  if (vol >= 1e4) return (vol / 1e4).toFixed(2) + "万";
  return vol.toFixed(0);
}

/* ─────────────────── CSS var helper ─────────────────── */
function cssVar(name: string): string {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/* ─────────────────── Canvas drawing primitives ─────────────────── */

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  paddingLeft: number;
  paddingRight: number; // price scale width on right
  paddingTop: number;
  paddingBottom: number;
}

function getPlotArea(dc: DrawCtx) {
  return {
    x0: dc.paddingLeft,
    x1: dc.width - dc.paddingRight,
    y0: dc.paddingTop,
    y1: dc.height - dc.paddingBottom,
    w: dc.width - dc.paddingLeft - dc.paddingRight,
    h: dc.height - dc.paddingTop - dc.paddingBottom,
  };
}

function valToY(
  val: number,
  min: number,
  max: number,
  y0: number,
  h: number,
): number {
  if (max === min) return y0 + h / 2;
  return y0 + h - ((val - min) / (max - min)) * h;
}

function drawPriceAxis(
  dc: DrawCtx,
  min: number,
  max: number,
  ticks: number,
  color: string,
  textColor: string,
) {
  const { ctx, width, paddingRight } = dc;
  const { y0, h } = getPlotArea(dc);
  const step = (max - min) / (ticks - 1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = textColor;
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.lineWidth = 0.3;
  for (let i = 0; i < ticks; i++) {
    const val = min + step * i;
    const y = valToY(val, min, max, y0, h);
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(dc.paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(
      val.toFixed(val >= 10000 ? 0 : val >= 100 ? 1 : 2),
      width - paddingRight + 3,
      y + 3,
    );
  }
  ctx.restore();
}

function drawTimeAxis(
  dc: DrawCtx,
  labels: { idx: number; label: string }[],
  color: string,
  textColor: string,
  barWidth: number,
  startX: number,
) {
  const { ctx, height, paddingBottom } = dc;
  ctx.save();
  ctx.fillStyle = textColor;
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  labels.forEach(({ idx, label }) => {
    const x = startX + idx * barWidth + barWidth / 2;
    ctx.fillText(label, x, height - paddingBottom + 12);
  });
  ctx.restore();
}

/* ─────────────────── Main Component ─────────────────── */

const MA_COLORS = ["#f5a623", "#4ade80", "#60a5fa", "#c084fc", "#f472b6"];
const MA_PERIODS = [5, 10, 20, 30, 60];

/** 设置 canvas 为物理像素分辨率（修复 Retina 模糊），返回 CSS 尺寸和 DPR */
function setupCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
): { ctx: CanvasRenderingContext2D; W: number; H: number; dpr: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = Math.ceil(window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W: cssW, H: cssH, dpr };
}

export function StockChart({
  data,
  activeIndicators,
  activeMAs: activeMAsArray,
  onToggleMA,
  containerHeight,
  onBarDoubleClick,
}: StockChartProps) {
  const { theme } = useTheme();

  /* canvas refs — one per pane */
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const macdCanvasRef = useRef<HTMLCanvasElement>(null);
  const volCanvasRef = useRef<HTMLCanvasElement>(null);
  const kdjCanvasRef = useRef<HTMLCanvasElement>(null);

  /* overlay canvas for crosshair (sits on top of all panes via absolute) */
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  /* MA visibility — 直接从 prop 转换为 Set，由父组件控制 */
  const activeMAs = useMemo(() => new Set(activeMAsArray), [activeMAsArray]);

  /* collapse state */
  const [macdExpanded, setMacdExpanded] = useState(true);
  const [kdjExpanded, setKdjExpanded] = useState(true);
  const [volExpanded, setVolExpanded] = useState(true);

  /* ── computed indicators ── */
  const indicators = useMemo(() => {
    if (!data.length) return null;
    const macd = calcMACD(data);
    const kdj = calcKDJ(data);
    const boll = calcBOLL(data);
    const volMa5 = calcVolMA(data, 5);
    const volMa10 = calcVolMA(data, 10);
    const mas = MA_PERIODS.map((p) => calcMA(data, p));
    // cross signals
    const macdCross = detectCross(
      macd.map((d) => d.macd),
      macd.map((d) => d.signal),
    );
    const kdjCross = detectCross(
      kdj.map((d) => d.k),
      kdj.map((d) => d.d),
    );
    return { macd, kdj, boll, volMa5, volMa10, mas, macdCross, kdjCross };
  }, [data]);

  /* ── bar layout ── */
  const PADDING_LEFT = 2;
  const PADDING_RIGHT = 58; // price axis width
  const PADDING_TOP = 6;
  const PADDING_BOTTOM_MAIN = 18; // time axis
  const PADDING_BOTTOM_SUB = 4;

  const barWidth = useMemo(() => {
    if (!data.length) return 8;
    const plotW = canvasWidth - PADDING_LEFT - PADDING_RIGHT;
    return Math.max(1, plotW / data.length);
  }, [data.length, canvasWidth]);

  // 数据始终从左侧铺满，不留右侧空白
  const startX = PADDING_LEFT;

  /* ── time labels ── */
  const timeLabels = useMemo((): { idx: number; label: string }[] => {
    if (!data.length) return [];
    const result: { idx: number; label: string }[] = [];
    const count = Math.floor((canvasWidth - PADDING_LEFT - PADDING_RIGHT) / 80);
    const step = Math.max(1, Math.floor(data.length / count));
    for (let i = 0; i < data.length; i += step) {
      const t = data[i].time;
      const d = new Date(t);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      result.push({ idx: i, label });
    }
    return result;
  }, [data, canvasWidth]);

  /* ── theme colors — use state to avoid SSR/CSR hydration mismatch ── */
  const makeColors = (t: string) => ({
    up: "#e84444",
    down: "#09d464",
    bg: t === "dark" ? "#141414" : "#ffffff",
    grid: t === "dark" ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
    text: t === "dark" ? "#aaa" : "#666",
    border: t === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
    golden: "#f5a623",
    death: "#60a5fa",
    crosshair: t === "dark" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.35)",
  });
  const [colors, setColors] = useState(() => makeColors("light"));
  useEffect(() => {
    setColors(makeColors(theme));
  }, [theme]);

  // ── 动态分配各子图高度 ──
  const HEADER_H = 26; // 每个子图标题行高度
  const MIN_MAIN_H = 160;
  const MIN_SUB_H = 80;

  const { MAIN_H, SUB_H } = useMemo(() => {
    // 统计激活且展开的副图数量
    const subCount =
      (activeIndicators.includes("MACD") && macdExpanded ? 1 : 0) +
      (activeIndicators.includes("VOL") && volExpanded ? 1 : 0) +
      (activeIndicators.includes("KDJ") && kdjExpanded ? 1 : 0);

    // 所有标题行高度（激活的副图都有标题，无论是否展开）
    const headerCount =
      (activeIndicators.includes("MACD") ? 1 : 0) +
      (activeIndicators.includes("VOL") ? 1 : 0) +
      (activeIndicators.includes("KDJ") ? 1 : 0);
    const allHeadersH = (1 + headerCount) * HEADER_H; // +1 = MA header

    if (!containerHeight || containerHeight <= 0) {
      return { MAIN_H: 280, SUB_H: 100 };
    }

    const available = containerHeight - allHeadersH;

    if (subCount === 0) {
      return { MAIN_H: Math.max(available, MIN_MAIN_H), SUB_H: 0 };
    }

    // K线图占 55%，剩余平均分给各副图
    const mainH = Math.max(Math.floor(available * 0.55), MIN_MAIN_H);
    const subH = Math.max(
      Math.floor((available - mainH) / subCount),
      MIN_SUB_H,
    );
    return { MAIN_H: mainH, SUB_H: subH };
  }, [
    containerHeight,
    activeIndicators,
    macdExpanded,
    volExpanded,
    kdjExpanded,
  ]);

  /* ────────────────────────────────────────────
     DRAW HELPERS
  ──────────────────────────────────────────── */

  const drawCrossAnnotations = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      crosses: ("golden" | "death" | null)[],
      vals: (number | null)[], // the 'a' line values (for y position)
      min: number,
      max: number,
      y0: number,
      h: number,
      width: number,
      startXp: number,
      bw: number,
      goldenColor: string,
      deathColor: string,
    ) => {
      ctx.save();
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      crosses.forEach((cross, i) => {
        if (!cross) return;
        const val = vals[i];
        if (val == null) return;
        const x = startXp + i * bw + bw / 2;
        const y = valToY(val, min, max, y0, h);
        const isGolden = cross === "golden";
        const label = isGolden ? "金叉" : "死叉";
        const fg = isGolden ? goldenColor : deathColor;
        const bg = isGolden ? "rgba(245,166,35,0.15)" : "rgba(96,165,250,0.15)";
        // pill background
        const tw = ctx.measureText(label).width + 6;
        const th = 13;
        const tx = x - tw / 2;
        const ty = isGolden ? y - th - 4 : y + 4;
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, th, 3);
        ctx.fill();
        ctx.fillStyle = fg;
        ctx.fillText(label, x, ty + th - 3);
      });
      ctx.restore();
    },
    [],
  );

  /* ────────────────────────────────────────────
     DRAW MAIN K-LINE
  ──────────────────────────────────────────── */
  const drawMain = useCallback(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !data.length || !indicators) return;
    const setup = setupCanvas(canvas, canvasWidth, MAIN_H);
    if (!setup) return;
    const { ctx, W, H } = setup;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    const dc: DrawCtx = {
      ctx,
      width: W,
      height: H,
      paddingLeft: PADDING_LEFT,
      paddingRight: PADDING_RIGHT,
      paddingTop: PADDING_TOP,
      paddingBottom: PADDING_BOTTOM_MAIN,
    };
    const { x0, x1, y0, h } = getPlotArea(dc);

    // price range
    const allHigh = Math.max(...data.map((b) => b.high));
    const allLow = Math.min(...data.map((b) => b.low));
    const pad = (allHigh - allLow) * 0.05;
    const pMin = allLow - pad;
    const pMax = allHigh + pad;

    // grid + price axis
    drawPriceAxis(dc, pMin, pMax, 6, colors.grid, colors.text);

    // BOLL
    if (activeIndicators.includes("BOLL")) {
      const bollData = indicators.boll;
      const lines: [string, (typeof bollData)[0]?][] = [];
      const bollColors = ["#f5a623", "rgba(128,128,128,0.6)", "#60a5fa"];
      const keys: ("upper" | "middle" | "lower")[] = [
        "upper",
        "middle",
        "lower",
      ];
      keys.forEach((key, ki) => {
        ctx.save();
        ctx.strokeStyle = bollColors[ki];
        ctx.lineWidth = 1;
        ctx.beginPath();
        let started = false;
        bollData.forEach((d, i) => {
          if (!d) return;
          const x = startX + i * barWidth + barWidth / 2;
          const y = valToY(d[key], pMin, pMax, y0, h);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
      });
    }

    // MA lines
    MA_PERIODS.forEach((period, pi) => {
      if (!activeMAs.has(period)) return;
      const maData = indicators.mas[pi];
      ctx.save();
      ctx.strokeStyle = MA_COLORS[pi];
      ctx.lineWidth = 1;
      ctx.beginPath();
      let started = false;
      maData.forEach((val, i) => {
        if (val == null) return;
        const x = startX + i * barWidth + barWidth / 2;
        const y = valToY(val, pMin, pMax, y0, h);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    });

    // Candlesticks
    const candleW = Math.max(1, barWidth * 0.6);
    const wickW = Math.max(1, barWidth * 0.12);
    data.forEach((bar, i) => {
      const isUp = bar.close >= bar.open;
      const color = isUp ? colors.up : colors.down;
      const x = startX + i * barWidth + barWidth / 2;
      const openY = valToY(bar.open, pMin, pMax, y0, h);
      const closeY = valToY(bar.close, pMin, pMax, y0, h);
      const highY = valToY(bar.high, pMin, pMax, y0, h);
      const lowY = valToY(bar.low, pMin, pMax, y0, h);
      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      const bodyH = Math.max(1, bodyBottom - bodyTop);

      ctx.save();
      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = wickW;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      // Body
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
      // hollow body for down candle (optional: solid both)
      if (!isUp) {
        ctx.fillStyle = colors.bg;
        ctx.fillRect(
          x - candleW / 2 + 1,
          bodyTop + 1,
          candleW - 2,
          Math.max(0, bodyH - 2),
        );
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyH);
      }
      ctx.restore();
    });

    // Time axis
    drawTimeAxis(dc, timeLabels, colors.grid, colors.text, barWidth, startX);
  }, [
    data,
    indicators,
    activeIndicators,
    activeMAs,
    colors,
    barWidth,
    startX,
    timeLabels,
    MAIN_H,
  ]);

  /* ────────────────────────────────────────────
     DRAW MACD
  ──────────────────────────────────────────── */
  const drawMACD = useCallback(() => {
    const canvas = macdCanvasRef.current;
    if (!canvas || !data.length || !indicators) return;
    const setup = setupCanvas(canvas, canvasWidth, SUB_H);
    if (!setup) return;
    const { ctx, W, H } = setup;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    const dc: DrawCtx = {
      ctx,
      width: W,
      height: H,
      paddingLeft: PADDING_LEFT,
      paddingRight: PADDING_RIGHT,
      paddingTop: PADDING_TOP,
      paddingBottom: PADDING_BOTTOM_SUB,
    };
    const { y0, h } = getPlotArea(dc);
    const { macd } = indicators;

    const allVals = macd.flatMap((d) => [d.hist, d.macd, d.signal]);
    const rawMax = Math.max(...allVals);
    const rawMin = Math.min(...allVals);
    const ext = Math.max(Math.abs(rawMax), Math.abs(rawMin)) * 1.1;
    const pMin = -ext,
      pMax = ext;

    drawPriceAxis(dc, pMin, pMax, 5, colors.grid, colors.text);

    const bw = Math.max(1, barWidth * 0.55);
    // Histogram bars
    macd.forEach((d, i) => {
      const x = startX + i * barWidth + barWidth / 2;
      const zeroY = valToY(0, pMin, pMax, y0, h);
      const valY = valToY(d.hist, pMin, pMax, y0, h);
      const isPos = d.hist >= 0;
      ctx.save();
      ctx.fillStyle = isPos ? colors.up : colors.down;
      // Narrow bar for thin look
      const barH = Math.abs(zeroY - valY);
      if (barH < 1) {
        ctx.fillRect(x - bw / 2, zeroY - 1, bw, 1);
      } else {
        ctx.fillRect(x - bw / 2, Math.min(zeroY, valY), bw, barH);
      }
      ctx.restore();
    });

    // MACD line (DIF)
    ctx.save();
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    macd.forEach((d, i) => {
      const x = startX + i * barWidth + barWidth / 2;
      const y = valToY(d.macd, pMin, pMax, y0, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // DEA line (Signal)
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    macd.forEach((d, i) => {
      const x = startX + i * barWidth + barWidth / 2;
      const y = valToY(d.signal, pMin, pMax, y0, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // Golden/Death cross annotations
    drawCrossAnnotations(
      ctx,
      indicators.macdCross,
      macd.map((d) => d.macd),
      pMin,
      pMax,
      y0,
      h,
      W,
      startX,
      barWidth,
      colors.golden,
      colors.death,
    );
  }, [data, indicators, colors, barWidth, startX, drawCrossAnnotations, SUB_H]);

  /* ────────────────────────────────────────────
     DRAW VOL
  ──────────────────────────────────────────── */
  const drawVol = useCallback(() => {
    const canvas = volCanvasRef.current;
    if (!canvas || !data.length || !indicators) return;
    const setup = setupCanvas(canvas, canvasWidth, SUB_H);
    if (!setup) return;
    const { ctx, W, H } = setup;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    const dc: DrawCtx = {
      ctx,
      width: W,
      height: H,
      paddingLeft: PADDING_LEFT,
      paddingRight: PADDING_RIGHT,
      paddingTop: PADDING_TOP,
      paddingBottom: PADDING_BOTTOM_SUB,
    };
    const { y0, h } = getPlotArea(dc);

    const maxVol = Math.max(...data.map((b) => b.volume)) * 1.1;
    const pMin = 0,
      pMax = maxVol;

    drawPriceAxis(dc, pMin, pMax, 4, colors.grid, colors.text);

    const bw = Math.max(1, barWidth * 0.6);
    data.forEach((bar, i) => {
      const isUp = bar.close >= bar.open;
      const x = startX + i * barWidth + barWidth / 2;
      const topY = valToY(bar.volume, pMin, pMax, y0, h);
      const zeroY = valToY(0, pMin, pMax, y0, h);
      ctx.save();
      ctx.fillStyle = isUp ? colors.up : colors.down;
      ctx.fillRect(x - bw / 2, topY, bw, zeroY - topY);
      ctx.restore();
    });

    // Vol MA5
    ctx.save();
    ctx.strokeStyle = colors.golden;
    ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    indicators.volMa5.forEach((val, i) => {
      if (val == null) return;
      const x = startX + i * barWidth + barWidth / 2;
      const y = valToY(val, pMin, pMax, y0, h);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Vol MA10
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    started = false;
    indicators.volMa10.forEach((val, i) => {
      if (val == null) return;
      const x = startX + i * barWidth + barWidth / 2;
      const y = valToY(val, pMin, pMax, y0, h);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }, [data, indicators, colors, barWidth, startX, SUB_H]);

  /* ────────────────────────────────────────────
     DRAW KDJ
  ──────────────────────────────────────────── */
  const drawKDJ = useCallback(() => {
    const canvas = kdjCanvasRef.current;
    if (!canvas || !data.length || !indicators) return;
    const setup = setupCanvas(canvas, canvasWidth, SUB_H);
    if (!setup) return;
    const { ctx, W, H } = setup;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    const dc: DrawCtx = {
      ctx,
      width: W,
      height: H,
      paddingLeft: PADDING_LEFT,
      paddingRight: PADDING_RIGHT,
      paddingTop: PADDING_TOP,
      paddingBottom: PADDING_BOTTOM_SUB,
    };
    const { y0, h } = getPlotArea(dc);
    const { kdj } = indicators;

    const allVals = kdj.flatMap((d) => [d.k, d.d, d.j]);
    const rawMin = Math.min(...allVals);
    const rawMax = Math.max(...allVals);
    const pad = (rawMax - rawMin) * 0.1;
    const pMin = rawMin - pad,
      pMax = rawMax + pad;

    drawPriceAxis(dc, pMin, pMax, 5, colors.grid, colors.text);

    const kdjLines: [string, number[], string][] = [
      ["K", kdj.map((d) => d.k), colors.golden],
      ["D", kdj.map((d) => d.d), "#60a5fa"],
      ["J", kdj.map((d) => d.j), "#c084fc"],
    ];

    kdjLines.forEach(([, vals, color]) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      vals.forEach((val, i) => {
        const x = startX + i * barWidth + barWidth / 2;
        const y = valToY(val, pMin, pMax, y0, h);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    });

    // KDJ Golden/Death cross annotations
    drawCrossAnnotations(
      ctx,
      indicators.kdjCross,
      kdj.map((d) => d.k),
      pMin,
      pMax,
      y0,
      h,
      W,
      startX,
      barWidth,
      colors.golden,
      colors.death,
    );
  }, [data, indicators, colors, barWidth, startX, drawCrossAnnotations, SUB_H]);

  /* ────────────────────────────────────────────
     DRAW CROSSHAIR OVERLAY
  ──────────────────────────────────────────── */
  const drawCrosshair = useCallback(
    (idx: number | null) => {
      const canvas = overlayRef.current;
      if (!canvas) return;
      const overlayH =
        parseInt(canvas.style.height || "0") || canvas.offsetHeight;
      const setup = setupCanvas(canvas, canvasWidth, overlayH || MAIN_H);
      if (!setup) return;
      const { ctx, W, H } = setup;
      ctx.clearRect(0, 0, W, H);
      if (idx == null || !data[idx]) return;

      const x = startX + idx * barWidth + barWidth / 2;
      ctx.save();
      ctx.strokeStyle = colors.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.restore();
    },
    [data, barWidth, startX, colors],
  );

  /* ────────────────────────────────────────────
     MOUSE HANDLER — find bar index from x
  ──────────────────────────────────────────── */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = Math.round((x - startX) / barWidth - 0.5);
      const clamped = Math.max(0, Math.min(idx, data.length - 1));
      setHoverIdx(clamped);
    },
    [startX, barWidth, data.length],
  );

  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  /* ────────────────────────────────────────────
     DOUBLE-CLICK — 触发分时弹框
  ──────────────────────────────────────────── */
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onBarDoubleClick) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = Math.round((x - startX) / barWidth - 0.5);
      const clamped = Math.max(0, Math.min(idx, data.length - 1));
      const bar = data[clamped];
      if (bar) onBarDoubleClick(bar);
    },
    [onBarDoubleClick, startX, barWidth, data],
  );

  /* ────────────────────────────────────────────
     RESIZE OBSERVER
  ──────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      setCanvasWidth(container.clientWidth);
    });
    ro.observe(container);
    setCanvasWidth(container.clientWidth);
    return () => ro.disconnect();
  }, []);

  /* ────────────────────────────────────────────
     RE-DRAW on data/theme/size changes
  ──────────────────────────────────────────── */
  useEffect(() => {
    drawMain();
  }, [drawMain]);
  useEffect(() => {
    if (activeIndicators.includes("MACD") && macdExpanded) drawMACD();
  }, [drawMACD, activeIndicators, macdExpanded]);
  useEffect(() => {
    if (activeIndicators.includes("VOL") && volExpanded) drawVol();
  }, [drawVol, activeIndicators, volExpanded]);
  useEffect(() => {
    if (activeIndicators.includes("KDJ") && kdjExpanded) drawKDJ();
  }, [drawKDJ, activeIndicators, kdjExpanded]);
  useEffect(() => {
    drawCrosshair(hoverIdx);
  }, [drawCrosshair, hoverIdx]);

  /* ────────────────────────────────────────────
     HOVER INFO
  ──────────────────────────────────────────── */
  const bar = hoverIdx != null ? data[hoverIdx] : data[data.length - 1];
  const macdVal =
    hoverIdx != null && indicators
      ? indicators.macd[hoverIdx]
      : indicators?.macd[data.length - 1];
  const kdjVal =
    hoverIdx != null && indicators
      ? indicators.kdj[hoverIdx]
      : indicators?.kdj[data.length - 1];
  const volMa5Val =
    hoverIdx != null && indicators
      ? indicators.volMa5[hoverIdx]
      : indicators?.volMa5[data.length - 1];
  const volMa10Val =
    hoverIdx != null && indicators
      ? indicators.volMa10[hoverIdx]
      : indicators?.volMa10[data.length - 1];
  const maVals = MA_PERIODS.map((_, pi) =>
    hoverIdx != null && indicators
      ? indicators.mas[pi][hoverIdx]
      : indicators?.mas[pi][data.length - 1],
  );

  const prevClose =
    bar && data.length > 1
      ? hoverIdx != null && hoverIdx > 0
        ? data[hoverIdx - 1].close
        : data[0].close
      : 0;
  const changePct = bar
    ? bar.changePct != null
      ? bar.changePct
      : ((bar.close - prevClose) / prevClose) * 100
    : 0;
  const amplitude = bar
    ? ((bar.high - bar.low) / (prevClose || bar.open)) * 100
    : 0;
  const upColor = changePct >= 0 ? colors.up : colors.down;

  /* ────────────────────────────────────────────
     RENDER
  ──────────────────────────────────────────── */
  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      style={{
        position: "relative",
        cursor: onBarDoubleClick ? "crosshair" : "default",
      }}
    >
      {/* ── MA Header（纯展示行，均线数值 + OHLC） ── */}
      <div
        className="flex items-center gap-2 px-3 text-[10px] border-b border-[var(--border-color)] bg-[var(--bg-primary)] shrink-0 overflow-x-auto"
        style={{ height: HEADER_H }}
      >
        {/* MA 数值展示（只在激活时显示） */}
        {MA_PERIODS.map((p, pi) => {
          if (!activeMAs.has(p)) return null;
          const val = mounted && maVals[pi] != null ? maVals[pi] : null;
          return (
            <span
              key={p}
              style={{
                color: MA_COLORS[pi],
                fontFamily: "monospace",
                flexShrink: 0,
              }}
            >
              MA{p}
              {val != null ? `:${val.toFixed(2)}` : ""}
            </span>
          );
        })}

        {/* OHLC info */}
        {mounted && bar && (
          <>
            <span style={{ color: colors.text, flexShrink: 0 }}>
              {bar.time}
            </span>
            <span style={{ color: upColor, flexShrink: 0 }}>
              开{bar.open.toFixed(2)}
            </span>
            <span style={{ color: upColor, flexShrink: 0 }}>
              收{bar.close.toFixed(2)}
            </span>
            <span style={{ color: upColor, flexShrink: 0 }}>
              高{bar.high.toFixed(2)}
            </span>
            <span style={{ color: upColor, flexShrink: 0 }}>
              低{bar.low.toFixed(2)}
            </span>
            <span style={{ color: upColor, flexShrink: 0 }}>
              {changePct >= 0 ? "+" : ""}
              {changePct.toFixed(2)}%
            </span>
          </>
        )}
      </div>

      {/* ── Main K-line canvas ── */}
      <div style={{ position: "relative", height: MAIN_H }}>
        <canvas
          ref={mainCanvasRef}
          style={{ display: "block", width: "100%", height: MAIN_H }}
        />
      </div>

      {/* ── MACD pane ── */}
      {activeIndicators.includes("MACD") && (
        <>
          <div
            className="flex items-center gap-2 px-2 text-[10px] border-t border-[var(--border-color)] bg-[var(--bg-primary)] shrink-0 cursor-pointer"
            style={{ height: HEADER_H }}
            onClick={() => setMacdExpanded((v) => !v)}
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill={colors.text}
              style={{
                transition: "transform 0.15s",
                transform: macdExpanded ? "" : "rotate(-90deg)",
                flexShrink: 0,
              }}
            >
              <path d="M4 6L0 2h8L4 6Z" />
            </svg>
            <span style={{ color: colors.text }}>MACD(10,20,7)</span>
            {mounted && macdVal && (
              <>
                <span style={{ color: "#60a5fa" }}>
                  DIFF:{macdVal.macd.toFixed(3)}
                </span>
                <span style={{ color: "#f59e0b" }}>
                  DEA:{macdVal.signal.toFixed(3)}
                </span>
                <span
                  style={{ color: macdVal.hist >= 0 ? colors.up : colors.down }}
                >
                  MACD:{macdVal.hist.toFixed(3)}
                </span>
              </>
            )}
          </div>
          {macdExpanded && (
            <div style={{ height: SUB_H }}>
              <canvas
                ref={macdCanvasRef}
                style={{ display: "block", width: "100%", height: SUB_H }}
              />
            </div>
          )}
        </>
      )}

      {/* ── Volume pane ── */}
      {activeIndicators.includes("VOL") && (
        <>
          <div
            className="flex items-center gap-2 px-2 text-[10px] border-t border-[var(--border-color)] bg-[var(--bg-primary)] shrink-0 cursor-pointer"
            style={{ height: HEADER_H }}
            onClick={() => setVolExpanded((v) => !v)}
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill={colors.text}
              style={{
                transition: "transform 0.15s",
                transform: volExpanded ? "" : "rotate(-90deg)",
                flexShrink: 0,
              }}
            >
              <path d="M4 6L0 2h8L4 6Z" />
            </svg>
            <span style={{ color: colors.text }}>成交量</span>
            {mounted && bar && (
              <span style={{ color: colors.text }}>
                总量:{formatVolShort(bar.volume)}万
              </span>
            )}
            {mounted && volMa5Val != null && (
              <span style={{ color: colors.golden }}>
                MA5:{formatVolShort(volMa5Val)}万
              </span>
            )}
            {mounted && volMa10Val != null && (
              <span style={{ color: "#60a5fa" }}>
                MA10:{formatVolShort(volMa10Val)}万
              </span>
            )}
          </div>
          {volExpanded && (
            <div style={{ height: SUB_H }}>
              <canvas
                ref={volCanvasRef}
                style={{ display: "block", width: "100%", height: SUB_H }}
              />
            </div>
          )}
        </>
      )}

      {/* ── KDJ pane ── */}
      {activeIndicators.includes("KDJ") && (
        <>
          <div
            className="flex items-center gap-2 px-2 text-[10px] border-t border-[var(--border-color)] bg-[var(--bg-primary)] shrink-0 cursor-pointer"
            style={{ height: HEADER_H }}
            onClick={() => setKdjExpanded((v) => !v)}
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill={colors.text}
              style={{
                transition: "transform 0.15s",
                transform: kdjExpanded ? "" : "rotate(-90deg)",
                flexShrink: 0,
              }}
            >
              <path d="M4 6L0 2h8L4 6Z" />
            </svg>
            <span style={{ color: colors.text }}>KDJ(9,3,3)</span>
            {mounted && kdjVal && (
              <>
                <span style={{ color: colors.golden }}>
                  K:{kdjVal.k.toFixed(2)}
                </span>
                <span style={{ color: "#60a5fa" }}>
                  D:{kdjVal.d.toFixed(2)}
                </span>
                <span style={{ color: "#c084fc" }}>
                  J:{kdjVal.j.toFixed(2)}
                </span>
              </>
            )}
          </div>
          {kdjExpanded && (
            <div style={{ height: SUB_H }}>
              <canvas
                ref={kdjCanvasRef}
                style={{ display: "block", width: "100%", height: SUB_H }}
              />
            </div>
          )}
        </>
      )}

      {/* ── Crosshair overlay (spans all panes) ── */}
      <canvas
        ref={overlayRef}
        style={{
          position: "absolute",
          top: HEADER_H, // offset below MA header
          left: 0,
          width: "100%",
          height:
            MAIN_H +
            (activeIndicators.includes("MACD")
              ? HEADER_H + (macdExpanded ? SUB_H : 0)
              : 0) +
            (activeIndicators.includes("VOL")
              ? HEADER_H + (volExpanded ? SUB_H : 0)
              : 0) +
            (activeIndicators.includes("KDJ")
              ? HEADER_H + (kdjExpanded ? SUB_H : 0)
              : 0),
          pointerEvents: "none",
          zIndex: 10,
        }}
      />

      {/* ── Hover tooltip (left side of main chart) ── */}
      {mounted && hoverIdx != null && bar && (
        <div
          style={{
            position: "absolute",
            top: HEADER_H + 8,
            left: 8,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 6,
            padding: "6px 10px",
            zIndex: 20,
            pointerEvents: "none",
            minWidth: 150,
            fontSize: 10,
            lineHeight: "18px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ color: colors.text, marginBottom: 2 }}>{bar.time}</div>
          {[
            ["开盘", bar.open.toFixed(3)],
            ["收盘", bar.close.toFixed(3)],
            ["最高", bar.high.toFixed(3)],
            ["最低", bar.low.toFixed(3)],
            ["涨幅", `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`],
            ["振幅", `${amplitude.toFixed(2)}%`],
            ["成交量", formatVol(bar.volume)],
            ["换手率", bar.turnRate ? `${bar.turnRate.toFixed(2)}%` : "--"],
          ].map(([label, val]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span style={{ color: colors.text }}>{label}</span>
              <span
                style={{ color: upColor, fontVariantNumeric: "tabular-nums" }}
              >
                {val}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function generateMockData(code: string): KLineBar[] {
  return generateMockKLine(code);
}
