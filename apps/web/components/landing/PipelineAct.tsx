"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { ActMarker, MonoLabel, Reveal } from "./primitives";

const STAGES = [
  { label: "Your question", sub: "10-mark DAA query" },
  { label: "Embedded", sub: "384-dim vector" },
  { label: "Vector search", sub: "pgvector · cosine distance" },
  { label: "5 chunks retrieved", sub: "DAA_Unit2.pdf · DAA_QB_2024.xlsx" },
  { label: "Answer written + validated", sub: "citations ✓ · 274 words ✓" },
];

const LOG_LINES = [
  '> embed("State and prove the Master Theorem")',
  "> [0.12, -0.44, 0.31, … 384 dims]",
  "> search(subject=DAA, k=5, dist<0.8) → 5 chunks",
  "> rank: [0.98, 0.94, 0.91, 0.87, 0.84]",
  "> generate(marks=10, model=mimo-v2.5-free)",
  "> validate(citations) ✓ 274 words",
];

export function PipelineAct() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 0.8", "end 0.35"],
  });

  const dashOffset = useTransform(scrollYProgress, [0, 1], [500, 0]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let last = -1;
    const unsub = scrollYProgress.on("change", (v) => {
      /* Only re-render when the change is visually meaningful — keeps the
         scrub at display refresh rate without per-pixel renders. */
      if (Math.abs(v - last) > 0.004) {
        last = v;
        setProgress(v);
      }
    });
    return () => {
      unsub();
    };
  }, [scrollYProgress, reduced]);

  const effective = reduced ? 1 : progress;
  const activeCount = Math.floor(effective * STAGES.length + 0.001);
  const visibleLines = Math.round(effective * LOG_LINES.length);

  return (
    <section ref={sectionRef} id="pipeline-act" className="relative overflow-hidden px-6 py-32 md:px-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: "radial-gradient(45% 40% at 20% 50%, rgba(229,9,20,0.05), transparent 70%)",
        }}
      />

      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <ActMarker num="02" title="The search" />
        </Reveal>

        <div className="mt-10 grid grid-cols-1 items-start gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          {/* Left — the claim */}
          <div className="lg:sticky lg:top-28">
            <Reveal delay={0.05}>
              <h2 className="font-bold">
                It does not search the web.
                <br />
                <span className="text-[var(--color-brand-accent)]">It searches your semester.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.15}>
              <p className="mt-7 max-w-md text-lg leading-relaxed text-[var(--color-muted)]">
                Your question is matched against your campus material to locate the
                most relevant pages, slides and sections — then an answer is
                assembled and verified. Scroll, and watch it work.
              </p>
            </Reveal>

            {/* Stage list */}
            <div className="mt-10 space-y-1">
              {STAGES.map((stage, idx) => {
                const active = idx < activeCount;
                const current = idx === activeCount - 1;
                return (
                  <div
                    key={stage.label}
                    className="group flex items-baseline gap-4 rounded-lg px-3 py-2.5 transition-colors duration-300 hover:bg-[rgba(229,9,20,0.04)]"
                    style={current ? { background: "rgba(229,9,20,0.07)" } : undefined}
                  >
                    <span
                      className={`font-mono text-[10px] font-bold tabular-nums transition-colors duration-300 ${
                        active ? "text-[var(--color-brand-accent)]" : "text-[var(--color-faint)]"
                      }`}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p
                        className={`text-sm font-semibold transition-colors duration-300 ${
                          active ? "text-[var(--color-fg)]" : "text-[var(--color-faint)]"
                        }`}
                      >
                        {stage.label}
                      </p>
                      <p
                        className={`font-mono text-[10px] tracking-wide transition-all duration-300 ${
                          current ? "max-h-6 opacity-100" : "max-h-0 overflow-hidden opacity-0"
                        } text-[var(--color-muted)]`}
                      >
                        {stage.sub}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right — the spine + terminal log */}
          <div className="flex flex-col gap-8">
            <svg viewBox="0 0 300 500" className="mx-auto h-auto w-full max-w-[240px]">
              <defs>
                <linearGradient id="spineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e50914" />
                  <stop offset="100%" stopColor="#ff2a2a" />
                </linearGradient>
              </defs>
              {/* Rail */}
              <line x1="150" y1="10" x2="150" y2="490" stroke="var(--color-line)" strokeWidth="1.5" />
              {/* Live spine */}
              <motion.line
                x1="150"
                y1="10"
                x2="150"
                y2="490"
                stroke="url(#spineGrad)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="480"
                style={{ strokeDashoffset: dashOffset, filter: "drop-shadow(0 0 6px rgba(229,9,20,0.6))" }}
              />
              {STAGES.map((stage, idx) => {
                const y = 10 + (idx / (STAGES.length - 1)) * 480;
                const active = idx < activeCount;
                return (
                  <g key={stage.label}>
                    <circle
                      cx="150"
                      cy={y}
                      r="13"
                      fill={active ? "rgba(229,9,20,0.14)" : "var(--color-surface)"}
                      stroke={active ? "#e50914" : "var(--color-line)"}
                      strokeWidth="1.5"
                      style={{ transition: "all 0.3s ease" }}
                    />
                    {active && (
                      <motion.circle
                        cx="150"
                        cy={y}
                        r="5"
                        fill="#ff2a2a"
                        animate={reduced ? {} : { r: [4.5, 6.5, 4.5], opacity: [1, 0.7, 1] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                    <text
                      x="176"
                      y={y + 4}
                      fontSize="11"
                      fontFamily="var(--font-mono), monospace"
                      fontWeight="600"
                      fill={active ? "#f2f2f2" : "#5c5c5c"}
                      style={{ transition: "fill 0.3s ease" }}
                    >
                      {stage.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Terminal log */}
            <div className="card min-h-64 space-y-2.5 !bg-[#0a0a0c] p-6 font-mono text-[12.5px]">
              <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
                <span className="h-2 w-2 rounded-full bg-[#ff5f56]" />
                <span className="h-2 w-2 rounded-full bg-[#ffbd2e]" />
                <span className="h-2 w-2 rounded-full bg-[#27c93f]" />
                <MonoLabel className="ml-3 text-[var(--color-faint)]">vibegpt — pipeline</MonoLabel>
              </div>
              {LOG_LINES.map((line, idx) => (
                <motion.div
                  key={line}
                  className="leading-relaxed text-[var(--color-muted)]"
                  initial={reduced ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
                  animate={idx < visibleLines ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="font-bold text-[var(--color-brand-accent)]">›</span> {line}
                </motion.div>
              ))}
              <motion.span
                className="inline-block h-4 w-2 translate-y-0.5 bg-[var(--color-brand-accent)]"
                animate={reduced ? { opacity: 1 } : { opacity: [1, 0, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
