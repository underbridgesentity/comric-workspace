import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { guard } from "@/lib/api";
import { db } from "@/lib/db";
import { aiReports, researchEntries, scrapeResults } from "@/lib/schema";
import { anthropic, AI_MODEL, COMRIC_CONTEXT, textFromMessage } from "@/lib/anthropic";
import { logActivity } from "@/lib/activity";
import { createAlert } from "@/lib/alert-engine";

export const maxDuration = 120;

/**
 * AI research analysis: digest recent research entries + unprocessed scrape
 * results into a structured findings report; backfill ai_summary on
 * analysed entries; mark scrape results processed.
 */
export async function POST() {
  const g = await guard("create", "ai_report");
  if (g.error) return g.error;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI analysis is unavailable: ANTHROPIC_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const [entries, scraped] = await Promise.all([
    db.select().from(researchEntries).orderBy(desc(researchEntries.createdAt)).limit(30),
    db
      .select()
      .from(scrapeResults)
      .where(eq(scrapeResults.processed, false))
      .orderBy(desc(scrapeResults.relevanceScore))
      .limit(40),
  ]);

  if (entries.length === 0 && scraped.length === 0) {
    return NextResponse.json(
      { error: "No research entries or unprocessed scrape results to analyse." },
      { status: 400 },
    );
  }

  const entriesBlock = entries
    .map(
      (e, i) =>
        `[E${i + 1}] ${e.title} (source: ${e.sourceType}; keywords: ${e.keywords.join(", ") || "none"})\n${e.content.slice(0, 1200)}`,
    )
    .join("\n\n");
  const scrapedBlock = scraped
    .map(
      (s, i) =>
        `[S${i + 1}] ${s.title} (relevance ${s.relevanceScore ?? "?"}; matched: ${s.matchedKeywords.join(", ")})\n${(s.snippet ?? "").slice(0, 500)}`,
    )
    .join("\n\n");

  try {
    const message = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 3000,
      system: COMRIC_CONTEXT,
      messages: [
        {
          role: "user",
          content: `Analyse the research entries and freshly scraped news below for the COMRiC risk desk.

Produce a markdown research digest with these sections:
# Research Digest — ${new Date().toISOString().slice(0, 10)}
## Executive Summary (3-5 bullets)
## Key Insights
## Emerging Trends
## Anomalies & Watch Items
## Structured Findings (bullet list: finding — evidence reference [E#/S#] — suggested action)

RESEARCH ENTRIES:
${entriesBlock || "(none)"}

SCRAPED NEWS (unprocessed):
${scrapedBlock || "(none)"}`,
        },
      ],
    });
    const content = textFromMessage(message);

    const [report] = await db
      .insert(aiReports)
      .values({
        title: `Research Digest — ${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`,
        reportType: "research_digest",
        content,
        parameters: { entries: entries.length, scrapeResults: scraped.length },
        generatedBy: g.user.id,
      })
      .returning();

    // Backfill a short ai_summary on analysed entries that lack one.
    const missing = entries.filter((e) => !e.aiSummary);
    if (missing.length > 0) {
      const summariesMsg = await anthropic().messages.create({
        model: AI_MODEL,
        max_tokens: 1500,
        system: COMRIC_CONTEXT,
        messages: [
          {
            role: "user",
            content: `For each entry below, write ONE concise risk-relevant summary sentence. Respond with exactly one line per entry in the format "E<number>: <summary>" and nothing else.\n\n${missing
              .map((e, i) => `E${i + 1}: ${e.title}\n${e.content.slice(0, 800)}`)
              .join("\n\n")}`,
          },
        ],
      });
      const lines = textFromMessage(summariesMsg).split("\n");
      for (const line of lines) {
        const m = line.match(/^E(\d+):\s*(.+)$/);
        if (!m) continue;
        const entry = missing[Number(m[1]) - 1];
        if (entry) {
          await db
            .update(researchEntries)
            .set({ aiSummary: m[2].trim() })
            .where(eq(researchEntries.id, entry.id));
        }
      }
    }

    if (scraped.length > 0) {
      await db
        .update(scrapeResults)
        .set({ processed: true })
        .where(inArray(scrapeResults.id, scraped.map((s) => s.id)));
    }

    await logActivity({
      actor: g.user.id,
      action: "ai.research_analysis",
      entityType: "ai_report",
      entityId: report.id,
      metadata: { entries: entries.length, scrapeResults: scraped.length },
    });
    await createAlert({
      type: "ai_complete",
      title: "AI research analysis complete",
      body: `A new research digest covering ${entries.length} entries and ${scraped.length} scraped items is ready.`,
      severity: "low",
      targetUser: g.user.id,
      relatedEntityType: "ai_report",
      relatedEntityId: report.id,
    });

    return NextResponse.json({ id: report.id, title: report.title, content });
  } catch (err) {
    console.error("AI research analysis failed", err);
    return NextResponse.json(
      { error: "The AI analysis failed. Please try again shortly." },
      { status: 502 },
    );
  }
}
