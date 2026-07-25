"use client";

import { useEffect, useState } from "react";
import { Settings } from "reicon-react";
import { adminApi } from "@/lib/api";

const SETTING_LABELS: Record<string, string> = {
  max_questions_per_day: "Max questions per user / day",
  max_concurrent_sessions: "Max concurrent sessions",
  api_rate_limit: "API rate limit",
};

export default function QuickConfig() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .getSettings()
      .then(setSettings)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load settings"));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await adminApi.updateSettings(settings);
      setMessage("Settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel p-5">
      <h2 className="font-semibold mb-4 flex items-center gap-2">
        <Settings size={16} className="text-brand-accent" />
        Quick config
      </h2>
      <div className="space-y-3">
        {Object.entries(settings).map(([key, value]) => (
          <div key={key}>
            <label className="field-label" htmlFor={`cfg-${key}`}>
              {SETTING_LABELS[key] ?? key.replace(/_/g, " ")}
            </label>
            <input
              id={`cfg-${key}`}
              className="input mt-1"
              value={value}
              onChange={(e) => setSettings((current) => ({ ...current, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {message && <p className="text-xs text-brand-accent mt-3">{message}</p>}
      {error && <p className="text-xs text-[var(--color-err)] mt-3">{error}</p>}
      <button className="btn-primary mt-4 w-full" onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save configuration"}
      </button>
    </div>
  );
}
