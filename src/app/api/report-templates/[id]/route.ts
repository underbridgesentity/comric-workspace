import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { reportTemplates } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

/** Delete a saved report template. Restricted to roles that may delete AI
 *  reports (ops manager / CEO via the permission matrix). */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("delete", "ai_report");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Invalid template id.");

  const [deleted] = await db
    .delete(reportTemplates)
    .where(eq(reportTemplates.id, id))
    .returning({ id: reportTemplates.id, name: reportTemplates.name });

  if (!deleted) return jsonError("Template not found.", 404);

  await logActivity({
    actor: g.user.id,
    action: "report_template.delete",
    entityType: "report_template",
    entityId: deleted.id,
    metadata: { name: deleted.name },
  });

  return NextResponse.json({ ok: true });
}
