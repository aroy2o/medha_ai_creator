import Parser from "rss-parser";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import type { DiscoveredCandidate, DiscoveryResult } from "./types";

const FEED_URL = "https://www.reddit.com/r/MachineLearning/.rss";
const MAX_ITEMS = 20;

// AutoModerator posts recurring pinned meta-threads (self-promotion, hiring)
// aren't discussion topics — filtering them here is noise reduction, not
// editorial judgment (that happens downstream in lib/editorial).
const IGNORED_AUTHORS = new Set(["/u/AutoModerator"]);

const parser = new Parser<object, { author?: string }>();

function cleanSnippet(raw: string): string {
  return raw
    .replace(/submitted by\s*\/u\/\S+.*$/i, "")
    .replace(/\[link\]|\[comments\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export async function discoverReddit(): Promise<DiscoveryResult> {
  const source = "Reddit r/MachineLearning" as const;
  try {
    // Reddit aggressively rate-limits / bot-challenges generic non-browser
    // User-Agents on this endpoint (observed both 429 and a bot-check page
    // during development). A browser-shaped UA is the difference between
    // this source working and not; it's still a plain, public RSS fetch.
    const res = await fetchWithTimeout(FEED_URL, {
      timeoutMs: 10_000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AriaBot/1.0)" },
    });
    if (!res.ok) {
      throw new Error(`Reddit RSS responded ${res.status}`);
    }
    const xml = await res.text();
    const feed = await parser.parseString(xml);

    const candidates: DiscoveredCandidate[] = (feed.items ?? [])
      .slice(0, MAX_ITEMS)
      .filter((item) => item.title && item.link && !IGNORED_AUTHORS.has(item.author ?? ""))
      .map((item) => ({
        title: item.title!.trim(),
        summary: cleanSnippet(item.contentSnippet ?? item.content ?? ""),
        url: item.link!,
        source,
        publishedAt: item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : null),
      }));

    return { source, candidates, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.warn("discovery source failed", { source, message });
    return { source, candidates: [], error: message };
  }
}
