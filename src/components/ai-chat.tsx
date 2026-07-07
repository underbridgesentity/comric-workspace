"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { Markdown } from "@/components/markdown";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function AiChatPanel({
  open,
  initialQuestion,
  onClose,
}: {
  open: boolean;
  initialQuestion?: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setBusy(true);
    const next: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        setError(data.error ?? "The assistant is unavailable right now.");
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.reply! }]);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (open && initialQuestion && !sentInitial.current) {
      sentInitial.current = true;
      void send(initialQuestion);
    }
    if (!open) sentInitial.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuestion]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-40" role="dialog" aria-label="COMRiC AI assistant">
      <button
        aria-label="Close assistant"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[2px]"
      />
      <aside className="animate-rise absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-hairline bg-surface shadow-[0_0_60px_rgba(0,0,0,0.45)]">
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-cyber/15 shadow-[0_0_16px_-4px_#8eff00]">
              <Sparkles className="h-4 w-4 text-cyber" />
            </span>
            <div>
              <p className="font-display text-sm font-bold text-ink">COMRiC Assistant</p>
              <p className="text-[11px] text-muted">Answers from live platform data only</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-brand p-1.5 text-muted transition-colors hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !busy && (
            <div className="rounded-brand border border-hairline bg-canvas p-4 text-sm text-muted">
              Ask about anything on the platform — e.g.{" "}
              <em>&ldquo;What are our critical risks right now?&rdquo;</em>,{" "}
              <em>&ldquo;Any recent news about battery theft?&rdquo;</em> or{" "}
              <em>&ldquo;Summarise this week&rsquo;s alerts.&rdquo;</em>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-8 rounded-brand bg-cyber/10 px-3.5 py-2.5 text-sm text-ink">
                {m.content}
              </div>
            ) : (
              <div
                key={i}
                className="mr-4 rounded-brand border border-cyber/20 bg-surface px-3.5 py-2.5 text-sm"
                style={{ backgroundImage: "var(--gloss)" }}
              >
                <Markdown content={m.content} />
              </div>
            ),
          )}
          {busy && (
            <div className="mr-4 flex items-center gap-2 rounded-brand border border-hairline px-3.5 py-2.5 text-sm text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyber" /> Consulting platform data…
            </div>
          )}
          {error && (
            <div className="rounded-brand border border-sev-critical/30 bg-sev-critical/10 px-3.5 py-2.5 text-sm text-sev-critical">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-center gap-2 border-t border-hairline p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about risks, intel, news, reports…"
            aria-label="Message the assistant"
            autoFocus
            className="flex-1 rounded-brand border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-cyber/40"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="rounded-brand bg-cyber p-2 text-black shadow-[0_4px_14px_-4px_rgba(142,255,0,0.6)] transition-all hover:brightness-105 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </aside>
    </div>,
    document.body,
  );
}
