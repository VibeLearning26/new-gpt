// Frontend-only mock auth — no backend required.
// Mirrors the mobile app's demo-credential approach so the platform
// runs standalone for demos.

import { setAccessToken } from "@/lib/api";

export type Role = "student" | "admin";

export interface DemoUser {
  email: string;
  name: string;
  role: Role;
  initials: string;
}

const DEMO_ACCOUNTS: Record<string, { password: string; user: DemoUser }> = {
  "student@vibegpt.local": {
    password: "student123",
    user: { email: "student@vibegpt.local", name: "Demo Student", role: "student", initials: "DS" },
  },
  "admin@vibegpt.local": {
    password: "admin123",
    user: { email: "admin@vibegpt.local", name: "System Admin", role: "admin", initials: "SA" },
  },
};

const STORAGE_KEY = "vibegpt_user";

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function mockLogin(email: string, password: string): DemoUser | null {
  if (!isDemoMode) return null;
  const entry = DEMO_ACCOUNTS[email.trim().toLowerCase()];
  if (!entry || entry.password !== password) return null;
  if (typeof window !== "undefined") {
    setAccessToken(`demo-token-${entry.user.role}`);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry.user));
  }
  return entry.user;
}

export function getCurrentUser(): DemoUser | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DemoUser;
  } catch {
    return null;
  }
}

export function logout() {
  // Tokens live in memory; clear them plus the non-secret profile cache.
  // The HttpOnly refresh cookie is revoked by callers via apiLogout().
  setAccessToken(null);
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
