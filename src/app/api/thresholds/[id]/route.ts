import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { alertThresholds } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

const patchSchema = z.object({ isActive: z.boolean() });

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: RouteContext) {
  const g = await guard("manage", "alert_threshold");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError("Invalid threshold id");

  const raw = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return jsonError("isActive (boolean) is required");

  const [updated] = await db
    .update(alertThresholds)
    .set({ isActive: parsed.data.isActive })
    .where(eq(alertThresholds.id, id))
    .returning();
  if (!updated) return jsonError("Threshold not found", 404);

  await logActivity({
    actor: g.user.id,
    action: updated.isActive ? "enabled alert threshold" : "disabled alert threshold",
    entityType: "alert_threshold",
    entityId: updated.id,
  });

  return NextResponse.json({ threshold: updated });
}

export async function DELETE(_request: Request, ctx: RouteContext) {
  const g = await guard("manage", "alert_threshold");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError("Invalid threshold id");

  const [deleted] = await db.delete(alertThresholds).where(eq(alertThresholds.id, id)).returning();
  if (!deleted) return jsonError("Threshold not found", 404);

  await logActivity({
    actor: g.user.id,
    action: "deleted alert threshold",
    entityType: "alert_threshold",
    entityId: deleted.id,
  });

  return NextResponse.json({ ok: true });
}
