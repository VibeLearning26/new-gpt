"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Space_Grotesk, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { useReducedMotion } from "motion/react";
import { LandingNav } from "@/components/landing/Navigation";
import {
  Reveal,
  MaskLine,
  Marquee,
  MagneticButton,
  Counter,
  StaggerContainer,
  StaggerItem,
} from "@/components/landing/primitives";
import { ArrowLeft, ChevronRight } from "reicon-react";

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

/* ══════════════════════════════════════════════════════════════
   THE CREW — edit names, roles, and contributions here.
   `img` points to /public/devs/<name>.<ext>
   `span` controls card width on desktop (12-col grid).
   ══════════════════════════════════════════════════════════════ */

interface Member {
  name: string;
  img: string;
  role: string;
  credit: string;
  tags: string[];
  span: string;
  aspect: string;
  /** Scale the photo down (< 1) to zoom out — useful for portrait crops. */
  zoom?: number;
}

/* Bump this whenever photos in /public/devs are replaced, so browsers
   and the Next.js image optimizer re-fetch instead of serving stale copies. */
const IMG_V = 2;

const TEAM: Member[] = [
  {
    name: "Jis",
    img: "/devs/jis.jpeg",
    role: "Team Lead · Full-Stack",
    credit: "Architecture, agent orchestration & the glue that holds it together.",
    tags: ["Architecture", "Orchestration", "Next.js"],
    span: "lg:col-span-7",
    aspect: "aspect-[16/10]",
  },
  {
    name: "Abhin",
    img: "/devs/abhin.jpeg",
    role: "Backend Engineer",
    credit: "The FastAPI spine — auth, sessions and every endpoint.",
    tags: ["FastAPI", "Auth", "APIs"],
    span: "lg:col-span-5",
    aspect: "aspect-[4/3]",
  },
  {
    name: "Ajwel",
    img: "/devs/ajwel.jpeg",
    role: "Frontend Engineer",
    credit: "The chat, the landing page and every pixel you're looking at.",
    tags: ["React", "UI", "Motion"],
    span: "lg:col-span-4",
    aspect: "aspect-square",
  },
  {
    name: "Athul",
    img: "/devs/athul.jpeg",
    role: "ML Engineer",
    credit: "Embeddings, vector search and the reranking that makes it smart.",
    tags: ["Embeddings", "pgvector", "RAG"],
    span: "lg:col-span-4",
    aspect: "aspect-square",
  },
  {
    name: "Don",
    img: "/devs/don.jpeg",
    role: "Infrastructure & DevOps",
    credit: "Docker, Ollama and the servers that never sleep.",
    tags: ["Docker", "Ollama", "Deploy"],
    span: "lg:col-span-4",
    aspect: "aspect-square",
  },
  {
    name: "Nandhakishore",
    img: "/devs/nandhakishore.jpeg",
    role: "Data Engineer",
    credit: "Document parsing & the chunking pipeline that feeds the brain.",
    tags: ["Parsing", "Chunking", "ETL"],
    span: "lg:col-span-5",
    aspect: "aspect-[4/3]",
  },
  {
    name: "Nayana",
    img: "/devs/nayana.jpeg",
    role: "Product & Design",
    credit: "UX flows, the design system and why it all feels right.",
    tags: ["UX", "Design system", "Figma"],
    span: "lg:col-span-7",
    aspect: "aspect-[16/10]",
    zoom: 0.84,
  },
  {
    name: "Soorya",
    img: "/devs/soorya.jpeg",
    role: "QA & Evaluation",
    credit: "Evals, edge cases and the accuracy numbers we stand behind.",
    tags: ["Testing", "Evals", "Accuracy"],
    span: "lg:col-span-6",
    aspect: "aspect-[3/2]",
    zoom: 0.8,
  },
  {
    name: "Vishrutha",
    img: "/devs/vishrutha.jpeg",
    role: "Research & Prompts",
    credit: "Prompt engineering and the datasets that teach it to answer.",
    tags: ["Prompts", "Datasets", "Research"],
    span: "lg:col-span-6",
    aspect: "aspect-[3/2]",
  },
];

const STACK = [
  { group: "Frontend", items: ["Next.js", "React", "Tailwind", "Motion"] },
  { group: "Backend & RAG", items: ["FastAPI", "pgvector", "PostgreSQL", "Alembic"] },
  { group: "Models", items: ["Ollama", "LLM Gateway", "Embeddings", "Reranking"] },
  { group: "Infra & Ops", items: ["Docker", "Caddy", "Workers", "CI"] },
];

