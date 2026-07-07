import { db } from "./db";
import { aiReports } from "./schema";
import { anthropic, AI_MODEL, COMRIC_CONTEXT, textFromMessage } from "./anthropic";
import {
  RANGE_LABELS,
  type BuilderPayload,
  type MetricTable,
  type ReportParameters,
} from "./report-config";
import {
  assembleMetricTables,
  assembleSourceBlocks,
  metricTableToMarkdown,
} from "./report-data";

/**
 * Shared report-assembly pipeline used by both the streaming builder route
 * and the weekly scheduled-report cron: gather the selected metrics and
 * source blocks, build the grounded prompt, and (for sync callers) run the
 * model and persist the ai_report row with its parameters snapshot.
 */

export const TYPE_TITLES: Record<BuilderPayload["reportType"], string> = {
  risk_summary: "Risk Summary",
  sector_report: "Sector Report",
  research_digest: "Research Digest",
};

export type ReportPromptBundle = {
  system: string;
  user: string;
  snapshot: {
    typeTitle: string;
    effective: BuilderPayload;
    metricTables: MetricTable[];
  };
};

/** Assemble metrics/sources per the builder payload and build the model prompt. */
export async function buildReportPrompt(payload: BuilderPayload): Promise<ReportPromptBundle> {
  // Assemble only what the builder selected. Defaults keep the prompt
  // grounded even when the user unticks everything.
  const effective: BuilderPayload = {
    ...payload,
    metrics:
      payload.metrics.length > 0
        ? payload.metrics
        : (["severity_distribution", "category_breakdown", "response_status"] as typeof payload.metrics),
    sources:
      payload.sources.length > 0
        ? payload.sources
        : (["risk_register"] as typeof payload.sources),
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

  const user = `Generate a formal COMRiC ${typeTitle}.

SCOPE: ${scopeBits.join(" · ")}
${payload.instructions ? `\nANALYST'S BRIEF - the report must explicitly answer this:\n${payload.instructions}\n` : ""}
COMPUTED METRICS (already calculated from live platform data - reproduce the relevant tables in the report and interpret them):

${metricTables.map(metricTableToMarkdown).join("\n\n")}

DATA SOURCES IN SCOPE:

${sourceBlocks.map((b) => `## ${b.title}\n${b.body}`).join("\n\n")}

Structure the output as a professional markdown document: a # title, ## Executive Summary, then sections interpreting each selected metric, notable incidents, trends and prioritised recommendations appropriate to a ${typeTitle}.${payload.instructions ? " Include a dedicated section that directly addresses the analyst's brief above." : ""} Ground every claim in the data provided; where a table is empty, say so plainly rather than inventing figures.`;

  return {
    system: COMRIC_CONTEXT,
    user,
    snapshot: { typeTitle, effective, metricTables },
  };
}

export function defaultReportTitle(typeTitle: string): string {
  return `${typeTitle} - ${new Date().toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

/** Persist a completed report with the full builder payload + metric snapshot. */
export async function persistReport(params: {
  payload: BuilderPayload;
  metricTables: MetricTable[];
  content: string;
  userId: string;
  title: string;
}): Promise<{ id: string; title: string }> {
  const parameters: ReportParameters = {
    builder: params.payload,
    metrics: params.metricTables,
  };
  const [report] = await db
    .insert(aiReports)
    .values({
      title: params.title,
      reportType: params.payload.reportType,
      content: params.content,
      parameters,
      generatedBy: params.userId,
    })
    .returning({ id: aiReports.id, title: aiReports.title });
  return report;
}

/**
 * Non-streaming generation used by the weekly cron: build the prompt, run the
 * model, sanitize (textFromMessage applies house style) and persist.
 */
export async function generateReportSync(
  payload: BuilderPayload,
  userId: string,
  options?: { title?: string },
): Promise<{ id: string; title: string; content: string }> {
  const { system, user, snapshot } = await buildReportPrompt(payload);

  const message = await anthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
  });
  const content = textFromMessage(message);

  const report = await persistReport({
    payload,
    metricTables: snapshot.metricTables,
    content,
    userId,
    title: options?.title ?? defaultReportTitle(snapshot.typeTitle),
  });
  return { ...report, content };
}
