"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Trash2, Upload, X, Download, Paperclip, Sparkles, CheckCircle2 } from "lucide-react";
import { GhostButton, PrimaryButton } from "@/components/ui";

import { DOCUMENT_CATEGORIES } from "./categories";

type RiskOption = { id: string; title: string };

export function UploadPanel({ openRisks }: { openRisks: RiskOption[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [linkedRiskId, setLinkedRiskId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{
    id: string;
    name: string;
    autoAnalysing: boolean;
  } | null>(null);

  function reset() {
    setFileName(null);
    setName("");
    setDescription("");
    setCategory("general");
    setLinkedRiskId("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (name.trim()) form.set("name", name.trim());
      if (description.trim()) form.set("description", description.trim());
      form.set("category", category);
      if (linkedRiskId) form.set("linkedRiskId", linkedRiskId);

      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; document?: { id: string; name: string }; autoAnalysing?: boolean }
        | null;
      if (!res.ok) {
        setError(data?.error ?? "Upload failed. Try again.");
        return;
      }
      reset();
      if (data?.document) {
        setUploaded({
          id: data.document.id,
          name: data.document.name,
          autoAnalysing: data.autoAnalysing === true,
        });
      } else {
        setOpen(false);
      }
      router.refresh();
    } catch {
      setError("Network error - upload failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <PrimaryButton type="button" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Upload document
      </PrimaryButton>
    );
  }

  if (uploaded) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 backdrop-blur-sm">
        <div className="animate-rise mt-12 w-full max-w-lg rounded-brand border border-hairline bg-surface p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-cyber" />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-black tracking-tight text-ink">
                Upload complete
              </h2>
              <p className="mt-1 text-sm text-muted">
                <span className="font-medium text-ink">{uploaded.name}</span> is now in the
                Document Hub.{" "}
                {uploaded.autoAnalysing
                  ? "AI analysis is running in the background. You will get a notification when it is ready."
                  : "Want the AI to interpret it and propose risks, intelligence and research?"}
              </p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <GhostButton
              type="button"
              onClick={() => {
                setUploaded(null);
                setOpen(false);
              }}
            >
              Done
            </GhostButton>
            <PrimaryButton
              type="button"
              onClick={() => router.push(`/documents/${uploaded.id}`)}
            >
              <Sparkles className="h-4 w-4" />
              {uploaded.autoAnalysing ? "View document" : "Analyse now"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="animate-rise mt-12 w-full max-w-lg rounded-brand border border-hairline bg-surface p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-black tracking-tight text-ink">
            Upload document
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className="text-muted transition-colors hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block font-display text-xs font-bold tracking-wide text-muted uppercase">
              File
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-brand border border-dashed border-hairline bg-canvas px-4 py-3 text-sm text-muted transition-colors hover:border-cyber/50 hover:text-ink">
              <Paperclip className="h-4 w-4 shrink-0" />
              <span className="truncate">{fileName ?? "Choose a file (pdf, docx, xlsx, csv, png, jpg, txt, md - max 20MB)"}</span>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.txt,.md"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </label>
          </div>

          <div>
            <label className="mb-1 block font-display text-xs font-bold tracking-wide text-muted uppercase">
              Display name <span className="normal-case font-normal">(optional - defaults to filename)</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-cyber/60"
              placeholder="Q3 fibre theft incident report"
            />
          </div>

          <div>
            <label className="mb-1 block font-display text-xs font-bold tracking-wide text-muted uppercase">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full resize-none rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-cyber/60"
              placeholder="Short context for the team"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-display text-xs font-bold tracking-wide text-muted uppercase">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-cyber/60"
              >
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-display text-xs font-bold tracking-wide text-muted uppercase">
                Link to risk
              </label>
              <select
                value={linkedRiskId}
                onChange={(e) => setLinkedRiskId(e.target.value)}
                className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-cyber/60"
              >
                <option value="">None</option>
                {openRisks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title.length > 60 ? `${r.title.slice(0, 60)}…` : r.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="rounded-brand border border-sev-critical/30 bg-sev-critical/10 px-3 py-2 text-sm text-sev-critical">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <GhostButton
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Cancel
            </GhostButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? "Uploading…" : "Upload"}
            </PrimaryButton>
          </div>
        </div>
      </form>
    </div>
  );
}

export function DocumentRowActions({
  id,
  name,
  canDelete,
  canAnalyse = false,
}: {
  id: string;
  name: string;
  canDelete: boolean;
  canAnalyse?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Delete failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {error && <span className="text-xs text-sev-critical">{error}</span>}
      {canAnalyse && (
        <Link
          href={`/documents/${id}`}
          className="inline-flex items-center gap-1.5 rounded-brand border border-hairline px-2.5 py-1.5 font-display text-xs font-bold text-ink transition-colors hover:border-cyber/50 hover:text-cyber"
          title="Analyse with AI"
        >
          <Sparkles className="h-3.5 w-3.5" /> Analyse
        </Link>
      )}
      <a
        href={`/api/documents/${id}`}
        className="inline-flex items-center gap-1.5 rounded-brand border border-hairline px-2.5 py-1.5 font-display text-xs font-bold text-ink transition-colors hover:border-cyber/50 hover:text-cyber"
        title="Download"
      >
        <Download className="h-3.5 w-3.5" /> Download
      </a>
      {canDelete && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="inline-flex items-center rounded-brand border border-hairline px-2 py-1.5 text-muted transition-colors hover:border-sev-critical/50 hover:text-sev-critical disabled:opacity-50"
          title="Delete"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

export function DocumentSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  function apply(q: string) {
    const params = new URLSearchParams(window.location.search);
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    router.push(`/documents?${params.toString()}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply(value);
      }}
      className="relative"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search documents…"
        className="w-64 rounded-brand border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-cyber/60"
      />
    </form>
  );
}
