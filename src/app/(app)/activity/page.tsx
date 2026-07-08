import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, ilike, sql } from "drizzle-orm";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activityLog, users } from "@/lib/schema";
import { can } from "@/lib/permissions";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { parseRange, rangeStart, RANGE_PRESETS } from "@/lib/date-range";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function formatTimestamp(d: Date): string {
  return d.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactJson(value: unknown): string {
  if (value == null) return "";
  try {
    const s = JSON.stringify(value);
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  } catch {
    return "";
  }
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; action?: string; range?: string; page?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? "read_only";
  if (!can(role, "view", "activity_log")) redirect("/dashboard");

  const params = await searchParams;
  const actorFilter = params.actor?.trim() || undefined;
  const actionFilter = params.action?.trim() || undefined;
  const range = parseRange(params.range, "all");
  const rangeFrom = rangeStart(range);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const conditions = [];
  if (actorFilter && uuidRe.test(actorFilter)) conditions.push(eq(activityLog.actor, actorFilter));
  if (actionFilter) conditions.push(ilike(activityLog.action, `${actionFilter}%`));
  if (rangeFrom) conditions.push(gte(activityLog.createdAt, rangeFrom));
  const where = conditions.length ? and(...conditions) : undefined;

  let rows: {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata: unknown;
    createdAt: Date;
    actorName: string | null;
  }[] = [];
  let actors: { id: string; fullName: string }[] = [];
  let actions: string[] = [];
  let total = 0;
  let loadError = false;

  try {
    const [rowsRes, actorsRes, actionsRes, countRes] = await Promise.all([
      db
        .select({
          id: activityLog.id,
          action: activityLog.action,
          entityType: activityLog.entityType,
          entityId: activityLog.entityId,
          metadata: activityLog.metadata,
          createdAt: activityLog.createdAt,
          actorName: users.fullName,
        })
        .from(activityLog)
        .leftJoin(users, eq(activityLog.actor, users.id))
        .where(where)
        .orderBy(desc(activityLog.createdAt))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .orderBy(users.fullName),
      db
        .selectDistinct({ action: activityLog.action })
        .from(activityLog)
        .orderBy(activityLog.action),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityLog)
        .where(where),
    ]);
    rows = rowsRes;
    actors = actorsRes;
    actions = actionsRes.map((a) => a.action);
    total = countRes[0]?.count ?? 0;
  } catch (err) {
    console.error("activity query failed", err);
    loadError = true;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (actorFilter) sp.set("actor", actorFilter);
    if (actionFilter) sp.set("action", actionFilter);
    if (range !== "all") sp.set("range", range);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/activity?${s}` : "/activity";
  };

  const rangeHref = (r: string) => {
    const sp = new URLSearchParams();
    if (actorFilter) sp.set("actor", actorFilter);
    if (actionFilter) sp.set("action", actionFilter);
    if (r !== "all") sp.set("range", r);
    const s = sp.toString();
    return s ? `/activity?${s}` : "/activity";
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="Activity Log"
        subtitle="Full audit trail of every action taken in the workspace"
      />

      <form method="get" action="/activity" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="actor"
            className="mb-1 block font-display text-[11px] font-bold tracking-wider text-muted uppercase"
          >
            Actor
          </label>
          <select
            id="actor"
            name="actor"
            defaultValue={actorFilter ?? ""}
            className="min-w-[180px] rounded-brand border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-cyber/60"
          >
            <option value="">All users</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="action"
            className="mb-1 block font-display text-[11px] font-bold tracking-wider text-muted uppercase"
          >
            Action
          </label>
          <select
            id="action"
            name="action"
            defaultValue={actionFilter ?? ""}
            className="min-w-[180px] rounded-brand border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-cyber/60"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {range !== "all" && <input type="hidden" name="range" value={range} />}
        <button
          type="submit"
          className="rounded-brand border border-hairline bg-surface px-4 py-2 font-display text-sm font-bold text-ink transition-colors hover:border-cyber/50 hover:text-cyber"
        >
          Apply
        </button>
        <div className="flex items-center gap-1.5 py-0.5" role="group" aria-label="Date range">
          {RANGE_PRESETS.map((r) => (
            <Link
              key={r}
              href={rangeHref(r)}
              className={`rounded-brand border px-3 py-1.5 font-display text-xs font-bold transition-colors ${
                range === r
                  ? "border-cyber/60 bg-cyber/10 text-cyber"
                  : "border-hairline text-muted hover:text-ink"
              }`}
            >
              {r === "all" ? "All time" : r}
            </Link>
          ))}
        </div>
        {(actorFilter || actionFilter || range !== "all") && (
          <Link href="/activity" className="py-2 text-sm text-muted hover:text-cyber">
            Clear filters
          </Link>
        )}
      </form>

      <Card>
        {loadError ? (
          <EmptyState
            icon={<ScrollText />}
            title="Activity could not be loaded"
            hint="The database is unreachable. Refresh the page or try again shortly."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ScrollText />}
            title={
              actorFilter || actionFilter || range !== "all"
                ? "No activity matches your filters"
                : "No activity yet"
            }
            hint={
              actorFilter || actionFilter || range !== "all"
                ? "Adjust the actor, action or date range filter."
                : "Actions taken across the workspace will be recorded here."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left font-display text-[11px] font-bold tracking-wider text-muted uppercase">
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-hairline/60 last:border-0 hover:bg-ink/[0.02] dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 whitespace-nowrap font-display font-bold text-ink">
                        {row.actorName ?? "Unknown"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="rounded-[4px] border border-hairline bg-canvas px-2 py-0.5 font-mono text-[11px] text-digital">
                          {row.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{row.entityType}</td>
                      <td className="max-w-md px-4 py-3">
                        <code className="block truncate font-mono text-[11px] text-muted">
                          {compactJson(row.metadata) || "-"}
                        </code>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {formatTimestamp(row.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-hairline px-4 py-3">
              <p className="text-xs text-muted">
                {total} entr{total === 1 ? "y" : "ies"} · page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1.5">
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    className="inline-flex items-center gap-1 rounded-brand border border-hairline px-3 py-1.5 font-display text-xs font-bold text-ink transition-colors hover:border-cyber/50 hover:text-cyber"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Previous
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-brand border border-hairline px-3 py-1.5 font-display text-xs font-bold text-muted/40">
                    <ChevronLeft className="h-3.5 w-3.5" /> Previous
                  </span>
                )}
                {page < totalPages ? (
                  <Link
                    href={pageHref(page + 1)}
                    className="inline-flex items-center gap-1 rounded-brand border border-hairline px-3 py-1.5 font-display text-xs font-bold text-ink transition-colors hover:border-cyber/50 hover:text-cyber"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-brand border border-hairline px-3 py-1.5 font-display text-xs font-bold text-muted/40">
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
