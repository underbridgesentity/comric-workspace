import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { COMRIC_LOGO_BLACK_DATAURL, COMRIC_LOGO_ASPECT } from "@/lib/brand-assets";
import type { MetricTable } from "@/lib/report-config";
import {
  BRAND,
  CLASSIFICATION,
  severityColor,
  splitMetricTables,
  toBarData,
} from "@/lib/export-shared";

/**
 * COMRiC-branded PDF layout for AI reports. Markdown is parsed into a small
 * block model (headings / paragraphs / bullets) - robust to arbitrary model
 * output. Helvetica/Helvetica-Bold are built into @react-pdf/renderer, so no
 * network font registration is required and generation cannot fail on fonts.
 * Charts are drawn from the persisted metric snapshot with plain Views
 * (no external chart library).
 */

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "bullet"; text: string };

function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .trim();
}

export function parseMarkdownBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", text: stripInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
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
        text: stripInline(heading[2]),
      });
      continue;
    }
    const bullet = trimmed.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flush();
      blocks.push({ kind: "bullet", text: stripInline(bullet[1]) });
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}

const LOGO_WIDTH = 110;
const LOGO_HEIGHT = LOGO_WIDTH / COMRIC_LOGO_ASPECT;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a2530",
    paddingTop: 92,
    paddingBottom: 56,
    paddingHorizontal: 48,
    lineHeight: 1.5,
  },
  header: {
    position: "absolute",
    top: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: BRAND.cyberGreen,
    paddingBottom: 8,
  },
  headerLogo: { width: LOGO_WIDTH, height: LOGO_HEIGHT },
  headerRight: { alignItems: "flex-end" },
  headerTag: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: BRAND.cyberGreen,
    backgroundColor: BRAND.deepNavy,
    paddingHorizontal: 5,
    paddingVertical: 2,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  headerMeta: { fontSize: 8, color: BRAND.slate },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: BRAND.hairline,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: BRAND.slate,
  },
  coverTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 24,
    color: BRAND.deepNavy,
    lineHeight: 1.2,
    marginTop: 8,
    marginBottom: 8,
  },
  coverMeta: { fontSize: 9, color: BRAND.slate, marginBottom: 2 },
  coverRule: {
    height: 2,
    width: 64,
    backgroundColor: BRAND.cyberGreen,
    marginTop: 10,
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: BRAND.deepNavy,
    marginTop: 6,
    marginBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: BRAND.cyberGreen,
    paddingBottom: 3,
  },
  chartTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: BRAND.deepNavy,
    marginBottom: 6,
  },
  chartBlock: { marginBottom: 16 },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  barLabel: { width: 90, fontSize: 8.5, color: BRAND.deepNavy, paddingRight: 6 },
  barTrack: { flex: 1, flexDirection: "row", alignItems: "center" },
  barValue: {
    width: 42,
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  table: { marginBottom: 16, borderWidth: 1, borderColor: BRAND.hairline },
  tableHeaderRow: { flexDirection: "row", backgroundColor: BRAND.deepNavy },
  tableHeaderCell: {
    flex: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: "#ffffff",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: BRAND.hairline,
  },
  tableCell: { flex: 1, fontSize: 8.5, paddingVertical: 3, paddingHorizontal: 6 },
  h1: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: BRAND.deepNavy,
    marginBottom: 10,
    marginTop: 4,
  },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: BRAND.deepNavy,
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: BRAND.cyberGreen,
    paddingBottom: 3,
  },
  h3: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: BRAND.deepNavy,
    marginTop: 10,
    marginBottom: 4,
  },
  p: { marginBottom: 6 },
  bulletRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 8 },
  bulletDot: { width: 12, fontFamily: "Helvetica-Bold", color: BRAND.networkGreen },
  bulletText: { flex: 1 },
});

