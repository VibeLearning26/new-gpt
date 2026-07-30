"use client";

import { Counter, ActMarker, Reveal } from "./primitives";

/* Real seeded figures + clearly-labeled example scale. Swap for production
   numbers by editing this one block. */
const SCALE_STATS = [
  { value: 561, label: "Subjects indexed", note: "2024 course codes", real: true },
  { value: 9, label: "Departments covered", note: "across the campus", real: true },
  { value: 8, label: "Semesters deep", note: "full programme", real: true },
  { value: 120000, label: "Source chunks", note: "example scale", real: false, suffix: "+" },
  { value: 38000, label: "Pages searchable", note: "example scale", real: false, suffix: "+" },
  { value: 180, label: "Avg retrieval", note: "milliseconds", real: false, unit: "ms" },
];

export function ScaleAct() {
  return (
    <section id="scale-act" className="relative overflow-hidden px-6 py-28 md:px-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(45% 40% at 85% 30%, rgba(229,9,20,0.05), transparent 70%)" }}
      />

      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <ActMarker num="04" title="Campus knowledge at scale" />
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-14 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
          {/* Left — the claim */}
          <div>
            <Reveal delay={0.05}>
              <h2 className="font-bold">
                One searchable knowledge layer for{" "}
                <span className="text-[var(--color-brand-accent)]">the entire semester.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-6 text-lg leading-relaxed text-[var(--color-muted)]">
                Subjects, modules, notes, question banks and previous papers —
                organized around the questions students actually ask.
              </p>
            </Reveal>
            <Reveal delay={0.18}>
              <p className="mt-6 font-mono text-[11px] leading-relaxed text-[var(--color-faint)]">
                Figures marked &ldquo;example scale&rdquo; illustrate a pilot dataset.
                Live counts reflect your institution&rsquo;s uploaded library.
              </p>
            </Reveal>
          </div>

          {/* Right — the numbers, varied rather than a uniform grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-10">
            {SCALE_STATS.map((stat, i) => (
              <Reveal
                key={stat.label}
                delay={0.1 + i * 0.07}
                className={i === 0 ? "col-span-2 border-b border-[var(--color-line)] pb-8" : ""}
              >
                <div
                  className={`font-bold tabular-nums ${
                    i === 0
                      ? "text-[clamp(3.5rem,8vw,5.5rem)] text-[var(--color-brand-accent)]"
                      : "text-[clamp(2rem,4.5vw,3rem)] text-[var(--color-fg)]"
                  }`}
                >
                  <Counter target={stat.value} suffix={stat.suffix ?? ""} />
                  {stat.unit ? (
                    <span className="ml-1 text-[0.45em] font-semibold text-[var(--color-faint)]">
                      {stat.unit}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-[14px] font-semibold text-[var(--color-fg)]">{stat.label}</span>
                  {!stat.real && (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-faint)]">
                      · {stat.note}
                    </span>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
