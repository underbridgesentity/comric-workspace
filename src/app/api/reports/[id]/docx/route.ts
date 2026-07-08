import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { guard, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { aiReports, users } from "@/lib/schema";
import { readReportParameters, type MetricTable } from "@/lib/report-config";
import { COMRIC_LOGO_ASPECT } from "@/lib/brand-assets";
import {
  CLASSIFICATION,
  exportFilename,
  formatReportDate,
  isMarkdownTableLine,
  logoPngBytes,
  numericColumns,
  parseMarkdownTable,
  rangeLabel,
  reportTypeLabel,
  severityColor,
  stripCellBold,
  type ParsedTable,
} from "@/lib/export-shared";

export const maxDuration = 60;

/**
 * Markdown → docx mapper. Same block model as the PDF export
 * (headings / paragraphs / bullets), plus inline **bold** runs.
 */

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "table"; table: ParsedTable };

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
  let tableLines: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", text: stripInlineExceptBold(paragraph.join(" ")) });
      paragraph = [];
    }
  };
  const flushTable = () => {
    if (tableLines.length === 0) return;
    const parsed = parseMarkdownTable(tableLines);
    if (parsed) {
      blocks.push({ kind: "table", table: parsed });
    } else {
      // Fall back to plain paragraphs when the candidate is not a table.
      for (const l of tableLines) blocks.push({ kind: "p", text: stripInlineExceptBold(l) });
    }
    tableLines = [];
  };
  for (const raw of markdown.split("\n")) {
    const trimmed = raw.trim();
    if (isMarkdownTableLine(trimmed)) {
      flush();
      tableLines.push(trimmed);
      continue;
    }
    flushTable();
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
  flushTable();
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

const NAVY = "1D2331";
const SLATE = "5A6672";
const HAIRLINE = "D8DEE4";
const CYBER_GREEN = "8EFF00";

function blockToParagraph(block: Exclude<Block, { kind: "table" }>): Paragraph {
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
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: CYBER_GREEN, space: 2 } },
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

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE } as const;
const CELL_BORDERS = {
  top: CELL_BORDER,
  bottom: CELL_BORDER,
  left: CELL_BORDER,
  right: CELL_BORDER,
} as const;

/** Render a markdown table from the report body as a styled Word table,
 *  matching the Key metrics treatment (Deep Navy shaded header, white bold
 *  text, hairline borders). Numeric columns are right-aligned. */
