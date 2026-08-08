import Parser from "rss-parser";
import { fetchWithTimeout, sleep } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import type { DiscoveredCandidate, DiscoveryResult } from "./types";

// A curated set of major AI/ML infra repos — exactly the "what actually
// ships and breaks in production" territory this persona covers. GitHub's
// per-repo Atom feed for releases is a stable, unauthenticated, official
// primary source (the maintainers' own release notes), unlike scraping.
const REPOS = [
  "huggingface/transformers",
  "vllm-project/vllm",
  "ollama/ollama",
  "ggml-org/llama.cpp",
  "langchain-ai/langchain",
  "pytorch/pytorch",
];
const RELEASES_PER_REPO = 2;
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 200;

const parser = new Parser();

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchRepoReleases(repo: string): Promise<DiscoveredCandidate[]> {
  try {
    const res = await fetchWithTimeout(`https://github.com/${repo}/releases.atom`, { timeoutMs: 6000 });
    if (!res.ok) return [];
    const xml = await res.text();
    const feed = await parser.parseString(xml);
    return (feed.items ?? [])
      .slice(0, RELEASES_PER_REPO)
      .filter((item) => item.title && item.link)
      .map((item) => ({
        title: `${repo}: ${item.title!.trim()}`,
        summary: stripHtml(item.content ?? item.contentSnippet ?? "").slice(0, 500) || "No release notes provided.",
        url: item.link!,
        source: "GitHub Releases" as const,
        publishedAt: item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : null),
      }));
  } catch {
    return [];
  }
}

export async function discoverGitHubReleases(): Promise<DiscoveryResult> {
  const source = "GitHub Releases" as const;
  try {
    const candidates: DiscoveredCandidate[] = [];
    for (let i = 0; i < REPOS.length; i += BATCH_SIZE) {
      const batch = REPOS.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(fetchRepoReleases));
      for (const r of results) candidates.push(...r);
      if (i + BATCH_SIZE < REPOS.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }
    return { source, candidates, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.warn("discovery source failed", { source, message });
    return { source, candidates: [], error: message };
  }
}
