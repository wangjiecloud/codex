import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sort = searchParams.get("sort") ?? "hot";

  try {
    const res = await fetch(
      `${DATA_SERVICE_URL}/api/theme/popular-stocks/refresh?sort=${sort}`,
      {
        method: "POST",
        cache: "no-store",
      },
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
    console.error("[popular-stocks/refresh route]", e);
    return NextResponse.json(
      { error: "Failed to refresh popular stocks" },
      { status: 500 },
    );
  }
}
