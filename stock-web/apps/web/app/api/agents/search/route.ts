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
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      max_tokens: 8192,
    }),
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

/**
 * 移除 SQL 末尾多余的 LIMIT N（LLM 可能擅自加上），
 * 保留用户明确要求的 top N（含 ORDER BY + LIMIT 组合）不动。
 * 规则：只移除末尾孤立的 LIMIT N（前面没有 ORDER BY 的 LIMIT）。
 */
function stripUnintendedLimit(sql: string): string {
  // 移除末尾的 "LIMIT <数字>" 或 "LIMIT <数字> OFFSET <数字>"（大小写不敏感）
  // 但如果整个 SQL 已经带了 ORDER BY，说明用户可能真的要排序+分页，保留
  const hasOrderBy = /\bORDER\s+BY\b/i.test(sql);
  if (hasOrderBy) return sql; // 有 ORDER BY 时保留 LIMIT（用户明确要 top N）
  return sql.replace(/\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*;?\s*$/i, "").trim();
}

function checkSqlIntegrity(sql: string): void {
  // 检查括号是否平衡
  let depth = 0;
  let inString = false;
  let strChar = "";
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      if (ch === strChar && sql[i - 1] !== "\\") inString = false;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = true;
      strChar = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) throw new Error(`SQL 括号不匹配（多余右括号，位置 ${i}）`);
  }
  if (depth !== 0)
    throw new Error(`SQL 括号不匹配（缺少 ${depth} 个右括号），SQL 可能被截断`);
  // 检查 SQL 是否以有效内容结尾（去掉末尾空白后，末字符不能是逗号或运算符）
  const trimmed = sql.trim();
  if (/[,+\-*/=<>(]$/.test(trimmed))
    throw new Error(`SQL 末尾字符异常（"${trimmed.slice(-1)}"），可能被截断`);
}

