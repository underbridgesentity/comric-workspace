import { COMRIC_LOGO_BLACK_DATAURL } from "@/lib/brand-assets";
import { RANGE_LABELS, type BuilderPayload, type MetricTable } from "@/lib/report-config";

/**
 * Shared branding constants and metric/formatting helpers for the report
 * exports (PDF / Word / Excel). Keeps titles, dates, classification and the
 * severity heat scale identical across all three formats.
 */

export const BRAND = {
  cyberGreen: "#8eff00",
  networkGreen: "#006d5b",
  digitalBlue: "#03f8c5",
  deepNavy: "#1d2331",
  slate: "#5a6672",
  hairline: "#d8dee4",
} as const;

export const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#f59e0b",
  medium: "#eab308",
  low: "#6b7280",
};

export const CLASSIFICATION = "Internal - Confidential";

/** Heat-scale colour for a severity label, or undefined when not a severity. */
export function severityColor(label: string): string | undefined {
  return SEVERITY_COLORS[label.trim().toLowerCase()];
}

/** Consistent en-ZA date, e.g. "07 Jul 2026". */
export function formatReportDate(date: Date): string {
  return date.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Human date-range label from a builder snapshot, if available. */
export function rangeLabel(builder: Partial<BuilderPayload> | undefined): string | null {
  const range = builder?.range;
  return range && range in RANGE_LABELS ? RANGE_LABELS[range as BuilderPayload["range"]] : null;
}

/** A GitHub-style markdown table parsed from AI report content. */
export type ParsedTable = { columns: string[]; rows: string[][] };

const SEPARATOR_CELL = /^:?-{2,}:?$/;

/** Split a pipe-delimited line into trimmed cells, dropping empty cells. */
function splitPipeCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c !== "");
}

/** True when a line looks like the start/continuation of a markdown table. */
export function isMarkdownTableLine(line: string): boolean {
  return line.trim().startsWith("|") && splitPipeCells(line).length >= 2;
}

/**
 * Parse a run of consecutive pipe lines into a table. Handles the normal
 * header / separator / rows layout as well as the degenerate case where the
 * whole table is emitted on one or two lines (header, separator and rows
 * concatenated): the embedded `---` separator cells mark the end of the
 * header, and remaining cells are chunked into rows of the header's width.
 * Ragged rows are padded / split; returns null (never throws) when the
 * candidate cannot be parsed into at least 2 columns and 1 row.
 */
export function parseMarkdownTable(lines: string[]): ParsedTable | null {
  try {
    const perLine = lines.map(splitPipeCells).filter((cells) => cells.length > 0);
    if (perLine.length === 0) return null;

    let columns = perLine[0];
    let bodyLines = perLine.slice(1);

    const sepIdx = columns.findIndex((c) => SEPARATOR_CELL.test(c));
    if (sepIdx !== -1) {
      // Degenerate single-line table: header, separator and rows on one line.
      if (sepIdx < 2) return null;
      let i = sepIdx;
      while (i < columns.length && SEPARATOR_CELL.test(columns[i])) i++;
      bodyLines = [columns.slice(i), ...bodyLines];
      columns = columns.slice(0, sepIdx);
    }
    if (columns.length < 2) return null;

    const width = columns.length;
    const pad = (cells: string[]): string[] => {
      const row = cells.slice(0, width);
      while (row.length < width) row.push("");
      return row;
    };

    const rows: string[][] = [];
    for (const lineCells of bodyLines) {
      const cells = lineCells.filter((c) => !SEPARATOR_CELL.test(c));
      if (cells.length === 0) continue;
      if (cells.length <= width) {
        rows.push(pad(cells));
      } else {
        // Multiple rows concatenated on one line: chunk by header width.
        for (let i = 0; i < cells.length; i += width) {
          rows.push(pad(cells.slice(i, i + width)));
        }
      }
    }
    if (rows.length === 0) return null;
    return { columns, rows };
  } catch {
    return null;
  }
}

/** Strip **bold** / __bold__ markers from a table cell. */
export function stripCellBold(cell: string): string {
  return cell.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
}

/**
 * Per-column numeric flags: true when every non-empty body cell in the
 * column parses as a number (commas / percent signs allowed).
 */
export function numericColumns(table: ParsedTable): boolean[] {
  return table.columns.map((_, j) => {
    let hasValue = false;
    for (const row of table.rows) {
      const cell = stripCellBold(row[j] ?? "").trim();
      if (!cell) continue;
      if (!Number.isFinite(Number(cell.replace(/[,%\s]/g, "")))) return false;
      hasValue = true;
    }
    return hasValue;
  });
}

/** One bar of a simple horizontal bar chart. */
export type BarDatum = { label: string; value: number };

/**
 * Reduce a metric table to bar-chart data: first cell is the label, the first
 * numeric cell after it is the value. Returns [] when the table has no usable
 * numeric rows (caller should then fall back to a plain table or skip).
 */
export function toBarData(table: MetricTable): BarDatum[] {
  const out: BarDatum[] = [];
  for (const row of table.rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const label = String(row[0] ?? "").trim();
    if (!label) continue;
    let value: number | null = null;
    for (const cell of row.slice(1)) {
      const n = typeof cell === "number" ? cell : Number(String(cell).replace(/[,%\s]/g, ""));
      if (Number.isFinite(n)) {
        value = n;
        break;
      }
    }
    if (value === null || value < 0) continue;
    out.push({ label, value });
  }
  return out;
}

/** Split metric tables into the chartable ones and the rest. */
export function splitMetricTables(tables: MetricTable[]): {
  severity: MetricTable | null;
  category: MetricTable | null;
  others: MetricTable[];
} {
  let severity: MetricTable | null = null;
  let category: MetricTable | null = null;
  const others: MetricTable[] = [];
  for (const table of tables) {
    if (!severity && table.key === "severity_distribution") severity = table;
    else if (!category && table.key === "category_breakdown") category = table;
    else others.push(table);
  }
  return { severity, category, others };
}

/** Decode the embedded logo data URL to raw PNG bytes (for docx/exceljs). */
export function logoPngBytes(): Uint8Array {
  const base64 = COMRIC_LOGO_BLACK_DATAURL.split(",")[1] ?? "";
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

/** Raw base64 payload of the logo (exceljs addImage wants bare base64). */
export function logoPngBase64(): string {
  return COMRIC_LOGO_BLACK_DATAURL.split(",")[1] ?? "";
}

/** Consistent human label for a report type ("risk_summary" -> "risk summary"). */
export function reportTypeLabel(reportType: string): string {
  return reportType.replace(/_/g, " ");
}

/** Consistent export filename base from the report title. */
export function exportFilename(title: string, ext: string): string {
  return `${title.replace(/[^\w\d-]+/g, "-").replace(/-+/g, "-").toLowerCase()}.${ext}`;
}
