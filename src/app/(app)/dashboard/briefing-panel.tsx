"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";

type Briefing = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  source: "ai" | "deterministic";
};

/** Minimal, dependency-free markdown renderer for briefing text. */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function BriefingBody({ content }: { content: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={key++} className="space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-muted">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-cyber/70" />
            <span>{renderInline(b)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      bullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <h3
          key={key++}
          className="pt-1 font-display text-[11px] font-black tracking-[0.14em] text-cyber uppercase"
        >
          {heading[1]}
        </h3>,
      );
    } else {
      blocks.push(
        <p key={key++} className="text-[13px] leading-relaxed text-muted">
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushBullets();
  return <div className="space-y-2.5">{blocks}</div>;
}

function BriefingSkeleton() {
  return (
    <div className="animate-pulse-soft space-y-3">
      <div className="h-3 w-1/3 rounded bg-ink/5 dark:bg-white/5" />
      <div className="h-3 w-full rounded bg-ink/5 dark:bg-white/5" />
      <div className="h-3 w-5/6 rounded bg-ink/5 dark:bg-white/5" />
      <div className="h-3 w-1/4 rounded bg-ink/5 dark:bg-white/5" />
      <div className="h-3 w-full rounded bg-ink/5 dark:bg-white/5" />
      <div className="h-3 w-2/3 rounded bg-ink/5 dark:bg-white/5" />
    </div>
  );
}

export function BriefingPanel({ canAct }: { canAct: boolean }) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [status, setStatus] = useState<"loading" | "generating" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      setStatus("loading");
      const res = await fetch("/api/ai/briefing", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET failed: ${res.status}`);
      const data = (await res.json()) as { briefing: Briefing | null };
      if (data.briefing) {
        setBriefing(data.briefing);
        setStatus("ready");
        return;
      }
      setStatus("generating");
      const gen = await fetch("/api/ai/briefing", { method: "POST" });
      if (!gen.ok) throw new Error(`POST failed: ${gen.status}`);
      const genData = (await gen.json()) as { briefing: Briefing };
      setBriefing(genData.briefing);
      setStatus("ready");
    } catch (err) {
      console.error("briefing load failed", err);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const timestamp =
    briefing &&
    new Intl.DateTimeFormat("en-ZA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(briefing.createdAt));

  return (
    <section
      className="relative flex h-full flex-col overflow-hidden rounded-brand border border-cyber/25 bg-surface"
      style={{
        backgroundImage:
          "radial-gradient(circle at 100% 0%, rgba(142,255,0,0.10), transparent 55%), radial-gradient(circle at 0% 100%, rgba(3,248,197,0.05), transparent 50%)",
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyber" />
            <h2 className="font-display text-sm font-black tracking-tight text-ink">
              AI Daily Briefing
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-muted">
            {status === "generating"
              ? "Synthesising today's intelligence…"
              : timestamp
                ? `Generated ${timestamp} SAST${briefing?.source === "deterministic" ? " · Generated from live data" : ""}`
                : "Live risk, intelligence and alert synthesis"}
          </p>
        </div>
        <span className="rounded-[4px] border border-cyber/30 bg-cyber/10 px-2 py-0.5 font-display text-[10px] font-bold tracking-wide text-cyber uppercase">
          Live
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {(status === "loading" || status === "generating") && <BriefingSkeleton />}
        {status === "error" && (
          <div className="flex flex-col items-start gap-3 py-4">
            <div className="flex items-center gap-2 text-sm text-muted">
              <TriangleAlert className="h-4 w-4 text-sev-high" />
              The briefing could not be loaded.
            </div>
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-brand border border-hairline bg-surface px-3 py-1.5 font-display text-xs font-bold text-ink transition-colors hover:border-cyber/40 hover:text-cyber"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}
        {status === "ready" && briefing && <BriefingBody content={briefing.content} />}
      </div>

      {canAct && (
        <div className="border-t border-hairline px-5 py-4">
          <Link
            href="/alerts"
            className="inline-flex w-full items-center justify-center gap-2 rounded-brand bg-cyber px-4 py-2 font-display text-sm font-bold text-black transition-all duration-150 hover:brightness-110 active:scale-[0.99]"
          >
            Review escalations
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  );
}
