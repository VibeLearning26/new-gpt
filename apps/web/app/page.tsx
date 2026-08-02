"use client";

import { LandingNav } from "@/components/landing/Navigation";
import { ContributorsAct } from "@/components/landing/ContributorsAct";
import { LandingFooter } from "@/components/landing/Footer";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "reicon-react";

/* Route-scoped fonts — display: swap, limited weights */
const FONT_STACKS = {
  display:
    '"Space Grotesk", "Instrument Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  body:
    '"Instrument Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono:
    '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
};

const EASE = [0.16, 1, 0.3, 1] as const;

export default function LandingPage() {
  const reduced = useReducedMotion();
  const show = (delay: number) =>
    reduced
      ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 22 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, delay, ease: EASE },
        };

  return (
    <main
      className="landing bg-[var(--color-bg)] text-[var(--color-fg)]"
      style={
        {
          "--font-display": FONT_STACKS.display,
          "--font-body": FONT_STACKS.body,
          "--font-mono": FONT_STACKS.mono,
        } as React.CSSProperties
      }
    >
      <LandingNav />

      {/* ── What it is + open the app ─────────────────────────── */}
      <section className="relative flex min-h-screen items-center overflow-hidden px-6 md:px-8">
        {/* ambient brand glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 45% at 72% 32%, rgba(229,9,20,0.10), transparent 70%), radial-gradient(38% 38% at 10% 82%, rgba(229,9,20,0.05), transparent 70%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-6xl pt-28 pb-24">
          <motion.p
            {...show(0.05)}
            className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-[var(--color-brand-accent)]"
          >
            <span className="inline-block h-px w-10 bg-[var(--color-brand-accent)]" />
            Vimal Jyothi Engineering College · Campus Study Agent
          </motion.p>

          <h1 className="mt-7 font-bold leading-[0.95] tracking-tight">
            <motion.span {...show(0.15)} className="block text-5xl sm:text-6xl lg:text-7xl">
              Your campus.
            </motion.span>
            <motion.span {...show(0.25)} className="block text-5xl sm:text-6xl lg:text-7xl">
              Your notes.
            </motion.span>
            <motion.span
              {...show(0.35)}
              className="block text-5xl text-[var(--color-brand-accent)] sm:text-6xl lg:text-7xl"
            >
              One clear answer.
            </motion.span>
          </h1>

          <motion.p
            {...show(0.5)}
            className="mt-8 max-w-xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg"
          >
            VibeGPT reads the PDFs, slides and question banks your college uploads,
            then writes exam-ready answers — cited to the page, shaped to the marks.
          </motion.p>

          <motion.div {...show(0.62)} className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-4">
            <a
              href="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-brand)] px-8 py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-[var(--color-brand-accent)] hover:shadow-[0_0_28px_rgba(229,9,20,0.4)]"
            >
              Open VibeGPT
              <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
            </a>
            <span className="font-mono text-[11px] tracking-wider text-[var(--color-faint)]">
              sign in with your campus account
            </span>
          </motion.div>
        </div>
      </section>

      {/* ── The people who built it ───────────────────────────── */}
      <ContributorsAct />

      <LandingFooter />
    </main>
  );
}
