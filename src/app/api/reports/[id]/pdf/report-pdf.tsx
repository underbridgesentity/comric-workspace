import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * COMRiC-branded PDF layout for AI reports. Markdown is parsed into a small
 * block model (headings / paragraphs / bullets) — robust to arbitrary model
 * output. Helvetica/Helvetica-Bold are built into @react-pdf/renderer, so no
 * network font registration is required and generation cannot fail on fonts.
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

const BRAND_GREEN = "#8eff00";
const NAVY = "#0a1420";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a2530",
    paddingTop: 64,
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
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dee4",
    paddingBottom: 8,
  },
  wordmark: { flexDirection: "row", alignItems: "center" },
  wordmarkComric: { fontFamily: "Helvetica-Bold", fontSize: 14, color: NAVY },
  wordmarkTag: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: NAVY,
    backgroundColor: BRAND_GREEN,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginLeft: 6,
    letterSpacing: 1,
  },
  headerMeta: { fontSize: 8, color: "#5a6672" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: "#d8dee4",
    paddingTop: 6,
    fontSize: 8,
    color: "#5a6672",
    textAlign: "center",
  },
  h1: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: NAVY,
    marginBottom: 10,
    marginTop: 4,
  },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: NAVY,
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: BRAND_GREEN,
    paddingBottom: 3,
  },
  h3: { fontFamily: "Helvetica-Bold", fontSize: 11, color: NAVY, marginTop: 10, marginBottom: 4 },
  p: { marginBottom: 6 },
  bulletRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 8 },
  bulletDot: { width: 12, fontFamily: "Helvetica-Bold", color: "#006d5b" },
  bulletText: { flex: 1 },
});

export function ReportPdf({
  title,
  content,
  generatedBy,
  generatedAt,
}: {
  title: string;
  content: string;
  generatedBy: string;
  generatedAt: string;
}) {
  const blocks = parseMarkdownBlocks(content);
  return (
    <Document title={title} author="COMRiC Workspace">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.wordmark}>
            <Text style={styles.wordmarkComric}>COMRiC</Text>
            <Text style={styles.wordmarkTag}>WORKSPACE</Text>
          </View>
          <Text style={styles.headerMeta}>
            {title} — {generatedBy} — {generatedAt}
          </Text>
        </View>

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

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `COMRiC Workspace — Confidential — page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
