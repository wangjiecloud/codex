"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Loader2,
  MessageSquare,
  RefreshCw,
  Zap,
  Cpu,
  ChevronDown,
  Plus,
  Trash2,
  PanelRightClose,
  PanelRightOpen,
  Clock,
  ImageIcon,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "@/components/agents/MarkdownMessage";
import { toPng } from "html-to-image";

const AGENTS = [
  {
    id: "data",
    label: "数据采集",
    emoji: "🗄️",
    description: "获取股票实时行情、K线、财务报告等原始数据，支持导出 JSON/CSV",
    color: "#60a5fa",
  },
  {
    id: "technical",
    label: "技术分析",
    emoji: "📊",
    description:
      "计算并解读 MA、MACD、RSI、KDJ、布林带等技术指标，判断趋势与买卖信号",
    color: "#f5a623",
  },
  {
    id: "fundamental",
    label: "基本面分析",
    emoji: "📈",
    description:
      "分析财务报表、PE/ROE/营收增速/现金流，评估公司内在价值与成长性",
    color: "#4ade80",
  },
  {
    id: "news",
    label: "新闻舆情",
    emoji: "📰",
    description:
      "抓取并分析近期相关新闻、公告、研报，进行情感分析和市场情绪判断",
    color: "#c084fc",
  },
  {
    id: "risk",
    label: "风险评估",
    emoji: "⚠️",
    description:
      "综合评估持仓风险、波动率、回撤、市场系统性风险，给出风险等级评分",
    color: "#f87171",
  },
  {
    id: "advisor",
    label: "投资建议",
    emoji: "💡",
    description: "汇总所有分析结果，给出综合买卖点建议、仓位建议和风险提示",
    color: "#fb923c",
  },
];

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  image?: string; // base64 dataURL（用户粘贴的图片）
}

interface Session {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
  sessionId?: string; // codex session ID
}

interface AgentState {
  sessions: Session[];
  activeSessionId: string;
  input: string;
  loading: boolean;
  pastedImage?: string; // 待发送的粘贴图片 base64 dataURL
}

function newSession(agentId: string, agent: (typeof AGENTS)[0]): Session {
  return {
    id: `${agentId}-${Date.now()}`,
    title: "新会话",
    createdAt: Date.now(),
    messages: [
      {
        role: "agent",
        content: `你好！我是 ${agent.label} Agent。${agent.description}。\n\n请输入股票代码或具体问题，我来为你分析。`,
      },
    ],
  };
}

const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH = 1200;
const DEFAULT_CHAT_WIDTH = 380;

/** 计算占可用宽度的一半作为初始聊天面板宽度 */
function calcHalfWidth() {
  // 左侧导航栏约 60px，分隔条 10px
  const available = window.innerWidth - 60 - 10;
  return Math.round(available / 2);
}

