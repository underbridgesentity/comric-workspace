"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function QuickStatusSelect({ riskId, value }: { riskId: string; value: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/risks/${riskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Failed to update status");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="Change status"
        className="rounded-brand border border-hairline bg-surface px-2 py-1 text-xs text-ink outline-none transition-colors focus:border-cyber/60 disabled:opacity-50"
        value={value}
        disabled={busy}
        onChange={(e) => void update(e.target.value)}
      >
        {["open", "monitoring", "mitigating", "resolved", "closed"].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-sev-critical">{error}</span>}
    </div>
  );
}
