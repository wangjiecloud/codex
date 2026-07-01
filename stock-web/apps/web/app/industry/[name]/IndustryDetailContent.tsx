"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import React from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
  NodeProps,
  Handle,
  Position,
  NodeMouseHandler,
  ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Bot,
  Plus,
  Trash2,
  ExternalLink,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { cn, getPriceColor, formatPercent } from "@/lib/utils";
import { useTheme } from "@/app/theme-provider";
import {
  OpticsAnimation,
  MlccAnimation,
  MemoryAnimation,
  AigpuAnimation,
  FiberAnimation,
  LiquidcoolAnimation,
  AipowerAnimation,
  CoppercableAnimation,
  IdcAnimation,
  GlasssubAnimation,
  AiserverAnimation,
  SemieqAnimation,
} from "./IndustryAnimations";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockEntry {
  code: string;
  name: string;
}

interface LiveQuote {
  code: string;
  name: string;
  price: number;
  change: number;
  changeAmt: number;
  open: number;
  prevClose: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
  marketCap: number;
  pe: number;
  pb: number;
  turnoverRate: number;
  amplitude: number;
  updatedAt: string | null;
}

interface ComponentData extends Record<string, unknown> {
  label: string;
  icon: string;
  desc: string;
  layer: "upstream" | "core" | "downstream" | "application";
  stocks: string[];
  ticker?: string;
  market?: "A股" | "港股" | "美股" | "外资";
  isNvidia?: boolean;
  group?: string;
}

type ComponentNode = Node<ComponentData>;

// ─── Custom Node ──────────────────────────────────────────────────────────────

const LAYER_STYLES: Record<
  ComponentData["layer"],
  { border: string; lightText: string; darkText: string; badge: string }
> = {
  upstream: {
    border: "#3b5bdb",
    lightText: "#3b5bdb",
    darkText: "#7c9ff5",
    badge: "#1e3a5f",
  },
  core: {
    border: "#f5a623",
    lightText: "#d97706",
    darkText: "#fbbf24",
    badge: "#3d2c00",
  },
  downstream: {
    border: "#10b981",
    lightText: "#059669",
    darkText: "#34d399",
    badge: "#0d3d2a",
  },
  application: {
    border: "#8b5cf6",
    lightText: "#7c3aed",
    darkText: "#a78bfa",
    badge: "#2d1f4e",
  },
};

const MARKET_BADGE: Record<string, { text: string }> = {
  A股: { text: "#16a34a" },
  港股: { text: "#0284c7" },
  美股: { text: "#7c3aed" },
  外资: { text: "var(--text-tertiary)" },
};

