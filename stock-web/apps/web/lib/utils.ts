import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPercent(val: number): string {
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

export function formatPrice(val: number): string {
  return val.toFixed(3);
}

export function getPriceColor(change: number): string {
  if (change > 0) return "text-[#e84444]";
  if (change < 0) return "text-[#09d464]";
  return "text-gray-400";
}
