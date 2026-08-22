import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Database from "better-sqlite3";

const DB_PATH =
  process.env.STOCK_DB_PATH ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/stock-web/apps/data-service/stock_data.db",
  );

// ─── 盘面报告上下文 ────────────────────────────────────────────────────────────

export interface ReportContext {
  /** 报告来源的 session 标题 */
  sessionTitle: string;
  /** 报告日期（从报告文本解析，如 "2026-07-31"） */
  reportDate: string;
  /** 报告中识别出的强势板块（申万二级名称） */
  hotBoards: string[];
  /** 报告中的龙头/龙二个股代码 */
  leadingStocks: string[];
  /** 报告 8.7 核心推荐（★★★★以上）个股代码 */
  topPickStocks: string[];
  /** 报告中净流出预警板块 */
  outflowBoards: string[];
  /** 报告原始内容长度（用于判断是否有效） */
  contentLength: number;
}

/**
 * 从数据库读取最新一条 market agent 报告，解析出结构化上下文。
 * 若无报告则返回 null。
 */
function parseMarketReport(): ReportContext | null {
  let db: Database.Database | null = null;
  try {
    db = new Database(DB_PATH, { readonly: true });

    // 找最新的有内容的 market agent 报告（选 agent 回复中最长的那条）
    const row = db
      .prepare(
        `SELECT s.title as session_title, m.content
         FROM agent_session s
         JOIN agent_message m ON m.session_id = s.id
         WHERE s.agent_id = 'market'
           AND m.role = 'agent'
           AND length(m.content) > 500
         ORDER BY m.id DESC
         LIMIT 1`,
      )
      .get() as { session_title: string; content: string } | undefined;

    if (!row) return null;

    const text = row.content;
    const sessionTitle = row.session_title ?? "盘面分析";

    // ── 解析报告日期 ────────────────────────────────────────────────
    const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
    const reportDate = dateMatch?.[1] ?? "";

    // ── 申万二级板块白名单（用于过滤噪音）─────────────────────────
    // 报告中可能出现的申万行业二级板块名称，只有匹配白名单才纳入 hotBoards
    const SW_BOARD_WHITELIST = new Set([
      // 电子/科技
      "软件开发",
      "IT服务",
      "数字媒体",
      "广告营销",
      "计算机设备",
      "通信设备",
      "半导体",
      "消费电子",
      "元件",
      "光学光电子",
      // 互联网
      "互联网电商",
      "互联网",
      // 汽车
      "乘用车",
      "商用车",
      "汽车零部件",
      // 消费
      "白酒",
      "饮料乳品",
      "休闲食品",
      "教育",
      "酒店餐饮",
      "餐饮",
      "医疗器械",
      "化学制药",
      "医药商业",
      "生物制品",
      // 金融
      "银行",
      "证券",
      "保险",
      "多元金融",
      // 材料/工业
      "贵金属",
      "工业金属",
      "小金属",
      "化学原料",
      "化学制品",
      "PCB",
      "印制电路板",
      "电子化学品",
      // 能源/电力
      "储能",
      "光伏设备",
      "风电设备",
      "电力",
      "电网设备",
      // 军工
      "地面兵装",
      "航空装备",
      "军工电子",
      // 建材/地产
      "建材",
      "房地产",
      // 交运
      "航空机场",
      "物流",
      // 有色
      "铜",
      "铝",
      "锂",
      // 其它申万常见二级
      "工程咨询服务",
      "环保",
      "农业",
      "养殖业",
    ]);

    // ── 提取强势板块 ────────────────────────────────────────────────
    const hotBoardSet = new Set<string>();

    // 策略1：从申万行业排名表格提取
    // 支持两种格式：
    //   格式A（旧）：| 软件开发 | +7.6% | ...  （第一列是板块名）
    //   格式B（新）：| 1 | 教育 | +16.6% |      （第一列是排名数字1-10，第二列是板块名）
    //
    // 格式B：限制排名数字为 1-2 位（排除6位股票代码被误匹配）
    const rankTableRows = text.matchAll(
      /\|\s*(\d{1,2})\s*\|\s*([^\|]+?)\s*\|\s*\+[\d.]+%/g,
    );
    for (const m of rankTableRows) {
      // 确认排名数字在合理范围（1-20）
      const rank = parseInt(m[1], 10);
      if (rank < 1 || rank > 20) continue;
      // 格式B：第二捕获组是板块名
      const name = m[2].trim().replace(/\*+/g, "").trim();
      if (name && name.length >= 2 && name.length <= 10) {
        hotBoardSet.add(name);
      }
    }

    // 格式A：第一列是板块名（不以数字开头），第二列含涨幅
    const rankTableRowsA = text.matchAll(
      /\|\s*([^\d\|\n][^\|\n]{1,10}?)\s*\|\s*[^|]*\+[\d.]+%/g,
    );
    for (const m of rankTableRowsA) {
      const name = m[1]
        .trim()
        .replace(/\*+/g, "")
        .replace(/[★⭐✅❌⚡🟢🟡]/g, "")
        .trim();
      // 只接受白名单板块名，避免噪音
      if (name && SW_BOARD_WHITELIST.has(name)) {
        hotBoardSet.add(name);
      }
    }

    // 策略2：从 8.3 节板块分析标题提取
    // 格式A（旧）：### 🟢 板块一：软件开发 × IT服务（AI应用核心）
    // 格式B（新）：#### A. AI软件+应用板块（当日主线）
    const boardSection83 = text.match(
      /###\s*8\.3[\s\S]*?(?=###\s*8\.|##\s*[^#]|$)/,
    );
    if (boardSection83) {
      const s83 = boardSection83[0];
      // 旧格式：### ... 板块X：XXX
      const oldTitleMatches = s83.matchAll(
        /###[^\n]*板块[^：:\n]*[：:]\s*([^\n（【(]+)/g,
      );
      for (const m of oldTitleMatches) {
        const raw = m[1].trim();
        const parts = raw.split(/[×x\/+]/);
        for (const p of parts) {
          const name = p
            .replace(/（[^）]*）/g, "")
            .replace(/[^\u4e00-\u9fa5a-zA-Z0-9Ⅱ]/g, "")
            .trim();
          if (name && SW_BOARD_WHITELIST.has(name)) hotBoardSet.add(name);
        }
      }
      // 新格式：#### A. XXX板块 / #### B. XXX板块
      const newTitleMatches = s83.matchAll(/####\s*[A-Z]\.\s*([^\n（(]+)/g);
      for (const m of newTitleMatches) {
        const raw = m[1]
          .replace(/板块.*/, "")
          .replace(/[（(（].*/, "")
          .trim();
        // 拆分 "AI软件/广告营销" 这种复合名
        const parts = raw.split(/[\/\+×]/);
        for (const p of parts) {
          const name = p.replace(/AI/gi, "").trim();
          if (name && SW_BOARD_WHITELIST.has(name)) hotBoardSet.add(name);
          // 完整匹配（含AI前缀的不在白名单，直接用原始片段）
          const nameFull = p.trim();
          if (nameFull && SW_BOARD_WHITELIST.has(nameFull))
            hotBoardSet.add(nameFull);
        }
      }
    }

    // 策略3：从 8.2 候选池表格第一列提取板块名
    // 格式A：| **软件开发** | ...
    // 格式B：| AI软件/广告营销 | ... （复合名，需拆分后白名单过滤）
    const section82 = text.match(/###\s*8\.2[\s\S]*?(?=###\s*8\.|##\s*[^#]|$)/);
    if (section82) {
      const s82 = section82[0];
      const pool82Rows = s82.matchAll(/^\|\s*\*{0,2}([^|*\n]+?)\*{0,2}\s*\|/gm);
      for (const m of pool82Rows) {
        const raw = m[1].trim();
        const parts = raw.split(/[\/\+×]/);
        for (const p of parts) {
          const name = p
            .replace(/（[^）]*）/g, "")
            .replace(/[^\u4e00-\u9fa5a-zA-Z0-9Ⅱ]/g, "")
            .trim();
          if (name && SW_BOARD_WHITELIST.has(name)) hotBoardSet.add(name);
        }
      }
    }

    const hotBoards = Array.from(hotBoardSet).filter(Boolean);

    // ── 提取龙头/龙二/中军个股代码 ────────────────────────────────
    // 兼容两种代码格式：
    //   格式A（旧）：`603039`  （backtick 包裹）
    //   格式B（新）：（600602）或 (600602)  （括号包裹）
    const leadingSet = new Set<string>();

    // 找含"龙一/龙二/中军"关键词的行，从该行提取6位A股代码
    const leadingKeywordLines = text.matchAll(
      /^[^\n]*(?:【龙[一二]】|龙[一二]|🥇|🥈|🏆|【中军[股]?】|中军股?)[^\n]*/gm,
    );
    for (const m of leadingKeywordLines) {
      const line = m[0];
      // 优先匹配括号格式：（600602） 或 (600602)
      const bracketCodes = line.matchAll(/[（(]([036]\d{5})[）)]/g);
      for (const c of bracketCodes) leadingSet.add(c[1]);
      // 兼容 backtick 格式：`603039`
      const backtickCodes = line.matchAll(/`([036]\d{5})`/g);
      for (const c of backtickCodes) leadingSet.add(c[1]);
    }

    // ── 提取 8.7 核心推荐 ────────────────────────────────────────
    // 支持三种格式：
    //   格式A（旧）：| ★★★★★ | `603039` | ...
    //   格式B（中）：| 600602 | 云赛智联 | AI软件龙一 | ⭐⭐⭐⭐ |
    //   格式C（新）：| 1 | `600988` 赤峰黄金 | 龙一... |  （代码在第二列，带backtick）
    const topPickSet = new Set<string>();

    // 格式A：| ★★★★★ | `603039` | ...
    const topPickA = text.matchAll(/\|\s*[★⭐]{4,5}\s*\|\s*`([036]\d{5})`/g);
    for (const m of topPickA) topPickSet.add(m[1]);

    // 格式B：| 600602 | 云赛智联 | ... | ⭐⭐⭐⭐ |（代码裸放第一列）
    const topPickB = text.matchAll(
      /\|\s*([036]\d{5})\s*\|[^|]*\|[^|]*\|\s*[⭐★]{3,5}\s*\|/g,
    );
    for (const m of topPickB) topPickSet.add(m[1]);

    // 格式C：| 1 | `600988` 赤峰黄金 | ...（排名在第一列，代码在第二列backtick）
    // 也兼容 | 排名 | `code` 名称 | ... 无论后面几列
    const topPickC = text.matchAll(/\|\s*\d{1,2}\s*\|\s*`([036]\d{5})`/g);
    for (const m of topPickC) topPickSet.add(m[1]);

    // 8.8 核心跟踪标的列表：1. **002261 拓维信息** — ...
    const corePickList = text.matchAll(
      /^\d+\.\s*\*{0,2}([036]\d{5})\s+[^\n*]+\*{0,2}/gm,
    );
    for (const m of corePickList) topPickSet.add(m[1]);

    // ── 提取净流出预警板块（8.4 节）───────────────────────────────
    const outflowSet = new Set<string>();
    // 找到 8.4 节内容（到 8.5 节或下一个 ## 节结束）
    const section84Match = text.match(
      /###?\s*8\.4[^\n]*\n([\s\S]*?)(?=###?\s*8\.5|##\s*[^#]|$)/,
    );
    if (section84Match) {
      const s84 = section84Match[1];
      // 表格行支持两种金额格式：
      //   格式A：| 储能 | -282亿 |
      //   格式B：| **存储芯片** | -358 | （金额列无"亿"字，数字在单独列）
      // 统一匹配：第一列是板块名（可含**），第二列是负数（可选含"亿"）
      const outflowRows = s84.matchAll(
        /^\|\s*\*{0,2}([^\d\|\n*][^\|\n]{1,15}?)\*{0,2}\s*\|\s*-[\d,]+/gm,
      );
      for (const m of outflowRows) {
        const name = m[1]
          .trim()
          .replace(/\*+/g, "")
          .replace(/[^\u4e00-\u9fa5a-zA-Z0-9Ⅱ\/]/g, "")
          .trim();
        if (name && name.length >= 2 && name.length <= 15 && name !== "板块") {
          outflowSet.add(name);
        }
      }
    }

    return {
      sessionTitle,
      reportDate,
      hotBoards,
      leadingStocks: Array.from(leadingSet),
      topPickStocks: Array.from(topPickSet),
      outflowBoards: Array.from(outflowSet),
      contentLength: text.length,
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

// ─── 选股策略定义 ──────────────────────────────────────────────────────────────

export interface StrategyDef {
  id: string;
  name: string;
  category: string;
  description: string;
  signals: string[]; // 信号描述（买入逻辑）
  entryNote: string; // 买入点说明
  riskNote: string; // 风险提示
  sql: string; // 评分SQL（静态版，fallback用）
  /** 可选：根据盘面报告上下文动态构建 SQL（优先于 sql 字段） */
  buildSql?: (ctx: ReportContext | null) => string;
}

// 评分SQL约定：
// - 必须含 code, name, total_score（0-100）
// - 含各维度评分：trend_score, volume_score, pattern_score, momentum_score 等
// - 含辅助展示列：price, change, industry_board, entry_point, signals
// - 最终按 total_score DESC 排序

export const STRATEGIES: StrategyDef[] = [
  // ─── 0. 资金异动（自定义置顶策略）────────────────────────────────────────────
  {
    id: "capital_surge",
    name: "资金异动",
    category: "自定义",
    description:
      "低位横盘企稳（价格处于250日区间低位35%以下）、均线斜率不再下行，近期成交量突然放大（5日均量/60日均量 ≥ 1.2x），同时所属申万板块近期资金净流入、累计涨幅为正，板块共振确认资金真实流入。",
    signals: [
      "价格处于250日区间低位（百分位 < 35%）",
      "MA20斜率走平或拐头向上（斜率 > -0.3%）",
      "MA60斜率走平或拐头向上（斜率 > -0.3%）",
      "近5日均量 ≥ 60日均量 1.2倍（成交量异动）",
      "所属板块今日资金净流入为正",
      "所属板块近5日累计涨幅为正（板块趋势确认）",
    ],
    entryNote:
      "板块放量当日或次日低开时介入，止损设近期低点下方3%。优先选板块净流入靠前且成交量倍比最大的个股。",
    riskNote:
      "低位不等于安全，需确认板块资金净流入持续性；量能一旦快速萎缩须立即止损。警惕仅单日放量、次日立即缩量的情况。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, high, low, volume, turnover,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19  PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS ma60,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 24  PRECEDING AND 5 PRECEDING) AS ma20_5d_ago,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 64  PRECEDING AND 5 PRECEDING) AS ma60_5d_ago,
    AVG(volume)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4   PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(volume)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS vol_ma60,
    MAX(high)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS high_250d,
    MIN(low)     OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS low_250d,
    AVG(turnover)OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19  PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
industry_flow AS (
  SELECT name, netflow, change_pct AS board_change
  FROM fund_flow_snapshot
  WHERE period = 'today' AND board_type = 'industry'
    AND trade_date = (SELECT MAX(trade_date) FROM fund_flow_snapshot WHERE period = 'today')
),
industry_recent AS (
  SELECT name AS board_name, SUM(change_pct) AS cum5_pct
  FROM sw_industry_daily
  WHERE trade_date >= (SELECT date(MAX(trade_date), '-9 days') FROM sw_industry_daily)
  GROUP BY name
),
stock_board AS (
  SELECT sic.stock_code, si.name AS board_name
  FROM sw_industry_constituent sic
  JOIN sw_industry si ON si.code = sic.board_code AND si.level = '二级'
),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    ROUND(l.amt_avg20 / 1e8, 2) AS amt_avg20_yi,
    COALESCE(sb.board_name, '未分类') AS industry_board,
    ROUND(CASE WHEN (l.high_250d - l.low_250d) > 0
      THEN (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100
      ELSE 50 END, 1) AS price_pct,
    ROUND(CASE WHEN l.ma20_5d_ago > 0
      THEN (l.ma20 - l.ma20_5d_ago) / l.ma20_5d_ago * 100 ELSE 0 END, 2) AS ma20_slope,
    ROUND(CASE WHEN l.ma60_5d_ago > 0
      THEN (l.ma60 - l.ma60_5d_ago) / l.ma60_5d_ago * 100 ELSE 0 END, 2) AS ma60_slope,
    ROUND(CASE WHEN l.vol_ma60 > 0 THEN l.vol_ma5 / l.vol_ma60 ELSE 0 END, 2) AS vol_surge_ratio,
    ROUND(COALESCE(irf.netflow, 0), 2) AS board_netflow,
    ROUND(COALESCE(irr.cum5_pct, 0), 2) AS board_cum5_pct,
    -- 低位横盘评分（0-30）
    CASE WHEN (l.high_250d - l.low_250d) > 0
         AND (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100 < 20 THEN 30
         WHEN (l.high_250d - l.low_250d) > 0
         AND (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100 < 35 THEN 20
         ELSE 0 END AS low_score,
    -- 企稳信号评分（0-25）：MA20+MA60 斜率不再下行
    CASE WHEN l.ma20_5d_ago > 0
         AND (l.ma20 - l.ma20_5d_ago) / l.ma20_5d_ago * 100 > -0.3
         AND (l.ma20 - l.ma20_5d_ago) / l.ma20_5d_ago * 100 < 2 THEN 15
         ELSE 0 END +
    CASE WHEN l.ma60_5d_ago > 0
         AND (l.ma60 - l.ma60_5d_ago) / l.ma60_5d_ago * 100 > -0.3 THEN 10
         ELSE 0 END AS stable_score,
    -- 成交量异动评分（0-25）：近5日均量 vs 60日均量
    CASE WHEN l.vol_ma60 > 0 AND l.vol_ma5 / l.vol_ma60 >= 2.0 THEN 25
         WHEN l.vol_ma60 > 0 AND l.vol_ma5 / l.vol_ma60 >= 1.5 THEN 18
         WHEN l.vol_ma60 > 0 AND l.vol_ma5 / l.vol_ma60 >= 1.2 THEN 10
         ELSE 0 END AS volume_score,
    -- 板块共振评分（0-20）：资金净流入 + 近5日累计涨幅
    CASE WHEN COALESCE(irf.netflow, 0) > 20 AND COALESCE(irr.cum5_pct, 0) > 2 THEN 20
         WHEN COALESCE(irf.netflow, 0) > 5  AND COALESCE(irr.cum5_pct, 0) > 0 THEN 12
         WHEN COALESCE(irf.netflow, 0) > 0  THEN 6
         ELSE 0 END AS sector_score
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN stock_board sb ON sb.stock_code = l.code
  LEFT JOIN industry_flow irf ON irf.name = sb.board_name
  LEFT JOIN industry_recent irr ON irr.board_name = sb.board_name
  WHERE q.name NOT LIKE '%ST%'
    AND l.amt_avg20 >= 3e7
    AND l.ma20 IS NOT NULL AND l.ma60 IS NOT NULL
    AND (l.high_250d - l.low_250d) > 0
    -- 低位过滤：价格百分位 < 35%
    AND (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100 < 35
    -- 成交量异动过滤：5日均量至少是60日均量的1.2倍
    AND l.vol_ma60 > 0 AND l.vol_ma5 / l.vol_ma60 >= 1.2
)
SELECT
  code, name, price, change, industry_board,
  price_pct, ma20_slope, ma60_slope, vol_surge_ratio,
  board_netflow, board_cum5_pct,
  low_score, stable_score, volume_score, sector_score,
  (low_score + stable_score + volume_score + sector_score) AS total_score,
  amt_avg20_yi,
  '低位放量+板块共振时介入，止损近期低点下方3%' AS entry_point
FROM scored
ORDER BY total_score DESC, vol_surge_ratio DESC
LIMIT 150
`,
    /**
     * 动态 SQL 构建：在静态版基础上，额外加入两个来自盘面报告的加分维度：
     *  ⑤ report_board_score（0-15）：个股所属板块是否在报告推荐的强势板块列表中
     *  ⑥ report_stock_score（0-20）：个股是否是报告中的龙头（+20）或核心推荐（+15）
     * 若无有效报告，降级为静态 SQL（不加这两项）。
     */
    buildSql(ctx: ReportContext | null): string {
      // 无有效报告或板块/个股信息都为空 → 原始 SQL
      const hasReport =
        ctx &&
        ctx.contentLength > 500 &&
        (ctx.hotBoards.length > 0 ||
          ctx.leadingStocks.length > 0 ||
          ctx.topPickStocks.length > 0);

      if (!hasReport) return this.sql;

      // SQL 安全转义（防止注入）
      const escapeSqlStr = (s: string) => s.replace(/'/g, "''");

      // 推荐板块列表（用于 CASE WHEN board IN (...)）
      const boardList =
        ctx!.hotBoards.length > 0
          ? ctx!.hotBoards.map((b) => `'${escapeSqlStr(b)}'`).join(", ")
          : null;

      // 报告中出现的所有个股代码（龙头 + 核心推荐，去重）
      const reportStockSet = new Set([
        ...ctx!.leadingStocks,
        ...ctx!.topPickStocks,
      ]);
      const stockList =
        reportStockSet.size > 0
          ? Array.from(reportStockSet)
              .map((c) => `'${escapeSqlStr(c)}'`)
              .join(", ")
          : null;

      // 龙头代码集合（加分更高）
      const leadingList =
        ctx!.leadingStocks.length > 0
          ? ctx!.leadingStocks.map((c) => `'${escapeSqlStr(c)}'`).join(", ")
          : null;

      // 构建 report_board_score 表达式
      const boardScoreExpr = boardList
        ? `CASE WHEN COALESCE(sb.board_name, '') IN (${boardList}) THEN 15 ELSE 0 END`
        : "0";

      // 构建 report_stock_score 表达式
      let stockScoreExpr = "0";
      if (leadingList && stockList) {
        stockScoreExpr = `CASE WHEN l.code IN (${leadingList}) THEN 20 WHEN l.code IN (${stockList}) THEN 15 ELSE 0 END`;
      } else if (stockList) {
        stockScoreExpr = `CASE WHEN l.code IN (${stockList}) THEN 15 ELSE 0 END`;
      }

      return `
WITH kline_data AS (
  SELECT
    code, trade_date, close, high, low, volume, turnover,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19  PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS ma60,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 24  PRECEDING AND 5 PRECEDING) AS ma20_5d_ago,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 64  PRECEDING AND 5 PRECEDING) AS ma60_5d_ago,
    AVG(volume)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4   PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(volume)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS vol_ma60,
    MAX(high)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS high_250d,
    MIN(low)     OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS low_250d,
    AVG(turnover)OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19  PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
industry_flow AS (
  SELECT name, netflow, change_pct AS board_change
  FROM fund_flow_snapshot
  WHERE period = 'today' AND board_type = 'industry'
    AND trade_date = (SELECT MAX(trade_date) FROM fund_flow_snapshot WHERE period = 'today')
),
industry_recent AS (
  SELECT name AS board_name, SUM(change_pct) AS cum5_pct
  FROM sw_industry_daily
  WHERE trade_date >= (SELECT date(MAX(trade_date), '-9 days') FROM sw_industry_daily)
  GROUP BY name
),
stock_board AS (
  SELECT sic.stock_code, si.name AS board_name
  FROM sw_industry_constituent sic
  JOIN sw_industry si ON si.code = sic.board_code AND si.level = '二级'
),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    ROUND(l.amt_avg20 / 1e8, 2) AS amt_avg20_yi,
    COALESCE(sb.board_name, '未分类') AS industry_board,
    ROUND(CASE WHEN (l.high_250d - l.low_250d) > 0
      THEN (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100
      ELSE 50 END, 1) AS price_pct,
    ROUND(CASE WHEN l.ma20_5d_ago > 0
      THEN (l.ma20 - l.ma20_5d_ago) / l.ma20_5d_ago * 100 ELSE 0 END, 2) AS ma20_slope,
    ROUND(CASE WHEN l.ma60_5d_ago > 0
      THEN (l.ma60 - l.ma60_5d_ago) / l.ma60_5d_ago * 100 ELSE 0 END, 2) AS ma60_slope,
    ROUND(CASE WHEN l.vol_ma60 > 0 THEN l.vol_ma5 / l.vol_ma60 ELSE 0 END, 2) AS vol_surge_ratio,
    ROUND(COALESCE(irf.netflow, 0), 2) AS board_netflow,
    ROUND(COALESCE(irr.cum5_pct, 0), 2) AS board_cum5_pct,
    CASE WHEN (l.high_250d - l.low_250d) > 0
         AND (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100 < 20 THEN 30
         WHEN (l.high_250d - l.low_250d) > 0
         AND (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100 < 35 THEN 20
         ELSE 0 END AS low_score,
    CASE WHEN l.ma20_5d_ago > 0
         AND (l.ma20 - l.ma20_5d_ago) / l.ma20_5d_ago * 100 > -0.3
         AND (l.ma20 - l.ma20_5d_ago) / l.ma20_5d_ago * 100 < 2 THEN 15
         ELSE 0 END +
    CASE WHEN l.ma60_5d_ago > 0
         AND (l.ma60 - l.ma60_5d_ago) / l.ma60_5d_ago * 100 > -0.3 THEN 10
         ELSE 0 END AS stable_score,
    CASE WHEN l.vol_ma60 > 0 AND l.vol_ma5 / l.vol_ma60 >= 2.0 THEN 25
         WHEN l.vol_ma60 > 0 AND l.vol_ma5 / l.vol_ma60 >= 1.5 THEN 18
         WHEN l.vol_ma60 > 0 AND l.vol_ma5 / l.vol_ma60 >= 1.2 THEN 10
         ELSE 0 END AS volume_score,
    CASE WHEN COALESCE(irf.netflow, 0) > 20 AND COALESCE(irr.cum5_pct, 0) > 2 THEN 20
         WHEN COALESCE(irf.netflow, 0) > 5  AND COALESCE(irr.cum5_pct, 0) > 0 THEN 12
         WHEN COALESCE(irf.netflow, 0) > 0  THEN 6
         ELSE 0 END AS sector_score,
    -- ⑤ 报告推荐板块加分（0-15）
    ${boardScoreExpr} AS report_board_score,
    -- ⑥ 报告龙头/核心推荐个股加分（0-20）
    ${stockScoreExpr} AS report_stock_score
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN stock_board sb ON sb.stock_code = l.code
  LEFT JOIN industry_flow irf ON irf.name = sb.board_name
  LEFT JOIN industry_recent irr ON irr.board_name = sb.board_name
  WHERE q.name NOT LIKE '%ST%'
    AND l.amt_avg20 >= 3e7
    AND l.ma20 IS NOT NULL AND l.ma60 IS NOT NULL
    AND (l.high_250d - l.low_250d) > 0
    AND (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100 < 35
    AND l.vol_ma60 > 0 AND l.vol_ma5 / l.vol_ma60 >= 1.2
)
SELECT
  code, name, price, change, industry_board,
  price_pct, ma20_slope, ma60_slope, vol_surge_ratio,
  board_netflow, board_cum5_pct,
  low_score, stable_score, volume_score, sector_score,
  report_board_score, report_stock_score,
  (low_score + stable_score + volume_score + sector_score + report_board_score + report_stock_score) AS total_score,
  amt_avg20_yi,
  CASE
    WHEN report_stock_score >= 20 THEN '报告龙头股·优先介入，板块放量时建仓，止损低点下方3%'
    WHEN report_stock_score >= 15 THEN '报告核心推荐·低位放量+板块共振时介入，止损低点下方3%'
    WHEN report_board_score > 0   THEN '报告推荐板块·低位放量+板块共振时介入，止损低点下方3%'
    ELSE '低位放量+板块共振时介入，止损近期低点下方3%'
  END AS entry_point
FROM scored
ORDER BY total_score DESC, vol_surge_ratio DESC
LIMIT 150
`;
    },
  },
  // ─── 0b. 报告精选（自定义）────────────────────────────────────────────────────
  {
    id: "report_picks",
    name: "报告精选",
    category: "自定义",
    description:
      "直接读取最新盘面分析报告中的龙头/龙二/中军/核心推荐个股，无低位/量比硬过滤，展示这些个股当前的技术面评分与资金状态。",
    signals: [
      "来自最新盘面报告的龙头/龙二/中军个股",
      "来自报告 8.7/8.8 节核心推荐个股",
      "展示各维度评分：低位、企稳、量能、板块共振",
      "无硬过滤条件，报告推荐即纳入",
    ],
    entryNote: "参考报告原文中的入场区间和止损位，结合当前技术面评分综合判断。",
    riskNote:
      "报告推荐个股可能已处于高位或强势上涨中，需结合量价确认后操作，切勿盲目追高。",
    sql: `SELECT '无报告' AS code, '暂无盘面报告' AS name, 0 AS price, 0 AS change, '' AS industry_board, 0 AS price_pct, 0 AS ma20_slope, 0 AS ma60_slope, 0 AS vol_surge_ratio, 0 AS board_netflow, 0 AS board_cum5_pct, 0 AS low_score, 0 AS stable_score, 0 AS volume_score, 0 AS sector_score, 0 AS report_board_score, 0 AS report_stock_score, 0 AS total_score, 0 AS amt_avg20_yi, '' AS entry_point WHERE 1=0`,
    buildSql(ctx: ReportContext | null): string {
      // 无有效报告 → 返回空结果
      const allCodes = ctx
        ? [
            ...new Set([
              ...(ctx.leadingStocks ?? []),
              ...(ctx.topPickStocks ?? []),
            ]),
          ]
        : [];

      if (!ctx || allCodes.length === 0) {
        return `SELECT '暂无' AS code, '未找到盘面报告或报告中无推荐个股' AS name, 0 AS price, 0 AS change, '' AS industry_board, 0 AS price_pct, 0 AS ma20_slope, 0 AS ma60_slope, 0 AS vol_surge_ratio, 0 AS board_netflow, 0 AS board_cum5_pct, 0 AS low_score, 0 AS stable_score, 0 AS volume_score, 0 AS sector_score, 0 AS report_board_score, 0 AS report_stock_score, 0 AS total_score, 0 AS amt_avg20_yi, '' AS entry_point WHERE 1=0`;
      }

      const escapeSqlStr = (s: string) => s.replace(/'/g, "''");
      const codeList = allCodes.map((c) => `'${escapeSqlStr(c)}'`).join(", ");
      const leadingList =
        (ctx.leadingStocks ?? [])
          .map((c) => `'${escapeSqlStr(c)}'`)
          .join(", ") || "''";
      const topPickList =
        (ctx.topPickStocks ?? [])
          .map((c) => `'${escapeSqlStr(c)}'`)
          .join(", ") || "''";
      const boardList =
        (ctx.hotBoards ?? []).map((b) => `'${escapeSqlStr(b)}'`).join(", ") ||
        "''";

      return `
WITH kline_data AS (
  SELECT
    code, trade_date, close, high, low, volume, turnover,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19  PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS ma60,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 24  PRECEDING AND 5 PRECEDING) AS ma20_5d_ago,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 64  PRECEDING AND 5 PRECEDING) AS ma60_5d_ago,
    AVG(volume)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4   PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(volume)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS vol_ma60,
    MAX(high)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS high_250d,
    MIN(low)     OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS low_250d,
    AVG(turnover)OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19  PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND code IN (${codeList})
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
industry_flow AS (
  SELECT name, netflow, change_pct AS board_change
  FROM fund_flow_snapshot
  WHERE period = 'today' AND board_type = 'industry'
    AND trade_date = (SELECT MAX(trade_date) FROM fund_flow_snapshot WHERE period = 'today')
),
industry_recent AS (
  SELECT name AS board_name, SUM(change_pct) AS cum5_pct
  FROM sw_industry_daily
  WHERE trade_date >= (SELECT date(MAX(trade_date), '-9 days') FROM sw_industry_daily)
  GROUP BY name
),
stock_board AS (
  SELECT sic.stock_code, si.name AS board_name
  FROM sw_industry_constituent sic
  JOIN sw_industry si ON si.code = sic.board_code AND si.level = '二级'
),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    ROUND(l.amt_avg20 / 1e8, 2) AS amt_avg20_yi,
    COALESCE(sb.board_name, '未分类') AS industry_board,
    ROUND(CASE WHEN (l.high_250d - l.low_250d) > 0
      THEN (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100
      ELSE 50 END, 1) AS price_pct,
    ROUND(CASE WHEN l.ma20_5d_ago > 0
      THEN (l.ma20 - l.ma20_5d_ago) / l.ma20_5d_ago * 100 ELSE 0 END, 2) AS ma20_slope,
    ROUND(CASE WHEN l.ma60_5d_ago > 0
      THEN (l.ma60 - l.ma60_5d_ago) / l.ma60_5d_ago * 100 ELSE 0 END, 2) AS ma60_slope,
    ROUND(CASE WHEN l.vol_ma60 > 0 THEN l.vol_ma5 / l.vol_ma60 ELSE 0 END, 2) AS vol_surge_ratio,
    ROUND(COALESCE(irf.netflow, 0), 2) AS board_netflow,
    ROUND(COALESCE(irr.cum5_pct, 0), 2) AS board_cum5_pct,
    -- 低位评分（参考用，不作过滤）
    CASE WHEN (l.high_250d - l.low_250d) > 0
         AND (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100 < 20 THEN 30
         WHEN (l.high_250d - l.low_250d) > 0
         AND (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100 < 35 THEN 20
         ELSE 0 END AS low_score,
    -- 企稳评分
    CASE WHEN l.ma20_5d_ago > 0
         AND (l.ma20 - l.ma20_5d_ago) / l.ma20_5d_ago * 100 > -0.3
         AND (l.ma20 - l.ma20_5d_ago) / l.ma20_5d_ago * 100 < 2 THEN 15
         ELSE 0 END +
    CASE WHEN l.ma60_5d_ago > 0
         AND (l.ma60 - l.ma60_5d_ago) / l.ma60_5d_ago * 100 > -0.3 THEN 10
         ELSE 0 END AS stable_score,
    -- 量能评分
    CASE WHEN l.vol_ma60 > 0 AND l.vol_ma5 / l.vol_ma60 >= 2.0 THEN 25
         WHEN l.vol_ma60 > 0 AND l.vol_ma5 / l.vol_ma60 >= 1.5 THEN 18
         WHEN l.vol_ma60 > 0 AND l.vol_ma5 / l.vol_ma60 >= 1.2 THEN 10
         ELSE 0 END AS volume_score,
    -- 板块共振评分
    CASE WHEN COALESCE(irf.netflow, 0) > 20 AND COALESCE(irr.cum5_pct, 0) > 2 THEN 20
         WHEN COALESCE(irf.netflow, 0) > 5  AND COALESCE(irr.cum5_pct, 0) > 0 THEN 12
         WHEN COALESCE(irf.netflow, 0) > 0  THEN 6
         ELSE 0 END AS sector_score,
    -- 报告板块加分
    CASE WHEN COALESCE(sb.board_name, '') IN (${boardList}) THEN 15 ELSE 0 END AS report_board_score,
    -- 报告个股定位加分（龙头+30，核心推荐+20）
    CASE WHEN l.code IN (${leadingList}) THEN 30
         WHEN l.code IN (${topPickList}) THEN 20
         ELSE 0 END AS report_stock_score
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN stock_board sb ON sb.stock_code = l.code
  LEFT JOIN industry_flow irf ON irf.name = sb.board_name
  LEFT JOIN industry_recent irr ON irr.board_name = sb.board_name
)
SELECT
  code, name, price, change, industry_board,
  price_pct, ma20_slope, ma60_slope, vol_surge_ratio,
  board_netflow, board_cum5_pct,
  low_score, stable_score, volume_score, sector_score,
  report_board_score, report_stock_score,
  (low_score + stable_score + volume_score + sector_score + report_board_score + report_stock_score) AS total_score,
  amt_avg20_yi,
  CASE
    WHEN report_stock_score >= 30 THEN '报告龙头·参考报告原文入场区间操作'
    WHEN report_stock_score >= 20 THEN '报告核心推荐·参考报告原文入场区间操作'
    ELSE '报告关注标的·结合技术面判断'
  END AS entry_point
FROM scored
ORDER BY report_stock_score DESC, total_score DESC
`;
    },
  },
  // ─── 1. 均线多头排列 ─────────────────────────────────────────────────────────
  {
    id: "ma_bullish",
    name: "均线多头排列",
    category: "趋势跟踪",
    description:
      "MA5 > MA10 > MA20 > MA60 构成完美多头排列，量能温和放大，价格站上所有均线，趋势强烈向上。",
    signals: [
      "MA5 > MA10 > MA20 > MA60 多头排列",
      "价格站上MA5",
      "5日均量 > 20日均量（量能放大）",
      "MA5斜率向上（近5日MA5递增）",
    ],
    entryNote: "回踩MA5或MA10不破时为低吸机会，止损设MA20下方。",
    riskNote: "均线滞后，强趋势中切勿追高，需关注成交量是否持续配合。",
    sql: `
WITH kline_data AS (
  SELECT
    code,
    trade_date,
    close, open, high, low, volume, turnover,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS ma10,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 119 PRECEDING AND CURRENT ROW) AS ma120,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS ma250,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    -- MA5斜率（和5日前相比）
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND 5 PRECEDING) AS ma5_prev5,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (
  SELECT * FROM kline_data WHERE rn = 1
),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    ROUND(l.ma5, 2) AS ma5,
    ROUND(l.ma10, 2) AS ma10,
    ROUND(l.ma20, 2) AS ma20,
    ROUND(l.ma60, 2) AS ma60,
    ROUND(l.amt_avg20 / 100000000.0, 2) AS amt_avg20_yi,
    -- 趋势评分（0-40）：多头排列完整度
    CASE WHEN l.ma5 > l.ma10 AND l.ma10 > l.ma20 AND l.ma20 > l.ma60 THEN 40
         WHEN l.ma5 > l.ma10 AND l.ma10 > l.ma20 THEN 25
         WHEN l.ma5 > l.ma10 THEN 15
         ELSE 0 END AS trend_score,
    -- 量能评分（0-25）
    CASE WHEN l.vol_ma5 > l.vol_ma20 * 1.5 THEN 25
         WHEN l.vol_ma5 > l.vol_ma20 * 1.2 THEN 18
         WHEN l.vol_ma5 > l.vol_ma20 THEN 12
         ELSE 5 END AS volume_score,
    -- 价格位置评分（0-20）：是否站上各均线
    CASE WHEN l.close > l.ma5 AND l.close > l.ma10 AND l.close > l.ma20 THEN 20
         WHEN l.close > l.ma5 AND l.close > l.ma10 THEN 14
         WHEN l.close > l.ma5 THEN 8
         ELSE 0 END AS price_pos_score,
    -- 动量评分（0-15）：MA5斜率
    CASE WHEN l.ma5 > l.ma5_prev5 * 1.02 THEN 15
         WHEN l.ma5 > l.ma5_prev5 * 1.005 THEN 10
         WHEN l.ma5 > l.ma5_prev5 THEN 5
         ELSE 0 END AS momentum_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c
    JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND l.ma5 IS NOT NULL AND l.ma60 IS NOT NULL
    AND l.amt_avg20 >= 30000000
)
SELECT
  code, name, price, change, industry_board,
  trend_score, volume_score, price_pos_score, momentum_score,
  (trend_score + volume_score + price_pos_score + momentum_score) AS total_score,
  ma5, ma10, ma20, ma60, amt_avg20_yi,
  '回踩MA5/MA10不破时买入' AS entry_point
FROM scored
WHERE trend_score >= 25
ORDER BY total_score DESC
LIMIT 150
`,
  },

  // ─── 2. 突破前高 ────────────────────────────────────────────────────────────
  {
    id: "breakout_high",
    name: "突破前高放量",
    category: "突破策略",
    description:
      "股价有效突破近期盘整区域的前期高点，且突破时成交量显著放大（>1.5倍均量），确认突破有效性，适合追突破。",
    signals: [
      "当日收盘价突破近60日最高点",
      "突破当日成交量 > 近20日均量1.5倍",
      "突破前已有5日以上盘整（横盘蓄势）",
      "价格站上MA20",
    ],
    entryNote: "突破当日或次日回踩确认量缩不破为买点，止损设突破前低。",
    riskNote: "假突破风险较高，需严格执行止损；追高需控制仓位。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, turnover, change_pct,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 61 PRECEDING AND 1 PRECEDING) AS prev_60d_high,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    -- 前5日最高（用于判断是否有盘整）
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING) AS prev_5d_high,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    ROUND(l.ma20, 2) AS ma20,
    ROUND(l.ma60, 2) AS ma60,
    ROUND(l.amt_avg20 / 100000000.0, 2) AS amt_avg20_yi,
    ROUND(l.prev_60d_high, 2) AS prev_60d_high,
    ROUND((l.close - l.prev_60d_high) / l.prev_60d_high * 100, 2) AS breakout_pct,
    -- 突破评分（0-40）
    CASE
      WHEN l.close > l.prev_60d_high AND l.volume > l.vol_ma20 * 2.0 THEN 40
      WHEN l.close > l.prev_60d_high AND l.volume > l.vol_ma20 * 1.5 THEN 32
      WHEN l.close > l.prev_60d_high AND l.volume > l.vol_ma20 * 1.2 THEN 22
      ELSE 5
    END AS breakout_score,
    -- 量能评分（0-30）
    CASE
      WHEN l.volume > l.vol_ma20 * 2.5 THEN 30
      WHEN l.volume > l.vol_ma20 * 2.0 THEN 24
      WHEN l.volume > l.vol_ma20 * 1.5 THEN 18
      ELSE 8
    END AS volume_score,
    -- 趋势评分（0-20）：站上MA60说明中期趋势健康
    CASE WHEN l.close > l.ma60 AND l.close > l.ma20 THEN 20
         WHEN l.close > l.ma20 THEN 12
         ELSE 4 END AS trend_score,
    -- 动量评分（0-10）：突破幅度
    CASE
      WHEN l.change_pct >= 5 THEN 10
      WHEN l.change_pct >= 3 THEN 7
      WHEN l.change_pct >= 1 THEN 4
      ELSE 1
    END AS momentum_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c
    JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND l.prev_60d_high IS NOT NULL
    AND l.close > l.prev_60d_high
    AND l.volume > l.vol_ma20 * 1.2
    AND l.amt_avg20 >= 30000000
)
SELECT
  code, name, price, change, industry_board,
  breakout_score, volume_score, trend_score, momentum_score,
  (breakout_score + volume_score + trend_score + momentum_score) AS total_score,
  ma20, ma60, prev_60d_high, breakout_pct, amt_avg20_yi,
  '突破后回踩确认不破为买点' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 150
`,
  },

  // ─── 3. 底部反转（W底/双底形态）──────────────────────────────────────────────
  {
    id: "bottom_reversal",
    name: "底部反转信号",
    category: "形态识别",
    description:
      "股价经过长期下跌或调整后，从低位出现反转信号：底部放量长阳、缩量探底后放量回升，形态上类似W底或双底结构。",
    signals: [
      "处于近6个月价格低位区间（距低点涨幅<30%）",
      "近期出现放量长阳线（当日成交量>20日均量1.5倍）",
      "当日阳线涨幅>3%",
      "价格回到MA20附近或突破MA20",
    ],
    entryNote: "放量突破MA20时为买点，止损设近期低点下方。",
    riskNote: "底部反转确认需要时间，避免过早介入，宜分批建仓。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, turnover, change_pct,
    MIN(low) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 125 PRECEDING AND CURRENT ROW) AS low_6m,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 125 PRECEDING AND CURRENT ROW) AS high_6m,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    ROUND(l.low_6m, 2) AS low_6m,
    ROUND((l.close - l.low_6m) / l.low_6m * 100, 2) AS dist_from_low_pct,
    ROUND((l.high_6m - l.close) / l.close * 100, 2) AS down_from_high_pct,
    ROUND(l.ma20, 2) AS ma20,
    ROUND(l.amt_avg20 / 100000000.0, 2) AS amt_avg20_yi,
    -- 位置评分（0-30）：离低点越近分越高
    CASE
      WHEN (l.close - l.low_6m) / l.low_6m <= 0.10 THEN 30
      WHEN (l.close - l.low_6m) / l.low_6m <= 0.15 THEN 24
      WHEN (l.close - l.low_6m) / l.low_6m <= 0.20 THEN 18
      WHEN (l.close - l.low_6m) / l.low_6m <= 0.30 THEN 10
      ELSE 0
    END AS position_score,
    -- 反转信号评分（0-35）：放量长阳
    CASE
      WHEN l.close > l.open AND l.change_pct >= 5 AND l.volume > l.vol_ma20 * 2.0 THEN 35
      WHEN l.close > l.open AND l.change_pct >= 3 AND l.volume > l.vol_ma20 * 1.5 THEN 28
      WHEN l.close > l.open AND l.change_pct >= 2 AND l.volume > l.vol_ma20 * 1.3 THEN 20
      WHEN l.close > l.open AND l.volume > l.vol_ma20 * 1.2 THEN 12
      ELSE 0
    END AS reversal_score,
    -- 均线评分（0-20）：能回到MA20附近是重要信号
    CASE
      WHEN l.close > l.ma20 AND l.close < l.ma20 * 1.05 THEN 20  -- 刚突破MA20
      WHEN l.close > l.ma20 THEN 14
      WHEN l.close > l.ma20 * 0.95 THEN 8  -- 接近MA20
      ELSE 2
    END AS ma_score,
    -- 量能评分（0-15）
    CASE
      WHEN l.volume > l.vol_ma20 * 2.5 THEN 15
      WHEN l.volume > l.vol_ma20 * 2.0 THEN 12
      WHEN l.volume > l.vol_ma20 * 1.5 THEN 8
      ELSE 3
    END AS volume_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c
    JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND l.low_6m IS NOT NULL
    AND (l.close - l.low_6m) / l.low_6m <= 0.30
    AND l.close > l.open
    AND l.change_pct >= 2
    AND l.volume > l.vol_ma20 * 1.2
    AND l.amt_avg20 >= 30000000
)
SELECT
  code, name, price, change, industry_board,
  position_score, reversal_score, ma_score, volume_score,
  (position_score + reversal_score + ma_score + volume_score) AS total_score,
  low_6m, dist_from_low_pct, down_from_high_pct, ma20, amt_avg20_yi,
  '放量突破MA20时分批买入' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 150
`,
  },

  // ─── 4. MACD金叉 ──────────────────────────────────────────────────────────
  {
    id: "macd_golden",
    name: "MACD金叉背离",
    category: "技术指标",
    description:
      "MACD指标DIF上穿DEA形成金叉，或价格创新低但MACD柱状图底部抬高（底背离），配合均线多头形成强烈买入信号。",
    signals: [
      "DIF上穿DEA（MACD金叉）",
      "金叉位置在零轴附近或上方（趋势强）",
      "MACD柱状图由负转正",
      "价格站上MA20",
    ],
    entryNote: "金叉确认当日或次日开盘买入，止损设金叉前低点。",
    riskNote: "MACD信号有一定滞后性，在震荡市中假信号较多。",
    sql: `
WITH kline_raw AS (
  SELECT code, trade_date, close, volume, turnover,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn_desc,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date) AS rn_asc
  FROM stock_kline WHERE period='daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
-- 用指数加权均线近似EMA（用简单窗口均线近似）
kline_ema AS (
  SELECT
    code, trade_date, close, volume, turnover, rn_desc,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS ema12,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 25 PRECEDING AND CURRENT ROW) AS ema26,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20
  FROM kline_raw
),
kline_dif AS (
  SELECT *,
    (ema12 - ema26) AS dif,
    AVG(ema12 - ema26) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) AS dea
  FROM kline_ema
),
kline_macd AS (
  SELECT *,
    2 * (dif - dea) AS macd_bar,
    LAG(dif - dea) OVER (PARTITION BY code ORDER BY trade_date) AS prev_dif_minus_dea
  FROM kline_dif
),
latest AS (SELECT * FROM kline_macd WHERE rn_desc = 1),
prev1  AS (SELECT * FROM kline_macd WHERE rn_desc = 2),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    ROUND(l.dif, 4) AS dif,
    ROUND(l.dea, 4) AS dea,
    ROUND(l.macd_bar, 4) AS macd_bar,
    ROUND(l.ma20, 2) AS ma20,
    ROUND(l.amt_avg20 / 100000000.0, 2) AS amt_avg20_yi,
    -- MACD金叉评分（0-40）：DIF上穿DEA
    CASE
      WHEN l.dif > l.dea AND p.dif <= p.dea AND l.dif > 0 THEN 40  -- 零轴上方金叉
      WHEN l.dif > l.dea AND p.dif <= p.dea AND l.dif > -0.02 THEN 32  -- 零轴附近金叉
      WHEN l.dif > l.dea AND p.dif <= p.dea THEN 22  -- 零轴下方金叉
      WHEN l.dif > l.dea AND l.macd_bar > 0 THEN 15  -- 持续金叉
      ELSE 0
    END AS macd_score,
    -- MACD柱状图评分（0-25）
    CASE
      WHEN l.macd_bar > 0 AND p.macd_bar < 0 THEN 25  -- 柱由负转正
      WHEN l.macd_bar > 0 AND l.macd_bar > p.macd_bar THEN 18  -- 柱持续增大
      WHEN l.macd_bar > 0 THEN 10
      ELSE 0
    END AS bar_score,
    -- 零轴位置评分（0-20）
    CASE
      WHEN l.dif > 0.05 THEN 20
      WHEN l.dif > 0 THEN 15
      WHEN l.dif > -0.02 THEN 8
      ELSE 0
    END AS zero_axis_score,
    -- 均线评分（0-15）
    CASE
      WHEN l.close > l.ma20 AND l.close > l.ma60 THEN 15
      WHEN l.close > l.ma20 THEN 10
      ELSE 3
    END AS ma_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN prev1 p ON p.code = l.code
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c
    JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND l.dif IS NOT NULL AND l.dea IS NOT NULL
    AND l.dif > l.dea
    AND l.amt_avg20 >= 30000000
)
SELECT
  code, name, price, change, industry_board,
  macd_score, bar_score, zero_axis_score, ma_score,
  (macd_score + bar_score + zero_axis_score + ma_score) AS total_score,
  dif, dea, macd_bar, ma20, amt_avg20_yi,
  'MACD金叉确认后次日开盘买入' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 150
`,
  },

  // ─── 5. 缩量回调蓄势 ─────────────────────────────────────────────────────────
  {
    id: "volume_shrink_pullback",
    name: "缩量回调蓄势",
    category: "量价关系",
    description:
      "上涨趋势中出现缩量调整，调整幅度温和（不超过前期涨幅的50%），之后放量再攻，量缩价稳是极佳的低吸机会。",
    signals: [
      "近5日均量 < 近20日均量（量能收缩）",
      "近5日内价格调整幅度 < 前期涨幅50%",
      "MA20处于上升趋势",
      "价格在MA20-MA60之间蓄势",
    ],
    entryNote: "缩量横盘后放量突破MA5时为绝佳买点，止损设调整低点。",
    riskNote: "需确认整体趋势向上，震荡市中效果较差。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, turnover, change_pct,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 119 PRECEDING AND CURRENT ROW) AS ma120,
    -- 前20日高点（反弹前的高点）
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 25 PRECEDING AND 5 PRECEDING) AS recent_high,
    -- 前20日低点（反弹起点）
    MIN(low) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 25 PRECEDING AND 5 PRECEDING) AS recent_low,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    -- MA20斜率
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 24 PRECEDING AND 20 PRECEDING) AS ma20_prev5,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    ROUND(l.vol_ma5 / l.vol_ma20, 2) AS vol_ratio,
    ROUND(l.ma20, 2) AS ma20,
    ROUND(l.ma60, 2) AS ma60,
    ROUND(l.amt_avg20 / 100000000.0, 2) AS amt_avg20_yi,
    -- 量能收缩评分（0-35）：越缩量分越高
    CASE
      WHEN l.vol_ma5 < l.vol_ma20 * 0.5 THEN 35
      WHEN l.vol_ma5 < l.vol_ma20 * 0.6 THEN 28
      WHEN l.vol_ma5 < l.vol_ma20 * 0.7 THEN 20
      WHEN l.vol_ma5 < l.vol_ma20 * 0.8 THEN 12
      ELSE 5
    END AS shrink_score,
    -- 位置评分（0-25）：在均线支撑区间
    CASE
      WHEN l.close >= l.ma20 AND l.close <= l.ma20 * 1.05 THEN 25  -- MA20附近
      WHEN l.close >= l.ma20 * 0.97 AND l.close <= l.ma20 * 1.10 THEN 18
      WHEN l.close >= l.ma60 AND l.close <= l.ma60 * 1.05 THEN 22  -- MA60支撑
      WHEN l.close > l.ma20 THEN 12
      ELSE 0
    END AS position_score,
    -- MA20趋势评分（0-25）：MA20向上是关键
    CASE
      WHEN l.ma20 > l.ma20_prev5 * 1.01 THEN 25
      WHEN l.ma20 > l.ma20_prev5 * 1.005 THEN 18
      WHEN l.ma20 > l.ma20_prev5 THEN 12
      ELSE 0
    END AS trend_score,
    -- 均线支撑评分（0-15）
    CASE
      WHEN l.ma5 > l.ma20 AND l.ma20 > l.ma60 THEN 15
      WHEN l.ma20 > l.ma60 THEN 10
      ELSE 3
    END AS ma_order_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c
    JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND l.vol_ma5 IS NOT NULL AND l.vol_ma20 IS NOT NULL
    AND l.vol_ma5 < l.vol_ma20 * 0.8
    AND l.ma20 > l.ma20_prev5
    AND l.close > l.ma60
    AND l.amt_avg20 >= 30000000
)
SELECT
  code, name, price, change, industry_board,
  shrink_score, position_score, trend_score, ma_order_score,
  (shrink_score + position_score + trend_score + ma_order_score) AS total_score,
  vol_ratio, ma20, ma60, amt_avg20_yi,
  '缩量横盘后放量突破MA5时买入' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 150
`,
  },

  // ─── 6. 强势股回调 ──────────────────────────────────────────────────────────
  {
    id: "strong_pullback",
    name: "强势股回调低吸",
    category: "趋势跟踪",
    description:
      "近期强势上涨的股票出现短期回调，回调幅度在黄金分割位（38.2%-61.8%）内，是上涨趋势中低吸的好时机。",
    signals: [
      "近3个月涨幅 > 30%（强势股认定）",
      "当前距近期高点回调10%-30%",
      "回调至MA20-MA60支撑区域",
      "回调成交量萎缩",
    ],
    entryNote: "回调至MA20或MA60支撑位附近，缩量后放量企稳时买入。",
    riskNote: "强势股转弱风险，需严格止损；回调超过高点50%需谨慎。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, turnover,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS high_20d,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS high_5d,
    -- 3个月前（约62个交易日前）的收盘价，用LAG取第62个前的值
    LAG(close, 62) OVER (PARTITION BY code ORDER BY trade_date) AS close_3m_ago,
    -- 3个月内的最低收盘价用于判断整体涨幅
    MIN(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 62 PRECEDING AND 1 PRECEDING) AS close_3m_low,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    -- 用3个月最低点计算涨幅（比3个月前价格更稳健）
    ROUND((l.close - COALESCE(l.close_3m_ago, l.close_3m_low)) / COALESCE(l.close_3m_ago, l.close_3m_low) * 100, 2) AS rise_3m_pct,
    ROUND((l.high_20d - l.close) / l.high_20d * 100, 2) AS pullback_pct,
    ROUND(l.ma20, 2) AS ma20,
    ROUND(l.ma60, 2) AS ma60,
    ROUND(l.amt_avg20 / 100000000.0, 2) AS amt_avg20_yi,
    -- 强势度评分（0-30）：用3个月内最低点计算涨幅
    CASE
      WHEN (l.close - COALESCE(l.close_3m_ago, l.close_3m_low)) / COALESCE(l.close_3m_ago, l.close_3m_low) >= 0.8 THEN 30
      WHEN (l.close - COALESCE(l.close_3m_ago, l.close_3m_low)) / COALESCE(l.close_3m_ago, l.close_3m_low) >= 0.6 THEN 25
      WHEN (l.close - COALESCE(l.close_3m_ago, l.close_3m_low)) / COALESCE(l.close_3m_ago, l.close_3m_low) >= 0.4 THEN 20
      WHEN (l.close - COALESCE(l.close_3m_ago, l.close_3m_low)) / COALESCE(l.close_3m_ago, l.close_3m_low) >= 0.3 THEN 14
      ELSE 5
    END AS strength_score,
    -- 回调位置评分（0-35）：黄金分割支撑
    CASE
      WHEN l.close >= l.ma20 AND l.close <= l.ma20 * 1.03 THEN 35  -- MA20支撑
      WHEN l.close >= l.ma60 AND l.close <= l.ma60 * 1.03 THEN 30  -- MA60支撑
      WHEN l.close >= l.ma20 * 0.97 THEN 20
      WHEN l.close >= l.ma60 * 0.97 THEN 18
      WHEN l.close > l.ma60 THEN 10
      ELSE 0
    END AS pullback_pos_score,
    -- 量能评分（0-20）：回调缩量
    CASE
      WHEN l.vol_ma5 < l.vol_ma20 * 0.6 THEN 20
      WHEN l.vol_ma5 < l.vol_ma20 * 0.7 THEN 15
      WHEN l.vol_ma5 < l.vol_ma20 * 0.8 THEN 10
      ELSE 3
    END AS volume_score,
    -- 回调幅度评分（0-15）：适度回调最优
    CASE
      WHEN (l.high_20d - l.close) / l.high_20d BETWEEN 0.10 AND 0.20 THEN 15
      WHEN (l.high_20d - l.close) / l.high_20d BETWEEN 0.08 AND 0.25 THEN 10
      WHEN (l.high_20d - l.close) / l.high_20d BETWEEN 0.05 AND 0.30 THEN 5
      ELSE 0
    END AS pullback_range_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c
    JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND (l.close_3m_ago IS NOT NULL OR l.close_3m_low IS NOT NULL)
    AND (l.close - COALESCE(l.close_3m_ago, l.close_3m_low)) / COALESCE(l.close_3m_ago, l.close_3m_low) >= 0.30
    AND (l.high_20d - l.close) / l.high_20d BETWEEN 0.05 AND 0.35
    AND l.close > l.ma60
    AND l.amt_avg20 >= 30000000
)
SELECT
  code, name, price, change, industry_board,
  strength_score, pullback_pos_score, volume_score, pullback_range_score,
  (strength_score + pullback_pos_score + volume_score + pullback_range_score) AS total_score,
  rise_3m_pct, pullback_pct, ma20, ma60, amt_avg20_yi,
  'MA20/MA60支撑位缩量后放量时买入' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 150
`,
  },

  // ─── 7. 周K+月K共振 ──────────────────────────────────────────────────────────
  {
    id: "weekly_monthly_resonance",
    name: "周月K线共振",
    category: "多周期共振",
    description:
      "日线、周线、月线三重趋势共振向上：周K收阳站上10周均线，月K处于上升通道，日K出现买入信号，多周期共振是最强的趋势信号。",
    signals: [
      "日K：价格站上MA5且MA5>MA20",
      "周K趋势：5周均线(=MA25日线) > 10周均线(=MA50日线)",
      "月K趋势：10月均线(=MA200日线)持续上扬",
      "三重均线共振向上",
    ],
    entryNote: "三重共振确认后，日线回踩MA5不破时为最佳买点。",
    riskNote: "多周期共振信号出现时往往已有较大涨幅，需控制追高风险。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, turnover,
    -- 日线均线
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    -- 周线均值（用25日/50日/125日近似5周/10周/25周）
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 24 PRECEDING AND CURRENT ROW) AS ma25,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 49 PRECEDING AND CURRENT ROW) AS ma50,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 124 PRECEDING AND CURRENT ROW) AS ma125,
    -- 月线均值（用20日/60日/120日/200日近似1月/3月/6月/10月）
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 199 PRECEDING AND CURRENT ROW) AS ma200,
    -- MA200斜率（近50日前的MA200）
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND 50 PRECEDING) AS ma200_prev50,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    ROUND(l.ma25, 2) AS ma25_w,
    ROUND(l.ma50, 2) AS ma50_w,
    ROUND(l.ma200, 2) AS ma200_m,
    ROUND(l.amt_avg20 / 100000000.0, 2) AS amt_avg20_yi,
    -- 日线评分（0-25）
    CASE
      WHEN l.close > l.ma5 AND l.ma5 > l.ma20 THEN 25
      WHEN l.close > l.ma5 THEN 15
      WHEN l.close > l.ma20 THEN 10
      ELSE 0
    END AS daily_score,
    -- 周线评分（0-30）：5周均>10周均
    CASE
      WHEN l.ma25 > l.ma50 AND l.ma50 > l.ma125 THEN 30
      WHEN l.ma25 > l.ma50 THEN 20
      WHEN l.close > l.ma50 THEN 10
      ELSE 0
    END AS weekly_score,
    -- 月线评分（0-30）：月线趋势向上
    CASE
      WHEN l.ma200 > l.ma200_prev50 AND l.close > l.ma200 THEN 30
      WHEN l.close > l.ma200 THEN 20
      WHEN l.ma200 > l.ma200_prev50 THEN 12
      ELSE 0
    END AS monthly_score,
    -- 共振强度评分（0-15）：三重共振叠加
    CASE
      WHEN l.ma5 > l.ma20 AND l.ma25 > l.ma50 AND l.close > l.ma200 THEN 15
      WHEN l.ma5 > l.ma20 AND l.ma25 > l.ma50 THEN 10
      WHEN l.ma25 > l.ma50 THEN 5
      ELSE 0
    END AS resonance_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c
    JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND l.ma200 IS NOT NULL
    AND l.ma25 > l.ma50
    AND l.close > l.ma200
    AND l.amt_avg20 >= 30000000
)
SELECT
  code, name, price, change, industry_board,
  daily_score, weekly_score, monthly_score, resonance_score,
  (daily_score + weekly_score + monthly_score + resonance_score) AS total_score,
  ma25_w, ma50_w, ma200_m, amt_avg20_yi,
  '日线回踩MA5不破时买入，止损MA20下方' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 150
`,
  },

  // ─── 8. 量价齐升 ─────────────────────────────────────────────────────────────
  {
    id: "volume_price_surge",
    name: "量价齐升突破",
    category: "量价关系",
    description:
      "价格创阶段新高的同时成交量显著放大，价量齐升是最健康的上涨信号，表明主力资金积极介入。",
    signals: [
      "价格创近20日新高",
      "当日成交量 > 近20日均量1.5倍",
      "连续3日收阳",
      "价格站上MA20",
    ],
    entryNote: "量价齐升确认当日追入，止损设前一根阳线低点。",
    riskNote: "顶背离风险：量价齐升出现在高位时需警惕见顶信号。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, turnover, change_pct,
    MAX(high) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND 1 PRECEDING) AS prev_20d_high,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    -- 连续阳线判断
    MIN(CASE WHEN close > open THEN 1 ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS consec_3_yang,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    ROUND(l.vol_ma5 / l.vol_ma20, 2) AS vol_ratio,
    ROUND(l.ma20, 2) AS ma20,
    ROUND(l.ma60, 2) AS ma60,
    ROUND(l.amt_avg20 / 100000000.0, 2) AS amt_avg20_yi,
    -- 新高突破评分（0-35）
    CASE
      WHEN l.high > l.prev_20d_high AND l.volume > l.vol_ma20 * 2.5 THEN 35
      WHEN l.high > l.prev_20d_high AND l.volume > l.vol_ma20 * 2.0 THEN 28
      WHEN l.high > l.prev_20d_high AND l.volume > l.vol_ma20 * 1.5 THEN 20
      WHEN l.high > l.prev_20d_high THEN 12
      ELSE 0
    END AS new_high_score,
    -- 量能评分（0-30）
    CASE
      WHEN l.volume > l.vol_ma20 * 3.0 THEN 30
      WHEN l.volume > l.vol_ma20 * 2.5 THEN 25
      WHEN l.volume > l.vol_ma20 * 2.0 THEN 20
      WHEN l.volume > l.vol_ma20 * 1.5 THEN 14
      ELSE 5
    END AS volume_score,
    -- 阳线评分（0-20）
    CASE
      WHEN l.consec_3_yang = 1 AND l.change_pct >= 3 THEN 20
      WHEN l.consec_3_yang = 1 THEN 14
      WHEN l.close > l.open AND l.change_pct >= 3 THEN 10
      WHEN l.close > l.open THEN 6
      ELSE 0
    END AS yang_score,
    -- 均线评分（0-15）
    CASE
      WHEN l.close > l.ma20 AND l.ma5 > l.ma20 THEN 15
      WHEN l.close > l.ma20 THEN 10
      WHEN l.close > l.ma60 THEN 6
      ELSE 0
    END AS ma_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c
    JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND l.close > l.open
    AND l.prev_20d_high IS NOT NULL
    AND l.volume > l.vol_ma20 * 1.5
    AND l.close > l.ma20
    AND l.amt_avg20 >= 30000000
)
SELECT
  code, name, price, change, industry_board,
  new_high_score, volume_score, yang_score, ma_score,
  (new_high_score + volume_score + yang_score + ma_score) AS total_score,
  vol_ratio, ma20, ma60, amt_avg20_yi,
  '量价齐升当日追入，止损前阳线低点' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 150
`,
  },

  // ─── 9. RSI超卖反弹 ──────────────────────────────────────────────────────────
  {
    id: "rsi_oversold",
    name: "RSI超卖反弹",
    category: "技术指标",
    description:
      "RSI指标跌至30以下超卖区域后企稳回升，结合价格在重要支撑位附近，是短期反弹的经典捕捉方式。",
    signals: [
      "RSI(14)由低于30回升至30以上（用MA近似）",
      "价格接近近期支撑位（MA20或MA60附近）",
      "成交量开始放大",
      "日线出现止跌信号（下影线长或阳线）",
    ],
    entryNote: "RSI从超卖区企稳后次日开盘买入，止损设最近低点。",
    riskNote: "超卖不一定见底，需配合基本面和支撑位判断。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, turnover, change_pct,
    -- 用近14日涨跌幅均值近似RSI强度（简化计算）
    AVG(CASE WHEN change_pct > 0 THEN change_pct ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) AS avg_gain_14,
    AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) AS avg_loss_14,
    AVG(CASE WHEN change_pct > 0 THEN change_pct ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND 1 PRECEDING) AS prev_avg_gain_14,
    AVG(CASE WHEN change_pct < 0 THEN ABS(change_pct) ELSE 0 END) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 13 PRECEDING AND 1 PRECEDING) AS prev_avg_loss_14,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    MIN(low) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS low_20d,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (
  SELECT *,
    CASE WHEN (avg_gain_14 + avg_loss_14) > 0
         THEN ROUND(100 - 100.0 / (1 + avg_gain_14 / (avg_loss_14 + 0.001)), 2)
         ELSE 50 END AS rsi14,
    CASE WHEN (prev_avg_gain_14 + prev_avg_loss_14) > 0
         THEN ROUND(100 - 100.0 / (1 + prev_avg_gain_14 / (prev_avg_loss_14 + 0.001)), 2)
         ELSE 50 END AS prev_rsi14
  FROM kline_data WHERE rn = 1
),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    l.rsi14,
    ROUND(l.ma20, 2) AS ma20,
    ROUND(l.ma60, 2) AS ma60,
    ROUND(l.amt_avg20 / 100000000.0, 2) AS amt_avg20_yi,
    -- RSI超卖回升评分（0-40）
    CASE
      WHEN l.prev_rsi14 < 25 AND l.rsi14 > l.prev_rsi14 THEN 40  -- 极度超卖回升
      WHEN l.prev_rsi14 < 30 AND l.rsi14 > l.prev_rsi14 THEN 32  -- 超卖回升
      WHEN l.prev_rsi14 < 35 AND l.rsi14 > l.prev_rsi14 THEN 22  -- 较低RSI回升
      WHEN l.rsi14 < 40 AND l.rsi14 > l.prev_rsi14 THEN 12
      ELSE 0
    END AS rsi_score,
    -- 支撑位评分（0-30）
    CASE
      WHEN l.close >= l.ma20 * 0.97 AND l.close <= l.ma20 * 1.03 THEN 30
      WHEN l.close >= l.ma60 * 0.97 AND l.close <= l.ma60 * 1.03 THEN 28
      WHEN l.close >= l.low_20d AND l.close <= l.low_20d * 1.05 THEN 22
      WHEN l.close > l.ma60 THEN 12
      ELSE 4
    END AS support_score,
    -- K线形态评分（0-20）：止跌信号
    CASE
      WHEN (l.low < l.open * 0.97 OR l.low < l.close * 0.97) AND l.close >= l.open THEN 20  -- 长下影线阳线
      WHEN l.close > l.open AND l.change_pct >= 2 THEN 16
      WHEN l.close > l.open THEN 10
      ELSE 3
    END AS candle_score,
    -- 量能评分（0-10）
    CASE
      WHEN l.volume > l.vol_ma20 * 1.3 THEN 10
      WHEN l.volume > l.vol_ma20 THEN 7
      ELSE 3
    END AS volume_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c
    JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND l.rsi14 IS NOT NULL
    AND l.prev_rsi14 < 35
    AND l.rsi14 > l.prev_rsi14
    AND l.amt_avg20 >= 30000000
)
SELECT
  code, name, price, change, industry_board,
  rsi_score, support_score, candle_score, volume_score,
  (rsi_score + support_score + candle_score + volume_score) AS total_score,
  rsi14, ma20, ma60, amt_avg20_yi,
  'RSI企稳后次日开盘买入，止损近期最低价' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 150
`,
  },

  // ─── 10. 北向资金流入 ────────────────────────────────────────────────────────
  {
    id: "fundamentals_growth",
    name: "基本面成长筛选",
    category: "基本面",
    description:
      "ROE持续高于15%、营收净利双增长、低负债率、低估值的高质量成长股，结合技术面处于均线支撑区域，是价值投资的核心选股方法。",
    signals: [
      "ROE > 15%（高盈利能力）",
      "营收同比增长 > 15%",
      "净利润同比增长 > 20%",
      "PE < 30 或 PB < 5",
      "价格在MA60支撑区域",
    ],
    entryNote: "季报/年报发布后确认业绩符合预期，在均线支撑位买入。",
    riskNote: "基本面数据有滞后性，需关注最新财报动态。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    ROUND(f.roe * 100, 2) AS roe_pct,
    ROUND(f.revenue_yoy * 100, 2) AS revenue_yoy_pct,
    ROUND(f.net_profit_yoy * 100, 2) AS net_profit_yoy_pct,
    ROUND(q.pe, 2) AS pe,
    ROUND(q.pb, 2) AS pb,
    ROUND(l.ma20, 2) AS ma20,
    ROUND(l.ma60, 2) AS ma60,
    ROUND(l.amt_avg20 / 100000000.0, 2) AS amt_avg20_yi,
    -- ROE评分（0-25）
    CASE
      WHEN f.roe >= 0.25 THEN 25
      WHEN f.roe >= 0.20 THEN 20
      WHEN f.roe >= 0.15 THEN 15
      WHEN f.roe >= 0.10 THEN 8
      ELSE 0
    END AS roe_score,
    -- 成长评分（0-30）：营收净利双增长（数据缺失时给部分分）
    CASE
      WHEN f.revenue_yoy >= 0.30 AND f.net_profit_yoy >= 0.30 THEN 30
      WHEN f.revenue_yoy >= 0.20 AND f.net_profit_yoy >= 0.25 THEN 24
      WHEN f.revenue_yoy >= 0.15 AND f.net_profit_yoy >= 0.20 THEN 18
      WHEN f.revenue_yoy >= 0.10 AND f.net_profit_yoy >= 0.15 THEN 10
      WHEN f.revenue_yoy IS NULL AND f.net_profit_yoy IS NULL THEN 8  -- 数据缺失给基础分
      WHEN f.revenue_yoy IS NULL OR f.net_profit_yoy IS NULL THEN 5
      ELSE 0
    END AS growth_score,
    -- 估值评分（0-25）：低估值加分
    CASE
      WHEN q.pe > 0 AND q.pe < 15 THEN 25
      WHEN q.pe > 0 AND q.pe < 20 THEN 20
      WHEN q.pe > 0 AND q.pe < 30 THEN 14
      WHEN q.pe > 0 AND q.pe < 50 THEN 7
      ELSE 3
    END AS valuation_score,
    -- 技术面评分（0-20）：均线支撑
    CASE
      WHEN l.close >= l.ma20 AND l.close <= l.ma20 * 1.05 THEN 20
      WHEN l.close >= l.ma60 AND l.close <= l.ma60 * 1.05 THEN 18
      WHEN l.close > l.ma60 THEN 10
      ELSE 2
    END AS tech_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  JOIN stock_fundamental f ON f.code = l.code
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c
    JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND f.roe >= 0.10
    AND l.amt_avg20 >= 30000000
)
SELECT
  code, name, price, change, industry_board,
  roe_score, growth_score, valuation_score, tech_score,
  (roe_score + growth_score + valuation_score + tech_score) AS total_score,
  roe_pct, revenue_yoy_pct, net_profit_yoy_pct, pe, pb, ma20, ma60, amt_avg20_yi,
  '均线支撑位+业绩确认后买入' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 150
`,
  },

  // ─── 11. 连续涨停后首阴 ────────────────────────────────────────────────────────
  {
    id: "limit_up_pullback",
    name: "涨停板后回踩",
    category: "事件驱动",
    description:
      "连续涨停后出现首根阴线缩量调整，是主力洗盘后继续上涨的经典形态。高换手率后的缩量调整是强势信号。",
    signals: [
      "近10日内出现≥2次涨停",
      "涨停后出现缩量阴线（换手率降低）",
      "股价仍在MA5上方",
      "日均成交量>5000万元",
    ],
    entryNote: "首阴缩量后次日放量阳线为买点，止损设首阴最低点。",
    riskNote: "追板风险较高，需严格止损；高位连板后需警惕高位出货。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, turnover, change_pct,
    -- 判断是否为涨停（区分板块）
    CASE WHEN (change_pct >= 9.9 AND code NOT LIKE '30%' AND code NOT LIKE '68%')
              OR (change_pct >= 19.9 AND (code LIKE '30%' OR code LIKE '68%'))
         THEN 1 ELSE 0 END AS is_limit_up,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
limit_up_count AS (
  SELECT code, COUNT(*) AS lu_count_10d
  FROM kline_data
  WHERE rn BETWEEN 2 AND 10 AND is_limit_up = 1
  GROUP BY code
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2) AS price,
    ROUND(q.change, 2) AS change,
    COALESCE(lc.lu_count_10d, 0) AS limit_up_10d,
    ROUND(l.ma5, 2) AS ma5,
    ROUND(l.ma20, 2) AS ma20,
    ROUND(l.amt_avg20 / 100000000.0, 2) AS amt_avg20_yi,
    -- 涨停次数评分（0-35）
    CASE
      WHEN COALESCE(lc.lu_count_10d, 0) >= 4 THEN 35
      WHEN COALESCE(lc.lu_count_10d, 0) >= 3 THEN 28
      WHEN COALESCE(lc.lu_count_10d, 0) >= 2 THEN 20
      ELSE 0
    END AS limit_up_score,
    -- 调整质量评分（0-30）：缩量阴线最优
    CASE
      WHEN l.close < l.open AND l.volume < l.vol_ma5 * 0.6 THEN 30  -- 强缩量阴线
      WHEN l.close < l.open AND l.volume < l.vol_ma5 * 0.8 THEN 22
      WHEN l.close < l.open AND l.volume < l.vol_ma20 THEN 14
      WHEN l.close < l.open THEN 8
      ELSE 3
    END AS pullback_score,
    -- 位置评分（0-25）：仍在均线上方
    CASE
      WHEN l.close > l.ma5 AND l.close > l.ma20 THEN 25
      WHEN l.close > l.ma5 THEN 18
      WHEN l.close > l.ma20 THEN 12
      ELSE 0
    END AS position_score,
    -- 涨停后调整幅度评分（0-10）
    CASE
      WHEN l.change_pct BETWEEN -3 AND -1 THEN 10  -- 温和调整
      WHEN l.change_pct BETWEEN -5 AND -0.5 THEN 7
      ELSE 2
    END AS adj_range_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN limit_up_count lc ON lc.code = l.code
  LEFT JOIN (
    SELECT c.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent c
    JOIN sw_industry si ON si.code = c.board_code AND si.level = '二级'
    GROUP BY c.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND COALESCE(lc.lu_count_10d, 0) >= 2
    AND l.close < l.open
    AND l.close > l.ma5
    AND l.amt_avg20 >= 30000000
)
SELECT
  code, name, price, change, industry_board,
  limit_up_score, pullback_score, position_score, adj_range_score,
  (limit_up_score + pullback_score + position_score + adj_range_score) AS total_score,
  limit_up_10d, ma5, ma20, amt_avg20_yi,
  '首阴次日放量阳线时追入，止损首阴低点' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 150
`,
  },

  // ─── 12. 连板龙头回调 ─────────────────────────────────────────────────────────
  {
    id: "consecutive_limit_pullback",
    name: "连板龙头回调",
    category: "事件驱动",
    description:
      "近5日内出现2连板或以上，今日出现温和回调（跌幅-1%~-5%），成交量萎缩，是主力洗盘后再度上攻前的蓄势形态。连板股回调首日往往是最佳介入点。",
    signals: [
      "近5日有2板或以上（连续涨停）",
      "今日温和回调-1%~-5%，非大阴线",
      "今日成交量 < 昨日成交量 × 0.8（缩量）",
      "股价仍维持在MA5上方",
    ],
    entryNote: "今日收盘价附近分批建仓，止损设连板前最低点，目标前高×1.1。",
    riskNote: "连板股高位风险大，严格控制仓位≤10%；若次日再度跌停需立即止损。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, turnover, change_pct,
    CASE
      WHEN (change_pct >= 9.9  AND code NOT LIKE '30%' AND code NOT LIKE '68%')
        OR (change_pct >= 19.9 AND (code LIKE '30%'  OR  code LIKE '68%'))
      THEN 1 ELSE 0
    END AS is_limit_up,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4  PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4  PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    LAG(volume) OVER (PARTITION BY code ORDER BY trade_date) AS prev_volume,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-200 days') FROM stock_kline WHERE period='daily')
),
consec_calc AS (
  SELECT
    code,
    SUM(is_limit_up) FILTER (WHERE rn BETWEEN 2 AND 6) AS lu_in_5d,
    MIN(CASE WHEN rn = 2 THEN is_limit_up END) AS yesterday_limit_up
  FROM kline_data
  GROUP BY code
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2)              AS price,
    ROUND(q.change, 2)             AS change,
    ROUND(l.ma5,  2)               AS ma5,
    ROUND(l.ma20, 2)               AS ma20,
    ROUND(l.amt_avg20 / 1e8, 2)   AS amt_avg20_yi,
    c.lu_in_5d,
    CASE
      WHEN c.lu_in_5d >= 4 THEN 40
      WHEN c.lu_in_5d >= 3 THEN 32
      WHEN c.lu_in_5d >= 2 THEN 22
      ELSE 0
    END AS limit_up_score,
    CASE
      WHEN l.change_pct BETWEEN -3 AND -1
           AND l.volume < COALESCE(l.prev_volume, l.vol_ma5) * 0.7 THEN 25
      WHEN l.change_pct BETWEEN -5 AND -0.5
           AND l.volume < COALESCE(l.prev_volume, l.vol_ma5) * 0.85 THEN 16
      WHEN l.change_pct BETWEEN -5 AND -0.5 THEN 8
      ELSE 0
    END AS pullback_score,
    CASE
      WHEN l.close > l.ma5 AND l.close > l.ma20 THEN 20
      WHEN l.close > l.ma5 THEN 12
      ELSE 0
    END AS pullback_pos_score,
    CASE WHEN c.yesterday_limit_up = 1 THEN 15 ELSE 5 END AS strength_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  JOIN consec_calc c ON c.code = l.code
  LEFT JOIN (
    SELECT cc.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent cc
    JOIN sw_industry si ON si.code = cc.board_code AND si.level = '二级'
    GROUP BY cc.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND c.lu_in_5d >= 2
    AND l.change_pct BETWEEN -5 AND -0.5
    AND l.close > l.ma5
    AND l.amt_avg20 >= 2e7
)
SELECT
  code, name, price, change, industry_board,
  limit_up_score, pullback_score, pullback_pos_score, strength_score,
  (limit_up_score + pullback_score + pullback_pos_score + strength_score) AS total_score,
  lu_in_5d, ma5, ma20, amt_avg20_yi,
  '今日回调低点附近分批介入，止损收盘跌破MA5' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 100
`,
  },

  // ─── 13. 大阳线启动 ──────────────────────────────────────────────────────────
  {
    id: "big_yang_breakout",
    name: "大阳线启动",
    category: "形态识别",
    description:
      "单日出现涨幅5%以上的大阳线，成交量是20日均量的1.5倍以上，突破近期盘整区间，是主力启动拉升的经典信号。次日回踩不破大阳线实体是最佳买点。",
    signals: [
      "今日大阳线涨幅 ≥ 5%（非首日涨停追板）",
      "今日成交量 ≥ 20日均量 × 1.5",
      "收盘价 > 20日内最高收盘价（创阶段新高）",
      "实体占K线振幅 > 60%（阳线实体饱满）",
    ],
    entryNote:
      "大阳线次日回踩但不跌破阳线开盘价为理想买点，快速突破追入止损大阳线实体50%处。",
    riskNote:
      "单日急涨后次日高开低走较常见，须等回踩确认；放量长上影线需谨慎。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, change_pct,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4  PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    MAX(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND 1 PRECEDING) AS high20_prev,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4  PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(close)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-300 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2)             AS price,
    ROUND(q.change, 2)            AS change,
    ROUND(l.ma5,  2)              AS ma5,
    ROUND(l.ma20, 2)              AS ma20,
    ROUND(l.ma60, 2)              AS ma60,
    ROUND(l.amt_avg20 / 1e8, 2)  AS amt_avg20_yi,
    CASE
      WHEN l.change_pct >= 8  AND l.volume >= l.vol_ma20 * 2.0 THEN 35
      WHEN l.change_pct >= 6  AND l.volume >= l.vol_ma20 * 1.8 THEN 28
      WHEN l.change_pct >= 5  AND l.volume >= l.vol_ma20 * 1.5 THEN 20
      WHEN l.change_pct >= 5  AND l.volume >= l.vol_ma20 * 1.2 THEN 12
      ELSE 0
    END AS yang_score,
    CASE
      WHEN l.close > COALESCE(l.high20_prev, 0) * 1.02 THEN 30
      WHEN l.close > COALESCE(l.high20_prev, 0)        THEN 20
      WHEN l.close > l.ma20 AND l.close > l.ma60        THEN 12
      ELSE 0
    END AS new_high_score,
    CASE
      WHEN (l.high - l.low) > 0
           AND CAST(l.close - l.open AS REAL) / (l.high - l.low) >= 0.7 THEN 20
      WHEN (l.high - l.low) > 0
           AND CAST(l.close - l.open AS REAL) / (l.high - l.low) >= 0.5 THEN 13
      ELSE 5
    END AS candle_score,
    CASE
      WHEN l.ma5 > l.ma20 AND l.ma20 > l.ma60 THEN 15
      WHEN l.ma5 > l.ma20 THEN 10
      ELSE 3
    END AS ma_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN (
    SELECT cc.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent cc
    JOIN sw_industry si ON si.code = cc.board_code AND si.level = '二级'
    GROUP BY cc.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND l.change_pct >= 5
    AND l.volume >= l.vol_ma20 * 1.5
    AND l.close > l.open
    AND l.amt_avg20 >= 2e7
)
SELECT
  code, name, price, change, industry_board,
  yang_score, new_high_score, candle_score, ma_score,
  (yang_score + new_high_score + candle_score + ma_score) AS total_score,
  ma5, ma20, ma60, amt_avg20_yi,
  '次日回踩不破阳线开盘价时低吸，止损阳线实体50%处' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 120
`,
  },

  // ─── 14. 平台整理突破 ────────────────────────────────────────────────────────
  {
    id: "consolidation_breakout",
    name: "平台整理突破",
    category: "突破策略",
    description:
      "股价经过5~15个交易日横盘整理（振幅<8%），成交量持续萎缩后今日放量突破整理区间上沿，是上涨趋势中的经典接力形态。",
    signals: [
      "近10日最高价/最低价振幅 < 8%（横盘整理）",
      "近5日成交量逐步萎缩（vol_ma5 < vol_ma20 × 0.85）",
      "今日放量突破：成交量 ≥ 5日均量 × 1.4",
      "今日收盘价 > 近10日最高价",
    ],
    entryNote:
      "突破当日尾盘或次日开盘价附近介入，止损整理区间下沿（近10日最低价）。",
    riskNote:
      "假突破风险：收盘须站稳10日高点，当日收盘后若跌回整理区间须离场。",
    sql: `
WITH kline_data AS (
  SELECT
    code, trade_date, close, open, high, low, volume, change_pct,
    AVG(volume)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4  PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(volume)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    MAX(high)    OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING) AS high10_prev,
    MIN(low)     OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING) AS low10_prev,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4  PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59 PRECEDING AND CURRENT ROW) AS ma60,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-300 days') FROM stock_kline WHERE period='daily')
),
latest AS (SELECT * FROM kline_data WHERE rn = 1),
scored AS (
  SELECT
    l.code,
    q.name,
    ROUND(q.price, 2)            AS price,
    ROUND(q.change, 2)           AS change,
    ROUND(l.ma5,  2)             AS ma5,
    ROUND(l.ma20, 2)             AS ma20,
    ROUND(l.ma60, 2)             AS ma60,
    ROUND(l.amt_avg20 / 1e8, 2) AS amt_avg20_yi,
    ROUND(l.high10_prev, 2)      AS consolidation_high,
    ROUND(l.low10_prev,  2)      AS consolidation_low,
    CASE
      WHEN l.high10_prev > 0
        AND (l.high10_prev - l.low10_prev) / l.high10_prev < 0.04 THEN 30
      WHEN l.high10_prev > 0
        AND (l.high10_prev - l.low10_prev) / l.high10_prev < 0.06 THEN 22
      WHEN l.high10_prev > 0
        AND (l.high10_prev - l.low10_prev) / l.high10_prev < 0.08 THEN 14
      ELSE 0
    END AS position_score,
    CASE
      WHEN l.vol_ma5 < l.vol_ma20 * 0.65 THEN 30
      WHEN l.vol_ma5 < l.vol_ma20 * 0.75 THEN 22
      WHEN l.vol_ma5 < l.vol_ma20 * 0.85 THEN 14
      ELSE 0
    END AS shrink_score,
    CASE
      WHEN l.volume >= l.vol_ma20 * 2.0 AND l.close > l.high10_prev THEN 25
      WHEN l.volume >= l.vol_ma20 * 1.6 AND l.close > l.high10_prev THEN 18
      WHEN l.volume >= l.vol_ma20 * 1.4 AND l.close > l.high10_prev THEN 12
      ELSE 0
    END AS breakout_score,
    CASE
      WHEN l.close > l.ma5 AND l.ma5 > l.ma20 AND l.ma20 > l.ma60 THEN 15
      WHEN l.close > l.ma5 AND l.ma5 > l.ma20 THEN 10
      WHEN l.close > l.ma20 THEN 5
      ELSE 0
    END AS ma_order_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest l
  JOIN stock_quote q ON q.code = l.code
  LEFT JOIN (
    SELECT cc.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent cc
    JOIN sw_industry si ON si.code = cc.board_code AND si.level = '二级'
    GROUP BY cc.stock_code
  ) sw ON sw.stock_code = l.code
  WHERE q.name NOT LIKE '%ST%'
    AND l.close > l.high10_prev
    AND l.volume >= l.vol_ma20 * 1.4
    AND l.vol_ma5 < l.vol_ma20 * 0.9
    AND l.amt_avg20 >= 2e7
    AND l.high10_prev IS NOT NULL
    AND (l.high10_prev - l.low10_prev) / NULLIF(l.high10_prev, 0) < 0.08
)
SELECT
  code, name, price, change, industry_board,
  position_score, shrink_score, breakout_score, ma_order_score,
  (position_score + shrink_score + breakout_score + ma_order_score) AS total_score,
  consolidation_high, consolidation_low, ma5, ma20, amt_avg20_yi,
  '突破当日尾盘追入或次日开盘，止损整理区间低点' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 120
`,
  },

  // ─── 15. KDJ金叉低位共振 ─────────────────────────────────────────────────────
  {
    id: "kdj_golden_cross",
    name: "KDJ金叉低位共振",
    category: "技术指标",
    description:
      "KDJ指标在超卖区（K值<40）出现金叉（K上穿D），同时MACD柱状图由负转正或持续放大，RSI从低位回升，多指标共振形成中线反弹信号，适合底部抄底操作。",
    signals: [
      "KDJ：K < 40 且 K > D（低位金叉）",
      "KDJ J值 > K值（J线反转向上）",
      "MACD: macd_hist 由负转正 或 histogram 持续放大",
      "RSI14 从低于40回升至40~60区间",
      "价格在MA20附近（±5%）",
    ],
    entryNote: "KDJ金叉确认后次日开盘轻仓介入（1~2成），止损K值再度跌破D值。",
    riskNote:
      "KDJ在下降趋势中频繁出现钝化，需结合均线方向；弱势市场不建议重仓。",
    sql: `
WITH ind_data AS (
  SELECT
    i.code, i.trade_date,
    i.kdj_k, i.kdj_d, i.kdj_j,
    i.macd_hist, i.rsi14,
    i.ma5, i.ma10, i.ma20, i.ma60,
    LAG(i.kdj_k)     OVER (PARTITION BY i.code ORDER BY i.trade_date) AS prev_k,
    LAG(i.kdj_d)     OVER (PARTITION BY i.code ORDER BY i.trade_date) AS prev_d,
    LAG(i.macd_hist) OVER (PARTITION BY i.code ORDER BY i.trade_date) AS prev_hist,
    ROW_NUMBER() OVER (PARTITION BY i.code ORDER BY i.trade_date DESC) AS rn
  FROM stock_indicator i
  WHERE i.period = 'daily'
    AND i.trade_date >= (SELECT date(MAX(trade_date), '-60 days') FROM stock_indicator WHERE period='daily')
),
latest_ind AS (SELECT * FROM ind_data WHERE rn = 1),
kline_latest AS (
  SELECT code, volume,
    AVG(volume)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    AVG(turnover) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS amt_avg20,
    ROW_NUMBER()  OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn2
  FROM stock_kline WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-60 days') FROM stock_kline WHERE period='daily')
),
scored AS (
  SELECT
    i.code,
    q.name,
    ROUND(q.price, 2)             AS price,
    ROUND(q.change, 2)            AS change,
    ROUND(i.kdj_k,  1)            AS kdj_k,
    ROUND(i.kdj_d,  1)            AS kdj_d,
    ROUND(i.kdj_j,  1)            AS kdj_j,
    ROUND(i.macd_hist, 4)         AS macd_hist,
    ROUND(i.prev_hist,  4)        AS prev_hist,
    ROUND(i.rsi14, 1)             AS rsi14,
    ROUND(i.ma20, 2)              AS ma20,
    ROUND(kl.amt_avg20 / 1e8, 2)  AS amt_avg20_yi,
    CASE
      WHEN i.kdj_k < 30 AND i.kdj_k > i.kdj_d AND i.prev_k <= i.prev_d THEN 35
      WHEN i.kdj_k < 40 AND i.kdj_k > i.kdj_d AND i.prev_k <= i.prev_d THEN 25
      WHEN i.kdj_k < 50 AND i.kdj_k > i.kdj_d AND i.prev_k <= i.prev_d THEN 15
      ELSE 0
    END AS rsi_score,
    CASE
      WHEN i.macd_hist > 0 AND i.prev_hist <= 0 THEN 30
      WHEN i.macd_hist > i.prev_hist AND i.macd_hist < 0 AND i.prev_hist < 0 THEN 20
      WHEN i.macd_hist > 0 THEN 10
      ELSE 0
    END AS macd_score,
    CASE
      WHEN i.rsi14 BETWEEN 35 AND 55 THEN 20
      WHEN i.rsi14 BETWEEN 25 AND 65 THEN 12
      ELSE 3
    END AS zero_axis_score,
    CASE
      WHEN q.price BETWEEN i.ma20 * 0.97 AND i.ma20 * 1.05 THEN 15
      WHEN q.price > i.ma20 THEN 10
      ELSE 3
    END AS bar_score,
    COALESCE(sw.industry_board, '未分类') AS industry_board
  FROM latest_ind i
  JOIN stock_quote q ON q.code = i.code
  JOIN kline_latest kl ON kl.code = i.code AND kl.rn2 = 1
  LEFT JOIN (
    SELECT cc.stock_code, GROUP_CONCAT(si.name, '/') AS industry_board
    FROM sw_industry_constituent cc
    JOIN sw_industry si ON si.code = cc.board_code AND si.level = '二级'
    GROUP BY cc.stock_code
  ) sw ON sw.stock_code = i.code
  WHERE q.name NOT LIKE '%ST%'
    AND i.kdj_k < 50
    AND i.kdj_k > i.kdj_d
    AND i.prev_k IS NOT NULL
    AND i.prev_k <= i.prev_d
    AND kl.amt_avg20 >= 2e7
)
SELECT
  code, name, price, change, industry_board,
  rsi_score, macd_score, zero_axis_score, bar_score,
  (rsi_score + macd_score + zero_axis_score + bar_score) AS total_score,
  kdj_k, kdj_d, kdj_j, macd_hist, rsi14, ma20, amt_avg20_yi,
  'KDJ金叉确认次日低吸，止损K再度跌破D值时' AS entry_point
FROM scored
ORDER BY total_score DESC
LIMIT 150
`,
  },
];

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function executeSqlAsync(
  sql: string,
): Promise<{ columns: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(
      os.tmpdir(),
      `screener_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`,
    );
    try {
      fs.writeFileSync(tmpFile, sql, "utf-8");
    } catch (e) {
      return reject(new Error(`写临时文件失败: ${e}`));
    }

    const cmd = `sqlite3 -csv -header ${JSON.stringify(DB_PATH)} < ${JSON.stringify(tmpFile)}`;
    exec(cmd, { encoding: "utf-8", timeout: 65000 }, (err, stdout, stderr) => {
      // 清理临时文件
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }

      if (err) {
        return reject(new Error(`sqlite3 error: ${stderr || err.message}`));
      }

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

      const lines = stdout.trim().split("\n").filter(Boolean);
      if (lines.length === 0) return resolve({ columns: [], rows: [] });
      const columns = parseCsvLine(lines[0]);
      const rows = lines.slice(1).map(parseCsvLine);
      resolve({ columns, rows });
    });
  });
}