function ComponentNodeCard({ data, selected }: NodeProps<ComponentNode>) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const s = data.isNvidia
    ? {
        border: "#76b900",
        lightText: "#76b900",
        darkText: "#a3e635",
        badge: "#1a2e00",
      }
    : LAYER_STYLES[data.layer];
  const text = isLight ? s.lightText : s.darkText;
  const mb = data.market ? MARKET_BADGE[data.market] : null;
  const cardBg = data.isNvidia
    ? isLight
      ? "linear-gradient(135deg, #f0fff0 0%, #e8f5e9 100%)"
      : "linear-gradient(135deg, #0d1f03 0%, #091500 100%)"
    : isLight
      ? `linear-gradient(135deg, ${s.border}08 0%, var(--bg-secondary) 100%)`
      : `linear-gradient(135deg, ${s.border}2a 0%, #1a1d28 100%)`;
  return (
    <div
      style={{
        background: cardBg,
        border: `2px solid ${selected ? "var(--text-primary)" : s.border}`,
        borderRadius: "14px",
        width: "200px",
        height: "148px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: data.isNvidia
          ? `0 0 0 3px #76b90055, 0 8px 40px #76b90033`
          : selected
            ? `0 0 0 3px ${s.border}55, 0 8px 32px ${isLight ? "#00000022" : "#00000088"}`
            : `0 4px 16px ${isLight ? "#00000011" : "#00000066"}, inset 0 1px 0 ${s.border}33`,
        transform: selected ? "scale(1.04)" : "scale(1)",
        transition: "all 0.15s ease",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: s.border, border: "none", width: 8, height: 8 }}
      />
      <div
        style={{
          padding: "10px 12px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "6px",
          }}
        >
          <span style={{ fontSize: "20px" }}>{data.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: text,
                fontWeight: 700,
                fontSize: "13px",
                lineHeight: 1.3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {data.label}
            </div>
            {data.ticker && (
              <div
                style={{
                  color: isLight
                    ? "var(--text-tertiary)"
                    : "var(--text-secondary)",
                  fontSize: "10px",
                  marginTop: 1,
                  fontFamily: "monospace",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {data.ticker}
                {mb && (
                  <span
                    style={{
                      marginLeft: 4,
                      background: `${mb.text}25`,
                      color: mb.text,
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 3,
                      fontFamily: "sans-serif",
                    }}
                  >
                    {data.market}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <p
          style={{
            color: isLight ? "var(--text-tertiary)" : "var(--text-secondary)",
            fontSize: "11px",
            margin: "0 0 6px 0",
            lineHeight: 1.4,
            flex: 1,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {data.desc}
        </p>
        {!data.isNvidia && (
          <div
            style={{
              marginTop: "8px",
              background: `${s.border}28`,
              borderRadius: "6px",
              padding: "3px 8px",
              display: "inline-block",
            }}
          >
            <span style={{ color: text, fontSize: "10px", fontWeight: 600 }}>
              {data.stocks.length} 家龙头
            </span>
          </div>
        )}
        {data.isNvidia && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#76b900",
                boxShadow: "0 0 6px #76b900",
              }}
            />
            <span
              style={{
                color: isLight ? "#76b900" : "#a3e635",
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              全球 AI 算力核心客户
            </span>
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: s.border, border: "none", width: 8, height: 8 }}
      />
    </div>
  );
}

const nodeTypes = { component: ComponentNodeCard };

const LAYER_LABEL: Record<ComponentData["layer"], string> = {
  upstream: "上游供应商",
  core: "核心制造商",
  downstream: "组装/分销",
  application: "终端客户",
};

// ─── helpers ──────────────────────────────────────────────────────────────────
type Layer = ComponentData["layer"];
const n = (
  id: string,
  x: number,
  y: number,
  label: string,
  icon: string,
  desc: string,
  layer: Layer,
  stocks: string[],
  ticker?: string,
  market?: ComponentData["market"],
  isNvidia?: boolean,
  group?: string,
): ComponentNode => ({
  id,
  type: "component",
  position: { x, y },
  data: { label, icon, desc, layer, stocks, ticker, market, isNvidia, group },
});

const e = (
  id: string,
  src: string,
  tgt: string,
  layer: Layer,
  label?: string,
): Edge => {
  const colors: Record<Layer, string> = {
    upstream: "#3b5bdb",
    core: "#f5a623",
    downstream: "#10b981",
    application: "#8b5cf6",
  };
  const c = colors[layer];
  return {
    id,
    source: src,
    target: tgt,
    label,
    labelStyle: { fill: "var(--text-secondary)", fontSize: 9, fontWeight: 500 },
    labelBgStyle: { fill: "var(--bg-primary)", fillOpacity: 0.85 },
    labelBgPadding: [3, 5] as [number, number],
    labelBgBorderRadius: 3,
    style: { stroke: `${c}55`, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: c },
  };
};

// ─── PCB 企业供应链图谱 (以英伟达为核心) ──────────────────────────────────────────
//
// 数据来源：公司年报/招股书、中信证券/招商证券研报（2025-2026）
//   生益科技 M8产品已在英伟达交换板取得主要份额、M9获认证（直接供应英伟达）
//   深南电路 封装基板ABF为英伟达GPU封装核心基板
//   宏和科技 超薄电子布→ABF载板关键原材料
//   鼎泰高科 PCB钻针市占率60%+，AI服务器HDI板核心耗材
//   铜冠铜箔/德福科技 高端高速铜箔供PCB厂
//   联瑞新材/壹石通 球形硅微粉（低介电填料）→高频高速CCL

const INDUSTRY_GUIDE: Record<
  string,
  {
    title: string;
    intro: string;
    layers: { label: string; what: string; why: string }[];
  }
> = {
  optics: {
    title: "光模块产业链加工流程",
    intro:
      '光模块是AI服务器之间传输数据的"光速高速公路"，把电信号转成光信号，实现超高速低延迟的机柜间互联。',
    layers: [
      {
        label: "L0 光芯片/硅光材料",
        what: "生产激光芯片（EML/DFB/VCSEL）和磷化铟（InP）衬底原料",
        why: '激光芯片是光模块的"发动机"，决定光信号的速率和传输距离',
      },
      {
        label: "L1 光器件/组件",
        what: "将激光芯片封装成光隔离器、调制器、连接器等光学组件",
        why: "把裸芯片变成可组装的标准零件，控制光路方向和信号质量",
      },
      {
        label: "L2 高速光模块",
        what: "将光芯片+驱动IC+光器件集成封装成800G/1.6T光模块成品",
        why: "这是直接插入英伟达交换机/服务器的终端产品，决定AI集群带宽",
      },
      {
        label: "L3 终端客户",
        what: "英伟达/思科等将光模块集成到NVLink交换机或CPO共封装方案中",
        why: "光模块在这里完成最终部署，连接GB200超级集群的每个GPU节点",
      },
    ],
  },
  pcb: {
    title: "PCB印制电路板产业链加工流程",
    intro:
      'PCB是电子设备的"神经系统底板"，所有芯片、电容、接口都焊接在它上面。AI服务器用的PCB层数多达40层以上，制作难度极高。',
    layers: [
      {
        label: "L0 原材料/覆铜板/耗材",
        what: "生产玻纤布、铜箔、树脂、覆铜板(CCL)、钻针、激光设备等PCB制造原料",
        why: "覆铜板是PCB的基材，介电常数和铜箔质量直接影响高频信号传输性能",
      },
      {
        label: "L1 PCB制造/IC载板",
        what: "在CCL上通过曝光→蚀刻→钻孔→电镀工艺制作多层电路",
        why: "线路越精细，布线密度越高，同等面积能承载的芯片和功能越多",
      },
      {
        label: "L2 终端客户",
        what: "英伟达/华为等将主板集成到AI服务器机柜交付数据中心",
        why: "PCB是整个AI算力基础设施的物理载体，每台GB200包含数十块复杂PCB",
      },
    ],
  },
  mlcc: {
    title: "MLCC积层陶瓷电容产业链加工流程",
    intro:
      "MLCC是电子设备中用量最大的无源元件，每台AI服务器需要数千颗，用于滤波、去耦，保证芯片电源供电稳定。",
    layers: [
      {
        label: "L0 材料企业",
        what: "生产钛酸钡粉、镍粉浆料、铜箔等MLCC核心原材料",
        why: "钛酸钡粉的纯度和粒径决定电容量和温度稳定性",
      },
      {
        label: "L1 关键部件企业",
        what: "将原材料加工成内电极浆料、介质薄膜等半成品",
        why: "薄膜厚度越薄，单层电容量越大，可以在更小体积实现更大容量",
      },
      {
        label: "L2 核心器件企业",
        what: "通过流延→叠层→切割→烧结→电极处理制成MLCC成品",
        why: "AI服务器使用的X5R/X7R规格MLCC需要在高温下保持稳定的电容量",
      },
      {
        label: "L3 组装/分销企业",
        what: "MLCC贴装到PCB上，与其他元器件一起构成完整电路",
        why: "AI GPU芯片周围密布数百颗MLCC，为核心芯片提供瞬态电流支撑",
      },
      {
        label: "L4 终端客户",
        what: "英伟达/华为服务器通过MLCC保障GPU稳定运行",
        why: "GPU峰值功耗变化剧烈，没有足够的去耦电容会导致芯片崩溃或性能下降",
      },
    ],
  },
  memory: {
    title: "存储芯片（HBM/DRAM/NAND）产业链加工流程",
    intro:
      '存储芯片是AI训练的"草稿纸"，模型参数和中间计算结果都存在这里。HBM是AI服务器独有的高带宽内存，通过TSV硅通孔垂直堆叠多层DRAM。',
    layers: [
      {
        label: "L0 原材料企业",
        what: "生产超纯硅片、特种气体、高纯化学品等晶圆制造原料",
        why: "300mm大硅片是DRAM/NAND的基础，任何杂质都会导致存储单元失效",
      },
      {
        label: "L1 关键材料企业",
        what: "生产CMP抛光液、靶材、前驱体等关键工艺材料",
        why: "每一步光刻、刻蚀、沉积工艺都需要特定材料，决定存储密度和良率",
      },
      {
        label: "L2 核心制造企业",
        what: "在晶圆上通过数百道工序制造DRAM/NAND/HBM存储晶圆",
        why: "HBM需要额外的TSV钻孔和Cu柱工艺，制造难度是普通DRAM的数倍",
      },
      {
        label: "L3 封测/模组/设备",
        what: "切割晶圆→测试→封装成内存条/HBM堆叠模组",
        why: "HBM封装是通过CoWoS技术将多层DRAM直接贴合在GPU旁边，实现超高带宽",
      },
      {
        label: "L4 终端客户",
        what: "AI服务器将HBM焊接在H100/B200 GPU旁，DDR5装入内存插槽",
        why: "H100配备80GB HBM3，训练千亿参数模型时每秒读写数据超过3TB",
      },
    ],
  },
  aigpu: {
    title: "AI算力芯片（GPU/NPU）产业链加工流程",
    intro:
      "GPU是AI训练的核心引擎，由EDA设计→先进晶圆制造→CoWoS封装→系统集成等环节构成，每个环节都极度依赖少数关键供应商。",
    layers: [
      {
        label: "L0 EDA/制程/封装",
        what: "EDA软件设计芯片电路图，台积电3nm晶圆代工，长电/通富封测",
        why: "没有EDA就无法设计芯片，没有台积电3nm就无法制造最先进GPU",
      },
      {
        label: "L1 核心算力芯片",
        what: "英伟达/AMD/国产GPU/NPU芯片的设计和流片",
        why: "H100拥有800亿个晶体管，是目前最复杂的商业芯片之一",
      },
      {
        label: "L2 AI算力系统",
        what: "服务器厂商将GPU芯片集成到HGX/DGX服务器板中",
        why: "8块H100 GPU通过NVLink互联后，算力相当于640个传统服务器",
      },
      {
        label: "L3 算力应用",
        what: "云厂商和AI公司将AI服务器部署为大规模训练集群",
        why: "GPT-4训练消耗了约25000块A100 GPU运行90天",
      },
    ],
  },
  fiber: {
    title: "光纤光缆产业链加工流程",
    intro:
      "光纤是数据中心之间传输数据的介质，AI时代数据中心规模扩张直接拉动光纤需求爆发式增长。",
    layers: [
      {
        label: "L0 原材料",
        what: "高纯石英管、四氯化硅、保护气体等光纤制造原料",
        why: "光纤的传输损耗极低（每公里仅损失0.2dB），对原材料纯度要求极高",
      },
      {
        label: "L1 光纤预制棒",
        what: "通过PCVD/OVD工艺将高纯SiO₂沉积制成光纤预制棒",
        why: "预制棒是光纤的毛坯，决定光纤的折射率分布和传输性能",
      },
      {
        label: "L2 光纤/光缆制造",
        what: "将预制棒拉丝成光纤，再成缆加护套制成光缆成品",
        why: "单根光纤直径仅125微米，比头发丝略粗，但能承载Tb级数据传输",
      },
      {
        label: "L3 终端客户",
        what: "电信运营商、数据中心铺设光缆构建骨干网和园区网",
        why: "AI大模型训练需要超大规模集群，集群内外的光纤互联需求持续激增",
      },
    ],
  },
  liquidcool: {
    title: "液冷散热系统产业链加工流程",
    intro:
      "AI服务器功耗极高（单台GB200机柜超过120kW），传统风冷已无法满足散热需求，液冷是GB200等高密度算力设备的标配散热方案。",
    layers: [
      {
        label: "L0 液冷材料/管路",
        what: "生产冷却液（水基/氟化液）、快接接头、液冷管路等原材料",
        why: "氟化液是浸没液冷的核心介质，需要绝缘、不燃且与电子元件相容",
      },
      {
        label: "L1 冷板/CDU组件",
        what: "制造贴合GPU的冷板散热器和冷却分配单元（CDU）",
        why: "冷板贴合GPU表面带走热量，CDU负责调节冷却液温度和流量",
      },
      {
        label: "L2 液冷系统集成",
        what: "将冷板+CDU+管路+监控系统集成为完整的机柜液冷解决方案",
        why: "GB200 NVL72机柜需要专门设计的液冷分配系统，散热功率超过100kW",
      },
      {
        label: "L3 终端交付",
        what: "工业富联等ODM将液冷系统与GPU服务器集成后交付IDC运营商",
        why: "液冷相比风冷可降低数据中心PUE至1.1以下，大幅降低运营成本",
      },
    ],
  },
  aipower: {
    title: "AI供配电（PSU/BBU/HVDC）产业链加工流程",
    intro:
      "为AI服务器机柜提供稳定可靠的电力是一大挑战。GB200机柜单柜功耗高达120kW，需要完整的供配电链路从电网到每颗GPU的每瓦功率。",
    layers: [
      {
        label: "L0 核心原材料",
        what: "IGBT/SiC功率模块、电解电容、驱动IC等电源核心器件",
        why: "IGBT是电源转换的核心开关器件，SiC相比Si可在更高频率和温度下工作",
      },
      {
        label: "L1 关键电源模块",
        what: "将功率器件组合成服务器PSU（电源供应单元）和BBU（后备电池）",
        why: "GB200每台服务器需要多个PSU并联，保证高功率密度下的稳定供电",
      },
      {
        label: "L2 供配电系统集成",
        what: "集成PSU/UPS/HVDC构成数据中心完整供配电解决方案",
        why: "HVDC（高压直流）相比传统AC供电减少2次转换，效率提升约5-8%",
      },
      {
        label: "L3 终端客户",
        what: "IDC运营商（润泽/奥飞）将供配电系统部署在机房中为GPU集群供电",
        why: "一个万卡GPU集群的用电量相当于一座小型城市，供配电可靠性至关重要",
      },
    ],
  },
  coppercable: {
    title: "高速铜连接（DAC/AEC）产业链加工流程",
    intro:
      "DAC铜缆是GPU机柜内短距高速互联的最经济方案，在3米以内比光模块成本低70%，是NVLink机柜内部GPU互联的主要选择。",
    layers: [
      {
        label: "L0 原材料",
        what: "高纯铜杆、屏蔽材料、高速连接器等铜缆原材料",
        why: "AI服务器铜缆传输速率400G~800G，对铜材纯度和屏蔽设计要求极高",
      },
      {
        label: "L1 线缆/连接器制造",
        what: "拉制高速同轴铜缆，制造高速QSFP/OSFP连接器",
        why: "连接器的插拔次数、信号完整性是规格要求中最严苛的部分",
      },
      {
        label: "L2 高速互联模组",
        what: "将铜缆+连接器+信号处理芯片集成为DAC/AEC高速线缆组件",
        why: "AEC（主动铜缆）内置均衡芯片，可将有效传输距离延长到7米以上",
      },
      {
        label: "L3 终端客户",
        what: "英伟达NVL72机柜用DAC铜缆连接72块GPU与NVSwitch交换芯片",
        why: "一个NVL72机柜内部需要数百根DAC铜缆，总带宽超过57.6Tb/s",
      },
    ],
  },
  idc: {
    title: "智算中心/IDC产业链运营流程",
    intro:
      "智算中心是AI算力的物理载体，将土地、电力、网络、设备整合为可租用的算力服务，是AI大模型训练和推理的基础设施。",
    layers: [
      {
        label: "L0 基础设施建设",
        what: "选址、土地获取、变电站建设、网络接入等前期工程",
        why: "IDC选址需同时满足低电价、充足电力容量、低自然灾害风险等条件",
      },
      {
        label: "L1 机房配套设备",
        what: "UPS不间断电源、精密空调/液冷、网络安全设备等机房设备采购安装",
        why: "AI IDC的PUE目标为1.2以下，配套设备效率直接决定运营成本",
      },
      {
        label: "L2 智算中心运营",
        what: "采购GPU服务器，搭建网络互联，运营IDC并对外提供算力租用",
        why: "万卡集群的网络拓扑和调度系统复杂度不亚于GPU本身的技术难度",
      },
      {
        label: "L3 算力服务客户",
        what: "AI公司、云厂商通过租用算力训练大模型或运行推理服务",
        why: "一次GPT级大模型训练需要连续占用千卡级GPU数周，算力成本数千万",
      },
    ],
  },
  glasssub: {
    title: "玻璃基板（半导体封装/面板）产业链加工流程",
    intro:
      "玻璃基板是下一代半导体先进封装的关键材料，相比传统有机基板尺寸更大、翘曲更低、布线更精细，有望成为AI芯片封装的革命性材料。",
    layers: [
      {
        label: "L0 上游原料/设备",
        what: "高纯石英砂、特种玻璃原料、玻璃熔化设备等基础材料",
        why: "半导体封装玻璃基板对表面平整度要求达到纳米级，原料纯度至关重要",
      },
      {
        label: "L1 玻璃基板制造",
        what: "熔化→成型→研磨→抛光→切割制成高精度玻璃基板",
        why: "玻璃基板的热膨胀系数与硅芯片接近，可大幅降低封装应力和翘曲",
      },
      {
        label: "L2 下游封装/面板",
        what: "在玻璃基板上制作线路层，封装GPU等芯片；或用于OLED/LCD面板",
        why: "玻璃基板封装可实现比ABF有机基板更细的线路，支持更多GPU芯片集成",
      },
      {
        label: "L3 终端应用",
        what: "AI芯片、智能手机屏幕、平板电脑等消费电子终端应用",
        why: "英特尔已宣布2026年量产玻璃基板封装芯片，英伟达等正在评估导入计划",
      },
    ],
  },
  aiserver: {
    title: "AI服务器整机产业链组装流程",
    intro:
      "AI服务器整机是将GPU、内存、PCB、液冷等所有零部件集成为可运行AI任务的完整计算设备，工业富联等ODM是这个环节的核心执行者。",
    layers: [
      {
        label: "L0 核心零部件",
        what: "GPU芯片、HBM内存、AI服务器PCB、光模块、铜缆等关键零件",
        why: "AI服务器的90%价值集中在GPU等核心零部件，整机组装是最后一公里",
      },
      {
        label: "L1 ODM/代工制造",
        what: "按英伟达MGX规格将所有零件组装、测试为完整AI服务器",
        why: "GB200服务器组装精度要求极高，液冷接头和GPU热界面处理是关键工序",
      },
      {
        label: "L2 品牌整机",
        what: "以品牌形式交付整机，或进一步集成为DGX/HGX超级计算机系统",
        why: "DGX SuperPOD将256块B200 GPU通过NVLink互联，是最高规格AI计算单元",
      },
      {
        label: "L3 终端客户",
        what: "云厂商、AI公司、政府算力中心部署AI服务器运行大模型",
        why: "字节跳动2024年采购了价值数百亿的AI服务器，是全球最大单一买家之一",
      },
    ],
  },
  semieq: {
    title: "半导体设备产业链供应流程",
    intro:
      '半导体设备是芯片制造的"母机"，没有光刻机、刻蚀机就无法制造GPU芯片。AI算力需求爆发直接拉动了先进制程设备的强劲需求。',
    layers: [
      {
        label: "L0 关键零部件/材料",
        what: "石英件、靶材、特种气体、CMP耗材等设备核心零部件",
        why: "一台刻蚀机包含数万个精密零件，石英腔体需要定期更换，是耗材大项",
      },
      {
        label: "L1 设备整机",
        what: "光刻机、刻蚀机、CVD/PVD、CMP等半导体制造设备",
        why: "ASML EUV光刻机单台售价1.5亿美元，全球只有ASML能生产，是最卡脖子的设备",
      },
      {
        label: "L2 晶圆制造/封装应用",
        what: "晶圆厂使用设备对硅片进行数百道工序，制造芯片晶圆",
        why: "先进制程AI芯片需要ASML EUV曝光超过100层，每道工序都需要特定设备",
      },
      {
        label: "L3 终端芯片客户",
        what: "英伟达/AMD等芯片公司通过台积电代工，获得最终AI芯片产品",
        why: "台积电3nm工厂的设备投资超过200亿美元，是全球制造业最密集的投资之一",
      },
    ],
  },
};

function ProcessFlowView({
  nodes,
  selectedId,
  onSelect,
  layerLabels,
  perfData,
  liveQuotes,
  industryId,
}: {
  nodes: ComponentNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  layerLabels: string[];
  perfData: Record<string, { ytd: number | null; m5: number | null }>;
  liveQuotes: Record<string, LiveQuote>;
  industryId?: string;
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [zoom, setZoom] = React.useState(1);
  const [showGuide, setShowGuide] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const startTimeRef = React.useRef(Date.now());
  const frameRef = React.useRef<number | undefined>(undefined);
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  React.useEffect(() => {
    let lastUpdate = Date.now();
    const animate = () => {
      const now = Date.now();
      if (now - lastUpdate >= 50) {
        forceUpdate();
        lastUpdate = now;
      }
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => {
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        return Math.min(2, Math.max(0.3, +(z + delta).toFixed(2)));
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const yGroups = Array.from(new Set(nodes.map((n) => n.position.y))).sort(
    (a, b) => a - b,
  );

  const layers = yGroups.map((y, i) => ({
    y,
    label: layerLabels[i] ?? `L${i}`,
    nodes: nodes.filter((n) => n.position.y === y),
  }));

  const LAYER_COLORS = [
    {
      accent: "#3b82f6",
      bg: isLight ? "#3b82f606" : "#3b82f60e",
      border: isLight ? "#3b82f640" : "#3b82f635",
    },
    {
      accent: "#06b6d4",
      bg: isLight ? "#06b6d406" : "#06b6d40e",
      border: isLight ? "#06b6d440" : "#06b6d435",
    },
    {
      accent: "#f5a623",
      bg: isLight ? "#f5a62306" : "#f5a6230e",
      border: isLight ? "#f5a62340" : "#f5a62335",
    },
    {
      accent: "#10b981",
      bg: isLight ? "#10b98106" : "#10b9810e",
      border: isLight ? "#10b98140" : "#10b98135",
    },
    {
      accent: "#8b5cf6",
      bg: isLight ? "#8b5cf606" : "#8b5cf60e",
      border: isLight ? "#8b5cf640" : "#8b5cf635",
    },
  ];

  const particleOffset =
    (((Date.now() - startTimeRef.current) / 1500) * 100) % 100;

  const CtrlBtn = ({
    onClick,
    title,
    children,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--border-color)",
        color: "var(--text-secondary)",
        fontSize: 14,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background =
          "var(--bg-tertiary)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background =
          "transparent")
      }
    >
      {children}
    </button>
  );

  return (
    <div
      className="flex-1 flex flex-col bg-[var(--bg-primary)]"
      style={{ fontFamily: "monospace" }}
    >
      <div className="flex items-center gap-3 px-5 py-0.5 border-b border-[var(--border-color)] bg-[var(--bg-primary)] flex-shrink-0 sticky top-0 z-10">
        <span className="text-xs text-[var(--text-tertiary)]">
          3D加工流程图 · 点击节点查看 A 股龙头企业 · Ctrl+滚轮缩放
        </span>
        <div className="flex items-center gap-4 ml-3">
          {industryId && INDUSTRY_GUIDE[industryId] && (
            <button
              onClick={() => setShowGuide(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 6,
                border: `1px solid ${isLight ? "#e2e8f0" : "#334155"}`,
                background: isLight ? "#f8fafc" : "#1e293b",
                color: isLight ? "#475569" : "#94a3b8",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "monospace",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "#3b82f6";
                (e.currentTarget as HTMLButtonElement).style.color = "#3b82f6";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  isLight ? "#e2e8f0" : "#334155";
                (e.currentTarget as HTMLButtonElement).style.color = isLight
                  ? "#475569"
                  : "#94a3b8";
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              流程说明
            </button>
          )}
          {layers.map((layer, i) => (
            <div key={i} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: LAYER_COLORS[i]?.accent ?? "#888" }}
              />
              <span className="text-xs text-[var(--text-tertiary)]">
                {layer.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {showGuide &&
        industryId &&
        INDUSTRY_GUIDE[industryId] &&
        (() => {
          const guide = INDUSTRY_GUIDE[industryId];
          const layerColors = [
            "#3b82f6",
            "#06b6d4",
            "#f5a623",
            "#10b981",
            "#8b5cf6",
          ];
          return (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 1000,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(4px)",
              }}
              onClick={() => setShowGuide(false)}
            >
              <div
                style={{
                  background: isLight ? "#ffffff" : "#0f172a",
                  border: `1px solid ${isLight ? "#e2e8f0" : "#1e293b"}`,
                  borderRadius: 16,
                  width: "min(860px, 92vw)",
                  maxHeight: "85vh",
                  overflowY: "auto",
                  padding: "32px 36px",
                  position: "relative",
                  boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setShowGuide(false)}
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: "none",
                    background: isLight ? "#f1f5f9" : "#1e293b",
                    color: isLight ? "#64748b" : "#94a3b8",
                    cursor: "pointer",
                    fontSize: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ×
                </button>

                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: isLight ? "#0f172a" : "#f1f5f9",
                      marginBottom: 8,
                    }}
                  >
                    {guide.title}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: isLight ? "#64748b" : "#94a3b8",
                      lineHeight: 1.7,
                    }}
                  >
                    {guide.intro}
                  </div>
                </div>

                {industryId === "pcb" && (
                  <PCBManufacturingAnimation isLight={isLight} />
                )}
                {industryId === "optics" && (
                  <OpticsAnimation isLight={isLight} />
                )}
                {industryId === "mlcc" && <MlccAnimation isLight={isLight} />}
                {industryId === "memory" && (
                  <MemoryAnimation isLight={isLight} />
                )}
                {industryId === "aigpu" && <AigpuAnimation isLight={isLight} />}
                {industryId === "fiber" && <FiberAnimation isLight={isLight} />}
                {industryId === "liquidcool" && (
                  <LiquidcoolAnimation isLight={isLight} />
                )}
                {industryId === "aipower" && (
                  <AipowerAnimation isLight={isLight} />
                )}
                {industryId === "coppercable" && (
                  <CoppercableAnimation isLight={isLight} />
                )}
                {industryId === "idc" && <IdcAnimation isLight={isLight} />}
                {industryId === "glasssub" && (
                  <GlasssubAnimation isLight={isLight} />
                )}
                {industryId === "aiserver" && (
                  <AiserverAnimation isLight={isLight} />
                )}
                {industryId === "semieq" && (
                  <SemieqAnimation isLight={isLight} />
                )}

                <div
                  style={{ display: "flex", gap: 24, alignItems: "flex-start" }}
                >
                  {/* 左侧：流程示意图 */}
                  <div style={{ flexShrink: 0, width: 160 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: isLight ? "#94a3b8" : "#475569",
                        marginBottom: 10,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                      }}
                    >
                      加工流程
                    </div>
                    {guide.layers.map((layer, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: 8,
                            background: `${layerColors[i] ?? "#888"}18`,
                            border: `1.5px solid ${layerColors[i] ?? "#888"}55`,
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: layerColors[i] ?? "#888",
                              marginBottom: 2,
                            }}
                          >
                            {layer.label.split(" ")[0]}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: isLight ? "#475569" : "#94a3b8",
                              lineHeight: 1.3,
                            }}
                          >
                            {layer.label.split(" ").slice(1).join(" ")}
                          </div>
                        </div>
                        {i < guide.layers.length - 1 && (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              padding: "2px 0",
                            }}
                          >
                            <div
                              style={{
                                width: 2,
                                height: 8,
                                background: `${layerColors[i] ?? "#888"}60`,
                              }}
                            />
                            <svg width="10" height="6" viewBox="0 0 10 6">
                              <path
                                d="M5 6L0 0h10z"
                                fill={`${layerColors[i + 1] ?? "#888"}80`}
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 右侧：逐层说明 */}
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: isLight ? "#94a3b8" : "#475569",
                        marginBottom: 2,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                      }}
                    >
                      每个环节详解
                    </div>
                    {guide.layers.map((layer, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "14px 16px",
                          borderRadius: 10,
                          background: isLight ? "#f8fafc" : "#1e293b",
                          borderLeft: `3px solid ${layerColors[i] ?? "#888"}`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 6,
                          }}
                        >
                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 5,
                              background: `${layerColors[i] ?? "#888"}22`,
                              border: `1px solid ${layerColors[i] ?? "#888"}55`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 800,
                              color: layerColors[i] ?? "#888",
                            }}
                          >
                            {layer.label.split(" ")[0]}
                          </div>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: isLight ? "#1e293b" : "#e2e8f0",
                            }}
                          >
                            {layer.label.split(" ").slice(1).join(" ")}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: isLight ? "#374151" : "#cbd5e1",
                            lineHeight: 1.65,
                            marginBottom: 6,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              color: isLight ? "#0f172a" : "#f1f5f9",
                            }}
                          >
                            做什么：
                          </span>
                          {layer.what}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: isLight ? "#6b7280" : "#94a3b8",
                            lineHeight: 1.65,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              color: layerColors[i] ?? "#888",
                            }}
                          >
                            为什么重要：
                          </span>
                          {layer.why}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <div className="w-full h-full overflow-y-auto overflow-x-auto">
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "50% 0%",
              paddingTop: 60,
              paddingBottom: 48,
              paddingLeft: 24,
              paddingRight: 24,
              width: "100%",
            }}
          >
            {layers.map((layer, li) => {
              const lc = LAYER_COLORS[li] ?? LAYER_COLORS[0];
              return (
                <div key={li} style={{ position: "relative" }}>
                  {li > 0 && (
                    <div
                      style={{
                        position: "relative",
                        height: 52,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          overflow: "visible",
                        }}
                      >
                        <defs>
                          <marker
                            id={`arr-${li}`}
                            markerWidth="8"
                            markerHeight="8"
                            refX="4"
                            refY="4"
                            orient="auto"
                          >
                            <path
                              d="M0,0 L8,4 L0,8 Z"
                              fill={lc.accent}
                              opacity="0.7"
                            />
                          </marker>
                        </defs>
                        {layer.nodes.slice(0, 6).map((nd, ni) => {
                          const prevLayer = layers[li - 1];
                          const srcNode =
                            prevLayer.nodes[
                              Math.min(ni, prevLayer.nodes.length - 1)
                            ];
                          const srcX =
                            ((srcNode ? prevLayer.nodes.indexOf(srcNode) : ni) +
                              0.5) *
                            (100 / prevLayer.nodes.length);
                          const dstX = (ni + 0.5) * (100 / layer.nodes.length);
                          const pts = (particleOffset / 100 + ni * 0.15) % 1;
                          const px = srcX + (dstX - srcX) * pts;
                          const py = pts * 52;
                          return (
                            <g key={nd.id}>
                              <line
                                x1={`${srcX}%`}
                                y1={0}
                                x2={`${dstX}%`}
                                y2={52}
                                stroke={lc.accent}
                                strokeWidth={isLight ? "1.5" : "1"}
                                strokeOpacity={isLight ? "0.55" : "0.3"}
                                strokeDasharray="4 6"
                                markerEnd={`url(#arr-${li})`}
                              />
                              <circle
                                cx={`${px}%`}
                                cy={py}
                                r="2.5"
                                fill={lc.accent}
                                opacity="0.8"
                              />
                            </g>
                          );
                        })}
                      </svg>
                      {layerLabels[li - 1] && (
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            background: isLight
                              ? "rgba(255,255,255,0.92)"
                              : "rgba(15,23,42,0.88)",
                            border: `1px solid ${lc.accent}55`,
                            borderRadius: 20,
                            padding: "3px 10px",
                            fontSize: 10,
                            fontWeight: 600,
                            color: lc.accent,
                            whiteSpace: "nowrap",
                            pointerEvents: "none",
                            zIndex: 2,
                            boxShadow: `0 2px 8px ${lc.accent}22`,
                          }}
                        >
                          <span
                            style={{
                              color: isLight ? "#94a3b8" : "#64748b",
                              fontWeight: 400,
                            }}
                          >
                            {layerLabels[li - 1].replace(/^L\d\s/, "")}
                          </span>
                          <svg
                            width="14"
                            height="10"
                            viewBox="0 0 14 10"
                            fill="none"
                          >
                            <path
                              d="M1 5h10M8 2l3 3-3 3"
                              stroke={lc.accent}
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span>{layer.label.replace(/^L\d\s/, "")}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      background: `linear-gradient(180deg, ${lc.bg} 0%, ${lc.bg}ee 100%)`,
                      border: `1px solid ${lc.border}`,
                      borderLeft: `3px solid ${lc.accent}`,
                      marginLeft: 16,
                      marginRight: 16,
                      borderRadius: 10,
                      padding: "12px 16px",
                      position: "relative",
                      boxShadow: `0 4px 24px ${lc.accent}18`,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -10,
                        left: 20,
                        background: lc.accent,
                        color: "#000",
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "2px 10px",
                        borderRadius: 4,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {layer.label}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: 12,
                        marginTop: 8,
                        width: "100%",
                      }}
                    >
                      {(() => {
                        const grouped: {
                          name: string;
                          nodes: typeof layer.nodes;
                        }[] = [];
                        const ungrouped: typeof layer.nodes = [];
                        layer.nodes.forEach((nd) => {
                          const g = nd.data.group as string | undefined;
                          if (g) {
                            const existing = grouped.find((x) => x.name === g);
                            if (existing) existing.nodes.push(nd);
                            else grouped.push({ name: g, nodes: [nd] });
                          } else {
                            ungrouped.push(nd);
                          }
                        });
                        const renderNode = (nd: ComponentNode) => {
                          const isSel = selectedId === nd.id;
                          return (
                            <button
                              key={nd.id}
                              onClick={() => onSelect(nd.id)}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                gap: 4,
                                padding: "10px 14px",
                                borderRadius: 8,
                                background: isSel
                                  ? `${lc.accent}22`
                                  : `${lc.accent}08`,
                                border: `1.5px solid ${isSel ? lc.accent : lc.border}`,
                                cursor: "pointer",
                                minWidth: 120,
                                transition: "all 0.18s ease",
                                boxShadow: isSel
                                  ? `0 0 16px ${lc.accent}44, inset 0 0 8px ${lc.accent}18`
                                  : "none",
                                transform: isSel ? "translateY(-2px)" : "none",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <span style={{ fontSize: 18 }}>
                                  {nd.data.icon}
                                </span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: isSel
                                      ? lc.accent
                                      : "var(--text-primary)",
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {nd.data.label}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "var(--text-tertiary)",
                                  lineHeight: 1.4,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {nd.data.desc}
                              </div>
                              {nd.data.stocks.length > 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 3,
                                    width: "100%",
                                  }}
                                >
                                  {nd.data.stocks.map((code) => {
                                    const perf = perfData[code];
                                    const fmtPct = (
                                      v: number | null | undefined,
                                    ) => {
                                      if (v == null) return null;
                                      const sign = v >= 0 ? "+" : "";
                                      return `${sign}${v.toFixed(2)}%`;
                                    };
                                    const ytdStr = fmtPct(perf?.ytd);
                                    const m5Str = fmtPct(perf?.m5);
                                    const ytdColor =
                                      perf?.ytd != null
                                        ? perf.ytd >= 0
                                          ? "#ef4444"
                                          : "#22c55e"
                                        : "var(--text-tertiary)";
                                    const m5Color =
                                      perf?.m5 != null
                                        ? perf.m5 >= 0
                                          ? "#ef4444"
                                          : "#22c55e"
                                        : "var(--text-tertiary)";
                                    return (
                                      <div
                                        key={code}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 4,
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: 10,
                                            color: "var(--text-secondary)",
                                            fontWeight: 600,
                                            minWidth: 52,
                                          }}
                                        >
                                          {liveQuotes[code]?.name ?? code}
                                        </span>
                                        {ytdStr && (
                                          <span
                                            style={{
                                              fontSize: 9,
                                              color: ytdColor,
                                              fontWeight: 700,
                                              background: `${ytdColor}18`,
                                              padding: "1px 4px",
                                              borderRadius: 3,
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            年 {ytdStr}
                                          </span>
                                        )}
                                        {m5Str && (
                                          <span
                                            style={{
                                              fontSize: 9,
                                              color: m5Color,
                                              fontWeight: 700,
                                              background: `${m5Color}18`,
                                              padding: "1px 4px",
                                              borderRadius: 3,
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            5月 {m5Str}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <div
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: lc.accent,
                                    opacity: 0.8,
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: lc.accent,
                                    fontWeight: 600,
                                  }}
                                >
                                  {nd.data.stocks.length} 家A股
                                </span>
                              </div>
                            </button>
                          );
                        };
                        return (
                          <>
                            {grouped.map((grp) => (
                              <div
                                key={grp.name}
                                style={{
                                  position: "relative",
                                  border: `1px solid ${lc.accent}44`,
                                  borderRadius: 10,
                                  padding: "18px 12px 10px",
                                  background: `${lc.accent}06`,
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 8,
                                  alignItems: "flex-start",
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    top: -9,
                                    left: 10,
                                    background: `${lc.accent}22`,
                                    border: `1px solid ${lc.accent}55`,
                                    color: lc.accent,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: "1px 8px",
                                    borderRadius: 4,
                                    whiteSpace: "nowrap",
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  {grp.name}
                                </div>
                                {grp.nodes.map(renderNode)}
                              </div>
                            ))}
                            {ungrouped.map(renderNode)}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 4px 16px #00000066",
            zIndex: 10,
          }}
        >
          <CtrlBtn
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}
            title="放大"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle
                cx="7"
                cy="7"
                r="6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="4"
                y1="7"
                x2="10"
                y2="7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="7"
                y1="4"
                x2="7"
                y2="10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </CtrlBtn>
          <CtrlBtn
            onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(1)))}
            title="缩小"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle
                cx="7"
                cy="7"
                r="6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="4"
                y1="7"
                x2="10"
                y2="7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </CtrlBtn>
          <CtrlBtn onClick={() => setZoom(1)} title="重置缩放">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 7C2 4.24 4.24 2 7 2c1.66 0 3.13.8 4.07 2.04M12 7c0 2.76-2.24 5-5 5-1.66 0-3.13-.8-4.07-2.04"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path d="M10.5 2.5L11.5 4.5H9.5L10.5 2.5Z" fill="currentColor" />
            </svg>
          </CtrlBtn>
        </div>
      </div>
    </div>
  );
}
// ─── Shared Right Panel ───────────────────────────────────────────────────────

interface RightPanelItem {
  id: string;
  label: string;
  icon?: string;
  desc: string;
  layer: ComponentData["layer"];
  stocks: string[];
  ticker?: string;
}

// ─── Overview View ────────────────────────────────────────────────────────────

const OVERVIEW_INDUSTRIES = [
  {
    id: "aigpu",
    label: "AI算力芯片",
    icon: "🔮",
    color: "#a78bfa",
    reps: ["寒武纪", "海光信息", "英伟达"],
    x: 560,
    y: 0,
  },
  {
    id: "memory",
    label: "存储芯片\nHBM/DRAM",
    icon: "💾",
    color: "#38bdf8",
    reps: ["SK海力士", "澜起科技", "兆易创新"],
    x: 980,
    y: 0,
  },
  {
    id: "pcb",
    label: "PCB\n印制电路板",
    icon: "🟦",
    color: "#34d399",
    reps: ["深南电路", "胜宏科技", "沪电股份"],
    x: 200,
    y: 220,
  },
  {
    id: "mlcc",
    label: "MLCC\n被动元件",
    icon: "🟡",
    color: "#fbbf24",
    reps: ["风华高科", "三环集团", "村田"],
    x: 620,
    y: 220,
  },
  {
    id: "coppercable",
    label: "高速铜连接\nDAC/AEC",
    icon: "🔗",
    color: "#f97316",
    reps: ["沃尔核材", "兆龙互连", "Credo"],
    x: 1060,
    y: 220,
  },
  {
    id: "optics",
    label: "光模块/CPO",
    icon: "💡",
    color: "#06b6d4",
    reps: ["中际旭创", "天孚通信", "新易盛"],
    x: 350,
    y: 440,
  },
  {
    id: "fiber",
    label: "光纤光缆",
    icon: "🌐",
    color: "#10b981",
    reps: ["长飞光纤", "亨通光电", "中天科技"],
    x: 840,
    y: 440,
  },
  {
    id: "liquidcool",
    label: "液冷散热",
    icon: "❄️",
    color: "#818cf8",
    reps: ["英维克", "高澜股份", "曙光数创"],
    x: 200,
    y: 660,
  },
  {
    id: "aipower",
    label: "AI供配电\nPSU/BBU",
    icon: "⚡",
    color: "#f59e0b",
    reps: ["麦格米特", "欧陆通", "蔚蓝锂芯"],
    x: 640,
    y: 660,
  },
  {
    id: "idc",
    label: "智算中心/IDC",
    icon: "🏢",
    color: "#e879f9",
    reps: ["润泽科技", "奥飞数据", "光环新网"],
    x: 1060,
    y: 660,
  },
  {
    id: "glasssub",
    label: "玻璃基板\n半导体封装",
    icon: "🔷",
    color: "#64748b",
    reps: ["洛阳玻璃", "彩虹股份", "深南电路"],
    x: 1350,
    y: 220,
  },
  {
    id: "aiserver",
    label: "AI服务器\n整机",
    icon: "🖥️",
    color: "#f43f5e",
    reps: ["工业富联", "浪潮信息", "中科曙光"],
    x: 560,
    y: 880,
  },
  {
    id: "semieq",
    label: "半导体设备",
    icon: "⚙️",
    color: "#6366f1",
    reps: ["北方华创", "中微公司", "华海清科"],
    x: 980,
    y: 880,
  },
];

const OVERVIEW_EDGES_DEF = [
  { src: "aigpu", tgt: "pcb", label: "GPU芯片→PCB承载" },
  { src: "aigpu", tgt: "mlcc", label: "AI主板用MLCC" },
  { src: "aigpu", tgt: "coppercable", label: "GPU-Switch铜互联" },
  { src: "memory", tgt: "aigpu", label: "HBM直连GPU" },
  { src: "memory", tgt: "pcb", label: "内存模组PCB" },
  { src: "pcb", tgt: "optics", label: "光模块PCB载板" },
  { src: "pcb", tgt: "liquidcool", label: "冷板承载PCB" },
  { src: "mlcc", tgt: "aipower", label: "电源滤波MLCC" },
  { src: "coppercable", tgt: "optics", label: "机柜内光铜互补" },
  { src: "optics", tgt: "fiber", label: "光模块驱动光纤" },
  { src: "optics", tgt: "idc", label: "光互联入IDC" },
  { src: "fiber", tgt: "idc", label: "骨干光缆接入" },
  { src: "liquidcool", tgt: "idc", label: "液冷部署IDC" },
  { src: "aipower", tgt: "idc", label: "供配电支撑IDC" },
  { src: "aigpu", tgt: "idc", label: "GPU装入算力中心" },
  { src: "glasssub", tgt: "pcb", label: "IC载板→PCB基材" },
  { src: "glasssub", tgt: "aigpu", label: "先进封装基板" },
  { src: "aigpu", tgt: "aiserver", label: "GPU装入服务器" },
  { src: "memory", tgt: "aiserver", label: "HBM/DDR内存集成" },
  { src: "pcb", tgt: "aiserver", label: "AI加速卡PCB" },
  { src: "optics", tgt: "aiserver", label: "光模块集成" },
  { src: "liquidcool", tgt: "aiserver", label: "液冷整机配套" },
  { src: "semieq", tgt: "aigpu", label: "先进制程设备" },
  { src: "semieq", tgt: "memory", label: "存储制造设备" },
  { src: "aiserver", tgt: "idc", label: "整机部署算力中心" },
];

type AnimStep = { icon: string; label: string; color: string; sub?: string };
type EdgeAnim = {
  title: string;
  desc: string;
  analogy: string;
  whyMatters: string;
  steps: AnimStep[];
  tags: { term: string; plain: string }[];
};

const EDGE_ANIMATIONS: Record<string, EdgeAnim> = {
  "aigpu->pcb": {
    title: "GPU芯片 → 电路板",
    desc: "GPU芯片必须焊在一块电路板上才能使用，就像CPU需要主板一样。AI加速卡就是把GPU和高级电路板合在一起的产品。",
    analogy:
      "就像手机芯片必须焊在手机主板上才能工作——电路板是芯片的'家'，给它供电、连接其他零件。",
    whyMatters:
      "GPU越卖越好，电路板需求就越大。GPU订单增加 → 电路板厂商订单也增加 → 相关股票涨。",
    steps: [
      {
        icon: "🔮",
        label: "GPU芯片",
        color: "#a78bfa",
        sub: "AI计算的核心大脑",
      },
      {
        icon: "⬇",
        label: "焊接上板",
        color: "#f5a623",
        sub: "用锡球把芯片固定在板上",
      },
      {
        icon: "🟦",
        label: "AI加速卡电路板",
        color: "#34d399",
        sub: "专为高速AI运算设计的板子",
      },
      {
        icon: "⬇",
        label: "插入服务器",
        color: "#818cf8",
        sub: "像插显卡一样装进服务器",
      },
      {
        icon: "🖥",
        label: "AI服务器整机",
        color: "#94a3b8",
        sub: "卖给数据中心使用",
      },
    ],
    tags: [
      { term: "BGA封装", plain: "芯片底部焊球连接" },
      { term: "高速差分", plain: "高速信号传输方式" },
      { term: "阻抗控制", plain: "信号不失真的关键" },
    ],
  },
  "aigpu->mlcc": {
    title: "GPU芯片 → 小电容",
    desc: "每块AI加速卡上密密麻麻贴着数千颗芝麻大小的电容，专门防止GPU供电忽大忽小、保持稳定。",
    analogy:
      "就像汽车油箱旁边的缓冲装置——让发动机不会因为油压突变而抖动。这种小电容就是GPU供电的'缓冲垫'。",
    whyMatters:
      "一块GPU加速卡要用几千颗这样的小电容，AI服务器订单爆发 → 小电容需求暴增 → 相关公司业绩大涨。",
    steps: [
      {
        icon: "🔮",
        label: "GPU芯片工作",
        color: "#a78bfa",
        sub: "用电量每秒急剧变化",
      },
      {
        icon: "⬇",
        label: "供电出现波动",
        color: "#f59e0b",
        sub: "电压忽高忽低会损坏芯片",
      },
      {
        icon: "🟡",
        label: "MLCC小电容",
        color: "#fbbf24",
        sub: "芝麻大小，贴在GPU旁边",
      },
      {
        icon: "⬇",
        label: "吸收波动",
        color: "#f5a623",
        sub: "像海绵一样吸收电压抖动",
      },
      {
        icon: "⚡",
        label: "GPU稳定运行",
        color: "#10b981",
        sub: "供电平稳不出错",
      },
    ],
    tags: [
      { term: "去耦滤波", plain: "消除供电杂音" },
      { term: "高频低ESL", plain: "高速响应不失效" },
      { term: "大容量", plain: "能存更多电能缓冲" },
    ],
  },
  "aigpu->coppercable": {
    title: "GPU集群 → 短距铜缆",
    desc: "同一个机柜或相邻机柜里的GPU之间，用铜缆连接比用光纤更便宜、速度一样快。",
    analogy:
      "就像家里路由器和电脑之间用网线连——距离近的时候，普通网线比光纤更划算。",
    whyMatters:
      "AI数据中心大量建设 → 机柜内短距离连接需求激增 → 铜缆厂商订单暴涨。",
    steps: [
      {
        icon: "🔮",
        label: "GPU服务器",
        color: "#a78bfa",
        sub: "需要与旁边的GPU快速通信",
      },
      {
        icon: "⬇",
        label: "选择连接方式",
        color: "#94a3b8",
        sub: "3米以内用铜缆更划算",
      },
      {
        icon: "🔗",
        label: "高速铜缆",
        color: "#f97316",
        sub: "专用高速铜缆，非普通网线",
      },
      {
        icon: "⬇",
        label: "接入交换机",
        color: "#64748b",
        sub: "所有GPU通过交换机互联",
      },
      {
        icon: "🌐",
        label: "GPU集群网络",
        color: "#06b6d4",
        sub: "几百甚至几千个GPU协同工作",
      },
    ],
    tags: [
      { term: "DAC直连", plain: "铜缆直接连两端" },
      { term: "超低时延", plain: "信号几乎无延迟" },
      { term: "机柜内互联", plain: "同一个柜子里连接" },
    ],
  },
  "memory->aigpu": {
    title: "存储芯片 → GPU超高速内存",
    desc: "AI训练需要超快的内存，HBM内存芯片被叠放在GPU旁边、几乎紧贴在一起，速度比普通内存快10倍以上。",
    analogy:
      "就像把书桌从隔壁房间搬到手边——内存离GPU越近、越多层叠放，AI计算就越快。",
    whyMatters:
      "每块H100 GPU需要配80GB HBM，算力越强需要的HBM越多。HBM是AI芯片的'黄金搭档'，供不应求。",
    steps: [
      {
        icon: "💾",
        label: "HBM内存芯片",
        color: "#38bdf8",
        sub: "多层叠放，容量是普通内存数倍",
      },
      {
        icon: "⬇",
        label: "垂直打通孔",
        color: "#818cf8",
        sub: "上下层之间打通微小孔洞传信号",
      },
      {
        icon: "🔷",
        label: "硅中介层",
        color: "#64748b",
        sub: "像砧板一样承托GPU和内存",
      },
      {
        icon: "⬇",
        label: "微小焊点连接",
        color: "#f5a623",
        sub: "比头发丝还细的焊点固定",
      },
      {
        icon: "🔮",
        label: "GPU Die",
        color: "#a78bfa",
        sub: "与内存紧密相连，传输极快",
      },
    ],
    tags: [
      { term: "2.5D封装", plain: "芯片并排贴近封装" },
      { term: "TSV通孔", plain: "垂直打孔传信号" },
      { term: "超宽带宽", plain: "数据传输超级快" },
    ],
  },
  "memory->pcb": {
    title: "内存芯片 → 内存条",
    desc: "散装内存芯片需要焊在内存条电路板上，才能插进服务器使用。AI服务器内存容量比普通电脑大10倍以上。",
    analogy:
      "就像电池单独放着没法用，装进手电筒（内存条PCB）才能正常供电——内存条是内存芯片的'载具'。",
    whyMatters:
      "AI服务器配置超大内存 → 带动DDR5内存条需求 → 内存芯片和内存条厂商双双受益。",
    steps: [
      {
        icon: "💾",
        label: "内存芯片颗粒",
        color: "#38bdf8",
        sub: "一颗颗小方块，存储数据",
      },
      {
        icon: "⬇",
        label: "贴片焊接",
        color: "#94a3b8",
        sub: "用机器把芯片精准贴在板子两面",
      },
      {
        icon: "🟦",
        label: "内存条电路板",
        color: "#34d399",
        sub: "一根长条板，可插入服务器",
      },
      {
        icon: "⬇",
        label: "金手指插槽",
        color: "#f5a623",
        sub: "板子边缘的金色接触点",
      },
      {
        icon: "🖥",
        label: "AI服务器主板",
        color: "#818cf8",
        sub: "每台服务器装多根大容量内存",
      },
    ],
    tags: [
      { term: "DDR5", plain: "最新一代内存规格" },
      { term: "ECC校验", plain: "自动纠错防数据损坏" },
      { term: "高密度", plain: "单条容量更大" },
    ],
  },
  "pcb->optics": {
    title: "电路板 → 光模块",
    desc: "光模块内部有一小块特殊电路板，上面装着把电信号变成光信号的激光器。没有这块板子，光模块就无法工作。",
    analogy:
      "就像手电筒需要电路板控制亮度——光模块里的电路板控制激光的开关和强弱，把网络信号变成光脉冲。",
    whyMatters:
      "数据中心大量采购光模块 → 对特殊电路板需求激增 → 能做高频光模块电路板的企业订单爆发。",
    steps: [
      {
        icon: "🟦",
        label: "光模块专用电路板",
        color: "#34d399",
        sub: "用特殊材料，信号损耗极低",
      },
      {
        icon: "⬇",
        label: "焊接激光驱动芯片",
        color: "#818cf8",
        sub: "控制激光器的大脑",
      },
      {
        icon: "💡",
        label: "激光器",
        color: "#06b6d4",
        sub: "把电信号变成光脉冲",
      },
      {
        icon: "⬇",
        label: "封装成模块",
        color: "#94a3b8",
        sub: "热插拔，可随时换",
      },
      {
        icon: "🌐",
        label: "接入光纤网络",
        color: "#10b981",
        sub: "连接机房内外的光纤",
      },
    ],
    tags: [
      { term: "低损耗PCB", plain: "信号传输不失真" },
      { term: "光电集成", plain: "光和电在同一块板上" },
      { term: "高速SerDes", plain: "超高速数据收发" },
    ],
  },
  "pcb->liquidcool": {
    title: "电路板 → 液冷散热",
    desc: "GPU电路板发热极大，液冷板直接贴在板背面带走热量，就像给发烫的板子贴上'冰袋'。",
    analogy:
      "就像发烧时贴退烧贴——液冷板紧贴GPU电路板背面，用流动的冷水把热量带走，比风扇高效10倍。",
    whyMatters:
      "GPU功耗越来越高，液冷成为必须 → AI数据中心每个机柜都需要液冷 → 液冷设备厂商迎来爆发期。",
    steps: [
      {
        icon: "🟦",
        label: "GPU电路板",
        color: "#34d399",
        sub: "满载运行时发热超过700瓦",
      },
      {
        icon: "⬇",
        label: "涂导热硅脂",
        color: "#f5a623",
        sub: "让热量更好地从板传到冷板",
      },
      {
        icon: "❄️",
        label: "液冷冷板",
        color: "#818cf8",
        sub: "贴着板背，内部有细小水道",
      },
      {
        icon: "⬇",
        label: "冷却液循环",
        color: "#06b6d4",
        sub: "水或防冻液不断流动带走热",
      },
      {
        icon: "🏢",
        label: "冷却设备",
        color: "#94a3b8",
        sub: "最终把热量散到室外",
      },
    ],
    tags: [
      { term: "直接液冷", plain: "冷板直接接触发热源" },
      { term: "微通道", plain: "冷板内密集细小水道" },
      { term: "PUE<1.1", plain: "用电效率极高" },
    ],
  },
  "mlcc->aipower": {
    title: "小电容 → 电源模块",
    desc: "给AI服务器供电的电源模块里，大量使用小电容来稳定电压，就像电源里的'稳压器'。",
    analogy:
      "就像家用稳压器防止电压波动——电源模块里的小电容把波动的市电整理成平稳的直流电，才能给GPU安全供电。",
    whyMatters:
      "一台AI服务器要用几十个电源模块，每个模块需要数百颗小电容 → 电源需求暴增带动小电容需求同步暴增。",
    steps: [
      {
        icon: "🟡",
        label: "大容量小电容",
        color: "#fbbf24",
        sub: "耐高温、高容量规格",
      },
      {
        icon: "⬇",
        label: "装入电源模块",
        color: "#f59e0b",
        sub: "输入输出端各装一批",
      },
      {
        icon: "⚡",
        label: "AI服务器电源",
        color: "#f59e0b",
        sub: "把220V变成GPU需要的低压",
      },
      {
        icon: "⬇",
        label: "精细调压",
        color: "#f5a623",
        sub: "多级降压到GPU所需电压",
      },
      {
        icon: "🔮",
        label: "GPU稳定供电",
        color: "#a78bfa",
        sub: "电压稳定，不损坏芯片",
      },
    ],
    tags: [
      { term: "纹波滤波", plain: "消除电源杂波" },
      { term: "高频电源", plain: "高速开关供电" },
      { term: "低ESR", plain: "内阻低，损耗少" },
    ],
  },
  "coppercable->optics": {
    title: "铜缆 ↔ 光模块互补",
    desc: "短距离（3米以内）用铜缆，长距离用光模块——两者像接力棒一样，分工覆盖不同场景。",
    analogy:
      "就像短途骑自行车、长途坐高铁——铜缆和光模块各有优势，覆盖不同距离，缺一不可。",
    whyMatters:
      "数据中心同时需要铜缆和光模块 → 两个行业都有订单 → 关注哪个比例更大决定哪个更受益。",
    steps: [
      {
        icon: "🔗",
        label: "铜缆（3米内）",
        color: "#f97316",
        sub: "成本低，不需要光电转换",
      },
      {
        icon: "⬇⬆",
        label: "根据距离选择",
        color: "#94a3b8",
        sub: "同一接口，灵活切换",
      },
      {
        icon: "💡",
        label: "光模块（3米以上）",
        color: "#06b6d4",
        sub: "最远可达2公里",
      },
      {
        icon: "⬇",
        label: "统一接口插槽",
        color: "#64748b",
        sub: "两种都能插，无需改交换机",
      },
      {
        icon: "🌐",
        label: "数据中心网络",
        color: "#10b981",
        sub: "灵活覆盖各种距离需求",
      },
    ],
    tags: [
      { term: "光铜互补", plain: "各管各的距离范围" },
      { term: "距离选择", plain: "近铜远光" },
      { term: "同一接口", plain: "两种线都能插同一口" },
    ],
  },
  "optics->fiber": {
    title: "光模块 → 光纤光缆",
    desc: "光模块把电信号变成光，然后光信号通过光纤跑到几公里甚至几百公里外的另一个机房。",
    analogy:
      "就像路灯（光模块）发光，光通过玻璃管道（光纤）传到远处——光模块负责发光，光纤负责传光。",
    whyMatters:
      "数据中心之间需要超大带宽互联 → 光模块和光纤需求同步增长 → 两个产业链同时受益AI基建浪潮。",
    steps: [
      {
        icon: "💡",
        label: "光模块发光",
        color: "#06b6d4",
        sub: "把网络信号变成光脉冲",
      },
      {
        icon: "⬇",
        label: "光纤接头连接",
        color: "#94a3b8",
        sub: "专用接头插入光纤端口",
      },
      {
        icon: "🌐",
        label: "光纤",
        color: "#10b981",
        sub: "比头发细的玻璃丝，传光极快",
      },
      {
        icon: "⬇",
        label: "信号放大中继",
        color: "#818cf8",
        sub: "长距离中途补充信号强度",
      },
      {
        icon: "🏢",
        label: "目标机房接收",
        color: "#e879f9",
        sub: "跨城甚至跨国数据互通",
      },
    ],
    tags: [
      { term: "单模光纤", plain: "适合长距离传输" },
      { term: "低损耗", plain: "光信号跑很远不衰减" },
      { term: "长距传输", plain: "几百公里不失真" },
    ],
  },
  "optics->idc": {
    title: "光模块 → 数据中心互联",
    desc: "数据中心内部几千台服务器之间的通信，几乎全靠光模块连接，是机房里用量最大的网络器件。",
    analogy:
      "就像城市道路系统——光模块是路口的交通灯和指路牌，确保数据'车辆'不堵塞、快速到达目的地。",
    whyMatters:
      "一个万卡AI集群需要数万个光模块 → 数据中心投资规模越大，光模块用量越惊人 → 直接拉动业绩。",
    steps: [
      {
        icon: "💡",
        label: "高速光模块",
        color: "#06b6d4",
        sub: "800G规格，一秒传800GB数据",
      },
      {
        icon: "⬇",
        label: "接入架顶交换机",
        color: "#34d399",
        sub: "每个机架顶部的汇聚交换机",
      },
      {
        icon: "⬇",
        label: "汇入核心交换机",
        color: "#818cf8",
        sub: "整个机房的流量核心",
      },
      {
        icon: "⬇",
        label: "超级骨干层",
        color: "#a78bfa",
        sub: "连接多个机房区域",
      },
      {
        icon: "🏢",
        label: "全光数据中心",
        color: "#e879f9",
        sub: "总带宽超过100万亿比特每秒",
      },
    ],
    tags: [
      { term: "CPO共封装", plain: "光模块直接焊在芯片旁" },
      { term: "全光网络", plain: "全部用光纤连接" },
      { term: "低时延", plain: "数据传输几乎无延迟" },
    ],
  },
  "fiber->idc": {
    title: "光纤光缆 → 数据中心骨干",
    desc: "数据中心园区内所有机房之间，用大量光纤光缆组成高速'信息高速公路'，传输海量数据。",
    analogy:
      "就像城市地下的自来水管网——光纤光缆是数据中心的'数据管道'，几乎所有信息都流经这里。",
    whyMatters:
      "大型数据中心园区动辄铺设几千公里光纤 → AI基建潮带动光纤光缆需求长期高增长。",
    steps: [
      {
        icon: "🌐",
        label: "大容量光缆",
        color: "#10b981",
        sub: "一根缆内含上千根光纤",
      },
      {
        icon: "⬇",
        label: "配线架管理",
        color: "#94a3b8",
        sub: "统一管理机房内光纤连接",
      },
      {
        icon: "⬇",
        label: "波分复用设备",
        color: "#818cf8",
        sub: "一根光纤同时传多路信号",
      },
      {
        icon: "⬇",
        label: "光传输网络",
        color: "#06b6d4",
        sub: "高速长距离稳定传输",
      },
      {
        icon: "🏢",
        label: "各数据中心节点",
        color: "#e879f9",
        sub: "多个机房互联互通",
      },
    ],
    tags: [
      { term: "WDM波分", plain: "一根光纤传多路信号" },
      { term: "预连接", plain: "提前做好接头的光缆" },
      { term: "骨干组网", plain: "机房之间的主干网络" },
    ],
  },
  "liquidcool->idc": {
    title: "液冷散热 → 数据中心节能",
    desc: "用液冷代替风冷，数据中心耗电量可降低30%，同样的电费能跑更多AI计算。",
    analogy:
      "就像换用节能空调——液冷让数据中心从'电老虎'变成'节能达人'，同样的电费能多跑30%算力。",
    whyMatters:
      "国家要求数据中心节能 + 电费是运营最大成本 → 液冷成为新建数据中心的标配 → 液冷设备需求长期增长。",
    steps: [
      {
        icon: "❄️",
        label: "液冷冷板/浸没槽",
        color: "#818cf8",
        sub: "直接带走GPU热量",
      },
      {
        icon: "⬇",
        label: "机架级冷量分配",
        color: "#38bdf8",
        sub: "每个机架统一分配冷水",
      },
      {
        icon: "⬇",
        label: "楼层级热交换",
        color: "#06b6d4",
        sub: "把热水变回冷水循环",
      },
      {
        icon: "⬇",
        label: "冷却塔最终散热",
        color: "#10b981",
        sub: "把热量散到室外空气",
      },
      {
        icon: "🏢",
        label: "节能数据中心",
        color: "#e879f9",
        sub: "用电效率极高，绿色环保",
      },
    ],
    tags: [
      { term: "PUE<1.1", plain: "电能几乎全用于计算" },
      { term: "浸没/直冷", plain: "两种主流液冷方式" },
      { term: "绿色IDC", plain: "低碳节能数据中心" },
    ],
  },
  "aipower->idc": {
    title: "供配电系统 → 数据中心用电",
    desc: "数据中心的电从市电进来，经过多次变压和备电，最终稳稳地送到每块GPU，供配电是整个机房的生命线。",
    analogy:
      "就像小区配电房——市电进来后降压、过滤、备用电池兜底，最后干净稳定的电才送到每家每户（每个GPU）。",
    whyMatters:
      "一个大型AI数据中心用电量相当于一个县城 → 供配电设备采购量巨大 → 电源相关企业订单大幅增长。",
    steps: [
      {
        icon: "⚡",
        label: "高压市电进线",
        color: "#f59e0b",
        sub: "10千伏高压从电网引入",
      },
      {
        icon: "⬇",
        label: "备用电池保障",
        color: "#f5a623",
        sub: "停电时电池顶上，不间断供电",
      },
      {
        icon: "⬇",
        label: "高效直流母线",
        color: "#fbbf24",
        sub: "统一用48V直流分配更省电",
      },
      {
        icon: "⬇",
        label: "服务器电源模块",
        color: "#f59e0b",
        sub: "再降压到GPU能用的低压",
      },
      {
        icon: "🏢",
        label: "GPU稳定供电",
        color: "#e879f9",
        sub: "全年不停机，算力不中断",
      },
    ],
    tags: [
      { term: "HVDC高压直流", plain: "高效直流配电方式" },
      { term: "BBU锂电", plain: "机柜级锂电备用电源" },
      { term: "高效供电", plain: "损耗极低，省电省钱" },
    ],
  },
  "aigpu->idc": {
    title: "GPU芯片 → 智算中心",
    desc: "GPU是AI算力的核心，从一颗芯片到一台服务器，再到一个机架，最终组成能训练大模型的智算中心。",
    analogy:
      "就像砖头→房间→楼层→大厦——GPU是'砖头'，一块块堆起来就是能跑大模型的'算力大厦'。",
    whyMatters:
      "AI大模型需求爆发 → 训练一个模型需要成千上万块GPU → 智算中心建设潮直接带动GPU及整个产业链。",
    steps: [
      {
        icon: "🔮",
        label: "GPU芯片",
        color: "#a78bfa",
        sub: "AI计算的最小单元",
      },
      {
        icon: "⬇",
        label: "装成AI加速卡",
        color: "#818cf8",
        sub: "H100/A100等产品形态",
      },
      {
        icon: "⬇",
        label: "8块卡组成服务器",
        color: "#64748b",
        sub: "一台AI服务器算力极强",
      },
      {
        icon: "⬇",
        label: "几十台装一个机架",
        color: "#94a3b8",
        sub: "高密度机架，节省空间",
      },
      {
        icon: "🏢",
        label: "万卡智算中心",
        color: "#e879f9",
        sub: "可训练GPT-4级别大模型",
      },
    ],
    tags: [
      { term: "HGX平台", plain: "英伟达多GPU服务器方案" },
      { term: "万卡集群", plain: "上万块GPU协同工作" },
      { term: "算力即服务", plain: "租用算力，无需买硬件" },
    ],
  },
  "glasssub->pcb": {
    title: "玻璃基板 → 高端电路板",
    desc: "玻璃做成的基板比传统塑料基板更平整、更稳定，用来承载最精密的芯片封装，是下一代先进电路板的核心材料。",
    analogy:
      "就像换用石英玻璃做砧板代替木头砧板——玻璃更平整、不变形，让芯片焊接更精准、连接更可靠。",
    whyMatters:
      "AI芯片越来越先进，对基板要求越来越高 → 玻璃基板是未来方向 → 能做玻璃基板的公司有先发优势。",
    steps: [
      {
        icon: "🔷",
        label: "玻璃核心基材",
        color: "#64748b",
        sub: "受热不变形，极度平整",
      },
      {
        icon: "⬇",
        label: "激光打微孔",
        color: "#94a3b8",
        sub: "用激光在玻璃上打出微小通孔",
      },
      {
        icon: "⬇",
        label: "铜填充导电",
        color: "#f5a623",
        sub: "把铜填进孔里，形成导电通路",
      },
      {
        icon: "⬇",
        label: "布线层制作",
        color: "#fbbf24",
        sub: "在玻璃上刻出精细电路线路",
      },
      {
        icon: "🟦",
        label: "高端芯片封装基板",
        color: "#34d399",
        sub: "承载最先进的AI芯片",
      },
    ],
    tags: [
      { term: "TGV激光孔", plain: "激光在玻璃上打孔" },
      { term: "低CTE", plain: "受热几乎不膨胀" },
      { term: "高平整度", plain: "比塑料板平整100倍" },
    ],
  },
  "glasssub->aigpu": {
    title: "玻璃基板 → GPU先进封装",
    desc: "玻璃基板作为GPU和内存芯片之间的'中间桥梁'，让两者可以紧密排列、高速互联，是AI芯片封装的未来方向。",
    analogy:
      "就像精密手表的表盘底板——玻璃基板为GPU和HBM内存提供超精准的'安装底板'，精度比头发丝还细。",
    whyMatters:
      "英特尔、英伟达、台积电都在研究玻璃基板 → 一旦量产，国内玻璃基板厂商将获得巨大订单机会。",
    steps: [
      {
        icon: "🔷",
        label: "玻璃基板",
        color: "#64748b",
        sub: "超平整，热稳定性极好",
      },
      {
        icon: "⬇",
        label: "精细布线",
        color: "#f5a623",
        sub: "在玻璃上刻出比头发细的电路",
      },
      {
        icon: "⬇",
        label: "通孔信号传递",
        color: "#94a3b8",
        sub: "上下层信号穿过玻璃互通",
      },
      {
        icon: "⬇",
        label: "铜柱焊接芯片",
        color: "#fbbf24",
        sub: "把GPU和内存固定在基板上",
      },
      {
        icon: "🔮",
        label: "GPU+HBM封装整体",
        color: "#a78bfa",
        sub: "最先进的2.5D/3D封装形态",
      },
    ],
    tags: [
      { term: "CoWoS封装", plain: "台积电先进封装技术" },
      { term: "2.5D集成", plain: "芯片并排贴近封装" },
      { term: "超低损耗", plain: "信号传输几乎无损失" },
    ],
  },
  "semieq->aigpu": {
    title: "半导体设备 → AI芯片制造",
    desc: "光刻机、刻蚀机、CVD等半导体设备是AI芯片从设计图纸变成实体的必备工具，没有先进设备就无法制造先进芯片。",
    analogy:
      "就像没有精密机床就造不出汽车发动机——半导体设备是制造AI芯片的'工厂母机'，决定了芯片的制程精度上限。",
    whyMatters:
      "AI芯片需求爆发 → 台积电/中芯大幅扩产 → 设备订单激增 → 北方华创/中微公司等国产设备商直接受益。",
    steps: [
      {
        icon: "⚙️",
        label: "半导体设备",
        color: "#6366f1",
        sub: "光刻/刻蚀/CVD/CMP全套",
      },
      {
        icon: "⬇",
        label: "晶圆制程",
        color: "#94a3b8",
        sub: "在硅片上一层层刻出电路",
      },
      {
        icon: "⬇",
        label: "先进制程节点",
        color: "#f5a623",
        sub: "7nm/5nm/3nm越来越精细",
      },
      {
        icon: "⬇",
        label: "AI芯片晶圆",
        color: "#a78bfa",
        sub: "百亿晶体管集成在指甲盖上",
      },
      {
        icon: "🔮",
        label: "GPU/AI芯片",
        color: "#a78bfa",
        sub: "H100/B200算力核心",
      },
    ],
    tags: [
      { term: "光刻机", plain: "用光线在硅片上刻电路的设备" },
      { term: "刻蚀机", plain: "精确去除多余材料的设备" },
      { term: "国产替代", plain: "减少对ASML等海外设备依赖" },
    ],
  },
  "semieq->memory": {
    title: "半导体设备 → 存储芯片制造",
    desc: "HBM/DRAM/NAND的生产同样依赖光刻、刻蚀、CMP等全套半导体设备，存储芯片扩产直接带动设备需求。",
    analogy:
      "就像印刷厂的印刷机——CMP、CVD等设备决定了存储颗粒的层数和密度，设备越好存储容量越大。",
    whyMatters:
      "长鑫存储/长江存储扩产 + SK海力士HBM3E产能扩张 → 国产设备商订单大幅增加。",
    steps: [
      {
        icon: "⚙️",
        label: "CMP/CVD设备",
        color: "#6366f1",
        sub: "华海清科/拓荆科技供应",
      },
      {
        icon: "⬇",
        label: "存储堆叠制程",
        color: "#94a3b8",
        sub: "HBM 12层堆叠精细工艺",
      },
      {
        icon: "⬇",
        label: "存储晶圆",
        color: "#38bdf8",
        sub: "DRAM/NAND存储颗粒",
      },
      { icon: "⬇", label: "封测组装", color: "#f5a623", sub: "颗粒封装成模组" },
      {
        icon: "💾",
        label: "HBM/DRAM模组",
        color: "#38bdf8",
        sub: "AI服务器标配内存",
      },
    ],
    tags: [
      { term: "HBM堆叠", plain: "内存芯片垂直堆叠技术" },
      { term: "CMP平坦化", plain: "让每层表面绝对平整" },
      { term: "国产DRAM", plain: "长鑫存储自主DRAM" },
    ],
  },
  "aigpu->aiserver": {
    title: "AI芯片 → AI服务器整机",
    desc: "GPU/AI芯片是AI服务器的大脑，工业富联、浪潮信息等ODM厂商把GPU和PCB、内存、散热、电源组装成完整的AI服务器产品。",
    analogy:
      "就像发动机装入汽车——GPU是发动机，AI服务器是整车，ODM厂商是汽车组装工厂。",
    whyMatters:
      "英伟达GB200出货量 → 直接决定工业富联/浪潮信息的AI服务器组装订单，一比一强绑定关系。",
    steps: [
      {
        icon: "🔮",
        label: "GPU/AI芯片",
        color: "#a78bfa",
        sub: "H100/B200/国产AI芯片",
      },
      {
        icon: "⬇",
        label: "装入加速卡",
        color: "#f5a623",
        sub: "GPU焊在PCB上成AI加速卡",
      },
      {
        icon: "⬇",
        label: "整机组装",
        color: "#f43f5e",
        sub: "8卡/16卡装入机箱",
      },
      {
        icon: "⬇",
        label: "液冷+供电集成",
        color: "#818cf8",
        sub: "液冷散热+GB200供配电",
      },
      {
        icon: "🖥️",
        label: "AI服务器整机",
        color: "#f43f5e",
        sub: "DGX H100/GB200 NVL72",
      },
    ],
    tags: [
      { term: "ODM代工", plain: "原始设计制造商，按规格生产" },
      { term: "MGX认证", plain: "英伟达官方服务器设计规范" },
      { term: "NVL72机柜", plain: "72块GPU组成的超算机柜" },
    ],
  },
  "memory->aiserver": {
    title: "存储芯片 → AI服务器内存",
    desc: "HBM内存直接封装在GPU旁边，DDR5/LPDDR5作为主内存，每台AI服务器需要数TB内存，存储是AI服务器最重要的配套组件之一。",
    analogy:
      "就像电脑的内存条——没有足够大的内存，再强的GPU也无法处理大模型的海量参数。",
    whyMatters:
      "AI大模型参数量越来越大 → 需要更多HBM和DDR内存 → 澜起科技内存接口芯片、佰维存储模组订单暴增。",
    steps: [
      {
        icon: "💾",
        label: "HBM/DDR内存",
        color: "#38bdf8",
        sub: "SK海力士HBM3E+DDR5",
      },
      {
        icon: "⬇",
        label: "内存接口芯片",
        color: "#06b6d4",
        sub: "澜起科技RCD/MXC芯片",
      },
      {
        icon: "⬇",
        label: "内存模组",
        color: "#38bdf8",
        sub: "DIMM/HBM封装组件",
      },
      {
        icon: "⬇",
        label: "装入服务器主板",
        color: "#f43f5e",
        sub: "插槽/焊接集成",
      },
      {
        icon: "🖥️",
        label: "AI服务器整机",
        color: "#f43f5e",
        sub: "内存带宽决定AI算力上限",
      },
    ],
    tags: [
      { term: "HBM带宽", plain: "单GPU超3TB/s内存带宽" },
      { term: "DDR5", plain: "第五代双倍速率内存" },
      { term: "内存接口芯片", plain: "保证高速内存稳定读写" },
    ],
  },
  "pcb->aiserver": {
    title: "PCB → AI服务器主板/加速卡",
    desc: "AI服务器的主板、GPU加速卡、网络互联板全部基于高端PCB，深南电路、沪电股份等PCB厂直接供应AI服务器厂商。",
    analogy:
      "就像房子的地基和框架——PCB是AI服务器所有零件的'载体'，信号、电力都在PCB上传输。",
    whyMatters:
      "每台AI服务器需要多块高端PCB → 工业富联/浪潮订单增长 → 沪电/深南PCB出货同步增长。",
    steps: [
      {
        icon: "🟦",
        label: "AI服务器PCB",
        color: "#34d399",
        sub: "16层以上高速多层板",
      },
      {
        icon: "⬇",
        label: "贴片焊接",
        color: "#f5a623",
        sub: "CPU/GPU/内存焊接上板",
      },
      {
        icon: "⬇",
        label: "AI加速卡",
        color: "#34d399",
        sub: "GPU+HBM+NVLink组件",
      },
      {
        icon: "⬇",
        label: "系统总装",
        color: "#f43f5e",
        sub: "加速卡插入服务器主板",
      },
      {
        icon: "🖥️",
        label: "AI服务器整机",
        color: "#f43f5e",
        sub: "全部互联组成完整系统",
      },
    ],
    tags: [
      { term: "AI加速卡", plain: "GPU+PCB组成的算力插卡" },
      { term: "高速信号完整性", plain: "PCB确保高速信号不失真" },
      { term: "HDI高密互联", plain: "超细线路满足AI板高密度需求" },
    ],
  },
  "optics->aiserver": {
    title: "光模块 → AI服务器光互联",
    desc: "AI服务器机柜内GPU之间、机柜之间的高速互联大量使用光模块，400G/800G光模块是GB200 NVL72机柜的标配互联器件。",
    analogy:
      "就像高速公路的匝道——光模块把AI服务器内部和外部的数据高速传输，瓶颈决定整体AI训练速度。",
    whyMatters:
      "每套GB200 NVL72需要超过1000个光模块 → 中际旭创/新易盛等光模块厂直接受益。",
    steps: [
      {
        icon: "💡",
        label: "800G光模块",
        color: "#06b6d4",
        sub: "中际旭创/新易盛供应",
      },
      {
        icon: "⬇",
        label: "插入交换机/NIC",
        color: "#94a3b8",
        sub: "装入InfiniBand/以太网卡",
      },
      {
        icon: "⬇",
        label: "GPU间互联",
        color: "#06b6d4",
        sub: "NVLink/RoCE高速互联",
      },
      {
        icon: "⬇",
        label: "机柜间组网",
        color: "#f43f5e",
        sub: "Scale-out网络架构",
      },
      {
        icon: "🖥️",
        label: "AI服务器集群",
        color: "#f43f5e",
        sub: "万卡集群高速互联",
      },
    ],
    tags: [
      { term: "800G光模块", plain: "每秒传输800Gb数据的光器件" },
      { term: "CPO共封装", plain: "光模块直接集成在芯片旁" },
      { term: "InfiniBand", plain: "AI训练专用高速互联网络" },
    ],
  },
  "liquidcool->aiserver": {
    title: "液冷散热 → AI服务器热管理",
    desc: "GB200单颗GPU功耗超过1000W，风冷已无法满足散热需求，液冷（冷板式/浸没式）成为AI服务器标配，高澜/英维克等直接配套整机厂。",
    analogy:
      "就像赛车发动机的水冷系统——AI服务器产热量是普通服务器的5倍以上，必须用液体带走热量才能稳定运行。",
    whyMatters:
      "GB200强制采用液冷 → 整机厂必须配套液冷方案 → 工业富联与高澜/申菱环境深度绑定。",
    steps: [
      {
        icon: "❄️",
        label: "冷板/CDU液冷",
        color: "#818cf8",
        sub: "高澜股份/申菱环境",
      },
      {
        icon: "⬇",
        label: "紧贴GPU散热",
        color: "#94a3b8",
        sub: "冷板直接压在GPU上",
      },
      { icon: "⬇", label: "冷却液循环", color: "#818cf8", sub: "带走1kW+热量" },
      {
        icon: "⬇",
        label: "CDU热交换",
        color: "#6366f1",
        sub: "集中冷量分配单元",
      },
      {
        icon: "🖥️",
        label: "AI服务器整机",
        color: "#f43f5e",
        sub: "稳定运行不降频",
      },
    ],
    tags: [
      { term: "冷板式液冷", plain: "冷液在金属板内循环带走热量" },
      { term: "PUE", plain: "数据中心能耗效率指标" },
      { term: "TDP热功耗", plain: "芯片满负载的最大发热量" },
    ],
  },
  "aiserver->idc": {
    title: "AI服务器整机 → 智算中心部署",
    desc: "AI服务器是智算中心/IDC的核心设备，整机交付后安装在IDC机柜中，接入供电、液冷、网络，形成完整的AI算力基础设施。",
    analogy:
      "就像把发动机装入工厂的生产线——AI服务器是算力'发动机'，IDC是运转它的'工厂'，两者缺一不可。",
    whyMatters:
      "算力需求爆发 → IDC扩容建设 → AI服务器需求增长 → 整机厂+IDC运营商同步受益。",
    steps: [
      {
        icon: "🖥️",
        label: "AI服务器整机",
        color: "#f43f5e",
        sub: "工业富联/浪潮组装完成",
      },
      {
        icon: "⬇",
        label: "运输到IDC机房",
        color: "#94a3b8",
        sub: "整柜交付或分批安装",
      },
      {
        icon: "⬇",
        label: "接入供配电",
        color: "#f59e0b",
        sub: "HVDC/BBU/UPS供电系统",
      },
      {
        icon: "⬇",
        label: "接入液冷管路",
        color: "#818cf8",
        sub: "连接CDU冷量分配单元",
      },
      {
        icon: "🏢",
        label: "智算中心上线",
        color: "#e879f9",
        sub: "算力向云厂商/政企交付",
      },
    ],
    tags: [
      { term: "智算中心", plain: "专门运行AI大模型的数据中心" },
      { term: "整柜交付", plain: "GB200 NVL72整机柜交付方式" },
      { term: "算力租赁", plain: "按算力小时收费的商业模式" },
    ],
  },
};

function getNodeEdges(
  nodeId: string,
): { edge: (typeof OVERVIEW_EDGES_DEF)[0]; anim: EdgeAnim }[] {
  return OVERVIEW_EDGES_DEF.filter((e) => e.src === nodeId || e.tgt === nodeId)
    .map((e) => {
      const key = `${e.src}->${e.tgt}`;
      const anim = EDGE_ANIMATIONS[key];
      return anim ? { edge: e, anim } : null;
    })
    .filter(Boolean) as {
    edge: (typeof OVERVIEW_EDGES_DEF)[0];
    anim: EdgeAnim;
  }[];
}

function RelationTooltip({
  nodeId,
  pinned,
  onClose,
}: {
  nodeId: string;
  pinned?: boolean;
  onClose?: () => void;
}) {
  const [activeIdx, setActiveIdx] = React.useState(0);
  const edges = React.useMemo(() => getNodeEdges(nodeId), [nodeId]);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    setActiveIdx(0);
    setTick(0);
  }, [nodeId]);

  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 50);
    return () => clearInterval(id);
  }, []);

  const current = edges[activeIdx];
  if (!current) return null;

  const { anim } = current;
  const progress = ((tick * 50) % 2200) / 2200;
  const ind = OVERVIEW_INDUSTRIES.find((i) => i.id === nodeId);

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        width: 280,
        background: "var(--bg-secondary)",
        border: `1px solid ${pinned ? "#f5a62366" : "#a78bfa33"}`,
        borderRadius: 14,
        padding: "12px 14px 12px",
        boxShadow: pinned ? "0 8px 40px #00000066" : "0 4px 20px #00000033",
        animation: "assemble-fade-in 0.2s ease",
        zIndex: 30,
        pointerEvents: pinned ? "auto" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 14 }}>{ind?.icon}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: ind?.color ?? "#f5a623",
            flex: 1,
          }}
        >
          {ind?.label.replace("\n", " ")}
        </span>
        {pinned ? (
          <button
            onClick={onClose}
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              border: "1px solid var(--border-color)",
              background: "var(--bg-tertiary)",
              color: "var(--text-tertiary)",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        ) : (
          <span
            style={{
              fontSize: 8.5,
              color: "var(--text-tertiary)",
              border: "1px solid var(--border-color)",
              borderRadius: 4,
              padding: "1px 5px",
            }}
          >
            点击节点固定
          </span>
        )}
      </div>

      {edges.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          {edges.map((e, i) => {
            const srcInd = OVERVIEW_INDUSTRIES.find((x) => x.id === e.edge.src);
            const tgtInd = OVERVIEW_INDUSTRIES.find((x) => x.id === e.edge.tgt);
            const otherInd = e.edge.src === nodeId ? tgtInd : srcInd;
            return (
              <button
                key={i}
                onClick={() => {
                  setActiveIdx(i);
                  setTick(0);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "3px 7px",
                  borderRadius: 5,
                  border: `1px solid ${i === activeIdx ? (otherInd?.color ?? "#f5a623") + "88" : "var(--border-color)"}`,
                  background:
                    i === activeIdx
                      ? (otherInd?.color ?? "#f5a623") + "18"
                      : "var(--bg-tertiary)",
                  color:
                    i === activeIdx
                      ? (otherInd?.color ?? "#f5a623")
                      : "var(--text-tertiary)",
                  fontSize: 9,
                  fontWeight: i === activeIdx ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  pointerEvents: "auto",
                }}
              >
                <span>{otherInd?.icon}</span>
                <span>{otherInd?.label.split("\n")[0]}</span>
              </button>
            );
          })}
        </div>
      )}

      <div
        style={{
          borderBottom: "1px solid var(--border-color)",
          marginBottom: 8,
          paddingBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: "#f5a623",
            marginBottom: 4,
          }}
        >
          {anim.title}
        </div>
        <div
          style={{
            fontSize: 9,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            marginBottom: 6,
          }}
        >
          {anim.desc}
        </div>
        <div
          style={{
            background: "#a78bfa14",
            border: "1px solid #a78bfa33",
            borderRadius: 6,
            padding: "5px 7px",
            marginBottom: 5,
          }}
        >
          <span style={{ fontSize: 9, color: "#a78bfa", fontWeight: 700 }}>
            💡 生活类比
          </span>
          <div
            style={{
              fontSize: 8.5,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
              marginTop: 2,
            }}
          >
            {anim.analogy}
          </div>
        </div>
        <div
          style={{
            background: "#f5a62314",
            border: "1px solid #f5a62333",
            borderRadius: 6,
            padding: "5px 7px",
          }}
        >
          <span style={{ fontSize: 9, color: "#f5a623", fontWeight: 700 }}>
            📈 投资意义
          </span>
          <div
            style={{
              fontSize: 8.5,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
              marginTop: 2,
            }}
          >
            {anim.whyMatters}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {anim.steps.map((step, si) => {
          const stepProgress = Math.min(
            1,
            Math.max(0, progress * anim.steps.length - si),
          );
          const isActive =
            progress * anim.steps.length >= si &&
            progress * anim.steps.length < si + 1;
          const isPast = progress * anim.steps.length >= si + 1;
          return (
            <React.Fragment key={si}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 7px",
                  borderRadius: 6,
                  background: isActive
                    ? `${step.color}18`
                    : isPast
                      ? `${step.color}0a`
                      : "transparent",
                  border: `1px solid ${isActive ? step.color + "55" : isPast ? step.color + "22" : "transparent"}`,
                  transition: "all 0.3s ease",
                  opacity: isPast || isActive ? 1 : 0.3,
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>{step.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: step.color,
                      lineHeight: 1.2,
                    }}
                  >
                    {step.label}
                  </div>
                  {step.sub && (
                    <div
                      style={{
                        fontSize: 8,
                        color: "var(--text-tertiary)",
                        lineHeight: 1.2,
                      }}
                    >
                      {step.sub}
                    </div>
                  )}
                </div>
                {isActive && (
                  <div
                    style={{
                      width: 24,
                      height: 3,
                      borderRadius: 2,
                      background: "var(--bg-tertiary)",
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${stepProgress * 100}%`,
                        background: step.color,
                        borderRadius: 2,
                        transition: "width 0.05s linear",
                      }}
                    />
                  </div>
                )}
              </div>
              {si < anim.steps.length - 1 && (
                <div
                  style={{
                    width: 1,
                    height: 6,
                    background: isPast
                      ? step.color + "55"
                      : "var(--border-color)",
                    marginLeft: 18,
                    transition: "background 0.3s",
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {anim.tags.map((tag) => (
          <div
            key={tag.term}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "2px 7px",
              borderRadius: 5,
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
            }}
          >
            <span
              style={{
                fontSize: 7.5,
                color: "var(--text-tertiary)",
                lineHeight: 1.2,
              }}
            >
              {tag.term}
            </span>
            <span
              style={{
                fontSize: 8.5,
                fontWeight: 600,
                color: "var(--text-secondary)",
                lineHeight: 1.3,
              }}
            >
              {tag.plain}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type OverviewNodeData = {
  ind: (typeof OVERVIEW_INDUSTRIES)[0];
  onNavigate: (id: string) => void;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
  isDimmed?: boolean;
} & Record<string, unknown>;

type OverviewNode = Node<OverviewNodeData>;

function OverviewClusterNode({ data }: NodeProps<OverviewNode>) {
  const ind = data.ind as (typeof OVERVIEW_INDUSTRIES)[0];
  const onNavigate = data.onNavigate as (id: string) => void;
  const onSelect = data.onSelect as ((id: string) => void) | undefined;
  const isSelected = !!data.isSelected;
  const isDimmed = !!data.isDimmed;

  const handleClick = () => {
    if (onSelect) {
      onSelect(ind.id);
    } else {
      onNavigate(ind.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        background: isSelected ? `${ind.color}22` : `${ind.color}12`,
        border: isSelected
          ? `2px solid ${ind.color}`
          : `2px solid ${ind.color}66`,
        borderRadius: 14,
        padding: "12px 16px",
        minWidth: 160,
        cursor: "pointer",
        transition: "all 0.18s ease",
        boxShadow: isSelected
          ? `0 0 32px ${ind.color}66`
          : `0 0 20px ${ind.color}22`,
        userSelect: "none",
        opacity: isDimmed ? 0.25 : 1,
      }}
      onMouseEnter={(e) => {
        if (isDimmed) return;
        (e.currentTarget as HTMLDivElement).style.border =
          `2px solid ${ind.color}`;
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          `0 0 28px ${ind.color}55`;
        (e.currentTarget as HTMLDivElement).style.transform =
          "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.border = isSelected
          ? `2px solid ${ind.color}`
          : `2px solid ${ind.color}66`;
        (e.currentTarget as HTMLDivElement).style.boxShadow = isSelected
          ? `0 0 32px ${ind.color}66`
          : `0 0 20px ${ind.color}22`;
        (e.currentTarget as HTMLDivElement).style.transform = "none";
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 20 }}>{ind.icon}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: ind.color,
            whiteSpace: "pre-line",
            lineHeight: 1.3,
          }}
        >
          {ind.label}
        </span>
      </div>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}
      >
        {ind.reps.map((r) => (
          <span
            key={r}
            style={{
              fontSize: 10,
              background: `${ind.color}20`,
              color: ind.color,
              padding: "1px 6px",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            {r}
          </span>
        ))}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: ind.color,
          }}
        />
        {isSelected ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(ind.id);
            }}
            style={{
              color: ind.color,
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            进入供应链详情 →
          </span>
        ) : (
          <span>点击查看详细供应链</span>
        )}
      </div>
    </div>
  );
}

const SWIM_LANES = [
  {
    id: "semieq_lane",
    label: "半导体制造",
    color: "#6366f1",
    bg: "#6366f112",
    industries: ["semieq"],
  },
  {
    id: "chip",
    label: "芯片 / 计算",
    color: "#a78bfa",
    bg: "#a78bfa12",
    industries: ["aigpu", "memory", "glasssub"],
  },
  {
    id: "board",
    label: "板卡 / 互联",
    color: "#34d399",
    bg: "#34d39912",
    industries: ["pcb", "mlcc", "coppercable"],
  },
  {
    id: "optical",
    label: "光通信",
    color: "#06b6d4",
    bg: "#06b6d412",
    industries: ["optics", "fiber"],
  },
  {
    id: "dc",
    label: "数据中心",
    color: "#818cf8",
    bg: "#818cf812",
    industries: ["liquidcool", "aipower", "idc"],
  },
  {
    id: "server",
    label: "服务器整机",
    color: "#f43f5e",
    bg: "#f43f5e12",
    industries: ["aiserver"],
  },
];

// ─── Shared zoom hook ────────────────────────────────────────────────────────

function useZoomable() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(1);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => {
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        return Math.min(2, Math.max(0.3, +(z + delta).toFixed(2)));
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);
  return { containerRef, zoom, setZoom };
}

function useWheelZoom(setZoom: React.Dispatch<React.SetStateAction<number>>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => {
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        return Math.min(2, Math.max(0.3, +(z + delta).toFixed(2)));
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [setZoom]);
  return containerRef;
}

// ─── Shared zoom button ───────────────────────────────────────────────────────

function ZoomBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--border-color)",
        color: "var(--text-secondary)",
        fontSize: 14,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background =
          "var(--bg-tertiary)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background =
          "transparent")
      }
    >
      {children}
    </button>
  );
}

// ─── Zoom controls widget ─────────────────────────────────────────────────────

function ZoomControls({
  zoom,
  setZoom,
}: {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: 10,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 4px 16px #00000066",
        zIndex: 10,
      }}
    >
      <ZoomBtn
        onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}
        title="放大"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
          <line
            x1="4"
            y1="7"
            x2="10"
            y2="7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="7"
            y1="4"
            x2="7"
            y2="10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </ZoomBtn>
      <ZoomBtn
        onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(1)))}
        title="缩小"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
          <line
            x1="4"
            y1="7"
            x2="10"
            y2="7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </ZoomBtn>
      <ZoomBtn onClick={() => setZoom(1)} title="重置缩放">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M2 7C2 4.24 4.24 2 7 2c1.66 0 3.13.8 4.07 2.04M12 7c0 2.76-2.24 5-5 5-1.66 0-3.13-.8-4.07-2.04"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M10.5 2.5L11.5 4.5H9.5L10.5 2.5Z" fill="currentColor" />
        </svg>
      </ZoomBtn>
    </div>
  );
}

function SwimLaneView({
  onNavigate,
  zoom,
  setZoom,
}: {
  onNavigate: (id: string) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
}) {
  const byId = Object.fromEntries(OVERVIEW_INDUSTRIES.map((i) => [i.id, i]));
  const edgeMap: Record<string, string[]> = {};
  for (const e of OVERVIEW_EDGES_DEF) {
    if (!edgeMap[e.src]) edgeMap[e.src] = [];
    edgeMap[e.src].push(e.tgt);
  }
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const activeTooltipId = pinnedId ?? hovered;

  const connectedTo = React.useMemo(() => {
    const base = pinnedId ?? hovered;
    if (!base) return new Set<string>();
    const s = new Set<string>();
    for (const e of OVERVIEW_EDGES_DEF) {
      if (e.src === base) s.add(e.tgt);
      if (e.tgt === base) s.add(e.src);
    }
    return s;
  }, [hovered, pinnedId]);

  const containerRef = useWheelZoom(setZoom);

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      <div className="overflow-auto" style={{ width: "100%", height: "100%" }}>
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "50% 0%",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {SWIM_LANES.map((lane) => (
            <div
              key={lane.id}
              style={{
                background: lane.bg,
                border: `1px solid ${lane.color}33`,
                borderRadius: 14,
                padding: "14px 18px",
              }}
            >
              <div
                className="text-xs font-bold mb-3 flex items-center gap-2"
                style={{ color: lane.color }}
              >
                <div
                  style={{
                    width: 3,
                    height: 14,
                    background: lane.color,
                    borderRadius: 2,
                  }}
                />
                {lane.label}
              </div>
              <div className="flex gap-3 flex-wrap">
                {lane.industries.map((id) => {
                  const ind = byId[id];
                  if (!ind) return null;
                  const isHovered = (pinnedId ?? hovered) === id;
                  const isConnected = connectedTo.has(id);
                  const dimmed =
                    (pinnedId ?? hovered) && !isHovered && !isConnected;
                  return (
                    <div
                      key={id}
                      onClick={() => setPinnedId((p) => (p === id ? null : id))}
                      onDoubleClick={() => onNavigate(id)}
                      onMouseEnter={() => {
                        if (!pinnedId) setHovered(id);
                      }}
                      onMouseLeave={() => {
                        if (!pinnedId) setHovered(null);
                      }}
                      style={{
                        background: isHovered
                          ? `${ind.color}22`
                          : `${ind.color}0e`,
                        border: `2px solid ${isHovered || isConnected ? ind.color : `${ind.color}55`}`,
                        borderRadius: 10,
                        padding: "10px 14px",
                        cursor: "pointer",
                        minWidth: 160,
                        flex: "1 1 160px",
                        maxWidth: 260,
                        transition: "all 0.15s ease",
                        opacity: dimmed ? 0.3 : 1,
                        boxShadow: isHovered
                          ? `0 4px 18px ${ind.color}33`
                          : "none",
                        transform: isHovered ? "translateY(-2px)" : "none",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span style={{ fontSize: 18 }}>{ind.icon}</span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: ind.color,
                            whiteSpace: "pre-line",
                            lineHeight: 1.3,
                          }}
                        >
                          {ind.label}
                        </span>
                        {isConnected && !isHovered && (
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: 9,
                              color: ind.color,
                              border: `1px solid ${ind.color}66`,
                              borderRadius: 4,
                              padding: "1px 5px",
                              fontWeight: 600,
                            }}
                          >
                            关联
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {ind.reps.map((r) => (
                          <span
                            key={r}
                            style={{
                              fontSize: 10,
                              background: `${ind.color}20`,
                              color: ind.color,
                              padding: "1px 5px",
                              borderRadius: 3,
                              fontWeight: 600,
                            }}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                      {(pinnedId ?? hovered) === id && (
                        <div
                          style={{
                            fontSize: 9,
                            color: "var(--text-tertiary)",
                            marginTop: 4,
                          }}
                        >
                          →{" "}
                          {(edgeMap[id] ?? [])
                            .map((t) => byId[t]?.label.replace("\n", " "))
                            .filter(Boolean)
                            .join(" · ") || "无下游"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textAlign: "center",
              marginTop: 4,
            }}
          >
            悬停预览关联 · 点击节点固定面板 · 双击进入供应链详情 · Ctrl+滚轮缩放
          </p>
        </div>
      </div>
      <ZoomControls zoom={zoom} setZoom={setZoom} />
      {activeTooltipId && getNodeEdges(activeTooltipId).length > 0 && (
        <RelationTooltip
          nodeId={activeTooltipId}
          pinned={!!pinnedId}
          onClose={() => setPinnedId(null)}
        />
      )}
    </div>
  );
}

const CONCENTRIC_RINGS = [
  {
    label: "核心算力",
    color: "#a78bfa",
    industries: ["aigpu", "memory"],
    r: 0,
  },
  {
    label: "半导体制造",
    color: "#6366f1",
    industries: ["semieq", "glasssub"],
    r: 220,
  },
  {
    label: "板卡 / 互联",
    color: "#34d399",
    industries: ["pcb", "mlcc", "coppercable"],
    r: 390,
  },
  {
    label: "光通信",
    color: "#06b6d4",
    industries: ["optics", "fiber"],
    r: 530,
  },
  {
    label: "数据中心 / 整机",
    color: "#818cf8",
    industries: ["liquidcool", "aipower", "idc", "aiserver"],
    r: 670,
  },
];

function ConcentricView({
  onNavigate,
  zoom,
  setZoom,
}: {
  onNavigate: (id: string) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
}) {
  const byId = Object.fromEntries(OVERVIEW_INDUSTRIES.map((i) => [i.id, i]));
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const activeTooltipId = pinnedId ?? hovered;
  const containerRef = useWheelZoom(setZoom);
  const W = 1200;
  const H = 1160;
  const cx = W / 2;
  const cy = H / 2;

  const nodePositions: Record<string, { x: number; y: number }> = {};

  CONCENTRIC_RINGS.forEach((ring, ri) => {
    if (ring.r === 0) {
      const count = ring.industries.length;
      ring.industries.forEach((id, idx) => {
        nodePositions[id] = {
          x: cx + (idx - (count - 1) / 2) * 180,
          y: cy,
        };
      });
    } else {
      const count = ring.industries.length;
      ring.industries.forEach((id, idx) => {
        const startAngle = ri === 1 ? -Math.PI / 2 : -Math.PI / 2;
        const angle = startAngle + (idx / count) * 2 * Math.PI;
        nodePositions[id] = {
          x: cx + ring.r * Math.cos(angle),
          y: cy + ring.r * Math.sin(angle),
        };
      });
    }
  });

  const connectedTo = React.useMemo(() => {
    const base = pinnedId ?? hovered;
    if (!base) return new Set<string>();
    const s = new Set<string>();
    for (const e of OVERVIEW_EDGES_DEF) {
      if (e.src === base) s.add(e.tgt);
      if (e.tgt === base) s.add(e.src);
    }
    return s;
  }, [hovered, pinnedId]);

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      <div className="overflow-auto" style={{ width: "100%", height: "100%" }}>
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "50% 0%",
            display: "flex",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            style={{ maxWidth: "100%", maxHeight: "100%" }}
          >
            {CONCENTRIC_RINGS.filter((r) => r.r > 0).map((ring) => (
              <circle
                key={ring.r}
                cx={cx}
                cy={cy}
                r={ring.r}
                fill="none"
                stroke={`${ring.color}22`}
                strokeWidth={ring.r > 400 ? 64 : ring.r > 300 ? 56 : 50}
              />
            ))}
            {CONCENTRIC_RINGS.filter((r) => r.r > 0).map((ring) => (
              <text
                key={`lbl-${ring.r}`}
                x={cx + ring.r * Math.cos(Math.PI / 8)}
                y={cy + ring.r * Math.sin(Math.PI / 8) + 4}
                textAnchor="middle"
                fontSize={10}
                fill={`${ring.color}88`}
                fontWeight={700}
              >
                {ring.label}
              </text>
            ))}
            {OVERVIEW_EDGES_DEF.map((e, i) => {
              const src = nodePositions[e.src];
              const tgt = nodePositions[e.tgt];
              if (!src || !tgt) return null;
              const isActive =
                hovered === e.src || hovered === e.tgt || (!hovered && true);
              const dimmed =
                hovered &&
                hovered !== e.src &&
                hovered !== e.tgt &&
                !connectedTo.has(e.src) &&
                !connectedTo.has(e.tgt);
              const mx = (src.x + tgt.x) / 2;
              const my = (src.y + tgt.y) / 2 - 30;
              const srcInd = byId[e.src];
              return (
                <g
                  key={i}
                  style={{ opacity: dimmed ? 0.06 : isActive ? 1 : 0.35 }}
                >
                  <path
                    d={`M ${src.x} ${src.y} Q ${mx} ${my} ${tgt.x} ${tgt.y}`}
                    fill="none"
                    stroke={
                      hovered === e.src || hovered === e.tgt
                        ? (srcInd?.color ?? "#888")
                        : "var(--border-color)"
                    }
                    strokeWidth={hovered === e.src || hovered === e.tgt ? 2 : 1}
                    strokeDasharray={
                      hovered === e.src || hovered === e.tgt ? "none" : "4 3"
                    }
                    markerEnd="url(#arr)"
                  />
                  {(hovered === e.src || hovered === e.tgt) && (
                    <text
                      x={mx}
                      y={my - 4}
                      textAnchor="middle"
                      fontSize={9}
                      fill={srcInd?.color ?? "#888"}
                      fontWeight={600}
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            <defs>
              <marker
                id="arr"
                markerWidth="8"
                markerHeight="8"
                refX="4"
                refY="3"
                orient="auto"
              >
                <path
                  d="M0,0 L0,6 L7,3 z"
                  fill="var(--text-tertiary)"
                  opacity={0.6}
                />
              </marker>
            </defs>
            {OVERVIEW_INDUSTRIES.map((ind) => {
              const pos = nodePositions[ind.id];
              if (!pos) return null;
              const isHovered = (pinnedId ?? hovered) === ind.id;
              const isConnected = connectedTo.has(ind.id);
              const dimmed =
                (pinnedId ?? hovered) && !isHovered && !isConnected;
              const W_NODE = 148;
              const H_NODE = 72;
              return (
                <g
                  key={ind.id}
                  transform={`translate(${pos.x - W_NODE / 2}, ${pos.y - H_NODE / 2})`}
                  style={{
                    cursor: "pointer",
                    opacity: dimmed ? 0.2 : 1,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={() => {
                    if (!pinnedId) setHovered(ind.id);
                  }}
                  onMouseLeave={() => {
                    if (!pinnedId) setHovered(null);
                  }}
                  onClick={() =>
                    setPinnedId((p) => (p === ind.id ? null : ind.id))
                  }
                >
                  <rect
                    width={W_NODE}
                    height={H_NODE}
                    rx={10}
                    fill={isHovered ? `${ind.color}22` : `${ind.color}0d`}
                    stroke={
                      isHovered || isConnected ? ind.color : `${ind.color}55`
                    }
                    strokeWidth={isHovered ? 2 : 1.5}
                    filter={
                      isHovered
                        ? `drop-shadow(0 4px 12px ${ind.color}44)`
                        : undefined
                    }
                  />
                  <text x={10} y={22} fontSize={16} dominantBaseline="middle">
                    {ind.icon}
                  </text>
                  <text
                    x={32}
                    y={18}
                    fontSize={11}
                    fontWeight={700}
                    fill={ind.color}
                  >
                    {ind.label.split("\n")[0]}
                  </text>
                  {ind.label.includes("\n") && (
                    <text x={32} y={31} fontSize={9} fill={`${ind.color}bb`}>
                      {ind.label.split("\n")[1]}
                    </text>
                  )}
                  {ind.reps.slice(0, 2).map((r, ri) => (
                    <text
                      key={r}
                      x={10 + ri * 72}
                      y={H_NODE - 12}
                      fontSize={9}
                      fill={`${ind.color}aa`}
                      fontWeight={600}
                    >
                      {r}
                    </text>
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <ZoomControls zoom={zoom} setZoom={setZoom} />
    </div>
  );
}

const SANDBOX_ZONES = [
  {
    id: "semieq_zone",
    label: "半导体制造层",
    color: "#6366f1",
    x: 40,
    y: 40,
    w: 680,
    h: 180,
    industries: ["semieq"],
  },
  {
    id: "chip",
    label: "芯片 · 计算层",
    color: "#a78bfa",
    x: 40,
    y: 260,
    w: 680,
    h: 180,
    industries: ["aigpu", "memory", "glasssub"],
  },
  {
    id: "board",
    label: "板卡 · 互联层",
    color: "#34d399",
    x: 40,
    y: 480,
    w: 680,
    h: 180,
    industries: ["pcb", "mlcc", "coppercable"],
  },
  {
    id: "optical",
    label: "光通信层",
    color: "#06b6d4",
    x: 40,
    y: 700,
    w: 680,
    h: 180,
    industries: ["optics", "fiber"],
  },
  {
    id: "dc",
    label: "数据中心层",
    color: "#818cf8",
    x: 40,
    y: 920,
    w: 680,
    h: 180,
    industries: ["liquidcool", "aipower", "idc"],
  },
  {
    id: "server",
    label: "服务器整机层",
    color: "#f43f5e",
    x: 40,
    y: 1140,
    w: 680,
    h: 180,
    industries: ["aiserver"],
  },
];

const SANDBOX_IND_POSITIONS: Record<string, { x: number; y: number }> = {
  semieq: { x: 340, y: 130 },
  aigpu: { x: 100, y: 350 },
  memory: { x: 310, y: 350 },
  glasssub: { x: 520, y: 350 },
  pcb: { x: 100, y: 570 },
  mlcc: { x: 310, y: 570 },
  coppercable: { x: 520, y: 570 },
  optics: { x: 160, y: 790 },
  fiber: { x: 480, y: 790 },
  liquidcool: { x: 100, y: 1010 },
  aipower: { x: 310, y: 1010 },
  idc: { x: 520, y: 1010 },
  aiserver: { x: 340, y: 1230 },
};

function SandboxView({
  onNavigate,
  zoom,
  setZoom,
}: {
  onNavigate: (id: string) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
}) {
  const byId = Object.fromEntries(OVERVIEW_INDUSTRIES.map((i) => [i.id, i]));
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const activeTooltipId = pinnedId ?? hovered;
  const containerRef = useWheelZoom(setZoom);
  const SVG_W = 760;
  const SVG_H = 1380;

  const connectedTo = React.useMemo(() => {
    const base = pinnedId ?? hovered;
    if (!base) return new Set<string>();
    const s = new Set<string>();
    for (const e of OVERVIEW_EDGES_DEF) {
      if (e.src === base) s.add(e.tgt);
      if (e.tgt === base) s.add(e.src);
    }
    return s;
  }, [hovered, pinnedId]);

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      <div className="overflow-auto" style={{ width: "100%", height: "100%" }}>
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "50% 0%",
            display: "flex",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <svg
            width={SVG_W}
            height={SVG_H}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            style={{ maxWidth: "100%" }}
          >
            {SANDBOX_ZONES.map((zone) => (
              <g key={zone.id}>
                <rect
                  x={zone.x}
                  y={zone.y}
                  width={zone.w}
                  height={zone.h}
                  rx={14}
                  fill={`${zone.color}0c`}
                  stroke={`${zone.color}33`}
                  strokeWidth={1.5}
                />
                <text
                  x={zone.x + 14}
                  y={zone.y + 20}
                  fontSize={11}
                  fontWeight={800}
                  fill={zone.color}
                  opacity={0.8}
                >
                  {zone.label}
                </text>
              </g>
            ))}
            <defs>
              <marker
                id="sb-arr"
                markerWidth="7"
                markerHeight="7"
                refX="4"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L7,3 z" fill="#888" opacity={0.7} />
              </marker>
            </defs>
            {OVERVIEW_EDGES_DEF.map((e, i) => {
              const src = SANDBOX_IND_POSITIONS[e.src];
              const tgt = SANDBOX_IND_POSITIONS[e.tgt];
              if (!src || !tgt) return null;
              const srcInd = byId[e.src];
              const isActive = hovered === e.src || hovered === e.tgt;
              const dimmed =
                hovered &&
                !isActive &&
                !connectedTo.has(e.src) &&
                !connectedTo.has(e.tgt);
              const mx = (src.x + tgt.x) / 2;
              const my = (src.y + tgt.y) / 2 - (src.y === tgt.y ? 0 : 20);
              return (
                <g
                  key={i}
                  style={{ opacity: dimmed ? 0.05 : isActive ? 1 : 0.4 }}
                >
                  <path
                    d={`M ${src.x} ${src.y} Q ${mx} ${my} ${tgt.x} ${tgt.y}`}
                    fill="none"
                    stroke={isActive ? (srcInd?.color ?? "#888") : "#888"}
                    strokeWidth={isActive ? 2 : 1}
                    strokeDasharray={isActive ? "none" : "5 3"}
                    markerEnd="url(#sb-arr)"
                  />
                  {isActive && (
                    <text
                      x={mx}
                      y={my - 5}
                      textAnchor="middle"
                      fontSize={9}
                      fill={srcInd?.color ?? "#888"}
                      fontWeight={700}
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {OVERVIEW_INDUSTRIES.map((ind) => {
              const pos = SANDBOX_IND_POSITIONS[ind.id];
              if (!pos) return null;
              const isHovered = (pinnedId ?? hovered) === ind.id;
              const isConnected = connectedTo.has(ind.id);
              const dimmed =
                (pinnedId ?? hovered) && !isHovered && !isConnected;
              const NW = 158;
              const NH = 82;
              return (
                <g
                  key={ind.id}
                  transform={`translate(${pos.x - NW / 2}, ${pos.y - NH / 2})`}
                  style={{ cursor: "pointer", opacity: dimmed ? 0.18 : 1 }}
                  onMouseEnter={() => {
                    if (!pinnedId) setHovered(ind.id);
                  }}
                  onMouseLeave={() => {
                    if (!pinnedId) setHovered(null);
                  }}
                  onClick={() =>
                    setPinnedId((p) => (p === ind.id ? null : ind.id))
                  }
                >
                  <rect
                    width={NW}
                    height={NH}
                    rx={9}
                    fill={isHovered ? `${ind.color}22` : `${ind.color}11`}
                    stroke={
                      isHovered || isConnected ? ind.color : `${ind.color}55`
                    }
                    strokeWidth={isHovered ? 2 : 1.5}
                    filter={
                      isHovered
                        ? `drop-shadow(0 3px 10px ${ind.color}44)`
                        : undefined
                    }
                  />
                  <text x={8} y={22} fontSize={17} dominantBaseline="middle">
                    {ind.icon}
                  </text>
                  <text
                    x={30}
                    y={17}
                    fontSize={11}
                    fontWeight={800}
                    fill={ind.color}
                  >
                    {ind.label.split("\n")[0]}
                  </text>
                  {ind.label.includes("\n") && (
                    <text x={30} y={29} fontSize={9} fill={`${ind.color}cc`}>
                      {ind.label.split("\n")[1]}
                    </text>
                  )}
                  <line
                    x1={8}
                    y1={38}
                    x2={NW - 8}
                    y2={38}
                    stroke={`${ind.color}33`}
                    strokeWidth={1}
                  />
                  {ind.reps.slice(0, 3).map((r, ri) => (
                    <text
                      key={r}
                      x={8 + ri * 52}
                      y={NH - 14}
                      fontSize={8.5}
                      fill={`${ind.color}aa`}
                      fontWeight={600}
                    >
                      {r.length > 5 ? r.slice(0, 5) : r}
                    </text>
                  ))}
                  {isConnected && !isHovered && (
                    <rect
                      x={NW - 28}
                      y={4}
                      width={24}
                      height={13}
                      rx={3}
                      fill={`${ind.color}33`}
                    />
                  )}
                  {isConnected && !isHovered && (
                    <text
                      x={NW - 16}
                      y={14}
                      fontSize={8}
                      textAnchor="middle"
                      fill={ind.color}
                      fontWeight={700}
                    >
                      关联
                    </text>
                  )}
                </g>
              );
            })}
            <text
              x={SVG_W / 2}
              y={SVG_H - 10}
              textAnchor="middle"
              fontSize={9.5}
              fill="var(--text-tertiary)"
            >
              悬停节点高亮关联 · 点击进入供应链详情 · Ctrl+滚轮缩放
            </text>
          </svg>
        </div>
      </div>
      <ZoomControls zoom={zoom} setZoom={setZoom} />
      {activeTooltipId && getNodeEdges(activeTooltipId).length > 0 && (
        <RelationTooltip
          nodeId={activeTooltipId}
          pinned={!!pinnedId}
          onClose={() => setPinnedId(null)}
        />
      )}
    </div>
  );
}

type OverviewViewMode = "flow" | "swim" | "concentric" | "sandbox";

function OverviewView({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [viewMode, setViewMode] = React.useState<OverviewViewMode>("swim");
  const [zoom, setZoom] = React.useState(1);
  const [selectedOvId, setSelectedOvId] = React.useState<string | null>(null);
  const [hoveredOvId, setHoveredOvId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setZoom(1);
    setSelectedOvId(null);
  }, [viewMode]);

  const overviewNodeType = React.useMemo(
    () => ({
      overviewCluster: (props: NodeProps) => (
        <OverviewClusterNode {...(props as NodeProps<OverviewNode>)} />
      ),
    }),
    [],
  );

  const ovNodes: Node[] = OVERVIEW_INDUSTRIES.map((ind) => {
    const connectedIds = selectedOvId
      ? new Set(
          OVERVIEW_EDGES_DEF.filter(
            (e) => e.src === selectedOvId || e.tgt === selectedOvId,
          ).flatMap((e) => [e.src, e.tgt]),
        )
      : null;
    const isSelected = ind.id === selectedOvId;
    const isDimmed =
      !!selectedOvId && !isSelected && !connectedIds?.has(ind.id);
    return {
      id: ind.id,
      type: "overviewCluster",
      position: { x: ind.x, y: ind.y },
      data: {
        ind,
        onNavigate,
        onSelect: (id: string) =>
          setSelectedOvId((prev) => (prev === id ? null : id)),
        isSelected,
        isDimmed,
      },
    };
  });

  const ovEdges: Edge[] = OVERVIEW_EDGES_DEF.map((ed, i) => {
    const isConnected =
      !selectedOvId || ed.src === selectedOvId || ed.tgt === selectedOvId;
    return {
      id: `ov-${i}`,
      source: ed.src,
      target: ed.tgt,
      label: isConnected ? ed.label : undefined,
      type: "smoothstep",
      style: {
        stroke: isConnected
          ? selectedOvId
            ? "#f5a623"
            : "var(--border-color)"
          : "var(--border-color)",
        strokeWidth: isConnected && selectedOvId ? 2.5 : 1.5,
        opacity: isConnected ? 1 : 0.08,
      },
      labelStyle: {
        fontSize: 9,
        fill: isConnected && selectedOvId ? "#f5a623" : "var(--text-tertiary)",
        fontFamily: "monospace",
      },
      labelBgStyle: { fill: "var(--bg-primary)", fillOpacity: 0.85 },
      labelBgPadding: [3, 4] as [number, number],
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isConnected && selectedOvId ? "#f5a623" : "var(--border-color)",
        width: 12,
        height: 12,
      },
      animated: !!(isConnected && selectedOvId),
    };
  });

  const VIEW_TABS: { id: OverviewViewMode; label: string }[] = [
    { id: "swim", label: "泳道图" },
    { id: "concentric", label: "同心圆" },
    { id: "sandbox", label: "沙盘图" },
    { id: "flow", label: "流向图" },
  ];

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-primary)]">
      <div className="px-5 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-primary)] flex items-center gap-3 flex-shrink-0">
        <span style={{ fontSize: 14, fontWeight: 700, color: "#f5a623" }}>
          AI算力产业链全景图
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          · 点击任意产业节点 → 深入查看供应链详情
        </span>
        <div className="ml-auto flex items-center gap-1">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 7,
                border: "1px solid",
                borderColor:
                  viewMode === tab.id ? "#f5a623" : "var(--border-color)",
                background:
                  viewMode === tab.id ? "#f5a62318" : "var(--bg-secondary)",
                color:
                  viewMode === tab.id ? "#f5a623" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {viewMode === "swim" && (
        <SwimLaneView onNavigate={onNavigate} zoom={zoom} setZoom={setZoom} />
      )}
      {viewMode === "concentric" && (
        <ConcentricView onNavigate={onNavigate} zoom={zoom} setZoom={setZoom} />
      )}
      {viewMode === "sandbox" && (
        <SandboxView onNavigate={onNavigate} zoom={zoom} setZoom={setZoom} />
      )}
      {viewMode === "flow" && (
        <div className="flex-1 relative ov-flow-view">
          <ReactFlow
            nodes={ovNodes}
            edges={ovEdges}
            nodeTypes={overviewNodeType}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.3}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            selectNodesOnDrag={false}
            onPaneClick={() => setSelectedOvId(null)}
            onNodeMouseEnter={(_, node) => setHoveredOvId(node.id)}
            onNodeMouseLeave={() => setHoveredOvId(null)}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="var(--bg-hover)"
              gap={28}
              size={1}
            />
            <Controls
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            />
          </ReactFlow>
          {selectedOvId && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[var(--bg-hover)]/90 border border-[#f5a623]/40 text-[#f5a623] text-xs px-4 py-2 rounded-full pointer-events-none flex items-center gap-2">
              <span>已高亮</span>
              <span className="font-semibold">
                {OVERVIEW_INDUSTRIES.find((i) => i.id === selectedOvId)?.label}
              </span>
              <span>的关联产业 · 点击节点内链接进入详情 · 点击空白取消</span>
            </div>
          )}
          {hoveredOvId && getNodeEdges(hoveredOvId).length > 0 && (
            <RelationTooltip nodeId={hoveredOvId} />
          )}
        </div>
      )}
    </div>
  );
}

function RightPanel({
  item,
  overrideStocks,
  liveQuotes,
  onOverride,
  onClose,
  onNavigate,
  quickItems,
  onSelectQuick,
  relatedItems,
}: {
  item: RightPanelItem | null;
  overrideStocks: Record<string, string[]>;
  liveQuotes: Record<string, LiveQuote>;
  onOverride: (id: string, codes: string[]) => void;
  onClose: () => void;
  onNavigate: (code: string) => void;
  quickItems: { id: string; icon?: string; label: string; count: number }[];
  onSelectQuick: (id: string) => void;
  relatedItems?: {
    upstream: { id: string; icon?: string; label: string; relation: string }[];
    downstream: {
      id: string;
      icon?: string;
      label: string;
      relation: string;
    }[];
  };
}) {
  const [addForm, setAddForm] = useState({ code: "" });
  const [showAdd, setShowAdd] = useState(false);
  const { theme } = useTheme();
  const isLight = theme === "light";

  const baseCodes = item?.stocks ?? [];
  const currentCodes = (item && overrideStocks[item.id]) ?? baseCodes;
  const currentStocks = currentCodes.map((code) => {
    const live = liveQuotes[code];
    return {
      code,
      name: live?.name ?? code,
      price: live?.price ?? 0,
      change: live?.change ?? 0,
    };
  });

  const handleDelete = (code: string) => {
    if (!item) return;
    onOverride(
      item.id,
      currentCodes.filter((c) => c !== code),
    );
  };

  const handleAdd = () => {
    if (!item || !addForm.code) return;
    const code = addForm.code.trim();
    if (!currentCodes.includes(code)) {
      onOverride(item.id, [...currentCodes, code]);
    }
    setAddForm({ code: "" });
    setShowAdd(false);
  };

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
          style={{ background: "var(--bg-tertiary)" }}
        >
          🔍
        </div>
        <div className="text-center">
          <div
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            选择企业节点
          </div>
          <div
            className="text-xs mt-1 leading-relaxed"
            style={{ color: "var(--text-tertiary)" }}
          >
            点击图谱中任意企业节点，查看上下游供应关系与相关 A 股
          </div>
        </div>
        <div className="w-full space-y-2">
          {quickItems.map((q) => (
            <button
              key={q.id}
              onClick={() => onSelectQuick(q.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
              style={{ background: "var(--bg-tertiary)" }}
            >
              {q.icon && <span className="text-base">{q.icon}</span>}
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {q.label}
              </span>
              <span
                className="ml-auto text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                {q.count} 家
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const s = LAYER_STYLES[item.layer];
  const text = isLight ? s.lightText : s.darkText;
  return (
    <>
      <div
        className="px-4 py-4 border-b border-[var(--border-color)] flex-shrink-0"
        style={{
          background: `${s.border}08`,
          borderBottom: `1px solid ${s.border}33`,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {item.icon && <span className="text-2xl">{item.icon}</span>}
            <div>
              <div className="font-semibold text-sm" style={{ color: text }}>
                {item.ticker ? (
                  <button
                    onClick={() => onNavigate(item.ticker!)}
                    className="hover:underline underline-offset-2 cursor-pointer text-left"
                    style={{ color: text }}
                  >
                    {item.label}
                    <span className="ml-1 text-[10px] opacity-60">↗</span>
                  </button>
                ) : currentCodes[0] ? (
                  <button
                    onClick={() => onNavigate(currentCodes[0])}
                    className="hover:underline underline-offset-2 cursor-pointer text-left"
                    style={{ color: text }}
                  >
                    {item.label}
                    <span className="ml-1 text-[10px] opacity-60">↗</span>
                  </button>
                ) : (
                  item.label
                )}
              </div>
              <div className="text-[var(--text-secondary)] text-xs mt-0.5">
                {item.desc}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] p-1"
          >
            <X size={14} />
          </button>
        </div>
        <div
          className="mt-2 text-xs px-2 py-0.5 rounded inline-block"
          style={{ background: `${s.border}28`, color: text }}
        >
          {LAYER_LABEL[item.layer]}
        </div>
      </div>

      {relatedItems &&
        (relatedItems.upstream.length > 0 ||
          relatedItems.downstream.length > 0) && (
          <div className="border-b border-[var(--border-color)] flex-shrink-0">
            {relatedItems.upstream.length > 0 && (
              <div className="px-4 pt-3 pb-2">
                <div className="text-xs text-[#3b82f6] font-semibold mb-1.5 flex items-center gap-1">
                  <span>↑</span> 上游供应商 · {relatedItems.upstream.length} 家
                </div>
                <div className="flex flex-col gap-1">
                  {relatedItems.upstream.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onSelectQuick(r.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-deep)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-left transition-colors w-full"
                    >
                      {r.icon && <span className="text-sm">{r.icon}</span>}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#93c5fd] font-medium truncate">
                          {r.label}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] truncate">
                          {r.relation}
                        </div>
                      </div>
                      <ChevronRight
                        size={10}
                        className="text-[var(--text-tertiary)] flex-shrink-0"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {relatedItems.downstream.length > 0 && (
              <div className="px-4 pt-2 pb-3">
                <div className="text-xs text-[#10b981] font-semibold mb-1.5 flex items-center gap-1">
                  <span>↓</span> 下游客户 · {relatedItems.downstream.length} 家
                </div>
                <div className="flex flex-col gap-1">
                  {relatedItems.downstream.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onSelectQuick(r.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-deep)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-left transition-colors w-full"
                    >
                      {r.icon && <span className="text-sm">{r.icon}</span>}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#6ee7b7] font-medium truncate">
                          {r.label}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] truncate">
                          {r.relation}
                        </div>
                      </div>
                      <ChevronRight
                        size={10}
                        className="text-[var(--text-tertiary)] flex-shrink-0"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      <div className="px-4 py-2 border-b border-[var(--border-color)] flex items-center justify-between flex-shrink-0">
        <span className="text-xs text-[var(--text-secondary)] font-medium">
          A 股龙头企业 · {currentStocks.length} 家
        </span>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 text-xs text-[#f5a623] hover:text-[#f5a623]/80"
        >
          <Plus size={12} />
          添加
        </button>
      </div>

      {showAdd && (
        <div className="px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-hover)] flex-shrink-0">
          <div className="mb-2">
            <input
              className="w-full bg-[var(--bg-deep)] border border-[var(--border-secondary)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-[#f5a623]/50"
              placeholder="股票代码（名称自动从后端获取）"
              value={addForm.code}
              onChange={(e) => setAddForm({ code: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!addForm.code}
              className="flex-1 bg-[#f5a623] hover:bg-[#f5a623]/90 disabled:opacity-40 text-black text-xs font-semibold py-1.5 rounded-lg"
            >
              确认添加
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-[var(--border-secondary)] rounded-lg"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {currentStocks.length === 0 ? (
          <div className="text-center text-[var(--text-tertiary)] text-xs py-8">
            暂无企业，点击「添加」手动录入
          </div>
        ) : (
          currentStocks.map((stock) => (
            <div
              key={stock.code + stock.name}
              className="flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)] border-b border-[var(--border-color)] transition-colors group"
            >
              <button
                className="flex-1 flex items-center gap-3 text-left"
                onClick={() => onNavigate(stock.code)}
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center text-xs font-bold text-[var(--text-tertiary)] flex-shrink-0">
                  {stock.name[0]}
                </div>
                <div className="min-w-0">
                  <div className="text-[var(--text-primary)] text-sm font-medium truncate">
                    {stock.name}
                  </div>
                  <div className="text-[var(--text-tertiary)] text-xs">
                    {stock.code}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-auto mr-2">
                  {stock.price > 0 && (
                    <>
                      <div className="text-[var(--text-primary)] text-xs font-mono">
                        ¥{stock.price}
                      </div>
                      <div
                        className={cn("text-xs", getPriceColor(stock.change))}
                      >
                        {formatPercent(stock.change)}
                      </div>
                    </>
                  )}
                </div>
              </button>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => onNavigate(stock.code)}
                  className="p-1 text-[var(--text-tertiary)] hover:text-[#f5a623]"
                  title="查看详情"
                >
                  <ExternalLink size={12} />
                </button>
                <button
                  onClick={() => handleDelete(stock.code)}
                  className="p-1 text-[var(--text-tertiary)] hover:text-red-400"
                  title="移除"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ViewTab = "chain" | "anatomy";

interface IndustryGraph {
  title: string;
  subtitle: string;
  layerLabels: string[];
  nodes: ComponentNode[];
  edges: Edge[];
}

function buildNode(raw: {
  id: string;
  x: number;
  y: number;
  label: string;
  icon: string;
  desc: string;
  layer: ComponentData["layer"];
  stocks: string[];
  ticker?: string;
  market?: ComponentData["market"];
  group?: string;
}): ComponentNode {
  return {
    id: raw.id,
    type: "component",
    position: { x: raw.x, y: raw.y },
    data: {
      label: raw.label,
      icon: raw.icon,
      desc: raw.desc,
      layer: raw.layer,
      stocks: raw.stocks,
      ticker: raw.ticker,
      market: raw.market,
      group: raw.group,
    },
  };
}

function buildEdge(
  raw: {
    id: string;
    source: string;
    target: string;
    layer: ComponentData["layer"];
    label?: string | null;
  },
  isLight = false,
): Edge {
  const colors: Record<string, string> = {
    upstream: "#3b5bdb",
    core: "#f5a623",
    downstream: "#10b981",
    application: "#8b5cf6",
  };
  const c = colors[raw.layer] ?? "#888888";
  const strokeOpacity = isLight ? "cc" : "77";
  const strokeWidth = isLight ? 2 : 1.5;
  return {
    id: raw.id,
    source: raw.source,
    target: raw.target,
    label: raw.label ?? undefined,
    labelStyle: {
      fill: isLight ? "#374151" : "var(--text-secondary)",
      fontSize: 10,
      fontWeight: 600,
    },
    labelBgStyle: {
      fill: isLight ? "#ffffff" : "var(--bg-primary)",
      fillOpacity: 0.9,
    },
    labelBgPadding: [3, 5] as [number, number],
    labelBgBorderRadius: 3,
    style: { stroke: `${c}${strokeOpacity}`, strokeWidth },
    markerEnd: { type: MarkerType.ArrowClosed, color: `${c}${strokeOpacity}` },
  };
}

const COMPANY_CHAIN_IDS = new Set(["nvidia_chain", "changxin_chain"]);

function buildRadialLayout(rawNodes: ComponentNode[]): ComponentNode[] {
  const centerNode =
    rawNodes.find(
      (n) => n.data.stocks.length === 0 && n.data.layer === "core",
    ) ?? rawNodes.find((n) => n.data.stocks.length === 0);
  if (!centerNode) return rawNodes;

  const suppliers = rawNodes.filter((n) => n.id !== centerNode.id);

  const byLayer: Record<string, ComponentNode[]> = {};
  for (const n of suppliers) {
    const l = n.data.layer ?? "upstream";
    if (!byLayer[l]) byLayer[l] = [];
    byLayer[l].push(n);
  }

  const cx = 900;
  const cy = 500;
  const NODE_W = 180;
  const NODE_H = 100;

  const result: ComponentNode[] = [
    { ...centerNode, position: { x: cx - NODE_W / 2, y: cy - NODE_H / 2 } },
  ];

  const upstreamNodes = byLayer["upstream"] ?? [];
  const downstreamNodes = byLayer["downstream"] ?? [];
  const applicationNodes = byLayer["application"] ?? [];

  const minArcSpacing = (count: number, radius: number) => {
    const minAngleGap = Math.atan2(NODE_W + 30, radius);
    return Math.max(Math.PI / Math.max(count - 1, 1), minAngleGap);
  };

  const placeArc = (
    group: ComponentNode[],
    radius: number,
    arcStart: number,
    arcEnd: number,
  ) => {
    const count = group.length;
    if (count === 0) return;
    if (count === 1) {
      const angle = (arcStart + arcEnd) / 2;
      result.push({
        ...group[0],
        position: {
          x: cx + radius * Math.cos(angle) - NODE_W / 2,
          y: cy + radius * Math.sin(angle) - NODE_H / 2,
        },
      });
      return;
    }
    const spread = arcEnd - arcStart;
    const step = spread / (count - 1);
    group.forEach((n, i) => {
      const angle = arcStart + step * i;
      result.push({
        ...n,
        position: {
          x: cx + radius * Math.cos(angle) - NODE_W / 2,
          y: cy + radius * Math.sin(angle) - NODE_H / 2,
        },
      });
    });
  };

  const upCount = upstreamNodes.length;
  const downCount = downstreamNodes.length;

  const upRadius = Math.max(420, upCount * 70);
  const downRadius = Math.max(420, downCount * 70);
  const appRadius = Math.max(700, (upRadius + downRadius) / 2 + 200);

  void minArcSpacing;

  const upPad = upCount <= 3 ? Math.PI / 6 : Math.PI / 12;
  const downPad = downCount <= 3 ? Math.PI / 6 : Math.PI / 12;

  placeArc(upstreamNodes, upRadius, Math.PI + upPad, 2 * Math.PI - upPad);
  placeArc(downstreamNodes, downRadius, downPad, Math.PI - downPad);

  if (applicationNodes.length > 0) {
    placeArc(applicationNodes, appRadius, -Math.PI / 2, (3 * Math.PI) / 2);
  }

  return result;
}

export default function IndustryCanvasPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const industryId = params.name as string;
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [graph, setGraph] = useState<IndustryGraph | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<ComponentNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [activeTab, setActiveTab] = useState<ViewTab>("chain");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rfInstance = useRef<ReactFlowInstance<any, any> | null>(null);
  const [stockOverrides, setStockOverrides] = useState<
    Record<string, string[]>
  >({});
  const rawEdgesRef = useRef<Parameters<typeof buildEdge>[0][]>([]);

  const [liveQuotes, setLiveQuotes] = useState<Record<string, LiveQuote>>({});
  const [perfData, setPerfData] = useState<
    Record<string, { ytd: number | null; m5: number | null }>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ code: string; name: string; nodeId: string }>
  >([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/industry/stocks")
      .then((r) => r.json())
      .then((data: { quotes: Record<string, LiveQuote> }) =>
        setLiveQuotes(data.quotes),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("http://localhost:8000/api/industry/perf")
      .then((r) => r.json())
      .then(
        (data: {
          perf: Record<string, { ytd: number | null; m5: number | null }>;
        }) => setPerfData(data.perf),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      rfInstance.current?.fitView({ padding: 0.15, duration: 300 });
    }, 320);
    return () => clearTimeout(t);
  }, [panelVisible]);

  useEffect(() => {
    fetch(`http://localhost:8000/api/industry/graph/${industryId}`)
      .then((r) => r.json())
      .then(
        (data: {
          title: string;
          subtitle: string;
          layerLabels: string[];
          nodes: {
            id: string;
            x: number;
            y: number;
            label: string;
            icon: string;
            desc: string;
            layer: ComponentData["layer"];
            stocks: string[];
            ticker?: string;
            market?: ComponentData["market"];
            group?: string;
          }[];
          edges: {
            id: string;
            source: string;
            target: string;
            layer: ComponentData["layer"];
            label?: string | null;
          }[];
        }) => {
          const builtNodes = data.nodes.map(buildNode);
          rawEdgesRef.current = data.edges;
          const builtEdges = data.edges.map((e) => buildEdge(e, isLight));
          setGraph({
            title: data.title,
            subtitle: data.subtitle,
            layerLabels: data.layerLabels,
            nodes: builtNodes,
            edges: builtEdges,
          });
          setNodes(builtNodes);
          setEdges(builtEdges);
        },
      )
      .catch(() => {});
  }, [industryId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rawEdgesRef.current.length > 0) {
      setEdges(rawEdgesRef.current.map((e) => buildEdge(e, isLight)));
    }
  }, [isLight]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results: Array<{ code: string; name: string; nodeId: string }> = [];

    nodes.forEach((node) => {
      const stocks = node.data.stocks || [];
      stocks.forEach((code) => {
        const live = liveQuotes[code];
        const name = live?.name ?? code;
        if (
          code.toLowerCase().includes(query) ||
          name.toLowerCase().includes(query)
        ) {
          results.push({
            code,
            name,
            nodeId: node.id,
          });
        }
      });
    });

    setSearchResults(results);
    setShowSearchDropdown(results.length > 0);
  }, [searchQuery, nodes]);

  const handleSearchSelect = useCallback(
    (result: { code: string; name: string; nodeId: string }) => {
      setActiveTab("chain");
      setSelectedId(result.nodeId);
      setPanelVisible(true);
      setSearchQuery("");
      setShowSearchDropdown(false);
    },
    [],
  );

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

  useEffect(() => {
    const stockCode = searchParams.get("stock");
    if (!stockCode || nodes.length === 0) return;

    const targetNode = nodes.find((node) => {
      const stocks = node.data.stocks || [];
      return stocks.includes(stockCode);
    });

    if (targetNode) {
      setActiveTab("chain");
      setSelectedId(targetNode.id);
      setPanelVisible(true);

      setTimeout(() => {
        const element = document.querySelector(`[data-id="${targetNode.id}"]`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);

      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, [searchParams, nodes]);

  useEffect(() => {
    const tab = searchParams.get("tab") as ViewTab | null;
    const nodeId = searchParams.get("node");
    if (!tab || nodes.length === 0) return;

    if (tab === "chain" || tab === "anatomy") {
      setActiveTab(tab);
    }
    if (nodeId) {
      setSelectedId(nodeId);
      setPanelVisible(true);
    }

    const newUrl = window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, [searchParams, nodes]);

  const handleOverride = useCallback((id: string, codes: string[]) => {
    setStockOverrides((prev) => ({ ...prev, [id]: codes }));
  }, []);

  const handleNodeClick: NodeMouseHandler<ComponentNode> = useCallback(
    (_evt, node) => {
      setSelectedId(node.id);
      setPanelVisible(true);
    },
    [],
  );

  const isPcb = industryId === "pcb";
  const isCompanyChain = COMPANY_CHAIN_IDS.has(industryId);
  const chainDisplayNodes = React.useMemo(
    () => (isCompanyChain ? buildRadialLayout(nodes) : nodes),
    [isCompanyChain, nodes],
  );

  const flowLayerLabels = graph?.layerLabels ?? [];

  const selectedFlowNode = nodes.find((n) => n.id === selectedId) as
    | ComponentNode
    | undefined;

  const connectedNodeIds: Set<string> = (() => {
    if (!selectedId) return new Set();
    const ids = new Set<string>([selectedId]);
    edges.forEach((edge) => {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    });
    return ids;
  })();

  const rightPanelItem: RightPanelItem | null = (() => {
    if (!selectedFlowNode) return null;
    return {
      id: selectedFlowNode.id,
      label: selectedFlowNode.data.label,
      icon: selectedFlowNode.data.icon,
      desc: selectedFlowNode.data.desc,
      layer: selectedFlowNode.data.layer,
      stocks: selectedFlowNode.data.stocks,
      ticker: selectedFlowNode.data.ticker,
    };
  })();

  const relatedItems = (() => {
    if (!selectedId) return undefined;
    const upstream: {
      id: string;
      icon?: string;
      label: string;
      relation: string;
    }[] = [];
    const downstream: {
      id: string;
      icon?: string;
      label: string;
      relation: string;
    }[] = [];
    edges.forEach((edge) => {
      if (edge.source === selectedId) {
        const nd = nodes.find((n) => n.id === edge.target) as
          | ComponentNode
          | undefined;
        if (nd)
          downstream.push({
            id: nd.id,
            icon: nd.data.icon,
            label: nd.data.label,
            relation: (edge.label as string) ?? "供货",
          });
      }
      if (edge.target === selectedId) {
        const nd = nodes.find((n) => n.id === edge.source) as
          | ComponentNode
          | undefined;
        if (nd)
          upstream.push({
            id: nd.id,
            icon: nd.data.icon,
            label: nd.data.label,
            relation: (edge.label as string) ?? "采购",
          });
      }
    });
    return { upstream, downstream };
  })();

  const quickItems = nodes.slice(0, 4).map((node) => ({
    id: node.id,
    icon: node.data.icon,
    label: node.data.label,
    count: node.data.stocks.length,
  }));

  if (!graph && industryId !== "overview") {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-tertiary)]">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-3 px-6 py-0.5 border-b flex-shrink-0 sticky top-0 z-20"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
        }}
      >
        <button
          onClick={() => router.push("/industry")}
          className="flex items-center gap-1.5 text-sm transition-colors hover:text-[var(--text-primary)]"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={16} />
          产业列表
        </button>

        {industryId === "overview" ? (
          <>
            <span style={{ color: "var(--text-tertiary)" }}>/</span>
            <span
              className="font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              全景图
            </span>
          </>
        ) : (
          <>
            {searchParams.get("from") === "overview" && (
              <>
                <span style={{ color: "var(--text-tertiary)" }}>/</span>
                <button
                  onClick={() => router.push("/industry/overview")}
                  className="text-sm transition-colors hover:text-[var(--text-primary)]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  全景图
                </button>
              </>
            )}
            <span style={{ color: "var(--text-tertiary)" }}>/</span>
            <div>
              <span
                className="font-semibold text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {graph?.title}
              </span>
              <span
                className="text-xs ml-2"
                style={{ color: "var(--text-tertiary)" }}
              >
                {graph?.subtitle}
              </span>
            </div>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-secondary)" }}
                size={14}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults.length > 0) {
                    handleSearchSelect(searchResults[0]);
                  } else if (e.key === "Escape") {
                    setSearchQuery("");
                    setShowSearchDropdown(false);
                  }
                }}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSearchDropdown(true);
                }}
                placeholder="搜索股票名称或代码..."
                className="w-64 pl-8 pr-8 py-1.5 border rounded-md text-sm focus:outline-none focus:border-[#3b5bdb]"
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
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {showSearchDropdown && searchResults.length > 0 && (
              <div
                className="absolute top-full mt-1 w-full border rounded-md shadow-xl z-50 max-h-80 overflow-y-auto"
                style={{
                  background: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              >
                {searchResults.map((result, idx) => (
                  <button
                    key={`${result.nodeId}-${result.code}`}
                    onClick={() => handleSearchSelect(result)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-left transition-colors",
                      idx === 0 && "rounded-t-md",
                      idx === searchResults.length - 1 && "rounded-b-md",
                    )}
                  >
                    <span
                      className="text-sm"
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
                  </button>
                ))}
              </div>
            )}
          </div>

          {industryId !== "overview" && (
            <div
              className="flex border rounded-lg p-0.5"
              style={{
                background: "var(--bg-primary)",
                borderColor: "var(--border-color)",
              }}
            >
              <button
                onClick={() => {
                  setActiveTab("chain");
                  setSelectedId(null);
                  setPanelVisible(false);
                  setTimeout(
                    () =>
                      rfInstance.current?.fitView({
                        padding: 0.15,
                        duration: 300,
                      }),
                    50,
                  );
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  activeTab === "chain" ? "text-[var(--text-primary)]" : "",
                )}
                style={
                  activeTab === "chain"
                    ? {
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }
                    : { color: "var(--text-secondary)" }
                }
              >
                <span>🗺️</span> 供应链图谱
              </button>
              <button
                onClick={() => {
                  setActiveTab("anatomy");
                  setSelectedId(null);
                  setPanelVisible(false);
                  setTimeout(
                    () =>
                      rfInstance.current?.fitView({
                        padding: 0.15,
                        duration: 300,
                      }),
                    50,
                  );
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  activeTab === "anatomy" ? "text-[var(--text-primary)]" : "",
                )}
                style={
                  activeTab === "anatomy"
                    ? {
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }
                    : { color: "var(--text-secondary)" }
                }
              >
                <span>🔬</span> 3D 解剖图
              </button>
            </div>
          )}

          {activeTab === "chain" && industryId !== "overview" && (
            <div className="flex items-center gap-3 ml-2">
              {(["upstream", "core", "downstream", "application"] as const).map(
                (layer) => (
                  <div key={layer} className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: LAYER_STYLES[layer].border }}
                    />
                    <span
                      className="text-xs font-medium"
                      style={{ color: LAYER_STYLES[layer].border }}
                    >
                      {LAYER_LABEL[layer]}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}

          <button className="flex items-center gap-2 bg-[#f5a623]/10 hover:bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/30 px-3 py-1.5 rounded-lg text-xs transition-colors ml-1">
            <Bot size={13} />
            AI 分析
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {industryId === "overview" ? (
          <OverviewView
            onNavigate={(id) => router.push(`/industry/${id}?from=overview`)}
          />
        ) : activeTab === "chain" ? (
          <div className="flex-1 bg-[var(--bg-primary)] relative">
            <ReactFlow
              nodes={chainDisplayNodes.map((n) => ({
                ...n,
                selected: n.id === selectedId,
                style: selectedId
                  ? connectedNodeIds.has(n.id)
                    ? { opacity: 1 }
                    : { opacity: 0.2, filter: "grayscale(0.6)" }
                  : { opacity: 1 },
              }))}
              edges={edges.map((edge) => {
                const isConnected =
                  !selectedId ||
                  edge.source === selectedId ||
                  edge.target === selectedId;
                return {
                  ...edge,
                  style: {
                    ...edge.style,
                    opacity: isConnected ? 1 : 0.08,
                    strokeWidth: isConnected && selectedId ? 2.5 : 1.5,
                  },
                  animated: isConnected && !!selectedId,
                  labelStyle: isConnected
                    ? edge.labelStyle
                    : { ...edge.labelStyle, opacity: 0 },
                  labelBgStyle: isConnected
                    ? edge.labelBgStyle
                    : { ...edge.labelBgStyle, fillOpacity: 0 },
                };
              })}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
              onInit={(instance) => {
                rfInstance.current = instance;
              }}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.4}
              maxZoom={2}
            >
              <Background
                variant={BackgroundVariant.Dots}
                color="var(--bg-hover)"
                gap={24}
                size={1}
              />
              <Controls
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              />
              {flowLayerLabels.length > 0 &&
                (() => {
                  const yGroups = Array.from(
                    new Set(nodes.map((n) => n.position.y)),
                  ).sort((a, b) => a - b);
                  const layerColorMap: Record<string, string> = {
                    upstream: "#3b5bdb",
                    core: "#f5a623",
                    downstream: "#10b981",
                    application: "#8b5cf6",
                  };
                  const yToNodes = new Map<number, ComponentNode[]>();
                  nodes.forEach((n) => {
                    const arr = yToNodes.get(n.position.y) ?? [];
                    arr.push(n as ComponentNode);
                    yToNodes.set(n.position.y, arr);
                  });
                  return (
                    <Panel position="top-left">
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          gap: 6,
                          paddingTop: 4,
                        }}
                      >
                        {yGroups.map((y, i) => {
                          const label = flowLayerLabels[i] ?? `L${i}`;
                          const layerNodes = yToNodes.get(y) ?? [];
                          const dominantLayer =
                            (layerNodes[0] as ComponentNode | undefined)?.data
                              .layer ?? "upstream";
                          const color = layerColorMap[dominantLayer] ?? "#888";
                          return (
                            <div
                              key={y}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                padding: "5px 10px 5px 8px",
                                borderRadius: 7,
                                background: `${color}12`,
                                border: `1px solid ${color}33`,
                                borderLeft: `3px solid ${color}`,
                                backdropFilter: "blur(8px)",
                                WebkitBackdropFilter: "blur(8px)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 1,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 800,
                                    color,
                                    letterSpacing: "0.05em",
                                    lineHeight: 1.2,
                                  }}
                                >
                                  {label}
                                </span>
                                <span
                                  style={{
                                    fontSize: 9,
                                    color: "var(--text-tertiary)",
                                    lineHeight: 1.2,
                                  }}
                                >
                                  {layerNodes.length} 家企业
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Panel>
                  );
                })()}
            </ReactFlow>
            {!selectedId ? (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[var(--bg-hover)]/90 border border-[var(--border-secondary)] text-[var(--text-secondary)] text-xs px-4 py-2 rounded-full pointer-events-none">
                点击任意企业节点 → 高亮上下游关系 · 查看相关 A 股
              </div>
            ) : (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[var(--bg-hover)]/90 border border-[#f5a623]/40 text-[#f5a623] text-xs px-4 py-2 rounded-full pointer-events-none flex items-center gap-2">
                <span>↑↓ 已高亮</span>
                <span className="font-semibold">
                  {selectedFlowNode?.data.label}
                </span>
                <span>的 {connectedNodeIds.size - 1} 个上下游企业</span>
                <span className="text-[var(--text-tertiary)] ml-1">
                  · 点击空白处取消
                </span>
              </div>
            )}
          </div>
        ) : (
          <ProcessFlowView
            nodes={
              isCompanyChain
                ? nodes.filter(
                    (n) => (n as ComponentNode).data.stocks.length > 0,
                  )
                : nodes
            }
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setPanelVisible(true);
            }}
            layerLabels={flowLayerLabels}
            perfData={perfData}
            liveQuotes={liveQuotes}
            industryId={industryId}
          />
        )}

        {activeTab === "chain" && industryId !== "overview" && (
          <>
            <button
              onClick={() => setPanelVisible((v) => !v)}
              style={{
                position: "absolute",
                right: panelVisible ? 320 : 0,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 20,
                width: 16,
                height: 48,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderRight: panelVisible
                  ? "none"
                  : "1px solid var(--border-color)",
                borderRadius: panelVisible ? "6px 0 0 6px" : "0 6px 6px 0",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-tertiary)",
                fontSize: 10,
                transition: "right 0.2s ease",
              }}
              title={panelVisible ? "隐藏面板" : "显示面板"}
            >
              {panelVisible ? "›" : "‹"}
            </button>
            {panelVisible && (
              <div className="w-80 border-l border-[var(--border-color)] bg-[var(--bg-deep)] flex flex-col overflow-hidden flex-shrink-0">
                <RightPanel
                  item={rightPanelItem}
                  overrideStocks={stockOverrides}
                  liveQuotes={liveQuotes}
                  onOverride={handleOverride}
                  onClose={() => setSelectedId(null)}
                  onNavigate={(code) =>
                    router.push(
                      `/stock/${code}?from=/industry/${industryId}&tab=chain${selectedId ? `&node=${selectedId}` : ""}`,
                    )
                  }
                  quickItems={quickItems}
                  onSelectQuick={setSelectedId}
                  relatedItems={relatedItems}
                />
              </div>
            )}
          </>
        )}
        {activeTab === "anatomy" && industryId !== "overview" && (
          <>
            <button
              onClick={() => setPanelVisible((v) => !v)}
              style={{
                position: "absolute",
                right: panelVisible ? 320 : 0,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 20,
                width: 16,
                height: 48,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderRight: panelVisible
                  ? "none"
                  : "1px solid var(--border-color)",
                borderRadius: panelVisible ? "6px 0 0 6px" : "0 6px 6px 0",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-tertiary)",
                fontSize: 10,
                transition: "right 0.2s ease",
              }}
              title={panelVisible ? "隐藏面板" : "显示面板"}
            >
              {panelVisible ? "›" : "‹"}
            </button>
            {panelVisible && (
              <div className="w-80 border-l border-[var(--border-color)] bg-[var(--bg-deep)] flex flex-col overflow-hidden flex-shrink-0">
                <RightPanel
                  item={rightPanelItem}
                  overrideStocks={stockOverrides}
                  liveQuotes={liveQuotes}
                  onOverride={handleOverride}
                  onClose={() => setSelectedId(null)}
                  onNavigate={(code) =>
                    router.push(
                      `/stock/${code}?from=/industry/${industryId}&tab=anatomy${selectedId ? `&node=${selectedId}` : ""}`,
                    )
                  }
                  quickItems={[]}
                  onSelectQuick={setSelectedId}
                  relatedItems={relatedItems}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function IndustryAnimation({
  isLight,
  title,
  steps,
  renderStep,
  extraDefs,
}: {
  isLight: boolean;
  title: string;
  steps: { id: number; label: string }[];
  renderStep: (step: number) => React.ReactNode;
  extraDefs?: React.ReactNode;
}) {
  const [step, setStep] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!playing) return;
    timerRef.current = setTimeout(() => {
      setStep((s) => (s + 1) % steps.length);
    }, 2500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [step, playing, steps.length]);

  const bg = isLight ? "#f8fafc" : "#0f172a";
  const border = isLight ? "#e2e8f0" : "#1e293b";
  const textPri = isLight ? "#0f172a" : "#f1f5f9";
  const textSec = isLight ? "#64748b" : "#94a3b8";

  return (
    <div
      style={{
        marginBottom: 20,
        borderRadius: 12,
        border: `1px solid ${border}`,
        background: bg,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: `1px solid ${border}`,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: textPri }}>
          {title}
        </span>
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{
            fontSize: 11,
            padding: "3px 10px",
            borderRadius: 6,
            border: `1px solid ${border}`,
            background: "transparent",
            color: textSec,
            cursor: "pointer",
          }}
        >
          {playing ? "暂停" : "播放"}
        </button>
      </div>
      <div style={{ display: "flex" }}>
        <div
          style={{
            flex: 1,
            padding: "16px 20px",
            position: "relative",
            minHeight: 200,
          }}
        >
          <svg width="100%" viewBox="0 0 480 200" style={{ display: "block" }}>
            <defs>
              <filter id="ia-glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {extraDefs}
            </defs>
            {renderStep(step)}
          </svg>
        </div>
        <div
          style={{
            width: 130,
            borderLeft: `1px solid ${border}`,
            padding: "12px 0",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {steps.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setStep(s.id);
                setPlaying(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background:
                  step === s.id
                    ? isLight
                      ? "#f0f9ff"
                      : "#0f2744"
                    : "transparent",
                borderLeft:
                  step === s.id ? "2px solid #3b82f6" : "2px solid transparent",
                cursor: "pointer",
                textAlign: "left" as const,
                width: "100%",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background:
                    step === s.id ? "#3b82f6" : isLight ? "#e2e8f0" : "#1e293b",
                  color: step === s.id ? "#fff" : textSec,
                  fontSize: 9,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                }}
              >
                {s.id + 1}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color:
                    step === s.id ? (isLight ? "#1d4ed8" : "#60a5fa") : textSec,
                  lineHeight: 1.3,
                }}
              >
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PCBManufacturingAnimation({ isLight }: { isLight: boolean }) {
  const steps = [
    { id: 0, label: "原材料准备" },
    { id: 1, label: "CCL压合" },
    { id: 2, label: "涂布光刻胶" },
    { id: 3, label: "曝光显影" },
    { id: 4, label: "蚀刻线路" },
    { id: 5, label: "钻孔" },
    { id: 6, label: "电镀铜" },
    { id: 7, label: "成品测试" },
  ];

  const pcbDefs = (
    <>
      <linearGradient id="pcb-green" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#16a34a" stopOpacity="0.9" />
      </linearGradient>
      <linearGradient id="copper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f97316" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#c2410c" stopOpacity="0.95" />
      </linearGradient>
      <linearGradient id="fiberglass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e2e8f0" />
        <stop offset="100%" stopColor="#cbd5e1" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </>
  );

  const renderStep = (s: number) => {
    if (s === 0) return <StepRawMaterials />;
    if (s === 1) return <StepCCLPress />;
    if (s === 2) return <StepCoatPhotoresist />;
    if (s === 3) return <StepExposure />;
    if (s === 4) return <StepEtching />;
    if (s === 5) return <StepDrilling />;
    if (s === 6) return <StepPlating />;
    return <StepTesting />;
  };

  return (
    <IndustryAnimation
      isLight={isLight}
      title="PCB制造工艺动画"
      steps={steps}
      renderStep={renderStep}
      extraDefs={pcbDefs}
    />
  );
}

// ─── PCB Cross-section base layers (shared across steps 2-8) ───
// Coordinate system: viewBox="0 0 480 160"
// CCL structure (after press):
//   Top copper:    y=52, h=10
//   Top prepreg:   y=62, h=6
//   FR4 core:      y=68, h=20
//   Bottom prepreg:y=88, h=6
//   Bottom copper: y=94, h=10
// All steps show this base; each step highlights its own operation above/below.

function PCBBase({
  showTopCopper = true,
  showPhotoresist = false,
  photoresistMaskLeft = 0,
  photoresistMaskWidth = 0,
}: {
  showTopCopper?: boolean;
  showPhotoresist?: boolean;
  photoresistMaskLeft?: number;
  photoresistMaskWidth?: number;
}) {
  return (
    <g>
      {showTopCopper && (
        <rect
          x="60"
          y="52"
          width="360"
          height="10"
          rx="1"
          fill="url(#copper)"
        />
      )}
      <rect
        x="60"
        y="62"
        width="360"
        height="6"
        rx="0"
        fill="#a78bfa"
        opacity="0.5"
      />
      {/* FR4 core with weave lines */}
      <rect
        x="60"
        y="68"
        width="360"
        height="20"
        rx="0"
        fill="url(#fiberglass)"
      />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(
        (i) => (
          <line
            key={`v${i}`}
            x1={65 + i * 20}
            y1="68"
            x2={65 + i * 20}
            y2="88"
            stroke="#94a3b8"
            strokeWidth="0.5"
            opacity="0.3"
          />
        ),
      )}
      {[0, 1, 2, 3].map((i) => (
        <line
          key={`h${i}`}
          x1="60"
          y1={71 + i * 6}
          x2="420"
          y2={71 + i * 6}
          stroke="#94a3b8"
          strokeWidth="0.5"
          opacity="0.3"
        />
      ))}
      <rect
        x="60"
        y="88"
        width="360"
        height="6"
        rx="0"
        fill="#a78bfa"
        opacity="0.5"
      />
      <rect x="60" y="94" width="360" height="10" rx="1" fill="url(#copper)" />
      {showPhotoresist && (
        <rect
          x="60"
          y="42"
          width="360"
          height="9"
          rx="1"
          fill="#8b5cf6"
          opacity="0.7"
        />
      )}
    </g>
  );
}

function PCBLabel({
  x,
  y,
  text,
  color,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
}) {
  return (
    <text x={x} y={y} textAnchor="middle" fontSize="7.5" fill={color}>
      {text}
    </text>
  );
}

function StepRawMaterials() {
  return (
    <g>
      <text
        x="240"
        y="12"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="#f97316"
      >
        所有原材料一览
      </text>

      {/* ── 左侧：CCL压合用材料（5层结构） ── */}
      <text x="100" y="26" textAnchor="middle" fontSize="8" fill="#94a3b8">
        CCL压合层叠
      </text>

      {/* 铜箔 top */}
      <rect x="30" y="30" width="140" height="14" rx="2" fill="url(#copper)">
        <animate
          attributeName="opacity"
          from="0"
          to="1"
          dur="0.3s"
          fill="freeze"
        />
      </rect>
      <text x="100" y="40" textAnchor="middle" fontSize="8" fill="#fff">
        铜箔 Copper Foil
      </text>

      {/* 树脂 prepreg top */}
      <rect
        x="30"
        y="46"
        width="140"
        height="10"
        rx="1"
        fill="#a78bfa"
        opacity="0.75"
      >
        <animate
          attributeName="opacity"
          from="0"
          to="0.75"
          dur="0.3s"
          begin="0.15s"
          fill="freeze"
        />
      </rect>
      <text x="100" y="54" textAnchor="middle" fontSize="7" fill="#fff">
        环氧树脂 Prepreg
      </text>

      {/* 玻纤布 core */}
      <rect
        x="30"
        y="58"
        width="140"
        height="22"
        rx="2"
        fill="url(#fiberglass)"
      >
        <animate
          attributeName="opacity"
          from="0"
          to="1"
          dur="0.3s"
          begin="0.3s"
          fill="freeze"
        />
      </rect>
      {/* 玻纤纹路 */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line
          key={i}
          x1={32 + i * 20}
          y1="58"
          x2={32 + i * 20}
          y2="80"
          stroke="#94a3b8"
          strokeWidth="0.5"
          opacity="0.4"
        />
      ))}
      {[0, 1, 2].map((i) => (
        <line
          key={i}
          x1="30"
          y1={62 + i * 7}
          x2="170"
          y2={62 + i * 7}
          stroke="#94a3b8"
          strokeWidth="0.5"
          opacity="0.4"
        />
      ))}
      <text x="100" y="73" textAnchor="middle" fontSize="8" fill="#475569">
        玻纤布 FR4 Core
      </text>

      {/* 树脂 prepreg bottom */}
      <rect
        x="30"
        y="82"
        width="140"
        height="10"
        rx="1"
        fill="#a78bfa"
        opacity="0.75"
      >
        <animate
          attributeName="opacity"
          from="0"
          to="0.75"
          dur="0.3s"
          begin="0.45s"
          fill="freeze"
        />
      </rect>
      <text x="100" y="90" textAnchor="middle" fontSize="7" fill="#fff">
        环氧树脂 Prepreg
      </text>

      {/* 铜箔 bottom */}
      <rect x="30" y="94" width="140" height="14" rx="2" fill="url(#copper)">
        <animate
          attributeName="opacity"
          from="0"
          to="1"
          dur="0.3s"
          begin="0.6s"
          fill="freeze"
        />
      </rect>
      <text x="100" y="104" textAnchor="middle" fontSize="8" fill="#fff">
        铜箔 Copper Foil
      </text>

      <text x="100" y="118" textAnchor="middle" fontSize="7" fill="#a78bfa">
        ↑ 共5层 → 下一步高温压合
      </text>

      {/* ── 分隔线 ── */}
      <line
        x1="185"
        y1="20"
        x2="185"
        y2="135"
        stroke="#e2e8f0"
        strokeWidth="0.8"
        strokeDasharray="3,2"
        opacity="0.5"
      />

      {/* ── 右侧：后续工序耗材/设备 ── */}
      <text x="330" y="26" textAnchor="middle" fontSize="8" fill="#94a3b8">
        后续工序耗材/设备
      </text>

      {/* 钻针 */}
      <rect x="198" y="35" width="8" height="30" rx="2" fill="#64748b">
        <animate
          attributeName="opacity"
          from="0"
          to="1"
          dur="0.3s"
          begin="0.4s"
          fill="freeze"
        />
      </rect>
      <polygon points="198,65 206,65 202,75" fill="#475569">
        <animate
          attributeName="opacity"
          from="0"
          to="1"
          dur="0.3s"
          begin="0.4s"
          fill="freeze"
        />
      </polygon>
      <text x="230" y="48" fontSize="8" fill="#64748b">
        钻针 / 刀具
      </text>
      <text x="230" y="58" fontSize="7" fill="#94a3b8">
        钻孔工序使用
      </text>

      {/* 激光设备 */}
      <rect
        x="198"
        y="82"
        width="18"
        height="22"
        rx="2"
        fill="#1e293b"
        stroke="#3b82f6"
        strokeWidth="1"
      >
        <animate
          attributeName="opacity"
          from="0"
          to="1"
          dur="0.3s"
          begin="0.6s"
          fill="freeze"
        />
      </rect>
      <line
        x1="207"
        y1="104"
        x2="207"
        y2="118"
        stroke="#fbbf24"
        strokeWidth="2"
        opacity="0.9"
      >
        <animate
          attributeName="opacity"
          values="0.4;1;0.4"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </line>
      <ellipse cx="207" cy="119" rx="4" ry="2" fill="#fbbf24" opacity="0.6">
        <animate
          attributeName="opacity"
          values="0.3;0.8;0.3"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </ellipse>
      <text x="230" y="95" fontSize="8" fill="#3b82f6">
        激光设备
      </text>
      <text x="230" y="105" fontSize="7" fill="#94a3b8">
        钻孔/切割使用
      </text>

      {/* 化学药水烧杯 */}
      <path
        d="M285,35 L280,65 L300,65 L295,35 Z"
        fill="#ef4444"
        opacity="0.25"
        stroke="#ef4444"
        strokeWidth="1"
      >
        <animate
          attributeName="opacity"
          from="0"
          to="0.25"
          dur="0.3s"
          begin="0.8s"
          fill="freeze"
        />
      </path>
      <rect
        x="280"
        y="65"
        width="20"
        height="4"
        rx="1"
        fill="#ef4444"
        opacity="0.6"
      />
      <text x="283" y="52" fontSize="7" fill="#ef4444">
        HCl
      </text>
      <path d="M285,35 L295,35" stroke="#ef4444" strokeWidth="1.5" />
      <text x="310" y="48" fontSize="8" fill="#ef4444">
        化学药水
      </text>
      <text x="310" y="58" fontSize="7" fill="#94a3b8">
        蚀刻工序使用
      </text>

      {/* 光刻胶桶 */}
      <rect
        x="283"
        y="78"
        width="14"
        height="20"
        rx="2"
        fill="#8b5cf6"
        opacity="0.7"
      >
        <animate
          attributeName="opacity"
          from="0"
          to="0.7"
          dur="0.3s"
          begin="1s"
          fill="freeze"
        />
      </rect>
      <rect
        x="281"
        y="76"
        width="18"
        height="5"
        rx="1"
        fill="#7c3aed"
        opacity="0.8"
      />
      <text x="310" y="91" fontSize="8" fill="#8b5cf6">
        光刻胶
      </text>
      <text x="310" y="101" fontSize="7" fill="#94a3b8">
        曝光工序使用
      </text>

      <line
        x1="20"
        y1="142"
        x2="460"
        y2="142"
        stroke="#334155"
        strokeWidth="0.6"
        opacity="0.6"
      />
      <text
        x="240"
        y="154"
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill="#f97316"
      >
        为什么需要这些原材料？
      </text>
      <text x="240" y="166" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        铜箔导电、玻纤布支撑骨架、树脂粘合绝缘——三者缺一不可。
      </text>
      <text x="240" y="178" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        就像盖楼：铜是电线，玻纤是钢筋，树脂是水泥。
      </text>
    </g>
  );
}

function StepCCLPress() {
  return (
    <g>
      <text
        x="240"
        y="12"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="#06b6d4"
      >
        CCL覆铜板压合
      </text>

      <rect
        x="55"
        y="38"
        width="370"
        height="10"
        rx="2"
        fill="#475569"
        opacity="0.8"
      >
        <animate
          attributeName="y"
          from="2"
          to="38"
          dur="0.7s"
          begin="0.9s"
          fill="freeze"
        />
      </rect>
      <text x="240" y="46" textAnchor="middle" fontSize="7.5" fill="#e2e8f0">
        压板机 200°C / 30 kg/cm²
      </text>

      <rect x="60" y="52" width="360" height="10" rx="1" fill="url(#copper)">
        <animate attributeName="y" from="10" to="52" dur="0.5s" fill="freeze" />
      </rect>
      <PCBLabel x={240} y={59} text="铜箔" color="#fff" />

      <rect
        x="60"
        y="62"
        width="360"
        height="6"
        rx="0"
        fill="#a78bfa"
        opacity="0.75"
      >
        <animate
          attributeName="y"
          from="26"
          to="62"
          dur="0.5s"
          begin="0.15s"
          fill="freeze"
        />
      </rect>
      <PCBLabel x={240} y={67} text="Prepreg" color="#ede9fe" />

      <rect
        x="60"
        y="68"
        width="360"
        height="20"
        rx="0"
        fill="url(#fiberglass)"
      >
        <animate
          attributeName="y"
          from="60"
          to="68"
          dur="0.4s"
          begin="0.3s"
          fill="freeze"
        />
      </rect>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(
        (i) => (
          <line
            key={`cv${i}`}
            x1={65 + i * 20}
            y1="68"
            x2={65 + i * 20}
            y2="88"
            stroke="#94a3b8"
            strokeWidth="0.5"
            opacity="0.3"
          />
        ),
      )}
      {[0, 1, 2, 3].map((i) => (
        <line
          key={`ch${i}`}
          x1="60"
          y1={71 + i * 6}
          x2="420"
          y2={71 + i * 6}
          stroke="#94a3b8"
          strokeWidth="0.5"
          opacity="0.3"
        />
      ))}
      <PCBLabel x={240} y={80} text="FR4玻纤布芯层" color="#475569" />

      <rect
        x="60"
        y="88"
        width="360"
        height="6"
        rx="0"
        fill="#a78bfa"
        opacity="0.75"
      >
        <animate
          attributeName="y"
          from="106"
          to="88"
          dur="0.5s"
          begin="0.15s"
          fill="freeze"
        />
      </rect>
      <PCBLabel x={240} y={93} text="Prepreg" color="#ede9fe" />

      <rect x="60" y="94" width="360" height="10" rx="1" fill="url(#copper)">
        <animate
          attributeName="y"
          from="136"
          to="94"
          dur="0.5s"
          fill="freeze"
        />
      </rect>
      <PCBLabel x={240} y={101} text="铜箔" color="#fff" />

      <rect
        x="55"
        y="106"
        width="370"
        height="10"
        rx="2"
        fill="#475569"
        opacity="0.8"
      >
        <animate
          attributeName="y"
          from="150"
          to="106"
          dur="0.7s"
          begin="0.9s"
          fill="freeze"
        />
      </rect>

      <text x="240" y="126" textAnchor="middle" fontSize="8" fill="#f97316">
        ↑ 高温高压压合 → 形成CCL覆铜板
      </text>
      <text x="240" y="138" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        温度200°C · 压力30kg/cm² · 时长60min
      </text>

      <line
        x1="20"
        y1="148"
        x2="460"
        y2="148"
        stroke="#334155"
        strokeWidth="0.6"
        opacity="0.6"
      />
      <text
        x="240"
        y="160"
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill="#06b6d4"
      >
        为什么要压合？
      </text>
      <text x="240" y="172" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        散的材料没法用，压合后才是一块硬邦邦的"基板"——后续所有工序都在它上面做。
      </text>
      <text x="240" y="184" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        相当于把面粉、水、酵母揉成面团，之后才能继续加工。
      </text>
    </g>
  );
}

