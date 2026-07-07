import { get } from "@vercel/blob";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentAnalyses, documents, risks, type DocumentAnalysis } from "@/lib/schema";
import { anthropic, AI_MODEL, COMRIC_CONTEXT, textFromMessage } from "@/lib/anthropic";
import { extractText, ExtractionError } from "@/lib/extract";
import {
  extractJson,
  salvageProposals,
  type StoredProposals,
} from "@/lib/document-analysis";
import { logActivity } from "@/lib/activity";
import { createAlert } from "@/lib/alert-engine";

const RESPONSE_SCHEMA = `{
  "summary": "3-6 sentence executive summary of the document",
  "keyFindings": ["short, factual finding strings"],
  "proposals": {
    "risks": [{
      "title": "string", "description": "string",
      "category": "infrastructure|cyber|crime|regulatory|operational|other",
      "severity": "critical|high|medium|low",
      "keywords": ["string"]
    }],
    "intelligence": [{
      "title": "string", "summary": "string", "incidentType": "string",
      "location": "string or null",
      "occurredAt": "ISO date string or null"
    }],
    "research": [{ "title": "string", "content": "string", "keywords": ["string"] }],
    "linkSuggestions": [{ "existingRiskId": "uuid from the provided risk register", "reason": "string" }]
  }
}`;

export type AnalyzeDocumentResult =
  | { analysisId: string; analysis: DocumentAnalysis; error?: never }
  | { analysisId?: never; analysis?: never; error: string; statusCode: number };

/**
 * Full document analysis pipeline: fetch the private blob, extract text,
 * ask Claude for structured proposals against the live risk register
 * (retry once on invalid JSON, salvage partial output), persist the
 * documentAnalyses row, log activity and alert the actor.
 *
 * Used by the manual analyze API route and by the upload route as a
 * background task (waitUntil) for auto-analysis.
 */
