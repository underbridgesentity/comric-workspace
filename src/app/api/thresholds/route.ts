import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { alertThresholds } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

const createSchema = z
  .object({
    category: z
      .enum(["infrastructure", "cyber", "crime", "regulatory", "operational", "other"])
      .nullable()
      .optional(),
    severityTrigger: z.enum(["critical", "high", "medium", "low"]),
    notifyRole: z.enum(["ceo", "ops_manager", "analyst", "read_only"]).nullable().optional(),
    notifyUser: z.uuid().nullable().optional(),
  })
  .refine((v) => !(v.notifyRole && v.notifyUser), {
    message: "Choose a role or a specific user, not both",
  });

export async function POST(request: Request) {
  const g = await guard("manage", "alert_threshold");
  if (g.error) return g.error;

  const raw = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const [threshold] = await db
    .insert(alertThresholds)
    .values({
      category: parsed.data.category ?? null,
      severityTrigger: parsed.data.severityTrigger,
      notifyRole: parsed.data.notifyRole ?? null,
      notifyUser: parsed.data.notifyUser ?? null,
    })
    .returning();

  await logActivity({
    actor: g.user.id,
    action: "created alert threshold",
    entityType: "alert_threshold",
    entityId: threshold.id,
    metadata: {
      category: threshold.category ?? "any",
      severityTrigger: threshold.severityTrigger,
    },
  });

  return NextResponse.json({ threshold }, { status: 201 });
}
