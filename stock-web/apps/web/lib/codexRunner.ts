/**
 * codexRunner.ts
 * 封装 spawn codex exec 的公共逻辑，供各 API route 复用。
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  pushEvent,
  completeTask,
  taskStore,
  registerTaskCanceller,
} from "@/lib/taskStore";

export const CODEX_BIN =
  process.env.CODEX_BIN ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/codex-rs/target/debug/codex",
  );

export const DB_PATH =
  process.env.STOCK_DB_PATH ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/stock-web/apps/data-service/stock_data.db",
  );

export const WORKDIR =
  process.env.STOCK_WORKDIR ||
  path.join(os.homedir(), "codespace/self/SuperJAI/oss/agent/codex/stock-web");

export const DB_SCHEMA = `数据库路径: ${DB_PATH}

【重要】股票行情/K线/分时/基本面/板块/资金流向/融资融券/新闻/快讯/全球指数等数据已改为实时查询，不存数据库。请使用 curl 调用后端 API（base URL: http://localhost:8000）获取实时数据，sqlite3 仅用于查询以下结构性数据表。

数据库中仅保留的结构性数据表:
- industry_list: industry_id, name, description, icon, company_count, last_analyzed, representatives(JSON), sort_order, tab, updated_at  (产业链列表)
- industry_node: industry_id, node_id, x, y, label, icon, desc, layer(upstream/core/downstream/application), ticker, market(A/HK/US), group_name, stocks(JSON数组,A股代码), updated_at  (产业链节点)
- industry_edge: industry_id, edge_id, source, target, layer, label, updated_at  (产业链连接边)
- industry_meta: industry_id, title, subtitle, layer_labels(JSON), sort_order, updated_at  (产业链元信息)
- user_watchlist: id, code, sort_order, added_at  (自选股)
- portfolio_holding: id, code, name, cost_price, shares, closed_pnl_override, created_at, updated_at  (持仓)
- portfolio_trade: id, holding_id, trade_type, trade_date, price, shares, note, created_at  (交易记录)
- memo: id, title, content, pinned, created_at, updated_at  (备忘录)
- user_strategy: id, name, ...  (用户策略)
- xmind_file: id, name, description, created_at, updated_at  (XMind文件)
- xmind_node: id, file_id, parent_id, sheet_id, sheet_title, title, content, url, node_order, source_url, created_at  (XMind节点)

实时数据 API 端点（base URL: http://localhost:8000，用 curl 调用）:
- 行情: GET /api/quote/{code}  → {code, name, price, change, change_pct, open, prev_close, high, low, volume, turnover, market_cap, pe, pb, turnover_rate, amplitude}
- 搜索: GET /api/quote/search?q={关键词}  → [{code, name, price, change}]
- 批量行情: GET /api/quote/batch?codes={code1,code2,...}  → [{code, name, price, change, ...}]
- K线: GET /api/kline/{code}?period=daily&count=120  → [{trade_date, open, high, low, close, volume, turnover, change_pct}]
- 分时: GET /api/minute/{code}?date={YYYY-MM-DD}  → [{minute_time, close, avg_price, volume, amount}]
- 基本面: GET /api/fundamental/{code}  → F10快照(eps/roe/pe/pb/revenue/net_profit等)
- 财务视图: GET /api/fundamental/{code}/finance-view  → 财务报表数据
- 个股新闻: GET /api/news/{code}  → [{title, source, pub_time, url}]
- 股吧资讯: GET /api/guba/{code}  → [{title, url, author, read_count, pub_time}]
- 热门股吧: GET /api/guba/hot  → [{code, name, ...}]
- 快讯: GET /api/flash  → [{title, digest, ctime, category, url}]
- 概念板块: GET /api/board  → [{code, name, change_pct, lead_stock, ...}]
- 板块成分: GET /api/board/constituents/{board_code}  → [{code, name, ...}]
- 产业板块: GET /api/board/industry  → [{code, name, ...}]
- 申万行业: GET /api/sw-industry  → [{code, name, change_pct, ...}]
- 申万行业成分: GET /api/sw-industry/constituents/{board_code}  → [{code, name, ...}]
- 申万行业K线: GET /api/sw-industry/kline/{board_code}  → [{trade_date, close, change_pct, ...}]
- 主题/人气: GET /api/theme  /  GET /api/theme/popular-stocks
- 概念资金流: GET /api/fund-flow/concept  → [{name, mainNet, superNet, bigNet, changePct, ...}]
- 行业资金流: GET /api/fund-flow/industry  → [{name, mainNet, superNet, bigNet, changePct, ...}]
- 市场资金流: GET /api/market-flow/summary  → {main_net, super_net, big_net, ...}
- 北向资金: GET /api/market-flow/north-bound  → {north_net, ...}
- 市场情绪: GET /api/market-breadth  → [{trade_date, up_count, down_count, limit_up, limit_down, ...}]
- 市场情绪汇总: GET /api/market-breadth/summary?days=20  → {sentiment_score, sentiment_level, signals, ...}
- 融资融券: GET /api/margin-trading/latest  /  GET /api/margin-trading/history  /  GET /api/margin-trading/stocks
- 全球指数: GET /api/global/indices  → [{code, name, price, change_pct, ...}]
- 全球概览: GET /api/global/overview  → {indices, ...}

查询示例:
  curl -s 'http://localhost:8000/api/quote/000001'
  curl -s 'http://localhost:8000/api/kline/000001?period=daily&count=120'
  curl -s 'http://localhost:8000/api/fundamental/000001'
  curl -s 'http://localhost:8000/api/sw-industry'
  curl -s 'http://localhost:8000/api/market-breadth/summary?days=20'
  curl -s 'http://localhost:8000/api/fund-flow/concept'
  curl -s 'http://localhost:8000/api/margin-trading/latest'
  curl -s 'http://localhost:8000/api/global/indices'
  sqlite3 '${DB_PATH}' "SELECT industry_id,name,company_count FROM industry_list ORDER BY sort_order;"
  sqlite3 '${DB_PATH}' "SELECT node_id,label,stocks FROM industry_node WHERE industry_id='aiserver';"
  sqlite3 '${DB_PATH}' "SELECT code,name,cost_price,shares FROM portfolio_holding;"
  sqlite3 '${DB_PATH}' "SELECT code,sort_order FROM user_watchlist ORDER BY sort_order;"`;

export function loadLlmEnv(): Record<string, string> {
  if (process.env.LLM_AUTHORIZATION && process.env.LLM_USER) {
    return {
      LLM_AUTHORIZATION: process.env.LLM_AUTHORIZATION,
      LLM_USER: process.env.LLM_USER,
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
      return { LLM_AUTHORIZATION: cfg.authorization, LLM_USER: cfg.user };
    } catch {
      /* fall through */
    }
  }
  return {};
}

