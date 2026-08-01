"use client";

import { useMemo, useState } from "react";
import { Check, CloseCircle, DocumentText, Refresh, Star, Download } from "reicon-react";
import Markdown from "@/components/Markdown";
import type { StudyAnswer } from "@/lib/mockData";
import { sanitizeSvg } from "@/lib/svgSafety";
import { DrawingGenerationAnimation } from "./DrawingGenerationAnimation";

export type VisualGenerationState =
  | "idle" | "submitting" | "analysing" | "preparing_data"
  | "generating_visual" | "validating_visual" | "completed"
  | "failed" | "cancelled";

const STATUS: Record<VisualGenerationState, string> = {
  idle: "Waiting to begin...",
  submitting: "Sending your request...",
  analysing: "Understanding your visual request...",
  preparing_data: "Preparing the visual composition...",
  generating_visual: "Generating a more detailed image - hang tight.",
  validating_visual: "Preparing the completed image...",
  completed: "Drawing completed",
  failed: "Drawing generation failed",
  cancelled: "Drawing generation cancelled",
};

type Drawing = NonNullable<StudyAnswer["drawing"]>;

interface Props {
  requestId: string;
  state: VisualGenerationState;
  drawing: Drawing | null;
  description: string | null;
  error?: string | null;
  isSaved?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onSave?: () => void;
  onVisualRendered?: () => void;
  cycleDurationMs?: number;
}

