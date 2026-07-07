import { and, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import {
  documentAnalyses,
  documents,
  researchEntries,
  risks,
  scrapeResults,
  sectorIntelligence,
} from "./schema";
import {
  METRIC_DEFS,
  RANGE_DAYS,
  SOURCE_DEFS,
  type BuilderPayload,
  type MetricKey,
  type MetricTable,
  type SourceKey,
} from "./report-config";

/**
 * Server-side data assemblers for the report builder. Each metric key maps to
 * a typed assembler that produces a MetricTable; each source key maps to a
 * text-block assembler used to ground the AI prompt. Everything tolerates
 * sparse/empty production tables.
 */

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

function severitiesAtOrAbove(floor: BuilderPayload["severityFloor"]) {
  if (!floor) return null;
  const idx = SEVERITY_ORDER.indexOf(floor);
  return SEVERITY_ORDER.slice(0, idx + 1);
}

export function rangeSince(range: BuilderPayload["range"]): Date | null {
  const days = RANGE_DAYS[range];
  return days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
}

function riskConditions(payload: BuilderPayload, since: Date | null): SQL[] {
  const conds: SQL[] = [];
  if (since) conds.push(gte(risks.createdAt, since));
  if (payload.category) conds.push(eq(risks.category, payload.category));
  const sevs = severitiesAtOrAbove(payload.severityFloor);
  if (sevs) conds.push(inArray(risks.severity, [...sevs]));
  return conds;
}

function whereAll(conds: SQL[]): SQL | undefined {
  return conds.length > 0 ? and(...conds) : undefined;
}

const count = sql<number>`count(*)::int`;

async function severityDistribution(payload: BuilderPayload): Promise<MetricTable> {
  const since = rangeSince(payload.range);
  const current = await db
    .select({ severity: risks.severity, n: count })
    .from(risks)
    .where(whereAll(riskConditions(payload, since)))
    .groupBy(risks.severity);

  let previous: { severity: string; n: number }[] = [];
  const days = RANGE_DAYS[payload.range];
  if (since && days) {
    const prevStart = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);
    previous = await db
      .select({ severity: risks.severity, n: count })
      .from(risks)
      .where(
        whereAll([
          ...riskConditions(payload, prevStart),
          lt(risks.createdAt, since),
        ]),
      )
      .groupBy(risks.severity);
  }

  const cur = new Map(current.map((r) => [r.severity, r.n]));
  const prev = new Map(previous.map((r) => [r.severity, r.n]));
  const rows = SEVERITY_ORDER.map((s) => {
    const c = cur.get(s) ?? 0;
    const p = prev.get(s) ?? 0;
    const delta = since ? (c - p > 0 ? `+${c - p}` : `${c - p}`) : "n/a";
    return [s, c, since ? p : "n/a", delta] as (string | number)[];
  });
  return {
    key: "severity_distribution",
    title: METRIC_DEFS.severity_distribution,
    columns: ["Severity", "Risks in range", "Previous period", "Change"],
    rows,
  };
}

async function categoryBreakdown(payload: BuilderPayload): Promise<MetricTable> {
  const since = rangeSince(payload.range);
  const grouped = await db
    .select({ category: risks.category, n: count })
    .from(risks)
    .where(whereAll(riskConditions(payload, since)))
    .groupBy(risks.category)
    .orderBy(desc(count));
  const total = grouped.reduce((acc, g) => acc + g.n, 0);
  return {
    key: "category_breakdown",
    title: METRIC_DEFS.category_breakdown,
    columns: ["Category", "Risks", "Share"],
    rows: grouped.map((g) => [
      g.category,
      g.n,
      total > 0 ? `${Math.round((g.n / total) * 100)}%` : "0%",
    ]),
  };
}

async function newVsResolved(payload: BuilderPayload): Promise<MetricTable> {
  const since = rangeSince(payload.range);
  const baseConds = riskConditions(payload, null);
  const [[created], [resolved]] = await Promise.all([
    db
      .select({ n: count })
      .from(risks)
      .where(whereAll([...baseConds, ...(since ? [gte(risks.createdAt, since)] : [])])),
    db
      .select({ n: count })
      .from(risks)
      .where(
        whereAll([
          ...baseConds,
          inArray(risks.status, ["resolved", "closed"]),
          ...(since ? [gte(risks.updatedAt, since)] : []),
        ]),
      ),
  ]);
  const newCount = created?.n ?? 0;
  const resolvedCount = resolved?.n ?? 0;
  return {
    key: "new_vs_resolved",
    title: METRIC_DEFS.new_vs_resolved,
    columns: ["Measure", "Count"],
    rows: [
      ["New risks raised", newCount],
      ["Risks resolved or closed", resolvedCount],
      ["Net change", newCount - resolvedCount],
    ],
  };
}

