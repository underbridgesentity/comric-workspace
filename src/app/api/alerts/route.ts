import { NextResponse } from "next/server";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { guard } from "@/lib/api";
import { db } from "@/lib/db";
import { alerts } from "@/lib/schema";
import { markAlertsRead } from "@/lib/alert-engine";

export async function GET() {
  const g = await guard("view", "alert");
  if (g.error) return g.error;

  const rows = await db
    .select()
    .from(alerts)
    .where(or(eq(alerts.targetUser, g.user.id), isNull(alerts.targetUser)))
    .orderBy(desc(alerts.createdAt))
    .limit(100);

  return NextResponse.json({ alerts: rows });
}

export async function PATCH(request: Request) {
  const g = await guard("view", "alert");
  if (g.error) return g.error;

  const body = (await request.json().catch(() => null)) as { ids?: string[] } | null;
  if (!body?.ids || !Array.isArray(body.ids)) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  await markAlertsRead(g.user.id, body.ids);
  return NextResponse.json({ ok: true });
}
