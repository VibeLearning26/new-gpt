"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ActMarker, Counter, MagneticButton, MonoLabel, Reveal } from "./primitives";
import { ChevronRight } from "reicon-react";

const STATS = [
  { value: 128400, label: "tokens this week", accent: true },
  { value: 312, label: "questions today", accent: false },
  { value: 4.6, label: "avg rating", accent: false, decimal: true },
];

/* Peaks land at night — because that's when students ask */
const PEAK_HOURS = [
  { hour: "9 PM", value: 34 },
  { hour: "11 PM", value: 62 },
  { hour: "1 AM", value: 71 },
  { hour: "3 AM", value: 89 },
];

/* The real gateway models */
const MODEL_CHIPS = [
  { name: "mimo-v2.5-free", active: true },
  { name: "big-pickle", active: false },
  { name: "deepseek-v4-flash-free", active: false },
  { name: "nemotron-3-ultra-free", active: false },
];

/* Tokens per week (thousands) — the climb toward exam week */
const WEEKS = [
  { label: "W1", value: 38 },
  { label: "W2", value: 52 },
  { label: "W3", value: 47 },
  { label: "W4", value: 66 },
  { label: "W5", value: 74 },
  { label: "W6", value: 70 },
  { label: "W7", value: 98 },
  { label: "W8", value: 132 },
];

/* Catmull-Rom → cubic bezier for a smooth, honest curve */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function AreaChart({ inView }: { inView: boolean }) {
  const reduced = useReducedMotion();
  const W = 640;
  const H = 240;
  const padX = 34;
  const padTop = 26;
  const padBottom = 34;
  const max = 140;

  const pts = WEEKS.map((w, i) => ({
    x: padX + (i / (WEEKS.length - 1)) * (W - padX * 2),
    y: padTop + (1 - w.value / max) * (H - padTop - padBottom),
  }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${H - padBottom} L ${pts[0].x} ${H - padBottom} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg className="h-auto w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tokens used per week, rising toward exam week">
      <defs>
        <linearGradient id="deckArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e50914" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#e50914" stopOpacity="0.015" />
        </linearGradient>
      </defs>

      {/* Grid + scale */}
      {[0.25, 0.5, 0.75, 1].map((f) => {
        const y = padTop + (1 - f) * (H - padTop - padBottom);
        return (
          <g key={f}>
            <line x1={padX} x2={W - padX} y1={y} y2={y} stroke="var(--color-line)" strokeWidth="1" strokeDasharray={f === 1 ? undefined : "3 5"} />
            <text x={padX - 8} y={y + 3} textAnchor="end" fontSize="9" fill="var(--color-faint)" fontFamily="var(--font-mono), monospace">
              {Math.round(max * f)}k
            </text>
          </g>
        );
      })}

      {/* Week labels */}
      {pts.map((p, i) => (
        <text key={WEEKS[i].label} x={p.x} y={H - 12} textAnchor="middle" fontSize="9" fill="var(--color-faint)" fontFamily="var(--font-mono), monospace">
          {WEEKS[i].label}
        </text>
      ))}

      {/* Area fades in */}
      <motion.path
        d={area}
        fill="url(#deckArea)"
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1.1, delay: 0.55, ease: "easeOut" }}
      />

      {/* Curve draws itself */}
      <motion.path
        d={line}
        fill="none"
        stroke="#e50914"
        strokeWidth="2.25"
        strokeLinecap="round"
        pathLength={1}
        initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ filter: "drop-shadow(0 0 6px rgba(229,9,20,0.5))" }}
      />

      {/* Data ticks */}
      {pts.slice(0, -1).map((p, i) => (
        <motion.circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="2.5"
          fill="#0f0f0f"
          stroke="#e50914"
          strokeWidth="1.5"
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.3 + i * 0.13, duration: 0.4 }}
        />
      ))}

      {/* Live endpoint — pulse ring + value tag */}
      <motion.g
        initial={reduced ? { opacity: 1 } : { opacity: 0 }}
        animate={inView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ delay: 1.4, duration: 0.5 }}
      >
        <motion.circle
          cx={last.x}
          cy={last.y}
          r="5"
          fill="none"
          stroke="#ff2a2a"
          strokeWidth="1.5"
          animate={reduced ? {} : { r: [5, 13, 5], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
        <circle cx={last.x} cy={last.y} r="4" fill="#ff2a2a" style={{ filter: "drop-shadow(0 0 6px rgba(255,42,42,0.9))" }} />
        <g transform={`translate(${last.x - 46}, ${last.y - 30})`}>
          <rect width="40" height="19" rx="5" fill="#1a0507" stroke="rgba(229,9,20,0.45)" strokeWidth="1" />
          <text x="20" y="13" textAnchor="middle" fontSize="10" fontWeight="700" fill="#ff5555" fontFamily="var(--font-mono), monospace">
            132k
          </text>
        </g>
      </motion.g>
    </svg>
  );
}

