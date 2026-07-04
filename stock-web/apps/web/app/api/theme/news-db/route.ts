import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const themeId = searchParams.get("theme_id") ?? "";
  const page = searchParams.get("page") ?? "1";
  const pageSize = searchParams.get("page_size") ?? "30";
  const q = searchParams.get("q") ?? "";

  try {
    const params = new URLSearchParams({ page, page_size: pageSize });
    if (themeId) params.set("theme_id", themeId);
    if (q) params.set("q", q);

    const res = await fetch(
      `${DATA_SERVICE_URL}/api/theme/news-db?${params.toString()}`,
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
    console.error("[theme/news-db route]", e);
    return NextResponse.json(
      { error: "Failed to fetch theme news" },
      { status: 500 },
    );
  }
}
