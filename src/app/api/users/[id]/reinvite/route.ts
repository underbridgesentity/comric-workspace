import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { guard, jsonError } from "@/lib/api";
import { APP_URL } from "@/lib/app-url";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { logActivity } from "@/lib/activity";
import { sendInviteEmail } from "@/lib/email";
import { createInviteToken } from "@/lib/invite";
import { ROLE_LABELS } from "@/lib/permissions";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const g = await guard("manage", "user");
  if (g.error) return g.error;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonError("Invalid user id");

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return jsonError("User not found", 404);
  if (target.passwordHash !== null) {
    return jsonError("This user has already completed setup", 400);
  }
  if (!target.isActive) {
    return jsonError("Reactivate this user before resending the invite", 400);
  }

  const { token, tokenHash, expiresAt } = createInviteToken();
  await db
    .update(users)
    .set({ inviteTokenHash: tokenHash, inviteExpiresAt: expiresAt })
    .where(eq(users.id, target.id));

  const setupUrl = `${APP_URL}/onboard/${token}`;

  await logActivity({
    actor: g.user.id,
    action: "user.invite",
    entityType: "user",
    entityId: target.id,
    metadata: { email: target.email, role: target.role, reinvite: true },
  });

  const emailed = await sendInviteEmail(
    target.email,
    target.fullName,
    ROLE_LABELS[target.role],
    setupUrl,
  );

  return NextResponse.json({ emailed, setupUrl });
}
