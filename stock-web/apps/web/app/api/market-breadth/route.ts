import { NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = searchParams.get("days") || "60";
  const summary = searchParams.get("summary") || "0";
  const path =
    summary === "1"
      ? `/api/market-breadth/summary?days=${days}`
      : `/api/market-breadth?days=${days}`;
  const res = await fetch(`${DATA_SERVICE_URL}${path}`, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || "";
  const url = date
    ? `${DATA_SERVICE_URL}/api/market-breadth/sync?date=${date}`
    : `${DATA_SERVICE_URL}/api/market-breadth/sync`;
  const res = await fetch(url, { method: "POST", cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data);
}
