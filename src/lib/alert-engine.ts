import { and, eq, inArray, or, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  alerts,
  alertThresholds,
  users,
  type Severity,
  type RiskCategory,
  type AlertType,
} from "./schema";
import { sendAlertEmail } from "./email";

const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Create an in-app alert; optionally email the target user. */
export async function createAlert(params: {
  type: AlertType;
  title: string;
  body: string;
  severity?: Severity;
  targetUser?: string | null;
  relatedEntityType?: string;
  relatedEntityId?: string;
  email?: boolean;
}): Promise<void> {
  await db.insert(alerts).values({
    type: params.type,
    title: params.title,
    body: params.body,
    severity: params.severity ?? "medium",
    targetUser: params.targetUser ?? null,
    relatedEntityType: params.relatedEntityType ?? null,
    relatedEntityId: params.relatedEntityId ?? null,
  });

  if (params.email && params.targetUser) {
    const [target] = await db
      .select({ email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, params.targetUser))
      .limit(1);
    if (target) {
      await sendAlertEmail(target.email, params.title, params.body);
    }
  }
}

/**
 * Escalation check: when a risk is created or its severity changes,
 * evaluate active thresholds and fire alerts to the configured
 * role/user (in-app always; email when configured).
 */
export async function evaluateRiskEscalation(risk: {
  id: string;
  title: string;
  severity: Severity;
  category: RiskCategory;
}): Promise<number> {
  const thresholds = await db
    .select()
    .from(alertThresholds)
    .where(
      and(
        eq(alertThresholds.isActive, true),
        or(eq(alertThresholds.category, risk.category), isNull(alertThresholds.category)),
      ),
    );

  const tripped = thresholds.filter(
    (t) => SEVERITY_RANK[risk.severity] >= SEVERITY_RANK[t.severityTrigger],
  );
  if (tripped.length === 0) return 0;

  let fired = 0;
  for (const t of tripped) {
    const title = `Risk escalation: ${risk.title}`;
    const body = `"${risk.title}" is now ${risk.severity.toUpperCase()} (${risk.category}), crossing an active escalation threshold. Review and respond.`;

    if (t.notifyUser) {
      await createAlert({
        type: "risk_escalation",
        title,
        body,
        severity: risk.severity,
        targetUser: t.notifyUser,
        relatedEntityType: "risk",
        relatedEntityId: risk.id,
        email: true,
      });
      fired++;
    } else if (t.notifyRole) {
      const roleUsers = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.role, t.notifyRole), eq(users.isActive, true)));
      for (const u of roleUsers) {
        await createAlert({
          type: "risk_escalation",
          title,
          body,
          severity: risk.severity,
          targetUser: u.id,
          relatedEntityType: "risk",
          relatedEntityId: risk.id,
          email: true,
        });
        fired++;
      }
    } else {
      // Broadcast alert
      await createAlert({
        type: "risk_escalation",
        title,
        body,
        severity: risk.severity,
        targetUser: null,
        relatedEntityType: "risk",
        relatedEntityId: risk.id,
      });
      fired++;
    }
  }
  return fired;
}

export async function unreadAlertCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.isRead, false),
        or(eq(alerts.targetUser, userId), isNull(alerts.targetUser)),
      ),
    );
  return rows.length;
}

export async function markAlertsRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(alerts)
    .set({ isRead: true })
    .where(
      and(
        inArray(alerts.id, ids),
        or(eq(alerts.targetUser, userId), isNull(alerts.targetUser)),
      ),
    );
}
