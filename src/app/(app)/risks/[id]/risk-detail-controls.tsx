"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { PrimaryButton } from "@/components/ui";
import { Markdown } from "@/components/markdown";

const selectClass =
  "rounded-brand border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-cyber/60 disabled:opacity-50";

export function InlineRiskSelect({
  riskId,
  field,
  value,
  options,
  label,
}: {
  riskId: string;
  field: "severity" | "status";
  value: string;
  options: string[];
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(next: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/risks/${riskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Failed to update ${field}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to update ${field}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="font-display text-[11px] font-bold tracking-wider text-muted uppercase">
        {label}
      </span>
      <select
        aria-label={label}
        className={selectClass}
        value={value}
        disabled={busy}
        onChange={(e) => void update(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-sev-critical">{error}</span>}
    </div>
  );
}

export function AddNoteForm({ riskId }: { riskId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/risks/${riskId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to add note");
      }
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Add an analyst note…"
        className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-cyber/60"
      />
      {error && <p className="text-sm text-sev-critical">{error}</p>}
      <div className="flex justify-end">
        <PrimaryButton type="submit" disabled={busy || !body.trim()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Posting…" : "Add note"}
        </PrimaryButton>
      </div>
    </form>
  );
}

export function DeepAnalysisButton({ riskId }: { riskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; content: string } | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/deep-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskId }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        report?: { title: string; content: string };
      } | null;
      if (!res.ok || !data?.report) {
        throw new Error(data?.error ?? "AI analysis failed");
      }
      setResult(data.report);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI analysis failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <PrimaryButton onClick={() => void run()} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "Analysing… this can take up to a minute" : "Run AI Deep Analysis"}
      </PrimaryButton>
      {error && <p className="text-sm text-sev-critical">{error}</p>}
      {result && (
        <div className="animate-rise rounded-brand border border-hairline bg-canvas p-4">
          <p className="mb-2 font-display text-sm font-bold text-ink">{result.title}</p>
          <Markdown content={result.content} />
        </div>
      )}
    </div>
  );
}
