import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { reportTemplates, users } from "@/lib/schema";
import { logActivity } from "@/lib/activity";
import { builderSchema } from "@/lib/report-config";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  parameters: builderSchema,
});

/** List saved report-builder templates. */
export async function GET() {
  const g = await guard("view", "ai_report");
  if (g.error) return g.error;

  const rows = await db
    .select({
      id: reportTemplates.id,
      name: reportTemplates.name,
      description: reportTemplates.description,
      parameters: reportTemplates.parameters,
      createdAt: reportTemplates.createdAt,
      createdBy: users.fullName,
    })
    .from(reportTemplates)
    .leftJoin(users, eq(reportTemplates.createdBy, users.id))
    .orderBy(desc(reportTemplates.createdAt))
    .limit(100);

  return NextResponse.json({ templates: rows });
}

/** Persist the full builder state as a reusable template. */
export async function POST(request: Request) {
  const g = await guard("create", "ai_report");
  if (g.error) return g.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid template payload.");

  const [template] = await db
    .insert(reportTemplates)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      parameters: parsed.data.parameters,
      createdBy: g.user.id,
    })
    .returning();

  await logActivity({
    actor: g.user.id,
    action: "report_template.create",
    entityType: "report_template",
    entityId: template.id,
    metadata: { name: template.name },
  });

  return NextResponse.json({ template }, { status: 201 });
}
