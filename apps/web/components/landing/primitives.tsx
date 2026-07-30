"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useMotionValue,
  useSpring,
} from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ── Reveal: cinematic fade + rise on first intersection ────── */
export function Reveal({
  children,
  delay = 0,
  className = "",
  y = 32,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ── MaskLine: headline line rising out of an overflow mask ── */
export function MaskLine({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <span className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
      <motion.span
        className={`block will-change-transform ${className}`}
        initial={reduced ? { y: 0 } : { y: "112%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.9, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/* ── Counter: easeOutExpo count-up on first intersection ───── */
export function Counter({
  target,
  duration = 1.6,
  className = "",
  suffix = "",
}: {
  target: number;
  duration?: number;
  className?: string;
  suffix?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / (duration * 1000), 1);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setCount(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration, reduced]);

  const shown = reduced ? target : count;

  return (
    <div ref={ref} className={className}>
      {shown.toLocaleString()}
      {suffix ? <span className="ml-1">{suffix}</span> : null}
    </div>
  );
}

/* ── Marquee: seamless loop (content duplicated, -50% travel) ─ */
export function Marquee({
  children,
  className = "",
  speed = 30,
}: {
  children: ReactNode;
  className?: string;
  speed?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <div className={`overflow-hidden ${className}`}>
      <motion.div
        className="flex w-max whitespace-nowrap will-change-transform"
        animate={reduced ? { x: 0 } : { x: ["0%", "-50%"] }}
        transition={{ duration: speed, repeat: Infinity, ease: "linear" }}
      >
        {children}
        {children}
      </motion.div>
    </div>
  );
}

/* ── MagneticButton: cursor-attracted CTA ──────────────────── */
export function MagneticButton({
  children,
  href,
  onClick,
  className = "",
  variant = "primary",
  icon,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  variant?: "primary" | "ghost";
  icon?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 22 });
  const sy = useSpring(y, { stiffness: 260, damping: 22 });

  const handleMove = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * 0.24);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.24);
  };
  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  const Element = href ? "a" : "button";
  const props = href ? { href } : { onClick };

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      whileHover={reduced ? {} : { scale: 1.04 }}
      whileTap={reduced ? {} : { scale: 0.96 }}
      className="inline-block"
    >
      <Element {...props} className={`${variant === "primary" ? "btn-primary" : "btn-ghost"} ${className}`}>
        {icon ? <span className="inline-flex">{icon}</span> : null}
        {children}
      </Element>
    </motion.div>
  );
}

