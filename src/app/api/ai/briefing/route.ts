import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiReports, alerts, risks, sectorIntelligence, type Severity } from "@/lib/schema";
import { guard } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { anthropic, AI_MODEL, COMRIC_CONTEXT, textFromMessage } from "@/lib/anthropic";

export const runtime = "nodejs";

const SEVERITY_RANK: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

function johannesburgDateLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function briefingTitle(): string {
  return `Daily Briefing — ${johannesburgDateLabel()}`;
}

type BriefingPayload = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  source: "ai" | "deterministic";
};

async function findTodaysBriefing(): Promise<BriefingPayload | null> {
  const [existing] = await db
    .select()
    .from(aiReports)
    .where(and(eq(aiReports.reportType, "risk_summary"), eq(aiReports.title, briefingTitle())))
    .orderBy(desc(aiReports.createdAt))
    .limit(1);
  if (!existing) return null;
  const params = (existing.parameters ?? {}) as { source?: string };
  return {
    id: existing.id,
    title: existing.title,
    content: existing.content,
    createdAt: existing.createdAt.toISOString(),
    source: params.source === "ai" ? "ai" : "deterministic",
  };
}

async function gatherLiveData() {
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000);

  const activeRisks = await db
    .select({
      title: risks.title,
      category: risks.category,
      severity: risks.severity,
      status: risks.status,
      createdAt: risks.createdAt,
    })
    .from(risks)
    .where(inArray(risks.status, ["open", "monitoring", "mitigating"]))
    .orderBy(desc(risks.createdAt))
    .limit(50);

  const topRisks = [...activeRisks]
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, 8);

  const recentIntel = await db
    .select({
      title: sectorIntelligence.title,
      summary: sectorIntelligence.summary,
      incidentType: sectorIntelligence.incidentType,
      location: sectorIntelligence.location,
      createdAt: sectorIntelligence.createdAt,
    })
    .from(sectorIntelligence)
    .where(gte(sectorIntelligence.createdAt, since7d))
    .orderBy(desc(sectorIntelligence.createdAt))
    .limit(8);

  const criticalAlerts = await db
    .select({ title: alerts.title, body: alerts.body, createdAt: alerts.createdAt })
    .from(alerts)
    .where(and(eq(alerts.severity, "critical"), eq(alerts.isRead, false)))
    .orderBy(desc(alerts.createdAt))
    .limit(6);

  return { activeRisks, topRisks, recentIntel, criticalAlerts };
}

type LiveData = Awaited<ReturnType<typeof gatherLiveData>>;

function deterministicBriefing(data: LiveData): string {
  const { activeRisks, topRisks, recentIntel, criticalAlerts } = data;
  const bySeverity = (sev: Severity) => activeRisks.filter((r) => r.severity === sev).length;
  const lines: string[] = [];

  lines.push(`## Posture overview`);
  lines.push(
    `The register currently tracks **${activeRisks.length} active risks** — ` +
      `${bySeverity("critical")} critical, ${bySeverity("high")} high, ` +
      `${bySeverity("medium")} medium and ${bySeverity("low")} low. ` +
      (criticalAlerts.length > 0
        ? `**${criticalAlerts.length} unread critical alert${criticalAlerts.length === 1 ? "" : "s"}** require attention.`
        : `No unread critical alerts are outstanding.`),
  );

  if (topRisks.length > 0) {
    lines.push(``, `## Priority risks`);
    for (const r of topRisks.slice(0, 5)) {
      lines.push(`- **${r.title}** — ${r.severity} severity, ${r.category}, status ${r.status}.`);
    }
  }

  if (recentIntel.length > 0) {
    lines.push(``, `## Sector intelligence (last 7 days)`);
    for (const i of recentIntel.slice(0, 4)) {
      lines.push(
        `- **${i.title}** (${i.incidentType}${i.location ? `, ${i.location}` : ""}): ${i.summary}`,
      );
    }
  }

  if (criticalAlerts.length > 0) {
    lines.push(``, `## Outstanding critical alerts`);
    for (const a of criticalAlerts.slice(0, 4)) {
      lines.push(`- **${a.title}** — ${a.body}`);
    }
  }

  lines.push(
    ``,
    `## Recommended focus`,
    `- Review and acknowledge outstanding critical alerts.`,
    `- Confirm mitigation owners on the highest-severity open risks.`,
    `- Cross-reference this week's sector intelligence against the active register.`,
  );

  return lines.join("\n");
}

async function aiBriefing(data: LiveData): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { activeRisks, topRisks, recentIntel, criticalAlerts } = data;
    const prompt = [
      `Write today's executive daily briefing (${johannesburgDateLabel()}) for the COMRiC dashboard.`,
      `Keep it under 350 words. Use short markdown sections: Posture overview, Priority risks, Sector intelligence, Recommended focus.`,
      `Base it strictly on this live platform data:`,
      ``,
      `ACTIVE RISK COUNTS: total ${activeRisks.length}`,
      `TOP RISKS:`,
      ...topRisks.map((r) => `- ${r.title} | ${r.severity} | ${r.category} | ${r.status}`),
      `RECENT SECTOR INTELLIGENCE (7d):`,
      ...recentIntel.map(
        (i) => `- ${i.title} | ${i.incidentType}${i.location ? ` | ${i.location}` : ""} | ${i.summary}`,
      ),
      `UNREAD CRITICAL ALERTS:`,
      ...criticalAlerts.map((a) => `- ${a.title}: ${a.body}`),
    ].join("\n");

    const message = await anthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 1200,
      system: COMRIC_CONTEXT,
      messages: [{ role: "user", content: prompt }],
    });
    const text = textFromMessage(message).trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    console.error("AI briefing generation failed, using deterministic fallback", err);
    return null;
  }
}

export async function GET() {
  const gate = await guard("view", "dashboard");
  if (gate.error) return gate.error;
  const briefing = await findTodaysBriefing();
  return NextResponse.json({ briefing });
}

export async function POST() {
  const gate = await guard("view", "dashboard");
  if (gate.error) return gate.error;

  // Idempotent: never regenerate an existing briefing for today.
  const existing = await findTodaysBriefing();
  if (existing) return NextResponse.json({ briefing: existing });

  const data = await gatherLiveData();
  const aiText = await aiBriefing(data);
  const content = aiText ?? deterministicBriefing(data);
  const source: "ai" | "deterministic" = aiText ? "ai" : "deterministic";

  const [row] = await db
    .insert(aiReports)
    .values({
      title: briefingTitle(),
      reportType: "risk_summary",
      content,
      parameters: { source, kind: "daily_briefing" },
      generatedBy: gate.user.id,
    })
    .returning();

  await logActivity({
    actor: gate.user.id,
    action: "generated_daily_briefing",
    entityType: "ai_report",
    entityId: row.id,
    metadata: { source },
  });

  const briefing: BriefingPayload = {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    source,
  };
  return NextResponse.json({ briefing });
}
