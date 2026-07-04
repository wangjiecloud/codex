"use client";
import React from "react";

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Bottom "why" explanation block (reusable across all animations) */
function W({
  title,
  line1,
  line2,
  color,
}: {
  title: string;
  line1: string;
  line2: string;
  color: string;
}) {
  return (
    <>
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
        fill={color}
      >
        {title}
      </text>
      <text x="240" y="166" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        {line1}
      </text>
      <text x="240" y="178" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        {line2}
      </text>
    </>
  );
}

/** Generic industry animation shell */
function IA({
  isLight,
  title,
  steps,
  renderStep,
}: {
  isLight: boolean;
  title: string;
  steps: { id: number; label: string }[];
  renderStep: (step: number) => React.ReactNode;
}) {
  const [step, setStep] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!playing) return;
    timerRef.current = setTimeout(
      () => setStep((s) => (s + 1) % steps.length),
      2500,
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [step, playing, steps.length]);

  const cardBg = isLight ? "#f8fafc" : "#0f172a";
  const border = isLight ? "#e2e8f0" : "#1e293b";
  const titleColor = isLight ? "#0f172a" : "#f1f5f9";
  const labelActive = isLight ? "#1e293b" : "#f1f5f9";
  const labelInactive = isLight ? "#94a3b8" : "#475569";
  const dotActive = isLight ? "#6366f1" : "#818cf8";
  const dotInactive = isLight ? "#cbd5e1" : "#334155";
  const btnBg = isLight ? "#e2e8f0" : "#1e293b";
  const btnColor = isLight ? "#475569" : "#94a3b8";

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          background: cardBg,
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: "16px 20px",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: titleColor }}>
            {title}
          </span>
          <button
            onClick={() => setPlaying((p) => !p)}
            style={{
              fontSize: 11,
              color: btnColor,
              background: btnBg,
              border: "none",
              borderRadius: 6,
              padding: "3px 10px",
              cursor: "pointer",
            }}
          >
            {playing ? "⏸ 暂停" : "▶ 播放"}
          </button>
        </div>

        {/* step labels */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
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
                gap: 5,
                fontSize: 11,
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background:
                  step === s.id ? (isLight ? "#ede9fe" : "#312e81") : btnBg,
                color: step === s.id ? labelActive : labelInactive,
                fontWeight: step === s.id ? 600 : 400,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: step === s.id ? dotActive : dotInactive,
                  display: "inline-block",
                }}
              />
              {s.label}
            </button>
          ))}
        </div>

        {/* SVG */}
        <svg
          viewBox="0 0 480 190"
          style={{
            width: "100%",
            borderRadius: 8,
            background: isLight ? "#f1f5f9" : "#0f172a",
          }}
        >
          <defs>
            <filter id="ia-glow3" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {renderStep(step)}
        </svg>

        {/* progress dots */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 6,
            marginTop: 10,
          }}
        >
          {steps.map((s) => (
            <div
              key={s.id}
              onClick={() => {
                setStep(s.id);
                setPlaying(false);
              }}
              style={{
                width: step === s.id ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: step === s.id ? dotActive : dotInactive,
                cursor: "pointer",
                transition: "width 0.3s",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Optics (光模块与CPO) ────────────────────────────────────────────────────

const OPTICS_STEPS = [
  { id: 0, label: "激光芯片制造" },
  { id: 1, label: "光器件封装" },
  { id: 2, label: "800G光模块" },
  { id: 3, label: "集成NVSwitch" },
];

function OpticsStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    // Laser chip: wafer with active region
    return (
      <>
        {/* wafer */}
        <ellipse
          cx="240"
          cy="72"
          rx="80"
          ry="18"
          fill="#1e293b"
          stroke="#334155"
          strokeWidth="1"
        />
        <ellipse
          cx="240"
          cy="68"
          rx="80"
          ry="18"
          fill="#0f172a"
          stroke="#6366f1"
          strokeWidth="1.5"
        />
        {/* epitaxial layers */}
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={160}
            y={52 - i * 7}
            width={160}
            height={5}
            fill={["#312e81", "#4338ca", "#6366f1", "#818cf8"][i]}
            rx="1"
            opacity="0.85"
          />
        ))}
        {/* active region glow */}
        <rect
          x={180}
          y={31}
          width={120}
          height={8}
          fill="#a5f3fc"
          rx="2"
          opacity={0.4 + 0.5 * pulse}
          filter="url(#ia-glow3)"
        />
        {/* laser beam */}
        <line
          x1="320"
          y1="35"
          x2="400"
          y2="35"
          stroke="#22d3ee"
          strokeWidth="2.5"
          opacity={0.7 + 0.3 * pulse}
          filter="url(#ia-glow3)"
          strokeDasharray="6 3"
        />
        <polygon
          points="396,31 408,35 396,39"
          fill="#22d3ee"
          opacity={0.8 + 0.2 * pulse}
        />
        <text x="240" y="105" textAnchor="middle" fontSize="9" fill="#94a3b8">
          磷化铟(InP)外延片
        </text>
        <text x="240" y="117" textAnchor="middle" fontSize="9" fill="#818cf8">
          多量子阱有源层
        </text>
        <text x="355" y="30" fontSize="8" fill="#22d3ee">
          激光输出
        </text>
        <W
          title="为什么用InP芯片？"
          line1="InP（磷化铟）能在1310/1550nm波长发光，正好是光纤传输的"
          line2="低损耗窗口，是高速光通信不可替代的核心材料。"
          color="#818cf8"
        />
      </>
    );
  }

  if (step === 1) {
    // COB packaging: chip on carrier
    return (
      <>
        {/* carrier substrate */}
        <rect
          x="120"
          y="55"
          width="240"
          height="40"
          rx="4"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="1.2"
        />
        <text x="240" y="79" textAnchor="middle" fontSize="8" fill="#93c5fd">
          硅光子载板
        </text>
        {/* laser die */}
        <rect
          x="155"
          y="45"
          width="40"
          height="30"
          rx="2"
          fill="#312e81"
          stroke="#818cf8"
          strokeWidth="1.2"
        />
        <text x="175" y="63" textAnchor="middle" fontSize="7" fill="#a5b4fc">
          LD芯片
        </text>
        {/* photodetector */}
        <rect
          x="285"
          y="45"
          width="40"
          height="30"
          rx="2"
          fill="#064e3b"
          stroke="#34d399"
          strokeWidth="1.2"
        />
        <text x="305" y="63" textAnchor="middle" fontSize="7" fill="#6ee7b7">
          PD芯片
        </text>
        {/* waveguide */}
        <line
          x1="195"
          y1="60"
          x2="285"
          y2="60"
          stroke="#22d3ee"
          strokeWidth="3"
          opacity={0.6 + 0.4 * pulse}
          filter="url(#ia-glow3)"
        />
        {/* driver IC */}
        <rect
          x="215"
          y="42"
          width="50"
          height="24"
          rx="2"
          fill="#1c1917"
          stroke="#78716c"
          strokeWidth="1"
        />
        <text x="240" y="57" textAnchor="middle" fontSize="7" fill="#a8a29e">
          驱动IC
        </text>
        {/* bond wires */}
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M${195 + i * 10},45 Q${200 + i * 10},30 ${215 + i * 10},42`}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="0.8"
            opacity="0.7"
          />
        ))}
        <text x="240" y="115" textAnchor="middle" fontSize="9" fill="#94a3b8">
          激光芯片+光探测器+驱动IC共封装
        </text>
        <W
          title="为什么要集成封装？"
          line1="把多颗芯片封装在同一基板上，减少互连损耗和延迟，"
          line2="800G以上速率必须用这种COB/硅光子集成方案。"
          color="#34d399"
        />
      </>
    );
  }

  if (step === 2) {
    // 800G module housing
    return (
      <>
        {/* module body */}
        <rect
          x="80"
          y="40"
          width="320"
          height="55"
          rx="6"
          fill="#0f172a"
          stroke="#6366f1"
          strokeWidth="1.5"
        />
        {/* connector */}
        <rect
          x="80"
          y="52"
          width="24"
          height="30"
          rx="2"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1"
        />
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x="85"
            y={55 + i * 6}
            width="14"
            height="3"
            rx="1"
            fill="#fbbf24"
            opacity="0.8"
          />
        ))}
        {/* optical ports */}
        <rect
          x="376"
          y="52"
          width="24"
          height="30"
          rx="2"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1"
        />
        {[0, 1].map((i) => (
          <circle
            key={i}
            cx="388"
            cy={60 + i * 12}
            r="4"
            fill="#0f172a"
            stroke="#22d3ee"
            strokeWidth="1.2"
          />
        ))}
        {/* internal components */}
        <rect
          x="120"
          y="50"
          width="60"
          height="35"
          rx="2"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="1"
        />
        <text x="150" y="71" textAnchor="middle" fontSize="7.5" fill="#93c5fd">
          DSP芯片
        </text>
        <rect
          x="200"
          y="50"
          width="60"
          height="35"
          rx="2"
          fill="#312e81"
          stroke="#818cf8"
          strokeWidth="1"
        />
        <text x="230" y="71" textAnchor="middle" fontSize="7.5" fill="#a5b4fc">
          光引擎
        </text>
        <rect
          x="280"
          y="50"
          width="60"
          height="35"
          rx="2"
          fill="#064e3b"
          stroke="#34d399"
          strokeWidth="1"
        />
        <text x="310" y="71" textAnchor="middle" fontSize="7.5" fill="#6ee7b7">
          TIA阵列
        </text>
        {/* data flow */}
        <line
          x1="180"
          y1="67"
          x2="200"
          y2="67"
          stroke="#6366f1"
          strokeWidth="2"
          opacity={0.7 + 0.3 * pulse}
        />
        <line
          x1="260"
          y1="67"
          x2="280"
          y2="67"
          stroke="#22d3ee"
          strokeWidth="2"
          opacity={0.7 + 0.3 * pulse}
        />
        {/* label */}
        <text
          x="240"
          y="108"
          textAnchor="middle"
          fontSize="9"
          fill="#818cf8"
          fontWeight="600"
        >
          800G QSFP-DD 光模块
        </text>
        <W
          title="为什么需要800G光模块？"
          line1="AI训练集群中，GPU之间需要超高速低延迟互联，"
          line2="800G/1.6T光模块是连接万卡集群的数据通路核心。"
          color="#6366f1"
        />
      </>
    );
  }

  // step 3: NVSwitch integration
  return (
    <>
      {/* NVSwitch chip */}
      <rect
        x="180"
        y="30"
        width="120"
        height="50"
        rx="6"
        fill="#1a1a2e"
        stroke="#6366f1"
        strokeWidth="2"
      />
      <text
        x="240"
        y="60"
        textAnchor="middle"
        fontSize="9"
        fill="#818cf8"
        fontWeight="600"
      >
        NVSwitch 4.0
      </text>
      <text x="240" y="72" textAnchor="middle" fontSize="7.5" fill="#475569">
        900GB/s 全互联
      </text>
      {/* optical modules around */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const cx = 240 + 110 * Math.cos(angle);
        const cy = 55 + 50 * Math.sin(angle);
        return (
          <g key={i}>
            <rect
              x={cx - 18}
              y={cy - 8}
              width="36"
              height="16"
              rx="3"
              fill="#0f172a"
              stroke="#22d3ee"
              strokeWidth="1"
            />
            <text
              x={cx}
              y={cy + 3}
              textAnchor="middle"
              fontSize="6.5"
              fill="#22d3ee"
            >
              800G
            </text>
            <line
              x1={240 + 60 * Math.cos(angle)}
              y1={55 + 27 * Math.sin(angle)}
              x2={cx - 18 * Math.cos(angle)}
              y2={cy - 8 * Math.sin(angle)}
              stroke="#6366f1"
              strokeWidth="1.2"
              opacity={0.5 + 0.4 * pulse}
            />
          </g>
        );
      })}
      <text x="240" y="118" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
        NVL72机柜：72颗H100 + NVSwitch光互联
      </text>
      <W
        title="为什么光模块是NVL72瓶颈？"
        line1="每块NVSwitch需要64个800G光模块，整机柜需数百个，"
        line2="光模块产能直接决定AI算力集群的交付速度。"
        color="#22d3ee"
      />
    </>
  );
}

export function OpticsAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="光模块制造全流程"
      steps={OPTICS_STEPS}
      renderStep={(s) => <OpticsStep step={s} />}
    />
  );
}

// ─── MLCC (积层陶瓷电容器) ────────────────────────────────────────────────────

const MLCC_STEPS = [
  { id: 0, label: "钛酸钡原料" },
  { id: 1, label: "流延成膜" },
  { id: 2, label: "叠层烧结" },
  { id: 3, label: "贴装PCB" },
];

function MlccStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    return (
      <>
        {/* BaTiO3 crystal lattice */}
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => (
            <g key={`${row}-${col}`}>
              <circle
                cx={180 + col * 50}
                cy={40 + row * 30}
                r="10"
                fill="#4338ca"
                stroke="#818cf8"
                strokeWidth="1.2"
                opacity="0.9"
              />
              <text
                x={180 + col * 50}
                y={44 + row * 30}
                textAnchor="middle"
                fontSize="7"
                fill="#c7d2fe"
              >
                Ba
              </text>
              <circle
                cx={205 + col * 50}
                cy={55 + row * 30}
                r="6"
                fill="#0e7490"
                stroke="#22d3ee"
                strokeWidth="1"
                opacity="0.9"
              />
              <text
                x={205 + col * 50}
                y={58 + row * 30}
                textAnchor="middle"
                fontSize="5.5"
                fill="#a5f3fc"
              >
                Ti
              </text>
            </g>
          )),
        )}
        {/* arrows */}
        {[0, 1].map((i) => (
          <line
            key={i}
            x1={195 + i * 50}
            y1="55"
            x2={205 + i * 50}
            y2="55"
            stroke="#fbbf24"
            strokeWidth="0.8"
            opacity="0.5"
          />
        ))}
        <text x="240" y="115" textAnchor="middle" fontSize="9" fill="#94a3b8">
          BaTiO₃（钛酸钡）钙钛矿晶格
        </text>
        <W
          title="为什么用钛酸钡？"
          line1="钛酸钡是强介电材料，介电常数极高（>1000），"
          line2="同样体积能存储更多电荷，是MLCC核心原材料。"
          color="#818cf8"
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {/* tape casting process */}
        {/* slurry tank */}
        <rect
          x="60"
          y="45"
          width="60"
          height="45"
          rx="4"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="1.2"
        />
        <text x="90" y="71" textAnchor="middle" fontSize="8" fill="#93c5fd">
          浆料罐
        </text>
        {/* doctor blade */}
        <rect
          x="140"
          y="60"
          width="8"
          height="35"
          rx="1"
          fill="#334155"
          stroke="#64748b"
          strokeWidth="1"
        />
        <text x="144" y="55" textAnchor="middle" fontSize="7" fill="#94a3b8">
          刮刀
        </text>
        {/* film layers */}
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x="148"
            y={65 + i * 10}
            width="220"
            height="7"
            fill={i % 2 === 0 ? "#312e81" : "#1e3a5f"}
            stroke={i % 2 === 0 ? "#818cf8" : "#60a5fa"}
            strokeWidth="0.6"
            rx="1"
            opacity={0.7 + 0.3 * (i === 2 ? pulse : 1)}
          />
        ))}
        {/* drying oven */}
        <rect
          x="360"
          y="50"
          width="70"
          height="40"
          rx="4"
          fill="#1c1917"
          stroke="#f97316"
          strokeWidth="1.2"
        />
        <text x="395" y="73" textAnchor="middle" fontSize="8" fill="#fb923c">
          烘干炉
        </text>
        {/* film movement arrow */}
        <line
          x1="368"
          y1="82"
          x2="358"
          y2="82"
          stroke="#fbbf24"
          strokeWidth="1.5"
          markerEnd="url(#arr)"
          opacity={0.8}
        />
        <text x="240" y="115" textAnchor="middle" fontSize="9" fill="#94a3b8">
          陶瓷浆料 → 刮刀流延 → 2μm薄膜 → 烘干
        </text>
        <W
          title="为什么要流延成膜？"
          line1="MLCC的介质层厚度决定容量，现代MLCC每层仅0.5-2μm，"
          line2="流延工艺是实现超薄均匀陶瓷膜的唯一量产手段。"
          color="#60a5fa"
        />
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {/* stacked layers */}
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect
            key={i}
            x="140"
            y={30 + i * 10}
            width="200"
            height="8"
            fill={i % 2 === 0 ? "#312e81" : "#b45309"}
            stroke={i % 2 === 0 ? "#818cf8" : "#fbbf24"}
            strokeWidth="0.6"
            rx="1"
            opacity="0.9"
          />
        ))}
        {/* layer labels */}
        <text x="130" y="35" textAnchor="end" fontSize="7" fill="#818cf8">
          介质层
        </text>
        <text x="130" y="45" textAnchor="end" fontSize="7" fill="#fbbf24">
          内电极(Ni)
        </text>
        <text x="130" y="55" textAnchor="end" fontSize="7" fill="#818cf8">
          介质层
        </text>

        {/* sintering furnace */}
        <rect
          x="130"
          y="90"
          width="220"
          height="30"
          rx="6"
          fill="#1c1917"
          stroke="#f97316"
          strokeWidth="1.5"
        />
        <text x="240" y="109" textAnchor="middle" fontSize="9" fill="#fb923c">
          1200°C 烧结炉 → 致密化
        </text>
        {/* heat waves */}
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M${170 + i * 30},90 Q${185 + i * 30},80 ${200 + i * 30},90`}
            fill="none"
            stroke="#f97316"
            strokeWidth="1"
            opacity={0.5 + 0.4 * pulse}
          />
        ))}
        <W
          title="为什么要叠层烧结？"
          line1="叠层使电容量与层数成正比，200-1000层实现超大容量；"
          line2="1200°C烧结让陶瓷和镍电极同时致密化形成整体。"
          color="#f97316"
        />
      </>
    );
  }

  // step 3: SMT placement
  return (
    <>
      {/* PCB */}
      <rect
        x="60"
        y="60"
        width="360"
        height="50"
        rx="4"
        fill="#14532d"
        stroke="#166534"
        strokeWidth="1.5"
      />
      {/* copper pads */}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect
            x={90 + i * 60}
            y="75"
            width="20"
            height="10"
            rx="1"
            fill="#b45309"
            opacity="0.9"
          />
          <rect
            x={110 + i * 60}
            y="75"
            width="20"
            height="10"
            rx="1"
            fill="#b45309"
            opacity="0.9"
          />
        </g>
      ))}
      {/* MLCC components */}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect
            x={93 + i * 60}
            y={63 - (i === 2 ? 8 * pulse : 0)}
            width="34"
            height="18"
            rx="2"
            fill="#1e1e2e"
            stroke="#818cf8"
            strokeWidth="1.2"
          />
          <rect
            x={94 + i * 60}
            y={65 - (i === 2 ? 8 * pulse : 0)}
            width="4"
            height="14"
            rx="1"
            fill="#b45309"
          />
          <rect
            x={121 + i * 60}
            y={65 - (i === 2 ? 8 * pulse : 0)}
            width="4"
            height="14"
            rx="1"
            fill="#b45309"
          />
          <text
            x={110 + i * 60}
            y={75 - (i === 2 ? 8 * pulse : 0)}
            textAnchor="middle"
            fontSize="6"
            fill="#818cf8"
          >
            MLCC
          </text>
        </g>
      ))}
      {/* pick and place arm */}
      <rect
        x="218"
        y="20"
        width="8"
        height={40 - 8 * pulse}
        rx="2"
        fill="#475569"
      />
      <rect x="212" y="20" width="20" height="6" rx="2" fill="#64748b" />
      <text x="240" y="124" textAnchor="middle" fontSize="9" fill="#94a3b8">
        贴片机将MLCC贴装到PCB焊盘
      </text>
      <W
        title="为什么GPU服务器需要大量MLCC？"
        line1="一张H100 GPU板需要10,000+颗MLCC用于电源去耦滤波，"
        line2="稳定芯片工作电压，防止高频噪声导致运算错误。"
        color="#818cf8"
      />
    </>
  );
}

export function MlccAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="MLCC制造全流程"
      steps={MLCC_STEPS}
      renderStep={(s) => <MlccStep step={s} />}
    />
  );
}

// ─── Memory (存储芯片 HBM/DRAM/NAND) ─────────────────────────────────────────

const MEMORY_STEPS = [
  { id: 0, label: "硅片制备" },
  { id: 1, label: "DRAM晶圆制造" },
  { id: 2, label: "HBM堆叠封装" },
  { id: 3, label: "集成GPU旁" },
];

function MemoryStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    return (
      <>
        {/* CZ crystal pulling */}
        <ellipse
          cx="240"
          cy="88"
          rx="55"
          ry="22"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1"
        />
        <ellipse
          cx="240"
          cy="82"
          rx="55"
          ry="22"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1"
        />
        {/* melt */}
        <ellipse
          cx="240"
          cy="80"
          rx="50"
          ry="18"
          fill="#b45309"
          opacity={0.6 + 0.3 * pulse}
        />
        {/* crystal boule */}
        <rect
          x="225"
          y="25"
          width="30"
          height="58"
          rx="4"
          fill="#c8c8d4"
          stroke="#94a3b8"
          strokeWidth="1.2"
        />
        {/* seed crystal */}
        <rect
          x="232"
          y="20"
          width="16"
          height="8"
          rx="2"
          fill="#64748b"
          stroke="#475569"
          strokeWidth="1"
        />
        <text x="240" y="40" textAnchor="middle" fontSize="7" fill="#334155">
          硅棒
        </text>
        {/* wire/puller */}
        <line
          x1="240"
          y1="10"
          x2="240"
          y2="20"
          stroke="#94a3b8"
          strokeWidth="1.5"
        />
        <text x="310" y="60" fontSize="8" fill="#94a3b8">
          CZ直拉
        </text>
        <text x="310" y="72" fontSize="8" fill="#94a3b8">
          法拉晶
        </text>
        <text x="240" y="118" textAnchor="middle" fontSize="9" fill="#94a3b8">
          高纯多晶硅 → 1420°C熔融 → 直拉单晶硅棒
        </text>
        <W
          title="为什么要用单晶硅？"
          line1="单晶硅原子排列规整，载流子迁移率高，"
          line2="多晶硅含晶界缺陷，无法制造高性能存储器。"
          color="#94a3b8"
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {/* wafer */}
        <circle
          cx="240"
          cy="72"
          r="52"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1.5"
        />
        {/* die grid */}
        {[-3, -2, -1, 0, 1, 2, 3].map((row) =>
          [-3, -2, -1, 0, 1, 2, 3].map((col) => {
            const x = 240 + col * 14;
            const y = 72 + row * 14;
            const dist = Math.sqrt(col * col + row * row);
            if (dist > 3.2) return null;
            return (
              <rect
                key={`${row}-${col}`}
                x={x - 6}
                y={y - 6}
                width="12"
                height="12"
                rx="1"
                fill={dist < 1 ? "#312e81" : "#1e3a5f"}
                stroke={dist < 1 ? "#818cf8" : "#2563eb"}
                strokeWidth="0.5"
                opacity="0.9"
              />
            );
          }),
        )}
        {/* capacitor symbol */}
        <text
          x="240"
          y="76"
          textAnchor="middle"
          fontSize="7"
          fill="#818cf8"
          fontWeight="600"
        >
          DRAM
        </text>
        {/* scribe lines */}
        {[-1, 0, 1].map((i) => (
          <line
            key={`h${i}`}
            x1="188"
            y1={72 + i * 14}
            x2="292"
            y2={72 + i * 14}
            stroke="#f97316"
            strokeWidth="0.4"
            opacity={0.4 + 0.3 * pulse}
          />
        ))}
        <text x="240" y="135" textAnchor="middle" fontSize="9" fill="#94a3b8">
          10nm以下制程 → 电容+晶体管存储单元
        </text>
        <W
          title="为什么DRAM是AI的命脉？"
          line1="GPU跑大模型时需要超大带宽内存（HBM3e>1TB/s），"
          line2="DRAM存储所有激活值和权重，决定模型大小上限。"
          color="#60a5fa"
        />
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {/* HBM stack */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <g key={i}>
            <rect
              x={160}
              y={100 - i * 11}
              width={160}
              height={9}
              rx="2"
              fill={i === 0 ? "#1c1917" : "#1e3a5f"}
              stroke={i === 0 ? "#78716c" : "#2563eb"}
              strokeWidth="1"
            />
            <text
              x="240"
              y={107 - i * 11}
              textAnchor="middle"
              fontSize="6.5"
              fill={i === 0 ? "#a8a29e" : "#93c5fd"}
            >
              {i === 0 ? "Logic Base Die" : `DRAM Die ${i}`}
            </text>
          </g>
        ))}
        {/* TSV connections */}
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1={185 + i * 30}
            y1="12"
            x2={185 + i * 30}
            y2="100"
            stroke="#f59e0b"
            strokeWidth="1.2"
            opacity={0.6 + 0.3 * pulse}
            strokeDasharray="3 2"
          />
        ))}
        <text x="330" y="60" fontSize="7.5" fill="#f59e0b">
          TSV
        </text>
        <text x="330" y="72" fontSize="7.5" fill="#f59e0b">
          硅通孔
        </text>
        <W
          title="为什么HBM要3D堆叠？"
          line1="8层DRAM芯片通过TSV垂直互联，带宽是DDR5的10倍以上，"
          line2="放在GPU旁边极大降低数据搬运功耗和延迟。"
          color="#f59e0b"
        />
      </>
    );
  }

  // step 3: HBM next to GPU
  return (
    <>
      {/* GPU die */}
      <rect
        x="130"
        y="35"
        width="120"
        height="80"
        rx="6"
        fill="#1a1a2e"
        stroke="#6366f1"
        strokeWidth="2"
      />
      <text
        x="190"
        y="80"
        textAnchor="middle"
        fontSize="10"
        fill="#818cf8"
        fontWeight="600"
      >
        GPU
      </text>
      <text x="190" y="93" textAnchor="middle" fontSize="7.5" fill="#475569">
        H100 SXM5
      </text>
      {/* HBM stacks */}
      {[0, 1].map((i) => (
        <g key={i}>
          <rect
            x={270 + i * 50}
            y="40"
            width="38"
            height="70"
            rx="4"
            fill="#0f172a"
            stroke="#f59e0b"
            strokeWidth="1.5"
          />
          {[0, 1, 2, 3].map((j) => (
            <rect
              key={j}
              x={272 + i * 50}
              y={43 + j * 15}
              width="34"
              height="12"
              rx="1"
              fill="#1e3a5f"
              stroke="#2563eb"
              strokeWidth="0.6"
            />
          ))}
          <text
            x={289 + i * 50}
            y="122"
            textAnchor="middle"
            fontSize="7.5"
            fill="#f59e0b"
          >
            HBM3e
          </text>
          {/* interposer connection */}
          <line
            x1="250"
            y1={55 + i * 20}
            x2="270"
            y2={55 + i * 20}
            stroke="#22d3ee"
            strokeWidth="2"
            opacity={0.6 + 0.4 * pulse}
          />
        </g>
      ))}
      {/* substrate */}
      <rect
        x="120"
        y="120"
        width="250"
        height="10"
        rx="2"
        fill="#1e293b"
        stroke="#334155"
        strokeWidth="1"
      />
      <text x="245" y="128" textAnchor="middle" fontSize="7" fill="#475569">
        CoWoS硅中介层
      </text>
      <W
        title="为什么HBM必须贴着GPU放？"
        line1="HBM与GPU通过硅中介层（CoWoS）上的微凸点互联，"
        line2="信号只需走几毫米，带宽达3.35TB/s，功耗比GDDR低80%。"
        color="#f59e0b"
      />
    </>
  );
}

export function MemoryAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="存储芯片（HBM）制造全流程"
      steps={MEMORY_STEPS}
      renderStep={(s) => <MemoryStep step={s} />}
    />
  );
}

// ─── AIGPU (AI算力芯片 GPU/NPU) ───────────────────────────────────────────────

const AIGPU_STEPS = [
  { id: 0, label: "EDA芯片设计" },
  { id: 1, label: "台积电3nm制造" },
  { id: 2, label: "CoWoS封装" },
  { id: 3, label: "万卡集群" },
];

function AigpuStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    return (
      <>
        {/* floorplan */}
        <rect
          x="80"
          y="25"
          width="320"
          height="100"
          rx="4"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1"
        />
        {/* SM blocks */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect
            key={i}
            x={90 + (i % 4) * 60}
            y={30 + Math.floor(i / 4) * 40}
            width="52"
            height="32"
            rx="2"
            fill="#312e81"
            stroke="#818cf8"
            strokeWidth="0.8"
            opacity={i === Math.floor(t * 1.5) % 8 ? 1 : 0.7}
          />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <text
            key={i}
            x={116 + (i % 4) * 60}
            y={50 + Math.floor(i / 4) * 40}
            textAnchor="middle"
            fontSize="6.5"
            fill="#a5b4fc"
          >
            SM{i + 1}
          </text>
        ))}
        {/* HBM placeholder */}
        <rect
          x="82"
          y="108"
          width="316"
          height="12"
          rx="2"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="0.8"
        />
        <text x="240" y="117" textAnchor="middle" fontSize="7" fill="#93c5fd">
          HBM接口 (x8)
        </text>
        {/* NVLink */}
        <rect
          x="82"
          y="25"
          width="12"
          height="95"
          rx="2"
          fill="#064e3b"
          stroke="#34d399"
          strokeWidth="0.8"
        />
        <text
          x="88"
          y="75"
          textAnchor="middle"
          fontSize="6"
          fill="#6ee7b7"
          transform="rotate(-90,88,75)"
        >
          NVLink
        </text>
        <text
          x="240"
          y="132"
          textAnchor="middle"
          fontSize="9"
          fill="#818cf8"
          fontWeight="600"
        >
          H100 芯片版图（简化）
        </text>
        <W
          title="为什么GPU设计这么复杂？"
          line1="H100有800亿晶体管，EDA工具自动布局布线需要数月，"
          line2="设计费用超过5亿美元，决定了GPU的性能天花板。"
          color="#818cf8"
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {/* EUV exposure */}
        <rect
          x="80"
          y="30"
          width="140"
          height="85"
          rx="6"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1.2"
        />
        <text
          x="150"
          y="50"
          textAnchor="middle"
          fontSize="8.5"
          fill="#94a3b8"
          fontWeight="600"
        >
          EUV光刻机
        </text>
        <line
          x1="150"
          y1="55"
          x2="150"
          y2="100"
          stroke="#a78bfa"
          strokeWidth="3"
          opacity={0.5 + 0.4 * pulse}
          filter="url(#ia-glow3)"
        />
        <rect
          x="120"
          y="100"
          width="60"
          height="8"
          rx="1"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1"
        />
        <text x="150" y="107" textAnchor="middle" fontSize="7" fill="#64748b">
          硅片
        </text>
        <text x="150" y="125" textAnchor="middle" fontSize="7.5" fill="#a78bfa">
          13.5nm EUV
        </text>

        {/* FinFET cross section */}
        <rect
          x="255"
          y="30"
          width="160"
          height="85"
          rx="6"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1.2"
        />
        <text x="335" y="48" textAnchor="middle" fontSize="8" fill="#94a3b8">
          3nm FinFET截面
        </text>
        {/* fins */}
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={275 + i * 30}
            y="55"
            width="12"
            height="35"
            rx="2"
            fill="#312e81"
            stroke="#818cf8"
            strokeWidth="0.8"
          />
        ))}
        {/* gate */}
        <rect
          x="268"
          y="60"
          width="110"
          height="16"
          rx="2"
          fill="#b45309"
          stroke="#fbbf24"
          strokeWidth="0.8"
          opacity="0.9"
        />
        <text x="323" y="71" textAnchor="middle" fontSize="6.5" fill="#fef3c7">
          Gate
        </text>
        {/* S/D */}
        <rect
          x="270"
          y="76"
          width="100"
          height="10"
          rx="1"
          fill="#1e3a5f"
          stroke="#60a5fa"
          strokeWidth="0.8"
        />
        <text x="323" y="84" textAnchor="middle" fontSize="6" fill="#93c5fd">
          Source/Drain
        </text>
        <text x="323" y="125" textAnchor="middle" fontSize="7.5" fill="#fbbf24">
          台积电 N3 工艺
        </text>
        <W
          title="为什么要用台积电3nm？"
          line1="3nm制程比5nm晶体管密度提升70%，同性能功耗降低35%，"
          line2="全球只有台积电有量产3nm能力，英伟达依赖代工。"
          color="#fbbf24"
        />
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {/* CoWoS interposer */}
        <rect
          x="80"
          y="85"
          width="320"
          height="18"
          rx="3"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="1.5"
        />
        <text
          x="240"
          y="97"
          textAnchor="middle"
          fontSize="8"
          fill="#93c5fd"
          fontWeight="600"
        >
          硅中介层 (CoWoS Interposer)
        </text>
        {/* GPU die */}
        <rect
          x="120"
          y="35"
          width="140"
          height="52"
          rx="4"
          fill="#1a1a2e"
          stroke="#6366f1"
          strokeWidth="2"
        />
        <text
          x="190"
          y="65"
          textAnchor="middle"
          fontSize="10"
          fill="#818cf8"
          fontWeight="700"
        >
          GPU Die
        </text>
        <text x="190" y="78" textAnchor="middle" fontSize="7" fill="#475569">
          H100 3nm
        </text>
        {/* HBM stacks */}
        {[0, 1].map((i) => (
          <g key={i}>
            <rect
              x={278 + i * 44}
              y="38"
              width="38"
              height="48"
              rx="3"
              fill="#0f172a"
              stroke="#f59e0b"
              strokeWidth="1.5"
            />
            {[0, 1, 2].map((j) => (
              <rect
                key={j}
                x={280 + i * 44}
                y={41 + j * 14}
                width="34"
                height="11"
                rx="1"
                fill="#1e3a5f"
                stroke="#2563eb"
                strokeWidth="0.5"
              />
            ))}
            <text
              x={297 + i * 44}
              y="96"
              textAnchor="middle"
              fontSize="6.5"
              fill="#f59e0b"
            >
              HBM3e
            </text>
          </g>
        ))}
        {/* microbumps */}
        {[0, 1, 2, 3, 4].map((i) => (
          <circle
            key={i}
            cx={155 + i * 20}
            cy="87"
            r="2.5"
            fill="#22d3ee"
            opacity={0.6 + 0.4 * (i === Math.floor(pulse * 5) % 5 ? 1 : 0)}
          />
        ))}
        {/* substrate */}
        <rect
          x="80"
          y="103"
          width="320"
          height="14"
          rx="3"
          fill="#1e293b"
          stroke="#334155"
          strokeWidth="1"
        />
        <text x="240" y="113" textAnchor="middle" fontSize="7" fill="#475569">
          有机基板 (BGA)
        </text>
        <W
          title="为什么CoWoS这么贵？"
          line1="硅中介层要单独流片，再把GPU和HBM精准贴合，"
          line2="良率低+工序复杂，单颗H100封装成本超3万美元。"
          color="#22d3ee"
        />
      </>
    );
  }

  // step 3: cluster
  return (
    <>
      {/* 8 GPU nodes in 2 rows */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <g key={i}>
          <rect
            x={55 + (i % 4) * 95}
            y={25 + Math.floor(i / 4) * 55}
            width="80"
            height="40"
            rx="4"
            fill="#1a1a2e"
            stroke="#6366f1"
            strokeWidth={1.5}
          />
          <text
            x={95 + (i % 4) * 95}
            y={49 + Math.floor(i / 4) * 55}
            textAnchor="middle"
            fontSize="8"
            fill="#818cf8"
          >
            GPU {i + 1}
          </text>
        </g>
      ))}
      {/* NVLink connections */}
      {[0, 1, 2].map((i) => (
        <line
          key={i}
          x1={135 + i * 95}
          y1="45"
          x2={150 + i * 95}
          y2="45"
          stroke="#22d3ee"
          strokeWidth="1.5"
          opacity={0.5 + 0.4 * pulse}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <line
          key={i}
          x1={135 + i * 95}
          y1="100"
          x2={150 + i * 95}
          y2="100"
          stroke="#22d3ee"
          strokeWidth="1.5"
          opacity={0.5 + 0.4 * pulse}
        />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <line
          key={i}
          x1={95 + i * 95}
          y1="65"
          x2={95 + i * 95}
          y2="80"
          stroke="#818cf8"
          strokeWidth="1"
          opacity={0.4 + 0.4 * pulse}
        />
      ))}
      <text x="240" y="132" textAnchor="middle" fontSize="9" fill="#94a3b8">
        8×H100 NVL8节点 → 万卡集群
      </text>
      <W
        title="为什么集群规模决定AI上限？"
        line1="GPT-4训练用了约25000颗A100，万卡集群是大模型标配，"
        line2="互联带宽（NVLink+InfiniBand）是集群性能的关键瓶颈。"
        color="#6366f1"
      />
    </>
  );
}

export function AigpuAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="AI GPU芯片制造全流程"
      steps={AIGPU_STEPS}
      renderStep={(s) => <AigpuStep step={s} />}
    />
  );
}

// ─── Fiber (光纤光缆) ─────────────────────────────────────────────────────────

const FIBER_STEPS = [
  { id: 0, label: "高纯原料" },
  { id: 1, label: "PCVD预制棒" },
  { id: 2, label: "拉丝成纤" },
  { id: 3, label: "铺设骨干网" },
];

function FiberStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    return (
      <>
        {/* SiCl4 bottle */}
        <rect
          x="120"
          y="35"
          width="50"
          height="75"
          rx="8"
          fill="#1e293b"
          stroke="#60a5fa"
          strokeWidth="1.5"
        />
        <rect x="130" y="30" width="30" height="10" rx="3" fill="#334155" />
        <text x="145" y="80" textAnchor="middle" fontSize="8" fill="#93c5fd">
          SiCl₄
        </text>
        <text x="145" y="92" textAnchor="middle" fontSize="7" fill="#60a5fa">
          四氯化硅
        </text>
        <text x="145" y="120" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          纯度 99.9999%
        </text>
        {/* GeCl4 bottle */}
        <rect
          x="210"
          y="45"
          width="50"
          height="65"
          rx="8"
          fill="#1e293b"
          stroke="#34d399"
          strokeWidth="1.5"
        />
        <rect x="220" y="40" width="30" height="10" rx="3" fill="#334155" />
        <text x="235" y="83" textAnchor="middle" fontSize="8" fill="#6ee7b7">
          GeCl₄
        </text>
        <text x="235" y="95" textAnchor="middle" fontSize="7" fill="#34d399">
          四氯化锗
        </text>
        <text x="235" y="120" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          掺杂剂
        </text>
        {/* O2 */}
        <rect
          x="300"
          y="50"
          width="50"
          height="60"
          rx="8"
          fill="#1e293b"
          stroke="#f97316"
          strokeWidth="1.5"
        />
        <rect x="310" y="45" width="30" height="10" rx="3" fill="#334155" />
        <text x="325" y="83" textAnchor="middle" fontSize="9" fill="#fb923c">
          O₂
        </text>
        <text x="325" y="95" textAnchor="middle" fontSize="7" fill="#f97316">
          氧气
        </text>
        {/* arrows to reaction */}
        {[145, 235, 325].map((x, i) => (
          <line
            key={i}
            x1={x}
            y1="110"
            x2="240"
            y2="128"
            stroke={["#60a5fa", "#34d399", "#f97316"][i]}
            strokeWidth="1.2"
            opacity={0.6 + 0.3 * pulse}
            strokeDasharray="4 2"
          />
        ))}
        <ellipse
          cx="240"
          cy="132"
          rx="20"
          ry="5"
          fill="#fbbf24"
          opacity={0.4 + 0.4 * pulse}
          filter="url(#ia-glow3)"
        />
        <text x="240" y="133" textAnchor="middle" fontSize="7" fill="#fef3c7">
          高温氧化反应
        </text>
        <W
          title="为什么要这么高纯度？"
          line1="光纤传输靠全反射，杂质会散射光子造成信号衰减，"
          line2="OH离子含量需<1ppb，光才能传输数千公里。"
          color="#60a5fa"
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {/* preform tube */}
        <rect
          x="195"
          y="15"
          width="90"
          height="100"
          rx="6"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="1.5"
        />
        {/* core layers */}
        <rect
          x="213"
          y="20"
          width="54"
          height="90"
          rx="4"
          fill="#0f172a"
          stroke="#60a5fa"
          strokeWidth="0.8"
        />
        <rect
          x="223"
          y="25"
          width="34"
          height="80"
          rx="3"
          fill="#1e293b"
          stroke="#818cf8"
          strokeWidth="0.8"
        />
        {/* core */}
        <rect
          x="231"
          y="30"
          width="18"
          height="70"
          rx="2"
          fill="#312e81"
          stroke="#a5b4fc"
          strokeWidth="1"
          opacity={0.6 + 0.4 * pulse}
        />
        {/* PCVD flame */}
        <ellipse
          cx="240"
          cy="15"
          rx="30"
          ry="8"
          fill="#f97316"
          opacity={0.5 + 0.4 * pulse}
          filter="url(#ia-glow3)"
        />
        <text x="240" y="16" textAnchor="middle" fontSize="7" fill="#fef3c7">
          等离子炬
        </text>
        {/* labels */}
        <text x="155" y="60" textAnchor="end" fontSize="7.5" fill="#2563eb">
          包层SiO₂
        </text>
        <line
          x1="157"
          y1="58"
          x2="195"
          y2="58"
          stroke="#2563eb"
          strokeWidth="0.7"
          opacity="0.7"
        />
        <text x="155" y="80" textAnchor="end" fontSize="7.5" fill="#818cf8">
          掺Ge纤芯
        </text>
        <line
          x1="157"
          y1="78"
          x2="231"
          y2="78"
          stroke="#818cf8"
          strokeWidth="0.7"
          opacity="0.7"
        />
        <text x="240" y="128" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
          PCVD法：等离子增强化学气相沉积预制棒
        </text>
        <W
          title="为什么要先做预制棒？"
          line1="预制棒是拉丝的原料，通过精确控制纤芯/包层折射率差，"
          line2="决定光纤的单模/多模特性和传输带宽。"
          color="#818cf8"
        />
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {/* preform at top */}
        <rect
          x="210"
          y="10"
          width="60"
          height="30"
          rx="4"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="1.2"
        />
        <text x="240" y="29" textAnchor="middle" fontSize="8" fill="#93c5fd">
          预制棒
        </text>
        {/* furnace */}
        <rect
          x="205"
          y="40"
          width="70"
          height="30"
          rx="4"
          fill="#1c1917"
          stroke="#f97316"
          strokeWidth="1.5"
        />
        <text x="240" y="59" textAnchor="middle" fontSize="8" fill="#fb923c">
          2200°C熔炉
        </text>
        {/* fiber drawing */}
        <line
          x1="240"
          y1="70"
          x2="240"
          y2="130"
          stroke="#818cf8"
          strokeWidth={1.5 + pulse}
          opacity="0.9"
          filter="url(#ia-glow3)"
        />
        {/* coating cups */}
        <rect
          x="228"
          y="95"
          width="24"
          height="14"
          rx="2"
          fill="#064e3b"
          stroke="#34d399"
          strokeWidth="1"
        />
        <text x="240" y="105" textAnchor="middle" fontSize="6.5" fill="#6ee7b7">
          涂覆
        </text>
        {/* capstan */}
        <ellipse
          cx="240"
          cy="128"
          rx="12"
          ry="6"
          fill="#334155"
          stroke="#64748b"
          strokeWidth="1"
        />
        {/* diameter monitor */}
        <rect
          x="265"
          y="80"
          width="55"
          height="20"
          rx="3"
          fill="#0f172a"
          stroke="#22d3ee"
          strokeWidth="1"
        />
        <text x="292" y="93" textAnchor="middle" fontSize="7" fill="#22d3ee">
          Φ125μm
        </text>
        <line
          x1="252"
          y1="90"
          x2="265"
          y2="90"
          stroke="#22d3ee"
          strokeWidth="0.8"
          strokeDasharray="3 2"
        />
        <text x="240" y="142" textAnchor="middle" fontSize="8" fill="#818cf8">
          拉丝速度: 1200 m/min
        </text>
        <W
          title="为什么光纤这么细？"
          line1="125μm正好让单模光以全反射方式传播，"
          line2="弯曲时不易断裂，一根预制棒可拉出数千公里光纤。"
          color="#818cf8"
        />
      </>
    );
  }

  // step 3: backbone network
  return (
    <>
      {/* map outline simplified */}
      <rect
        x="60"
        y="20"
        width="360"
        height="110"
        rx="6"
        fill="#0f172a"
        stroke="#1e293b"
        strokeWidth="1"
      />
      {/* city nodes */}
      {[
        { x: 110, y: 50, name: "上海" },
        { x: 200, y: 40, name: "北京" },
        { x: 320, y: 55, name: "广州" },
        { x: 150, y: 90, name: "武汉" },
        { x: 260, y: 85, name: "成都" },
        { x: 370, y: 90, name: "深圳" },
      ].map((city, i) => (
        <g key={i}>
          <circle
            cx={city.x}
            cy={city.y}
            r="6"
            fill="#1e3a5f"
            stroke="#60a5fa"
            strokeWidth="1.2"
            opacity={0.7 + 0.3 * (i === Math.floor(t * 0.8) % 6 ? 1 : 0)}
          />
          <text
            x={city.x}
            y={city.y + 14}
            textAnchor="middle"
            fontSize="7"
            fill="#94a3b8"
          >
            {city.name}
          </text>
        </g>
      ))}
      {/* fiber routes */}
      {[
        [110, 50, 200, 40],
        [200, 40, 320, 55],
        [110, 50, 150, 90],
        [150, 90, 260, 85],
        [260, 85, 370, 90],
        [320, 55, 370, 90],
        [150, 90, 320, 55],
      ].map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#818cf8"
          strokeWidth="1.2"
          opacity={0.3 + 0.5 * pulse}
          strokeDasharray={`${4 + i * 2} 3`}
        />
      ))}
      {/* submarine cable */}
      <path
        d="M 110,50 Q 80,100 100,120"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="1.5"
        opacity={0.5 + 0.4 * pulse}
        strokeDasharray="5 3"
      />
      <text x="75" y="122" fontSize="7" fill="#22d3ee">
        海缆
      </text>
      <text x="240" y="145" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
        骨干网光缆：每缆含数百芯光纤
      </text>
      <W
        title="为什么光纤是AI基础设施？"
        line1="AI训练数据中心之间需要Tb/s级互联，光纤是唯一"
        line2="能以光速传输海量数据且成本合理的物理介质。"
        color="#60a5fa"
      />
    </>
  );
}

export function FiberAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="光纤光缆制造全流程"
      steps={FIBER_STEPS}
      renderStep={(s) => <FiberStep step={s} />}
    />
  );
}

// ─── LiquidCool (液冷散热) ────────────────────────────────────────────────────

const LIQUIDCOOL_STEPS = [
  { id: 0, label: "冷却液/管路" },
  { id: 1, label: "冷板制造" },
  { id: 2, label: "CDU集成" },
  { id: 3, label: "液冷机柜" },
];

function LiquidcoolStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    return (
      <>
        {/* coolant tank */}
        <rect
          x="80"
          y="35"
          width="80"
          height="75"
          rx="6"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="1.5"
        />
        <rect
          x="85"
          y="50"
          width="70"
          height="55"
          rx="3"
          fill="#1e40af"
          opacity={0.5 + 0.3 * pulse}
        />
        <text x="120" y="82" textAnchor="middle" fontSize="8" fill="#93c5fd">
          冷却液
        </text>
        <text x="120" y="94" textAnchor="middle" fontSize="7" fill="#60a5fa">
          乙二醇/去离子水
        </text>
        <text x="120" y="120" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          导热系数高/绝缘
        </text>
        {/* hose cross section */}
        <rect
          x="220"
          y="30"
          width="60"
          height="85"
          rx="6"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1.2"
        />
        <text x="250" y="50" textAnchor="middle" fontSize="8" fill="#94a3b8">
          软管截面
        </text>
        <circle
          cx="250"
          cy="82"
          r="28"
          fill="#0f172a"
          stroke="#2563eb"
          strokeWidth="2"
        />
        <circle
          cx="250"
          cy="82"
          r="20"
          fill="#1e40af"
          opacity={0.6 + 0.3 * pulse}
        />
        <circle cx="250" cy="82" r="12" fill="#0f172a" />
        <text x="250" y="86" textAnchor="middle" fontSize="7" fill="#60a5fa">
          内管
        </text>
        <text x="250" y="126" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          耐压16bar / 耐腐蚀
        </text>
        {/* quick connect */}
        <rect
          x="330"
          y="50"
          width="60"
          height="50"
          rx="4"
          fill="#1c1917"
          stroke="#f97316"
          strokeWidth="1.2"
        />
        <text x="360" y="72" textAnchor="middle" fontSize="7.5" fill="#fb923c">
          快插接头
        </text>
        <text x="360" y="85" textAnchor="middle" fontSize="7" fill="#78716c">
          盲插/防漏
        </text>
        <W
          title="为什么用液体而不是风冷？"
          line1="H100单卡热密度超过700W，风冷PUE>1.5，液冷可达1.1，"
          line2="液体比热容是空气的3500倍，带走热量效率远高于风扇。"
          color="#2563eb"
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {/* cold plate */}
        <rect
          x="120"
          y="50"
          width="240"
          height="60"
          rx="4"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="1.5"
        />
        {/* microchannels */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <rect
            key={i}
            x={125 + i * 23}
            y="55"
            width="18"
            height="50"
            rx="1"
            fill={i % 2 === 0 ? "#1e40af" : "#0f172a"}
            stroke="#2563eb"
            strokeWidth="0.5"
            opacity={0.7 + 0.2 * (i === Math.floor(t) % 10 ? 1 : 0)}
          />
        ))}
        {/* inlet/outlet */}
        <rect
          x="100"
          y="65"
          width="22"
          height="18"
          rx="3"
          fill="#0e7490"
          stroke="#22d3ee"
          strokeWidth="1.2"
        />
        <text x="111" y="77" textAnchor="middle" fontSize="6.5" fill="#a5f3fc">
          进液
        </text>
        <rect
          x="358"
          y="65"
          width="22"
          height="18"
          rx="3"
          fill="#064e3b"
          stroke="#34d399"
          strokeWidth="1.2"
        />
        <text x="369" y="77" textAnchor="middle" fontSize="6.5" fill="#6ee7b7">
          出液
        </text>
        {/* flow arrows */}
        {[0, 1, 2].map((i) => (
          <line
            key={i}
            x1={105 + i * 80}
            y1="74"
            x2={160 + i * 80}
            y2="74"
            stroke="#22d3ee"
            strokeWidth="1.2"
            opacity={
              0.5 +
              0.4 *
                (pulse + i * 0.3 > 1 ? pulse - 1 + i * 0.3 : pulse + i * 0.3)
            }
            strokeDasharray="6 3"
          />
        ))}
        <text x="240" y="125" textAnchor="middle" fontSize="9" fill="#93c5fd">
          铜/铝微通道冷板 贴合GPU
        </text>
        <W
          title="为什么冷板要紧贴芯片？"
          line1="冷板与芯片之间用导热硅脂填充，接触热阻必须<0.05℃/W，"
          line2="微通道增大换热面积，使冷却液带走更多热量。"
          color="#22d3ee"
        />
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {/* CDU box */}
        <rect
          x="100"
          y="25"
          width="280"
          height="95"
          rx="6"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1.5"
        />
        <text
          x="240"
          y="43"
          textAnchor="middle"
          fontSize="9"
          fill="#94a3b8"
          fontWeight="600"
        >
          CDU（冷却分配单元）
        </text>
        {/* heat exchanger */}
        <rect
          x="115"
          y="50"
          width="80"
          height="55"
          rx="4"
          fill="#1e293b"
          stroke="#f97316"
          strokeWidth="1.2"
        />
        <text x="155" y="81" textAnchor="middle" fontSize="8" fill="#fb923c">
          板式换热器
        </text>
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1="118"
            y1={57 + i * 12}
            x2="192"
            y2={57 + i * 12}
            stroke="#f97316"
            strokeWidth="1"
            opacity="0.6"
          />
        ))}
        {/* pump */}
        <circle
          cx="245"
          cy="77"
          r="22"
          fill="#1e293b"
          stroke="#818cf8"
          strokeWidth="1.2"
        />
        <text x="245" y="81" textAnchor="middle" fontSize="8" fill="#a5b4fc">
          循环泵
        </text>
        {/* temp sensor */}
        <rect
          x="310"
          y="50"
          width="55"
          height="55"
          rx="4"
          fill="#1e293b"
          stroke="#22d3ee"
          strokeWidth="1.2"
        />
        <text x="337" y="72" textAnchor="middle" fontSize="7.5" fill="#22d3ee">
          温控
        </text>
        <text x="337" y="85" textAnchor="middle" fontSize="7.5" fill="#22d3ee">
          监测
        </text>
        <text x="337" y={97} textAnchor="middle" fontSize="8" fill="#a5f3fc">
          {(35 + 8 * pulse).toFixed(1)}°C
        </text>
        {/* pipes */}
        <line
          x1="195"
          y1="77"
          x2="223"
          y2="77"
          stroke="#2563eb"
          strokeWidth="2"
          opacity={0.7 + 0.2 * pulse}
        />
        <line
          x1="267"
          y1="77"
          x2="310"
          y2="77"
          stroke="#2563eb"
          strokeWidth="2"
          opacity={0.7 + 0.2 * pulse}
        />
        <W
          title="为什么需要CDU？"
          line1="CDU把机房冷水和服务器内循环隔离，防止去离子水污染，"
          line2="同时监控温度/流量，自动调节泵速保证冷却安全。"
          color="#818cf8"
        />
      </>
    );
  }

  // step 3: liquid cooled rack
  return (
    <>
      {/* rack */}
      <rect
        x="140"
        y="15"
        width="200"
        height="115"
        rx="4"
        fill="#0f172a"
        stroke="#334155"
        strokeWidth="2"
      />
      {/* servers with cold plates */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i}>
          <rect
            x="145"
            y={20 + i * 14}
            width="190"
            height="12"
            rx="2"
            fill="#1e293b"
            stroke="#334155"
            strokeWidth="0.7"
          />
          <rect
            x="148"
            y={22 + i * 14}
            width="80"
            height="8"
            rx="1"
            fill="#1a1a2e"
            stroke="#6366f1"
            strokeWidth="0.7"
          />
          <rect
            x="235"
            y={22 + i * 14}
            width="60"
            height="8"
            rx="1"
            fill="#1e3a5f"
            stroke="#2563eb"
            strokeWidth="0.7"
            opacity={0.5 + 0.4 * ((pulse + i * 0.15) % 1)}
          />
          <text
            x="175"
            y={28 + i * 14}
            textAnchor="middle"
            fontSize="5.5"
            fill="#818cf8"
          >
            GPU Server
          </text>
          <text
            x="265"
            y={28 + i * 14}
            textAnchor="middle"
            fontSize="5"
            fill="#60a5fa"
          >
            冷板
          </text>
        </g>
      ))}
      {/* manifold pipe */}
      <rect
        x="333"
        y="15"
        width="12"
        height="115"
        rx="3"
        fill="#1e3a5f"
        stroke="#2563eb"
        strokeWidth="1.5"
      />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line
          key={i}
          x1="333"
          y1={26 + i * 14}
          x2="325"
          y2={26 + i * 14}
          stroke="#22d3ee"
          strokeWidth="1"
          opacity={0.6 + 0.3 * pulse}
        />
      ))}
      <text
        x="350"
        y="75"
        fontSize="7"
        fill="#22d3ee"
        transform="rotate(90,350,75)"
      >
        液冷总管
      </text>
      <text x="240" y="142" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
        全液冷机柜：42U / 200kW热密度
      </text>
      <W
        title="为什么液冷机柜是趋势？"
        line1="传统风冷机柜只能支持20-30kW，液冷可支持100-200kW，"
        line2="AI服务器功耗密度翻倍，液冷是唯一可行的散热方案。"
        color="#2563eb"
      />
    </>
  );
}

export function LiquidcoolAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="液冷散热系统全流程"
      steps={LIQUIDCOOL_STEPS}
      renderStep={(s) => <LiquidcoolStep step={s} />}
    />
  );
}

// ─── AIPower (AI供配电 PSU/BBU/HVDC) ─────────────────────────────────────────

