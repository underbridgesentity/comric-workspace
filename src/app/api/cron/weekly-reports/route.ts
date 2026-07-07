import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { reportTemplates, users } from "@/lib/schema";
import { createAlert } from "@/lib/alert-engine";
import { sendAlertEmail } from "@/lib/email";
import { readTemplateParameters } from "@/lib/report-config";
import { generateReportSync } from "@/lib/report-generate";

export const maxDuration = 300;

/**
 * Weekly scheduled reports (Vercel cron, Mondays 05:00 UTC). Runs every
 * report template whose parameters.schedule is "weekly": generates and
 * persists the report as the template owner, raises a broadcast ai_complete
 * alert, and emails active ops managers (email degrades gracefully).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI reporting is unavailable: ANTHROPIC_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const templates = await db.select().from(reportTemplates);
  const scheduled = templates
    .map((t) => ({ template: t, params: readTemplateParameters(t.parameters) }))
    .filter((t) => t.params.schedule === "weekly" && t.params.builder);

  const opsManagers = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.role, "ops_manager"), eq(users.isActive, true)));

  const dateLabel = new Date().toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  let generated = 0;
  const failures: string[] = [];

  for (const { template, params } of scheduled) {
    try {
      const report = await generateReportSync(params.builder!, template.createdBy, {
        title: `${template.name} - Weekly - ${dateLabel}`,
      });

      const alertTitle = `Weekly report ready: ${template.name}`;
      const alertBody = `The scheduled weekly report "${template.name}" has been generated and is available in Reports and the Archive.`;
      await createAlert({
        type: "ai_complete",
        title: alertTitle,
        body: alertBody,
        severity: "low",
        targetUser: null,
        relatedEntityType: "ai_report",
        relatedEntityId: report.id,
      });

      for (const manager of opsManagers) {
        await sendAlertEmail(manager.email, alertTitle, alertBody).catch(() => false);
      }

      generated++;
    } catch (err) {
      console.error(`weekly report failed for template "${template.name}"`, err);
      failures.push(template.name);
    }
  }

  return NextResponse.json({ generated, failures });
}
