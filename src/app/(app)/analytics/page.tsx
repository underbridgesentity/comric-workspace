import { gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { risks, scrapeResults } from "@/lib/schema";
import type { RiskCategory, Severity } from "@/lib/schema";
import { PageHeader } from "@/components/ui";
import { AnalyticsCharts } from "./analytics-charts";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<RiskCategory, string> = {
  infrastructure: "Infrastructure",
  cyber: "Cyber",
  crime: "Crime",
  regulatory: "Regulatory",
  operational: "Operational",
  other: "Other",
};

export default async function AnalyticsPage() {
  const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [allRisks, recentScrapes] = await Promise.all([
    db
      .select({ severity: risks.severity, category: risks.category, createdAt: risks.createdAt })
      .from(risks),
    db
      .select({ scrapedAt: scrapeResults.scrapedAt, matchedKeywords: scrapeResults.matchedKeywords })
      .from(scrapeResults)
      .where(gte(scrapeResults.scrapedAt, fourteenDaysAgo)),
  ]);
  const allScrapeKeywords = await db
    .select({ matchedKeywords: scrapeResults.matchedKeywords })
    .from(scrapeResults);

  // Severity distribution
  const sevOrder: Severity[] = ["critical", "high", "medium", "low"];
  const sevCounts = new Map<Severity, number>();
  for (const r of allRisks) sevCounts.set(r.severity, (sevCounts.get(r.severity) ?? 0) + 1);
  const severityData = sevOrder.map((s) => ({ name: s, value: sevCounts.get(s) ?? 0 }));

  // Category breakdown
  const catCounts = new Map<RiskCategory, number>();
  for (const r of allRisks) catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
  const categoryData = (Object.keys(CATEGORY_LABELS) as RiskCategory[])
    .map((c) => ({ name: CATEGORY_LABELS[c], value: catCounts.get(c) ?? 0 }))
    .sort((a, b) => b.value - a.value);

  // Risks over 12 weeks
  const weekly: { week: string; risks: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
    const count = allRisks.filter(
      (r) => r.createdAt >= start && r.createdAt < end && r.createdAt >= twelveWeeksAgo,
    ).length;
    weekly.push({
      week: end.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }),
      risks: count,
    });
  }

  // Top matched keywords (all time)
  const kwCounts = new Map<string, number>();
  for (const s of allScrapeKeywords)
    for (const k of s.matchedKeywords) kwCounts.set(k, (kwCounts.get(k) ?? 0) + 1);
  const keywordData = [...kwCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  // Scrape volume, last 14 days
  const scrapeVolume: { day: string; results: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    scrapeVolume.push({
      day: end.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }),
      results: recentScrapes.filter((s) => s.scrapedAt >= start && s.scrapedAt < end).length,
    });
  }

  // Server-computed one-line insights
  const totalRisks = allRisks.length;
  const topSev = severityData.reduce((a, b) => (b.value > a.value ? b : a), severityData[0]);
  const topCat = categoryData[0];
  const recentWeeks = weekly.slice(-4).reduce((n, w) => n + w.risks, 0);
  const priorWeeks = weekly.slice(-8, -4).reduce((n, w) => n + w.risks, 0);
  const trend =
    recentWeeks > priorWeeks ? "rising" : recentWeeks < priorWeeks ? "easing" : "steady";
  const scrapeTotal14 = recentScrapes.length;

  const insights = {
    severity:
      totalRisks === 0
        ? "No risks logged yet."
        : `${topSev.name.charAt(0).toUpperCase() + topSev.name.slice(1)} severity accounts for ${Math.round((topSev.value / totalRisks) * 100)}% of ${totalRisks} risks.`,
    category:
      totalRisks === 0 || !topCat || topCat.value === 0
        ? "No category data yet."
        : `${topCat.name} is the dominant category with ${topCat.value} risk${topCat.value === 1 ? "" : "s"}.`,
    weekly: `Risk intake is ${trend}: ${recentWeeks} in the last 4 weeks vs ${priorWeeks} in the prior 4.`,
    keywords:
      keywordData.length === 0
        ? "No keyword matches captured yet."
        : `"${keywordData[0].name}" is the most-triggered keyword (${keywordData[0].value} matches).`,
    scrape: `${scrapeTotal14} articles captured by the scrape pipeline in the last 14 days.`,
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="Live Analytics"
        subtitle="Real-time snapshot of the COMRiC risk and intelligence pipeline."
      />
      <AnalyticsCharts
        severityData={severityData}
        categoryData={categoryData}
        weeklyData={weekly}
        keywordData={keywordData}
        scrapeVolume={scrapeVolume}
        insights={insights}
      />
    </div>
  );
}