function StepCoatPhotoresist() {
  return (
    <g>
      <text
        x="240"
        y="12"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="#8b5cf6"
      >
        涂布光刻胶
      </text>

      <PCBBase showTopCopper={true} />

      <rect
        x="60"
        y="42"
        width="360"
        height="9"
        rx="1"
        fill="#8b5cf6"
        opacity="0.85"
      >
        <animate
          attributeName="width"
          from="0"
          to="360"
          dur="0.8s"
          fill="freeze"
        />
        <animate
          attributeName="opacity"
          from="0.3"
          to="0.85"
          dur="0.8s"
          fill="freeze"
        />
      </rect>
      <text x="240" y="49" textAnchor="middle" fontSize="7.5" fill="#ede9fe">
        光刻胶 Photoresist
      </text>

      <rect
        x="415"
        y="30"
        width="22"
        height="30"
        rx="3"
        fill="#1e293b"
        stroke="#7c3aed"
        strokeWidth="1"
      >
        <animate
          attributeName="x"
          from="60"
          to="415"
          dur="0.8s"
          fill="freeze"
        />
      </rect>
      <line x1="426" y1="60" x2="426" y2="52" stroke="#a78bfa" strokeWidth="2">
        <animate
          attributeName="x1"
          from="61"
          to="426"
          dur="0.8s"
          fill="freeze"
        />
        <animate
          attributeName="x2"
          from="61"
          to="426"
          dur="0.8s"
          fill="freeze"
        />
      </line>
      <text x="395" y="28" fontSize="7.5" fill="#a78bfa">
        旋涂机
      </text>

      <text x="240" y="126" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        厚度精度 ±0.5μm · 旋涂后烘烤固化
      </text>

      <line
        x1="20"
        y1="136"
        x2="460"
        y2="136"
        stroke="#334155"
        strokeWidth="0.6"
        opacity="0.6"
      />
      <text
        x="240"
        y="148"
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill="#8b5cf6"
      >
        为什么要涂光刻胶？
      </text>
      <text x="240" y="160" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        光刻胶遇到紫外线会变硬——涂上它是为了用"光"来画出电路图案，
      </text>
      <text x="240" y="172" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        没被光照到的部分之后会被洗掉，形成保护掩膜。就像晒蓝图一样。
      </text>
    </g>
  );
}

