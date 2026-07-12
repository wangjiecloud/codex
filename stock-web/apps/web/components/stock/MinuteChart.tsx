"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useTheme } from "@/app/theme-provider";

export interface MinuteBar {
  time: string; // "HH:MM"（1分钟 "09:31" 或 5分钟 "09:35"）
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  avgPrice: number;
  prevClose: number;
}

interface MinuteChartProps {
  data: MinuteBar[];
  height?: number;
  stockName?: string;
  /** '1min'=1分钟240槽，'5min'=5分钟48槽，不传则自动检测 */
  mode?: "1min" | "5min";
}

/* ── Canvas DPR helper ── */
function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): { ctx: CanvasRenderingContext2D; W: number; H: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.scale(dpr, dpr);
  return { ctx, W: width, H: height };
}

function valToY(val: number, min: number, max: number, y0: number, h: number) {
  if (max === min) return y0 + h / 2;
  return y0 + ((max - val) / (max - min)) * h;
}

function fmtVol(v: number): string {
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}万`;
  return v.toFixed(0);
}

function fmtAmt(v: number): string {
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
  return v.toFixed(0);
}

/* 生成时间槽 */
function makeSlots(step: number): string[] {
  const slots: string[] = [];
  const amStart = 9 * 60 + (step === 1 ? 31 : 35);
  const amEnd = 11 * 60 + 30;
  const pmStart = 13 * 60 + (step === 1 ? 1 : 5);
  const pmEnd = 15 * 60;
  for (let m = amStart; m <= amEnd; m += step) {
    slots.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
  }
  for (let m = pmStart; m <= pmEnd; m += step) {
    slots.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
  }
  return slots;
}

const SLOTS_1MIN = makeSlots(1); // 09:31..11:30 + 13:01..15:00 = 240根
const SLOTS_5MIN = makeSlots(5); // 09:35..11:30 + 13:05..15:00 = 48根

const TIME_LABELS_1MIN = [
  "09:31",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
];
const TIME_LABELS_5MIN = [
  "09:35",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "13:05",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
];

const INFO_PANEL_W = 130;

export default function MinuteChart({
  data,
  height = 380,
  stockName,
  mode: modeProp,
}: MinuteChartProps) {
  const { theme } = useTheme();
  const priceCanvasRef = useRef<HTMLCanvasElement>(null);
  const volCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [canvasWidth, setCanvasWidth] = useState(800);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  // 自动检测 mode：外部传入优先，否则根据数据量判断（>50根视为1分钟）
  const mode = modeProp ?? (data.length > 50 ? "1min" : "5min");
  const SESSION_SLOTS = mode === "1min" ? SLOTS_1MIN : SLOTS_5MIN;
  const TOTAL_SLOTS = SESSION_SLOTS.length;
  const TIME_LABELS = mode === "1min" ? TIME_LABELS_1MIN : TIME_LABELS_5MIN;

  useEffect(() => {
    setMounted(true);
  }, []);

  const PRICE_H = Math.floor(height * 0.7);
  const VOL_H = height - PRICE_H;
  const PAD_LEFT = 4;
  const PAD_RIGHT = 56; // 右侧留给价格刻度
  const PAD_TOP = 8;
  const PAD_BOT_PRICE = 20;
  const PAD_BOT_VOL = 4;

  const isDark = theme === "dark";
  const colors = useMemo(
    () => ({
      up: "#e84444",
      down: "#09d464",
      flat: "#888888",
      bg: isDark ? "#141414" : "#ffffff",
      grid: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
      text: isDark ? "#aaaaaa" : "#666666",
      textPri: isDark ? "#e0e0e0" : "#222222",
      avgLine: "#f5a623",
      prevLine: isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)",
      crosshair: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.30)",
      tooltipBg: isDark ? "rgba(28,28,32,0.96)" : "rgba(255,255,255,0.97)",
      tooltipBorder: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)",
    }),
    [isDark],
  );

  const slotMap = useMemo(() => {
    const map = new Map<string, MinuteBar>();
    data.forEach((b) => map.set(b.time, b));
    return map;
  }, [data]);

  const prevClose = data.length > 0 ? data[0].prevClose : 0;

  const { pMin, pMax } = useMemo(() => {
    if (!data.length) return { pMin: 0, pMax: 1 };
    const all: number[] = [];
    data.forEach((b) => {
      all.push(b.high, b.low, b.close);
      if (b.avgPrice > 0) all.push(b.avgPrice);
    });
    if (prevClose > 0) all.push(prevClose);
    const rawMin = Math.min(...all);
    const rawMax = Math.max(...all);
    if (prevClose > 0) {
      const diff =
        Math.max(Math.abs(rawMax - prevClose), Math.abs(prevClose - rawMin)) *
        1.12;
      return { pMin: prevClose - diff, pMax: prevClose + diff };
    }
    const pad = (rawMax - rawMin) * 0.1 || rawMax * 0.01;
    return { pMin: rawMin - pad, pMax: rawMax + pad };
  }, [data, prevClose]);

  const volMax = useMemo(() => {
    if (!data.length) return 1;
    return Math.max(...data.map((b) => b.volume)) * 1.2;
  }, [data]);

  /* 绘图区宽度（去掉左右 padding） */
  const plotW = canvasWidth - PAD_LEFT - PAD_RIGHT;
  const slotW = plotW / TOTAL_SLOTS;

  /* ── 绘制价格图 ── */
  const drawPrice = useCallback(() => {
    const canvas = priceCanvasRef.current;
    if (!canvas) return;
    const setup = setupCanvas(canvas, canvasWidth, PRICE_H);
    if (!setup) return;
    const { ctx, W, H } = setup;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    const x0 = PAD_LEFT;
    const x1 = W - PAD_RIGHT;
    const y0 = PAD_TOP;
    const h = H - PAD_TOP - PAD_BOT_PRICE;

    // 水平网格 + 右侧价格刻度
    ctx.save();
    ctx.font = "10px monospace";
    for (let i = 0; i <= 4; i++) {
      const val = pMax - ((pMax - pMin) * i) / 4;
      const y = y0 + (h * i) / 4;
      // 网格线
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      // 价格
      ctx.fillStyle = colors.text;
      ctx.textAlign = "left";
      ctx.fillText(val.toFixed(2), x1 + 4, y + 4);
      // 涨跌幅（右侧，彩色）
      if (prevClose > 0) {
        const pct = ((val - prevClose) / prevClose) * 100;
        ctx.fillStyle =
          pct > 0 ? colors.up : pct < 0 ? colors.down : colors.text;
        ctx.fillText(
          `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
          x1 + 4,
          y + 14,
        );
      }
    }
    ctx.restore();

    // 时间轴刻度
    ctx.save();
    ctx.font = "10px monospace";
    ctx.fillStyle = colors.text;
    ctx.textAlign = "center";
    TIME_LABELS.forEach((label) => {
      const slotIdx = SESSION_SLOTS.indexOf(label);
      if (slotIdx < 0) return;
      const x = PAD_LEFT + slotIdx * slotW + slotW / 2;
      ctx.fillText(label, x, H - 4);
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + h);
      ctx.stroke();
    });
    ctx.restore();

    // 昨收基准线（虚线）
    if (prevClose > 0) {
      const baseY = valToY(prevClose, pMin, pMax, y0, h);
      ctx.save();
      ctx.strokeStyle = colors.prevLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, baseY);
      ctx.lineTo(x1, baseY);
      ctx.stroke();
      ctx.restore();
    }

    if (data.length > 0) {
      // 收盘价折线
      const points: { x: number; y: number }[] = [];
      SESSION_SLOTS.forEach((slot, i) => {
        const bar = slotMap.get(slot);
        if (!bar) return;
        points.push({
          x: PAD_LEFT + i * slotW + slotW / 2,
          y: valToY(bar.close, pMin, pMax, y0, h),
        });
      });

      if (points.length > 1) {
        // 渐变填充
        ctx.save();
        const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
        grad.addColorStop(0, "rgba(59,130,246,0.22)");
        grad.addColorStop(1, "rgba(59,130,246,0.02)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(points[0].x, y0 + h);
        points.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, y0 + h);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 折线（蓝色，参考图风格）
        ctx.save();
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        ctx.beginPath();
        points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      // 均价线（橙色）
      const avgPts: { x: number; y: number }[] = [];
      SESSION_SLOTS.forEach((slot, i) => {
        const bar = slotMap.get(slot);
        if (!bar || bar.avgPrice <= 0) return;
        avgPts.push({
          x: PAD_LEFT + i * slotW + slotW / 2,
          y: valToY(bar.avgPrice, pMin, pMax, y0, h),
        });
      });
      if (avgPts.length > 1) {
        ctx.save();
        ctx.strokeStyle = colors.avgLine;
        ctx.lineWidth = 1.2;
        ctx.lineJoin = "round";
        ctx.beginPath();
        avgPts.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [
    data,
    slotMap,
    slotW,
    colors,
    pMin,
    pMax,
    prevClose,
    canvasWidth,
    PRICE_H,
  ]);

  /* ── 绘制成交量图 ── */
  const drawVol = useCallback(() => {
    const canvas = volCanvasRef.current;
    if (!canvas) return;
    const setup = setupCanvas(canvas, canvasWidth, VOL_H);
    if (!setup) return;
    const { ctx, W, H } = setup;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    const y0 = PAD_TOP / 2;
    const h = H - y0 - PAD_BOT_VOL;
    const barW = Math.max(1.5, slotW * 0.72);

    SESSION_SLOTS.forEach((slot, i) => {
      const bar = slotMap.get(slot);
      if (!bar || bar.volume <= 0) return;
      const x = PAD_LEFT + i * slotW + (slotW - barW) / 2;
      const barH = Math.max(1, (bar.volume / volMax) * h);
      // 涨（close >= open）红色，跌绿色；与昨收比较作为补充判断
      const isUp = bar.close >= bar.open;
      ctx.fillStyle = isUp ? colors.up : colors.down;
      ctx.fillRect(x, y0 + h - barH, barW, barH);
    });

    // 成交量刻度（右侧）
    ctx.save();
    ctx.font = "9px monospace";
    ctx.fillStyle = colors.text;
    ctx.textAlign = "left";
    const maxV = volMax / 1.2;
    ctx.fillText(fmtVol(maxV), W - PAD_RIGHT + 4, y0 + 10);
    ctx.restore();
  }, [data, slotMap, slotW, colors, volMax, canvasWidth, VOL_H]);

  /* ── 绘制十字准星 ── */
  const drawCrosshair = useCallback(
    (slotIdx: number | null) => {
      const canvas = overlayRef.current;
      if (!canvas) return;
      const totalH = PRICE_H + VOL_H;
      const setup = setupCanvas(canvas, canvasWidth, totalH);
      if (!setup) return;
      const { ctx, W, H } = setup;
      ctx.clearRect(0, 0, W, H);
      if (slotIdx == null) return;

      const x = PAD_LEFT + slotIdx * slotW + slotW / 2;
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
    [slotW, colors, canvasWidth, PRICE_H, VOL_H],
  );

  /* ── Resize Observer ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvasWidth(el.clientWidth));
    ro.observe(el);
    setCanvasWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    drawPrice();
  }, [drawPrice]);
  useEffect(() => {
    drawVol();
  }, [drawVol]);
  useEffect(() => {
    drawCrosshair(hoverSlot);
  }, [drawCrosshair, hoverSlot]);

  /* ── 鼠标交互 ── */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - PAD_LEFT;
      const idx = Math.max(0, Math.min(Math.floor(x / slotW), TOTAL_SLOTS - 1));
      setHoverSlot(idx);
    },
    [slotW],
  );

  const handleMouseLeave = useCallback(() => setHoverSlot(null), []);

  /* 当前显示 bar */
  const hoverBar =
    hoverSlot != null ? (slotMap.get(SESSION_SLOTS[hoverSlot]) ?? null) : null;
  const lastBar = data.length > 0 ? data[data.length - 1] : null;
  const displayBar = hoverBar ?? lastBar;

  const displayTime =
    hoverSlot != null
      ? SESSION_SLOTS[hoverSlot]
      : (displayBar?.time ?? "--:--");

  const changePct =
    displayBar && prevClose > 0
      ? ((displayBar.close - prevClose) / prevClose) * 100
      : 0;
  const changeAmt =
    displayBar && prevClose > 0 ? displayBar.close - prevClose : 0;
  const changeColor =
    changePct > 0 ? colors.up : changePct < 0 ? colors.down : colors.flat;

  /* 统计数据：今日累计成交量 & 昨日（无昨日数据用 prevClose 估算） */
  const totalVol = useMemo(
    () => data.reduce((s, b) => s + b.volume, 0),
    [data],
  );
  const latestClose = lastBar?.close ?? 0;
  const latestAvg = lastBar?.avgPrice ?? 0;

  return (
    <div style={{ width: "100%" }}>
      {/* ── 顶部信息栏 ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 8px 4px",
          borderBottom: `1px solid var(--border-color)`,
          background: colors.bg,
          fontSize: 12,
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {stockName && (
            <span
              style={{ fontWeight: 600, color: colors.textPri, fontSize: 13 }}
            >
              {stockName}
            </span>
          )}
          <span style={{ color: colors.avgLine }}>
            均价:{latestAvg > 0 ? latestAvg.toFixed(2) : "--"}
          </span>
          <span style={{ color: changeColor }}>
            最新:{latestClose > 0 ? latestClose.toFixed(2) : "--"}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 11,
            color: colors.text,
          }}
        >
          <span>
            今:<span style={{ color: colors.textPri }}>{fmtVol(totalVol)}</span>
          </span>
          {prevClose > 0 && (
            <span>
              昨收:
              <span style={{ color: colors.textPri }}>
                {prevClose.toFixed(2)}
              </span>
            </span>
          )}
          {lastBar && prevClose > 0 && (
            <span>
              变化率:
              <span style={{ color: changeColor }}>
                {(((latestClose - prevClose) / prevClose) * 100).toFixed(2)}%
              </span>
            </span>
          )}
        </div>
      </div>

      {/* ── 图表主体 + 右侧信息面板 ── */}
      <div style={{ display: "flex", width: "100%" }}>
        {/* 图表区域 */}
        <div
          ref={containerRef}
          style={{
            position: "relative",
            flex: 1,
            minWidth: 0,
            userSelect: "none",
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <canvas
            ref={priceCanvasRef}
            style={{ display: "block", width: "100%", height: PRICE_H }}
          />
          <canvas
            ref={volCanvasRef}
            style={{
              display: "block",
              width: "100%",
              height: VOL_H,
              borderTop: `1px solid var(--border-color)`,
            }}
          />
          <canvas
            ref={overlayRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: PRICE_H + VOL_H,
              pointerEvents: "none",
              zIndex: 10,
            }}
          />
        </div>

        {/* ── 右侧信息面板 ── */}
        {mounted && (
          <div
            style={{
              width: INFO_PANEL_W,
              flexShrink: 0,
              background: colors.bg,
              borderLeft: `1px solid var(--border-color)`,
              padding: "10px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 7,
              fontSize: 12,
              justifyContent: "center",
            }}
          >
            {[
              { label: "时间", value: displayTime, color: colors.textPri },
              {
                label: "最新",
                value: displayBar ? displayBar.close.toFixed(2) : "--",
                color: changeColor,
              },
              {
                label: "涨跌幅",
                value: displayBar
                  ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`
                  : "--",
                color: changeColor,
              },
              {
                label: "涨跌",
                value: displayBar
                  ? `${changeAmt >= 0 ? "+" : ""}${changeAmt.toFixed(2)}`
                  : "--",
                color: changeColor,
              },
              {
                label: "均价",
                value:
                  displayBar && displayBar.avgPrice > 0
                    ? displayBar.avgPrice.toFixed(2)
                    : "--",
                color: colors.avgLine,
              },
              {
                label: "成交量",
                value: displayBar ? fmtVol(displayBar.volume) : "--",
                color: colors.textPri,
              },
              {
                label: "金额",
                value: displayBar ? fmtAmt(displayBar.amount) : "--",
                color: colors.textPri,
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ color: colors.text, flexShrink: 0 }}>
                  {label}
                </span>
                <span
                  style={{
                    color,
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "right",
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
