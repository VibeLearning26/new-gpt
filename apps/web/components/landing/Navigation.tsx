"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";

const NAV_ITEMS = [
  { label: "How it works", href: "#pipeline-act" },
  { label: "Sources", href: "#citations-act" },
  { label: "Mark scheme", href: "#marks-act" },
  { label: "Scale", href: "#scale-act" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const pathname = usePathname();

  /* Anchor links need a "/" prefix when we're off the landing page */
  const resolveHref = (href: string) =>
    href.startsWith("#") && pathname !== "/" ? `/${href}` : href;

  useEffect(() => {
    const unsub = scrollYProgress.on("change", (v) => {
      setScrolled(v > 0.02);
      setScrollPct(Math.round(v * 100));
    });
    return () => unsub();
  }, [scrollYProgress]);

  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <>
      <motion.header
        className="fixed top-0 left-0 right-0 z-50 border-b border-transparent transition-colors duration-300"
        style={{
          backdropFilter: scrolled ? "blur(12px)" : "none",
          backgroundColor: scrolled ? "rgba(5,5,5,0.88)" : "transparent",
          borderColor: scrolled ? "var(--color-line)" : "transparent",
        }}
      >
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
          {/* Wordmark */}
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="VibeGPT logo"
              width={30}
              height={30}
              className="rounded-lg object-cover"
            />
            <span className="text-lg font-bold tracking-tight">
              <span className="text-[var(--color-brand-accent)]">Vibe</span>
              <span className="text-[var(--color-fg)]">GPT</span>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-8 md:flex">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={resolveHref(item.href)}
                className="text-sm font-medium text-[var(--color-muted)] transition-all duration-200 hover:text-[var(--color-fg)]"
              >
                {item.label}
              </a>
            ))}
            <a
              href="/login"
              className="rounded-full bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--color-brand-accent)] hover:shadow-[0_0_16px_rgba(229,9,20,0.35)]"
            >
              Open VibeGPT
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            className="flex flex-col gap-1.5 md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span className={`block h-0.5 w-5 bg-[var(--color-fg)] transition-transform ${mobileOpen ? "translate-y-1 rotate-45" : ""}`} />
            <span className={`block h-0.5 w-5 bg-[var(--color-fg)] transition-opacity ${mobileOpen ? "opacity-0" : ""}`} />
            <span className={`block h-0.5 w-5 bg-[var(--color-fg)] transition-transform ${mobileOpen ? "-translate-y-1 -rotate-45" : ""}`} />
          </button>
        </nav>

        {/* Scroll progress bar */}
        <motion.div className="h-px bg-[var(--color-brand)]" style={{ width: progressWidth }} />
      </motion.header>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <motion.div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#050505]/95 md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex flex-col items-center gap-8">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={resolveHref(item.href)}
                onClick={() => setMobileOpen(false)}
                className="text-2xl font-semibold text-[var(--color-fg)] transition-colors hover:text-[var(--color-brand-accent)]"
              >
                {item.label}
              </a>
            ))}
            <a
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="mt-4 rounded-full bg-[var(--color-brand)] px-8 py-3 text-lg font-bold text-white"
            >
              Open VibeGPT
            </a>
          </div>
        </motion.div>
      )}

      {/* Progress rail (desktop) — top right, below the nav */}
      {!reduced && (
        <div className="fixed right-5 top-20 z-40 hidden flex-col items-end gap-2 lg:flex">
          <span className="text-[10px] font-mono tabular-nums text-[var(--color-faint)]">
            {scrollPct}%
          </span>
          <div className="h-20 w-px overflow-hidden bg-[var(--color-line)]">
            <motion.div
              className="w-full origin-top bg-[var(--color-brand)]"
              style={{ scaleY: scrollYProgress, height: "100%" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
