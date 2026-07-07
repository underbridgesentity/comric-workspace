import { z } from "zod";

/**
 * Shared (client-safe) configuration for the configurable report builder:
 * metric/source catalogues, the builder payload schema and the shapes of
 * the computed data snapshot persisted alongside each generated report.
 * No DB imports here - this file is imported by client components.
 */

export const METRIC_DEFS = {
  severity_distribution: "Severity distribution & trend",
  category_breakdown: "Category breakdown",
  new_vs_resolved: "New vs resolved risks",
  incident_locations: "Incident volumes by location",
  keyword_trends: "Keyword-hit trends",
  scrape_volume: "Scrape volume",
  top_sources: "Top sources",
  response_status: "Response / mitigation status",
} as const;

export const SOURCE_DEFS = {
  risk_register: "Risk register",
  sector_intel: "Sector intelligence",
  scraped_news: "Scraped news",
  research: "Research entries",
  document_analyses: "Document analyses",
} as const;

export type MetricKey = keyof typeof METRIC_DEFS;
export type SourceKey = keyof typeof SOURCE_DEFS;

export const METRIC_KEYS = Object.keys(METRIC_DEFS) as MetricKey[];
export const SOURCE_KEYS = Object.keys(SOURCE_DEFS) as SourceKey[];

export const RISK_CATEGORIES = [
  "infrastructure",
  "cyber",
  "crime",
  "regulatory",
  "operational",
  "other",
] as const;

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;

export const builderSchema = z.object({
  reportType: z.enum(["risk_summary", "sector_report", "research_digest"]),
  metrics: z.array(z.enum(METRIC_KEYS as [MetricKey, ...MetricKey[]])).max(20).default([]),
  sources: z.array(z.enum(SOURCE_KEYS as [SourceKey, ...SourceKey[]])).max(10).default([]),
  range: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  category: z.enum(RISK_CATEGORIES).optional(),
  severityFloor: z.enum(SEVERITIES).optional(),
  instructions: z.string().trim().max(4000).optional(),
});

export type BuilderPayload = z.infer<typeof builderSchema>;

/** A computed metric table - persisted in aiReports.parameters and reused by exports. */
export type MetricTable = {
  key: MetricKey;
  title: string;
  columns: string[];
  rows: (string | number)[][];
};

/** Shape stored in aiReports.parameters for builder-generated reports. */
export type ReportParameters = {
  builder: BuilderPayload;
  metrics: MetricTable[];
};

/** Best-effort narrowing of a jsonb parameters value to the builder snapshot. */
export function readReportParameters(value: unknown): Partial<ReportParameters> {
  if (!value || typeof value !== "object") return {};
  const obj = value as Record<string, unknown>;
  const out: Partial<ReportParameters> = {};
  const builder = builderSchema.safeParse(obj.builder);
  if (builder.success) out.builder = builder.data;
  if (Array.isArray(obj.metrics)) {
    const tables: MetricTable[] = [];
    for (const t of obj.metrics) {
      if (
        t &&
        typeof t === "object" &&
        typeof (t as MetricTable).title === "string" &&
        Array.isArray((t as MetricTable).columns) &&
        Array.isArray((t as MetricTable).rows)
      ) {
        tables.push(t as MetricTable);
      }
    }
    if (tables.length > 0) out.metrics = tables;
  }
  return out;
}

/** Schedule flag stored inside a template's parameters jsonb (no migration). */
export const TEMPLATE_SCHEDULES = ["weekly"] as const;
export type TemplateSchedule = (typeof TEMPLATE_SCHEDULES)[number] | null;

/** Shape stored in reportTemplates.parameters for scheduled-capable templates. */
export type TemplateParameters = {
  builder: BuilderPayload;
  schedule: TemplateSchedule;
};

/**
 * Best-effort narrowing of a template's jsonb parameters. Supports both the
 * legacy format (raw builder payload at the top level) and the current
 * { builder, schedule } wrapper.
 */
export function readTemplateParameters(value: unknown): Partial<TemplateParameters> {
  if (!value || typeof value !== "object") return {};
  const obj = value as Record<string, unknown>;
  const wrapped = builderSchema.safeParse(obj.builder);
  if (wrapped.success) {
    return {
      builder: wrapped.data,
      schedule: obj.schedule === "weekly" ? "weekly" : null,
    };
  }
  const legacy = builderSchema.safeParse(value);
  if (legacy.success) return { builder: legacy.data, schedule: null };
  return {};
}

export const RANGE_LABELS: Record<BuilderPayload["range"], string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

export const RANGE_DAYS: Record<BuilderPayload["range"], number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};
