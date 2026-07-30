"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ActMarker, MonoLabel, Reveal, StaggerContainer, StaggerItem } from "./primitives";

const ANSWER_SEGMENTS = [
  "Normalization is the process of organizing data in a database to reduce redundancy and improve data integrity.",
  "It works by decomposing a relation with redundant data into smaller, well-structured relations. First Normal Form (1NF) requires that every attribute holds only atomic values.",
  "Second Normal Form (2NF) requires 1NF plus full functional dependence of non-key attributes on the primary key. Third Normal Form (3NF) removes transitive dependencies.",
];

const SOURCES = [
  { id: "S1", name: "DBMS_Unit4.pdf", page: "Page 32" },
  { id: "S2", name: "DBMS_Unit4.pdf", page: "Page 35" },
  { id: "S3", name: "DBMS_Notes_Senior.pdf", page: "Page 8" },
];

/* Real mark → word windows from the app's answer rules */
const MARK_WINDOWS: Record<number, string> = {
  2: "35–60",
  3: "60–100",
  5: "120–180",
  8: "200–280",
  10: "250–350",
};

export function CitationsAct() {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const [connector, setConnector] = useState<string | null>(null);
  const [selectedMark, setSelectedMark] = useState(5);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* Connector path: right edge of the chip → left edge of its source card.
     Computed in the hover handler (never during render). */
  const setHighlight = (id: string | null) => {
    setHovered(id);
    if (!id || !gridRef.current) {
      setConnector(null);
      return;
    }
    const chip = chipRefs.current[id];
    const card = cardRefs.current[id];
    if (!chip || !card) {
      setConnector(null);
      return;
    }
    const g = gridRef.current.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const k = card.getBoundingClientRect();
    const x1 = c.right - g.left + 4;
    const y1 = c.top + c.height / 2 - g.top;
    const x2 = k.left - g.left - 6;
    const y2 = k.top + k.height / 2 - g.top;
    const bend = Math.max(40, Math.abs(x2 - x1) * 0.45);
    setConnector(`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
  };

  return (
    <section id="citations-act" className="relative overflow-hidden px-6 py-32 md:px-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(45% 40% at 80% 30%, rgba(229,9,20,0.05), transparent 70%)" }}
      />

      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <ActMarker num="03" title="The evidence" />
        </Reveal>

        <Reveal delay={0.05}>
          <h2 className="mt-10 font-bold">
            Every claim,
            <br />
            <span className="text-[var(--color-brand-accent)]">cited.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-[var(--color-muted)]">
            VibeGPT doesn&apos;t just sound confident — it shows its receipts.
            Hover a citation and meet the page it came from.
          </p>
        </Reveal>

        {/* Answer ↔ sources with live connectors */}
        <div ref={gridRef} className="relative mt-16">
          {connector && (
            <svg
              className="pointer-events-none absolute inset-0 z-10"
              width={box.w}
              height={box.h}
              viewBox={`0 0 ${box.w} ${box.h}`}
            >
              <motion.path
                d={connector}
                fill="none"
                stroke="#e50914"
                strokeWidth="1.5"
                strokeDasharray="1"
                pathLength={1}
                initial={reduced ? { pathLength: 1, opacity: 0.8 } : { pathLength: 0, opacity: 0.8 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{ filter: "drop-shadow(0 0 5px rgba(229,9,20,0.7))" }}
              />
            </svg>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
            {/* The answer */}
            <Reveal>
              <div className="answer-card h-full">
                <MonoLabel className="mb-5 text-[var(--color-faint)]">
                  DBMS · Unit 4 · {selectedMark}-mark answer
                </MonoLabel>
                <div className="space-y-4 text-[15.5px] leading-[1.85] text-[#e4e4e4]">
                  {ANSWER_SEGMENTS.map((segment, idx) => (
                    <p key={idx}>
                      {segment}
                      {idx < SOURCES.length && (
                        <motion.span
                          ref={(el) => {
                            chipRefs.current[SOURCES[idx].id] = el;
                          }}
                          className={`badge-red ml-1.5 transition-all duration-200 hover:scale-[1.08] hover:bg-[rgba(229,9,20,0.15)] ${hovered === SOURCES[idx].id ? "!bg-[rgba(229,9,20,0.3)]" : ""}`}
                          onMouseEnter={() => setHighlight(SOURCES[idx].id)}
                          onMouseLeave={() => setHighlight(null)}
                          onFocus={() => setHighlight(SOURCES[idx].id)}
                          onBlur={() => setHighlight(null)}
                          tabIndex={0}
                          whileHover={reduced ? {} : { scale: 1.12 }}
                        >
                          [{SOURCES[idx].id}]
                        </motion.span>
                      )}
                    </p>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* The sources */}
            <div>
              <MonoLabel className="mb-4 text-[var(--color-faint)]">Sources</MonoLabel>
              <StaggerContainer className="space-y-3">
                {SOURCES.map((source) => {
                  const hot = hovered === source.id;
                  return (
                    <StaggerItem key={source.id}>
                      <motion.div
                        ref={(el) => {
                          cardRefs.current[source.id] = el;
                        }}
                        className="card cursor-pointer !p-4 transition-all duration-300 hover:translate-y-[-2px] hover:border-[rgba(229,9,20,0.3)]"
                        onMouseEnter={() => setHighlight(source.id)}
                        onMouseLeave={() => setHighlight(null)}
                        animate={{
                          x: hot && !reduced ? -6 : 0,
                          borderColor: hot ? "rgba(229,9,20,0.65)" : "var(--color-line)",
                          boxShadow: hot ? "0 0 20px rgba(229,9,20,0.3)" : "0 0 0 rgba(0,0,0,0)",
                        }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs font-bold text-[var(--color-fg)]">
                              {source.name}
                            </p>
                            <p className="mt-1 text-xs text-[var(--color-muted)]">{source.page}</p>
                          </div>
                          <span className={`badge-red flex-shrink !cursor-default transition-all duration-200 hover:scale-[1.08] hover:bg-[rgba(229,9,20,0.15)] ${hot ? "!bg-[rgba(229,9,20,0.3)]" : ""}`}>
                            {source.id}
                          </span>
                        </div>
                      </motion.div>
                    </StaggerItem>
                  );
                })}
              </StaggerContainer>
            </div>
          </div>
        </div>

        {/* The marks ruler */}
        <Reveal>
          <div className="mt-20 border-t border-[var(--color-line)] pt-10">
            <div className="flex flex-wrap items-end justify-between gap-8">
              <div>
                <MonoLabel className="text-[var(--color-faint)]">The mark scheme</MonoLabel>
                <p className="mt-4 max-w-md text-lg text-[var(--color-muted)]">
                  Same question, different depth. VibeGPT obeys the mark scheme.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {Object.keys(MARK_WINDOWS).map((mark) => {
                  const m = Number(mark);
                  const active = selectedMark === m;
                  return (
                    <motion.button
                      key={mark}
                      onClick={() => setSelectedMark(m)}
                      className={`chip !px-5 !py-2.5 transition-all duration-200 hover:bg-[rgba(229,9,20,0.08)] ${active ? "active" : ""}`}
                      whileHover={reduced ? {} : { scale: 1.06 }}
                      whileTap={reduced ? {} : { scale: 0.95 }}
                      aria-pressed={active}
                    >
                      {mark} marks
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Word window readout */}
            <div className="mt-8 flex items-center gap-6">
              <motion.div
                key={selectedMark}
                initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="font-mono text-sm text-[var(--color-muted)]"
              >
                expected length{" "}
                <span className="text-xl font-bold text-[var(--color-brand-accent)]">
                  {MARK_WINDOWS[selectedMark]}
                </span>{" "}
                words
              </motion.div>
              {/* Skeleton lines that resize with the mark value */}
              <div className="hidden flex-1 space-y-2 md:block" aria-hidden>
                {[1, 0.82, 0.6].map((w, i) => (
                  <motion.div
                    key={i}
                    className="h-1.5 rounded-full bg-[var(--color-line)]"
                    animate={{ width: `${w * (30 + selectedMark * 6)}%`, opacity: i < selectedMark / 4 ? 1 : 0.35 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
