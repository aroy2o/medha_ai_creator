import { extractKeywords } from "./keywords";
import { jaccardSimilarity, sharedTerms } from "./similarity";

export interface MemoryPost {
  id: string;
  text: string;
  topicTags: string[];
}

export interface MemoryEntry {
  postId: string;
  /** Short human-readable label for rejection-reason strings. */
  label: string;
  keywords: Set<string>;
}

/**
 * Builds one memory entry per past post: its explicit topicTags (the
 * author's own summary of what it's about) merged with keywords
 * auto-extracted from the post body (the "key entities" the brief asks
 * for) — tags alone can be too abstract to catch overlap on their own.
 */
export function buildMemoryIndex(posts: MemoryPost[]): MemoryEntry[] {
  return posts.map((post) => ({
    postId: post.id,
    label: post.topicTags.length > 0 ? post.topicTags.join(", ") : post.text.slice(0, 60),
    keywords: new Set([
      ...post.topicTags.map((t) => t.toLowerCase().trim()),
      ...extractKeywords(post.text).slice(0, 12),
    ]),
  }));
}

export interface NoveltyResult {
  /** 0..1 Jaccard similarity against the single most-similar past post. */
  score: number;
  mostSimilar: MemoryEntry | null;
  sharedTerms: string[];
}

/**
 * A candidate is compared against every past post individually (not one
 * pooled "all history" bag of words) and we keep the worst-case (highest)
 * similarity. Pooling would dilute the signal: a large, topically diverse
 * history would make almost anything look novel by comparison, which
 * defeats the point of a per-post duplicate check.
 */
export function scoreNovelty(candidateKeywords: Set<string>, memory: MemoryEntry[]): NoveltyResult {
  let best: NoveltyResult = { score: 0, mostSimilar: null, sharedTerms: [] };
  for (const entry of memory) {
    const score = jaccardSimilarity(candidateKeywords, entry.keywords);
    if (score > best.score) {
      best = { score, mostSimilar: entry, sharedTerms: sharedTerms(candidateKeywords, entry.keywords) };
    }
  }
  return best;
}

/**
 * Jaccard overlap at or above this is treated as "the same topic already
 * covered" and hard-rejected rather than merely scored down. Tuned against
 * measured values (see memory.test.ts) rather than picked a priori: a
 * candidate that's a near-duplicate of a past post (same named entities,
 * same core claim, different phrasing) measured 0.28 overlap; a candidate
 * that shares only the broad domain with a past post (production
 * inference, but a different specific story) measured 0.069; a fully
 * unrelated candidate measured 0.0. 0.2 sits in the gap between the
 * near-duplicate cluster and the merely-same-domain cluster, with margin
 * on both sides.
 */
export const NOVELTY_REJECT_THRESHOLD = 0.2;
