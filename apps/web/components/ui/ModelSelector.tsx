"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "reicon-react";
import { CapabilityBadges } from "./CapabilityBadge";
import {
  formatContextWindow,
  getModelMeta,
  type CapabilityId,
} from "@/lib/capabilities";

interface ModelOption {
  id: string;
  ownedBy: string | null;
  inputModalities: string[];
}

interface ModelSelectorProps {
  models: ModelOption[];
  value: string;
  onChange: (id: string) => void;
}

/**
 * Model selector.
 *
 * Shows a curated set of models (those with registry metadata) as compact rows —
 * name, provider, capability icons and context window — instead of dumping every
 * gateway model. The trigger is a clean chip with the active model name.
 */
export function ModelSelector({ models, value, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // The API already returns the administrator-approved allowlist. Rendering
  // every returned model ensures newly enabled ids are never hidden by stale
  // frontend metadata.
  const curated = useMemo(() => models, [models]);

  const selectedMeta = getModelMeta(value, models.find((m) => m.id === value)?.ownedBy);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % curated.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + curated.length) % curated.length);
      } else if (e.key === "Enter" && highlight >= 0 && curated[highlight]) {
        e.preventDefault();
        onChange(curated[highlight].id);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, curated, highlight, onChange]);

  useEffect(() => {
    if (open && highlight >= 0 && listRef.current) {
      listRef.current.children[highlight]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlight, open]);

  const toggle = () => {
    setHighlight(curated.findIndex((m) => m.id === value));
    setOpen((v) => !v);
  };

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="model-selector">
      <button
        type="button"
        onClick={toggle}
        className={`model-trigger ${open ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${selectedMeta.displayName}`}
      >
        <span className="model-trigger-name truncate">{selectedMeta.displayName}</span>
        <ChevronDown size={14} className={`model-chevron ${open ? "open" : ""}`} />
      </button>

      {open && (
        <ul ref={listRef} role="listbox" aria-label="Select model" className="model-menu">
          {curated.map((m, i) => {
            const meta = getModelMeta(m.id, m.ownedBy, m.inputModalities);
            const isSelected = m.id === value;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(m.id)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`model-row ${isSelected ? "selected" : ""} ${
                    i === highlight && !isSelected ? "highlighted" : ""
                  }`}
                >
                  <span className="model-row-name">{meta.displayName}</span>
                  <span className="model-row-provider">{meta.provider}</span>
                  <CapabilityBadges
                    ids={meta.capabilities as CapabilityId[]}
                    size={12}
                    max={3}
                  />
                  <span className="model-row-context">{formatContextWindow(meta.contextWindow)}</span>
                  {isSelected && <Check size={14} className="model-row-check" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
