/**
 * Configurable scrape source registry for the Research module.
 *
 * All sources are RSS feeds fetched server-side. South African tech/telecom
 * news outlets are queried on every run; a per-keyword-set Google News RSS
 * query is built at runtime so each set also sweeps the broader SA news index.
 */
export type ScrapeSource = {
  name: string;
  url: string;
  type: "rss";
};

/** Static SA news feeds swept on every scrape run. */
export const SCRAPE_SOURCES: ScrapeSource[] = [
  { name: "MyBroadband", url: "https://mybroadband.co.za/news/feed", type: "rss" },
  { name: "TechCentral", url: "https://techcentral.co.za/feed/", type: "rss" },
  { name: "ITWeb", url: "https://www.itweb.co.za/rss", type: "rss" },
];

/**
 * Build a Google News RSS search URL scoped to South Africa (en-ZA).
 * Keywords are OR-joined so any single keyword hit surfaces the story.
 */
export function googleNewsSource(keywords: string[]): ScrapeSource {
  const query = keywords
    .map((k) => (k.includes(" ") ? `"${k}"` : k))
    .join(" OR ");
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-ZA&gl=ZA&ceid=ZA:en`;
  return { name: "Google News (ZA)", url, type: "rss" };
}
