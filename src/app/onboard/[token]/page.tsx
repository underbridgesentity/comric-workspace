import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { hashInviteToken } from "@/lib/invite";
import { ROLE_LABELS } from "@/lib/permissions";
import { ComricLogo } from "@/components/logo";
import { OnboardForm } from "./onboard-form";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4">
      {/* faint green corner blooms, mirroring the login composition */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, #8eff00 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-56 -left-56 h-[600px] w-[600px] rounded-full opacity-[0.05]"
        style={{ background: "radial-gradient(circle, #03f8c5 0%, transparent 70%)" }}
      />

      <div className="animate-rise w-full max-w-sm">
        <div className="mb-8 flex items-baseline justify-center gap-2 text-ink select-none">
          <ComricLogo size={48} />
          <span className="font-display text-[11px] font-bold tracking-[0.3em] text-cyber">
            WORKSPACE
          </span>
        </div>
        <div className="rounded-brand border border-hairline bg-surface p-8 shadow-[0_8px_40px_rgba(0,0,0,0.25)]">
          {children}
        </div>
      </div>
    </main>
  );
}

export default async function OnboardPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  let invitee: { fullName: string; email: string; role: keyof typeof ROLE_LABELS } | null = null;
  if (/^[0-9a-f]{64}$/.test(token)) {
    try {
      const [row] = await db
        .select({ fullName: users.fullName, email: users.email, role: users.role })
        .from(users)
        .where(
          and(
            eq(users.inviteTokenHash, hashInviteToken(token)),
            gt(users.inviteExpiresAt, new Date()),
            isNull(users.passwordHash),
            eq(users.isActive, true),
          ),
        )
        .limit(1);
      invitee = row ?? null;
    } catch (err) {
      console.error("onboard token lookup failed", err);
    }
  }

  if (!invitee) {
    return (
      <Shell>
        <h1 className="font-display text-lg font-bold text-ink">Invite not valid</h1>
        <p className="mt-2 text-sm text-muted">
          This invite link is invalid or has expired. Ask your administrator to send a new invite.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-full items-center justify-center rounded-brand border border-hairline bg-canvas px-4 py-2.5 font-display text-sm font-bold text-ink transition-colors duration-150 hover:border-cyber/40 hover:text-cyber"
        >
          Go to sign in
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-display text-lg font-bold text-ink">Welcome, {invitee.fullName}</h1>
      <p className="mt-1 text-sm text-muted">
        Set your password to finish setting up your account.
      </p>
      <div className="mt-4 mb-6 rounded-brand border border-hairline bg-canvas px-3 py-2.5 text-sm">
        <p className="truncate text-ink">{invitee.email}</p>
        <p className="mt-0.5 text-xs text-muted">
          Assigned role:{" "}
          <span className="font-display font-bold text-ink">{ROLE_LABELS[invitee.role]}</span>{" "}
          (set by your administrator)
        </p>
      </div>
      <OnboardForm token={token} email={invitee.email} initialFullName={invitee.fullName} />
    </Shell>
  );
}
