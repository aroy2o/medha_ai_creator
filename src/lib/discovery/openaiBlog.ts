import Parser from "rss-parser";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import type { DiscoveredCandidate, DiscoveryResult } from "./types";

// Official primary source for OpenAI's own announcements — credible on
// facts, but a company's own blog about its own products carries a
// promotional angle the editorial scoring's hype-detection needs to
// weigh accordingly (see scoring.ts's SOURCE_CREDIBILITY).
const FEED_URL = "https://openai.com/news/rss.xml";
const MAX_ITEMS = 15;

const parser = new Parser();

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function discoverOpenAiBlog(): Promise<DiscoveryResult> {
  const source = "OpenAI Blog" as const;
  try {
    const res = await fetchWithTimeout(FEED_URL, { timeoutMs: 10_000 });
    if (!res.ok) {
      throw new Error(`OpenAI blog feed responded ${res.status}`);
    }
    const xml = await res.text();
    const feed = await parser.parseString(xml);

    const candidates: DiscoveredCandidate[] = (feed.items ?? [])
      .slice(0, MAX_ITEMS)
      .filter((item) => item.title && item.link)
      .map((item) => ({
        title: item.title!.trim(),
        summary: stripHtml(item.contentSnippet ?? item.content ?? "").slice(0, 500),
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
