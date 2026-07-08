import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { aiReports, risks, users } from "@/lib/schema";
import {
  builderSchema,
  readReportParameters,
  type BuilderPayload,
  type MetricTable,
} from "@/lib/report-config";
import { assembleMetricTables } from "@/lib/report-data";
import { COMRIC_LOGO_ASPECT } from "@/lib/brand-assets";
import {
  CLASSIFICATION,
  exportFilename,
  formatReportDate,
  logoPngBase64,
  rangeLabel,
  reportTypeLabel,
  severityColor,
} from "@/lib/export-shared";

export const maxDuration = 60;

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1D2331" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
}

/** Solid heat tint for a severity value, as an ExcelJS ARGB string. */
function severityArgb(value: unknown): string | undefined {
  const hex = severityColor(String(value ?? ""));
  return hex ? `FF${hex.slice(1).toUpperCase()}` : undefined;
}

function autoWidth(sheet: ExcelJS.Worksheet, max = 70) {
  sheet.columns.forEach((col) => {
    let width = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len + 2 > width) width = len + 2;
    });
    col.width = Math.min(width, max);
  });
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Sheet";
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) candidate = `${base.slice(0, 25)} ${i++}`;
  used.add(candidate);
  return candidate;
}

/** Column letter for a 1-based index (metric tables are narrow, A-Z is plenty). */
function columnLetter(index: number): string {
  let out = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function addMetricSheet(wb: ExcelJS.Workbook, table: MetricTable, used: Set<string>) {
  const sheet = wb.addWorksheet(sanitizeSheetName(table.title, used));
  styleHeaderRow(sheet.addRow(table.columns));
  if (table.rows.length === 0) {
    sheet.addRow(["No data in scope"]);
  } else {
    for (const row of table.rows) {
      const added = sheet.addRow(row);
      // Tint severity-labelled rows with the heat scale.
      const tint = severityArgb(row[0]);
      if (tint) {
        const cell = added.getCell(1);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tint } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      }
    }
    // Freeze the header row and enable filtering across the data range.
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    if (table.columns.length > 0) {
      sheet.autoFilter = `A1:${columnLetter(table.columns.length)}${table.rows.length + 1}`;
    }
  }
  autoWidth(sheet);
}

/** Fallback default metrics when a report predates the builder snapshot. */
function fallbackPayload(parameters: unknown, reportType: string): BuilderPayload {
  const raw =
    parameters && typeof parameters === "object"
      ? (parameters as Record<string, unknown>)
      : {};
  const legacy = builderSchema.safeParse({
    reportType: reportType === "deep_analysis" ? "risk_summary" : reportType,
    range: typeof raw.range === "string" ? raw.range : "all",
    metrics: ["severity_distribution", "category_breakdown", "response_status"],
    sources: [],
  });
  return legacy.success
    ? legacy.data
    : builderSchema.parse({
        reportType: "risk_summary",
        range: "all",
        metrics: ["severity_distribution", "category_breakdown", "response_status"],
      });
}

/** Render a persisted AI report as an Excel workbook: the report text plus
 *  one sheet per computed metric table (from the stored snapshot, or
 *  regenerated live for legacy reports). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("view", "ai_report");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Report not found.", 404);

  const [row] = await db
    .select({
      id: aiReports.id,
      title: aiReports.title,
      reportType: aiReports.reportType,
      content: aiReports.content,
      parameters: aiReports.parameters,
      createdAt: aiReports.createdAt,
      generatedBy: users.fullName,
    })
    .from(aiReports)
    .leftJoin(users, eq(aiReports.generatedBy, users.id))
    .where(eq(aiReports.id, id))
    .limit(1);

  if (!row) return jsonError("Report not found.", 404);

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "COMRiC Workspace";
    wb.created = row.createdAt;
    const usedNames = new Set<string>();
    const stored = readReportParameters(row.parameters);
    const range = rangeLabel(stored.builder);

    // Sheet 1: logo + report meta + full text.
    const report = wb.addWorksheet(sanitizeSheetName("Report", usedNames));

    // Embed the black logo top-left spanning roughly the first three rows.
    const logoHeight = 58;
    const logoWidth = Math.round(logoHeight * COMRIC_LOGO_ASPECT);
    const logoId = wb.addImage({ base64: logoPngBase64(), extension: "png" });
    report.addImage(logoId, {
      tl: { col: 0.1, row: 0.2 },
      ext: { width: logoWidth, height: logoHeight },
      editAs: "absolute",
    });
    report.addRow([]);
    report.addRow([]);
    report.addRow([]);

    const titleRow = report.addRow([row.title]);
    titleRow.font = { bold: true, size: 16, color: { argb: "FF1D2331" } };
    const classRow = report.addRow([`COMRiC WORKSPACE - ${CLASSIFICATION}`]);
    classRow.font = { bold: true, size: 10, color: { argb: "FF5A6672" } };
    report.addRow([]);
    report.addRow(["Type", reportTypeLabel(row.reportType)]);
    report.addRow(["Generated by", row.generatedBy ?? "Unknown"]);
    report.addRow(["Generated on", formatReportDate(row.createdAt)]);
    if (range) report.addRow(["Date range", range]);
    report.addRow(["Classification", CLASSIFICATION]);
    report.addRow([]);
    styleHeaderRow(report.addRow(["Report content"]));
    for (const line of row.content.split("\n")) {
      report.addRow([line]);
    }
    report.getColumn(1).width = 24;
    report.getColumn(2).width = 60;
    report.getColumn(1).alignment = { vertical: "top", wrapText: false };

    // Metric sheets: reuse the persisted snapshot; otherwise compute live.
    let tables = stored.metrics ?? [];
    if (tables.length === 0) {
      const payload = stored.builder ?? fallbackPayload(row.parameters, row.reportType);
      const withMetrics =
        payload.metrics.length > 0
          ? payload
          : {
              ...payload,
              metrics: [
                "severity_distribution",
                "category_breakdown",
                "response_status",
              ] as BuilderPayload["metrics"],
            };
      tables = await assembleMetricTables(withMetrics).catch(() => []);
    }

    if (tables.length > 0) {
      for (const table of tables) addMetricSheet(wb, table, usedNames);
    } else {
      // Last resort: a Register sheet of current risks so the workbook is
      // never data-free.
      const registerRows = await db
        .select({
          title: risks.title,
          category: risks.category,
          severity: risks.severity,
          status: risks.status,
          createdAt: risks.createdAt,
        })
        .from(risks)
        .orderBy(desc(risks.createdAt))
        .limit(200);
      const sheet = wb.addWorksheet(sanitizeSheetName("Register", usedNames));
      styleHeaderRow(sheet.addRow(["Title", "Category", "Severity", "Status", "Created"]));
      if (registerRows.length === 0) {
        sheet.addRow(["No risks recorded"]);
      } else {
        for (const r of registerRows) {
          const added = sheet.addRow([
            r.title,
            r.category,
            r.severity,
            r.status,
            formatReportDate(r.createdAt),
          ]);
          const tint = severityArgb(r.severity);
          if (tint) {
            const cell = added.getCell(3);
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tint } };
            cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          }
        }
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.autoFilter = `A1:E${registerRows.length + 1}`;
      }
      autoWidth(sheet);
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${exportFilename(row.title, "xlsx")}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("XLSX render failed", err);
    return jsonError("Excel export failed.", 500);
  }
}
