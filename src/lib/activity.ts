import { db } from "./db";
import { activityLog } from "./schema";

export async function logActivity(params: {
  actor: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(activityLog).values({
      actor: params.actor,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (err) {
    console.error("activity log write failed", err);
  }
}
