"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ActMarker, Reveal } from "./primitives";

/* ── Citation chip ─────────────────────────────────────────── */
function Cite({ n }: { n: number }) {
  return (
    <sup className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-[rgba(229,9,20,0.4)] bg-[rgba(229,9,20,0.12)] px-1 align-super font-mono text-[9px] font-bold text-[var(--color-brand-accent)]">
      {n}
    </sup>
  );
}

/* ── Answer content per mark level ─────────────────────────── */
type Block =
  | { kind: "h"; text: string }
  | { kind: "p"; node: React.ReactNode }
  | { kind: "points"; items: React.ReactNode[] }
  | { kind: "code"; lines: string[] }
  | { kind: "diagram"; label: string }
  | { kind: "verdict"; node: React.ReactNode };

const SOURCES = [
  { n: 1, name: "Data_Structures_Module_3.pdf", loc: "Page 42" },
  { n: 2, name: "Circular_Queue_Lecture.pdf", loc: "Slide 12" },
  { n: 3, name: "DSA_Question_Bank.pdf", loc: "Page 8" },
];

const WINDOWS: Record<number, string> = {
  2: "35–60 words",
  5: "120–180 words",
  10: "250–350 words",
};

function blocksFor(marks: number): Block[] {
  if (marks === 2) {
    return [
      {
        kind: "p",
        node: (
          <>
            A <strong>circular queue</strong> is a linear data structure in which the
            last position is linked back to the first, forming a circle.<Cite n={1} />
          </>
        ),
      },
      {
        kind: "points",
        items: [
          <>
            It reuses slots freed by dequeue, avoiding the &ldquo;queue full&rdquo;
            problem of a linear array.<Cite n={2} />
          </>,
        ],
      },
    ];
  }

  if (marks === 5) {
    return [
      { kind: "h", text: "Definition" },
      {
        kind: "p",
        node: (
          <>
            A <strong>circular queue</strong> is a linear data structure that follows
            FIFO, with the last position connected back to the first so the buffer
            wraps around in a circle.<Cite n={1} />
          </>
        ),
      },
      { kind: "h", text: "Working" },
      {
        kind: "p",
        node: (
          <>
            Two pointers, <code>front</code> and <code>rear</code>, track the ends.
            Instead of stopping at the array&rsquo;s end, each pointer wraps with{" "}
            <code>(index + 1) % size</code>, so freed slots are reused.<Cite n={2} />
          </>
        ),
      },
      {
        kind: "points",
        items: [
          <>
            <strong>Enqueue:</strong> <code>rear = (rear + 1) % size</code>, insert at{" "}
            <code>rear</code>.<Cite n={2} />
          </>,
          <>
            <strong>Dequeue:</strong> read <code>front</code>, then{" "}
            <code>front = (front + 1) % size</code>.<Cite n={2} />
          </>,
        ],
      },
      {
        kind: "p",
        node: (
          <>
            <em>Example:</em> in a size-5 buffer, after filling and removing three
            elements, <code>rear</code> wraps to index 0 and keeps filling — no
            shifting needed.<Cite n={3} />
          </>
        ),
      },
    ];
  }

  return [
    { kind: "h", text: "Definition" },
    {
      kind: "p",
      node: (
        <>
          A <strong>circular queue</strong> (ring buffer) is a linear data structure
          that follows FIFO, in which the last position is connected back to the
          first to form a circle. This eliminates the space wastage of a linear
          queue, where freed front slots could never be reused.<Cite n={1} />
        </>
      ),
    },
    { kind: "h", text: "Explanation" },
    {
      kind: "p",
      node: (
        <>
          The queue maintains <code>front</code> and <code>rear</code> pointers and a
          fixed <code>size</code>. Both pointers advance modulo <code>size</code>, so
          the buffer logically wraps around. The queue is <strong>full</strong> when{" "}
          <code>(rear + 1) % size == front</code> and <strong>empty</strong> when{" "}
          <code>front == rear</code>.<Cite n={1} />
          <Cite n={2} />
        </>
      ),
    },
    { kind: "h", text: "Algorithm" },
    {
      kind: "code",
      lines: [
        "enqueue(x):",
        "  if (rear + 1) % size == front: return FULL",
        "  rear = (rear + 1) % size",
        "  arr[rear] = x",
        "",
        "dequeue():",
        "  if front == rear: return EMPTY",
        "  x = arr[(front + 1) % size]",
        "  front = (front + 1) % size",
        "  return x",
      ],
    },
    { kind: "diagram", label: "Fig. 1 — ring buffer with front / rear wrapping (size = 5)" },
    { kind: "h", text: "Advantages & applications" },
    {
      kind: "points",
      items: [
        <>Reuses memory that a linear queue wastes after wrap-around.<Cite n={2} /></>,
        <>O(1) enqueue and dequeue with no element shifting.<Cite n={3} /></>,
        <>Used in CPU scheduling, traffic systems and fixed-size buffers.<Cite n={3} /></>,
      ],
    },
    {
      kind: "verdict",
      node: (
        <>
          The circular queue trades a single &ldquo;full&rdquo; slot for constant-time
          wrap-around reuse — the standard fix for linear-queue space wastage.<Cite n={1} />
        </>
      ),
    },
  ];
}

