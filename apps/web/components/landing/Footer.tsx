"use client";

import Link from "next/link";
import Image from "next/image";

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--color-line)] px-6 py-8 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="VibeGPT logo"
            width={26}
            height={26}
            className="rounded-lg object-cover transition-opacity duration-200 hover:opacity-80"
          />
          <span className="text-base font-bold tracking-tight">
            <span className="text-[var(--color-brand-accent)]">Vibe</span>
            <span className="text-[var(--color-fg)]">GPT</span>
          </span>
        </Link>

        <p className="font-mono text-[11px] text-[var(--color-faint)]">
          © 2026 VibeGPT · Vimal Jyothi Engineering College
        </p>
      </div>
    </footer>
  );
}
