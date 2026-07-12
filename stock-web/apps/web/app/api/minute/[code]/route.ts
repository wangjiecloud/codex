import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const url = date
    ? `${DATA_SERVICE_URL}/api/minute/${code}?date=${date}`
    : `${DATA_SERVICE_URL}/api/minute/${code}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Data service unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const url = date
    ? `${DATA_SERVICE_URL}/api/minute/${code}/sync?date=${date}`
    : `${DATA_SERVICE_URL}/api/minute/${code}/sync`;

  try {
    const res = await fetch(url, { method: "POST", cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Data service unavailable" },
      { status: 503 },
    );
  }
}
