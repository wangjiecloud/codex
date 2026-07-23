# Agent 架构分析

> 分析范围：`stock-web` 项目 + `codex-rs` 底层引擎
> 分析日期：2026-07-11

---

## 一、AGENTS.md 层级关系

Codex 运行时会从 CWD 向上找到 project root（`.git` 标记），然后**从根向下**收集所有 `AGENTS.md`，按路径顺序拼接后注入上下文（每段以 `--- project-doc ---` 分隔）。

```
~/.agents/AGENTS.md                              ← 全局层（最低优先级）
│  · 不生成 markdown（用户明确要求除外）
│  · 不生成总结类文档
│  · 永远用中文回复
│
├── /codex/AGENTS.md                             ← codex-rs Rust 项目开发规范
│   · crate 命名（codex- 前缀）
│   · clippy lint / format 规范
│   · 测试规范（集成测试优先）
│   · app-server API 规范（v2 优先/camelCase）
│
├── /codex/.agents/AGENTS.md                     ← stock-web 业务规则（与下方相同）
│
├── /codex/stock-web/AGENTS.md                   ← 主业务规则（最高优先级）
│   · 规则 0：数据库保护（禁 DROP/DELETE/TRUNCATE）
│   · 规则 1：F10 数据爬取必须用 f10-scraper skill
│   · 规则 2：新增产业必须补全 8 张表 + 前端常量
│   · 规则 3：产业链节点设计规范（layer/坐标/字段）
│   · 规则 4：已有 14 个产业 ID（sort_order 0~13）
│   · 规则 6：A 股判断规则（0/3/6 开头）
│   · 规则 7：新增节点必须同步 7 项数据
│   · 规则 9：codex-rs 编译规则（cargo clean 先行）
│
├── /codex/stock-web/.agents/AGENTS.md           ← 内容同上（副本）
│
├── /codex/stock-web/apps/web/AGENTS.md          ← Next.js 子应用层
│   · 警告：带 breaking changes 的新版 Next.js，先读文档
│
└── /codex/codex-rs/tui/src/bottom_pane/AGENTS.md  ← TUI 组件层
    · bottom_pane 状态机文档同步规范
```

---

## 二、stock-web 自定义 Agent 与 Skill

### 2.1 Agent 定义

**文件：** `.agents/agents/stock-analyzer.md`

```yaml
model: claude-sonnet-4
description: 分析股票基本面数据，爬取 F10 数据，执行数据库查询和数据同步任务
mode: all # 可被用户直接调用，也可被 Orchestrator spawn
color: "#2E86C1"
permission:
  "*": allow
  bash:
    "rm -rf / *": deny
    "rm -rf ~ *": deny
    "DROP DATABASE*": deny
    "TRUNCATE*": deny
```

**核心能力：** F10 数据爬取入库 → SQLite 查询 → 产业链数据同步 → 基本面分析报告

### 2.2 Skill 定义

**文件：** `.agents/skills/f10-scraper/SKILL.md`

- **触发场景：** 分析基本面、同步 F10、查询表无数据需填充
- **爬取脚本：** `scripts/scrape_f10.py --code <股票代码>`
- **覆盖 11 张表：** stock_f10_snapshot / financial_statement / dividend_history / institution_forecast / business_analysis / shareholder_info / peer_comparison / company_profile / key_events / fund_flow / research_report
- **验证：** 执行后必须用 `--verify-only` 参数确认写入

---

## 三、全局 Agent 基础设施（~/.agents/）

```
~/.agents/
├── AGENTS.md              ← 全局规则
├── mcp.json               ← MCP 服务器配置
│   └── search_url         → 美的内网搜索 MCP（streamable_http）
├── skills.json            ← 全局 skill 开关（禁用了 36 个非必要 skill）
├── skills/                ← 用户安装的 skill（30+ 个）
│   ├── playwright-cli/
│   ├── f10-scraper/       ← 与项目内同一份
│   ├── webapp-testing/
│   ├── frontend-design/
│   └── ...
└── .cache/builtins/       ← 内置 skill（平台提供）
    ├── ws-agent-creator/  → 创建普通 agent .md
    ├── ws-team-creator/   → 创建 Orchestrator agent
    ├── ws-skill-creator/  → 创建 workspace skill
    ├── skill-creator/     → 创建/评测 skill（含 grader/comparator/analyzer 子 agent）
    ├── ws-command-creator/→ 创建 slash commands
    ├── ws-mcp-creator/    → 创建 MCP 服务器
    ├── ws-rule-creator/   → 创建 AGENTS.md 规则
    ├── code-formatter/    → 代码格式化
    └── git-commit/        → git commit 工作流
```

