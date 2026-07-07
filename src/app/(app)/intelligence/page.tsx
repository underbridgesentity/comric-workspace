import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { ExternalLink, Radar, Rss } from "lucide-react";
import { db } from "@/lib/db";
import { risks, scrapeResults, sectorIntelligence } from "@/lib/schema";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AddIntelligenceButton, LinkRiskSelect, PromoteButton } from "./intelligence-controls";

export default async function IntelligencePage() {
  const session = await auth();
  const role = session?.user?.role ?? "read_only";
  const canCreate = can(role, "create", "intelligence");
  const canUpdate = can(role, "update", "intelligence");

  const [items, unprocessed, openRisks] = await Promise.all([
    db.select().from(sectorIntelligence).orderBy(desc(sectorIntelligence.createdAt)).limit(100),
    db
      .select()
      .from(scrapeResults)
      .where(eq(scrapeResults.processed, false))
      .orderBy(desc(scrapeResults.scrapedAt))
      .limit(25),
    db
      .select({ id: risks.id, title: risks.title })
      .from(risks)
      .where(inArray(risks.status, ["open", "monitoring", "mitigating"]))
      .orderBy(asc(risks.title)),
  ]);

  const linkedIds = items
    .map((i) => i.linkedRiskId)
    .filter((v): v is string => !!v);
  const linkedRisks = linkedIds.length
    ? await db
        .select({ id: risks.id, title: risks.title })
        .from(risks)
        .where(inArray(risks.id, linkedIds))
    : [];
  const riskTitle = (rid: string) => linkedRisks.find((r) => r.id === rid)?.title;

  return (
    <div className="animate-rise">
      <PageHeader
        title="Sector Intelligence"
        subtitle="Incident intelligence across the SA telecom sector"
        actions={canCreate ? <AddIntelligenceButton risks={openRisks} /> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Radar />}
                title="No intelligence yet"
                hint="Add incidents manually or promote items from monitoring."
              />
            </Card>
          ) : (
            items.map((i) => (
              <Card key={i.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-bold text-ink">{i.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="rounded-[4px] border border-digital/30 bg-digital/10 px-2 py-0.5 font-display font-bold tracking-wide text-digital uppercase">
                        {i.incidentType}
                      </span>
                      {i.location && <span>{i.location}</span>}
                      {i.occurredAt && (
                        <span>
                          {i.occurredAt.toLocaleDateString("en-ZA", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                      {i.source && <span>via {i.source}</span>}
                      {i.sourceUrl && (
                        <a
                          href={i.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-cyber hover:brightness-110"
                        >
                          source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {i.linkedRiskId && riskTitle(i.linkedRiskId) ? (
                    <Link
                      href={`/risks/${i.linkedRiskId}`}
                      className="shrink-0 rounded-[4px] border border-hairline bg-canvas px-2 py-1 text-xs font-semibold text-ink transition-colors hover:border-cyber/40 hover:text-cyber"
                    >
                      Risk: {riskTitle(i.linkedRiskId)}
                    </Link>
                  ) : canUpdate ? (
                    <LinkRiskSelect intelId={i.id} currentRiskId={i.linkedRiskId} risks={openRisks} />
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink/90">{i.summary}</p>
              </Card>
            ))
          )}
        </div>

        <div>
          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-bold tracking-wider text-muted uppercase">
              <Rss className="h-4 w-4" /> From monitoring
            </h2>
            <p className="mb-4 text-xs text-muted">
              Unprocessed web-monitoring hits. Promote relevant items into the intelligence feed.
            </p>
            {unprocessed.length === 0 ? (
              <p className="text-sm text-muted">Nothing waiting — all monitoring hits processed.</p>
            ) : (
              <ul className="space-y-3">
                {unprocessed.map((s) => (
                  <li key={s.id} className="rounded-brand border border-hairline bg-canvas p-3">
                    <a
                      href={s.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-ink transition-colors hover:text-cyber"
                    >
                      {s.title}
                    </a>
                    {s.snippet && <p className="mt-1 line-clamp-3 text-xs text-muted">{s.snippet}</p>}
                    {s.matchedKeywords.length > 0 && (
                      <p className="mt-1 text-xs text-muted">
                        Matched: {s.matchedKeywords.join(", ")}
                      </p>
                    )}
                    {canCreate && (
                      <div className="mt-2">
                        <PromoteButton scrapeResultId={s.id} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
