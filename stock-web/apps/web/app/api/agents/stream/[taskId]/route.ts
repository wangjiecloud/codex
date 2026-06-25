import { NextRequest } from "next/server";
import { taskStore } from "@/lib/taskStore";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const task = taskStore.get(taskId);

  const stream = new ReadableStream({
    start(controller) {
      if (!task) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "error", message: "Task not found" })}\n\n`,
          ),
        );
        controller.close();
        return;
      }

      // Replay buffered events
      task.events.forEach((line) => {
        controller.enqueue(new TextEncoder().encode(line));
      });

      if (task.done) {
        controller.close();
        return;
      }

      task.clients.push(controller);
    },
    cancel() {
      if (!task) return;
      task.clients = task.clients.filter((c) => {
        try {
          return true;
        } catch {
          return false;
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
