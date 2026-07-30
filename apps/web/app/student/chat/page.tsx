"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  BookOpen,
  Check,
  Copy,
  Star,
  Warning,
  DocumentText,
  Paperclip,
  CloseCircle,
  Image as ImageIcon,
  Key,
} from "reicon-react";
import { ModelSelector } from "@/components/ui/ModelSelector";
import { getUserApiKey, setUserApiKey, getUserBaseUrl, setUserBaseUrl } from "@/lib/api";

// react-markdown + remark-gfm are heavy — load them only on the chat page,
// only when an answer renders.
const Markdown = dynamic(() => import("@/components/Markdown"), { ssr: false });
const CaterpillarReasoning = dynamic(() => import("@/components/ui/CaterpillarReasoningIndicator").then(m => m.CaterpillarReasoningIndicator), { ssr: false });
import {
  MARKS_OPTIONS,
  SEMESTER_OPTIONS,
  routeQuestion,
  generateMockAnswer,
  type StudyAnswer,
  type RouteResult,
} from "@/lib/mockData";
import {
  askQuestion,
  fetchApi,
  hasRealSession,
  studentApi,
  type ApiAnswerResponse,
  type ApiModel,
  type ApiModule,
  type ApiSessionMessage,
  type ApiChatAttachment,
  type ApiInputModality,
} from "@/lib/api";
import { Dropdown } from "@/components/Dropdown";

interface RealSubject {
  id: string;
  name: string;
  code: string;
}

interface ThreadItem {
  key: string;
  logId: string | null;
  question: string;
  marks: number;
  model: string | null;
  answer: StudyAnswer | null;
  status: "pending" | "done" | "error";
  error: string | null;
  feedbackRating: number | null;
  feedbackComment: string | null;
  attachmentNames: string[];
}

const ACCEPTED_MIME_TYPES: Record<Exclude<ApiInputModality, "text">, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  document: ["application/pdf", "text/plain"],
  audio: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
};

function modalityForFile(file: File): ApiInputModality | null {
  for (const [modality, mimeTypes] of Object.entries(ACCEPTED_MIME_TYPES)) {
    if (mimeTypes.includes(file.type)) return modality as ApiInputModality;
  }
  return null;
}

function fileToAttachment(file: File): Promise<ApiChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () =>
      resolve({
        filename: file.name,
        mime_type: file.type,
        data_url: String(reader.result),
      });
    reader.readAsDataURL(file);
  });
}

function mapSources(sources: ApiSessionMessage["sources"]) {
  return sources.map((s) => ({
    tag: s.label,
    document: s.document_name,
    location:
      s.page_number != null
        ? `Page ${s.page_number}`
        : s.slide_number != null
          ? `Slide ${s.slide_number}`
          : (s.sheet_name ?? "—"),
    preview: s.preview ?? "",
  }));
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
    sources: mapSources(api.sources),
    model: api.model,
  };
}

function messageToThreadItem(m: ApiSessionMessage): ThreadItem {
  return {
    key: m.id,
    logId: m.id,
    question: m.question,
    marks: m.marks,
    model: m.model_name,
    status: "done",
    error: null,
    feedbackRating: m.feedback_rating,
    feedbackComment: m.feedback_comment,
    attachmentNames: [],
    answer: {
      question: m.question,
      marks: m.marks,
      subject: m.subject_name ?? "—",
      module: m.module_name ?? "Whole subject",
      body: m.answer ?? "No answer was generated.",
      wordCount: m.word_count ?? 0,
      processingMs: m.processing_ms ?? 0,
      sources: mapSources(m.sources),
      model: m.model_name,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained as fallback
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
    </div>
  );
}

const semLabel = (sem: string) => `Semester ${sem.replace("S", "")}`;

export default function ChatPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <span className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </div>
      }
    >
      <ChatPageRouter />
    </Suspense>
  );
}

/** Reads URL params and remounts the chat per session — a fresh thread on
 * every session switch, exactly like dedicated chat apps. */
function ChatPageRouter() {
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");
  const subjectParam = searchParams.get("subject");
  const moduleParam = searchParams.get("module");
  return (
    <ChatPage
      key={sessionParam ?? "new"}
      sessionParam={sessionParam}
      subjectParam={subjectParam}
      moduleParam={moduleParam}
    />
  );
}

