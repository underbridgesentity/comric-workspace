import { NextResponse } from "next/server";
import { guard, jsonError } from "@/lib/api";
import { anthropic, AI_MODEL, sanitizeAiText } from "@/lib/anthropic";
import { logActivity } from "@/lib/activity";
import { createAlert } from "@/lib/alert-engine";
import { builderSchema } from "@/lib/report-config";
import { buildReportPrompt, defaultReportTitle, persistReport } from "@/lib/report-generate";

export const maxDuration = 120;

/**
 * Streaming report generation. The response body is plain text: the model's
 * markdown deltas as they arrive, followed by a single NUL-prefixed trailer
 * line the client splits on:
 *   "\n<NUL>REPORT_META:{...json...}"  on success (persisted report id/title)
 *   "\n<NUL>REPORT_ERROR:<message>"    on mid-stream failure
 * Persistence (ai_report row with builder payload + metric snapshot, activity
 * log, ai_complete alert) happens inside the stream pump before the trailer
 * is emitted, so the meta line always refers to a committed row.
 */
export async function POST(request: Request) {
  const g = await guard("create", "ai_report");
  if (g.error) return g.error;
  const userId = g.user.id;

  const parsed = builderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid report request.");
  const payload = parsed.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI reporting is unavailable: ANTHROPIC_API_KEY is not configured." },
      { status: 503 },
    );
  }

  let prompt;
  try {
    prompt = await buildReportPrompt(payload);
  } catch (err) {
    console.error("AI report assembly failed", err);
    return NextResponse.json(
      { error: "Report generation failed. Please try again shortly." },
      { status: 502 },
    );
  }
  const { system, user, snapshot } = prompt;

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = "";
      try {
        const stream = anthropic().messages.stream({
          model: AI_MODEL,
          max_tokens: 4000,
          system,
          messages: [{ role: "user", content: user }],
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            accumulated += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        await stream.finalMessage();

        const content = sanitizeAiText(accumulated);
        const report = await persistReport({
          payload,
          metricTables: snapshot.metricTables,
          content,
          userId,
          title: defaultReportTitle(snapshot.typeTitle),
        });

        await logActivity({
          actor: userId,
          action: "ai.report_generate",
          entityType: "ai_report",
          entityId: report.id,
          metadata: {
            reportType: payload.reportType,
            range: payload.range,
            metrics: snapshot.effective.metrics,
            sources: snapshot.effective.sources,
          },
        });
        await createAlert({
          type: "ai_complete",
          title: `${snapshot.typeTitle} generated`,
          body: `Your ${snapshot.typeTitle.toLowerCase()} is ready in Reports and the Archive.`,
          severity: "low",
          targetUser: userId,
          relatedEntityType: "ai_report",
          relatedEntityId: report.id,
        });

        controller.enqueue(
          encoder.encode(
            `\n\u0000REPORT_META:${JSON.stringify({ id: report.id, title: report.title })}`,
          ),
        );
      } catch (err) {
        console.error("AI report streaming failed", err);
        controller.enqueue(
          encoder.encode(
            "\n\u0000REPORT_ERROR:Report generation failed. Please try again shortly.",
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
