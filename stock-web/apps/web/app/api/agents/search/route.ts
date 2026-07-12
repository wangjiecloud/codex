import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const DB_PATH =
  process.env.STOCK_DB_PATH ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/stock-web/apps/data-service/stock_data.db",
  );

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

async function callLLM(
  messages: { role: string; content: string }[],
): Promise<string> {
  const headers = loadLlmHeaders();
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ model: LLM_MODEL, messages, max_tokens: 4096 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "";
}

function executeSql(sql: string): { columns: string[]; rows: string[][] } {
  const tmpFile = path.join(os.tmpdir(), `stock_query_${Date.now()}.sql`);
  try {
    fs.writeFileSync(tmpFile, sql, "utf-8");
    let result: string;
    try {
      result = execSync(
        `sqlite3 -csv -header ${JSON.stringify(DB_PATH)} < ${JSON.stringify(tmpFile)}`,
        { encoding: "utf-8", timeout: 20000 },
      );
    } catch (execErr) {
      const errMsg =
        execErr instanceof Error ? execErr.message : String(execErr);
      throw new Error(`sqlite3 执行失败：${errMsg}\n--- SQL ---\n${sql}`);
    }
    const lines = result.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return { columns: [], rows: [] };

    const parseCsvLine = (line: string): string[] => {
      const cells: string[] = [];
      let inQuote = false;
      let cell = "";
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && !inQuote) {
          inQuote = true;
          continue;
        }
        if (ch === '"' && inQuote) {
          if (line[i + 1] === '"') {
            cell += '"';
            i++;
          } else inQuote = false;
          continue;
        }
        if (ch === "," && !inQuote) {
          cells.push(cell);
          cell = "";
          continue;
        }
        cell += ch;
      }
      cells.push(cell);
      return cells;
    };

    const columns = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map(parseCsvLine);
    return { columns, rows };
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

