import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { documentAnalyses } from "@/lib/schema";
import { generateScrapeSuggestions } from "@/lib/scrape-suggestions";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST() {
  const g = await guard("create", "risk");
  if (g.error) return g.error;

  const result = await generateScrapeSuggestions(g.user.id);
  if (result.error) return jsonError(result.error, result.statusCode);

  return NextResponse.json({ analysis: result.analysis }, { status: 201 });
}

export async function GET() {
  const g = await guard("view", "risk");
  if (g.error) return g.error;

  const analyses = await db
    .select()
    .from(documentAnalyses)
    .where(eq(documentAnalyses.source, "scrape"))
    .orderBy(desc(documentAnalyses.createdAt))
    .limit(5);

  return NextResponse.json({ analyses });
}
