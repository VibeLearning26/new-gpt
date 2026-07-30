"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ActMarker, Reveal } from "./primitives";

type HotspotId = "composer" | "answer" | "marks";

const HOTSPOTS: { id: HotspotId; title: string; blurb: string }[] = [
  {
    id: "composer",
    title: "Ask in plain words",
    blurb:
      "Type the question exactly as it appears on the paper. VibeGPT finds the right subject and module automatically.",
  },
  {
    id: "answer",
    title: "Answers with receipts",
    blurb:
      "Every claim carries a citation. Tap a citation to open the exact page, slide or sheet it came from.",
  },
  {
    id: "marks",
    title: "Written for the marks",
    blurb:
      "Pick 2, 5 or 10 marks and the answer restructures itself — shorter for 2, full working for 10.",
  },
];

export function DemoAct() {
  const reduced = useReducedMotion();
  const [focus, setFocus] = useState<HotspotId | null>(null);
  const active = HOTSPOTS.find((h) => h.id === focus) ?? null;

  return (
    <section id="demo-act" className="relative overflow-hidden px-6 py-28 md:px-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(50% 45% at 80% 30%, rgba(229,9,20,0.06), transparent 70%)" }}
      />

      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <ActMarker num="05" title="See it work" />
        </Reveal>

        <div className="mt-12 grid grid-cols-1 items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          {/* Left — copy + hotspot legend */}
          <div>
            <Reveal delay={0.05}>
              <h2 className="font-bold">
                A quick look{" "}
                <span className="text-[var(--color-brand-accent)]">inside.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-6 text-lg leading-relaxed text-[var(--color-muted)]">
                Hover to lean in, click any highlighted part of the app to see it
                up close.
              </p>
            </Reveal>

            <div className="mt-8 space-y-3">
              {HOTSPOTS.map((h, i) => (
                <Reveal key={h.id} delay={0.15 + i * 0.08}>
                  <button
                    onClick={() => setFocus(h.id)}
                    className={`group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                      focus === h.id
                        ? "border-[rgba(229,9,20,0.5)] bg-[rgba(229,9,20,0.08)]"
                        : "border-[var(--color-line)] hover:border-[rgba(229,9,20,0.35)]"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-bold transition-all duration-200 hover:scale-[1.3] hover:bg-[var(--color-brand-accent)] ${
                        focus === h.id
                          ? "bg-[var(--color-brand)] text-white"
                          : "bg-[var(--color-surface)] text-[var(--color-brand-accent)] group-hover:bg-[rgba(229,9,20,0.15)]"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-[15px] font-bold text-[var(--color-fg)]">{h.title}</p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
                        {h.blurb}
                      </p>
                    </div>
                  </button>
                </Reveal>
              ))}
            </div>
          </div>

          {/* Right — the app window, hover-zoom + clickable hotspots */}
          <Reveal delay={0.15}>
            <motion.div
              className="group relative cursor-pointer"
              whileHover={reduced ? {} : { scale: 1.025, rotateX: 1.5, rotateY: -1.5 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              style={{ perspective: "1200px" }}
              onClick={() => setFocus("answer")}
            >
              {/* Glow seat */}
              <div
                className="pointer-events-none absolute -inset-8 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{ background: "radial-gradient(60% 60% at 50% 45%, rgba(229,9,20,0.16), transparent 75%)" }}
              />

              {/* App window */}
              <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] transition-shadow duration-300 hover:shadow-[0_0_40px_rgba(0,0,0,0.3)]">
                {/* Title bar */}
                <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                  <span className="ml-3 font-mono text-[11px] text-[var(--color-faint)]">
                    VibeGPT — Data Structures
                  </span>
                </div>

                <div className="space-y-4 p-5">
                  {/* Composer hotspot */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocus("composer");
                    }}
                    className={`block w-full rounded-xl border p-3.5 text-left transition-all ${
                      focus === "composer"
                        ? "border-[rgba(229,9,20,0.55)] ring-2 ring-[rgba(229,9,20,0.25)]"
                        : "border-[var(--color-line)] hover:border-[rgba(229,9,20,0.4)]"
                    }`}
                  >
                    <p className="font-mono text-[12.5px] text-[var(--color-fg)]">
                      Explain the working of a circular queue…
                      <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-[var(--color-brand-accent)] align-middle" />
                    </p>
                  </button>

                  {/* Answer hotspot */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocus("answer");
                    }}
                    className={`block w-full rounded-xl border p-4 text-left transition-all ${
                      focus === "answer"
                        ? "border-[rgba(229,9,20,0.55)] ring-2 ring-[rgba(229,9,20,0.25)]"
                        : "border-[var(--color-line)] hover:border-[rgba(229,9,20,0.4)]"
                    }`}
                  >
                    <p className="text-[13px] leading-relaxed text-[var(--color-muted)]">
                      A circular queue links the last position back to the first,
                      forming a circle.
                      <sup className="ml-0.5 rounded-full border border-[rgba(229,9,20,0.4)] bg-[rgba(229,9,20,0.12)] px-1 font-mono text-[9px] font-bold text-[var(--color-brand-accent)]">1</sup>{" "}
                      It reuses slots freed by dequeue, avoiding the queue-full
                      problem.
                      <sup className="ml-0.5 rounded-full border border-[rgba(229,9,20,0.4)] bg-[rgba(229,9,20,0.12)] px-1 font-mono text-[9px] font-bold text-[var(--color-brand-accent)]">2</sup>
                    </p>
                  </button>

                  {/* Marks hotspot */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocus("marks");
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl border p-3 transition-all ${
                      focus === "marks"
                        ? "border-[rgba(229,9,20,0.55)] ring-2 ring-[rgba(229,9,20,0.25)]"
                        : "border-[var(--color-line)] hover:border-[rgba(229,9,20,0.4)]"
                    }`}
                  >
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
                      marks
                    </span>
                    {[2, 5, 10].map((m) => (
                      <span
                        key={m}
                        className={`rounded-full px-3 py-1 font-mono text-[11px] font-bold ${
                          m === 5
                            ? "bg-[var(--color-brand)] text-white"
                            : "bg-[var(--color-surface)] text-[var(--color-muted)]"
                        }`}
                      >
                        {m}
                      </span>
                    ))}
                  </button>
                </div>
              </div>
            </motion.div>
          </Reveal>
        </div>
      </div>

      {/* Click-to-focus overlay */}
      <AnimatePresence>
        {active && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(3,3,3,0.8)] p-6 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFocus(null)}
          >
            <motion.div
              className="relative w-full max-w-lg rounded-2xl border border-[rgba(229,9,20,0.4)] bg-[var(--color-surface)] p-8 shadow-[0_40px_100px_-30px_rgba(229,9,20,0.3)]"
              initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 12 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setFocus(null)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] transition-colors hover:border-[rgba(229,9,20,0.4)] hover:text-[var(--color-fg)]"
                aria-label="Close"
              >
                ✕
              </button>
              <span className="mono-label text-[var(--color-brand-accent)]">
                feature {HOTSPOTS.findIndex((h) => h.id === active.id) + 1} of {HOTSPOTS.length}
              </span>
              <h3 className="mt-3 text-2xl font-bold text-[var(--color-fg)]">{active.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-muted)]">
                {active.blurb}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
