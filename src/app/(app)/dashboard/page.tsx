import { Suspense, type ReactNode } from "react";
import {
  and,
  count,
  eq,
  gte,
  inArray,
  lt,
} from "drizzle-orm";
import {
  Activity,
  FileText,
  Radar,
  Siren,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  aiReports,
  alerts,
  risks,
  scrapeResults,
  type RiskCategory,
  type Severity,
} from "@/lib/schema";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { BriefingPanel } from "./briefing-panel";
import { TrendChart, type TrendPoint } from "./trend-chart";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* Scoring model                                                       */
/* ------------------------------------------------------------------ */

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 12, high: 6, medium: 3, low: 1 };
const ACTIVE_STATUSES = ["open", "monitoring", "mitigating"] as const;
/** Weighted-load ceiling that maps to a score of 100. */
const SCORE_CEILING = 120;

const CATEGORY_LABELS: Record<RiskCategory, string> = {
  infrastructure: "Infrastructure",
  cyber: "Cyber",
  crime: "Crime",
  regulatory: "Regulatory",
  operational: "Operational",
  other: "Other",
};

function postureBand(score: number): { label: string; color: string } {
  if (score < 25) return { label: "CALM", color: "#8eff00" };
  if (score < 50) return { label: "GUARDED", color: "#eab308" };
  if (score < 75) return { label: "ELEVATED", color: "#f59e0b" };
  return { label: "SEVERE", color: "#dc2626" };
}

function heatColor(fraction: number): string {
  if (fraction >= 0.75) return "#dc2626";
  if (fraction >= 0.5) return "#f59e0b";
  if (fraction >= 0.25) return "#eab308";
  return "#8eff00";
}

/* ------------------------------------------------------------------ */
/* KPI row                                                             */
/* ------------------------------------------------------------------ */

type Kpi = {
  label: string;
  value: number;
  delta: number;
  upIsGood: boolean;
  caption: string;
  icon: ReactNode;
  accent: "green" | "red" | "blue" | "amber";
};

async function fetchKpis(): Promise<Kpi[]> {
  const now = Date.now();
  const d7 = new Date(now - 7 * 24 * 3600_000);
  const d14 = new Date(now - 14 * 24 * 3600_000);
  const d30 = new Date(now - 30 * 24 * 3600_000);
  const d60 = new Date(now - 60 * 24 * 3600_000);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const prevMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);

  const [
    [activeRisks],
    [risksNew30],
    [risksPrev30],
    [criticalUnread],
    [alertsNew7],
    [alertsPrev7],
    [hits7],
    [hitsPrev7],
    [reportsMonth],
    [reportsPrevMonth],
  ] = await Promise.all([
    db.select({ n: count() }).from(risks).where(inArray(risks.status, [...ACTIVE_STATUSES])),
    db.select({ n: count() }).from(risks).where(gte(risks.createdAt, d30)),
    db
      .select({ n: count() })
      .from(risks)
      .where(and(gte(risks.createdAt, d60), lt(risks.createdAt, d30))),
    db
      .select({ n: count() })
      .from(alerts)
      .where(and(eq(alerts.severity, "critical"), eq(alerts.isRead, false))),
    db
      .select({ n: count() })
      .from(alerts)
      .where(and(eq(alerts.severity, "critical"), gte(alerts.createdAt, d7))),
    db
      .select({ n: count() })
      .from(alerts)
      .where(
        and(eq(alerts.severity, "critical"), gte(alerts.createdAt, d14), lt(alerts.createdAt, d7)),
      ),
    db.select({ n: count() }).from(scrapeResults).where(gte(scrapeResults.scrapedAt, d7)),
    db
      .select({ n: count() })
      .from(scrapeResults)
      .where(and(gte(scrapeResults.scrapedAt, d14), lt(scrapeResults.scrapedAt, d7))),
    db.select({ n: count() }).from(aiReports).where(gte(aiReports.createdAt, monthStart)),
    db
      .select({ n: count() })
      .from(aiReports)
      .where(and(gte(aiReports.createdAt, prevMonthStart), lt(aiReports.createdAt, monthStart))),
  ]);

  return [
    {
      label: "Active Risks",
      value: activeRisks.n,
      delta: risksNew30.n - risksPrev30.n,
      upIsGood: false,
      caption: "Risk register · open, monitoring, mitigating",
      icon: <Radar className="h-4 w-4" />,
      accent: "blue",
    },
    {
      label: "Critical Alerts",
      value: criticalUnread.n,
      delta: alertsNew7.n - alertsPrev7.n,
      upIsGood: false,
      caption: "Alert engine · unread critical",
      icon: <Siren className="h-4 w-4" />,
      accent: "red",
    },
    {
      label: "Keyword Hits · 7d",
      value: hits7.n,
      delta: hits7.n - hitsPrev7.n,
      upIsGood: false,
      caption: "Web monitoring · scrape results",
      icon: <Activity className="h-4 w-4" />,
      accent: "amber",
    },
    {
      label: "Reports · Month",
      value: reportsMonth.n,
      delta: reportsMonth.n - reportsPrevMonth.n,
      upIsGood: true,
      caption: "AI engine · generated this month",
      icon: <FileText className="h-4 w-4" />,
      accent: "green",
    },
  ];
}

