"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Logout2 } from "reicon-react";
import { apiLogoutAll, fetchApi } from "@/lib/api";
import { logout } from "@/lib/auth";

interface MeResponse {
  email: string;
  role: string;
  mfa_enabled: boolean;
}

export default function AdminSecurityPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMe = useCallback(() => {
    fetchApi("/api/v1/auth/me")
      .then(setMe)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load profile"));
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const enroll = () =>
    run(async () => {
      const res = await fetchApi("/api/v1/auth/mfa/enroll", { method: "POST" });
      setSecret(res.secret);
      setOtpauthUrl(res.otpauth_url);
      setRecoveryCodes(null);
      setMessage(
        "Add this secret to your authenticator app (Google Authenticator, Aegis, 1Password…), then enter the 6-digit code below to activate.",
      );
    });

  const activate = () =>
    run(async () => {
      const res = await fetchApi("/api/v1/auth/mfa/activate", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      setRecoveryCodes(res.recovery_codes);
      setSecret(null);
      setOtpauthUrl(null);
      setCode("");
      setMessage(res.message);
      loadMe();
    });

  const disable = () =>
    run(async () => {
      const res = await fetchApi("/api/v1/auth/mfa/disable", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      setCode("");
      setMessage(res.message);
      loadMe();
    });

  const signOutAll = async () => {
    await apiLogoutAll();
    logout();
    router.push("/login");
  };

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2.5">
          <Shield size={22} className="text-brand-accent" />
          Security
        </h1>
        <p className="text-sm text-muted mt-1">
          Two-factor authentication and session controls for your admin account.
        </p>
      </div>

      {error && (
        <div className="panel p-4 mb-5 text-sm text-err" role="alert">
          {error}
        </div>
      )}
      {message && <div className="panel p-4 mb-5 text-sm text-muted">{message}</div>}

      {/* MFA status + enrollment */}
      <div className="panel p-5 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold">Two-factor authentication (TOTP)</h2>
            <p className="text-xs text-faint mt-0.5">
              {me ? me.email : "…"} · strongly recommended for admin accounts
            </p>
          </div>
          <span className={`badge ${me?.mfa_enabled ? "badge-success" : "badge-warning"}`}>
            {me ? (me.mfa_enabled ? "Enabled" : "Not enabled") : "…"}
          </span>
        </div>

        {!me?.mfa_enabled && (
          <div className="space-y-4">
            {!secret ? (
              <button onClick={enroll} disabled={busy} className="btn-primary">
                Set up 2FA
              </button>
            ) : (
              <>
                <div className="rounded-xl bg-panel-2 border border-line-soft p-4">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint mb-1.5">
                    Secret key (manual entry)
                  </p>
                  <p className="font-mono text-sm break-all select-all">{secret}</p>
                  {otpauthUrl && (
                    <p className="text-[11px] text-faint mt-2 break-all">
                      otpauth: <span className="font-mono">{otpauthUrl}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
                    className="input font-mono tracking-widest max-w-[180px]"
                    placeholder="123456"
                    inputMode="numeric"
                    aria-label="Authenticator code"
                  />
                  <button
                    onClick={activate}
                    disabled={busy || code.trim().length < 6}
                    className="btn-primary"
                  >
                    Verify & activate
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {recoveryCodes && (
          <div className="rounded-xl border border-[rgba(229,9,20,0.4)] bg-[rgba(229,9,20,0.06)] p-4">
            <p className="text-sm font-semibold mb-2">
              Recovery codes — shown only once. Store them somewhere safe.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-sm select-all">
              {recoveryCodes.map((c) => (
                <span key={c} className="rounded bg-panel-2 px-2 py-1 text-center">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {me?.mfa_enabled && (
          <div className="flex gap-2 items-center">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
              className="input font-mono tracking-widest max-w-[180px]"
              placeholder="code to disable"
              inputMode="numeric"
              aria-label="Code to disable 2FA"
            />
            <button
              onClick={disable}
              disabled={busy || code.trim().length < 6}
              className="btn-ghost hover:!text-[var(--color-err)]"
            >
              Disable 2FA
            </button>
          </div>
        )}
      </div>

      {/* Sessions */}
      <div className="panel p-5">
        <h2 className="font-semibold mb-1">Sessions</h2>
        <p className="text-xs text-faint mb-4">
          Sign out of every device using this account. You will be returned to the login
          page.
        </p>
        <button
          onClick={signOutAll}
          className="btn-ghost inline-flex items-center gap-1.5 hover:!text-[var(--color-err)] hover:!border-[rgba(255,77,79,0.4)]"
        >
          <Logout2 size={15} /> Sign out all devices
        </button>
      </div>
    </div>
  );
}
