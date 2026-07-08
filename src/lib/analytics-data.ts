import { and, gte, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { risks, scrapeResults, riskCategoryEnum } from "@/lib/schema";
import type { RiskCategory, Severity } from "@/lib/schema";
import { rangeStart, type RangePreset } from "@/lib/date-range";

export const CATEGORY_LABELS: Record<RiskCategory, string> = {
  infrastructure: "Infrastructure",
  cyber: "Cyber",
  crime: "Crime",
  regulatory: "Regulatory",
  operational: "Operational",
  other: "Other",
};

export function parseCategory(value: string | undefined): RiskCategory | null {
  return riskCategoryEnum.enumValues.find((c) => c === value) ?? null;
}

export type Datum = { name: string; value: number };

export type AnalyticsData = {
  severityData: Datum[];
  categoryData: Datum[];
  weeklyData: { week: string; risks: number }[];
  keywordData: Datum[];
  scrapeVolume: { day: string; results: number }[];
  insights: Record<"severity" | "category" | "weekly" | "keywords" | "scrape", string>;
  labels: { weekly: string; scrape: string };
};

/** Time-series bucketing per preset: daily for short windows, weekly beyond. */
function buckets(range: RangePreset): { unit: "day" | "week"; count: number } {
  if (range === "7d") return { unit: "day", count: 7 };
  if (range === "30d") return { unit: "day", count: 30 };
  if (range === "90d") return { unit: "week", count: 13 };
  // "all": aggregates are unbounded, but time charts still need a window.
  return { unit: "week", count: 12 };
}

function seriesLabel(unit: "day" | "week", count: number): string {
  return unit === "day" ? `last ${count} days` : `last ${count} weeks`;
}

/**
 * Every dataset behind the analytics page and its Excel export, computed for
 * a date-range preset plus an optional risk category. The category applies
 * to risk-derived charts only; the range applies everywhere ("all" leaves
 * aggregates unbounded and falls back to a 12-week window for time series).
 */
export async function getAnalyticsData(
  range: RangePreset,
  category: RiskCategory | null,
): Promise<AnalyticsData> {
  const now = Date.now();
  const start = rangeStart(range, now);
  const { unit, count } = buckets(range);
  const unitMs = (unit === "day" ? 1 : 7) * 24 * 60 * 60 * 1000;
  const seriesStart = new Date(now - count * unitMs);

  const riskWhere: SQL[] = [];
  if (start) riskWhere.push(gte(risks.createdAt, start));
  if (category) riskWhere.push(eq(risks.category, category));

  const [scopedRisks, scopedScrapes] = await Promise.all([
    db
      .select({ severity: risks.severity, category: risks.category, createdAt: risks.createdAt })
      .from(risks)
      .where(riskWhere.length ? and(...riskWhere) : undefined),
    db
      .select({
        scrapedAt: scrapeResults.scrapedAt,
        matchedKeywords: scrapeResults.matchedKeywords,
      })
      .from(scrapeResults)
      .where(start ? gte(scrapeResults.scrapedAt, start) : undefined),
  ]);

  // Severity distribution over risks created in scope.
  const sevOrder: Severity[] = ["critical", "high", "medium", "low"];
  const sevCounts = new Map<Severity, number>();
  for (const r of scopedRisks) sevCounts.set(r.severity, (sevCounts.get(r.severity) ?? 0) + 1);
  const severityData = sevOrder.map((s) => ({ name: s, value: sevCounts.get(s) ?? 0 }));

  // Category breakdown over risks created in scope.
  const catCounts = new Map<RiskCategory, number>();
  for (const r of scopedRisks) catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
  const categoryData = (Object.keys(CATEGORY_LABELS) as RiskCategory[])
    .map((c) => ({ name: CATEGORY_LABELS[c], value: catCounts.get(c) ?? 0 }))
    .sort((a, b) => b.value - a.value);

  // Risks logged over time.
  const weeklyData: { week: string; risks: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const bStart = new Date(now - (i + 1) * unitMs);
    const bEnd = new Date(now - i * unitMs);
    weeklyData.push({
      week: bEnd.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }),
      risks: scopedRisks.filter((r) => r.createdAt >= bStart && r.createdAt < bEnd).length,
    });
  }

  // Top matched keywords over scrapes in scope.
  const kwCounts = new Map<string, number>();
  for (const s of scopedScrapes)
    for (const k of s.matchedKeywords) kwCounts.set(k, (kwCounts.get(k) ?? 0) + 1);
  const keywordData = [...kwCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  // Scrape volume over the same time-series window.
  const scrapeVolume: { day: string; results: number }[] = [];
  const scrapesInWindow = scopedScrapes.filter((s) => s.scrapedAt >= seriesStart);
  for (let i = count - 1; i >= 0; i--) {
    const bStart = new Date(now - (i + 1) * unitMs);
    const bEnd = new Date(now - i * unitMs);
    scrapeVolume.push({
      day: bEnd.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }),
      results: scrapesInWindow.filter((s) => s.scrapedAt >= bStart && s.scrapedAt < bEnd).length,
    });
  }

  // One-line insights for the filtered scope.
  const totalRisks = scopedRisks.length;
  const topSev = severityData.reduce((a, b) => (b.value > a.value ? b : a), severityData[0]);
  const topCat = categoryData[0];
  const half = Math.floor(count / 2);
  const recent = weeklyData.slice(-half).reduce((n, w) => n + w.risks, 0);
  const prior = weeklyData.slice(-2 * half, -half).reduce((n, w) => n + w.risks, 0);
  const trend = recent > prior ? "rising" : recent < prior ? "easing" : "steady";
  const unitWord = unit === "day" ? "days" : "weeks";
  const scopeSuffix = category ? ` in ${CATEGORY_LABELS[category]}` : "";

  const insights = {
    severity:
      totalRisks === 0
        ? `No risks logged in this scope${scopeSuffix ? scopeSuffix : ""}.`
        : `${topSev.name.charAt(0).toUpperCase() + topSev.name.slice(1)} severity accounts for ${Math.round((topSev.value / totalRisks) * 100)}% of ${totalRisks} risk${totalRisks === 1 ? "" : "s"}${scopeSuffix}.`,
    category:
      totalRisks === 0 || !topCat || topCat.value === 0
        ? "No category data in this scope."
        : `${topCat.name} is the dominant category with ${topCat.value} risk${topCat.value === 1 ? "" : "s"} in scope.`,
    weekly: `Risk intake is ${trend}: ${recent} in the last ${half} ${unitWord} vs ${prior} in the prior ${half}.`,
    keywords:
      keywordData.length === 0
        ? "No keyword matches captured in this scope."
        : `"${keywordData[0].name}" is the most-triggered keyword (${keywordData[0].value} matches).`,
    scrape: `${scrapesInWindow.length} articles captured by the scrape pipeline in the ${seriesLabel(unit, count)}.`,
  };

  return {
    severityData,
    categoryData,
    weeklyData,
    keywordData,
    scrapeVolume,
    insights,
    labels: {
      weekly: `Risks logged - ${seriesLabel(unit, count)}`,
      scrape: `Scrape volume - ${seriesLabel(unit, count)}`,
    },
  };
}