/** 诊断空结果原因：执行几条简单 COUNT，返回数据实况字符串 */
function diagnoseEmpty(sql: string): string {
  const results: string[] = [];

  // 1. 确认参与 JOIN 的各表在该查询范围内的数据量
  const diagnosticSqls: { label: string; sql: string }[] = [
    {
      label: "stock_quote 总行数",
      sql: "SELECT COUNT(*) FROM stock_quote WHERE price > 0",
    },
    {
      label: "stock_kline daily 股票数",
      sql: "SELECT COUNT(DISTINCT code) FROM stock_kline WHERE period='daily'",
    },
    {
      label: "stock_meta 有 industry_ids 的股票数",
      sql: "SELECT COUNT(*) FROM stock_meta WHERE industry_ids IS NOT NULL AND industry_ids != '[]'",
    },
  ];

  // 如果 SQL 中包含产业链过滤，额外诊断能匹配到的 meta 数量
  if (sql.includes("industry_ids")) {
    diagnosticSqls.push({
      label:
        "stock_meta 产业链匹配数（aigpu+pcb+optics+memory+aiserver+semieq 等）",
      sql: `SELECT COUNT(*) FROM stock_meta WHERE
        industry_ids LIKE '%aigpu%' OR industry_ids LIKE '%pcb%' OR
        industry_ids LIKE '%mlcc%' OR industry_ids LIKE '%memory%' OR
        industry_ids LIKE '%optics%' OR industry_ids LIKE '%fiber%' OR
        industry_ids LIKE '%liquidcool%' OR industry_ids LIKE '%aipower%' OR
        industry_ids LIKE '%coppercable%' OR industry_ids LIKE '%idc%' OR
        industry_ids LIKE '%glasssub%' OR industry_ids LIKE '%aiserver%' OR
        industry_ids LIKE '%semieq%'`,
    });
  }

  // 如果 SQL 用了 kline_ma CTE / stock_kline，诊断均线数据
  if (sql.includes("kline_ma") || sql.includes("stock_kline")) {
    diagnosticSqls.push({
      label: "stock_kline 最新 trade_date",
      sql: "SELECT MAX(trade_date) FROM stock_kline WHERE period='daily'",
    });
  }

  for (const d of diagnosticSqls) {
    try {
      const r = executeSql(d.sql);
      const val = r.rows[0]?.[0] ?? "0";
      results.push(`  ${d.label}: ${val}`);
    } catch {
      results.push(`  ${d.label}: 查询失败`);
    }
  }

  return results.join("\n");
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是A股智能选股助手，直接将用户的自然语言需求转换为一条可执行的 SQLite SQL。

数据库表（路径已由系统提供）：
- stock_quote q: code, name, price(现价), change(涨跌幅%), change_amt, open, prev_close, high, low, volume, turnover, market_cap(市值，单位元), pe, pb, turnover_rate(换手率%), updated_at
- stock_meta m: code, name, industry_ids（JSON数组字符串，用 LIKE '%id%' 匹配）
- stock_kline: code, period('daily'), trade_date(YYYY-MM-DD), open, high, low, close, volume, change_pct
- stock_fundamental f: code, report_date(YYYY-MM-DD), eps(每股收益元), roe(ROE小数，0.15=15%), revenue(营收元), revenue_yoy(营收同比小数，0.2=20%), net_profit(净利润元), net_profit_yoy(净利润同比小数，0.3=30%), gross_margin(净利润率小数), debt_ratio(资产负债率小数)
  注意：roe/revenue_yoy/net_profit_yoy/gross_margin/debt_ratio 全部是小数，用户说"ROE>15%"应写 f.roe > 0.15；"净利润增长20%"应写 f.net_profit_yoy > 0.2
  stock_fundamental 每只股票只有一条记录（PRIMARY KEY code），直接 JOIN 无需子查询取最新报告期

均线/价格位置：用 stock_kline 窗口函数 CTE 计算，示例：
WITH kline_ma AS (
  SELECT code,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4  PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9  PRECEDING AND CURRENT ROW) AS ma10,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period='daily'
)
SELECT q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change,
  ROUND(t.ma10,2) AS ma10, ROUND(t.ma20,2) AS ma20
FROM stock_quote q
JOIN kline_ma t ON t.code=q.code AND t.rn=1   -- rn=1 最新, rn=2 昨日
WHERE ...

产业链 ID（industry_ids 中的英文标签，LIKE '%id%' 匹配）：
aigpu / pcb / mlcc / memory / optics / fiber / liquidcool / aipower / coppercable / idc / glasssub / aiserver / semieq
"在我的产业列表里" = 匹配以上所有 ID（用 OR 连接）

