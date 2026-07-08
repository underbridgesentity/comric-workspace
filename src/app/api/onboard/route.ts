import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { logActivity } from "@/lib/activity";
import { hashInviteToken } from "@/lib/invite";

const onboardSchema = z.object({
  token: z.string().length(64).regex(/^[0-9a-f]+$/),
  fullName: z.string().min(2).max(120).optional(),
  password: z
    .string()
    .min(10)
    .max(200)
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

/**
 * PUBLIC endpoint: the one-time token is the authentication. On any token
 * problem we return the same generic 400 so the route leaks nothing about
 * which tokens exist.
 */
export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = onboardSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "This invite link is invalid or has expired." },
      { status: 400 },
    );
  }

  const tokenHash = hashInviteToken(parsed.data.token);
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.inviteTokenHash, tokenHash),
        gt(users.inviteExpiresAt, new Date()),
        isNull(users.passwordHash),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  if (!user) {
    return NextResponse.json(
      { error: "This invite link is invalid or has expired." },
      { status: 400 },
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);
  await db
    .update(users)
    .set({
      passwordHash,
      ...(parsed.data.fullName ? { fullName: parsed.data.fullName.trim() } : {}),
      inviteTokenHash: null,
      inviteExpiresAt: null,
      emailVerified: new Date(),
    })
    .where(eq(users.id, user.id));

  await logActivity({
    actor: user.id,
    action: "user.onboard",
    entityType: "user",
    entityId: user.id,
    metadata: { email: user.email },
  });

  return NextResponse.json({ ok: true });
}