function StepExposure() {
  return (
    <g>
      <text
        x="240"
        y="12"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="#fbbf24"
      >
        UV曝光 → 线路图形转移
      </text>

      <PCBBase showTopCopper={true} showPhotoresist={true} />

      <rect
        x="60"
        y="30"
        width="360"
        height="11"
        rx="1"
        fill="#1d4ed8"
        opacity="0.55"
      />
      {[90, 140, 200, 265, 330, 375].map((x, i) => (
        <rect
          key={`mask${i}`}
          x={x}
          y="30"
          width={i % 2 === 0 ? 22 : 32}
          height="11"
          fill="#0f172a"
          opacity="0.9"
        />
      ))}
      <text x="240" y="28" textAnchor="middle" fontSize="7.5" fill="#93c5fd">
        菲林掩膜
      </text>

      <rect
        x="60"
        y="16"
        width="360"
        height="8"
        rx="2"
        fill="#fbbf24"
        opacity="0.85"
      />
      <text x="240" y="22" textAnchor="middle" fontSize="7" fill="#fff">
        UV光源
      </text>

      {[90, 130, 175, 220, 270, 315, 360, 400].map((x, i) => (
        <line
          key={`beam${i}`}
          x1={x}
          y1="24"
          x2={x}
          y2="30"
          stroke="#fde68a"
          strokeWidth="1.5"
          filter="url(#glow)"
        >
          <animate
            attributeName="opacity"
            values="0.3;1;0.3"
            dur="0.9s"
            repeatCount="indefinite"
            begin={`${i * 0.1}s`}
          />
        </line>
      ))}

      <text x="240" y="118" textAnchor="middle" fontSize="7.5" fill="#fbbf24">
        曝光区域光刻胶发生光化学反应
      </text>
      <text x="240" y="130" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        分辨率可达 2μm线宽 · 对准精度 ±1μm
      </text>

      <line
        x1="20"
        y1="140"
        x2="460"
        y2="140"
        stroke="#334155"
        strokeWidth="0.6"
        opacity="0.6"
      />
      <text
        x="240"
        y="152"
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill="#fbbf24"
      >
        为什么要曝光？
      </text>
      <text x="240" y="164" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        用紫外线把"电路图纸"（菲林掩膜）投影到光刻胶上——被光照到的区域变硬留下，
      </text>
      <text x="240" y="176" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        没被照到的软胶再用显影液洗掉，铜线路轮廓就被"画"出来了。
      </text>
    </g>
  );
}

