"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PulsingDots, TypeWriter } from "./primitives";

const MARKS_OPTIONS = [2, 5, 10];
const QUESTION = "State and prove the Master Theorem. (10 marks)";
const ANSWER =
  "The Master Theorem gives the solution to recurrences of the form T(n) = aT(n/b) + f(n) by comparing f(n) with n^(log_b a). [S1] Case 1: if f(n) is polynomially smaller, then T(n) = Θ(n^(log_b a)). Case 2: if the two are asymptotically equal, then T(n) = Θ(n^(log_b a) · log n). [S2] Case 3: if f(n) is polynomially larger and satisfies the regularity condition, then T(n) = Θ(f(n)).";
const SOURCES = [
  { name: "DAA_Unit2.pdf", page: "Page 41" },
  { name: "DAA_QB_2024.xlsx", page: "Sheet 3" },
];

export function ChatSim() {
  const prefersReducedMotion = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [selectedMarks, setSelectedMarks] = useState(10);
  const [displayedAnswer, setDisplayedAnswer] = useState("");
  const [showSources, setShowSources] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize animation timeline on mount
  useEffect(() => {
    if (prefersReducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStage(4);
       
      setDisplayedAnswer(ANSWER);
       
      setShowSources(true);
      return;
    }

    const timeline = [
      { delay: 300, action: () => setStage(1) },
      { delay: 2500, action: () => setStage(2) },
      { delay: 3400, action: () => setStage(3) },
      { delay: 6000, action: () => setStage(4) },
      { delay: 7000, action: () => setShowSources(true) },
    ];

    const timeouts = timeline.map((item) =>
      setTimeout(item.action, item.delay)
    );

    return () => timeouts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stream answer when stage reaches 3
  useEffect(() => {
    if (stage !== 3) return;

    const words = ANSWER.split(" ");
    let wordIndex = 0;

    const interval = setInterval(() => {
      if (wordIndex < words.length) {
        setDisplayedAnswer((prev) =>
          prev + (prev ? " " : "") + words[wordIndex]
        );
        wordIndex++;
      } else {
        clearInterval(interval);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [stage]);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-sm"
    >
      {/* Glow background */}
      <div className="absolute -inset-8 rounded-2xl bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-accent)] opacity-0 blur-2xl pointer-events-none" />

      {/* Card */}
      <div className="panel relative p-6 space-y-4">
        {/* Marks selector */}
        <div className="flex gap-2">
          {MARKS_OPTIONS.map((marks) => (
            <motion.button
              key={marks}
              onClick={() => setSelectedMarks(marks)}
              className={`chip ${selectedMarks === marks ? "active" : ""}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {marks}
            </motion.button>
          ))}
        </div>

        {/* Question */}
        {stage >= 1 && (
          <motion.div
            className="text-sm text-[var(--color-fg)] font-mono"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <TypeWriter text={QUESTION} speed={30} />
          </motion.div>
        )}

        {/* Thinking dots */}
        {stage === 2 && (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <PulsingDots />
          </motion.div>
        )}

        {/* Answer streaming */}
        {stage >= 3 && (
          <motion.div
            className="text-sm text-[var(--color-muted)] leading-relaxed"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {displayedAnswer.split(" ").map((word, idx) => {
              const isCitation = /^\[S\d+\]$/.test(word);
              return (
                <span key={idx}>
                  {isCitation ? (
                    <motion.span
                      className="badge-red ml-1 inline-block"
                      initial={prefersReducedMotion ? { scale: 1 } : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    >
                      {word}
                    </motion.span>
                  ) : (
                    <span>{word} </span>
                  )}
                </span>
              );
            })}
          </motion.div>
        )}

        {/* Sources */}
        {showSources && (
          <motion.div
            className="pt-4 border-t border-[var(--color-line)] space-y-2"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {SOURCES.map((source, idx) => (
              <motion.div
                key={idx}
                className="card p-3 text-xs text-[var(--color-muted)]"
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <div className="font-mono">
                  {source.name} · {source.page}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
