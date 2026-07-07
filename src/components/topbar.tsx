"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Moon, Sun, LogOut, Sparkles } from "lucide-react";
import { signOut } from "next-auth/react";
import { AiChatPanel } from "@/components/ai-chat";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role, Severity, AlertType } from "@/lib/schema";
import { SEVERITY_COLORS } from "./ui";

const TITLES: Array<[string, string, string]> = [
  ["/dashboard", "Dashboard", "Live risk posture across the sector"],
  ["/risks", "Risk Register", "All tracked risks, live"],
  ["/intelligence", "Sector Intelligence", "Incident feed, live"],
  ["/monitoring", "Risk Monitoring", "Highest-priority active risks"],
  ["/alerts", "Alerts & Escalation", "Escalations and notifications"],
  ["/research/keywords", "Keyword Monitoring", "Web scraping pipeline, live"],
  ["/research", "Research Engine", "Ingestion and AI analysis"],
  ["/analytics", "Live Analytics", "Sector metrics snapshot"],
  ["/reports", "Report Generation", "AI-drafted branded reports"],
  ["/archive", "Historical Archive", "All past reports and findings"],
  ["/documents", "Document Hub", "Reports, evidence and shared files"],
  ["/users", "Users & Access", "Roles and account management"],
  ["/activity", "Activity Log", "Full audit trail"],
];

type AlertRow = {
  id: string;
  type: AlertType;
  title: string;
  body: string;
  severity: Severity;
  isRead: boolean;
  createdAt: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
};

export function Topbar({
  user,
  initialTheme,
  initialUnread,
}: {
  user: { name: string; role: Role };
  initialTheme: "dark" | "light";
  initialUnread: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"dark" | "light">(initialTheme);
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  const match =
    TITLES.find(([p]) => pathname === p) ??
    TITLES.find(([p]) => pathname.startsWith(p)) ?? ["", "COMRiC Workspace", ""];

  async function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    await fetch("/api/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    });
  }

  async function openPanel() {
    setOpen((v) => !v);
    if (!alerts) {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const data = (await res.json()) as { alerts: AlertRow[] };
        setAlerts(data.alerts);
      }
    }
  }

  async function markAllRead() {
    const ids = (alerts ?? []).filter((a) => !a.isRead).map((a) => a.id);
    if (ids.length === 0) return;
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setAlerts((prev) => prev?.map((a) => ({ ...a, isRead: true })) ?? null);
    setUnread(0);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function alertHref(a: AlertRow): string {
    if (a.relatedEntityType === "risk" && a.relatedEntityId) return `/risks/${a.relatedEntityId}`;
    if (a.relatedEntityType === "ai_report" && a.relatedEntityId) return `/archive/${a.relatedEntityId}`;
    return "/alerts";
  }

  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeed, setChatSeed] = useState<string | undefined>(undefined);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    setChatSeed(q || undefined);
    setChatOpen(true);
    setQuery("");
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-hairline bg-canvas/70 px-6 backdrop-blur-xl backdrop-saturate-150">
      <div className="min-w-0 flex-shrink-0">
        <h2 className="truncate font-display text-sm font-black tracking-tight text-ink">
          {match[1]}
        </h2>
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-cyber" />
          {match[2]}
        </p>
      </div>

      <form onSubmit={onSearch} className="mx-auto w-full max-w-xl">
        <div className="relative">
          <Sparkles className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-cyber/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => undefined}
            placeholder="Ask the AI about risks, intel, news, reports…"
            aria-label="Ask the AI"
            className="w-full rounded-brand border border-hairline bg-surface py-2 pr-3 pl-9 text-sm text-ink placeholder:text-muted/60 transition-colors duration-150 focus:border-cyber/40"
          />
        </div>
      </form>

      <div className="flex flex-shrink-0 items-center gap-1.5">
        <div className="relative" ref={panelRef}>
          <button
            onClick={openPanel}
            aria-label={`Notifications (${unread} unread)`}
            className="relative rounded-brand p-2 text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5"
          >
            <Bell className="h-4.5 w-4.5" />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-cyber" />
            )}
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-96 rounded-brand border border-hairline bg-surface shadow-[0_12px_48px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                <p className="font-display text-xs font-bold tracking-wide text-ink uppercase">
                  Notifications
                </p>
                <button
                  onClick={markAllRead}
                  className="font-display text-[11px] font-bold text-cyber hover:brightness-110"
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {alerts === null ? (
                  <p className="px-4 py-6 text-center text-sm text-muted">Loading…</p>
                ) : alerts.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted">You&apos;re all caught up.</p>
                ) : (
                  alerts.slice(0, 20).map((a) => (
                    <Link
                      key={a.id}
                      href={alertHref(a)}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 border-b border-hairline px-4 py-3 transition-colors duration-150 last:border-0 hover:bg-ink/[0.03] dark:hover:bg-white/[0.03]"
                    >
                      <span
                        className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                        style={{
                          backgroundColor: a.isRead ? "transparent" : SEVERITY_COLORS[a.severity],
                          border: a.isRead ? `1px solid ${SEVERITY_COLORS[a.severity]}55` : undefined,
                        }}
                      />
                      <div className="min-w-0">
                        <p className={`truncate text-sm ${a.isRead ? "text-muted" : "font-semibold text-ink"}`}>
                          {a.title}
                        </p>
                        <p className="line-clamp-2 text-xs text-muted">{a.body}</p>
                        <p className="mt-0.5 text-[10px] text-muted/70">
                          {new Date(a.createdAt).toLocaleString("en-ZA")}
                        </p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
              <Link
                href="/alerts"
                onClick={() => setOpen(false)}
                className="block border-t border-hairline px-4 py-2.5 text-center font-display text-[11px] font-bold tracking-wide text-cyber uppercase hover:bg-ink/[0.03] dark:hover:bg-white/[0.03]"
              >
                View all alerts
              </Link>
            </div>
          )}
        </div>

        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="rounded-brand p-2 text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5"
        >
          {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </button>

        <span className="ml-1 hidden rounded-brand border border-hairline px-2.5 py-1 font-display text-[10px] font-bold tracking-wider text-muted uppercase lg:inline-block">
          {ROLE_LABELS[user.role]}
        </span>

        <AiChatPanel
          open={chatOpen}
          initialQuestion={chatSeed}
          onClose={() => {
            setChatOpen(false);
            setChatSeed(undefined);
          }}
        />

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          className="rounded-brand p-2 text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-sev-critical dark:hover:bg-white/5"
        >
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </div>
    </header>
  );
}
