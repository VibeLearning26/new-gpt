"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Dither from "@/components/ui/Dither";
import { MaskLine, MagneticButton } from "./primitives";
import { ChatSim } from "./ChatSim";
import { ChevronRight } from "reicon-react";

export function HeroAct() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  /* Stop the WebGL field when it's off-screen — no reason to burn GPU
     on frames nobody sees. */
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      /* Remount the field 240px before it scrolls back into view so the
         first frame is ready before the user sees it. */
      { threshold: 0, rootMargin: "240px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const seeHow = () =>
    document.getElementById("pipeline-act")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });

  return (
    <section ref={sectionRef} id="hero-act" className="relative flex min-h-screen items-center overflow-hidden pb-28 pt-24">
      {/* Ambient dither field — fully unmounted while off-screen so the
         WebGL context costs nothing below the fold. */}
      {heroVisible && (
        <div className="absolute inset-0 -z-10">
          <Dither
            waveColor={[0.9, 0.04, 0.08]}
            enableMouseInteraction={false}
            disableAnimation={Boolean(reduced)}
          />
        </div>
      )}
      {/* Real radial atmosphere (bottom fades into the next act) */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55% 45% at 72% 38%, rgba(229,9,20,0.075), transparent 70%), linear-gradient(to bottom, transparent 55%, var(--color-bg) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-14 px-6 md:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20">
        {/* Left — the claim */}
        <div>
          <motion.div
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <p
              className="flex flex-wrap items-center gap-x-3 text-[clamp(1.05rem,2.3vw,1.7rem)] font-bold uppercase leading-none tracking-[0.06em]"
              style={{ fontFamily: "var(--font-display, inherit)" }}
            >
              <span className="inline-block h-[0.7em] w-[0.7em] rounded-sm bg-[var(--color-brand)]" aria-hidden />
              <span className="text-[var(--color-brand-accent)]">RAG-powered</span>
              <span className="text-[var(--color-fg)]">campus study agent</span>
            </p>
          </motion.div>

          <h1 className="mt-7 font-bold">
            <MaskLine delay={0.2}>Ask your</MaskLine>
            <MaskLine delay={0.3}>notes. They</MaskLine>
            <MaskLine delay={0.4}>
              actually{" "}
              <span className="relative inline-block text-[var(--color-brand-accent)]">
                answer.
                <motion.span
                  className="absolute -bottom-1 left-0 h-[0.09em] w-full origin-left rounded-full bg-[var(--color-brand)]"
                  initial={reduced ? { scaleX: 1 } : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.8, delay: 1.15, ease: [0.16, 1, 0.3, 1] }}
                />
              </span>
            </MaskLine>
          </h1>

          <motion.p
            className="mt-8 max-w-md text-lg leading-relaxed text-[var(--color-muted)]"
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
          >
            VibeGPT reads the PDFs, slides and question banks your professors gave
            you — then writes exam-ready answers, cited to the page.
          </motion.p>

          <motion.div
            className="mt-10 flex flex-col gap-4 sm:flex-row"
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <MagneticButton href="/login" variant="primary" icon={<ChevronRight size={18} />}>
              Open VibeGPT
            </MagneticButton>
            <MagneticButton onClick={seeHow} variant="ghost">
              See how it thinks
            </MagneticButton>
          </motion.div>
        </div>

        {/* Right — the product, live */}
        <motion.div
          initial={reduced ? { opacity: 1, x: 0 } : { opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          {/* Glow seat behind the card */}
          <div
            className="pointer-events-none absolute -inset-10 -z-10"
            style={{ background: "radial-gradient(60% 60% at 50% 45%, rgba(229,9,20,0.13), transparent 75%)" }}
          />
          <ChatSim />
        </motion.div>
      </div>
    </section>
  );
}
