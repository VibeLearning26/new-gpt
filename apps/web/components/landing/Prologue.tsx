"use client";

import { motion, useReducedMotion } from "motion/react";
import { ScrollCue } from "./primitives";

const PROLOGUE_LINES = [
  { text: "Exam at 9:00.", delay: 0.9 },
  { text: "400 pages left.", delay: 1.15 },
  { text: "17 PDFs.", delay: 1.4 },
  { text: "One question that matters.", delay: 1.7, accent: true },
];

/* Documents scattered at the edges — overwhelming, slightly out of reach */
const PROLOGUE_DOCS = [
  { name: "OS_Unit3_Notes.pdf", tag: "PDF", tone: "#ff5555", x: 6, y: 18, r: -8, delay: 1.9 },
  { name: "DBMS_QB_2024.xlsx", tag: "XLS", tone: "#22c55e", x: 84, y: 14, r: 6, delay: 2.05 },
  { name: "Thermodynamics_L7.pptx", tag: "PPT", tone: "#f5a623", x: 10, y: 72, r: 5, delay: 2.2 },
  { name: "CN_Unit1.pdf", tag: "PDF", tone: "#ff5555", x: 82, y: 68, r: -6, delay: 2.35 },
  { name: "Maths_Laplace.pdf", tag: "PDF", tone: "#ff5555", x: 22, y: 40, r: -4, delay: 2.5, dim: true },
  { name: "SE_Unit5.pdf", tag: "PDF", tone: "#ff5555", x: 70, y: 42, r: 4, delay: 2.6, dim: true },
];

export function Prologue() {
  const reduced = useReducedMotion();

  return (
    <section
      id="prologue"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6"
    >
      {/* Deep red atmosphere behind the clock */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 42%, rgba(229,9,20,0.10), transparent 70%)",
        }}
      />

      {/* Scattered documents at the periphery */}
      <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden>
        {PROLOGUE_DOCS.map((doc) => (
          <motion.div
            key={doc.name}
            className="absolute w-40"
            style={{ left: `${doc.x}%`, top: `${doc.y}%`, opacity: doc.dim ? 0.45 : 0.85 }}
            initial={reduced ? { opacity: doc.dim ? 0.45 : 0.85, y: 0, rotate: doc.r } : { opacity: 0, y: 26, rotate: doc.r - 6 }}
            animate={{ opacity: doc.dim ? 0.45 : 0.85, y: 0, rotate: doc.r }}
            transition={{ duration: 0.8, delay: doc.delay, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="card pointer-events-auto !p-3 transition-all duration-300 hover:scale-[1.02] hover:border-[rgba(229,9,20,0.3)]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] font-bold text-[var(--color-fg)]">
                  {doc.name}
                </span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-wider"
                  style={{ color: doc.tone, background: `${doc.tone}1a`, border: `1px solid ${doc.tone}40` }}
                >
                  {doc.tag}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* The clock */}
      <div className="flex flex-col items-center">
        <motion.div
          className="mono-label mb-6 text-[var(--color-faint)]"
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          The night before
        </motion.div>

        <motion.div
          className="flex items-baseline font-mono tabular-nums leading-none tracking-[-0.04em]"
          initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="text-[clamp(5rem,18vw,11rem)] font-medium text-[var(--color-fg)]">03</span>
          <motion.span
            className="mx-[0.08em] text-[clamp(4rem,15vw,9rem)] font-medium text-[var(--color-brand-accent)]"
            animate={reduced ? { opacity: 1 } : { opacity: [1, 0.2, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            :
          </motion.span>
          <span className="text-[clamp(5rem,18vw,11rem)] font-medium text-[var(--color-fg)]">47</span>
          <span className="ml-4 text-[clamp(1.4rem,4vw,2.4rem)] font-medium text-[var(--color-brand-accent)]">
            AM
          </span>
        </motion.div>

        {/* Progressive lines */}
        <div className="mt-10 flex flex-col items-center gap-2.5">
          {PROLOGUE_LINES.map((line) => (
            <motion.p
              key={line.text}
              className={`text-[clamp(1rem,2.4vw,1.35rem)] leading-relaxed ${
                line.accent ? "font-semibold text-[var(--color-fg)]" : "text-[var(--color-muted)]"
              }`}
              initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: line.delay, ease: [0.16, 1, 0.3, 1] }}
            >
              {line.text}
            </motion.p>
          ))}
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <ScrollCue />
      </div>
    </section>
  );
}