const AIPOWER_STEPS = [
  { id: 0, label: "IGBT/SiC原料" },
  { id: 1, label: "PSU/BBU模块" },
  { id: 2, label: "HVDC系统集成" },
  { id: 3, label: "IDC部署" },
];

function AipowerStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    return (
      <>
        {/* SiC wafer */}
        <circle
          cx="170"
          cy="72"
          r="45"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1.5"
        />
        <circle
          cx="170"
          cy="72"
          r="40"
          fill="#312e81"
          stroke="#818cf8"
          strokeWidth="1"
          opacity="0.7"
        />
        <text
          x="170"
          y="70"
          textAnchor="middle"
          fontSize="9"
          fill="#a5b4fc"
          fontWeight="600"
        >
          4H-SiC
        </text>
        <text x="170" y="83" textAnchor="middle" fontSize="7.5" fill="#818cf8">
          碳化硅衬底
        </text>
        <text x="170" y="125" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          4英寸→6英寸→8英寸
        </text>
        {/* SiC MOSFET structure */}
        <rect
          x="265"
          y="35"
          width="130"
          height="80"
          rx="4"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1"
        />
        <text x="330" y="52" textAnchor="middle" fontSize="8" fill="#94a3b8">
          SiC MOSFET截面
        </text>
        <rect
          x="272"
          y="56"
          width="116"
          height="12"
          rx="1"
          fill="#064e3b"
          stroke="#34d399"
          strokeWidth="0.8"
        />
        <text x="330" y="65" textAnchor="middle" fontSize="6.5" fill="#6ee7b7">
          N+ Source
        </text>
        <rect
          x="272"
          y="68"
          width="116"
          height="18"
          rx="1"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="0.8"
        />
        <text x="330" y="80" textAnchor="middle" fontSize="6.5" fill="#93c5fd">
          P-body / Channel
        </text>
        <rect
          x="272"
          y="86"
          width="116"
          height="18"
          rx="1"
          fill="#312e81"
          stroke="#818cf8"
          strokeWidth="0.8"
        />
        <text x="330" y="98" textAnchor="middle" fontSize="6.5" fill="#a5b4fc">
          N-drift (SiC)
        </text>
        <text
          x="330"
          y="108"
          textAnchor="middle"
          fontSize="8"
          fill="#22d3ee"
          opacity={0.7 + 0.3 * pulse}
        >
          1700V / 50A
        </text>
        <W
          title="为什么用SiC替代硅IGBT？"
          line1="SiC耐压是硅的10倍，开关损耗降低50%，在高压直流电源中"
          line2="效率更高、体积更小，是AI数据中心降本关键器件。"
          color="#818cf8"
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {/* PSU module */}
        <rect
          x="60"
          y="30"
          width="160"
          height="80"
          rx="6"
          fill="#0f172a"
          stroke="#f59e0b"
          strokeWidth="1.5"
        />
        <text
          x="140"
          y="50"
          textAnchor="middle"
          fontSize="9"
          fill="#fbbf24"
          fontWeight="600"
        >
          PSU模块
        </text>
        <text x="140" y="63" textAnchor="middle" fontSize="8" fill="#f59e0b">
          3kW / 12V DC
        </text>
        {/* components inside */}
        <rect
          x="70"
          y="68"
          width="35"
          height="25"
          rx="2"
          fill="#312e81"
          stroke="#818cf8"
          strokeWidth="0.8"
        />
        <text x="87" y="83" textAnchor="middle" fontSize="6.5" fill="#a5b4fc">
          PFC
        </text>
        <rect
          x="115"
          y="68"
          width="35"
          height="25"
          rx="2"
          fill="#064e3b"
          stroke="#34d399"
          strokeWidth="0.8"
        />
        <text x="132" y="83" textAnchor="middle" fontSize="6.5" fill="#6ee7b7">
          LLC
        </text>
        <rect
          x="160"
          y="68"
          width="50"
          height="25"
          rx="2"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="0.8"
        />
        <text x="185" y="83" textAnchor="middle" fontSize="6.5" fill="#93c5fd">
          整流滤波
        </text>
        <text x="140" y="118" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          {"效率 >96%"}
        </text>

        {/* BBU */}
        <rect
          x="270"
          y="30"
          width="150"
          height="80"
          rx="6"
          fill="#0f172a"
          stroke="#34d399"
          strokeWidth="1.5"
        />
        <text
          x="345"
          y="50"
          textAnchor="middle"
          fontSize="9"
          fill="#34d399"
          fontWeight="600"
        >
          BBU模块
        </text>
        <text x="345" y="63" textAnchor="middle" fontSize="7.5" fill="#6ee7b7">
          磷酸铁锂电池组
        </text>
        {/* battery cells */}
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={282 + i * 33}
            y="70"
            width="28"
            height="30"
            rx="3"
            fill="#14532d"
            stroke="#34d399"
            strokeWidth="0.8"
          />
        ))}
        {/* charge level */}
        <rect
          x="283"
          y="71"
          width={28 * (0.6 + 0.4 * pulse)}
          height="28"
          rx="2"
          fill="#22c55e"
          opacity="0.5"
        />
        <text x="345" y="118" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          掉电时撑机10-30秒
        </text>
        <W
          title="为什么AI机房必须有BBU？"
          line1="训练大模型一旦断电，前几天甚至几周的训练数据会丢失，"
          line2="BBU在市电切换UPS前提供10-30秒缓冲保护。"
          color="#34d399"
        />
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {/* grid → transformer */}
        <rect
          x="50"
          y="55"
          width="50"
          height="40"
          rx="3"
          fill="#1e293b"
          stroke="#f97316"
          strokeWidth="1.2"
        />
        <text x="75" y="79" textAnchor="middle" fontSize="7.5" fill="#fb923c">
          电网
        </text>
        <text x="75" y="90" textAnchor="middle" fontSize="7" fill="#78716c">
          10kV AC
        </text>
        {/* arrow */}
        <line
          x1="100"
          y1="75"
          x2="120"
          y2="75"
          stroke="#f97316"
          strokeWidth="2"
          opacity={0.7 + 0.3 * pulse}
        />
        {/* transformer */}
        <rect
          x="120"
          y="50"
          width="60"
          height="50"
          rx="4"
          fill="#1e293b"
          stroke="#fbbf24"
          strokeWidth="1.2"
        />
        <text x="150" y="75" textAnchor="middle" fontSize="8" fill="#fbbf24">
          变压器
        </text>
        <text x="150" y="88" textAnchor="middle" fontSize="7" fill="#f59e0b">
          10kV→380V
        </text>
        {/* HVDC converter */}
        <line
          x1="180"
          y1="75"
          x2="200"
          y2="75"
          stroke="#fbbf24"
          strokeWidth="2"
          opacity={0.7 + 0.3 * pulse}
        />
        <rect
          x="200"
          y="45"
          width="80"
          height="60"
          rx="4"
          fill="#0f172a"
          stroke="#6366f1"
          strokeWidth="1.5"
        />
        <text
          x="240"
          y="70"
          textAnchor="middle"
          fontSize="8"
          fill="#818cf8"
          fontWeight="600"
        >
          HVDC
        </text>
        <text x="240" y="83" textAnchor="middle" fontSize="7.5" fill="#6366f1">
          整流器
        </text>
        <text
          x="240"
          y="96"
          textAnchor="middle"
          fontSize="8"
          fill="#a5b4fc"
          opacity={0.7 + 0.3 * pulse}
        >
          240V DC
        </text>
        {/* to rack */}
        <line
          x1="280"
          y1="75"
          x2="300"
          y2="75"
          stroke="#818cf8"
          strokeWidth="2"
          opacity={0.7 + 0.3 * pulse}
        />
        <rect
          x="300"
          y="40"
          width="130"
          height="70"
          rx="4"
          fill="#1e293b"
          stroke="#334155"
          strokeWidth="1"
        />
        <text x="365" y="68" textAnchor="middle" fontSize="8" fill="#94a3b8">
          机柜
        </text>
        <text x="365" y="82" textAnchor="middle" fontSize="7.5" fill="#64748b">
          直流PDU分配
        </text>
        <text x="365" y="95" textAnchor="middle" fontSize="7.5" fill="#64748b">
          直供服务器
        </text>
        <W
          title="为什么HVDC比传统UPS省电？"
          line1="传统AC-UPS需多次AC/DC转换，损耗>10%；HVDC一次整流"
          line2="240V直流直接供服务器，效率提升5-8%，每年省电百万度。"
          color="#6366f1"
        />
      </>
    );
  }

  // step 3: IDC power deployment
  return (
    <>
      {/* IDC building */}
      <rect
        x="80"
        y="20"
        width="320"
        height="110"
        rx="6"
        fill="#0f172a"
        stroke="#334155"
        strokeWidth="1.5"
      />
      <text
        x="240"
        y="38"
        textAnchor="middle"
        fontSize="9"
        fill="#94a3b8"
        fontWeight="600"
      >
        AI数据中心 配电架构
      </text>
      {/* power flow */}
      {[
        {
          x: 100,
          y: 55,
          w: 60,
          h: 30,
          color: "#f97316",
          label: "市电引入\n110kV",
        },
        { x: 190, y: 55, w: 60, h: 30, color: "#fbbf24", label: "变压\n10kV" },
        { x: 280, y: 55, w: 60, h: 30, color: "#818cf8", label: "HVDC\n240V" },
        { x: 370, y: 55, w: 50, h: 30, color: "#34d399", label: "机架\nPDU" },
      ].map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx="3"
            fill="#1e293b"
            stroke={b.color}
            strokeWidth="1.2"
          />
          {b.label.split("\n").map((line, j) => (
            <text
              key={j}
              x={b.x + b.w / 2}
              y={b.y + 13 + j * 12}
              textAnchor="middle"
              fontSize="7.5"
              fill={b.color}
            >
              {line}
            </text>
          ))}
          {i < 3 && (
            <line
              x1={b.x + b.w}
              y1={b.y + 15}
              x2={b.x + b.w + 10}
              y2={b.y + 15}
              stroke={b.color}
              strokeWidth="1.5"
              opacity={0.7 + 0.3 * pulse}
            />
          )}
        </g>
      ))}
      {/* BBU/UPS row */}
      <rect
        x="100"
        y="100"
        width="320"
        height="20"
        rx="3"
        fill="#1e293b"
        stroke="#22c55e"
        strokeWidth="1"
      />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          x={105 + i * 52}
          y="103"
          width="46"
          height="14"
          rx="2"
          fill="#14532d"
          stroke="#34d399"
          strokeWidth="0.7"
          opacity={0.7 + 0.3 * (i === Math.floor(t) % 6 ? 1 : 0)}
        />
      ))}
      <text x="240" y="111" textAnchor="middle" fontSize="6.5" fill="#22c55e">
        BBU后备电池排
      </text>
      <W
        title="AI数据中心为什么供配电这么复杂？"
        line1="万卡集群耗电超100MW，等于一个小城市，"
        line2="供配电效率差1%每年多花数百万电费，可靠性是命。"
        color="#f97316"
      />
    </>
  );
}

export function AipowerAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="AI供配电系统全流程"
      steps={AIPOWER_STEPS}
      renderStep={(s) => <AipowerStep step={s} />}
    />
  );
}

// ─── CopperCable (高速铜连接 DAC/AEC) ────────────────────────────────────────

const COPPERCABLE_STEPS = [
  { id: 0, label: "高纯铜杆" },
  { id: 1, label: "高速铜缆/连接器" },
  { id: 2, label: "DAC/AEC组件" },
  { id: 3, label: "NVL72机柜" },
];

function CoppercableStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    return (
      <>
        {/* electrolytic copper */}
        <rect
          x="100"
          y="35"
          width="100"
          height="75"
          rx="6"
          fill="#b45309"
          stroke="#fbbf24"
          strokeWidth="1.5"
          opacity="0.8"
        />
        <text
          x="150"
          y="77"
          textAnchor="middle"
          fontSize="9"
          fill="#fef3c7"
          fontWeight="600"
        >
          电解铜
        </text>
        <text x="150" y="90" textAnchor="middle" fontSize="7.5" fill="#fbbf24">
          纯度 99.99%
        </text>
        <text x="150" y="118" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          阴极铜板
        </text>
        {/* wire drawing */}
        <rect
          x="240"
          y="45"
          width="160"
          height="60"
          rx="5"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1.2"
        />
        <text x="320" y="63" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
          连续拉拔
        </text>
        {/* wire getting thinner */}
        <line
          x1="255"
          y1="85"
          x2="390"
          y2="85"
          stroke="#fbbf24"
          strokeWidth={4 - 3 * pulse}
          opacity="0.9"
        />
        {/* dies */}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect
              x={285 + i * 35}
              y="75"
              width="8"
              height="20"
              rx="1"
              fill="#475569"
            />
            <text
              x={289 + i * 35}
              y="106"
              textAnchor="middle"
              fontSize="6.5"
              fill="#64748b"
            >
              Φ{(3 - i * 0.8).toFixed(1)}mm
            </text>
          </g>
        ))}
        <text x="320" y="118" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          → 高速信号传输铜导体
        </text>
        <W
          title="为什么铜纯度这么重要？"
          line1="高速信号在100GHz以上趋肤效应明显，导体纯度决定"
          line2="信号损耗（插入损耗），杂质会显著增大传输损耗。"
          color="#fbbf24"
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {/* cable cross section */}
        <rect
          x="80"
          y="30"
          width="140"
          height="90"
          rx="5"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1.2"
        />
        <text x="150" y="50" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
          铜缆截面
        </text>
        {/* twisted pairs */}
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <circle
              cx={110 + (i % 2) * 50}
              cy={65 + Math.floor(i / 2) * 30}
              r="14"
              fill="#0f172a"
              stroke="#475569"
              strokeWidth="0.8"
            />
            <circle
              cx={110 + (i % 2) * 50 - 5}
              cy={65 + Math.floor(i / 2) * 30}
              r="5"
              fill="#fbbf24"
              stroke="#b45309"
              strokeWidth="0.8"
            />
            <circle
              cx={110 + (i % 2) * 50 + 5}
              cy={65 + Math.floor(i / 2) * 30}
              r="5"
              fill="#fbbf24"
              stroke="#b45309"
              strokeWidth="0.8"
            />
          </g>
        ))}
        <text x="150" y="118" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          差分对 100Ω阻抗
        </text>
        {/* QSFP-DD connector */}
        <rect
          x="270"
          y="25"
          width="150"
          height="95"
          rx="5"
          fill="#1e293b"
          stroke="#64748b"
          strokeWidth="1.2"
        />
        <text x="345" y="45" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
          QSFP-DD连接器
        </text>
        <rect
          x="280"
          y="52"
          width="130"
          height="55"
          rx="3"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1"
        />
        {/* pins */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect
            key={i}
            x={285 + i * 15}
            y="108"
            width="10"
            height="8"
            rx="1"
            fill="#fbbf24"
            opacity={0.7 + 0.3 * (i === Math.floor(t * 2) % 8 ? 1 : 0)}
          />
        ))}
        <text x="345" y="90" textAnchor="middle" fontSize="8" fill="#818cf8">
          8通道 × 100Gbps
        </text>
        <text x="345" y="103" textAnchor="middle" fontSize="7.5" fill="#6366f1">
          = 800Gbps
        </text>
        <W
          title="为什么铜缆还有市场？"
          line1="3米以内的短距离互联，DAC铜缆比光模块便宜5-10倍，"
          line2="机架内ToR交换机到服务器首选DAC，大幅降低互联成本。"
          color="#fbbf24"
        />
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {/* DAC module */}
        <rect
          x="60"
          y="35"
          width="160"
          height="80"
          rx="5"
          fill="#0f172a"
          stroke="#fbbf24"
          strokeWidth="1.5"
        />
        <text
          x="140"
          y="57"
          textAnchor="middle"
          fontSize="9"
          fill="#fbbf24"
          fontWeight="600"
        >
          DAC
        </text>
        <text x="140" y="69" textAnchor="middle" fontSize="7.5" fill="#f59e0b">
          直连铜缆
        </text>
        <text x="140" y="82" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          无均衡/无DSP
        </text>
        <text x="140" y="95" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          ≤3m / 极低延迟
        </text>
        <text x="140" y="122" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          $5-15/根
        </text>
        {/* AEC module */}
        <rect
          x="270"
          y="35"
          width="160"
          height="80"
          rx="5"
          fill="#0f172a"
          stroke="#22d3ee"
          strokeWidth="1.5"
        />
        <text
          x="350"
          y="57"
          textAnchor="middle"
          fontSize="9"
          fill="#22d3ee"
          fontWeight="600"
        >
          AEC
        </text>
        <text x="350" y="69" textAnchor="middle" fontSize="7.5" fill="#a5f3fc">
          有源均衡铜缆
        </text>
        <rect
          x="310"
          y="74"
          width="80"
          height="20"
          rx="3"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="0.8"
        />
        <text x="350" y="87" textAnchor="middle" fontSize="7.5" fill="#93c5fd">
          CTLE/DFE均衡芯片
        </text>
        <text x="350" y="104" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          ≤7m / 补偿衰减
        </text>
        <text x="350" y="122" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          $30-80/根
        </text>
        {/* vs label */}
        <text
          x="237"
          y="78"
          textAnchor="middle"
          fontSize="12"
          fill="#475569"
          fontWeight="700"
        >
          VS
        </text>
        <W
          title="DAC和AEC分别用在哪里？"
          line1="DAC（3米内）连接服务器到ToR交换机，AEC（7米内）跨机架，"
          line2="两者在NVL72机柜内各司其职，成本远低于光模块。"
          color="#22d3ee"
        />
      </>
    );
  }

  // step 3: NVL72 cabinet
  return (
    <>
      {/* cabinet outline */}
      <rect
        x="80"
        y="15"
        width="320"
        height="115"
        rx="6"
        fill="#0f172a"
        stroke="#334155"
        strokeWidth="1.5"
      />
      <text
        x="240"
        y="32"
        textAnchor="middle"
        fontSize="9"
        fill="#94a3b8"
        fontWeight="600"
      >
        NVL72 机柜互联示意
      </text>
      {/* GPU trays */}
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3, 4, 5].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={90 + col * 37}
            y={38 + row * 22}
            width="32"
            height="18"
            rx="2"
            fill="#1a1a2e"
            stroke="#6366f1"
            strokeWidth="0.8"
            opacity="0.9"
          />
        )),
      )}
      {/* copper cable connections */}
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={106 + i * 37}
          y1="38"
          x2={88 + i * 37 + 37}
          y2="38"
          stroke="#fbbf24"
          strokeWidth="1.2"
          opacity={0.4 + 0.5 * ((pulse + i * 0.2) % 1)}
        />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={106 + i * 37}
          y1="60"
          x2={88 + i * 37 + 37}
          y2="60"
          stroke="#22d3ee"
          strokeWidth="1.2"
          opacity={0.4 + 0.5 * ((pulse + i * 0.2 + 0.5) % 1)}
        />
      ))}
      {/* NVSwitch */}
      <rect
        x="88"
        y="102"
        width="305"
        height="20"
        rx="3"
        fill="#1e3a5f"
        stroke="#818cf8"
        strokeWidth="1.2"
      />
      <text x="240" y="115" textAnchor="middle" fontSize="8" fill="#818cf8">
        NVSwitch 4.0 × 9台
      </text>
      <text x="240" y="140" textAnchor="middle" fontSize="8" fill="#fbbf24">
        黄=DAC(机架内) 青=AEC(跨机架)
      </text>
      <W
        title="为什么NVL72用铜缆而非全光互联？"
        line1="机柜内短距离（<3m）用DAC，性能与光模块相同但成本降90%，"
        line2="整柜节省数十万互联成本，铜缆厂商因此直接受益。"
        color="#fbbf24"
      />
    </>
  );
}

export function CoppercableAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="高速铜连接（DAC/AEC）制造全流程"
      steps={COPPERCABLE_STEPS}
      renderStep={(s) => <CoppercableStep step={s} />}
    />
  );
}

// ─── IDC (智算中心/IDC运营) ───────────────────────────────────────────────────

const IDC_STEPS = [
  { id: 0, label: "选址/建设" },
  { id: 1, label: "机房配套设备" },
  { id: 2, label: "万卡集群运营" },
  { id: 3, label: "算力服务" },
];

function IdcStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    return (
      <>
        {/* site map */}
        <rect
          x="80"
          y="25"
          width="320"
          height="100"
          rx="6"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1"
        />
        {/* land parcel */}
        <rect
          x="100"
          y="40"
          width="280"
          height="70"
          rx="3"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1"
          opacity="0.7"
        />
        {/* power line icon */}
        <line
          x1="110"
          y1="40"
          x2="110"
          y2="30"
          stroke="#f97316"
          strokeWidth="1.5"
        />
        <text x="110" y="28" textAnchor="middle" fontSize="7" fill="#fb923c">
          电网
        </text>
        {/* water/fiber */}
        <line
          x1="380"
          y1="40"
          x2="380"
          y2="30"
          stroke="#22d3ee"
          strokeWidth="1.5"
        />
        <text x="380" y="28" textAnchor="middle" fontSize="7" fill="#22d3ee">
          光纤
        </text>
        {/* factors */}
        {[
          {
            x: 135,
            y: 68,
            icon: "⚡",
            text: "稳定电力\n110kV专线",
            color: "#f59e0b",
          },
          {
            x: 220,
            y: 68,
            icon: "💧",
            text: "水源/冷却\n河流/地下水",
            color: "#22d3ee",
          },
          {
            x: 305,
            y: 68,
            icon: "🌐",
            text: "低延迟\n骨干网接入",
            color: "#818cf8",
          },
        ].map((f, i) => (
          <g key={i}>
            <text x={f.x} y={f.y} textAnchor="middle" fontSize="14">
              {f.icon}
            </text>
            {f.text.split("\n").map((line, j) => (
              <text
                key={j}
                x={f.x}
                y={f.y + 14 + j * 11}
                textAnchor="middle"
                fontSize="7"
                fill={f.color}
              >
                {line}
              </text>
            ))}
          </g>
        ))}
        <text x="240" y="130" textAnchor="middle" fontSize="9" fill="#94a3b8">
          选址决定PUE/成本/延迟的70%
        </text>
        <W
          title="为什么IDC选址这么重要？"
          line1="电力成本占IDC运营成本40%以上，靠近水电/核电可降本，"
          line2="靠近骨干网节点保证低延迟，两者往往不在同一地点。"
          color="#f59e0b"
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {/* building cross section */}
        <rect
          x="60"
          y="20"
          width="360"
          height="110"
          rx="5"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1.5"
        />
        {/* server room */}
        <rect
          x="80"
          y="35"
          width="200"
          height="80"
          rx="4"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1"
        />
        <text x="180" y="52" textAnchor="middle" fontSize="8" fill="#94a3b8">
          机房（防静电/密封）
        </text>
        {/* racks */}
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={90 + i * 42}
            y="58"
            width="32"
            height="50"
            rx="2"
            fill="#1a1a2e"
            stroke="#6366f1"
            strokeWidth="0.8"
          />
        ))}
        {/* cooling unit */}
        <rect
          x="295"
          y="35"
          width="110"
          height="40"
          rx="4"
          fill="#1e3a5f"
          stroke="#22d3ee"
          strokeWidth="1.2"
        />
        <text x="350" y="55" textAnchor="middle" fontSize="8" fill="#22d3ee">
          精密空调/液冷
        </text>
        <text x="350" y="67" textAnchor="middle" fontSize="7" fill="#60a5fa">
          PUE目标 ≤1.3
        </text>
        {/* UPS */}
        <rect
          x="295"
          y="85"
          width="110"
          height="40"
          rx="4"
          fill="#1e293b"
          stroke="#34d399"
          strokeWidth="1.2"
        />
        <text x="350" y="103" textAnchor="middle" fontSize="8" fill="#34d399">
          UPS/HVDC
        </text>
        <text x="350" y="115" textAnchor="middle" fontSize="7" fill="#6ee7b7">
          N+1冗余
        </text>
        {/* power flow */}
        <line
          x1="280"
          y1="55"
          x2="295"
          y2="55"
          stroke="#f97316"
          strokeWidth="1.5"
          opacity={0.6 + 0.3 * pulse}
        />
        <line
          x1="280"
          y1="105"
          x2="295"
          y2="105"
          stroke="#34d399"
          strokeWidth="1.5"
          opacity={0.6 + 0.3 * pulse}
        />
        <W
          title="为什么IDC建设这么贵？"
          line1="机房基础设施（UPS/精密空调/消防/监控）占建设成本50%，"
          line2="一个100MW的AI数据中心建设投入超过50亿元。"
          color="#22d3ee"
        />
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {/* cluster topology */}
        <rect
          x="60"
          y="18"
          width="360"
          height="112"
          rx="6"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1.5"
        />
        <text
          x="240"
          y="35"
          textAnchor="middle"
          fontSize="9"
          fill="#94a3b8"
          fontWeight="600"
        >
          万卡集群网络拓扑
        </text>
        {/* compute nodes */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect
            key={i}
            x={75 + (i % 4) * 80}
            y={45 + Math.floor(i / 4) * 35}
            width="65"
            height="25"
            rx="3"
            fill="#1a1a2e"
            stroke="#6366f1"
            strokeWidth="1"
          />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <text
            key={i}
            x={107 + (i % 4) * 80}
            y={61 + Math.floor(i / 4) * 35}
            textAnchor="middle"
            fontSize="7"
            fill="#818cf8"
          >
            GPU节点
          </text>
        ))}
        {/* spine switches */}
        <rect
          x="110"
          y="108"
          width="240"
          height="14"
          rx="3"
          fill="#1e3a5f"
          stroke="#22d3ee"
          strokeWidth="1.2"
        />
        <text x="240" y="118" textAnchor="middle" fontSize="7.5" fill="#22d3ee">
          Spine InfiniBand交换机
        </text>
        {/* connections */}
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1={107 + i * 80}
            y1="70"
            x2={155 + i * 50}
            y2="108"
            stroke="#818cf8"
            strokeWidth="0.8"
            opacity={0.3 + 0.5 * pulse}
          />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1={107 + i * 80}
            y1="105"
            x2={155 + i * 50}
            y2="108"
            stroke="#818cf8"
            strokeWidth="0.8"
            opacity={0.3 + 0.5 * pulse}
          />
        ))}
        <W
          title="为什么万卡集群需要InfiniBand？"
          line1="GPU之间AllReduce通信量随节点增加线性增长，"
          line2="400G InfiniBand保证梯度同步延迟<10μs，训练不卡顿。"
          color="#6366f1"
        />
      </>
    );
  }

  // step 3: cloud service
  return (
    <>
      {/* service layers */}
      {[
        {
          y: 25,
          color: "#6366f1",
          text: "算力租赁层",
          sub: "按GPU小时计费 / GPU云服务",
        },
        {
          y: 55,
          color: "#22d3ee",
          text: "平台层",
          sub: "Kubernetes / 调度器 / 监控",
        },
        {
          y: 85,
          color: "#34d399",
          text: "基础设施层",
          sub: "物理GPU集群 + 网络 + 存储",
        },
        { y: 115, color: "#f59e0b", text: "能源层", sub: "电力 + 冷却 + 运维" },
      ].map((layer, i) => (
        <g key={i}>
          <rect
            x="80"
            y={layer.y}
            width="320"
            height="26"
            rx="4"
            fill="#1e293b"
            stroke={layer.color}
            strokeWidth="1.2"
            opacity={0.7 + 0.3 * (i === Math.floor(t * 0.6) % 4 ? 1 : 0)}
          />
          <text
            x="240"
            y={layer.y + 11}
            textAnchor="middle"
            fontSize="8.5"
            fill={layer.color}
            fontWeight="600"
          >
            {layer.text}
          </text>
          <text
            x="240"
            y={layer.y + 22}
            textAnchor="middle"
            fontSize="7"
            fill="#64748b"
          >
            {layer.sub}
          </text>
        </g>
      ))}
      <W
        title="为什么IDC是AI产业链利润高地？"
        line1="按GPU小时收费，A100单卡月租超$1万，"
        line2="运营商承担硬件风险，稳定现金流，成为AI最大受益者之一。"
        color="#6366f1"
      />
    </>
  );
}

export function IdcAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="智算中心/IDC建设运营全流程"
      steps={IDC_STEPS}
      renderStep={(s) => <IdcStep step={s} />}
    />
  );
}

