import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { runScrape } from "@/lib/scraper";

export const maxDuration = 120;

/** Manual scrape trigger from the Keywords page. */
export async function POST(request: Request) {
  const g = await guard("create", "scrape");
  if (g.error) return g.error;

  const body = (await request.json().catch(() => null)) as { keywordSetId?: string } | null;
  const setIds = body?.keywordSetId ? [body.keywordSetId] : undefined;

  try {
    const summary = await runScrape(setIds);
    await logActivity({
      actor: g.user.id,
      action: "scrape.run",
      entityType: "scrape",
      entityId: body?.keywordSetId ?? null,
      metadata: { totalInserted: summary.totalInserted, sets: summary.sets.length },
    });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("manual scrape failed", err);
    return NextResponse.json({ error: "Scrape run failed" }, { status: 500 });
  }
}
