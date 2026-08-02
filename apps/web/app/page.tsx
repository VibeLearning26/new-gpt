"use client";

import { LandingNav } from "@/components/landing/Navigation";
import { HeroVJEC } from "@/components/landing/HeroVJEC";
import { MetricsAct } from "@/components/landing/MetricsAct";
import { ContributorsAct } from "@/components/landing/ContributorsAct";
import { LandingFooter } from "@/components/landing/Footer";

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

      {/* 1 — The main thing + the VJEC artwork */}
      <HeroVJEC />

      {/* 2 — Live stats & build updates */}
      <MetricsAct />

      {/* 3 — The caption + the people who built it */}
      <ContributorsAct />

      <LandingFooter />
    </main>
  );
}
