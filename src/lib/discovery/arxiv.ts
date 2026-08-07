import Parser from "rss-parser";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import type { DiscoveredCandidate, DiscoveryResult } from "./types";

const FEED_URL = "https://export.arxiv.org/rss/cs.AI";
const MAX_ITEMS = 20;

const parser = new Parser();

function cleanAbstract(raw: string): string {
  return raw
    .replace(/^arXiv:\S+\s+Announce Type:\s*\S+\s*/i, "")
    .replace(/^Abstract:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

export async function discoverArxiv(): Promise<DiscoveryResult> {
  const source = "arXiv" as const;
  try {
    const res = await fetchWithTimeout(FEED_URL, { timeoutMs: 10_000 });
    if (!res.ok) {
      throw new Error(`arXiv RSS responded ${res.status}`);
    }
    const xml = await res.text();
    const feed = await parser.parseString(xml);

    const candidates: DiscoveredCandidate[] = (feed.items ?? [])
      .slice(0, MAX_ITEMS)
      .filter((item) => item.title && item.link)
      .map((item) => ({
        title: item.title!.trim(),
        summary: cleanAbstract(item.contentSnippet ?? item.content ?? ""),
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
