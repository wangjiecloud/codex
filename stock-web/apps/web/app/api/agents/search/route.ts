import { NextRequest, NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query } = body;

  if (!query?.trim()) {
    return NextResponse.json({ error: "查询条件不能为空" }, { status: 400 });
  }

  try {
    const apiRes = await fetch(`${DATA_SERVICE_URL}/api/ai-screen/screen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!apiRes.ok || !apiRes.body) {
      return NextResponse.json(
        { error: `数据服务返回错误: ${apiRes.status}` },
        { status: 502 },
      );
    }

    return new NextResponse(apiRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `数据服务连接失败: ${String(e)}` },
      { status: 502 },
    );
  }
}