// ─── API 路由 ─────────────────────────────────────────────────────────────────

// GET /api/agents/screener - 返回所有策略定义（不含SQL）
export async function GET() {
  const strategies = STRATEGIES.map(({ sql: _sql, ...rest }) => rest);
  return NextResponse.json({ strategies });
}

// POST /api/agents/screener - 执行指定策略的选股扫描，SSE流式返回
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    strategyId?: string;
    strategyIds?: string[];
  };
  const { strategyId, strategyIds } = body;

  const idsToRun = strategyIds ?? (strategyId ? [strategyId] : []);

  if (idsToRun.length === 0) {
    return NextResponse.json({ error: "请指定策略ID" }, { status: 400 });
  }

  const toRun = idsToRun
    .map((id) => STRATEGIES.find((s) => s.id === id))
    .filter(Boolean) as StrategyDef[];

  if (toRun.length === 0) {
    return NextResponse.json({ error: "策略不存在" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // ── 若有 buildSql 策略，先解析盘面报告 ──────────────────────────────────
      const hasDynamicStrategy = toRun.some((s) => !!s.buildSql);
      let reportCtx: ReportContext | null = null;
      if (hasDynamicStrategy) {
        try {
          reportCtx = parseMarketReport();
          if (reportCtx) {
            send({
              type: "report_context",
              sessionTitle: reportCtx.sessionTitle,
              reportDate: reportCtx.reportDate,
              hotBoards: reportCtx.hotBoards,
              leadingStocks: reportCtx.leadingStocks,
              topPickStocks: reportCtx.topPickStocks,
              outflowBoards: reportCtx.outflowBoards,
              hasReport: true,
            });
          } else {
            send({ type: "report_context", hasReport: false });
          }
        } catch {
          send({ type: "report_context", hasReport: false });
        }
      }

      // 并行执行所有策略（每批最多3个并发，避免过多DB连接）
      const CONCURRENCY = 3;
      for (let i = 0; i < toRun.length; i += CONCURRENCY) {
        const batch = toRun.slice(i, i + CONCURRENCY);

        // 通知开始
        batch.forEach((strategy) => {
          send({
            type: "strategy_start",
            strategyId: strategy.id,
            strategyName: strategy.name,
            message: `正在扫描策略：${strategy.name}...`,
          });
        });

        // 并行执行当前批次（真正异步并发）
        await Promise.all(
          batch.map(async (strategy) => {
            try {
              // 优先使用 buildSql 动态构建，否则用静态 sql
              const sql = strategy.buildSql
                ? strategy.buildSql(reportCtx)
                : strategy.sql;
              const result = await executeSqlAsync(sql);
              const colIdx = result.columns.reduce(
                (acc, c, i) => {
                  acc[c] = i;
                  return acc;
                },
                {} as Record<string, number>,
              );
              send({
                type: "strategy_result",
                strategyId: strategy.id,
                strategyName: strategy.name,
                columns: result.columns,
                rows: result.rows,
                total: result.rows.length,
                colIdx,
              });
            } catch (e) {
              send({
                type: "strategy_error",
                strategyId: strategy.id,
                strategyName: strategy.name,
                message: String(e),
              });
            }
          }),
        );
      }

      // ── 风控查询：高位连板 + 多周期下跌趋势 + 历史高位位置，用于前端减分 ──
      const RISK_SQL = `
WITH kline_base AS (
  SELECT
    code, trade_date, close, volume, change_pct,
    -- 均线体系（日K模拟多周期）
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4   PRECEDING AND CURRENT ROW) AS ma5,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19  PRECEDING AND CURRENT ROW) AS ma20,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS ma60,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 119 PRECEDING AND CURRENT ROW) AS ma120,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS ma250,
    -- 滞后均线（5日前，用于判断斜率/拐头）
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 24  PRECEDING AND 5 PRECEDING) AS ma20_5d_ago,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 64  PRECEDING AND 5 PRECEDING) AS ma60_5d_ago,
    AVG(close) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 124 PRECEDING AND 5 PRECEDING) AS ma120_5d_ago,
    -- 量能
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 4  PRECEDING AND CURRENT ROW) AS vol_ma5,
    AVG(volume) OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_ma20,
    -- 250日价格区间（最高/最低，用于计算历史位置百分位）
    MAX(high)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS high_250d,
    MIN(low)   OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) AS low_250d,
    -- 60日最高价（近期强阻力）
    MAX(high)  OVER (PARTITION BY code ORDER BY trade_date ROWS BETWEEN 59  PRECEDING AND CURRENT ROW) AS high_60d,
    -- 涨停判断
    CASE
      WHEN (code LIKE '30%' OR code LIKE '68%') AND change_pct >= 19.9 THEN 1
      WHEN code NOT LIKE '30%' AND code NOT LIKE '68%' AND change_pct >= 9.9 THEN 1
      ELSE 0
    END AS is_limit_up,
    ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
  FROM stock_kline
  WHERE period = 'daily'
    AND trade_date >= (SELECT date(MAX(trade_date), '-400 days') FROM stock_kline WHERE period='daily')
),
latest AS (
  SELECT * FROM kline_base WHERE rn = 1
),
recent30 AS (
  SELECT code, close, change_pct, is_limit_up, rn
  FROM kline_base WHERE rn <= 30
),
limit_stats AS (
  SELECT
    code,
    SUM(CASE WHEN rn <= 15 THEN is_limit_up ELSE 0 END) AS limit_up_15d,
    SUM(CASE WHEN rn <= 5  THEN is_limit_up ELSE 0 END) AS limit_up_5d,
    MAX(CASE WHEN rn = 1   THEN change_pct  ELSE NULL END) AS today_change
  FROM recent30
  GROUP BY code
),
price_range AS (
  SELECT code,
    MIN(close) AS low_20d,
    MAX(CASE WHEN rn = 1 THEN close ELSE NULL END) AS latest_close
  FROM (
    SELECT code, close,
      ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
    FROM stock_kline WHERE period='daily'
      AND trade_date >= (SELECT date(MAX(trade_date), '-60 days') FROM stock_kline WHERE period='daily')
  )
  GROUP BY code
)
SELECT
  l.code,
  -- 高位连板字段
  COALESCE(ls.limit_up_15d, 0) AS limit_up_15d,
  COALESCE(ls.limit_up_5d,  0) AS limit_up_5d,
  COALESCE(ls.today_change, 0) AS today_change,
  ROUND(CASE WHEN pr.low_20d > 0
    THEN (pr.latest_close - pr.low_20d) / pr.low_20d * 100
    ELSE 0 END, 1) AS rise_from_low_20d,
  -- 多周期空头排列计数（0~4）
  (CASE WHEN l.ma5  < l.ma20  THEN 1 ELSE 0 END +
   CASE WHEN l.ma20 < l.ma60  THEN 1 ELSE 0 END +
   CASE WHEN l.ma60 < l.ma120 THEN 1 ELSE 0 END +
   CASE WHEN l.ma120< l.ma250 THEN 1 ELSE 0 END) AS bearish_ma_count,
  -- 价格在均线下方计数（0~3）
  (CASE WHEN l.close < l.ma20  THEN 1 ELSE 0 END +
   CASE WHEN l.close < l.ma60  THEN 1 ELSE 0 END +
   CASE WHEN l.close < l.ma120 THEN 1 ELSE 0 END) AS price_below_ma_count,
  -- 均线斜率（是否拐头向上）
  CASE WHEN l.ma20  > l.ma20_5d_ago  THEN 1 ELSE 0 END AS ma20_turning_up,
  CASE WHEN l.ma60  > l.ma60_5d_ago  THEN 1 ELSE 0 END AS ma60_turning_up,
  CASE WHEN l.ma120 > l.ma120_5d_ago THEN 1 ELSE 0 END AS ma120_turning_up,
  -- 量能萎缩
  CASE WHEN l.vol_ma5 < l.vol_ma20 * 0.70 THEN 1 ELSE 0 END AS volume_shrinking,
  -- 价格距MA60偏离度
  ROUND(CASE WHEN l.ma60 > 0 THEN (l.close - l.ma60) / l.ma60 * 100 ELSE 0 END, 1) AS pct_vs_ma60,
  -- ── 历史高位风控 ──────────────────────────────────────────────────────
  -- 距250日最高价的偏离（负=低于高点，正=超过高点；越接近0越危险）
  ROUND(CASE WHEN l.high_250d > 0 THEN (l.close - l.high_250d) / l.high_250d * 100 ELSE 0 END, 1) AS pct_vs_250high,
  -- 距60日最高价的偏离
  ROUND(CASE WHEN l.high_60d > 0 THEN (l.close - l.high_60d) / l.high_60d * 100 ELSE 0 END, 1) AS pct_vs_60high,
  -- 价格在250日区间中的百分位（0=最低点，100=最高点；>80 = 高位区域）
  ROUND(CASE WHEN (l.high_250d - l.low_250d) > 0
    THEN (l.close - l.low_250d) / (l.high_250d - l.low_250d) * 100
    ELSE 50 END, 1) AS price_percentile_250d
FROM latest l
LEFT JOIN limit_stats ls ON ls.code = l.code
LEFT JOIN price_range pr ON pr.code = l.code
WHERE l.ma20 IS NOT NULL AND l.ma60 IS NOT NULL AND l.ma120 IS NOT NULL
`;
      try {
        const riskResult = await executeSqlAsync(RISK_SQL);
        const riskColIdx = riskResult.columns.reduce(
          (acc, c, i) => {
            acc[c] = i;
            return acc;
          },
          {} as Record<string, number>,
        );
        const riskMap: Record<
          string,
          {
            limit_up_15d: number;
            limit_up_5d: number;
            rise_from_low_20d: number;
            today_change: number;
            bearish_ma_count: number;
            price_below_ma_count: number;
            ma20_turning_up: number;
            ma60_turning_up: number;
            ma120_turning_up: number;
            volume_shrinking: number;
            pct_vs_ma60: number;
            pct_vs_250high: number;
            pct_vs_60high: number;
            price_percentile_250d: number;
          }
        > = {};
        for (const row of riskResult.rows) {
          const code = row[riskColIdx["code"]];
          riskMap[code] = {
            limit_up_15d: parseFloat(row[riskColIdx["limit_up_15d"]] ?? "0"),
            limit_up_5d: parseFloat(row[riskColIdx["limit_up_5d"]] ?? "0"),
            rise_from_low_20d: parseFloat(
              row[riskColIdx["rise_from_low_20d"]] ?? "0",
            ),
            today_change: parseFloat(row[riskColIdx["today_change"]] ?? "0"),
            bearish_ma_count: parseFloat(
              row[riskColIdx["bearish_ma_count"]] ?? "0",
            ),
            price_below_ma_count: parseFloat(
              row[riskColIdx["price_below_ma_count"]] ?? "0",
            ),
            ma20_turning_up: parseFloat(
              row[riskColIdx["ma20_turning_up"]] ?? "0",
            ),
            ma60_turning_up: parseFloat(
              row[riskColIdx["ma60_turning_up"]] ?? "0",
            ),
            ma120_turning_up: parseFloat(
              row[riskColIdx["ma120_turning_up"]] ?? "0",
            ),
            volume_shrinking: parseFloat(
              row[riskColIdx["volume_shrinking"]] ?? "0",
            ),
            pct_vs_ma60: parseFloat(row[riskColIdx["pct_vs_ma60"]] ?? "0"),
            pct_vs_250high: parseFloat(
              row[riskColIdx["pct_vs_250high"]] ?? "0",
            ),
            pct_vs_60high: parseFloat(row[riskColIdx["pct_vs_60high"]] ?? "0"),
            price_percentile_250d: parseFloat(
              row[riskColIdx["price_percentile_250d"]] ?? "50",
            ),
          };
        }
        send({ type: "risk_data", riskMap });
      } catch (e) {
        console.warn("风控查询失败:", e);
      }

      send({ type: "done" });
      controller.close();
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
