import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { guard, jsonError } from "@/lib/api";
import { APP_URL } from "@/lib/app-url";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { logActivity } from "@/lib/activity";
import { createAlert } from "@/lib/alert-engine";
import { sendInviteEmail } from "@/lib/email";
import { createInviteToken } from "@/lib/invite";
import { ROLE_LABELS } from "@/lib/permissions";

const inviteUserSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.email().max(200),
  role: z.enum(["ceo", "ops_manager", "analyst", "read_only"]),
});

export async function POST(request: Request) {
  const g = await guard("manage", "user");
  if (g.error) return g.error;

  const raw = await request.json().catch(() => null);
  const parsed = inviteUserSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const email = parsed.data.email.toLowerCase().trim();
  const [existing] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      inviteTokenHash: users.inviteTokenHash,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const { token, tokenHash, expiresAt } = createInviteToken();
  const setupUrl = `${APP_URL}/onboard/${token}`;

  let created: {
    id: string;
    fullName: string;
    email: string;
    role: "ceo" | "ops_manager" | "analyst" | "read_only";
    isActive: boolean;
    createdAt: Date;
  };

  if (existing) {
    // A completed account (has a password) is a hard duplicate. A pending
    // invite is re-invitable: regenerate the token and expiry instead.
    if (existing.passwordHash !== null || existing.inviteTokenHash === null) {
      return jsonError("A user with this email already exists", 409);
    }
    const [updated] = await db
      .update(users)
      .set({
        fullName: parsed.data.fullName.trim(),
        role: parsed.data.role,
        isActive: true,
        inviteTokenHash: tokenHash,
        inviteExpiresAt: expiresAt,
      })
      .where(eq(users.id, existing.id))
      .returning({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      });
    created = updated;
  } else {
    const [inserted] = await db
      .insert(users)
      .values({
        fullName: parsed.data.fullName.trim(),
        email,
        passwordHash: null,
        role: parsed.data.role,
        isActive: true,
        inviteTokenHash: tokenHash,
        inviteExpiresAt: expiresAt,
      })
      .returning({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      });
    created = inserted;
  }

  await logActivity({
    actor: g.user.id,
    action: "user.invite",
    entityType: "user",
    entityId: created.id,
    metadata: { email: created.email, role: created.role, reinvite: Boolean(existing) },
  });

  await createAlert({
    type: "task_assigned",
    title: "Welcome to COMRiC Workspace",
    body: `Welcome to COMRiC Workspace - complete your account setup. You have been assigned the ${ROLE_LABELS[created.role]} role.`,
    severity: "low",
    targetUser: created.id,
    relatedEntityType: "user",
    relatedEntityId: created.id,
  });

  // Email degrades gracefully when RESEND_API_KEY is unset or the send fails;
  // the UI falls back to offering the setup link for direct handover.
  const emailed = await sendInviteEmail(
    created.email,
    created.fullName,
    ROLE_LABELS[created.role],
    setupUrl,
  );

  return NextResponse.json({ user: created, emailed, setupUrl }, { status: 201 });
}
