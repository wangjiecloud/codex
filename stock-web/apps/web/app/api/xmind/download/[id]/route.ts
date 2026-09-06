import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const res = await fetch(`${DATA_SERVICE_URL}/api/xmind/download/${id}`);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Data service error: ${res.status}` },
        { status: res.status },
      );
    }
    const buffer = await res.arrayBuffer();
    const headers = new Headers();
    headers.set(
      "Content-Disposition",
      res.headers.get("Content-Disposition") ||
        'attachment; filename="xmind.xmind"',
    );
    headers.set("Content-Type", "application/octet-stream");
    return new NextResponse(buffer, { headers });
  } catch {
    return NextResponse.json(
      { error: "Data service unavailable" },
      { status: 503 },
    );
  }
}
