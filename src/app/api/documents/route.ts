import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { waitUntil } from "@vercel/functions";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { documents, risks } from "@/lib/schema";
import { logActivity } from "@/lib/activity";
import { analyzeDocument } from "@/lib/analyze-document";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ANALYSABLE_EXTENSIONS = ["pdf", "docx", "xlsx", "csv", "txt", "md"] as const;
const ALLOWED_EXTENSIONS = ["pdf", "docx", "xlsx", "csv", "png", "jpg", "txt", "md"] as const;
const ALLOWED_CATEGORIES = [
  "general",
  "policy",
  "report",
  "evidence",
  "contract",
  "compliance",
] as const;

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx + 1).toLowerCase();
}

export async function POST(request: Request) {
  const g = await guard("create", "document");
  if (g.error) return g.error;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return jsonError("Blob storage not configured", 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Expected multipart form data");
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("A file is required");
  }
  if (file.size > MAX_SIZE) {
    return jsonError("File exceeds the 20MB limit", 413);
  }

  const ext = extensionOf(file.name);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return jsonError(
      `File type '.${ext || "unknown"}' is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
    );
  }

  const nameRaw = form.get("name");
  const name =
    typeof nameRaw === "string" && nameRaw.trim().length > 0 ? nameRaw.trim().slice(0, 200) : file.name;

  const descriptionRaw = form.get("description");
  const description =
    typeof descriptionRaw === "string" && descriptionRaw.trim().length > 0
      ? descriptionRaw.trim().slice(0, 2000)
      : null;

  const categoryRaw = form.get("category");
  const category =
    typeof categoryRaw === "string" &&
    (ALLOWED_CATEGORIES as readonly string[]).includes(categoryRaw)
      ? categoryRaw
      : "general";

  const linkedRiskRaw = form.get("linkedRiskId");
  let linkedRiskId: string | null = null;
  if (typeof linkedRiskRaw === "string" && linkedRiskRaw.trim().length > 0) {
    const [risk] = await db
      .select({ id: risks.id })
      .from(risks)
      .where(eq(risks.id, linkedRiskRaw.trim()))
      .limit(1)
      .catch(() => []);
    if (!risk) return jsonError("Linked risk not found", 404);
    linkedRiskId = risk.id;
  }

  let blob: { pathname: string };
  try {
    blob = await put(`documents/${file.name}`, file, {
      access: "private",
      addRandomSuffix: true,
      token,
    });
  } catch (err) {
    console.error("blob upload failed", err);
    return jsonError("Upload to blob storage failed", 502);
  }

  const [doc] = await db
    .insert(documents)
    .values({
      name,
      description,
      blobPathname: blob.pathname, // never returned to the client; downloads stream server-side
      fileType: ext,
      fileSize: file.size,
      category,
      linkedRiskId,
      uploadedBy: g.user.id,
    })
    .returning({
      id: documents.id,
      name: documents.name,
      category: documents.category,
      fileType: documents.fileType,
      fileSize: documents.fileSize,
      createdAt: documents.createdAt,
    });

  await logActivity({
    actor: g.user.id,
    action: "uploaded document",
    entityType: "document",
    entityId: doc.id,
    metadata: { name: doc.name, fileType: doc.fileType, fileSize: doc.fileSize, category: doc.category },
  });

  // Auto-analyse in the background after the response returns.
  const autoAnalysing =
    Boolean(process.env.ANTHROPIC_API_KEY) &&
    (ANALYSABLE_EXTENSIONS as readonly string[]).includes(ext);
  if (autoAnalysing) {
    waitUntil(
      analyzeDocument(doc.id, g.user.id).catch((err) =>
        console.error("auto-analysis failed", err),
      ),
    );
  }

  return NextResponse.json({ document: doc, autoAnalysing }, { status: 201 });
}
