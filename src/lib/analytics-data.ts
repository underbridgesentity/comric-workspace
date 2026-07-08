import { and, gte, lte, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { risks, scrapeResults, riskCategoryEnum } from "@/lib/schema";
import type { RiskCategory, Severity } from "@/lib/schema";
import type { DateWindow } from "@/lib/date-range";

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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Time-series bucketing for a resolved window: daily when the window spans
 * 35 days or fewer, weekly beyond. Unbounded windows fall back to 12 weeks
 * of history for the time charts.
 */
function buckets(window: DateWindow, now: number): { unit: "day" | "week"; count: number } {
  const seriesEnd = window.end ? window.end.getTime() : now;
  if (!window.start) return { unit: "week", count: 12 };
  const days = Math.max(1, Math.ceil((seriesEnd - window.start.getTime()) / DAY_MS));
  return days <= 35 ? { unit: "day", count: days } : { unit: "week", count: Math.ceil(days / 7) };
}

function seriesLabel(window: DateWindow, unit: "day" | "week", count: number): string {
  if (window.key === "custom") return window.label;
  return unit === "day" ? `last ${count} days` : `last ${count} weeks`;
}

/**
 * Every dataset behind the analytics page and its Excel export, computed for
 * a resolved date window plus an optional risk category. The category applies
 * to risk-derived charts only; the window applies everywhere (an unbounded
 * window leaves aggregates unbounded and falls back to a 12-week window for
 * time series).
 */
export async function getAnalyticsData(
  window: DateWindow,
  category: RiskCategory | null,
): Promise<AnalyticsData> {
  const now = Date.now();
  const { start, end } = window;
  const { unit, count } = buckets(window, now);
  const unitMs = (unit === "day" ? 1 : 7) * DAY_MS;
  const seriesEnd = end ? end.getTime() : now;
  const seriesStart = new Date(seriesEnd - count * unitMs);

  const riskWhere: SQL[] = [];
  if (start) riskWhere.push(gte(risks.createdAt, start));
  if (end) riskWhere.push(lte(risks.createdAt, end));
  if (category) riskWhere.push(eq(risks.category, category));

  const scrapeWhere: SQL[] = [];
  if (start) scrapeWhere.push(gte(scrapeResults.scrapedAt, start));
  if (end) scrapeWhere.push(lte(scrapeResults.scrapedAt, end));

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
      .where(scrapeWhere.length ? and(...scrapeWhere) : undefined),
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
    const bStart = new Date(seriesEnd - (i + 1) * unitMs);
    const bEnd = new Date(seriesEnd - i * unitMs);
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
    const bStart = new Date(seriesEnd - (i + 1) * unitMs);
    const bEnd = new Date(seriesEnd - i * unitMs);
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
    scrape: `${scrapesInWindow.length} articles captured by the scrape pipeline in ${window.key === "custom" ? `the window ${window.label}` : `the ${seriesLabel(window, unit, count)}`}.`,
  };

  return {
    severityData,
    categoryData,
    weeklyData,
    keywordData,
    scrapeVolume,
    insights,
    labels: {
      weekly: `Risks logged - ${seriesLabel(window, unit, count)}`,
      scrape: `Scrape volume - ${seriesLabel(window, unit, count)}`,
    },
  };
}
