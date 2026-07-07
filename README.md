# COMRiC Workspace

Internal operations and risk-intelligence platform for COMRiC, the South African
telecommunications sector risk body. POPIA-compliant by architecture: **all data
physically resides in Cape Town, South Africa.**

## Stack

- **Next.js** (App Router, TypeScript strict, React Server Components)
- **Tailwind CSS v4** with the COMRiC brand token set (Archivo + Raleway, dark-first)
- **Aurora Serverless v2 for PostgreSQL** in `af-south-1` (Cape Town), via **Drizzle ORM**
- **Auth.js (NextAuth)** credentials auth, Postgres-backed users, bcrypt hashing
- **Vercel** hosting with functions pinned to `cpt1` (Cape Town)
- **Vercel Blob** (private, `cpt1` store) for the Document Hub
- **Anthropic Claude** (`claude-sonnet-4-6`) for analysis, briefings, and reports — server-side only
- **Vercel Cron** driving the keyword-monitoring web scraper

## Data-residency rationale (POPIA)

Every component that persists or processes COMRiC data is pinned to Cape Town:

| Layer | Where | How |
|---|---|---|
| Serverless functions | Vercel `cpt1` | `"regions": ["cpt1"]` in `vercel.json` |
| Database | AWS `af-south-1` | Aurora Serverless v2 PostgreSQL |
| Files | Vercel Blob `cpt1` | Private store, streamed through functions |

> **Note:** the `cpt1` function region requires a **Vercel Pro** team.

### Why Aurora Serverless v2 (and how to swap it)

This is an internal tool with spiky, often-idle usage, so auto-scaling capacity
fits the load and cost profile better than a fixed instance. If flat, predictable
pricing is later preferred, swap to a fixed `db.t4g.micro` RDS PostgreSQL instance
in the same region — **no application-code changes**; both expose plain Postgres
and the app talks to a single `DATABASE_URL` through `src/lib/db.ts`.

### Connection pooling

Serverless functions open many short-lived connections. Use a **pooled**
connection string (RDS Proxy recommended) in `DATABASE_URL`. The app also keeps
its own small `pg` pool (max 5, short idle timeout) per function instance so
Aurora connections are never exhausted.

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in:
   - `DATABASE_URL` — Aurora (Cape Town) pooled connection string; any plain Postgres works for local dev
   - `AUTH_SECRET` — `openssl rand -base64 32`
   - `BLOB_READ_WRITE_TOKEN` — create the Blob store in **cpt1**, private access
   - `ANTHROPIC_API_KEY`
   - `CRON_SECRET` — protects `/api/cron/scrape`
   - `RESEND_API_KEY` — optional; email escalations degrade gracefully to in-app only
3. `npm run db:migrate` — apply Drizzle migrations
4. `npm run db:seed` — load realistic demo data (users, risks, intelligence, keyword sets…)
5. `npm run dev`

Demo credentials: see [CREDENTIALS.md](CREDENTIALS.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run db:generate` | Generate migrations from `src/lib/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed demo data |
| `npm run typecheck` | TypeScript strict check |

## Architecture notes

- **Access model:** the landing page *is* the login page; every route requires a
  session. Four roles (`ceo`, `ops_manager`, `analyst`, `read_only`) enforced in
  the UI *and* re-checked server-side in every mutating API route via the single
  permission matrix in `src/lib/permissions.ts`.
- **Scraper:** `/api/cron/scrape` (Vercel Cron, every 4 hours, `CRON_SECRET`-guarded)
  fetches configurable SA news/RSS sources plus Google News queries per active
  keyword set, keyword-matches, scores relevance, and writes `scrape_results`.
  Manual "Run now" available in Keyword Monitoring.
- **AI:** all Claude calls live in `/api/ai/*` route handlers; output is always
  persisted to `ai_reports` so it appears in the Historical Archive.
- **Documents:** private Blob objects are streamed through authenticated function
  routes — clients never receive a blob URL.
- **Phase 2** (Project Tracker, KPI Dashboard, Task Management) renders as
  intentional disabled states in the navigation.
