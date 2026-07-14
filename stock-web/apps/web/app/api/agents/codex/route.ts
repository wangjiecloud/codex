import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { createTask, pushEvent, completeTask } from "@/lib/taskStore";

const CODEX_BIN =
  process.env.CODEX_BIN ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/codex-rs/target/debug/codex",
  );

const DB_PATH =
  process.env.STOCK_DB_PATH ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/stock-web/apps/data-service/stock_data.db",
  );

const WORKDIR =
  process.env.STOCK_WORKDIR ||
  path.join(os.homedir(), "codespace/self/SuperJAI/oss/agent/codex/stock-web");

const SYSTEM_PROMPT = `你是一个专业的A股股票分析助手。你可以通过运行 sqlite3 命令查询本地股票数据库来回答用户问题。

数据库路径: ${DB_PATH}

主要数据表及字段:
- stock_quote: code, name, price, change(涨跌幅%), change_amt(涨跌额), open, prev_close, high, low, volume, turnover, market_cap(市值), pe, pb, turnover_rate, updated_at
- stock_kline: code, period('daily'), trade_date, open, high, low, close, volume, turnover, change_pct, turn_rate
- stock_meta: code, name, market, industry_ids
- stock_fundamental: code, report_date, eps, roe, revenue, revenue_yoy, net_profit, net_profit_yoy, gross_margin, debt_ratio
- news_flash: id, title, digest, ctime, category(important/a/hk/us/abnormal/notice)  (东方财富快讯，约19341条)
- theme_news: id, theme_id, theme_name, title, source, pub_time  (板块主题新闻，约29855条)
- stock_news: code, title, content, pub_time, source  (暂无数据，勿查此表)

查询示例:
  sqlite3 '${DB_PATH}' 'SELECT code,name,price,change FROM stock_quote WHERE code="000001";'
  sqlite3 '${DB_PATH}' 'SELECT trade_date,close,change_pct FROM stock_kline WHERE code="000001" AND period="daily" ORDER BY trade_date DESC LIMIT 20;'
  sqlite3 '${DB_PATH}' 'SELECT code,name,price,change FROM stock_quote ORDER BY change DESC LIMIT 10;'

回答时请用中文，结合查询到的真实数据给出专业分析。`;

function loadLlmAuth(): {
  authorization: string | undefined;
  user: string | undefined;
} {
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
      const raw = fs.readFileSync(configPath, "utf-8");
      const cfg = JSON.parse(raw) as {
        authorization: string;
        user: string;
      };
      return { authorization: cfg.authorization, user: cfg.user };
    } catch {
      // fall through
    }
  }
  return { authorization: undefined, user: undefined };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt } = body as { prompt?: string };

  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const taskId = randomUUID();
  createTask(taskId);

  setImmediate(() => {
    const auth = loadLlmAuth();

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...(auth.authorization ? { LLM_AUTHORIZATION: auth.authorization } : {}),
      ...(auth.user ? { LLM_USER: auth.user } : {}),
    };

    const fullPrompt = `${SYSTEM_PROMPT}\n\n用户问题: ${prompt}`;

    const args = [
      "exec",
      "--json",
      "--sandbox",
      "workspace-write",
      "-C",
      WORKDIR,
      fullPrompt,
    ];

    const child = spawn(CODEX_BIN, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "";

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as {
            type: string;
            item?: { type: string; text?: string; message?: string };
            usage?: { input_tokens: number; output_tokens: number };
          };

          if (
            event.type === "item.completed" &&
            event.item?.type === "agent_message" &&
            event.item.text
          ) {
            pushEvent(taskId, {
              type: "agent_message",
              text: event.item.text,
            });
          } else if (
            event.type === "item.completed" &&
            event.item?.type === "error"
          ) {
            // Ignore metadata warnings (model not found fallback warnings)
            const msg = event.item.message ?? "";
            if (!msg.includes("not found") && !msg.includes("Defaulting")) {
              pushEvent(taskId, { type: "error", message: msg });
            }
          } else if (event.type === "turn.completed") {
            pushEvent(taskId, {
              type: "done",
              usage: event.usage,
            });
            completeTask(taskId);
          }
        } catch {
          // Not valid JSON, ignore
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const msg = chunk.toString();
      // Log to server console but don't send to client (stderr contains warnings)
      console.error("[codex-agent]", msg.trim());
    });

    child.on("error", (err: Error) => {
      pushEvent(taskId, {
        type: "error",
        message: `Failed to start codex: ${err.message}`,
      });
      completeTask(taskId);
    });

    child.on("close", (code: number | null) => {
      if (code !== 0) {
        const task = (
          globalThis as { _sseTaskStore?: Map<string, { done: boolean }> }
        )._sseTaskStore?.get(taskId);
        if (task && !task.done) {
          pushEvent(taskId, {
            type: "error",
            message: `codex exited with code ${code}`,
          });
          completeTask(taskId);
        }
      }
    });
  });

  return NextResponse.json({ taskId });
}
