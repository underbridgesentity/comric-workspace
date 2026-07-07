import { desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documentAnalyses, keywordSets, scrapeResults } from "@/lib/schema";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { KeywordsClient } from "./keywords-client";
import type { SerializedSuggestion } from "./suggestions-section";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "read_only";

  const [sets, counts, recent, suggestionRows] = await Promise.all([
    db.select().from(keywordSets).orderBy(desc(keywordSets.createdAt)),
    db
      .select({
        keywordSetId: scrapeResults.keywordSetId,
        count: sql<number>`count(*)::int`,
      })
      .from(scrapeResults)
      .groupBy(scrapeResults.keywordSetId),
    db
      .select({
        id: scrapeResults.id,
        keywordSetId: scrapeResults.keywordSetId,
        sourceUrl: scrapeResults.sourceUrl,
        title: scrapeResults.title,
        snippet: scrapeResults.snippet,
        matchedKeywords: scrapeResults.matchedKeywords,
        relevanceScore: scrapeResults.relevanceScore,
        processed: scrapeResults.processed,
        scrapedAt: scrapeResults.scrapedAt,
        setName: keywordSets.name,
      })
      .from(scrapeResults)
      .leftJoin(keywordSets, eq(scrapeResults.keywordSetId, keywordSets.id))
      .orderBy(desc(scrapeResults.scrapedAt))
      .limit(50),
    db
      .select()
      .from(documentAnalyses)
      .where(eq(documentAnalyses.source, "scrape"))
      .orderBy(desc(documentAnalyses.createdAt))
      .limit(5),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.keywordSetId, c.count]));

  const suggestions: SerializedSuggestion[] = suggestionRows.map((a) => ({
    id: a.id,
    status: a.status,
    summary: a.summary,
    proposals: a.proposals as SerializedSuggestion["proposals"],
    committedAt: a.committedAt ? a.committedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div className="animate-rise">
      <PageHeader
        title="Keyword Monitoring"
        subtitle="Keyword sets drive the automated scrape pipeline across SA news sources."
      />
      <KeywordsClient
        canRun={can(role, "create", "scrape")}
        canCreate={can(role, "create", "keyword_set")}
        canUpdate={can(role, "update", "keyword_set")}
        canDelete={can(role, "delete", "keyword_set")}
        canSuggest={can(role, "create", "risk")}
        canCommitSuggestions={can(role, "create", "risk")}
        latestSuggestion={suggestions[0] ?? null}
        sets={sets.map((s) => ({
          id: s.id,
          name: s.name,
          keywords: s.keywords,
          isActive: s.isActive,
          lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
          resultCount: countMap[s.id] ?? 0,
        }))}
        results={recent.map((r) => ({
          id: r.id,
          setName: r.setName ?? "-",
          sourceUrl: r.sourceUrl,
          title: r.title,
          snippet: r.snippet,
          matchedKeywords: r.matchedKeywords,
          relevanceScore: r.relevanceScore,
          processed: r.processed,
          scrapedAt: r.scrapedAt.toISOString(),
        }))}
      />
    </div>
  );
}