/**
 * 初始化一个新 session：只发 system prompt 建立角色，不推送任何消息给前端。
 * 返回 Promise<thread_id>，供后续 runCodex resume 使用。
 */
export function initSession(systemPrompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...loadLlmEnv() };
    const child = spawn(
      CODEX_BIN,
      [
        "exec",
        "--json",
        "--sandbox",
        "workspace-write",
        "-C",
        WORKDIR,
        "-c",
        "project_doc_max_bytes=0",
        systemPrompt,
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );

    let buffer = "";
    let threadId: string | null = null;

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const ev = JSON.parse(trimmed) as {
            type: string;
            thread_id?: string;
          };
          if (ev.type === "thread.started" && ev.thread_id) {
            threadId = ev.thread_id;
          }
        } catch {
          /* ignore */
        }
      }
    });

    child.on("error", reject);
    child.on("close", () => {
      if (threadId) resolve(threadId);
      else reject(new Error("No thread_id received from codex"));
    });
  });
}

/**
 * 运行 codex exec 或 resume，将 stdout JSONL 事件流解析后通过 pushEvent 推送。
 * - sessionId 为空：新建 session（不推荐，应先调用 initSession）
 * - sessionId 非空：resume 已有 session，上下文完整保留。
 * 完成后调用 completeTask。
 */
export function runCodex(
  taskId: string,
  prompt: string,
  sessionId?: string,
): void {
  const env: NodeJS.ProcessEnv = { ...process.env, ...loadLlmEnv() };

  const args = sessionId
    ? [
        "exec",
        "resume",
        sessionId,
        "--json",
        "--dangerously-bypass-approvals-and-sandbox",
        prompt,
      ]
    : [
        "exec",
        "--json",
        "--sandbox",
        "workspace-write",
        "-C",
        WORKDIR,
        "-c",
        "project_doc_max_bytes=0",
        prompt,
      ];

  const child = spawn(CODEX_BIN, args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const task = taskStore.get(taskId);
  registerTaskCanceller(taskId, () => {
    child.kill("SIGTERM");
  });

  let buffer = "";

  child.stdout.on("data", (chunk: Buffer) => {
    if (task?.cancelled) {
      child.kill("SIGTERM");
      return;
    }
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const ev = JSON.parse(trimmed) as {
          type: string;
          thread_id?: string;
          item_id?: string;
          delta?: string;
          item?: { id?: string; type: string; text?: string; message?: string };
          usage?: { input_tokens: number; output_tokens: number };
          error?: { message?: string };
        };

        if (ev.type === "thread.started" && ev.thread_id) {
          pushEvent(taskId, { type: "session_id", sessionId: ev.thread_id });
        } else if (ev.type === "item.delta" && ev.delta) {
          // 真正的流式 token-by-token delta（来自 AgentMessageDelta）
          pushEvent(taskId, { type: "stream_delta", delta: ev.delta });
        } else if (
          ev.type === "item.completed" &&
          ev.item?.type === "agent_message" &&
          ev.item.text
        ) {
          // item 完成时：解析进度标记（agent_start/agent_done/team_done）
          // stream_delta 已经推送了全文，这里只处理进度标记
          processAgentMessage(taskId, ev.item.text, true);
        } else if (ev.type === "turn.completed") {
          pushEvent(taskId, { type: "done", usage: ev.usage });
          completeTask(taskId);
        } else if (ev.type === "turn.failed") {
          const msg = ev.error?.message ?? "unknown error";
          pushEvent(taskId, { type: "error", message: msg });
          completeTask(taskId);
        }
      } catch {
        /* ignore non-JSON */
      }
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    if (task?.cancelled) {
      child.kill("SIGTERM");
      return;
    }
    console.error("[codex]", chunk.toString().trim());
  });

  child.on("error", (err: Error) => {
    pushEvent(taskId, {
      type: "error",
      message: `Failed to start codex: ${err.message}`,
    });
    completeTask(taskId);
  });

  child.on("close", (code: number | null) => {
    if (task?.cancelled) {
      pushEvent(taskId, { type: "cancelled" });
      completeTask(taskId);
      return;
    }
    if (code !== 0) {
      const store = (
        globalThis as { _sseTaskStore?: Map<string, { done: boolean }> }
      )._sseTaskStore;
      const task = store?.get(taskId);
      if (task && !task.done) {
        pushEvent(taskId, {
          type: "error",
          message: `codex exited with code ${code}`,
        });
        completeTask(taskId);
      }
    }
  });
}

