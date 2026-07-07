"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, Plus, X, ArrowUpRight } from "lucide-react";
import { PrimaryButton, GhostButton } from "@/components/ui";

const inputClass =
  "w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-cyber/60";
const selectClass =
  "rounded-brand border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-cyber/60 disabled:opacity-50";

export function AddIntelligenceButton({ risks }: { risks: { id: string; title: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const occurred = String(fd.get("occurredAt") ?? "");
    try {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fd.get("title"),
          summary: fd.get("summary"),
          incidentType: fd.get("incidentType"),
          location: String(fd.get("location") ?? "") || null,
          source: String(fd.get("source") ?? "") || null,
          sourceUrl: String(fd.get("sourceUrl") ?? ""),
          occurredAt: occurred ? new Date(occurred).toISOString() : null,
          linkedRiskId: fd.get("linkedRiskId") || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Failed to add intelligence");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add intelligence");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PrimaryButton onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add intelligence
      </PrimaryButton>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="animate-rise mt-8 w-full max-w-xl rounded-brand border border-hairline bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-black text-ink">Add sector intelligence</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted transition-colors hover:text-cyber"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <input name="title" required minLength={3} placeholder="Headline" className={inputClass} />
              <textarea
                name="summary"
                required
                minLength={3}
                rows={4}
                placeholder="What happened, where, and why it matters…"
                className={inputClass}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="incidentType"
                  required
                  minLength={2}
                  placeholder="Incident type (e.g. cable theft)"
                  className={inputClass}
                />
                <input name="location" placeholder="Location" className={inputClass} />
                <input name="source" placeholder="Source (e.g. SAPS, MyBroadband)" className={inputClass} />
                <input name="occurredAt" type="date" aria-label="Occurred on" className={inputClass} />
              </div>
              <input name="sourceUrl" type="url" placeholder="Source URL (optional)" className={inputClass} />
              <label className="block text-xs font-semibold text-muted">
                Link to risk (optional)
                <select name="linkedRiskId" className={`${selectClass} mt-1 w-full`} defaultValue="">
                  <option value="">Not linked</option>
                  {risks.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
              {error && <p className="text-sm text-sev-critical">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <GhostButton type="button" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </GhostButton>
                <PrimaryButton type="submit" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {busy ? "Saving…" : "Add intelligence"}
                </PrimaryButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function LinkRiskSelect({
  intelId,
  currentRiskId,
  risks,
}: {
  intelId: string;
  currentRiskId: string | null;
  risks: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link(riskId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/intelligence/${intelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedRiskId: riskId || null }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Failed to link risk");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link risk");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="Link to risk"
        className={`${selectClass} text-xs`}
        value={currentRiskId ?? ""}
        disabled={busy}
        onChange={(e) => void link(e.target.value)}
      >
        <option value="">Link to risk…</option>
        {risks.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-sev-critical">{error}</span>}
    </div>
  );
}

export function PromoteButton({ scrapeResultId }: { scrapeResultId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function promote() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/intelligence/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scrapeResultId }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Failed to promote");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void promote()}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs font-bold text-cyber transition-all hover:brightness-110 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpRight className="h-3 w-3" />}
        {busy ? "Promoting…" : "Promote to intelligence"}
      </button>
      {error && <p className="text-xs text-sev-critical">{error}</p>}
    </div>
  );
}
