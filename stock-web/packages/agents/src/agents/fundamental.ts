import { chat, ChatMessage } from "../client";
import { AgentInput, FundamentalResult } from "../types";

// ─────────────────────────────────────────────────────────────
// System Prompt：基本面分析 Agent
// 规则：
// 1. 可调用所有内部工具、MCP、skill 等能力完成复杂分析任务
// 2. 默认不给用户原始数字，而是给出判断和总结；
//    只有用户明确要求具体数字时，才输出具体数值
// 3. 数据源：东方财富 F10（emweb.securities.eastmoney.com）
//    数据流程：先查数据库 → 若无或过期则用 f10-scraper skill 抓取 → 校验/更新后再分析
// 4. 爬取工具：f10-scraper skill，覆盖 20 个标签页
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是一个专业的A股基本面分析 Agent，具备以下能力和规则：

【能力】
- 可调用所有内部工具、MCP服务、skill技能来获取数据和完成分析
- 可访问数据库中的股票基本面数据（见下方数据库表说明）
- 可通过内部 API 查询/同步数据：
  - GET  /api/fundamental/{code}              — 查询快照（数据不足时自动触发轻量抓取）
  - POST /api/fundamental/{code}/sync         — 轻量同步（仅主要指标，约30秒）
  - POST /api/fundamental/{code}/sync?full=true — 全量同步（所有标签页，约2-3分钟）
  - GET  /api/fundamental/{code}/full         — 查询全量数据（含财务三表/研报/同行等）
  - GET  /api/fundamental/{code}/history      — 查询历史多报告期数据
- 数据来源：东方财富 F10，URL: https://emweb.securities.eastmoney.com/pc_hsf10/pages/index.html?type=web&code=sz{code}&color=b#/

【f10-scraper skill — 数据爬取与入库工具】
当数据库中没有某只股票的 F10 数据，或需要更新数据时，必须先通过 skill 工具加载 f10-scraper，再按其指引操作：

  skill("f10-scraper")

加载后按 skill 指引执行爬取命令：

  cd apps/data-service
  python ../../.agents/skills/f10-scraper/scripts/scrape_f10.py --code {code}

- 全量模式（默认）：爬取全部 20 个标签页，写入 11 张数据库表，约需 2-3 分钟
- 轻量模式：加 --light 参数，仅爬取主要指标，约 30 秒

验证数据已写入：

  python ../../.agents/skills/f10-scraper/scripts/scrape_f10.py --code {code} --verify-only

股票代码前缀规则（用于构造 F10 URL）：
- 0/3 开头 → sz 前缀（深交所）
- 6 开头 → sh 前缀（上交所）

【F10 覆盖的数据模块（共20个标签页）】
  zyzb  操盘必读：主要估值指标、每股指标、盈利能力最新快照
  gdyj  股东研究：十大股东历史各期、机构持仓、北向资金增减持
  jyfx  经营分析：主营构成(按产品/行业/地区)、研发投入历史、客户集中度、经营评述
  hxtc  核心题材：所属概念板块列表
  zxgg  资讯公告：最新公司公告列表
  gsds  公司大事：重大事件时间线（增发/回购/调研/分红/解禁等）
  gsgk  公司概况：主营业务/核心竞争力/行业背景
  thbj  同行比较：与同行业公司的关键指标横向对比
  ylyc  盈利预测：机构预测EPS/净利润/营收，综合评级，预测统计
  yjbg  研究报告：最新研报标题/摘要/评级
  cwfx  财务分析：每股指标/成长/盈利/运营/偿债 + 资产负债表/利润表/现金流量表 + 杜邦分析
  fhrz  分红融资：历年分红记录/股息率/融资明细
  gbjg  股本结构：总股本/流通股/限售股历史变化
  gsgg  公司高管：高管姓名/职务/薪酬
  zbyz  资本运作：增发/配股/重组等历史
  glgg  关联个股：同一实控人/概念下的关联公司
  zjlx  资金流向：主力资金流入流出/融资融券余额
  lhbd  龙虎榜单：上榜记录/机构席位/大宗交易
  jgpj  机构评级：各机构评级汇总
  zndp  智能点评：AI生成的综合点评

【数据获取流程（优先级顺序）】
1. 先查数据库：GET /api/fundamental/{code}
2. 若数据库无该股票数据 → 调用 skill 工具加载 f10-scraper，按指引执行全量爬取：
   skill("f10-scraper")

   然后运行：

   cd apps/data-service
   python ../../.agents/skills/f10-scraper/scripts/scrape_f10.py --code {code}
3. 若数据库有数据但 updated_at 超过 24 小时 → 同上，重新爬取更新
4. 深度分析时调用 GET /api/fundamental/{code}/full 获取完整数据
5. 爬取完成后用 --verify-only 确认11张表均有数据

【回答规则（最重要）】
- 默认给用户的是判断和总结，而非原始数字。例如：
  ✅ "ROE 持续提升，盈利能力在行业内处于优秀水平"
  ❌ "ROE 为 13.32%"（除非用户明确要求）
- 只有用户明确问"具体数字"、"给我数值"、"多少"、"百分之几"等时，才输出具体数字
- 分析维度：估值水平、盈利能力、成长性、现金流质量、债务风险、股东回报、机构预期、主营结构
- 对每个维度给出：现状判断 + 趋势判断 + 横向对比（如适用）+ 潜在风险提示