---

## 四、stock-web 业务层 Agent 架构

### 4.1 Agent 调用流程

```
用户浏览器
    │
    ▼  HTTP 请求
Next.js API Routes (apps/web/app/api/agents/)
    │
    ├── /api/agents/[agentId]/route.ts  → 独立 agent 会话（1 进程 = 1 agent）
    ├── /api/agents/team/route.ts       → Orchestrator（单进程串行伪并行）
    └── /api/agents/codex/route.ts      → 通用股票分析助手
    │
    ▼  spawn child process
codex binary (codex-rs/target/debug/codex exec --json --sandbox workspace-write)
    │
    ▼  stdout JSONL 事件流
    │  thread.started / item.delta / item.completed / turn.completed
    ▼
lib/codexRunner.ts
    │  解析 [AGENT_START:xxx] / [AGENT_DONE:xxx] / [TEAM_DONE] 标记
    ▼
lib/taskStore.ts → SSE 推送
    │
    ▼
前端 AgentPanel.tsx（实时展示多 agent 协作状态）
```

### 4.2 五个业务 Agent（via system prompt 注入）

| Agent ID      | 标签     | 核心能力                                  |
| ------------- | -------- | ----------------------------------------- |
| `data`        | 数据采集 | SQLite 查询 stock_quote/kline/fundamental |
| `technical`   | 技术分析 | MA/MACD/RSI/KDJ/布林带计算                |
| `fundamental` | 基本面   | F10 爬取 + PE/PB/ROE/成长性分析           |
| `news`        | 新闻舆情 | stock_news 表查询 + 市场情绪判断          |
| `advisor`     | 投资建议 | 综合买卖方向/目标价/止损价/仓位/周期      |

> **注意：** 这 6 个 agent 并非独立进程，而是 Orchestrator 在单个 codex session 中串行执行，通过输出 `[AGENT_START:xxx]...[AGENT_DONE:xxx]` 标记模拟「多 agent 协作」的视觉效果。

### 4.3 数据持久化

```
agent_session 表     ← initSession() 建立 thread_id，后续 resume 保留上下文
agent_message 表     ← 每条消息（用户/assistant/agent）持久化到 SQLite
```

---

## 五、codex-rs 底层 Agent 引擎架构

### 5.1 Agent 相关 Crate 一览

```
codex-rs/
├── agent-graph-store/   → 存储 thread 父子拓扑（parent-child spawn 关系图）
│   └── AgentGraphStore trait
│       ├── upsert_thread_spawn_edge(parent, child, status)
│       ├── set_thread_spawn_edge_status(child, status)
│       ├── list_thread_spawn_children(parent, filter)     ← 直接子节点
│       └── list_thread_spawn_descendants(root, filter)    ← BFS 全部后代
│
├── agent-identity/      → Agent 身份认证（Ed25519 + JWT）
│   ├── generate_agent_key_material()   → Ed25519 密钥对（SHA-512 派生）
│   ├── register_agent_identity()       → POST openai auth 注册
│   ├── register_agent_task()           → 获取 task_id（可加密）
│   └── authorization_header_for_agent_task()  → AgentAssertion JWT 头
│
├── external-agent-sessions/   → 导入外部 agent 会话（Claude Code/Cursor 等）
├── external-agent-migration/  → 外部 agent 会话迁移工具
│
└── core/src/
    ├── agent/
    │   ├── mod.rs             → 导出 AgentControl/AgentStatus
    │   ├── agent_resolver.rs  → 解析 agent 目标路径
    │   ├── control.rs         → AgentControl（LiveAgent/ListedAgent 生命周期管理）
    │   │   ├── execution.rs   → AgentExecutionGuard
    │   │   ├── spawn.rs       → spawn 子 agent 逻辑
    │   │   └── residency.rs   → agent 驻留状态
    │   ├── registry.rs        → AgentRegistry（限制总 sub-agent 数量/随机 nickname）
    │   ├── role.rs            → apply_role_to_config（按 agent_type 叠加配置层）
    │   └── status.rs          → agent_status_from_event
    ├── agent_communication.rs → AgentCommunicationKind（Spawn/Message/Followup/Result）
    ├── agents_md.rs           → AGENTS.md 级联加载逻辑
    ├── agents_md_manager.rs   → AgentsMdManager（缓存加载结果）
    ├── context/
    │   └── subagent_notification.rs → SubagentNotification 注入上下文
    └── tools/handlers/
        ├── multi_agents.rs         → v1 multi-agent 工具
        └── multi_agents_v2/        → v2 multi-agent 工具（当前主版本）
            ├── spawn.rs            → spawn_agent
            ├── wait.rs             → wait（等待子 agent 完成）
            ├── send_message.rs     → send_message（父子 agent 通信）
            ├── list_agents.rs      → list_agents
            ├── interrupt_agent.rs  → interrupt_agent
            └── followup_task.rs    → followup_task
```