export function DeckAct() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id="deck-act" className="relative overflow-hidden px-6 py-32 md:px-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(50% 45% at 50% 60%, rgba(229,9,20,0.05), transparent 70%)" }}
      />

      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <ActMarker num="07" title="The command deck" />
        </Reveal>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-8">
          <Reveal delay={0.05}>
            <h2 className="font-bold">
              The admin sees
              <br />
              <span className="text-[var(--color-brand-accent)]">everything.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="max-w-md text-lg leading-relaxed text-[var(--color-muted)]">
              Every question, every token, every rating — live charts, real
              numbers, no sampling.
            </p>
          </Reveal>
        </div>

        {/* The deck tilts in */}
        <div style={{ perspective: "1400px" }}>
          <motion.div
            className="panel mt-14 space-y-9 p-7 md:p-9 transition-all duration-300 hover:border-[rgba(229,9,20,0.25)]"
            initial={reduced ? { rotateX: 0, opacity: 1, y: 0 } : { rotateX: 10, opacity: 0, y: 48 }}
            animate={inView ? { rotateX: 0, opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between">
              <MonoLabel className="text-[var(--color-faint)]">campus pulse — last 8 weeks</MonoLabel>
              <span className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-faint)]">
                <motion.span
                  className="h-1.5 w-1.5 rounded-full bg-[#22c55e]"
                  animate={reduced ? {} : { opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
                live
              </span>
            </div>

            <AreaChart inView={inView} />

            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-6 border-y border-[var(--color-line)] py-7">
              {STATS.map((stat, idx) => (
                <motion.div
                  key={stat.label}
                  className="text-center transition-colors duration-200 rounded-lg hover:bg-[rgba(229,9,20,0.04)] py-3"
                  initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.25 + idx * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div
                    className={`font-mono text-2xl font-bold tabular-nums md:text-3xl ${
                      stat.accent ? "text-[var(--color-brand-accent)]" : "text-[var(--color-fg)]"
                    }`}
                  >
                    <Counter target={stat.value} duration={1.4} />
                  </div>
                  <MonoLabel className="mt-2 text-[var(--color-faint)]">{stat.label}</MonoLabel>
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-9 md:grid-cols-2">
              {/* Peak hours — the 3 AM spike */}
              <div>
                <MonoLabel className="mb-4 text-[var(--color-faint)]">peak hours</MonoLabel>
                <div className="space-y-2.5">
                  {PEAK_HOURS.map((item, idx) => (
                    <div key={item.hour} className="flex items-center gap-3">
                      <span className="w-12 font-mono text-[10px] text-[var(--color-faint)]">{item.hour}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-line)]">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#7a0a10] to-[#ff2a2a]"
                          style={{ boxShadow: "0 0 10px -2px rgba(229,9,20,0.6)" }}
                          initial={reduced ? { width: `${item.value}%` } : { width: 0 }}
                          animate={inView ? { width: `${item.value}%` } : { width: 0 }}
                          transition={{ delay: 0.4 + idx * 0.12, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-[10px] tabular-nums text-[var(--color-muted)]">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Models on the gateway */}
              <div>
                <MonoLabel className="mb-4 text-[var(--color-faint)]">models on the gateway</MonoLabel>
                <div className="flex flex-wrap gap-2">
                  {MODEL_CHIPS.map((chip, idx) => (
                    <motion.span
                      key={chip.name}
                      className={`chip !cursor-default transition-all duration-200 hover:bg-[rgba(229,9,20,0.12)] hover:scale-[1.05] ${chip.active ? "active" : ""}`}
                      initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
                      animate={inView ? { opacity: 1, scale: 1 } : {}}
                      transition={{ delay: 0.5 + idx * 0.08, duration: 0.45, ease: "backOut" }}
                    >
                      {chip.name}
                    </motion.span>
                  ))}
                </div>
                <p className="mt-4 font-mono text-[10px] leading-relaxed text-[var(--color-faint)]">
                  students switch models per question — the API never exposes a key
                </p>
              </div>
            </div>

            <div className="border-t border-[var(--color-line)] pt-7">
              <MagneticButton href="/login" variant="ghost" icon={<ChevronRight size={16} />}>
                Enter the command deck
              </MagneticButton>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
