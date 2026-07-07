"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Code2,
  FileUp,
  Loader2,
  PenLine,
  Sparkles,
  Upload,
} from "lucide-react";
import { Card, EmptyState, GhostButton, PrimaryButton } from "@/components/ui";
import { Markdown } from "@/components/markdown";

type Entry = {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  sourceType: "web_scrape" | "csv_import" | "manual" | "api";
  aiSummary: string | null;
  createdAt: string;
  createdBy: string;
};

const SOURCE_STYLES: Record<Entry["sourceType"], { label: string; cls: string }> = {
  web_scrape: { label: "Web scrape", cls: "border-digital/40 bg-digital/10 text-digital" },
  csv_import: { label: "CSV import", cls: "border-sev-high/40 bg-sev-high/10 text-sev-high" },
  manual: { label: "Manual", cls: "border-hairline bg-ink/5 text-muted dark:bg-white/5" },
  api: { label: "API feed", cls: "border-cyber/40 bg-cyber/10 text-cyber" },
};

type Tab = "entries" | "manual" | "csv" | "api";

const API_SNIPPET = `POST /api/research HTTP/1.1
Host: workspace.comric.co.za
Content-Type: application/json
Cookie: <authenticated session>

{
  "title": "Vodacom tower battery theft cluster — KZN",
  "content": "Field report details...",
  "keywords": ["battery theft", "KZN", "towers"],
  "sourceType": "api"
}`;

