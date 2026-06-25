"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Edit2,
  Trash2,
  ChevronRight,
  Factory,
  Cpu,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Industry {
  id: string;
  name: string;
  description: string;
  icon: "cpu" | "layers" | "factory";
  companyCount: number;
  lastAnalyzed: string;
  representatives: string[];
}

const DEFAULT_INDUSTRIES: Industry[] = [
  {
    id: "overview",
    name: "AI算力产业链全景概览",
    description:
      "从AI芯片到数据中心运营，覆盖GPU/存储/PCB/MLCC/光模块/光纤/液冷/供电/铜缆/IDC全产业链。一张图串联所有环节，点击各产业集群节点可深入查看详细供应链",
    icon: "cpu",
    companyCount: 120,
    lastAnalyzed: "今天",
    representatives: ["英伟达", "中际旭创", "英维克", "长飞光纤"],
  },
  {
    id: "aigpu",
    name: "AI算力芯片（GPU/NPU）",
    description:
      "AI算力芯片是整条产业链的核心驱动力。英伟达H100/B200主导训练市场，国产替代加速推进，寒武纪/海光信息/景嘉微等布局云端AI芯片，华为昇腾生态持续扩张",
    icon: "cpu",
    companyCount: 16,
    lastAnalyzed: "今天",
    representatives: ["寒武纪", "海光信息", "景嘉微", "华大九天"],
  },
  {
    id: "pcb",
    name: "PCB（印制电路板）",
    description:
      "印制电路板是电子元器件的支撑体和电气连接的提供者，广泛应用于通信、消费电子、汽车电子等领域",
    icon: "cpu",
    companyCount: 24,
    lastAnalyzed: "2天前",
    representatives: ["深南电路", "胜宏科技", "沪电股份", "奥士康"],
  },
  {
    id: "mlcc",
    name: "MLCC（积层陶瓷电容器）",
    description:
      "多层陶瓷电容器是用量最大的被动元件之一，广泛用于手机、汽车、工业设备等各类电子产品",
    icon: "layers",
    companyCount: 18,
    lastAnalyzed: "5天前",
    representatives: ["风华高科", "三环集团", "顺络电子", "国瓷材料"],
  },
  {
    id: "memory",
    name: "存储芯片（HBM/DRAM/NAND）",
    description:
      "存储芯片是AI算力基础设施的核心组件，HBM高带宽内存需求随大模型爆发式增长，A股相关企业覆盖靶材、硅片、封测、模组等全产业链",
    icon: "cpu",
    companyCount: 20,
    lastAnalyzed: "1天前",
    representatives: ["兆易创新", "佰维存储", "江波龙", "澜起科技"],
  },
  {
    id: "optics",
    name: "光模块与CPO（共封装光学）",
    description:
      "AI数据中心GPU互联对高速光模块需求爆发式增长，800G→1.6T升级加速，CPO共封装光学将光引擎与交换芯片共封装，功耗降低50%，英伟达已指定天孚通信为CPO光引擎一供",
    icon: "cpu",
    companyCount: 16,
    lastAnalyzed: "今天",
    representatives: ["中际旭创", "天孚通信", "新易盛", "光迅科技"],
  },
  {
    id: "fiber",
    name: "光纤光缆",
    description:
      "AI数据中心内部光互联+5G/6G建设双轮驱动，G.654.E超低损耗光纤需求激增，光纤预制棒-光纤-光缆全产业链一体化龙头具备显著成本优势",
    icon: "layers",
    companyCount: 12,
    lastAnalyzed: "1天前",
    representatives: ["长飞光纤", "亨通光电", "中天科技", "烽火通信"],
  },
  {
    id: "liquidcool",
    name: "液冷散热",
    description:
      "AI芯片功耗突破1.2kW，液冷从可选变必选。冷板式/浸没式液冷市场2025年中国规模达33.9亿美元，年复合增速48%，英伟达GB300全面液冷化",
    icon: "layers",
    companyCount: 15,
    lastAnalyzed: "今天",
    representatives: ["英维克", "高澜股份", "申菱环境", "曙光数创"],
  },
  {
    id: "aipower",
    name: "AI供配电（PSU/BBU/HVDC）",
    description:
      "GB200/GB300引入BBU电池备电替代UPS，HVDC高压直流供电效率更高，单机柜功率突破130kW，供配电系统价值量占数据中心建设成本10-15%",
    icon: "cpu",
    companyCount: 14,
    lastAnalyzed: "2天前",
    representatives: ["麦格米特", "欧陆通", "中恒电气", "蔚蓝锂芯"],
  },
  {
    id: "coppercable",
    name: "高速铜连接（DAC/AEC）",
    description:
      "AI机柜内GPU-Switch短距互联以铜缆为主，800G→1.6T升级带动需求爆发，单GB200 NVL72机柜铜缆价值量超10万美元，A股已形成完整供应链",
    icon: "layers",
    companyCount: 10,
    lastAnalyzed: "2天前",
    representatives: ["沃尔核材", "兆龙互连", "神宇股份", "鼎通科技"],
  },
  {
    id: "idc",
    name: "智算中心/IDC运营",
    description:
      "智能算力中心是所有AI硬件的最终载体。随算力需求爆发，IDC建设提速，算力租赁毛利率超60%，润泽科技/奥飞数据等布局AI专属智算中心，国内三大运营商大规模建设算网一体化",
    icon: "factory",
    companyCount: 14,
    lastAnalyzed: "1天前",
    representatives: ["润泽科技", "奥飞数据", "光环新网", "数据港"],
  },
];

