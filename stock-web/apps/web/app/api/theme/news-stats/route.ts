import { NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${DATA_SERVICE_URL}/api/theme/news-stats`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Data service error: ${res.status}` },
        { status: res.status },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("[theme/news-stats route]", e);
    return NextResponse.json(
      { error: "Failed to fetch theme news stats" },
      { status: 500 },
    );
  }
}
