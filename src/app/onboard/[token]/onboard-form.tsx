"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

const inputClass =
  "w-full rounded-brand border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 transition-colors duration-150 focus:border-cyber/50 outline-none";

function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 10) issues.push("At least 10 characters");
  if (!/[a-zA-Z]/.test(password)) issues.push("At least one letter");
  if (!/[0-9]/.test(password)) issues.push("At least one number");
  return issues;
}

export function OnboardForm({
  token,
  email,
  initialFullName,
}: {
  token: string;
  email: string;
  initialFullName: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issues = passwordIssues(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = issues.length === 0 && confirm === password && fullName.trim().length >= 2;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, fullName: fullName.trim(), password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Setup failed. Please try again.");
        return;
      }
      // Account is ready; sign in with the new credentials.
      const login = await signIn("credentials", { email, password, redirect: false });
      if (login?.error) {
        router.push("/login");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="fullName"
          className="mb-1.5 block font-display text-xs font-bold tracking-wide text-muted uppercase"
        >
          Full name
        </label>
        <input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-muted">Correct your name if it was entered wrong.</p>
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block font-display text-xs font-bold tracking-wide text-muted uppercase"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched(true)}
          required
          autoComplete="new-password"
          className={inputClass}
          placeholder="Minimum 10 characters, a letter and a number"
        />
        {touched && password.length > 0 && issues.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-xs text-sev-critical">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label
          htmlFor="confirm"
          className="mb-1.5 block font-display text-xs font-bold tracking-wide text-muted uppercase"
        >
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          className={inputClass}
        />
        {mismatch && <p className="mt-1.5 text-xs text-sev-critical">Passwords do not match.</p>}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-brand border border-sev-critical/30 bg-sev-critical/10 px-3 py-2.5 text-sm text-sev-critical"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || (touched && !valid)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-brand bg-cyber px-4 py-2.5 font-display text-sm font-bold tracking-wide text-black transition-all duration-150 hover:brightness-110 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Setting up…" : "Complete setup"}
      </button>
    </form>
  );
}