/* ── Spotlight card — cursor-tracked red glow + tilt ─────────── */

function SpotlightCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [hover, setHover] = useState(false);

  const handleMove = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group relative overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(229,9,20,0.35)] hover:shadow-[0_20px_50px_-16px_rgba(229,9,20,0.25)] ${className}`}
    >
      {/* cursor spotlight */}
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
        style={{
          opacity: hover ? 1 : 0,
          background: `radial-gradient(340px circle at ${pos.x}% ${pos.y}%, rgba(229,9,20,0.09), transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}

/* ── Member card ─────────────────────────────────────────────── */

function MemberCard({ m, index }: { m: Member; index: number }) {
  return (
    <SpotlightCard className={m.span}>
      {/* photo */}
      <div className={`relative ${m.aspect} overflow-hidden bg-[#0a0a0c]`}>
        <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.05]">
          <Image
            src={`${m.img}?v=${IMG_V}`}
            alt={m.name}
            fill
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-cover object-top transition-[filter] duration-700 group-hover:saturate-[1.15]"
            style={{
              filter: "saturate(0.85) contrast(1.04)",
              transform: m.zoom ? `scale(${m.zoom})` : undefined,
            }}
          />
        </div>
        {/* red duotone wash on hover */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(229,9,20,0.28)] via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        {/* bottom fade into card body */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--color-panel)] to-transparent" />
        {/* index */}
        <div className="absolute left-4 top-4 font-mono text-[11px] tracking-[0.2em] text-white/70">
          {String(index + 1).padStart(2, "0")}
        </div>
      </div>

      {/* info */}
      <div className="relative z-20 -mt-8 px-5 pb-6">
        <div className="mono-label mb-2 text-[var(--color-brand-accent)]">{m.role}</div>
        <h3
          className="text-3xl font-bold tracking-tight text-[var(--color-fg)] transition-colors duration-300 group-hover:text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {m.name}
        </h3>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--color-muted)]">{m.credit}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {m.tags.map((t) => (
            <span
              key={t}
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-1 font-mono text-[10.5px] text-[var(--color-faint)] transition-all duration-200 group-hover:border-[rgba(229,9,20,0.3)] group-hover:text-[var(--color-muted)]"
            >
              {t}
            </span>
          ))}
        </div>

        {/* accent bar that grows on hover */}
        <div className="mt-5 h-px w-full bg-[var(--color-line)]">
          <div className="h-px w-0 bg-[var(--color-brand)] transition-all duration-500 group-hover:w-full" />
        </div>
      </div>
    </SpotlightCard>
  );
}

/* ══════════════════════════════════════════════════════════════ */

