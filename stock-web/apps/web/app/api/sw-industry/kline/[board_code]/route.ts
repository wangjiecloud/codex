import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ board_code: string }> },
) {
  const { board_code } = await params;
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "daily";
  const count = searchParams.get("count") || "200";

  try {
    const res = await fetch(
      `${DATA_SERVICE_URL}/api/sw-industry/kline/${board_code}?period=${period}&count=${count}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `Data service error: ${res.status}` },
        { status: res.status },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Data service unavailable" },
      { status: 503 },
    );
  }
}
