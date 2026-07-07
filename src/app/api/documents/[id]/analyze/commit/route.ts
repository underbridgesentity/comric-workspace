import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import {
  documentAnalyses,
  documents,
  researchEntries,
  risks,
  sectorIntelligence,
} from "@/lib/schema";
import type { StoredProposals } from "@/lib/document-analysis";
import { logActivity } from "@/lib/activity";
import { evaluateRiskEscalation } from "@/lib/alert-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  analysisId: z.uuid(),
  accept: z.object({
    risks: z.array(z.number().int().nonnegative()).default([]),
    intelligence: z.array(z.number().int().nonnegative()).default([]),
    research: z.array(z.number().int().nonnegative()).default([]),
    links: z.array(z.number().int().nonnegative()).default([]),
  }),
});

export async function POST(request: Request, context: RouteContext) {
  const g = await guard("create", "risk");
  if (g.error) return g.error;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonError("Document not found", 404);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return jsonError("Document not found", 404);

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
  if (!analysis || analysis.documentId !== doc.id) {
    return jsonError("Analysis not found for this document", 404);
  }
  if (analysis.status === "committed") {
    return jsonError("This analysis has already been committed.", 409);
  }
  if (analysis.status !== "completed") {
    return jsonError("Only a completed analysis can be committed.", 400);
  }

  const proposals = analysis.proposals as StoredProposals;
  const sourceUrl = `/documents/${doc.id}`;

  const created = {
    risks: [] as { id: string; title: string }[],
    intelligence: [] as { id: string; title: string }[],
    research: [] as { id: string; title: string }[],
    linkedRiskId: null as string | null,
  };

  // Accepted link suggestions (validated against existing risks).
  const acceptedLinks = accept.links
    .map((i) => proposals.linkSuggestions[i])
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
  let linkedRiskId: string | null = null;
  if (acceptedLinks.length > 0) {
    const [risk] = await db
      .select({ id: risks.id })
      .from(risks)
      .where(eq(risks.id, acceptedLinks[0].existingRiskId))
      .limit(1);
    linkedRiskId = risk?.id ?? null;
  }

  // Risks.
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
        source: "partner_report",
        sourceUrl,
        keywords: p.keywords,
        createdBy: g.user.id,
      })
      .returning({ id: risks.id, title: risks.title });
    created.risks.push(row);
    await logActivity({
      actor: g.user.id,
      action: "created risk from document analysis",
      entityType: "risk",
      entityId: row.id,
      metadata: { documentId: doc.id, analysisId, title: row.title },
    });
    await evaluateRiskEscalation({
      id: row.id,
      title: p.title,
      severity: p.severity,
      category: p.category,
    });
  }

  // Sector intelligence.
  for (const idx of accept.intelligence) {
    const p = proposals.intelligence[idx];
    if (!p) continue;
    const occurredAt = p.occurredAt ? new Date(p.occurredAt) : null;
    const [row] = await db
      .insert(sectorIntelligence)
      .values({
        title: p.title,
        summary: p.summary,
        incidentType: p.incidentType,
        location: p.location ?? null,
        source: doc.name,
        sourceUrl,
        occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
        linkedRiskId,
        createdBy: g.user.id,
      })
      .returning({ id: sectorIntelligence.id, title: sectorIntelligence.title });
    created.intelligence.push(row);
    await logActivity({
      actor: g.user.id,
      action: "created intelligence from document analysis",
      entityType: "intelligence",
      entityId: row.id,
      metadata: { documentId: doc.id, analysisId, title: row.title },
    });
  }

  // Research entries.
  for (const idx of accept.research) {
    const p = proposals.research[idx];
    if (!p) continue;
    const [row] = await db
      .insert(researchEntries)
      .values({
        title: p.title,
        content: p.content,
        keywords: p.keywords,
        sourceType: "manual",
        rawData: { documentId: doc.id, analysisId },
        createdBy: g.user.id,
      })
      .returning({ id: researchEntries.id, title: researchEntries.title });
    created.research.push(row);
    await logActivity({
      actor: g.user.id,
      action: "created research from document analysis",
      entityType: "research",
      entityId: row.id,
      metadata: { documentId: doc.id, analysisId, title: row.title },
    });
  }

  // Link the document itself to the first accepted linked risk.
  if (linkedRiskId) {
    await db
      .update(documents)
      .set({ linkedRiskId })
      .where(eq(documents.id, doc.id));
    created.linkedRiskId = linkedRiskId;
  }

  const [updated] = await db
    .update(documentAnalyses)
    .set({ status: "committed", committedAt: new Date() })
    .where(eq(documentAnalyses.id, analysis.id))
    .returning();

  await logActivity({
    actor: g.user.id,
    action: "document.commit_analysis",
    entityType: "document",
    entityId: doc.id,
    metadata: {
      analysisId,
      created: {
        risks: created.risks.length,
        intelligence: created.intelligence.length,
        research: created.research.length,
        linkedRiskId: created.linkedRiskId,
      },
    },
  });

  return NextResponse.json({ analysis: updated, created }, { status: 201 });
}
