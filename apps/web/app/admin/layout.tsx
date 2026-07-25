"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import {
  Building,
  Graph,
  Bolt,
  DocumentText,
  Ruler,
  BookOpen,
  Users,
  ChatRound,
  User,
  Logout2,
  Menu,
  type IconComponent,
} from "reicon-react";
import { getCurrentUser, isDemoMode, logout } from "@/lib/auth";
import { hasRealSession } from "@/lib/api";

const navItems: { icon: IconComponent; label: string; href: string; id: string }[] = [
  { icon: Graph, label: "Dashboard", href: "/admin", id: "dashboard" },
  { icon: Bolt, label: "Analytics", href: "/admin/analytics", id: "analytics" },
  { icon: Building, label: "Departments", href: "/admin/departments", id: "departments" },
  { icon: DocumentText, label: "Documents", href: "/admin/documents", id: "documents" },
  { icon: Ruler, label: "Answer format", href: "/admin/answer-rules", id: "rules" },
  { icon: BookOpen, label: "Subjects", href: "/admin/subjects", id: "subjects" },
  { icon: Users, label: "Users", href: "/admin/users", id: "users" },
  { icon: ChatRound, label: "Feedback", href: "/admin/feedback", id: "feedback" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    const hasValidSession = isDemoMode ? Boolean(user) : hasRealSession();
    if (!hasValidSession || !user || user.role !== "admin") {
      logout();
      router.replace("/login");
      return;
    }
    const timer = window.setTimeout(() => setAuthorized(true), 0);
    return () => window.clearTimeout(timer);
  }, [router]);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      {open && (
        <div className="overlay fixed inset-0 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`sidebar fixed lg:static z-40 h-full w-[248px] flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center gap-3 px-4 h-16 border-b border-line">
          <div className="w-9 h-9 rounded-xl glow-ring bg-panel flex items-center justify-center overflow-hidden">
            <Image src="/logo.png" alt="VibeGPT Logo" width={36} height={36} className="object-cover" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-none">VibeGPT</h1>
            <p className="text-[10px] text-brand-accent mt-1">Admin Panel</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`sidebar-item ${isActive(item.href) ? "active" : ""}`}
              >
                <span className="sidebar-icon">
                  <Icon size={18} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-line space-y-1">
          <Link href="/student/chat" className="sidebar-item">
            <span className="sidebar-icon">
              <User size={18} />
            </span>
            <span>Student view</span>
          </Link>
          <button onClick={handleLogout} className="sidebar-item w-full text-left">
            <span className="sidebar-icon">
              <Logout2 size={18} />
            </span>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center gap-3 h-14 px-4 border-b border-line bg-panel">
            <button
              onClick={() => setOpen(true)}
              className="w-9 h-9 rounded-lg bg-panel-2 border border-line flex items-center justify-center"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
          <span className="font-bold text-sm">VibeGPT Admin</span>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
