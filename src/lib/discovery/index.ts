import { logger } from "@/lib/logger";
import { discoverHackerNews } from "./hackernews";
import { discoverArxiv } from "./arxiv";
import { discoverReddit } from "./reddit";
import { discoverGitHubTrending } from "./githubTrending";
import { discoverGitHubReleases } from "./githubReleases";
import { discoverSimonWillison } from "./simonWillison";
import { discoverOpenAiBlog } from "./openaiBlog";
import type { DiscoveredCandidate, DiscoveryResult } from "./types";

export type { DiscoveredCandidate, DiscoveryResult };

const SOURCES = [
  discoverHackerNews,
  discoverArxiv,
  discoverReddit,
  discoverGitHubTrending,
  discoverGitHubReleases,
  discoverSimonWillison,
  discoverOpenAiBlog,
];

/**
 * Runs every discovery source concurrently and returns both the combined
 * candidate list and a per-source status report. Each source hits a
 * different host (Firebase, arXiv, Reddit, GitHub, simonwillison.net,
 * openai.com) — the earlier sequential-with-delay design was rate-limit
 * courtesy for a *single* host, which doesn't apply across unrelated
 * ones; running them concurrently is standard practice and keeps total
 * discovery time roughly constant as more sources are added instead of
 * growing linearly. Individual sources that hammer a single host
 * internally (GitHub Releases fetching several repos) still batch and
 * delay their own requests — see githubReleases.ts.
 *
 * A source that throws or times out contributes zero candidates and a
 * logged warning — it never takes the whole cycle down with it.
 */
export async function discoverAll(): Promise<{
  candidates: DiscoveredCandidate[];
  results: DiscoveryResult[];
}> {
  const results = await Promise.all(SOURCES.map((source) => source()));

  const candidates = results.flatMap((r) => r.candidates);
  logger.info("discovery cycle complete", {
    totalCandidates: candidates.length,
    sourcesOk: results.filter((r) => !r.error).length,
    sourcesFailed: results.filter((r) => r.error).length,
  });

  return { candidates, results };
}
