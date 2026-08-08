import { jaccardSimilarity } from "./similarity";
import type { DiscoveredCandidate } from "@/lib/discovery/types";

export interface CandidateWithKeywords {
  candidate: DiscoveredCandidate;
  keywords: Set<string>;
}

export interface CorroborationResult {
  /** Distinct *other sources* (not other candidates) with significant overlap. */
  count: number;
  fromSources: DiscoveredCandidate["source"][];
}

/**
 * Jaccard overlap between two *raw candidates* (not candidate-vs-published
 * -post, which is a different comparison with a different empirically
 * -tuned threshold — see memory.ts's NOVELTY_REJECT_THRESHOLD comment for
 * why that distinction matters) at or above this is treated as "the same
 * underlying story."
 *
 * Tuned against measured values, not guessed — and the measurements
 * exposed a real tradeoff, not a clean gap. Two sources that both carry
 * substantive text about the same release (a commentary post plus a
 * release-notes-style summary) measured 0.34. But Hacker News link-post
 * candidates often carry almost no body text ("312 points, 89 comments on
 * Hacker News" — the real fallback summary this app's own discovery layer
 * uses when there's no self-text) — a terse HN title matched against a
 * fuller arXiv abstract for the literal same release measured only 0.125,
 * uncomfortably close to two candidates that merely *share a domain*
 * without being the same story (measured 0.10).
 *
 * Given that overlap, this threshold is set above both the 0.125 and 0.10
 * cases rather than between them: a threshold of ~0.11-0.14 would call
 * corroboration on same-domain-different-story pairs as often as it would
 * catch a genuinely terse same-story match, and false corroboration
 * claims are a worse failure mode than missed ones for a persona whose
 * whole identity is being evidence-based rather than overclaiming. The
 * accepted cost: a real corroborating source with a thin, title-only
 * summary sometimes won't be detected. A source with real content will.
 */
export const CORROBORATION_MIN_OVERLAP = 0.2;

/**
 * Counts how many *other, independent* discovery sources also surfaced
 * something about the same underlying story this cycle — real editorial
 * corroboration ("multiple sources are covering this"), not just a single
 * source's say-so. Same-source candidates never corroborate each other
 * (that's just one source posting twice, not independent confirmation).
 *
 * O(n) per candidate given pre-extracted keywords for the full candidate
 * pool (see judge.ts) — the expensive part, keyword extraction, happens
 * once per candidate for the whole cycle, not once per pairwise
 * comparison; this function only does cheap Set operations.
 */
export function scoreCorroboration(
  target: CandidateWithKeywords,
  allCandidates: CandidateWithKeywords[],
): CorroborationResult {
  const fromSources = new Set<DiscoveredCandidate["source"]>();

  for (const other of allCandidates) {
    if (other.candidate === target.candidate) continue;
    if (other.candidate.source === target.candidate.source) continue;
    if (fromSources.has(other.candidate.source)) continue; // already counted this source
    if (jaccardSimilarity(target.keywords, other.keywords) >= CORROBORATION_MIN_OVERLAP) {
      fromSources.add(other.candidate.source);
    }
  }

  return { count: fromSources.size, fromSources: [...fromSources] };
}
