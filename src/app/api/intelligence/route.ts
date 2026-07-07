import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { sectorIntelligence } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

const createIntelSchema = z.object({
  title: z.string().min(3).max(300),
  summary: z.string().min(3),
  incidentType: z.string().min(2).max(100),
  location: z.string().max(200).nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  sourceUrl: z.url().nullable().optional().or(z.literal("").transform(() => null)),
  occurredAt: z.iso.datetime().nullable().optional().or(z.literal("").transform(() => null)),
  linkedRiskId: z.uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const g = await guard("create", "intelligence");
  if (g.error) return g.error;

  const raw = await request.json().catch(() => null);
  const parsed = createIntelSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const [intel] = await db
    .insert(sectorIntelligence)
    .values({
      title: parsed.data.title,
      summary: parsed.data.summary,
      incidentType: parsed.data.incidentType,
      location: parsed.data.location ?? null,
      source: parsed.data.source ?? null,
      sourceUrl: parsed.data.sourceUrl ?? null,
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : null,
      linkedRiskId: parsed.data.linkedRiskId ?? null,
      createdBy: g.user.id,
    })
    .returning();

  await logActivity({
    actor: g.user.id,
    action: "added intelligence",
    entityType: "intelligence",
    entityId: intel.id,
    metadata: { title: intel.title, incidentType: intel.incidentType },
  });

  return NextResponse.json({ intelligence: intel }, { status: 201 });
}