function markdownTableToDocx(table: ParsedTable): Table {
  const numeric = numericColumns(table);
  const headerRow = new TableRow({
    tableHeader: true,
    children: table.columns.map(
      (col, j) =>
        new TableCell({
          borders: CELL_BORDERS,
          shading: { type: ShadingType.SOLID, fill: NAVY, color: NAVY },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [
            new Paragraph({
              alignment: numeric[j] ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [
                new TextRun({
                  text: stripCellBold(col),
                  bold: true,
                  color: "FFFFFF",
                  size: 18,
                }),
              ],
            }),
          ],
        }),
    ),
  });
  const bodyRows = table.rows.map(
    (row) =>
      new TableRow({
        children: table.columns.map(
          (_, j) =>
            new TableCell({
              borders: CELL_BORDERS,
              margins: { top: 40, bottom: 40, left: 100, right: 100 },
              children: [
                new Paragraph({
                  alignment: numeric[j] ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  children: inlineRuns(row[j] ?? ""),
                }),
              ],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

/** Render a metric snapshot as a styled Word table (Deep Navy header row,
 *  severity heat colours applied to value cells on severity-labelled rows). */
function metricTableToDocx(table: MetricTable): (Paragraph | Table)[] {
  if (table.rows.length === 0) return [];
  const headerRow = new TableRow({
    tableHeader: true,
    children: table.columns.map(
      (col) =>
        new TableCell({
          borders: CELL_BORDERS,
          shading: { type: ShadingType.SOLID, fill: NAVY, color: NAVY },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: col, bold: true, color: "FFFFFF", size: 18 })],
            }),
          ],
        }),
    ),
  });
  const bodyRows = table.rows.slice(0, 50).map((row) => {
    const heat = severityColor(String(row[0] ?? ""));
    return new TableRow({
      children: table.columns.map((_, j) => {
        const text = String(row[j] ?? "");
        const isValueCell = j > 0 && heat !== undefined;
        return new TableCell({
          borders: CELL_BORDERS,
          margins: { top: 40, bottom: 40, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text,
                  size: 18,
                  bold: isValueCell || (j === 0 && heat !== undefined),
                  color: isValueCell ? heat.replace("#", "").toUpperCase() : NAVY,
                }),
              ],
            }),
          ],
        });
      }),
    });
  });
  return [
    new Paragraph({
      spacing: { before: 200, after: 80 },
      children: [new TextRun({ text: table.title, bold: true, color: NAVY, size: 22 })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...bodyRows],
    }),
  ];
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
      parameters: aiReports.parameters,
      createdAt: aiReports.createdAt,
      generatedBy: users.fullName,
    })
    .from(aiReports)
    .leftJoin(users, eq(aiReports.generatedBy, users.id))
    .where(eq(aiReports.id, id))
    .limit(1);

  if (!row) return jsonError("Report not found.", 404);

  const generatedAt = formatReportDate(row.createdAt);
  const stored = readReportParameters(row.parameters);
  const range = rangeLabel(stored.builder);
  const metricTables = (stored.metrics ?? []).filter((t) => t.rows.length > 0);

  try {
    const blocks = parseBlocks(row.content);
    const logoWidth = 140;
    const logoHeight = Math.round(logoWidth / COMRIC_LOGO_ASPECT);

    const metricChildren: (Paragraph | Table)[] =
      metricTables.length > 0
        ? [
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 120, after: 120 },
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 8, color: CYBER_GREEN, space: 2 },
              },
              children: [
                new TextRun({ text: "Key metrics", bold: true, color: NAVY, size: 26 }),
              ],
            }),
            ...metricTables.flatMap(metricTableToDocx),
            new Paragraph({ spacing: { after: 200 }, children: [] }),
          ]
        : [];

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
                    bottom: { style: BorderStyle.SINGLE, size: 12, color: CYBER_GREEN, space: 6 },
                  },
                  children: [
                    new ImageRun({
                      type: "png",
                      data: logoPngBytes(),
                      transformation: { width: logoWidth, height: logoHeight },
                    }),
                    new TextRun({
                      text: `   WORKSPACE - ${reportTypeLabel(row.reportType)} - ${generatedAt}`,
                      bold: true,
                      color: SLATE,
                      size: 16,
                    }),
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
                    top: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE, space: 4 },
                  },
                  children: [
                    new TextRun({
                      text: "COMRiC Workspace - Confidential - Page ",
                      color: SLATE,
                      size: 16,
                    }),
                    new TextRun({ children: [PageNumber.CURRENT], color: SLATE, size: 16 }),
                    new TextRun({ text: " of ", color: SLATE, size: 16 }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], color: SLATE, size: 16 }),
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
              spacing: { after: 40 },
              children: [
                new TextRun({
                  text: `${reportTypeLabel(row.reportType)} - Generated by ${row.generatedBy ?? "COMRiC Workspace"} - ${generatedAt}${range ? ` - ${range}` : ""}`,
                  color: SLATE,
                  size: 18,
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 280 },
              children: [
                new TextRun({
                  text: `Classification: ${CLASSIFICATION}`,
                  bold: true,
                  color: SLATE,
                  size: 18,
                }),
              ],
            }),
            ...metricChildren,
            ...(blocks.length > 0
              ? blocks.flatMap((block): (Paragraph | Table)[] =>
                  block.kind === "table"
                    ? [
                        markdownTableToDocx(block.table),
                        new Paragraph({ spacing: { after: 120 }, children: [] }),
                      ]
                    : [blockToParagraph(block)],
                )
              : [new Paragraph({ children: [new TextRun({ text: row.content })] })]),
            new Paragraph({
              spacing: { before: 360 },
              children: [
                new TextRun({
                  text: "This document was generated by the COMRiC Workspace AI reporting engine from live platform data. Distribution restricted to authorised COMRiC members.",
                  italics: true,
                  color: SLATE,
                  size: 16,
                }),
              ],
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${exportFilename(row.title, "docx")}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("DOCX render failed", err);
    return jsonError("Word export failed.", 500);
  }
}
