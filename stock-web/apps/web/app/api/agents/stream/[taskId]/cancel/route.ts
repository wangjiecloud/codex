import { NextResponse } from "next/server";
import { cancelTask } from "@/lib/taskStore";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const ok = cancelTask(taskId);
  if (!ok) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
