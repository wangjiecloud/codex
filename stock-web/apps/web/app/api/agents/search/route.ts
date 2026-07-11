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
      max_tokens: 2048,
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

function executeSql(sql: string): { columns: string[]; rows: string[][] } {
  const normalizedSql = sql.replace(/\s+/g, " ").trim();
  const result = execSync(
    `sqlite3 -csv -header ${JSON.stringify(DB_PATH)} ${JSON.stringify(normalizedSql)}`,
    { encoding: "utf-8", timeout: 10000 },
  );
  const lines = result.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return { columns: [], rows: [] };

  const parseCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let inQuote = false;
    let cell = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuote) { inQuote = true; continue; }
      if (ch === '"' && inQuote) {
        if (line[i + 1] === '"') { cell += '"'; i++; } else { inQuote = false; }
        continue;
      }
      if (ch === "," && !inQuote) { cells.push(cell); cell = ""; continue; }
      cell += ch;
    }
    cells.push(cell);
    return cells;
  };

  const columns = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return { columns, rows };
}

const COL_NAME_MAP: Record<string, string> = {
  code: "代码", name: "名称", price: "现价", change: "涨跌幅(%)",
  change_pct: "涨跌幅(%)", change_amt: "涨跌额", vol_w: "成交量(万)",
  cap_yi: "市值(亿)", market_cap: "市值(元)", pe: "PE", pb: "PB",
  roe: "ROE(%)", revenue: "营收", eps: "EPS", gross_margin: "毛利率(%)",
  turnover_rate: "换手率(%)", high: "最高", low: "最低", open: "开盘",
  prev_close: "昨收", trade_date: "日期", close: "收盘", volume: "成交量",
  net_profit: "净利润", debt_ratio: "负债率(%)", revenue_yoy: "营收同比(%)",
  net_profit_yoy: "净利润同比(%)",
  ma5: "5日均线", ma10: "10日均线", ma20: "20日均线", ma60: "60日均线",
  ma5_price: "MA5", ma10_price: "MA10", ma20_price: "MA20",
};