function StepEtching() {
  const traces = [
    { x: 60, w: 55 },
    { x: 135, w: 70 },
    { x: 225, w: 50 },
    { x: 295, w: 65 },
    { x: 380, w: 40 },
  ];
  const gaps = [
    { x: 115, w: 20 },
    { x: 205, w: 20 },
    { x: 275, w: 20 },
    { x: 360, w: 20 },
  ];
  return (
    <g>
      <text
        x="240"
        y="12"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="#ef4444"
      >
        蚀刻 → 线路成型
      </text>

      <PCBBase showTopCopper={false} />

      {traces.map((t, i) => (
        <rect
          key={`tr${i}`}
          x={t.x}
          y="52"
          width={t.w}
          height="10"
          rx="1"
          fill="url(#copper)"
        />
      ))}

      {traces.map((t, i) => (
        <rect
          key={`pr${i}`}
          x={t.x}
          y="42"
          width={t.w}
          height="10"
          rx="1"
          fill="#8b5cf6"
          opacity="0.75"
        />
      ))}

      {gaps.map((g, i) => (
        <rect
          key={`gap${i}`}
          x={g.x}
          y="52"
          width={g.w}
          height="10"
          fill="#ef4444"
          opacity="0.4"
        >
          <animate
            attributeName="opacity"
            values="0.4;0;0.4"
            dur="0.9s"
            repeatCount="indefinite"
            begin={`${i * 0.22}s`}
          />
          <animate
            attributeName="height"
            values="10;0;10"
            dur="0.9s"
            repeatCount="indefinite"
            begin={`${i * 0.22}s`}
          />
        </rect>
      ))}

      <text x="240" y="38" textAnchor="middle" fontSize="7" fill="#a78bfa">
        光刻胶保护罩（不被腐蚀）
      </text>
      <text x="240" y="118" textAnchor="middle" fontSize="7.5" fill="#ef4444">
        ← 间隙铜箔被蚀刻液溶掉，线路铜箔被光刻胶护住
      </text>
      <text x="240" y="130" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        蚀刻后再"去膜"洗掉光刻胶，露出干净铜线路
      </text>

      <line
        x1="20"
        y1="142"
        x2="460"
        y2="142"
        stroke="#334155"
        strokeWidth="0.6"
        opacity="0.6"
      />
      <text
        x="240"
        y="154"
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill="#ef4444"
      >
        为什么要蚀刻？
      </text>
      <text x="240" y="166" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        铜箔整层铺满，蚀刻就是把"不需要的铜"用化学液腐蚀溶解掉，
      </text>
      <text x="240" y="178" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        只留下有光刻胶保护的那部分——那才是真正的电路线路。
      </text>
    </g>
  );
}

