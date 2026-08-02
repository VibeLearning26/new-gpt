"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { publicApi, type ApiPublicStats } from "@/lib/api";
import { ActMarker, Counter, Reveal } from "./primitives";

const APP_VERSION = "0.2.0";
const DEV_PROGRESS = 78;

const RECENT_UPDATES = [
  { tag: "new", text: "Multi-model gateway — switch between 7 free models" },
  { tag: "new", text: "Chat sessions — your conversations persist" },
  { tag: "improved", text: "Marks-aware answers (2 / 5 / 10)" },
  { tag: "improved", text: "Citations you can open and verify" },
];

export function MetricsAct() {
  const reduced = useReducedMotion();
  const [stats, setStats] = useState<ApiPublicStats | null>(null);

  useEffect(() => {
    let alive = true;
    publicApi
      .getStats()
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch(() => {});
    publicApi.trackVisit().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section id="metrics-act" className="relative overflow-hidden px-6 py-28 md:px-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(45% 40% at 12% 25%, rgba(229,9,20,0.05), transparent 70%)" }}
      />

      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <ActMarker num="02" title="Live status" />
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          {/* Left — live numbers */}
          <div>
            <Reveal delay={0.05}>
              <h2 className="font-bold">
                The campus is{" "}
                <span className="text-[var(--color-brand-accent)]">asking.</span>
              </h2>
            </Reveal>

            <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-10">
              {/* Active now — live pulse */}
              <Reveal delay={0.1}>
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-[#22c55e]" />
                  </span>
                  <span className="mono-label text-[var(--color-faint)]">active right now</span>
                </div>
                <div className="mt-3 text-[clamp(2.6rem,6vw,4rem)] font-bold tabular-nums text-[var(--color-fg)] transition-colors duration-200 hover:text-[var(--color-brand-accent)]">
                  {stats ? stats.active_now : "–"}
                </div>
              </Reveal>

              {/* Total visitors */}
              <Reveal delay={0.15}>
                <span className="mono-label text-[var(--color-faint)]">visitors to date</span>
                <div className="mt-3 text-[clamp(2.6rem,6vw,4rem)] font-bold tabular-nums text-[var(--color-brand-accent)] transition-colors duration-200 hover:text-[var(--color-fg)]">
                  {stats ? <Counter target={stats.total_visitors} /> : "–"}
                </div>
              </Reveal>

              {/* Questions asked */}
              <Reveal delay={0.2}>
                <span className="mono-label text-[var(--color-faint)]">questions answered</span>
                <div className="mt-3 text-[clamp(2rem,4.5vw,3rem)] font-bold tabular-nums text-[var(--color-fg)] transition-colors duration-200 hover:text-[var(--color-brand-accent)]">
                  {stats ? <Counter target={stats.total_questions} /> : "–"}
                </div>
              </Reveal>

              {/* Active 24h */}
              <Reveal delay={0.25}>
                <span className="mono-label text-[var(--color-faint)]">active in last 24h</span>
                <div className="mt-3 text-[clamp(2rem,4.5vw,3rem)] font-bold tabular-nums text-[var(--color-fg)] transition-colors duration-200 hover:text-[var(--color-brand-accent)]">
                  {stats ? <Counter target={stats.active_24h} /> : "–"}
                </div>
              </Reveal>
            </div>

            {/* Content scale strip */}
            <Reveal delay={0.3}>
              <div className="mt-12 flex flex-wrap gap-x-10 gap-y-4 border-t border-[var(--color-line)] pt-8">
                {[
                  { v: stats?.total_subjects, label: "subjects" },
                  { v: stats?.published_documents, label: "published docs" },
                  { v: stats?.total_chunks, label: "indexed chunks" },
                ].map((item) => (
                  <div key={item.label} className="flex items-baseline gap-2.5">
                    <span className="text-2xl font-bold tabular-nums text-[var(--color-fg)] transition-colors duration-200 hover:text-[var(--color-brand-accent)]">
                      {item.v != null ? <Counter target={item.v} /> : "–"}
                    </span>
                    <span className="text-[13px] text-[var(--color-muted)]">{item.label}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Right — version, progress, updates */}
          <div className="space-y-8">
            <Reveal delay={0.15}>
              <div className="card !p-6 transition-all duration-300 hover:translate-y-[-3px] hover:border-[rgba(229,9,20,0.25)]">
                <div className="flex items-center justify-between">
                  <span className="mono-label text-[var(--color-faint)]">current release</span>
                  <span className="rounded-full border border-[rgba(229,9,20,0.4)] bg-[rgba(229,9,20,0.12)] px-3 py-1 font-mono text-[12px] font-bold text-[var(--color-brand-accent)]">
                    v{APP_VERSION}
                  </span>
                </div>
                <div className="mt-5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-semibold text-[var(--color-fg)]">
                      Development progress
                    </span>
                    <span className="font-mono text-[13px] font-bold tabular-nums text-[var(--color-brand-accent)]">
                      {DEV_PROGRESS}%
                    </span>
                  </div>
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--color-line)]">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#7a0a10] to-[#ff2a2a]"
                      style={{ boxShadow: "0 0 12px -2px rgba(229,9,20,0.6)" }}
                      initial={reduced ? { width: `${DEV_PROGRESS}%` } : { width: 0 }}
                      whileInView={{ width: `${DEV_PROGRESS}%` }}
                      viewport={{ once: true, amount: 0.5 }}
                      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.25}>
              <div>
                <span className="mono-label text-[var(--color-faint)]">recent updates</span>
                <div className="mt-4 space-y-3">
                  {RECENT_UPDATES.map((u) => (
                    <div key={u.text} className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 shrink-0 rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${
                          u.tag === "new"
                            ? "bg-[rgba(229,9,20,0.14)] text-[var(--color-brand-accent)]"
                            : "bg-[rgba(79,157,255,0.12)] text-[#4f9dff]"
                        }`}
                      >
                        {u.tag}
                      </span>
                      <span className="text-[13.5px] leading-relaxed text-[var(--color-muted)]">
                        {u.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
