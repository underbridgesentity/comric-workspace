import { z } from "zod";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentAnalyses, risks, scrapeResults, type DocumentAnalysis } from "@/lib/schema";
import { anthropic, AI_MODEL, COMRIC_CONTEXT, textFromMessage } from "@/lib/anthropic";
import { extractJson, linkSuggestionSchema, type LinkSuggestion } from "@/lib/document-analysis";
import { logActivity } from "@/lib/activity";
import { createAlert } from "@/lib/alert-engine";

const WINDOW_HOURS = 72;
const MIN_RELEVANCE = 0.45;
const MIN_RESULTS = 5;
const MAX_RESULTS = 60;

/** A risk proposed from clustered scraped news, with source evidence. */
export const scrapeProposedRiskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(5000),
  category: z.enum(["infrastructure", "cyber", "crime", "regulatory", "operational", "other"]),
  severity: z.enum(["critical", "high", "medium", "low"]),
  keywords: z.array(z.string().min(1).max(100)).max(20).default([]),
  supportingArticles: z.array(z.string().min(1).max(2000)).max(20).default([]),
});

export type ScrapeProposedRisk = z.infer<typeof scrapeProposedRiskSchema>;

/** What gets persisted in documentAnalyses.proposals for source 'scrape'. */
export type ScrapeSuggestionProposals = {
  risks: ScrapeProposedRisk[];
  linkSuggestions: (LinkSuggestion & { existingRiskTitle?: string })[];
  articleCount: number;
  windowHours: number;
};

const RESPONSE_SCHEMA = `{
  "summary": "3-6 sentence overview of the risk landscape emerging from these articles",
  "risks": [{
    "title": "string", "description": "string referencing the article evidence",
    "category": "infrastructure|cyber|crime|regulatory|operational|other",
    "severity": "critical|high|medium|low",
    "keywords": ["string"],
    "supportingArticles": ["source url of an article supporting this risk"]
  }],
  "linkSuggestions": [{ "existingRiskId": "uuid from the provided risk register", "reason": "string" }]
}`;

/** Lenient parse of the model JSON: keep valid entries, drop the rest. */
function salvageScrapeSuggestions(raw: unknown): {
  summary: string;
  risks: ScrapeProposedRisk[];
  linkSuggestions: LinkSuggestion[];
} | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const summary =
    typeof obj.summary === "string" && obj.summary.trim() ? obj.summary.trim() : null;
  if (!summary) return null;

  const pick = <T>(value: unknown, schema: z.ZodType<T>): T[] => {
    if (!Array.isArray(value)) return [];
    const out: T[] = [];
    for (const entry of value) {
      const parsed = schema.safeParse(entry);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  };

  return {
    summary,
    risks: pick(obj.risks, scrapeProposedRiskSchema),
    linkSuggestions: pick(obj.linkSuggestions, linkSuggestionSchema),
  };
}

export type ScrapeSuggestionResult =
  | { analysis: DocumentAnalysis; error?: never }
  | { analysis?: never; error: string; statusCode: number };

/**
 * Cluster fresh, high-relevance scrape results into proposed new risks and
 * link suggestions against the live register, persisted as a scrape-source
 * documentAnalyses row for review-to-commit.
 */
