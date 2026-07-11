import { NextRequest, NextResponse } from "next/server";
import { listSessions, upsertSession, deleteSession } from "@/lib/agentDb";

/** GET /api/agents/sessions?agentId=xxx → 返回该 agent 所有会话 */
export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });
  try {
    const sessions = listSessions(agentId);
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** POST /api/agents/sessions → 保存（upsert）一个会话 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      id: string;
      agentId: string;
      title: string;
      codexSid?: string;
      createdAt: number;
      updatedAt: number;
      messages: { role: "user" | "agent"; content: string }[];
    };
    upsertSession(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** DELETE /api/agents/sessions?sessionId=xxx → 删除会话 */
export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  try {
    deleteSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
