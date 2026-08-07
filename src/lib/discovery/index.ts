import { sleep } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { discoverHackerNews } from "./hackernews";
import { discoverArxiv } from "./arxiv";
import { discoverReddit } from "./reddit";
import { discoverGitHubTrending } from "./githubTrending";
import type { DiscoveredCandidate, DiscoveryResult } from "./types";

export type { DiscoveredCandidate, DiscoveryResult };

const SOURCES = [discoverHackerNews, discoverArxiv, discoverReddit, discoverGitHubTrending];
const DELAY_BETWEEN_SOURCES_MS = 300;

/**
 * Runs every discovery source sequentially (small delay between each, out
 * of courtesy to free/unauthenticated APIs) and returns both the combined
 * candidate list and a per-source status report. A source that throws or
 * times out contributes zero candidates and a logged warning — it never
 * takes the whole cycle down with it.
 */
export async function discoverAll(): Promise<{
  candidates: DiscoveredCandidate[];
  results: DiscoveryResult[];
}> {
  const results: DiscoveryResult[] = [];

  for (let i = 0; i < SOURCES.length; i++) {
    const result = await SOURCES[i]();
    results.push(result);
    if (i + 1 < SOURCES.length) {
      await sleep(DELAY_BETWEEN_SOURCES_MS);
    }
  }

  const candidates = results.flatMap((r) => r.candidates);
  logger.info("discovery cycle complete", {
    totalCandidates: candidates.length,
    sourcesOk: results.filter((r) => !r.error).length,
    sourcesFailed: results.filter((r) => r.error).length,
  });

  return { candidates, results };
}
