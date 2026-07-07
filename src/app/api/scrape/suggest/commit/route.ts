import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { documentAnalyses, riskNotes, risks } from "@/lib/schema";
import type { ScrapeSuggestionProposals } from "@/lib/scrape-suggestions";
import { logActivity } from "@/lib/activity";
import { evaluateRiskEscalation } from "@/lib/alert-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  analysisId: z.uuid(),
  accept: z.object({
    risks: z.array(z.number().int().nonnegative()).default([]),
    links: z.array(z.number().int().nonnegative()).default([]),
  }),
});

export async function POST(request: Request) {
  const g = await guard("create", "risk");
  if (g.error) return g.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const { analysisId, accept } = parsed.data;

  const [analysis] = await db
    .select()
    .from(documentAnalyses)
    .where(eq(documentAnalyses.id, analysisId))
    .limit(1);
  if (!analysis || analysis.source !== "scrape") {
    return jsonError("Suggestion set not found", 404);
  }
  if (analysis.status === "committed") {
    return jsonError("This suggestion set has already been committed.", 409);
  }
  if (analysis.status !== "completed") {
    return jsonError("Only a completed suggestion set can be committed.", 400);
  }

  const proposals = analysis.proposals as ScrapeSuggestionProposals;

  const created = {
    risks: [] as { id: string; title: string }[],
    linkedRisks: [] as { id: string; title: string }[],
  };

  // Accepted new risks.
  for (const idx of accept.risks) {
    const p = proposals.risks[idx];
    if (!p) continue;
    const [row] = await db
      .insert(risks)
      .values({
        title: p.title,
        description: p.description,
        category: p.category,
        severity: p.severity,
        source: "web_scrape",
        sourceUrl: p.supportingArticles[0] ?? null,
        keywords: p.keywords,
        createdBy: g.user.id,
      })
      .returning({ id: risks.id, title: risks.title });
    created.risks.push(row);
    await logActivity({
      actor: g.user.id,
      action: "created risk from scrape suggestions",
      entityType: "risk",
      entityId: row.id,
      metadata: { analysisId, title: row.title },
    });
    await evaluateRiskEscalation({
      id: row.id,
      title: p.title,
      severity: p.severity,
      category: p.category,
    });
  }

  // Accepted link suggestions: append a monitoring note to the existing risk.
  for (const idx of accept.links) {
    const l = proposals.linkSuggestions[idx];
    if (!l) continue;
    const [risk] = await db
      .select({ id: risks.id, title: risks.title })
      .from(risks)
      .where(eq(risks.id, l.existingRiskId))
      .limit(1);
    if (!risk) continue;
    await db.insert(riskNotes).values({
      riskId: risk.id,
      body: `Monitoring update from scraped news: ${l.reason}`,
      createdBy: g.user.id,
    });
    created.linkedRisks.push(risk);
    await logActivity({
      actor: g.user.id,
      action: "added scrape monitoring note to risk",
      entityType: "risk",
      entityId: risk.id,
      metadata: { analysisId, reason: l.reason },
    });
  }

  const [updated] = await db
    .update(documentAnalyses)
    .set({ status: "committed", committedAt: new Date() })
    .where(eq(documentAnalyses.id, analysis.id))
    .returning();

  await logActivity({
    actor: g.user.id,
    action: "scrape.commit_suggestions",
    entityType: "scrape",
    entityId: analysis.id,
    metadata: {
      analysisId,
      created: { risks: created.risks.length, links: created.linkedRisks.length },
    },
  });

  return NextResponse.json({ analysis: updated, created }, { status: 201 });
}
