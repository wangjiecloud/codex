# 股策 AI - 项目文档

## 项目目标

基于 OpenAI Codex multi-agent 架构思想，构建 A 股智能分析平台。
本项目借鉴 Codex 的 `spawn_agent` + `wait_agent` + `send_message` 模式，
实现多 Agent 并行协作、subagent 独立调用、Orchestrator 主控的完整 agent team 机制。

## 技术栈

| 层次       | 技术                             |
| ---------- | -------------------------------- |
| 前端框架   | Next.js 14 (App Router)          |
| UI 样式    | Tailwind CSS                     |
| K线图      | lightweight-charts (TradingView) |
| 产业图谱   | @xyflow/react (React Flow)       |
| 状态管理   | Zustand                          |
| Agent 驱动 | OpenAI SDK (via Midea proxy)     |
| 数据服务   | Python FastAPI + AKShare         |
| 实时推送   | Server-Sent Events (SSE)         |

## Agent Team 架构

```
用户触发分析
    │
    ▼
Orchestrator (主控 Advisor Agent)
    │
    ├── 并行 spawn:
    │   ├── DataCollector Agent  → 抓取行情/K线/财报/新闻原始数据
    │   ├── Technical Agent      → MA/MACD/RSI/KDJ/布林带分析
    │   ├── Fundamental Agent    → PE/ROE/营收/利润/现金流分析
    │   └── NewsSentiment Agent  → 近期新闻情感分析
    │
    └── 顺序执行 (依赖上面结果):
        ├── Risk Agent           → 综合风险打分
        └── Advisor Agent        → 汇总输出投资建议
```

每个 Agent：

- 支持被 Orchestrator 调度（team 模式）
- 支持独立调用（通过 `/api/agents/{name}` 接口）
- 支持流式输出（SSE 推送中间状态到前端）

## 模型配置

- Proxy URL: `https://apiprod.midea.com/llm/f-devops-python-litellm/v1`
- 默认模型: `claude-sonnet-4.6`
- 认证: Bearer token + user header
- 配置文件: `~/.config/opencode/llm-config.json`

## 页面结构

| 路由               | 页面        | 说明                          |
| ------------------ | ----------- | ----------------------------- |
| `/stock/search`    | 选股页      | 搜索框 + 热门股票 + 最近分析  |
| `/industry`        | 产业列表    | PCB/MLCC 等产业，支持增删改   |
| `/industry/[name]` | 产业画布    | 上下游关系图谱 + A股列表      |
| `/stock/[code]`    | 个股详情    | K线 + 盘口 + 副图 + AI分析Tab |
| `/agents`          | Agent工具箱 | 6个Agent独立对话入口          |

## API 接口

### 数据接口（代理到 Python 数据服务）

- `GET /api/stock/quote/[code]` - 实时行情
- `GET /api/stock/kline/[code]` - K线数据
- `GET /api/stock/search` - 股票搜索
- `GET /api/stock/news/[code]` - 新闻资讯

### Agent 接口

- `POST /api/agents/team` - 触发完整 Team 分析
- `POST /api/agents/technical` - 技术分析 Agent
- `POST /api/agents/fundamental` - 基本面 Agent
- `POST /api/agents/news` - 新闻舆情 Agent
- `POST /api/agents/advisor` - 投资建议 Agent
- `POST /api/agents/data` - 数据采集 Agent
- `GET /api/agents/stream/[taskId]` - SSE 流式推送

## 股票入库规则（向 stock_meta 写入新股票时必须遵守）

向 `stock_meta` 表新增 A 股股票时，`market` 字段**必须写 `"A股"`**，不得写 `"SH"`、`"SZ"` 或其他值。

原因：`_get_a_shares()` 函数（`routers/industry.py:39`）用 `WHERE market = 'A股'` 过滤，写错会导致该股票被所有同步任务（quotes/klines/fundamental）完全跳过，永远没有行情数据。

判断规则：

- 代码以 `0`、`3` 开头（深交所主板/创业板）→ market = `"A股"`
- 代码以 `6` 开头（上交所，含 600/601/603/605/688 等所有前缀）→ market = `"A股"`
- 海外股票（如 NVDA、AAPL）→ market = `"US"` 等，不受此约束

验证：写入后执行 `SELECT code, name, market FROM stock_meta WHERE code = '<code>'` 确认 market 值正确。

## 迭代记录

### v0.1.0 - 2026-06-21

**初始版本，完成基础架构**

- [x] 初始化 Next.js + Tailwind 项目结构
- [x] 实现左侧导航（选股/产业分析/个股/Agent工具箱）
- [x] 菜单一：选股页（搜索 + 热门股票 + 最近分析）
- [x] 菜单二：产业列表页（PCB/MLCC，支持增删改）
- [x] 菜单二：产业画布页（React Flow 上下游关系图谱）
- [x] 菜单三：个股详情页（K线图 + 盘口 + MACD/KDJ/VOL 副图 + AI分析Tab）
- [x] 菜单四：Agent工具箱页（6个Agent卡片 + 独立对话界面）
- [x] Agent client 配置（Midea proxy + Bearer auth）
- [x] 6个 Agent 实现（DataCollector/Technical/Fundamental/News/Risk/Advisor）
- [x] Orchestrator team 调度器
- [x] 所有 API routes（含 SSE 流式推送）
- [x] Python FastAPI 数据服务（AKShare 行情/K线/财报/新闻）

**待下一版本**

- [ ] 真实 AKShare 数据对接（当前使用 mock 数据）
- [ ] 自选股持久化（localStorage / 后端存储）
- [ ] 产业画布数据 AI 自动生成
- [ ] Agent 分析结果持久化缓存
- [ ] 移动端响应式适配
