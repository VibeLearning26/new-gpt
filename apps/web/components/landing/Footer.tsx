"use client";

import Link from "next/link";
import Image from "next/image";

const FOOTER_LINKS = [
  { label: "Product", href: "#hero-act" },
  { label: "How it works", href: "#pipeline-act" },
  { label: "Sources", href: "#citations-act" },
  { label: "Mark scheme", href: "#marks-act" },
  { label: "Team", href: "/team" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--color-line)] px-6 pb-10 pt-12 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="VibeGPT logo"
              width={28}
              height={28}
              className="rounded-lg object-cover transition-opacity duration-200 hover:opacity-80"
            />
            <span className="text-lg font-bold tracking-tight">
              <span className="text-[var(--color-brand-accent)]">Vibe</span>
              <span className="text-[var(--color-fg)]">GPT</span>
            </span>
          </Link>
          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-[var(--color-faint)]">
            A campus study agent that answers from the materials your institution
            provides.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-8 gap-y-3" aria-label="Footer">
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/login"
            className="text-[13px] font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]"
          >
            Sign in
          </a>
        </nav>
      </div>

      <div className="mx-auto mt-10 flex w-full max-w-6xl flex-col gap-2 border-t border-[var(--color-line)] pt-6 md:flex-row md:items-center md:justify-between">
        <p className="font-mono text-[11px] text-[var(--color-faint)]">
          © 2026 VibeGPT · Campus Study Agent
        </p>
        <p className="font-mono text-[11px] text-[var(--color-faint)]">
          Built for responsible academic use.
        </p>
      </div>
    </footer>
  );
}
