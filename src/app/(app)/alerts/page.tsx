import Link from "next/link";
import { asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { BellOff, SlidersHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import { alerts, alertThresholds, users, risks } from "@/lib/schema";
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
import { ROLE_LABELS } from "@/lib/permissions";
import {
  MarkAllReadButton,
  MarkReadButton,
  ThresholdForm,
  ThresholdRowActions,
} from "./alerts-controls";

function alertHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  if (entityType === "risk") return `/risks/${entityId}`;
  if (entityType === "ai_report") return null;
  if (entityType === "intelligence") return "/intelligence";
  return null;
}

export default async function AlertsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "read_only";
  const userId = session?.user?.id ?? "";
  const canManage = can(role, "manage", "alert_threshold");

  const rows = await db
    .select()
    .from(alerts)
    .where(or(eq(alerts.targetUser, userId), isNull(alerts.targetUser)))
    .orderBy(desc(alerts.createdAt))
    .limit(100);

  const unreadIds = rows.filter((a) => !a.isRead).map((a) => a.id);

  let thresholds: (typeof alertThresholds.$inferSelect)[] = [];
  let activeUsers: { id: string; name: string }[] = [];
  if (canManage) {
    [thresholds, activeUsers] = await Promise.all([
      db.select().from(alertThresholds).orderBy(desc(alertThresholds.createdAt)),
      db
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(eq(users.isActive, true))
        .orderBy(asc(users.fullName)),
    ]);
  }
  const userName = (uid: string | null) => activeUsers.find((u) => u.id === uid)?.name ?? "—";

  // Titles for risk click-throughs
  const riskIds = rows
    .filter((a) => a.relatedEntityType === "risk" && a.relatedEntityId)
    .map((a) => a.relatedEntityId as string);
  const riskRows = riskIds.length
    ? await db
        .select({ id: risks.id, title: risks.title })
        .from(risks)
        .where(inArray(risks.id, riskIds))
    : [];

  return (
    <div className="animate-rise">
      <PageHeader
        title="Alerts & Escalation"
        subtitle="Notifications targeted to you plus sector-wide broadcasts"
        actions={<MarkAllReadButton unreadIds={unreadIds} />}
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<BellOff />}
            title="No alerts"
            hint="Escalations, new intelligence and AI completions will show up here."
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((a) => {
              const href = alertHref(a.relatedEntityType, a.relatedEntityId);
              const linkedRisk = riskRows.find((r) => r.id === a.relatedEntityId);
              return (
                <li
                  key={a.id}
                  className={`flex items-start gap-3 p-4 ${a.isRead ? "opacity-60" : ""}`}
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: a.isRead ? "transparent" : SEVERITY_COLORS[a.severity],
                      border: a.isRead ? `1px solid ${SEVERITY_COLORS[a.severity]}` : undefined,
                    }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-sm font-bold text-ink">{a.title}</p>
                      <SeverityBadge severity={a.severity} />
                      <StatusBadge status={a.targetUser ? "targeted" : "broadcast"} />
                    </div>
                    <p className="mt-1 text-sm text-muted">{a.body}</p>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
                      <span>
                        {a.createdAt.toLocaleDateString("en-ZA", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {href && (
                        <Link href={href} className="font-bold text-cyber hover:brightness-110">
                          {linkedRisk ? `View risk: ${linkedRisk.title}` : "View related item"}
                        </Link>
                      )}
                      {!a.isRead && <MarkReadButton alertId={a.id} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {canManage && (
        <div className="mt-8">
          <div className="mb-4 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted" />
            <h2 className="font-display text-lg font-black text-ink">Escalation thresholds</h2>
          </div>
          <Card className="p-5">
            <p className="mb-4 text-sm text-muted">
              When a risk is created or escalates to the trigger severity (or above) in the
              matching category, alerts are fired to the configured audience.
            </p>
            <ThresholdForm users={activeUsers} />
            <div className="mt-5 overflow-x-auto border-t border-hairline pt-4">
              {thresholds.length === 0 ? (
                <p className="text-sm text-muted">No thresholds configured yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-hairline font-display text-[11px] font-bold tracking-wider text-muted uppercase">
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Trigger</th>
                      <th className="px-3 py-2">Notifies</th>
                      <th className="px-3 py-2">State</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thresholds.map((t) => (
                      <tr key={t.id} className="border-b border-hairline last:border-0">
                        <td className="px-3 py-2.5 text-ink capitalize">{t.category ?? "Any"}</td>
                        <td className="px-3 py-2.5">
                          <SeverityBadge severity={t.severityTrigger} />
                        </td>
                        <td className="px-3 py-2.5 text-ink">
                          {t.notifyUser
                            ? userName(t.notifyUser)
                            : t.notifyRole
                              ? ROLE_LABELS[t.notifyRole]
                              : "Broadcast"}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={t.isActive ? "active" : "inactive"} />
                        </td>
                        <td className="px-3 py-2.5">
                          <ThresholdRowActions thresholdId={t.id} isActive={t.isActive} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