/**
 * 解析 agent message 文本中的进度标记，拆分成多个 SSE 事件。
 * streamOnly=true 时：只推 agent_start/agent_done/team_done，不重复推 agent_message（已由 stream_delta 推送）
 * streamOnly=false 时：进度标记 + 普通文本都推（非流式场景，如 initSession 完成后）
 */
function processAgentMessage(
  taskId: string,
  text: string,
  streamOnly = false,
): void {
  const lines = text.split("\n");
  let plainLines: string[] = [];

  for (const line of lines) {
    const startMatch = line.match(/^\[AGENT_START:(\w+)\]/);
    const doneMatch = line.match(/^\[AGENT_DONE:(\w+)\]([\s\S]*)/);
    const teamDoneMatch = line.match(/^\[TEAM_DONE\]([\s\S]*)/);

    if (startMatch) {
      if (!streamOnly && plainLines.length) {
        const txt = plainLines.join("\n").trim();
        if (txt) pushEvent(taskId, { type: "agent_message", text: txt });
        plainLines = [];
      }
      pushEvent(taskId, {
        type: "agent_start",
        agentId: startMatch[1],
        agentLabel: AGENT_LABELS[startMatch[1]] ?? startMatch[1],
      });
    } else if (doneMatch) {
      if (!streamOnly && plainLines.length) {
        const txt = plainLines.join("\n").trim();
        if (txt) pushEvent(taskId, { type: "agent_message", text: txt });
        plainLines = [];
      }
      const summary = doneMatch[2].trim();
      pushEvent(taskId, {
        type: "agent_done",
        agentId: doneMatch[1],
        agentLabel: AGENT_LABELS[doneMatch[1]] ?? doneMatch[1],
        result: summary,
      });
    } else if (teamDoneMatch) {
      if (!streamOnly && plainLines.length) {
        const txt = plainLines.join("\n").trim();
        if (txt) pushEvent(taskId, { type: "agent_message", text: txt });
        plainLines = [];
      }
      const advice = teamDoneMatch[1].trim();
      pushEvent(taskId, { type: "team_done", advice });
    } else {
      if (!streamOnly) plainLines.push(line);
    }
  }

  if (!streamOnly && plainLines.length) {
    const txt = plainLines.join("\n").trim();
    if (txt) pushEvent(taskId, { type: "agent_message", text: txt });
  }
}

const AGENT_LABELS: Record<string, string> = {
  data: "数据采集",
  technical: "技术分析",
  fundamental: "基本面",
  market: "盘面分析",
  news: "新闻舆情",
  advisor: "投资建议",
};

/**
 * runCodexAsync: 与 runCodex 相同，但返回 Promise<string>（完整输出文本）。
 * 流式 delta 仍实时推送前端；本函数不调用 completeTask，由调用方统一处理。
 */
export function runCodexAsync(
  taskId: string,
  prompt: string,
  sessionId: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...loadLlmEnv() };

    const args = [
      "exec",
      "resume",
      sessionId,
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
      prompt,
    ];

    const child = spawn(CODEX_BIN, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "";
    let fullText = "";

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const ev = JSON.parse(trimmed) as {
            type: string;
            delta?: string;
            item?: { type: string; text?: string };
            error?: { message?: string };
          };

          if (ev.type === "item.delta" && ev.delta) {
            pushEvent(taskId, { type: "stream_delta", delta: ev.delta });
            fullText += ev.delta;
          } else if (
            ev.type === "item.completed" &&
            ev.item?.type === "agent_message" &&
            ev.item.text
          ) {
            fullText = ev.item.text;
          } else if (ev.type === "turn.failed") {
            reject(new Error(ev.error?.message ?? "unknown error"));
          }
        } catch {
          /* ignore */
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      console.error("[codex]", chunk.toString().trim());
    });

    child.on("error", reject);

    child.on("close", (code: number | null) => {
      if (code !== 0 && !fullText) {
        reject(new Error(`codex exited with code ${code}`));
      } else {
        resolve(fullText);
      }
    });
  });
}
