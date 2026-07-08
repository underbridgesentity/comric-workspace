import type { ReactNode } from "react";
import { isMarkdownTableLine, numericColumns, parseMarkdownTable } from "@/lib/export-shared";

/** Render inline **bold**, *italic* and `code` spans. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) {
      out.push(
        <strong key={key} className="font-semibold text-ink">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("`")) {
      out.push(
        <code key={key} className="rounded-[3px] bg-ink/5 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10">
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Tiny dependency-free markdown renderer: #/##/### headings, - / * / 1.
 * lists, bold, italic, inline code, paragraphs. Enough for AI reports.
 */
export function Markdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: string[] | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => (
      <li key={i} className="leading-relaxed">
        {inline(item, `li-${key}-${i}`)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={key++} className="ml-5 list-decimal space-y-1 text-sm text-ink/90">
          {items}
        </ol>
      ) : (
        <ul key={key++} className="ml-5 list-disc space-y-1 text-sm text-ink/90">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  const flushTable = () => {
    if (!table) return;
    const parsed = parseMarkdownTable(table);
    if (!parsed) {
      // Fall back to plain paragraphs when the block is not a real table.
      for (const l of table) {
        blocks.push(
          <p key={key++} className="text-sm leading-relaxed text-ink/90">
            {inline(l, `p-${key}`)}
          </p>,
        );
      }
    } else {
      const numeric = numericColumns(parsed);
      const tKey = key++;
      blocks.push(
        <div key={tKey} className="overflow-x-auto rounded-brand border border-hairline">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-ink/5 dark:bg-white/5">
                {parsed.columns.map((col, i) => (
                  <th
                    key={i}
                    className={`px-3 py-2 font-display text-[11px] font-bold uppercase tracking-wide text-muted ${numeric[i] ? "text-right" : "text-left"}`}
                  >
                    {inline(col, `th-${tKey}-${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {parsed.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`px-3 py-2 text-sm text-ink/90 ${numeric[c] ? "text-right" : "text-left"}`}
                    >
                      {inline(cell, `td-${tKey}-${r}-${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
    table = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (isMarkdownTableLine(line)) {
      flushList();
      if (!table) table = [];
      table.push(line);
      continue;
    }
    flushTable();

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);

    if (h) {
      flushList();
      const level = h[1].length;
      const cls =
        level === 1
          ? "font-display text-lg font-black text-ink mt-4"
          : level === 2
            ? "font-display text-base font-bold text-ink mt-4"
            : "font-display text-sm font-bold text-ink mt-3";
      blocks.push(
        <p key={key++} className={cls} role="heading" aria-level={level + 2}>
          {inline(h[2], `h-${key}`)}
        </p>,
      );
    } else if (ul) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
    } else if (ol) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      blocks.push(
        <p key={key++} className="text-sm leading-relaxed text-ink/90">
          {inline(line, `p-${key}`)}
        </p>,
      );
    }
  }
  flushList();
  flushTable();

  return <div className="space-y-2">{blocks}</div>;
}
