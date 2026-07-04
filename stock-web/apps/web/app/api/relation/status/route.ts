import { NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${DATA_SERVICE_URL}/api/relation/status`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Data service error: ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(
      { error: "Data service unavailable" },
      { status: 503 },
    );
  }
}
