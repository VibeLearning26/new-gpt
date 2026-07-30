"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ActMarker, Reveal } from "./primitives";

/* Documents, now ranked and connected instead of scattered */
const ORGANIZED_DOCS = [
  { name: "Data_Structures_Module_3.pdf", tag: "PDF", tone: "#ff5555", used: true },
  { name: "Circular_Queue_Lecture.pdf", tag: "PDF", tone: "#ff5555", used: true },
  { name: "DSA_Question_Bank.pdf", tag: "PDF", tone: "#ff5555", used: true },
  { name: "Previous_Year_Questions_2025.pdf", tag: "PDF", tone: "#ff5555", used: false },
  { name: "Queue_Implementation_Notes.pdf", tag: "PDF", tone: "#ff5555", used: false },
];

const OUTCOME_LINES = [
  { text: "One chapter understood.", delay: 0.15 },
  { text: "Five answers prepared.", delay: 0.35 },
  { text: "Every source saved.", delay: 0.55 },
];

export function OutcomeAct() {
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
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* Clock eases from 03:47 to 04:06 once in view */
  const [minutes, setMinutes] = useState(47);
  useEffect(() => {
    if (!inView || reduced) return;
    const start = performance.now();
    const dur = 2200;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setMinutes(Math.round(47 + eased * 19)); // 47 → 66 (= 04:06)
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced]);

  const effectiveMinutes = reduced ? 66 : minutes;
  const displayMinutes = effectiveMinutes % 60;
  const hour = effectiveMinutes >= 60 ? 4 : 3;

  return (
    <section
      ref={sectionRef}
      id="outcome-act"
      className="relative overflow-hidden px-6 py-28 md:px-8"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(50% 45% at 50% 40%, rgba(229,9,20,0.06), transparent 70%)" }}
      />

      <div className="mx-auto w-full max-w-5xl">
        <Reveal>
          <ActMarker num="08" title="The outcome" />
        </Reveal>

        <div className="mt-12 grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
          {/* Left — the clock, now past the panic */}
          <div>
            <motion.div
              className="flex items-baseline font-mono tabular-nums leading-none tracking-[-0.04em] transition-colors duration-200 hover:[&>*]:text-[var(--color-brand-accent)]"
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="text-[clamp(4rem,10vw,7rem)] font-medium text-[var(--color-fg)]">
                0{hour}
              </span>
              <span className="mx-[0.08em] text-[clamp(3.2rem,8vw,5.6rem)] font-medium text-[var(--color-brand-accent)]">
                :
              </span>
              <span className="text-[clamp(4rem,10vw,7rem)] font-medium text-[var(--color-fg)]">
                {String(displayMinutes).padStart(2, "0")}
              </span>
              <span className="ml-3 text-[clamp(1.1rem,3vw,1.8rem)] font-medium text-[var(--color-brand-accent)]">
                AM
              </span>
            </motion.div>

            <div className="mt-8 flex flex-col gap-2">
              {OUTCOME_LINES.map((line) => (
                <motion.p
                  key={line.text}
                  className="text-[clamp(1.05rem,2.4vw,1.4rem)] font-medium text-[var(--color-fg)]"
                  initial={reduced ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.7, delay: line.delay, ease: [0.16, 1, 0.3, 1] }}
                >
                  {line.text}
                </motion.p>
              ))}
            </div>

            <motion.p
              className="mt-8 text-lg leading-relaxed text-[var(--color-muted)]"
              initial={reduced ? { opacity: 1 } : { opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.8 }}
            >
              Less time searching.{" "}
              <span className="text-[var(--color-fg)]">More time understanding.</span>
            </motion.p>
          </div>

          {/* Right — the chaos, now organized */}
          <div className="space-y-2.5">
            {ORGANIZED_DOCS.map((doc, i) => (
              <motion.div
                key={doc.name}
                className="card flex items-center justify-between gap-3 !p-4 transition-colors duration-200 hover:bg-[rgba(255,255,255,0.03)]"
                initial={reduced ? { opacity: 1, x: 0, rotate: 0 } : { opacity: 0, x: 40, rotate: 2 }}
                animate={inView ? { opacity: 1, x: 0, rotate: 0 } : {}}
                transition={{ duration: 0.7, delay: 0.2 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                style={doc.used ? undefined : { opacity: 0.55 }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider"
                    style={{ color: doc.tone, background: `${doc.tone}1a`, border: `1px solid ${doc.tone}40` }}
                  >
                    {doc.tag}
                  </span>
                  <span className="truncate font-mono text-[12px] font-semibold text-[var(--color-fg)]">
                    {doc.name}
                  </span>
                </div>
                {doc.used ? (
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-bold text-[var(--color-brand-accent)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-accent)]" />
                    cited
                  </span>
                ) : (
                  <span className="shrink-0 font-mono text-[10px] text-[var(--color-faint)]">
                    indexed
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* The emotional statement */}
        <div className="mt-24 text-center">
          <motion.h2
            className="mx-auto max-w-4xl font-bold"
            initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.9, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            From <span className="text-[var(--color-faint)]">&ldquo;Where do I even start?&rdquo;</span>{" "}
            to <span className="text-[var(--color-brand-accent)]">&ldquo;I understand this.&rdquo;</span>
          </motion.h2>
        </div>
      </div>
    </section>
  );
}
