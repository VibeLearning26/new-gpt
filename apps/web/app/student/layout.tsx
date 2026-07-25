"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Bookmark,
  ChatDots,
  ChatLine,
  Plus,
  Settings,
  Logout2,
  Menu,
  Edit,
  Trash,
  type IconComponent,
} from "reicon-react";
import { logout } from "@/lib/auth";
import { apiLogout, studentApi, type ApiChatSession } from "@/lib/api";

const navItems: { icon: IconComponent; label: string; href: string; id: string }[] = [
  { icon: BookOpen, label: "Subjects", href: "/student/subjects", id: "subjects" },
  { icon: Bookmark, label: "Saved answers", href: "/student/saved", id: "saved" },
];

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function SessionList({ onNavigate }: { onNavigate: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeId = searchParams.get("session");
  const [sessions, setSessions] = useState<ApiChatSession[] | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const load = useCallback(() => {
    studentApi
      .listChatSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("vibegpt:sessions-changed", load);
    return () => window.removeEventListener("vibegpt:sessions-changed", load);
  }, [load]);

  const commitRename = async (id: string) => {
    const title = renameText.trim();
    setRenamingId(null);
    if (!title) return;
    try {
      await studentApi.renameChatSession(id, title);
      load();
    } catch {
      load();
    }
  };

  const remove = async (id: string) => {
    try {
      await studentApi.deleteChatSession(id);
      load();
      if (activeId === id) router.push("/student/chat");
    } catch {
      load();
    }
  };

  if (!sessions || sessions.length === 0) return null;

  return (
    <div>
      <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
        Conversations
      </p>
      <div className="space-y-0.5">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`sidebar-item !py-2 group ${activeId === s.id ? "active" : ""}`}
          >
            <span className="sidebar-icon text-faint shrink-0">
              <ChatLine size={14} />
            </span>
            {renamingId === s.id ? (
              <input
                autoFocus
                className="input !py-1.5 !text-[13px] flex-1 min-w-0"
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={() => commitRename(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(s.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                aria-label="Rename conversation"
              />
            ) : (
              <Link
                href={`/student/chat?session=${s.id}`}
                onClick={onNavigate}
                className="flex-1 min-w-0"
                title={s.title}
              >
                <span className="truncate block text-[13px] leading-tight">{s.title}</span>
                <span className="text-[10px] text-faint">
                  {s.message_count} messages · {timeAgo(s.updated_at)}
                </span>
              </Link>
            )}
            <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition shrink-0">
              <button
                className="session-action"
                aria-label="Rename conversation"
                onClick={() => {
                  setRenamingId(s.id);
                  setRenameText(s.title);
                }}
              >
                <Edit size={12} />
              </button>
              <button
                className="session-action session-action-danger"
                aria-label="Delete conversation"
                onClick={() => remove(s.id)}
              >
                <Trash size={12} />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const handleLogout = async () => {
    await apiLogout();
    logout();
    router.push("/login");
  };

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {open && (
        <div className="overlay fixed inset-0 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar fixed lg:static z-40 h-full w-[276px] flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-line">
          <div className="w-9 h-9 rounded-xl glow-ring bg-panel flex items-center justify-center overflow-hidden">
            <Image src="/logo.png" alt="VibeGPT Logo" width={36} height={36} className="object-cover" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-none">VibeGPT</h1>
            <p className="text-[10px] text-faint mt-1">Campus Study Agent</p>
          </div>
        </div>

        {/* New chat */}
        <div className="p-3">
          <Link href="/student/chat" onClick={() => setOpen(false)} className="btn-primary w-full">
            <Plus size={16} />
            New chat
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-6">
          {/* Primary nav */}
          <nav className="space-y-1">
            <Link
              href="/student/chat"
              onClick={() => setOpen(false)}
              className={`sidebar-item ${isActive("/student/chat") ? "active" : ""}`}
            >
              <span className="sidebar-icon">
                <ChatDots size={18} />
              </span>
              <span>Chat</span>
            </Link>
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

          {/* Chat sessions */}
          <Suspense fallback={null}>
            <SessionList onNavigate={() => setOpen(false)} />
          </Suspense>
        </div>

        {/* Bottom — admin + logout */}
        <div className="p-3 border-t border-line space-y-1">
          <Link href="/admin" className="sidebar-item">
            <span className="sidebar-icon">
              <Settings size={18} />
            </span>
            <span>Admin panel</span>
          </Link>
          <button onClick={handleLogout} className="sidebar-item w-full text-left">
            <span className="sidebar-icon">
              <Logout2 size={18} />
            </span>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 h-14 px-4 border-b border-line bg-panel">
            <button
              onClick={() => setOpen(true)}
              className="w-9 h-9 rounded-lg bg-panel-2 border border-line flex items-center justify-center"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
          <span className="font-bold text-sm">VibeGPT</span>
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