规则：
- SELECT 必含：q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change
- market_cap 单位元：500亿=50000000000；市值转亿：ROUND(market_cap/100000000,2) AS cap_yi
- 展示 roe/gross_margin/revenue_yoy/net_profit_yoy 时乘以100转为百分比：ROUND(f.roe*100,2) AS roe
- 不加 LIMIT，除非用户明说"前N名/top N"
- 无法实现时只返回：UNSUPPORTED
- 只输出 SQL，不加任何解释和代码块标记`;

const COL_NAME_MAP: Record<string, string> = {
  code: "代码",
  name: "名称",
  price: "现价",
  change: "涨跌幅(%)",
  change_pct: "涨跌幅(%)",
  change_amt: "涨跌额",
  vol_w: "成交量(万)",
  cap_yi: "市值(亿)",
  market_cap: "市值(元)",
  pe: "PE",
  pb: "PB",
  roe: "ROE(%)",
  revenue: "营收",
  eps: "EPS",
  gross_margin: "毛利率(%)",
  turnover_rate: "换手率(%)",
  high: "最高",
  low: "最低",
  open: "开盘",
  prev_close: "昨收",
  trade_date: "日期",
  close: "收盘",
  volume: "成交量",
  net_profit: "净利润",
  debt_ratio: "负债率(%)",
  revenue_yoy: "营收同比(%)",
  net_profit_yoy: "净利润同比(%)",
  ma5: "MA5",
  ma10: "MA10",
  ma20: "MA20",
  ma60: "MA60",
  dist_ma10_pct: "偏离MA10(%)",
  dist_ma20_pct: "偏离MA20(%)",
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { query: string };
  const { query } = body;

  if (!query?.trim()) {
    return NextResponse.json({ error: "查询条件不能为空" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // ── 阶段1：LLM 直接生成 SQL ──────────────────────────────────────────
        sendEvent({ type: "status", message: "正在生成查询..." });

        const rawSql = await callLLM([
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query },
        ]);

        let sql = rawSql
          .trim()
          .replace(/^```sql\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```$/, "")
          .trim();

        if (sql.toUpperCase().startsWith("UNSUPPORTED")) {
          sendEvent({
            type: "error",
            message: "该查询超出数据库范围，请尝试其他条件。",
          });
          controller.close();
          return;
        }

        sendEvent({ type: "sql", sql });
        sendEvent({ type: "status", message: "正在查询数据库..." });

        // ── 阶段2：执行 SQL，失败则自动修复一次 ─────────────────────────────
        let queryResult: { columns: string[]; rows: string[][] };
        try {
          queryResult = executeSql(sql);
        } catch (firstErr) {
          sendEvent({ type: "status", message: "SQL 有误，正在修复..." });
          const fixedRaw = await callLLM([
            {
              role: "system",
              content: `你是 SQLite 修复专家，直接返回修复后的完整 SQL，不加任何解释和代码块。\n\n${SYSTEM_PROMPT}`,
            },
            {
              role: "user",
              content: `SQL 执行报错，请修复：\n错误：${String(firstErr)}\n\n原始SQL：\n${sql}`,
            },
          ]);
          sql = fixedRaw
            .trim()
            .replace(/^```sql\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```$/, "")
            .trim();
          sendEvent({ type: "sql", sql });
          try {
            queryResult = executeSql(sql);
          } catch (e) {
            sendEvent({ type: "error", message: `SQL 执行失败：${String(e)}` });
            controller.close();
            return;
          }
        }

        const { columns, rows } = queryResult;

        // ── 阶段3：空结果时自动诊断，让 LLM 重新生成 ────────────────────────
        if (rows.length === 0) {
          sendEvent({ type: "status", message: "结果为空，正在诊断数据..." });

          const diagnosis = diagnoseEmpty(sql);
          sendEvent({
            type: "status",
            message: "数据诊断完毕，尝试重新生成...",
          });

          const retrySql = await callLLM([
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: query },
            { role: "assistant", content: sql },
            {
              role: "user",
              content: `上面的 SQL 执行结果为空。诊断数据如下：\n${diagnosis}\n\n请根据实际数据情况，修正 SQL 或放宽条件后重新生成。只返回 SQL，不加说明。`,
            },
          ]);

          const retriedSql = retrySql
            .trim()
            .replace(/^```sql\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```$/, "")
            .trim();

          sendEvent({ type: "sql", sql: retriedSql });
          sendEvent({ type: "status", message: "重新查询中..." });

          try {
            const retryResult = executeSql(retriedSql);
            if (retryResult.rows.length === 0) {
              sendEvent({ type: "empty" });
              controller.close();
              return;
            }
            queryResult = retryResult;
          } catch {
            // 重试也失败，返回空
            sendEvent({ type: "empty" });
            controller.close();
            return;
          }
        }

        const displayColumns = queryResult.columns.map((c) => ({
          key: c,
          label: COL_NAME_MAP[c] ?? c,
        }));

        sendEvent({
          type: "result",
          columns: displayColumns,
          rows: queryResult.rows,
          total: queryResult.rows.length,
        });

        controller.close();
      } catch (e) {
        sendEvent({ type: "error", message: `查询失败：${String(e)}` });
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
