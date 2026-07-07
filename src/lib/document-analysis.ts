import { z } from "zod";

/**
 * Shared shape of AI document-analysis proposals, used by the analyze route
 * (validating model output), the commit route (reading stored proposals) and
 * the review UI. Stored verbatim in documentAnalyses.proposals (jsonb).
 */

export const proposedRiskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(5000),
  category: z.enum(["infrastructure", "cyber", "crime", "regulatory", "operational", "other"]),
  severity: z.enum(["critical", "high", "medium", "low"]),
  keywords: z.array(z.string().min(1).max(100)).max(20).default([]),
});

export const proposedIntelSchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(5000),
  incidentType: z.string().min(1).max(200),
  location: z.string().max(300).nullish(),
  occurredAt: z.string().max(40).nullish(),
});

export const proposedResearchSchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(20000),
  keywords: z.array(z.string().min(1).max(100)).max(20).default([]),
});

export const linkSuggestionSchema = z.object({
  existingRiskId: z.uuid(),
  reason: z.string().min(1).max(1000),
});

export const analysisProposalsSchema = z.object({
  summary: z.string().min(1),
  keyFindings: z.array(z.string().min(1).max(2000)).default([]),
  proposals: z.object({
    risks: z.array(proposedRiskSchema).default([]),
    intelligence: z.array(proposedIntelSchema).default([]),
    research: z.array(proposedResearchSchema).default([]),
    linkSuggestions: z.array(linkSuggestionSchema).default([]),
  }),
});

export type ProposedRisk = z.infer<typeof proposedRiskSchema>;
export type ProposedIntel = z.infer<typeof proposedIntelSchema>;
export type ProposedResearch = z.infer<typeof proposedResearchSchema>;
export type LinkSuggestion = z.infer<typeof linkSuggestionSchema>;

/** What gets persisted in documentAnalyses.proposals. */
export type StoredProposals = {
  keyFindings: string[];
  risks: ProposedRisk[];
  intelligence: ProposedIntel[];
  research: ProposedResearch[];
  linkSuggestions: (LinkSuggestion & { existingRiskTitle?: string })[];
  truncated?: boolean;
};

/**
 * Lenient parse of the raw model JSON: validates the envelope, then keeps
 * only the individual proposal entries that pass validation (bad entries are
 * dropped rather than failing the whole analysis).
 */
export function salvageProposals(raw: unknown): {
  summary: string;
  keyFindings: string[];
  risks: ProposedRisk[];
  intelligence: ProposedIntel[];
  research: ProposedResearch[];
  linkSuggestions: LinkSuggestion[];
} | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const summary = typeof obj.summary === "string" && obj.summary.trim() ? obj.summary.trim() : null;
  if (!summary) return null;

  const keyFindings = Array.isArray(obj.keyFindings)
    ? obj.keyFindings.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    : [];

  const p = (typeof obj.proposals === "object" && obj.proposals !== null
    ? obj.proposals
    : {}) as Record<string, unknown>;

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
    keyFindings,
    risks: pick(p.risks, proposedRiskSchema),
    intelligence: pick(p.intelligence, proposedIntelSchema),
    research: pick(p.research, proposedResearchSchema),
    linkSuggestions: pick(p.linkSuggestions, linkSuggestionSchema),
  };
}

/** Strip markdown code fences and extract the outermost JSON object. */
export function extractJson(text: string): unknown | null {
  let candidate = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(candidate);
  if (fenced) candidate = fenced[1].trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