export async function generateScrapeSuggestions(
  actorId: string,
): Promise<ScrapeSuggestionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      error: "AI suggestions are unavailable: ANTHROPIC_API_KEY is not configured.",
      statusCode: 503,
    };
  }

  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);
  const articles = await db
    .select({
      id: scrapeResults.id,
      sourceUrl: scrapeResults.sourceUrl,
      title: scrapeResults.title,
      snippet: scrapeResults.snippet,
      content: scrapeResults.content,
      matchedKeywords: scrapeResults.matchedKeywords,
      relevanceScore: scrapeResults.relevanceScore,
      scrapedAt: scrapeResults.scrapedAt,
    })
    .from(scrapeResults)
    .where(
      and(
        eq(scrapeResults.processed, false),
        gte(scrapeResults.scrapedAt, since),
        gte(scrapeResults.relevanceScore, MIN_RELEVANCE),
      ),
    )
    .orderBy(desc(scrapeResults.relevanceScore))
    .limit(MAX_RESULTS);

  if (articles.length < MIN_RESULTS) {
    return {
      error: `Not enough fresh high-relevance results: ${articles.length} qualifying article(s) in the last ${WINDOW_HOURS} hours (minimum ${MIN_RESULTS}). Run a scrape first.`,
      statusCode: 422,
    };
  }

  // Compact current active risk register for dedupe and link suggestions.
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

  const articleBlock = articles
    .map((a, i) => {
      const body = (a.content ?? a.snippet ?? "").slice(0, 1200);
      return `[${i + 1}] ${a.title}
url: ${a.sourceUrl}
relevance: ${(a.relevanceScore ?? 0).toFixed(2)} | matched: ${a.matchedKeywords.join(", ") || "(none)"} | scraped: ${a.scrapedAt.toISOString()}
${body}`;
    })
    .join("\n\n");

  const system = `${COMRIC_CONTEXT}

You are reviewing recently scraped South African news articles matched by the COMRiC keyword monitoring pipeline. Cluster the articles into distinct risk themes. Propose NEW risks only for themes that are NOT already covered by the provided risk register; reference the article evidence in each description and cite the supporting article source urls exactly as given. Where the news is an update to a risk already on the register, do not propose a duplicate risk: instead add a linkSuggestion with the register risk's exact id and a reason. Be conservative: propose only what the articles clearly support.

You MUST respond with ONLY a single JSON object matching this schema - no prose, no markdown fences:
${RESPONSE_SCHEMA}`;

  const userContent = `Current open/monitoring/mitigating risk register:
${riskRegister}

Scraped articles from the last ${WINDOW_HOURS} hours (${articles.length} article(s), highest relevance first):

${articleBlock}`;

  const client = anthropic();
  let rawText = "";
  let parsed: ReturnType<typeof salvageScrapeSuggestions> = null;

  try {
    const first = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: userContent }],
    });
    rawText = textFromMessage(first);
    parsed = salvageScrapeSuggestions(extractJson(rawText));

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
      parsed = salvageScrapeSuggestions(extractJson(rawText));
    }
  } catch (err) {
    console.error("scrape suggestion AI call failed", err);
    return {
      error: "The AI service could not be reached or returned an error. Please try again shortly.",
      statusCode: 502,
    };
  }

  if (!parsed) {
    return {
      error: "The AI response could not be interpreted as risk suggestions. Please try again.",
      statusCode: 502,
    };
  }

  // Only keep link suggestions pointing at real register risks; enrich titles.
  const riskTitleById = new Map(openRisks.map((r) => [r.id, r.title]));
  const linkSuggestions = parsed.linkSuggestions
    .filter((l) => riskTitleById.has(l.existingRiskId))
    .map((l) => ({ ...l, existingRiskTitle: riskTitleById.get(l.existingRiskId) }));

  const stored: ScrapeSuggestionProposals = {
    risks: parsed.risks,
    linkSuggestions,
    articleCount: articles.length,
    windowHours: WINDOW_HOURS,
  };

  const [analysis] = await db
    .insert(documentAnalyses)
    .values({
      documentId: null,
      source: "scrape",
      status: "completed",
      summary: parsed.summary,
      proposals: stored,
      createdBy: actorId,
    })
    .returning();

  await logActivity({
    actor: actorId,
    action: "scrape.suggest",
    entityType: "scrape",
    entityId: analysis.id,
    metadata: {
      analysisId: analysis.id,
      articleCount: articles.length,
      windowHours: WINDOW_HOURS,
      proposed: { risks: stored.risks.length, links: stored.linkSuggestions.length },
    },
  });

  await createAlert({
    type: "ai_complete",
    title: "AI risk suggestions ready",
    body: `Clustering of ${articles.length} scraped article(s) is complete with ${stored.risks.length} proposed risk(s) and ${stored.linkSuggestions.length} link suggestion(s) awaiting review.`,
    severity: "low",
    targetUser: actorId,
    relatedEntityType: "analysis",
    relatedEntityId: analysis.id,
  });

  return { analysis };
}
