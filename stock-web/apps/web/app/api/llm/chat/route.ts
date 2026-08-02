import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const LLM_BASE_URL = "https://apiprod.midea.com/llm/f-devops-python-litellm/v1";
const LLM_MODEL = "claude-sonnet-4.6";

function loadLlmHeaders(): Record<string, string> {
  if (process.env.LLM_AUTHORIZATION) {
    return {
      Authorization: process.env.LLM_AUTHORIZATION,
      user: process.env.LLM_USER ?? "",
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
      return { Authorization: cfg.authorization, user: cfg.user };
    } catch {
      /* fall through */
    }
  }
  return {};
}

export async function POST(req: NextRequest) {
  let body: { prompt?: string; system?: string };
  try {
    body = (await req.json()) as { prompt?: string; system?: string };
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const { prompt, system } = body;
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "prompt 不能为空" }, { status: 400 });
  }

  const messages: { role: string; content: string }[] = [];
  if (system?.trim()) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: prompt });

  try {
    const headers = loadLlmHeaders();
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ model: LLM_MODEL, messages, max_tokens: 1024 }),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `LLM API error ${res.status}: ${text}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const content = data.choices[0]?.message?.content ?? "";
    return NextResponse.json({ result: content });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "LLM 调用失败" },
      { status: 500 },
    );
  }
}
