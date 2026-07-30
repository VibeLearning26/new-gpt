"use client";

import { useReducedMotion, motion, useMotionValue, useTransform, animate, type MotionValue } from "motion/react";
import { useEffect } from "react";

const SEGMENTS = 5;
const GAP = 20;
const CY = 32;
const W = 180;
const H = 64;

const RED = "#e50914";
const DIM = "rgba(229,9,20,0.12)";
const MID = "rgba(229,9,20,0.35)";

function Segment({ index, wave }: { index: number; wave: MotionValue<number> }) {
  const cx = W / 2 - ((SEGMENTS - 1) * GAP) / 2 + index * GAP;
  const fill = useTransform(wave, (w: number) => {
    const v = Math.sin((w - index) * 1.2);
    if (v > 0.4) return RED;
    if (v > -0.2) return MID;
    return DIM;
  });
  const s = useTransform(wave, (w: number) => 0.6 + 0.4 * Math.sin((w - index) * 1.2));
  const yOff = useTransform(wave, (w: number) => 3 * Math.sin((w - index) * 1.2));

  return (
    <motion.rect
      x={cx - 8}
      y={CY - 8}
      width={16}
      height={16}
      rx={4}
      fill={fill}
      style={{
        scaleY: s,
        transformOrigin: `${cx}px ${CY}px`,
        y: yOff,
      }}
    />
  );
}

function StaticScene() {
  return (
    <div className="w-full px-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" style={{ maxWidth: 180, margin: "0 auto" }}>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const cx = W / 2 - ((SEGMENTS - 1) * GAP) / 2 + i * GAP;
          return <rect key={i} x={cx - 8} y={CY - 8} width={16} height={16} rx={4} fill={i === 2 ? RED : DIM} />;
        })}
      </svg>
    </div>
  );
}

interface BowArrowReasoningProps {
  label?: string;
  interactive?: boolean;
}

export function BowArrowReasoning({ label }: BowArrowReasoningProps) {
  const reduced = useReducedMotion();
  const wave = useMotionValue(0);

  useEffect(() => {
    if (reduced) return;
    const ctrl = animate(wave, SEGMENTS * 2, { duration: 1.8, repeat: Infinity, ease: "linear" });
    return () => ctrl.stop();
  }, [reduced, wave]);

  if (reduced) return <StaticScene />;

  return (
    <div className="w-full px-4">
      <div className="relative w-full overflow-hidden select-none" style={{ maxWidth: 180, margin: "0 auto" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          style={{ aspectRatio: `${W} / ${H}` }}
          role="img"
          aria-label={label || "Thinking…"}
        >
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <Segment key={i} index={i} wave={wave} />
          ))}
        </svg>
      </div>
    </div>
  );
}
