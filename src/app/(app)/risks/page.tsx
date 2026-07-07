import Link from "next/link";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { ShieldAlert, ArrowUp, ArrowDown } from "lucide-react";
import { db } from "@/lib/db";
import {
  risks,
  users,
  type RiskCategory,
  type RiskStatus,
  type Severity,
} from "@/lib/schema";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { Card, EmptyState, PageHeader, SeverityBadge, StatusBadge } from "@/components/ui";
import { RiskFilters } from "./risk-filters";
import { NewRiskButton } from "./new-risk-button";

const CATEGORIES = ["infrastructure", "cyber", "crime", "regulatory", "operational", "other"];
const SEVERITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["open", "monitoring", "mitigating", "resolved", "closed"];
const SOURCES = ["web_scrape", "partner_report", "manual"];

const severityRank = sql<number>`case ${risks.severity} when 'critical' then 3 when 'high' then 2 when 'medium' then 1 else 0 end`;

function SortHeader({
  label,
  field,
  params,
}: {
  label: string;
  field: string;
  params: Record<string, string>;
}) {
  const active = (params.sort ?? "updated") === field;
  const dir = active && params.dir === "asc" ? "asc" : "desc";
  const nextDir = active && dir === "desc" ? "asc" : "desc";
  const qs = new URLSearchParams({ ...params, sort: field, dir: nextDir });
  return (
    <Link
      href={`/risks?${qs.toString()}`}
      className={`inline-flex items-center gap-1 transition-colors hover:text-cyber ${active ? "text-cyber" : ""}`}
    >
      {label}
      {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </Link>
  );
}

export default async function RisksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? "read_only";
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const q = get("q");
  const category = get("category");
  const severity = get("severity");
  const status = get("status");
  const responsible = get("responsible");
  const source = get("source");
  const sort = get("sort") || "updated";
  const dir = get("dir") === "asc" ? "asc" : "desc";

  const where: SQL[] = [];
  if (q) where.push(or(ilike(risks.title, `%${q}%`), ilike(risks.description, `%${q}%`))!);
  if (CATEGORIES.includes(category)) where.push(eq(risks.category, category as RiskCategory));
  if (SEVERITIES.includes(severity)) where.push(eq(risks.severity, severity as Severity));
  if (STATUSES.includes(status)) where.push(eq(risks.status, status as RiskStatus));
  if (responsible) where.push(eq(risks.responsibleParty, responsible));
  if (SOURCES.includes(source))
    where.push(eq(risks.source, source as "web_scrape" | "partner_report" | "manual"));

  const orderExpr =
    sort === "severity"
      ? dir === "asc"
        ? asc(severityRank)
        : desc(severityRank)
      : sort === "title"
        ? dir === "asc"
          ? asc(risks.title)
          : desc(risks.title)
        : dir === "asc"
          ? asc(risks.updatedAt)
          : desc(risks.updatedAt);

  const [rows, allUsers] = await Promise.all([
    db
      .select({
        risk: risks,
        responsibleName: users.fullName,
      })
      .from(risks)
      .leftJoin(users, eq(risks.responsibleParty, users.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(orderExpr, desc(risks.updatedAt))
      .limit(200),
    db
      .select({ id: users.id, name: users.fullName })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.fullName)),
  ]);

  const plainParams: Record<string, string> = {};
  for (const k of ["q", "category", "severity", "status", "responsible", "source"]) {
    if (get(k)) plainParams[k] = get(k);
  }

  return (
    <div className="animate-rise">
      <PageHeader
        title="Risk Register"
        subtitle="All identified sector risks, filterable and searchable"
        actions={can(role, "create", "risk") ? <NewRiskButton users={allUsers} /> : undefined}
      />
      <RiskFilters responsibleOptions={allUsers} />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert />}
            title="No risks match"
            hint="Try broadening your filters or search terms."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline font-display text-[11px] font-bold tracking-wider text-muted uppercase">
                  <th className="px-4 py-3">
                    <SortHeader label="Title" field="title" params={plainParams} />
                  </th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">
                    <SortHeader label="Severity" field="severity" params={plainParams} />
                  </th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Responsible</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">
                    <SortHeader label="Updated" field="updated" params={plainParams} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ risk, responsibleName }) => (
                  <tr
                    key={risk.id}
                    className="relative border-b border-hairline transition-colors last:border-0 hover:bg-ink/[0.03] dark:hover:bg-white/[0.03]"
                  >
                    <td className="max-w-xs px-4 py-3">
                      <Link
                        href={`/risks/${risk.id}`}
                        className="font-semibold text-ink before:absolute before:inset-0"
                      >
                        {risk.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted capitalize">{risk.category}</td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={risk.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={risk.status} />
                    </td>
                    <td className="px-4 py-3 text-muted">{responsibleName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted capitalize">
                      {risk.source.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {risk.updatedAt.toLocaleDateString("en-ZA", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
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
