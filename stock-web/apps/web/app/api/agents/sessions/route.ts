import { NextRequest, NextResponse } from "next/server";
import {
  listSessions,
  listSessionMessages,
  upsertSession,
  deleteSession,
} from "@/lib/agentDb";

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId");
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (sessionId) {
    const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "30");
    try {
      const { messages, total } = listSessionMessages(sessionId, offset, limit);
      return NextResponse.json({ messages, total, offset, limit });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }
  if (!agentId)
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  try {
    const sessions = listSessions(agentId);
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id: string;
      agentId: string;
      title: string;
      codexSid?: string;
      createdAt: number;
      updatedAt: number;
      messageCount?: number;
      messages: { role: "user" | "agent"; content: string }[];
    };
    upsertSession({
      ...body,
      messageCount: body.messageCount ?? body.messages.length,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId)
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  try {
    deleteSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
