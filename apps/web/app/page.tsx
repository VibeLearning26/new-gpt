"use client";

import { Space_Grotesk, Instrument_Sans, JetBrains_Mono } from "next/font/google";
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
import { LandingFooter } from "@/components/landing/Footer";
import { ActRail } from "@/components/landing/primitives";

/* Route-scoped fonts — display: swap, limited weights */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export default function LandingPage() {
  return (
    <main
      className={`landing ${spaceGrotesk.variable} ${instrumentSans.variable} ${jetbrainsMono.variable} bg-[var(--color-bg)] text-[var(--color-fg)]`}
      style={
        {
          "--font-display": spaceGrotesk.style.fontFamily,
          "--font-body": instrumentSans.style.fontFamily,
          "--font-mono": jetbrainsMono.style.fontFamily,
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

      <LandingFooter />
    </main>
  );
}
