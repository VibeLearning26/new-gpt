"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bolt, ChatRound, Clock, DocumentText, Star, Users } from "reicon-react";
import {
  analyticsApi,
  type AnalyticsPayload,
  type AnalyticsRange,
} from "@/lib/api";
import {
  AreaChart,
  BarChart,
  Donut,
  HBarList,
  Sparkline,
  formatCompact,
} from "./charts";

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All-time" },
];

const TICK_FORMATTERS: Record<
  AnalyticsRange,
  (iso: string, index: number, total: number) => string
> = {
  day: (iso, i) =>
    i % 4 === 0
      ? new Date(iso).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "",
  month: (iso, i) =>
    i % 5 === 0
      ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
      : "",
  year: (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short" }),
  all: (iso, i) =>
    i % 2 === 0
      ? new Date(iso).toLocaleDateString(undefined, { month: "short", year: "2-digit" })
      : "",
};

const STATUS_COLORS: Record<string, string> = {
  published: "#22c55e",
  ready: "#4f9dff",
  processing: "#f5a623",
  needs_review: "#f5a623",
  uploaded: "#a8a8a8",
  failed: "#ff4d4f",
  archived: "#3a3a3a",
};

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-line-soft pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-muted">
        <span className="text-brand-accent">{icon}</span>
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  suffix,
  spark,
}: {
  label: string;
  value: string;
  suffix?: string;
  spark?: number[];
}) {
  return (
    <div className="rounded-xl border border-line-soft bg-panel-2 p-3.5 transition-colors hover:border-[rgba(229,9,20,0.35)]">
      <p className="text-[10.5px] font-medium uppercase tracking-wider text-faint">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className="text-xl font-extrabold leading-none">
          {value}
          {suffix ? <span className="ml-0.5 text-[11px] font-medium text-faint">{suffix}</span> : null}
        </p>
        {spark ? <Sparkline data={spark} /> : null}
      </div>
    </div>
  );
}

interface FetchState {
  range: AnalyticsRange;
  data: AnalyticsPayload | null;
  error: string | null;
}