function StepDrilling() {
  const viaXs = [140, 200, 260, 320];
  const traces = [
    { x: 60, w: 55 },
    { x: 135, w: 70 },
    { x: 225, w: 50 },
    { x: 295, w: 65 },
    { x: 380, w: 40 },
  ];
  return (
    <g>
      <text
        x="240"
        y="12"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="#fbbf24"
      >
        激光钻孔 → 层间通道
      </text>

      <PCBBase showTopCopper={false} />

      {traces.map((t, i) => (
        <rect
          key={`tr${i}`}
          x={t.x}
          y="52"
          width={t.w}
          height="10"
          rx="1"
          fill="url(#copper)"
        />
      ))}

      {viaXs.map((x, i) => (
        <g key={`via${i}`}>
          <rect
            x={x - 3}
            y="18"
            width="6"
            height="28"
            rx="2"
            fill={i === 1 ? "#fbbf24" : "#64748b"}
            opacity="0.85"
          >
            {i === 1 && (
              <animate
                attributeName="y"
                values="6;18;6"
                dur="1.1s"
                repeatCount="indefinite"
              />
            )}
          </rect>
          {i === 1 && (
            <circle cx={x} cy="46" r="3.5" fill="#fbbf24" filter="url(#glow)">
              <animate
                attributeName="cy"
                values="34;46;34"
                dur="1.1s"
                repeatCount="indefinite"
              />
            </circle>
          )}

          <rect
            x={x - 3}
            y="52"
            width="6"
            height="52"
            rx="1"
            fill="#0f172a"
            opacity="0.75"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="0.75"
              dur="0.4s"
              begin={`${0.3 + i * 0.15}s`}
              fill="freeze"
            />
          </rect>
        </g>
      ))}

      <text x="240" y="120" textAnchor="middle" fontSize="7.5" fill="#fbbf24">
        激光钻孔机 精度 ±25μm
      </text>
      <text x="240" y="132" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        孔径最小 0.1mm · 40层板需钻数万孔
      </text>

      <line
        x1="20"
        y1="142"
        x2="460"
        y2="142"
        stroke="#334155"
        strokeWidth="0.6"
        opacity="0.6"
      />
      <text
        x="240"
        y="154"
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill="#fbbf24"
      >
        为什么要钻孔？
      </text>
      <text x="240" y="166" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        PCB有很多层，上下层的电路需要"打通"才能连通电信号。
      </text>
      <text x="240" y="178" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        钻出的小孔就是层与层之间的"电梯井"，之后填铜才能导电。
      </text>
    </g>
  );
}

