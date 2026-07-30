/**
 * Capability Registry & Model Metadata
 *
 * Metadata-driven capability system for the LLM model selector.
 *
 * Architecture:
 *   Capability Registry (this file) → Model Metadata → CapabilityBadge → ModelCard → ModelSelector
 *
 * Adding a new capability requires ONLY:
 *   1. Add an entry to CAPABILITY_REGISTRY (id, label, tooltip, icon, optional color).
 *   2. Assign the capability id to any model in MODEL_METADATA.
 * No UI component, rendering logic, or styling changes are ever required.
 */

/* ── Capability identifiers ─────────────────────────────────── */

export type CapabilityId =
  | "fast"
  | "deliberate"
  | "creative"
  | "reasoning"
  | "coding"
  | "long-context"
  | "vision"
  | "math"
  | "multilingual"
  | "tool-use"
  | "low-cost"
  | "premium"
  | "document-analysis"
  | "planning"
  | "function-calling"
  | "web-search"
  | "image-generation";

/** Monochrome icon paths (Lucide-style, 24×24, stroke-based), keyed by capability id. */
export const ICON_PATHS: Record<CapabilityId, string[]> = {
  fast: ["M13 2 3 14h9l-1 8 10-12h-9l1-8z"],
  deliberate: [
    "M5 22h14",
    "M5 2h14",
    "M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.58A2 2 0 0 0 7 17.83V22",
    "M7 2v4.17a2 2 0 0 0 .59 1.42L12 8l4.41-4.58A2 2 0 0 0 17 6.17V2",
  ],
  creative: [
    "M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z",
  ],
  reasoning: [
    "M9 18h6",
    "M10 22h4",
    "M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-2.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z",
  ],
  coding: ["M16 18l6-6-6-6", "M8 6l-6 6 6 6"],
  "long-context": ["M12 2 2 7l10 5 10-5-10-5z", "M2 17l10 5 10-5", "M2 12l10 5 10-5"],
  vision: ["M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  math: ["M18 7V4H6l6 8-6 8h12v-3"],
  multilingual: [
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
    "M2 12h20",
    "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  ],
  "tool-use": [
    "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  ],
  "low-cost": ["M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z", "M7 7h.01"],
  premium: ["M6 3h12l4 6-10 13L2 9l4-6z", "M11 3 8 9l4 13 4-13-3-6", "M2 9h20"],
  "document-analysis": [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    "M14 2v6h6",
    "M16 13H8",
    "M16 17H8",
    "M10 9H8",
  ],
  planning: ["M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z", "M9 3v15", "M15 6v15"],
  "function-calling": [
    "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1",
    "M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1",
  ],
  "web-search": ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.35-4.35"],
  "image-generation": [
    "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z",
    "M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
    "M21 15l-5-5L5 21",
  ],
};

/* ── Capability metadata ────────────────────────────────────── */

export interface CapabilityMeta {
  id: CapabilityId;
  label: string;
  tooltip: string;
  /** Optional semantic color token (CSS variable or hex). Falls back to currentColor. */
  color?: string;
}

export const CAPABILITY_REGISTRY: Record<CapabilityId, CapabilityMeta> = {
  fast: { id: "fast", label: "Fast", tooltip: "Optimized for low-latency responses." },
  deliberate: { id: "deliberate", label: "Deliberate", tooltip: "Takes longer but performs deeper reasoning." },
  creative: { id: "creative", label: "Creative", tooltip: "Excellent for storytelling, writing, brainstorming and imaginative tasks." },
  reasoning: { id: "reasoning", label: "Reasoning", tooltip: "Strong logical and step-by-step reasoning." },
  coding: { id: "coding", label: "Coding", tooltip: "Excellent for code generation and debugging." },
  "long-context": { id: "long-context", label: "Long Context", tooltip: "Handles very large documents and long conversations." },
  vision: { id: "vision", label: "Vision", tooltip: "Understands images and visual input." },
  math: { id: "math", label: "Math", tooltip: "Strong at mathematical problem-solving." },
  multilingual: { id: "multilingual", label: "Multilingual", tooltip: "Supports many languages fluently." },
  "tool-use": { id: "tool-use", label: "Tool Use", tooltip: "Can use external tools and functions." },
  "low-cost": { id: "low-cost", label: "Low Cost", tooltip: "Cost-effective for high-volume use." },
  premium: { id: "premium", label: "Premium", tooltip: "Premium-tier quality and capability." },
  "document-analysis": { id: "document-analysis", label: "Document Analysis", tooltip: "Analyzes documents deeply and accurately." },
  planning: { id: "planning", label: "Planning", tooltip: "Plans and decomposes multi-step tasks." },
  "function-calling": { id: "function-calling", label: "Function Calling", tooltip: "Calls functions and external APIs." },
  "web-search": { id: "web-search", label: "Web Search", tooltip: "Searches the web for up-to-date information." },
  "image-generation": { id: "image-generation", label: "Image Generation", tooltip: "Generates images from text prompts." },
};

/** O(1) lookup of capability metadata by id. */
export function getCapability(id: CapabilityId): CapabilityMeta {
  return CAPABILITY_REGISTRY[id];
}

/* ── Model metadata ─────────────────────────────────────────── */

export interface ModelMeta {
  id: string;
  provider: string;
  displayName: string;
  description: string;
  /** Context window size in tokens. */
  contextWindow: number;
  capabilities: CapabilityId[];
}

/**
 * Editable model metadata. Assign capability ids to each model.
 * Adding/updating a model's capabilities requires only editing this map.
 */
export const MODEL_METADATA: Record<string, ModelMeta> = {
  "opencode-zen/mimo-v2.5-free": {
    id: "opencode-zen/mimo-v2.5-free",
    provider: "Xiaomi",
    displayName: "MiMo v2.5 Free",
    description: "Balanced free-tier model with strong reasoning and coding.",
    contextWindow: 128000,
    capabilities: ["fast", "reasoning", "coding"],
  },
  "opencode-zen/big-pickle": {
    id: "opencode-zen/big-pickle",
    provider: "OpenCode",
    displayName: "Big Pickle",
    description: "Large-context model for deep reasoning over long documents.",
    contextWindow: 200000,
    capabilities: ["reasoning", "long-context", "document-analysis"],
  },
  "opencode-zen/deepseek-v4-flash-free": {
    id: "opencode-zen/deepseek-v4-flash-free",
    provider: "DeepSeek",
    displayName: "DeepSeek v4 Flash",
    description: "Fast, capable model for reasoning and code.",
    contextWindow: 128000,
    capabilities: ["fast", "reasoning", "coding"],
  },
  "opencode-zen/ling-3.0-flash-free": {
    id: "opencode-zen/ling-3.0-flash-free",
    provider: "Ling",
    displayName: "Ling 3.0 Flash",
    description: "Quick responses tuned for coding tasks.",
    contextWindow: 128000,
    capabilities: ["fast", "coding"],
  },
  "opencode-zen/nemotron-3-ultra-free": {
    id: "opencode-zen/nemotron-3-ultra-free",
    provider: "NVIDIA",
    displayName: "Nemotron 3 Ultra",
    description: "High-throughput model with strong reasoning and coding.",
    contextWindow: 128000,
    capabilities: ["fast", "reasoning", "coding"],
  },
  "opencode-zen/north-mini-code-free": {
    id: "opencode-zen/north-mini-code-free",
    provider: "North",
    displayName: "North Mini Code",
    description: "Compact model specialized for code generation.",
    contextWindow: 64000,
    capabilities: ["fast", "coding", "low-cost"],
  },
  "opencode-zen/laguna-s-2.1-free": {
    id: "opencode-zen/laguna-s-2.1-free",
    provider: "Laguna",
    displayName: "Laguna S 2.1",
    description: "Creative and reasoning-oriented general model.",
    contextWindow: 128000,
    capabilities: ["creative", "reasoning"],
  },
  // Reference examples from the capability spec
  "nemotron-ultra": {
    id: "nemotron-ultra",
    provider: "NVIDIA",
    displayName: "Nemotron Ultra",
    description: "Flagship reasoning and coding model.",
    contextWindow: 128000,
    capabilities: ["fast", "reasoning", "coding"],
  },
  "claude-opus": {
    id: "claude-opus",
    provider: "Anthropic",
    displayName: "Claude Opus",
    description: "Deep, deliberate reasoning with strong creative output.",
    contextWindow: 200000,
    capabilities: ["deliberate", "reasoning", "creative"],
  },
  "glm-5.2": {
    id: "glm-5.2",
    provider: "Zhipu",
    displayName: "GLM 5.2",
    description: "Fast model with long-context and coding strengths.",
    contextWindow: 256000,
    capabilities: ["fast", "coding", "long-context"],
  },
};

/** Format a token count as a compact string (e.g. 128000 → "128K"). */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return `${tokens}`;
}

/** Derive a human-friendly display name from a raw model id like "provider/model-name". */
function deriveDisplayName(id: string): string {
  const raw = id.includes("/") ? id.split("/").pop()! : id;
  return raw
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Infer capability ids from a raw model id (best-effort fallback). */
function inferCapabilities(id: string, inputModalities: string[]): CapabilityId[] {
  const lower = id.toLowerCase();
  const caps: CapabilityId[] = [];
  if (/code|coding|coder/.test(lower)) caps.push("coding");
  if (/reason|think|thinker/.test(lower)) caps.push("reasoning");
  if (/flash|fast|turbo|mini|nano/.test(lower)) caps.push("fast");
  if (/vision|vl|image|visual/.test(lower)) caps.push("vision");
  if (/long|context|200k|256k|1m/.test(lower)) caps.push("long-context");
  if (/creative|write|story|art/.test(lower)) caps.push("creative");
  if (inputModalities.includes("image") && !caps.includes("vision")) caps.push("vision");
  if (caps.length === 0) caps.push("reasoning");
  return caps;
}

/**
 * Resolve full model metadata for a model id.
 * Falls back to derived metadata for models not in MODEL_METADATA,
 * so the UI always renders something sensible without per-model UI logic.
 */
export function getModelMeta(id: string, ownedBy?: string | null, inputModalities: string[] = ["text"]): ModelMeta {
  const known = MODEL_METADATA[id];
  if (known) return known;
  return {
    id,
    provider: ownedBy ?? (id.includes("/") ? id.split("/")[0] : "Unknown"),
    displayName: deriveDisplayName(id),
    description: "General-purpose model.",
    contextWindow: 128000,
    capabilities: inferCapabilities(id, inputModalities),
  };
}
