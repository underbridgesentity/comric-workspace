import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { keywordSets, scrapeResults } from "./schema";
import { SCRAPE_SOURCES, googleNewsSource, type ScrapeSource } from "./scrape-sources";

export type ScrapeSetSummary = {
  setId: string;
  setName: string;
  inserted: number;
  errors: string[];
};

export type ScrapeSummary = {
  ranAt: string;
  sets: ScrapeSetSummary[];
  totalInserted: number;
};

type FeedItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
};

const FETCH_TIMEOUT_MS = 10_000;

/** Decode the common XML/HTML entities found in RSS payloads. */
function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&amp;/g, "&");
}

/**
 * Strip HTML tags and CDATA wrappers, collapse whitespace. Tags are
 * stripped both before AND after entity decoding: feeds like Google News
 * ship entity-escaped markup (&lt;a href...&gt;) that only becomes a tag
 * once decoded.
 */
function cleanText(input: string): string {
  return decodeEntities(
    input
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract the text of the first occurrence of <tag> within a block. */
function tagText(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? cleanText(match[1]) : "";
}

/**
 * Minimal, dependency-free RSS 2.0 / Atom item parser. Tolerant of
 * namespaced tags and CDATA; extracts title/link/description/pubDate.
 */
export function parseRssItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  for (const block of blocks) {
    const title = tagText(block, "title");
    // RSS uses <link>url</link>; Atom uses <link href="..."/>
    let link = tagText(block, "link");
    if (!link) {
      const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = href ? decodeEntities(href[1]) : "";
    }
    const description =
      tagText(block, "description") ||
      tagText(block, "summary") ||
      tagText(block, "content:encoded") ||
      tagText(block, "content");
    const pubDate =
      tagText(block, "pubDate") || tagText(block, "published") || tagText(block, "updated") || null;
    if (title && link) items.push({ title, link, description, pubDate });
  }
  return items;
}

async function fetchFeed(source: ScrapeSource): Promise<FeedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "user-agent": "COMRiC-Workspace/1.0 (risk-intelligence scraper)",
        accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseRssItems(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Keyword match + relevance scoring. Case-insensitive substring match
 * against title + description; title hits are weighted 2x.
 */
function scoreItem(
  item: FeedItem,
  keywords: string[],
): { matched: string[]; relevance: number } {
  const title = item.title.toLowerCase();
  const body = item.description.toLowerCase();
  const matched: string[] = [];
  let weighted = 0;
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (!k) continue;
    const inTitle = title.includes(k);
    const inBody = body.includes(k);
    if (inTitle || inBody) {
      matched.push(kw);
      weighted += inTitle ? 2 : 1;
    }
  }
  const maxWeighted = keywords.length * 2 || 1;
  return { matched, relevance: Math.min(1, weighted / maxWeighted + matched.length / (keywords.length || 1) / 2) };
}

/**
 * Run the scrape pipeline for the given keyword sets (all active sets when
 * omitted). For each set: fetch static SA feeds + a Google News RSS query
 * built from the set's keywords, keyword-match, dedupe against existing
 * scrape_results by sourceUrl, insert new matches, stamp lastRunAt.
 */
export async function runScrape(keywordSetIds?: string[]): Promise<ScrapeSummary> {
  const sets = await db
    .select()
    .from(keywordSets)
    .where(
      keywordSetIds && keywordSetIds.length > 0
        ? and(eq(keywordSets.isActive, true), inArray(keywordSets.id, keywordSetIds))
        : eq(keywordSets.isActive, true),
    );

  const summaries: ScrapeSetSummary[] = [];

  // Fetch the shared static feeds once per run.
  const staticFeeds = await Promise.all(
    SCRAPE_SOURCES.map(async (source) => {
      try {
        return { source, items: await fetchFeed(source), error: null as string | null };
      } catch (err) {
        return {
          source,
          items: [] as FeedItem[],
          error: `${source.name}: ${err instanceof Error ? err.message : "fetch failed"}`,
        };
      }
    }),
  );

  for (const set of sets) {
    const errors = staticFeeds.filter((f) => f.error).map((f) => f.error as string);
    const candidates: FeedItem[] = staticFeeds.flatMap((f) => f.items);

    if (set.keywords.length > 0) {
      const gSource = googleNewsSource(set.keywords);
      try {
        candidates.push(...(await fetchFeed(gSource)));
      } catch (err) {
        errors.push(`${gSource.name}: ${err instanceof Error ? err.message : "fetch failed"}`);
      }
    }

    // Score, filter to matches, dedupe within batch by URL.
    const byUrl = new Map<string, { item: FeedItem; matched: string[]; relevance: number }>();
    for (const item of candidates) {
      const { matched, relevance } = scoreItem(item, set.keywords);
      if (matched.length === 0) continue;
      const existing = byUrl.get(item.link);
      if (!existing || relevance > existing.relevance) {
        byUrl.set(item.link, { item, matched, relevance });
      }
    }

    let inserted = 0;
    const urls = [...byUrl.keys()];
    if (urls.length > 0) {
      const existingRows = await db
        .select({ sourceUrl: scrapeResults.sourceUrl })
        .from(scrapeResults)
        .where(and(eq(scrapeResults.keywordSetId, set.id), inArray(scrapeResults.sourceUrl, urls)));
      const seen = new Set(existingRows.map((r) => r.sourceUrl));

      const rows = [...byUrl.values()]
        .filter(({ item }) => !seen.has(item.link))
        .map(({ item, matched, relevance }) => ({
          keywordSetId: set.id,
          sourceUrl: item.link,
          title: item.title.slice(0, 500),
          snippet: item.description.slice(0, 600) || null,
          content: item.description || null,
          matchedKeywords: matched,
          relevanceScore: Math.round(relevance * 100) / 100,
        }));

      if (rows.length > 0) {
        await db.insert(scrapeResults).values(rows);
        inserted = rows.length;
      }
    }

    await db.update(keywordSets).set({ lastRunAt: new Date() }).where(eq(keywordSets.id, set.id));
    summaries.push({ setId: set.id, setName: set.name, inserted, errors });
  }

  return {
    ranAt: new Date().toISOString(),
    sets: summaries,
    totalInserted: summaries.reduce((n, s) => n + s.inserted, 0),
  };
}
