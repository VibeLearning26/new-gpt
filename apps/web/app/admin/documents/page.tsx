"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentText, BookOpen, Refresh, Upload } from "reicon-react";
import { Dropdown } from "@/components/Dropdown";
import {
  ApiError,
  adminApi,
  inferSourceType,
  type ApiDocument,
  type ApiModule,
  type ApiSemester,
  type ApiSubject,
  type SourceTypeValue,
} from "@/lib/api";
import { isDemoMode } from "@/lib/auth";
import { readDemoSubjects } from "@/lib/demoAcademic";
import { SEMESTER_OPTIONS } from "@/lib/mockData";

interface Upload {
  id: string;
  name: string;
  size: string;
  moduleName: string;
  status: "uploading" | "processing" | "done" | "duplicate" | "failed";
  error?: string;
  documentId?: string;
}

const EXT_COLOR: Record<string, string> = {
  pdf: "#ff6b6b",
  pptx: "#ffa94d",
  docx: "#74c0fc",
  xlsx: "#69db7c",
};

const CATEGORY_OPTIONS: { value: SourceTypeValue | "auto"; label: string }[] = [
  { value: "auto", label: "Auto (by file type)" },
  { value: "pdf_notes", label: "Notes (PDF)" },
  { value: "pptx_presentation", label: "Presentation" },
  { value: "docx_notes", label: "Notes (DOCX)" },
  { value: "xlsx_question_bank", label: "Question bank" },
  { value: "previous_year_paper", label: "Previous year paper" },
  { value: "teacher_answer", label: "Teacher answer" },
  { value: "teacher_example", label: "Teacher example" },
  { value: "other", label: "Other" },
];

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  uploaded: { cls: "badge-neutral", label: "Uploaded" },
  processing: { cls: "badge-warning", label: "Processing" },
  needs_review: { cls: "badge-warning", label: "Needs review" },
  ready: { cls: "badge-success", label: "✓ Ready" },
  published: { cls: "badge-red", label: "● Published" },
  failed: { cls: "badge-error", label: "Failed" },
  archived: { cls: "badge-neutral", label: "Archived" },
};

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

function FileIcon({ name, size = 20 }: { name: string; size?: number }) {
  return <DocumentText size={size} color={EXT_COLOR[ext(name)]} />;
}

let counter = 0;

