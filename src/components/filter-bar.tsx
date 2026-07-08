"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { RANGE_PRESETS, type RangePreset } from "@/lib/date-range";

const RANGE_CHIP_LABELS: Record<RangePreset, string> = {
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  all: "All",
};

export type SelectFilterConfig = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
};

/**
 * Reusable searchParams-driven filter bar: optional text search, dropdowns
 * and date-range preset chips. Styling mirrors the risks register filters.
 */
export function FilterBar({
  searchParam,
  searchPlaceholder = "Search…",
  selects = [],
  rangeParam,
  defaultRange = "all",
  className = "",
}: {
  /** searchParams key for the text search input; omit to hide the input. */
  searchParam?: string;
  searchPlaceholder?: string;
  selects?: SelectFilterConfig[];
  /** searchParams key for the range preset chips; omit to hide the chips. */
  rangeParam?: string;
  defaultRange?: RangePreset;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(searchParam ? (params.get(searchParam) ?? "") : "");

  useEffect(() => {
    if (searchParam) setQ(params.get(searchParam) ?? "");
  }, [params, searchParam]);

  const setParam = useCallback(
    (name: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(name, value);
      else next.delete(name);
      next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const activeRange = rangeParam
    ? ((RANGE_PRESETS as readonly string[]).includes(params.get(rangeParam) ?? "")
        ? (params.get(rangeParam) as RangePreset)
        : defaultRange)
    : defaultRange;

  const anyActive =
    (searchParam ? !!params.get(searchParam) : false) ||
    selects.some((s) => !!params.get(s.name)) ||
    (rangeParam ? activeRange !== defaultRange : false);

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-2 ${className}`}>
      {searchParam && (
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            setParam(searchParam, q);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-56 rounded-brand border border-hairline bg-surface py-1.5 pr-3 pl-8 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-cyber/60"
          />
        </form>
      )}
      {selects.map((s) => (
        <select
          key={s.name}
          aria-label={s.label}
          className="rounded-brand border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-cyber/60"
          value={params.get(s.name) ?? ""}
          onChange={(e) => setParam(s.name, e.target.value)}
        >
          <option value="">{s.label}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {rangeParam && (
        <div className="flex items-center gap-1.5" role="group" aria-label="Date range">
          {RANGE_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setParam(rangeParam, r === defaultRange ? "" : r)}
              className={`rounded-brand border px-3 py-1.5 font-display text-xs font-bold transition-colors ${
                activeRange === r
                  ? "border-cyber/60 bg-cyber/10 text-cyber"
                  : "border-hairline text-muted hover:text-ink"
              }`}
            >
              {RANGE_CHIP_LABELS[r]}
            </button>
          ))}
        </div>
      )}
      {anyActive && (
        <button
          type="button"
          onClick={() => router.replace(pathname, { scroll: false })}
          className="text-sm font-semibold text-cyber hover:brightness-110"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
