"use client";

import { useState, useEffect, useRef } from "react";

/* ══════════════════════════════════════════════════════════════
   Red-block caterpillar processing indicator.

   6 body blocks + 1 head block (black eye) + 2 small antenna
   squares stacked above the head.  A single rAF clock drives
   a travelling vertical wave through every block.
   ══════════════════════════════════════════════════════════════ */

const EXIT_MS = 200;
const MIN_VISIBLE_MS = 600;
const STATUS_INTERVAL_MS = 3000;
const PHASE_DELAY = 0.72;

const DEFAULT_STATUSES = [
  "Reading your question",
  "Searching campus resources",
  "Organizing relevant information",
  "Generating the answer",
];

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const h = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return prefers;
}

/* ── props ─────────────────────────────────────────────────── */

export interface CaterpillarReasoningIndicatorProps {
  isProcessing: boolean;
  status?: string;
  blockCount?: number;
  cycleDuration?: number;
  amplitude?: number;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/* ══════════════════════════════════════════════════════════════ */

export function CaterpillarReasoningIndicator({
  isProcessing,
  status,
  blockCount = 6,
  cycleDuration = 1300,
  amplitude = 14,
  size = 20,
  className,
  style,
}: CaterpillarReasoningIndicatorProps) {
  const reduced = usePrefersReducedMotion();
  const total = blockCount + 1;
  const gap = Math.max(3, Math.round(size * 0.16));

  const [rendered, setRendered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [internalStatus, setInternalStatus] = useState(DEFAULT_STATUSES[0]);
  const shown = status ?? internalStatus;

  const blockEls = useRef<(HTMLDivElement | null)[]>([]);
  const raf = useRef(0);
  const clock = useRef(0);
  const lastT = useRef(0);
  const startT = useRef(0);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sIdx = useRef(0);
  const wasProc = useRef(false);

  /* ── lifecycle: start / stop ──────────────────────────────── */
  useEffect(() => {
    const started = isProcessing && !wasProc.current;
    const stopped = !isProcessing && wasProc.current;
    wasProc.current = isProcessing;

    if (started) {
      setRendered(true);
      setExiting(false);
      startT.current = Date.now();
      clock.current = 0;
      lastT.current = 0;
      sIdx.current = 0;
    }

    if (stopped && rendered) {
      const elapsed = Date.now() - startT.current;
      const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
      exitTimer.current = setTimeout(() => {
        setExiting(true);
        exitTimer.current = setTimeout(() => {
          setRendered(false);
          setExiting(false);
        }, EXIT_MS);
      }, wait);
    }

    return () => {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing, status]);

  /* ── status text cycling (isolated effect, no lifecycle deps) ── */
  useEffect(() => {
    if (!isProcessing || status) return;

    sIdx.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to first status on new processing cycle
    setInternalStatus(DEFAULT_STATUSES[0]);

    const iv = setInterval(() => {
      sIdx.current = (sIdx.current + 1) % DEFAULT_STATUSES.length;
      setInternalStatus(DEFAULT_STATUSES[sIdx.current]);
    }, STATUS_INTERVAL_MS);

    return () => clearInterval(iv);
  }, [isProcessing, status]);

  /* ── wave animation (single clock, all blocks) ────────────── */
  useEffect(() => {
    if (!rendered || reduced || exiting) return;

    const tick = (t: number) => {
      if (lastT.current === 0) lastT.current = t;
      const dt = t - lastT.current;
      lastT.current = t;
      clock.current += (dt / cycleDuration) * Math.PI * 2;

      for (let i = 0; i < blockEls.current.length; i++) {
        const el = blockEls.current[i];
        if (!el) continue;
        const y = amplitude * Math.sin(clock.current - i * PHASE_DELAY);
        el.style.transform = `translateY(${-y}px)`;
      }

      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    const els = blockEls.current;
    return () => {
      cancelAnimationFrame(raf.current);
      lastT.current = 0;
      els.forEach((el) => {
        if (el) el.style.transform = "";
      });
    };
  }, [rendered, reduced, exiting, cycleDuration, amplitude, blockCount]);

  /* ── reduced-motion: subtle uniform pulse ─────────────────── */
  useEffect(() => {
    if (!rendered || !reduced || exiting) return;
    let id = 0;
    let t0: number | null = null;
    const tick = (ts: number) => {
      if (t0 === null) t0 = ts;
      const y = 4 * Math.sin(((ts - t0) / 1500) * Math.PI * 2);
      blockEls.current.forEach((el) => {
        if (el) el.style.transform = `translateY(${-y}px)`;
      });
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [rendered, reduced, exiting]);

  if (!rendered) return null;

  const antennaSize = Math.round(size * 0.38);

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 16,
        opacity: exiting ? 0 : 1,
        transform: exiting ? "scale(0.95)" : "scale(1)",
        transition: `opacity ${EXIT_MS}ms ease, transform ${EXIT_MS}ms ease`,
        ...style,
      }}
      role="status"
      aria-live="polite"
      aria-label={shown || "Processing"}
    >
      {/* status text — on top */}
      {shown && (
        <div style={{ fontSize: 12, color: "#a8a8a8", fontWeight: 500 }}>
          {shown}
        </div>
      )}

      {/* caterpillar blocks */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap, height: size + amplitude * 2 + 4 }}>
        {Array.from({ length: total }, (_, i) => {
          const isHead = i === total - 1;
          return (
            <div
              key={i}
              ref={(el) => { blockEls.current[i] = el; }}
              style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
            >
              <div
                style={{
                  width: size,
                  height: size,
                  borderRadius: 3,
                  backgroundColor: "#FF101B",
                }}
              />

              {/* eye */}
              {isHead && (
                <div
                  style={{
                    position: "absolute",
                    top: Math.round(size * 0.25),
                    right: Math.round(size * 0.2),
                    width: Math.max(3, Math.round(size * 0.18)),
                    height: Math.max(3, Math.round(size * 0.18)),
                    borderRadius: "50%",
                    backgroundColor: "#000000",
                  }}
                />
              )}

              {/* antenna — two small squares stacked vertically above the head */}
              {isHead && (
                <div style={{ position: "absolute", bottom: size + 1, left: size * 0.55 }}>
                  <div
                    style={{
                      width: antennaSize,
                      height: antennaSize,
                      borderRadius: 2,
                      backgroundColor: "#FF101B",
                      transform: "rotate(-12deg)",
                    }}
                  />
                  <div
                    style={{
                      width: antennaSize,
                      height: antennaSize,
                      borderRadius: 2,
                      backgroundColor: "#FF101B",
                      marginTop: 1,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
