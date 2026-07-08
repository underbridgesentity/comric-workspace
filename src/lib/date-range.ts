/** Shared date-range presets used by searchParams-driven list filters. */

export const RANGE_PRESETS = ["7d", "30d", "90d", "all"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Record<RangePreset, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const RANGE_DAYS: Record<Exclude<RangePreset, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function parseRange(value: string | undefined, fallback: RangePreset = "all"): RangePreset {
  return (RANGE_PRESETS as readonly string[]).includes(value ?? "")
    ? (value as RangePreset)
    : fallback;
}

/** Start of the window for a preset, or null for "all" (no lower bound). */
export function rangeStart(range: RangePreset, now = Date.now()): Date | null {
  if (range === "all") return null;
  return new Date(now - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
}
