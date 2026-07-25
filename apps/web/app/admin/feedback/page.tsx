"use client";

import { useState, useEffect, useCallback } from "react";
import { Star, Bell, Warning, Check, Trash } from "reicon-react";
import { adminApi, type ApiAdminFeedback } from "@/lib/api";

const statusBadge: Record<string, string> = {
  new: "badge-red",
  reviewed: "badge-warning",
  resolved: "badge-success",
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={13}
          weight="Filled"
          color={star <= rating ? "#ff2a2a" : "#3d3d42"}
        />
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<ApiAdminFeedback[]>([]);
  const [filter, setFilter] = useState<"all" | "new" | "reviewed" | "resolved">("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi
      .listFeedback()
      .then((items) => {
        setFeedback(items);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load feedback"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: "reviewed" | "resolved") => {
    setBusyId(id);
    try {
      const updated = await adminApi.reviewFeedback(id, { status });
      setFeedback((prev) => prev.map((f) => (f.id === id ? updated : f)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const sendReply = async (id: string) => {
    const text = replyText.trim();
    if (!text) return;
    setBusyId(id);
    try {
      const updated = await adminApi.reviewFeedback(id, {
        status: "resolved",
        admin_response: text,
      });
      setFeedback((prev) => prev.map((f) => (f.id === id ? updated : f)));
      setReplyingTo(null);
      setReplyText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reply failed");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this feedback entry? This cannot be undone.")) return;
    setBusyId(id);
    try {
      await adminApi.deleteFeedback(id);
      setFeedback((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = feedback.filter((f) => filter === "all" || f.status === filter);

  const avgRating = feedback.length
    ? (feedback.reduce((s, f) => s + f.rating, 0) / feedback.length).toFixed(1)
    : "—";
  const newCount = feedback.filter((f) => f.status === "new").length;
  const lowRated = feedback.filter((f) => f.rating <= 2).length;

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Student feedback</h1>
        <p className="text-sm text-muted mt-1">
          Review ratings and problem reports from students on generated answers.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3.5 mb-6">
        {[
          { label: "Avg rating", value: avgRating, icon: <Star size={18} className="text-brand-accent" /> },
          { label: "New feedback", value: newCount, icon: <Bell size={18} className="text-brand-accent" /> },
          { label: "Low-rated", value: lowRated, icon: <Warning size={18} className="text-brand-accent" />, accent: true },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center">{s.icon}</span>
              <span className="text-xs text-faint">{s.label}</span>
            </div>
            {loading ? (
              <div className="skeleton h-7 w-12" />
            ) : (
              <p className={`text-2xl font-extrabold ${"accent" in s && s.accent ? "text-brand-accent" : ""}`}>
                {s.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 mb-5">
        {(["all", "new", "reviewed", "resolved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip !px-4 ${filter === f ? "active" : ""}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="panel p-4 mb-5 text-sm text-err" role="alert">
          {error}
        </div>
      )}

      {/* Feedback cards */}
      <div className="space-y-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-5">
                <div className="skeleton h-5 w-3/5 mb-3" />
                <div className="skeleton h-4 w-full mb-2" />
                <div className="skeleton h-4 w-4/5" />
              </div>
            ))
          : filtered.map((f) => (
              <div key={f.id} className="card card-hover p-5 fade-up">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {f.subject_name && <span className="badge badge-neutral">{f.subject_name}</span>}
                  <span className="badge badge-neutral">{f.marks} marks</span>
                  <StarRating rating={f.rating} />
                  <span className={`badge ${statusBadge[f.status]}`}>{f.status}</span>
                  <span className="text-[11px] text-faint ml-auto">{timeAgo(f.created_at)}</span>
                </div>
                <h3 className="font-semibold mb-1">{f.question}</h3>
                {f.comment ? (
                  <p className="text-sm text-muted mb-3">{f.comment}</p>
                ) : (
                  <p className="text-sm text-faint italic mb-3">No comment — rating only.</p>
                )}
                {f.answer_preview && (
                  <details className="mb-3">
                    <summary className="text-xs text-faint cursor-pointer hover:text-muted transition-colors">
                      Answer preview
                    </summary>
                    <p className="text-xs text-muted mt-2 whitespace-pre-wrap border-l-2 border-line-soft pl-3">
                      {f.answer_preview}
                    </p>
                  </details>
                )}
                {f.admin_response && (
                  <div className="mb-3 rounded-lg bg-panel-2 border border-line-soft p-3">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint mb-1">
                      Admin reply
                    </p>
                    <p className="text-sm text-muted">{f.admin_response}</p>
                  </div>
                )}
                {replyingTo === f.id && (
                  <div className="mb-3 fade-in">
                    <textarea
                      autoFocus
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      placeholder="Write a reply to the student… (marks this resolved)"
                      className="input resize-none text-sm"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => sendReply(f.id)}
                        disabled={!replyText.trim() || busyId === f.id}
                        className="btn-primary !py-1.5 !text-xs"
                      >
                        {busyId === f.id ? "Sending…" : "Send reply & resolve"}
                      </button>
                      <button
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyText("");
                        }}
                        className="btn-ghost !py-1.5 !text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-faint">— {f.student_name}</span>
                  <div className="flex gap-2">
                    {f.status === "new" && (
                      <button
                        onClick={() => setStatus(f.id, "reviewed")}
                        disabled={busyId === f.id}
                        className="btn-ghost"
                      >
                        Mark reviewed
                      </button>
                    )}
                    {f.status !== "resolved" && (
                      <button
                        onClick={() => setReplyingTo(f.id)}
                        className="btn-ghost"
                      >
                        Reply
                      </button>
                    )}
                    {f.status !== "resolved" && (
                      <button
                        onClick={() => setStatus(f.id, "resolved")}
                        disabled={busyId === f.id}
                        className="btn-ghost inline-flex items-center gap-1.5"
                      >
                        <Check size={14} /> Resolve
                      </button>
                    )}
                    <button
                      onClick={() => remove(f.id)}
                      disabled={busyId === f.id}
                      className="btn-ghost inline-flex items-center gap-1.5 hover:!text-[var(--color-err)] hover:!border-[rgba(255,77,79,0.4)]"
                      title="Delete feedback"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
        {!loading && filtered.length === 0 && (
          <div className="panel text-center py-10 text-faint text-sm">
            No feedback matching this filter.
          </div>
        )}
      </div>
    </div>
  );
}
