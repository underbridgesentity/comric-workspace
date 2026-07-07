import Link from "next/link";
import { and, desc, eq, ilike, or, inArray, sql } from "drizzle-orm";
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  FileCode,
  FolderOpen,
  Link2,
  Sparkles,
} from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documents, documentAnalyses, users, risks } from "@/lib/schema";
import { can } from "@/lib/permissions";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  UploadPanel,
  DocumentRowActions,
  DocumentSearch,
} from "./documents-client";
import { DOCUMENT_CATEGORIES } from "./categories";

export const dynamic = "force-dynamic";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function FileIcon({ ext }: { ext: string }) {
  const cls = "h-4.5 w-4.5";
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

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const role = session?.user?.role ?? "read_only";

  const category =
    params.category && (DOCUMENT_CATEGORIES as readonly string[]).includes(params.category)
      ? params.category
      : undefined;
  const q = params.q?.trim() || undefined;

  const conditions = [];
  if (category) conditions.push(eq(documents.category, category));
  if (q) {
    conditions.push(
      or(ilike(documents.name, `%${q}%`), ilike(documents.description, `%${q}%`)),
    );
  }

  let rows: {
    id: string;
    name: string;
    description: string | null;
    fileType: string;
    fileSize: number;
    category: string;
    createdAt: Date;
    uploaderName: string | null;
    riskId: string | null;
    riskTitle: string | null;
  }[] = [];
  let openRisks: { id: string; title: string }[] = [];
  let analysedIds = new Set<string>();
  let loadError = false;

  try {
    let analysisRows: { documentId: string }[] = [];
    [rows, openRisks, analysisRows] = await Promise.all([
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
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(documents.createdAt)),
      db
        .select({ id: risks.id, title: risks.title })
        .from(risks)
        .where(inArray(risks.status, ["open", "monitoring", "mitigating"]))
        .orderBy(desc(risks.createdAt)),
      db
        .select({ documentId: documentAnalyses.documentId })
        .from(documentAnalyses)
        .groupBy(documentAnalyses.documentId)
        .having(sql`count(*) > 0`),
    ]);
    analysedIds = new Set(analysisRows.map((a) => a.documentId));
  } catch (err) {
    console.error("documents query failed", err);
    loadError = true;
  }

  const canUpload = can(role, "create", "document");
  const canDelete = can(role, "delete", "document");
  const canAnalyse = can(role, "create", "research");

  const filterHref = (c?: string) => {
    const p = new URLSearchParams();
    if (c) p.set("category", c);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/documents?${s}` : "/documents";
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="Document Hub"
        subtitle="Central repository for policies, reports and risk evidence"
        actions={
          <>
            <DocumentSearch initialQuery={q ?? ""} />
            {canUpload && <UploadPanel openRisks={openRisks} />}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link
          href={filterHref()}
          className={`rounded-brand border px-3 py-1.5 font-display text-xs font-bold tracking-wide uppercase transition-colors ${
            !category
              ? "border-cyber/50 bg-cyber/10 text-cyber"
              : "border-hairline text-muted hover:border-cyber/40 hover:text-ink"
          }`}
        >
          All
        </Link>
        {DOCUMENT_CATEGORIES.map((c) => (
          <Link
            key={c}
            href={filterHref(c)}
            className={`rounded-brand border px-3 py-1.5 font-display text-xs font-bold tracking-wide uppercase transition-colors ${
              category === c
                ? "border-cyber/50 bg-cyber/10 text-cyber"
                : "border-hairline text-muted hover:border-cyber/40 hover:text-ink"
            }`}
          >
            {c}
          </Link>
        ))}
      </div>

      <Card>
        {loadError ? (
          <EmptyState
            icon={<FolderOpen />}
            title="Documents could not be loaded"
            hint="The database is unreachable. Refresh the page or try again shortly."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FolderOpen />}
            title={q || category ? "No documents match your filters" : "No documents yet"}
            hint={
              q || category
                ? "Adjust the search or category filter."
                : canUpload
                  ? "Upload the first document to start the repository."
                  : "Documents uploaded by the team will appear here."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left font-display text-[11px] font-bold tracking-wider text-muted uppercase">
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Linked risk</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Uploaded by</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-b border-hairline/60 last:border-0 hover:bg-ink/[0.02] dark:hover:bg-white/[0.02]"
                  >
                    <td className="max-w-md px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 shrink-0">
                          <FileIcon ext={doc.fileType} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/documents/${doc.id}`}
                              className="truncate font-display font-bold text-ink transition-colors hover:text-cyber"
                            >
                              {doc.name}
                            </Link>
                            {analysedIds.has(doc.id) && (
                              <span
                                className="inline-flex shrink-0 items-center gap-1 rounded-[4px] border border-cyber/40 bg-cyber/10 px-1.5 py-0.5 font-display text-[10px] font-bold tracking-wide text-cyber uppercase"
                                title="AI analysis available"
                              >
                                <Sparkles className="h-2.5 w-2.5" /> AI
                              </span>
                            )}
                          </div>
                          {doc.description && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                              {doc.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-[4px] border border-hairline bg-canvas px-2 py-0.5 font-display text-[11px] font-bold tracking-wide text-muted uppercase">
                        {doc.category}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      {doc.riskId ? (
                        <Link
                          href={`/risks/${doc.riskId}`}
                          className="inline-flex max-w-full items-center gap-1 rounded-[4px] border border-digital/30 bg-digital/10 px-2 py-0.5 text-[11px] font-bold text-digital transition-colors hover:border-digital/60"
                        >
                          <Link2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{doc.riskTitle}</span>
                        </Link>
                      ) : (
                        <span className="text-xs text-muted/60">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {humanSize(doc.fileSize)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {doc.uploaderName ?? "Unknown"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDate(doc.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <DocumentRowActions
                        id={doc.id}
                        name={doc.name}
                        canDelete={canDelete}
                        canAnalyse={
                          canAnalyse &&
                          ["pdf", "docx", "xlsx", "csv", "txt", "md"].includes(doc.fileType)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
