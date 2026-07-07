import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Settings2 } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { researchEntries, scrapeResults, users } from "@/lib/schema";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { ResearchClient } from "./research-client";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const session = await auth();
  const role = session?.user?.role ?? "read_only";

  const [entries, unprocessed] = await Promise.all([
    db
      .select({
        id: researchEntries.id,
        title: researchEntries.title,
        content: researchEntries.content,
        keywords: researchEntries.keywords,
        sourceType: researchEntries.sourceType,
        aiSummary: researchEntries.aiSummary,
        createdAt: researchEntries.createdAt,
        createdBy: users.fullName,
      })
      .from(researchEntries)
      .leftJoin(users, eq(researchEntries.createdBy, users.id))
      .orderBy(desc(researchEntries.createdAt))
      .limit(100),
    db
      .select({ id: scrapeResults.id })
      .from(scrapeResults)
      .where(eq(scrapeResults.processed, false)),
  ]);

  return (
    <div className="animate-rise">
      <PageHeader
        title="Research Engine"
        subtitle="Ingest, curate and AI-analyse sector intelligence from every channel."
        actions={
          <Link
            href="/research/keywords"
            className="inline-flex items-center gap-2 rounded-brand border border-hairline bg-surface px-4 py-2 font-display text-sm font-bold text-ink transition-all duration-150 hover:border-cyber/40 hover:text-cyber"
          >
            <Settings2 className="h-4 w-4" /> Keyword monitoring
          </Link>
        }
      />
      <ResearchClient
        canCreate={can(role, "create", "research")}
        canAnalyse={can(role, "create", "ai_report")}
        unprocessedCount={unprocessed.length}
        entries={entries.map((e) => ({
          id: e.id,
          title: e.title,
          content: e.content,
          keywords: e.keywords,
          sourceType: e.sourceType,
          aiSummary: e.aiSummary,
          createdAt: e.createdAt.toISOString(),
          createdBy: e.createdBy ?? "Unknown",
        }))}
      />
    </div>
  );
}
