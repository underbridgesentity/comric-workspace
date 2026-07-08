"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Loader2, Mail, UserPlus, X, Power } from "lucide-react";
import { GhostButton, PrimaryButton } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@/lib/schema";

const ROLES = Object.keys(ROLE_LABELS) as Role[];

function SetupLinkFallback({ setupUrl }: { setupUrl: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-brand border border-cyber/30 bg-cyber/5 p-4">
      <p className="mb-1 font-display text-[11px] font-bold tracking-wider text-muted uppercase">
        One-time setup link
      </p>
      <div className="flex items-center justify-between gap-2">
        <code className="font-mono text-xs break-all text-ink">{setupUrl}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(setupUrl);
            setCopied(true);
          }}
          className="shrink-0 rounded-brand border border-hairline p-1.5 text-muted transition-colors hover:border-cyber/50 hover:text-cyber"
          title="Copy setup link"
        >
          {copied ? <Check className="h-4 w-4 text-cyber" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Email is not configured - share this setup link directly. It expires in 7 days.
      </p>
    </div>
  );
}

export function UserRowActions({
  user,
  isSelf,
}: {
  user: {
    id: string;
    fullName: string;
    role: Role;
    isActive: boolean;
    pendingInvite: boolean;
  };
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState<{ emailed: boolean; setupUrl: string } | null>(null);

  async function patch(body: { role?: Role; isActive?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function resendInvite() {
    setBusy(true);
    setError(null);
    setResent(null);
    try {
      const res = await fetch(`/api/users/${user.id}/reinvite`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; emailed?: boolean; setupUrl?: string }
        | null;
      if (!res.ok || !data?.setupUrl) {
        setError(data?.error ?? "Could not resend the invite");
        return;
      }
      setResent({ emailed: data.emailed ?? false, setupUrl: data.setupUrl });
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center justify-end gap-2">
        {error && (
          <span className="max-w-[160px] truncate text-xs text-sev-critical">{error}</span>
        )}
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
        {user.pendingInvite && user.isActive && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void resendInvite()}
            className="inline-flex items-center gap-1.5 rounded-brand border border-hairline px-2.5 py-1.5 font-display text-xs font-bold text-muted transition-colors hover:border-cyber/50 hover:text-cyber disabled:pointer-events-none disabled:opacity-40"
            title="Resend invite email"
          >
            <Mail className="h-3.5 w-3.5" />
            Resend invite
          </button>
        )}
        <select
          value={user.role}
          disabled={busy}
          onChange={(e) => void patch({ role: e.target.value as Role })}
          className="rounded-brand border border-hairline bg-canvas px-2 py-1.5 text-xs font-bold text-ink outline-none focus:border-cyber/60 disabled:opacity-50"
          aria-label={`Change role for ${user.fullName}`}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || (isSelf && user.isActive)}
          title={
            isSelf && user.isActive
              ? "You cannot deactivate your own account"
              : user.isActive
                ? "Deactivate"
                : "Reactivate"
          }
          onClick={() => {
            if (
              user.isActive &&
              !window.confirm(
                `Deactivate ${user.fullName}? They will no longer be able to sign in${
                  user.pendingInvite ? " and their invite link will be revoked" : ""
                }.`,
              )
            )
              return;
            void patch({ isActive: !user.isActive });
          }}
          className={`inline-flex items-center gap-1.5 rounded-brand border px-2.5 py-1.5 font-display text-xs font-bold transition-colors disabled:pointer-events-none disabled:opacity-40 ${
            user.isActive
              ? "border-hairline text-muted hover:border-sev-critical/50 hover:text-sev-critical"
              : "border-hairline text-muted hover:border-cyber/50 hover:text-cyber"
          }`}
        >
          <Power className="h-3.5 w-3.5" />
          {user.isActive ? "Deactivate" : "Reactivate"}
        </button>
      </div>
      {resent &&
        (resent.emailed ? (
          <p className="text-xs text-cyber">Invite email resent.</p>
        ) : (
          <div className="w-full max-w-sm">
            <SetupLinkFallback setupUrl={resent.setupUrl} />
          </div>
        ))}
    </div>
  );
}

export function InviteUserPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("read_only");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    email: string;
    emailed: boolean;
    setupUrl: string;
  } | null>(null);

  function openPanel() {
    setFullName("");
    setEmail("");
    setRole("read_only");
    setError(null);
    setSuccess(null);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, role }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; emailed?: boolean; setupUrl?: string }
        | null;
      if (!res.ok || !data?.setupUrl) {
        setError(data?.error ?? "Could not send the invite.");
        return;
      }
      setSuccess({
        email: email.toLowerCase().trim(),
        emailed: data.emailed ?? false,
        setupUrl: data.setupUrl,
      });
      router.refresh();
    } catch {
      setError("Network error - invite not sent.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <PrimaryButton type="button" onClick={openPanel}>
        <UserPlus className="h-4 w-4" /> Invite user
      </PrimaryButton>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="animate-rise mt-12 w-full max-w-md rounded-brand border border-hairline bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-black tracking-tight text-ink">
            {success ? "Invite created" : "Invite user"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="text-muted transition-colors hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            {success.emailed ? (
              <p className="text-sm text-muted">
                Invite sent to <span className="font-bold text-ink">{success.email}</span>. They
                will receive a one-time setup link that expires in 7 days.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Invite created for <span className="font-bold text-ink">{success.email}</span>.
                </p>
                <SetupLinkFallback setupUrl={success.setupUrl} />
              </>
            )}
            <div className="flex justify-end">
              <PrimaryButton type="button" onClick={() => setOpen(false)}>
                Done
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block font-display text-xs font-bold tracking-wide text-muted uppercase">
                Full name
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
                className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-cyber/60"
                placeholder="Thandi Nkosi"
              />
            </div>
            <div>
              <label className="mb-1 block font-display text-xs font-bold tracking-wide text-muted uppercase">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-cyber/60"
                placeholder="thandi@comric.co.za"
              />
            </div>
            <div>
              <label className="mb-1 block font-display text-xs font-bold tracking-wide text-muted uppercase">
                Assigned role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-cyber/60"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">The invitee cannot change this.</p>
            </div>

            {error && (
              <p className="rounded-brand border border-sev-critical/30 bg-sev-critical/10 px-3 py-2 text-sm text-sev-critical">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <GhostButton type="button" onClick={() => setOpen(false)}>
                Cancel
              </GhostButton>
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {busy ? "Sending…" : "Send invite"}
              </PrimaryButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
