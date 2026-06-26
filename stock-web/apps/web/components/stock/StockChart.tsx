"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  IChartApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts";
import { useTheme } from "@/app/theme-provider";

interface KLineBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockChartProps {
  data: KLineBar[];
  activeIndicators: string[];
}

function generateMockKLine(code: string): KLineBar[] {
  const bars: KLineBar[] = [];
  let base = 10 + Math.random() * 40;
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
    });
    base = close;
  }
  return bars;
}

function calcMA(
  data: KLineBar[],
  period: number,
): { time: string; value: number }[] {
  return data
    .map((_, i) => {
      if (i < period - 1) return null;
      const slice = data.slice(i - period + 1, i + 1);
      const avg = slice.reduce((s, b) => s + b.close, 0) / period;
      return { time: data[i].time, value: parseFloat(avg.toFixed(3)) };
    })
    .filter(Boolean) as { time: string; value: number }[];
}

function calcMACD(
  data: KLineBar[],
): { time: string; macd: number; signal: number; hist: number }[] {
  const k = (period: number) => 2 / (period + 1);
  const emas: number[] = [];
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
  return data.map((bar, i) => ({
    time: bar.time,
    macd: parseFloat((dif[i] - dea[i]).toFixed(4)),
    signal: parseFloat(dea[i].toFixed(4)),
    hist: parseFloat(((dif[i] - dea[i]) * 2).toFixed(4)),
  }));
}

