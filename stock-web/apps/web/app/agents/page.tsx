"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Loader2,
  MessageSquare,
  Cpu,
  ChevronDown,
  Plus,
  Trash2,
  PanelRightClose,
  PanelRightOpen,
  Clock,
  ImageIcon,
  Check,
  Square,
  X,
  FileText,
  Search,
  ExternalLink,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildMarkdownPreviewDocument,
  MarkdownMessage,
} from "@/components/agents/MarkdownMessage";
import { toPng } from "html-to-image";
import {
  buildStoredReportMarkdown,
  getTeamReportPath,
  loadTeamReports,
  removeTeamReportByCode,
  TeamReport,
  upsertTeamReport,
} from "@/lib/teamReports";

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
    id: "market",
    label: "盘面分析",
    emoji: "💹",
    description:
      "分析大盘资金流向、板块轮动、市场情绪与全球联动；识别资金移动板块，判断龙头股与中军股，结合自选股给出综合选股报告",
    color: "#38bdf8",
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
    id: "advisor",
    label: "投资建议",
    emoji: "💡",
    description: "汇总所有分析结果，给出综合买卖点建议、仓位建议和风险提示",
    color: "#fb923c",
  },
  {
    id: "team",
    label: "Team 协同分析",
    emoji: "⚡",
    description:
      "Orchestrator 主控调度，串联数据采集→技术→盘面→基本面→舆情→投资建议，流式展示每阶段进度，最终输出综合分析报告",
    color: "#f5a623",
  },
];

interface ChatMessage {
  id?: number;
  role: "user" | "agent";
  content: string;
  image?: string;
}

interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt?: number;
  messages: ChatMessage[];
  messageCount?: number;
  loadedCount?: number;
  sessionId?: string;
}

interface AgentState {
  sessions: Session[];
  activeSessionId: string;
  input: string;
  loading: boolean;
  pastedImage?: string;
  currentTaskId?: string;
}

interface StockSearchResult {
  code: string;
  name: string;
  price?: number;
  change?: number;
}

function newSession(agentId: string, agent: (typeof AGENTS)[0]): Session {
  return normalizeSession({
    id: `${agentId}-${Date.now()}`,
    title: "新会话",
    createdAt: Date.now(),
    messages: [
      {
        role: "agent",
        content: `你好！我是 ${agent.label} Agent。${agent.description}。\n\n请输入股票代码或具体问题，我来为你分析。`,
      },
    ],
  });
}

const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH = 1200;
const DEFAULT_CHAT_WIDTH = 380;
const SESSION_PAGE_SIZE = 30;

function calcHalfWidth() {
  const available = window.innerWidth - 60 - 10;
  return Math.round(available / 2);
}

