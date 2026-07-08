import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { ExternalLink, FileText, Radar, MessageSquare, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import {
  aiReports,
  documents,
  riskNotes,
  risks,
  sectorIntelligence,
  users,
} from "@/lib/schema";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { Card, PageHeader, SeverityBadge, StatusBadge } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { AddNoteForm, DeepAnalysisButton, InlineRiskSelect } from "./risk-detail-controls";

const dateFmt: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export default async function RiskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const session = await auth();
  const role = session?.user?.role ?? "read_only";

  const [risk] = await db.select().from(risks).where(eq(risks.id, id)).limit(1);
  if (!risk) notFound();

  const [notes, docs, intel, reports] = await Promise.all([
    db
      .select({ note: riskNotes, authorName: users.fullName })
      .from(riskNotes)
      .leftJoin(users, eq(riskNotes.createdBy, users.id))
      .where(eq(riskNotes.riskId, id))
      .orderBy(desc(riskNotes.createdAt)),
    db.select().from(documents).where(eq(documents.linkedRiskId, id)).orderBy(desc(documents.createdAt)),
    db
      .select()
      .from(sectorIntelligence)
      .where(eq(sectorIntelligence.linkedRiskId, id))
      .orderBy(desc(sectorIntelligence.createdAt)),
    db
      .select()
      .from(aiReports)
      .where(eq(aiReports.relatedRiskId, id))
      .orderBy(desc(aiReports.createdAt)),
  ]);

  const peopleIds = [risk.createdBy, risk.responsibleParty].filter((v): v is string => !!v);
  const people = peopleIds.length
    ? await db
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(inArray(users.id, peopleIds))
    : [];
  const nameOf = (uid: string | null) => people.find((p) => p.id === uid)?.name ?? "-";

  const canUpdate = can(role, "update", "risk");
  const canNote = can(role, "create", "risk_note");
  const canAnalyse = can(role, "create", "ai_report");

  return (
    <div className="animate-rise">
      <PageHeader
        title={risk.title}
        subtitle={`Registered by ${nameOf(risk.createdBy)} on ${risk.createdAt.toLocaleDateString("en-ZA", dateFmt)}`}
        actions={
          <div className="flex items-center gap-2">
            <SeverityBadge severity={risk.severity} />
            <StatusBadge status={risk.status} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-2 font-display text-sm font-bold tracking-wider text-muted uppercase">
              Description
            </h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink/90">
              {risk.description}
            </p>
            {risk.keywords.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {risk.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-[4px] border border-hairline bg-canvas px-2 py-0.5 text-xs text-muted"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-bold tracking-wider text-muted uppercase">
              <Sparkles className="h-4 w-4" /> AI Deep Analysis
            </h2>
            <p className="mb-3 text-sm text-muted">
              Correlates this risk with its notes, linked intelligence, monitoring hits and
              documents to surface patterns, escalation outlook and recommended responses.
            </p>
            {canAnalyse ? (
              <DeepAnalysisButton riskId={risk.id} />
            ) : (
              <p className="text-sm text-muted">Your role cannot generate AI reports.</p>
            )}
            {reports.length > 0 && (
              <div className="mt-5 space-y-4 border-t border-hairline pt-4">
                <p className="font-display text-xs font-bold tracking-wider text-muted uppercase">
                  Past analyses ({reports.length})
                </p>
                {reports.map((r) => (
                  <details key={r.id} className="group rounded-brand border border-hairline bg-canvas">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink transition-colors hover:text-cyber">
                      {r.title}{" "}
                      <span className="ml-2 text-xs font-normal text-muted">
                        {r.createdAt.toLocaleDateString("en-ZA", dateFmt)}
                      </span>
                    </summary>
                    <div className="border-t border-hairline px-4 py-3">
                      <Markdown content={r.content} />
                    </div>
                  </details>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-bold tracking-wider text-muted uppercase">
              <MessageSquare className="h-4 w-4" /> Notes ({notes.length})
            </h2>
            {notes.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}
            <div className="space-y-3">
              {notes.map(({ note, authorName }) => (
                <div key={note.id} className="rounded-brand border border-hairline bg-canvas p-3">
                  <p className="text-sm whitespace-pre-wrap text-ink/90">{note.body}</p>
                  <p className="mt-2 text-xs text-muted">
                    {authorName ?? "Unknown"} · {note.createdAt.toLocaleDateString("en-ZA", dateFmt)}
                  </p>
                </div>
              ))}
            </div>
            {canNote && <AddNoteForm riskId={risk.id} />}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-sm font-bold tracking-wider text-muted uppercase">
              Record
            </h2>
            <div className="space-y-4">
              {canUpdate ? (
                <div className="flex gap-3">
                  <InlineRiskSelect
                    riskId={risk.id}
                    field="severity"
                    value={risk.severity}
                    options={["critical", "high", "medium", "low"]}
                    label="Severity"
                  />
                  <InlineRiskSelect
                    riskId={risk.id}
                    field="status"
                    value={risk.status}
                    options={["open", "monitoring", "mitigating", "resolved", "closed"]}
                    label="Status"
                  />
                </div>
              ) : null}
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-display text-[11px] font-bold tracking-wider text-muted uppercase">Category</dt>
                  <dd className="text-ink capitalize">{risk.category}</dd>
                </div>
                <div>
                  <dt className="font-display text-[11px] font-bold tracking-wider text-muted uppercase">Responsible party</dt>
                  <dd className="text-ink">{nameOf(risk.responsibleParty)}</dd>
                </div>
                <div>
                  <dt className="font-display text-[11px] font-bold tracking-wider text-muted uppercase">Source</dt>
                  <dd className="text-ink capitalize">
                    {risk.source.replace(/_/g, " ")}
                    {risk.sourceUrl && (
                      <a
                        href={risk.sourceUrl}
                        target={risk.sourceUrl.startsWith("/") ? undefined : "_blank"}
                        rel="noreferrer"
                        className="ml-2 inline-flex items-center gap-1 text-cyber normal-case hover:brightness-110"
                      >
                        {risk.sourceUrl.startsWith("/documents/")
                          ? "view source document"
                          : (() => {
                              try {
                                return `via ${new URL(risk.sourceUrl).hostname.replace(/^www\./, "")}`;
                              } catch {
                                return "view source";
                              }
                            })()}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-[11px] font-bold tracking-wider text-muted uppercase">Last updated</dt>
                  <dd className="text-ink">{risk.updatedAt.toLocaleDateString("en-ZA", dateFmt)}</dd>
                </div>
              </dl>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold tracking-wider text-muted uppercase">
              <FileText className="h-4 w-4" /> Linked documents ({docs.length})
            </h2>
            {docs.length === 0 ? (
              <p className="text-sm text-muted">No documents linked.</p>
            ) : (
              <ul className="space-y-2">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link href="/documents" className="text-sm font-semibold text-ink transition-colors hover:text-cyber">
                      {d.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {d.fileType} · {(d.fileSize / 1024).toFixed(0)} KB · {d.category}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold tracking-wider text-muted uppercase">
              <Radar className="h-4 w-4" /> Linked intelligence ({intel.length})
            </h2>
            {intel.length === 0 ? (
              <p className="text-sm text-muted">No intelligence linked.</p>
            ) : (
              <ul className="space-y-3">
                {intel.map((i) => (
                  <li key={i.id} className="rounded-brand border border-hairline bg-canvas p-3">
                    <p className="text-sm font-semibold text-ink">{i.title}</p>
                    <p className="mt-1 line-clamp-3 text-xs text-muted">{i.summary}</p>
                    <p className="mt-1 text-xs text-muted">
                      {i.incidentType}
                      {i.location ? ` · ${i.location}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