/** Horizontal bar chart drawn with plain Views; colour is per-bar. */
function BarChart({
  title,
  data,
  colorFor,
  valueColor,
}: {
  title: string;
  data: { label: string; value: number }[];
  colorFor: (label: string) => string;
  valueColor?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={styles.chartBlock} wrap={false}>
      <Text style={styles.chartTitle}>{title}</Text>
      {data.map((d, i) => (
        <View key={i} style={styles.barRow}>
          <Text style={styles.barLabel}>{d.label}</Text>
          <View style={styles.barTrack}>
            <View
              style={{
                height: 9,
                width: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%`,
                backgroundColor: colorFor(d.label),
              }}
            />
          </View>
          <Text style={[styles.barValue, { color: valueColor ?? BRAND.deepNavy }]}>
            {d.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Clean bordered table for non-chartable metric snapshots. */
function MetricTableView({ table }: { table: MetricTable }) {
  if (table.rows.length === 0) return null;
  return (
    <View style={styles.chartBlock} wrap={false}>
      <Text style={styles.chartTitle}>{table.title}</Text>
      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          {table.columns.map((col, i) => (
            <Text key={i} style={styles.tableHeaderCell}>
              {col}
            </Text>
          ))}
        </View>
        {table.rows.slice(0, 20).map((row, i) => (
          <View key={i} style={styles.tableRow}>
            {table.columns.map((_, j) => (
              <Text key={j} style={styles.tableCell}>
                {String(row[j] ?? "")}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export function ReportPdf({
  title,
  reportType,
  content,
  generatedBy,
  generatedAt,
  dateRange,
  metrics,
  heroImage,
}: {
  title: string;
  reportType: string;
  content: string;
  generatedBy: string;
  generatedAt: string;
  dateRange: string | null;
  metrics: MetricTable[];
  /** optional cover photograph (jpg bytes) from the COMRiC image library */
  heroImage?: Buffer | null;
}) {
  const blocks = parseMarkdownBlocks(content);
  const { severity, category, others } = splitMetricTables(metrics);
  const severityBars = severity ? toBarData(severity) : [];
  const categoryBars = category ? toBarData(category) : [];
  const tableOnly = [
    ...(severity && severityBars.length === 0 ? [severity] : []),
    ...(category && categoryBars.length === 0 ? [category] : []),
    ...others,
  ].filter((t) => t.rows.length > 0);
  const hasMetrics = severityBars.length > 0 || categoryBars.length > 0 || tableOnly.length > 0;

  return (
    <Document title={title} author="COMRiC Workspace">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Image style={styles.headerLogo} src={COMRIC_LOGO_BLACK_DATAURL} />
          <View style={styles.headerRight}>
            <Text style={styles.headerTag}>WORKSPACE</Text>
            <Text style={styles.headerMeta}>
              {reportType} - {generatedAt}
            </Text>
          </View>
        </View>

        {heroImage ? (
          <Image
            src={{ data: heroImage, format: "jpg" }}
            style={{
              width: "100%",
              height: 130,
              objectFit: "cover",
              borderRadius: 4,
              marginBottom: 18,
            }}
          />
        ) : null}
        <Text style={styles.coverTitle}>{title}</Text>
        <Text style={styles.coverMeta}>Generated by {generatedBy}</Text>
        {dateRange ? <Text style={styles.coverMeta}>Date range: {dateRange}</Text> : null}
        <Text style={styles.coverMeta}>Classification: {CLASSIFICATION}</Text>
        <View style={styles.coverRule} />

        {hasMetrics ? (
          <View>
            <Text style={styles.sectionTitle}>Key metrics</Text>
            {severityBars.length > 0 ? (
              <BarChart
                title={severity?.title ?? "Severity distribution"}
                data={severityBars}
                colorFor={(label) => severityColor(label) ?? BRAND.deepNavy}
              />
            ) : null}
            {categoryBars.length > 0 ? (
              <BarChart
                title={category?.title ?? "Category breakdown"}
                data={categoryBars}
                colorFor={() => BRAND.deepNavy}
                valueColor={BRAND.cyberGreen}
              />
            ) : null}
            {tableOnly.map((table, i) => (
              <MetricTableView key={i} table={table} />
            ))}
          </View>
        ) : null}

        {blocks.length === 0 ? (
          <Text style={styles.p}>{content}</Text>
        ) : (
          blocks.map((block, i) => {
            if (block.kind === "h1") return <Text key={i} style={styles.h1}>{block.text}</Text>;
            if (block.kind === "h2") return <Text key={i} style={styles.h2}>{block.text}</Text>;
            if (block.kind === "h3") return <Text key={i} style={styles.h3}>{block.text}</Text>;
            if (block.kind === "bullet")
              return (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{block.text}</Text>
                </View>
              );
            return <Text key={i} style={styles.p}>{block.text}</Text>;
          })
        )}

        <View style={styles.footer} fixed>
          <Text>COMRiC Workspace - Confidential</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
