import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { users, type Role } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

const patchSchema = z
  .object({
    role: z.enum(["ceo", "ops_manager", "analyst", "read_only"]).optional(),
    isActive: z.boolean().optional(),
    fullName: z.string().min(2).max(120).optional(),
  })
  .refine((v) => v.role !== undefined || v.isActive !== undefined || v.fullName !== undefined, {
    message: "Nothing to update",
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const g = await guard("manage", "user");
  if (g.error) return g.error;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonError("Invalid user id");

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return jsonError("User not found", 404);

  const raw = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  if (parsed.data.isActive === false && target.id === g.user.id) {
    return jsonError("You cannot deactivate your own account", 400);
  }

  const updates: Partial<{
    role: Role;
    isActive: boolean;
    fullName: string;
    inviteTokenHash: string | null;
    inviteExpiresAt: Date | null;
  }> = {};
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if (parsed.data.isActive === false) {
    // Deactivating revokes any outstanding invite link.
    updates.inviteTokenHash = null;
    updates.inviteExpiresAt = null;
  }
  if (parsed.data.fullName !== undefined) updates.fullName = parsed.data.fullName.trim();

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, target.id))
    .returning({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
    });

  await logActivity({
    actor: g.user.id,
    action:
      parsed.data.isActive === false
        ? "deactivated user"
        : parsed.data.isActive === true
          ? "reactivated user"
          : parsed.data.role !== undefined
            ? "changed user role"
            : "updated user",
    entityType: "user",
    entityId: target.id,
    metadata: {
      email: target.email,
      changes: parsed.data,
      previousRole: target.role,
    },
  });

  return NextResponse.json({ user: updated });
}
