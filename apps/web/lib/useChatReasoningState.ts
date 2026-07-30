"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════
   useChatReasoningState

   Manages the isProcessing + status lifecycle for the
   CaterpillarReasoningIndicator. Call `start()` when a chat
   message is submitted and `stop()` inside the finally block
   of the async RAG / LLM request.
   ══════════════════════════════════════════════════════════════ */

const STATUSES = [
  "Reading your question",
  "Searching campus resources",
  "Organizing relevant information",
  "Generating the answer",
];

const CYCLE_MS = 3000;

export function useChatReasoningState() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const iv = useRef<ReturnType<typeof setInterval> | null>(null);
  const idx = useRef(0);

  const clearIv = useCallback(() => {
    if (iv.current) {
      clearInterval(iv.current);
      iv.current = null;
    }
  }, []);

  const start = useCallback(() => {
    clearIv();
    setIsProcessing(true);
    idx.current = 0;
    setStatus(STATUSES[0]);
    iv.current = setInterval(() => {
      idx.current = (idx.current + 1) % STATUSES.length;
      setStatus(STATUSES[idx.current]);
    }, CYCLE_MS);
  }, [clearIv]);

  const stop = useCallback(() => {
    clearIv();
    setIsProcessing(false);
    setStatus("");
  }, [clearIv]);

  useEffect(() => clearIv, [clearIv]);

  return { isProcessing, status, start, stop } as const;
}
