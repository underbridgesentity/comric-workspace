import { NextResponse } from "next/server";
import { desc, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import {
  aiReports,
  researchEntries,
  risks,
  scrapeResults,
  sectorIntelligence,
} from "@/lib/schema";
import { anthropic, AI_MODEL, COMRIC_CONTEXT, textFromMessage } from "@/lib/anthropic";
import { logActivity } from "@/lib/activity";
import { createAlert } from "@/lib/alert-engine";

export const maxDuration = 120;

const requestSchema = z.object({
  reportType: z.enum(["risk_summary", "sector_report", "research_digest"]),
  focus: z.string().trim().max(2000).optional(),
  range: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
});

const RANGE_DAYS: Record<string, number | null> = { "7d": 7, "30d": 30, "90d": 90, all: null };

const TYPE_TITLES: Record<string, string> = {
  risk_summary: "Risk Summary",
  sector_report: "Sector Report",
  research_digest: "Research Digest",
};

/** Generate a full AI report from platform data and persist it. */
export async function POST(request: Request) {
  const g = await guard("create", "ai_report");
  if (g.error) return g.error;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid report request.");

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI reporting is unavailable: ANTHROPIC_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const days = RANGE_DAYS[parsed.data.range];
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

  const [riskRows, intelRows, researchRows, scrapeStats] = await Promise.all([
    db
      .select()
      .from(risks)
      .where(since ? gte(risks.createdAt, since) : undefined)
      .orderBy(desc(risks.createdAt))
      .limit(50),
    db
      .select()
      .from(sectorIntelligence)
      .where(since ? gte(sectorIntelligence.createdAt, since) : undefined)
      .orderBy(desc(sectorIntelligence.createdAt))
      .limit(25),
    db
      .select()
      .from(researchEntries)
      .where(since ? gte(researchEntries.createdAt, since) : undefined)
      .orderBy(desc(researchEntries.createdAt))
      .limit(25),
    db
      .select({
        total: sql<number>`count(*)::int`,
        unprocessed: sql<number>`count(*) filter (where ${scrapeResults.processed} = false)::int`,
      })
      .from(scrapeResults)
      .where(since ? gte(scrapeResults.scrapedAt, since) : undefined),
  ]);

  const sevCounts: Record<string, number> = {};
  const catCounts: Record<string, number> = {};
  for (const r of riskRows) {
    sevCounts[r.severity] = (sevCounts[r.severity] ?? 0) + 1;
    catCounts[r.category] = (catCounts[r.category] ?? 0) + 1;
  }

  const dataBlock = `RISK SUMMARY STATS (${parsed.data.range}): total=${riskRows.length}; by severity: ${JSON.stringify(sevCounts)}; by category: ${JSON.stringify(catCounts)}

TOP RISKS:
${riskRows
  .slice(0, 20)
  .map((r) => `- [${r.severity.toUpperCase()}/${r.category}/${r.status}] ${r.title}: ${r.description.slice(0, 200)}`)
  .join("\n") || "(none)"}

SECTOR INTELLIGENCE:
${intelRows
  .map((i) => `- (${i.incidentType}${i.location ? `, ${i.location}` : ""}) ${i.title}: ${i.summary.slice(0, 200)}`)
  .join("\n") || "(none)"}

RESEARCH ENTRIES:
${researchRows
  .map((e) => `- [${e.sourceType}] ${e.title}: ${(e.aiSummary ?? e.content).slice(0, 200)}`)
  .join("\n") || "(none)"}

SCRAPE PIPELINE: ${scrapeStats[0]?.total ?? 0} results captured in range, ${scrapeStats[0]?.unprocessed ?? 0} awaiting analysis.`;

  const typeTitle = TYPE_TITLES[parsed.data.reportType];

  try {
    const message = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      system: COMRIC_CONTEXT,
      messages: [
        {
          role: "user",
          content: `Generate a formal COMRiC ${typeTitle} covering the last ${parsed.data.range === "all" ? "full history" : parsed.data.range}.
${parsed.data.focus ? `Special focus / instructions from the requester: ${parsed.data.focus}` : ""}

Structure it as a professional markdown document: a # title, ## Executive Summary, then sections appropriate to a ${typeTitle} (threat landscape, category analysis, notable incidents, trends, recommendations). Ground every claim in the data below.

${dataBlock}`,
        },
      ],
    });
    const content = textFromMessage(message);

    const [report] = await db
      .insert(aiReports)
      .values({
        title: `${typeTitle} — ${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`,
        reportType: parsed.data.reportType,
        content,
        parameters: { range: parsed.data.range, focus: parsed.data.focus ?? null },
        generatedBy: g.user.id,
      })
      .returning();

    await logActivity({
      actor: g.user.id,
      action: "ai.report_generate",
      entityType: "ai_report",
      entityId: report.id,
      metadata: { reportType: parsed.data.reportType, range: parsed.data.range },
    });
    await createAlert({
      type: "ai_complete",
      title: `${typeTitle} generated`,
      body: `Your ${typeTitle.toLowerCase()} is ready in Reports and the Archive.`,
      severity: "low",
      targetUser: g.user.id,
      relatedEntityType: "ai_report",
      relatedEntityId: report.id,
    });

    return NextResponse.json({ id: report.id, title: report.title, content });
  } catch (err) {
    console.error("AI report generation failed", err);
    return NextResponse.json(
      { error: "Report generation failed. Please try again shortly." },
      { status: 502 },
    );
  }
}
