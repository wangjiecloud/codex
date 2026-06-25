import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createTask, pushEvent, completeTask } from "@/lib/taskStore";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, stockName } = body as { code: string; stockName: string };

  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const taskId = randomUUID();
  createTask(taskId);

  setImmediate(async () => {
    try {
      const { runTeamAnalysis } = await import("@stock-web/agents");
      await runTeamAnalysis(code, stockName ?? code, (event) => {
        pushEvent(taskId, event);
        if (event.type === "team_done" || event.type === "error") {
          completeTask(taskId);
        }
      });
    } catch (err) {
      pushEvent(taskId, { type: "error", message: String(err) });
      completeTask(taskId);
    }
  });

  return NextResponse.json({ taskId });
}
