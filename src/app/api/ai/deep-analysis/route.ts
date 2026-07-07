import { NextResponse } from "next/server";
import { arrayOverlaps, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import {
  aiReports,
  documents,
  riskNotes,
  risks,
  scrapeResults,
  sectorIntelligence,
} from "@/lib/schema";
import { anthropic, AI_MODEL, COMRIC_CONTEXT, textFromMessage } from "@/lib/anthropic";
import { createAlert } from "@/lib/alert-engine";
import { logActivity } from "@/lib/activity";

const bodySchema = z.object({ riskId: z.uuid() });

export async function POST(request: Request) {
  const g = await guard("create", "ai_report");
  if (g.error) return g.error;

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError("AI is not configured", 503);
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonError("riskId (uuid) is required");

  const [risk] = await db.select().from(risks).where(eq(risks.id, parsed.data.riskId)).limit(1);
  if (!risk) return jsonError("Risk not found", 404);

  const [notes, intel, docs] = await Promise.all([
    db
      .select()
      .from(riskNotes)
      .where(eq(riskNotes.riskId, risk.id))
      .orderBy(desc(riskNotes.createdAt))
      .limit(20),
    db
      .select()
      .from(sectorIntelligence)
      .where(eq(sectorIntelligence.linkedRiskId, risk.id))
      .orderBy(desc(sectorIntelligence.createdAt))
      .limit(20),
    db
      .select({
        name: documents.name,
        description: documents.description,
        category: documents.category,
        fileType: documents.fileType,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.linkedRiskId, risk.id))
      .limit(20),
  ]);

  const scrapes =
    risk.keywords.length > 0
      ? await db
          .select({
            title: scrapeResults.title,
            snippet: scrapeResults.snippet,
            sourceUrl: scrapeResults.sourceUrl,
            matchedKeywords: scrapeResults.matchedKeywords,
            scrapedAt: scrapeResults.scrapedAt,
          })
          .from(scrapeResults)
          .where(arrayOverlaps(scrapeResults.matchedKeywords, risk.keywords))
          .orderBy(desc(scrapeResults.scrapedAt))
          .limit(15)
      : [];

  const context = [
    `# RISK RECORD`,
    `Title: ${risk.title}`,
    `Category: ${risk.category} | Severity: ${risk.severity} | Status: ${risk.status}`,
    `Source: ${risk.source}${risk.sourceUrl ? ` (${risk.sourceUrl})` : ""}`,
    `Keywords: ${risk.keywords.join(", ") || "none"}`,
    `Description: ${risk.description}`,
    ``,
    `# ANALYST NOTES (${notes.length})`,
    ...notes.map((n) => `- [${n.createdAt.toISOString()}] ${n.body}`),
    ``,
    `# LINKED SECTOR INTELLIGENCE (${intel.length})`,
    ...intel.map(
      (i) =>
        `- ${i.title} (${i.incidentType}${i.location ? `, ${i.location}` : ""}${i.occurredAt ? `, ${i.occurredAt.toISOString().slice(0, 10)}` : ""}): ${i.summary}`,
    ),
    ``,
    `# RECENT MONITORING HITS MATCHING KEYWORDS (${scrapes.length})`,
    ...scrapes.map(
      (s) =>
        `- ${s.title} [${s.matchedKeywords.join(", ")}] ${s.snippet ?? ""} (${s.sourceUrl})`,
    ),
    ``,
    `# LINKED DOCUMENTS (${docs.length})`,
    ...docs.map(
      (d) => `- ${d.name} (${d.fileType}, ${d.category})${d.description ? `: ${d.description}` : ""}`,
    ),
  ].join("\n");

  try {
    const message = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      system: `${COMRIC_CONTEXT}\n\nYou are producing a DEEP ANALYSIS of one specific risk. Using only the provided data, produce a markdown report with these sections: "## Patterns" (patterns across notes, intelligence and monitoring hits), "## Escalation Outlook" (likely escalation paths and indicators to watch), and "## Recommended Responses" (concrete, prioritised actions for COMRiC and member operators). Be concise and specific.`,
      messages: [{ role: "user", content: context }],
    });
    const content = textFromMessage(message);
    if (!content.trim()) throw new Error("Empty AI response");

    const [report] = await db
      .insert(aiReports)
      .values({
        title: `Deep analysis: ${risk.title}`,
        reportType: "deep_analysis",
        content,
        parameters: { riskId: risk.id, noteCount: notes.length, intelCount: intel.length },
        relatedRiskId: risk.id,
        generatedBy: g.user.id,
      })
      .returning();

    await createAlert({
      type: "ai_complete",
      title: "Deep analysis ready",
      body: `AI deep analysis for "${risk.title}" has completed.`,
      severity: "low",
      targetUser: g.user.id,
      relatedEntityType: "ai_report",
      relatedEntityId: report.id,
    });

    await logActivity({
      actor: g.user.id,
      action: "generated deep analysis",
      entityType: "ai_report",
      entityId: report.id,
      metadata: { riskId: risk.id, riskTitle: risk.title },
    });

    return NextResponse.json({ report });
  } catch (err) {
    console.error("deep analysis failed", err);
    return jsonError("The AI analysis service failed to respond. Please try again shortly.", 502);
  }
}
