import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { researchEntries, researchSourceEnum } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(50_000),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  sourceType: z.enum(researchSourceEnum.enumValues).optional(),
  rawData: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Create a research entry. Used by the manual entry form and available as
 * the documented API-feed hook (bearer session cookie required).
 */
export async function POST(request: Request) {
  const g = await guard("create", "research");
  if (g.error) return g.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("A title and content are required.");

  const [row] = await db
    .insert(researchEntries)
    .values({
      title: parsed.data.title,
      content: parsed.data.content,
      keywords: parsed.data.keywords ?? [],
      sourceType: parsed.data.sourceType ?? "manual",
      rawData: parsed.data.rawData ?? null,
      createdBy: g.user.id,
    })
    .returning();

  await logActivity({
    actor: g.user.id,
    action: "research.create",
    entityType: "research",
    entityId: row.id,
    metadata: { title: row.title, sourceType: row.sourceType },
  });

  return NextResponse.json({ entry: row }, { status: 201 });
}
