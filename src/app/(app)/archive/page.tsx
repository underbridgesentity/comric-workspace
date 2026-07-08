import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, or, isNotNull, type SQL } from "drizzle-orm";
import { Archive as ArchiveIcon, FileText, Sparkles } from "lucide-react";
import { ReportExportButtons } from "@/components/report-export";
import { db } from "@/lib/db";
import { aiReports, researchEntries, reportTypeEnum, users, type ReportType } from "@/lib/schema";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { parseWindow } from "@/lib/date-range";
import { FilterBar } from "@/components/filter-bar";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<ReportType, string> = {
  risk_summary: "Risk Summary",
  sector_report: "Sector Report",
  research_digest: "Research Digest",
  deep_analysis: "Deep Analysis",
};

function TypeTag({ type }: { type: ReportType }) {
  const colors: Record<ReportType, string> = {
    risk_summary: "border-sev-high/40 bg-sev-high/10 text-sev-high",
    sector_report: "border-digital/40 bg-digital/10 text-digital",
    research_digest: "border-cyber/40 bg-cyber/10 text-cyber",
    deep_analysis: "border-network/40 bg-network/10 text-digital",
  };
  return (
    <span
      className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${colors[type]}`}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; range?: string; from?: string; to?: string }>;
}) {
  const { q, type, range: rangeParam, from, to } = await searchParams;
  const query = (q ?? "").trim();
  const typeFilter = reportTypeEnum.enumValues.find((t) => t === type);
  const window = parseWindow({ range: rangeParam, from, to }, "all");

  const reportConditions: SQL[] = [];
  if (window.start) reportConditions.push(gte(aiReports.createdAt, window.start));
  if (window.end) reportConditions.push(lte(aiReports.createdAt, window.end));
  if (query) {
    const cond = or(ilike(aiReports.title, `%${query}%`), ilike(aiReports.content, `%${query}%`));
    if (cond) reportConditions.push(cond);
  }
  if (typeFilter) reportConditions.push(eq(aiReports.reportType, typeFilter));

  const researchConditions: SQL[] = [isNotNull(researchEntries.aiSummary)];
  if (window.start) researchConditions.push(gte(researchEntries.createdAt, window.start));
  if (window.end) researchConditions.push(lte(researchEntries.createdAt, window.end));
  if (query) {
    const cond = or(
      ilike(researchEntries.title, `%${query}%`),
      ilike(researchEntries.aiSummary, `%${query}%`),
    );
    if (cond) researchConditions.push(cond);
  }

  const [reports, analysedEntries] = await Promise.all([
    db
      .select({
        id: aiReports.id,
        title: aiReports.title,
        reportType: aiReports.reportType,
        createdAt: aiReports.createdAt,
        generatedBy: users.fullName,
      })
      .from(aiReports)
      .leftJoin(users, eq(aiReports.generatedBy, users.id))
      .where(reportConditions.length > 0 ? and(...reportConditions) : undefined)
      .orderBy(desc(aiReports.createdAt))
      .limit(100),
    typeFilter
      ? Promise.resolve([])
      : db
          .select({
            id: researchEntries.id,
            title: researchEntries.title,
            aiSummary: researchEntries.aiSummary,
            createdAt: researchEntries.createdAt,
            createdBy: users.fullName,
          })
          .from(researchEntries)
          .leftJoin(users, eq(researchEntries.createdBy, users.id))
          .where(and(...researchConditions))
          .orderBy(desc(researchEntries.createdAt))
          .limit(50),
  ]);

  const isCustom = rangeParam === "custom";
  const archiveHref = (overrides: { type?: string }) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    const nextType = "type" in overrides ? overrides.type : typeFilter;
    if (nextType) sp.set("type", nextType);
    if (isCustom) {
      sp.set("range", "custom");
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
    } else if (window.key !== "all") {
      sp.set("range", window.key);
    }
    const s = sp.toString();
    return s ? `/archive?${s}` : "/archive";
  };

  const filters: { label: string; href: string; active: boolean }[] = [
    { label: "All", href: archiveHref({ type: undefined }), active: !typeFilter },
    ...reportTypeEnum.enumValues.map((t) => ({
      label: TYPE_LABELS[t],
      href: archiveHref({ type: t }),
      active: typeFilter === t,
    })),
  ];

  return (
    <div className="animate-rise">
      <PageHeader
        title="Historical Archive"
        subtitle="Every AI report and analysed research entry, searchable and exportable."
      />

      {/* Search + filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form method="get" action="/archive" className="flex items-center gap-2">
          {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
          {isCustom ? (
            <>
              <input type="hidden" name="range" value="custom" />
              {from && <input type="hidden" name="from" value={from} />}
              {to && <input type="hidden" name="to" value={to} />}
            </>
          ) : (
            window.key !== "all" && <input type="hidden" name="range" value={window.key} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search titles and content…"
            className="w-72 rounded-brand border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-cyber/50 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-brand bg-cyber px-4 py-2 font-display text-sm font-bold text-black hover:brightness-110"
          >
            Search
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <Link
              key={f.label}
              href={f.href}
              className={`rounded-brand border px-3 py-1.5 font-display text-xs font-bold transition-colors ${
                f.active
                  ? "border-cyber/60 bg-cyber/10 text-cyber"
                  : "border-hairline text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <FilterBar rangeParam="range" defaultRange="all" className="mb-0" />
      </div>

      {/* AI reports */}
      <h2 className="mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
        AI reports {query && <span className="text-muted">matching “{query}”</span>}
      </h2>
      <Card className="mb-8">
        {reports.length === 0 ? (
          <EmptyState
            icon={<ArchiveIcon />}
            title="No reports found"
            hint={query ? "Try a broader search term or clear the type filter." : "Generate a report from the Reports page to populate the archive."}
          />
        ) : (
          <ul className="divide-y divide-hairline/60">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/archive/${r.id}`}
                      className="font-display text-sm font-bold text-ink hover:text-cyber"
                    >
                      {r.title}
                    </Link>
                    <TypeTag type={r.reportType} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Generated by {r.generatedBy ?? "Unknown"} ·{" "}
                    {r.createdAt.toLocaleDateString("en-ZA", {
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
        )}
      </Card>

      {/* Analysed research entries */}
      {!typeFilter && (
        <>
          <h2 className="mb-3 font-display text-sm font-bold tracking-wide text-ink uppercase">
            AI-analysed research entries
          </h2>
          <Card>
            {analysedEntries.length === 0 ? (
              <EmptyState
                icon={<FileText />}
                title="No analysed entries"
                hint="Run an AI research analysis to summarise research entries."
              />
            ) : (
              <ul className="divide-y divide-hairline/60">
                {analysedEntries.map((e) => (
                  <li key={e.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-bold text-ink">{e.title}</span>
                      <span className="inline-flex items-center gap-1 rounded-[4px] border border-digital/40 bg-digital/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-digital uppercase">
                        <Sparkles className="h-2.5 w-2.5" /> AI summary
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink/75">{e.aiSummary}</p>
                    <p className="mt-1 text-xs text-muted">
                      {e.createdBy ?? "Unknown"} ·{" "}
                      {e.createdAt.toLocaleDateString("en-ZA", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
