"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  History,
  Link2,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Radar,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { Card, EmptyState, GhostButton, PrimaryButton, SeverityBadge } from "@/components/ui";
import type { Severity } from "@/lib/schema";
import type { StoredProposals } from "@/lib/document-analysis";

export type SerializedAnalysis = {
  id: string;
  status: string; // completed | committed | failed
  summary: string;
  proposals: StoredProposals;
  committedAt: string | null;
  createdAt: string;
};

type CommitResult = {
  risks: { id: string; title: string }[];
  intelligence: { id: string; title: string }[];
  research: { id: string; title: string }[];
  linkedRiskId: string | null;
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

function ProposalCard({
  checked,
  onToggle,
  disabled,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-brand border p-4 transition-colors ${
        checked
          ? "border-cyber/40 bg-cyber/[0.04]"
          : "border-hairline bg-canvas opacity-70"
      } ${disabled ? "cursor-default" : "hover:border-cyber/60"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-cyber,#8eff00)]"
      />
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

function SectionHeading({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">{title}</h3>
      <span className="rounded-[4px] border border-hairline bg-canvas px-1.5 py-0.5 font-display text-[11px] font-bold text-muted">
        {count}
      </span>
    </div>
  );
}

export function AnalysisSection({
  documentId,
  documentName,
  analyses,
  canAnalyse,
  canCommit,
  fileType,
}: {
  documentId: string;
  documentName: string;
  analyses: SerializedAnalysis[];
  canAnalyse: boolean;
  canCommit: boolean;
  fileType: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [latest, setLatest] = useState<SerializedAnalysis | null>(analyses[0] ?? null);

  const history = useMemo(
    () => analyses.filter((a) => a.id !== latest?.id),
    [analyses, latest],
  );

  async function analyse() {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/analyze`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { analysis?: SerializedAnalysis; error?: string }
        | null;
      if (!res.ok || !data?.analysis) {
        setRunError(data?.error ?? "Analysis failed. Please try again.");
        return;
      }
      setLatest(data.analysis);
      router.refresh();
    } catch {
      setRunError("Network error - the analysis could not be started.");
    } finally {
      setRunning(false);
    }
  }

  const analysableHint = ["pdf", "docx", "xlsx", "csv", "txt", "md"].includes(fileType);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-black tracking-tight text-ink">
          <Brain className="h-5 w-5 text-cyber" /> AI Analysis
        </h2>
        {canAnalyse && (
          <PrimaryButton type="button" onClick={analyse} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : latest ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {running ? "Analysing…" : latest ? "Re-analyse with AI" : "Analyse with AI"}
          </PrimaryButton>
        )}
      </div>

      {running && (
        <Card accent="green" className="p-5">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-cyber" />
            <div>
              <p className="font-display text-sm font-bold text-ink">
                Extracting &amp; interpreting… this can take a minute
              </p>
              <p className="text-xs text-muted">
                The document text is being extracted and interpreted against the COMRiC risk
                register. Keep this page open.
              </p>
            </div>
          </div>
        </Card>
      )}

      {runError && (
        <p className="rounded-brand border border-sev-critical/30 bg-sev-critical/10 px-3 py-2 text-sm text-sev-critical">
          {runError}
        </p>
      )}

      {!latest && !running && (
        <Card>
          <EmptyState
            icon={<Brain />}
            title="No analysis yet"
            hint={
              !analysableHint
                ? `'.${fileType}' files cannot be analysed - text extraction supports pdf, docx, xlsx, csv, txt and md.`
                : canAnalyse
                  ? "Run the AI analysis to extract findings and propose risks, intelligence and research from this document."
                  : "An analyst can run the AI analysis to extract structured records from this document."
            }
          />
        </Card>
      )}

      {latest && !running && (
        <AnalysisReview
          key={latest.id}
          documentId={documentId}
          documentName={documentName}
          analysis={latest}
          canCommit={canCommit}
          canAnalyse={canAnalyse}
          onRetry={analyse}
          onCommitted={(updated) => {
            setLatest(updated);
            router.refresh();
          }}
        />
      )}

      {history.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-muted" />
            <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
              Analysis history
            </h3>
          </div>
          <ul className="space-y-2">
            {history.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-brand border border-hairline bg-canvas px-3 py-2"
              >
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span
                    className={`rounded-[4px] px-2 py-0.5 font-display text-[11px] font-bold tracking-wide uppercase ${
                      a.status === "committed"
                        ? "border border-network/30 bg-network/10 text-network"
                        : a.status === "failed"
                          ? "border border-sev-critical/30 bg-sev-critical/10 text-sev-critical"
                          : "border border-hairline bg-surface text-muted"
                    }`}
                  >
                    {a.status}
                  </span>
                  <span>{formatDateTime(a.createdAt)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLatest(a)}
                  className="font-display text-xs font-bold text-cyber transition-opacity hover:opacity-80"
                >
                  View
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function AnalysisReview({
  documentId,
  documentName,
  analysis,
  canCommit,
  canAnalyse,
  onRetry,
  onCommitted,
}: {
  documentId: string;
  documentName: string;
  analysis: SerializedAnalysis;
  canCommit: boolean;
  canAnalyse: boolean;
  onRetry: () => void;
  onCommitted: (updated: SerializedAnalysis) => void;
}) {
  const p = analysis.proposals;
  const [selRisks, setSelRisks] = useState<Set<number>>(() => allIndices(p.risks.length));
  const [selIntel, setSelIntel] = useState<Set<number>>(() => allIndices(p.intelligence.length));
  const [selResearch, setSelResearch] = useState<Set<number>>(() => allIndices(p.research.length));
  const [selLinks, setSelLinks] = useState<Set<number>>(() =>
    allIndices(p.linkSuggestions.length),
  );
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  const committed = analysis.status === "committed";
  const failed = analysis.status === "failed";
  const reviewLocked = committed || result !== null || !canCommit;

  const toggle = (set: Set<number>, i: number, apply: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    apply(next);
  };

  const selectedCount = selRisks.size + selIntel.size + selResearch.size + selLinks.size;
  const totalProposals =
    p.risks.length + p.intelligence.length + p.research.length + p.linkSuggestions.length;

  async function commit() {
    setCommitting(true);
    setCommitError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/analyze/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: analysis.id,
          accept: {
            risks: [...selRisks],
            intelligence: [...selIntel],
            research: [...selResearch],
            links: [...selLinks],
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { analysis?: SerializedAnalysis; created?: CommitResult; error?: string }
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

  if (failed) {
    return (
      <Card className="border-sev-critical/30 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-sev-critical" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-ink">
              Analysis failed - the AI response could not be interpreted
            </p>
            <p className="mt-1 text-xs text-muted">{formatDateTime(analysis.createdAt)}</p>
            <pre className="mt-3 max-h-48 overflow-auto rounded-brand border border-hairline bg-canvas p-3 text-xs whitespace-pre-wrap text-muted">
              {analysis.summary}
            </pre>
            {canAnalyse && (
              <div className="mt-3">
                <GhostButton type="button" onClick={onRetry}>
                  <RefreshCw className="h-4 w-4" /> Retry analysis
                </GhostButton>
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {committed && (
        <div className="flex items-center gap-3 rounded-brand border border-network/30 bg-network/10 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-network" />
          <p className="text-sm text-ink">
            <span className="font-display font-bold">Committed to the platform</span>
            {analysis.committedAt ? ` on ${formatDateTime(analysis.committedAt)}` : ""}. The
            accepted records below were created with provenance back to this document.
          </p>
        </div>
      )}

      {result && (
        <Card accent="green" className="p-5">
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
            {result.intelligence.map((r) => (
              <li key={r.id}>
                Intelligence created:{" "}
                <Link href="/intelligence" className="font-bold text-cyber hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
            {result.research.map((r) => (
              <li key={r.id}>
                Research entry created:{" "}
                <Link href="/research" className="font-bold text-cyber hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
            {result.linkedRiskId && (
              <li>
                Document linked to{" "}
                <Link
                  href={`/risks/${result.linkedRiskId}`}
                  className="font-bold text-cyber hover:underline"
                >
                  an existing risk
                </Link>
                .
              </li>
            )}
            {result.risks.length +
              result.intelligence.length +
              result.research.length ===
              0 &&
              !result.linkedRiskId && <li>No proposals were selected - nothing was created.</li>}
          </ul>
        </Card>
      )}

      {/* Summary panel */}
      <div className="rounded-brand border border-cyber/30 bg-surface p-5 shadow-[inset_0_1px_0_rgba(142,255,0,0.08)]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyber" />
            <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
              AI summary
            </h3>
          </div>
          <span className="text-xs text-muted">{formatDateTime(analysis.createdAt)}</span>
        </div>
        <p className="text-sm leading-relaxed text-ink/90">{analysis.summary}</p>
        {p.truncated && (
          <p className="mt-2 text-xs text-sev-high">
            Note: the document text exceeded 60,000 characters and was truncated before analysis.
          </p>
        )}
        {p.keyFindings.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-muted" />
              <h4 className="font-display text-xs font-bold tracking-wide text-muted uppercase">
                Key findings
              </h4>
            </div>
            <ul className="ml-5 list-disc space-y-1 text-sm text-ink/90">
              {p.keyFindings.map((f, i) => (
                <li key={i} className="leading-relaxed">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {totalProposals === 0 ? (
        <Card>
          <EmptyState
            icon={<Radar />}
            title="No structured proposals"
            hint={`The AI did not find records worth extracting from "${documentName}".`}
          />
        </Card>
      ) : (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
              Review proposed records
            </h3>
            {!committed && !result && (
              <span className="text-xs text-muted">
                {canCommit
                  ? `${selectedCount} of ${totalProposals} selected - untick anything that should not be created.`
                  : "Your role can review these proposals but not commit them."}
              </span>
            )}
          </div>

          <div className="space-y-6">
            {p.risks.length > 0 && (
              <section>
                <SectionHeading icon={<ShieldAlert />} title="Proposed risks" count={p.risks.length} />
                <div className="space-y-2">
                  {p.risks.map((r, i) => (
                    <ProposalCard
                      key={i}
                      checked={selRisks.has(i)}
                      onToggle={() => toggle(selRisks, i, setSelRisks)}
                      disabled={reviewLocked}
                    >
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
                    </ProposalCard>
                  ))}
                </div>
              </section>
            )}

            {p.intelligence.length > 0 && (
              <section>
                <SectionHeading
                  icon={<Radar />}
                  title="Proposed intelligence"
                  count={p.intelligence.length}
                />
                <div className="space-y-2">
                  {p.intelligence.map((it, i) => (
                    <ProposalCard
                      key={i}
                      checked={selIntel.has(i)}
                      onToggle={() => toggle(selIntel, i, setSelIntel)}
                      disabled={reviewLocked}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display font-bold text-ink">{it.title}</p>
                        <span className="rounded-[4px] border border-hairline bg-surface px-2 py-0.5 font-display text-[11px] font-bold tracking-wide text-muted uppercase">
                          {it.incidentType}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-ink/80">{it.summary}</p>
                      <p className="mt-1.5 text-xs text-muted">
                        {it.location ? `Location: ${it.location}` : "Location unspecified"}
                        {it.occurredAt ? ` · Occurred: ${it.occurredAt.slice(0, 10)}` : ""}
                      </p>
                    </ProposalCard>
                  ))}
                </div>
              </section>
            )}

            {p.research.length > 0 && (
              <section>
                <SectionHeading
                  icon={<BookOpen />}
                  title="Proposed research"
                  count={p.research.length}
                />
                <div className="space-y-2">
                  {p.research.map((r, i) => (
                    <ProposalCard
                      key={i}
                      checked={selResearch.has(i)}
                      onToggle={() => toggle(selResearch, i, setSelResearch)}
                      disabled={reviewLocked}
                    >
                      <p className="font-display font-bold text-ink">{r.title}</p>
                      <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-ink/80">
                        {r.content}
                      </p>
                      {r.keywords.length > 0 && (
                        <p className="mt-1.5 text-xs text-muted">
                          Keywords: {r.keywords.join(", ")}
                        </p>
                      )}
                    </ProposalCard>
                  ))}
                </div>
              </section>
            )}

            {p.linkSuggestions.length > 0 && (
              <section>
                <SectionHeading
                  icon={<Link2 />}
                  title="Suggested risk links"
                  count={p.linkSuggestions.length}
                />
                <div className="space-y-2">
                  {p.linkSuggestions.map((l, i) => (
                    <ProposalCard
                      key={i}
                      checked={selLinks.has(i)}
                      onToggle={() => toggle(selLinks, i, setSelLinks)}
                      disabled={reviewLocked}
                    >
                      <p className="font-display font-bold text-ink">
                        Link to:{" "}
                        <Link
                          href={`/risks/${l.existingRiskId}`}
                          className="text-cyber hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {l.existingRiskTitle ?? l.existingRiskId}
                        </Link>
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-ink/80">{l.reason}</p>
                    </ProposalCard>
                  ))}
                </div>
              </section>
            )}
          </div>

          {commitError && (
            <p className="mt-4 rounded-brand border border-sev-critical/30 bg-sev-critical/10 px-3 py-2 text-sm text-sev-critical">
              {commitError}
            </p>
          )}

          {canCommit && !committed && !result && (
            <div className="mt-5 flex items-center justify-end gap-3 border-t border-hairline pt-4">
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
                {committing
                  ? "Committing…"
                  : `Commit selected to platform (${selectedCount})`}
              </PrimaryButton>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