function StepPlating() {
  const viaXs = [140, 200, 260, 320];
  const traces = [
    { x: 60, w: 55 },
    { x: 135, w: 70 },
    { x: 225, w: 50 },
    { x: 295, w: 65 },
    { x: 380, w: 40 },
  ];
  return (
    <g>
      <text
        x="240"
        y="12"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="#f97316"
      >
        电镀铜 → 层间导通
      </text>

      <PCBBase showTopCopper={false} />

      {traces.map((t, i) => (
        <rect
          key={`tr${i}`}
          x={t.x}
          y="52"
          width={t.w}
          height="10"
          rx="1"
          fill="url(#copper)"
        />
      ))}

      {viaXs.map((x, i) => (
        <g key={`via${i}`}>
          <rect
            x={x - 3}
            y="52"
            width="6"
            height="52"
            rx="1"
            fill="#0f172a"
            opacity="0.6"
          />
          <rect
            x={x - 3}
            y="52"
            width="6"
            height="52"
            rx="1"
            fill="#f97316"
            opacity="0.9"
          >
            <animate
              attributeName="height"
              from="0"
              to="52"
              dur="0.9s"
              fill="freeze"
              begin={`${i * 0.2}s`}
            />
            <animate
              attributeName="y"
              from="104"
              to="52"
              dur="0.9s"
              fill="freeze"
              begin={`${i * 0.2}s`}
            />
          </rect>
          <ellipse cx={x} cy="52" rx="3" ry="1.5" fill="#fbbf24" opacity="0.7">
            <animate
              attributeName="opacity"
              values="0.4;1;0.4"
              dur="1s"
              repeatCount="indefinite"
              begin={`${i * 0.2}s`}
            />
          </ellipse>
        </g>
      ))}

      <text x="240" y="120" textAnchor="middle" fontSize="7.5" fill="#f97316">
        电解铜沉积 · 电流密度 15–25 A/dm²
      </text>
      <text x="240" y="132" textAnchor="middle" fontSize="7.5" fill="#22c55e">
        铜厚 ≥ 25μm → 通孔导通可靠
      </text>

      <line
        x1="20"
        y1="142"
        x2="460"
        y2="142"
        stroke="#334155"
        strokeWidth="0.6"
        opacity="0.6"
      />
      <text
        x="240"
        y="154"
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill="#f97316"
      >
        为什么要电镀铜？
      </text>
      <text x="240" y="166" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        钻出的孔只是空洞，无法导电。通电后铜离子会沉积在孔壁，
      </text>
      <text x="240" y="178" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        像给管道内壁镀上铜衬，上下层才真正"接通"。
      </text>
    </g>
  );
}