function ChatPage({
  sessionParam,
  subjectParam,
  moduleParam,
}: {
  sessionParam: string | null;
  subjectParam: string | null;
  moduleParam: string | null;
}) {
  const router = useRouter();
  const [marks, setMarks] = useState(5);
  const [customMarksOpen, setCustomMarksOpen] = useState(false);
  const [customMarksText, setCustomMarksText] = useState("15");
  const [semester, setSemester] = useState(
    SEMESTER_OPTIONS.includes("S5") ? "S5" : SEMESTER_OPTIONS[0],
  );
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [threadLoaded, setThreadLoaded] = useState(!sessionParam);
  const [detected, setDetected] = useState<RouteResult | null>(null);
  const [openSources, setOpenSources] = useState<Set<string>>(new Set());
  const [feedbackOpen, setFeedbackOpen] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [runError, setRunError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [realSubjects, setRealSubjects] = useState<RealSubject[]>([]);
  const [chosenSubjectId, setChosenSubjectId] = useState<string | null>(null);
  const [modules, setModules] = useState<ApiModule[]>([]);
  const [models, setModels] = useState<ApiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => getUserApiKey() ?? "");
  const [savedKey, setSavedKey] = useState<string | null>(() => getUserApiKey());
  const [baseUrlInput, setBaseUrlInput] = useState(() => getUserBaseUrl() ?? "");
  const [savedBaseUrl, setSavedBaseUrl] = useState<string | null>(() => getUserBaseUrl());
  const [modelProvider, setModelProvider] = useState<"ollama" | "router">("ollama");
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSessionId = sessionParam ?? createdSessionId;
  const selectedSubjectId = chosenSubjectId ?? subjectParam ?? "";
  const activeModule = modules.find((m) => m.id === moduleParam) ?? null;
  const selectedModelInfo = models.find((model) => model.id === selectedModel);
  const inputModalities = selectedModelInfo?.input_modalities ?? ["text"];
  const mediaModalities = inputModalities.filter(
    (item): item is Exclude<ApiInputModality, "text"> => item !== "text",
  );
  const acceptedMimeTypes = mediaModalities.flatMap(
    (modality) => ACCEPTED_MIME_TYPES[modality],
  );

  const refreshSessions = useCallback(() => {
    window.dispatchEvent(new Event("vibegpt:sessions-changed"));
  }, []);

  // Load the thread when opening an existing session.
  useEffect(() => {
    if (!sessionParam || !hasRealSession()) return;
    let active = true;
    studentApi
      .getSessionMessages(sessionParam)
      .then((msgs) => {
        if (!active) return;
        setThread(msgs.map(messageToThreadItem));
        setThreadLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setThread([]);
        setThreadLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [sessionParam]);

  useEffect(() => {
    if (!hasRealSession() || !selectedSubjectId) return;
    let active = true;
    studentApi
      .listModules(selectedSubjectId)
      .then((mods) => {
        if (active) setModules(mods);
      })
      .catch(() => {
        if (active) setModules([]);
      });
    return () => {
      active = false;
    };
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!hasRealSession()) return;
    fetchApi("/api/v1/student/subjects")
      .then((subs: RealSubject[]) => {
        setRealSubjects(subs);
      })
      .catch(() => setRealSubjects([]));
    studentApi
      .listModels()
      .then((res) => {
        setModels(res.models);
        setModelProvider(res.provider);
        setSelectedModel((current) => current || res.default);
      })
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, loading]);

  // Also scroll after the reasoning animation renders (it mounts after thread updates)
  useEffect(() => {
    if (!loading) return;
    const el = scrollRef.current;
    if (!el) return;
    const scrollDown = () => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    };
    scrollDown();
    const timer = setTimeout(scrollDown, 150);
    return () => clearTimeout(timer);
  }, [loading]);

  const run = async (q: string, m: number, files: File[] = []) => {
    const realSession = hasRealSession();
    const route = realSession ? null : routeQuestion(q, semester);
    setDetected(route);
    setLoading(true);
    setRunError(null);

    const itemKey = `local-${crypto.randomUUID()}`;
    const pendingItem: ThreadItem = {
      key: itemKey,
      logId: null,
      question: q,
      marks: m,
      model: realSession ? selectedModel || null : null,
      answer: null,
      status: "pending",
      error: null,
      feedbackRating: null,
      feedbackComment: null,
      attachmentNames: files.map((file) => file.name),
    };
    setThread((prev) => [...prev, pendingItem]);

    const patchItem = (patch: Partial<ThreadItem>) =>
      setThread((prev) => prev.map((t) => (t.key === itemKey ? { ...t, ...patch } : t)));

    if (realSession) {
      const real = realSubjects.find((subject) => subject.id === selectedSubjectId);
      try {
        const apiAttachments = await Promise.all(files.map(fileToAttachment));
        const api = await askQuestion({
          subject_id: real?.id ?? null,
          module_id: real ? activeModule?.id ?? null : null,
          marks: m,
          question: q,
          model: selectedModel || null,
          session_id: activeSessionId,
          attachments: apiAttachments,
        });
        const resolved = realSubjects.find((subject) => subject.id === api.subject_id);
        patchItem({
          logId: api.id,
          model: api.model,
          answer: apiAnswerToStudyAnswer(
            api,
            resolved?.name ?? api.subject_name,
            real ? activeModule?.name ?? "Whole subject" : "Auto-detected",
          ),
          status: "done",
        });
        if (!activeSessionId && api.session_id) {
          setCreatedSessionId(api.session_id);
          refreshSessions();
          router.replace(`/student/chat?session=${api.session_id}`);
        } else {
          refreshSessions();
        }
        setLoading(false);
        return;
      } catch (error) {
        patchItem({
          status: "error",
          error:
            error instanceof Error ? error.message : "The grounded answer service is unavailable.",
        });
        setLoading(false);
        return;
      }
    }

    // Demo mode (no backend session) — mock answer.
    const result = route
      ? generateMockAnswer(q, m, route.subject.name, route.module.name)
      : generateMockAnswer(q, m, "General", "General");
    await new Promise((r) => setTimeout(r, 1100));
    patchItem({ answer: result, status: "done" });
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim() || (attachments.length ? "Analyze the attached material." : "");
    if (!q || loading) return;
    const files = attachments;
    run(q, marks, files);
    setQuestion("");
    setAttachments([]);
  };

  const addAttachments = (files: FileList | File[] | null) => {
    if (!files) return;
    setRunError(null);
    const next = Array.from(files);
    const invalid = next.find((file) => {
      const modality = modalityForFile(file);
      return !modality || !inputModalities.includes(modality);
    });
    if (invalid) {
      setRunError(`${selectedModel || "This model"} cannot accept ${invalid.name}.`);
      return;
    }
    const oversized = next.find((file) => file.size > 8 * 1024 * 1024);
    if (oversized) {
      setRunError(`${oversized.name} is larger than the 8 MB limit.`);
      return;
    }
    setAttachments((current) => {
      const combined = [...current, ...next];
      if (combined.length > 4) {
        setRunError("You can attach up to 4 files at once.");
        return current;
      }
      return combined;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardImages = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
      .map(
        (file, index) =>
          new File(
            [file],
            `pasted-image-${Date.now()}${index ? `-${index + 1}` : ""}.${
              file.type.split("/")[1]?.replace("jpeg", "jpg") || "png"
            }`,
            { type: file.type, lastModified: Date.now() },
          ),
      );

    if (clipboardImages.length === 0) return;
    event.preventDefault();
    addAttachments(clipboardImages);
  };

  const changeModel = (modelId: string) => {
    const nextModel = models.find((model) => model.id === modelId);
    const nextModalities = nextModel?.input_modalities ?? ["text"];
    const removed = attachments.some((file) => {
      const modality = modalityForFile(file);
      return !modality || !nextModalities.includes(modality);
    });
    if (removed) {
      setAttachments([]);
      setRunError("Attachments were removed because the selected model cannot read them.");
    }
    setSelectedModel(modelId);
  };

  const copy = (body: string) => {
    navigator.clipboard.writeText(body.replace(/\*\*/g, ""));
  };

  const toggleSources = (key: string) => {
    setOpenSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleFeedback = (key: string) => {
    setFeedbackOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSave = async (item: ThreadItem) => {
    if (!item.logId) return;
    const isSaved = savedIds.has(item.logId);
    try {
      if (isSaved) await studentApi.unsaveAnswer(item.logId);
      else await studentApi.saveAnswer(item.logId);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.delete(item.logId!);
        else next.add(item.logId!);
        return next;
      });
    } catch {
      setRunError("Could not update the saved state.");
    }
  };

  const showEmpty = threadLoaded && thread.length === 0 && !loading;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-5 sm:px-8 h-16 border-b border-line">
        <div className="min-w-0">
          <h1 className="text-base font-semibold truncate">
            {activeSessionId ? "Conversation" : "Ask a question"}
          </h1>
          <p className="text-xs text-faint truncate">
            {realSubjects.length > 0
              ? realSubjects.find((subject) => subject.id === selectedSubjectId)?.name ??
                "Auto-detect subject"
              : semLabel(semester)}
            {activeModule
              ? ` · ${activeModule.name}`
              : detected
                ? ` · ${detected.subject.name}`
                : " · grounded study mode"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="badge badge-red hidden sm:inline-flex"
            title={`Provider: ${modelProvider}`}
          >
            ● Grounded mode
          </span>
        </div>
      </header>

      {/* Conversation area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8">
          {runError && (
            <div className="panel p-4 mb-5 border border-err/40" role="alert">
              <p className="text-sm font-semibold text-err">Heads up</p>
              <p className="text-xs text-muted mt-1">{runError}</p>
            </div>
          )}

          {!threadLoaded && (
            <div className="space-y-6">
              <div className="skeleton h-16 w-2/3 ml-auto" />
              <div className="skeleton h-40 w-full" />
            </div>
          )}

          {showEmpty && (
            <div className="text-center py-16 fade-up">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-panel border border-line glow-ring flex items-center justify-center text-brand-accent">
                <BookOpen size={28} />
              </div>
              <h2 className="text-2xl font-bold mb-2">What would you like to study?</h2>
              <p className="text-sm text-muted max-w-md mx-auto">
                Pick a subject and marks below, then ask. VibeGPT answers from your
                college materials when it has them, and from its own knowledge when it
                doesn&apos;t.
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

          {/* Thread */}
          {thread.map((item) => (
            <div key={item.key} className="mb-6 fade-up">
              {/* User bubble */}
              <div className="flex justify-end mb-4">
                <div className="bubble-user max-w-[85%]">
                  <p className="text-[15px] whitespace-pre-wrap">{item.question}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="badge badge-neutral">{item.marks} marks</span>
                    {item.model && <span className="badge badge-neutral">{item.model}</span>}
                    <span className="badge badge-neutral">
                      {realSubjects.length > 0
                        ? realSubjects.find((subject) => subject.id === selectedSubjectId)?.code ??
                          "Auto"
                        : semLabel(semester)}
                    </span>
                    {item.attachmentNames.map((name) => (
                      <span key={name} className="badge badge-neutral">
                        <ImageIcon size={12} /> {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Assistant */}
              {item.status === "pending" && <CaterpillarReasoning isProcessing={true} />}

              {item.status === "error" && (
                <div className="panel p-4 border border-err/40" role="alert">
                  <p className="text-sm font-semibold text-err">Couldn&apos;t answer that</p>
                  <p className="text-xs text-muted mt-1">{item.error}</p>
                </div>
              )}

              {item.status === "done" && item.answer && (
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#e50914] to-[#ff2a2a] flex items-center justify-center text-xs font-extrabold text-white">
                      V
                    </div>
                    <span className="text-sm font-semibold">VibeGPT</span>
                    <span className="text-[11px] text-faint">
                      {item.answer.wordCount} words · {item.answer.processingMs}ms
                      {item.answer.sources.length > 0 &&
                        ` · ${item.answer.sources.length} sources`}
                    </span>
                  </div>

                  <div className="answer-card">
                    <Markdown text={item.answer.body} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <CopyButton text={item.answer.body} onCopy={copy} />
                    {item.logId && (
                      <button
                        onClick={() => toggleSave(item)}
                        className="btn-ghost inline-flex items-center gap-1.5"
                        style={
                          savedIds.has(item.logId)
                            ? { color: "#ff2a2a", borderColor: "rgba(229,9,20,0.5)" }
                            : undefined
                        }
                      >
                        <Star size={14} weight={savedIds.has(item.logId) ? "Filled" : "Outline"} />
                        {savedIds.has(item.logId) ? "Saved" : "Save"}
                      </button>
                    )}
                    {item.logId &&
                      (item.feedbackRating ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="btn-ghost inline-flex items-center gap-1.5 !cursor-default"
                            style={{ color: "#ff2a2a", borderColor: "rgba(229,9,20,0.5)" }}
                          >
                            <Star size={14} weight="Filled" />
                            Rated {item.feedbackRating}/5 · sent
                          </span>
                          <button
                            onClick={() => toggleFeedback(item.key)}
                            className="btn-ghost"
                            title="Edit your feedback"
                          >
                            Edit
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => toggleFeedback(item.key)}
                          className="btn-ghost inline-flex items-center gap-1.5"
                        >
                          <Warning size={14} /> Feedback
                        </button>
                      ))}
                    {item.answer.sources.length > 0 && (
                      <button
                        onClick={() => toggleSources(item.key)}
                        className="btn-ghost inline-flex items-center gap-1.5 ml-auto"
                      >
                        <DocumentText size={14} /> Sources ({item.answer.sources.length})
                      </button>
                    )}
                  </div>

                  {item.logId && feedbackOpen.has(item.key) && (
                    <FeedbackForm
                      logId={item.logId}
                      initialRating={item.feedbackRating ?? 0}
                      initialComment={item.feedbackComment ?? ""}
                      onDone={(rating, comment) => {
                        setThread((prev) =>
                          prev.map((t) =>
                            t.key === item.key
                              ? { ...t, feedbackRating: rating, feedbackComment: comment }
                              : t,
                          ),
                        );
                        toggleFeedback(item.key);
                      }}
                      onCancel={() => toggleFeedback(item.key)}
                    />
                  )}

                  {openSources.has(item.key) && (
                    <div className="mt-4 space-y-2 fade-in">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                        Source references
                      </p>
                      {item.answer.sources.map((src) => (
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
          ))}
        </div>
      </div>

      {/* Sticky composer */}
      <div className="border-t border-line bg-bg/60 backdrop-blur px-5 sm:px-8 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex flex-wrap items-center gap-2 mb-3">
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
                  onChange={(v) => {
                    setChosenSubjectId(v);
                    if (!v) setModules([]);
                  }}
                  options={[
                    { value: "", label: "Auto-detect from question" },
                    ...realSubjects.map((subject) => ({
                      value: subject.id,
                      label: `${subject.code} · ${subject.name}`,
                    })),
                  ]}
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

          {keyOpen && (
            <div className="mx-3 mb-2 rounded-xl border border-brand-border bg-panel-2 p-3.5 fade-in">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-fg">Use your own API key</p>
                {savedKey && (
                  <span className="badge badge-success !text-[10px]">key active</span>
                )}
                {savedBaseUrl && (
                  <span className="badge !text-[10px] bg-brand-soft text-brand-accent">
                    custom endpoint
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-faint">
                Requests will be billed to your own account instead of the shared
                campus quota. Stored only in this browser.
              </p>
              <div className="mt-2.5 flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-…"
                  autoComplete="off"
                  className="input h-9 flex-1 !text-[13px]"
                  aria-label="Your API key"
                />
                <input
                  type="text"
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  autoComplete="off"
                  className="input h-9 flex-1 !text-[13px]"
                  aria-label="Custom API base URL (optional)"
                />
                <button
                  type="button"
                  className="btn-primary h-9 !px-4 !text-[13px]"
                  disabled={!apiKeyInput.trim()}
                  onClick={() => {
                    setUserApiKey(apiKeyInput.trim());
                    setSavedKey(apiKeyInput.trim());
                    if (baseUrlInput.trim()) {
                      setUserBaseUrl(baseUrlInput.trim());
                      setSavedBaseUrl(baseUrlInput.trim());
                    }
                    setKeyOpen(false);
                  }}
                >
                  Save
                </button>
                {(savedKey || savedBaseUrl) && (
                  <button
                    type="button"
                    className="btn-ghost h-9 !px-3 !text-[13px]"
                    onClick={() => {
                      setUserApiKey(null);
                      setSavedKey(null);
                      setApiKeyInput("");
                      setUserBaseUrl(null);
                      setSavedBaseUrl(null);
                      setBaseUrlInput("");
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="composer p-2.5">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-2 pt-1 pb-2" aria-label="Attachments">
                {attachments.map((file, index) => (
                  <span
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="inline-flex max-w-full items-center gap-2 rounded-lg border border-brand-border bg-brand-soft px-2.5 py-1.5 text-xs text-fg"
                  >
                    <ImageIcon size={14} className="shrink-0 text-brand-accent" />
                    <span className="max-w-44 truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((current) => current.filter((_, i) => i !== index))
                      }
                      className="text-faint transition-colors hover:text-fg"
                      aria-label={`Remove ${file.name}`}
                    >
                      <CloseCircle size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onPaste={handlePaste}
              placeholder="Ask a question — VibeGPT finds the right subject…"
              rows={1}
              maxLength={2000}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              className="w-full bg-transparent resize-none outline-none text-[15px] px-2 py-2 max-h-40 placeholder:text-faint"
            />
            <div className="composer-toolbar">
              <div className="flex min-w-0 items-center gap-2">
                {mediaModalities.length > 0 && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={acceptedMimeTypes.join(",")}
                      className="sr-only"
                      onChange={(event) => addAttachments(event.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="composer-tool-button"
                      title={`Attach ${mediaModalities.join(", ")} input`}
                      aria-label={`Attach ${mediaModalities.join(", ")} input`}
                    >
                      <Paperclip size={16} />
                    </button>
                  </>
                )}
                {models.length > 0 && (
                  <ModelSelector
                    value={selectedModel}
                    onChange={changeModel}
                    models={models.map((m) => ({
                      id: m.id,
                      ownedBy: m.owned_by,
                      inputModalities: m.input_modalities as string[],
                    }))}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setKeyOpen((v) => !v)}
                  className={`composer-tool-button ${keyOpen || savedKey ? "!text-brand-accent !border-brand-border" : ""}`}
                  title="Use your own API key"
                  aria-label="Use your own API key"
                  aria-expanded={keyOpen}
                >
                  <Key size={16} />
                </button>
              </div>
              <button
                type="submit"
                disabled={loading || (!question.trim() && attachments.length === 0)}
                className="btn-primary h-11 w-11 !px-0 rounded-xl shrink-0"
                aria-label="Send"
              >
                {loading ? (
                  <span className="loading-dots"><span></span><span></span><span></span></span>
                ) : (
                  "↑"
                )}
              </button>
            </div>
          </div>
          <p className="text-center text-[11px] text-faint mt-2">
            Subject answers prioritise admin-approved materials · general questions use the
            model&apos;s own knowledge · supported attachments follow the selected model ·
            paste images with Ctrl+V · Enter to send, Shift+Enter for a new line
          </p>
        </form>
      </div>
    </div>
  );
}

function CopyButton({ text, onCopy }: { text: string; onCopy: (text: string) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        onCopy(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="btn-ghost inline-flex items-center gap-1.5"
    >
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
  );
}

function FeedbackForm({
  logId,
  initialRating,
  initialComment,
  onDone,
  onCancel,
}: {
  logId: string;
  initialRating: number;
  initialComment: string;
  onDone: (rating: number, comment: string | null) => void;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(initialComment);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = initialRating > 0;

  const submit = async () => {
    if (!rating || sending) return;
    setSending(true);
    setError(null);
    try {
      await studentApi.submitFeedback({
        question_log_id: logId,
        rating,
        comment: comment.trim() || null,
      });
      onDone(rating, comment.trim() || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send feedback");
      setSending(false);
    }
  };

  return (
    <div className="mt-3 card p-4 fade-in">
      <p className="text-[13px] font-semibold mb-2.5">
        {isEdit ? "Edit your feedback" : "Rate this answer / report a problem"}
      </p>
      <div className="flex items-center gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(star)}
            className="transition-transform hover:scale-110 active:scale-95"
          >
            <Star
              size={22}
              weight={(hover || rating) >= star ? "Filled" : "Outline"}
              color={(hover || rating) >= star ? "#ff2a2a" : "#3d3d42"}
            />
          </button>
        ))}
        {rating > 0 && <span className="text-xs text-faint ml-2">{rating}/5</span>}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="What went wrong, or what could be better? (optional, but helps for reports)"
        className="input resize-none text-sm"
      />
      {error && <p className="text-xs text-err mt-2">{error}</p>}
      <div className="flex items-center gap-2 mt-3">
        <button onClick={submit} disabled={!rating || sending} className="btn-primary">
          {sending ? "Sending..." : isEdit ? "Update feedback" : "Send feedback"}
        </button>
        <button onClick={onCancel} className="btn-ghost" disabled={sending}>
          Cancel
        </button>
      </div>
    </div>
  );
}
