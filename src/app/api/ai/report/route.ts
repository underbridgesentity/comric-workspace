import { NextResponse } from "next/server";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { aiReports } from "@/lib/schema";
import { anthropic, AI_MODEL, COMRIC_CONTEXT, textFromMessage } from "@/lib/anthropic";
import { logActivity } from "@/lib/activity";
import { createAlert } from "@/lib/alert-engine";
import { builderSchema, RANGE_LABELS, type ReportParameters } from "@/lib/report-config";
import {
  assembleMetricTables,
  assembleSourceBlocks,
  metricTableToMarkdown,
} from "@/lib/report-data";

export const maxDuration = 120;

const TYPE_TITLES: Record<string, string> = {
  risk_summary: "Risk Summary",
  sector_report: "Sector Report",
  research_digest: "Research Digest",
};

/**
 * Generate a configurable AI report from the report-builder payload:
 * assemble only the selected metrics and data sources, brief Claude with the
 * computed tables and the analyst's instructions, and persist the result
 * together with the full builder state + data snapshot for exports.
 */
export async function POST(request: Request) {
  const g = await guard("create", "ai_report");
  if (g.error) return g.error;

  const parsed = builderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid report request.");
  const payload = parsed.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI reporting is unavailable: ANTHROPIC_API_KEY is not configured." },
      { status: 503 },
    );
  }

  // Assemble only what the builder selected. Defaults keep the prompt
  // grounded even when the user unticks everything.
  const effective = {
    ...payload,
    metrics: payload.metrics.length > 0 ? payload.metrics : (["severity_distribution", "category_breakdown", "response_status"] as typeof payload.metrics),
    sources: payload.sources.length > 0 ? payload.sources : (["risk_register"] as typeof payload.sources),
  };

  const [metricTables, sourceBlocks] = await Promise.all([
    assembleMetricTables(effective),
    assembleSourceBlocks(effective),
  ]);

  const typeTitle = TYPE_TITLES[payload.reportType] ?? "Report";
  const scopeBits = [
    RANGE_LABELS[payload.range],
    payload.category ? `category: ${payload.category}` : null,
    payload.severityFloor ? `severity ${payload.severityFloor} and above` : null,
  ].filter(Boolean);

  const prompt = `Generate a formal COMRiC ${typeTitle}.

SCOPE: ${scopeBits.join(" · ")}
${payload.instructions ? `\nANALYST'S BRIEF - the report must explicitly answer this:\n${payload.instructions}\n` : ""}
COMPUTED METRICS (already calculated from live platform data - reproduce the relevant tables in the report and interpret them):

${metricTables.map(metricTableToMarkdown).join("\n\n")}

DATA SOURCES IN SCOPE:

${sourceBlocks.map((b) => `## ${b.title}\n${b.body}`).join("\n\n")}

Structure the output as a professional markdown document: a # title, ## Executive Summary, then sections interpreting each selected metric, notable incidents, trends and prioritised recommendations appropriate to a ${typeTitle}.${payload.instructions ? " Include a dedicated section that directly addresses the analyst's brief above." : ""} Ground every claim in the data provided; where a table is empty, say so plainly rather than inventing figures.`;

  try {
    const message = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      system: COMRIC_CONTEXT,
      messages: [{ role: "user", content: prompt }],
    });
    const content = textFromMessage(message);

    const parameters: ReportParameters = { builder: payload, metrics: metricTables };

    const [report] = await db
      .insert(aiReports)
      .values({
        title: `${typeTitle} - ${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`,
        reportType: payload.reportType,
        content,
        parameters,
        generatedBy: g.user.id,
      })
      .returning();

    await logActivity({
      actor: g.user.id,
      action: "ai.report_generate",
      entityType: "ai_report",
      entityId: report.id,
      metadata: {
        reportType: payload.reportType,
        range: payload.range,
        metrics: effective.metrics,
        sources: effective.sources,
      },
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