function normalizeSession(
  session: {
    id: string;
    title: string;
    codexSid?: string;
    createdAt: number;
    updatedAt?: number;
    messageCount?: number;
    messages?: ChatMessage[];
  },
  fallbackMessages: ChatMessage[] = [],
): Session {
  const messages = session.messages ?? fallbackMessages;
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    sessionId: session.codexSid,
    messages,
    messageCount: session.messageCount ?? messages.length,
    loadedCount: messages.length,
  };
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
            currentTaskId: undefined,
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
  const [teamReports, setTeamReports] = useState<TeamReport[]>([]);
  const [teamReportQuery, setTeamReportQuery] = useState("");
  const [teamSearchResults, setTeamSearchResults] = useState<
    StockSearchResult[]
  >([]);
  const [teamSearchOpen, setTeamSearchOpen] = useState(false);
  const [teamSearchLoading, setTeamSearchLoading] = useState(false);

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
        messages: session.messages.map(({ role, content }) => ({
          role,
          content,
        })),
      }),
    }).catch(() => {});
  }, []);

  const removeSessionFromDb = useCallback(
    (sessionId: string) => {
      fetch(`/api/agents/sessions?sessionId=${sessionId}`, {
        method: "DELETE",
      }).catch(() => {});
    },
    [persistSession],
  );

  const dropdownRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const teamReportRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_CHAT_WIDTH);
  const loadingHistoryRef = useRef(false);
  const stickToBottomRef = useRef(false);
  const autoScrollBehaviorRef = useRef<ScrollBehavior>("auto");
  const streamRefs = useRef<Record<string, EventSource | null>>({});

  useEffect(() => {
    setTeamReports(loadTeamReports());
  }, []);

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
      if (
        teamReportRef.current &&
        !teamReportRef.current.contains(e.target as Node)
      ) {
        setTeamSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const keyword = teamReportQuery.trim();
    if (!keyword) {
      setTeamSearchResults([]);
      setTeamSearchOpen(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setTeamSearchLoading(true);
      try {
        const res = await fetch(
          `/api/stock/search?q=${encodeURIComponent(keyword)}`,
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { results?: StockSearchResult[] };
        setTeamSearchResults(data.results ?? []);
        setTeamSearchOpen((data.results?.length ?? 0) > 0);
      } catch {
        setTeamSearchResults([]);
        setTeamSearchOpen(false);
      } finally {
        setTeamSearchLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [teamReportQuery]);

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
                messageCount: number;
              }[];
            }) => ({ agentId: agent.id, sessions: d.sessions ?? [] }),
          )
          .catch(() => ({ agentId: agent.id, sessions: [] })),
      ),
    ).then((results) => {
      const lastAgentId = (() => {
        try {
          return localStorage.getItem("agent_last_active");
        } catch {
          return null;
        }
      })();
      const initialAgentId =
        lastAgentId && AGENTS.find((a) => a.id === lastAgentId)
          ? lastAgentId
          : null;
      const initialSessionId = initialAgentId
        ? results.find((item) => item.agentId === initialAgentId)?.sessions[0]
            ?.id
        : null;

      const initialLoad = initialSessionId
        ? fetch(
            `/api/agents/sessions?sessionId=${initialSessionId}&offset=0&limit=${SESSION_PAGE_SIZE}`,
          )
            .then((r) => r.json())
            .catch(() => ({ messages: [], total: 0 }))
        : Promise.resolve<{ messages: ChatMessage[]; total: number }>({
            messages: [],
            total: 0,
          });

      initialLoad.then((initialData) => {
        setAgentStates((prev) => {
          const next = { ...prev };
          for (const { agentId, sessions } of results) {
            if (sessions.length > 0) {
              next[agentId] = {
                ...next[agentId],
                sessions: sessions.map((session, index) =>
                  normalizeSession(
                    {
                      ...session,
                      messages:
                        agentId === initialAgentId && index === 0
                          ? initialData.messages
                          : [],
                      messageCount:
                        agentId === initialAgentId && index === 0
                          ? initialData.total
                          : session.messageCount,
                    },
                    [],
                  ),
                ),
                activeSessionId: sessions[0].id,
              };
            } else if (agentId === initialAgentId) {
              const agent = AGENTS.find((a) => a.id === agentId)!;
              const session = newSession(agentId, agent);
              persistSession(agentId, session);
              next[agentId] = {
                ...next[agentId],
                sessions: [session],
                activeSessionId: session.id,
              };
            }
          }
          return next;
        });
        setDbLoaded(true);
        if (initialAgentId) {
          setActiveAgentId(initialAgentId);
          setChatVisible(true);
          setChatWidth(calcHalfWidth());
          stickToBottomRef.current = true;
          autoScrollBehaviorRef.current = "auto";
        }
      });
    });
  }, []);

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

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const node = messagesContainerRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  const loadSessionMessages = useCallback(
    async (
      agentId: string,
      sessionId: string,
      options?: { reset?: boolean; preserveScroll?: boolean },
    ) => {
      if (loadingHistoryRef.current) return;
      const state = agentStates[agentId];
      const session = state?.sessions.find((s) => s.id === sessionId);
      if (!session) return;

      const total = session.messageCount ?? session.messages.length;
      const loaded = options?.reset
        ? 0
        : (session.loadedCount ?? session.messages.length);
      if (!options?.reset && loaded >= total) return;

      const container = messagesContainerRef.current;
      const prevHeight = container?.scrollHeight ?? 0;
      const prevTop = container?.scrollTop ?? 0;
      loadingHistoryRef.current = true;

      try {
        const res = await fetch(
          `/api/agents/sessions?sessionId=${sessionId}&offset=${loaded}&limit=${SESSION_PAGE_SIZE}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages?: ChatMessage[];
          total?: number;
        };
        const chunk = data.messages ?? [];
        const nextTotal = data.total ?? total;

        setAgentStates((prev) => ({
          ...prev,
          [agentId]: {
            ...prev[agentId],
            sessions: prev[agentId].sessions.map((item) => {
              if (item.id !== sessionId) return item;
              const baseMessages = options?.reset ? [] : item.messages;
              const seen = new Set(
                baseMessages.map(
                  (msg) => `${msg.id ?? "x"}:${msg.role}:${msg.content}`,
                ),
              );
              const merged = [
                ...chunk.filter(
                  (msg) =>
                    !seen.has(`${msg.id ?? "x"}:${msg.role}:${msg.content}`),
                ),
                ...baseMessages,
              ];
              return {
                ...item,
                messages: merged,
                messageCount: nextTotal,
                loadedCount: merged.length,
              };
            }),
          },
        }));

        if (options?.preserveScroll) {
          requestAnimationFrame(() => {
            const node = messagesContainerRef.current;
            if (!node) return;
            node.scrollTop = node.scrollHeight - prevHeight + prevTop;
          });
        }
      } finally {
        loadingHistoryRef.current = false;
      }
    },
    [agentStates],
  );

  useEffect(() => {
    if (!activeAgentId || !activeSession) return;
    const total = activeSession.messageCount ?? activeSession.messages.length;
    const loaded = activeSession.loadedCount ?? activeSession.messages.length;
    if (loaded === 0 && total > 0) {
      stickToBottomRef.current = true;
      autoScrollBehaviorRef.current = "auto";
      void loadSessionMessages(activeAgentId, activeSession.id, {
        reset: true,
      });
    }
  }, [activeAgentId, activeSession, loadSessionMessages]);

  useEffect(() => {
    if (!activeAgentId || !activeSession) return;
    if (!stickToBottomRef.current) return;
    const behavior = autoScrollBehaviorRef.current;
    requestAnimationFrame(() => {
      scrollToBottom(behavior);
      stickToBottomRef.current = false;
      autoScrollBehaviorRef.current = "smooth";
    });
  }, [
    activeAgentId,
    activeSession,
    activeSession?.id,
    activeSession?.messages.length,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (!activeAgentId) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
    });
  }, [activeAgentId, scrollToBottom]);

  const openAgent = (agentId: string) => {
    setActiveAgentId(agentId);
    setChatVisible(true);
    if (!activeAgentId) {
      setChatWidth(calcHalfWidth());
    }
    try {
      localStorage.setItem("agent_last_active", agentId);
    } catch {
      /* ignore */
    }
    stickToBottomRef.current = true;
    autoScrollBehaviorRef.current = "auto";
    if (!dbLoaded) return;
    setAgentStates((prev) => {
      const state = prev[agentId];
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
    stickToBottomRef.current = true;
    autoScrollBehaviorRef.current = "auto";
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

  const sendMessage = async (
    agentId: string,
    overrideText?: string,
    truncateBeforeIndex?: number,
  ) => {
    const state = agentStates[agentId];
    const inputText = overrideText ?? state.input;
    if ((!inputText.trim() && !state.pastedImage) || state.loading) return;
    const session = state.sessions.find((s) => s.id === state.activeSessionId);
    if (!session) return;

    const userText = inputText;
    const pastedImage = overrideText ? undefined : state.pastedImage;
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
                messages: [
                  ...(truncateBeforeIndex !== undefined
                    ? s.messages.slice(0, truncateBeforeIndex)
                    : s.messages),
                  userMsg,
                  placeholderMsg,
                ],
                messageCount: (s.messageCount ?? s.messages.length) + 2,
                loadedCount: (s.loadedCount ?? s.messages.length) + 2,
              }
            : s,
        ),
      },
    }));
    stickToBottomRef.current = true;
    autoScrollBehaviorRef.current = "smooth";

    try {
      const questionText =
        pastedImage && !userText.trim()
          ? "用户发送了一张图片，请根据图片内容（如截图、K线图等）进行分析"
          : pastedImage
            ? `${userText}（附带图片）`
            : userText;

      const endpoint =
        agentId === "team" ? "/api/agents/team" : `/api/agents/${agentId}`;
      const payload =
        agentId === "team"
          ? { question: questionText }
          : {
              question: questionText,
              sessionId: session.sessionId,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !body.taskId) {
        throw new Error(body.error || "请求出错，请检查服务是否正常");
      }
      const { taskId } = body;
      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          currentTaskId: taskId,
        },
      }));

      const sse = new EventSource(`/api/agents/stream/${taskId}`);
      streamRefs.current[agentId] = sse;

      sse.onmessage = (event) => {
        const data = JSON.parse(event.data) as {
          type: string;
          delta?: string;
          text?: string;
          message?: string;
          advice?: string;
          agentId?: string;
          agentLabel?: string;
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
        } else if (agentId === "team" && data.type === "agent_start") {
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
                          ? {
                              ...m,
                              content:
                                m.content ||
                                `正在协调 ${data.agentLabel || data.agentId}...`,
                            }
                          : m,
                      ),
                    }
                  : s,
              ),
            },
          }));
        } else if (agentId === "team" && data.type === "agent_done") {
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
                          ? {
                              ...m,
                              content:
                                m.content ||
                                `${data.agentLabel || data.agentId} 已完成，继续汇总中...`,
                            }
                          : m,
                      ),
                    }
                  : s,
              ),
            },
          }));
        } else if (agentId === "team" && data.type === "team_done") {
          setAgentStates((prev) => {
            const sessions = prev[agentId].sessions.map((s) => {
              if (s.id !== state.activeSessionId) return s;
              const msgs = s.messages.map((m) => {
                if (
                  (m as ChatMessage & { _id?: string })._id !== placeholderId
                ) {
                  return m;
                }
                return {
                  ...m,
                  content:
                    data.advice || data.message || data.text || "分析完成",
                };
              });
              const updatedSession = { ...s, messages: msgs };
              persistSession(agentId, updatedSession);
              return updatedSession;
            });
            return {
              ...prev,
              [agentId]: {
                ...prev[agentId],
                loading: false,
                currentTaskId: undefined,
                sessions,
              },
            };
          });
          streamRefs.current[agentId] = null;
          sse.close();
        } else if (data.type === "stream_delta" && data.delta) {
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
        } else if (
          data.type === "done" ||
          data.type === "error" ||
          data.type === "cancelled"
        ) {
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
                    : data.type === "cancelled"
                      ? currentContent || "已停止生成"
                      : currentContent || "分析完成";
                return { ...m, content: finalContent };
              });
              const updatedSession = { ...s, messages: msgs };
              persistSession(agentId, updatedSession);
              return updatedSession;
            });
            return {
              ...prev,
              [agentId]: {
                ...prev[agentId],
                loading: false,
                currentTaskId: undefined,
                sessions,
              },
            };
          });
          streamRefs.current[agentId] = null;
          sse.close();
        }
      };
      sse.onerror = () => {
        setAgentStates((prev) => ({
          ...prev,
          [agentId]: {
            ...prev[agentId],
            loading: false,
            currentTaskId: undefined,
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
        streamRefs.current[agentId] = null;
        sse.close();
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "请求出错，请检查服务是否正常";
      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          loading: false,
          currentTaskId: undefined,
          sessions: prev[agentId].sessions.map((s) =>
            s.id === state.activeSessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    (m as ChatMessage & { _id?: string })._id === placeholderId
                      ? { ...m, content: message }
                      : m,
                  ),
                }
              : s,
          ),
        },
      }));
    }
  };

  const stopMessage = useCallback(
    async (agentId: string) => {
      const taskId = agentStates[agentId]?.currentTaskId;
      const sse = streamRefs.current[agentId];
      if (!taskId) return;
      if (sse) {
        sse.close();
        streamRefs.current[agentId] = null;
      }
      try {
        await fetch(`/api/agents/stream/${taskId}/cancel`, { method: "POST" });
      } catch {}
      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          loading: false,
          currentTaskId: undefined,
          sessions: prev[agentId].sessions.map((s) => {
            if (s.id !== prev[agentId].activeSessionId) return s;
            return {
              ...s,
              messages: s.messages.map((m) => {
                if ((m as ChatMessage & { _id?: string })._id) {
                  return {
                    ...m,
                    content: m.content || "已停止生成",
                  };
                }
                return m;
              }),
            };
          }),
        },
      }));
    },
    [agentStates],
  );

  const runTeamReport = useCallback(
    async (stock: { code: string; name: string }) => {
      const baseReport: TeamReport = {
        code: stock.code,
        name: stock.name,
        status: "running",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setTeamReports((prev) => upsertTeamReport(prev, baseReport));

      const res = await fetch("/api/agents/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: stock.code, stockName: stock.name }),
      });
      const body = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !body.taskId) {
        const failedReport = {
          ...baseReport,
          status: "error" as const,
          error: body.error || "报告分析启动失败",
        };
        setTeamReports((prev) => upsertTeamReport(prev, failedReport));
        throw new Error(failedReport.error);
      }

      await new Promise<void>((resolve, reject) => {
        const sse = new EventSource(`/api/agents/stream/${body.taskId}`);
        sse.onmessage = (event) => {
          const data = JSON.parse(event.data) as {
            type: string;
            advice?: string;
            message?: string;
            text?: string;
          };

          if (data.type === "team_done") {
            const now = Date.now();
            const readyReport: TeamReport = {
              ...baseReport,
              status: "ready",
              updatedAt: now,
              report: buildStoredReportMarkdown(
                stock.name,
                stock.code,
                data.advice || data.message || data.text || "分析完成",
                now,
              ),
              error: undefined,
            };
            setTeamReports((prev) => upsertTeamReport(prev, readyReport));
          }

          if (data.type === "done") {
            sse.close();
            resolve();
          }

          if (data.type === "error") {
            sse.close();
            const failedReport: TeamReport = {
              ...baseReport,
              status: "error",
              updatedAt: Date.now(),
              error: data.message || "报告分析失败",
            };
            setTeamReports((prev) => upsertTeamReport(prev, failedReport));
            reject(new Error(failedReport.error));
          }
        };

        sse.onerror = () => {
          sse.close();
          const failedReport: TeamReport = {
            ...baseReport,
            status: "error",
            updatedAt: Date.now(),
            error: "报告连接中断，请重试",
          };
          setTeamReports((prev) => upsertTeamReport(prev, failedReport));
          reject(new Error(failedReport.error));
        };
      });
    },
    [],
  );

  useEffect(() => {
    const shandongGold = teamReports.find((item) => item.code === "600547");
    if (
      !shandongGold ||
      shandongGold.report ||
      shandongGold.status !== "idle"
    ) {
      return;
    }
    void runTeamReport({ code: shandongGold.code, name: shandongGold.name });
  }, [runTeamReport, teamReports]);

  const openTeamReport = useCallback((report: TeamReport) => {
    window.open(
      getTeamReportPath(report.code),
      "_blank",
      "noopener,noreferrer",
    );
  }, []);

  const removeTeamReport = useCallback((code: string) => {
    setTeamReports((prev) => removeTeamReportByCode(prev, code));
  }, []);

  const addTeamReport = useCallback(
    async (stock: StockSearchResult) => {
      setTeamReportQuery("");
      setTeamSearchResults([]);
      setTeamSearchOpen(false);
      await runTeamReport(stock);
    },
    [runTeamReport],
  );

  const handleMessagesScroll = useCallback(() => {
    if (!activeAgentId || !activeSession || loadingHistoryRef.current) return;
    const node = messagesContainerRef.current;
    if (!node || node.scrollTop > 80) return;
    const total = activeSession.messageCount ?? activeSession.messages.length;
    const loaded = activeSession.loadedCount ?? activeSession.messages.length;
    if (loaded >= total) return;
    void loadSessionMessages(activeAgentId, activeSession.id, {
      preserveScroll: true,
    });
  }, [activeAgentId, activeSession, loadSessionMessages]);

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
                <div
                  key={agent.id}
                  className={cn(
                    "p-5 rounded-xl text-left border transition-all group",
                    isActive
                      ? "border-[#f5a623]/50 bg-[#f5a623]/5"
                      : "border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[#f5a623]/30 hover:bg-[var(--bg-hover)]",
                  )}
                >
                  <button
                    onClick={() => openAgent(agent.id)}
                    className="w-full text-left"
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
                      style={{
                        color: isActive ? "#f5a623" : agent.color + "aa",
                      }}
                    >
                      <MessageSquare size={12} />
                      {isActive ? "对话中" : "启动对话"}
                    </div>
                  </button>
                </div>
              );
            })}

            <div
              ref={teamReportRef}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5"
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f5a623]/10 text-[#f5a623]">
                  <FileText size={18} />
                </div>
                <div>
                  <div className="font-medium text-[var(--text-primary)]">
                    报告
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                    独立查看和维护 Team 生成的个股分析报告
                  </p>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {teamReports.map((report) => (
                  <div
                    key={report.code}
                    className="flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-[11px]"
                  >
                    <button
                      type="button"
                      onClick={() => openTeamReport(report)}
                      className="text-[var(--text-secondary)] hover:text-[#f5a623]"
                    >
                      {report.name}
                    </button>
                    <span
                      className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        report.status === "ready"
                          ? "bg-emerald-400"
                          : report.status === "running"
                            ? "bg-amber-400"
                            : report.status === "error"
                              ? "bg-red-400"
                              : "bg-[var(--text-tertiary)]",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => removeTeamReport(report.code)}
                      className="text-[var(--text-tertiary)] hover:text-red-400"
                      title="删除报告"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="relative">
                <div className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5">
                  <Search size={12} className="text-[var(--text-tertiary)]" />
                  <input
                    value={teamReportQuery}
                    onChange={(e) => setTeamReportQuery(e.target.value)}
                    placeholder="添加个股报告"
                    className="w-full bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                  />
                  {teamSearchLoading && (
                    <Loader2
                      size={12}
                      className="animate-spin text-[#f5a623]"
                    />
                  )}
                </div>
                {teamSearchOpen && teamSearchResults.length > 0 && (
                  <div className="absolute z-20 mt-2 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-1 shadow-lg">
                    {teamSearchResults.slice(0, 8).map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => void addTeamReport(item)}
                        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-[var(--bg-hover)]"
                      >
                        <span className="text-xs text-[var(--text-secondary)]">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          {item.code}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
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
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4"
          >
            {activeSession.messages.map((msg, i) => (
              <AgentMessage
                key={i}
                msg={msg}
                activeAgent={activeAgent}
                onEdit={
                  msg.role === "user"
                    ? (newContent) => {
                        // 更新该条消息内容，截断后续消息
                        setAgentStates((prev) => ({
                          ...prev,
                          [activeAgentId!]: {
                            ...prev[activeAgentId!],
                            sessions: prev[activeAgentId!].sessions.map((s) =>
                              s.id === activeAgentState?.activeSessionId
                                ? {
                                    ...s,
                                    messages: s.messages.map((m, mi) =>
                                      mi === i
                                        ? { ...m, content: newContent }
                                        : m,
                                    ),
                                  }
                                : s,
                            ),
                          },
                        }));
                      }
                    : undefined
                }
                onResend={
                  msg.role === "user"
                    ? (content) => {
                        // 截断该消息（含）之后的所有消息，然后重新发送
                        sendMessage(activeAgentId!, content, i);
                      }
                    : undefined
                }
              />
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
                onClick={() =>
                  activeAgentState?.loading
                    ? stopMessage(activeAgent.id)
                    : sendMessage(activeAgent.id)
                }
                disabled={
                  !activeAgentState?.loading &&
                  !activeAgentState?.input.trim() &&
                  !activeAgentState?.pastedImage
                }
                className={cn(
                  "p-2.5 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-lg transition-colors shrink-0 mb-0",
                  activeAgentState?.loading
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-[#f5a623] hover:bg-[#e8961a] text-black",
                )}
                title={activeAgentState?.loading ? "停止生成" : "发送消息"}
              >
                {activeAgentState?.loading ? (
                  <Square size={15} fill="currentColor" />
                ) : (
                  <Send size={15} />
                )}
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
  onEdit,
  onResend,
}: {
  msg: { role: string; content: string; image?: string };
  activeAgent: { emoji: string; color: string; label: string };
  onEdit?: (newContent: string) => void;
  onResend?: (content: string) => void;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content);

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

  const handlePreview = () => {
    const blob = new Blob([buildMarkdownPreviewDocument(msg.content)], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
              {editing ? (
                <div className="space-y-2 min-w-[180px]">
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setEditing(false);
                        setEditText(msg.content);
                      }
                    }}
                    className="w-full bg-black/20 text-black rounded-lg px-2 py-1.5 text-sm resize-none outline-none border border-black/20 placeholder:text-black/40 min-h-[60px]"
                    rows={3}
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => {
                        setEditing(false);
                        setEditText(msg.content);
                      }}
                      className="px-2 py-1 rounded text-xs bg-black/10 hover:bg-black/20 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        if (editText.trim()) {
                          onEdit?.(editText.trim());
                        }
                        setEditing(false);
                      }}
                      className="px-2 py-1 rounded text-xs bg-black/20 hover:bg-black/30 font-medium transition-colors"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false);
                        onResend?.(editText.trim() || msg.content);
                      }}
                      className="px-2 py-1 rounded text-xs bg-black/25 hover:bg-black/35 font-medium transition-colors flex items-center gap-1"
                    >
                      <RotateCcw size={10} />
                      重新发送
                    </button>
                  </div>
                </div>
              ) : (
                msg.content && (
                  <p className="whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>
                )
              )}
            </div>
          ) : (
            <MarkdownMessage content={msg.content} />
          )}
        </div>

        {/* Markdown 预览按钮：hover 时显示，与气泡并排 */}
        <button
          onClick={handlePreview}
          title="Markdown 预览"
          className={cn(
            "shrink-0 mt-1 w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150",
            "bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-sm",
            "text-[var(--text-tertiary)] hover:text-[#f5a623] hover:border-[#f5a623]",
            "opacity-0 group-hover:opacity-100",
            msg.role === "user" && "hidden",
          )}
        >
          <ExternalLink size={12} />
        </button>

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

        {/* 用户消息：编辑 & 重新发送按钮 */}
        {msg.role === "user" && !editing && onEdit && (
          <button
            onClick={() => {
              setEditText(msg.content);
              setEditing(true);
            }}
            title="编辑消息"
            className={cn(
              "shrink-0 mt-1 w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150",
              "bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-sm",
              "text-[var(--text-tertiary)] hover:text-[#f5a623] hover:border-[#f5a623]",
              "opacity-0 group-hover:opacity-100",
            )}
          >
            <Pencil size={12} />
          </button>
        )}
        {msg.role === "user" && !editing && onResend && (
          <button
            onClick={() => onResend(msg.content)}
            title="重新发送"
            className={cn(
              "shrink-0 mt-1 w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150",
              "bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-sm",
              "text-[var(--text-tertiary)] hover:text-[#f5a623] hover:border-[#f5a623]",
              "opacity-0 group-hover:opacity-100",
            )}
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
