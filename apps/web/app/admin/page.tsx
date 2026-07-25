"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  DocumentText,
  Clock,
  Eye,
  XCircle,
  Users,
  ChatRound,
  Bolt,
  Warning,
  Upload,
  Ruler,
  BookOpen,
  type IconComponent,
} from "reicon-react";
import { adminApi, type ApiDocument } from "@/lib/api";

interface Stats {
  published: number;
  pending: number;
  review: number;
  failed: number;
  students: number;
  questionsToday: number;
  avgMs: number;
  lowRated: number;
}

const statusBadge: Record<string, string> = {
  published: "badge-success",
  processing: "badge-warning",
  uploaded: "badge-neutral",
  needs_review: "badge-neutral",
  ready: "badge-success",
  failed: "badge-error",
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentUploads, setRecentUploads] = useState<ApiDocument[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      void Promise.all([adminApi.getDashboard(), adminApi.listDocuments()])
        .then(([dashboard, documents]) => {
          if (!active) return;
          setStats({
            published: dashboard.published_documents,
            pending: dashboard.pending_documents,
            review: dashboard.review_documents,
            failed: dashboard.failed_jobs,
            students: dashboard.total_students,
            questionsToday: dashboard.questions_today,
            avgMs: Math.round(dashboard.avg_processing_ms),
            lowRated: dashboard.low_rated_answers,
          });
          setRecentUploads(documents.slice(0, 5));
          setError(null);
        })
        .catch((loadError) => {
          if (!active) return;
          setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, []);

  const cards: { label: string; key: keyof Stats; icon: IconComponent; accent?: boolean; suffix?: string }[] = [
    { label: "Published documents", key: "published", icon: DocumentText },
    { label: "Awaiting processing", key: "pending", icon: Clock },
    { label: "Needs review", key: "review", icon: Eye },
    { label: "Failed jobs", key: "failed", icon: XCircle, accent: true },
    { label: "Total students", key: "students", icon: Users },
    { label: "Questions today", key: "questionsToday", icon: ChatRound },
    { label: "Avg processing", key: "avgMs", icon: Bolt, suffix: "ms" },
    { label: "Low-rated answers", key: "lowRated", icon: Warning, accent: true },
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted mt-1">Overview of your VibeGPT knowledge base</p>
        </div>
        <Link href="/admin/documents" className="btn-primary">
          <Upload size={16} /> Upload material
        </Link>
      </div>

      {error && (
        <div className="panel p-4 mb-5 text-sm text-[var(--color-err)]">
          Unable to load dashboard: {error}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-9">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="card card-hover p-5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border ${
                  c.accent
                    ? "bg-[rgba(229,9,20,0.1)] border-[rgba(229,9,20,0.3)] text-[var(--color-err)]"
                    : "bg-panel-2 border-line text-brand-accent"
                }`}
              >
                <Icon size={18} />
              </div>
              {loading || !stats ? (
                <div className="skeleton h-7 w-16 mb-2" />
              ) : (
                <p className={`text-2xl font-extrabold ${c.accent ? "text-brand-accent" : ""}`}>
                  {stats[c.key]}
                  {c.suffix ? <span className="text-sm text-faint ml-0.5">{c.suffix}</span> : null}
                </p>
              )}
              <p className="text-xs text-faint mt-1">{c.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Recent uploads */}
        <div className="lg:col-span-2 panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent uploads</h2>
            <Link href="/admin/documents" className="text-xs text-brand-accent hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton h-12 w-full" />
                ))
              : recentUploads.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-panel-2 border border-line-soft"
                  >
                    <DocumentText size={18} className="text-faint shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate">{u.document_name}</p>
                      <p className="text-[11px] text-faint">
                        {new Date(u.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span className={`badge ${statusBadge[u.status] ?? "badge-neutral"}`}>
                      {u.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
            {!loading && recentUploads.length === 0 && (
              <p className="text-sm text-faint py-6 text-center">No documents uploaded yet.</p>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="panel p-5">
          <h2 className="font-semibold mb-4">Quick actions</h2>
          <div className="space-y-2">
            {[
              { label: "Upload PDF / PPT / DOCX", href: "/admin/documents", icon: Upload },
              { label: "Configure answer format", href: "/admin/answer-rules", icon: Ruler },
              { label: "Manage subjects", href: "/admin/subjects", icon: BookOpen },
              { label: "Review feedback", href: "/admin/feedback", icon: ChatRound },
            ].map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.label}
                  href={a.href}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-panel-2 border border-line-soft hover:border-[rgba(229,9,20,0.4)] transition"
                >
                  <Icon size={18} className="text-brand-accent" />
                  <span className="text-[13px] font-medium">{a.label}</span>
                  <span className="ml-auto text-faint">→</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick config + analytics live in the Analytics section */}
      <div className="mt-5 flex items-center justify-between gap-3 panel px-5 py-4">
        <div>
          <h2 className="font-semibold">Analytics &amp; config</h2>
          <p className="text-xs text-faint mt-0.5">
            Usage, tokens, performance and quick system settings
          </p>
        </div>
        <Link href="/admin/analytics" className="btn-secondary shrink-0">
          <Bolt size={15} className="text-brand-accent" /> Open analytics
        </Link>
      </div>
    </div>
  );
}
