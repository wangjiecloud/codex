"use client";

import { useState, useEffect, useRef } from "react";
import {
  Bot,
  ChevronDown,
  Loader2,
  CheckCircle2,
  Circle,
  RefreshCw,
  Send,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentStatus {
  id: string;
  name: string;
  label: string;
  status: "idle" | "running" | "done" | "error";
  result?: string;
  emoji: string;
}

interface AgentPanelProps {
  code: string;
  stockName: string;
}

const INITIAL_AGENTS: AgentStatus[] = [
  { id: "data", name: "data", label: "数据采集", emoji: "🗄️", status: "idle" },
  {
    id: "technical",
    name: "technical",
    label: "技术分析",
    emoji: "📊",
    status: "idle",
  },
  {
    id: "fundamental",
    name: "fundamental",
    label: "基本面",
    emoji: "📈",
    status: "idle",
  },
  { id: "news", name: "news", label: "新闻舆情", emoji: "📰", status: "idle" },
  { id: "risk", name: "risk", label: "风险评估", emoji: "⚠️", status: "idle" },
  {
    id: "advisor",
    name: "advisor",
    label: "投资建议",
    emoji: "💡",
    status: "idle",
  },
];

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  agentId?: string;
}

export function AgentPanel({ code, stockName }: AgentPanelProps) {
  const [agents, setAgents] = useState<AgentStatus[]>(INITIAL_AGENTS);
  const [running, setRunning] = useState(false);
  const [finalAdvice, setFinalAdvice] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const resetAgents = () => {
    setAgents(
      INITIAL_AGENTS.map((a) => ({ ...a, status: "idle", result: undefined })),
    );
    setFinalAdvice(null);
    setRunning(false);
  };

  const runTeamAnalysis = async () => {
    resetAgents();
    setRunning(true);

    // Use SSE for streaming updates
    const taskRes = await fetch("/api/agents/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, stockName }),
    });

    if (!taskRes.ok) {
      setRunning(false);
      return;
    }

    const { taskId } = await taskRes.json();

    const sse = new EventSource(`/api/agents/stream/${taskId}`);
    sse.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "agent_start") {
        setAgents((prev) =>
          prev.map((a) =>
            a.id === data.agentId ? { ...a, status: "running" } : a,
          ),
        );
      } else if (data.type === "agent_done") {
        setAgents((prev) =>
          prev.map((a) =>
            a.id === data.agentId
              ? { ...a, status: "done", result: data.result }
              : a,
          ),
        );
      } else if (data.type === "team_done") {
        setFinalAdvice(data.advice);
        setRunning(false);
        sse.close();
      } else if (data.type === "error") {
        setRunning(false);
        sse.close();
      }
    };
    sse.onerror = () => {
      setRunning(false);
      sse.close();
    };
  };

  const runSingleAgent = async (agentId: string) => {
    setActiveAgent(agentId);
    const welcome: ChatMessage = {
      role: "agent",
      content: `你好！我是${INITIAL_AGENTS.find((a) => a.id === agentId)?.label} Agent。请告诉我你想分析的问题，我可以专门为 ${stockName}（${code}）提供分析。`,
      agentId,
    };
    setChatMessages([welcome]);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !activeAgent || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    // Placeholder for streaming response
    const placeholderId = Date.now();
    setChatMessages((prev) => [
      ...prev,
      { role: "agent", content: "", agentId: activeAgent, _id: placeholderId },
    ]);

    try {
      const res = await fetch(`/api/agents/${activeAgent}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, stockName, question: chatInput }),
      });
      const { taskId } = await res.json() as { taskId: string };

      const sse = new EventSource(`/api/agents/stream/${taskId}`);
      let accumulated = "";

      sse.onmessage = (event) => {
        const data = JSON.parse(event.data) as {
          type: string;
          text?: string;
          message?: string;
        };

        if (data.type === "agent_message" && data.text) {
          accumulated += (accumulated ? "\n\n" : "") + data.text;
          setChatMessages((prev) =>
            prev.map((m) =>
              (m as ChatMessage & { _id?: number })._id === placeholderId
                ? { ...m, content: accumulated }
                : m,
            ),
          );
        } else if (data.type === "done" || data.type === "error") {
          if (data.type === "error") {
            setChatMessages((prev) =>
              prev.map((m) =>
                (m as ChatMessage & { _id?: number })._id === placeholderId
                  ? { ...m, content: data.message || "分析出错，请重试" }
                  : m,
              ),
            );
          }
          setChatLoading(false);
          sse.close();
        }
      };
      sse.onerror = () => {
        setChatLoading(false);
        sse.close();
      };
    } catch {
      setChatMessages((prev) =>
        prev.map((m) =>
          (m as ChatMessage & { _id?: number })._id === placeholderId
            ? { ...m, content: "分析出错，请重试" }
            : m,
        ),
      );
      setChatLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      {/* Top: Team analysis control */}
      <div className="p-4 border-b border-[var(--border-color)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-[#f5a623]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">AI Team 分析</span>
          </div>
          <div className="flex gap-2">
            {(running || finalAdvice) && (
              <button
                onClick={resetAgents}
                className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--bg-tertiary)] transition-all"
              >
                <RefreshCw size={13} />
              </button>
            )}
            <button
              onClick={runTeamAnalysis}
              disabled={running}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                running
                  ? "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed"
                  : "bg-[#f5a623] hover:bg-[#e8961a] text-black",
              )}
            >
              {running ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Bot size={12} />
              )}
              {running ? "分析中..." : "启动全量分析"}
            </button>
          </div>
        </div>

        {/* Agent status list */}
        <div className="space-y-1.5">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-start gap-2 p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)]"
            >
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                {agent.status === "done" ? (
                  <CheckCircle2 size={14} className="text-[#09d464]" />
                ) : agent.status === "running" ? (
                  <Loader2 size={14} className="text-[#f5a623] animate-spin" />
                ) : (
                  <Circle size={14} className="text-[var(--text-tertiary)]" />
                )}
                <span className="text-xs text-[var(--text-secondary)]">
                  {agent.emoji} {agent.label}
                </span>
              </div>
              {agent.result && (
                <p className="text-xs text-[var(--text-tertiary)] ml-auto text-right leading-relaxed line-clamp-2 flex-1">
                  {agent.result}
                </p>
              )}
              <button
                onClick={() => runSingleAgent(agent.id)}
                className="shrink-0 text-[10px] text-[#f5a623]/70 hover:text-[#f5a623] border border-[#f5a623]/20 hover:border-[#f5a623]/50 px-2 py-0.5 rounded transition-all"
              >
                单独调用
              </button>
            </div>
          ))}
        </div>

        {/* Final advice */}
        {finalAdvice && (
          <div className="mt-3 p-3 bg-[#f5a623]/10 border border-[#f5a623]/30 rounded-lg">
            <div className="text-xs font-medium text-[#f5a623] mb-1">
              💡 投资建议
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {finalAdvice}
            </p>
          </div>
        )}
      </div>

      {/* Chat with single agent */}
      {activeAgent && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
            <MessageSquare size={13} className="text-[#f5a623]" />
            <span className="text-xs text-[var(--text-secondary)]">
              与 {INITIAL_AGENTS.find((a) => a.id === activeAgent)?.label} Agent
              对话
            </span>
            <button
              onClick={() => {
                setActiveAgent(null);
                setChatMessages([]);
              }}
              className="ml-auto text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              关闭
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] text-xs rounded-lg px-3 py-2 leading-relaxed",
                    msg.role === "user"
                      ? "bg-[#f5a623] text-black"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-[var(--bg-tertiary)] rounded-lg px-3 py-2">
                  <Loader2 size={12} className="text-[#f5a623] animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 border-t border-[var(--border-color)]">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                placeholder="输入问题..."
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[#f5a623]/50"
              />
              <button
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || chatLoading}
                className="p-2 bg-[#f5a623] hover:bg-[#e8961a] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] text-black rounded-lg transition-colors"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
