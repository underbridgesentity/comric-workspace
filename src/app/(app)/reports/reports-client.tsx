"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookmarkPlus,
  Check,
  FileText,
  LayoutTemplate,
  Loader2,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { Card, GhostButton, PrimaryButton } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { ReportExportButtons } from "@/components/report-export";
import {
  METRIC_DEFS,
  METRIC_KEYS,
  RANGE_LABELS,
  RISK_CATEGORIES,
  SEVERITIES,
  SOURCE_DEFS,
  SOURCE_KEYS,
  type BuilderPayload,
  type MetricKey,
  type SourceKey,
} from "@/lib/report-config";

type ReportType = BuilderPayload["reportType"];
type Range = BuilderPayload["range"];

type Template = {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  parameters: BuilderPayload;
};

const TYPES: { id: ReportType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: "risk_summary",
    label: "Risk Summary",
    description: "Register-wide severity, category and status overview with priority actions.",
    icon: <ShieldAlert className="h-5 w-5" />,
  },
  {
    id: "sector_report",
    label: "Sector Report",
    description: "Telecom-sector threat landscape combining risks, intel and scraped news.",
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    id: "research_digest",
    label: "Research Digest",
    description: "Insights, trends and anomalies across the research corpus.",
    icon: <FileText className="h-5 w-5" />,
  },
];

const RANGES = (Object.keys(RANGE_LABELS) as Range[]).map((id) => ({
  id,
  label: RANGE_LABELS[id],
}));

const TYPE_TAG: Record<string, string> = {
  risk_summary: "Risk Summary",
  sector_report: "Sector Report",
  research_digest: "Research Digest",
  deep_analysis: "Deep Analysis",
};

