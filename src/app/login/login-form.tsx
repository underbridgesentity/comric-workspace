"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password, or your account is deactivated.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block font-display text-xs font-bold tracking-wide text-muted uppercase">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 transition-colors duration-150 focus:border-cyber/50"
          placeholder="you@comric.co.za"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block font-display text-xs font-bold tracking-wide text-muted uppercase">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-brand border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 transition-colors duration-150 focus:border-cyber/50"
          placeholder="••••••••"
        />
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
        disabled={loading}
        className="w-full rounded-brand bg-cyber px-4 py-2.5 font-display text-sm font-bold tracking-wide text-black transition-all duration-150 hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
