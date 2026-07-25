"use client";

import { useState, useRef, useEffect } from "react";
import {
  BookOpen,
  Target,
  Warning,
  Check,
  Copy,
  Star,
  Refresh,
  Sparkles,
  DocumentText,
} from "reicon-react";
import {
  MARKS_OPTIONS,
  SEMESTER_OPTIONS,
  routeQuestion,
  generateMockAnswer,
  simplifyAnswer,
  type StudyAnswer,
  type RouteResult,
} from "@/lib/mockData";
import { askQuestion, fetchApi, hasRealSession, type ApiAnswerResponse } from "@/lib/api";
import { Dropdown } from "@/components/Dropdown";

interface RealSubject {
  id: string;
  name: string;
  code: string;
}

function apiAnswerToStudyAnswer(
  api: ApiAnswerResponse,
  subjectName: string,
  moduleName: string,
): StudyAnswer {
  return {
    question: api.question,
    marks: api.marks,
    subject: subjectName,
    module: moduleName,
    body: api.answer ?? "No answer was generated.",
    wordCount: api.word_count ?? 0,
    processingMs: api.processing_ms ?? 0,
    sources: api.sources.map((s) => ({
      tag: s.label,
      document: s.document_name,
      location:
        s.page_number != null
          ? `Page ${s.page_number}`
          : s.slide_number != null
            ? `Slide ${s.slide_number}`
            : (s.sheet_name ?? "—"),
      preview: s.preview ?? "",
    })),
  };
}

