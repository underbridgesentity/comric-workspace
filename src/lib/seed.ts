/**
 * Seed script: realistic South African telecom-sector demo data.
 * Run with: npm run db:seed
 */
import { hash } from "bcryptjs";
import { db } from "./db";
import {
  users,
  risks,
  riskNotes,
  sectorIntelligence,
  researchEntries,
  keywordSets,
  scrapeResults,
  aiReports,
  alerts,
  activityLog,
  alertThresholds,
  type Role,
  type Severity,
  type RiskCategory,
  type RiskStatus,
} from "./schema";

const DEMO_PASSWORD = "Comric#2026!";

async function main() {
  console.log("Seeding COMRiC Workspace…");
  const passwordHash = await hash(DEMO_PASSWORD, 12);

  const userRows: Array<{ fullName: string; email: string; role: Role }> = [
    { fullName: "Nomvula Dlamini", email: "ceo@comric.co.za", role: "ceo" },
    { fullName: "Sipho Mokoena", email: "ops@comric.co.za", role: "ops_manager" },
    { fullName: "Thandi Nkosi", email: "analyst@comric.co.za", role: "analyst" },
    { fullName: "Pieter van der Merwe", email: "stakeholder@comric.co.za", role: "read_only" },
    { fullName: "Lerato Molefe", email: "lerato.molefe@comric.co.za", role: "analyst" },
    { fullName: "Johan Botha", email: "johan.botha@comric.co.za", role: "analyst" },
    { fullName: "Zanele Khumalo", email: "zanele.khumalo@comric.co.za", role: "analyst" },
    { fullName: "Ayanda Mthembu", email: "ayanda.mthembu@comric.co.za", role: "ops_manager" },
    { fullName: "Riaan Fourie", email: "riaan.fourie@comric.co.za", role: "read_only" },
    { fullName: "Naledi Sithole", email: "naledi.sithole@comric.co.za", role: "analyst" },
  ];

  const insertedUsers = await db
    .insert(users)
    .values(
      userRows.map((u, i) => ({
        ...u,
        passwordHash,
        isActive: true,
        lastSeenAt: new Date(Date.now() - i * 3600_000),
      })),
    )
    .onConflictDoNothing()
    .returning();

  const all = insertedUsers.length
    ? insertedUsers
    : await db.select().from(users);
  const byRole = (r: Role) => all.find((u) => u.role === r)!;
  const analysts = all.filter((u) => u.role === "analyst");
  const ceo = byRole("ceo");
  const ops = byRole("ops_manager");
  const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  const riskSeed: Array<{
    title: string;
    description: string;
    category: RiskCategory;
    severity: Severity;
    status: RiskStatus;
    keywords: string[];
    daysOld: number;
  }> = [
    { title: "Fibre theft syndicate active along N3 corridor", description: "Coordinated fibre cable theft incidents between Heidelberg and Villiers. Pattern suggests an organised syndicate with insider route knowledge. Three operators affected in 14 days; repair costs exceeding R4.2m.", category: "crime", severity: "critical", status: "mitigating", keywords: ["fibre theft", "N3", "syndicate"], daysOld: 12 },
    { title: "Base-station battery theft spike — East Rand", description: "Lithium battery theft up 60% quarter-on-quarter across Ekurhuleni sites. Stolen units resurfacing in informal solar installations. Armed response contracts under review.", category: "crime", severity: "critical", status: "open", keywords: ["battery theft", "base station", "Ekurhuleni"], daysOld: 5 },
    { title: "Tower vandalism cluster in KZN south coast", description: "Seven towers vandalised in 30 days around Port Shepstone. Copper earthing straps and rectifiers targeted. Community engagement programme proposed.", category: "infrastructure", severity: "high", status: "monitoring", keywords: ["tower vandalism", "KZN", "copper"], daysOld: 21 },
    { title: "Stage 6 load-shedding strain on backup power", description: "Extended Stage 6 rotations exhausting battery autonomy at rural sites before recharge windows. Estimated 8% network availability degradation in Limpopo and Mpumalanga.", category: "infrastructure", severity: "high", status: "mitigating", keywords: ["load-shedding", "backup power", "generators"], daysOld: 30 },
    { title: "ICASA spectrum licence renewal conditions", description: "Draft renewal conditions introduce coverage obligations for deep rural districts with 24-month compliance windows. Sector submission due within 45 days.", category: "regulatory", severity: "medium", status: "monitoring", keywords: ["ICASA", "spectrum", "licence"], daysOld: 18 },
    { title: "Ransomware targeting operator OSS/BSS stacks", description: "Threat-intel partners report a ransomware group probing SA telecom billing and provisioning systems via unpatched VPN concentrators.", category: "cyber", severity: "critical", status: "open", keywords: ["ransomware", "OSS", "BSS", "VPN"], daysOld: 3 },
    { title: "SIM-swap fraud escalation via insider access", description: "Banking partners flag a 35% rise in SIM-swap fraud traced to compromised retail channel credentials.", category: "cyber", severity: "high", status: "mitigating", keywords: ["SIM swap", "fraud", "insider"], daysOld: 25 },
    { title: "Diesel supply chain disruption risk", description: "Fuel logistics providers warn of regional diesel shortages affecting generator refuelling schedules for off-grid sites during peak load-shedding.", category: "operational", severity: "medium", status: "monitoring", keywords: ["diesel", "generators", "supply chain"], daysOld: 40 },
    { title: "Copper cable theft on Gauteng metro rings", description: "Legacy copper rings in Johannesburg CBD suffering repeat theft; migration to fibre accelerating but interim outages affect enterprise SLAs.", category: "crime", severity: "high", status: "mitigating", keywords: ["copper theft", "Gauteng", "metro"], daysOld: 50 },
    { title: "Municipal wayleave approval backlogs", description: "Wayleave processing delays in three metros stalling fibre repair and build programmes; average approval time now 87 days.", category: "regulatory", severity: "medium", status: "open", keywords: ["wayleave", "municipal", "fibre build"], daysOld: 33 },
    { title: "DDoS attacks on DNS infrastructure", description: "Sustained volumetric DDoS events against operator DNS resolvers, peaking at 450Gbps. Mitigation capacity holding but headroom shrinking.", category: "cyber", severity: "high", status: "monitoring", keywords: ["DDoS", "DNS"], daysOld: 9 },
    { title: "Tower climber safety incidents rising", description: "Two serious fall-arrest failures reported this quarter. Contractor safety audit programme behind schedule.", category: "operational", severity: "medium", status: "open", keywords: ["safety", "riggers", "contractors"], daysOld: 15 },
    { title: "Substation failures cascading to transmission sites", description: "Eskom substation failures in Free State causing multi-day outages beyond battery autonomy at 14 high-site repeaters.", category: "infrastructure", severity: "high", status: "monitoring", keywords: ["Eskom", "substation", "high sites"], daysOld: 27 },
    { title: "POPIA enforcement action risk — subscriber data", description: "Information Regulator signalling audits of telecom subscriber data-handling. Gap analysis outstanding for two member operators.", category: "regulatory", severity: "medium", status: "open", keywords: ["POPIA", "Information Regulator", "audit"], daysOld: 22 },
    { title: "Armed robbery of field technicians", description: "Field teams in Cape Flats and Alexandra targeted for vehicles, tools, and network equipment. Escort protocols under negotiation.", category: "crime", severity: "high", status: "mitigating", keywords: ["armed robbery", "field teams"], daysOld: 11 },
    { title: "Microwave link interference from unlicensed spectrum", description: "Unlicensed 5.8GHz deployments interfering with licensed backhaul in dense townships; ICASA complaint lodged.", category: "regulatory", severity: "low", status: "monitoring", keywords: ["interference", "microwave", "spectrum"], daysOld: 60 },
    { title: "Data centre cooling failure risk during heatwaves", description: "Extreme heat events pushing legacy cooling plants at two regional data centres beyond design limits.", category: "infrastructure", severity: "medium", status: "open", keywords: ["data centre", "cooling", "heatwave"], daysOld: 44 },
    { title: "Phishing campaign impersonating operator brands", description: "Large-scale smishing/phishing campaign harvesting subscriber credentials using operator branding; takedown requests in progress.", category: "cyber", severity: "medium", status: "mitigating", keywords: ["phishing", "smishing", "brand abuse"], daysOld: 8 },
    { title: "Generator theft at rural repeater sites", description: "Mobile generator units stolen from unmanned rural sites in North West; GPS tracking pilot underway.", category: "crime", severity: "medium", status: "monitoring", keywords: ["generator theft", "rural sites"], daysOld: 36 },
    { title: "Fibre route single-point-of-failure — Karoo corridor", description: "Long-haul route between Beaufort West and De Aar lacks ring protection; single cut isolates three towns.", category: "infrastructure", severity: "medium", status: "open", keywords: ["fibre", "redundancy", "Karoo"], daysOld: 55 },
    { title: "Insider data exfiltration attempt detected", description: "DLP alert flagged bulk subscriber-record export attempt by contractor account at a member operator; forensics engaged.", category: "cyber", severity: "high", status: "open", keywords: ["insider threat", "DLP", "exfiltration"], daysOld: 2 },
    { title: "Sabotage threat during municipal strike action", description: "Union strike action in eThekwini accompanied by threats against network infrastructure; security posture elevated.", category: "crime", severity: "medium", status: "monitoring", keywords: ["strike", "sabotage", "eThekwini"], daysOld: 6 },
    { title: "EMF compliance disputes delaying site builds", description: "Community objections citing EMF concerns delaying 23 new site builds; standardised communication pack in draft.", category: "regulatory", severity: "low", status: "open", keywords: ["EMF", "community", "site build"], daysOld: 70 },
    { title: "Legacy 2G sunset migration risk", description: "M2M and rural voice dependency on 2G complicates sunset timelines; regulator consultation pending.", category: "operational", severity: "low", status: "monitoring", keywords: ["2G sunset", "M2M"], daysOld: 90 },
    { title: "Vandalism of solar hybrid power installations", description: "Solar panels and inverters at hybrid-powered sites stolen or damaged within weeks of installation in Eastern Cape pilot.", category: "crime", severity: "high", status: "open", keywords: ["solar", "hybrid power", "Eastern Cape"], daysOld: 4 },
  ];

  const insertedRisks = await db
    .insert(risks)
    .values(
      riskSeed.map((r, i) => ({
        title: r.title,
        description: r.description,
        category: r.category,
        severity: r.severity,
        status: r.status,
        source: (i % 5 === 0 ? "web_scrape" : i % 3 === 0 ? "partner_report" : "manual") as
          | "web_scrape"
          | "partner_report"
          | "manual",
        keywords: r.keywords,
        responsibleParty: pick(analysts, i).id,
        createdBy: i % 4 === 0 ? ops.id : pick(analysts, i + 1).id,
        createdAt: daysAgo(r.daysOld),
        updatedAt: daysAgo(Math.max(0, r.daysOld - 2)),
      })),
    )
    .returning();

  await db.insert(riskNotes).values([
    { riskId: insertedRisks[0].id, body: "SAPS provincial task team briefed. Joint operation with private security scheduled for next week.", createdBy: ops.id, createdAt: daysAgo(10) },
    { riskId: insertedRisks[0].id, body: "Two arrests made near Villiers. Recovered 3.4km of cable. Syndicate believed to have 3 more cells.", createdBy: analysts[0].id, createdAt: daysAgo(6) },
    { riskId: insertedRisks[1].id, body: "Battery vault retrofit quotes received from three vendors. Recommending phased rollout starting with highest-loss sites.", createdBy: analysts[1].id, createdAt: daysAgo(3) },
    { riskId: insertedRisks[5].id, body: "IOC list distributed to all member SOC teams. Two operators confirmed VPN patching complete.", createdBy: analysts[2].id, createdAt: daysAgo(1) },
    { riskId: insertedRisks[3].id, body: "Lithium upgrade programme for top 200 rural sites approved. Delivery lead time 10 weeks.", createdBy: ops.id, createdAt: daysAgo(14) },
  ]);

  await db.insert(sectorIntelligence).values([
    { title: "Cable theft arrests in Gauteng recovery operation", summary: "SAPS and private security recovered 12 tonnes of stolen copper and fibre cable in a Boksburg scrapyard raid; five suspects arrested including a scrap dealer.", incidentType: "cable_theft", location: "Boksburg, Gauteng", source: "SAPS media release", sourceUrl: "https://www.saps.gov.za", occurredAt: daysAgo(7), linkedRiskId: insertedRisks[8].id, createdBy: analysts[0].id },
    { title: "Eskom warns of prolonged Stage 6 into winter", summary: "Eskom system operator briefing indicates elevated load-shedding risk through winter peak, with Stage 6 contingencies for generation shortfalls.", incidentType: "power", location: "National", source: "Eskom system status briefing", occurredAt: daysAgo(5), linkedRiskId: insertedRisks[3].id, createdBy: analysts[1].id },
    { title: "ICASA publishes draft spectrum renewal framework", summary: "Draft framework ties renewals to rural coverage obligations and infrastructure sharing commitments. Comment window: 45 days.", incidentType: "regulatory", location: "National", source: "Government Gazette", occurredAt: daysAgo(18), linkedRiskId: insertedRisks[4].id, createdBy: analysts[2].id },
    { title: "Tower battery syndicate using cloned access cards", summary: "Member operator forensic review found cloned site-access cards used in four battery theft incidents, indicating insider data leakage.", incidentType: "theft", location: "Ekurhuleni, Gauteng", source: "Member operator report", occurredAt: daysAgo(4), linkedRiskId: insertedRisks[1].id, createdBy: analysts[0].id },
    { title: "Telecom-sector phishing wave detected by SOC partners", summary: "Coordinated smishing campaign spoofing operator sender IDs; over 40k messages blocked in 48 hours.", incidentType: "cyber", location: "National", source: "SOC partner feed", occurredAt: daysAgo(2), linkedRiskId: insertedRisks[17].id, createdBy: analysts[3 % analysts.length].id },
    { title: "Community forum blocks tower build in Khayelitsha", summary: "Site build suspended after community objections; engagement meeting scheduled with ward councillor.", incidentType: "community", location: "Khayelitsha, Western Cape", source: "Field report", occurredAt: daysAgo(9), createdBy: analysts[1].id },
  ]);

  const [ks1, ks2, ks3] = await db
    .insert(keywordSets)
    .values([
      { name: "Infrastructure crime", keywords: ["cable theft", "fibre theft", "battery theft", "tower vandalism", "copper theft"], isActive: true, lastRunAt: daysAgo(0), createdBy: analysts[0].id },
      { name: "Power & load-shedding", keywords: ["load-shedding", "eskom", "stage 6", "generator", "grid failure"], isActive: true, lastRunAt: daysAgo(0), createdBy: analysts[1].id },
      { name: "Regulatory watch", keywords: ["icasa", "spectrum", "popia", "information regulator", "gazette"], isActive: true, lastRunAt: daysAgo(1), createdBy: ops.id },
    ])
    .returning();

  await db.insert(scrapeResults).values([
    { keywordSetId: ks1.id, sourceUrl: "https://mybroadband.co.za/news/fibre/example-1", title: "Fibre network sabotage costs operators millions", snippet: "Operators report escalating fibre cable theft along major national routes…", matchedKeywords: ["fibre theft", "cable theft"], relevanceScore: 0.92, processed: true, scrapedAt: daysAgo(1) },
    { keywordSetId: ks1.id, sourceUrl: "https://businesstech.co.za/news/example-2", title: "Battery theft syndicates target cell towers", snippet: "Lithium-ion batteries stolen from towers are being resold into the solar market…", matchedKeywords: ["battery theft"], relevanceScore: 0.88, processed: true, scrapedAt: daysAgo(1) },
    { keywordSetId: ks2.id, sourceUrl: "https://ewn.co.za/example-3", title: "Stage 6 load-shedding returns amid plant breakdowns", snippet: "Eskom implemented Stage 6 following multiple unit trips…", matchedKeywords: ["stage 6", "load-shedding", "eskom"], relevanceScore: 0.85, processed: false, scrapedAt: daysAgo(0) },
    { keywordSetId: ks3.id, sourceUrl: "https://techcentral.co.za/example-4", title: "ICASA opens comment on spectrum renewal conditions", snippet: "The regulator has gazetted draft renewal conditions for high-demand spectrum…", matchedKeywords: ["icasa", "spectrum"], relevanceScore: 0.9, processed: false, scrapedAt: daysAgo(0) },
  ]);

  await db.insert(researchEntries).values([
    { title: "Q2 infrastructure crime pattern analysis", content: "Aggregated incident data shows displacement of theft activity from Gauteng metro rings to N3/N17 corridor routes following metro hardening programmes. Recommend corridor-focused surveillance investment.", keywords: ["crime patterns", "displacement", "corridors"], sourceType: "manual", createdBy: analysts[0].id, createdAt: daysAgo(20), updatedAt: daysAgo(20) },
    { title: "Load-shedding vs network availability correlation", content: "Regression across 4 200 sites: each sustained stage above 4 correlates with 2.1% availability loss in sites with <8h battery autonomy. Fleet upgrade prioritisation model attached.", keywords: ["load-shedding", "availability", "batteries"], sourceType: "csv_import", aiSummary: "Strong correlation between load-shedding stage escalation and availability loss at battery-constrained sites; prioritise autonomy upgrades at 480 rural sites.", createdBy: analysts[1].id, createdAt: daysAgo(15), updatedAt: daysAgo(14) },
    { title: "Scrap metal market price tracking", content: "Copper spot price movements continue to correlate with theft incident volumes at a 2-3 week lag. Current price trajectory suggests elevated theft risk into next quarter.", keywords: ["copper price", "scrap market", "leading indicator"], sourceType: "api", createdBy: analysts[2].id, createdAt: daysAgo(8), updatedAt: daysAgo(8) },
  ]);

  const [rep1] = await db
    .insert(aiReports)
    .values([
      { title: "Weekly Sector Risk Summary — Week 27", reportType: "risk_summary", content: "# Weekly Sector Risk Summary\n\n## Headline\nCritical risk load increased this week, driven by the N3 fibre-theft syndicate and a new ransomware campaign targeting OSS/BSS stacks.\n\n## Key movements\n- **Fibre theft (N3 corridor)** — two arrests, syndicate degraded but active.\n- **Ransomware** — IOC distribution complete; two members confirmed patched.\n- **Battery theft (East Rand)** — vault retrofit programme approved.\n\n## Recommended focus\n1. Complete VPN patching across remaining members.\n2. Corridor surveillance investment decision due.\n3. ICASA submission drafting to begin.", parameters: { week: 27 }, generatedBy: analysts[0].id, createdAt: daysAgo(3) },
      { title: "Deep Analysis — Base-station battery theft spike", reportType: "deep_analysis", content: "# Deep Analysis: Battery Theft — East Rand\n\n## Pattern\nIncidents cluster within 2km of major arterials with rapid egress; cloned access cards implicated in 4 of 11 events.\n\n## Escalation outlook\nHigh probability of geographic spread to West Rand within 60 days based on prior displacement behaviour.\n\n## Recommended response\n- Rotate site access credentials and audit issuance logs.\n- Prioritise vault retrofits at the 40 highest-loss sites.\n- Engage SAPS non-ferrous metal task team.", parameters: { riskTitle: "Base-station battery theft spike — East Rand" }, relatedRiskId: insertedRisks[1].id, generatedBy: analysts[1].id, createdAt: daysAgo(2) },
    ])
    .returning();

  await db.insert(alertThresholds).values([
    { category: null, severityTrigger: "critical", notifyRole: "ops_manager", isActive: true },
    { category: "cyber", severityTrigger: "high", notifyRole: "ops_manager", isActive: true },
    { category: "crime", severityTrigger: "high", notifyRole: null, notifyUser: null, isActive: true },
  ]);

  await db.insert(alerts).values([
    { type: "risk_escalation", title: "Risk escalation: Ransomware targeting operator OSS/BSS stacks", body: "New CRITICAL cyber risk crossed the escalation threshold. Immediate SOC coordination recommended.", severity: "critical", targetUser: ops.id, relatedEntityType: "risk", relatedEntityId: insertedRisks[5].id, isRead: false, createdAt: daysAgo(3) },
    { type: "new_intelligence", title: "New intelligence: cloned access cards in battery thefts", body: "Forensic evidence of insider data leakage linked to battery theft incidents in Ekurhuleni.", severity: "high", targetUser: null, relatedEntityType: "risk", relatedEntityId: insertedRisks[1].id, isRead: false, createdAt: daysAgo(4) },
    { type: "ai_complete", title: "AI deep analysis complete", body: "Deep analysis for 'Base-station battery theft spike — East Rand' is ready for review.", severity: "medium", targetUser: analysts[1].id, relatedEntityType: "ai_report", relatedEntityId: rep1.id, isRead: true, createdAt: daysAgo(2) },
    { type: "risk_escalation", title: "Risk escalation: Fibre theft syndicate active along N3 corridor", body: "CRITICAL crime risk remains open beyond 10 days. Review mitigation progress.", severity: "critical", targetUser: null, relatedEntityType: "risk", relatedEntityId: insertedRisks[0].id, isRead: false, createdAt: daysAgo(1) },
  ]);

  await db.insert(activityLog).values([
    { actor: ops.id, action: "user.login", entityType: "session", createdAt: daysAgo(0) },
    { actor: analysts[0].id, action: "risk.create", entityType: "risk", entityId: insertedRisks[24].id, metadata: { title: insertedRisks[24].title }, createdAt: daysAgo(4) },
    { actor: analysts[1].id, action: "risk.update", entityType: "risk", entityId: insertedRisks[1].id, metadata: { field: "status", to: "open" }, createdAt: daysAgo(3) },
    { actor: analysts[1].id, action: "ai.deep_analysis", entityType: "ai_report", entityId: rep1.id, createdAt: daysAgo(2) },
    { actor: ceo.id, action: "user.login", entityType: "session", createdAt: daysAgo(1) },
    { actor: ops.id, action: "keyword_set.run", entityType: "keyword_set", entityId: ks1.id, metadata: { results: 2 }, createdAt: daysAgo(1) },
    { actor: analysts[2].id, action: "research.create", entityType: "research_entry", metadata: { title: "Scrap metal market price tracking" }, createdAt: daysAgo(8) },
  ]);

  console.log(`Seeded: ${all.length} users, ${insertedRisks.length} risks.`);
  console.log(`Demo password for all accounts: ${DEMO_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