export default function AnalyticsBoard() {
  const [range, setRange] = useState<AnalyticsRange>("month");
  const [fetched, setFetched] = useState<FetchState | null>(null);

  useEffect(() => {
    let active = true;
    analyticsApi
      .getAnalytics(range)
      .then((payload) => {
        if (active) setFetched({ range, data: payload, error: null });
      })
      .catch((err) => {
        if (active)
          setFetched({
            range,
            data: null,
            error: err instanceof Error ? err.message : "Unable to load analytics",
          });
      });
    return () => {
      active = false;
    };
  }, [range]);

  const loading = fetched?.range !== range;
  const data = fetched?.data ?? null;
  const error = fetched?.error ?? null;

  const tickFormat = TICK_FORMATTERS[range];

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Bolt size={16} className="text-brand-accent" />
            Analytics
          </h2>
          <p className="mt-0.5 text-[11px] text-faint">Live platform metrics</p>
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label="Analytics time range">
          {RANGES.map((r) => (
            <button
              key={r.value}
              role="tab"
              aria-selected={range === r.value}
              onClick={() => setRange(r.value)}
              className={`chip !px-3 !py-1.5 !text-xs ${range === r.value ? "active" : ""}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-[rgba(255,77,79,0.25)] bg-[rgba(255,77,79,0.08)] px-3.5 py-2.5 text-xs text-[var(--color-err)]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-[74px]" />
            ))}
          </div>
          <div className="skeleton h-44" />
          <div className="skeleton h-44" />
          <div className="skeleton h-44" />
        </div>
      ) : !data ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-line-soft">
          <p className="text-xs text-faint">
            {error ? "Analytics unavailable" : "No analytics data yet"}
          </p>
        </div>
      ) : (
        <div key={range} className="fade-in space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3">
            <KpiTile
              label="Questions"
              value={formatCompact(data.kpis.total_questions)}
              spark={data.usage.questions_series.map((p) => p.value)}
            />
            <KpiTile
              label="Tokens used"
              value={formatCompact(data.kpis.total_tokens)}
              spark={data.tokens.series.map((p) => p.value)}
            />
            <KpiTile
              label="Active · 24h"
              value={`${data.kpis.active_users_24h}`}
              suffix={`/ ${data.kpis.total_students} students`}
            />
            <KpiTile
              label="Avg rating"
              value={data.kpis.avg_rating !== null ? data.kpis.avg_rating.toFixed(2) : "—"}
              suffix={data.kpis.avg_rating !== null ? "/ 5" : undefined}
            />
          </div>

          {/* Tokens */}
          <Section title="Token usage" icon={<Bolt size={14} />}>
            <div className="flex gap-2">
              <span className="badge badge-red">Σ {formatCompact(data.tokens.total)} tokens</span>
              <span className="badge badge-neutral">
                ≈ {formatCompact(data.tokens.avg_per_question)} / question
              </span>
            </div>
            <AreaChart
              data={data.tokens.series}
              formatTick={tickFormat}
              height={160}
            />
            {data.tokens.per_user.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                  Top consumers
                </p>
                <HBarList
                  data={data.tokens.per_user.map((u) => ({ label: u.name, value: u.value }))}
                />
              </div>
            )}
          </Section>

          {/* Usage */}
          <Section title="Usage" icon={<ChatRound size={14} />}>
            <AreaChart
              data={data.usage.questions_series}
              formatTick={tickFormat}
              formatValue={(n) => `${Math.round(n)} questions`}
              height={160}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                  Marks distribution
                </p>
                <Donut
                  data={data.usage.marks_distribution.map((m, i) => ({
                    label: m.name,
                    value: m.count,
                    color: ["#ff2a2a", "#e50914", "#7a0a10", "#a8a8a8"][i % 4],
                  }))}
                  centerLabel="questions"
                  size={132}
                />
              </div>
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                  By subject
                </p>
                <HBarList
                  data={data.usage.by_subject.map((s) => ({
                    label: s.name,
                    value: s.count,
                    hint: s.code ?? undefined,
                  }))}
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                Peak hours
              </p>
              <BarChart
                data={data.usage.peak_hours.map((h) => ({
                  label: `${h.hour}`,
                  value: h.count,
                  hint: `${h.hour}:00 – ${h.hour}:59`,
                }))}
                height={130}
                formatValue={(n) => `${Math.round(n)} questions`}
              />
            </div>
          </Section>

          {/* Users */}
          <Section title="Users" icon={<Users size={14} />}>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Now", value: data.users.active_now },
                { label: "Today", value: data.users.active_today },
                { label: "Week", value: data.users.active_week },
                { label: "Month", value: data.users.active_month },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-line-soft bg-panel-2 px-2 py-2.5 text-center"
                >
                  <p className="text-lg font-extrabold leading-none">{s.value}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-faint">{s.label}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                New signups
              </p>
              <AreaChart
                data={data.users.signups_series}
                formatTick={tickFormat}
                formatValue={(n) => `${Math.round(n)} signups`}
                height={140}
              />
            </div>
            {data.users.most_active.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                  Most active
                </p>
                <HBarList
                  data={data.users.most_active.map((u) => ({
                    label: u.name,
                    value: u.value,
                    hint: "questions",
                  }))}
                  formatValue={(n) => `${Math.round(n)}`}
                />
              </div>
            )}
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                Logins
              </p>
              <BarChart
                data={data.users.logins_series.map((p) => ({
                  label: new Date(p.t).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  }),
                  value: p.value,
                  hint: new Date(p.t).toLocaleDateString(),
                }))}
                height={130}
                formatValue={(n) => `${Math.round(n)} logins`}
              />
            </div>
          </Section>

          {/* Performance */}
          <Section title="Performance" icon={<Clock size={14} />}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-neutral">
                avg {Math.round(data.performance.avg_ms)} ms
              </span>
              {data.performance.trend_pct !== null && (
                <span
                  className={`badge ${data.performance.trend_pct <= 0 ? "badge-success" : "badge-warning"}`}
                >
                  {data.performance.trend_pct <= 0 ? "▼" : "▲"}{" "}
                  {Math.abs(data.performance.trend_pct)}% vs previous period
                </span>
              )}
              {data.performance.low_rated > 0 && (
                <span className="badge badge-error">{data.performance.low_rated} low-rated</span>
              )}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                Feedback distribution
              </p>
              <BarChart
                data={data.performance.rating_distribution.map((r) => ({
                  label: `${r.name}★`,
                  value: r.count,
                  hint: `${r.name} star${r.name === "1" ? "" : "s"}`,
                }))}
                height={130}
                formatValue={(n) => `${Math.round(n)} ratings`}
                maxLabels={5}
              />
            </div>
          </Section>

          {/* Content */}
          <Section title="Content" icon={<DocumentText size={14} />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Donut
                data={data.content.documents_by_status.map((s) => ({
                  label: s.name.replace("_", " "),
                  value: s.count,
                  color: STATUS_COLORS[s.name] ?? "#6b6b6b",
                }))}
                centerLabel="documents"
                size={132}
              />
              <div className="grid grid-cols-2 content-center gap-2">
                <div className="rounded-xl border border-line-soft bg-panel-2 px-3 py-3 text-center">
                  <p className="text-2xl font-extrabold leading-none">{data.content.subjects}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-faint">Subjects</p>
                </div>
                <div className="rounded-xl border border-line-soft bg-panel-2 px-3 py-3 text-center">
                  <p className="text-2xl font-extrabold leading-none">{data.content.departments}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-faint">Departments</p>
                </div>
                <div className="col-span-2 rounded-xl border border-line-soft bg-panel-2 px-3 py-3 text-center">
                  <p className="text-2xl font-extrabold leading-none">
                    {data.kpis.published_documents}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-faint">
                    Published documents
                  </p>
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {!loading && data && (
        <p className="mt-4 border-t border-line-soft pt-3 text-[10.5px] text-faint">
          <Star size={10} className="mr-1 inline text-brand-accent" />
          {data.kpis.questions_today} questions today · tokens reflect real recorded usage
        </p>
      )}
    </div>
  );
}