const SCHEMA_SUMMARY = `数据库表结构：
- stock_quote: code(股票代码), name(名称), price(现价), change(涨跌幅%), change_amt(涨跌额), open(开盘), prev_close(昨收), high(最高), low(最低), volume(成交量), turnover(成交额), market_cap(市值，单位元), pe(PE TTM), pb(PB), turnover_rate(换手率%), updated_at
- stock_meta: code, name, market, industry_ids (JSON数组字符串，存产业链ID)
- stock_kline: code, period('daily'), trade_date(格式YYYY-MM-DD), open, high, low, close, volume, turnover, change_pct, turn_rate
- stock_fundamental: code, report_date, eps, roe, revenue, revenue_yoy, net_profit, net_profit_yoy, gross_margin, debt_ratio

产业链 ID 映射（industry_ids 字段中存的是这些英文 ID，用 LIKE '%id%' 匹配）：
- aigpu → AI算力芯片（GPU/NPU/芯片）
- pcb → PCB（印制电路板）
- mlcc → MLCC（积层陶瓷电容器）
- memory → 存储芯片（HBM/DRAM/NAND/存储）
- optics → 光模块与CPO（光模块/CPO/光互联）
- fiber → 光纤光缆
- liquidcool → 液冷散热
- aipower → AI供配电（PSU/BBU/HVDC）
- coppercable → 高速铜连接（DAC/AEC/铜缆）
- idc → 智算中心/IDC
- glasssub → 玻璃基板（半导体封装）
- aiserver → AI服务器整机（ODM/整机）
- semieq → 半导体设备（光刻/刻蚀/CVD/CMP）

行业查询示例：查光模块板块 → industry_ids LIKE '%optics%'
多个行业取并集：(industry_ids LIKE '%optics%' OR industry_ids LIKE '%memory%')

MA（均线）计算方式（必须用嵌套子查询）：
- 5日均线: (SELECT AVG(close) FROM (SELECT close FROM stock_kline WHERE code=q.code AND period='daily' ORDER BY trade_date DESC LIMIT 5))
- 10日均线: (SELECT AVG(close) FROM (SELECT close FROM stock_kline WHERE code=q.code AND period='daily' ORDER BY trade_date DESC LIMIT 10))
- 20日均线: (SELECT AVG(close) FROM (SELECT close FROM stock_kline WHERE code=q.code AND period='daily' ORDER BY trade_date DESC LIMIT 20))
- "价格在五日线以上" 即 q.price > (SELECT AVG(close) FROM (SELECT close FROM stock_kline WHERE code=q.code AND period='daily' ORDER BY trade_date DESC LIMIT 5))

A股涨跌停规则：
- 沪深主板（code LIKE '60%' OR code LIKE '00%'）：涨跌停 ±10%，跌停 change <= -9.9
- 创业板/科创板（code LIKE '300%' OR code LIKE '301%' OR code LIKE '688%'）：±20%，跌停 change <= -19.9
- 北交所（code LIKE '8%' OR code LIKE '4%'）：±30%，跌停 change <= -29.9`;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { query: string };
  const { query } = body;

  if (!query?.trim()) {
    return NextResponse.json({ error: "查询条件不能为空" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 发送一个 SSE 事件
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        // 阶段1：LLM 将自然语言 → SQL
        sendEvent({ type: "status", message: "正在理解查询条件..." });

        const sqlResponse = await callLLM([
          {
            role: "system",
            content: `你是A股数据库查询助手。用户用自然语言提出选股需求，你只需返回一条 SQLite SQL 查询语句，不要任何解释，不要 markdown 代码块，只输出纯 SQL。

${SCHEMA_SUMMARY}

要求：
1. 只返回 SQL 语句本身，不加任何说明
2. 必须是合法的 SQLite 语法
3. 不要加 LIMIT（由系统控制），除非用户明确要求 top N
4. 所有浮点数字段用 ROUND(字段, 2) 保留2位小数
5. 市值转亿：ROUND(market_cap/100000000, 2) AS cap_yi；成交量转万：ROUND(volume/10000, 2) AS vol_w
6. 【关键】SELECT 必须包含两部分：
   - 固定基础列：q.code, q.name, ROUND(q.price,2) AS price, ROUND(q.change,2) AS change
   - 条件相关列：用户查询中涉及的每个条件指标都必须出现在 SELECT 中，让用户能看到具体数值。
     例如：用户问"价格在五日线以上" → 必须同时输出 ROUND((SELECT AVG(close) FROM (SELECT close FROM stock_kline WHERE code=q.code AND period='daily' ORDER BY trade_date DESC LIMIT 5)),2) AS ma5
     例如：用户问"换手率大于5%" → 必须同时输出 ROUND(q.turnover_rate,2) AS turnover_rate
     例如：用户问"PE低于20" → 必须同时输出 ROUND(q.pe,2) AS pe
     例如：用户问"市值超过500亿" → 必须同时输出 ROUND(q.market_cap/100000000,2) AS cap_yi
7. 行业筛选必须使用 stock_meta 表并按产业链ID用 LIKE '%id%' 匹配，JOIN stock_quote q ON m.code=q.code
8. 如果用户问法无法用数据库查询回答，只返回：UNSUPPORTED`,
          },
          { role: "user", content: query },
        ]);

        const sql = sqlResponse
          .trim()
          .replace(/^```sql\s*/i, "")
          .replace(/```$/, "")
          .trim();

        if (sql.toUpperCase().startsWith("UNSUPPORTED")) {
          sendEvent({
            type: "error",
            message: "该查询超出数据库范围（需要实时新闻或外部数据），请尝试其他选股条件。",
          });
          controller.close();
          return;
        }

        sendEvent({ type: "sql", sql });
        sendEvent({ type: "status", message: "正在查询数据库..." });

        // 阶段2：后端直接执行 SQL
        let queryResult: { columns: string[]; rows: string[][] };
        try {
          queryResult = executeSql(sql);
        } catch (e) {
          sendEvent({ type: "error", message: `SQL 执行失败：${String(e)}` });
          controller.close();
          return;
        }

        const { columns, rows } = queryResult;

        if (rows.length === 0) {
          sendEvent({ type: "empty" });
          controller.close();
          return;
        }

        // 返回结构化数据，前端负责分页渲染
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
      Connection: "keep-alive",
    },
  });
}
