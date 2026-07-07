"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, CheckCheck, Loader2, Plus, Trash2 } from "lucide-react";
import { PrimaryButton } from "@/components/ui";

const selectClass =
  "rounded-brand border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-cyber/60 disabled:opacity-50";

async function patchAlerts(ids: string[]) {
  const res = await fetch("/api/alerts", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to mark as read");
  }
}

export function MarkReadButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await patchAlerts([alertId]);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1 text-xs font-bold text-cyber transition-all hover:brightness-110 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      Mark read
    </button>
  );
}

export function MarkAllReadButton({ unreadIds }: { unreadIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (unreadIds.length === 0) return null;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await patchAlerts(unreadIds);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-brand border border-hairline bg-surface px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:border-cyber/40 hover:text-cyber disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
      Mark all read ({unreadIds.length})
    </button>
  );
}

export function ThresholdForm({ users }: { users: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    const notify = String(fd.get("notify") ?? "");
    const [kind, val] = notify.split(":");
    try {
      const res = await fetch("/api/thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: fd.get("category") || null,
          severityTrigger: fd.get("severityTrigger"),
          notifyRole: kind === "role" ? val : null,
          notifyUser: kind === "user" ? val : null,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Failed to create threshold");
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create threshold");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold text-muted">
        Category
        <select name="category" className={`${selectClass} mt-1 block`} defaultValue="">
          <option value="">Any category</option>
          {["infrastructure", "cyber", "crime", "regulatory", "operational", "other"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold text-muted">
        Trigger at severity
        <select name="severityTrigger" required className={`${selectClass} mt-1 block`} defaultValue="high">
          {["critical", "high", "medium", "low"].map((s) => (
            <option key={s} value={s}>
              {s} or above
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold text-muted">
        Notify
        <select name="notify" className={`${selectClass} mt-1 block`} defaultValue="">
          <option value="">Broadcast (everyone)</option>
          <optgroup label="Role">
            {[
              ["ceo", "CEO"],
              ["ops_manager", "Operations Manager"],
              ["analyst", "Analyst"],
            ].map(([v, l]) => (
              <option key={v} value={`role:${v}`}>
                {l}
              </option>
            ))}
          </optgroup>
          <optgroup label="Specific user">
            {users.map((u) => (
              <option key={u.id} value={`user:${u.id}`}>
                {u.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <PrimaryButton type="submit" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add threshold
      </PrimaryButton>
      {error && <p className="w-full text-sm text-sev-critical">{error}</p>}
    </form>
  );
}

export function ThresholdRowActions({
  thresholdId,
  isActive,
}: {
  thresholdId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "PATCH" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/thresholds/${thresholdId}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "PATCH" ? JSON.stringify({ isActive: !isActive }) : undefined,
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => void call("PATCH")}
        className="text-xs font-bold text-cyber transition-all hover:brightness-110 disabled:opacity-50"
      >
        {isActive ? "Disable" : "Enable"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void call("DELETE")}
        aria-label="Delete threshold"
        className="text-muted transition-colors hover:text-sev-critical disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-sev-critical">{error}</span>}
    </div>
  );
}