export function ResearchClient({
  canCreate,
  canAnalyse,
  unprocessedCount,
  entries,
}: {
  canCreate: boolean;
  canAnalyse: boolean;
  unprocessedCount: number;
  entries: Entry[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("entries");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Manual entry form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [saving, setSaving] = useState(false);

  // CSV state
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows] = useState<Record<string, unknown>[] | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // AI analysis
  const [analysing, setAnalysing] = useState(false);
  const [digest, setDigest] = useState<{ title: string; content: string } | null>(null);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; hidden?: boolean }[] = [
    { id: "entries", label: `Entries (${entries.length})`, icon: <BookOpen className="h-4 w-4" /> },
    { id: "manual", label: "Manual entry", icon: <PenLine className="h-4 w-4" />, hidden: !canCreate },
    { id: "csv", label: "CSV upload", icon: <FileUp className="h-4 w-4" />, hidden: !canCreate },
    { id: "api", label: "API feed", icon: <Code2 className="h-4 w-4" /> },
  ];

  async function submitManual() {
    if (!title.trim() || !content.trim()) {
      setError("Title and content are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          keywords: keywordsText.split(",").map((k) => k.trim()).filter(Boolean),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setTitle("");
      setContent("");
      setKeywordsText("");
      setNotice("Research entry saved.");
      setTab("entries");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleFile(file: File) {
    setError(null);
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.data.length === 0) {
          setError("The CSV appears to be empty.");
          return;
        }
        setCsvRows(result.data);
        setCsvFileName(file.name);
      },
      error: () => setError("Could not parse that CSV file."),
    });
  }

  async function importCsv() {
    if (!csvRows) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/research/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: csvFileName, rows: csvRows.slice(0, 500) }),
      });
      const data = (await res.json()) as {
        inserted?: number;
        rejectedRows?: number[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setNotice(
        `Imported ${data.inserted} row${data.inserted === 1 ? "" : "s"}${
          data.rejectedRows && data.rejectedRows.length > 0
            ? ` — skipped rows ${data.rejectedRows.join(", ")} (missing title/content)`
            : ""
        }.`,
      );
      setCsvRows(null);
      setCsvFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      setTab("entries");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function runAnalysis() {
    setAnalysing(true);
    setError(null);
    setDigest(null);
    try {
      const res = await fetch("/api/ai/research", { method: "POST" });
      const data = (await res.json()) as { title?: string; content?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setDigest({ title: data.title ?? "Research Digest", content: data.content ?? "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalysing(false);
    }
  }

  const inputCls =
    "w-full rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-cyber/50 focus:outline-none";

  return (
    <div className="space-y-5">
      {/* AI analysis banner */}
      <Card accent="blue" className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="flex items-center gap-2 font-display text-sm font-bold text-ink">
            <Sparkles className="h-4 w-4 text-digital" /> AI Research Analysis
          </h2>
          <p className="mt-1 text-sm text-muted">
            {unprocessedCount} unprocessed scrape result{unprocessedCount === 1 ? "" : "s"} and{" "}
            {entries.length} research entr{entries.length === 1 ? "y" : "ies"} available for the
            next digest.
          </p>
        </div>
        {canAnalyse && (
          <PrimaryButton onClick={runAnalysis} disabled={analysing}>
            {analysing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {analysing ? "Analysing…" : "Run AI Research Analysis"}
          </PrimaryButton>
        )}
      </Card>

      {notice && (
        <div className="rounded-brand border border-network/40 bg-network/10 px-4 py-2.5 text-sm text-digital">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-brand border border-sev-critical/40 bg-sev-critical/10 px-4 py-2.5 text-sm text-sev-critical">
          {error}
        </div>
      )}

      {digest && (
        <Card accent="green" className="animate-rise p-6">
          <p className="mb-2 font-display text-xs font-bold tracking-wider text-cyber uppercase">
            Freshly generated · saved to archive
          </p>
          <Markdown content={digest.content} />
        </Card>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-hairline">
        {tabs
          .filter((t) => !t.hidden)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 font-display text-sm font-bold transition-colors ${
                tab === t.id
                  ? "border-cyber text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
      </div>

      {/* Entries list */}
      {tab === "entries" &&
        (entries.length === 0 ? (
          <Card>
            <EmptyState
              icon={<BookOpen />}
              title="No research entries yet"
              hint="Add entries manually, import a CSV, or let the scrape pipeline feed the engine."
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => {
              const src = SOURCE_STYLES[e.sourceType];
              const open = expanded === e.id;
              return (
                <Card key={e.id} className="p-0">
                  <button
                    onClick={() => setExpanded(open ? null : e.id)}
                    className="flex w-full items-start justify-between gap-3 p-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-bold text-ink">{e.title}</span>
                        <span
                          className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${src.cls}`}
                        >
                          {src.label}
                        </span>
                        {e.aiSummary && (
                          <span className="inline-flex items-center gap-1 rounded-[4px] border border-digital/40 bg-digital/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-digital uppercase">
                            <Sparkles className="h-2.5 w-2.5" /> AI summary
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {e.createdBy} ·{" "}
                        {new Date(e.createdAt).toLocaleDateString("en-ZA", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {e.keywords.length > 0 && <> · {e.keywords.join(", ")}</>}
                      </p>
                      {!open && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-ink/70">
                          {e.aiSummary ?? e.content}
                        </p>
                      )}
                    </div>
                    {open ? (
                      <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted" />
                    ) : (
                      <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted" />
                    )}
                  </button>
                  {open && (
                    <div className="border-t border-hairline px-4 py-4">
                      {e.aiSummary && (
                        <div className="mb-3 rounded-brand border border-digital/30 bg-digital/5 p-3">
                          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-digital uppercase">
                            <Sparkles className="h-3 w-3" /> AI summary
                          </p>
                          <p className="text-sm text-ink/85">{e.aiSummary}</p>
                        </div>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink/85">
                        {e.content}
                      </p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ))}

      {/* Manual entry */}
      {tab === "manual" && canCreate && (
        <Card className="max-w-3xl p-5">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-muted uppercase">Title</label>
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Copper theft pattern along N3 corridor"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-muted uppercase">Content</label>
              <textarea
                className={`${inputCls} min-h-40 resize-y`}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Full research notes, findings, source references…"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-muted uppercase">
                Keywords (comma-separated, optional)
              </label>
              <input
                className={inputCls}
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder="copper theft, N3, syndicate"
              />
            </div>
            <PrimaryButton onClick={submitManual} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save entry
            </PrimaryButton>
          </div>
        </Card>
      )}

      {/* CSV upload */}
      {tab === "csv" && canCreate && (
        <Card className="max-w-3xl p-5">
          <p className="text-sm text-muted">
            Upload a CSV with <code className="font-mono text-digital">title</code>,{" "}
            <code className="font-mono text-digital">content</code> and optional{" "}
            <code className="font-mono text-digital">keywords</code> (semicolon/comma-separated)
            columns. Rows are validated server-side and stored as{" "}
            <span className="text-ink">csv_import</span> entries with the raw row preserved.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <GhostButton onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Choose CSV file
            </GhostButton>
            {csvFileName && (
              <span className="text-sm text-muted">
                <span className="text-ink">{csvFileName}</span> — {csvRows?.length ?? 0} rows
                parsed
              </span>
            )}
          </div>
          {csvRows && (
            <div className="mt-4">
              <PrimaryButton onClick={importCsv} disabled={importing}>
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                Import {Math.min(csvRows.length, 500)} rows
              </PrimaryButton>
              {csvRows.length > 500 && (
                <p className="mt-2 text-xs text-sev-high">
                  Only the first 500 rows will be imported per batch.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* API feed docs */}
      {tab === "api" && (
        <Card className="max-w-3xl p-5">
          <h3 className="font-display text-sm font-bold text-ink">Programmatic ingestion</h3>
          <p className="mt-1 text-sm text-muted">
            Partner systems can push intelligence directly into the research engine. Authenticate
            with a workspace session (analyst role or higher) and POST JSON to the endpoint below.
            Entries arrive tagged <span className="text-ink">api</span> and flow into the next AI
            analysis run automatically.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-brand border border-hairline bg-canvas p-4 font-mono text-xs leading-relaxed text-digital">
            {API_SNIPPET}
          </pre>
          <p className="mt-3 text-xs text-muted">
            Responses: <span className="font-mono">201</span> created ·{" "}
            <span className="font-mono">400</span> validation error ·{" "}
            <span className="font-mono">401/403</span> auth failure.
          </p>
        </Card>
      )}
    </div>
  );
}
