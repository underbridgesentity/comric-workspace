import React from "react";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { aiReports, users } from "@/lib/schema";
import { ReportPdf } from "./report-pdf";

export const maxDuration = 60;

/** Render a persisted AI report as a branded, downloadable PDF. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("view", "ai_report");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  const [row] = await db
    .select({
      id: aiReports.id,
      title: aiReports.title,
      content: aiReports.content,
      createdAt: aiReports.createdAt,
      generatedBy: users.fullName,
    })
    .from(aiReports)
    .leftJoin(users, eq(aiReports.generatedBy, users.id))
    .where(eq(aiReports.id, id))
    .limit(1);

  if (!row) return jsonError("Report not found.", 404);

  try {
    const buffer = await renderToBuffer(
      React.createElement(ReportPdf, {
        title: row.title,
        content: row.content,
        generatedBy: row.generatedBy ?? "COMRiC Workspace",
        generatedAt: row.createdAt.toLocaleDateString("en-ZA", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      }),
    );

    const filename = `${row.title.replace(/[^\w\d-]+/g, "-").replace(/-+/g, "-").toLowerCase()}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("PDF render failed", err);
    return jsonError("PDF generation failed.", 500);
  }
}