const ICONS = {
  cpu: Cpu,
  layers: Layers,
  factory: Factory,
};

export default function IndustryPage() {
  const router = useRouter();
  const [industries, setIndustries] = useState<Industry[]>(DEFAULT_INDUSTRIES);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });

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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">重点产业分析</h1>
          <p className="text-gray-500 text-sm">
            分析产业链上下游关系及 A 股代表企业
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 bg-[#f5a623] hover:bg-[#e8961a] text-black font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          <Plus size={16} />
          新增产业
        </button>
      </div>

      {/* Industry list */}
      <div className="space-y-3">
        {industries.map((industry) => {
          const Icon = ICONS[industry.icon];
          return (
            <div
              key={industry.id}
              className="bg-[#151821] border border-[#1e2332] rounded-xl overflow-hidden hover:border-[#f5a623]/30 transition-all group"
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
                        <h3 className="text-white font-medium">
                          {industry.name}
                        </h3>
                        <span className="text-xs text-gray-600">
                          产业链企业 {industry.companyCount} 家 · 上次分析{" "}
                          {industry.lastAnalyzed}
                        </span>
                      </div>
                      <p className="text-gray-500 text-sm leading-relaxed mb-3 line-clamp-2">
                        {industry.description}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 text-xs">
                          代表企业：
                        </span>
                        {industry.representatives.slice(0, 4).map((r) => (
                          <span
                            key={r}
                            className="text-xs text-gray-400 bg-[#1e2332] px-2 py-0.5 rounded"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="text-gray-600 group-hover:text-[#f5a623] ml-4 mt-1 transition-colors"
                  />
                </div>
              </button>

              {/* Actions */}
              <div className="border-t border-[#1e2332] px-5 py-2 flex items-center justify-end gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(industry);
                  }}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white px-3 py-1.5 rounded hover:bg-[#1e2332] transition-all"
                >
                  <Edit2 size={12} />
                  编辑
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(industry.id);
                  }}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 px-3 py-1.5 rounded hover:bg-red-400/10 transition-all"
                >
                  <Trash2 size={12} />
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#151821] border border-[#1e2332] rounded-2xl w-full max-w-md p-6">
            <h3 className="text-white font-semibold text-lg mb-5">
              {editingId ? "编辑产业" : "新增产业"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  产业名称
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="如：OLED（有机发光显示）"
                  className="w-full px-3 py-2.5 bg-[#0f1117] border border-[#1e2332] rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-[#f5a623]/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  产业描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="简要描述该产业的定义、应用场景等"
                  rows={4}
                  className="w-full px-3 py-2.5 bg-[#0f1117] border border-[#1e2332] rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-[#f5a623]/50 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-[#1e2332] rounded-lg text-gray-400 hover:text-white text-sm transition-colors"
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
                    : "bg-[#1e2332] text-gray-600 cursor-not-allowed",
                )}
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
