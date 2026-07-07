"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Card, GhostButton, PrimaryButton, SeverityBadge } from "@/components/ui";
import type { Severity } from "@/lib/schema";
import type { ScrapeSuggestionProposals } from "@/lib/scrape-suggestions";

export type SerializedSuggestion = {
  id: string;
  status: string; // completed | committed | failed
  summary: string;
  proposals: ScrapeSuggestionProposals;
  committedAt: string | null;
  createdAt: string;
};

type CommitResult = {
  risks: { id: string; title: string }[];
  linkedRisks: { id: string; title: string }[];
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function allIndices(n: number): Set<number> {
  return new Set(Array.from({ length: n }, (_, i) => i));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function SuggestionsSection({
  latest,
  canSuggest,
  canCommit,
}: {
  latest: SerializedSuggestion | null;
  canSuggest: boolean;
  canCommit: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [current, setCurrent] = useState<SerializedSuggestion | null>(latest);

  async function scan() {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch("/api/scrape/suggest", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { analysis?: SerializedSuggestion; error?: string }
        | null;
      if (!res.ok || !data?.analysis) {
        setRunError(data?.error ?? "Suggestion scan failed. Please try again.");
        return;
      }
      setCurrent(data.analysis);
      router.refresh();
    } catch {
      setRunError("Network error - the suggestion scan could not be started.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <h2 className="mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
        AI risk suggestions
      </h2>
      <Card accent="green" className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Brain className="mt-0.5 h-5 w-5 shrink-0 text-cyber" />
            <div>
              <p className="font-display text-sm font-bold text-ink">
                Turn scraped news into register-ready risks
              </p>
              <p className="mt-0.5 text-xs text-muted">
                The AI clusters fresh high-relevance articles from the last 72 hours into new risk
                proposals and updates to existing risks, for your review before anything is
                created.
              </p>
            </div>
          </div>
          {canSuggest && (
            <PrimaryButton type="button" onClick={scan} disabled={running}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {running ? "Clustering recent articles..." : "Scan latest results for new risks"}
            </PrimaryButton>
          )}
        </div>

        {runError && (
          <div className="mt-4 flex items-start gap-2 rounded-brand border border-sev-critical/30 bg-sev-critical/10 px-3 py-2 text-sm text-sev-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {runError}
              {canSuggest && (
                <button
                  type="button"
                  onClick={scan}
                  className="ml-2 inline-flex items-center gap-1 font-display text-xs font-bold underline-offset-2 hover:underline"
                >
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              )}
            </div>
          </div>
        )}

        {!current && !running && !runError && (
          <p className="mt-4 rounded-brand border border-hairline bg-canvas px-4 py-3 text-sm text-muted">
            No suggestion sets yet.{" "}
            {canSuggest
              ? "Run a scan once a scrape has gathered fresh results."
              : "An analyst can run a scan once a scrape has gathered fresh results."}
          </p>
        )}

        {current && !running && (
          <div className="mt-5">
            <SuggestionReview
              key={current.id}
              suggestion={current}
              canCommit={canCommit}
              onCommitted={(updated) => {
                setCurrent(updated);
                router.refresh();
              }}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function SuggestionReview({
  suggestion,
  canCommit,
  onCommitted,
}: {
  suggestion: SerializedSuggestion;
  canCommit: boolean;
  onCommitted: (updated: SerializedSuggestion) => void;
}) {
  const p = suggestion.proposals;
  const [selRisks, setSelRisks] = useState<Set<number>>(() => allIndices(p.risks.length));
  const [selLinks, setSelLinks] = useState<Set<number>>(() =>
    allIndices(p.linkSuggestions.length),
  );
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  const committed = suggestion.status === "committed";
  const reviewLocked = committed || result !== null || !canCommit;
  const selectedCount = selRisks.size + selLinks.size;
  const totalProposals = p.risks.length + p.linkSuggestions.length;

  const toggle = (set: Set<number>, i: number, apply: (s: Set<number>) => void) => {
    if (reviewLocked) return;
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    apply(next);
  };

  async function commit() {
    setCommitting(true);
    setCommitError(null);
    try {
      const res = await fetch("/api/scrape/suggest/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: suggestion.id,
          accept: { risks: [...selRisks], links: [...selLinks] },
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { analysis?: SerializedSuggestion; created?: CommitResult; error?: string }
        | null;
      if (!res.ok || !data?.created || !data.analysis) {
        setCommitError(data?.error ?? "Commit failed. Please try again.");
        return;
      }
      setResult(data.created);
      onCommitted(data.analysis);
    } catch {
      setCommitError("Network error - nothing was committed.");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {committed && (
        <div className="flex items-center gap-3 rounded-brand border border-network/30 bg-network/10 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-network" />
          <p className="text-sm text-ink">
            <span className="font-display font-bold">Committed to the platform</span>
            {suggestion.committedAt ? ` on ${formatDateTime(suggestion.committedAt)}` : ""}. Run a
            new scan when fresh scrape results arrive.
          </p>
        </div>
      )}

      {result && (
        <div className="rounded-brand border border-cyber/30 bg-cyber/[0.04] p-4">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-cyber" />
            <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
              Committed successfully
            </h3>
          </div>
          <ul className="space-y-1.5 text-sm text-ink/90">
            {result.risks.map((r) => (
              <li key={r.id}>
                Risk created:{" "}
                <Link href={`/risks/${r.id}`} className="font-bold text-cyber hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
            {result.linkedRisks.map((r) => (
              <li key={r.id}>
                Monitoring note added to{" "}
                <Link href={`/risks/${r.id}`} className="font-bold text-cyber hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
            {result.risks.length + result.linkedRisks.length === 0 && (
              <li>No proposals were selected - nothing was created.</li>
            )}
          </ul>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-brand border border-hairline bg-canvas p-4">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyber" />
            <h3 className="font-display text-xs font-bold tracking-wide text-ink uppercase">
              Suggestion summary
            </h3>
          </div>
          <span className="text-xs text-muted">
            {p.articleCount} article(s), last {p.windowHours}h · {formatDateTime(suggestion.createdAt)}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-ink/90">{suggestion.summary}</p>
      </div>

      {totalProposals === 0 ? (
        <p className="rounded-brand border border-hairline bg-canvas px-4 py-3 text-sm text-muted">
          The AI found no new risk themes beyond the current register in these articles.
        </p>
      ) : (
        <>
          {!committed && !result && (
            <p className="text-xs text-muted">
              {canCommit
                ? `${selectedCount} of ${totalProposals} selected - untick anything that should not be created.`
                : "Your role can review these suggestions but not commit them."}
            </p>
          )}

          {p.risks.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-muted" />
                <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
                  Proposed new risks
                </h3>
                <span className="rounded-[4px] border border-hairline bg-canvas px-1.5 py-0.5 font-display text-[11px] font-bold text-muted">
                  {p.risks.length}
                </span>
              </div>
              <div className="space-y-2">
                {p.risks.map((r, i) => (
                  <label
                    key={i}
                    className={`flex items-start gap-3 rounded-brand border p-4 transition-colors ${
                      selRisks.has(i)
                        ? "border-cyber/40 bg-cyber/[0.04]"
                        : "border-hairline bg-canvas opacity-70"
                    } ${reviewLocked ? "cursor-default" : "cursor-pointer hover:border-cyber/60"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selRisks.has(i)}
                      onChange={() => toggle(selRisks, i, setSelRisks)}
                      disabled={reviewLocked}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-cyber,#8eff00)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display font-bold text-ink">{r.title}</p>
                        <SeverityBadge severity={r.severity as Severity} />
                        <span className="rounded-[4px] border border-hairline bg-surface px-2 py-0.5 font-display text-[11px] font-bold tracking-wide text-muted uppercase">
                          {r.category}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-ink/80">{r.description}</p>
                      {r.keywords.length > 0 && (
                        <p className="mt-1.5 text-xs text-muted">
                          Keywords: {r.keywords.join(", ")}
                        </p>
                      )}
                      {r.supportingArticles.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {r.supportingArticles.map((url, j) => (
                            <a
                              key={j}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-[4px] border border-network/40 bg-network/10 px-1.5 py-0.5 font-mono text-[11px] text-digital hover:border-network/70"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {hostOf(url)}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </section>
          )}

          {p.linkSuggestions.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted" />
                <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
                  Updates to existing risks
                </h3>
                <span className="rounded-[4px] border border-hairline bg-canvas px-1.5 py-0.5 font-display text-[11px] font-bold text-muted">
                  {p.linkSuggestions.length}
                </span>
              </div>
              <div className="space-y-2">
                {p.linkSuggestions.map((l, i) => (
                  <label
                    key={i}
                    className={`flex items-start gap-3 rounded-brand border p-4 transition-colors ${
                      selLinks.has(i)
                        ? "border-cyber/40 bg-cyber/[0.04]"
                        : "border-hairline bg-canvas opacity-70"
                    } ${reviewLocked ? "cursor-default" : "cursor-pointer hover:border-cyber/60"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selLinks.has(i)}
                      onChange={() => toggle(selLinks, i, setSelLinks)}
                      disabled={reviewLocked}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-cyber,#8eff00)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold text-ink">
                        Monitoring note for:{" "}
                        <Link
                          href={`/risks/${l.existingRiskId}`}
                          className="text-cyber hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {l.existingRiskTitle ?? l.existingRiskId}
                        </Link>
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-ink/80">{l.reason}</p>
                    </div>
                  </label>
                ))}
              </div>
            </section>
          )}

          {commitError && (
            <p className="rounded-brand border border-sev-critical/30 bg-sev-critical/10 px-3 py-2 text-sm text-sev-critical">
              {commitError}
            </p>
          )}

          {canCommit && !committed && !result && (
            <div className="flex items-center justify-end gap-3 border-t border-hairline pt-4">
              <GhostButton
                type="button"
                onClick={() => {
                  setSelRisks(new Set());
                  setSelLinks(new Set());
                }}
                disabled={committing || selectedCount === 0}
              >
                Clear selection
              </GhostButton>
              <PrimaryButton
                type="button"
                onClick={commit}
                disabled={committing || selectedCount === 0}
              >
                {committing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {committing ? "Committing..." : `Commit selected (${selectedCount})`}
              </PrimaryButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
