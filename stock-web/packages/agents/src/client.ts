import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface LlmConfig {
  authorization: string;
  user: string;
}

function loadLlmConfig(): LlmConfig {
  // Try env first, then config file
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
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as LlmConfig;
  }
  throw new Error(
    "LLM config not found. Set LLM_AUTHORIZATION and LLM_USER env vars, or create ~/.config/opencode/llm-config.json",
  );
}

export const DEFAULT_MODEL = "claude-sonnet-4.6";
export const BASE_URL =
  "https://apiprod.midea.com/llm/f-devops-python-litellm/v1";

let _client: OpenAI | null = null;
let _llmConfig: LlmConfig | null = null;

export function getLlmConfig(): LlmConfig {
  if (!_llmConfig) {
    _llmConfig = loadLlmConfig();
  }
  return _llmConfig;
}

export function createClient(): OpenAI {
  if (_client) return _client;
  const config = getLlmConfig();
  _client = new OpenAI({
    apiKey: "placeholder", // Not used, auth via header
    baseURL: BASE_URL,
    defaultHeaders: {
      Authorization: config.authorization,
      user: config.user,
    },
  });
  return _client;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(
  messages: ChatMessage[],
  model: string = DEFAULT_MODEL,
  maxTokens: number = 4096,
): Promise<string> {
  const client = createClient();
  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
  });
  return response.choices[0]?.message?.content ?? "";
}

export async function* chatStream(
  messages: ChatMessage[],
  model: string = DEFAULT_MODEL,
  maxTokens: number = 4096,
): AsyncGenerator<string> {
  const client = createClient();
  const stream = await client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