function StepTesting() {
  const viaXs = [140, 200, 260, 320];
  const traces = [
    { x: 60, w: 55 },
    { x: 135, w: 70 },
    { x: 225, w: 50 },
    { x: 295, w: 65 },
    { x: 380, w: 40 },
  ];
  const probeXs = [87, 170, 247, 327, 400];
  return (
    <g>
      <text
        x="240"
        y="12"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="#22c55e"
      >
        成品测试 → 出货
      </text>

      <PCBBase showTopCopper={false} />

      {traces.map((t, i) => (
        <rect
          key={`tr${i}`}
          x={t.x}
          y="52"
          width={t.w}
          height="10"
          rx="1"
          fill="url(#copper)"
        />
      ))}

      {viaXs.map((x, i) => (
        <rect
          key={`via${i}`}
          x={x - 3}
          y="52"
          width="6"
          height="52"
          rx="1"
          fill="#f97316"
          opacity="0.9"
        />
      ))}

      <rect
        x="60"
        y="42"
        width="360"
        height="10"
        rx="1"
        fill="url(#pcb-green)"
        opacity="0.85"
      >
        <animate
          attributeName="opacity"
          from="0"
          to="0.85"
          dur="0.6s"
          fill="freeze"
        />
      </rect>
      <text x="240" y="49" textAnchor="middle" fontSize="7" fill="#fff">
        阻焊层 Solder Mask
      </text>

      <rect
        x="60"
        y="104"
        width="360"
        height="6"
        rx="1"
        fill="url(#pcb-green)"
        opacity="0.8"
      />

      {probeXs.map((x, i) => (
        <g key={`probe${i}`}>
          <line
            x1={x}
            y1="20"
            x2={x}
            y2="42"
            stroke={i % 2 === 0 ? "#22c55e" : "#ef4444"}
            strokeWidth="1.5"
          >
            <animate
              attributeName="y2"
              values="20;42;20"
              dur="0.65s"
              repeatCount="indefinite"
              begin={`${i * 0.13}s`}
            />
          </line>
          <circle
            cx={x}
            cy="20"
            r="3"
            fill={i % 2 === 0 ? "#22c55e" : "#ef4444"}
          >
            <animate
              attributeName="cy"
              values="14;20;14"
              dur="0.65s"
              repeatCount="indefinite"
              begin={`${i * 0.13}s`}
            />
          </circle>
        </g>
      ))}

      <text x="240" y="120" textAnchor="middle" fontSize="7.5" fill="#22c55e">
        AOI光学检测 + 飞针测试
      </text>
      <text x="240" y="132" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        40层AI服务器PCB良率目标 &gt;99.5%
      </text>

      <line
        x1="20"
        y1="142"
        x2="460"
        y2="142"
        stroke="#334155"
        strokeWidth="0.6"
        opacity="0.6"
      />
      <text
        x="240"
        y="154"
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill="#22c55e"
      >
        为什么要测试？
      </text>
      <text x="240" y="166" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        一块PCB有数万条线路，任何一处断路或短路都会让整台服务器报废。
      </text>
      <text x="240" y="178" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        飞针逐点探测，相当于给每根"血管"做一次通断体检再出货。
      </text>
    </g>
  );
}
