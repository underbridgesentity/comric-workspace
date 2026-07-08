import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { guard, jsonError } from "@/lib/api";
import { parseWindow } from "@/lib/date-range";
import { CATEGORY_LABELS, getAnalyticsData, parseCategory } from "@/lib/analytics-data";

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

function addDataSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: string[],
  rows: (string | number)[][],
) {
  const sheet = wb.addWorksheet(name);
  styleHeaderRow(sheet.addRow(columns));
  if (rows.length === 0) {
    sheet.addRow(["No data in scope"]);
  } else {
    for (const row of rows) sheet.addRow(row);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const lastCol = String.fromCharCode(64 + columns.length);
    sheet.autoFilter = `A1:${lastCol}${rows.length + 1}`;
  }
  autoWidth(sheet);
}

/** Excel export of every analytics dataset for the requested scope. */
export async function GET(request: Request) {
  const g = await guard("view", "dashboard");
  if (g.error) return g.error;

  const url = new URL(request.url);
  const window = parseWindow(
    {
      range: url.searchParams.get("range") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    },
    "90d",
  );
  const category = parseCategory(url.searchParams.get("category") ?? undefined);

  try {
    const data = await getAnalyticsData(window, category);

    const wb = new ExcelJS.Workbook();
    wb.creator = "COMRiC Workspace";
    wb.created = new Date();

    // Summary sheet describing the export scope.
    const summary = wb.addWorksheet("Summary");
    const titleRow = summary.addRow(["COMRiC Workspace - Analytics Export"]);
    titleRow.font = { bold: true, size: 14, color: { argb: "FF1D2331" } };
    summary.addRow([]);
    summary.addRow(["Date range", window.label]);
    summary.addRow(["Risk category", category ? CATEGORY_LABELS[category] : "All categories"]);
    summary.addRow([
      "Generated",
      new Date().toLocaleString("en-ZA", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    ]);
    summary.getColumn(1).width = 18;
    summary.getColumn(2).width = 40;
    summary.getColumn(1).font = { bold: true };
    summary.getRow(1).font = { bold: true, size: 14, color: { argb: "FF1D2331" } };

    addDataSheet(
      wb,
      "Severity",
      ["Severity", "Risks"],
      data.severityData.map((d) => [d.name, d.value]),
    );
    addDataSheet(
      wb,
      "Categories",
      ["Category", "Risks"],
      data.categoryData.map((d) => [d.name, d.value]),
    );
    addDataSheet(
      wb,
      "Risks over time",
      ["Period ending", "Risks logged"],
      data.weeklyData.map((d) => [d.week, d.risks]),
    );
    addDataSheet(
      wb,
      "Top keywords",
      ["Keyword", "Matches"],
      data.keywordData.map((d) => [d.name, d.value]),
    );
    addDataSheet(
      wb,
      "Scrape volume",
      ["Period ending", "Results"],
      data.scrapeVolume.map((d) => [d.day, d.results]),
    );

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="analytics-${window.key}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("Analytics export failed", err);
    return jsonError("Excel export failed.", 500);
  }
}
