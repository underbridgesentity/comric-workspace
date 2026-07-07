import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

export const roleEnum = pgEnum("role", ["ceo", "ops_manager", "analyst", "read_only"]);
export const riskCategoryEnum = pgEnum("risk_category", [
  "infrastructure",
  "cyber",
  "crime",
  "regulatory",
  "operational",
  "other",
]);
export const severityEnum = pgEnum("severity", ["critical", "high", "medium", "low"]);
export const riskStatusEnum = pgEnum("risk_status", [
  "open",
  "monitoring",
  "mitigating",
  "resolved",
  "closed",
]);
export const riskSourceEnum = pgEnum("risk_source", ["web_scrape", "partner_report", "manual"]);
export const researchSourceEnum = pgEnum("research_source", [
  "web_scrape",
  "csv_import",
  "manual",
  "api",
]);
export const reportTypeEnum = pgEnum("report_type", [
  "risk_summary",
  "sector_report",
  "research_digest",
  "deep_analysis",
]);
export const alertTypeEnum = pgEnum("alert_type", [
  "risk_escalation",
  "new_intelligence",
  "ai_complete",
  "task_assigned",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  passwordHash: text("password_hash"),
  role: roleEnum("role").notNull().default("read_only"),
  isActive: boolean("is_active").notNull().default(true),
  avatarUrl: text("avatar_url"),
  themePreference: text("theme_preference").notNull().default("dark"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  ...timestamps,
});

// Auth.js adapter tables
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const risks = pgTable("risks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: riskCategoryEnum("category").notNull(),
  severity: severityEnum("severity").notNull(),
  status: riskStatusEnum("status").notNull().default("open"),
  responsibleParty: uuid("responsible_party").references(() => users.id),
  source: riskSourceEnum("source").notNull().default("manual"),
  sourceUrl: text("source_url"),
  keywords: text("keywords").array().notNull().default([]),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const riskNotes = pgTable("risk_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  riskId: uuid("risk_id")
    .notNull()
    .references(() => risks.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sectorIntelligence = pgTable("sector_intelligence", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  incidentType: text("incident_type").notNull(),
  location: text("location"),
  source: text("source"),
  sourceUrl: text("source_url"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  linkedRiskId: uuid("linked_risk_id").references(() => risks.id, { onDelete: "set null" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  blobPathname: text("blob_pathname").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  category: text("category").notNull().default("general"),
  linkedRiskId: uuid("linked_risk_id").references(() => risks.id, { onDelete: "set null" }),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const researchEntries = pgTable("research_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  keywords: text("keywords").array().notNull().default([]),
  sourceType: researchSourceEnum("source_type").notNull().default("manual"),
  rawData: jsonb("raw_data"),
  aiSummary: text("ai_summary"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const keywordSets = pgTable("keyword_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  keywords: text("keywords").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const scrapeResults = pgTable("scrape_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  keywordSetId: uuid("keyword_set_id")
    .notNull()
    .references(() => keywordSets.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  title: text("title").notNull(),
  snippet: text("snippet"),
  content: text("content"),
  matchedKeywords: text("matched_keywords").array().notNull().default([]),
  relevanceScore: real("relevance_score"),
  processed: boolean("processed").notNull().default(false),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiReports = pgTable("ai_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  reportType: reportTypeEnum("report_type").notNull(),
  content: text("content").notNull(),
  parameters: jsonb("parameters"),
  relatedRiskId: uuid("related_risk_id").references(() => risks.id, { onDelete: "set null" }),
  generatedBy: uuid("generated_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: alertTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  severity: severityEnum("severity").notNull().default("medium"),
  targetUser: uuid("target_user").references(() => users.id, { onDelete: "cascade" }),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: uuid("related_entity_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: uuid("actor")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertThresholds = pgTable("alert_thresholds", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: riskCategoryEnum("category"),
  severityTrigger: severityEnum("severity_trigger").notNull(),
  notifyRole: roleEnum("notify_role"),
  notifyUser: uuid("notify_user").references(() => users.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Risk = typeof risks.$inferSelect;
export type RiskNote = typeof riskNotes.$inferSelect;
export type SectorIntel = typeof sectorIntelligence.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type ResearchEntry = typeof researchEntries.$inferSelect;
export type KeywordSet = typeof keywordSets.$inferSelect;
export type ScrapeResult = typeof scrapeResults.$inferSelect;
export type AiReport = typeof aiReports.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type ActivityLogRow = typeof activityLog.$inferSelect;
export type AlertThreshold = typeof alertThresholds.$inferSelect;

export type Role = (typeof roleEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];
export type RiskCategory = (typeof riskCategoryEnum.enumValues)[number];
export type RiskStatus = (typeof riskStatusEnum.enumValues)[number];
export type ReportType = (typeof reportTypeEnum.enumValues)[number];
export type AlertType = (typeof alertTypeEnum.enumValues)[number];
