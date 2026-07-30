"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { ActMarker, Counter, MonoLabel, Reveal, StaggerContainer, StaggerItem } from "./primitives";

const DOCUMENTS = [
  { name: "Unit3_OS_Notes.pdf", tag: "PDF", tone: "#ff5555", size: "3.8 MB", x: 8, y: 14, depth: 22 },
  { name: "DBMS_QB_2024.xlsx", tag: "XLS", tone: "#22c55e", size: "1.2 MB", x: 62, y: 18, depth: 34 },
  { name: "Thermodynamics_L7.pptx", tag: "PPT", tone: "#f5a623", size: "5.1 MB", x: 26, y: 56, depth: 16 },
  { name: "Maths_Laplace.pdf", tag: "PDF", tone: "#ff5555", size: "4.3 MB", x: 72, y: 62, depth: 28 },
  { name: "SE_Unit5.pdf", tag: "PDF", tone: "#ff5555", size: "3.5 MB", x: 48, y: 6, depth: 12 },
  { name: "CN_Unit1.pdf", tag: "PDF", tone: "#ff5555", size: "2.9 MB", x: 14, y: 78, depth: 30 },
  { name: "DAA_QB_2024.xlsx", tag: "XLS", tone: "#22c55e", size: "2.2 MB", x: 58, y: 84, depth: 20 },
];

function DocumentCard({
  doc,
  index,
  mx,
  my,
  scattered,
}: {
  doc: (typeof DOCUMENTS)[number];
  index: number;
  mx: ReturnType<typeof useSpring>;
  my: ReturnType<typeof useSpring>;
  scattered: boolean;
}) {
  const reduced = useReducedMotion();
  const px = useParallax(mx, doc.depth);
  const py = useParallax(my, doc.depth);
  const restRotation = (index % 2 === 0 ? -1 : 1) * (2 + (index % 3) * 2);

  return (
    /* Layer 1 — pile → scatter entrance */
    <motion.div
      className="absolute"
      style={{ left: `${doc.x}%`, top: `${doc.y}%` }}
      initial={
        reduced
          ? { x: "-50%", y: "-50%", opacity: 1, scale: 1, rotate: restRotation }
          : { x: "-50%", y: "-50%", opacity: 0, scale: 0.82, rotate: -16 + index * 6 }
      }
      animate={
        scattered
          ? { x: "-50%", y: "-50%", opacity: 1, scale: 1, rotate: restRotation }
          : {}
      }
      transition={{ duration: 0.9, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Layer 2 — cursor parallax depth */}
      <motion.div style={reduced ? undefined : { x: px, y: py }}>
        {/* Layer 3 — idle float */}
        <motion.div
          animate={reduced ? {} : { y: [0, -9, 0], rotate: [restRotation, restRotation + 2.5, restRotation] }}
          transition={{ duration: 6 + index * 0.9, repeat: Infinity, ease: "easeInOut", delay: index * 0.4 }}
          className="card w-44 cursor-default md:w-52"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 truncate font-mono text-xs font-bold text-[var(--color-fg)]">
              {doc.name}
            </p>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider"
              style={{ color: doc.tone, background: `${doc.tone}1a`, border: `1px solid ${doc.tone}40` }}
            >
              {doc.tag}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-[var(--color-faint)]">{doc.size}</span>
            <span className="h-1 w-10 overflow-hidden rounded-full bg-[var(--color-line)]">
              <motion.span
                className="block h-full rounded-full bg-[var(--color-brand)]"
                initial={{ x: "-100%" }}
                animate={scattered ? { x: ["-100%", "100%"] } : {}}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: index * 0.3 }}
              />
            </span>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function useParallax(v: ReturnType<typeof useSpring>, depth: number) {
  const [out, setOut] = useState(0);
  useEffect(() => {
    const unsub = v.on("change", (latest) => setOut((latest / 100) * depth));
    return () => {
      unsub();
    };
  }, [v, depth]);
  return out;
}

export function ProblemAct() {
  const reduced = useReducedMotion();
  const fieldRef = useRef<HTMLDivElement>(null);
  const [scattered, setScattered] = useState(false);
  const mx = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });
  const my = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setScattered(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleFieldMove = (e: React.MouseEvent) => {
    if (reduced || !fieldRef.current) return;
    const r = fieldRef.current.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 100);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 100);
  };
  const handleFieldLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <section id="problem-act" className="relative overflow-hidden px-6 py-32 md:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <ActMarker num="01" title="The night before" />
        </Reveal>

        {/* Clock — the time every student knows */}
        <div className="mt-10 flex flex-wrap items-end justify-between gap-8">
          <Reveal delay={0.05}>
            <h2 className="font-bold">
              400 pages.
              <br />
              One exam.
              <br />
              <span className="text-[var(--color-brand-accent)]">Zero sleep.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="font-mono text-5xl font-medium tracking-tight text-[var(--color-faint)] md:text-7xl">
              3
              <motion.span
                animate={reduced ? { opacity: 1 } : { opacity: [1, 0.15, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              >
                :
              </motion.span>
              47
              <span className="ml-3 text-2xl text-[var(--color-brand-accent)] md:text-3xl">AM</span>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.2}>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-[var(--color-muted)]">
            Your semester lives in scattered PDFs, photographed slides and one
            legendary senior&apos;s notes. Finding the answer takes longer than
            writing it.
          </p>
        </Reveal>

        {/* The scattered pile — cursor-reactive */}
        <div
          ref={fieldRef}
          onMouseMove={handleFieldMove}
          onMouseLeave={handleFieldLeave}
          className="relative mt-16 h-[420px] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] md:h-[500px]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(229,9,20,0.05) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        >
          {DOCUMENTS.map((doc, idx) => (
            <DocumentCard key={doc.name} doc={doc} index={idx} mx={mx} my={my} scattered={scattered} />
          ))}
          <div className="mono-label absolute bottom-4 left-5 text-[var(--color-faint)]">
            your semester, roughly
          </div>
        </div>

        {/* Scale of the catalogue */}
        <Reveal delay={0.1}>
          <StaggerContainer className="mt-16 grid grid-cols-2 gap-10 border-t border-[var(--color-line)] pt-10 md:grid-cols-4">
            <StaggerItem>
              <div className="text-4xl font-bold text-[var(--color-brand-accent)]">
                <Counter target={561} />
              </div>
              <MonoLabel className="mt-2">subjects</MonoLabel>
            </StaggerItem>
            <StaggerItem>
              <div className="text-4xl font-bold">
                <Counter target={9} />
              </div>
              <MonoLabel className="mt-2">departments</MonoLabel>
            </StaggerItem>
            <StaggerItem>
              <div className="text-4xl font-bold">
                <Counter target={8} />
              </div>
              <MonoLabel className="mt-2">semesters</MonoLabel>
            </StaggerItem>
            <StaggerItem>
              <div className="text-4xl font-bold text-[var(--color-brand-accent)]">
                <Counter target={120000} suffix="+" />
              </div>
              <MonoLabel className="mt-2">indexed chunks</MonoLabel>
            </StaggerItem>
          </StaggerContainer>
        </Reveal>
      </div>
    </section>
  );
}
