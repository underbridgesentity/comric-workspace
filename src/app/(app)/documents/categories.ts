export const DOCUMENT_CATEGORIES = [
  "general",
  "policy",
  "report",
  "evidence",
  "contract",
  "compliance",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