export default function TeamPage() {
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

      {/* ── CREDITS HEADER ─────────────────────────────────── */}
      <section className="relative flex min-h-[88vh] items-end overflow-hidden pb-20 pt-32">
        {/* atmosphere */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(45% 40% at 85% 20%, rgba(229,9,20,0.10), transparent 70%), radial-gradient(30% 30% at 8% 85%, rgba(229,9,20,0.06), transparent 70%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 md:px-8">
          {/* top meta row */}
          <Reveal delay={0.1}>
            <div className="mono-label mb-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[var(--color-faint)]">
              <span className="flex items-center gap-2 text-[var(--color-brand-accent)]">
                <span className="inline-block h-px w-8 bg-[var(--color-brand-accent)]" />
                A Vimal Jyothi production
              </span>
              <span>credits</span>
              <span>S01 · 2025</span>
              <span className="hidden sm:inline">9 engineers · 1 campus</span>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 items-end gap-12 lg:grid-cols-[1.5fr_1fr]">
            {/* headline */}
            <h1 className="font-bold leading-[0.95]">
              <MaskLine delay={0.2}>THE PEOPLE</MaskLine>
              <MaskLine delay={0.32}>BEHIND THE</MaskLine>
              <MaskLine delay={0.44} className="text-[var(--color-brand-accent)]">
                ANSWERS.
              </MaskLine>
            </h1>

            {/* right rail — intro + stats */}
            <div>
              <Reveal delay={0.5}>
                <p className="max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
                  Nine engineers from Vimal Jyothi Engineering College who turned a
                  pile of campus PDFs into an agent that answers like a topper —
                  cited, mark-shaped, and always on.
                </p>
              </Reveal>

              <Reveal delay={0.62}>
                <div className="mt-8 grid grid-cols-3 gap-6 border-t border-[var(--color-line)] pt-6">
                  <div>
                    <Counter target={9} className="text-3xl font-bold text-[var(--color-fg)]" />
                    <div className="mono-label mt-1 text-[var(--color-faint)]">builders</div>
                  </div>
                  <div>
                    <Counter target={561} className="text-3xl font-bold text-[var(--color-fg)]" />
                    <div className="mono-label mt-1 text-[var(--color-faint)]">subjects</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-[var(--color-brand-accent)]">03:47</div>
                    <div className="mono-label mt-1 text-[var(--color-faint)]">avg debug hr</div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── NAME MARQUEE ───────────────────────────────────── */}
      <Marquee className="border-y border-[var(--color-line)] py-4" speed={26}>
        <div className="flex items-center">
          {TEAM.map((m) => (
            <span key={m.name} className="flex items-center">
              <span
                className="px-6 text-2xl font-bold uppercase tracking-tight text-[var(--color-fg)]/80 transition-colors hover:text-[var(--color-brand-accent)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {m.name}
              </span>
              <span className="text-[var(--color-brand)]">✦</span>
            </span>
          ))}
        </div>
      </Marquee>

      {/* ── THE ROSTER ─────────────────────────────────────── */}
      <section className="relative py-24">
        <div className="mx-auto w-full max-w-6xl px-6 md:px-8">
          <Reveal>
            <div className="mono-label mb-4 flex items-center gap-3 text-[var(--color-brand-accent)]">
              <span className="inline-block h-px w-8 bg-[var(--color-brand-accent)]" />
              The roster
            </div>
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
              Everyone shipped something.
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--color-muted)]">
              No figureheads. Every name below wrote code, broke a build, or argued
              about a pixel until it was right.
            </p>
          </Reveal>

          <StaggerContainer className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-12" staggerDelay={0.07}>
            {TEAM.map((m, i) => (
              <StaggerItem key={m.name} className={m.span}>
                <MemberCard m={m} index={i} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ── THE STACK ──────────────────────────────────────── */}
      <section className="border-t border-[var(--color-line)] py-24">
        <div className="mx-auto w-full max-w-6xl px-6 md:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.6fr]">
            <Reveal>
              <div className="mono-label mb-4 flex items-center gap-3 text-[var(--color-brand-accent)]">
                <span className="inline-block h-px w-8 bg-[var(--color-brand-accent)]" />
                The stack
              </div>
              <h2 className="text-4xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                Built on the boring stuff,
                <span className="text-[var(--color-brand-accent)]"> done well.</span>
              </h2>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
                Nothing exotic. Just proven tools assembled with care, so it keeps
                answering long after the demo ends.
              </p>
            </Reveal>

            <StaggerContainer className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2" staggerDelay={0.08}>
              {STACK.map((s) => (
                <StaggerItem key={s.group}>
                  <div className="mono-label mb-4 text-[var(--color-faint)]">{s.group}</div>
                  <div className="flex flex-wrap gap-2.5">
                    {s.items.map((item) => (
                      <span
                        key={item}
                        className="cursor-default rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2 text-[13.5px] font-medium text-[var(--color-muted)] transition-all duration-200 hover:scale-[1.06] hover:border-[rgba(229,9,20,0.4)] hover:bg-[rgba(229,9,20,0.08)] hover:text-[var(--color-fg)]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </div>
      </section>

      {/* ── FINALE ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-[var(--color-line)] py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(50% 60% at 50% 100%, rgba(229,9,20,0.10), transparent 70%)" }}
        />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 md:px-8">
          <Reveal>
            <div className="mono-label mb-6 flex items-center gap-3 text-[var(--color-faint)]">
              <span className="inline-block h-px w-8 bg-[var(--color-brand)]" />
              Made with too much chai
            </div>
            <h2 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
              Built at Vimal Jyothi.
              <br />
              <span className="text-[var(--color-brand-accent)]">For every campus.</span>
            </h2>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <MagneticButton href="/" variant="ghost" icon={<ArrowLeft size={17} />}>
                Back to the story
              </MagneticButton>
              <MagneticButton href="/login" variant="primary" icon={<ChevronRight size={17} />}>
                Open VibeGPT
              </MagneticButton>
            </div>
          </Reveal>

          <Reveal delay={0.25}>
            <p className="mt-14 font-mono text-[11px] text-[var(--color-faint)]">
              © 2026 VibeGPT · Vimal Jyothi Engineering College · directed by the 03:47 AM club
            </p>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
