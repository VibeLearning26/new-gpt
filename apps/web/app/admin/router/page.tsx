"use client";

import { useCallback, useEffect, useState } from "react";
import { Refresh, Sparkles, Warning } from "reicon-react";
import { adminApi, type ApiRouterStatus } from "@/lib/api";

export default function AdminRouterPage() {
  const [status, setStatus] = useState<ApiRouterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi
      .getRouterStatus()
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load router status"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const routerMode = status?.provider === "router";

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Sparkles size={22} className="text-brand-accent" />
            LLM Router
          </h1>
          <p className="text-sm text-muted mt-1">
            OmniRoute gateway — providers and keys are managed in the gateway dashboard,
            never in this app
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status && routerMode && (
            <span className={`badge ${status.reachable ? "badge-success" : "badge-error"}`}>
              {status.reachable ? "● Gateway reachable" : "● Gateway unreachable"}
            </span>
          )}
          <button
            className="btn-secondary"
            onClick={() => {
              setLoading(true);
              load();
            }}
            disabled={loading}
          >
            <Refresh size={15} /> {loading ? "Checking..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="panel p-4 mb-5 text-sm text-err" role="alert">
          {error}
        </div>
      )}

      {loading && !status ? (
        <div className="space-y-4">
          <div className="skeleton h-28" />
          <div className="skeleton h-[70vh]" />
        </div>
      ) : !routerMode ? (
        <div className="panel p-6">
          <div className="flex items-start gap-3">
            <Warning size={20} className="text-[var(--color-warn)] shrink-0 mt-0.5" />
            <div className="text-sm text-muted space-y-2">
              <p className="font-semibold text-fg">Gateway mode is off</p>
              <p>
                The API is currently running with{" "}
                <code className="text-brand-accent">LLM_PROVIDER=ollama</code> (local Ollama).
                To use OmniRoute, set these in <code>services/api/.env</code> and restart the API:
              </p>
              <pre className="bg-panel-2 border border-line-soft rounded-xl p-3.5 text-xs font-mono overflow-x-auto">
{`LLM_PROVIDER=router
ROUTER_BASE_URL=http://localhost:20128/v1
ROUTER_API_KEY=<gateway key, if required>
ROUTER_DEFAULT_MODEL=oc/mimo-v2.5-free
ROUTER_DASHBOARD_URL=http://localhost:20128/dashboard`}
              </pre>
            </div>
          </div>
        </div>
      ) : (
        status && (
          <div className="space-y-5">
            {/* Status strip */}
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="panel p-4">
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-faint">
                  Endpoint
                </p>
                <p className="text-sm font-mono mt-1.5 truncate" title={status.base_url}>
                  {status.base_url}
                </p>
              </div>
              <div className="panel p-4">
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-faint">
                  Default model
                </p>
                <p className="text-sm font-semibold mt-1.5 truncate" title={status.active_default ?? ""}>
                  {status.active_default ?? "—"}
                </p>
              </div>
              <div className="panel p-4">
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-faint">
                  Models enabled for the app
                </p>
                <p className="text-xl font-extrabold mt-1">
                  {status.models_available}
                  <span className="text-xs font-medium text-faint"> / {status.models_total} on gateway</span>
                </p>
              </div>
              <div className="panel p-4">
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-faint">
                  Provider
                </p>
                <p className="text-sm font-semibold mt-1.5 capitalize">{status.provider}</p>
              </div>
            </div>

            {status.available_models.length > 0 && (
              <div className="panel p-4">
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-faint mb-2">
                  Models students can pick from
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {status.available_models.map((m) => (
                    <span
                      key={m}
                      className={`chip !cursor-default ${m === status.active_default ? "active" : ""}`}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Gateway dashboard */}
            <div className="panel p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Gateway dashboard</p>
                  <p className="text-xs text-muted mt-1 max-w-xl">
                    Manage upstream providers and API keys in the OmniRoute dashboard. It
                    blocks embedded framing for security, so it opens in its own tab.
                  </p>
                  <p className="text-xs font-mono text-faint mt-2 truncate" title={status.dashboard_url}>
                    {status.dashboard_url}
                  </p>
                </div>
                <a
                  href={status.dashboard_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary shrink-0"
                >
                  <Sparkles size={15} /> Open dashboard ↗
                </a>
              </div>
              {!status.reachable && (
                <p className="mt-4 text-xs text-[var(--color-err)]">
                  Gateway not reachable — start OmniRoute (<span className="font-mono">omniroute serve</span>{" "}
                  or <span className="font-mono">docker compose up -d router</span>) and make sure it
                  serves <span className="font-mono">{status.base_url}</span>.
                </p>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