function executeSql(sql: string): { columns: string[]; rows: string[][] } {
  // 执行前先做完整性校验
  checkSqlIntegrity(sql);

  // 写入临时文件再执行，避免 shell 参数长度/转义问题
  const tmpFile = path.join(os.tmpdir(), `stock_query_${Date.now()}.sql`);
  try {
    fs.writeFileSync(tmpFile, sql, "utf-8");
    let result: string;
    try {
      result = execSync(
        `sqlite3 -csv -header ${JSON.stringify(DB_PATH)} < ${JSON.stringify(tmpFile)}`,
        { encoding: "utf-8", timeout: 15000 },
      );
    } catch (execErr) {
      // 把 SQL 内容附到错误信息里，方便调试
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
          } else {
            inQuote = false;
          }
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

// ─── 预置复杂 SQL 模板 ────────────────────────────────────────────────────────

/**
 * 构建 KDJ 金叉查询 SQL。
 * 使用 stock_indicator 表中预计算的标准 KDJ（EMA，初始50）。
 */
function buildKdjSql(
  extraWhere = "",
  extraSelectOuter = "",
  extraJoin = "",
  options: {
    requireBullishAlignment?: boolean;
    requireBearishAlignment?: boolean;
    requireAboveMa5?: boolean;
    requireAboveMa10?: boolean;
    requireAboveMa20?: boolean;
    requireAboveMa60?: boolean;
    orderBy?: string;
    topN?: number;
  } = {},
): string {
  const {
    requireBullishAlignment = false,
    requireBearishAlignment = false,
    requireAboveMa5 = false,
    requireAboveMa10 = false,
    requireAboveMa20 = false,
    requireAboveMa60 = false,
    orderBy = "",
    topN = 0,
  } = options;

  const needMa =
    requireBullishAlignment ||
    requireBearishAlignment ||
    requireAboveMa5 ||
    requireAboveMa10 ||
    requireAboveMa20 ||
    requireAboveMa60;

  const maSelect = needMa
    ? `, ROUND(t.ma5,2) AS ma5, ROUND(t.ma10,2) AS ma10, ROUND(t.ma20,2) AS ma20, ROUND(t.ma60,2) AS ma60`
    : "";

  let maWhere = "";
  if (requireAboveMa5) maWhere += " AND q.price > t.ma5";
  if (requireAboveMa10) maWhere += " AND q.price > t.ma10";
  if (requireAboveMa20) maWhere += " AND q.price > t.ma20";
  if (requireAboveMa60) maWhere += " AND q.price > t.ma60";
  if (requireBullishAlignment)
    maWhere += " AND t.ma5>t.ma10 AND t.ma10>t.ma20 AND t.ma20>t.ma60";
  if (requireBearishAlignment)
    maWhere += " AND t.ma5<t.ma10 AND t.ma10<t.ma20 AND t.ma20<t.ma60";

  const orderClause = orderBy ? `\nORDER BY ${orderBy}` : "";
  const limitClause = topN > 0 ? `\nLIMIT ${topN}` : "";

  return `SELECT q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change,
  ROUND(t.kdj_k,2) AS k_today, ROUND(t.kdj_d,2) AS d_today
  ${maSelect}${extraSelectOuter}
FROM stock_quote q
JOIN stock_indicator t ON t.code=q.code AND t.period='daily'
  AND t.trade_date=(SELECT MAX(trade_date) FROM stock_indicator WHERE code=q.code AND period='daily')
JOIN stock_indicator y ON y.code=q.code AND y.period='daily'
  AND y.trade_date=(
    SELECT MAX(trade_date) FROM stock_indicator
    WHERE code=q.code AND period='daily' AND trade_date < t.trade_date
  )
${extraJoin}
WHERE q.price IS NOT NULL AND q.price > 0
  AND t.kdj_k > t.kdj_d
  AND y.kdj_k <= y.kdj_d
  ${maWhere}${extraWhere}${orderClause}${limitClause}`;
}

// ─────────────────────────────────────────────────────────────────────────────

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
  ma5: "5日均线",
  ma10: "10日均线",
  ma20: "20日均线",
  ma60: "60日均线",
  ma5_price: "MA5",
  ma10_price: "MA10",
  ma20_price: "MA20",
};

const SCHEMA_SUMMARY = `数据库表结构：
- stock_quote q: code(股票代码), name(名称), price(现价), change(涨跌幅%), change_amt(涨跌额), open(开盘), prev_close(昨收), high(最高), low(最低), volume(成交量), turnover(成交额), market_cap(市值，单位元), pe(PE TTM), pb(PB), turnover_rate(换手率%), updated_at
- stock_meta m: code, name, market, industry_ids (JSON数组字符串，存产业链ID)
- stock_kline: code, period('daily'), trade_date(格式YYYY-MM-DD), open, high, low, close, volume, turnover, change_pct, turn_rate
- stock_fundamental f: code, report_date, eps, roe, revenue, revenue_yoy, net_profit, net_profit_yoy, gross_margin, debt_ratio
- stock_indicator t: code, trade_date, period('daily'), kdj_k, kdj_d, kdj_j(标准KDJ，EMA算法), ma5, ma10, ma20, ma60(均线)

stock_indicator 用法：
  JOIN stock_indicator t ON t.code=q.code AND t.period='daily'
    AND t.trade_date=(SELECT MAX(trade_date) FROM stock_indicator WHERE code=q.code AND period='daily')
  -- 取昨日需再 JOIN 一次别名 y，且 y.trade_date < t.trade_date

产业链 ID 映射（industry_ids 字段中存的是这些英文 ID，用 LIKE '%id%' 匹配）：
aigpu/pcb/mlcc/memory/optics/fiber/liquidcool/aipower/coppercable/idc/glasssub/aiserver/semieq

A股涨跌停规则：
- 沪深主板（code LIKE '60%' OR code LIKE '00%'）：±10%
- 创业板/科创板（code LIKE '300%' OR code LIKE '301%' OR code LIKE '688%'）：±20%
- 北交所（code LIKE '8%' OR code LIKE '4%'）：±30%`;

/** 意图识别系统 prompt */
const INTENT_SYSTEM_PROMPT = `你是A股选股意图识别助手。分析用户选股需求，返回JSON（不要任何其他文字，不要markdown代码块）：
{
  "useKdj": true/false,              // 是否包含KDJ金叉/死叉条件
  "bullishAlignment": true/false,    // 是否要求均线多头排列（MA5>MA10>MA20>MA60）
  "bearishAlignment": true/false,    // 是否要求均线空头排列（MA5<MA10<MA20<MA60）
  "aboveMa5": true/false,            // 价格在5日线以上
  "aboveMa10": true/false,           // 价格在10日线以上
  "aboveMa20": true/false,           // 价格在20日线以上
  "aboveMa60": true/false,           // 价格在60日线以上
  "industryFilter": "",              // 产业链过滤SQL片段，如"m.industry_ids LIKE '%optics%'"，多个用OR连接，无则""
  "needIndustryJoin": true/false,    // 需要 JOIN stock_meta 时为true
  "extraWhere": "",                  // 其他简单字段条件（已含AND前缀）。注意：market_cap单位是元，500亿=50000000000
  "extraSelect": "",                 // 额外SELECT列（已含逗号前缀），引用q.xxx或t.xxx
  "orderBy": "",                     // ORDER BY子句（不含ORDER BY关键字），如"q.change DESC"，无则""
  "topN": 0,                         // 用户要求前N名时填N，否则填0
  "unsupported": false               // 无法用现有数据库字段实现时为true
}

识别规则：
- KDJ金叉/金叉信号 → useKdj:true
- 多头排列/均线多头/MA多头 → bullishAlignment:true
- 5日线上方/五日线以上/价格高于MA5 → aboveMa5:true（同理ma10/ma20/ma60）
- 价格在均线上方（未指定哪条）→ 默认 aboveMa5:true
- extraWhere 只放对 stock_quote(q) 或 stock_indicator(t) 简单字段的比较条件
  示例：pe<30 → "AND q.pe<30"；换手率>3% → "AND q.turnover_rate>3"；市值>500亿 → "AND q.market_cap>50000000000"
  示例：涨幅>5% → "AND q.change>5"；价格<10元 → "AND q.price<10"
- extraSelect 示例：需要显示PE → ", ROUND(q.pe,2) AS pe"；显示换手率 → ", ROUND(q.turnover_rate,2) AS turnover_rate"
- 涨幅前N/市值前N/换手率前N等排序需求 → 填写orderBy和topN
- 涉及行业/产业链关键词 → needIndustryJoin:true，industryFilter填对应LIKE条件
- 无法实现的（需实时新闻、情绪、预测等）→ unsupported:true`;

/** 简单查询的 SQL 生成 prompt（不含 KDJ） */
const SIMPLE_SQL_SYSTEM_PROMPT = `你是A股数据库查询助手。用户用自然语言提出选股需求，只返回一条 SQLite SQL，不要任何解释，不要 markdown 代码块。

${SCHEMA_SUMMARY}

查询规范：
1. 主表固定为 stock_quote q（FROM stock_quote q）
2. SELECT 固定包含：q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change，再加条件相关列
3. 均线/KDJ 优先用 stock_indicator t：
   JOIN stock_indicator t ON t.code=q.code AND t.period='daily'
     AND t.trade_date=(SELECT MAX(trade_date) FROM stock_indicator WHERE code=q.code AND period='daily')
   然后直接用 t.ma5 / t.ma10 / t.ma20 / t.ma60 / t.kdj_k / t.kdj_d（无需子查询计算）
4. market_cap 单位是元：500亿 = 50000000000；成交量转万：ROUND(volume/10000,2) AS vol_w；市值转亿：ROUND(market_cap/100000000,2) AS cap_yi
5. 行业筛选：JOIN stock_meta m ON m.code=q.code，用 m.industry_ids LIKE '%id%'
6. 不要在末尾加 LIMIT，除非用户明确说"前N名"或"top N"（此时加 ORDER BY ... LIMIT N）
7. 如果无法用数据库实现，只返回：UNSUPPORTED`;

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
        // ── 阶段1：意图识别 ──────────────────────────────────────────────────
        sendEvent({ type: "status", message: "正在理解查询条件..." });

        const intentRaw = await callLLM([
          { role: "system", content: INTENT_SYSTEM_PROMPT },
          { role: "user", content: query },
        ]);

        let intent: {
          useKdj?: boolean;
          bullishAlignment?: boolean;
          bearishAlignment?: boolean;
          aboveMa5?: boolean;
          aboveMa10?: boolean;
          aboveMa20?: boolean;
          aboveMa60?: boolean;
          industryFilter?: string;
          needIndustryJoin?: boolean;
          extraWhere?: string;
          extraSelect?: string;
          orderBy?: string;
          topN?: number;
          unsupported?: boolean;
        } = {};
        try {
          const jsonStr = intentRaw
            .trim()
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```$/, "")
            .trim();
          intent = JSON.parse(jsonStr) as typeof intent;
        } catch {
          // 意图识别失败，回退到普通 SQL 生成
        }

        if (intent.unsupported) {
          sendEvent({
            type: "error",
            message:
              "该查询超出数据库范围（需要实时新闻或外部数据），请尝试其他选股条件。",
          });
          controller.close();
          return;
        }

        // ── 阶段2：按意图组装 SQL ────────────────────────────────────────────
        let sql: string;

        if (intent.useKdj) {
          // KDJ 金叉走预置模板，彻底绕开 LLM 生成复杂子查询
          const joinClause = intent.needIndustryJoin
            ? "JOIN stock_meta m ON m.code=q.code"
            : "";
          const industryWhere = intent.industryFilter
            ? ` AND ${intent.industryFilter}`
            : "";
          const extraSelect = intent.extraSelect ?? "";
          sql = buildKdjSql(
            (intent.extraWhere ?? "") + industryWhere,
            extraSelect,
            joinClause,
            {
              requireBullishAlignment: !!intent.bullishAlignment,
              requireBearishAlignment: !!intent.bearishAlignment,
              requireAboveMa5: !!intent.aboveMa5,
              requireAboveMa10: !!intent.aboveMa10,
              requireAboveMa20: !!intent.aboveMa20,
              requireAboveMa60: !!intent.aboveMa60,
              orderBy: intent.orderBy ?? "",
              topN: intent.topN ?? 0,
            },
          );
        } else {
          // 简单查询让 LLM 生成（不含 KDJ，token 消耗可控）
          const sqlResponse = await callLLM([
            { role: "system", content: SIMPLE_SQL_SYSTEM_PROMPT },
            { role: "user", content: query },
          ]);
          sql = sqlResponse
            .trim()
            .replace(/^```sql\s*/i, "")
            .replace(/```$/, "")
            .trim();

          if (sql.toUpperCase().startsWith("UNSUPPORTED")) {
            sendEvent({
              type: "error",
              message:
                "该查询超出数据库范围（需要实时新闻或外部数据），请尝试其他选股条件。",
            });
            controller.close();
            return;
          }
        }

        sendEvent({ type: "sql", sql });
        sendEvent({ type: "status", message: "正在查询数据库..." });

        // ── 阶段3：执行 SQL，失败则让 LLM 修复后重试一次 ─────────────────────
        let queryResult: { columns: string[]; rows: string[][] };
        try {
          queryResult = executeSql(stripUnintendedLimit(sql));
        } catch (firstErr) {
          sendEvent({ type: "status", message: "SQL 有误，正在自动修复..." });
          try {
            const fixedResponse = await callLLM([
              {
                role: "system",
                content: `你是SQLite SQL修复专家。下面的SQL执行出错，请直接返回修复后的完整SQL，不要任何解释，不要markdown代码块。确保括号完整配对，语句以分号结尾。\n\n${SCHEMA_SUMMARY}`,
              },
              {
                role: "user",
                content: `原始SQL（可能不完整，请补全并修复）:\n\`\`\`sql\n${sql}\n\`\`\`\n\n错误信息:\n${String(firstErr)}\n\n请返回修复后的完整可执行SQL：`,
              },
            ]);
            const fixedSql = fixedResponse
              .trim()
              .replace(/^```sql\s*/i, "")
              .replace(/```$/, "")
              .trim();
            sendEvent({ type: "sql", sql: fixedSql });
            queryResult = executeSql(stripUnintendedLimit(fixedSql));
          } catch (e) {
            sendEvent({ type: "error", message: `SQL 执行失败：${String(e)}` });
            controller.close();
            return;
          }
        }

        const { columns, rows } = queryResult;

        if (rows.length === 0) {
          sendEvent({ type: "empty" });
          controller.close();
          return;
        }

        const displayColumns = columns.map((c) => ({
          key: c,
          label: COL_NAME_MAP[c] ?? c,
        }));

        sendEvent({
          type: "result",
          columns: displayColumns,
          rows,
          total: rows.length,
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
