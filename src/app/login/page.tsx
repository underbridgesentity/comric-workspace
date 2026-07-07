import { LoginForm } from "./login-form";
import { ComricLogo } from "@/components/logo";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4">
      {/* faint green corner bloom */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, #8eff00 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-56 -left-56 h-[600px] w-[600px] rounded-full opacity-[0.05]"
        style={{ background: "radial-gradient(circle, #03f8c5 0%, transparent 70%)" }}
      />

      <div className="animate-rise w-full max-w-sm">
        <div className="mb-8 flex items-baseline justify-center gap-2 text-ink select-none">
          <ComricLogo size={30} />
          <span className="font-display text-[11px] font-bold tracking-[0.3em] text-cyber">
            WORKSPACE
          </span>
        </div>

        <div className="rounded-brand border border-hairline bg-surface p-8 shadow-[0_8px_40px_rgba(0,0,0,0.25)]">
          <h1 className="font-display text-lg font-bold text-ink">Sign in</h1>
          <p className="mt-1 mb-6 text-sm text-muted">
            Internal risk-intelligence platform. Authorised personnel only.
          </p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Data resident in Cape Town, South Africa · POPIA compliant
        </p>
      </div>
    </main>
  );
}