async function incidentLocations(payload: BuilderPayload): Promise<MetricTable> {
  const since = rangeSince(payload.range);
  const conds: SQL[] = [];
  if (since) conds.push(gte(sectorIntelligence.createdAt, since));
  const grouped = await db
    .select({
      location: sql<string>`coalesce(${sectorIntelligence.location}, 'Unspecified')`,
      n: count,
    })
    .from(sectorIntelligence)
    .where(whereAll(conds))
    .groupBy(sql`coalesce(${sectorIntelligence.location}, 'Unspecified')`)
    .orderBy(desc(count))
    .limit(15);
  return {
    key: "incident_locations",
    title: METRIC_DEFS.incident_locations,
    columns: ["Location", "Incidents"],
    rows: grouped.map((g) => [g.location, g.n]),
  };
}

async function keywordTrends(payload: BuilderPayload): Promise<MetricTable> {
  const since = rangeSince(payload.range);
  const rows = await db
    .select({ matched: scrapeResults.matchedKeywords })
    .from(scrapeResults)
    .where(since ? gte(scrapeResults.scrapedAt, since) : undefined)
    .orderBy(desc(scrapeResults.scrapedAt))
    .limit(2000);
  const tally = new Map<string, number>();
  for (const r of rows) {
    for (const kw of r.matched) {
      const key = kw.trim().toLowerCase();
      if (key) tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  return {
    key: "keyword_trends",
    title: METRIC_DEFS.keyword_trends,
    columns: ["Keyword", "Hits"],
    rows: top.map(([kw, n]) => [kw, n]),
  };
}

async function scrapeVolume(payload: BuilderPayload): Promise<MetricTable> {
  const since = rangeSince(payload.range);
  const [stats] = await db
    .select({
      total: count,
      processed: sql<number>`count(*) filter (where ${scrapeResults.processed} = true)::int`,
      unprocessed: sql<number>`count(*) filter (where ${scrapeResults.processed} = false)::int`,
      avgRelevance: sql<number | null>`round(avg(${scrapeResults.relevanceScore})::numeric, 2)::float`,
    })
    .from(scrapeResults)
    .where(since ? gte(scrapeResults.scrapedAt, since) : undefined);
  return {
    key: "scrape_volume",
    title: METRIC_DEFS.scrape_volume,
    columns: ["Measure", "Value"],
    rows: [
      ["Results captured", stats?.total ?? 0],
      ["Processed", stats?.processed ?? 0],
      ["Awaiting analysis", stats?.unprocessed ?? 0],
      ["Average relevance score", stats?.avgRelevance ?? "n/a"],
    ],
  };
}

async function topSources(payload: BuilderPayload): Promise<MetricTable> {
  const since = rangeSince(payload.range);
  const rows = await db
    .select({ url: scrapeResults.sourceUrl })
    .from(scrapeResults)
    .where(since ? gte(scrapeResults.scrapedAt, since) : undefined)
    .orderBy(desc(scrapeResults.scrapedAt))
    .limit(2000);
  const tally = new Map<string, number>();
  for (const r of rows) {
    let host = r.url;
    try {
      host = new URL(r.url).hostname.replace(/^www\./, "");
    } catch {
      // keep raw value for malformed URLs
    }
    tally.set(host, (tally.get(host) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    key: "top_sources",
    title: METRIC_DEFS.top_sources,
    columns: ["Source", "Results"],
    rows: top.map(([host, n]) => [host, n]),
  };
}

async function responseStatus(payload: BuilderPayload): Promise<MetricTable> {
  const since = rangeSince(payload.range);
  const grouped = await db
    .select({ status: risks.status, n: count })
    .from(risks)
    .where(whereAll(riskConditions(payload, since)))
    .groupBy(risks.status)
    .orderBy(desc(count));
  return {
    key: "response_status",
    title: METRIC_DEFS.response_status,
    columns: ["Status", "Risks"],
    rows: grouped.map((g) => [g.status, g.n]),
  };
}

const METRIC_ASSEMBLERS: Record<MetricKey, (p: BuilderPayload) => Promise<MetricTable>> = {
  severity_distribution: severityDistribution,
  category_breakdown: categoryBreakdown,
  new_vs_resolved: newVsResolved,
  incident_locations: incidentLocations,
  keyword_trends: keywordTrends,
  scrape_volume: scrapeVolume,
  top_sources: topSources,
  response_status: responseStatus,
};

/** Assemble only the selected metric tables (in the order selected). */
export async function assembleMetricTables(payload: BuilderPayload): Promise<MetricTable[]> {
  return Promise.all(payload.metrics.map((key) => METRIC_ASSEMBLERS[key](payload)));
}

export type SourceBlock = { key: SourceKey; title: string; body: string };

async function riskRegisterBlock(payload: BuilderPayload): Promise<SourceBlock> {
  const since = rangeSince(payload.range);
  const rows = await db
    .select()
    .from(risks)
    .where(whereAll(riskConditions(payload, since)))
    .orderBy(desc(risks.createdAt))
    .limit(25);
  return {
    key: "risk_register",
    title: SOURCE_DEFS.risk_register,
    body:
      rows
        .map(
          (r) =>
            `- [${r.severity.toUpperCase()}/${r.category}/${r.status}] ${r.title}: ${r.description.slice(0, 200)}`,
        )
        .join("\n") || "(no risks in scope)",
  };
}

async function sectorIntelBlock(payload: BuilderPayload): Promise<SourceBlock> {
  const since = rangeSince(payload.range);
  const rows = await db
    .select()
    .from(sectorIntelligence)
    .where(since ? gte(sectorIntelligence.createdAt, since) : undefined)
    .orderBy(desc(sectorIntelligence.createdAt))
    .limit(25);
  return {
    key: "sector_intel",
    title: SOURCE_DEFS.sector_intel,
    body:
      rows
        .map(
          (i) =>
            `- (${i.incidentType}${i.location ? `, ${i.location}` : ""}) ${i.title}: ${i.summary.slice(0, 200)}`,
        )
        .join("\n") || "(no sector intelligence in scope)",
  };
}

async function scrapedNewsBlock(payload: BuilderPayload): Promise<SourceBlock> {
  const since = rangeSince(payload.range);
  const rows = await db
    .select({
      title: scrapeResults.title,
      snippet: scrapeResults.snippet,
      matched: scrapeResults.matchedKeywords,
      relevance: scrapeResults.relevanceScore,
    })
    .from(scrapeResults)
    .where(since ? gte(scrapeResults.scrapedAt, since) : undefined)
    .orderBy(desc(scrapeResults.relevanceScore), desc(scrapeResults.scrapedAt))
    .limit(20);
  return {
    key: "scraped_news",
    title: SOURCE_DEFS.scraped_news,
    body:
      rows
        .map(
          (s) =>
            `- ${s.title}${s.matched.length ? ` [keywords: ${s.matched.slice(0, 5).join(", ")}]` : ""}: ${(s.snippet ?? "").slice(0, 180)}`,
        )
        .join("\n") || "(no scraped news in scope)",
  };
}

async function researchBlock(payload: BuilderPayload): Promise<SourceBlock> {
  const since = rangeSince(payload.range);
  const rows = await db
    .select()
    .from(researchEntries)
    .where(since ? gte(researchEntries.createdAt, since) : undefined)
    .orderBy(desc(researchEntries.createdAt))
    .limit(25);
  return {
    key: "research",
    title: SOURCE_DEFS.research,
    body:
      rows
        .map((e) => `- [${e.sourceType}] ${e.title}: ${(e.aiSummary ?? e.content).slice(0, 200)}`)
        .join("\n") || "(no research entries in scope)",
  };
}

async function documentAnalysesBlock(payload: BuilderPayload): Promise<SourceBlock> {
  const since = rangeSince(payload.range);
  const rows = await db
    .select({
      documentName: documents.name,
      summary: documentAnalyses.summary,
      status: documentAnalyses.status,
      createdAt: documentAnalyses.createdAt,
    })
    .from(documentAnalyses)
    .innerJoin(documents, eq(documentAnalyses.documentId, documents.id))
    .where(since ? gte(documentAnalyses.createdAt, since) : undefined)
    .orderBy(desc(documentAnalyses.createdAt))
    .limit(15);
  return {
    key: "document_analyses",
    title: SOURCE_DEFS.document_analyses,
    body:
      rows
        .map((d) => `- (${d.status}) ${d.documentName}: ${d.summary.slice(0, 220)}`)
        .join("\n") || "(no document analyses in scope)",
  };
}

const SOURCE_ASSEMBLERS: Record<SourceKey, (p: BuilderPayload) => Promise<SourceBlock>> = {
  risk_register: riskRegisterBlock,
  sector_intel: sectorIntelBlock,
  scraped_news: scrapedNewsBlock,
  research: researchBlock,
  document_analyses: documentAnalysesBlock,
};

/** Assemble only the selected data-source text blocks. */
export async function assembleSourceBlocks(payload: BuilderPayload): Promise<SourceBlock[]> {
  const results = await Promise.allSettled(
    payload.sources.map((key) => SOURCE_ASSEMBLERS[key](payload)),
  );
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          key: payload.sources[i],
          title: SOURCE_DEFS[payload.sources[i]],
          body: "(source unavailable)",
        },
  );
}

/** Render a MetricTable as a compact markdown table for the AI prompt. */
export function metricTableToMarkdown(table: MetricTable): string {
  if (table.rows.length === 0) return `### ${table.title}\n(no data in scope)`;
  const header = `| ${table.columns.join(" | ")} |`;
  const sep = `| ${table.columns.map(() => "---").join(" | ")} |`;
  const rows = table.rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `### ${table.title}\n${header}\n${sep}\n${rows}`;
}
