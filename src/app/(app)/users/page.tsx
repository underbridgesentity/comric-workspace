import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { Users as UsersIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { InviteUserPanel, UserRowActions } from "./users-client";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function relativeTime(d: Date | null): string {
  if (!d) return "Never";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default async function UsersPage() {
  const session = await auth();
  const role = session?.user?.role ?? "read_only";
  if (!can(role, "manage", "user")) redirect("/dashboard");

  let rows: {
    id: string;
    fullName: string;
    email: string;
    role: "ceo" | "ops_manager" | "analyst" | "read_only";
    isActive: boolean;
    lastSeenAt: Date | null;
    createdAt: Date;
    passwordHash: string | null;
    inviteExpiresAt: Date | null;
  }[] = [];
  let loadError = false;

  try {
    rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        lastSeenAt: users.lastSeenAt,
        createdAt: users.createdAt,
        passwordHash: users.passwordHash,
        inviteExpiresAt: users.inviteExpiresAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
  } catch (err) {
    console.error("users query failed", err);
    loadError = true;
  }

  return (
    <div className="animate-rise">
      <PageHeader
        title="Users & Access"
        subtitle="Manage team accounts, roles and access to the workspace"
        actions={<InviteUserPanel />}
      />

      <Card>
        {loadError ? (
          <EmptyState
            icon={<UsersIcon />}
            title="Users could not be loaded"
            hint="The database is unreachable. Refresh the page or try again shortly."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<UsersIcon />}
            title="No users yet"
            hint="Invite your first team member to get started."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left font-display text-[11px] font-bold tracking-wider text-muted uppercase">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last seen</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const pendingInvite = u.passwordHash === null;
                  const inviteExpired =
                    pendingInvite &&
                    (u.inviteExpiresAt === null || u.inviteExpiresAt.getTime() <= Date.now());
                  return (
                  <tr
                    key={u.id}
                    className={`border-b border-hairline/60 last:border-0 hover:bg-ink/[0.02] dark:hover:bg-white/[0.02] ${
                      u.isActive ? "" : "opacity-60"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-brand border border-hairline bg-canvas font-display text-xs font-black text-ink">
                          {initials(u.fullName)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-display font-bold text-ink">
                            {u.fullName}
                            {u.id === session?.user?.id && (
                              <span className="ml-2 text-[11px] font-bold text-cyber">You</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="rounded-[4px] border border-hairline bg-canvas px-2 py-0.5 font-display text-[11px] font-bold tracking-wide text-ink uppercase">
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <StatusBadge status={u.isActive ? "active" : "inactive"} />
                        {pendingInvite && (
                          <span
                            className="inline-flex items-center rounded-[4px] px-2 py-0.5 font-display text-[11px] font-bold tracking-wide uppercase"
                            style={{
                              color: "#f59e0b",
                              backgroundColor: "#f59e0b1a",
                              border: "1px solid #f59e0b33",
                            }}
                          >
                            {inviteExpired ? "Invite expired" : "Pending invite"}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {relativeTime(u.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <UserRowActions
                        user={{
                          id: u.id,
                          fullName: u.fullName,
                          role: u.role,
                          isActive: u.isActive,
                          pendingInvite,
                        }}
                        isSelf={u.id === session?.user?.id}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
