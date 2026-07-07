import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { risks, sectorIntelligence } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

const patchSchema = z
  .object({
    title: z.string().min(3).max(300).optional(),
    summary: z.string().min(3).optional(),
    incidentType: z.string().min(2).max(100).optional(),
    location: z.string().max(200).nullable().optional(),
    linkedRiskId: z.uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("update", "intelligence");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError("Invalid intelligence id");

  const raw = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  if (parsed.data.linkedRiskId) {
    const [risk] = await db
      .select({ id: risks.id })
      .from(risks)
      .where(eq(risks.id, parsed.data.linkedRiskId))
      .limit(1);
    if (!risk) return jsonError("Linked risk not found", 404);
  }

  const [updated] = await db
    .update(sectorIntelligence)
    .set(parsed.data)
    .where(eq(sectorIntelligence.id, id))
    .returning();
  if (!updated) return jsonError("Intelligence item not found", 404);

  await logActivity({
    actor: g.user.id,
    action: "updated intelligence",
    entityType: "intelligence",
    entityId: updated.id,
    metadata: { changed: Object.keys(parsed.data), title: updated.title },
  });

  return NextResponse.json({ intelligence: updated });
}