function DeltaTag({ delta, upIsGood }: { delta: number; upIsGood: boolean }) {
  if (delta === 0) {
    return <span className="font-display text-xs font-bold text-muted">— flat</span>;
  }
  const positive = delta > 0;
  const good = positive === upIsGood;
  const color = good ? "#8eff00" : "#dc2626";
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 font-display text-xs font-bold" style={{ color }}>
      <Icon className="h-3.5 w-3.5" />
      {positive ? "+" : ""}
      {delta}
    </span>
  );
}

async function KpiRow() {
  const kpis = await fetchKpis();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi, i) => (
        <div key={kpi.label} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
          <Card accent={kpi.accent} className="h-full px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="font-display text-[11px] font-bold tracking-[0.12em] text-muted uppercase">
                {kpi.label}
              </p>
              <span className="text-muted/70">{kpi.icon}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2.5">
              <span className="font-display text-3xl font-black tracking-tight text-ink tabular-nums">
                {kpi.value}
              </span>
              <DeltaTag delta={kpi.delta} upIsGood={kpi.upIsGood} />
            </div>
            <p className="mt-1.5 text-[11px] text-muted/80">{kpi.caption}</p>
          </Card>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Risk posture panel                                                  */
/* ------------------------------------------------------------------ */

function Gauge({ score }: { score: number }) {
  const band = postureBand(score);
  const size = 176;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const arc = (score / 100) * circumference;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-ink/10 dark:text-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={band.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference - arc}`}
          style={{ filter: `drop-shadow(0 0 6px ${band.color}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-black tracking-tight text-ink tabular-nums">
          {score}
        </span>
        <span
          className="mt-0.5 font-display text-[11px] font-black tracking-[0.18em]"
          style={{ color: band.color }}
        >
          {band.label}
        </span>
      </div>
    </div>
  );
}

async function RiskPosturePanel() {
  const allRisks = await db
    .select({
      severity: risks.severity,
      status: risks.status,
      category: risks.category,
      createdAt: risks.createdAt,
      updatedAt: risks.updatedAt,
    })
    .from(risks);

  const active = allRisks.filter((r) =>
    (ACTIVE_STATUSES as readonly string[]).includes(r.status),
  );
  const weightedLoad = active.reduce((sum, r) => sum + SEVERITY_WEIGHT[r.severity], 0);
  const score = Math.min(100, Math.max(0, Math.round((weightedLoad / SCORE_CEILING) * 100)));

  // 8-week trend: weighted load of risks in flight at each week's end
  // (created by then, and not yet resolved/closed by then).
  const weekMs = 7 * 24 * 3600_000;
  const trend: TrendPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekEnd = new Date(Date.now() - i * weekMs);
    const load = allRisks.reduce((sum, r) => {
      const createdByThen = r.createdAt <= weekEnd;
      const resolvedByThen =
        (r.status === "resolved" || r.status === "closed") && r.updatedAt <= weekEnd;
      return createdByThen && !resolvedByThen ? sum + SEVERITY_WEIGHT[r.severity] : sum;
    }, 0);
    const label = new Intl.DateTimeFormat("en-ZA", {
      day: "numeric",
      month: "short",
      timeZone: "Africa/Johannesburg",
    }).format(weekEnd);
    trend.push({ week: i === 0 ? "Now" : label, pressure: load });
  }

  // Drivers: top categories by weighted severity across active risks.
  const byCategory = new Map<RiskCategory, number>();
  for (const r of active) {
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + SEVERITY_WEIGHT[r.severity]);
  }
  const drivers = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxDriver = drivers[0]?.[1] ?? 1;

  return (
    <Card className="h-full p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-sm font-black tracking-tight text-ink">
            Risk Posture Index
          </h2>
          <p className="mt-0.5 text-[11px] text-muted">
            Composite of {active.length} active risks, severity-weighted
          </p>
        </div>
        <span className="rounded-[4px] border border-hairline px-2 py-0.5 font-display text-[10px] font-bold tracking-wide text-muted uppercase">
          0 – 100
        </span>
      </div>

      <div className="mt-5 flex flex-col items-center gap-6 lg:flex-row lg:items-start">
        <div className="shrink-0">
          <Gauge score={score} />
        </div>
        <div className="min-w-0 flex-1 self-stretch">
          <p className="mb-1 font-display text-[11px] font-bold tracking-[0.12em] text-muted uppercase">
            8-week pressure trend
          </p>
          <TrendChart data={trend} />
        </div>
      </div>

      <div className="mt-6 border-t border-hairline pt-4">
        <p className="mb-3 font-display text-[11px] font-bold tracking-[0.12em] text-muted uppercase">
          What is driving the score
        </p>
        {drivers.length === 0 ? (
          <p className="text-sm text-muted">No active risks on the register.</p>
        ) : (
          <div className="space-y-2.5">
            {drivers.map(([category, load]) => {
              const fraction = load / maxDriver;
              const color = heatColor(fraction);
              return (
                <div key={category} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs font-medium text-muted">
                    {CATEGORY_LABELS[category]}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/5 dark:bg-white/5">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(4, fraction * 100)}%`, backgroundColor: color }}
                    />
                  </div>
                  <span
                    className="w-8 shrink-0 text-right font-display text-xs font-black tabular-nums"
                    style={{ color }}
                  >
                    {load}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */

function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[118px]" />
      ))}
    </div>
  );
}

function PostureSkeleton() {
  return <Skeleton className="h-[480px]" />;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role ?? "read_only";
  const canAct = role !== "read_only" && can(role, "view", "alert");

  const greeting = new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Johannesburg",
  }).format(new Date());

  return (
    <div className="space-y-5">
      <div className="animate-rise">
        <PageHeader
          title="Command Dashboard"
          subtitle={`${greeting} · Live sector risk intelligence`}
        />
      </div>

      <Suspense fallback={<KpiRowSkeleton />}>
        <KpiRow />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="animate-rise lg:col-span-3" style={{ animationDelay: "160ms" }}>
          <Suspense fallback={<PostureSkeleton />}>
            <RiskPosturePanel />
          </Suspense>
        </div>
        <div className="animate-rise lg:col-span-2" style={{ animationDelay: "240ms" }}>
          <BriefingPanel canAct={canAct} />
        </div>
      </div>
    </div>
  );
}