/* ── MonoLabel ─────────────────────────────────────────────── */
export function MonoLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mono-label ${className}`}>{children}</div>;
}

/* ── ActMarker: theatrical chapter label with hairline ─────── */
export function ActMarker({ num, title, className = "" }: { num: string; title: string; className?: string }) {
  return (
    <div className={`act-marker ${className}`}>
      <b>ACT {num}</b>
      <span>{title}</span>
    </div>
  );
}

/* ── TypeWriter ────────────────────────────────────────────── */
export function TypeWriter({
  text,
  speed = 30,
  className = "",
}: {
  text: string;
  speed?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (reduced) return;
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, reduced]);

  const shown = reduced ? text : typed;

  return (
    <span className={className}>
      {shown}
      {!reduced && typed.length < text.length ? (
        <span className="ml-0.5 inline-block h-[1.05em] w-[7px] animate-pulse align-text-bottom bg-[var(--color-brand-accent)]" />
      ) : null}
    </span>
  );
}

/* ── PulsingDots ───────────────────────────────────────────── */
export function PulsingDots({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <div className={`flex gap-2 ${className}`}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-[var(--color-brand)]"
          animate={reduced ? { scale: 1, opacity: 1 } : { scale: [0.8, 1.25, 0.8], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

/* ── Stagger pair ──────────────────────────────────────────── */
export function StaggerContainer({
  children,
  className = "",
  staggerDelay = 0.08,
}: {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={{
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: staggerDelay } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: reduced ? 0 : 22 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

/* ── ScrollCue ─────────────────────────────────────────────── */
export function ScrollCue({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="relative w-px h-16 bg-[var(--color-line)]">
        <motion.div
          className="absolute top-0 left-1/2 w-1.5 h-1.5 rounded-full bg-[var(--color-brand)] -translate-x-1/2"
          animate={reduced ? { y: 0 } : { y: [0, 58, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <MonoLabel>scroll</MonoLabel>
    </div>
  );
}

/* ── Preloader: brand moment before the story starts ───────── */
export function Preloader() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"show" | "exit" | "done">(reduced ? "done" : "show");
  const [count, setCount] = useState(reduced ? 100 : 0);
  const locked = !reduced && phase !== "done";

  /* Scroll lock lives and dies with `locked` — guaranteed to release. */
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);

  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const dur = 1500;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      setCount(Math.floor(p * 100));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setPhase("exit");
        timer = setTimeout(() => setPhase("done"), 950);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [reduced]);

  if (phase === "done") return null;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505]"
      initial={false}
      animate={phase === "exit" ? { y: "-100%" } : { y: 0 }}
      transition={{ duration: 0.85, ease: [0.87, 0, 0.13, 1] }}
      aria-hidden={phase === "exit"}
    >
      <div
        className="text-4xl font-bold tabular-nums tracking-[-0.02em] text-[var(--color-brand-accent)] md:text-5xl"
        style={{ fontFamily: "var(--font-display, inherit)" }}
      >
        {String(count).padStart(3, "0")}
        <span className="ml-1 text-xl text-[var(--color-faint)] md:text-2xl">%</span>
      </div>
      <div className="mt-8 overflow-hidden">
        <motion.div
          className="text-5xl font-bold tracking-[-0.04em] text-[var(--color-fg)] md:text-6xl"
          style={{ fontFamily: "var(--font-display, inherit)" }}
          initial={{ y: "110%" }}
          animate={{ y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          VIBE<span className="text-[var(--color-brand-accent)]">GPT</span>
        </motion.div>
      </div>
      <div className="mono-label mt-7 flex items-center gap-4 text-[var(--color-faint)]">
        <span>indexing 561 subjects</span>
      </div>
      <div className="mt-4 h-px w-52 overflow-hidden bg-[var(--color-line)]">
        <div
          className="h-full origin-left bg-[var(--color-brand)]"
          style={{ transform: `scaleX(${count / 100})`, transition: "transform 60ms linear" }}
        />
      </div>
    </motion.div>
  );
}

/* ── ActRail: fixed chapter navigator (desktop) ────────────── */
const ACTS = [
  { id: "hero-vjec", n: "00" },
  { id: "prologue", n: "01" },
  { id: "pipeline-act", n: "02" },
  { id: "citations-act", n: "03" },
  { id: "marks-act", n: "04" },
  { id: "demo-act", n: "05" },
  { id: "metrics-act", n: "06" },
  { id: "deck-act", n: "07" },
  { id: "outcome-act", n: "08" },
  { id: "finale-act", n: "09" },
];

export function ActRail() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const i = ACTS.findIndex((a) => a.id === entry.target.id);
            if (i >= 0) setActive(i);
          }
        }
      },
      { threshold: 0.35 },
    );
    ACTS.forEach((a) => {
      const el = document.getElementById(a.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Story chapters"
      className="fixed right-7 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-4 lg:flex"
    >
      {ACTS.map((a, i) => (
        <button
          key={a.id}
          onClick={() =>
            document.getElementById(a.id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" })
          }
          className="group flex items-center gap-2.5"
          aria-label={`Go to act ${a.n}`}
        >
          <span
            className={`mono-label transition-opacity duration-300 ${
              i === active ? "text-[var(--color-brand-accent)] opacity-100" : "opacity-0 group-hover:opacity-70"
            }`}
          >
            {a.n}
          </span>
          <span
            className={`block h-1.5 rounded-full transition-all duration-300 ${
              i === active
                ? "w-6 bg-[var(--color-brand)]"
                : "w-1.5 bg-[var(--color-line)] group-hover:bg-[var(--color-faint)]"
            }`}
          />
        </button>
      ))}
    </nav>
  );
}
