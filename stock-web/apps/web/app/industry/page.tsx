"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Edit2,
  Trash2,
  ChevronRight,
  Factory,
  Cpu,
  Layers,
  Search,
  X,
  Network,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyEntry {
  id: string;
  name: string;
  icon: string;
  description: string;
  representatives: string[];
  nodeCount: number;
}

const COMPANIES: CompanyEntry[] = [
  {
    id: "nvidia_chain",
    name: "英伟达",
    icon: "🟢",
    description:
      "英伟达GPU/AI加速器相关A股产业链：受益于NVDA算力需求的上下游国内企业",
    representatives: ["中际旭创", "工业富联", "沪电股份", "长电科技"],
    nodeCount: 0,
  },
  {
    id: "changxin_chain",
    name: "长鑫存储",
    icon: "🔵",
    description:
      "长鑫存储DRAM自主化相关A股产业链：设备/材料/封测等国产替代供应链",
    representatives: ["北方华创", "中微公司", "沪硅产业", "拓荆科技"],
    nodeCount: 0,
  },
];

interface Industry {
  id: string;
  name: string;
  description: string;
  icon: string;
  companyCount: number;
  lastAnalyzed: string;
  representatives: string[];
}

const ICONS: Record<string, React.ElementType> = {
  cpu: Cpu,
  layers: Layers,
  factory: Factory,
};

export default function IndustryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"ai_infra" | "company">(
    "ai_infra",
  );
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });

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
    fetch("http://localhost:8000/api/industry/list")
      .then((r) => r.json())
      .then((data: { industries: Industry[] }) => {
        setIndustries(data.industries);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("http://localhost:8000/api/industry/stocks").then((r) => r.json()),
      fetch("http://localhost:8000/api/industry/stock-industry-map").then((r) =>
        r.json(),
      ),
      fetch("http://localhost:8000/api/industry/list").then((r) => r.json()),
    ])
      .then(
        ([quotesData, mappingData, listData]: [
          { quotes: Record<string, { code: string; name: string }> },
          { mapping: Record<string, string[]> },
          { industries: Industry[] },
        ]) => {
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

      <div
        className="flex items-center gap-1 mb-6 border-b"
        style={{ borderColor: "var(--border-color)" }}
      >
        <button
          onClick={() => setActiveTab("ai_infra")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all",
            activeTab === "ai_infra"
              ? "border-[#f5a623] text-[#f5a623]"
              : "border-transparent",
          )}
          style={{
            color:
              activeTab === "ai_infra" ? "#f5a623" : "var(--text-secondary)",
          }}
        >
          <Cpu size={14} />
          AI 基础设施
        </button>
        <button
          onClick={() => setActiveTab("company")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all",
            activeTab === "company"
              ? "border-[#f5a623] text-[#f5a623]"
              : "border-transparent",
          )}
          style={{
            color:
              activeTab === "company" ? "#f5a623" : "var(--text-secondary)",
          }}
        >
          <Building2 size={14} />
          企业
        </button>
      </div>

      {activeTab === "ai_infra" && (
        <div className="space-y-3">
          {industries.map((industry) => {
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

                <div
                  className="border-t px-5 py-2 flex items-center justify-end gap-2"
                  style={{ borderColor: "var(--border-color)" }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(industry);
                    }}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-all"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <Edit2 size={12} />
                    编辑
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(industry.id);
                    }}
                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-400 px-3 py-1.5 rounded hover:bg-red-400/10 transition-all"
                  >
                    <Trash2 size={12} />
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "company" && (
        <div className="space-y-3">
          {COMPANIES.map((company) => (
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
                      {company.icon}
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