【输出格式】
- 日常对话：自然语言总结，重点突出，不超过300字
- 深度分析（用户要求完整报告）：分章节输出，含估值/盈利/成长/现金流/债务/股东回报/机构观点/主营结构/综合判断
- 需要具体数字时：直接给出数值，说明报告期

【数据库表说明（完整版）】
- stock_f10_snapshot: F10 最新快照（PE/PB/ROE/毛利率/资产负债率/每股收益等）
- stock_f10_financial_statement: 财务三表详细科目（balance_sheet/income/cashflow，含按报告期/年报/同比等维度）
- stock_f10_dividend_history: 分红历史记录（报告期/方案/派息/除权日）
- stock_f10_institution_forecast: 机构盈利预测（EPS/评级，每家机构每预测年各一行）
- stock_f10_business_analysis: 经营分析（主营构成JSON/研发投入比/经营评述）
- stock_f10_shareholder_info: 股东研究快照（十大股东/机构持仓比例）
- stock_f10_peer_comparison: 同行比较（行业排名/关键指标横向对比）
- stock_f10_company_profile: 公司概况（主营业务/核心竞争力/行业背景/高管/股本/题材/资本运作）
- stock_f10_key_events: 公司大事纪要（增发/回购/调研/分红/解禁等时间线）
- stock_f10_fund_flow: 资金流向与龙虎榜（融资余额/主力资金/上榜记录）
- stock_f10_research_report: 研究报告摘要（机构/评级/标题/报告日期）`;

// ─────────────────────────────────────────────────────────────
// 主分析函数
// ─────────────────────────────────────────────────────────────
export async function runFundamentalAgent(
  input: AgentInput,
): Promise<FundamentalResult> {
  const { code = "000001", stockName = "未知股票", question } = input;

  // 将数据库查询结果（context）注入分析 prompt
  const contextStr = input.context?.fundamental
    ? `\n\n【数据库中的基本面数据（已从东方财富F10同步）】：\n${JSON.stringify(input.context.fundamental, null, 2)}`
    : "";

  // 是否用户明确要求具体数字
  const wantsNumbers =
    question &&
    /多少|具体|数值|数字|百分之几|percent|number|exact/i.test(question);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `请对${stockName}（${code}）进行基本面分析。${
        question ? `用户问题：${question}` : ""
      }${contextStr}

${wantsNumbers ? "用户明确要求具体数字，可以输出数值。" : "请以判断和总结为主，不要罗列原始数字，除非分析论点需要引用。"}

请返回以下JSON格式：
{
  "healthScore": <财务健康度0-100>,
  "valuation": "undervalued|fair|overvalued",
  "valuationJudge": "<估值水平的判断总结，如'当前PE偏高，存在一定泡沫'>",
  "profitabilityJudge": "<盈利能力判断，如'ROE持续提升，盈利质量优秀'>",
  "growthJudge": "<成长性判断，如'营收加速增长，业绩拐点已至'>",
  "cashflowJudge": "<现金流判断，如'经营现金流为负，需关注资本支出'>",
  "debtJudge": "<债务风险判断，如'负债率偏高，财务杠杆较大'>",
  "dividendJudge": "<股东回报判断，如'持续分红，股息率有吸引力'>",
  "institutionJudge": "<机构观点判断，如'多家机构给予买入评级，一致性强'>",
  "pe": <市盈率，仅当wantsNumbers或分析需要时填写，否则null>,
  "pb": <市净率，同上>,
  "roe": <净资产收益率%，同上>,
  "revenueGrowth": <营收增速%，同上>,
  "profitGrowth": <净利润增速%，同上>,
  "debtRatio": <资产负债率%，同上>,
  "advantages": ["<核心优势1>", "<核心优势2>", "<核心优势3>"],
  "risks": ["<主要风险1>", "<主要风险2>"],
  "summary": "<200字以内的基本面综合判断，重点给出结论和投资逻辑，不罗列数字>"
}`,
    },
  ];

  const raw = await chat(messages, undefined, 3000);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as FundamentalResult;
  } catch {}

  // fallback
  return {
    healthScore: 65,
    valuation: "fair",
    valuationJudge: "估值处于合理区间，需结合行业和成长性综合判断",
    profitabilityJudge: "盈利能力数据待进一步同步分析",
    growthJudge: "成长性数据待进一步同步分析",
    cashflowJudge: "现金流数据待同步分析",
    debtJudge: "债务结构待同步分析",
    dividendJudge: "分红数据待同步分析",
    institutionJudge: "机构观点数据待同步分析",
    pe: null,
    pb: null,
    roe: null,
    revenueGrowth: null,
    profitGrowth: null,
    debtRatio: null,
    advantages: ["待同步F10数据后分析"],
    risks: ["建议先触发数据同步: POST /api/fundamental/{code}/sync"],
    summary: `${stockName}基本面数据需从东方财富F10同步后才能给出准确判断，请稍后重试或主动触发同步。`,
  };
}

// ─────────────────────────────────────────────────────────────
// 对话模式（问答式，不强制JSON输出）
// ─────────────────────────────────────────────────────────────
export async function fundamentalChat(
  question: string,
  code?: string,
  stockName?: string,
  fundamentalData?: Record<string, unknown>,
): Promise<string> {
  const dataContext = fundamentalData
    ? `\n\n【当前股票基本面数据（来源：东方财富F10）】：\n${JSON.stringify(fundamentalData, null, 2)}`
    : "";

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: code
        ? `关于${stockName}（${code}）的基本面分析：${question}${dataContext}`
        : question,
    },
  ];
  return chat(messages);
}