function renderBody(body: string) {
  // Minimal markdown-ish rendering for **bold**, bullets, and paragraphs.
  return body.split("\n").map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-2" />;
    const html = trimmed
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
    if (trimmed.startsWith("- ")) {
      return (
        <li
          key={i}
          className="ml-4 list-disc"
          dangerouslySetInnerHTML={{ __html: html.slice(2) }}
        />
      );
    }
    return <p key={i} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

function AnswerSkeleton() {
  return (
    <div className="answer-card space-y-3 fade-in">
      <div className="skeleton h-4 w-2/5" />
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-3 w-11/12" />
      <div className="skeleton h-3 w-4/5" />
      <div className="h-2" />
      <div className="skeleton h-3 w-3/4" />
      <div className="skeleton h-3 w-5/6" />
      <div className="flex gap-2 pt-2">
        <div className="skeleton h-6 w-20" />
        <div className="skeleton h-6 w-20" />
      </div>
    </div>
  );
}

const semLabel = (sem: string) => `Semester ${sem.replace("S", "")}`;

export default function ChatPage() {
  const [marks, setMarks] = useState(5);
  const [customMarksOpen, setCustomMarksOpen] = useState(false);
  const [customMarksText, setCustomMarksText] = useState("15");
  const [semester, setSemester] = useState(
    SEMESTER_OPTIONS.includes("S5") ? "S5" : SEMESTER_OPTIONS[0],
  );
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<StudyAnswer | null>(null);
  const [detected, setDetected] = useState<RouteResult | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Real backend subjects the student can access (empty in demo mode).
  const [realSubjects, setRealSubjects] = useState<RealSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");

  useEffect(() => {
    if (!hasRealSession()) return;
    fetchApi("/api/v1/student/subjects")
      .then((subs: RealSubject[]) => {
        setRealSubjects(subs);
        setSelectedSubjectId((current) => current || subs[0]?.id || "");
      })
      .catch(() => setRealSubjects([]));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [answer, loading]);

  const run = async (q: string, m: number) => {
    const realSession = hasRealSession();
    const route = realSession ? null : routeQuestion(q, semester);
    setDetected(route);
    setLoading(true);
    setShowSources(false);
    setCopied(false);
    setSaved(false);
    setRunError(null);

    // Grounded mode always queries the subject explicitly selected by the student.
    if (realSession) {
      const real = realSubjects.find((subject) => subject.id === selectedSubjectId);
      if (real) {
        try {
          const api = await askQuestion({
            subject_id: real.id,
            module_id: null,
            marks: m,
            question: q,
          });
          setAnswer(
            apiAnswerToStudyAnswer(api, real.name, "Whole subject"),
          );
          setLoading(false);
          return;
        } catch (error) {
          setRunError(
            error instanceof Error
              ? error.message
              : "The grounded answer service is unavailable.",
          );
          setLoading(false);
          return;
        }
      }
      setRunError(
        "Select an accessible subject first, or ask an admin to assign your department and semester.",
      );
      setLoading(false);
      return;
    }

    const result = route
      ? generateMockAnswer(q, m, route.subject.name, route.module.name)
      : generateMockAnswer(q, m, "General", "General");
    await new Promise((r) => setTimeout(r, 1100));
    setAnswer(result);
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    run(q, marks);
    setQuestion("");
  };

  const regenerate = () => answer && run(answer.question, answer.marks);
  const simplify = async () => {
    if (!answer) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 700));
    setAnswer(simplifyAnswer(answer));
    setLoading(false);
  };
  const copy = () => {
    if (!answer) return;
    navigator.clipboard.writeText(answer.body.replace(/\*\*/g, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-5 sm:px-8 h-16 border-b border-line">
        <div>
          <h1 className="text-base font-semibold">Ask a question</h1>
          <p className="text-xs text-faint">
            {realSubjects.length > 0
              ? realSubjects.find((subject) => subject.id === selectedSubjectId)?.name
              : semLabel(semester)}
            {detected ? ` · ${detected.subject.name}` : " · grounded study mode"}
          </p>
        </div>
        <span className="badge badge-red hidden sm:inline-flex">● Grounded mode</span>
      </header>

      {/* Conversation area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8">
          {runError && (
            <div className="panel p-4 mb-5 border border-err/40" role="alert">
              <p className="text-sm font-semibold text-err">Grounded answer unavailable</p>
              <p className="text-xs text-muted mt-1">{runError}</p>
              <p className="text-xs text-faint mt-1">
                No mock answer was substituted because you are signed in to grounded mode.
              </p>
            </div>
          )}
          {!answer && !loading && (
            <div className="text-center py-16 fade-up">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-panel border border-line glow-ring flex items-center justify-center text-brand-accent">
                <BookOpen size={28} />
              </div>
              <h2 className="text-2xl font-bold mb-2">What would you like to study?</h2>
              <p className="text-sm text-muted max-w-md mx-auto">
                Pick your semester and marks below, then ask. VibeGPT figures out which
                subject your question belongs to and writes a structured, cited answer.
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left">
                {[
                  "Explain ACID properties of a transaction",
                  "Compare paging and segmentation",
                  "State and prove the Master Theorem",
                  "Difference between TCP and UDP",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => run(s, marks)}
                    className="card card-hover p-3.5 text-sm text-muted hover:text-fg text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Question bubble */}
          {(answer || loading) && (
            <div className="flex justify-end mb-6 fade-up">
              <div className="bubble-user max-w-[85%]">
                <p className="text-[15px]">{answer?.question ?? (question || "…")}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="badge badge-neutral">{answer?.marks ?? marks} marks</span>
                  <span className="badge badge-neutral">
                    {realSubjects.length > 0
                      ? realSubjects.find((subject) => subject.id === selectedSubjectId)?.code
                      : semLabel(semester)}
                  </span>
                  {detected && (
                    <span className="text-[11px] text-faint">
                      {detected.subject.icon} {detected.subject.code}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {loading && <AnswerSkeleton />}

          {/* Answer */}
          {answer && !loading && (
            <div className="fade-up">
              {/* Detected subject banner */}
              {detected && (
                <div className="mb-3">
                  {detected.confidence === "high" ? (
                    <span className="badge badge-success inline-flex items-center gap-1.5">
                      <Target size={13} /> Detected subject: {detected.subject.name} · {detected.module.name}
                    </span>
                  ) : (
                    <span className="badge badge-warning inline-flex items-center gap-1.5">
                      <Warning size={13} /> Couldn&apos;t confidently match a subject — showing best guess:{" "}
                      {detected.subject.name}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#e50914] to-[#ff2a2a] flex items-center justify-center text-xs font-extrabold text-white">
                  V
                </div>
                <span className="text-sm font-semibold">VibeGPT</span>
                <span className="text-[11px] text-faint">
                  {answer.wordCount} words · {answer.processingMs}ms
                </span>
              </div>

              <div className="answer-card">{renderBody(answer.body)}</div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button onClick={copy} className="btn-ghost inline-flex items-center gap-1.5">
                  {copied ? (
                    <>
                      <Check size={14} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copy
                    </>
                  )}
                </button>
                <button
                  onClick={() => setSaved((s) => !s)}
                  className="btn-ghost inline-flex items-center gap-1.5"
                  style={saved ? { color: "#ff2a2a", borderColor: "rgba(229,9,20,0.5)" } : undefined}
                >
                  <Star size={14} weight={saved ? "Filled" : "Outline"} />
                  {saved ? "Saved" : "Save"}
                </button>
                <button onClick={regenerate} className="btn-ghost inline-flex items-center gap-1.5">
                  <Refresh size={14} /> Regenerate
                </button>
                <button onClick={simplify} className="btn-ghost inline-flex items-center gap-1.5">
                  <Sparkles size={14} /> Simplify
                </button>
                <button
                  onClick={() => setShowSources((v) => !v)}
                  className="btn-ghost inline-flex items-center gap-1.5 ml-auto"
                >
                  <DocumentText size={14} /> Sources ({answer.sources.length})
                </button>
              </div>

              {/* Sources */}
              {showSources && (
                <div className="mt-4 space-y-2 fade-in">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                    Source references
                  </p>
                  {answer.sources.map((src) => (
                    <div key={src.tag} className="card p-3.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="source-tag">{src.tag}</span>
                        <span className="text-sm font-medium">{src.document}</span>
                        <span className="badge badge-neutral ml-auto">{src.location}</span>
                      </div>
                      <p className="text-xs text-muted italic">{src.preview}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky composer */}
      <div className="border-t border-line bg-bg/60 backdrop-blur px-5 sm:px-8 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          {/* Selectors */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* Subject in grounded mode; semester in demo mode */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-faint mr-1">
                {realSubjects.length > 0 ? "Subject" : "Semester"}
              </span>
              {realSubjects.length > 0 ? (
                <Dropdown
                  variant="chip"
                  direction="up"
                  ariaLabel="Subject"
                  value={selectedSubjectId}
                  onChange={setSelectedSubjectId}
                  options={realSubjects.map((subject) => ({
                    value: subject.id,
                    label: `${subject.code} · ${subject.name}`,
                  }))}
                />
              ) : (
                <Dropdown
                  variant="chip"
                  direction="up"
                  ariaLabel="Semester"
                  value={semester}
                  onChange={setSemester}
                  options={SEMESTER_OPTIONS.map((s) => ({ value: s, label: semLabel(s) }))}
                />
              )}
            </div>

            {/* Marks */}
            <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
              <span className="text-[11px] text-faint mr-1">Marks</span>
              {MARKS_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMarks(m);
                    setCustomMarksOpen(false);
                  }}
                  className={`chip !px-3.5 ${!customMarksOpen && marks === m ? "active" : ""}`}
                >
                  {m}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomMarksOpen((v) => !v)}
                className={`chip !px-3.5 ${customMarksOpen ? "active" : ""}`}
                aria-expanded={customMarksOpen}
              >
                Custom
              </button>
              {customMarksOpen && (
                <span className="flex items-center gap-1.5 fade-in">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={customMarksText}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/\D/g, "").slice(0, 2);
                      setCustomMarksText(cleaned);
                      const parsed = parseInt(cleaned, 10);
                      if (!Number.isNaN(parsed) && parsed >= 1) {
                        setMarks(Math.min(20, parsed));
                      }
                    }}
                    className="marks-custom-input"
                    aria-label="Custom marks between 1 and 20"
                    placeholder="1–20"
                  />
                  <span className="text-[10px] text-faint">max 20</span>
                </span>
              )}
            </div>
          </div>

          {/* Input */}
          <div className="composer flex items-end gap-2 p-2.5">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question — VibeGPT finds the right subject…"
              rows={1}
              maxLength={2000}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              className="flex-1 bg-transparent resize-none outline-none text-[15px] px-2 py-2 max-h-40 placeholder:text-faint"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="btn-primary h-11 w-11 !px-0 rounded-xl"
              aria-label="Send"
            >
              {loading ? (
                <span className="loading-dots"><span></span><span></span><span></span></span>
              ) : (
                "↑"
              )}
            </button>
          </div>
          <p className="text-center text-[11px] text-faint mt-2">
            Answers use only admin-approved college materials · Enter to send, Shift+Enter for a new line
          </p>
        </form>
      </div>
    </div>
  );
}
