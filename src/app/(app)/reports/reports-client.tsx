"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { Card, GhostButton, PrimaryButton } from "@/components/ui";
import { Markdown } from "@/components/markdown";

type ReportType = "risk_summary" | "sector_report" | "research_digest";
type Range = "7d" | "30d" | "90d" | "all";

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

const RANGES: { id: Range; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "all", label: "All time" },
];

const TYPE_TAG: Record<string, string> = {
  risk_summary: "Risk Summary",
  sector_report: "Sector Report",
  research_digest: "Research Digest",
  deep_analysis: "Deep Analysis",
};

export function ReportsClient({
  canGenerate,
  recent,
}: {
  canGenerate: boolean;
  recent: { id: string; title: string; reportType: string; createdAt: string; generatedBy: string }[];
}) {
  const router = useRouter();
  const [reportType, setReportType] = useState<ReportType>("risk_summary");
  const [range, setRange] = useState<Range>("30d");
  const [focus, setFocus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{ id: string; title: string; content: string } | null>(
    null,
  );

  async function generate() {
    setGenerating(true);
    setError(null);
    setGenerated(null);
    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportType, range, focus: focus.trim() || undefined }),
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

  return (
    <div className="space-y-6">
      {canGenerate ? (
        <Card accent="green" className="p-6">
          <div className="grid gap-3 md:grid-cols-3">
            {TYPES.map((t) => (
              <button
                key={t.id}
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

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted uppercase">
                Date range
              </label>
              <div className="flex flex-wrap gap-2">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRange(r.id)}
                    className={`rounded-brand border px-3 py-1.5 font-display text-xs font-bold transition-colors ${
                      range === r.id
                        ? "border-cyber/60 bg-cyber/10 text-cyber"
                        : "border-hairline text-muted hover:text-ink"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted uppercase">
                Focus / instructions (optional)
              </label>
              <input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="e.g. emphasise battery theft in Gauteng and KZN"
                className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-cyber/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-5">
            <PrimaryButton onClick={generate} disabled={generating}>
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating ? "Generating report…" : "Generate report"}
            </PrimaryButton>
          </div>
        </Card>
      ) : (
        <Card className="p-5 text-sm text-muted">
          Your role has view-only access. Generated reports appear below and in the{" "}
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
            <a href={`/api/reports/${generated.id}/pdf`}>
              <GhostButton>
                <Download className="h-4 w-4" /> Download PDF
              </GhostButton>
            </a>
          </div>
          <Markdown content={generated.content} />
        </Card>
      )}

      {recent.length > 0 && (
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
                  <a
                    href={`/api/reports/${r.id}/pdf`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-cyber"
                  >
                    <Download className="h-3.5 w-3.5" /> PDF
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
