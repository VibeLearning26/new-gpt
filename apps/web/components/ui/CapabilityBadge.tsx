"use client";

import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ICON_PATHS, getCapability, type CapabilityId } from "@/lib/capabilities";

/** Monochrome capability icon — renders all SVG paths for a capability id. */
export function CapabilityIcon({
  id,
  size = 14,
  ...props
}: { id: CapabilityId; size?: number } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {ICON_PATHS[id].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

interface CapabilityBadgeProps {
  id: CapabilityId;
  /** Show the text label beside the icon (default: icon only). */
  showLabel?: boolean;
  /** Icon size in px. */
  size?: number;
}

/**
 * A single capability badge. Renders a monochrome icon (optionally with a label)
 * and reveals a tooltip on hover / keyboard focus / touch.
 *
 * The tooltip is rendered through a portal to document.body so it is never
 * clipped by an ancestor's overflow (e.g. the scrollable model menu).
 */
export function CapabilityBadge({ id, showLabel = false, size = 14 }: CapabilityBadgeProps) {
  const cap = getCapability(id);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  const show = () => {
    if (badgeRef.current) setRect(badgeRef.current.getBoundingClientRect());
  };
  const hide = () => setRect(null);

  /* Position the tooltip above the badge, clamped to the viewport. */
  let tipStyle: React.CSSProperties | undefined;
  if (rect) {
    const tipWidth = 220;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - tipWidth / 2),
      window.innerWidth - tipWidth - 8,
    );
    tipStyle = { left, top: Math.max(8, rect.top - 8) };
  }

  return (
    <span
      ref={badgeRef}
      className="capability-badge"
      role="img"
      aria-label={cap.label}
      aria-describedby={rect ? tipId : undefined}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onTouchStart={show}
      onTouchEnd={hide}
      style={cap.color ? ({ color: cap.color } as React.CSSProperties) : undefined}
    >
      <CapabilityIcon id={id} size={size} />
      {showLabel && <span className="capability-badge-label">{cap.label}</span>}
      {rect &&
        createPortal(
          <span
            className="capability-tooltip capability-tooltip-portal"
            role="tooltip"
            id={tipId}
            style={tipStyle}
          >
            <strong>{cap.label}</strong>
            <span>{cap.tooltip}</span>
          </span>,
          document.body,
        )}
    </span>
  );
}

/**
 * Renders a model's capability badges by iterating its capability ids.
 * O(n) over the model's capabilities — no model-specific logic.
 */
export function CapabilityBadges({
  ids,
  showLabel = false,
  size = 14,
  max,
}: {
  ids: CapabilityId[];
  showLabel?: boolean;
  size?: number;
  max?: number;
}) {
  const visible = max ? ids.slice(0, max) : ids;
  const overflow = max ? ids.length - visible.length : 0;
  return (
    <span className="capability-badges">
      {visible.map((id) => (
        <CapabilityBadge key={id} id={id} showLabel={showLabel} size={size} />
      ))}
      {overflow > 0 && (
        <span className="capability-overflow" aria-label={`${overflow} more capabilities`}>
          +{overflow}
        </span>
      )}
    </span>
  );
}
