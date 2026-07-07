"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { PrimaryButton, GhostButton } from "@/components/ui";
import { selectClass } from "./risk-filters";

const inputClass =
  "w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-cyber/60";

export function NewRiskButton({ users }: { users: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const keywords = String(fd.get("keywords") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    try {
      const res = await fetch("/api/risks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fd.get("title"),
          description: fd.get("description"),
          category: fd.get("category"),
          severity: fd.get("severity"),
          status: fd.get("status"),
          source: fd.get("source"),
          sourceUrl: String(fd.get("sourceUrl") ?? ""),
          responsibleParty: fd.get("responsibleParty") || null,
          keywords,
        }),
      });
      const data = (await res.json()) as { error?: string; risk?: { id: string } };
      if (!res.ok) throw new Error(data.error ?? "Failed to create risk");
      setOpen(false);
      router.refresh();
      if (data.risk) router.push(`/risks/${data.risk.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create risk");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PrimaryButton onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New Risk
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
              <h2 className="font-display text-lg font-black text-ink">Register a new risk</h2>
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
              <input name="title" required minLength={3} placeholder="Risk title" className={inputClass} />
              <textarea
                name="description"
                required
                minLength={3}
                rows={4}
                placeholder="Describe the risk, its context and impact…"
                className={inputClass}
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-muted">
                  Category
                  <select name="category" required className={`${selectClass} mt-1 w-full`} defaultValue="infrastructure">
                    {["infrastructure", "cyber", "crime", "regulatory", "operational", "other"].map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-muted">
                  Severity
                  <select name="severity" required className={`${selectClass} mt-1 w-full`} defaultValue="medium">
                    {["critical", "high", "medium", "low"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-muted">
                  Status
                  <select name="status" className={`${selectClass} mt-1 w-full`} defaultValue="open">
                    {["open", "monitoring", "mitigating", "resolved", "closed"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-muted">
                  Source
                  <select name="source" className={`${selectClass} mt-1 w-full`} defaultValue="manual">
                    {["manual", "partner_report", "web_scrape"].map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-semibold text-muted">
                Responsible party
                <select name="responsibleParty" className={`${selectClass} mt-1 w-full`} defaultValue="">
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <input name="sourceUrl" type="url" placeholder="Source URL (optional)" className={inputClass} />
              <input
                name="keywords"
                placeholder="Keywords, comma-separated (e.g. cable theft, gauteng)"
                className={inputClass}
              />
              {error && <p className="text-sm text-sev-critical">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <GhostButton type="button" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </GhostButton>
                <PrimaryButton type="submit" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {busy ? "Creating…" : "Create risk"}
                </PrimaryButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