const DEFAULT_METRICS: MetricKey[] = [
  "severity_distribution",
  "category_breakdown",
  "response_status",
];
const DEFAULT_SOURCES: SourceKey[] = ["risk_register", "sector_intel"];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-display text-xs font-bold tracking-wider text-muted uppercase">
      {children}
    </p>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-brand border px-3 py-1.5 font-display text-xs font-bold transition-colors ${
        active
          ? "border-cyber/60 bg-cyber/10 text-cyber"
          : "border-hairline text-muted hover:text-ink"
      }`}
    >
      {active && <Check className="h-3 w-3" />}
      {children}
    </button>
  );
}

export function ReportsClient({
  canGenerate,
  canDeleteTemplates,
  templates,
  recent,
}: {
  canGenerate: boolean;
  canDeleteTemplates: boolean;
  templates: Template[];
  recent: { id: string; title: string; reportType: string; createdAt: string; generatedBy: string }[];
}) {
  const router = useRouter();

  // Builder state
  const [reportType, setReportType] = useState<ReportType>("risk_summary");
  const [metrics, setMetrics] = useState<MetricKey[]>(DEFAULT_METRICS);
  const [sources, setSources] = useState<SourceKey[]>(DEFAULT_SOURCES);
  const [range, setRange] = useState<Range>("30d");
  const [category, setCategory] = useState<string>("");
  const [severityFloor, setSeverityFloor] = useState<string>("");
  const [instructions, setInstructions] = useState("");

  // Async state
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{ id: string; title: string; content: string } | null>(
    null,
  );

  // Templates
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function currentPayload(): BuilderPayload {
    return {
      reportType,
      metrics,
      sources,
      range,
      category: (category || undefined) as BuilderPayload["category"],
      severityFloor: (severityFloor || undefined) as BuilderPayload["severityFloor"],
      instructions: instructions.trim() || undefined,
    };
  }

  function applyTemplate(t: Template) {
    const p = t.parameters;
    setReportType(p.reportType);
    setMetrics(p.metrics);
    setSources(p.sources);
    setRange(p.range);
    setCategory(p.category ?? "");
    setSeverityFloor(p.severityFloor ?? "");
    setInstructions(p.instructions ?? "");
    setAppliedTemplateId(t.id);
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setGenerated(null);
    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(currentPayload()),
      });
      const data = (await res.json()) as {
        id?: string;
        title?: string;
        content?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Report generation failed");
      setGenerated({
        id: data.id ?? "",
        title: data.title ?? "Report",
        content: data.content ?? "",
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function saveTemplate() {
    if (!templateName.trim()) {
      setTemplateError("Give the template a name.");
      return;
    }
    setSavingTemplate(true);
    setTemplateError(null);
    try {
      const res = await fetch("/api/report-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDescription.trim() || undefined,
          parameters: currentPayload(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save template");
      setTemplateFormOpen(false);
      setTemplateName("");
      setTemplateDescription("");
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 2500);
      router.refresh();
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Could not save template");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplate(id: string) {
    setDeletingTemplateId(id);
    setTemplateError(null);
    try {
      const res = await fetch(`/api/report-templates/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not delete template");
      if (appliedTemplateId === id) setAppliedTemplateId(null);
      router.refresh();
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Could not delete template");
    } finally {
      setDeletingTemplateId(null);
    }
  }

  return (
    <div className="space-y-6">
      {canGenerate ? (
        <Card accent="green" className="p-6">
          {/* Templates */}
          {(templates.length > 0 || templateSaved) && (
            <div className="mb-5">
              <SectionLabel>Templates</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <span
                    key={t.id}
                    className={`inline-flex items-center gap-1 rounded-brand border ${
                      appliedTemplateId === t.id
                        ? "border-cyber/60 bg-cyber/10"
                        : "border-hairline bg-canvas"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => applyTemplate(t)}
                      title={`${t.description ? `${t.description} - ` : ""}saved by ${t.createdBy}`}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-display text-xs font-bold transition-colors ${
                        appliedTemplateId === t.id ? "text-cyber" : "text-muted hover:text-ink"
                      }`}
                    >
                      <LayoutTemplate className="h-3.5 w-3.5" /> {t.name}
                    </button>
                    {canDeleteTemplates && (
                      <button
                        type="button"
                        onClick={() => deleteTemplate(t.id)}
                        disabled={deletingTemplateId === t.id}
                        title="Delete template"
                        className="pr-2 text-muted/60 transition-colors hover:text-sev-critical disabled:opacity-50"
                      >
                        {deletingTemplateId === t.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </span>
                ))}
                {templateSaved && (
                  <span className="inline-flex items-center gap-1.5 rounded-brand border border-cyber/40 bg-cyber/10 px-3 py-1.5 font-display text-xs font-bold text-cyber">
                    <Check className="h-3.5 w-3.5" /> Template saved
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Report type */}
          <SectionLabel>Report type</SectionLabel>
          <div className="grid gap-3 md:grid-cols-3">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setReportType(t.id)}
                className={`rounded-brand border p-4 text-left transition-all duration-150 ${
                  reportType === t.id
                    ? "border-cyber/60 bg-cyber/5"
                    : "border-hairline bg-canvas hover:border-cyber/30"
                }`}
              >
                <div className={reportType === t.id ? "text-cyber" : "text-muted"}>{t.icon}</div>
                <p className="mt-2 font-display text-sm font-bold text-ink">{t.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{t.description}</p>
              </button>
            ))}
          </div>

          {/* Metrics */}
          <div className="mt-6">
            <SectionLabel>Metrics to measure &amp; track</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {METRIC_KEYS.map((key) => (
                <Chip
                  key={key}
                  active={metrics.includes(key)}
                  onClick={() => setMetrics((m) => toggle(m, key))}
                >
                  {METRIC_DEFS[key]}
                </Chip>
              ))}
            </div>
            {metrics.length === 0 && (
              <p className="mt-1.5 text-xs text-muted">
                No metrics selected - a default set (severity, categories, status) will be used.
              </p>
            )}
          </div>

          {/* Data sources */}
          <div className="mt-6">
            <SectionLabel>Data sources</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {SOURCE_KEYS.map((key) => (
                <Chip
                  key={key}
                  active={sources.includes(key)}
                  onClick={() => setSources((s) => toggle(s, key))}
                >
                  {SOURCE_DEFS[key]}
                </Chip>
              ))}
            </div>
            {sources.length === 0 && (
              <p className="mt-1.5 text-xs text-muted">
                No sources selected - the risk register will be used by default.
              </p>
            )}
          </div>

          {/* Scope */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div>
              <SectionLabel>Date range</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {RANGES.map((r) => (
                  <Chip key={r.id} active={range === r.id} onClick={() => setRange(r.id)}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel>Category filter (optional)</SectionLabel>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-cyber/50 focus:outline-none"
              >
                <option value="">All categories</option>
                {RISK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <SectionLabel>Severity floor (optional)</SectionLabel>
              <select
                value={severityFloor}
                onChange={(e) => setSeverityFloor(e.target.value)}
                className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-cyber/50 focus:outline-none"
              >
                <option value="">All severities</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)} and above
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6">
            <SectionLabel>What should this report answer?</SectionLabel>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="e.g. Are battery-theft incidents in Gauteng and KZN accelerating, and which operators are most exposed? What should the board prioritise this quarter?"
              className="w-full resize-y rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-muted/60 focus:border-cyber/50 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={generate} disabled={generating}>
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating ? "Generating report…" : "Generate report"}
            </PrimaryButton>
            <GhostButton onClick={() => setTemplateFormOpen((v) => !v)} disabled={savingTemplate}>
              <BookmarkPlus className="h-4 w-4" /> Save as template
            </GhostButton>
          </div>

          {/* Save-template inline form */}
          {templateFormOpen && (
            <div className="mt-4 rounded-brand border border-hairline bg-canvas p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  maxLength={120}
                  placeholder="Template name (e.g. Monthly board pack)"
                  className="w-full rounded-brand border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-cyber/50 focus:outline-none"
                />
                <input
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  maxLength={500}
                  placeholder="Description (optional)"
                  className="w-full rounded-brand border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-cyber/50 focus:outline-none"
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <PrimaryButton onClick={saveTemplate} disabled={savingTemplate}>
                  {savingTemplate ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookmarkPlus className="h-4 w-4" />
                  )}
                  Save template
                </PrimaryButton>
                <GhostButton
                  onClick={() => {
                    setTemplateFormOpen(false);
                    setTemplateError(null);
                  }}
                >
                  <X className="h-4 w-4" /> Cancel
                </GhostButton>
              </div>
            </div>
          )}
          {templateError && (
            <p className="mt-2 text-xs font-bold text-sev-critical">{templateError}</p>
          )}
        </Card>
      ) : (
        <Card className="p-5 text-sm text-muted">
          Your role has view-only access - the builder is disabled, but you can read and export any
          generated report below or in the{" "}
          <Link href="/archive" className="text-digital hover:underline">
            archive
          </Link>
          .
        </Card>
      )}

      {error && (
        <div className="rounded-brand border border-sev-critical/40 bg-sev-critical/10 px-4 py-2.5 text-sm text-sev-critical">
          {error}
        </div>
      )}

      {generated && (
        <Card accent="blue" className="animate-rise p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
            <p className="font-display text-xs font-bold tracking-wider text-digital uppercase">
              Freshly generated · saved to archive
            </p>
            <ReportExportButtons reportId={generated.id} size="md" />
          </div>
          <Markdown content={generated.content} />
        </Card>
      )}

      {recent.length > 0 ? (
        <div>
          <h2 className="mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
            Recent reports
          </h2>
          <Card>
            <ul className="divide-y divide-hairline/60">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/archive/${r.id}`}
                      className="font-display text-sm font-bold text-ink hover:text-cyber"
                    >
                      {r.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      {TYPE_TAG[r.reportType] ?? r.reportType} · {r.generatedBy} ·{" "}
                      {new Date(r.createdAt).toLocaleDateString("en-ZA", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <ReportExportButtons reportId={r.id} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : (
        !generated && (
          <p className="text-sm text-muted">
            No reports yet - configure the builder above and generate your first report.
          </p>
        )
      )}
    </div>
  );
}
