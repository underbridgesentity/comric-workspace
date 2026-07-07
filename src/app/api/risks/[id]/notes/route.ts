import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { riskNotes, risks } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

const noteSchema = z.object({ body: z.string().min(1).max(5000) });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("create", "risk_note");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError("Invalid risk id");

  const raw = await request.json().catch(() => null);
  const parsed = noteSchema.safeParse(raw);
  if (!parsed.success) return jsonError("Note body is required (max 5000 characters)");

  const [risk] = await db
    .select({ id: risks.id, title: risks.title })
    .from(risks)
    .where(eq(risks.id, id))
    .limit(1);
  if (!risk) return jsonError("Risk not found", 404);

  const [note] = await db
    .insert(riskNotes)
    .values({ riskId: id, body: parsed.data.body, createdBy: g.user.id })
    .returning();

  await logActivity({
    actor: g.user.id,
    action: "added risk note",
    entityType: "risk_note",
    entityId: note.id,
    metadata: { riskId: id, riskTitle: risk.title },
  });

  return NextResponse.json({ note }, { status: 201 });
}