export default function AgentsPage() {
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>(
    () =>
      Object.fromEntries(
        AGENTS.map((a) => [
          a.id,
          {
            sessions: [],
            activeSessionId: "",
            input: "",
            loading: false,
          },
        ]),
      ),
  );

  const [modelInfo, setModelInfo] = useState<{
    model: string;
    models: { name: string; model: string }[];
  } | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [switchingModel, setSwitchingModel] = useState(false);
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const [chatVisible, setChatVisible] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_CHAT_WIDTH);

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setModelDropdownOpen(false);
      }
      if (
        historyRef.current &&
        !historyRef.current.contains(e.target as Node)
      ) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentStates]);

  useEffect(() => {
    fetch("/api/agents/config")
      .then((r) => r.json())
      .then(
        (d: {
          currentModel?: string;
          models?: { name: string; model: string }[];
        }) => {
          setModelInfo({
            model: d.currentModel ?? "unknown",
            models: d.models ?? [],
          });
        },
      )
      .catch(() => {});
  }, []);

  // 初始化时从数据库加载所有 agent 的会话记录
  useEffect(() => {
    Promise.all(
      AGENTS.map((agent) =>
        fetch(`/api/agents/sessions?agentId=${agent.id}`)
          .then((r) => r.json())
          .then(
            (d: {
              sessions?: {
                id: string;
                agentId: string;
                title: string;
                codexSid?: string;
                createdAt: number;
                updatedAt: number;
                messages: { role: "user" | "agent"; content: string }[];
              }[];
            }) => ({ agentId: agent.id, sessions: d.sessions ?? [] }),
          )
          .catch(() => ({ agentId: agent.id, sessions: [] })),
      ),
    ).then((results) => {
      setAgentStates((prev) => {
        const next = { ...prev };
        for (const { agentId, sessions } of results) {
          if (sessions.length > 0) {
            next[agentId] = {
              ...next[agentId],
              sessions,
              activeSessionId: sessions[0].id,
            };
          }
        }
        return next;
      });
      setDbLoaded(true);
      // 恢复上次激活的 agent（localStorage 记录），在 setAgentStates 之外调用确保同步生效
      try {
        const lastAgentId = localStorage.getItem("agent_last_active");
        if (lastAgentId && AGENTS.find((a) => a.id === lastAgentId)) {
          setActiveAgentId(lastAgentId);
          setChatVisible(true);
          setChatWidth(calcHalfWidth());
        }
      } catch {
        // ignore
      }
    });
  }, []);

  // DB 加载完成后，若恢复的 activeAgentId 没有会话则自动新建
  useEffect(() => {
    if (!dbLoaded || !activeAgentId) return;
    // 用 functional updater 读取最新 agentStates，避免 stale closure 导致
    // 误判 sessions 为空（与 setAgentStates 在同一批 render 时的问题）
    setAgentStates((prev) => {
      const state = prev[activeAgentId];
      if (state && state.sessions.length === 0) {
        const agent = AGENTS.find((a) => a.id === activeAgentId)!;
        const session = newSession(activeAgentId, agent);
        persistSession(activeAgentId, session);
        return {
          ...prev,
          [activeAgentId]: {
            ...prev[activeAgentId],
            sessions: [session],
            activeSessionId: session.id,
          },
        };
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoaded, activeAgentId]);

  // 拖拽分隔条逻辑
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartWidth.current = chatWidth;

      const onMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = dragStartX.current - ev.clientX;
        const newWidth = Math.max(
          MIN_CHAT_WIDTH,
          Math.min(MAX_CHAT_WIDTH, dragStartWidth.current + delta),
        );
        setChatWidth(newWidth);
      };
      const onUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [chatWidth],
  );

  const activeAgent = AGENTS.find((a) => a.id === activeAgentId);
  const activeAgentState = activeAgentId ? agentStates[activeAgentId] : null;
  const activeSession =
    activeAgentState?.sessions.find(
      (s) => s.id === activeAgentState.activeSessionId,
    ) ?? null;

  /** 持久化单个 session 到数据库（fire and forget） */
  const persistSession = useCallback((agentId: string, session: Session) => {
    fetch("/api/agents/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: session.id,
        agentId,
        title: session.title,
        codexSid: session.sessionId,
        createdAt: session.createdAt,
        updatedAt: Date.now(),
        messages: session.messages,
      }),
    }).catch(() => {});
  }, []);

  /** 从数据库删除 session */
  const removeSessionFromDb = useCallback((sessionId: string) => {
    fetch(`/api/agents/sessions?sessionId=${sessionId}`, {
      method: "DELETE",
    }).catch(() => {});
  }, []);

  const openAgent = (agentId: string) => {
    setActiveAgentId(agentId);
    setChatVisible(true);
    // 首次打开聊天面板时，默认各占一半
    if (!activeAgentId) {
      setChatWidth(calcHalfWidth());
    }
    // 持久化最后激活的 agent，刷新后恢复
    try {
      localStorage.setItem("agent_last_active", agentId);
    } catch {
      /* ignore */
    }
    // DB 未加载完时不新建，等 useEffect([dbLoaded, activeAgentId]) 统一处理
    if (!dbLoaded) return;
    setAgentStates((prev) => {
      const state = prev[agentId];
      // 已有会话，不新建
      if (state.sessions.length > 0) return prev;
      const agent = AGENTS.find((a) => a.id === agentId)!;
      const session = newSession(agentId, agent);
      persistSession(agentId, session);
      return {
        ...prev,
        [agentId]: {
          ...state,
          sessions: [session],
          activeSessionId: session.id,
        },
      };
    });
  };

  const addSession = (agentId: string) => {
    const agent = AGENTS.find((a) => a.id === agentId)!;
    const session = newSession(agentId, agent);
    setAgentStates((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        sessions: [session, ...prev[agentId].sessions],
        activeSessionId: session.id,
      },
    }));
    persistSession(agentId, session);
    setHistoryOpen(false);
  };

  const deleteSession = (agentId: string, sessionId: string) => {
    removeSessionFromDb(sessionId);
    setAgentStates((prev) => {
      const state = prev[agentId];
      const remaining = state.sessions.filter((s) => s.id !== sessionId);
      let activeId = state.activeSessionId;
      if (activeId === sessionId) {
        if (remaining.length > 0) {
          activeId = remaining[0].id;
        } else {
          // 创建新会话
          const agent = AGENTS.find((a) => a.id === agentId)!;
          const session = newSession(agentId, agent);
          persistSession(agentId, session);
          return {
            ...prev,
            [agentId]: {
              ...state,
              sessions: [session],
              activeSessionId: session.id,
            },
          };
        }
      }
      return {
        ...prev,
        [agentId]: { ...state, sessions: remaining, activeSessionId: activeId },
      };
    });
  };

  const switchSession = (agentId: string, sessionId: string) => {
    setAgentStates((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], activeSessionId: sessionId },
    }));
    setHistoryOpen(false);
  };

  const switchModel = async (model: string) => {
    if (!modelInfo || switchingModel) return;
    setSwitchingModel(true);
    setModelDropdownOpen(false);
    try {
      const res = await fetch("/api/agents/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (res.ok) {
        setModelInfo((prev) => (prev ? { ...prev, model } : prev));
        // 清空所有 session 的 codex sessionId（新模型生效）
        setAgentStates((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([k, v]) => [
              k,
              {
                ...v,
                sessions: v.sessions.map((s) => ({
                  ...s,
                  sessionId: undefined,
                })),
              },
            ]),
          ),
        );
      }
    } catch {
      /* ignore */
    } finally {
      setSwitchingModel(false);
    }
  };

  const sendMessage = async (agentId: string) => {
    const state = agentStates[agentId];
    if ((!state.input.trim() && !state.pastedImage) || state.loading) return;
    const session = state.sessions.find((s) => s.id === state.activeSessionId);
    if (!session) return;

    const userText = state.input;
    const pastedImage = state.pastedImage;
    const placeholderId = `placeholder-${Date.now()}`;
    const userMsg: ChatMessage = {
      role: "user",
      content: userText,
      ...(pastedImage ? { image: pastedImage } : {}),
    };
    const placeholderMsg: ChatMessage & { _id: string } = {
      role: "agent",
      content: "",
      _id: placeholderId,
    };

    // 更新标题（取用户第一条消息）
    const isFirstUserMsg =
      session.messages.filter((m) => m.role === "user").length === 0;
    const newTitle = isFirstUserMsg
      ? (userText || "图片分析").slice(0, 20)
      : session.title;

    setAgentStates((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        input: "",
        pastedImage: undefined,
        loading: true,
        sessions: prev[agentId].sessions.map((s) =>
          s.id === state.activeSessionId
            ? {
                ...s,
                title: newTitle,
                messages: [...s.messages, userMsg, placeholderMsg],
              }
            : s,
        ),
      },
    }));

    try {
      const questionText =
        pastedImage && !userText.trim()
          ? "用户发送了一张图片，请根据图片内容（如截图、K线图等）进行分析"
          : pastedImage
            ? `${userText}（附带图片）`
            : userText;

      const res = await fetch(`/api/agents/${agentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          sessionId: session.sessionId, // codex thread_id，用于 resume 上下文
        }),
      });
      const { taskId } = (await res.json()) as { taskId: string };

      const sse = new EventSource(`/api/agents/stream/${taskId}`);

      sse.onmessage = (event) => {
        const data = JSON.parse(event.data) as {
          type: string;
          delta?: string;
          text?: string;
          message?: string;
          sessionId?: string;
        };

        if (data.type === "session_id" && data.sessionId) {
          const sid = data.sessionId;
          setAgentStates((prev) => {
            const sessions = prev[agentId].sessions.map((s) => {
              if (s.id !== state.activeSessionId) return s;
              const updated = { ...s, sessionId: sid };
              persistSession(agentId, updated);
              return updated;
            });
            return { ...prev, [agentId]: { ...prev[agentId], sessions } };
          });
        } else if (data.type === "stream_delta" && data.delta) {
          // 流式追加 delta
          setAgentStates((prev) => ({
            ...prev,
            [agentId]: {
              ...prev[agentId],
              sessions: prev[agentId].sessions.map((s) =>
                s.id === state.activeSessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        (m as ChatMessage & { _id?: string })._id ===
                        placeholderId
                          ? { ...m, content: m.content + data.delta }
                          : m,
                      ),
                    }
                  : s,
              ),
            },
          }));
        } else if (data.type === "done" || data.type === "error") {
          setAgentStates((prev) => {
            const sessions = prev[agentId].sessions.map((s) => {
              if (s.id !== state.activeSessionId) return s;
              const msgs = s.messages.map((m) => {
                if ((m as ChatMessage & { _id?: string })._id !== placeholderId)
                  return m;
                const currentContent = m.content;
                const finalContent =
                  data.type === "error"
                    ? data.message || "请求出错，请检查服务是否正常"
                    : currentContent || "分析完成";
                return { ...m, content: finalContent };
              });
              // 持久化更新后的 session
              const updatedSession = { ...s, messages: msgs };
              persistSession(agentId, updatedSession);
              return updatedSession;
            });
            return {
              ...prev,
              [agentId]: { ...prev[agentId], loading: false, sessions },
            };
          });
          sse.close();
        }
      };
      sse.onerror = () => {
        setAgentStates((prev) => ({
          ...prev,
          [agentId]: {
            ...prev[agentId],
            loading: false,
            sessions: prev[agentId].sessions.map((s) =>
              s.id === state.activeSessionId
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      (m as ChatMessage & { _id?: string })._id ===
                      placeholderId
                        ? { ...m, content: "连接中断，请重试" }
                        : m,
                    ),
                  }
                : s,
            ),
          },
        }));
        sse.close();
      };
    } catch {
      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          loading: false,
          sessions: prev[agentId].sessions.map((s) =>
            s.id === state.activeSessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    (m as ChatMessage & { _id?: string })._id === placeholderId
                      ? { ...m, content: "请求出错，请检查服务是否正常" }
                      : m,
                  ),
                }
              : s,
          ),
        },
      }));
    }
  };

  const chatPanelVisible = !!(activeAgent && activeSession && chatVisible);

  return (
    <div className="flex overflow-hidden" style={{ height: "100vh" }}>
      {/* Left: Agent grid */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
              AI Agent 工具箱
            </h1>
            <p className="text-[var(--text-tertiary)] text-sm">
              选择一个 Agent 直接对话，或在个股详情页使用 Team 全量分析
            </p>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {AGENTS.map((agent) => {
              const isActive = activeAgentId === agent.id;
              const hasSessions = agentStates[agent.id].sessions.length > 0;
              return (
                <button
                  key={agent.id}
                  onClick={() => openAgent(agent.id)}
                  className={cn(
                    "p-5 rounded-xl text-left border transition-all group",
                    isActive
                      ? "border-[#f5a623]/50 bg-[#f5a623]/5"
                      : "border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[#f5a623]/30 hover:bg-[var(--bg-hover)]",
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                      style={{ background: `${agent.color}15` }}
                    >
                      {agent.emoji}
                    </div>
                    {hasSessions && (
                      <span className="w-2 h-2 bg-[#f5a623] rounded-full mt-1" />
                    )}
                  </div>
                  <div className="font-medium text-[var(--text-primary)] mb-1">
                    {agent.label}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                    {agent.description}
                  </p>
                  <div
                    className="mt-3 flex items-center gap-1.5 text-xs font-medium transition-colors"
                    style={{ color: isActive ? "#f5a623" : agent.color + "aa" }}
                  >
                    <MessageSquare size={12} />
                    {isActive ? "对话中" : "启动对话"}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Team shortcut */}
          <div className="mt-6 p-5 bg-[var(--bg-secondary)] border border-[#f5a623]/20 rounded-xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#f5a623]/10 flex items-center justify-center shrink-0">
                <Zap size={20} className="text-[#f5a623]" />
              </div>
              <div>
                <div className="text-[var(--text-primary)] font-medium mb-1">
                  Team 协同分析
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                  以上所有 Agent 将并行运行，由 Orchestrator
                  主控调度，聚合所有子 Agent
                  的输出，给出综合分析报告。请前往个股详情页的「AI分析」Tab
                  使用全量分析功能。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 拖拽分隔条 + 收起按钮 */}
      {activeAgent && activeSession && (
        <div
          className="relative flex items-center shrink-0"
          style={{ width: 10 }}
        >
          {/* 拖拽区 */}
          <div
            onMouseDown={onDragStart}
            className="absolute inset-0 cursor-col-resize group flex items-center justify-center"
          >
            <div className="w-[3px] h-12 rounded-full bg-[var(--border-color)] group-hover:bg-[#f5a623]/60 transition-colors" />
          </div>
          {/* 收起/展开按钮 */}
          <button
            onClick={() => setChatVisible((v) => !v)}
            className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-color)] flex items-center justify-center hover:border-[#f5a623]/50 hover:text-[#f5a623] text-[var(--text-tertiary)] transition-all z-10 shadow-sm"
            title={chatVisible ? "隐藏面板" : "展开面板"}
          >
            {chatVisible ? (
              <PanelRightClose size={12} />
            ) : (
              <PanelRightOpen size={12} />
            )}
          </button>
        </div>
      )}

      {/* Right: Chat panel */}
      {activeAgent && activeSession && chatVisible && (
        <div
          className="border-l border-[var(--border-color)] bg-[var(--bg-deep)] flex flex-col shrink-0 h-full"
          style={{ width: chatWidth }}
        >
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg shrink-0">{activeAgent.emoji}</span>
              <div className="min-w-0">
                <div className="text-[var(--text-primary)] text-sm font-medium truncate">
                  {activeAgent.label} Agent
                </div>
                <div className="text-[var(--text-tertiary)] text-[10px]">
                  独立对话模式
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* 模型选择下拉 */}
              {modelInfo && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setModelDropdownOpen((v) => !v)}
                    disabled={switchingModel}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-color)] hover:border-[#f5a623]/50 transition-all disabled:opacity-60"
                    title="点击切换模型"
                  >
                    <Cpu size={10} className="text-[#f5a623] shrink-0" />
                    <span className="text-[10px] text-[var(--text-tertiary)] font-mono max-w-[90px] truncate">
                      {switchingModel ? "切换中…" : modelInfo.model}
                    </span>
                    <ChevronDown
                      size={10}
                      className={cn(
                        "text-[var(--text-tertiary)] transition-transform shrink-0",
                        modelDropdownOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {modelDropdownOpen && modelInfo.models.length > 0 && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                      {modelInfo.models.map((m) => (
                        <button
                          key={m.model}
                          onClick={() => switchModel(m.model)}
                          className={cn(
                            "w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2",
                            m.model === modelInfo.model
                              ? "bg-[#f5a623]/10 text-[#f5a623]"
                              : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
                          )}
                        >
                          <span className="font-medium truncate">{m.name}</span>
                          <span className="font-mono text-[9px] text-[var(--text-tertiary)] shrink-0 truncate max-w-[80px]">
                            {m.model}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 历史会话 */}
              <div className="relative" ref={historyRef}>
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--bg-tertiary)] transition-all"
                  title="历史会话"
                >
                  <Clock size={13} />
                </button>
                {historyOpen && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]">
                      <span className="text-xs font-medium text-[var(--text-primary)]">
                        历史会话
                      </span>
                      <button
                        onClick={() => addSession(activeAgent.id)}
                        className="flex items-center gap-1 text-[10px] text-[#f5a623] hover:text-[#e8961a] transition-colors"
                      >
                        <Plus size={11} />
                        新建
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                      {agentStates[activeAgent.id].sessions.map((s) => (
                        <div
                          key={s.id}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 group cursor-pointer transition-colors",
                            s.id === agentStates[activeAgent.id].activeSessionId
                              ? "bg-[#f5a623]/10"
                              : "hover:bg-[var(--bg-hover)]",
                          )}
                          onClick={() => switchSession(activeAgent.id, s.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div
                              className={cn(
                                "text-xs truncate",
                                s.id ===
                                  agentStates[activeAgent.id].activeSessionId
                                  ? "text-[#f5a623] font-medium"
                                  : "text-[var(--text-secondary)]",
                              )}
                            >
                              {s.title}
                            </div>
                            <div className="text-[9px] text-[var(--text-tertiary)] mt-0.5">
                              {new Date(s.createdAt).toLocaleString("zh-CN", {
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              ·{" "}
                              {
                                s.messages.filter((m) => m.role === "user")
                                  .length
                              }{" "}
                              条消息
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(activeAgent.id, s.id);
                            }}
                            className="ml-2 p-1 rounded opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0"
                            title="删除会话"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 新建会话 */}
              <button
                onClick={() => addSession(activeAgent.id)}
                className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--bg-tertiary)] transition-all"
                title="新建会话"
              >
                <Plus size={13} />
              </button>

              {/* 关闭面板 */}
              <button
                onClick={() => setActiveAgentId(null)}
                className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--bg-tertiary)] transition-all text-sm leading-none"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
            {activeSession.messages.map((msg, i) => (
              <AgentMessage key={i} msg={msg} activeAgent={activeAgent} />
            ))}
            {activeAgentState?.loading && (
              <div className="flex justify-start">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 mr-2"
                  style={{ background: `${activeAgent.color}20` }}
                >
                  {activeAgent.emoji}
                </div>
                <div className="bg-[var(--bg-tertiary)] rounded-xl px-4 py-2.5">
                  <Loader2 size={14} className="text-[#f5a623] animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[var(--border-color)] shrink-0">
            {/* 图片预览 */}
            {activeAgentState?.pastedImage && (
              <div className="mb-2 flex items-start gap-2">
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeAgentState.pastedImage}
                    alt="待发送图片"
                    className="max-h-32 max-w-full rounded-lg border border-[var(--border-color)] object-contain"
                  />
                  <button
                    onClick={() =>
                      setAgentStates((prev) => ({
                        ...prev,
                        [activeAgentId!]: {
                          ...prev[activeAgentId!],
                          pastedImage: undefined,
                        },
                      }))
                    }
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-400 text-xs leading-none"
                    title="移除图片"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                value={activeAgentState?.input ?? ""}
                onChange={(e) => {
                  setAgentStates((prev) => ({
                    ...prev,
                    [activeAgentId!]: {
                      ...prev[activeAgentId!],
                      input: e.target.value,
                    },
                  }));
                  // 自适应高度
                  e.target.style.height = "auto";
                  e.target.style.height =
                    Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onPaste={(e) => {
                  const items = Array.from(e.clipboardData.items);
                  const imageItem = items.find((item) =>
                    item.type.startsWith("image/"),
                  );
                  if (!imageItem) return;
                  e.preventDefault();
                  const file = imageItem.getAsFile();
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const dataUrl = ev.target?.result as string;
                    if (dataUrl) {
                      setAgentStates((prev) => ({
                        ...prev,
                        [activeAgentId!]: {
                          ...prev[activeAgentId!],
                          pastedImage: dataUrl,
                        },
                      }));
                    }
                  };
                  reader.readAsDataURL(file);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(activeAgent.id);
                    // 重置高度回初始
                    (e.target as HTMLTextAreaElement).style.height = "62px";
                  }
                }}
                placeholder="输入股票代码或分析问题… (Enter 发送，Shift+Enter 换行)"
                rows={2}
                className="flex-1 resize-none bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[#f5a623]/50 transition-all leading-relaxed overflow-y-auto"
                style={{ minHeight: "62px", maxHeight: "160px" }}
              />
              <button
                onClick={() => sendMessage(activeAgent.id)}
                disabled={
                  (!activeAgentState?.input.trim() &&
                    !activeAgentState?.pastedImage) ||
                  activeAgentState?.loading
                }
                className="p-2.5 bg-[#f5a623] hover:bg-[#e8961a] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] text-black rounded-lg transition-colors shrink-0 mb-0"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* chat 收起时显示展开箭头 */}
      {activeAgent && activeSession && !chatVisible && (
        <button
          onClick={() => setChatVisible(true)}
          className="shrink-0 w-8 border-l border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col items-center justify-center gap-1 hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-tertiary)] hover:text-[#f5a623]"
          title="展开面板"
        >
          <PanelRightOpen size={14} />
        </button>
      )}
    </div>
  );
}

// ─── 单条消息气泡（支持复制为图片） ────────────────────────────────────────────
function AgentMessage({
  msg,
  activeAgent,
}: {
  msg: { role: string; content: string; image?: string };
  activeAgent: { emoji: string; color: string; label: string };
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyImage = async () => {
    if (!bubbleRef.current) return;
    try {
      const dataUrl = await toPng(bubbleRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        style: {
          // 截图时去掉圆角裁剪问题
          borderRadius: "12px",
        },
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("复制图片失败", e);
    }
  };

  return (
    <div
      className={cn(
        "flex group",
        msg.role === "user" ? "justify-end" : "justify-start",
      )}
    >
      {msg.role === "agent" && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 mr-2 mt-0.5"
          style={{ background: `${activeAgent.color}20` }}
        >
          {activeAgent.emoji}
        </div>
      )}
      {/* 复制按钮放在气泡外侧（相对于整行定位），避免影响气泡宽度 */}
      <div
        className={cn(
          "flex items-start gap-1.5 max-w-[85%] min-w-0",
          msg.role === "user" ? "flex-row-reverse" : "flex-row",
        )}
      >
        {/* 消息气泡 */}
        <div
          ref={bubbleRef}
          className={cn(
            "relative rounded-xl px-4 py-2.5 text-sm leading-relaxed min-w-0 overflow-hidden",
            msg.role === "user"
              ? "bg-[#f5a623] text-black"
              : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
          )}
        >
          {msg.role === "user" ? (
            <div className="space-y-2">
              {msg.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={msg.image}
                  alt="用户图片"
                  className="max-h-48 max-w-full rounded-lg object-contain"
                />
              )}
              {msg.content && (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              )}
            </div>
          ) : (
            <MarkdownMessage content={msg.content} />
          )}
        </div>

        {/* 复制图片按钮：hover 时显示，与气泡并排 */}
        <button
          onClick={handleCopyImage}
          title="复制为图片"
          className={cn(
            "shrink-0 mt-1 w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150",
            "bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-sm",
            "text-[var(--text-tertiary)] hover:text-[#f5a623] hover:border-[#f5a623]",
            "opacity-0 group-hover:opacity-100",
            copied && "opacity-100 text-green-500 border-green-500",
          )}
        >
          {copied ? <Check size={12} /> : <ImageIcon size={12} />}
        </button>
      </div>
    </div>
  );
}
