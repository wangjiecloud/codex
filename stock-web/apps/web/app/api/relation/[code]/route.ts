import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const { searchParams } = new URL(req.url);
  const top = searchParams.get("top") || "5";
  try {
    const res = await fetch(
      `${DATA_SERVICE_URL}/api/relation/${code}?top=${top}`,
      { cache: "no-store" },
    );
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
