"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useScroll } from "motion/react";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollYProgress } = useScroll();

  useEffect(() => {
    const unsub = scrollYProgress.on("change", (v) => setScrolled(v > 0.02));
    return () => unsub();
  }, [scrollYProgress]);

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-300"
      style={{
        backdropFilter: scrolled ? "blur(12px)" : "none",
        backgroundColor: scrolled ? "rgba(5,5,5,0.88)" : "transparent",
        borderColor: scrolled ? "var(--color-line)" : "transparent",
      }}
    >
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
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

        <a
          href="/login"
          className="rounded-full bg-[var(--color-brand)] px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--color-brand-accent)] hover:shadow-[0_0_16px_rgba(229,9,20,0.35)]"
        >
          Open VibeGPT
        </a>
      </nav>
    </motion.header>
  );
}
