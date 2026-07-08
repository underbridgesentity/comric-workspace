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

/**
 * A resolved date window: presets keep their open upper bound, while custom
 * windows carry explicit (possibly one-sided) bounds. `key` is the preset id
 * or "custom" and drives filenames / active-chip state; `label` is a human
 * description ("Last 30 days" or "12 Jun 2026 - 30 Jun 2026").
 */
export type DateWindow = {
  start: Date | null;
  end: Date | null;
  label: string;
  key: string;
};

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a YYYY-MM-DD string to a local Date at 00:00 or 23:59:59.999. */
function parseDay(value: string | undefined, endOfDay: boolean): Date | null | "invalid" {
  if (!value) return null;
  const m = DAY_RE.exec(value.trim());
  if (!m) return "invalid";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = endOfDay
    ? new Date(y, mo - 1, d, 23, 59, 59, 999)
    : new Date(y, mo - 1, d, 0, 0, 0, 0);
  // Reject rolled-over dates like 2026-02-31.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return "invalid";
  }
  return date;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function presetWindow(preset: RangePreset, now: number): DateWindow {
  return { start: rangeStart(preset, now), end: null, label: RANGE_LABELS[preset], key: preset };
}

/**
 * Resolve searchParams to a DateWindow. Presets behave as before (open upper
 * bound). range=custom reads from/to as YYYY-MM-DD (from at 00:00, to at
 * 23:59:59 local); either side may be missing (open-ended). Invalid dates or
 * from > to fall back to the fallback preset; an empty custom window behaves
 * like "all".
 */
export function parseWindow(
  sp: { range?: string; from?: string; to?: string },
  fallback: RangePreset = "all",
  now = Date.now(),
): DateWindow {
  if (sp.range !== "custom") {
    return presetWindow(parseRange(sp.range, fallback), now);
  }
  const start = parseDay(sp.from, false);
  const end = parseDay(sp.to, true);
  if (start === "invalid" || end === "invalid") return presetWindow(fallback, now);
  if (start && end && start.getTime() > end.getTime()) return presetWindow(fallback, now);
  if (!start && !end) {
    return { start: null, end: null, label: RANGE_LABELS.all, key: "all" };
  }
  const label =
    start && end
      ? `${formatDay(start)} - ${formatDay(end)}`
      : start
        ? `From ${formatDay(start)}`
        : `Until ${formatDay(end as Date)}`;
  return { start, end, label, key: "custom" };
}

/**
 * Resolve a report-builder payload (range + optional rangeFrom/rangeTo) to a
 * DateWindow. Non-custom ranges map onto the shared presets; unknown values
 * fall back to the builder default of 30 days.
 */
export function windowFromBuilder(
  builder: { range?: string; rangeFrom?: string; rangeTo?: string },
  now = Date.now(),
): DateWindow {
  return parseWindow(
    { range: builder.range, from: builder.rangeFrom, to: builder.rangeTo },
    parseRange(builder.range, "30d"),
    now,
  );
}
