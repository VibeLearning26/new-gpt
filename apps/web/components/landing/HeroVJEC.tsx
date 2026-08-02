"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { ChevronRight, Download } from "reicon-react";

export function HeroVJEC() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  /* Mouse parallax on the artwork */
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const px = useSpring(mx, { stiffness: 45, damping: 20 });
  const py = useSpring(my, { stiffness: 45, damping: 20 });

  /* Card tilt — award-style 3D magnetic effect */
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springTiltX = useSpring(tiltX, { stiffness: 150, damping: 20 });
  const springTiltY = useSpring(tiltY, { stiffness: 150, damping: 20 });
  const glareX = useSpring(0, { stiffness: 150, damping: 20 });
  const glareY = useSpring(0, { stiffness: 150, damping: 20 });

  const handleMove = (e: React.MouseEvent) => {
    if (reduced || !sectionRef.current) return;
    const r = sectionRef.current.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 14);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 9);

    if (!cardRef.current) return;
    const cr = cardRef.current.getBoundingClientRect();
    const cx = (e.clientX - cr.left) / cr.width - 0.5;
    const cy = (e.clientY - cr.top) / cr.height - 0.5;
    tiltX.set(-cy * 8);
    tiltY.set(cx * 8);
    glareX.set(cx * 50);
    glareY.set(cy * 50);
  };

  const handleLeave = () => {
    setHovered(false);
    tiltX.set(0);
    tiltY.set(0);
    glareX.set(0);
    glareY.set(0);
  };

  return (
    <section
      ref={sectionRef}
      id="hero-vjec"
      onMouseMove={handleMove}
      className="relative flex min-h-screen items-center overflow-hidden bg-[var(--color-bg)]"
    >
      {/* Ambient atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(40% 36% at 80% 40%, rgba(229,9,20,0.09), transparent 70%), radial-gradient(28% 28% at 10% 82%, rgba(229,9,20,0.05), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-8">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1fr_1.08fr] lg:gap-14">
          {/* Left — the copy */}
          <div>
            <motion.div
              className="mono-label mb-6 flex items-center gap-3 text-[var(--color-brand-accent)]"
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="inline-block h-px w-10 bg-[var(--color-brand-accent)]" />
              Vimal Jyothi Engineering College
            </motion.div>

            <motion.h1
              className="font-bold"
              initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              Your campus.
              <br />
              Your notes.
              <br />
              <span className="text-[var(--color-brand-accent)]">One clear answer.</span>
            </motion.h1>

            <motion.p
              className="mt-7 max-w-xl text-lg leading-relaxed text-[var(--color-muted)]"
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              VibeGPT reads the PDFs, slides and question banks uploaded by your
              campus, then writes exam-ready answers — cited to the page, shaped to
              the marks.
            </motion.p>

            {/* Smart CTA — desktop: web app · mobile: app setup */}
            <motion.div
              className="mt-10"
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="hidden items-center gap-4 md:flex">
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand)] px-7 py-3.5 text-[15px] font-bold text-white transition-all hover:bg-[var(--color-brand-accent)] hover:shadow-[0_0_28px_rgba(229,9,20,0.45)]"
                >
                  Open VibeGPT
                  <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
                </Link>
              </div>

              <div className="flex flex-col gap-4 md:hidden">
                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand)] px-7 py-4 text-base font-bold text-white transition-all hover:bg-[var(--color-brand-accent)]"
                >
                  <Download size={18} />
                  Get VibeGPT
                </Link>
                <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                  <p className="text-[13px] font-semibold text-[var(--color-fg)]">
                    Install on your phone
                  </p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
                    <li>Open this site in your browser</li>
                    <li>Tap Share → Add to Home Screen</li>
                    <li>Sign in with your campus account</li>
                  </ol>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right — VJEC artwork with award-winning hover */}
          <motion.div
            className="relative lg:mr-6"
            initial={reduced ? { opacity: 1, x: 0 } : { opacity: 0, x: 44 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div style={reduced ? undefined : { x: px, y: py }}>
              <motion.div
                ref={cardRef}
                className="relative cursor-default"
                style={{
                  perspective: 800,
                  transformStyle: "preserve-3d",
                }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={handleLeave}
              >
                {/* The image panel with 3D tilt */}
                <motion.div
                  className="relative h-[82vh] min-h-[520px] max-h-[800px] w-full overflow-hidden rounded-2xl"
                  style={{
                    rotateX: springTiltX,
                    rotateY: springTiltY,
                    transformStyle: "preserve-3d",
                    boxShadow: hovered
                      ? "0 25px 60px -12px rgba(0,0,0,0.6), 0 0 40px -8px rgba(255,255,255,0.04)"
                      : "0 20px 40px -12px rgba(0,0,0,0.5)",
                    transition: "box-shadow 0.5s ease",
                  }}
                >
                  <Image
                    src="/VJEC.png"
                    alt="Vimal Jyothi Engineering College — pixel artwork"
                    fill
                    priority
                    sizes="(min-width: 1024px) 53vw, 100vw"
                    className="object-cover object-center transition-all duration-700"
                    style={{
                      filter: hovered
                        ? "saturate(1.25) brightness(1.08) contrast(1.05)"
                        : "saturate(1.05)",
                      transform: hovered ? "scale(1.04)" : "scale(1)",
                      transition: "filter 0.7s ease, transform 0.7s ease",
                    }}
                  />

                  {/* Glare / light sweep across the card on hover */}
                  <motion.div
                    className="pointer-events-none absolute inset-0 rounded-2xl"
                    style={{
                      background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15), transparent 60%)",
                      opacity: hovered ? 1 : 0,
                      x: glareX,
                      y: glareY,
                      transition: "opacity 0.4s ease",
                    }}
                  />

                  {/* Bottom fade */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[var(--color-bg)]/80 to-transparent" />

                  {/* Caption that slides up on hover */}
                  <motion.div
                    className="absolute inset-x-0 bottom-0 flex items-end p-6"
                    initial={false}
                    animate={{ y: hovered ? 0 : 12, opacity: hovered ? 1 : 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="flex items-center gap-3 rounded-xl bg-black/60 px-4 py-2.5 backdrop-blur-md">
                      <div className="h-2 w-2 rounded-full bg-[var(--color-brand)]" />
                      <span className="text-[13px] font-semibold text-white/90">Vimal Jyothi Engineering College</span>
                    </div>
                  </motion.div>
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