// ─── GlassSub (玻璃基板) ──────────────────────────────────────────────────────

const GLASSSUB_STEPS = [
  { id: 0, label: "高纯石英砂" },
  { id: 1, label: "玻璃熔化成型" },
  { id: 2, label: "研磨抛光" },
  { id: 3, label: "先进封装" },
];

function GlasssubStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    return (
      <>
        {/* quartz sand pile */}
        <ellipse
          cx="170"
          cy="92"
          rx="70"
          ry="25"
          fill="#b45309"
          opacity="0.4"
        />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <circle
            key={i}
            cx={125 + i * 10 + (i % 2) * 5}
            cy={85 + (i % 3) * 7}
            r={3 + Math.random() * 3}
            fill="#d4a257"
            opacity={0.7 + 0.2 * pulse}
            style={{ transform: `translate(${Math.sin(t + i) * 0.5}px, 0)` }}
          />
        ))}
        <text x="170" y="125" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
          {"高纯石英砂 SiO₂>99.99%"}
        </text>
        {/* purification process */}
        <rect
          x="270"
          y="45"
          width="140"
          height="70"
          rx="5"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1.2"
        />
        <text x="340" y="63" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
          化学提纯流程
        </text>
        {[
          { y: 72, text: "盐酸酸洗", color: "#22d3ee" },
          { y: 85, text: "氯化焙烧", color: "#f97316" },
          { y: 98, text: "高温真空脱羟", color: "#a78bfa" },
        ].map((s, i) => (
          <g key={i}>
            <circle
              cx="285"
              cy={s.y}
              r="3"
              fill={s.color}
              opacity={0.8 + 0.2 * pulse}
            />
            <text x="293" y={s.y + 4} fontSize="7.5" fill={s.color}>
              {s.text}
            </text>
          </g>
        ))}
        <text x="340" y="123" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          OH⁻含量 &lt;1ppm
        </text>
        <W
          title="为什么玻璃基板需要超高纯度石英？"
          line1="玻璃基板要集成超细线路，杂质会影响蚀刻精度和绝缘性，"
          line2="OH⁻会在高温封装时产生气泡，造成封装失效。"
          color="#d4a257"
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {/* furnace */}
        <rect
          x="80"
          y="30"
          width="120"
          height="80"
          rx="6"
          fill="#1c1917"
          stroke="#f97316"
          strokeWidth="1.5"
        />
        <text x="140" y="52" textAnchor="middle" fontSize="8" fill="#fb923c">
          熔炼炉
        </text>
        <text x="140" y="65" textAnchor="middle" fontSize="8" fill="#f59e0b">
          1600°C
        </text>
        {/* molten glass */}
        <ellipse
          cx="140"
          cy="85"
          rx="40"
          ry="15"
          fill="#f97316"
          opacity={0.5 + 0.4 * pulse}
          filter="url(#ia-glow3)"
        />
        <text x="140" y="110" textAnchor="middle" fontSize="7.5" fill="#fb923c">
          熔融玻璃
        </text>
        {/* float process */}
        <rect
          x="230"
          y="50"
          width="180"
          height="70"
          rx="5"
          fill="#1e293b"
          stroke="#475569"
          strokeWidth="1.2"
        />
        <text x="320" y="68" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
          浮法成型
        </text>
        {/* tin bath */}
        <rect
          x="240"
          y="75"
          width="160"
          height="30"
          rx="2"
          fill="#b45309"
          opacity="0.5"
        />
        <text x="320" y="93" textAnchor="middle" fontSize="7.5" fill="#fbbf24">
          锡液浴槽
        </text>
        {/* glass sheet floating */}
        <rect
          x="245"
          y="68"
          width="150"
          height="8"
          rx="1"
          fill="#e0e7ff"
          stroke="#818cf8"
          strokeWidth="1"
          opacity={0.7 + 0.2 * pulse}
        />
        {/* flow arrow */}
        <line
          x1="200"
          y1="82"
          x2="230"
          y2="82"
          stroke="#f97316"
          strokeWidth="2"
          opacity={0.7 + 0.3 * pulse}
        />
        <text x="320" y="118" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          玻璃在锡液上浮平 → 厚度均匀
        </text>
        <W
          title="为什么用浮法工艺？"
          line1="锡液密度均匀，玻璃在上面自然流平，"
          line2="可获得厚度偏差<0.1μm的超平玻璃，是封装基板的前提。"
          color="#f97316"
        />
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {/* grinding stages */}
        {[
          { x: 70, label: "粗磨", color: "#f97316", ra: "Ra<1μm" },
          { x: 185, label: "精磨", color: "#fbbf24", ra: "Ra<0.1μm" },
          { x: 300, label: "CMP抛光", color: "#818cf8", ra: "Ra<0.5nm" },
        ].map((stage, i) => (
          <g key={i}>
            <rect
              x={stage.x}
              y="35"
              width="100"
              height="75"
              rx="5"
              fill="#1e293b"
              stroke={stage.color}
              strokeWidth="1.2"
            />
            <text
              x={stage.x + 50}
              y="55"
              textAnchor="middle"
              fontSize="9"
              fill={stage.color}
              fontWeight="600"
            >
              {stage.label}
            </text>
            {/* grinding wheel */}
            <circle
              cx={stage.x + 50}
              cy="82"
              r="18"
              fill="#0f172a"
              stroke={stage.color}
              strokeWidth="1.2"
              opacity={0.7 + 0.2 * pulse}
              style={{
                transform: `rotate(${t * 60}deg)`,
                transformOrigin: `${stage.x + 50}px 82px`,
              }}
            />
            <line
              x1={stage.x + 50}
              y1="64"
              x2={stage.x + 50}
              y2="100"
              stroke={stage.color}
              strokeWidth="0.8"
              opacity="0.5"
              style={{
                transform: `rotate(${t * 60}deg)`,
                transformOrigin: `${stage.x + 50}px 82px`,
              }}
            />
            <text
              x={stage.x + 50}
              y="120"
              textAnchor="middle"
              fontSize="7.5"
              fill={stage.color}
            >
              {stage.ra}
            </text>
          </g>
        ))}
        {/* arrows */}
        <line
          x1="170"
          y1="72"
          x2="185"
          y2="72"
          stroke="#475569"
          strokeWidth="1.5"
        />
        <line
          x1="285"
          y1="72"
          x2="300"
          y2="72"
          stroke="#475569"
          strokeWidth="1.5"
        />
        <W
          title="为什么需要CMP抛光到0.5nm？"
          line1="封装时要在玻璃上沉积金属布线，表面粗糙度决定线宽精度，"
          line2="0.5nm Ra才能支持2μm以下线宽的先进封装互联。"
          color="#818cf8"
        />
      </>
    );
  }

  // step 3: advanced packaging
  return (
    <>
      {/* glass substrate */}
      <rect
        x="80"
        y="75"
        width="320"
        height="22"
        rx="3"
        fill="#e0e7ff"
        stroke="#818cf8"
        strokeWidth="1.5"
        opacity="0.8"
      />
      <text
        x="240"
        y="89"
        textAnchor="middle"
        fontSize="8.5"
        fill="#4338ca"
        fontWeight="600"
      >
        玻璃基板（Glass Substrate）
      </text>
      {/* through-glass vias */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line
          key={i}
          x1={110 + i * 38}
          y1="60"
          x2={110 + i * 38}
          y2="97"
          stroke="#f59e0b"
          strokeWidth="2"
          opacity={0.5 + 0.4 * ((pulse + i * 0.15) % 1)}
          strokeDasharray="3 2"
        />
      ))}
      <text x="400" y="72" fontSize="7.5" fill="#f59e0b">
        TGV
      </text>
      <text x="400" y="82" fontSize="7.5" fill="#f59e0b">
        玻璃通孔
      </text>
      {/* chiplets on top */}
      {[
        { x: 100, y: 35, label: "Logic\nChiplet", color: "#6366f1" },
        { x: 190, y: 35, label: "HBM\nStack", color: "#f59e0b" },
        { x: 280, y: 35, label: "I/O\nDie", color: "#22d3ee" },
        { x: 360, y: 35, label: "SRAM\nChiplet", color: "#34d399" },
      ].map((chip, i) => (
        <g key={i}>
          <rect
            x={chip.x}
            y={chip.y}
            width="72"
            height="38"
            rx="3"
            fill="#1a1a2e"
            stroke={chip.color}
            strokeWidth="1.5"
          />
          {chip.label.split("\n").map((line, j) => (
            <text
              key={j}
              x={chip.x + 36}
              y={chip.y + 16 + j * 13}
              textAnchor="middle"
              fontSize="7.5"
              fill={chip.color}
            >
              {line}
            </text>
          ))}
        </g>
      ))}
      {/* substrate bottom */}
      <rect
        x="80"
        y="97"
        width="320"
        height="18"
        rx="3"
        fill="#1e293b"
        stroke="#334155"
        strokeWidth="1"
      />
      <text x="240" y="108" textAnchor="middle" fontSize="7.5" fill="#475569">
        封装底座（BGA球栅阵列）
      </text>
      <W
        title="为什么玻璃基板是下一代封装关键？"
        line1="玻璃热膨胀系数接近芯片，翘曲更小；可集成更细TGV通孔，"
        line2="支持Chiplet间更短互联，Intel/台积电均已布局量产。"
        color="#818cf8"
      />
    </>
  );
}

export function GlasssubAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="玻璃基板制造全流程"
      steps={GLASSSUB_STEPS}
      renderStep={(s) => <GlasssubStep step={s} />}
    />
  );
}

// ─── AiServer (AI服务器整机) ──────────────────────────────────────────────────

const AISERVER_STEPS = [
  { id: 0, label: "核心零部件" },
  { id: 1, label: "ODM代工组装" },
  { id: 2, label: "品牌整机测试" },
  { id: 3, label: "IDC部署" },
];

function AiserverStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    return (
      <>
        {/* BOM components */}
        {[
          {
            x: 65,
            y: 25,
            color: "#6366f1",
            label: "GPU",
            sub: "H100 SXM5\n×8颗",
          },
          {
            x: 175,
            y: 25,
            color: "#f59e0b",
            label: "HBM",
            sub: "HBM3e 80GB\n×8颗",
          },
          {
            x: 285,
            y: 25,
            color: "#22d3ee",
            label: "光模块",
            sub: "800G OSFP\n×32个",
          },
          {
            x: 65,
            y: 85,
            color: "#34d399",
            label: "PSU",
            sub: "3kW×8\n>96%效率",
          },
          {
            x: 175,
            y: 85,
            color: "#f97316",
            label: "PCB",
            sub: "HGX底板\n20层HDI",
          },
          {
            x: 285,
            y: 85,
            color: "#818cf8",
            label: "散热",
            sub: "液冷冷板\n+CDU",
          },
        ].map((c, i) => (
          <g key={i}>
            <rect
              x={c.x}
              y={c.y}
              width="90"
              height="48"
              rx="4"
              fill="#1e293b"
              stroke={c.color}
              strokeWidth="1.2"
              opacity={0.7 + 0.3 * (i === Math.floor(t * 0.8) % 6 ? 1 : 0)}
            />
            <text
              x={c.x + 45}
              y={c.y + 16}
              textAnchor="middle"
              fontSize="9"
              fill={c.color}
              fontWeight="600"
            >
              {c.label}
            </text>
            {c.sub.split("\n").map((line, j) => (
              <text
                key={j}
                x={c.x + 45}
                y={c.y + 29 + j * 12}
                textAnchor="middle"
                fontSize="7"
                fill="#94a3b8"
              >
                {line}
              </text>
            ))}
          </g>
        ))}
        <W
          title="为什么AI服务器BOM如此集中？"
          line1="H100 GPU占整机成本70%以上，GPU产能直接决定"
          line2="AI服务器出货量，英伟达是整条产业链最大瓶颈。"
          color="#6366f1"
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {/* ODM assembly line */}
        <rect
          x="60"
          y="20"
          width="360"
          height="110"
          rx="6"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1.5"
        />
        <text
          x="240"
          y="38"
          textAnchor="middle"
          fontSize="9"
          fill="#94a3b8"
          fontWeight="600"
        >
          ODM工厂产线（鸿海/纬颖/英业达）
        </text>
        {/* conveyor */}
        <rect
          x="80"
          y="95"
          width="320"
          height="8"
          rx="3"
          fill="#1e293b"
          stroke="#334155"
          strokeWidth="1"
        />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle
            key={i}
            cx={90 + i * 54}
            cy="99"
            r="5"
            fill="#334155"
            stroke="#475569"
            strokeWidth="0.8"
          />
        ))}
        {/* server chassis on belt */}
        {[0, 1, 2].map((i) => {
          const beltX = ((80 + i * 100 + ((t * 20) % 100)) % 300) + 80;
          return (
            <rect
              key={i}
              x={beltX}
              y="75"
              width="80"
              height="22"
              rx="2"
              fill="#1e293b"
              stroke="#6366f1"
              strokeWidth="1"
              opacity="0.9"
            />
          );
        })}
        {/* assembly stages */}
        {["底板安装", "GPU插卡", "液冷装配", "线缆理线"].map((stage, i) => (
          <g key={i}>
            <circle
              cx={105 + i * 80}
              cy="55"
              r="14"
              fill="#1e293b"
              stroke={["#f97316", "#6366f1", "#22d3ee", "#34d399"][i]}
              strokeWidth="1.2"
            />
            <text
              x={105 + i * 80}
              y={stage.length > 4 ? 53 : 58}
              textAnchor="middle"
              fontSize="6.5"
              fill={["#fb923c", "#818cf8", "#a5f3fc", "#6ee7b7"][i]}
            >
              {stage}
            </text>
            {stage.length > 4 && (
              <text
                x={105 + i * 80}
                y="62"
                textAnchor="middle"
                fontSize="6.5"
                fill={["#fb923c", "#818cf8", "#a5f3fc", "#6ee7b7"][i]}
              >
                {stage.slice(3)}
              </text>
            )}
          </g>
        ))}
        <W
          title="为什么英伟达要ODM代工？"
          line1="英伟达专注芯片设计，把整机组装外包给鸿海/纬颖等ODM，"
          line2="规模化采购和专业产线使单台HGX H100成本控制最优。"
          color="#6366f1"
        />
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {/* test rack */}
        <rect
          x="80"
          y="20"
          width="180"
          height="110"
          rx="5"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1.5"
        />
        <text x="170" y="38" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
          整机测试台架
        </text>
        {/* server in rack */}
        <rect
          x="95"
          y="45"
          width="150"
          height="75"
          rx="3"
          fill="#1e293b"
          stroke="#6366f1"
          strokeWidth="1.2"
        />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect
            key={i}
            x="100"
            y={48 + i * 9}
            width="140"
            height="7"
            rx="1"
            fill="#1a1a2e"
            stroke="#334155"
            strokeWidth="0.5"
          />
        ))}
        {/* LED indicators */}
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <circle
            key={i}
            cx="108"
            cy={51 + i * 9}
            r="2"
            fill={i % 3 === 0 ? "#22c55e" : i % 3 === 1 ? "#fbbf24" : "#ef4444"}
            opacity={0.7 + 0.3 * ((pulse + i * 0.2) % 1)}
          />
        ))}
        {/* test results panel */}
        <rect
          x="290"
          y="20"
          width="150"
          height="110"
          rx="5"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1.5"
        />
        <text x="365" y="38" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
          测试项目
        </text>
        {[
          { test: "GPU互联带宽", status: "✓", color: "#22c55e" },
          { test: "内存 ECC测试", status: "✓", color: "#22c55e" },
          { test: "液冷密封性", status: "✓", color: "#22c55e" },
          {
            test: "网络吞吐量",
            status: pulse > 0.7 ? "⟳" : "✓",
            color: pulse > 0.7 ? "#fbbf24" : "#22c55e",
          },
          { test: "24h压力测试", status: "⟳", color: "#fbbf24" },
        ].map((item, i) => (
          <g key={i}>
            <text x="305" y={55 + i * 18} fontSize="7.5" fill="#94a3b8">
              {item.test}
            </text>
            <text
              x="425"
              y={55 + i * 18}
              textAnchor="end"
              fontSize="8"
              fill={item.color}
            >
              {item.status}
            </text>
          </g>
        ))}
        <W
          title="为什么整机测试需要这么多项目？"
          line1="H100 HGX一台70万+，出厂前必须过GPU互联/液冷/网络全测，"
          line2="一块GPU故障可能导致整个训练集群停止，损失不可估量。"
          color="#22c55e"
        />
      </>
    );
  }

  // step 3: IDC deployment
  return (
    <>
      {/* truck delivery */}
      <rect
        x="60"
        y="50"
        width="110"
        height="55"
        rx="4"
        fill="#1e293b"
        stroke="#475569"
        strokeWidth="1.2"
      />
      <rect
        x="60"
        y="55"
        width="40"
        height="35"
        rx="2"
        fill="#0f172a"
        stroke="#334155"
        strokeWidth="1"
      />
      <circle
        cx="80"
        cy="105"
        r="8"
        fill="#334155"
        stroke="#475569"
        strokeWidth="1.2"
      />
      <circle
        cx="150"
        cy="105"
        r="8"
        fill="#334155"
        stroke="#475569"
        strokeWidth="1.2"
      />
      <text x="115" y="79" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        专线运输
      </text>
      <text x="115" y="91" textAnchor="middle" fontSize="7" fill="#64748b">
        防震包装
      </text>
      {/* IDC rack */}
      <rect
        x="220"
        y="25"
        width="100"
        height="120"
        rx="4"
        fill="#0f172a"
        stroke="#334155"
        strokeWidth="1.5"
      />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect
          key={i}
          x="225"
          y={30 + i * 13}
          width="90"
          height="10"
          rx="2"
          fill="#1e293b"
          stroke="#6366f1"
          strokeWidth="0.7"
          opacity={i <= Math.floor(t * 1.5) % 9 ? 0.9 : 0.3}
        />
      ))}
      <text x="270" y="130" textAnchor="middle" fontSize="7.5" fill="#6366f1">
        上架中...
      </text>
      {/* cable management */}
      <rect
        x="340"
        y="40"
        width="90"
        height="95"
        rx="4"
        fill="#0f172a"
        stroke="#334155"
        strokeWidth="1.2"
      />
      <text x="385" y="58" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
        光纤配线
      </text>
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M 340,${65 + i * 18} Q 355,${70 + i * 18} 370,${68 + i * 18}`}
          fill="none"
          stroke={["#22d3ee", "#818cf8", "#34d399", "#f59e0b"][i]}
          strokeWidth="1.5"
          opacity={0.6 + 0.3 * pulse}
        />
      ))}
      <W
        title="为什么AI服务器上架需要专业团队？"
        line1="液冷管路对接/光纤配线/网络配置需要专业工程师，"
        line2="万卡集群上架调试周期2-4周，每天延期损失过百万。"
        color="#6366f1"
      />
    </>
  );
}

export function AiserverAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="AI服务器整机制造部署全流程"
      steps={AISERVER_STEPS}
      renderStep={(s) => <AiserverStep step={s} />}
    />
  );
}

// ─── SemiEq (半导体设备) ──────────────────────────────────────────────────────

const SEMIEQ_STEPS = [
  { id: 0, label: "关键零部件" },
  { id: 1, label: "设备整机制造" },
  { id: 2, label: "晶圆厂应用" },
  { id: 3, label: "终端芯片" },
];

function SemieqStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    return (
      <>
        {/* key components grid */}
        {[
          {
            x: 65,
            y: 25,
            color: "#818cf8",
            label: "光学组件",
            sub: "透镜/反射镜\n蔡司供货",
          },
          {
            x: 195,
            y: 25,
            color: "#22d3ee",
            label: "激光光源",
            sub: "CO₂/EUV\n13.5nm",
          },
          {
            x: 325,
            y: 25,
            color: "#f59e0b",
            label: "精密运动\n平台",
            sub: "纳米级定位\n磁悬浮导轨",
          },
          {
            x: 65,
            y: 90,
            color: "#34d399",
            label: "射频电源",
            sub: "13.56MHz\n等离子激励",
          },
          {
            x: 195,
            y: 90,
            color: "#f97316",
            label: "真空系统",
            sub: "涡轮分子泵\n<10⁻⁷ Pa",
          },
          {
            x: 325,
            y: 90,
            color: "#a78bfa",
            label: "控制系统",
            sub: "实时OS\n<1μs响应",
          },
        ].map((c, i) => (
          <g key={i}>
            <rect
              x={c.x}
              y={c.y}
              width="115"
              height="50"
              rx="4"
              fill="#1e293b"
              stroke={c.color}
              strokeWidth="1.2"
              opacity={0.7 + 0.3 * (i === Math.floor(t * 0.6) % 6 ? 1 : 0)}
            />
            {c.label.split("\n").map((line, j) => (
              <text
                key={j}
                x={c.x + 57}
                y={c.y + 16 + j * 12}
                textAnchor="middle"
                fontSize="8"
                fill={c.color}
                fontWeight="600"
              >
                {line}
              </text>
            ))}
            {c.sub.split("\n").map((line, j) => (
              <text
                key={j}
                x={c.x + 57}
                y={c.y + (c.label.includes("\n") ? 42 : 30) + j * 11}
                textAnchor="middle"
                fontSize="7"
                fill="#94a3b8"
              >
                {line}
              </text>
            ))}
          </g>
        ))}
        <W
          title="为什么半导体设备国产化这么难？"
          line1="EUV光学件全球只有蔡司能做，精密运动平台需纳米级精度，"
          line2="每个子系统都是十年以上积累，不可能短期追赶。"
          color="#818cf8"
        />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {/* clean room assembly */}
        <rect
          x="60"
          y="15"
          width="360"
          height="115"
          rx="6"
          fill="#f8fafc"
          stroke="#e2e8f0"
          strokeWidth="1.5"
          opacity="0.08"
        />
        <rect
          x="60"
          y="15"
          width="360"
          height="115"
          rx="6"
          fill="none"
          stroke="#334155"
          strokeWidth="1.5"
        />
        <text x="240" y="32" textAnchor="middle" fontSize="8.5" fill="#94a3b8">
          Class 100 洁净室组装
        </text>
        {/* equipment types */}
        {[
          {
            x: 80,
            y: 40,
            w: 100,
            h: 75,
            color: "#818cf8",
            label: "光刻机",
            sub: "ASML/尼康\n8亿美元/台",
          },
          {
            x: 200,
            y: 40,
            w: 80,
            h: 75,
            color: "#22d3ee",
            label: "刻蚀机",
            sub: "泛林/中微\n离子体刻蚀",
          },
          {
            x: 300,
            y: 40,
            w: 80,
            h: 75,
            color: "#34d399",
            label: "CVD炉",
            sub: "应用材料\n薄膜沉积",
          },
          {
            x: 390,
            y: 40,
            w: 25,
            h: 75,
            color: "#f59e0b",
            label: "CMP",
            sub: "",
          },
        ].map((eq, i) => (
          <g key={i}>
            <rect
              x={eq.x}
              y={eq.y}
              width={eq.w}
              height={eq.h}
              rx="3"
              fill="#1e293b"
              stroke={eq.color}
              strokeWidth="1.2"
              opacity={0.7 + 0.3 * (i === Math.floor(t * 0.5) % 4 ? 1 : 0)}
            />
            <text
              x={eq.x + eq.w / 2}
              y={eq.y + 20}
              textAnchor="middle"
              fontSize="8.5"
              fill={eq.color}
              fontWeight="600"
            >
              {eq.label}
            </text>
            {eq.sub.split("\n").map((line, j) => (
              <text
                key={j}
                x={eq.x + eq.w / 2}
                y={eq.y + 35 + j * 12}
                textAnchor="middle"
                fontSize="7"
                fill="#94a3b8"
              >
                {line}
              </text>
            ))}
          </g>
        ))}
        <W
          title="为什么半导体设备需要洁净室？"
          line1="芯片特征尺寸3nm，一粒尘埃（μm级）就能毁掉整片晶圆，"
          line2="Class 100意味着每立方英尺空气不超过100个0.5μm粒子。"
          color="#22d3ee"
        />
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {/* wafer fab process flow */}
        <rect
          x="60"
          y="18"
          width="360"
          height="112"
          rx="6"
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1.5"
        />
        <text
          x="240"
          y="35"
          textAnchor="middle"
          fontSize="9"
          fill="#94a3b8"
          fontWeight="600"
        >
          晶圆制造工艺流程（简化）
        </text>
        {/* process steps */}
        {[
          { x: 80, icon: "氧化", color: "#f97316" },
          { x: 140, icon: "光刻", color: "#818cf8" },
          { x: 200, icon: "刻蚀", color: "#22d3ee" },
          { x: 260, icon: "CVD", color: "#34d399" },
          { x: 320, icon: "CMP", color: "#f59e0b" },
          { x: 380, icon: "检测", color: "#a78bfa" },
        ].map((s, i) => (
          <g key={i}>
            <circle
              cx={s.x}
              cy="72"
              r="22"
              fill="#1e293b"
              stroke={s.color}
              strokeWidth="1.5"
              opacity={i === Math.floor(t * 0.8) % 6 ? 1 : 0.6}
            />
            <text
              x={s.x}
              y="75"
              textAnchor="middle"
              fontSize="8"
              fill={s.color}
              fontWeight="600"
            >
              {s.icon}
            </text>
            {i < 5 && (
              <line
                x1={s.x + 22}
                y1="72"
                x2={s.x + 40}
                y2="72"
                stroke="#475569"
                strokeWidth="1.2"
                opacity="0.6"
              />
            )}
          </g>
        ))}
        {/* repeat arrow */}
        <path
          d="M 402,72 Q 430,50 430,90 Q 430,108 240,108 Q 60,108 60,90 Q 60,72 80,72"
          fill="none"
          stroke="#475569"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.5"
        />
        <text x="240" y="122" textAnchor="middle" fontSize="7.5" fill="#64748b">
          重复600-1000次工艺步骤 → 完整芯片
        </text>
        <W
          title="为什么先进节点需要更多工艺步骤？"
          line1="3nm芯片需要光刻步骤超过100道，总工艺步骤600+，"
          line2="每道步骤都需要一台精密设备，一个月以上完成一片晶圆。"
          color="#818cf8"
        />
      </>
    );
  }

  // step 3: end chip
  return (
    <>
      {/* chip output */}
      <text
        x="240"
        y="30"
        textAnchor="middle"
        fontSize="10"
        fill="#94a3b8"
        fontWeight="600"
      >
        设备 → 晶圆 → 芯片
      </text>
      {/* equipment → wafer → chip chain */}
      {[
        { x: 65, color: "#818cf8", label: "EUV光刻机", sub: "ASML" },
        { x: 185, color: "#22d3ee", label: "刻蚀机", sub: "中微/泛林" },
        { x: 305, color: "#f59e0b", label: "3nm晶圆", sub: "台积电" },
      ].map((item, i) => (
        <g key={i}>
          <rect
            x={item.x}
            y="45"
            width="105"
            height="50"
            rx="4"
            fill="#1e293b"
            stroke={item.color}
            strokeWidth="1.5"
            opacity={0.7 + 0.3 * (i === Math.floor(t * 0.7) % 3 ? 1 : 0)}
          />
          <text
            x={item.x + 52}
            y="68"
            textAnchor="middle"
            fontSize="9"
            fill={item.color}
            fontWeight="600"
          >
            {item.label}
          </text>
          <text
            x={item.x + 52}
            y="82"
            textAnchor="middle"
            fontSize="7.5"
            fill="#94a3b8"
          >
            {item.sub}
          </text>
          {i < 2 && (
            <line
              x1={item.x + 105}
              y1="70"
              x2={item.x + 120}
              y2="70"
              stroke={item.color}
              strokeWidth="2"
              opacity={0.6 + 0.3 * pulse}
            />
          )}
        </g>
      ))}
      {/* final GPU chip */}
      <rect
        x="140"
        y="108"
        width="200"
        height="22"
        rx="4"
        fill="#1a1a2e"
        stroke="#6366f1"
        strokeWidth="2"
        opacity={0.7 + 0.3 * pulse}
      />
      <text
        x="240"
        y="122"
        textAnchor="middle"
        fontSize="9"
        fill="#818cf8"
        fontWeight="600"
      >
        → H100 GPU / 先进AI芯片
      </text>
      <W
        title="为什么国产半导体设备是战略优先级？"
        line1="卡脖子在设备：禁售EUV=无法制造3/5nm芯片，"
        line2="中微/华海清科等国产设备打破部分封锁，仍需大量突破。"
        color="#818cf8"
      />
    </>
  );
}

export function SemieqAnimation({ isLight }: { isLight: boolean }) {
  return (
    <IA
      isLight={isLight}
      title="半导体设备制造应用全流程"
      steps={SEMIEQ_STEPS}
      renderStep={(s) => <SemieqStep step={s} />}
    />
  );
}

// ─── Humanoid (人形机器人) ────────────────────────────────────────────────────

const HUMANOID_STEPS = [
  { id: 0, label: "核心零部件" },
  { id: 1, label: "执行器总成" },
  { id: 2, label: "本体集成" },
  { id: 3, label: "AI具身智能" },
];

function HumanoidStep({ step }: { step: number }) {
  const t = (Date.now() / 700) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    // 核心零部件：谐波减速器 + 滚柱丝杆 + 六维力传感器
    return (
      <>
        {/* 谐波减速器 */}
        <ellipse
          cx="120"
          cy="60"
          rx="42"
          ry="38"
          fill="#1e293b"
          stroke="#f59e0b"
          strokeWidth="1.5"
        />
        <ellipse
          cx="120"
          cy="60"
          rx="28"
          ry="24"
          fill="#0f172a"
          stroke="#fbbf24"
          strokeWidth="1"
        />
        <ellipse
          cx="120"
          cy="60"
          rx="14"
          ry="12"
          fill="#1a1a2e"
          stroke="#f59e0b"
          strokeWidth="1.5"
          opacity={0.7 + 0.3 * pulse}
        />
        <text
          x="120"
          y="112"
          textAnchor="middle"
          fontSize="8.5"
          fill="#fbbf24"
          fontWeight="600"
        >
          谐波减速器
        </text>
        <text x="120" y="124" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          精密传动核心
        </text>

        {/* 滚柱丝杆 */}
        <rect
          x="198"
          y="30"
          width="100"
          height="20"
          rx="10"
          fill="#1e293b"
          stroke="#38bdf8"
          strokeWidth="1.5"
        />
        {[0, 1, 2, 3, 4].map((i) => (
          <circle
            key={i}
            cx={215 + i * 17}
            cy="40"
            r="6"
            fill="#0f172a"
            stroke="#38bdf8"
            strokeWidth="1"
            opacity={0.7 + 0.2 * pulse}
          />
        ))}
        <rect
          x="198"
          y="55"
          width="100"
          height="20"
          rx="10"
          fill="#1e293b"
          stroke="#38bdf8"
          strokeWidth="1.5"
        />
        <text
          x="248"
          y="91"
          textAnchor="middle"
          fontSize="8.5"
          fill="#38bdf8"
          fontWeight="600"
        >
          行星滚柱丝杆
        </text>
        <text x="248" y="103" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          线性执行器
        </text>

        {/* 六维力传感器 */}
        <rect
          x="350"
          y="28"
          width="80"
          height="44"
          rx="8"
          fill="#1e293b"
          stroke="#10b981"
          strokeWidth="1.5"
        />
        <circle
          cx="390"
          cy="50"
          r="14"
          fill="#0f172a"
          stroke="#10b981"
          strokeWidth="1.5"
          opacity={0.7 + 0.3 * pulse}
          filter="url(#ia-glow3)"
        />
        <text x="240" y="8" textAnchor="middle" fontSize="7" fill="#6366f1">
          Fx
        </text>
        {["Fx", "Fy", "Fz", "Mx", "My", "Mz"].map((l, i) => (
          <text
            key={l}
            x={355 + (i % 3) * 24}
            y={37 + Math.floor(i / 3) * 12}
            fontSize="7"
            fill="#34d399"
            opacity={0.6 + 0.4 * pulse}
          >
            {l}
          </text>
        ))}
        <text
          x="390"
          y="86"
          textAnchor="middle"
          fontSize="8.5"
          fill="#10b981"
          fontWeight="600"
        >
          六维力传感器
        </text>
        <text x="390" y="98" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
          力控反馈
        </text>

        <W
          title="为什么零部件决定人形机器人成本？"
          line1="减速器/丝杆/传感器占整机BOM约60%，"
          line2="国产替代空间巨大，规模量产后成本可降80%。"
          color="#f59e0b"
        />
      </>
    );
  }
  if (step === 1) {
    // 执行器总成：伺服电机驱动关节
    const joints = [
      { x: 80, y: 30, label: "肩关节" },
      { x: 200, y: 50, label: "肘关节" },
      { x: 320, y: 50, label: "腕关节" },
      { x: 420, y: 30, label: "手指" },
    ];
    return (
      <>
        {/* 手臂轮廓 */}
        <path
          d="M80,30 Q140,20 200,50 Q260,80 320,50 Q370,30 420,30"
          stroke="#334155"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M80,30 Q140,20 200,50 Q260,80 320,50 Q370,30 420,30"
          stroke="#1e40af"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
        />
        {/* 关节节点 */}
        {joints.map((j) => (
          <g key={j.label}>
            <circle
              cx={j.x}
              cy={j.y}
              r={14}
              fill="#1e293b"
              stroke="#f59e0b"
              strokeWidth="2"
            />
            <circle
              cx={j.x}
              cy={j.y}
              r={8}
              fill="#0f172a"
              stroke="#fbbf24"
              strokeWidth="1.5"
              opacity={0.7 + 0.3 * pulse}
            />
            <text
              x={j.x}
              y={j.y + 26}
              textAnchor="middle"
              fontSize="8"
              fill="#94a3b8"
            >
              {j.label}
            </text>
          </g>
        ))}
        {/* 电机符号 */}
        {joints.slice(0, 3).map((j) => (
          <g key={`m-${j.label}`}>
            <rect
              x={j.x - 10}
              y={j.y + 32}
              width={20}
              height={12}
              rx="3"
              fill="#312e81"
              stroke="#818cf8"
              strokeWidth="1"
            />
            <text
              x={j.x}
              y={j.y + 41}
              textAnchor="middle"
              fontSize="7"
              fill="#a5b4fc"
            >
              M
            </text>
          </g>
        ))}
        {/* 扭矩箭头 */}
        <path
          d="M195,75 A16,16 0 0,1 215,58"
          stroke="#f59e0b"
          strokeWidth="1.5"
          fill="none"
          markerEnd="url(#arrow)"
          opacity={0.6 + 0.4 * pulse}
        />
        <text
          x="240"
          y="110"
          textAnchor="middle"
          fontSize="9"
          fill="#fbbf24"
          fontWeight="600"
        >
          最大扭矩: 80 N·m / 关节
        </text>
        <W
          title="执行器是人形机器人的肌肉"
          line1="伺服电机+减速器组成执行器单元，"
          line2="每台人形机器人需要40+个执行器节点。"
          color="#f59e0b"
        />
      </>
    );
  }
  if (step === 2) {
    // 本体集成：人形轮廓
    const bodyColor = "#1e40af";
    return (
      <>
        {/* 头部 */}
        <circle
          cx="240"
          cy="28"
          r="20"
          fill="#1e293b"
          stroke="#38bdf8"
          strokeWidth="2"
        />
        <circle
          cx="232"
          cy="24"
          r="4"
          fill="#38bdf8"
          opacity={0.7 + 0.3 * pulse}
        />
        <circle
          cx="248"
          cy="24"
          r="4"
          fill="#38bdf8"
          opacity={0.7 + 0.3 * pulse}
        />
        {/* 躯干 */}
        <rect
          x="208"
          y="52"
          width="64"
          height="56"
          rx="8"
          fill="#1e293b"
          stroke="#6366f1"
          strokeWidth="2"
        />
        <rect
          x="220"
          y="62"
          width="40"
          height="14"
          rx="4"
          fill="#0f172a"
          stroke="#818cf8"
          strokeWidth="1"
          opacity={0.8 + 0.2 * pulse}
        />
        <text
          x="240"
          y="72"
          textAnchor="middle"
          fontSize="7"
          fill="#a5b4fc"
          fontWeight="600"
        >
          AI BRAIN
        </text>
        {/* 左臂 */}
        <rect
          x="176"
          y="54"
          width="28"
          height="10"
          rx="5"
          fill="#1e293b"
          stroke="#f59e0b"
          strokeWidth="1.5"
        />
        <rect
          x="168"
          y="68"
          width="22"
          height="32"
          rx="6"
          fill="#1e293b"
          stroke="#f59e0b"
          strokeWidth="1.5"
        />
        {/* 右臂 */}
        <rect
          x="276"
          y="54"
          width="28"
          height="10"
          rx="5"
          fill="#1e293b"
          stroke="#f59e0b"
          strokeWidth="1.5"
        />
        <rect
          x="290"
          y="68"
          width="22"
          height="32"
          rx="6"
          fill="#1e293b"
          stroke="#f59e0b"
          strokeWidth="1.5"
        />
        {/* 腿部 */}
        <rect
          x="214"
          y="112"
          width="22"
          height="15"
          rx="5"
          fill="#1e293b"
          stroke="#10b981"
          strokeWidth="1.5"
        />
        <rect
          x="244"
          y="112"
          width="22"
          height="15"
          rx="5"
          fill="#1e293b"
          stroke="#10b981"
          strokeWidth="1.5"
        />
        <rect
          x="210"
          y="128"
          width="22"
          height="10"
          rx="5"
          fill="#1e293b"
          stroke="#10b981"
          strokeWidth="1.5"
        />
        <rect
          x="248"
          y="128"
          width="22"
          height="10"
          rx="5"
          fill="#1e293b"
          stroke="#10b981"
          strokeWidth="1.5"
        />
        {/* 数据流 */}
        <line
          x1="240"
          y1="48"
          x2="240"
          y2="52"
          stroke="#38bdf8"
          strokeWidth="1.5"
          opacity={0.7 + 0.3 * pulse}
        />
        <text x="340" y="68" textAnchor="start" fontSize="8" fill="#94a3b8">
          身高: 1.7m
        </text>
        <text x="340" y="80" textAnchor="start" fontSize="8" fill="#94a3b8">
          自重: 60kg
        </text>
        <text x="340" y="92" textAnchor="start" fontSize="8" fill="#94a3b8">
          关节: 43个
        </text>
        <text x="340" y="104" textAnchor="start" fontSize="8" fill="#94a3b8">
          续航: 4h
        </text>
        <W
          title="整机集成是系统工程"
          line1="机械/电子/软件深度耦合，"
          line2="自重60kg负载30kg，步速可达3km/h。"
          color="#6366f1"
        />
      </>
    );
  }
  // step 3: AI具身智能
  const layers = [
    { label: "感知层", desc: "视觉+触觉+IMU", color: "#38bdf8", y: 15 },
    { label: "理解层", desc: "多模态大模型", color: "#818cf8", y: 55 },
    { label: "决策层", desc: "具身智能策略网络", color: "#f59e0b", y: 95 },
  ];
  return (
    <>
      {layers.map((l, i) => (
        <g key={l.label}>
          <rect
            x="80"
            y={l.y}
            width="320"
            height="28"
            rx="6"
            fill="#1e293b"
            stroke={l.color}
            strokeWidth="1.5"
            opacity={0.8 + 0.2 * pulse}
          />
          <text
            x="100"
            y={l.y + 17}
            fontSize="9"
            fill={l.color}
            fontWeight="700"
          >
            {l.label}
          </text>
          <text x="200" y={l.y + 17} fontSize="8.5" fill="#94a3b8">
            {l.desc}
          </text>
          {i < layers.length - 1 && (
            <line
              x1="240"
              y1={l.y + 28}
              x2="240"
              y2={l.y + 42}
              stroke={l.color}
              strokeWidth="1.5"
              strokeDasharray="4 2"
              opacity={0.7 + 0.3 * pulse}
            />
          )}
        </g>
      ))}
      {/* 执行输出 */}
      <rect
        x="80"
        y="135"
        width="320"
        height="28"
        rx="6"
        fill="#1e293b"
        stroke="#10b981"
        strokeWidth="1.5"
      />
      <text
        x="240"
        y="152"
        textAnchor="middle"
        fontSize="9"
        fill="#10b981"
        fontWeight="700"
      >
        执行层：40+自由度实时运动控制
      </text>
      <W
        title="具身智能是人形机器人的大脑"
        line1="端到端强化学习可直接从感知到控制，"
        line2="OpenAI/特斯拉/华为均在布局具身大模型。"
        color="#818cf8"
      />
    </>
  );
}

export function HumanoidAnimation({
  isLight,
  industryId,
}: {
  isLight: boolean;
  industryId?: string;
}) {
  const id = industryId || "hm_overview";

  if (id === "hm_reducer") {
    return (
      <IA
        isLight={isLight}
        title="谐波减速器工作原理与产业链"
        steps={[
          { id: 0, label: "柔轮形变原理" },
          { id: 1, label: "谐波传动精度" },
          { id: 2, label: "国产供应链" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 700) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                <ellipse
                  cx="240"
                  cy="75"
                  rx="100"
                  ry="30"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  strokeDasharray="8 4"
                />
                <ellipse
                  cx="240"
                  cy="75"
                  rx={80 + 6 * pulse}
                  ry={24 + 4 * pulse}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2.5"
                  opacity={0.7 + 0.3 * pulse}
                />
                <ellipse
                  cx="240"
                  cy="75"
                  rx="45"
                  ry="14"
                  fill="#1e293b"
                  stroke="#6366f1"
                  strokeWidth="2"
                />
                <text
                  x="240"
                  y="79"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#818cf8"
                  fontWeight="700"
                >
                  波发生器
                </text>
                {[0, 1, 2, 3].map((i) => (
                  <line
                    key={i}
                    x1={140 + i * 33}
                    y1="45"
                    x2={140 + i * 33}
                    y2="105"
                    stroke="#334155"
                    strokeWidth="0.6"
                  />
                ))}
                <text
                  x="240"
                  y="120"
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="#f59e0b"
                  fontWeight="600"
                >
                  柔轮在波发生器驱动下产生弹性形变
                </text>
                <W
                  title="谐波减速器减速比可达30-320:1"
                  line1="利用柔轮弹性形变实现大减速比，"
                  line2="精度0.5角秒，回差&lt;1角分，人形机器人核心。"
                  color="#f59e0b"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                {[0, 1, 2].map((i) => (
                  <g key={i}>
                    <rect
                      x={80 + i * 130}
                      y="30"
                      width="100"
                      height="70"
                      rx="8"
                      fill="#1e293b"
                      stroke={["#f59e0b", "#6366f1", "#10b981"][i]}
                      strokeWidth="1.5"
                    />
                    <text
                      x={130 + i * 130}
                      y="55"
                      textAnchor="middle"
                      fontSize="10"
                      fill={["#fbbf24", "#818cf8", "#34d399"][i]}
                      fontWeight="700"
                    >
                      {["谐波", "RV", "行星"][i]}
                    </text>
                    <text
                      x={130 + i * 130}
                      y="70"
                      textAnchor="middle"
                      fontSize="8"
                      fill="#94a3b8"
                    >
                      精度: {["±1'", "±3'", "±5'"][i]}
                    </text>
                    <text
                      x={130 + i * 130}
                      y="83"
                      textAnchor="middle"
                      fontSize="8"
                      fill="#94a3b8"
                    >
                      重量: {["轻", "重", "中"][i]}
                    </text>
                    <text
                      x={130 + i * 130}
                      y="96"
                      textAnchor="middle"
                      fontSize="8"
                      fill="#94a3b8"
                    >
                      成本: {["高", "高", "低"][i]}
                    </text>
                  </g>
                ))}
                <text
                  x="240"
                  y="120"
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="#94a3b8"
                >
                  三类减速器对比：谐波最适合人形机器人小关节
                </text>
                <W
                  title="国产替代空间巨大"
                  line1="日本占全球谐波减速器60%+份额，"
                  line2="绿的谐波已打破垄断，丰立智能快速追赶。"
                  color="#f59e0b"
                />
              </>
            );
          return (
            <>
              {[
                { x: 100, y: 30, n: "绿的谐波", t: "688017", c: "#f59e0b" },
                { x: 300, y: 30, n: "双环传动", t: "002472", c: "#6366f1" },
                { x: 100, y: 95, n: "丰立智能", t: "301368", c: "#10b981" },
                { x: 300, y: 95, n: "新时达", t: "002527", c: "#38bdf8" },
              ].map((nd) => (
                <g key={nd.n}>
                  <rect
                    x={nd.x}
                    y={nd.y}
                    width="130"
                    height="48"
                    rx="8"
                    fill="#1e293b"
                    stroke={nd.c}
                    strokeWidth="1.5"
                    opacity={0.8 + 0.2 * pulse}
                  />
                  <text
                    x={nd.x + 65}
                    y={nd.y + 20}
                    textAnchor="middle"
                    fontSize="9"
                    fill={nd.c}
                    fontWeight="700"
                  >
                    {nd.n}
                  </text>
                  <text
                    x={nd.x + 65}
                    y={nd.y + 35}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#64748b"
                  >
                    {nd.t}
                  </text>
                </g>
              ))}
              <text
                x="240"
                y="158"
                textAnchor="middle"
                fontSize="9"
                fill="#fbbf24"
                fontWeight="600"
              >
                国产减速器市场规模：2025年预计超50亿元
              </text>
              <W
                title="人形机器人每台需12-20个减速器"
                line1="按百万台/年测算，国产减速器年需求百亿级，"
                line2="绿的谐波/双环传动/丰立智能是核心标的。"
                color="#f59e0b"
              />
            </>
          );
        }}
      />
    );
  }

  if (id === "hm_screw") {
    return (
      <IA
        isLight={isLight}
        title="行星滚柱丝杆工作原理"
        steps={[
          { id: 0, label: "螺旋传动原理" },
          { id: 1, label: "滚柱受力分析" },
          { id: 2, label: "线性执行应用" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 600) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                <rect
                  x="140"
                  y="50"
                  width="200"
                  height="30"
                  rx="15"
                  fill="#1e293b"
                  stroke="#38bdf8"
                  strokeWidth="2"
                />
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <rect
                    key={i}
                    x={145 + i * 30}
                    y="52"
                    width="22"
                    height="26"
                    rx="4"
                    fill="#0f172a"
                    stroke="#6366f1"
                    strokeWidth="1"
                    opacity={0.6 + 0.3 * pulse}
                  />
                ))}
                <line
                  x1={240 + 20 * pulse}
                  y1="80"
                  x2={240 + 20 * pulse}
                  y2="110"
                  stroke="#f59e0b"
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity={0.8 + 0.2 * pulse}
                />
                <polygon
                  points={`${240 + 20 * pulse - 6},110 ${240 + 20 * pulse + 6},110 ${240 + 20 * pulse},122`}
                  fill="#f59e0b"
                  opacity={0.9 + 0.1 * pulse}
                />
                <text
                  x="240"
                  y="135"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#38bdf8"
                  fontWeight="600"
                >
                  旋转运动→线性运动（导程精度0.001mm）
                </text>
                <W
                  title="行星滚柱丝杆 vs 滚珠丝杆"
                  line1="行星滚柱丝杆负载能力是滚珠丝杆5倍，"
                  line2="速度高3倍，寿命长15倍，人形机器人首选。"
                  color="#38bdf8"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                <circle
                  cx="240"
                  cy="70"
                  r="40"
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2"
                />
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
                  const angle = (i / 9) * Math.PI * 2;
                  return (
                    <circle
                      key={i}
                      cx={240 + 32 * Math.cos(angle)}
                      cy={70 + 32 * Math.sin(angle)}
                      r="7"
                      fill="#1e293b"
                      stroke="#818cf8"
                      strokeWidth="1.5"
                      opacity={0.7 + 0.3 * pulse}
                    />
                  );
                })}
                <circle
                  cx="240"
                  cy="70"
                  r="15"
                  fill="#0f172a"
                  stroke="#f59e0b"
                  strokeWidth="2"
                />
                <text
                  x="240"
                  y="130"
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="#818cf8"
                  fontWeight="600"
                >
                  9个行星滚子均匀分布，载荷均分
                </text>
                <W
                  title="行星滚子实现大载荷"
                  line1="9个滚子接触线为点接触，极大提升承载能力，"
                  line2="适合人形机器人膝/踝关节高冲击场景。"
                  color="#6366f1"
                />
              </>
            );
          return (
            <>
              {[
                {
                  x: 80,
                  y: 20,
                  label: "腿部推杆",
                  desc: "膝关节±120°，推力800N",
                },
                {
                  x: 280,
                  y: 20,
                  label: "臂部推杆",
                  desc: "肘关节伸缩，推力200N",
                },
                { x: 80, y: 95, label: "踝关节", desc: "缓冲±20°，刚柔结合" },
                { x: 280, y: 95, label: "腰部俯仰", desc: "±60°，承重100kg" },
              ].map((nd) => (
                <g key={nd.label}>
                  <rect
                    x={nd.x}
                    y={nd.y}
                    width="160"
                    height="55"
                    rx="8"
                    fill="#1e293b"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    opacity={0.8 + 0.2 * pulse}
                  />
                  <text
                    x={nd.x + 80}
                    y={nd.y + 22}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#fbbf24"
                    fontWeight="700"
                  >
                    {nd.label}
                  </text>
                  <text
                    x={nd.x + 80}
                    y={nd.y + 38}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#94a3b8"
                  >
                    {nd.desc}
                  </text>
                </g>
              ))}
              <W
                title="行星滚柱丝杆是人形机器人专属零件"
                line1="贝斯特已成功送样特斯拉，五洲新春加速布局，"
                line2="单台机器人需14根丝杆，百万台需求14亿根。"
                color="#f59e0b"
              />
            </>
          );
        }}
      />
    );
  }

  if (id === "hm_motor") {
    return (
      <IA
        isLight={isLight}
        title="无框力矩电机与伺服驱动"
        steps={[
          { id: 0, label: "永磁电机原理" },
          { id: 1, label: "FOC矢量控制" },
          { id: 2, label: "伺服驱动系统" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 500) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          const angle = (Date.now() / 1000) % (Math.PI * 2);
          if (s === 0)
            return (
              <>
                <circle
                  cx="240"
                  cy="72"
                  r="55"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2"
                />
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                  const a = (i / 8) * Math.PI * 2;
                  return (
                    <rect
                      key={i}
                      x={240 + 42 * Math.cos(a) - 8}
                      y={72 + 42 * Math.sin(a) - 14}
                      width="16"
                      height="28"
                      rx="4"
                      fill={["#1e3a5f", "#3d1f00"][i % 2]}
                      stroke={["#38bdf8", "#f59e0b"][i % 2]}
                      strokeWidth="1.5"
                      transform={`rotate(${i * 45},${240 + 42 * Math.cos(a)},${72 + 42 * Math.sin(a)})`}
                    />
                  );
                })}
                <circle
                  cx="240"
                  cy="72"
                  r="24"
                  fill="#1e293b"
                  stroke="#6366f1"
                  strokeWidth="2"
                />
                <line
                  x1="240"
                  y1="72"
                  x2={240 + 18 * Math.cos(angle)}
                  y2={72 + 18 * Math.sin(angle)}
                  stroke="#818cf8"
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity={0.9 + 0.1 * pulse}
                />
                <text
                  x="240"
                  y="143"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#fbbf24"
                  fontWeight="600"
                >
                  无框电机：无外壳，直接嵌入关节
                </text>
                <W
                  title="为什么用无框力矩电机？"
                  line1="无外壳设计节省50%体积和重量，"
                  line2="高转矩密度可达50Nm/kg，人形关节专属。"
                  color="#f59e0b"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                {["Id=0\n磁通分量", "Iq→转矩\n电流分量"].map((label, i) => (
                  <g key={i}>
                    <line
                      x1="240"
                      y1="75"
                      x2={240 + (i === 0 ? 0 : 50)}
                      y2={75 - (i === 0 ? 50 : 0)}
                      stroke={["#38bdf8", "#f59e0b"][i]}
                      strokeWidth="3"
                      markerEnd="url(#arrow)"
                      opacity={0.8 + 0.2 * pulse}
                    />
                    <text
                      x={240 + (i === 0 ? 8 : 52)}
                      y={75 - (i === 0 ? 52 : 8)}
                      fontSize="8"
                      fill={["#38bdf8", "#fbbf24"][i]}
                    >
                      {label}
                    </text>
                  </g>
                ))}
                <circle
                  cx="240"
                  cy="75"
                  r="55"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray="6 3"
                />
                <rect
                  x="80"
                  y="110"
                  width="100"
                  height="24"
                  rx="6"
                  fill="#1e293b"
                  stroke="#6366f1"
                  strokeWidth="1.5"
                />
                <text
                  x="130"
                  y="126"
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="#818cf8"
                  fontWeight="600"
                >
                  FOC控制器
                </text>
                <rect
                  x="260"
                  y="110"
                  width="100"
                  height="24"
                  rx="6"
                  fill="#1e293b"
                  stroke="#10b981"
                  strokeWidth="1.5"
                />
                <text
                  x="310"
                  y="126"
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="#34d399"
                  fontWeight="600"
                >
                  PWM逆变器
                </text>
                <line
                  x1="180"
                  y1="122"
                  x2="260"
                  y2="122"
                  stroke="#475569"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow)"
                />
                <W
                  title="FOC实现最优转矩控制"
                  line1="磁场定向控制把交流电机当直流控制，"
                  line2="动态响应&lt;1ms，力控精度达±0.1Nm。"
                  color="#6366f1"
                />
              </>
            );
          return (
            <>
              {[
                {
                  x: 80,
                  y: 20,
                  label: "电流环",
                  desc: "1ms响应，电流精度±0.5%",
                  c: "#f59e0b",
                },
                {
                  x: 280,
                  y: 20,
                  label: "速度环",
                  desc: "5ms响应，转速精度±0.1rpm",
                  c: "#6366f1",
                },
                {
                  x: 80,
                  y: 90,
                  label: "位置环",
                  desc: "10ms响应，角度精度0.01°",
                  c: "#10b981",
                },
                {
                  x: 280,
                  y: 90,
                  label: "力矩环",
                  desc: "3ms响应，力矩精度±0.1Nm",
                  c: "#38bdf8",
                },
              ].map((nd) => (
                <g key={nd.label}>
                  <rect
                    x={nd.x}
                    y={nd.y}
                    width="160"
                    height="52"
                    rx="8"
                    fill="#1e293b"
                    stroke={nd.c}
                    strokeWidth="1.5"
                    opacity={0.8 + 0.2 * pulse}
                  />
                  <text
                    x={nd.x + 80}
                    y={nd.y + 20}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill={nd.c}
                    fontWeight="700"
                  >
                    {nd.label}
                  </text>
                  <text
                    x={nd.x + 80}
                    y={nd.y + 36}
                    textAnchor="middle"
                    fontSize="7.5"
                    fill="#64748b"
                  >
                    {nd.desc}
                  </text>
                </g>
              ))}
              <W
                title="伺服系统是运动控制核心"
                line1="汇川技术已进入特斯拉供应链，"
                line2="鸣志电器/雷赛智能国产化加速。"
                color="#f59e0b"
              />
            </>
          );
        }}
      />
    );
  }

  if (id === "hm_sensor") {
    return (
      <IA
        isLight={isLight}
        title="人形机器人传感器体系"
        steps={[
          { id: 0, label: "六维力传感器" },
          { id: 1, label: "3D视觉感知" },
          { id: 2, label: "多模态融合" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 600) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                <rect
                  x="165"
                  y="30"
                  width="150"
                  height="80"
                  rx="10"
                  fill="#1e293b"
                  stroke="#10b981"
                  strokeWidth="2"
                />
                <circle
                  cx="240"
                  cy="70"
                  r="22"
                  fill="#0f172a"
                  stroke="#34d399"
                  strokeWidth="1.5"
                  opacity={0.8 + 0.2 * pulse}
                />
                {["Fx", "Fy", "Fz", "Mx", "My", "Mz"].map((l, i) => {
                  const a = (i / 6) * Math.PI * 2;
                  return (
                    <text
                      key={l}
                      x={240 + 32 * Math.cos(a)}
                      y={70 + 32 * Math.sin(a)}
                      textAnchor="middle"
                      fontSize="8"
                      fill="#34d399"
                      fontWeight="600"
                    >
                      {l}
                    </text>
                  );
                })}
                <text
                  x="240"
                  y="125"
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="#10b981"
                  fontWeight="600"
                >
                  量程: ±200N / ±20Nm，精度0.1%FS
                </text>
                <W
                  title="六维力传感器实现柔顺操作"
                  line1="实时感知关节受力6个维度，"
                  line2="博杰股份已开始量产，填补国内空白。"
                  color="#10b981"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                <rect
                  x="175"
                  y="20"
                  width="130"
                  height="70"
                  rx="8"
                  fill="#1e293b"
                  stroke="#818cf8"
                  strokeWidth="2"
                />
                <circle
                  cx="215"
                  cy="55"
                  r="16"
                  fill="#0f172a"
                  stroke="#a78bfa"
                  strokeWidth="1.5"
                />
                <circle
                  cx="265"
                  cy="55"
                  r="16"
                  fill="#0f172a"
                  stroke="#a78bfa"
                  strokeWidth="1.5"
                />
                <text
                  x="215"
                  y="59"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#a78bfa"
                >
                  RGB
                </text>
                <text
                  x="265"
                  y="59"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#a78bfa"
                >
                  深度
                </text>
                <path
                  d="M175,100 L80,130 L400,130 L325,100 Z"
                  fill="#1e3a5f"
                  stroke="#6366f1"
                  strokeWidth="1"
                  opacity={0.4 + 0.4 * pulse}
                />
                <text
                  x="240"
                  y="120"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#818cf8"
                >
                  识别范围: 0.3-5m，精度±1mm
                </text>
                <W
                  title="3D视觉让机器人看懂世界"
                  line1="奥比中光ToF/结构光双路线，"
                  line2="思特威高帧率CMOS支撑实时3D重建。"
                  color="#818cf8"
                />
              </>
            );
          return (
            <>
              {[
                { x: 60, label: "六维力", c: "#10b981" },
                { x: 180, label: "3D视觉", c: "#818cf8" },
                { x: 300, label: "IMU", c: "#38bdf8" },
                { x: 400, label: "触觉", c: "#f59e0b" },
              ].map((nd) => (
                <g key={nd.label}>
                  <circle
                    cx={nd.x + 30}
                    cy="50"
                    r="22"
                    fill="#1e293b"
                    stroke={nd.c}
                    strokeWidth="1.5"
                    opacity={0.8 + 0.2 * pulse}
                  />
                  <text
                    x={nd.x + 30}
                    y="54"
                    textAnchor="middle"
                    fontSize="8"
                    fill={nd.c}
                    fontWeight="600"
                  >
                    {nd.label}
                  </text>
                  <line
                    x1={nd.x + 30}
                    y1="72"
                    x2="240"
                    y2="100"
                    stroke={nd.c}
                    strokeWidth="1"
                    strokeDasharray="4 3"
                    opacity={0.5 + 0.4 * pulse}
                  />
                </g>
              ))}
              <rect
                x="165"
                y="100"
                width="150"
                height="30"
                rx="8"
                fill="#1e293b"
                stroke="#fbbf24"
                strokeWidth="2"
                opacity={0.9 + 0.1 * pulse}
              />
              <text
                x="240"
                y="119"
                textAnchor="middle"
                fontSize="9"
                fill="#fbbf24"
                fontWeight="700"
              >
                感知融合模组
              </text>
              <W
                title="多模态传感融合是具身智能关键"
                line1="力+视觉+IMU+触觉四路融合，时延&lt;5ms，"
                line2="瑞芯微边缘AI芯片实时处理传感数据。"
                color="#fbbf24"
              />
            </>
          );
        }}
      />
    );
  }

  if (id === "hm_body") {
    return (
      <IA
        isLight={isLight}
        title="人形机器人整机集成"
        steps={[
          { id: 0, label: "骨架结构" },
          { id: 1, label: "关节装配" },
          { id: 2, label: "整机调试" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 700) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                <circle
                  cx="240"
                  cy="22"
                  r="15"
                  fill="#1e293b"
                  stroke="#38bdf8"
                  strokeWidth="2"
                />
                <rect
                  x="218"
                  y="38"
                  width="44"
                  height="50"
                  rx="6"
                  fill="#1e293b"
                  stroke="#6366f1"
                  strokeWidth="2"
                />
                <rect
                  x="180"
                  y="40"
                  width="36"
                  height="6"
                  rx="3"
                  fill="#1e293b"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                />
                <rect
                  x="264"
                  y="40"
                  width="36"
                  height="6"
                  rx="3"
                  fill="#1e293b"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                />
                <rect
                  x="172"
                  y="46"
                  width="18"
                  height="30"
                  rx="5"
                  fill="#1e293b"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                />
                <rect
                  x="290"
                  y="46"
                  width="18"
                  height="30"
                  rx="5"
                  fill="#1e293b"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                />
                <rect
                  x="220"
                  y="88"
                  width="20"
                  height="10"
                  rx="4"
                  fill="#1e293b"
                  stroke="#10b981"
                  strokeWidth="1.5"
                />
                <rect
                  x="244"
                  y="88"
                  width="20"
                  height="10"
                  rx="4"
                  fill="#1e293b"
                  stroke="#10b981"
                  strokeWidth="1.5"
                />
                <rect
                  x="216"
                  y="98"
                  width="20"
                  height="25"
                  rx="5"
                  fill="#1e293b"
                  stroke="#10b981"
                  strokeWidth="1.5"
                />
                <rect
                  x="248"
                  y="98"
                  width="20"
                  height="25"
                  rx="5"
                  fill="#1e293b"
                  stroke="#10b981"
                  strokeWidth="1.5"
                />
                <text
                  x="240"
                  y="140"
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="#38bdf8"
                  fontWeight="600"
                >
                  碳纤维/铝合金骨架，自重控制60kg内
                </text>
                <W
                  title="轻量化是整机集成核心挑战"
                  line1="碳纤维密度仅钢的1/4，强度是钢5倍，"
                  line2="国内碳纤维结构件成本快速下降，量产可期。"
                  color="#38bdf8"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                {[
                  { cx: 240, cy: 25, r: 12, label: "头部", joints: 1 },
                  { cx: 185, cy: 50, r: 10, label: "肩", joints: 3 },
                  { cx: 295, cy: 50, r: 10, label: "肩", joints: 3 },
                  { cx: 165, cy: 75, r: 8, label: "肘", joints: 2 },
                  { cx: 315, cy: 75, r: 8, label: "肘", joints: 2 },
                  { cx: 230, cy: 88, r: 9, label: "髋", joints: 3 },
                  { cx: 250, cy: 88, r: 9, label: "髋", joints: 3 },
                  { cx: 225, cy: 108, r: 8, label: "膝", joints: 1 },
                  { cx: 255, cy: 108, r: 8, label: "膝", joints: 1 },
                ].map((j) => (
                  <circle
                    key={j.label + j.cx}
                    cx={j.cx}
                    cy={j.cy}
                    r={j.r}
                    fill="#1e293b"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    opacity={0.7 + 0.3 * pulse}
                  />
                ))}
                <line
                  x1="240"
                  y1="37"
                  x2="240"
                  y2="88"
                  stroke="#334155"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                <line
                  x1="185"
                  y1="55"
                  x2="295"
                  y2="55"
                  stroke="#334155"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <line
                  x1="185"
                  y1="55"
                  x2="165"
                  y2="80"
                  stroke="#334155"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <line
                  x1="295"
                  y1="55"
                  x2="315"
                  y2="80"
                  stroke="#334155"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <line
                  x1="230"
                  y1="88"
                  x2="225"
                  y2="115"
                  stroke="#334155"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                <line
                  x1="250"
                  y1="88"
                  x2="255"
                  y2="115"
                  stroke="#334155"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                <text
                  x="240"
                  y="140"
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="#f59e0b"
                  fontWeight="600"
                >
                  全身43个自由度关节，协调运动
                </text>
                <W
                  title="关节是整机集成核心"
                  line1="拓普集团/三花智控作为Tier1，"
                  line2="向关节执行器模组延伸，直供特斯拉整机厂。"
                  color="#f59e0b"
                />
              </>
            );
          return (
            <>
              <circle
                cx="240"
                cy="22"
                r="14"
                fill="#1e293b"
                stroke="#38bdf8"
                strokeWidth="2"
              />
              <rect
                x="216"
                y="38"
                width="48"
                height="52"
                rx="8"
                fill="#1e293b"
                stroke="#6366f1"
                strokeWidth="2"
              />
              <rect
                x="216"
                y="46"
                width="48"
                height="14"
                rx="4"
                fill="#0f172a"
                stroke="#818cf8"
                strokeWidth="1"
                opacity={0.8 + 0.2 * pulse}
              />
              <text
                x="240"
                y="57"
                textAnchor="middle"
                fontSize="7"
                fill="#a5b4fc"
                fontWeight="700"
              >
                AI 大脑
              </text>
              <line
                x1="240"
                y1="37"
                x2="240"
                y2="38"
                stroke="#38bdf8"
                strokeWidth="1.5"
                opacity={0.7 + 0.3 * pulse}
              />
              <rect
                x="182"
                y="40"
                width="30"
                height="8"
                rx="4"
                fill="#1e293b"
                stroke="#f59e0b"
                strokeWidth="1.5"
              />
              <rect
                x="172"
                y="48"
                width="20"
                height="32"
                rx="5"
                fill="#1e293b"
                stroke="#f59e0b"
                strokeWidth="1.5"
              />
              <rect
                x="288"
                y="40"
                width="30"
                height="8"
                rx="4"
                fill="#1e293b"
                stroke="#f59e0b"
                strokeWidth="1.5"
              />
              <rect
                x="288"
                y="48"
                width="20"
                height="32"
                rx="5"
                fill="#1e293b"
                stroke="#f59e0b"
                strokeWidth="1.5"
              />
              <rect
                x="220"
                y="90"
                width="20"
                height="10"
                rx="4"
                fill="#1e293b"
                stroke="#10b981"
                strokeWidth="1.5"
              />
              <rect
                x="244"
                y="90"
                width="20"
                height="10"
                rx="4"
                fill="#1e293b"
                stroke="#10b981"
                strokeWidth="1.5"
              />
              <rect
                x="216"
                y="100"
                width="20"
                height="28"
                rx="6"
                fill="#1e293b"
                stroke="#10b981"
                strokeWidth="1.5"
              />
              <rect
                x="248"
                y="100"
                width="20"
                height="28"
                rx="6"
                fill="#1e293b"
                stroke="#10b981"
                strokeWidth="1.5"
              />
              <text x="360" y="50" fontSize="8" fill="#94a3b8">
                身高: 1.73m
              </text>
              <text x="360" y="62" fontSize="8" fill="#94a3b8">
                体重: 57kg
              </text>
              <text x="360" y="74" fontSize="8" fill="#94a3b8">
                自由度: 43
              </text>
              <text x="360" y="86" fontSize="8" fill="#94a3b8">
                续航: 4h
              </text>
              <text x="360" y="98" fontSize="8" fill="#94a3b8">
                负载: 20kg
              </text>
              <W
                title="2025年是人形机器人量产元年"
                line1="特斯拉Optimus年产目标5万台，2026年百万级，"
                line2="埃斯顿/拓普/三花均已进入Tier1供货体系。"
                color="#6366f1"
              />
            </>
          );
        }}
      />
    );
  }

  if (id === "hm_brain") {
    return (
      <IA
        isLight={isLight}
        title="具身智能AI大脑架构"
        steps={[
          { id: 0, label: "感知→理解" },
          { id: 1, label: "规划→决策" },
          { id: 2, label: "控制→执行" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 600) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                {[
                  { x: 55, label: "RGB-D相机", c: "#818cf8" },
                  { x: 175, label: "六维力传感", c: "#10b981" },
                  { x: 295, label: "IMU惯导", c: "#38bdf8" },
                  { x: 365, label: "触觉阵列", c: "#f59e0b" },
                ].map((nd) => (
                  <g key={nd.label}>
                    <rect
                      x={nd.x}
                      y="15"
                      width="72"
                      height="32"
                      rx="6"
                      fill="#1e293b"
                      stroke={nd.c}
                      strokeWidth="1.5"
                    />
                    <text
                      x={nd.x + 36}
                      y="34"
                      textAnchor="middle"
                      fontSize="7.5"
                      fill={nd.c}
                    >
                      {nd.label}
                    </text>
                    <line
                      x1={nd.x + 36}
                      y1="47"
                      x2="240"
                      y2="75"
                      stroke={nd.c}
                      strokeWidth="1"
                      strokeDasharray="4 3"
                      opacity={0.5 + 0.4 * pulse}
                    />
                  </g>
                ))}
                <rect
                  x="155"
                  y="75"
                  width="170"
                  height="34"
                  rx="8"
                  fill="#1e293b"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  opacity={0.9 + 0.1 * pulse}
                />
                <text
                  x="240"
                  y="95"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#fbbf24"
                  fontWeight="700"
                >
                  多模态感知编码器
                </text>
                <W
                  title="感知是AI大脑的输入"
                  line1="ViT/CLIP编码视觉，力传感提供接触信息，"
                  line2="寒武纪/北京君正边缘NPU实现实时推理。"
                  color="#fbbf24"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                {[
                  {
                    y: 15,
                    label: "具身大语言模型 (LLM)",
                    desc: "理解指令，拆解任务，推理步骤",
                    c: "#818cf8",
                  },
                  {
                    y: 60,
                    label: "世界模型 (World Model)",
                    desc: "预测环境变化，规避障碍物",
                    c: "#6366f1",
                  },
                  {
                    y: 105,
                    label: "运动策略网络 (Policy)",
                    desc: "端到端生成关节轨迹",
                    c: "#f59e0b",
                  },
                ].map((nd) => (
                  <g key={nd.label}>
                    <rect
                      x="80"
                      y={nd.y}
                      width="320"
                      height="34"
                      rx="7"
                      fill="#1e293b"
                      stroke={nd.c}
                      strokeWidth="1.5"
                      opacity={0.8 + 0.2 * pulse}
                    />
                    <text
                      x="240"
                      y={nd.y + 14}
                      textAnchor="middle"
                      fontSize="8.5"
                      fill={nd.c}
                      fontWeight="700"
                    >
                      {nd.label}
                    </text>
                    <text
                      x="240"
                      y={nd.y + 27}
                      textAnchor="middle"
                      fontSize="7.5"
                      fill="#64748b"
                    >
                      {nd.desc}
                    </text>
                  </g>
                ))}
                <W
                  title="具身智能三层架构"
                  line1="LLM理解指令，世界模型建模环境，"
                  line2="策略网络生成具体动作，端到端打通。"
                  color="#6366f1"
                />
              </>
            );
          return (
            <>
              <rect
                x="80"
                y="15"
                width="320"
                height="28"
                rx="7"
                fill="#1e293b"
                stroke="#818cf8"
                strokeWidth="1.5"
              />
              <text
                x="240"
                y="32"
                textAnchor="middle"
                fontSize="8.5"
                fill="#818cf8"
                fontWeight="700"
              >
                策略输出：43维关节角度轨迹（1kHz）
              </text>
              {[
                { x: 80, y: 55, label: "力矩控制器", c: "#f59e0b" },
                { x: 235, y: 55, label: "位置控制器", c: "#6366f1" },
                { x: 310, y: 55, label: "速度控制器", c: "#10b981" },
              ].map((nd) => (
                <g key={nd.label}>
                  <rect
                    x={nd.x}
                    y={nd.y}
                    width="120"
                    height="28"
                    rx="6"
                    fill="#1e293b"
                    stroke={nd.c}
                    strokeWidth="1.5"
                    opacity={0.8 + 0.2 * pulse}
                  />
                  <text
                    x={nd.x + 60}
                    y={nd.y + 17}
                    textAnchor="middle"
                    fontSize="8"
                    fill={nd.c}
                    fontWeight="600"
                  >
                    {nd.label}
                  </text>
                  <line
                    x1={nd.x + 60}
                    y1={nd.y + 28}
                    x2="240"
                    y2="106"
                    stroke={nd.c}
                    strokeWidth="1"
                    strokeDasharray="3 2"
                    opacity={0.5 + 0.3 * pulse}
                  />
                </g>
              ))}
              <rect
                x="155"
                y="106"
                width="170"
                height="26"
                rx="7"
                fill="#1e293b"
                stroke="#f59e0b"
                strokeWidth="2"
                opacity={0.9 + 0.1 * pulse}
              />
              <text
                x="240"
                y="122"
                textAnchor="middle"
                fontSize="9"
                fill="#fbbf24"
                fontWeight="700"
              >
                电机执行器（实时力矩输出）
              </text>
              <W
                title="端到端控制降低系统延迟"
                line1="从感知到执行全链路延迟&lt;10ms，"
                line2="柏楚电子运动控制器+汇川伺服协同实现。"
                color="#f59e0b"
              />
            </>
          );
        }}
      />
    );
  }

  if (id === "hm_actuator") {
    return (
      <IA
        isLight={isLight}
        title="关节执行器模组集成"
        steps={[
          { id: 0, label: "零部件准备" },
          { id: 1, label: "模组集成" },
          { id: 2, label: "整机装配" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 700) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                {[
                  { x: 55, y: 20, label: "无框电机", icon: "⚡", c: "#f59e0b" },
                  {
                    x: 195,
                    y: 20,
                    label: "谐波减速器",
                    icon: "⚙️",
                    c: "#6366f1",
                  },
                  {
                    x: 335,
                    y: 20,
                    label: "绝对编码器",
                    icon: "📡",
                    c: "#10b981",
                  },
                  {
                    x: 55,
                    y: 85,
                    label: "力矩传感器",
                    icon: "📏",
                    c: "#38bdf8",
                  },
                  {
                    x: 195,
                    y: 85,
                    label: "伺服驱动IC",
                    icon: "💻",
                    c: "#818cf8",
                  },
                  {
                    x: 335,
                    y: 85,
                    label: "散热结构",
                    icon: "❄️",
                    c: "#94a3b8",
                  },
                ].map((nd) => (
                  <g key={nd.label}>
                    <rect
                      x={nd.x}
                      y={nd.y}
                      width="110"
                      height="50"
                      rx="8"
                      fill="#1e293b"
                      stroke={nd.c}
                      strokeWidth="1.5"
                      opacity={0.8 + 0.2 * pulse}
                    />
                    <text x={nd.x + 18} y={nd.y + 22} fontSize="14">
                      {nd.icon}
                    </text>
                    <text
                      x={nd.x + 55}
                      y={nd.y + 22}
                      fontSize="8.5"
                      fill={nd.c}
                      fontWeight="700"
                    >
                      {nd.label}
                    </text>
                  </g>
                ))}
                <W
                  title="关节模组集成6大核心部件"
                  line1="电机+减速器+编码器+传感器+驱动+散热，"
                  line2="三花智控/拓普集团Tier1完整模组供货。"
                  color="#f59e0b"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                <rect
                  x="145"
                  y="20"
                  width="190"
                  height="90"
                  rx="12"
                  fill="#1e293b"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                  opacity={0.9 + 0.1 * pulse}
                />
                <text
                  x="240"
                  y="42"
                  textAnchor="middle"
                  fontSize="10"
                  fill="#fbbf24"
                  fontWeight="700"
                >
                  关节执行器模组
                </text>
                {[
                  { y: 52, label: "电机+减速器", c: "#f59e0b" },
                  { y: 67, label: "编码器+力传感", c: "#10b981" },
                  { y: 82, label: "驱动IC+散热", c: "#818cf8" },
                  { y: 97, label: "EtherCAT接口", c: "#38bdf8" },
                ].map((nd) => (
                  <g key={nd.label}>
                    <rect
                      x="155"
                      y={nd.y}
                      width="170"
                      height="12"
                      rx="3"
                      fill="#0f172a"
                      stroke={nd.c}
                      strokeWidth="1"
                    />
                    <text
                      x="240"
                      y={nd.y + 9}
                      textAnchor="middle"
                      fontSize="7.5"
                      fill={nd.c}
                    >
                      {nd.label}
                    </text>
                  </g>
                ))}
                <text
                  x="240"
                  y="128"
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="#fbbf24"
                  fontWeight="600"
                >
                  即插即用，标准接口
                </text>
                <W
                  title="模组化降低整机装配难度"
                  line1="关节模组标准化后，整机装配时间缩短60%，"
                  line2="可靠性提升，便于维修更换。"
                  color="#f59e0b"
                />
              </>
            );
          return (
            <>
              {[
                {
                  cx: 240,
                  cy: 18,
                  label: "躯干",
                  joints: ["L肩", "R肩", "腰"],
                },
                {
                  cx: 180,
                  cy: 45,
                  label: "左臂",
                  joints: ["左肩", "左肘", "左腕"],
                },
                {
                  cx: 300,
                  cy: 45,
                  label: "右臂",
                  joints: ["右肩", "右肘", "右腕"],
                },
                {
                  cx: 226,
                  cy: 90,
                  label: "左腿",
                  joints: ["左髋", "左膝", "左踝"],
                },
                {
                  cx: 254,
                  cy: 90,
                  label: "右腿",
                  joints: ["右髋", "右膝", "右踝"],
                },
              ].map((p) => (
                <g key={p.label}>
                  <circle
                    cx={p.cx}
                    cy={p.cy}
                    r="10"
                    fill="#1e293b"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    opacity={0.8 + 0.2 * pulse}
                  />
                  {p.joints.map((j, i) => {
                    const jx = p.cx - 20 + i * 20;
                    const jy = p.cy + 20;
                    return (
                      <g key={j}>
                        <circle
                          cx={jx}
                          cy={jy}
                          r="6"
                          fill="#0f172a"
                          stroke="#6366f1"
                          strokeWidth="1.5"
                          opacity={0.7 + 0.3 * pulse}
                        />
                        <line
                          x1={p.cx}
                          y1={p.cy + 10}
                          x2={jx}
                          y2={jy - 6}
                          stroke="#334155"
                          strokeWidth="1"
                          opacity="0.5"
                        />
                      </g>
                    );
                  })}
                </g>
              ))}
              <text
                x="240"
                y="135"
                textAnchor="middle"
                fontSize="8.5"
                fill="#f59e0b"
                fontWeight="600"
              >
                全身43个执行器模组协同工作
              </text>
              <W
                title="执行器模组是人形机器人量产关键"
                line1="单台机器人执行器成本约1.5万美元，"
                line2="规模量产后可降至3000美元，市场超千亿。"
                color="#6366f1"
              />
            </>
          );
        }}
      />
    );
  }

  return (
    <IA
      isLight={isLight}
      title="人形机器人产业链全流程"
      steps={HUMANOID_STEPS}
      renderStep={(s) => <HumanoidStep step={s} />}
    />
  );
}

// ─── Aerospace (商业航天) ────────────────────────────────────────────────────

const AEROSPACE_STEPS = [
  { id: 0, label: "火箭发射" },
  { id: 1, label: "卫星入轨" },
  { id: 2, label: "星座组网" },
  { id: 3, label: "卫星应用" },
];

function AerospaceStep({ step }: { step: number }) {
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.5 + 0.5 * Math.sin(t);

  if (step === 0) {
    // 火箭发射场景
    return (
      <>
        {/* 发射台 */}
        <rect
          x="195"
          y="95"
          width="90"
          height="18"
          rx="3"
          fill="#334155"
          stroke="#475569"
          strokeWidth="1"
        />
        <rect
          x="218"
          y="30"
          width="44"
          height="65"
          rx="6"
          fill="#1e293b"
          stroke="#f59e0b"
          strokeWidth="2"
        />
        {/* 整流罩 */}
        <path
          d="M218,30 Q240,10 262,30"
          fill="#1e293b"
          stroke="#fbbf24"
          strokeWidth="1.5"
        />
        {/* 发动机喷嘴 */}
        <path
          d="M218,95 L210,115 L270,115 L262,95"
          fill="#1e293b"
          stroke="#ef4444"
          strokeWidth="1.5"
        />
        {[0, 1, 2].map((i) => (
          <ellipse
            key={i}
            cx={222 + i * 18}
            cy="110"
            rx="6"
            ry="4"
            fill="#374151"
            stroke="#ef4444"
            strokeWidth="1"
          />
        ))}
        {/* 尾焰 */}
        <path
          d={`M215,115 Q240,${135 + 10 * pulse},265,115`}
          fill={`rgba(251,146,60,${0.5 + 0.4 * pulse})`}
          stroke="none"
        />
        <path
          d={`M222,115 Q240,${145 + 12 * pulse},258,115`}
          fill={`rgba(239,68,68,${0.4 + 0.5 * pulse})`}
          stroke="none"
        />
        {/* 烟雾 */}
        {[0, 1, 2, 3].map((i) => (
          <ellipse
            key={i}
            cx={195 + i * 30}
            cy={125 + i * 4}
            rx={20 + i * 8}
            ry="8"
            fill="#334155"
            opacity={0.4 - i * 0.08}
          />
        ))}
        {/* 数据标注 */}
        <text x="80" y="40" fontSize="8" fill="#94a3b8">
          推力: 3000kN
        </text>
        <text x="80" y="52" fontSize="8" fill="#94a3b8">
          比冲: 350s
        </text>
        <text x="80" y="64" fontSize="8" fill="#94a3b8">
          燃料: 液氧甲烷
        </text>
        <text x="360" y="40" fontSize="8" fill="#94a3b8">
          可回收
        </text>
        <text x="360" y="52" fontSize="8" fill="#94a3b8">
          一级火箭
        </text>
        <W
          title="为什么商业火箭改变了航天经济？"
          line1="SpaceX猎鹰9可复用，单次发射成本降至$2800/kg，"
          line2="蓝箭朱雀3/星河动力追随可复用路线。"
          color="#f59e0b"
        />
      </>
    );
  }
  if (step === 1) {
    // 卫星入轨
    return (
      <>
        {/* 地球 */}
        <circle
          cx="240"
          cy="170"
          r="80"
          fill="#0f2037"
          stroke="#1e3a5f"
          strokeWidth="1.5"
        />
        <circle
          cx="240"
          cy="170"
          r="80"
          fill="none"
          stroke="#1e3a5f"
          strokeWidth="0.5"
          strokeDasharray="4 2"
        />
        {/* 大气层 */}
        <circle
          cx="240"
          cy="170"
          r="86"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1.5"
          opacity="0.3"
        />
        {/* 轨道弧线 */}
        <ellipse
          cx="240"
          cy="170"
          rx="120"
          ry="40"
          fill="none"
          stroke="#6366f1"
          strokeWidth="1.5"
          strokeDasharray="8 4"
          opacity="0.6"
        />
        {/* 卫星 */}
        <g
          transform={`translate(${120 + 120 * Math.cos(-Math.PI / 4)}, ${170 + 40 * Math.sin(-Math.PI / 4)})`}
        >
          <rect
            x="-12"
            y="-8"
            width="24"
            height="16"
            rx="3"
            fill="#1e293b"
            stroke="#818cf8"
            strokeWidth="1.5"
          />
          <rect
            x="-24"
            y="-4"
            width="10"
            height="8"
            rx="2"
            fill="#fbbf24"
            opacity={0.8 + 0.2 * pulse}
          />
          <rect
            x="14"
            y="-4"
            width="10"
            height="8"
            rx="2"
            fill="#fbbf24"
            opacity={0.8 + 0.2 * pulse}
          />
          <circle
            cx="0"
            cy="0"
            r="4"
            fill="#0f172a"
            stroke="#38bdf8"
            strokeWidth="1"
          />
        </g>
        {/* 信号线 */}
        <line
          x1="240"
          y1="90"
          x2="240"
          y2="130"
          stroke="#38bdf8"
          strokeWidth="1.5"
          strokeDasharray="5 3"
          opacity={0.5 + 0.5 * pulse}
        />
        {/* 轨道标注 */}
        <text x="60" y="90" fontSize="8" fill="#818cf8">
          LEO: 500km
        </text>
        <text x="60" y="102" fontSize="8" fill="#94a3b8">
          MEO: 2000km
        </text>
        <text x="60" y="114" fontSize="8" fill="#94a3b8">
          GEO: 36000km
        </text>
        <W
          title="低轨卫星(LEO)优势"
          line1="500km轨道，信号延迟仅20ms vs GEO 600ms，"
          line2="星链已部署6000+颗，国内千帆/GW星座加速。"
          color="#818cf8"
        />
      </>
    );
  }
  if (step === 2) {
    // 星座组网
    const sats = [
      { cx: 240, cy: 15 },
      { cx: 360, cy: 50 },
      { cx: 410, cy: 80 },
      { cx: 120, cy: 50 },
      { cx: 70, cy: 80 },
      { cx: 390, cy: 110 },
      { cx: 90, cy: 110 },
    ];
    return (
      <>
        {/* 地球 */}
        <circle
          cx="240"
          cy="90"
          r="50"
          fill="#0f2037"
          stroke="#1e3a5f"
          strokeWidth="1.5"
        />
        {/* 卫星 */}
        {sats.map((s, i) => (
          <g key={i}>
            <circle
              cx={s.cx}
              cy={s.cy}
              r="10"
              fill="#1e293b"
              stroke="#818cf8"
              strokeWidth="1.5"
              opacity={0.8 + 0.2 * pulse}
            />
            <rect
              x={s.cx - 14}
              y={s.cy - 3}
              width="6"
              height="6"
              rx="1"
              fill="#fbbf24"
              opacity={0.8 + 0.2 * pulse}
            />
            <rect
              x={s.cx + 8}
              y={s.cy - 3}
              width="6"
              height="6"
              rx="1"
              fill="#fbbf24"
              opacity={0.8 + 0.2 * pulse}
            />
          </g>
        ))}
        {/* 星间链路 */}
        {[
          [0, 1],
          [1, 2],
          [0, 3],
          [3, 4],
          [1, 5],
          [4, 6],
          [5, 2],
          [6, 3],
        ].map(([a, b], i) => (
          <line
            key={i}
            x1={sats[a].cx}
            y1={sats[a].cy}
            x2={sats[b].cx}
            y2={sats[b].cy}
            stroke="#38bdf8"
            strokeWidth="0.8"
            opacity={0.3 + 0.4 * pulse}
            strokeDasharray="4 3"
          />
        ))}
        {/* 地面站信号 */}
        <line
          x1="240"
          y1="40"
          x2="240"
          y2="86"
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeDasharray="5 3"
          opacity={0.6 + 0.4 * pulse}
        />
        <text
          x="240"
          y="155"
          textAnchor="middle"
          fontSize="9"
          fill="#818cf8"
          fontWeight="600"
        >
          全球覆盖率 &gt; 95%
        </text>
        <W
          title="星座组网实现全球无缝覆盖"
          line1="LEO卫星单颗覆盖半径约1000km，"
          line2="300颗可覆盖全球，1000颗可无缝连续覆盖。"
          color="#38bdf8"
        />
      </>
    );
  }
  // step 3: 卫星应用
  const apps = [
    {
      x: 80,
      y: 20,
      icon: "🌐",
      label: "宽带互联网",
      desc: "偏远地区/海洋/航空覆盖",
    },
    { x: 230, y: 20, icon: "🗺️", label: "遥感GIS", desc: "农业/灾害/城市规划" },
    {
      x: 370,
      y: 20,
      icon: "📍",
      label: "精密导航",
      desc: "厘米级定位，自动驾驶",
    },
    {
      x: 150,
      y: 80,
      icon: "📡",
      label: "军事通信",
      desc: "抗干扰加密卫星通信",
    },
    { x: 310, y: 80, icon: "🌤️", label: "气象监测", desc: "全球实时气象数据" },
  ];
  return (
    <>
      {apps.map((a) => (
        <g key={a.label}>
          <rect
            x={a.x}
            y={a.y}
            width="90"
            height="44"
            rx="8"
            fill="#1e293b"
            stroke="#6366f1"
            strokeWidth="1.5"
            opacity={0.85 + 0.15 * pulse}
          />
          <text x={a.x + 12} y={a.y + 17} fontSize="14">
            {a.icon}
          </text>
          <text
            x={a.x + 30}
            y={a.y + 16}
            fontSize="8.5"
            fill="#818cf8"
            fontWeight="700"
          >
            {a.label}
          </text>
          <text x={a.x + 8} y={a.y + 32} fontSize="7.5" fill="#94a3b8">
            {a.desc}
          </text>
        </g>
      ))}
      <text
        x="240"
        y="148"
        textAnchor="middle"
        fontSize="9"
        fill="#fbbf24"
        fontWeight="600"
      >
        2030年全球卫星经济规模预计超 $1万亿
      </text>
      <W
        title="商业航天的商业模式"
        line1="发射服务+卫星制造+数据服务三层价值链，"
        line2="遥感数据年市场规模已超 $100亿，高速增长。"
        color="#6366f1"
      />
    </>
  );
}

export function AerospaceAnimation({
  isLight,
  industryId,
}: {
  isLight: boolean;
  industryId: string;
}) {
  // as_overview / 旧 aerospace — 全景4步动画
  if (industryId === "as_overview" || industryId === "aerospace") {
    return (
      <IA
        isLight={isLight}
        title="商业航天产业链全流程"
        steps={AEROSPACE_STEPS}
        renderStep={(s) => <AerospaceStep step={s} />}
      />
    );
  }

  // as_rocket — 运载火箭/发动机
  if (industryId === "as_rocket") {
    return (
      <IA
        isLight={isLight}
        title="运载火箭/发动机供应链"
        steps={[
          { id: 0, label: "液体发动机" },
          { id: 1, label: "碳纤维箭体" },
          { id: 2, label: "飞控制导" },
          { id: 3, label: "可复用回收" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 600) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                {/* 燃烧室 */}
                <ellipse
                  cx="240"
                  cy="55"
                  rx="40"
                  ry="28"
                  fill="#1e293b"
                  stroke="#ef4444"
                  strokeWidth="2"
                />
                <ellipse
                  cx="240"
                  cy="55"
                  rx="28"
                  ry="18"
                  fill="#0f172a"
                  stroke="#f97316"
                  strokeWidth="1.5"
                  opacity={0.8 + 0.2 * pulse}
                />
                <text
                  x="240"
                  y="59"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#fb923c"
                  fontWeight="600"
                >
                  燃烧室
                </text>
                {/* 涡轮泵 */}
                <rect
                  x="100"
                  y="38"
                  width="70"
                  height="36"
                  rx="8"
                  fill="#1e3a5f"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                />
                <text
                  x="135"
                  y="59"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#38bdf8"
                >
                  涡轮泵
                </text>
                {/* 喷嘴 */}
                <path
                  d="M200,83 L185,120 L295,120 L280,83"
                  fill="#1e293b"
                  stroke="#f97316"
                  strokeWidth="1.5"
                />
                <path
                  d={`M220,120 Q240,${135 + 10 * pulse},260,120`}
                  fill={`rgba(251,146,60,${0.5 + 0.4 * pulse})`}
                />
                {/* 连线 */}
                <line
                  x1="170"
                  y1="56"
                  x2="200"
                  y2="56"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  opacity={0.7 + 0.3 * pulse}
                  strokeDasharray="4 2"
                />
                <text
                  x="240"
                  y="145"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#94a3b8"
                >
                  液氧甲烷发动机：推力120吨，比冲363s
                </text>
                <W
                  title="为什么用液氧甲烷？"
                  line1="甲烷密度高、积碳少，可反复点火，"
                  line2="是可复用火箭发动机首选燃料，SpaceX猛禽同款。"
                  color="#f97316"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                {/* 碳纤维网格壁 */}
                {[0, 1, 2, 3, 4].map((i) => (
                  <line
                    key={`h${i}`}
                    x1="100"
                    y1={30 + i * 20}
                    x2="380"
                    y2={30 + i * 20}
                    stroke="#6366f1"
                    strokeWidth="0.8"
                    opacity="0.5"
                  />
                ))}
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <line
                    key={`v${i}`}
                    x1={100 + i * 40}
                    y1="30"
                    x2={100 + i * 40}
                    y2="110"
                    stroke="#818cf8"
                    strokeWidth="0.8"
                    opacity="0.5"
                  />
                ))}
                <rect
                  x="100"
                  y="30"
                  width="280"
                  height="80"
                  rx="4"
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2"
                />
                <text
                  x="240"
                  y="75"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#818cf8"
                  fontWeight="600"
                >
                  碳纤维网格壁箭体结构
                </text>
                <text
                  x="240"
                  y="88"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#475569"
                >
                  密度1.7g/cm³，比铝轻40%
                </text>
                <rect
                  x="130"
                  y="118"
                  width="80"
                  height="18"
                  rx="4"
                  fill="#1e293b"
                  stroke="#300699"
                  strokeWidth="1.5"
                />
                <text
                  x="170"
                  y="130"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#a5b4fc"
                >
                  光威复材 T800
                </text>
                <rect
                  x="270"
                  y="118"
                  width="80"
                  height="18"
                  rx="4"
                  fill="#1e293b"
                  stroke="#818cf8"
                  strokeWidth="1.5"
                />
                <text
                  x="310"
                  y="130"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#a5b4fc"
                >
                  中简科技 ZT7
                </text>
                <W
                  title="碳纤维箭体是国产化关键"
                  line1="光威复材/中简科技已实现T800级量产，"
                  line2="碳纤维用量：单枚火箭约1-3吨，千箭需求万吨级。"
                  color="#818cf8"
                />
              </>
            );
          if (s === 2)
            return (
              <>
                {[
                  {
                    x: 80,
                    y: 20,
                    label: "陀螺仪/IMU",
                    desc: "姿态感知 0.001°/h",
                    c: "#38bdf8",
                  },
                  {
                    x: 280,
                    y: 20,
                    label: "星敏感器",
                    desc: "高精度姿态基准",
                    c: "#818cf8",
                  },
                  {
                    x: 80,
                    y: 90,
                    label: "箭载计算机",
                    desc: "制导律解算 μs级",
                    c: "#f59e0b",
                  },
                  {
                    x: 280,
                    y: 90,
                    label: "TVC矢量控制",
                    desc: "发动机摆动±8°",
                    c: "#10b981",
                  },
                ].map((nd) => (
                  <g key={nd.label}>
                    <rect
                      x={nd.x}
                      y={nd.y}
                      width="160"
                      height="55"
                      rx="8"
                      fill="#1e293b"
                      stroke={nd.c}
                      strokeWidth="1.5"
                      opacity={0.8 + 0.2 * pulse}
                    />
                    <text
                      x={nd.x + 80}
                      y={nd.y + 20}
                      textAnchor="middle"
                      fontSize="9"
                      fill={nd.c}
                      fontWeight="700"
                    >
                      {nd.label}
                    </text>
                    <text
                      x={nd.x + 80}
                      y={nd.y + 36}
                      textAnchor="middle"
                      fontSize="7.5"
                      fill="#64748b"
                    >
                      {nd.desc}
                    </text>
                  </g>
                ))}
                <W
                  title="飞控制导是火箭入轨关键"
                  line1="航天电子提供全套飞控计算机和制导系统，"
                  line2="三轴稳定控制精度决定卫星入轨精度。"
                  color="#f59e0b"
                />
              </>
            );
          return (
            <>
              {/* 火箭下降 */}
              <rect
                x="215"
                y={15 + 10 * (1 - pulse)}
                width="50"
                height="80"
                rx="6"
                fill="#1e293b"
                stroke="#f59e0b"
                strokeWidth="2"
              />
              <path
                d={`M215,95 L200,120 L280,120 L265,95`}
                fill="#1e293b"
                stroke="#ef4444"
                strokeWidth="1.5"
              />
              <path
                d={`M228,120 Q240,${130 + 5 * pulse},252,120`}
                fill={`rgba(251,146,60,${0.4 + 0.5 * pulse})`}
              />
              {/* 着陆腿 */}
              {[-1, 1].map((side) => (
                <line
                  key={side}
                  x1={240 + side * 17}
                  y1="115"
                  x2={240 + side * 35}
                  y2="130"
                  stroke="#64748b"
                  strokeWidth="2"
                />
              ))}
              <rect
                x="205"
                y="130"
                width="70"
                height="6"
                rx="2"
                fill="#334155"
              />
              <text
                x="240"
                y="148"
                textAnchor="middle"
                fontSize="9"
                fill="#f59e0b"
                fontWeight="600"
              >
                一子级垂直回收着陆
              </text>
              <W
                title="可复用将发射成本降至$1000/kg"
                line1="SpaceX猎鹰9复用100次以上，成本降低90%，"
                line2="蓝箭朱雀3/星河动力均在研制可复用版本。"
                color="#f59e0b"
              />
            </>
          );
        }}
      />
    );
  }

  // as_satellite — 卫星平台/制造
  if (industryId === "as_satellite") {
    return (
      <IA
        isLight={isLight}
        title="卫星平台/制造供应链"
        steps={[
          { id: 0, label: "卫星结构热控" },
          { id: 1, label: "姿轨控系统" },
          { id: 2, label: "供配电系统" },
          { id: 3, label: "批量制造" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 600) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                {/* 卫星蜂窝板 */}
                {[0, 1, 2].map((row) =>
                  [0, 1, 2, 3].map((col) => (
                    <g key={`${row}-${col}`}>
                      <polygon
                        points={`${120 + col * 60 + (row % 2) * 30},${25 + row * 30} ${120 + col * 60 + (row % 2) * 30 + 25},${25 + row * 30} ${120 + col * 60 + (row % 2) * 30 + 35},${40 + row * 30} ${120 + col * 60 + (row % 2) * 30 + 25},${55 + row * 30} ${120 + col * 60 + (row % 2) * 30},${55 + row * 30} ${120 + col * 60 + (row % 2) * 30 - 10},${40 + row * 30}`}
                        fill="#1e293b"
                        stroke="#6366f1"
                        strokeWidth="0.8"
                        opacity="0.85"
                      />
                    </g>
                  )),
                )}
                <text
                  x="240"
                  y="118"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#818cf8"
                  fontWeight="600"
                >
                  铝蜂窝夹层结构：重量轻/刚性强
                </text>
                <text
                  x="240"
                  y="131"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#94a3b8"
                >
                  热管散热：等温化，ΔT &lt; 5°C
                </text>
                <W
                  title="为什么用蜂窝板？"
                  line1="铝蜂窝夹层比实心铝轻60%，刚性相当，"
                  line2="热管将热量均匀传导到散热面，维持器件温度。"
                  color="#6366f1"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                {[
                  {
                    x: 80,
                    y: 20,
                    label: "星敏感器",
                    desc: "姿态精度0.001°",
                    c: "#38bdf8",
                  },
                  {
                    x: 280,
                    y: 20,
                    label: "陀螺仪",
                    desc: "角速度测量",
                    c: "#818cf8",
                  },
                  {
                    x: 80,
                    y: 90,
                    label: "磁力矩器",
                    desc: "低轨道卸载角动量",
                    c: "#10b981",
                  },
                  {
                    x: 280,
                    y: 90,
                    label: "推进器",
                    desc: "轨道维持/变轨",
                    c: "#f59e0b",
                  },
                ].map((nd) => (
                  <g key={nd.label}>
                    <rect
                      x={nd.x}
                      y={nd.y}
                      width="160"
                      height="55"
                      rx="8"
                      fill="#1e293b"
                      stroke={nd.c}
                      strokeWidth="1.5"
                      opacity={0.8 + 0.2 * pulse}
                    />
                    <text
                      x={nd.x + 80}
                      y={nd.y + 20}
                      textAnchor="middle"
                      fontSize="9"
                      fill={nd.c}
                      fontWeight="700"
                    >
                      {nd.label}
                    </text>
                    <text
                      x={nd.x + 80}
                      y={nd.y + 36}
                      textAnchor="middle"
                      fontSize="7.5"
                      fill="#64748b"
                    >
                      {nd.desc}
                    </text>
                  </g>
                ))}
                <W
                  title="姿轨控是卫星精准指向的核心"
                  line1="三轴稳定精度决定遥感分辨率和通信天线指向，"
                  line2="航天电子提供全套姿轨控分系统。"
                  color="#38bdf8"
                />
              </>
            );
          if (s === 2)
            return (
              <>
                {/* 太阳帆板 */}
                <rect
                  x="80"
                  y="60"
                  width="120"
                  height="50"
                  rx="4"
                  fill="#1e3a5f"
                  stroke="#fbbf24"
                  strokeWidth="1.5"
                />
                <rect
                  x="280"
                  y="60"
                  width="120"
                  height="50"
                  rx="4"
                  fill="#1e3a5f"
                  stroke="#fbbf24"
                  strokeWidth="1.5"
                />
                {[0, 1, 2, 3, 4].map((i) => (
                  <line
                    key={i}
                    x1={85 + i * 22}
                    y1="62"
                    x2={85 + i * 22}
                    y2="108"
                    stroke="#fbbf24"
                    strokeWidth="0.8"
                    opacity="0.6"
                  />
                ))}
                {[0, 1, 2, 3, 4].map((i) => (
                  <line
                    key={i}
                    x1={285 + i * 22}
                    y1="62"
                    x2={285 + i * 22}
                    y2="108"
                    stroke="#fbbf24"
                    strokeWidth="0.8"
                    opacity="0.6"
                  />
                ))}
                <rect
                  x="200"
                  y="70"
                  width="80"
                  height="36"
                  rx="6"
                  fill="#0f172a"
                  stroke="#6366f1"
                  strokeWidth="2"
                />
                <text
                  x="240"
                  y="91"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#818cf8"
                >
                  PCDU
                </text>
                <line
                  x1="200"
                  y1="85"
                  x2="130"
                  y2="85"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  opacity={0.7 + 0.3 * pulse}
                />
                <line
                  x1="280"
                  y1="85"
                  x2="350"
                  y2="85"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  opacity={0.7 + 0.3 * pulse}
                />
                <text
                  x="240"
                  y="128"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#94a3b8"
                >
                  砷化镓太阳能电池效率28%，锂电池储能
                </text>
                <W
                  title="供配电是卫星寿命关键"
                  line1="GaAs太阳电池28%效率，远优于硅电池，"
                  line2="振华科技/中国卫星提供航天级供配电系统。"
                  color="#fbbf24"
                />
              </>
            );
          return (
            <>
              {/* 批量卫星制造流水线 */}
              {[0, 1, 2, 3].map((i) => (
                <g key={i}>
                  <rect
                    x={60 + i * 100}
                    y={30 + (i % 2) * 20}
                    width="70"
                    height="50"
                    rx="6"
                    fill="#1e293b"
                    stroke={["#6366f1", "#f59e0b", "#10b981", "#38bdf8"][i]}
                    strokeWidth="1.5"
                    opacity={0.8 + 0.2 * pulse}
                  />
                  <rect
                    x={60 + i * 100 - 20}
                    y={48 + (i % 2) * 20}
                    width="10"
                    height="14"
                    rx="2"
                    fill="#fbbf24"
                    opacity={0.7 + 0.2 * pulse}
                  />
                  <rect
                    x={60 + i * 100 + 70}
                    y={48 + (i % 2) * 20}
                    width="10"
                    height="14"
                    rx="2"
                    fill="#fbbf24"
                    opacity={0.7 + 0.2 * pulse}
                  />
                  <text
                    x={60 + i * 100 + 35}
                    y={58 + (i % 2) * 20}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#94a3b8"
                  >
                    SAT-{i + 1}
                  </text>
                </g>
              ))}
              <text
                x="240"
                y="115"
                textAnchor="middle"
                fontSize="9"
                fill="#818cf8"
                fontWeight="600"
              >
                批量制造：单颗成本从1亿降至百万
              </text>
              <W
                title="低轨星座推动卫星量产革命"
                line1="G60星链计划1.2万颗，中国卫星正扩产能，"
                line2="流水线制造将卫星从定制品变成工业品。"
                color="#818cf8"
              />
            </>
          );
        }}
      />
    );
  }

  // as_payload — 有效载荷
  if (industryId === "as_payload") {
    return (
      <IA
        isLight={isLight}
        title="有效载荷供应链"
        steps={[
          { id: 0, label: "行波管放大器" },
          { id: 1, label: "相控阵天线" },
          { id: 2, label: "SAR雷达载荷" },
          { id: 3, label: "光学遥感载荷" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 600) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                {/* TWT结构 */}
                <rect
                  x="80"
                  y="55"
                  width="320"
                  height="40"
                  rx="4"
                  fill="#0f172a"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                />
                <ellipse
                  cx="100"
                  cy="75"
                  rx="15"
                  ry="12"
                  fill="#1e3a5f"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                />
                <text
                  x="100"
                  y="79"
                  textAnchor="middle"
                  fontSize="7"
                  fill="#38bdf8"
                >
                  阴极
                </text>
                <line
                  x1="115"
                  y1="75"
                  x2="365"
                  y2="75"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  opacity={0.6 + 0.4 * pulse}
                  strokeDasharray="6 3"
                />
                <ellipse
                  cx="380"
                  cy="75"
                  rx="15"
                  ry="12"
                  fill="#1e293b"
                  stroke="#10b981"
                  strokeWidth="1.5"
                />
                <text
                  x="380"
                  y="79"
                  textAnchor="middle"
                  fontSize="7"
                  fill="#10b981"
                >
                  收集极
                </text>
                {[0, 1, 2, 3].map((i) => (
                  <path
                    key={i}
                    d={`M${160 + i * 50},65 Q${185 + i * 50},${70 + 6 * Math.sin(t + i)},${210 + i * 50},65`}
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="1"
                    opacity="0.6"
                  />
                ))}
                <text
                  x="240"
                  y="115"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#f59e0b"
                >
                  行波管：输出功率200W，增益50dB
                </text>
                <W
                  title="行波管是卫星通信功率核心"
                  line1="TWT将弱信号放大10万倍，是GEO通信卫星必备，"
                  line2="国光电气是国内唯一规模化生产行波管的A股公司。"
                  color="#f59e0b"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                {/* 相控阵阵面 */}
                {[0, 1, 2, 3, 4].map((row) =>
                  [0, 1, 2, 3, 4, 5].map((col) => (
                    <rect
                      key={`${row}-${col}`}
                      x={115 + col * 42}
                      y={25 + row * 18}
                      width="35"
                      height="14"
                      rx="2"
                      fill="#1e3a5f"
                      stroke="#38bdf8"
                      strokeWidth="0.8"
                      opacity={0.7 + 0.3 * Math.sin(t + row + col)}
                    />
                  )),
                )}
                {/* 波束 */}
                <path
                  d={`M115,115 L${200 + 30 * Math.sin(t)},140 L${280 - 30 * Math.sin(t)},140 L365,115`}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="1.5"
                  opacity={0.5 + 0.4 * pulse}
                />
                <text
                  x="240"
                  y="155"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#38bdf8"
                  fontWeight="600"
                >
                  T/R组件阵列：波束扫描 ±60°
                </text>
                <W
                  title="相控阵实现灵活波束管理"
                  line1="无机械转动，电扫描速度微秒级，"
                  line2="铖昌科技T/R组件已进入卫星批量供货。"
                  color="#38bdf8"
                />
              </>
            );
          if (s === 2)
            return (
              <>
                {/* SAR成像示意 */}
                <rect
                  x="200"
                  y="10"
                  width="80"
                  height="30"
                  rx="4"
                  fill="#1e293b"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                />
                <text
                  x="240"
                  y="29"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#f59e0b"
                >
                  SAR卫星
                </text>
                {[0, 1, 2, 3].map((i) => (
                  <line
                    key={i}
                    x1={200 - i * 20}
                    y1={45 + i * 15}
                    x2={280 + i * 20}
                    y2={45 + i * 15}
                    stroke="#818cf8"
                    strokeWidth="0.8"
                    opacity={0.4 + 0.5 * pulse}
                    strokeDasharray="8 4"
                  />
                ))}
                <rect
                  x="80"
                  y="100"
                  width="320"
                  height="30"
                  rx="4"
                  fill="#14532d"
                  stroke="#166534"
                  strokeWidth="1.5"
                />
                <text
                  x="240"
                  y="119"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#6ee7b7"
                >
                  地面目标：1m分辨率，全天时成像
                </text>
                <W
                  title="SAR是全天候遥感唯一选择"
                  line1="光学遥感受云雨天气限制，SAR微波穿透云层，"
                  line2="四创电子/航天环宇提供SAR核心射频组件。"
                  color="#818cf8"
                />
              </>
            );
          return (
            <>
              {/* 光学系统 */}
              <ellipse
                cx="240"
                cy="40"
                rx="50"
                ry="20"
                fill="#0f172a"
                stroke="#22d3ee"
                strokeWidth="2"
              />
              <ellipse
                cx="240"
                cy="40"
                rx="30"
                ry="12"
                fill="#1e293b"
                stroke="#38bdf8"
                strokeWidth="1.5"
              />
              <ellipse
                cx="240"
                cy="40"
                rx="15"
                ry="6"
                fill="#0e7490"
                opacity={0.6 + 0.4 * pulse}
              />
              <line
                x1="190"
                y1="60"
                x2="160"
                y2="120"
                stroke="#22d3ee"
                strokeWidth="1"
                opacity={0.5 + 0.4 * pulse}
                strokeDasharray="4 2"
              />
              <line
                x1="290"
                y1="60"
                x2="320"
                y2="120"
                stroke="#22d3ee"
                strokeWidth="1"
                opacity={0.5 + 0.4 * pulse}
                strokeDasharray="4 2"
              />
              <rect
                x="160"
                y="120"
                width="160"
                height="16"
                rx="4"
                fill="#1e3a5f"
                stroke="#2563eb"
                strokeWidth="1.5"
              />
              <text
                x="240"
                y="131"
                textAnchor="middle"
                fontSize="7.5"
                fill="#93c5fd"
              >
                焦平面探测器 TDI-CCD
              </text>
              <text
                x="240"
                y="155"
                textAnchor="middle"
                fontSize="9"
                fill="#22d3ee"
                fontWeight="600"
              >
                0.5m分辨率，幅宽15km
              </text>
              <W
                title="光学遥感分辨率决定应用价值"
                line1="航天环宇提供遥感相机光学骨架/精密结构，"
                line2="0.5m分辨率可清晰识别车辆，军/民用需求旺盛。"
                color="#22d3ee"
              />
            </>
          );
        }}
      />
    );
  }

  // as_satcom — 卫星通信
  if (industryId === "as_satcom") {
    return (
      <IA
        isLight={isLight}
        title="卫星通信系统"
        steps={[
          { id: 0, label: "GEO高通量" },
          { id: 1, label: "LEO星座" },
          { id: 2, label: "VSAT终端" },
          { id: 3, label: "NTN手机直连" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 600) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                {/* GEO卫星 */}
                <circle
                  cx="240"
                  cy="35"
                  r="20"
                  fill="#1e293b"
                  stroke="#818cf8"
                  strokeWidth="2"
                />
                <rect
                  x="220"
                  y="30"
                  width="14"
                  height="10"
                  rx="2"
                  fill="#fbbf24"
                  opacity={0.8 + 0.2 * pulse}
                />
                <rect
                  x="246"
                  y="30"
                  width="14"
                  height="10"
                  rx="2"
                  fill="#fbbf24"
                  opacity={0.8 + 0.2 * pulse}
                />
                <text
                  x="240"
                  y="39"
                  textAnchor="middle"
                  fontSize="7"
                  fill="#818cf8"
                >
                  GEO
                </text>
                {/* 波束 */}
                {[0, 1, 2].map((i) => (
                  <path
                    key={i}
                    d={`M${200 + i * 20},55 L${120 + i * 60},110`}
                    stroke="#6366f1"
                    strokeWidth="1.5"
                    opacity={0.5 + 0.4 * pulse}
                    strokeDasharray="5 3"
                  />
                ))}
                <rect
                  x="80"
                  y="110"
                  width="320"
                  height="16"
                  rx="3"
                  fill="#14532d"
                  stroke="#166534"
                  strokeWidth="1"
                />
                <text
                  x="240"
                  y="121"
                  textAnchor="middle"
                  fontSize="7.5"
                  fill="#6ee7b7"
                >
                  地面用户：100Mbps/波束，总容量100Gbps
                </text>
                <W
                  title="GEO高通量卫星覆盖全国"
                  line1="中国卫通亚太6D容量100Gbps，"
                  line2={'覆盖全国及"一带一路"海域和航线。'}
                  color="#818cf8"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                <circle
                  cx="240"
                  cy="120"
                  r="55"
                  fill="#0f2037"
                  stroke="#1e3a5f"
                  strokeWidth="1.5"
                />
                {[0, 1, 2, 3, 4, 5].map((i) => {
                  const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
                  const cx = 240 + 95 * Math.cos(angle);
                  const cy = 120 + 50 * Math.sin(angle);
                  return (
                    <g key={i}>
                      <rect
                        x={cx - 12}
                        y={cy - 6}
                        width="24"
                        height="12"
                        rx="3"
                        fill="#1e293b"
                        stroke="#22d3ee"
                        strokeWidth="1"
                      />
                      <text
                        x={cx}
                        y={cy + 4}
                        textAnchor="middle"
                        fontSize="6.5"
                        fill="#22d3ee"
                      >
                        LEO
                      </text>
                      <line
                        x1={240 + 40 * Math.cos(angle)}
                        y1={120 + 21 * Math.sin(angle)}
                        x2={cx - 12 * Math.cos(angle)}
                        y2={cy - 6 * Math.sin(angle)}
                        stroke="#6366f1"
                        strokeWidth="1"
                        opacity={0.4 + 0.4 * pulse}
                      />
                    </g>
                  );
                })}
                <text
                  x="240"
                  y="25"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#22d3ee"
                  fontWeight="600"
                >
                  LEO低轨星座：延迟20ms
                </text>
                <W
                  title="LEO星座实现全球无缝宽带"
                  line1="高度500-1200km，延迟仅20ms（GEO为600ms），"
                  line2="中国G60/GW星座规划超1.2万颗。"
                  color="#22d3ee"
                />
              </>
            );
          if (s === 2)
            return (
              <>
                {[
                  {
                    x: 80,
                    y: 20,
                    label: "海事VSAT",
                    desc: "船舶宽带/AIS集成",
                    c: "#38bdf8",
                  },
                  {
                    x: 280,
                    y: 20,
                    label: "航空宽带",
                    desc: "机载Ka波段终端",
                    c: "#818cf8",
                  },
                  {
                    x: 80,
                    y: 90,
                    label: "车载终端",
                    desc: "应急通信/远程控制",
                    c: "#10b981",
                  },
                  {
                    x: 280,
                    y: 90,
                    label: "便携终端",
                    desc: "野外/应急，15kg",
                    c: "#f59e0b",
                  },
                ].map((nd) => (
                  <g key={nd.label}>
                    <rect
                      x={nd.x}
                      y={nd.y}
                      width="160"
                      height="55"
                      rx="8"
                      fill="#1e293b"
                      stroke={nd.c}
                      strokeWidth="1.5"
                      opacity={0.8 + 0.2 * pulse}
                    />
                    <text
                      x={nd.x + 80}
                      y={nd.y + 20}
                      textAnchor="middle"
                      fontSize="9"
                      fill={nd.c}
                      fontWeight="700"
                    >
                      {nd.label}
                    </text>
                    <text
                      x={nd.x + 80}
                      y={nd.y + 36}
                      textAnchor="middle"
                      fontSize="7.5"
                      fill="#64748b"
                    >
                      {nd.desc}
                    </text>
                  </g>
                ))}
                <W
                  title="盟升电子深耕VSAT终端市场"
                  line1="海格通信/盟升电子已覆盖海事/航空/车载全品类，"
                  line2="VSAT终端市场规模年均增速15%+。"
                  color="#38bdf8"
                />
              </>
            );
          return (
            <>
              <rect
                x="160"
                y="25"
                width="160"
                height="60"
                rx="8"
                fill="#1e293b"
                stroke="#f59e0b"
                strokeWidth="2"
              />
              <text
                x="240"
                y="50"
                textAnchor="middle"
                fontSize="9"
                fill="#fbbf24"
                fontWeight="700"
              >
                3GPP NTN
              </text>
              <text
                x="240"
                y="65"
                textAnchor="middle"
                fontSize="8"
                fill="#94a3b8"
              >
                非地面网络直连手机
              </text>
              <circle
                cx="130"
                cy="100"
                r="20"
                fill="#1e3a5f"
                stroke="#6366f1"
                strokeWidth="1.5"
              />
              <text
                x="130"
                y="104"
                textAnchor="middle"
                fontSize="8"
                fill="#818cf8"
              >
                手机
              </text>
              <circle
                cx="350"
                cy="100"
                r="20"
                fill="#1e3a5f"
                stroke="#6366f1"
                strokeWidth="1.5"
              />
              <text
                x="350"
                y="104"
                textAnchor="middle"
                fontSize="8"
                fill="#818cf8"
              >
                手机
              </text>
              <line
                x1="150"
                y1="95"
                x2="160"
                y2="65"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="5 3"
                opacity={0.7 + 0.3 * pulse}
              />
              <line
                x1="330"
                y1="95"
                x2="320"
                y2="65"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="5 3"
                opacity={0.7 + 0.3 * pulse}
              />
              <text
                x="240"
                y="145"
                textAnchor="middle"
                fontSize="9"
                fill="#f59e0b"
                fontWeight="600"
              >
                无需地面基站，偏远地区直接接入
              </text>
              <W
                title="NTN重新定义移动通信边界"
                line1="3GPP R17标准支持NTN，华为/中兴已支持，"
                line2="七一二/普天科技布局NTN核心设备。"
                color="#f59e0b"
              />
            </>
          );
        }}
      />
    );
  }

  // as_satnav — 卫星导航/北斗
  if (industryId === "as_satnav") {
    return (
      <IA
        isLight={isLight}
        title="北斗卫星导航系统"
        steps={[
          { id: 0, label: "北斗三号组网" },
          { id: 1, label: "北斗芯片模组" },
          { id: 2, label: "RTK高精定位" },
          { id: 3, label: "行业应用" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 600) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                <circle
                  cx="240"
                  cy="90"
                  r="50"
                  fill="#0f2037"
                  stroke="#1e3a5f"
                  strokeWidth="1.5"
                />
                {/* MEO轨道 */}
                <ellipse
                  cx="240"
                  cy="90"
                  rx="130"
                  ry="55"
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="1"
                  strokeDasharray="6 3"
                  opacity="0.5"
                />
                {/* IGSO轨道 */}
                <ellipse
                  cx="240"
                  cy="90"
                  rx="100"
                  ry="100"
                  fill="none"
                  stroke="#818cf8"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  opacity="0.4"
                />
                {[0, 1, 2, 3, 4, 5].map((i) => {
                  const angle = (i / 6) * Math.PI * 2;
                  const cx = 240 + 120 * Math.cos(angle);
                  const cy = 90 + 48 * Math.sin(angle);
                  return (
                    <g key={i}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r="8"
                        fill="#1e293b"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        opacity={0.8 + 0.2 * pulse}
                      />
                      <rect
                        x={cx - 10}
                        y={cy - 3}
                        width="5"
                        height="6"
                        rx="1"
                        fill="#fbbf24"
                        opacity="0.8"
                      />
                      <rect
                        x={cx + 5}
                        y={cy - 3}
                        width="5"
                        height="6"
                        rx="1"
                        fill="#fbbf24"
                        opacity="0.8"
                      />
                    </g>
                  );
                })}
                <text
                  x="240"
                  y="25"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#f59e0b"
                  fontWeight="600"
                >
                  北斗三号：35颗卫星全球覆盖
                </text>
                <W
                  title="北斗三号已完全替代GPS"
                  line1="2020年全球组网完成，30+MEO+3GEO+3IGSO，"
                  line2="全球定位精度2.5m，亚太地区1.5m。"
                  color="#f59e0b"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                {[
                  {
                    x: 80,
                    y: 20,
                    label: "北斗基带芯片",
                    desc: "多系统/多频点解算",
                    c: "#38bdf8",
                  },
                  {
                    x: 280,
                    y: 20,
                    label: "射频前端芯片",
                    desc: "低噪声多频接收",
                    c: "#818cf8",
                  },
                  {
                    x: 80,
                    y: 90,
                    label: "GNSS模组",
                    desc: "北斗GPS双系统",
                    c: "#10b981",
                  },
                  {
                    x: 280,
                    y: 90,
                    label: "高精度板卡",
                    desc: "RTK 1cm精度",
                    c: "#f59e0b",
                  },
                ].map((nd) => (
                  <g key={nd.label}>
                    <rect
                      x={nd.x}
                      y={nd.y}
                      width="160"
                      height="55"
                      rx="8"
                      fill="#1e293b"
                      stroke={nd.c}
                      strokeWidth="1.5"
                      opacity={0.8 + 0.2 * pulse}
                    />
                    <text
                      x={nd.x + 80}
                      y={nd.y + 20}
                      textAnchor="middle"
                      fontSize="9"
                      fill={nd.c}
                      fontWeight="700"
                    >
                      {nd.label}
                    </text>
                    <text
                      x={nd.x + 80}
                      y={nd.y + 36}
                      textAnchor="middle"
                      fontSize="7.5"
                      fill="#64748b"
                    >
                      {nd.desc}
                    </text>
                  </g>
                ))}
                <W
                  title="北斗星通是国内北斗芯片龙头"
                  line1="北斗芯片年销售已超1亿颗，手机/车载普及，"
                  line2="铖昌科技/北斗星通布局高性能GNSS芯片。"
                  color="#38bdf8"
                />
              </>
            );
          if (s === 2)
            return (
              <>
                {/* RTK基站+流动站 */}
                <rect
                  x="100"
                  y="40"
                  width="60"
                  height="60"
                  rx="6"
                  fill="#1e3a5f"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                />
                <text
                  x="130"
                  y="74"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#38bdf8"
                >
                  CORS基站
                </text>
                <rect
                  x="320"
                  y="50"
                  width="60"
                  height="50"
                  rx="6"
                  fill="#1e293b"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                />
                <text
                  x="350"
                  y="79"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#f59e0b"
                >
                  RTK流动站
                </text>
                {/* 差分信号 */}
                <line
                  x1="160"
                  y1="70"
                  x2="320"
                  y2="70"
                  stroke="#10b981"
                  strokeWidth="1.5"
                  strokeDasharray="6 3"
                  opacity={0.6 + 0.4 * pulse}
                />
                <text
                  x="240"
                  y="65"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#10b981"
                >
                  差分改正数
                </text>
                {/* 精度标注 */}
                <text
                  x="240"
                  y="115"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#fbbf24"
                  fontWeight="600"
                >
                  RTK定位精度：水平±1cm，垂直±2cm
                </text>
                <W
                  title="RTK是精准农业/测绘的基础"
                  line1="华测导航/中海达年销RTK设备超10万套，"
                  line2="精准农机自动驾驶偏差&lt;2.5cm，覆盖5000万亩。"
                  color="#f59e0b"
                />
              </>
            );
          return (
            <>
              {[
                {
                  x: 80,
                  y: 20,
                  icon: "🚗",
                  label: "自动驾驶",
                  desc: "L3+定位，高精地图",
                },
                {
                  x: 230,
                  y: 20,
                  icon: "🌾",
                  label: "精准农业",
                  desc: "农机自驾，植保无人机",
                },
                {
                  x: 370,
                  y: 20,
                  icon: "🚢",
                  label: "海事导航",
                  desc: "船舶AIS+GNSS融合",
                },
                {
                  x: 150,
                  y: 85,
                  icon: "📐",
                  label: "测量测绘",
                  desc: "RTK+无人机倾斜摄影",
                },
                {
                  x: 300,
                  y: 85,
                  icon: "🏗️",
                  label: "工程建设",
                  desc: "桩基定位/变形监测",
                },
              ].map((a) => (
                <g key={a.label}>
                  <rect
                    x={a.x}
                    y={a.y}
                    width="100"
                    height="50"
                    rx="8"
                    fill="#1e293b"
                    stroke="#6366f1"
                    strokeWidth="1.5"
                    opacity={0.85 + 0.15 * pulse}
                  />
                  <text x={a.x + 12} y={a.y + 18} fontSize="13">
                    {a.icon}
                  </text>
                  <text
                    x={a.x + 30}
                    y={a.y + 17}
                    fontSize="8.5"
                    fill="#818cf8"
                    fontWeight="700"
                  >
                    {a.label}
                  </text>
                  <text x={a.x + 8} y={a.y + 34} fontSize="7.5" fill="#94a3b8">
                    {a.desc}
                  </text>
                </g>
              ))}
              <text
                x="240"
                y="155"
                textAnchor="middle"
                fontSize="9"
                fill="#fbbf24"
                fontWeight="600"
              >
                北斗行业应用市场规模超5000亿元
              </text>
              <W
                title="北斗是数字中国的时空基础"
                line1="北斗时间基准授时精度10ns，"
                line2="全国交通/电力/金融均已接入北斗授时网络。"
                color="#6366f1"
              />
            </>
          );
        }}
      />
    );
  }

  // as_remote — 遥感/对地观测
  if (industryId === "as_remote") {
    return (
      <IA
        isLight={isLight}
        title="遥感/对地观测系统"
        steps={[
          { id: 0, label: "卫星遥感成像" },
          { id: 1, label: "AI智能解译" },
          { id: 2, label: "时空大数据" },
          { id: 3, label: "行业应用" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 600) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                {/* 卫星 */}
                <rect
                  x="200"
                  y="10"
                  width="80"
                  height="30"
                  rx="6"
                  fill="#1e293b"
                  stroke="#818cf8"
                  strokeWidth="2"
                />
                <rect
                  x="182"
                  y="18"
                  width="16"
                  height="14"
                  rx="3"
                  fill="#fbbf24"
                  opacity={0.8 + 0.2 * pulse}
                />
                <rect
                  x="282"
                  y="18"
                  width="16"
                  height="14"
                  rx="3"
                  fill="#fbbf24"
                  opacity={0.8 + 0.2 * pulse}
                />
                <text
                  x="240"
                  y="29"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#818cf8"
                >
                  光学遥感卫星
                </text>
                {/* 扫描线 */}
                {[0, 1, 2].map((i) => (
                  <line
                    key={i}
                    x1={195 - i * 20}
                    y1={45 + i * 15}
                    x2={285 + i * 20}
                    y2={45 + i * 15}
                    stroke="#22d3ee"
                    strokeWidth={1 - i * 0.2}
                    opacity={0.5 + 0.4 * pulse}
                    strokeDasharray="8 4"
                  />
                ))}
                {/* 地面 */}
                <rect
                  x="80"
                  y="100"
                  width="320"
                  height="28"
                  rx="4"
                  fill="#14532d"
                  stroke="#166534"
                  strokeWidth="1.5"
                />
                <text
                  x="240"
                  y="118"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#6ee7b7"
                >
                  0.5m分辨率，幅宽 15km，重访 &lt;1天
                </text>
                <W
                  title="遥感卫星是地球感知的眼睛"
                  line1="航天环宇提供卫星精密结构，中国卫星运营遥感星座，"
                  line2="分辨率每提升2倍，应用场景增加10倍。"
                  color="#22d3ee"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                {/* 原始图像 */}
                <rect
                  x="50"
                  y="30"
                  width="100"
                  height="80"
                  rx="4"
                  fill="#1e3a5f"
                  stroke="#475569"
                  strokeWidth="1"
                />
                {[0, 1, 2, 3].map((i) => (
                  <rect
                    key={i}
                    x={55 + (i % 2) * 45}
                    y={35 + Math.floor(i / 2) * 35}
                    width="40"
                    height="30"
                    rx="2"
                    fill={["#14532d", "#1e3a5f", "#3d1f00", "#1e293b"][i]}
                    opacity="0.8"
                  />
                ))}
                <text
                  x="100"
                  y="122"
                  textAnchor="middle"
                  fontSize="7.5"
                  fill="#475569"
                >
                  原始影像
                </text>
                {/* 箭头 */}
                <path
                  d="M152,70 L188,70"
                  stroke="#6366f1"
                  strokeWidth="2"
                  markerEnd="url(#arr)"
                />
                {/* AI处理框 */}
                <rect
                  x="190"
                  y="40"
                  width="100"
                  height="60"
                  rx="6"
                  fill="#312e81"
                  stroke="#818cf8"
                  strokeWidth="2"
                  opacity={0.8 + 0.2 * pulse}
                />
                <text
                  x="240"
                  y="68"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#a5b4fc"
                  fontWeight="600"
                >
                  AI解译模型
                </text>
                <text
                  x="240"
                  y="82"
                  textAnchor="middle"
                  fontSize="7.5"
                  fill="#818cf8"
                >
                  YOLOv8/SAM
                </text>
                <path
                  d="M292,70 L328,70"
                  stroke="#10b981"
                  strokeWidth="2"
                  markerEnd="url(#arr)"
                />
                {/* 结果 */}
                <rect
                  x="330"
                  y="30"
                  width="100"
                  height="80"
                  rx="4"
                  fill="#1e3a5f"
                  stroke="#10b981"
                  strokeWidth="1"
                />
                <text
                  x="380"
                  y="75"
                  textAnchor="middle"
                  fontSize="7.5"
                  fill="#34d399"
                >
                  变化检测/
                </text>
                <text
                  x="380"
                  y="87"
                  textAnchor="middle"
                  fontSize="7.5"
                  fill="#34d399"
                >
                  目标识别
                </text>
                <W
                  title="AI让遥感从人工走向自动化"
                  line1="中科星图GEOVIS平台日处理TB级影像，"
                  line2="AI解译效率是人工的100倍，精度超90%。"
                  color="#818cf8"
                />
              </>
            );
          if (s === 2)
            return (
              <>
                {[
                  {
                    x: 80,
                    y: 20,
                    label: "光学影像",
                    desc: "0.5m/天级更新",
                    c: "#22d3ee",
                  },
                  {
                    x: 280,
                    y: 20,
                    label: "SAR数据",
                    desc: "全天候/夜间",
                    c: "#818cf8",
                  },
                  {
                    x: 80,
                    y: 90,
                    label: "高光谱",
                    desc: "200波段精细分类",
                    c: "#10b981",
                  },
                  {
                    x: 280,
                    y: 90,
                    label: "LiDAR高程",
                    desc: "厘米级DEM",
                    c: "#f59e0b",
                  },
                ].map((nd) => (
                  <g key={nd.label}>
                    <rect
                      x={nd.x}
                      y={nd.y}
                      width="160"
                      height="55"
                      rx="8"
                      fill="#1e293b"
                      stroke={nd.c}
                      strokeWidth="1.5"
                      opacity={0.8 + 0.2 * pulse}
                    />
                    <text
                      x={nd.x + 80}
                      y={nd.y + 20}
                      textAnchor="middle"
                      fontSize="9"
                      fill={nd.c}
                      fontWeight="700"
                    >
                      {nd.label}
                    </text>
                    <text
                      x={nd.x + 80}
                      y={nd.y + 36}
                      textAnchor="middle"
                      fontSize="7.5"
                      fill="#64748b"
                    >
                      {nd.desc}
                    </text>
                  </g>
                ))}
                <W
                  title="多源遥感融合构建数字地球"
                  line1="中科星图融合光学/SAR/高光谱多源数据，"
                  line2="数字地球底座支撑国防/应急/城市管理。"
                  color="#22d3ee"
                />
              </>
            );
          return (
            <>
              {[
                {
                  x: 80,
                  y: 20,
                  icon: "🌾",
                  label: "精准农业",
                  desc: "长势/病虫/产量预估",
                },
                {
                  x: 230,
                  y: 20,
                  icon: "🆘",
                  label: "灾害应急",
                  desc: "洪涝/地震快速评估",
                },
                {
                  x: 370,
                  y: 20,
                  icon: "🏙️",
                  label: "城市规划",
                  desc: "变化监测/违建检查",
                },
                {
                  x: 150,
                  y: 85,
                  icon: "⛏️",
                  label: "资源勘探",
                  desc: "矿产/油气遥感识别",
                },
                {
                  x: 300,
                  y: 85,
                  icon: "🌊",
                  label: "海洋监测",
                  desc: "船舶/溢油/藻华",
                },
              ].map((a) => (
                <g key={a.label}>
                  <rect
                    x={a.x}
                    y={a.y}
                    width="100"
                    height="50"
                    rx="8"
                    fill="#1e293b"
                    stroke="#6366f1"
                    strokeWidth="1.5"
                    opacity={0.85 + 0.15 * pulse}
                  />
                  <text x={a.x + 12} y={a.y + 18} fontSize="13">
                    {a.icon}
                  </text>
                  <text
                    x={a.x + 30}
                    y={a.y + 17}
                    fontSize="8.5"
                    fill="#818cf8"
                    fontWeight="700"
                  >
                    {a.label}
                  </text>
                  <text x={a.x + 8} y={a.y + 34} fontSize="7.5" fill="#94a3b8">
                    {a.desc}
                  </text>
                </g>
              ))}
              <text
                x="240"
                y="155"
                textAnchor="middle"
                fontSize="9"
                fill="#fbbf24"
                fontWeight="600"
              >
                遥感数据服务市场 $100亿+/年，高速增长
              </text>
              <W
                title="遥感数据服务是高增长赛道"
                line1="四维图新/中科星图从数据到AI服务全链布局，"
                line2="政府/能源/农业/保险多行业需求旺盛。"
                color="#6366f1"
              />
            </>
          );
        }}
      />
    );
  }

  // as_ground — 地面站/测控系统
  if (industryId === "as_ground") {
    return (
      <IA
        isLight={isLight}
        title="地面站/测控系统"
        steps={[
          { id: 0, label: "测控站系统" },
          { id: 1, label: "卫星控制中心" },
          { id: 2, label: "全球测控网" },
          { id: 3, label: "数据服务" },
        ]}
        renderStep={(s) => {
          const t = (Date.now() / 600) % (Math.PI * 2);
          const pulse = 0.5 + 0.5 * Math.sin(t);
          if (s === 0)
            return (
              <>
                {/* 大天线 */}
                <path
                  d="M200,100 Q240,30 280,100"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="3"
                />
                <path
                  d="M200,100 Q240,40 280,100"
                  fill="#1e3a5f"
                  stroke="#2563eb"
                  strokeWidth="1"
                  opacity="0.4"
                />
                <line
                  x1="240"
                  y1="100"
                  x2="240"
                  y2="120"
                  stroke="#64748b"
                  strokeWidth="3"
                />
                <rect
                  x="220"
                  y="120"
                  width="40"
                  height="12"
                  rx="3"
                  fill="#334155"
                />
                {/* 信号波 */}
                {[0, 1, 2].map((i) => (
                  <path
                    key={i}
                    d={`M${170 - i * 15},${85 - i * 10} Q240,${60 - i * 12} ${310 + i * 15},${85 - i * 10}`}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={1 - i * 0.2}
                    strokeDasharray="6 3"
                    opacity={0.4 + 0.5 * pulse}
                  />
                ))}
                <text
                  x="240"
                  y="148"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#f59e0b"
                  fontWeight="600"
                >
                  9m口径相控阵测控站，S/X/Ka三频
                </text>
                <W
                  title="测控站是卫星在轨的生命线"
                  line1="四创电子/七一二提供全套测控设备，"
                  line2="遥测/遥控/跟踪一体化，实时监控卫星状态。"
                  color="#f59e0b"
                />
              </>
            );
          if (s === 1)
            return (
              <>
                {[
                  {
                    x: 80,
                    y: 20,
                    label: "轨道确定",
                    desc: "精轨计算，μm精度",
                    c: "#38bdf8",
                  },
                  {
                    x: 280,
                    y: 20,
                    label: "姿态控制",
                    desc: "遥控指令上注",
                    c: "#818cf8",
                  },
                  {
                    x: 80,
                    y: 90,
                    label: "健康监测",
                    desc: "实时遥测数据分析",
                    c: "#10b981",
                  },
                  {
                    x: 280,
                    y: 90,
                    label: "任务规划",
                    desc: "成像/通信调度",
                    c: "#f59e0b",
                  },
                ].map((nd) => (
                  <g key={nd.label}>
                    <rect
                      x={nd.x}
                      y={nd.y}
                      width="160"
                      height="55"
                      rx="8"
                      fill="#1e293b"
                      stroke={nd.c}
                      strokeWidth="1.5"
                      opacity={0.8 + 0.2 * pulse}
                    />
                    <text
                      x={nd.x + 80}
                      y={nd.y + 20}
                      textAnchor="middle"
                      fontSize="9"
                      fill={nd.c}
                      fontWeight="700"
                    >
                      {nd.label}
                    </text>
                    <text
                      x={nd.x + 80}
                      y={nd.y + 36}
                      textAnchor="middle"
                      fontSize="7.5"
                      fill="#64748b"
                    >
                      {nd.desc}
                    </text>
                  </g>
                ))}
                <W
                  title="MOC是卫星运营的神经中枢"
                  line1="中国卫星/航天电子运营百颗卫星的测控网，"
                  line2="自动化MOC系统每天处理百万条遥测数据。"
                  color="#38bdf8"
                />
              </>
            );
          if (s === 2)
            return (
              <>
                <circle
                  cx="240"
                  cy="85"
                  r="55"
                  fill="#0f2037"
                  stroke="#1e3a5f"
                  strokeWidth="1.5"
                />
                {[
                  { angle: -60, label: "北京站" },
                  { angle: 0, label: "喀什站" },
                  { angle: 60, label: "三亚站" },
                  { angle: 150, label: "纳米比亚" },
                  { angle: 210, label: "巴基斯坦" },
                ].map(({ angle, label }, i) => {
                  const rad = (angle * Math.PI) / 180;
                  const cx = 240 + 100 * Math.cos(rad);
                  const cy = 85 + 55 * Math.sin(rad);
                  return (
                    <g key={label}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r="6"
                        fill="#1e293b"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        opacity={0.8 + 0.2 * pulse}
                      />
                      <text
                        x={cx}
                        y={cy + 14}
                        textAnchor="middle"
                        fontSize="7"
                        fill="#94a3b8"
                      >
                        {label}
                      </text>
                      <line
                        x1={240 + 40 * Math.cos(rad)}
                        y1={85 + 22 * Math.sin(rad)}
                        x2={cx - 5 * Math.cos(rad)}
                        y2={cy - 3 * Math.sin(rad)}
                        stroke="#818cf8"
                        strokeWidth="0.8"
                        opacity={0.3 + 0.4 * pulse}
                        strokeDasharray="4 3"
                      />
                    </g>
                  );
                })}
                <text
                  x="240"
                  y="20"
                  textAnchor="middle"
                  fontSize="9"
                  fill="#818cf8"
                  fontWeight="600"
                >
                  全弧段测控：国内3站+海外2站
                </text>
                <W
                  title="全球测控网保障卫星全生命周期"
                  line1="中国测控网已覆盖三大洋，"
                  line2={'巴基斯坦/纳米比亚站为"一带一路"海外节点。'}
                  color="#818cf8"
                />
              </>
            );
          return (
            <>
              {[
                {
                  x: 80,
                  y: 20,
                  icon: "📡",
                  label: "测控服务",
                  desc: "商业卫星运控外包",
                },
                {
                  x: 230,
                  y: 20,
                  icon: "📊",
                  label: "遥测数据",
                  desc: "卫星健康数据分析",
                },
                {
                  x: 370,
                  y: 20,
                  icon: "🛰️",
                  label: "在轨运营",
                  desc: "姿轨控/寿命管理",
                },
                {
                  x: 150,
                  y: 85,
                  icon: "☁️",
                  label: "云测控",
                  desc: "SaaS化测控服务",
                },
                {
                  x: 300,
                  y: 85,
                  icon: "🔒",
                  label: "安全通信",
                  desc: "量子/加密上行链路",
                },
              ].map((a) => (
                <g key={a.label}>
                  <rect
                    x={a.x}
                    y={a.y}
                    width="100"
                    height="50"
                    rx="8"
                    fill="#1e293b"
                    stroke="#6366f1"
                    strokeWidth="1.5"
                    opacity={0.85 + 0.15 * pulse}
                  />
                  <text x={a.x + 12} y={a.y + 18} fontSize="13">
                    {a.icon}
                  </text>
                  <text
                    x={a.x + 30}
                    y={a.y + 17}
                    fontSize="8.5"
                    fill="#818cf8"
                    fontWeight="700"
                  >
                    {a.label}
                  </text>
                  <text x={a.x + 8} y={a.y + 34} fontSize="7.5" fill="#94a3b8">
                    {a.desc}
                  </text>
                </g>
              ))}
              <text
                x="240"
                y="155"
                textAnchor="middle"
                fontSize="9"
                fill="#fbbf24"
                fontWeight="600"
              >
                商业测控服务：低轨星座爆发新机遇
              </text>
              <W
                title="商业测控是星座时代新兴市场"
                line1="G60等千颗星座推动测控需求100倍增长，"
                line2="四创电子/七一二布局商业测控服务。"
                color="#6366f1"
              />
            </>
          );
        }}
      />
    );
  }

  // 默认回退：全景动画
  return (
    <IA
      isLight={isLight}
      title="商业航天产业链全流程"
      steps={AEROSPACE_STEPS}
      renderStep={(s) => <AerospaceStep step={s} />}
    />
  );
}
