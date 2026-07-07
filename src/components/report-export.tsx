import { FileDown, FileSpreadsheet, FileText } from "lucide-react";

/**
 * Consistent PDF | Word | Excel export links for a persisted AI report.
 * Server-component friendly (plain anchors to the export routes).
 */
export function ReportExportButtons({
  reportId,
  size = "sm",
}: {
  reportId: string;
  size?: "sm" | "md";
}) {
  const base =
    size === "md"
      ? "inline-flex items-center gap-1.5 rounded-brand border border-hairline bg-surface px-3 py-2 font-display text-xs font-bold text-ink transition-all duration-150 hover:border-cyber/40 hover:text-cyber"
      : "inline-flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-[11px] font-bold text-muted transition-colors hover:border-cyber/40 hover:text-cyber";
  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <div className="flex items-center gap-1.5">
      <a href={`/api/reports/${reportId}/pdf`} className={base} title="Download PDF">
        <FileDown className={icon} /> PDF
      </a>
      <a href={`/api/reports/${reportId}/docx`} className={base} title="Download Word document">
        <FileText className={icon} /> Word
      </a>
      <a href={`/api/reports/${reportId}/xlsx`} className={base} title="Download Excel workbook">
        <FileSpreadsheet className={icon} /> Excel
      </a>
    </div>
  );
}
