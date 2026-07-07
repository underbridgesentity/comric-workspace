import { NextResponse } from "next/server";
import { z } from "zod";
import { del, get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { documents, risks } from "@/lib/schema";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  txt: "text/plain",
  md: "text/markdown",
};

type RouteContext = { params: Promise<{ id: string }> };

async function findDocument(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return doc ?? null;
}

/** Download: streams the blob through the function — the blob URL is never exposed. */
export async function GET(_request: Request, context: RouteContext) {
  const g = await guard("view", "document");
  if (g.error) return g.error;

  const { id } = await context.params;
  const doc = await findDocument(id);
  if (!doc) return jsonError("Document not found", 404);

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return jsonError("Blob storage not configured", 503);

  let stream: ReadableStream | null;
  try {
    const result = await get(doc.blobPathname, { access: "private", token });
    stream = result?.stream ?? null;
  } catch (err) {
    console.error("blob fetch failed", err);
    return jsonError("Failed to reach blob storage", 502);
  }
  if (!stream) {
    return jsonError("Stored file could not be retrieved", 502);
  }

  const contentType = CONTENT_TYPES[doc.fileType] ?? "application/octet-stream";
  const safeName = doc.name.replace(/[^\w.\- ]+/g, "_");
  const filename = safeName.toLowerCase().endsWith(`.${doc.fileType}`)
    ? safeName
    : `${safeName}.${doc.fileType}`;

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(doc.fileSize),
      "Cache-Control": "private, no-store",
    },
  });
}

const patchSchema = z.object({
  description: z.string().max(2000).nullable().optional(),
  category: z
    .enum(["general", "policy", "report", "evidence", "contract", "compliance"])
    .optional(),
  linkedRiskId: z.uuid().nullable().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const g = await guard("update", "document");
  if (g.error) return g.error;

  const { id } = await context.params;
  const doc = await findDocument(id);
  if (!doc) return jsonError("Document not found", 404);

  const raw = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const updates: Partial<{
    description: string | null;
    category: string;
    linkedRiskId: string | null;
  }> = {};
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description?.trim() || null;
  }
  if (parsed.data.category !== undefined) updates.category = parsed.data.category;
  if (parsed.data.linkedRiskId !== undefined) {
    if (parsed.data.linkedRiskId) {
      const [risk] = await db
        .select({ id: risks.id })
        .from(risks)
        .where(eq(risks.id, parsed.data.linkedRiskId))
        .limit(1);
      if (!risk) return jsonError("Linked risk not found", 404);
    }
    updates.linkedRiskId = parsed.data.linkedRiskId;
  }
  if (Object.keys(updates).length === 0) return jsonError("Nothing to update");

  const [updated] = await db
    .update(documents)
    .set(updates)
    .where(eq(documents.id, doc.id))
    .returning({
      id: documents.id,
      name: documents.name,
      description: documents.description,
      category: documents.category,
      linkedRiskId: documents.linkedRiskId,
    });

  await logActivity({
    actor: g.user.id,
    action: "updated document",
    entityType: "document",
    entityId: doc.id,
    metadata: { name: doc.name, fields: Object.keys(updates) },
  });

  return NextResponse.json({ document: updated });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const g = await guard("delete", "document");
  if (g.error) return g.error;

  const { id } = await context.params;
  const doc = await findDocument(id);
  if (!doc) return jsonError("Document not found", 404);

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    try {
      await del(doc.blobPathname, { token });
    } catch (err) {
      // Row deletion proceeds; orphaned blobs are recoverable via store cleanup.
      console.error("blob delete failed", err);
    }
  }

  await db.delete(documents).where(eq(documents.id, doc.id));

  await logActivity({
    actor: g.user.id,
    action: "deleted document",
    entityType: "document",
    entityId: doc.id,
    metadata: { name: doc.name, fileType: doc.fileType },
  });

  return NextResponse.json({ ok: true });
}