function calcKDJ(
  data: KLineBar[],
): { time: string; k: number; d: number; j: number }[] {
  const rsv: number[] = data.map((_, i) => {
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
  return data.map((bar, i) => ({
    time: bar.time,
    k: parseFloat(K[i].toFixed(2)),
    d: parseFloat(D[i].toFixed(2)),
    j: parseFloat((3 * K[i] - 2 * D[i]).toFixed(2)),
  }));
}

function calcBOLL(
  data: KLineBar[],
  period: number = 20,
  stdDev: number = 2,
): { time: string; upper: number; middle: number; lower: number }[] {
  return data
    .map((_, i) => {
      if (i < period - 1) return null;
      const slice = data.slice(i - period + 1, i + 1);
      const closes = slice.map((b) => b.close);
      const middle = closes.reduce((s, v) => s + v, 0) / period;
      const variance =
        closes.reduce((s, v) => s + Math.pow(v - middle, 2), 0) / period;
      const std = Math.sqrt(variance);
      return {
        time: data[i].time,
        upper: parseFloat((middle + stdDev * std).toFixed(3)),
        middle: parseFloat(middle.toFixed(3)),
        lower: parseFloat((middle - stdDev * std).toFixed(3)),
      };
    })
    .filter(Boolean) as {
    time: string;
    upper: number;
    middle: number;
    lower: number;
  }[];
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

export function StockChart({ data, activeIndicators }: StockChartProps) {
  const { theme } = useTheme();
  const mainRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const sub2Ref = useRef<HTMLDivElement>(null);
  const volRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mainRef.current || data.length === 0) return;

    const bgColor = getCssVar("--bg-primary");
    const textColor = getCssVar("--text-secondary");
    const borderColor = getCssVar("--border-color");

    const opts = {
      layout: { background: { color: bgColor }, textColor },
      grid: {
        vertLines: { color: borderColor },
        horzLines: { color: borderColor },
      },
      crosshair: { mode: 1 },
      timeScale: { borderColor, timeVisible: true },
      rightPriceScale: { borderColor },
    };

    // Main chart
    const main = createChart(mainRef.current, { ...opts, height: 280 });
    const candles = main.addSeries(CandlestickSeries, {
      upColor: "#e84444",
      downColor: "#09d464",
      borderUpColor: "#e84444",
      borderDownColor: "#09d464",
      wickUpColor: "#e84444",
      wickDownColor: "#09d464",
    });
    candles.setData(
      data.map((b) => ({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );

    const MA_COLORS = ["#f5a623", "#4ade80", "#60a5fa", "#c084fc", "#f472b6"];
    const MA_PERIODS = [5, 10, 20, 30, 60];
    MA_PERIODS.forEach((p, i) => {
      const ma = main.addSeries(LineSeries, {
        color: MA_COLORS[i],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma.setData(calcMA(data, p));
    });

    if (activeIndicators.includes("BOLL")) {
      const bollData = calcBOLL(data);
      const upperLine = main.addSeries(LineSeries, {
        color: "#f5a623",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      upperLine.setData(
        bollData.map((d) => ({ time: d.time, value: d.upper })),
      );
      const middleLine = main.addSeries(LineSeries, {
        color: "var(--text-secondary)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      middleLine.setData(
        bollData.map((d) => ({ time: d.time, value: d.middle })),
      );
      const lowerLine = main.addSeries(LineSeries, {
        color: "#60a5fa",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      lowerLine.setData(
        bollData.map((d) => ({ time: d.time, value: d.lower })),
      );
    }

    main.timeScale().fitContent();

    // MACD sub-chart
    let macdChart: IChartApi | null = null;
    if (activeIndicators.includes("MACD") && subRef.current) {
      macdChart = createChart(subRef.current, { ...opts, height: 120 });
      const macdData = calcMACD(data);
      const hist = macdChart.addSeries(HistogramSeries, {
        color: "#e84444",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      hist.setData(
        macdData.map((d) => ({
          time: d.time,
          value: d.hist,
          color: d.hist >= 0 ? "#e84444" : "#09d464",
        })),
      );
      const macdLine = macdChart.addSeries(LineSeries, {
        color: "#60a5fa",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      macdLine.setData(macdData.map((d) => ({ time: d.time, value: d.macd })));
      const signalLine = macdChart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      signalLine.setData(
        macdData.map((d) => ({ time: d.time, value: d.signal })),
      );
      macdChart.timeScale().fitContent();
    }

    // KDJ sub-chart
    let kdjChart: IChartApi | null = null;
    if (activeIndicators.includes("KDJ") && sub2Ref.current) {
      kdjChart = createChart(sub2Ref.current, { ...opts, height: 120 });
      const kdjData = calcKDJ(data);
      const kLine = kdjChart.addSeries(LineSeries, {
        color: "#f5a623",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      kLine.setData(kdjData.map((d) => ({ time: d.time, value: d.k })));
      const dLine = kdjChart.addSeries(LineSeries, {
        color: "#60a5fa",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      dLine.setData(kdjData.map((d) => ({ time: d.time, value: d.d })));
      const jLine = kdjChart.addSeries(LineSeries, {
        color: "#c084fc",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      jLine.setData(kdjData.map((d) => ({ time: d.time, value: d.j })));
      kdjChart.timeScale().fitContent();
    }

    // Volume
    let volChart: IChartApi | null = null;
    if (activeIndicators.includes("VOL") && volRef.current) {
      volChart = createChart(volRef.current, { ...opts, height: 100 });
      const vol = volChart.addSeries(HistogramSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
      });
      vol.setData(
        data.map((b, i) => ({
          time: b.time,
          value: b.volume,
          color: b.close >= b.open ? "#e84444" : "#09d464",
        })),
      );
      volChart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (mainRef.current)
        main.applyOptions({ width: mainRef.current.clientWidth });
      if (subRef.current && macdChart)
        macdChart.applyOptions({ width: subRef.current.clientWidth });
      if (sub2Ref.current && kdjChart)
        kdjChart.applyOptions({ width: sub2Ref.current.clientWidth });
      if (volRef.current && volChart)
        volChart.applyOptions({ width: volRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      main.remove();
      macdChart?.remove();
      kdjChart?.remove();
      volChart?.remove();
    };
  }, [data, activeIndicators, theme]);

  return (
    <div className="flex flex-col">
      {/* MA indicators header */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-xs border-b border-[var(--border-color)]">
        {[
          { period: 5, color: "#f5a623" },
          { period: 10, color: "#4ade80" },
          { period: 20, color: "#60a5fa" },
          { period: 30, color: "#c084fc" },
          { period: 60, color: "#f472b6" },
        ].map(({ period, color }) => (
          <span key={period} style={{ color }} className="font-mono">
            MA{period}
          </span>
        ))}
      </div>
      <div ref={mainRef} className="w-full" />
      {activeIndicators.includes("MACD") && (
        <>
          <div className="flex items-center gap-3 px-3 py-1 text-xs border-t border-[var(--border-color)] bg-[var(--bg-primary)]">
            <span className="text-[var(--text-tertiary)]">MACD(10,20,7)</span>
            <span className="text-blue-400">MACD</span>
            <span className="text-yellow-400">DEA</span>
          </div>
          <div ref={subRef} className="w-full" />
        </>
      )}
      {activeIndicators.includes("KDJ") && (
        <>
          <div className="flex items-center gap-3 px-3 py-1 text-xs border-t border-[var(--border-color)] bg-[var(--bg-primary)]">
            <span className="text-[var(--text-tertiary)]">KDJ(9,3,3)</span>
            <span className="text-yellow-400">K</span>
            <span className="text-blue-400">D</span>
            <span className="text-purple-400">J</span>
          </div>
          <div ref={sub2Ref} className="w-full" />
        </>
      )}
      {activeIndicators.includes("VOL") && (
        <>
          <div className="flex items-center gap-2 px-3 py-1 text-xs border-t border-[var(--border-color)] bg-[var(--bg-primary)]">
            <span className="text-[var(--text-tertiary)]">成交量</span>
          </div>
          <div ref={volRef} className="w-full" />
        </>
      )}
    </div>
  );
}

export function generateMockData(code: string): KLineBar[] {
  return generateMockKLine(code);
}
