import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { requireSession } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

export async function POST(request: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { theme?: string } | null;
  const theme = body?.theme === "light" ? "light" : "dark";

  const cookieStore = await cookies();
  cookieStore.set("comric-theme", theme, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  await db.update(users).set({ themePreference: theme }).where(eq(users.id, user.id));

  return NextResponse.json({ ok: true, theme });
}
