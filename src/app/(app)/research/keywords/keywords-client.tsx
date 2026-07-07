"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Loader2,
  Pencil,
  Play,
  Plus,
  Radar,
  Trash2,
  X,
} from "lucide-react";
import { Card, EmptyState, GhostButton, PrimaryButton, StatusBadge } from "@/components/ui";

type SetRow = {
  id: string;
  name: string;
  keywords: string[];
  isActive: boolean;
  lastRunAt: string | null;
  resultCount: number;
};

type ResultRow = {
  id: string;
  setName: string;
  sourceUrl: string;
  title: string;
  snippet: string | null;
  matchedKeywords: string[];
  relevanceScore: number | null;
  processed: boolean;
  scrapedAt: string;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function KeywordChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-[4px] border border-network/40 bg-network/10 px-1.5 py-0.5 font-mono text-[11px] text-digital">
      {label}
    </span>
  );
}

export function KeywordsClient({
  canRun,
  canCreate,
  canUpdate,
  canDelete,
  sets,
  results,
}: {
  canRun: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  sets: SetRow[];
  results: ResultRow[];
}) {
  const router = useRouter();
  const [running, setRunning] = useState<string | "all" | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SetRow | null>(null);
  const [name, setName] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setKeywordsText("");
    setFormOpen(true);
    setError(null);
  };
  const openEdit = (set: SetRow) => {
    setEditing(set);
    setName(set.name);
    setKeywordsText(set.keywords.join(", "));
    setFormOpen(true);
    setError(null);
  };

  async function runScrape(keywordSetId?: string) {
    setRunning(keywordSetId ?? "all");
    setError(null);
    setRunMessage(null);
    try {
      const res = await fetch("/api/scrape/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(keywordSetId ? { keywordSetId } : {}),
      });
      const data = (await res.json()) as {
        totalInserted?: number;
        sets?: { errors: string[] }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Scrape failed");
      const feedErrors = (data.sets ?? []).flatMap((s) => s.errors);
      setRunMessage(
        `Scrape complete — ${data.totalInserted ?? 0} new result${(data.totalInserted ?? 0) === 1 ? "" : "s"}${feedErrors.length > 0 ? ` (${feedErrors.length} feed error${feedErrors.length === 1 ? "" : "s"})` : ""}.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scrape failed");
    } finally {
      setRunning(null);
    }
  }

  async function saveSet() {
    const keywords = keywordsText
      .split(/[,\n]/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (!name.trim() || keywords.length === 0) {
      setError("Provide a set name and at least one keyword.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(editing ? `/api/keyword-sets/${editing.id}` : "/api/keyword-sets", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), keywords }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setFormOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(set: SetRow) {
    await fetch(`/api/keyword-sets/${set.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !set.isActive }),
    });
    router.refresh();
  }

  async function deleteSet(set: SetRow) {
    if (!window.confirm(`Delete keyword set "${set.name}" and all its scrape results?`)) return;
    const res = await fetch(`/api/keyword-sets/${set.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Delete failed");
      return;
    }
    router.refresh();
  }

  const inputCls =
    "w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-cyber/50 focus:outline-none";

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Radar className="h-4 w-4 text-digital" />
          {sets.filter((s) => s.isActive).length} active set
          {sets.filter((s) => s.isActive).length === 1 ? "" : "s"} monitoring MyBroadband,
          TechCentral, ITWeb &amp; Google News ZA
        </div>
        <div className="flex items-center gap-2">
          {canRun && (
            <GhostButton onClick={() => runScrape()} disabled={running !== null}>
              {running === "all" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run all now
            </GhostButton>
          )}
          {canCreate && (
            <PrimaryButton onClick={openCreate}>
              <Plus className="h-4 w-4" /> New keyword set
            </PrimaryButton>
          )}
        </div>
      </div>

      {runMessage && (
        <div className="rounded-brand border border-network/40 bg-network/10 px-4 py-2.5 text-sm text-digital">
          {runMessage}
        </div>
      )}
      {error && (
        <div className="rounded-brand border border-sev-critical/40 bg-sev-critical/10 px-4 py-2.5 text-sm text-sev-critical">
          {error}
        </div>
      )}

      {/* Create/edit form */}
      {formOpen && (
        <Card accent="green" className="animate-rise p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-ink">
              {editing ? `Edit "${editing.name}"` : "New keyword set"}
            </h2>
            <button
              onClick={() => setFormOpen(false)}
              className="text-muted hover:text-ink"
              aria-label="Close form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-muted uppercase">Name</label>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fibre theft syndicates"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-muted uppercase">
                Keywords (comma-separated)
              </label>
              <input
                className={inputCls}
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder="cable theft, fibre vandalism, tower battery"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <PrimaryButton onClick={saveSet} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create set"}
            </PrimaryButton>
            <GhostButton onClick={() => setFormOpen(false)}>Cancel</GhostButton>
          </div>
        </Card>
      )}

      {/* Keyword sets */}
      {sets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Radar />}
            title="No keyword sets yet"
            hint="Create a keyword set to start monitoring SA news sources for sector risks."
            action={
              canCreate ? (
                <PrimaryButton onClick={openCreate}>
                  <Plus className="h-4 w-4" /> New keyword set
                </PrimaryButton>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sets.map((set) => (
            <Card key={set.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm font-bold text-ink">{set.name}</h3>
                    <StatusBadge status={set.isActive ? "active" : "inactive"} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Last run {timeAgo(set.lastRunAt)} · {set.resultCount} result
                    {set.resultCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {canRun && (
                    <button
                      onClick={() => runScrape(set.id)}
                      disabled={running !== null || !set.isActive}
                      title="Run this set now"
                      className="rounded-brand border border-hairline p-1.5 text-muted transition-colors hover:border-cyber/40 hover:text-cyber disabled:pointer-events-none disabled:opacity-40"
                    >
                      {running === set.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  {canUpdate && (
                    <button
                      onClick={() => openEdit(set)}
                      title="Edit"
                      className="rounded-brand border border-hairline p-1.5 text-muted transition-colors hover:border-cyber/40 hover:text-cyber"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => deleteSet(set)}
                      title="Delete"
                      className="rounded-brand border border-hairline p-1.5 text-muted transition-colors hover:border-sev-critical/50 hover:text-sev-critical"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {set.keywords.map((k) => (
                  <KeywordChip key={k} label={k} />
                ))}
              </div>
              {canUpdate && (
                <button
                  onClick={() => toggleActive(set)}
                  className="mt-3 text-xs font-bold text-muted underline-offset-2 hover:text-cyber hover:underline"
                >
                  {set.isActive ? "Deactivate" : "Activate"}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Recent results */}
      <div>
        <h2 className="mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
          Recent scrape results
        </h2>
        <Card>
          {results.length === 0 ? (
            <EmptyState
              icon={<Radar />}
              title="No scrape results yet"
              hint="Run a scrape to sweep the configured news sources."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-[11px] font-bold tracking-wider text-muted uppercase">
                    <th className="px-4 py-3">Article</th>
                    <th className="px-4 py-3">Matched</th>
                    <th className="px-4 py-3">Relevance</th>
                    <th className="px-4 py-3">Scraped</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id} className="border-b border-hairline/60 align-top last:border-0">
                      <td className="max-w-md px-4 py-3">
                        <a
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group inline-flex items-start gap-1.5 font-medium text-ink hover:text-cyber"
                        >
                          <span>{r.title}</span>
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted group-hover:text-cyber" />
                        </a>
                        {r.snippet && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted">{r.snippet}</p>
                        )}
                        <p className="mt-1 text-[11px] text-muted/70">{r.setName}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-[180px] flex-wrap gap-1">
                          {r.matchedKeywords.map((k) => (
                            <KeywordChip key={k} label={k} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/10 dark:bg-white/10">
                            <div
                              className="h-full rounded-full bg-digital"
                              style={{ width: `${Math.round((r.relevanceScore ?? 0) * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-muted">
                            {Math.round((r.relevanceScore ?? 0) * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted">
                        {timeAgo(r.scrapedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-[4px] px-2 py-0.5 font-display text-[11px] font-bold tracking-wide uppercase ${
                            r.processed
                              ? "border border-network/40 bg-network/10 text-digital"
                              : "border border-hairline bg-ink/5 text-muted dark:bg-white/5"
                          }`}
                        >
                          {r.processed ? "analysed" : "new"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