/* ── Block renderer ────────────────────────────────────────── */
function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "h":
      return (
        <h4 className="mt-5 text-[15px] font-bold text-[var(--color-fg)] first:mt-0">
          {block.text}
        </h4>
      );
    case "p":
      return <p className="mt-2.5 text-[14.5px] leading-[1.75] text-[var(--color-muted)]">{block.node}</p>;
    case "points":
      return (
        <ul className="mt-2.5 space-y-1.5 pl-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-[14.5px] leading-[1.7] text-[var(--color-muted)]">
              <span className="mt-[0.65em] h-1 w-1 shrink-0 rounded-full bg-[var(--color-brand-accent)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-line)] bg-[#0a0a0c] p-4 font-mono text-[12px] leading-[1.7] text-[#d4d4d4]">
          {block.lines.join("\n")}
        </pre>
      );
    case "diagram":
      return (
        <div className="mt-3 flex h-24 items-center justify-center rounded-xl border border-dashed border-[rgba(229,9,20,0.35)] bg-[rgba(229,9,20,0.04)]">
          <span className="font-mono text-[11px] text-[var(--color-faint)]">{block.label}</span>
        </div>
      );
    case "verdict":
      return (
        <p className="mt-4 border-l-2 border-[var(--color-brand)] bg-[rgba(229,9,20,0.05)] py-2 pl-4 pr-3 text-[14px] leading-[1.7] text-[var(--color-fg)]">
          {block.node}
        </p>
      );
  }
}

/* ── The act ───────────────────────────────────────────────── */
export function MarksAct() {
  const reduced = useReducedMotion();
  const [marks, setMarks] = useState(5);
  const blocks = blocksFor(marks);

  return (
    <section id="marks-act" className="relative overflow-hidden px-6 py-28 md:px-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(45% 40% at 15% 30%, rgba(229,9,20,0.05), transparent 70%)" }}
      />

      <div className="mx-auto w-full max-w-5xl">
        <Reveal>
          <ActMarker num="04" title="The format" />
        </Reveal>

        <Reveal delay={0.05}>
          <h2 className="mt-10 max-w-3xl font-bold">
            The same concept.{" "}
            <span className="text-[var(--color-brand-accent)]">Written for the marks available.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-muted)]">
            A two-mark answer should not read like an essay. A ten-mark answer should
            not stop after three lines. VibeGPT adjusts the structure and depth to
            suit the question.
          </p>
        </Reveal>

        {/* Question + marks selector */}
        <Reveal delay={0.15}>
          <div className="mt-12 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="font-mono text-[13px] text-[var(--color-fg)]">
                <span className="text-[var(--color-faint)]">Q.</span> Explain the working
                of a circular queue{" "}
                <span className="text-[var(--color-brand-accent)]">for {marks} marks</span>.
              </p>
              <div className="flex gap-2" role="group" aria-label="Select marks">
                {[2, 5, 10].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMarks(m)}
                    aria-pressed={marks === m}
                    className={`chip !px-5 !py-2 transition-all duration-200 hover:scale-[1.05] hover:border-[rgba(229,9,20,0.4)] ${marks === m ? "active" : ""}`}
                  >
                    {m} marks
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        {/* Morphing answer panel */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] transition-all duration-300 hover:border-[rgba(255,255,255,0.12)]">
          {/* Panel title bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-3.5 md:px-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-brand)] text-[11px] font-bold text-white">
                V
              </span>
              <span className="text-[13px] font-semibold text-[var(--color-fg)]">
                VibeGPT answer
              </span>
              <span className="font-mono text-[11px] text-[var(--color-faint)]">
                Data Structures · Module 3
              </span>
            </div>
            <AnimatePresence mode="wait">
              <motion.span
                key={marks}
                className="font-mono text-[11px] tabular-nums text-[var(--color-brand-accent)]"
                initial={reduced ? { opacity: 1 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                target {WINDOWS[marks]}
              </motion.span>
            </AnimatePresence>
          </div>

          {/* Answer body — restructures per marks */}
          <div className="px-5 py-6 md:px-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={marks}
                initial={reduced ? { opacity: 1 } : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                {blocks.map((block, i) => (
                  <motion.div
                    key={`${marks}-${i}`}
                    initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.08 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <BlockView block={block} />
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Sources footer */}
          <div className="border-t border-[var(--color-line)] px-5 py-4 md:px-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="mono-label text-[var(--color-faint)]">Sources</span>
              {SOURCES.map((s) => (
                <span key={s.n} className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-muted)]">
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full border border-[rgba(229,9,20,0.4)] bg-[rgba(229,9,20,0.12)] px-1 font-bold text-[var(--color-brand-accent)]">
                    {s.n}
                  </span>
                  {s.name} · {s.loc}
                </span>
              ))}
            </div>
          </div>
        </div>

        <Reveal delay={0.1}>
          <p className="mt-5 font-mono text-[11px] leading-relaxed text-[var(--color-faint)]">
            Answers are grounded in the materials your institution provides. Review
            against the cited source when academic accuracy is critical.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
