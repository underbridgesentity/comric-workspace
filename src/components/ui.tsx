import type { ReactNode } from "react";
import type { Severity } from "@/lib/schema";

export function Card({
  children,
  className = "",
  accent,
}: {
  children: ReactNode;
  className?: string;
  /** optional liquid colour wash: 'green' | 'red' | 'blue' | 'amber' */
  accent?: "green" | "red" | "blue" | "amber";
}) {
  // Layered "liquid" wash: a corner bloom plus a soft counter-glow so the
  // colour reads as light moving through the surface, not a printed stripe.
  const blooms: Record<string, string> = {
    green:
      "radial-gradient(120% 90% at 100% 0%, rgba(142,255,0,0.11), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(142,255,0,0.04), transparent 60%)",
    red: "radial-gradient(120% 90% at 100% 0%, rgba(220,38,38,0.13), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(220,38,38,0.05), transparent 60%)",
    blue: "radial-gradient(120% 90% at 100% 0%, rgba(3,248,197,0.10), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(3,248,197,0.04), transparent 60%)",
    amber:
      "radial-gradient(120% 90% at 100% 0%, rgba(245,158,11,0.12), transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(245,158,11,0.05), transparent 60%)",
  };
  const layers = accent ? `${blooms[accent]}, var(--gloss)` : "var(--gloss)";
  return (
    <div
      className={`relative overflow-hidden rounded-brand border border-hairline bg-surface ${className}`}
      style={{ backgroundImage: layers, boxShadow: "var(--card-shadow)" }}
    >
      {/* specular top edge - the "liquid gloss" highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, var(--specular), transparent)",
        }}
      />
      {children}
    </div>
  );
}

export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "#dc2626",
  high: "#f59e0b",
  medium: "#eab308",
  low: "#6b7280",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const color = SEVERITY_COLORS[severity];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 font-display text-[11px] font-bold tracking-wide uppercase"
      style={{ color, backgroundColor: `${color}1a`, border: `1px solid ${color}33` }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      />
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "#dc2626",
    monitoring: "#f59e0b",
    mitigating: "#03f8c5",
    resolved: "#006d5b",
    closed: "#6b7280",
    active: "#006d5b",
    inactive: "#6b7280",
  };
  const color = map[status] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center rounded-[4px] px-2 py-0.5 font-display text-[11px] font-bold tracking-wide uppercase"
      style={{ color, backgroundColor: `${color}1a`, border: `1px solid ${color}33` }}
    >
      {status}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse-soft rounded-brand bg-ink/5 dark:bg-white/5 ${className}`}
    />
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="text-muted/60 [&>svg]:h-8 [&>svg]:w-8 [&>svg]:stroke-[1.25]">{icon}</div>
      <p className="font-display text-sm font-bold text-ink">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-black tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-brand bg-cyber px-4 py-2 font-display text-sm font-bold text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_18px_-6px_rgba(142,255,0,0.5)] transition-all duration-150 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_24px_-6px_rgba(142,255,0,0.7)] hover:brightness-105 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0) 50%)",
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-brand border border-hairline bg-surface px-4 py-2 font-display text-sm font-bold text-ink transition-all duration-150 hover:border-cyber/40 hover:text-cyber active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      {children}
    </button>
  );
}