export async function analyzeDocument(
  documentId: string,
  actorId: string,
): Promise<AnalyzeDocumentResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      error: "Document analysis is unavailable: ANTHROPIC_API_KEY is not configured.",
      statusCode: 503,
    };
  }

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) return { error: "Document not found", statusCode: 404 };

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return { error: "Blob storage not configured", statusCode: 503 };

  // Fetch and buffer the private blob.
  let buffer: Buffer;
  try {
    const result = await get(doc.blobPathname, { access: "private", token });
    if (!result?.stream) {
      return { error: "Stored file could not be retrieved", statusCode: 502 };
    }
    buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  } catch (err) {
    console.error("blob fetch failed", err);
    return { error: "Failed to reach blob storage", statusCode: 502 };
  }

  // Extract text.
  let extracted: { text: string; truncated: boolean };
  try {
    extracted = await extractText(buffer, doc.fileType);
  } catch (err) {
    const message =
      err instanceof ExtractionError
        ? err.message
        : "Text extraction failed for this document.";
    return { error: message, statusCode: 422 };
  }

  // Current open risk register so the model can propose links.
  const openRisks = await db
    .select({
      id: risks.id,
      title: risks.title,
      category: risks.category,
      severity: risks.severity,
    })
    .from(risks)
    .where(inArray(risks.status, ["open", "monitoring", "mitigating"]))
    .orderBy(desc(risks.createdAt))
    .limit(100);

  const riskRegister =
    openRisks.length > 0
      ? openRisks
          .map((r) => `- id: ${r.id} | ${r.title} (${r.category}, ${r.severity})`)
          .join("\n")
      : "(no open risks on the register)";

  const system = `${COMRIC_CONTEXT}

You are interpreting a third-party / privately-shared document uploaded to the COMRiC document hub (e.g. an incident report from an industry peer). Extract structured, actionable records for the platform. Be conservative: only propose records that the document clearly supports; never invent incidents. Propose linkSuggestions ONLY where the document clearly relates to a risk on the provided register, using its exact id.

You MUST respond with ONLY a single JSON object matching this schema - no prose, no markdown fences:
${RESPONSE_SCHEMA}`;

  const userContent = `Document name: ${doc.name}
Document category: ${doc.category}
${doc.description ? `Uploader description: ${doc.description}\n` : ""}${extracted.truncated ? "NOTE: the document text was truncated at 60,000 characters.\n" : ""}
Current open/monitoring/mitigating risk register:
${riskRegister}

--- DOCUMENT TEXT START ---
${extracted.text}
--- DOCUMENT TEXT END ---`;

  const client = anthropic();
  let rawText = "";
  let parsed: ReturnType<typeof salvageProposals> = null;

  try {
    const first = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: userContent }],
    });
    rawText = textFromMessage(first);
    parsed = salvageProposals(extractJson(rawText));

    if (!parsed) {
      // One retry, showing the model its own invalid output.
      const retry = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 8000,
        system,
        messages: [
          { role: "user", content: userContent },
          { role: "assistant", content: rawText || "(empty)" },
          {
            role: "user",
            content:
              "That response was not valid JSON matching the required schema. Respond again with ONLY the JSON object - no markdown fences, no commentary.",
          },
        ],
      });
      rawText = textFromMessage(retry);
      parsed = salvageProposals(extractJson(rawText));
    }
  } catch (err) {
    console.error("document analysis AI call failed", err);
    return {
      error: "The AI service could not be reached or returned an error. Please try again shortly.",
      statusCode: 502,
    };
  }

  if (!parsed) {
    const [failed] = await db
      .insert(documentAnalyses)
      .values({
        documentId: doc.id,
        source: "document",
        status: "failed",
        summary: rawText.slice(0, 10_000) || "The AI returned an empty response.",
        proposals: {
          keyFindings: [],
          risks: [],
          intelligence: [],
          research: [],
          linkSuggestions: [],
        } satisfies StoredProposals,
        createdBy: actorId,
      })
      .returning();
    await logActivity({
      actor: actorId,
      action: "document.analyze",
      entityType: "document",
      entityId: doc.id,
      metadata: { analysisId: failed.id, status: "failed", name: doc.name },
    });
    return { analysisId: failed.id, analysis: failed };
  }

  // Only keep link suggestions that point at real risks; enrich with titles.
  const riskTitleById = new Map(openRisks.map((r) => [r.id, r.title]));
  const linkSuggestions = parsed.linkSuggestions
    .filter((l) => riskTitleById.has(l.existingRiskId))
    .map((l) => ({ ...l, existingRiskTitle: riskTitleById.get(l.existingRiskId) }));

  const stored: StoredProposals = {
    keyFindings: parsed.keyFindings,
    risks: parsed.risks,
    intelligence: parsed.intelligence,
    research: parsed.research,
    linkSuggestions,
    truncated: extracted.truncated || undefined,
  };

  const [analysis] = await db
    .insert(documentAnalyses)
    .values({
      documentId: doc.id,
      source: "document",
      status: "completed",
      summary: parsed.summary,
      proposals: stored,
      createdBy: actorId,
    })
    .returning();

  await logActivity({
    actor: actorId,
    action: "document.analyze",
    entityType: "document",
    entityId: doc.id,
    metadata: {
      analysisId: analysis.id,
      name: doc.name,
      proposed: {
        risks: stored.risks.length,
        intelligence: stored.intelligence.length,
        research: stored.research.length,
        links: stored.linkSuggestions.length,
      },
    },
  });

  await createAlert({
    type: "ai_complete",
    title: `Document analysis ready: ${doc.name}`,
    body: `AI interpretation of "${doc.name}" is complete with ${stored.risks.length} risk, ${stored.intelligence.length} intelligence and ${stored.research.length} research proposal(s) awaiting review.`,
    severity: "low",
    targetUser: actorId,
    relatedEntityType: "document",
    relatedEntityId: doc.id,
  });

  return { analysisId: analysis.id, analysis };
}
