"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

export interface SeriesPoint {
  t: string;
  value: number;
}

export interface BarDatum {
  label: string;
  value: number;
  hint?: string;
}

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

const BRAND = "#ff2a2a";
const GRID = "#1e1e1e";
const AXIS_TEXT = "#6b6b6b";

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n)}`;
}

function niceMax(v: number): number {
  if (v <= 0) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function useMeasure<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (callback) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", callback);
      return () => query.removeEventListener("change", callback);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function useAnimated(): boolean {
  const reduced = usePrefersReducedMotion();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (reduced) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setOn(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [reduced]);
  return reduced || on;
}

function EmptyState({ label = "No data recorded yet" }: { label?: string }) {
  return (
    <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-line-soft">
      <p className="text-xs text-faint">{label}</p>
    </div>
  );
}

function ChartTooltip({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: ReactNode;
}) {
  return (
    <div
      className="chart-tooltip"
      style={{ left: x, top: y }}
      role="status"
      aria-live="polite"
    >
      {children}
    </div>
  );
}

/* ── Area / line chart ─────────────────────────────────────── */

export function AreaChart({
  data,
  height = 180,
  color = BRAND,
  formatValue = formatCompact,
  formatTick,
}: {
  data: SeriesPoint[];
  height?: number;
  color?: string;
  formatValue?: (n: number) => string;
  formatTick?: (iso: string, index: number, total: number) => string;
}) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const animated = useAnimated();
  const [hover, setHover] = useState<number | null>(null);

  const hasData = data.some((d) => d.value > 0);
  const pad = { top: 14, right: 10, bottom: 22, left: 40 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 0)), [data]);

  const points = useMemo(() => {
    if (data.length === 0 || innerW === 0) return [];
    const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;
    return data.map((d, i) => ({
      x: pad.left + i * stepX,
      y: pad.top + innerH - (max > 0 ? (d.value / max) * innerH : 0),
      ...d,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, innerW, innerH, max]);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = points.length
    ? `${linePath} L${points[points.length - 1].x},${pad.top + innerH} L${points[0].x},${pad.top + innerH} Z`
    : "";

  const gridLines = [0.25, 0.5, 0.75, 1];
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, "");

  if (width === 0) return <div ref={wrapRef} style={{ height }} />;
  if (!hasData) return <div ref={wrapRef}><EmptyState /></div>;

  const hovered = hover !== null ? points[hover] : null;

  return (
    <div ref={wrapRef} className="relative" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label="time series chart">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridLines.map((f) => {
          const y = pad.top + innerH - f * innerH;
          return (
            <g key={f}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke={GRID} strokeWidth="1" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill={AXIS_TEXT} fontFamily="var(--font-mono)">
                {formatCompact(max * f)}
              </text>
            </g>
          );
        })}
        <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke="#282828" strokeWidth="1" />

        {points.length > 1 && (
          <>
            <path
              d={areaPath}
              fill={`url(#${gradientId})`}
              style={{ opacity: animated ? 1 : 0, transition: "opacity 0.9s ease 0.25s" }}
            />
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength={1}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: animated ? 0 : 1,
                transition: "stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1)",
                filter: `drop-shadow(0 0 6px ${color}55)`,
              }}
            />
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r="3.5"
              fill={color}
              style={{
                opacity: animated ? 1 : 0,
                transition: "opacity 0.4s ease 1s",
                filter: `drop-shadow(0 0 5px ${color})`,
              }}
            />
          </>
        )}

        {formatTick &&
          points.map((p, i) => {
            const label = formatTick(p.t, i, points.length);
            if (!label) return null;
            return (
              <text key={p.t} x={p.x} y={height - 6} textAnchor="middle" fontSize="10" fill={AXIS_TEXT}>
                {label}
              </text>
            );
          })}

        {hovered && (
          <g>
            <line x1={hovered.x} x2={hovered.x} y1={pad.top} y2={pad.top + innerH} stroke={color} strokeOpacity="0.35" strokeWidth="1" />
            <circle cx={hovered.x} cy={hovered.y} r="8" fill={color} fillOpacity="0.15" />
            <circle cx={hovered.x} cy={hovered.y} r="4" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
          </g>
        )}

        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={(e) => {
            if (points.length === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW;
            const idx = Math.max(0, Math.min(points.length - 1, Math.round((x - pad.left) / stepX)));
            setHover(idx);
          }}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {hovered && (
        <ChartTooltip x={Math.min(hovered.x + 10, width - 130)} y={Math.max(hovered.y - 44, 0)}>
          <span className="chart-tooltip-value">{formatValue(hovered.value)}</span>
          <span className="chart-tooltip-label">
            {new Date(hovered.t).toLocaleString(undefined, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </ChartTooltip>
      )}
    </div>
  );
}

/* ── Vertical bar chart ────────────────────────────────────── */

export function BarChart({
  data,
  height = 180,
  color = BRAND,
  formatValue = formatCompact,
  maxLabels = 12,
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
  formatValue?: (n: number) => string;
  maxLabels?: number;
}) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const animated = useAnimated();
  const [hover, setHover] = useState<number | null>(null);

  const hasData = data.some((d) => d.value > 0);
  const pad = { top: 14, right: 10, bottom: 22, left: 40 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 0)), [data]);

  if (width === 0) return <div ref={wrapRef} style={{ height }} />;
  if (!hasData) return <div ref={wrapRef}><EmptyState /></div>;

  const slot = data.length > 0 ? innerW / data.length : innerW;
  const barW = Math.max(2, Math.min(slot * 0.62, 34));
  const labelStep = Math.ceil(data.length / maxLabels);
  const hovered = hover !== null ? data[hover] : null;
  const hoverX = hover !== null ? pad.left + hover * slot + slot / 2 : 0;

  return (
    <div ref={wrapRef} className="relative" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label="bar chart">
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = pad.top + innerH - f * innerH;
          return (
            <g key={f}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke={GRID} strokeWidth="1" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill={AXIS_TEXT} fontFamily="var(--font-mono)">
                {formatCompact(max * f)}
              </text>
            </g>
          );
        })}
        <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke="#282828" strokeWidth="1" />

        {data.map((d, i) => {
          const h = max > 0 ? (d.value / max) * innerH : 0;
          const x = pad.left + i * slot + (slot - barW) / 2;
          const y = pad.top + innerH - h;
          const active = hover === i;
          return (
            <g key={`${d.label}-${i}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, d.value > 0 ? 2 : 0)}
                rx={Math.min(4, barW / 2)}
                fill={active ? color : `${color}cc`}
                style={{
                  transform: animated ? "scaleY(1)" : "scaleY(0)",
                  transformOrigin: `${x + barW / 2}px ${pad.top + innerH}px`,
                  transition: `transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${i * 22}ms, fill 0.15s ease`,
                  filter: active ? `drop-shadow(0 0 8px ${color}88)` : undefined,
                }}
              />
              {i % labelStep === 0 && (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize="10" fill={AXIS_TEXT}>
                  {d.label}
                </text>
              )}
              <rect
                x={pad.left + i * slot}
                y={pad.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>

      {hovered && (
        <ChartTooltip x={Math.min(Math.max(hoverX - 55, 0), width - 120)} y={4}>
          <span className="chart-tooltip-value">{formatValue(hovered.value)}</span>
          <span className="chart-tooltip-label">{hovered.hint ?? hovered.label}</span>
        </ChartTooltip>
      )}
    </div>
  );
}

/* ── Horizontal bar list ───────────────────────────────────── */

export function HBarList({
  data,
  color = BRAND,
  formatValue = formatCompact,
}: {
  data: BarDatum[];
  color?: string;
  formatValue?: (n: number) => string;
}) {
  const animated = useAnimated();
  const max = Math.max(...data.map((d) => d.value), 1);

  if (data.length === 0) return <EmptyState />;

  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-muted group-hover:text-fg transition-colors">
              {d.label}
              {d.hint ? <span className="ml-1.5 text-[10px] text-faint">{d.hint}</span> : null}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-faint">{formatValue(d.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div
              className="h-full rounded-full"
              style={{
                width: animated ? `${Math.max((d.value / max) * 100, 1.5)}%` : "0%",
                background: `linear-gradient(90deg, #7a0a10, ${color})`,
                boxShadow: `0 0 10px -2px ${color}66`,
                transition: `width 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${i * 70}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Donut chart ───────────────────────────────────────────── */

export function Donut({
  data,
  size = 148,
  thickness = 16,
  centerLabel,
}: {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
}) {
  const animated = useAnimated();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  if (total === 0) return <EmptyState />;

  const positive = data.filter((d) => d.value > 0);
  const fractions = positive.map((d) => d.value / total);
  const starts = fractions.map((_, i) => fractions.slice(0, i).reduce((a, b) => a + b, 0));
  const segments = positive.map((d, i) => ({
    ...d,
    fraction: fractions[i],
    start: starts[i],
  }));

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label="donut chart" style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1a1a1a" strokeWidth={thickness} />
          {segments.map((s, i) => {
            const segLen = s.fraction * circumference;
            const gap = segments.length > 1 ? Math.min(3, segLen * 0.12) : 0;
            return (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeLinecap={gap > 0 ? "butt" : "butt"}
                strokeDasharray={`${Math.max(animated ? segLen - gap : 0, 0)} ${circumference}`}
                strokeDashoffset={-s.start * circumference}
                style={{
                  transition: `stroke-dasharray 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${i * 90}ms`,
                  filter: `drop-shadow(0 0 6px ${s.color}44)`,
                }}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold leading-none">{formatCompact(total)}</span>
          {centerLabel ? <span className="mt-1 text-[10px] uppercase tracking-wider text-faint">{centerLabel}</span> : null}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}88` }} />
            <span className="truncate text-muted">{s.label}</span>
            <span className="ml-auto font-mono text-[11px] text-faint">
              {Math.round(s.fraction * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Sparkline (KPI cards) ─────────────────────────────────── */

export function Sparkline({
  data,
  width = 92,
  height = 26,
  color = BRAND,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const animated = useAnimated();
  const max = Math.max(...data, 1);
  const hasData = data.some((v) => v > 0);

  const points = useMemo(() => {
    if (data.length < 2) return "";
    const stepX = width / (data.length - 1);
    return data
      .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${(height - 2 - (v / max) * (height - 6)).toFixed(1)}`)
      .join(" ");
  }, [data, width, height, max]);

  if (!hasData || data.length < 2) {
    return <div style={{ width, height }} className="rounded bg-panel-2/60" aria-hidden />;
  }

  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path
        d={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: animated ? 0 : 1,
          transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)",
        } as CSSProperties}
      />
    </svg>
  );
}
