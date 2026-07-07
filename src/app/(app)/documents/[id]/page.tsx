import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  ArrowLeft,
  Download,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  FileCode,
  Link2,
} from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documentAnalyses, documents, risks, users } from "@/lib/schema";
import { can } from "@/lib/permissions";
import { Card, PageHeader } from "@/components/ui";
import { AnalysisSection, type SerializedAnalysis } from "./analysis-client";

export const dynamic = "force-dynamic";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FileIcon({ ext }: { ext: string }) {
  const cls = "h-6 w-6";
  switch (ext) {
    case "pdf":
      return <FileText className={`${cls} text-sev-critical/80`} />;
    case "docx":
      return <FileText className={`${cls} text-digital/80`} />;
    case "xlsx":
    case "csv":
      return <FileSpreadsheet className={`${cls} text-network`} />;
    case "png":
    case "jpg":
      return <FileImage className={`${cls} text-sev-high/80`} />;
    case "md":
      return <FileCode className={`${cls} text-muted`} />;
    default:
      return <File className={`${cls} text-muted`} />;
  }
}

const ANALYSABLE = ["pdf", "docx", "xlsx", "csv", "txt", "md"];

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, { id }] = await Promise.all([auth(), params]);
  const role = session?.user?.role ?? "read_only";

  if (!z.uuid().safeParse(id).success) notFound();

  const [rows, analyses] = await Promise.all([
    db
      .select({
        id: documents.id,
        name: documents.name,
        description: documents.description,
        fileType: documents.fileType,
        fileSize: documents.fileSize,
        category: documents.category,
        createdAt: documents.createdAt,
        uploaderName: users.fullName,
        riskId: risks.id,
        riskTitle: risks.title,
      })
      .from(documents)
      .leftJoin(users, eq(documents.uploadedBy, users.id))
      .leftJoin(risks, eq(documents.linkedRiskId, risks.id))
      .where(eq(documents.id, id))
      .limit(1),
    db
      .select()
      .from(documentAnalyses)
      .where(eq(documentAnalyses.documentId, id))
      .orderBy(desc(documentAnalyses.createdAt)),
  ]);

  const doc = rows[0];
  if (!doc) notFound();

  const canAnalyse = can(role, "create", "research") && ANALYSABLE.includes(doc.fileType);
  const canCommit = can(role, "create", "risk");

  const serialized: SerializedAnalysis[] = analyses.map((a) => ({
    id: a.id,
    status: a.status,
    summary: a.summary,
    proposals: a.proposals as SerializedAnalysis["proposals"],
    committedAt: a.committedAt ? a.committedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div className="animate-rise">
      <PageHeader
        title={doc.name}
        subtitle="Document detail and AI analysis"
        actions={
          <>
            <Link
              href="/documents"
              className="inline-flex items-center gap-1.5 rounded-brand border border-hairline bg-surface px-3 py-2 font-display text-sm font-bold text-ink transition-colors hover:border-cyber/40 hover:text-cyber"
            >
              <ArrowLeft className="h-4 w-4" /> All documents
            </Link>
            <a
              href={`/api/documents/${doc.id}`}
              className="inline-flex items-center gap-1.5 rounded-brand bg-cyber px-4 py-2 font-display text-sm font-bold text-black transition-all hover:brightness-110"
            >
              <Download className="h-4 w-4" /> Download
            </a>
          </>
        }
      />

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="mt-0.5 shrink-0 rounded-brand border border-hairline bg-canvas p-3">
            <FileIcon ext={doc.fileType} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-black tracking-tight text-ink">{doc.name}</p>
            {doc.description && <p className="mt-1 text-sm text-muted">{doc.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
              <span className="rounded-[4px] border border-hairline bg-canvas px-2 py-0.5 font-display text-[11px] font-bold tracking-wide uppercase">
                {doc.category}
              </span>
              <span className="font-display font-bold uppercase">.{doc.fileType}</span>
              <span>{humanSize(doc.fileSize)}</span>
              <span>Uploaded by {doc.uploaderName ?? "Unknown"}</span>
              <span>{formatDate(doc.createdAt)}</span>
              {doc.riskId && (
                <Link
                  href={`/risks/${doc.riskId}`}
                  className="inline-flex items-center gap-1 rounded-[4px] border border-digital/30 bg-digital/10 px-2 py-0.5 text-[11px] font-bold text-digital transition-colors hover:border-digital/60"
                >
                  <Link2 className="h-3 w-3" />
                  <span className="max-w-[240px] truncate">{doc.riskTitle}</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </Card>

      <AnalysisSection
        documentId={doc.id}
        documentName={doc.name}
        analyses={serialized}
        canAnalyse={canAnalyse}
        canCommit={canCommit}
        fileType={doc.fileType}
      />
    </div>
  );
}
