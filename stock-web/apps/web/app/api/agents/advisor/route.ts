import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, stockName, question } = body as {
    code?: string;
    stockName?: string;
    question?: string;
  };

  try {
    const { runAdvisorAgent, advisorChat } = await import("@stock-web/agents");

    if (question && !code) {
      const result = await advisorChat(question);
      return NextResponse.json({ result });
    }

    if (question && code) {
      const result = await advisorChat(question, code, stockName);
      return NextResponse.json({ result });
    }

    const result = await runAdvisorAgent({ code, stockName });
    return NextResponse.json({ result: result.summary, data: result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
