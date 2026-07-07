import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { keywordSets } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
  isActive: z.boolean().optional(),
});

export async function POST(request: Request) {
  const g = await guard("create", "keyword_set");
  if (g.error) return g.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Provide a name and at least one keyword.");

  const [row] = await db
    .insert(keywordSets)
    .values({
      name: parsed.data.name,
      keywords: [...new Set(parsed.data.keywords)],
      isActive: parsed.data.isActive ?? true,
      createdBy: g.user.id,
    })
    .returning();

  await logActivity({
    actor: g.user.id,
    action: "keyword_set.create",
    entityType: "keyword_set",
    entityId: row.id,
    metadata: { name: row.name, keywords: row.keywords.length },
  });

  return NextResponse.json({ keywordSet: row }, { status: 201 });
}
