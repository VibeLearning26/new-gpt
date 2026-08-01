"use client";

import { motion, useReducedMotion } from "motion/react";
import { MagneticButton, Marquee, MaskLine } from "./primitives";
import { ChevronRight } from "reicon-react";

const COURSE_CODES = [
  "UCEST105",
  "PCCST303",
  "UECSH201",
  "UECSE302",
  "PCCCS401",
  "UCEEC501",
  "UECSH102",
  "PCCCS204",
];

export function FinaleAct() {
  const reduced = useReducedMotion();

  return (
    <section id="finale-act" className="relative flex min-h-screen flex-col overflow-hidden px-6 pt-28 md:px-8">
      {/* Warm seat behind the climax */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(60% 50% at 50% 40%, rgba(229,9,20,0.09), transparent 70%)" }}
      />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center text-center">
        <h2 className="font-bold">
          <MaskLine>Exam season</MaskLine>
          <MaskLine delay={0.12}>
            just changed <span className="text-[var(--color-brand-accent)]">sides.</span>
          </MaskLine>
        </h2>

        <motion.p
          className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-[var(--color-muted)]"
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          Your materials already contain the answer. VibeGPT helps you reach it.
        </motion.p>

        <motion.div
          className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <MagneticButton href="/login" variant="primary" icon={<ChevronRight size={18} />} className="transition-all duration-300 hover:shadow-[0_0_30px_rgba(229,9,20,0.4)]">
            Open VibeGPT
          </MagneticButton>
          <MagneticButton href="#marks-act" variant="ghost" className="transition-all duration-200 hover:border-[rgba(229,9,20,0.4)] hover:text-[var(--color-fg)]">
            Explore a sample answer
          </MagneticButton>
        </motion.div>

        <motion.p
          className="mx-auto mt-8 max-w-md font-mono text-[11px] leading-relaxed text-[var(--color-faint)]"
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          Answers are generated from available academic materials and should be
          reviewed for accuracy.
        </motion.p>
      </div>

      {/* Course-code ticker — flows straight into the end credits below */}
      <div className="border-t border-[var(--color-line)] py-6">
        <Marquee speed={36} className="font-mono text-sm text-[var(--color-faint)]">
          <div className="flex gap-8 pr-8">
            {COURSE_CODES.map((code) => (
              <span key={code} className="flex items-center gap-8 whitespace-nowrap">
                {code}
                <span className="text-[var(--color-brand)]">·</span>
              </span>
            ))}
          </div>
        </Marquee>
      </div>
    </section>
  );
}
