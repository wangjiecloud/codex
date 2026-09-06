/**
 * llmStream.ts
 * 直接调用 LiteLLM (chat/completions) 流式接口，逐 token 推送 SSE 事件。
 * 不经过 codex exec，避免 codex JSONL 层不透传 delta 的问题。
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { pushEvent, completeTask } from "@/lib/taskStore";

const BASE_URL = "https://apiprod.midea.com/llm/f-devops-python-litellm/v1";

function loadLlmConfig(): { authorization: string; user: string } {
  if (process.env.LLM_AUTHORIZATION && process.env.LLM_USER) {
    return {
      authorization: process.env.LLM_AUTHORIZATION,
      user: process.env.LLM_USER,
    };
  }
  const configPath = path.join(
    os.homedir(),
    ".config",
    "opencode",
    "llm-config.json",
  );
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
        authorization: string;
        user: string;
      };
      return { authorization: cfg.authorization, user: cfg.user };
    } catch {
      /* fall through */
    }
  }
  return { authorization: "", user: "" };
}

function loadCurrentModel(): string {
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const m = content.match(/^model\s*=\s*"([^"]+)"/m);
      if (m) return m[1];
    } catch {
      /* fall through */
    }
  }
  return "hw-glm-5";
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 流式调用 LiteLLM，逐 token 推 stream_delta 到 taskStore。
 * messages: 完整的上下文消息数组（含 system prompt）
 */
export async function streamLlm(
  taskId: string,
  messages: LlmMessage[],
): Promise<void> {
  const { authorization, user } = loadLlmConfig();
  const model = loadCurrentModel();

  const body = JSON.stringify({
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  });

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authorization,
        "user": user,
      },
      body,
    });
  } catch (err) {
    pushEvent(taskId, { type: "error", message: `Network error: ${err}` });
    completeTask(taskId);
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    pushEvent(taskId, {
      type: "error",
      message: `LLM error ${res.status}: ${text.slice(0, 200)}`,
    });
    completeTask(taskId);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE 按 \n\n 分帧
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";

      for (const part of parts) {
        for (const line of part.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            pushEvent(taskId, { type: "done" });
            completeTask(taskId);
            return;
          }
          try {
            const chunk = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              pushEvent(taskId, { type: "stream_delta", delta });
            }
          } catch {
            /* skip malformed */
          }
        }
      }
    }
  } catch (err) {
    pushEvent(taskId, { type: "error", message: `Stream read error: ${err}` });
  } finally {
    pushEvent(taskId, { type: "done" });
    completeTask(taskId);
    reader.releaseLock();
  }
}
