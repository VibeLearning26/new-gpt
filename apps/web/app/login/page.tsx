"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { isDemoMode, logout, mockLogin } from "@/lib/auth";
import { apiLogin, fetchApi } from "@/lib/api";
// Static import: page is a client component and all WebGL code runs in
// useEffect, so this is SSR-safe — and it avoids the lazy-chunk delay
// that made the animation pop in late.
import Dither from "@/components/ui/Dither";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const authError = sessionStorage.getItem("vibegpt_auth_error");
    if (!authError) return;
    sessionStorage.removeItem("vibegpt_auth_error");
    const timer = window.setTimeout(() => setError(authError), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleLogin = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    logout();

    // Try mock login first (works without backend)
    const user = mockLogin(email, password);
    if (user) {
      router.push(user.role === 'student' ? '/student/chat' : '/admin/documents');
      return;
    }

    // Fallback to real API
    try {
      if (isDemoMode) {
        const demoUser = mockLogin(email, password);
        if (!demoUser) throw new Error("Invalid demo email or password");
        router.push(demoUser.role === "admin" ? "/admin/documents" : "/student/chat");
        return;
      }

      const token = await apiLogin(email, password, mfaRequired ? mfaCode : undefined);
      const me = await fetchApi("/api/v1/auth/me");
      sessionStorage.setItem(
        "vibegpt_user",
        JSON.stringify({
          email: me.email,
          name: me.full_name,
          role: token.role === "student" ? "student" : "admin",
          initials: (me.full_name ?? "U")
            .split(" ")
            .map((word: string) => word[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
        }),
      );
      router.push(token.role === "student" ? "/student/chat" : "/admin/documents");
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in. Check that the backend is running.";
      if (message.includes("mfa_required")) {
        setMfaRequired(true);
        setError("Enter the 6-digit code from your authenticator app (or a recovery code).");
      } else {
        logout();
        setError(message);
      }
      setLoading(false);
    }
  };

  const fill = (e: string, p: string) => {
    setEmail(e);
    setPassword(p);
  };

  return (
    <div className="relative h-dvh overflow-hidden bg-[#050505]">
      {/* Animated dither background — red on black */}
      <div className="absolute inset-0">
        <Dither
          waveColor={[0.9, 0.04, 0.08]}
          disableAnimation={false}
          enableMouseInteraction={true}
          mouseRadius={0.35}
          colorNum={4}
          waveAmplitude={0.3}
          waveFrequency={3}
          waveSpeed={0.05}
          pixelSize={2}
        />
        {/* Vignette so the card area stays readable */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(5,5,5,0.35) 0%, rgba(5,5,5,0.75) 100%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm fade-up">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl glow-ring flex items-center justify-center bg-panel overflow-hidden">
              <Image src="/logo.png" alt="VibeGPT Logo" width={48} height={48} className="object-cover" />
            </div>
            <div className="text-center">
              <span className="text-2xl font-extrabold tracking-tight">VibeGPT</span>
              <p className="text-sm text-muted mt-1">
                Exam-ready answers, <span className="text-gradient-red font-semibold">grounded in your college material.</span>
              </p>
            </div>
          </div>

          {/* Auth card */}
          <div
            className="rounded-2xl border border-line p-5 sm:p-6"
            style={{
              background: "rgba(10, 10, 10, 0.78)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow:
                "0 0 0 1px rgba(229, 9, 20, 0.15), 0 24px 80px -20px rgba(229, 9, 20, 0.25), 0 8px 40px rgba(0,0,0,0.6)",
            }}
          >
            <h2 className="text-xl font-bold mb-1">Welcome back</h2>
            <p className="text-sm text-muted mb-5">Sign in to access your study materials</p>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-[rgba(255,77,79,0.1)] border border-[rgba(255,77,79,0.3)] text-[var(--color-err)] text-sm fade-in">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="field-label">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@college.edu"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="password" className="field-label">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {mfaRequired && (
                <div className="fade-in">
                  <label htmlFor="mfa" className="field-label">Two-factor code</label>
                  <input
                    id="mfa"
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\s/g, ""))}
                    className="input font-mono tracking-widest"
                    placeholder="123456 or recovery code"
                    autoComplete="one-time-code"
                  />
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full h-12">
                {loading ? (
                  <span className="loading-dots"><span></span><span></span><span></span></span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            {/* Demo credentials */}
            {isDemoMode && (
              <div className="mt-4 pt-3.5 border-t border-line-soft">
                <p className="text-xs font-semibold text-muted mb-2.5">Demo accounts — tap to fill</p>
                <div className="space-y-1.5">
                  <button
                    onClick={() => fill("student@vibegpt.local", "student123")}
                    className="w-full text-left px-3 py-2 rounded-xl bg-panel-2 border border-line hover:border-[rgba(229,9,20,0.4)] transition text-xs"
                  >
                    <span className="badge badge-neutral mr-2">Student</span>
                    <span className="text-muted">student@vibegpt.local · student123</span>
                  </button>
                  <button
                    onClick={() => fill("admin@vibegpt.local", "admin123")}
                    className="w-full text-left px-3 py-2 rounded-xl bg-panel-2 border border-line hover:border-[rgba(229,9,20,0.4)] transition text-xs"
                  >
                    <span className="badge badge-red mr-2">Admin</span>
                    <span className="text-muted">admin@vibegpt.local · admin123</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-faint mt-5">© 2026 VibeGPT · Campus Study Agent</p>
        </div>
      </div>
    </div>
  );
}