### 5.2 Session 来源分类（protocol 层）

```rust
pub enum SubAgentSource {
    Review,              // 代码 review 子 agent
    Compact,             // 上下文压缩子 agent
    MemoryConsolidation, // 记忆整合子 agent
    ThreadSpawn {        // 用户/工具 spawn 出的子 agent
        agent_nickname,
        agent_role,
        agent_path,
        parent_thread_id,
    },
}

pub enum MultiAgentVersion { V1, V2 }
```

### 5.3 AGENTS.md 加载机制（core/src/agents_md.rs）

```
1. 从 CWD 向上遍历 → 找到含 .git 的 project_root
2. 从 project_root 到 CWD → 收集路径上每层的 AGENTS.md
3. 所有文件内容顺序拼接（分隔符：\n\n--- project-doc ---\n\n）
4. 受 project_doc_max_bytes 配置大小限制，超出截断
5. 与 user_instructions（来自 ~/.agents/AGENTS.md）合并注入上下文
```

### 5.4 Skill 加载体系（codex-core-skills）

```rust
SkillsService          // 管理 skill 生命周期
SkillMetadata          // skill 元数据（name/description/trigger）
build_available_skills() // 构建可用 skill 列表，注入 system prompt
detect_implicit_skill_invocation_for_command() // 检测用户输入是否触发 skill
```

---

## 六、整体架构总图

```
┌─────────────────────────────────────────────────────────────────┐
│                        全局配置层                                │
│  ~/.agents/AGENTS.md  ~/.agents/mcp.json  ~/.agents/skills.json │
└───────────────────────────────┬─────────────────────────────────┘
                                │ 叠加注入
┌───────────────────────────────▼─────────────────────────────────┐
│                     Workspace 规则层                             │
│  /codex/AGENTS.md（Rust 规范）                                   │
│  /codex/.agents/AGENTS.md（stock-web 业务规则）                  │
│  /codex/stock-web/AGENTS.md（主规则，含 14 产业/数据库保护）      │
│  /codex/stock-web/apps/web/AGENTS.md（Next.js 版本警告）         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┴──────────────────────────┐
        │                                                   │
┌───────▼──────────────┐                    ┌──────────────▼────────────┐
│  stock-analyzer      │                    │  stock-web 业务层 Agent   │
│  (.agents/agents/)   │                    │  (Next.js API Routes)     │
│                      │                    │                           │
│  · F10 爬取入库      │                    │  /api/agents/[agentId]    │
│  · SQLite 查询       │    调用             │  · data / technical       │
│  · 产业链同步        │◄───────────────────│  · fundamental / news     │
│  · 基本面分析报告    │                    │  · advisor                │
└──────────┬───────────┘                    └──────────────┬────────────┘
           │ 调用 skill                                    │ spawn
┌──────────▼───────────┐                    ┌──────────────▼────────────┐
│  f10-scraper skill   │                    │  codex binary             │
│  (.agents/skills/)   │                    │  (codex-rs/target/debug/) │
│                      │                    │                           │
│  scrape_f10.py       │                    │  · agent-graph-store      │
│  11 张 F10 表        │                    │  · agent-identity         │
└──────────────────────┘                    │  · core/agent/（控制层）  │
                                            │  · multi_agents_v2/       │
                                            │  · agents_md.rs           │
                                            │  · core-skills/           │
                                            └───────────────────────────┘
```

---

## 七、关键发现与注意事项

| 问题                | 位置                                                               | 说明                                                                                       |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 权限配置缺陷        | `.agents/agents/stock-analyzer.md`                                 | `"*": allow` 放在最后，根据 last-match-wins 规则会覆盖前面的 deny 规则，导致 deny 实际失效 |
| 两份相同规则        | `/codex/.agents/AGENTS.md` 与 `/codex/stock-web/.agents/AGENTS.md` | 内容完全相同，维护时需同步两处                                                             |
| 伪并行 Orchestrator | `/api/agents/team/route.ts`                                        | 并非真正多进程并行，而是单 codex session 串行输出标记模拟多 agent 视觉效果                 |
| 无独立架构图文件    | 全项目                                                             | 未发现 `.mermaid`、`.drawio`、`.puml` 等独立图形文件，架构说明均内嵌在文本中               |
