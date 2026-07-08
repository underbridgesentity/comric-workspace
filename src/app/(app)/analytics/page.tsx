import { PageHeader } from "@/components/ui";
import { parseRange } from "@/lib/date-range";
import { getAnalyticsData, parseCategory } from "@/lib/analytics-data";
import { AnalyticsCharts } from "./analytics-charts";
import { AnalyticsControls } from "./analytics-controls";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const range = parseRange(get("range"), "90d");
  const category = parseCategory(get("category"));

  const data = await getAnalyticsData(range, category);

  return (
    <div className="animate-rise">
      <PageHeader
        title="Live Analytics"
        subtitle="Real-time snapshot of the COMRiC risk and intelligence pipeline."
      />
      <AnalyticsControls range={range} category={category ?? ""} />
      <AnalyticsCharts
        severityData={data.severityData}
        categoryData={data.categoryData}
        weeklyData={data.weeklyData}
        keywordData={data.keywordData}
        scrapeVolume={data.scrapeVolume}
        insights={data.insights}
        labels={data.labels}
      />
    </div>
  );
}
