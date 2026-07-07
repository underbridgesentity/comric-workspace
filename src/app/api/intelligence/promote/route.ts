import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { scrapeResults, sectorIntelligence } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

const bodySchema = z.object({ scrapeResultId: z.uuid() });

export async function POST(request: Request) {
  const g = await guard("create", "intelligence");
  if (g.error) return g.error;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonError("scrapeResultId (uuid) is required");

  const [scrape] = await db
    .select()
    .from(scrapeResults)
    .where(eq(scrapeResults.id, parsed.data.scrapeResultId))
    .limit(1);
  if (!scrape) return jsonError("Scrape result not found", 404);
  if (scrape.processed) return jsonError("This monitoring result was already processed");

  const [intel] = await db
    .insert(sectorIntelligence)
    .values({
      title: scrape.title,
      summary: scrape.snippet ?? scrape.content ?? scrape.title,
      incidentType: scrape.matchedKeywords[0] ?? "monitoring",
      source: "Web monitoring",
      sourceUrl: scrape.sourceUrl,
      occurredAt: scrape.scrapedAt,
      createdBy: g.user.id,
    })
    .returning();

  await db
    .update(scrapeResults)
    .set({ processed: true })
    .where(eq(scrapeResults.id, scrape.id));

  await logActivity({
    actor: g.user.id,
    action: "promoted scrape result to intelligence",
    entityType: "intelligence",
    entityId: intel.id,
    metadata: { scrapeResultId: scrape.id, title: intel.title },
  });

  return NextResponse.json({ intelligence: intel }, { status: 201 });
}