function conciseSummary(text: string): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 260) return plain;
  const sentence = plain.slice(0, 260).replace(/\s+\S*$/, "");
  return `${sentence}...`;
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadPng(svg: string, filename: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not convert the drawing to PNG."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, image.naturalWidth * ratio);
    canvas.height = Math.max(1, image.naturalHeight * ratio);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG conversion is unavailable.");
    context.fillStyle = "#deddd6";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG conversion failed.");
    downloadBlob(blob, "image/png", filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function VisualAnswerMessage({
  requestId, state, drawing, description, error, isSaved,
  onCancel, onRetry, onSave, onVisualRendered, cycleDurationMs = 1300,
}: Props) {
  const drawingKey = drawing
    ? `${drawing.drawingId}:${drawing.svg.length}:${drawing.svg.slice(-24)}`
    : null;
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<{ key: string; message: string } | null>(null);
  const safeVisual = useMemo(() => {
    if (!drawing) return { sanitized: null, error: null };
    try {
      return { sanitized: sanitizeSvg(drawing.svg), error: null };
    } catch (caught) {
      return {
        sanitized: null,
        error: caught instanceof Error ? caught.message : "The drawing could not be validated.",
      };
    }
  }, [drawing]);
  const sanitizedSvg = safeVisual.sanitized;
  const visualUrl = sanitizedSvg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizedSvg)}`
    : null;
  const visualRendered = Boolean(drawingKey && renderedKey === drawingKey);
  const visualError = safeVisual.error || (runtimeError?.key === drawingKey ? runtimeError.message : null);

  const failed = state === "failed" || state === "cancelled" || Boolean(visualError);
  const complete = visualRendered && !failed;
  const shownState: VisualGenerationState = failed
    ? state === "cancelled" ? "cancelled" : "failed"
    : complete ? "completed"
    : drawing ? "validating_visual" : state;
  const summary = useMemo(() => description ? conciseSummary(description) : "", [description]);
  const filename = `${drawing?.drawingId || requestId || "engineering-drawing"}`;

  return (
    <section
      className={`visual-answer ${complete ? "visual-answer--complete" : ""} ${failed ? "visual-answer--failed" : ""}`}
      aria-label="Engineering drawing response"
      data-request-id={requestId}
      style={{
        "--drawing-cycle": `${Math.max(700, cycleDurationMs)}ms`,
        "--drawing-cycle-medium": `${Math.max(1000, cycleDurationMs * 1.8)}ms`,
        "--drawing-cycle-slow": `${Math.max(1500, cycleDurationMs * 2.8)}ms`,
      } as React.CSSProperties}
    >
      <header className="visual-answer__header">
        <div className="visual-answer__status-icon" aria-hidden="true">
          {complete ? <Check size={14} /> : failed ? <CloseCircle size={14} /> : <span />}
        </div>
        <div className="min-w-0">
          <p className="visual-answer__eyebrow">
            {complete ? "Visual ready" : "Creating visual"}
          </p>
          <p className="visual-answer__phase" role="status" aria-live="polite">
            {visualError || error || STATUS[shownState]}
          </p>
        </div>
        {!drawing && !failed && onCancel && (
          <button type="button" className="visual-answer__cancel" onClick={onCancel}>Cancel</button>
        )}
      </header>

      <div className="visual-answer__stage">
        <div className={`visual-answer__placeholder ${complete ? "is-hidden" : ""}`}>
          {failed ? (
            <div className="visual-answer__error" role="alert">
              <CloseCircle size={24} />
              <strong>{state === "cancelled" ? "Generation cancelled" : "VibeGPT could not complete this drawing"}</strong>
              <p>{visualError || error || "Check the question or try generating it again."}</p>
              {onRetry && (
                <button type="button" className="btn-ghost" onClick={onRetry}>
                  <Refresh size={14} /> Retry
                </button>
              )}
            </div>
          ) : (
            <DrawingGenerationAnimation />
          )}
        </div>

        {visualUrl && (
          // The SVG is rendered as an isolated image URL after sanitization.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={`visual-answer__image ${complete ? "is-visible" : ""}`}
            src={visualUrl}
            alt={drawing?.title ? `${drawing.title}, generated engineering drawing` : "Generated engineering drawing"}
            onLoad={() => {
              if (drawingKey) setRenderedKey(drawingKey);
              onVisualRendered?.();
            }}
            onError={() => drawingKey && setRuntimeError({
              key: drawingKey,
              message: "The generated drawing could not be displayed safely.",
            })}
          />
        )}
        {complete && <div className="visual-answer__reveal-light" aria-hidden="true" />}
      </div>

      {!failed && !complete && (
        <div className="visual-answer__progress" aria-hidden="true"><span /></div>
      )}

      {complete && description && (
        <div className="visual-answer__description">
          <p>{summary}</p>
          {description.trim() !== summary && (
            <details>
              <summary>View explanation</summary>
              <div className="visual-answer__details"><Markdown text={description} /></div>
            </details>
          )}
        </div>
      )}

      {complete && drawing && sanitizedSvg && (
        <div className="visual-answer__actions" aria-label="Drawing actions">
          <button type="button" className="btn-ghost" onClick={() => downloadBlob(sanitizedSvg, "image/svg+xml;charset=utf-8", `${filename}.svg`)}>
            <Download size={14} /> SVG
          </button>
          <button type="button" className="btn-ghost" onClick={() => void downloadPng(sanitizedSvg, `${filename}.png`)}>
            <Download size={14} /> PNG
          </button>
          <button type="button" className="btn-ghost" onClick={() => downloadBlob(JSON.stringify(drawing.spec, null, 2), "application/json", `${filename}.json`)}>
            <DocumentText size={14} /> Drawing data
          </button>
          {onSave && (
            <button type="button" className="btn-ghost" onClick={onSave}>
              <Star size={14} weight={isSaved ? "Filled" : "Outline"} /> {isSaved ? "Saved" : "Save"}
            </button>
          )}
          {onRetry && (
            <button type="button" className="btn-ghost" onClick={onRetry}>
              <Refresh size={14} /> Regenerate
            </button>
          )}
        </div>
      )}

      {complete && drawing?.warnings && drawing.warnings.length > 0 && (
        <p className="visual-answer__note">{drawing.warnings.join(" ")}</p>
      )}
    </section>
  );
}
