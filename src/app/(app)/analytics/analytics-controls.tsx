"use client";

import { Download } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { GhostButton } from "@/components/ui";
import type { RangePreset } from "@/lib/date-range";

const CATEGORY_OPTIONS = [
  { value: "infrastructure", label: "Infrastructure" },
  { value: "cyber", label: "Cyber" },
  { value: "crime", label: "Crime" },
  { value: "regulatory", label: "Regulatory" },
  { value: "operational", label: "Operational" },
  { value: "other", label: "Other" },
];

export function AnalyticsControls({
  range,
  category,
}: {
  range: RangePreset;
  category: string;
}) {
  const exportHref = `/api/analytics/export?range=${range}${
    category ? `&category=${category}` : ""
  }`;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <FilterBar
        selects={[{ name: "category", label: "Risk category", options: CATEGORY_OPTIONS }]}
        rangeParam="range"
        defaultRange="90d"
        className="mb-0"
      />
      <a href={exportHref} download>
        <GhostButton type="button">
          <Download className="h-4 w-4" /> Export to Excel
        </GhostButton>
      </a>
    </div>
  );
}
