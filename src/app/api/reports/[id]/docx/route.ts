import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { aiReports, users } from "@/lib/schema";

export const maxDuration = 60;

/**
 * Markdown → docx mapper. Same block model as the PDF export
 * (headings / paragraphs / bullets), plus inline **bold** runs.
 */

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "bullet"; text: string };

function stripInlineExceptBold(text: string): string {
  return text
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
    .replace(/__(.+?)__/g, "**$1**")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .trim();
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", text: stripInlineExceptBold(paragraph.join(" ")) });
      paragraph = [];
    }
  };
  for (const raw of markdown.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed || /^(-{3,}|\*{3,})$/.test(trimmed)) {
      flush();
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      blocks.push({
        kind: level === 1 ? "h1" : level === 2 ? "h2" : "h3",
        text: stripInlineExceptBold(heading[2]).replace(/\*\*/g, ""),
      });
      continue;
    }
    const bullet = trimmed.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flush();
      blocks.push({ kind: "bullet", text: stripInlineExceptBold(bullet[1]) });
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}

/** Split text on **bold** segments into styled runs. */
function inlineRuns(text: string): TextRun[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((seg) => seg.length > 0)
    .map((seg) =>
      seg.startsWith("**") && seg.endsWith("**")
        ? new TextRun({ text: seg.slice(2, -2), bold: true })
        : new TextRun({ text: seg }),
    );
}

const NAVY = "0A1420";

function blockToParagraph(block: Block): Paragraph {
  if (block.kind === "h1") {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 120, after: 200 },
      children: [new TextRun({ text: block.text, bold: true, color: NAVY, size: 36 })],
    });
  }
  if (block.kind === "h2") {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "8EFF00", space: 2 } },
      children: [new TextRun({ text: block.text, bold: true, color: NAVY, size: 26 })],
    });
  }
  if (block.kind === "h3") {
    return new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 200, after: 80 },
      children: [new TextRun({ text: block.text, bold: true, color: NAVY, size: 22 })],
    });
  }
  if (block.kind === "bullet") {
    return new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 60 },
      children: inlineRuns(block.text),
    });
  }
  return new Paragraph({ spacing: { after: 120 }, children: inlineRuns(block.text) });
}

/** Render a persisted AI report as a branded, downloadable Word document. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("view", "ai_report");
  if (g.error) return g.error;

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Report not found.", 404);

  const [row] = await db
    .select({
      id: aiReports.id,
      title: aiReports.title,
      reportType: aiReports.reportType,
      content: aiReports.content,
      createdAt: aiReports.createdAt,
      generatedBy: users.fullName,
    })
    .from(aiReports)
    .leftJoin(users, eq(aiReports.generatedBy, users.id))
    .where(eq(aiReports.id, id))
    .limit(1);

  if (!row) return jsonError("Report not found.", 404);

  const generatedAt = row.createdAt.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  try {
    const blocks = parseBlocks(row.content);
    const doc = new Document({
      title: row.title,
      creator: "COMRiC Workspace",
      styles: {
        default: { document: { run: { font: "Calibri", size: 21 } } },
      },
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  border: {
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: "D8DEE4", space: 4 },
                  },
                  children: [
                    new TextRun({ text: "COMRiC WORKSPACE", bold: true, color: NAVY, size: 18 }),
                    new TextRun({ text: "  -  Confidential", color: "5A6672", size: 18 }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  border: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: "D8DEE4", space: 4 },
                  },
                  children: [
                    new TextRun({
                      text: "COMRiC Workspace - Confidential - page ",
                      color: "5A6672",
                      size: 16,
                    }),
                    new TextRun({ children: [PageNumber.CURRENT], color: "5A6672", size: 16 }),
                    new TextRun({ text: " of ", color: "5A6672", size: 16 }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], color: "5A6672", size: 16 }),
                  ],
                }),
              ],
            }),
          },
          children: [
            new Paragraph({
              spacing: { after: 40 },
              children: [new TextRun({ text: row.title, bold: true, color: NAVY, size: 40 })],
            }),
            new Paragraph({
              spacing: { after: 280 },
              children: [
                new TextRun({
                  text: `${row.reportType.replace(/_/g, " ")} · Generated by ${row.generatedBy ?? "COMRiC Workspace"} · ${generatedAt}`,
                  color: "5A6672",
                  size: 18,
                }),
              ],
            }),
            ...(blocks.length > 0
              ? blocks.map(blockToParagraph)
              : [new Paragraph({ children: [new TextRun({ text: row.content })] })]),
            new Paragraph({
              spacing: { before: 360 },
              children: [
                new TextRun({
                  text: "This document was generated by the COMRiC Workspace AI reporting engine from live platform data. Distribution restricted to authorised COMRiC members.",
                  italics: true,
                  color: "5A6672",
                  size: 16,
                }),
              ],
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `${row.title.replace(/[^\w\d-]+/g, "-").replace(/-+/g, "-").toLowerCase()}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("DOCX render failed", err);
    return jsonError("Word export failed.", 500);
  }
}