export default function DocumentsPage() {
  const [semesters, setSemesters] = useState<ApiSemester[]>([]);
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [semesterId, setSemesterId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      if (isDemoMode) {
        const demoSemesters: ApiSemester[] = SEMESTER_OPTIONS.map((semester, index) => ({
          id: semester,
          number: index + 1,
          name: `Semester ${index + 1}`,
          is_active: true,
        }));
        const demoSubjects: ApiSubject[] = readDemoSubjects().map((subject) => ({
          id: subject.id,
          name: subject.name,
          code: subject.code,
          description: null,
          department_id: subject.department,
          semester_id: subject.semester,
          credits: null,
          is_active: true,
        }));
        setSemesters(demoSemesters);
        setSubjects(demoSubjects);
        setSemesterId((prev) => prev || "S1");
        setError(null);
        return;
      }
      const [sems, subs] = await Promise.all([
        adminApi.listSemesters(),
        adminApi.listSubjects(),
      ]);
      sems.sort((a, b) => a.number - b.number);
      setSemesters(sems);
      setSubjects(subs);
      setSemesterId((prev) => prev || (sems[0]?.id ?? ""));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load subjects");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial state is already loading=true, so the effect only starts the fetch.
  // Deferred via setTimeout to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    const timer = window.setTimeout(fetchData, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchData();
  }, [fetchData]);

  const visibleSubjects = subjects.filter(
    (subject) => subject.is_active && (!semesterId || subject.semester_id === semesterId),
  );

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Upload study material</h1>
        <p className="text-sm text-muted mt-1">
          Pick a semester, then add PDF, PPTX, DOCX or XLSX files under each subject.
          Files are extracted, chunked and embedded so VibeGPT can answer from them.
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="panel p-5 mb-6 text-center">
          <p className="text-sm text-muted mb-3">
            <span className="badge badge-error mr-2">Error</span>
            {error}
          </p>
          <p className="text-xs text-faint mb-3">
            Is the backend running? Log in with a real admin account — demo mode
            has no live subjects.
          </p>
          <button onClick={load} className="btn-ghost inline-flex items-center gap-1.5">
            <Refresh size={14} /> Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="space-y-4">
          <div className="panel p-5">
            <div className="skeleton h-4 w-24 mb-2" />
            <div className="skeleton h-9 w-full" />
          </div>
          <div className="card p-5">
            <div className="skeleton h-5 w-2/5 mb-3" />
            <div className="skeleton h-24 w-full" />
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Semester picker */}
          <div className="panel p-5 mb-6">
            <label className="field-label" htmlFor="semester-select">
              Semester
            </label>
            <Dropdown
              ariaLabel="Semester"
              value={semesterId}
              onChange={setSemesterId}
              options={semesters.map((s) => ({
                value: s.id,
                label: s.name || `Semester ${s.number}`,
              }))}
            />
          </div>

          {/* Subjects in this semester — one upload card each */}
          <div className="space-y-4">
            {visibleSubjects.map((subject) => (
              <SubjectUploadCard key={subject.id} subject={subject} demo={isDemoMode} />
            ))}
            {visibleSubjects.length === 0 && (
              <div className="panel p-8 text-center text-sm text-muted">
                No subjects in this semester yet. Create subjects in the
                Subjects section first.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SubjectUploadCard({ subject, demo }: { subject: ApiSubject; demo: boolean }) {
  const [modules, setModules] = useState<ApiModule[]>([]);
  const [moduleId, setModuleId] = useState<string>("");
  const [category, setCategory] = useState<SourceTypeValue | "auto">("auto");
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [docs, setDocs] = useState<ApiDocument[]>([]);
  const [showDocs, setShowDocs] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (demo) {
      const local = readDemoSubjects().find((item) => item.id === subject.id);
      setModules((local?.modules ?? []).map((module, index) => ({
        id: module.id,
        name: module.name,
        number: index + 1,
        description: null,
        subject_id: subject.id,
        is_active: true,
      })));
      return;
    }
    let cancelled = false;
    adminApi.listModules(subject.id).then((items) => {
      if (cancelled) return;
      items.sort((a, b) => a.number - b.number);
      setModules(items);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [demo, subject.id]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const refreshDocs = useCallback(async () => {
    if (demo) return [];
    try {
      const list = await adminApi.listDocuments(subject.id);
      setDocs(list);
      return list;
    } catch {
      return [];
    }
  }, [demo, subject.id]);

  useEffect(() => {
    refreshDocs();
  }, [refreshDocs]);

  /** Poll until no document for this subject is still processing. */
  const pollProcessing = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const list = await refreshDocs();
      const stillProcessing = list.some(
        (d) => d.status === "processing" || d.status === "uploaded",
      );
      setUploads((prev) =>
        prev.map((u) => {
          if (u.status !== "processing" || !u.documentId) return u;
          const doc = list.find((d) => d.id === u.documentId);
          if (!doc) return u;
          if (doc.status === "ready" || doc.status === "published")
            return { ...u, status: "done" };
          if (doc.status === "failed")
            return { ...u, status: "failed", error: "Processing failed" };
          return u;
        }),
      );
      if (!stillProcessing && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2500);
  }, [refreshDocs]);

  const selectedModule = modules.find((m) => m.id === moduleId);

  const addFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      const id = `u${counter++}`;
      const upload: Upload = {
        id,
        name: f.name,
        size: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
        moduleName: selectedModule?.name ?? "Whole subject",
        status: "uploading",
      };
      setUploads((prev) => [upload, ...prev]);

      try {
        if (demo) {
          await new Promise((resolve) => window.setTimeout(resolve, 450));
          setUploads((prev) => prev.map((item) =>
            item.id === id ? { ...item, status: "done" } : item,
          ));
          continue;
        }
        const res = await adminApi.uploadDocument({
          file: f,
          subject_id: subject.id,
          module_id: moduleId || null,
          source_type: inferSourceType(f.name, category),
        });
        setUploads((prev) =>
          prev.map((u) =>
            u.id === id ? { ...u, status: "processing", documentId: res.id } : u,
          ),
        );
        pollProcessing();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === id
                ? {
                    ...u,
                    status: "duplicate",
                    error: "This file is already uploaded",
                  }
                : u,
            ),
          );
          await refreshDocs();
          continue;
        }
        setUploads((prev) =>
          prev.map((u) =>
            u.id === id
              ? {
                  ...u,
                  status: "failed",
                  error: e instanceof Error ? e.message : "Upload failed",
                }
              : u,
          ),
        );
      }
    }
  };

  const publish = async (documentId: string) => {
    try {
      await adminApi.publishDocument(documentId);
      await refreshDocs();
    } catch {
      // list refresh below will show the true state
    }
  };

  const removeDocument = async (documentId: string, name: string) => {
    if (!confirm(`Delete "${name}"? This removes the file and its indexed chunks permanently.`)) return;
    setDocError(null);
    try {
      await adminApi.deleteDocument(documentId);
      await refreshDocs();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Unable to delete document");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const indexed = docs.filter((d) => d.status === "ready" || d.status === "published");

  return (
    <div className="card p-5 fade-up">
      {/* Subject header + module & category pickers */}
      <div className="flex items-start gap-3 mb-4 flex-wrap">
        <div className="w-11 h-11 rounded-xl bg-panel-2 border border-line flex items-center justify-center text-brand-accent">
          <BookOpen size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold truncate">{subject.name}</h2>
            <span className="badge badge-neutral">{subject.code}</span>
          </div>
          <p className="text-xs text-faint mt-0.5">
            {modules.length} modules · {docs.length} documents ·{" "}
            {indexed.length} indexed
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="min-w-[160px]">
            <label className="field-label" htmlFor={`module-${subject.id}`}>
              Module
            </label>
            <Dropdown
              ariaLabel="Module"
              value={moduleId}
              onChange={setModuleId}
              options={[
                { value: "", label: "Whole subject" },
                ...modules.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
          </div>
          <div className="min-w-[160px]">
            <label className="field-label" htmlFor={`category-${subject.id}`}>
              Category
            </label>
            <Dropdown
              ariaLabel="Category"
              value={category}
              onChange={(v) => setCategory(v as SourceTypeValue | "auto")}
              options={CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
            />
          </div>
        </div>
      </div>

      {/* Compact dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`panel border-dashed cursor-pointer text-center py-8 transition-all ${
          dragging ? "glow-ring border-brand bg-[rgba(229,9,20,0.04)]" : ""
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.pptx,.docx,.xlsx"
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <p className="font-semibold text-sm inline-flex items-center gap-1.5">
          {dragging ? (
            "Drop files to upload"
          ) : (
            <>
              <Upload size={15} /> Drag & drop or click to browse
            </>
          )}
        </p>
        <p className="text-xs text-faint mt-1">
          PDF, PPTX, DOCX, XLSX · uploading to{" "}
          <span className="text-brand-accent">
            {selectedModule?.name ?? "whole subject"}
          </span>
        </p>
      </div>

      {/* Per-subject upload queue */}
      {uploads.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {uploads.map((u) => (
            <div key={u.id} className="card p-3.5 fade-up">
              <div className="flex items-center gap-3">
                <span className="flex items-center">
                  <FileIcon name={u.name} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">{u.name}</p>
                  <p className="text-[11px] text-faint">
                    {u.size} · {u.moduleName}
                    {u.error ? ` · ${u.error}` : ""}
                  </p>
                </div>
                {u.status === "done" ? (
                  <span className="badge badge-success">✓ Indexed</span>
                ) : u.status === "duplicate" ? (
                  <span className="badge badge-neutral">Already uploaded</span>
                ) : u.status === "failed" ? (
                  <span className="badge badge-error">✕ Failed</span>
                ) : u.status === "processing" ? (
                  <span className="badge badge-warning">Processing</span>
                ) : (
                  <span className="badge badge-neutral">Uploading…</span>
                )}
              </div>
              {(u.status === "uploading" || u.status === "processing") && (
                <div className="mt-3 h-1.5 rounded-full bg-panel-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: u.status === "processing" ? "80%" : "35%",
                      background: "linear-gradient(90deg,#e50914,#ff2a2a)",
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Existing documents for this subject */}
      {docs.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowDocs((v) => !v)}
            className="btn-ghost text-xs"
          >
            {showDocs ? "▾" : "▸"} {docs.length} document{docs.length === 1 ? "" : "s"}
          </button>
          {showDocs && (
            <div className="mt-2 space-y-2">
              {docError && (
                <p className="text-err text-xs" role="alert">
                  {docError}
                </p>
              )}
              {docs.map((d) => {
                const badge = STATUS_BADGE[d.status] ?? STATUS_BADGE.uploaded;
                return (
                  <div key={d.id} className="card p-3 flex items-center gap-3">
                    <span className="flex items-center">
                      <FileIcon name={d.original_filename} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate">
                        {d.document_name}
                      </p>
                      <p className="text-[11px] text-faint">
                        {(d.file_size / 1024 / 1024).toFixed(1)} MB ·{" "}
                        {d.total_chunks} chunks
                      </p>
                    </div>
                    <span className={`badge ${badge.cls}`}>{badge.label}</span>
                    {d.status === "ready" && (
                      <button
                        onClick={() => publish(d.id)}
                        className="btn-ghost text-xs"
                        title="Make available to students"
                      >
                        Publish
                      </button>
                    )}
                    <button
                      onClick={() => removeDocument(d.id, d.document_name)}
                      className="btn-ghost text-xs text-err hover:bg-err/10"
                      title="Delete file and its indexed chunks"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
