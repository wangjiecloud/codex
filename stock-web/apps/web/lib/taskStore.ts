// Shared in-memory task store for SSE streaming
// In production, replace with Redis pub/sub

interface TaskEntry {
  events: string[];
  done: boolean;
  clients: ReadableStreamDefaultController[];
}

// Use global to survive hot-reload in dev
const g = globalThis as typeof globalThis & {
  _sseTaskStore?: Map<string, TaskEntry>;
};
if (!g._sseTaskStore) {
  g._sseTaskStore = new Map<string, TaskEntry>();
}

export const taskStore: Map<string, TaskEntry> = g._sseTaskStore;

export function createTask(taskId: string) {
  taskStore.set(taskId, { events: [], done: false, clients: [] });
}

export function pushEvent(taskId: string, event: object) {
  const task = taskStore.get(taskId);
  if (!task) return;
  const line = `data: ${JSON.stringify(event)}\n\n`;
  task.events.push(line);
  task.clients.forEach((ctrl) => {
    try {
      ctrl.enqueue(new TextEncoder().encode(line));
    } catch {}
  });
}

export function completeTask(taskId: string) {
  const task = taskStore.get(taskId);
  if (!task) return;
  task.done = true;
  task.clients.forEach((ctrl) => {
    try {
      ctrl.close();
    } catch {}
  });
  // Cleanup after 5 minutes
  setTimeout(() => taskStore.delete(taskId), 5 * 60 * 1000);
}
