import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { researchEntries } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

const rowSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(50_000),
  keywords: z.string().trim().optional(),
});

const importSchema = z.object({
  fileName: z.string().max(200).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
});

/** CSV bulk import: client parses with papaparse and posts row objects. */
export async function POST(request: Request) {
  const g = await guard("create", "research");
  if (g.error) return g.error;

  const parsed = importSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Provide 1–500 parsed CSV rows.");

  const valid: { title: string; content: string; keywords: string[]; raw: Record<string, unknown> }[] = [];
  const rejected: number[] = [];

  parsed.data.rows.forEach((raw, index) => {
    const row = rowSchema.safeParse(raw);
    if (!row.success) {
      rejected.push(index + 1);
      return;
    }
    const keywords = (row.data.keywords ?? "")
      .split(/[;,]/)
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 30);
    valid.push({ title: row.data.title, content: row.data.content, keywords, raw });
  });

  if (valid.length === 0) {
    return jsonError("No valid rows found. Each row needs 'title' and 'content' columns.");
  }

  const inserted = await db
    .insert(researchEntries)
    .values(
      valid.map((v) => ({
        title: v.title,
        content: v.content,
        keywords: v.keywords,
        sourceType: "csv_import" as const,
        rawData: v.raw,
        createdBy: g.user.id,
      })),
    )
    .returning({ id: researchEntries.id });

  await logActivity({
    actor: g.user.id,
    action: "research.import_csv",
    entityType: "research",
    metadata: {
      fileName: parsed.data.fileName ?? null,
      inserted: inserted.length,
      rejected: rejected.length,
    },
  });

  return NextResponse.json({ inserted: inserted.length, rejectedRows: rejected });
}
