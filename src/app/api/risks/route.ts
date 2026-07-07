import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { risks } from "@/lib/schema";
import { evaluateRiskEscalation } from "@/lib/alert-engine";
import { logActivity } from "@/lib/activity";

const createRiskSchema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().min(3),
  category: z.enum(["infrastructure", "cyber", "crime", "regulatory", "operational", "other"]),
  severity: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["open", "monitoring", "mitigating", "resolved", "closed"]).default("open"),
  responsibleParty: z.uuid().nullable().optional(),
  source: z.enum(["web_scrape", "partner_report", "manual"]).default("manual"),
  sourceUrl: z.url().nullable().optional().or(z.literal("").transform(() => null)),
  keywords: z.array(z.string().min(1).max(80)).max(30).default([]),
});

export async function POST(request: Request) {
  const g = await guard("create", "risk");
  if (g.error) return g.error;

  const raw = await request.json().catch(() => null);
  const parsed = createRiskSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const [risk] = await db
    .insert(risks)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      severity: parsed.data.severity,
      status: parsed.data.status,
      responsibleParty: parsed.data.responsibleParty ?? null,
      source: parsed.data.source,
      sourceUrl: parsed.data.sourceUrl ?? null,
      keywords: parsed.data.keywords,
      createdBy: g.user.id,
    })
    .returning();

  await evaluateRiskEscalation({
    id: risk.id,
    title: risk.title,
    severity: risk.severity,
    category: risk.category,
  });

  await logActivity({
    actor: g.user.id,
    action: "created risk",
    entityType: "risk",
    entityId: risk.id,
    metadata: { title: risk.title, severity: risk.severity },
  });

  return NextResponse.json({ risk }, { status: 201 });
}
