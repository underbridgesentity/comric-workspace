import { NextResponse } from "next/server";
import { requireSession } from "@/auth";
import { can, type Action, type Resource } from "./permissions";
import type { Role } from "./schema";

export type SessionUser = { id: string; email: string; name: string; role: Role };

/**
 * Server-side gate for every API route: verifies the session AND the
 * caller's role against the permission matrix before any DB work runs.
 * Returns either { user } or { error: NextResponse } to return directly.
 */
export async function guard(
  action: Action,
  resource: Resource,
): Promise<{ user: SessionUser; error?: never } | { user?: never; error: NextResponse }> {
  const user = await requireSession();
  if (!user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (!can(user.role, action, resource)) {
    return {
      error: NextResponse.json(
        { error: `Your role does not permit this action.` },
        { status: 403 },
      ),
    };
  }
  return { user: user as SessionUser };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
