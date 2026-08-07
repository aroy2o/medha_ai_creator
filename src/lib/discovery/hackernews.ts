import { fetchWithTimeout, sleep } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import type { DiscoveredCandidate, DiscoveryResult } from "./types";

const BASE = "https://hacker-news.firebaseio.com/v0";
const STORIES_TO_SCAN = 25;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

interface HnItem {
  id: number;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
  time?: number;
  type?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchItem(id: number): Promise<HnItem | null> {
  try {
    const res = await fetchWithTimeout(`${BASE}/item/${id}.json`, { timeoutMs: 6000 });
    if (!res.ok) return null;
    return (await res.json()) as HnItem;
  } catch {
    return null;
  }
}

export async function discoverHackerNews(): Promise<DiscoveryResult> {
  const source = "Hacker News" as const;
  try {
    const res = await fetchWithTimeout(`${BASE}/topstories.json`, { timeoutMs: 8000 });
    if (!res.ok) {
      throw new Error(`topstories.json responded ${res.status}`);
    }
    const ids = (await res.json()) as number[];
    const topIds = ids.slice(0, STORIES_TO_SCAN);

    const items: HnItem[] = [];
    for (let i = 0; i < topIds.length; i += BATCH_SIZE) {
      const batch = topIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(fetchItem));
      for (const item of results) {
        if (item) items.push(item);
      }
      if (i + BATCH_SIZE < topIds.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    const candidates: DiscoveredCandidate[] = items
      .filter((item) => item.type === "story" && item.title)
      .map((item) => ({
        title: item.title!,
        summary: item.text
          ? stripHtml(item.text).slice(0, 500)
          : `${item.score ?? 0} points, ${item.descendants ?? 0} comments on Hacker News.`,
        url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
        source,
        publishedAt: item.time ? new Date(item.time * 1000).toISOString() : null,
      }));

    return { source, candidates, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.warn("discovery source failed", { source, message });
    return { source, candidates: [], error: message };
  }
}
