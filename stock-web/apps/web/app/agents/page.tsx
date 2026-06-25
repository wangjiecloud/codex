"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  Loader2,
  MessageSquare,
  RefreshCw,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  loading?: boolean;
}

interface AgentChatState {
  messages: ChatMessage[];
  input: string;
  loading: boolean;
}

export default function AgentsPage() {
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [chatStates, setChatStates] = useState<Record<string, AgentChatState>>(
    () =>
      Object.fromEntries(
        AGENTS.map((a) => [a.id, { messages: [], input: "", loading: false }]),
      ),
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatStates]);

  const activeAgent = AGENTS.find((a) => a.id === activeAgentId);
  const activeChat = activeAgentId ? chatStates[activeAgentId] : null;

  const openAgent = (agentId: string) => {
    setActiveAgentId(agentId);
    if (chatStates[agentId].messages.length === 0) {
      const agent = AGENTS.find((a) => a.id === agentId)!;
      setChatStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          messages: [
            {
              role: "agent",
              content: `你好！我是 ${agent.label} Agent。${agent.description}。\n\n请输入股票代码或具体问题，我来为你分析。`,
            },
          ],
        },
      }));
    }
  };

  const resetChat = (agentId: string) => {
    setChatStates((prev) => ({
      ...prev,
      [agentId]: { messages: [], input: "", loading: false },
    }));
    if (activeAgentId === agentId) {
      openAgent(agentId);
    }
  };

  const sendMessage = async (agentId: string) => {
    const state = chatStates[agentId];
    if (!state.input.trim() || state.loading) return;

    const userMsg: ChatMessage = { role: "user", content: state.input };
    setChatStates((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        messages: [...prev[agentId].messages, userMsg],
        input: "",
        loading: true,
      },
    }));

    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: state.input }),
      });
      const data = await res.json();
      setChatStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          messages: [
            ...prev[agentId].messages,
            { role: "agent", content: data.result || "分析完成" },
          ],
          loading: false,
        },
      }));
    } catch {
      setChatStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          messages: [
            ...prev[agentId].messages,
            { role: "agent", content: "请求出错，请检查服务是否正常" },
          ],
          loading: false,
        },
      }));
    }
  };

  return (
    <div className="flex h-full">
      {/* Left: Agent grid */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">
            AI Agent 工具箱
          </h1>
          <p className="text-gray-500 text-sm">
            选择一个 Agent 直接对话，或在个股详情页使用 Team 全量分析
          </p>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {AGENTS.map((agent) => {
            const isActive = activeAgentId === agent.id;
            const hasChat = chatStates[agent.id].messages.length > 0;
            return (
              <button
                key={agent.id}
                onClick={() => openAgent(agent.id)}
                className={cn(
                  "p-5 rounded-xl text-left border transition-all group",
                  isActive
                    ? "border-[#f5a623]/50 bg-[#f5a623]/5"
                    : "border-[#1e2332] bg-[#151821] hover:border-[#f5a623]/30 hover:bg-[#1a1f2e]",
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                    style={{ background: `${agent.color}15` }}
                  >
                    {agent.emoji}
                  </div>
                  {hasChat && (
                    <span className="w-2 h-2 bg-[#f5a623] rounded-full mt-1" />
                  )}
                </div>
                <div className="font-medium text-white mb-1">{agent.label}</div>
                <p className="text-xs text-gray-500 leading-relaxed">
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
        <div className="mt-6 p-5 bg-[#151821] border border-[#f5a623]/20 rounded-xl">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#f5a623]/10 flex items-center justify-center shrink-0">
              <Zap size={20} className="text-[#f5a623]" />
            </div>
            <div>
              <div className="text-white font-medium mb-1">Team 协同分析</div>
              <p className="text-xs text-gray-500 leading-relaxed">
                以上所有 Agent 将并行运行，由 Orchestrator 主控调度，聚合所有子
                Agent 的输出，给出综合分析报告。请前往个股详情页的「AI分析」Tab
                使用全量分析功能。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Chat panel */}
      {activeAgent && activeChat && (
        <div className="w-[380px] border-l border-[#1e2332] bg-[#0d1018] flex flex-col">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2332] bg-[#151821]">
            <div className="flex items-center gap-2">
              <span className="text-lg">{activeAgent.emoji}</span>
              <div>
                <div className="text-white text-sm font-medium">
                  {activeAgent.label} Agent
                </div>
                <div className="text-gray-600 text-[10px]">独立对话模式</div>
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => resetChat(activeAgent.id)}
                className="p-1.5 text-gray-600 hover:text-white rounded hover:bg-[#1e2332] transition-all"
                title="重置对话"
              >
                <RefreshCw size={13} />
              </button>
              <button
                onClick={() => setActiveAgentId(null)}
                className="p-1.5 text-gray-600 hover:text-white rounded hover:bg-[#1e2332] transition-all"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeChat.messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
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
                <div
                  className={cn(
                    "max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-[#f5a623] text-black"
                      : "bg-[#1e2332] text-gray-300",
                  )}
                >
                  <pre className="whitespace-pre-wrap font-sans">
                    {msg.content}
                  </pre>
                </div>
              </div>
            ))}
            {activeChat.loading && (
              <div className="flex justify-start">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 mr-2"
                  style={{ background: `${activeAgent.color}20` }}
                >
                  {activeAgent.emoji}
                </div>
                <div className="bg-[#1e2332] rounded-xl px-4 py-2.5">
                  <Loader2 size={14} className="text-[#f5a623] animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-[#1e2332]">
            <div className="flex gap-2">
              <input
                type="text"
                value={activeChat.input}
                onChange={(e) =>
                  setChatStates((prev) => ({
                    ...prev,
                    [activeAgentId!]: {
                      ...prev[activeAgentId!],
                      input: e.target.value,
                    },
                  }))
                }
                onKeyDown={(e) =>
                  e.key === "Enter" && sendMessage(activeAgent.id)
                }
                placeholder="输入股票代码或分析问题..."
                className="flex-1 bg-[#1e2332] border border-[#2a3045] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#f5a623]/50 transition-all"
              />
              <button
                onClick={() => sendMessage(activeAgent.id)}
                disabled={!activeChat.input.trim() || activeChat.loading}
                className="p-2.5 bg-[#f5a623] hover:bg-[#e8961a] disabled:bg-[#1e2332] disabled:text-gray-600 text-black rounded-lg transition-colors"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
