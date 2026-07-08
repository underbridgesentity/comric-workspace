import React from "react";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { aiReports, users } from "@/lib/schema";
import { readReportParameters } from "@/lib/report-config";
import {
  exportFilename,
  formatReportDate,
  rangeLabel,
  reportTypeLabel,
} from "@/lib/export-shared";
import { ReportPdf } from "./report-pdf";

export const maxDuration = 60;

/** Render a persisted AI report as a branded, downloadable PDF. */
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
    const stored = readReportParameters(row.parameters);
    const buffer = await renderToBuffer(
      React.createElement(ReportPdf, {
        title: row.title,
        reportType: reportTypeLabel(row.reportType),
        content: row.content,
        generatedBy: row.generatedBy ?? "COMRiC Workspace",
        generatedAt: formatReportDate(row.createdAt),
        dateRange: rangeLabel(stored.builder),
        metrics: stored.metrics ?? [],
      }),
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${exportFilename(row.title, "pdf")}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("PDF render failed", err);
    return jsonError("PDF generation failed.", 500);
  }
}
