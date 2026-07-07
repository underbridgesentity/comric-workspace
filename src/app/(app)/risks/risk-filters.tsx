"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";

const CATEGORY_OPTIONS = ["infrastructure", "cyber", "crime", "regulatory", "operational", "other"];
const SEVERITY_OPTIONS = ["critical", "high", "medium", "low"];
const STATUS_OPTIONS = ["open", "monitoring", "mitigating", "resolved", "closed"];
const SOURCE_OPTIONS = ["web_scrape", "partner_report", "manual"];

export const selectClass =
  "rounded-brand border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-cyber/60";

function FilterSelect({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (name: string, value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      className={selectClass}
      value={value}
      onChange={(e) => onChange(name, e.target.value)}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function RiskFilters({
  responsibleOptions,
}: {
  responsibleOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  const setParam = useCallback(
    (name: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(name, value);
      else next.delete(name);
      router.push(`/risks?${next.toString()}`);
    },
    [params, router],
  );

  const pretty = (s: string) => s.replace(/_/g, " ");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", q);
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search risks…"
          className="w-56 rounded-brand border border-hairline bg-surface py-1.5 pr-3 pl-8 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-cyber/60"
        />
      </form>
      <FilterSelect
        name="category"
        label="Category"
        value={params.get("category") ?? ""}
        options={CATEGORY_OPTIONS.map((v) => ({ value: v, label: pretty(v) }))}
        onChange={setParam}
      />
      <FilterSelect
        name="severity"
        label="Severity"
        value={params.get("severity") ?? ""}
        options={SEVERITY_OPTIONS.map((v) => ({ value: v, label: v }))}
        onChange={setParam}
      />
      <FilterSelect
        name="status"
        label="Status"
        value={params.get("status") ?? ""}
        options={STATUS_OPTIONS.map((v) => ({ value: v, label: v }))}
        onChange={setParam}
      />
      <FilterSelect
        name="responsible"
        label="Responsible"
        value={params.get("responsible") ?? ""}
        options={responsibleOptions.map((u) => ({ value: u.id, label: u.name }))}
        onChange={setParam}
      />
      <FilterSelect
        name="source"
        label="Source"
        value={params.get("source") ?? ""}
        options={SOURCE_OPTIONS.map((v) => ({ value: v, label: pretty(v) }))}
        onChange={setParam}
      />
      {(params.get("q") ||
        params.get("category") ||
        params.get("severity") ||
        params.get("status") ||
        params.get("responsible") ||
        params.get("source")) && (
        <button
          type="button"
          onClick={() => router.push("/risks")}
          className="text-sm font-semibold text-cyber hover:brightness-110"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
