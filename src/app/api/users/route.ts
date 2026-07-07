import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { logActivity } from "@/lib/activity";
import { createAlert } from "@/lib/alert-engine";
import { sendAlertEmail } from "@/lib/email";
import { ROLE_LABELS } from "@/lib/permissions";

const createUserSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.email().max(200),
  role: z.enum(["ceo", "ops_manager", "analyst", "read_only"]),
  password: z.string().min(10).max(200),
});

export async function POST(request: Request) {
  const g = await guard("manage", "user");
  if (g.error) return g.error;

  const raw = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const email = parsed.data.email.toLowerCase().trim();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    return jsonError("A user with this email already exists", 409);
  }

  const passwordHash = await hash(parsed.data.password, 12);

  const [created] = await db
    .insert(users)
    .values({
      fullName: parsed.data.fullName.trim(),
      email,
      passwordHash,
      role: parsed.data.role,
      isActive: true,
    })
    .returning({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    });

  await logActivity({
    actor: g.user.id,
    action: "invited user",
    entityType: "user",
    entityId: created.id,
    metadata: { email: created.email, role: created.role },
  });

  await createAlert({
    type: "task_assigned",
    title: "Welcome to COMRiC Workspace",
    body: `Your account has been created with the ${ROLE_LABELS[created.role]} role. Update your temporary password after your first sign-in.`,
    severity: "low",
    targetUser: created.id,
    relatedEntityType: "user",
    relatedEntityId: created.id,
  });

  // Email degrades gracefully when RESEND_API_KEY is unset.
  const emailed = await sendAlertEmail(
    created.email,
    "Your COMRiC Workspace account",
    `An account has been created for you on COMRiC Workspace (${created.email}), with the ${ROLE_LABELS[created.role]} role. Sign in with the temporary password provided by your administrator and change it immediately.`,
  );

  return NextResponse.json({ user: created, emailed }, { status: 201 });
}
