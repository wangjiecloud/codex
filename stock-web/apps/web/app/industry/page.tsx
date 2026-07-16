"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Factory,
  Cpu,
  Layers,
  Search,
  X,
  Network,
  Building2,
  Bot,
  Rocket,
  Brain,
  Server,
  Plane,
  Battery,
  Activity,
  Wifi,
  Zap,
  Radio,
  Settings,
  Monitor,
  Drone,
  FlaskConical,
  Pill,
  Stethoscope,
  Dna,
  Box,
  Cog,
  RadioTower,
  Microchip,
  PlaneTakeoff,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Industry {
  id: string;
  name: string;
  description: string;
  icon: string;
  companyCount: number;
  lastAnalyzed: string;
  representatives: string[];
  tab: string;
}

const ICONS: Record<string, React.ElementType> = {
  // lowercase keys（旧格式兜底）
  cpu: Cpu,
  layers: Layers,
  factory: Factory,
  // 数据库中存的图标名称（PascalCase）
  Activity,
  Battery,
  Bot,
  Box,
  Brain,
  Building2,
  Cog,
  Cpu,
  Dna,
  Drone,
  Factory,
  Flask: FlaskConical, // 数据库存的是 Flask，lucide 里是 FlaskConical
  FlaskConical,
  Layers,
  Monitor,
  Network,
  Pill,
  Plane,
  Radio,
  RadioTower,
  Rocket,
  Server,
  Settings,
  Stethoscope,
  Tower: RadioTower, // 数据库存的是 Tower，lucide 里是 RadioTower
  Chip: Microchip, // 数据库存的是 Chip，lucide 里是 Microchip
  Microchip,
  Wifi,
  Zap,
};

function IndustryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<
    | "ai_infra"
    | "company"
    | "humanoid"
    | "aerospace"
    | "aviation"
    | "dc_compute"
    | "llm"
    | "lowalt"
    | "energy"
    | "biopharma"
    | "robot"
    | "telecom"
  >(() => {
    const t = searchParams.get("tab");
    if (
      t === "humanoid" ||
      t === "aerospace" ||
      t === "aviation" ||
      t === "company" ||
      t === "dc_compute" ||
      t === "llm" ||
      t === "lowalt" ||
      t === "energy" ||
      t === "biopharma" ||
      t === "robot" ||
      t === "telecom"
    )
      return t;
    return "ai_infra";
  });
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });

  const aiInfraList = industries.filter(
    (i) => (i.tab || "ai_infra") === "ai_infra",
  );
  const companyList = industries.filter((i) => i.tab === "company");
  const humanoidList = industries.filter((i) => i.tab === "humanoid");
  const aerospaceList = industries.filter((i) => i.tab === "aerospace");
  const aviationList = industries.filter((i) => i.tab === "aviation");
  const dcComputeList = industries.filter((i) => i.tab === "dc_compute");
  const llmList = industries.filter((i) => i.tab === "llm");
  const lowaltList = industries.filter((i) => i.tab === "lowalt");
  const energyList = industries.filter((i) => i.tab === "energy");
  const biopharmaList = industries.filter((i) => i.tab === "biopharma");
  const robotList = industries.filter((i) => i.tab === "robot");
  const telecomList = industries.filter((i) => i.tab === "telecom");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{
      code: string;
      name: string;
      industryId: string;
      industryName: string;
    }>
  >([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [allStocks, setAllStocks] = useState<
    Array<{
      code: string;
      name: string;
      industryId: string;
      industryName: string;
    }>
  >([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("http://localhost:8000/api/industry/list").then((r) => r.json()),
      fetch("http://localhost:8000/api/industry/stocks").then((r) => r.json()),
      fetch("http://localhost:8000/api/industry/stock-industry-map").then((r) =>
        r.json(),
      ),
    ])
      .then(
        ([listData, quotesData, mappingData]: [
          { industries: Industry[] },
          { quotes: Record<string, { code: string; name: string }> },
          { mapping: Record<string, string[]> },
        ]) => {
          setIndustries(listData.industries);

          const industryById = Object.fromEntries(
            listData.industries.map((i) => [i.id, i]),
          );
          const stocks: Array<{
            code: string;
            name: string;
            industryId: string;
            industryName: string;
          }> = [];

          Object.values(quotesData.quotes).forEach((stock) => {
            const industryIds = mappingData.mapping[stock.code] || [];
            industryIds.forEach((industryId) => {
              const industry = industryById[industryId];
              if (industry) {
                stocks.push({
                  code: stock.code,
                  name: stock.name,
                  industryId: industry.id,
                  industryName: industry.name,
                });
              }
            });
          });

          setAllStocks(stocks);
        },
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results = allStocks.filter(
      (stock) =>
        stock.code.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query),
    );

    const uniqueResults = Array.from(
      new Map(results.map((item) => [item.code, item])).values(),
    );

    setSearchResults(uniqueResults.slice(0, 20));
    setShowSearchDropdown(uniqueResults.length > 0);
  }, [searchQuery, allStocks]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as HTMLElement)
      ) {
        setShowSearchDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchSelect = (result: {
    code: string;
    name: string;
    industryId: string;
  }) => {
    router.push(`/industry/${result.industryId}?stock=${result.code}`);
    setSearchQuery("");
    setShowSearchDropdown(false);
  };

  const handleAdd = () => {
    setFormData({ name: "", description: "" });
    setEditingId(null);
    setShowForm(true);
  };

  const handleEdit = (industry: Industry) => {
    setFormData({ name: industry.name, description: industry.description });
    setEditingId(industry.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setIndustries((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSave = () => {
    if (!formData.name.trim()) return;
    if (editingId) {
      setIndustries((prev) =>
        prev.map((i) =>
          i.id === editingId
            ? { ...i, name: formData.name, description: formData.description }
            : i,
        ),
      );
    } else {
      const newIndustry: Industry = {
        id: Date.now().toString(),
        name: formData.name,
        description: formData.description,
        icon: "factory",
        companyCount: 0,
        lastAnalyzed: "未分析",
        representatives: [],
        tab: "ai_infra",
      };
      setIndustries((prev) => [...prev, newIndustry]);
    }
    setShowForm(false);
  };

  return (
    <div className="min-h-full p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1
              className="text-2xl font-bold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              重点产业分析
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              分析产业链上下游关系及 A 股代表企业
            </p>
          </div>

          <button
            onClick={() => router.push("/industry/overview")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:border-[#f5a623]/50 hover:text-[#f5a623]"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
              color: "var(--text-secondary)",
            }}
          >
            <Network size={14} />
            全景图
          </button>

          <div className="relative" ref={searchInputRef}>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-secondary)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索股票名称或代码..."
                className="w-64 pl-9 pr-9 py-2 border rounded-lg text-sm focus:outline-none focus:border-[#f5a623]/50"
                style={{
                  background: "var(--bg-primary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setShowSearchDropdown(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {showSearchDropdown && searchResults.length > 0 && (
              <div
                className="absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-xl max-h-80 overflow-y-auto z-50"
                style={{
                  background: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              >
                {searchResults.map((result) => (
                  <button
                    key={`${result.code}-${result.industryId}`}
                    onClick={() => handleSearchSelect(result)}
                    className="w-full px-4 py-2.5 text-left transition-colors border-b last:border-b-0"
                    style={{ borderColor: "var(--border-color)" }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-medium text-sm"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {result.name}
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {result.code}
                        </span>
                      </div>
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {result.industryName}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 产业 Tab 胶囊网格 */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            { key: "ai_infra", icon: <Cpu size={12} />, label: "AI基础设施" },
            { key: "company", icon: <Building2 size={12} />, label: "企业" },
            { key: "humanoid", icon: <Bot size={12} />, label: "人形机器人" },
            { key: "aerospace", icon: <Rocket size={12} />, label: "商业航天" },
            {
              key: "aviation",
              icon: <PlaneTakeoff size={12} />,
              label: "国产大飞机",
            },
            {
              key: "dc_compute",
              icon: <Server size={12} />,
              label: "国产算力基建",
            },
            { key: "llm", icon: <Brain size={12} />, label: "大模型" },
            { key: "lowalt", icon: <Plane size={12} />, label: "低空经济" },
            { key: "energy", icon: <Battery size={12} />, label: "新型储能" },
            {
              key: "biopharma",
              icon: <Activity size={12} />,
              label: "生物医药",
            },
            { key: "robot", icon: <Bot size={12} />, label: "工业机器人" },
            { key: "telecom", icon: <Wifi size={12} />, label: "新型通信" },
          ] as { key: string; icon: React.ReactNode; label: string }[]
        ).map(({ key, icon, label }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: active ? "#f5a623" : "var(--bg-secondary)",
                color: active ? "#fff" : "var(--text-secondary)",
                border: active
                  ? "1px solid #f5a623"
                  : "1px solid var(--border-color)",
              }}
            >
              {icon}
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === "ai_infra" && (
        <div className="space-y-3">
          {aiInfraList.map((industry) => {
            const Icon = ICONS[industry.icon] || Cpu;
            return (
              <div
                key={industry.id}
                className="border rounded-xl overflow-hidden hover:border-[#f5a623]/30 transition-all group"
                style={{
                  background: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              >
                <button
                  onClick={() => router.push(`/industry/${industry.id}`)}
                  className="w-full p-5 text-left"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-[#f5a623]/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon size={20} className="text-[#f5a623]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3
                            className="font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {industry.name}
                          </h3>
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            产业链企业 {industry.companyCount} 家 · 上次分析{" "}
                            {industry.lastAnalyzed}
                          </span>
                        </div>
                        <p
                          className="text-sm leading-relaxed mb-3 line-clamp-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {industry.description}
                        </p>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            代表企业：
                          </span>
                          {industry.representatives.slice(0, 4).map((r) => (
                            <span
                              key={r}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                color: "var(--text-secondary)",
                                background: "var(--bg-tertiary)",
                              }}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      size={18}
                      className="ml-4 mt-1 transition-colors group-hover:text-[#f5a623]"
                      style={{ color: "var(--text-tertiary)" }}
                    />
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "company" && (
        <div className="space-y-3">
          {companyList.map((company) => (
            <div
              key={company.id}
              className="border rounded-xl overflow-hidden hover:border-[#f5a623]/30 transition-all group"
              style={{
                background: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
              }}
            >
              <button
                onClick={() => router.push(`/industry/${company.id}`)}
                className="w-full p-5 text-left"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-[#f5a623]/10 flex items-center justify-center shrink-0 mt-0.5 text-xl">
                      {ICONS[company.icon]
                        ? React.createElement(ICONS[company.icon], {
                            size: 20,
                            className: "text-[#f5a623]",
                          })
                        : company.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3
                          className="font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {company.name}
                        </h3>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full border"
                          style={{
                            color: "var(--text-tertiary)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          企业供应链
                        </span>
                      </div>
                      <p
                        className="text-sm leading-relaxed mb-3 line-clamp-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {company.description}
                      </p>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          代表企业：
                        </span>
                        {company.representatives.map((r) => (
                          <span
                            key={r}
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              color: "var(--text-secondary)",
                              background: "var(--bg-tertiary)",
                            }}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="ml-4 mt-1 transition-colors group-hover:text-[#f5a623]"
                    style={{ color: "var(--text-tertiary)" }}
                  />
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      {(activeTab === "humanoid" ||
        activeTab === "aerospace" ||
        activeTab === "aviation" ||
        activeTab === "dc_compute" ||
        activeTab === "llm" ||
        activeTab === "lowalt" ||
        activeTab === "energy" ||
        activeTab === "biopharma" ||
        activeTab === "robot" ||
        activeTab === "telecom") && (
        <div className="space-y-3">
          {(activeTab === "humanoid"
            ? humanoidList
            : activeTab === "aerospace"
              ? aerospaceList
              : activeTab === "aviation"
                ? aviationList
                : activeTab === "dc_compute"
                  ? dcComputeList
                  : activeTab === "llm"
                    ? llmList
                    : activeTab === "lowalt"
                      ? lowaltList
                      : activeTab === "energy"
                        ? energyList
                        : activeTab === "biopharma"
                          ? biopharmaList
                          : activeTab === "robot"
                            ? robotList
                            : telecomList
          ).map((industry) => {
            const Icon =
              ICONS[industry.icon] ||
              (activeTab === "humanoid"
                ? Bot
                : activeTab === "aerospace"
                  ? Rocket
                  : activeTab === "aviation"
                    ? PlaneTakeoff
                    : activeTab === "dc_compute"
                      ? Server
                      : activeTab === "llm"
                        ? Brain
                        : activeTab === "lowalt"
                          ? Plane
                          : activeTab === "energy"
                            ? Battery
                            : activeTab === "biopharma"
                              ? Activity
                              : activeTab === "robot"
                                ? Bot
                                : Wifi);
            return (
              <div
                key={industry.id}
                className="border rounded-xl overflow-hidden hover:border-[#f5a623]/30 transition-all group"
                style={{
                  background: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              >
                <button
                  onClick={() => router.push(`/industry/${industry.id}`)}
                  className="w-full p-5 text-left"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-[#f5a623]/10 flex items-center justify-center shrink-0 mt-0.5 text-xl">
                        {ICONS[industry.icon]
                          ? React.createElement(ICONS[industry.icon], {
                              size: 20,
                              className: "text-[#f5a623]",
                            })
                          : industry.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3
                            className="font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {industry.name}
                          </h3>
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            产业链企业 {industry.companyCount} 家 · 上次分析{" "}
                            {industry.lastAnalyzed}
                          </span>
                        </div>
                        <p
                          className="text-sm leading-relaxed mb-3 line-clamp-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {industry.description}
                        </p>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            代表企业：
                          </span>
                          {industry.representatives.slice(0, 4).map((r) => (
                            <span
                              key={r}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                color: "var(--text-secondary)",
                                background: "var(--bg-tertiary)",
                              }}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      size={18}
                      className="ml-4 mt-1 transition-colors group-hover:text-[#f5a623]"
                      style={{ color: "var(--text-tertiary)" }}
                    />
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div
            className="border rounded-2xl w-full max-w-md p-6"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
            }}
          >
            <h3
              className="font-semibold text-lg mb-5"
              style={{ color: "var(--text-primary)" }}
            >
              {editingId ? "编辑产业" : "新增产业"}
            </h3>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  产业名称
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="如：OLED（有机发光显示）"
                  className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-[#f5a623]/50"
                  style={{
                    background: "var(--bg-primary)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-sm mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  产业描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="简要描述该产业的定义、应用场景等"
                  rows={4}
                  className="w-full px-3 py-2.5 border rounded-lg text-sm resize-none focus:outline-none focus:border-[#f5a623]/50"
                  style={{
                    background: "var(--bg-primary)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border rounded-lg text-sm transition-colors"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-secondary)",
                }}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.name.trim()}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  formData.name.trim()
                    ? "bg-[#f5a623] hover:bg-[#e8961a] text-black"
                    : "text-[var(--text-tertiary)] cursor-not-allowed",
                )}
                style={
                  !formData.name.trim()
                    ? { background: "var(--bg-tertiary)" }
                    : undefined
                }
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IndustryPage() {
  return (
    <Suspense fallback={null}>
      <IndustryPageContent />
    </Suspense>
  );
}
