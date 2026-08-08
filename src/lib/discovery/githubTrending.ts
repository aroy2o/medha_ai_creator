import * as cheerio from "cheerio";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import type { DiscoveredCandidate, DiscoveryResult } from "./types";

// There is no official free GitHub Trending API, and third-party hosted
// wrappers around it are an availability risk for a 48-hour evaluation
// window we don't control. Scraping the public HTML page directly keeps
// this source under our own error handling instead of a stranger's uptime.
const PAGE_URL = "https://github.com/trending?since=daily";
const MAX_ITEMS = 20;

export async function discoverGitHubTrending(): Promise<DiscoveryResult> {
  const source = "GitHub Trending" as const;
  try {
    const res = await fetchWithTimeout(PAGE_URL, {
      timeoutMs: 10_000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MedhaBot/1.0)" },
    });
    if (!res.ok) {
      throw new Error(`github.com/trending responded ${res.status}`);
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    const candidates: DiscoveredCandidate[] = [];
    $("article.Box-row")
      .slice(0, MAX_ITEMS)
      .each((_, el) => {
        const anchor = $(el).find("h2 a").first();
        const href = anchor.attr("href");
        if (!href) return;
        const repoName = href.replace(/^\//, "").trim();
        const description = $(el).find("p.col-9").first().text().trim();
        const language = $(el).find('span[itemprop="programmingLanguage"]').first().text().trim();
        const starsText = $(el)
          .find(".f6 > span.d-inline-block.float-sm-right")
          .first()
          .text()
          .trim();

        candidates.push({
          title: repoName,
          summary: [
            description || "No description provided.",
            language ? `Primary language: ${language}.` : null,
            starsText ? `${starsText} on GitHub.` : null,
          ]
            .filter(Boolean)
            .join(" ")
            .slice(0, 400),
          url: `https://github.com/${repoName}`,
          source,
          publishedAt: null,
        });
      });

    return { source, candidates, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.warn("discovery source failed", { source, message });
    return { source, candidates: [], error: message };
  }
}
