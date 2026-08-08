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
      ...extractKeywords(post.text).slice(0, 8),
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
 * covered" and hard-rejected rather than merely scored down.
 *
 * First tuned against hand-written near-duplicate text (0.28) vs.
 * same-domain-different-topic text (0.069) — see memory.test.ts — which
 * put 0.2 comfortably in the gap. Live end-to-end testing then surfaced
 * a real gap that synthetic text didn't: the actual runtime comparison
 * isn't candidate-vs-candidate, it's candidate-vs-published-post, and a
 * published post is Groq's paraphrase of the original candidate, not the
 * candidate's own text. Paraphrasing systematically lowers measured
 * overlap — feeding the literal same arXiv paper back in one cycle after
 * publishing it about scored only 0.111, below the 0.2 gate, and the
 * duplicate very nearly got republished. Two changes followed: (1)
 * buildMemoryIndex's body-keyword slice above dropped 12 -> 8 to lean
 * more on topicTags (curated, not prose-diluted) and less on generated
 * body text; (2) the cycle route now also folds a few keywords extracted
 * from the *original candidate's title* into topicTags at save time, so
 * memory keeps the source's own vocabulary even when Medha's prose
 * doesn't reuse it. With both applied the same repeat-topic case
 * re-measured at 0.171 — better, but still short of 0.2, so the
 * threshold itself also moved down to 0.15, which now correctly
 * hard-rejects that case while staying clear of the 0.069
 * same-domain-different-topic measurement (0.081 margin).
 */
export const NOVELTY_REJECT_THRESHOLD = 0.15;

/**
 * Below NOVELTY_REJECT_THRESHOLD but at or above this, a candidate isn't
 * a duplicate — it's genuinely related to something already published.
 * That's not a reason to reject it; it's an opportunity for the post to
 * explicitly build on prior coverage instead of reading as unrelated.
 * The measured same-domain-different-topic case (0.069 — see
 * NOVELTY_REJECT_THRESHOLD's comment above) sits inside this band by
 * design: "same broad domain, different specific story" is exactly what
 * a natural callback ("following up on what I covered before...") is
 * for. Below this, overlap is too tenuous to reference without it
 * reading as a non sequitur.
 */
export const RELATED_CALLBACK_MIN = 0.05;
