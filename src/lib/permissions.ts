import type { Role } from "./schema";

export type Action = "view" | "create" | "update" | "delete" | "manage";

export type Resource =
  | "risk"
  | "risk_note"
  | "intelligence"
  | "document"
  | "research"
  | "keyword_set"
  | "scrape"
  | "ai_report"
  | "alert"
  | "alert_threshold"
  | "user"
  | "activity_log"
  | "dashboard";

/**
 * Single source of truth for authorization. Used identically by UI
 * components (hide/disable controls) and API route handlers (reject).
 */
export function can(role: Role, action: Action, resource: Resource): boolean {
  // Read-only: view dashboards, reports and data — nothing else.
  if (role === "read_only") {
    if (action !== "view") return false;
    return resource !== "user" && resource !== "activity_log";
  }

  // Analyst: view everything except user management/activity; create &
  // update operational data; never delete, never manage users.
  if (role === "analyst") {
    if (resource === "user" || resource === "activity_log") return false;
    if (action === "delete") return false;
    return true;
  }

  // Ops manager: full platform management.
  if (role === "ops_manager") return true;

  // CEO: full read + user management; also unblocked for data entry.
  if (role === "ceo") return true;

  return false;
}

export function assertCan(role: Role, action: Action, resource: Resource): void {
  if (!can(role, action, resource)) {
    throw new PermissionError(`Role '${role}' may not ${action} ${resource}`);
  }
}

export class PermissionError extends Error {
  readonly status = 403;
}

export const ROLE_LABELS: Record<Role, string> = {
  ceo: "CEO",
  ops_manager: "Operations Manager",
  analyst: "Analyst",
  read_only: "Read-Only",
};
