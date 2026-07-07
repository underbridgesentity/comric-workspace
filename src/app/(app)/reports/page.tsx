import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Archive } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { aiReports, reportTemplates, users } from "@/lib/schema";
import { can } from "@/lib/permissions";
import { readReportParameters } from "@/lib/report-config";
import { PageHeader } from "@/components/ui";
import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "read_only";

  const [recent, templates] = await Promise.all([
    db
      .select({
        id: aiReports.id,
        title: aiReports.title,
        reportType: aiReports.reportType,
        createdAt: aiReports.createdAt,
        generatedBy: users.fullName,
      })
      .from(aiReports)
      .leftJoin(users, eq(aiReports.generatedBy, users.id))
      .orderBy(desc(aiReports.createdAt))
      .limit(8),
    db
      .select({
        id: reportTemplates.id,
        name: reportTemplates.name,
        description: reportTemplates.description,
        parameters: reportTemplates.parameters,
        createdBy: users.fullName,
      })
      .from(reportTemplates)
      .leftJoin(users, eq(reportTemplates.createdBy, users.id))
      .orderBy(desc(reportTemplates.createdAt))
      .limit(50),
  ]);

  return (
    <div className="animate-rise">
      <PageHeader
        title="Report Builder"
        subtitle="Configure metrics, sources and scope — AI authors a board-ready report from live platform data."
        actions={
          <Link
            href="/archive"
            className="inline-flex items-center gap-2 rounded-brand border border-hairline bg-surface px-4 py-2 font-display text-sm font-bold text-ink transition-all duration-150 hover:border-cyber/40 hover:text-cyber"
          >
            <Archive className="h-4 w-4" /> View archive
          </Link>
        }
      />
      <ReportsClient
        canGenerate={can(role, "create", "ai_report")}
        canDeleteTemplates={can(role, "delete", "ai_report")}
        templates={templates
          .map((t) => {
            const params = readReportParameters({ builder: t.parameters }).builder;
            return params
              ? {
                  id: t.id,
                  name: t.name,
                  description: t.description,
                  createdBy: t.createdBy ?? "Unknown",
                  parameters: params,
                }
              : null;
          })
          .filter((t): t is NonNullable<typeof t> => t !== null)}
        recent={recent.map((r) => ({
          id: r.id,
          title: r.title,
          reportType: r.reportType,
          createdAt: r.createdAt.toISOString(),
          generatedBy: r.generatedBy ?? "Unknown",
        }))}
      />
    </div>
  );
}
