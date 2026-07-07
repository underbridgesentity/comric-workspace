import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, jsonError } from "@/lib/api";
import { analyzeDocument } from "@/lib/analyze-document";

export const runtime = "nodejs";
export const maxDuration = 180;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const g = await guard("create", "research");
  if (g.error) return g.error;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return jsonError("Document not found", 404);

  const result = await analyzeDocument(id, g.user.id);
  if (result.error !== undefined) return jsonError(result.error, result.statusCode);

  return NextResponse.json(
    { analysis: result.analysis },
    { status: result.analysis.status === "failed" ? 200 : 201 },
  );
}
