import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Activity, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { risks, users, type Severity } from "@/lib/schema";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import {
  Card,
  EmptyState,
  PageHeader,
  SeverityBadge,
  StatusBadge,
  SEVERITY_COLORS,
} from "@/components/ui";
import { QuickStatusSelect } from "./quick-status";

const ACTIVE_STATUSES = ["open", "monitoring", "mitigating"] as const;

export default async function MonitoringPage() {
  const session = await auth();
  const role = session?.user?.role ?? "read_only";
  const canUpdate = can(role, "update", "risk");

  const [rows, counts] = await Promise.all([
    db
      .select({ risk: risks, responsibleName: users.fullName })
      .from(risks)
      .leftJoin(users, eq(risks.responsibleParty, users.id))
      .where(
        and(
          inArray(risks.status, [...ACTIVE_STATUSES]),
          inArray(risks.severity, ["high", "critical"]),
        ),
      )
      .orderBy(
        sql`case ${risks.severity} when 'critical' then 0 else 1 end`,
        desc(risks.updatedAt),
      ),
    db
      .select({ severity: risks.severity, count: sql<number>`count(*)::int` })
      .from(risks)
      .where(inArray(risks.status, [...ACTIVE_STATUSES]))
      .groupBy(risks.severity),
  ]);

  const countOf = (s: Severity) => counts.find((c) => c.severity === s)?.count ?? 0;
  const stats: { label: string; severity: Severity }[] = [
    { label: "Critical", severity: "critical" },
    { label: "High", severity: "high" },
    { label: "Medium", severity: "medium" },
    { label: "Low", severity: "low" },
  ];

  return (
    <div className="animate-rise">
      <PageHeader
        title="Sector Risk Monitoring"
        subtitle="Active high and critical risks that need attention now"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.severity} className="p-4">
            <p className="font-display text-[11px] font-bold tracking-wider text-muted uppercase">
              {s.label} · active
            </p>
            <p
              className="mt-1 font-display text-3xl font-black"
              style={{ color: SEVERITY_COLORS[s.severity] }}
            >
              {countOf(s.severity)}
            </p>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Activity />}
            title="No active high or critical risks"
            hint="When a high or critical risk is open, monitoring or mitigating, it appears here."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ risk, responsibleName }) => (
            <Card key={risk.id} accent={risk.severity === "critical" ? "red" : "amber"}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px]"
                      style={{
                        backgroundColor: `${SEVERITY_COLORS[risk.severity]}1f`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 18px -6px ${SEVERITY_COLORS[risk.severity]}`,
                      }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: SEVERITY_COLORS[risk.severity],
                          boxShadow: `0 0 8px ${SEVERITY_COLORS[risk.severity]}`,
                        }}
                      />
                    </span>
                    <Link
                      href={`/risks/${risk.id}`}
                      className="font-display text-base font-bold text-ink transition-colors hover:text-cyber"
                    >
                      {risk.title}
                    </Link>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <SeverityBadge severity={risk.severity} />
                    <StatusBadge status={risk.status} />
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted">{risk.description}</p>
                {risk.keywords.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {risk.keywords.slice(0, 6).map((k) => (
                      <span
                        key={k}
                        className="rounded-[4px] border border-hairline bg-canvas px-2 py-0.5 text-xs text-muted"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-3">
                  <span className="text-xs text-muted">
                    {responsibleName ? `Responsible: ${responsibleName}` : "Unassigned"} ·{" "}
                    {risk.updatedAt.toLocaleDateString("en-ZA", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                  <div className="flex items-center gap-3">
                    {canUpdate && <QuickStatusSelect riskId={risk.id} value={risk.status} />}
                    <Link
                      href={`/risks/${risk.id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-cyber hover:brightness-110"
                    >
                      Detail <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
