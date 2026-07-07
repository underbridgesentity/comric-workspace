import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { risks, type Severity } from "@/lib/schema";
import { evaluateRiskEscalation } from "@/lib/alert-engine";
import { logActivity } from "@/lib/activity";

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const patchSchema = z
  .object({
    title: z.string().min(3).max(300).optional(),
    description: z.string().min(3).optional(),
    category: z
      .enum(["infrastructure", "cyber", "crime", "regulatory", "operational", "other"])
      .optional(),
    severity: z.enum(["critical", "high", "medium", "low"]).optional(),
    status: z.enum(["open", "monitoring", "mitigating", "resolved", "closed"]).optional(),
    responsibleParty: z.uuid().nullable().optional(),
    sourceUrl: z.url().nullable().optional().or(z.literal("").transform(() => null)),
    keywords: z.array(z.string().min(1).max(80)).max(30).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: RouteContext) {
  const g = await guard("update", "risk");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError("Invalid risk id");

  const raw = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const [existing] = await db.select().from(risks).where(eq(risks.id, id)).limit(1);
  if (!existing) return jsonError("Risk not found", 404);

  const [updated] = await db.update(risks).set(parsed.data).where(eq(risks.id, id)).returning();

  const severityIncreased =
    parsed.data.severity !== undefined &&
    SEVERITY_RANK[parsed.data.severity] > SEVERITY_RANK[existing.severity];

  if (severityIncreased) {
    await evaluateRiskEscalation({
      id: updated.id,
      title: updated.title,
      severity: updated.severity,
      category: updated.category,
    });
  }

  await logActivity({
    actor: g.user.id,
    action: "updated risk",
    entityType: "risk",
    entityId: updated.id,
    metadata: { changed: Object.keys(parsed.data), title: updated.title },
  });

  return NextResponse.json({ risk: updated });
}

export async function DELETE(_request: Request, ctx: RouteContext) {
  const g = await guard("delete", "risk");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError("Invalid risk id");

  const [deleted] = await db.delete(risks).where(eq(risks.id, id)).returning();
  if (!deleted) return jsonError("Risk not found", 404);

  await logActivity({
    actor: g.user.id,
    action: "deleted risk",
    entityType: "risk",
    entityId: deleted.id,
    metadata: { title: deleted.title },
  });

  return NextResponse.json({ ok: true });
}
