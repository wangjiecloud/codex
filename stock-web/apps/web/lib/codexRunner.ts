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

主要数据表及字段:
- stock_quote: code, name, price, change(涨跌幅%), change_amt, open, prev_close, high, low, volume, turnover, market_cap(市值字段，单位历史上可能不一致，使用前必须结合价格/股本或其他表校验，严禁直接默认按亿元解释), pe(PE TTM), pb, turnover_rate, amplitude, updated_at
- stock_kline: code, period('daily'/'weekly'/'monthly'), trade_date, open, high, low, close, volume, turnover, change_pct, turn_rate  (按 trade_date DESC 取最新)
- stock_indicator: code, trade_date, period('daily'), kdj_k, kdj_d, kdj_j, ma5, ma10, ma20, ma60, macd_diff, macd_dea, macd_hist, rsi14, boll_upper, boll_middle, boll_lower  (已预计算的日线技术指标)
- sw_industry: code, name, level, price, prev_close, open, high, low, change_pct, volume, turnover, pe_static, pe_ttm, pb, dividend_yield, comp_count, updated_at  (申万行业板块快照)
- sw_industry_constituent: board_code, stock_code, stock_name, updated_at  (个股所属申万板块映射)
- stock_minute_kline: code, trade_date, minute_time, open, high, low, close, volume, amount, avg_price, prev_close  (分时/分钟级K线)
- market_breadth: trade_date, up_count, down_count, flat_count, limit_up, limit_down, st_limit_up, st_limit_down, total  (市场宽度/情绪)
- market_daily_fund_flow: trade_date, sh_close, sh_change_pct, sz_close, sz_change_pct, main_net, main_net_pct, super_net, super_net_pct, big_net, big_net_pct, mid_net, mid_net_pct, small_net, small_net_pct  (大盘资金流向历史)
- market_fund_flow_snapshot: trade_date, investor_type(north_bound/main/institution/hot_money/retail), inflow, outflow, netflow, updated_at  (市场资金快照)
- fund_flow_snapshot: trade_date, board_type(concept/industry), period(today/3d/5d/10d), name, index_val, change_pct, inflow, outflow, netflow, comp_count, top_stock, top_stock_change_pct, updated_at  (板块资金流向)
- futures_position_snapshot: trade_date, variety(IF/IH/IC/IM), contract, broker, long_position, short_position, net_position, total_oi, updated_at  (股指期货席位持仓)
- margin_trading_daily: trade_date, market(total/sh/sz/bj), margin_balance, rz_balance, rq_balance, rz_buy, rz_repay, updated_at  (融资融券市场汇总)
- margin_trading_stock_snapshot: trade_date, code, name, rz_balance, rz_buy, rz_repay, rz_net, rq_qty, rq_sell, rq_balance, margin_balance, updated_at  (个股融资融券快照)
- global_market_index: code, name, region, price, change_amt, change_pct, open, high, low, prev_close, market_time, updated_at  (全球市场指数快照)
- global_index_kline: code, period, trade_date, open, high, low, close, volume, change_pct  (全球指数/宽基指数K线)
- concept_board: code, name, change_pct, change_amt, price, volume, turnover, rise_count, fall_count, lead_stock, lead_stock_pct, updated_at  (概念板块)
- stock_meta: code, name, market, industry_ids
- stock_fundamental: code, report_date, eps, roe, revenue(营收), revenue_yoy(营收同比%), net_profit(净利润), net_profit_yoy(净利润同比%), gross_margin(毛利率%), debt_ratio(负债率%), raw_json
- news_flash: id, title, digest, url, ctime, category(important/a/hk/us/abnormal/notice), updated_at  (东方财富快讯，约19341条)
- theme_news: id, theme_id, theme_name, title, source, pub_time, url, updated_at  (同花顺板块主题新闻，约29855条)
- stock_news: code, title, content, pub_time, source  (暂无数据，勿查此表)

