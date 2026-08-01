"use client";

import { LandingNav } from "@/components/landing/Navigation";
import { HeroVJEC } from "@/components/landing/HeroVJEC";
import { Prologue } from "@/components/landing/Prologue";
import { PipelineAct } from "@/components/landing/PipelineAct";
import { CitationsAct } from "@/components/landing/CitationsAct";
import { MarksAct } from "@/components/landing/MarksAct";
import { DemoAct } from "@/components/landing/DemoAct";
import { MetricsAct } from "@/components/landing/MetricsAct";
import { DeckAct } from "@/components/landing/DeckAct";
import { OutcomeAct } from "@/components/landing/OutcomeAct";
import { FinaleAct } from "@/components/landing/FinaleAct";
import { ContributorsAct } from "@/components/landing/ContributorsAct";
import { LandingFooter } from "@/components/landing/Footer";
import { ActRail } from "@/components/landing/primitives";

/* Route-scoped fonts — display: swap, limited weights */
const FONT_STACKS = {
  display:
    '"Space Grotesk", "Instrument Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  body:
    '"Instrument Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono:
    '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
};

export default function LandingPage() {
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
      <ActRail />

      {/* Chapter 1 — Hero (VJEC pixel art) + smart CTA */}
      <HeroVJEC />

      {/* Chapter 2 — The pressure */}
      <Prologue />

      {/* Chapter 3 — The search */}
      <PipelineAct />

      {/* Chapter 4 — The evidence */}
      <CitationsAct />

      {/* Chapter 5 — The format */}
      <MarksAct />

      {/* Chapter 6 — See it work (interactive demo) */}
      <DemoAct />

      {/* Chapter 7 — Live status (real metrics) */}
      <MetricsAct />

      {/* The command deck — for campuses */}
      <DeckAct />

      {/* Chapter 8 — The outcome */}
      <OutcomeAct />

      {/* Chapter 9 — The finale */}
      <FinaleAct />

      {/* End credits — the build crew */}
      <ContributorsAct />

      <LandingFooter />
    </main>
  );
}
