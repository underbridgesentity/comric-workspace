import { createHash, randomBytes } from "crypto";

export const INVITE_TTL_DAYS = 7;

/** Generate a one-time invite token plus the sha256 hash we persist. */
export function createInviteToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
