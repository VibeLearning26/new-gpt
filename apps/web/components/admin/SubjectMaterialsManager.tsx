"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentText, Refresh, Upload } from "reicon-react";

import { Dropdown } from "@/components/Dropdown";
import {
  adminApi,
  inferSourceType,
  type ApiDocument,
  type ApiModule,
  type ApiSubject,
} from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  needs_review: "Needs review",
  ready: "Ready to publish",
  published: "Published to students",
  failed: "Processing failed",
};

const STATUS_CLASS: Record<string, string> = {
  uploaded: "badge-neutral",
  processing: "badge-warning",
  needs_review: "badge-warning",
  ready: "badge-success",
  published: "badge-red",
  failed: "badge-error",
};

export function SubjectMaterialsManager({ subject }: { subject: ApiSubject }) {
  const [modules, setModules] = useState<ApiModule[]>([]);
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [moduleId, setModuleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const [nextModules, nextDocuments] = await Promise.all([
      adminApi.listModules(subject.id),
      adminApi.listDocuments(subject.id),
    ]);
    nextModules.sort((a, b) => a.number - b.number);
    setModules(nextModules);
    setDocuments(nextDocuments);
    setModuleId((current) =>
      nextModules.some((module) => module.id === current)
        ? current
        : nextModules[0]?.id ?? "",
    );
    return nextDocuments;
  }, [subject.id]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      refresh().catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : "Unable to load materials"),
      );
    }, 0);
    return () => {
      window.clearTimeout(loadTimer);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const next = await refresh();
        if (!next.some((doc) => doc.status === "processing" || doc.status === "uploaded")) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Keep the current state; the next manual refresh reports any error.
      }
    }, 2500);
  };

  const uploadFile = async (file: File) => {
    setBusy(true);
    setMessage("");
    try {
      await adminApi.uploadDocument({
        file,
        subject_id: subject.id,
        module_id: moduleId || null,
        source_type: inferSourceType(file.name, "auto"),
      });
      setMessage(`${file.name} uploaded. Indexing has started.`);
      await refresh();
      startPolling();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
      await refresh();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const publish = async (documentId: string) => {
    setMessage("");
    try {
      await adminApi.publishDocument(documentId);
      setMessage("Published. Students can now see and query this material.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish document");
    }
  };

  const remove = async (document: ApiDocument) => {
    if (!confirm(`Delete "${document.document_name}" and its indexed chunks?`)) return;
    setMessage("");
    try {
      await adminApi.deleteDocument(document.id);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete document");
    }
  };

  return (
    <section className="mt-5 rounded-2xl border border-line-soft bg-black/20 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[190px] flex-1">
          <label className="field-label">Upload into module</label>
          <Dropdown
            ariaLabel="Upload document module"
            value={moduleId}
            onChange={setModuleId}
            placeholder="Whole subject"
            options={[
              { value: "", label: "Whole subject" },
              ...modules.map((module) => ({
                value: module.id,
                label: module.name,
              })),
            ]}
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.pptx,.docx,.xlsx"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-2"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={15} /> {busy ? "Uploading…" : "Upload material"}
        </button>
        <button
          type="button"
          className="btn-ghost inline-flex items-center gap-1.5"
          onClick={() => void refresh()}
        >
          <Refresh size={14} /> Refresh
        </button>
      </div>

      {message && (
        <p className="mt-3 text-xs text-muted" role="status">
          {message}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {documents.map((document) => (
          <div
            key={document.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-line-soft bg-panel-2/70 px-3.5 py-3"
          >
            <DocumentText size={18} className="text-brand-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{document.document_name}</p>
              <p className="text-[11px] text-faint">
                {(document.file_size / 1024 / 1024).toFixed(1)} MB ·{" "}
                {document.total_chunks} indexed chunks
              </p>
            </div>
            <span className={`badge ${STATUS_CLASS[document.status] ?? "badge-neutral"}`}>
              {STATUS_LABEL[document.status] ?? document.status}
            </span>
            {document.status === "ready" && (
              <button
                type="button"
                className="btn-primary !px-3 !py-2 text-xs"
                onClick={() => void publish(document.id)}
              >
                Publish to students
              </button>
            )}
            <button
              type="button"
              className="btn-ghost text-xs text-err hover:bg-err/10"
              onClick={() => void remove(document)}
            >
              Delete
            </button>
          </div>
        ))}
        {documents.length === 0 && (
          <div className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-muted">
            No documents yet. Upload PDF, PPTX, DOCX or XLSX material here.
          </div>
        )}
      </div>
    </section>
  );
}
