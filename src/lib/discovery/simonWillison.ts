import Parser from "rss-parser";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import type { DiscoveredCandidate, DiscoveryResult } from "./types";

// Simon Willison writes some of the most technically grounded, evidence-
// based commentary on LLM tooling and production concerns available —
// exactly the register this persona aims for. His "everything" feed
// includes short link-blog entries as well as full essays.
const FEED_URL = "https://simonwillison.net/atom/everything/";
const MAX_ITEMS = 15;

// This feed uses Atom's <summary> for short link-blog entries and
// <content> for full essays — rss-parser maps <summary> to item.summary,
// which isn't in its default typed Item shape, hence the custom field.
const parser = new Parser<object, { summary?: string }>();

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function discoverSimonWillison(): Promise<DiscoveryResult> {
  const source = "Simon Willison" as const;
  try {
    const res = await fetchWithTimeout(FEED_URL, { timeoutMs: 10_000 });
    if (!res.ok) {
      throw new Error(`Simon Willison feed responded ${res.status}`);
    }
    const xml = await res.text();
    const feed = await parser.parseString(xml);

    const candidates: DiscoveredCandidate[] = (feed.items ?? [])
      .slice(0, MAX_ITEMS)
      .filter((item) => item.title && item.link)
      .map((item) => ({
        title: item.title!.trim(),
        summary: stripHtml(item.content ?? item.contentSnippet ?? item.summary ?? "").slice(0, 500),
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
