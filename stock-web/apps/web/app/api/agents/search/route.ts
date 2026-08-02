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

function sanitizeSql(rawSql: string): string {
  return rawSql
    .trim()
    .replace(/^```sql\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .replace(/;+\s*$/, "")
    .trim();
}

function ensureIndustryBoardColumn(sql: string): string {
  if (/\b(industry_board|sw_board|board_name)\b/i.test(sql)) {
    return sql;
  }

  return `
SELECT
  ai_result.*, 
  COALESCE(sw_board_map.industry_board, '未分类') AS industry_board
FROM (
${sql}
) AS ai_result
LEFT JOIN (
  SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
  FROM sw_industry_constituent c
  JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
  GROUP BY c.stock_code
) AS sw_board_map ON sw_board_map.stock_code = ai_result.code`;
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
- stock_quote q: code, name, price(现价), change(涨跌幅，百分比数值), change_amt(涨跌额), open(今日开盘), prev_close(昨收), high(今日最高), low(今日最低), volume(今日成交量，单位：股), turnover(今日成交额，单位：元), market_cap(总市值，单位：元), pe(市盈率), pb(市净率), turnover_rate(换手率，百分比数值), updated_at
- stock_meta m: code, name, industry_ids（JSON数组字符串，用 LIKE '%id%' 匹配）
- stock_kline: code, period('daily'), trade_date(YYYY-MM-DD), open(开盘价), high(最高价), low(最低价), close(收盘价), volume(成交量，单位：股), turnover(成交额，单位：元), change_pct(当日涨跌幅，单位：百分比数值，如10.05表示涨10.05%；A股主板涨停≈+10%，跌停≈-10%；创业板/科创板涨跌停≈±20%；close>open为阳线，close<open为阴线)
  涨停判定规则（区分板块）：
    主板（代码以60/00开头）：change_pct >= 9.9
    创业板（代码以30开头）或科创板（代码以68开头）：change_pct >= 19.9
    正确写法：(change_pct >= 9.9 AND code NOT LIKE '30%' AND code NOT LIKE '68%') OR (change_pct >= 19.9 AND (code LIKE '30%' OR code LIKE '68%'))
    跌停同理：主板 change_pct <= -9.9，创业板/科创板 change_pct <= -19.9
- stock_fundamental f: code, report_date(YYYY-MM-DD), eps(每股收益元), roe(ROE小数，0.15=15%), revenue(营收元), revenue_yoy(营收同比小数，0.2=20%), net_profit(净利润元), net_profit_yoy(净利润同比小数，0.3=30%), gross_margin(净利润率小数), debt_ratio(资产负债率小数)
  注意：roe/revenue_yoy/net_profit_yoy/gross_margin/debt_ratio 全部是小数，用户说"ROE>15%"应写 f.roe > 0.15；"净利润增长20%"应写 f.net_profit_yoy > 0.2
  stock_fundamental 每只股票只有一条记录（PRIMARY KEY code），直接 JOIN 无需子查询取最新报告期
- sw_industry_constituent c: board_code(申万板块代码), stock_code(股票代码), stock_name(股票名称)
  一只股票可能属于多个申万板块，JOIN 时需用 GROUP_CONCAT 或子查询聚合；获取板块名称需再 JOIN sw_industry
- sw_industry si: code(板块代码), name(板块名称), level(级别，'二级'/'三级'), change_pct(今日板块涨跌幅，百分比数值)
  用法示例（获取股票所属申万二级板块名称，列名统一用 industry_board）：
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c JOIN sw_industry si ON si.code=c.board_code AND si.level='二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code=q.code

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

成交量/成交额（均需加进 kline_ma CTE）：
  AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4  PRECEDING AND CURRENT ROW) AS vol_avg_5d   -- 5日均量（股）
  AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_avg_20d  -- 20日均量（股）
  AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg_20d -- 20日均额（元）
  过滤「日均成交额低于5000万」：amt_avg_20d < 50000000

近3个月相对低位（距最低点涨幅不超过X%）：
  MIN(low) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 62 PRECEDING AND CURRENT ROW) AS low_3m
  含义：取近62个交易日（约3个自然月）所有K线的最低价（low字段），当前收盘价距该最低价的涨幅不超过X%
  过滤示例（距低点不超过20%）：close <= low_3m * 1.20

近N日连续收阳（close > open）：
  MIN(CASE WHEN close > open THEN 1 ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS consec_up_5d
  过滤：consec_up_5d = 1

重心稳步上移（最新5日close均值 > 上一个5日close均值）：
  AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS ma5_now
  AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 5 PRECEDING) AS ma5_prev
  过滤：ma5_now > ma5_prev

近N年涨停次数统计（单独建 CTE，区分板块）：
WITH limit_up_cnt AS (
  SELECT code, COUNT(*) AS limit_up_count
  FROM stock_kline
  WHERE period = 'daily'
    AND trade_date >= date('now', '-3 years')
    AND (
      (change_pct >= 9.9  AND code NOT LIKE '30%' AND code NOT LIKE '68%')
      OR (change_pct >= 19.9 AND (code LIKE '30%' OR code LIKE '68%'))
    )
  GROUP BY code
)
-- 阈值参考（主板近3年约750交易日）：
--   "偶有涨停"  = limit_up_count >= 3
--   "多次涨停"  = limit_up_count >= 10  ← 默认使用此阈值，约268只
--   "频繁涨停"  = limit_up_count >= 15  ← 约90只，真正高频强势股
-- 用户未指定次数时默认用 >= 10；用户明确说"N次以上"则按用户给的数字

成交量温和放大（近5日均量 > 近20日均量，表示量能趋势性放大）：
  过滤：vol_avg_5d > vol_avg_20d
当日成交量放大（当日成交量 > 近5日均量，表示单日异动）：
  在 CTE 中额外取最新一日 volume：通过 rn=1 行的 volume 字段直接使用
  过滤：volume > vol_avg_5d

涨跌幅方向规则（重要，严禁混淆）：
  "涨幅N%以上"    = change_pct >= N    （正数，如涨幅5%以上：change_pct >= 5）
  "跌幅N%以上"    = change_pct <= -N   （必须是负数！如跌幅5%以上：change_pct <= -5）
  严禁用 ABS(change_pct) >= N 来表示跌幅，ABS 会把涨幅也包含进去导致结果错误
  "近N日内有过跌幅X%以上" 的写法示例：
    EXISTS (
      SELECT 1 FROM stock_kline k2
      WHERE k2.code = q.code AND k2.period = 'daily'
        AND k2.trade_date >= date('now', '-14 days')
        AND k2.change_pct <= -5
    )

排除ST股：q.name NOT LIKE '%ST%'

产业链 ID（industry_ids 中的英文标签，LIKE '%id%' 匹配）：
aigpu / pcb / mlcc / memory / optics / fiber / liquidcool / aipower / coppercable / idc / glasssub / aiserver / semieq
"在我的产业列表里" = 匹配以上所有 ID（用 OR 连接）

规则：
- SELECT 必含：q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change
- 所有查询结果都必须包含行业板块列，列名统一为 industry_board；无板块时返回 '未分类'
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
  vol_avg_5d: "5日均量(股)",
  vol_avg_20d: "20日均量(股)",
  amt_avg_20d: "20日均额(元)",
  low_3m: "近3月最低",
  rise_from_3m_low_pct: "距低点涨幅(%)",
  consec_up_5d: "连续5日阳线",
  ma5_now: "MA5",
  ma5_prev: "前5日MA5",
  sw_board: "申万板块",
  industry_board: "申万板块",
  board_name: "申万板块",
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

        let sql = ensureIndustryBoardColumn(sanitizeSql(rawSql));

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
          sql = ensureIndustryBoardColumn(sanitizeSql(fixedRaw));
          sendEvent({ type: "sql", sql });
          try {
            queryResult = executeSql(sql);
          } catch (e) {
            sendEvent({ type: "error", message: `SQL 执行失败：${String(e)}` });
            controller.close();
            return;
          }
        }

        const { rows } = queryResult;

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

          const retriedSql = ensureIndustryBoardColumn(sanitizeSql(retrySql));

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
