import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Archive } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { aiReports, users } from "@/lib/schema";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "read_only";

  const recent = await db
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
    .limit(8);

  return (
    <div className="animate-rise">
      <PageHeader
        title="Report Generation"
        subtitle="AI-authored, board-ready reports built from live platform data."
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
