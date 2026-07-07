import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { keywordSets } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(50).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("update", "keyword_set");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid keyword set payload.");

  const [row] = await db
    .update(keywordSets)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.keywords !== undefined
        ? { keywords: [...new Set(parsed.data.keywords)] }
        : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    })
    .where(eq(keywordSets.id, id))
    .returning();

  if (!row) return jsonError("Keyword set not found.", 404);

  await logActivity({
    actor: g.user.id,
    action: "keyword_set.update",
    entityType: "keyword_set",
    entityId: id,
    metadata: parsed.data,
  });

  return NextResponse.json({ keywordSet: row });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  // delete keyword_set - ops_manager/ceo only per the permission matrix.
  const g = await guard("delete", "keyword_set");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  const [row] = await db.delete(keywordSets).where(eq(keywordSets.id, id)).returning();
  if (!row) return jsonError("Keyword set not found.", 404);

  await logActivity({
    actor: g.user.id,
    action: "keyword_set.delete",
    entityType: "keyword_set",
    entityId: id,
    metadata: { name: row.name },
  });

  return NextResponse.json({ ok: true });
}
