import { NextResponse } from "next/server";
import { and, eq, lt, or, isNull } from "drizzle-orm";
import { runScrape } from "@/lib/scraper";
import { db } from "@/lib/db";
import { scrapeResults } from "@/lib/schema";

export const maxDuration = 120;

const RETENTION_DAYS = 90;
const LOW_RELEVANCE = 0.4;

/**
 * Retention: prune stale low-value scrape results so the table stays fast.
 * Only unprocessed items below the relevance floor (or unscored) older than
 * the retention window are removed; anything promoted/processed is kept.
 */
async function pruneScrapeResults(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const deleted = await db
    .delete(scrapeResults)
    .where(
      and(
        eq(scrapeResults.processed, false),
        lt(scrapeResults.scrapedAt, cutoff),
        or(
          isNull(scrapeResults.relevanceScore),
          lt(scrapeResults.relevanceScore, LOW_RELEVANCE),
        ),
      ),
    )
    .returning({ id: scrapeResults.id });
  return deleted.length;
}

/**
 * Vercel cron entrypoint. Authorised solely via the CRON_SECRET bearer
 * header that Vercel attaches to scheduled invocations.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runScrape();
    const pruned = await pruneScrapeResults().catch((err) => {
      console.error("scrape prune failed", err);
      return 0;
    });
    return NextResponse.json({ ...summary, pruned });
  } catch (err) {
    console.error("cron scrape failed", err);
    return NextResponse.json({ error: "Scrape run failed" }, { status: 500 });
  }
}
