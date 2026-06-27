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