F10 基本面详细数据表（由 f10-scraper skill 爬取写入）:
- stock_f10_snapshot: code, eps_basic, eps_diluted, nav_per_share, cfps, pe_ttm, pe_static, pb, roe_weighted(加权ROE%), gross_margin(毛利率%), debt_ratio(资产负债率%), revenue_yoy, net_profit_yoy, report_period, updated_at
- stock_f10_financial_statement: code, statement_type(balance_sheet/income/cashflow), tab_label(按报告期/按年度/按单季度), report_date, content_text(原始文本), updated_at
- stock_f10_dividend_history: code, report_period, announce_date, dividend_plan, dividend_per_share, ex_div_date, updated_at
- stock_f10_institution_forecast: code, institution(机构名), year(如2026E), eps_forecast, rating(买入/增持等), report_date, updated_at
- stock_f10_business_analysis: code, report_date, main_business_breakdown(JSON), rd_expense_ratio, business_review, updated_at
- stock_f10_shareholder_info: code, report_date, top10_holders(文本), updated_at
- stock_f10_peer_comparison: code, report_date, content_text, updated_at
- stock_f10_company_profile: code, main_business, core_competence, industry_background, executives_json, share_structure_json, concept_sectors, capital_operations, updated_at
- stock_f10_key_events: code, event_date, event_type(股东大会/资本运作/限售解禁等), event_desc, updated_at
- stock_f10_fund_flow: code, fund_flow_text, margin_balance, dragon_tiger_text, last_dragon_date, updated_at
- stock_f10_research_report: code, report_date, institution, rating, title, updated_at

查询示例:
  sqlite3 '${DB_PATH}' "SELECT code,name,price,change,pe,pb,market_cap FROM stock_quote WHERE code='000001';"
  sqlite3 '${DB_PATH}' "SELECT trade_date,close,change_pct,volume FROM stock_kline WHERE code='000001' AND period='daily' ORDER BY trade_date DESC LIMIT 60;"
  sqlite3 '${DB_PATH}' "SELECT trade_date,kdj_k,kdj_d,kdj_j,ma5,ma10,ma20,ma60,macd_diff,macd_dea,macd_hist,rsi14,boll_upper,boll_middle,boll_lower FROM stock_indicator WHERE code='000001' AND period='daily' ORDER BY trade_date DESC LIMIT 5;"
  sqlite3 '${DB_PATH}' "SELECT s.code,s.name,s.price,s.change_pct FROM sw_industry_constituent c JOIN sw_industry s ON s.code=c.board_code WHERE c.stock_code='000001';"
  sqlite3 '${DB_PATH}' "SELECT trade_date,close,change_pct,volume FROM stock_kline WHERE code='801780' AND period='daily' ORDER BY trade_date DESC LIMIT 60;"
  sqlite3 '${DB_PATH}' "SELECT minute_time,close,avg_price,volume,amount FROM stock_minute_kline WHERE code='000001' AND trade_date='2026-07-13' ORDER BY minute_time;"
  sqlite3 '${DB_PATH}' "SELECT trade_date,up_count,down_count,limit_up,limit_down,total FROM market_breadth ORDER BY trade_date DESC LIMIT 5;"
  curl -s 'http://localhost:3000/api/market-breadth?summary=1&days=20'
  sqlite3 '${DB_PATH}' "SELECT trade_date,main_net,super_net,big_net,mid_net,small_net FROM market_daily_fund_flow ORDER BY trade_date DESC LIMIT 10;"
  sqlite3 '${DB_PATH}' "SELECT trade_date,investor_type,netflow FROM market_fund_flow_snapshot ORDER BY trade_date DESC LIMIT 10;"
  sqlite3 '${DB_PATH}' "SELECT trade_date,board_type,name,netflow,top_stock FROM fund_flow_snapshot WHERE period='today' ORDER BY trade_date DESC LIMIT 20;"
  sqlite3 '${DB_PATH}' "SELECT trade_date,market,margin_balance,rz_buy,rq_balance FROM margin_trading_daily ORDER BY trade_date DESC LIMIT 20;"
  sqlite3 '${DB_PATH}' "SELECT code,name,rz_net,rz_balance,margin_balance FROM margin_trading_stock_snapshot ORDER BY trade_date DESC LIMIT 20;"
  sqlite3 '${DB_PATH}' "SELECT code,name,region,price,change_pct FROM global_market_index ORDER BY updated_at DESC LIMIT 20;"
  sqlite3 '${DB_PATH}' "SELECT code,name,change_pct,turnover FROM sw_industry ORDER BY change_pct DESC LIMIT 20;"
  sqlite3 '${DB_PATH}' "SELECT code,name,change_pct,lead_stock FROM concept_board ORDER BY change_pct DESC LIMIT 20;"
  sqlite3 '${DB_PATH}' "SELECT * FROM stock_f10_snapshot WHERE code='000001';"
  sqlite3 '${DB_PATH}' "SELECT institution,year,eps_forecast,rating FROM stock_f10_institution_forecast WHERE code='000001' ORDER BY year;"
  sqlite3 '${DB_PATH}' "SELECT event_date,event_type,event_desc FROM stock_f10_key_events WHERE code='000001' ORDER BY event_date DESC LIMIT 20;"`;

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
