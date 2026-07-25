"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, DocumentText, Download, Eye } from "reicon-react";
import {
  studentApi,
  type ApiModule,
  type ApiSubject,
  type ApiSubjectDocument,
} from "@/lib/api";
import { Dropdown } from "@/components/Dropdown";

interface SubjectView {
  id: string;
  name: string;
  code: string;
  department: string;
  semester: string;
  modules: ApiModule[];
  documents: ApiSubjectDocument[];
}

const SOURCE_LABELS: Record<string, string> = {
  pdf_notes: "PDF notes",
  pptx_presentation: "Slides",
  docx_notes: "Notes",
  xlsx_question_bank: "Question bank",
  previous_year_paper: "Past paper",
  teacher_answer: "Teacher answer",
  teacher_example: "Example",
  other: "Material",
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [semester, setSemester] = useState("all");
  const [busy, setBusy] = useState<{ id: string; action: "view" | "download" } | null>(null);

  const openDocument = async (doc: ApiSubjectDocument) => {
    setBusy({ id: doc.id, action: "view" });
    try {
      const blob = await studentApi.getDocumentFile(doc.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open file");
    } finally {
      setBusy(null);
    }
  };

  const downloadDocument = async (doc: ApiSubjectDocument) => {
    setBusy({ id: doc.id, action: "download" });
    try {
      const blob = await studentApi.getDocumentFile(doc.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = doc.document_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download file");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    let active = true;
    studentApi
      .listSubjects()
      .then(async (subs: ApiSubject[]) => {
        const enriched = await Promise.all(
          subs.map(async (s) => {
            let modules: ApiModule[] = [];
            let documents: ApiSubjectDocument[] = [];
            try {
              modules = await studentApi.listModules(s.id);
            } catch {
              modules = [];
            }
            try {
              documents = await studentApi.listSubjectDocuments(s.id);
            } catch {
              documents = [];
            }
            return {
              id: s.id,
              name: s.name,
              code: s.code,
              department: s.department_name ?? "—",
              semester: s.semester_name ?? "—",
              modules,
              documents,
            };
          }),
        );
        if (!active) return;
        setSubjects(enriched);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load subjects");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const departments = useMemo(
    () => Array.from(new Set(subjects.map((s) => s.department))).sort(),
    [subjects],
  );

  const semesters = useMemo(
    () =>
      Array.from(new Set(subjects.map((s) => s.semester))).sort(
        (a, b) => (parseInt(a.replace(/\D/g, "")) || 0) - (parseInt(b.replace(/\D/g, "")) || 0),
      ),
    [subjects],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return subjects.filter(
      (subject) =>
        (department === "all" || subject.department === department) &&
        (semester === "all" || subject.semester === semester) &&
        (!needle ||
          `${subject.name} ${subject.code} ${subject.modules
            .map((m) => m.name)
            .join(" ")} ${subject.documents.map((d) => `${d.document_name} ${d.topic ?? ""}`)
            .join(" ")}`.toLowerCase().includes(needle)),
    );
  }, [department, semester, query, subjects]);

  const totalFiles = useMemo(
    () => subjects.reduce((sum, s) => sum + s.documents.length, 0),
    [subjects],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Subjects</h1>
            <p className="text-sm text-muted mt-1">
              Browse the subjects you have access to. Pick one to start a grounded chat.
            </p>
          </div>
          {!loading && (
            <span className="badge badge-red">
              {subjects.length} subjects · {totalFiles} files published
            </span>
          )}
        </div>

        <div className="panel p-4 mb-6 grid sm:grid-cols-3 gap-3">
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subjects, modules or files"
            aria-label="Search subjects, modules or files"
          />
          <Dropdown
            ariaLabel="Filter by semester"
            value={semester}
            onChange={setSemester}
            options={[
              { value: "all", label: "All semesters" },
              ...semesters.map((s) => ({ value: s, label: s })),
            ]}
          />
          <Dropdown
            ariaLabel="Filter by department"
            value={department}
            onChange={setDepartment}
            options={[
              { value: "all", label: "All departments" },
              ...departments.map((d) => ({ value: d, label: d })),
            ]}
          />
        </div>

        {error && (
          <div className="panel p-4 mb-5 text-sm text-err" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-5">
                <div className="skeleton h-6 w-2/3 mb-3" />
                <div className="skeleton h-4 w-full mb-2" />
                <div className="skeleton h-4 w-4/5" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {filtered.map((s) => (
              <div key={s.id} className="card card-hover p-5 fade-up flex flex-col">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-panel-2 border border-line flex items-center justify-center text-brand-accent">
                    <BookOpen size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold truncate">{s.name}</h2>
                      <span className="badge badge-neutral">{s.code}</span>
                    </div>
                    <p className="text-xs text-faint mt-0.5">
                      {s.department} · {s.semester} · {s.modules.length} modules ·{" "}
                      {s.documents.length} files
                    </p>
                  </div>
                </div>

                {s.documents.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint mb-1.5">
                      Study material
                    </p>
                    <div className="space-y-1.5">
                      {s.documents.map((d) => {
                        const isBusy = busy?.id === d.id;
                        return (
                          <div
                            key={d.id}
                            className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-panel-2 border border-line-soft hover:border-[rgba(229,9,20,0.4)] transition-colors"
                          >
                            <DocumentText
                              size={16}
                              className="text-faint shrink-0 group-hover:text-brand-accent transition-colors"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] text-muted truncate group-hover:text-fg transition-colors">
                                {d.document_name}
                              </p>
                              {d.topic && (
                                <p className="text-[11px] text-faint truncate">{d.topic}</p>
                              )}
                            </div>
                            <div className="hidden sm:flex items-center gap-2 shrink-0">
                              <span className="text-[10.5px] text-faint font-mono">
                                {formatBytes(d.file_size)}
                              </span>
                              <span className="badge badge-red !text-[10px] !px-2 !py-0.5">
                                {SOURCE_LABELS[d.source_type] ?? "Material"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                className="file-action"
                                title="View file"
                                aria-label={`View ${d.document_name}`}
                                onClick={() => openDocument(d)}
                                disabled={busy !== null}
                              >
                                {isBusy && busy.action === "view" ? (
                                  <span className="spinner-sm" />
                                ) : (
                                  <Eye size={14} />
                                )}
                              </button>
                              <button
                                type="button"
                                className="file-action"
                                title="Download file"
                                aria-label={`Download ${d.document_name}`}
                                onClick={() => downloadDocument(d)}
                                disabled={busy !== null}
                              >
                                {isBusy && busy.action === "download" ? (
                                  <span className="spinner-sm" />
                                ) : (
                                  <Download size={14} />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {s.modules.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint mb-1.5">
                      Modules
                    </p>
                    <div className="space-y-1.5">
                      {s.modules.map((m) => (
                        <Link
                          key={m.id}
                          href={`/student/chat?subject=${encodeURIComponent(s.id)}&module=${encodeURIComponent(m.id)}`}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-panel-2 border border-line-soft hover:border-[rgba(229,9,20,0.4)] transition-colors"
                        >
                          <span className="text-[13px] text-muted truncate">{m.name}</span>
                          <span className="text-[11px] text-faint whitespace-nowrap ml-2">
                            Module {m.number}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <Link
                  href={`/student/chat?subject=${encodeURIComponent(s.id)}`}
                  className="btn-secondary w-full mt-4"
                >
                  Study this subject →
                </Link>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="panel p-8 text-center text-sm text-muted">
            {subjects.length === 0
              ? "No subjects with published study material yet. Check back once your admin publishes documents."
              : "No subjects match those filters."}
          </div>
        )}
      </div>
    </div>
  );
}
