import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sort = searchParams.get("sort") ?? "hot";
  const size = searchParams.get("size") ?? "20";

  try {
    const res = await fetch(
      `${DATA_SERVICE_URL}/api/theme/popular-stocks?sort=${sort}&size=${size}`,
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
  } catch (e) {
    console.error("[popular-stocks route]", e);
    return NextResponse.json(
      { error: "Failed to fetch popular stocks" },
      { status: 500 },
    );
  }
}
