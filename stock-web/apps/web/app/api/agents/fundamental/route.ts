import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, stockName, question } = body as {
    code?: string;
    stockName?: string;
    question?: string;
  };

  try {
    const { runFundamentalAgent, fundamentalChat } =
      await import("@stock-web/agents");

    if (question && !code) {
      const result = await fundamentalChat(question);
      return NextResponse.json({ result });
    }

    if (question && code) {
      const result = await fundamentalChat(question, code, stockName);
      return NextResponse.json({ result });
    }

    const result = await runFundamentalAgent({ code, stockName });
    return NextResponse.json({ result: result.summary, data: result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
