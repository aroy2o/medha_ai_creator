import type { DiscoveredCandidate } from "@/lib/discovery/types";
import { extractKeywords } from "./keywords";
import { buildMemoryIndex, scoreNovelty, NOVELTY_REJECT_THRESHOLD, type MemoryPost } from "./memory";

/**
 * Baseline domain vocabulary for "production AI reliability" — merged at
 * scoring time with the persona's own standingInterests. Lives here
 * (rather than purely in the DB-seeded PersonaProfile) because it's the
 * one part of the editorial bar that's about *this app's* subject matter,
 * not the persona's voice — voice belongs in generation, not judgment.
 */
export const BASE_DOMAIN_VOCABULARY = [
  "reliability", "production", "deployment", "inference", "latency",
  "throughput", "outage", "incident", "postmortem", "root cause",
  "monitoring", "observability", "eval", "evaluation", "benchmark",
  "hallucination", "regression", "scaling", "fine-tuning", "fine tuning",
  "rag", "retrieval", "agent", "agentic", "orchestration", "guardrail",
  "safety", "failure mode", "uptime", "sla", "throttling", "rate limit",
  "cost", "gpu", "quantization", "distillation", "context window",
  "tool use", "tool calling", "eval harness", "drift", "fallback",
  "degradation", "load test", "capacity", "serving", "runtime",
];

const HYPE_WORDS = [
  "revolutionary", "game-changing", "game changer", "unleash", "supercharge",
  "the future of", "changes everything", "mind-blowing", "mindblowing",
  "insane", "unbelievable", "magic", "10x", "100x", "disrupt", "paradigm shift",
  "unprecedented", "groundbreaking", "next-gen", "cutting-edge", "world-first",
];

const SUBSTANCE_SIGNALS = [
  "benchmark", "latency", "throughput", "paper", "dataset", "reproduc",
  "eval", "evaluation", "regression", "incident", "postmortem",
  "root cause", "p50", "p95", "p99", "sla", "outage", "arxiv.org",
  "github.com", "ablation", "baseline", "methodology", "experiment",
];

export interface EditorialCriteriaScores {
  relevance: number;
  substance: number;
  timeliness: number;
  novelty: number;
  credibility: number;
}

export interface EditorialVerdict {
  candidate: DiscoveredCandidate;
  scores: EditorialCriteriaScores;
  weightedTotal: number;
  noveltyScore: number;
  mostSimilarPostId: string | null;
  mostSimilarPostLabel: string | null;
  sharedTerms: string[];
  hardRejectReason: string | null;
}

const WEIGHTS: EditorialCriteriaScores = {
  relevance: 0.3,
  substance: 0.25,
  timeliness: 0.15,
  novelty: 0.2,
  credibility: 0.1,
};

/** Weighted total must clear this (0-10 scale) to be publishable at all. */
export const APPROVAL_THRESHOLD = 6.0;

const SOURCE_CREDIBILITY: Record<DiscoveredCandidate["source"], number> = {
  // Peer-review-track preprints with full abstracts and named authors.
  arXiv: 9,
  // Real, shipped, running code — but stars measure popularity, not
  // correctness or production-readiness.
  "GitHub Trending": 7,
  // Community-vetted via points/comments, but variable quality and no
  // editorial process.
  "Hacker News": 7,
  // Open discussion forum; the lowest editorial bar of the four sources.
  "Reddit r/MachineLearning": 6,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * +2.5 per distinct domain-vocabulary hit, capped at 10. Documented
 * reasoning: one incidental keyword match shouldn't be enough to call a
 * topic "relevant" to a reliability-focused persona — it takes roughly
 * four independent signals to be confident this is actually on-topic
 * rather than a coincidental word overlap.
 *
 * Matches on a word-boundary regex with an optional trailing "s" (so a
 * singular vocabulary term like "agent" matches "agents" in the text)
 * rather than exact-token-set membership — an earlier version used
 * extractKeywords()'s unigram set directly and missed plural forms
 * ("agents" in candidate text vs "agent" in the vocabulary), which
 * silently undercounted relevance. Word boundaries keep short terms like
 * "rag" or "sla" from false-matching inside unrelated words.
 */
export function scoreRelevance(text: string, vocabulary: string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const term of vocabulary) {
    const normalized = term.toLowerCase().trim();
    if (!normalized) continue;
    const pattern = new RegExp(`\\b${escapeRegex(normalized)}s?\\b`, "i");
    if (pattern.test(lower)) hits++;
  }
  return clamp(hits * 2.5, 0, 10);
}

/**
 * Starts neutral (5), technical-substance signals push it up, hype
 * language pushes it down harder than substance pushes it up — the
 * persona brief explicitly calls for skepticism toward overclaimed AI
 * capabilities, so hype should cost more than substance earns.
 */
export function scoreSubstance(text: string): number {
  const lower = text.toLowerCase();
  let substanceHits = 0;
  for (const signal of SUBSTANCE_SIGNALS) {
    if (lower.includes(signal)) substanceHits++;
  }
  let hypeHits = 0;
  for (const word of HYPE_WORDS) {
    if (lower.includes(word)) hypeHits++;
  }
  if (/\d+(\.\d+)?%/.test(text)) substanceHits++;
  return clamp(5 + substanceHits * 1.5 - hypeHits * 2.5, 0, 10);
}

/**
 * GitHub Trending has no per-item timestamp, but "trending today" is
 * itself a timeliness signal, so unknown dates from that source default
 * higher than a genuinely-unknown date would elsewhere.
 */
export function scoreTimeliness(publishedAt: string | null, source: DiscoveredCandidate["source"]): number {
  if (!publishedAt) return source === "GitHub Trending" ? 8 : 4;
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours <= 24) return 10;
  if (ageHours <= 72) return 7;
  if (ageHours <= 168) return 4;
  return 1;
}

export function scoreCredibility(source: DiscoveredCandidate["source"]): number {
  return SOURCE_CREDIBILITY[source];
}

export interface ScoreCandidateInput {
  candidate: DiscoveredCandidate;
  pastPosts: MemoryPost[];
  domainVocabulary: string[];
}

export function scoreCandidate({
  candidate,
  pastPosts,
  domainVocabulary,
}: ScoreCandidateInput): EditorialVerdict {
  const text = `${candidate.title} ${candidate.summary}`;
  const candidateKeywords = new Set(extractKeywords(text));
  const memory = buildMemoryIndex(pastPosts);
  const novelty = scoreNovelty(candidateKeywords, memory);

  const relevance = scoreRelevance(text, [...BASE_DOMAIN_VOCABULARY, ...domainVocabulary]);
  const substance = scoreSubstance(text);
  const timeliness = scoreTimeliness(candidate.publishedAt, candidate.source);
  const noveltyScore = clamp(10 * (1 - novelty.score * 2), 0, 10);
  const credibility = scoreCredibility(candidate.source);

  const scores: EditorialCriteriaScores = {
    relevance,
    substance,
    timeliness,
    novelty: noveltyScore,
    credibility,
  };

  const weightedTotal =
    scores.relevance * WEIGHTS.relevance +
    scores.substance * WEIGHTS.substance +
    scores.timeliness * WEIGHTS.timeliness +
    scores.novelty * WEIGHTS.novelty +
    scores.credibility * WEIGHTS.credibility;

  let hardRejectReason: string | null = null;
  if (novelty.score >= NOVELTY_REJECT_THRESHOLD && novelty.mostSimilar) {
    hardRejectReason = `Too similar to an existing post ("${novelty.mostSimilar.label}") — ${Math.round(
      novelty.score * 100,
    )}% keyword overlap (shared: ${novelty.sharedTerms.slice(0, 6).join(", ") || "n/a"}).`;
  } else if (relevance === 0) {
    hardRejectReason =
      "No detected connection to Medha's domain (production AI reliability, deployment, failure modes) — zero domain-vocabulary matches.";
  }

  return {
    candidate,
    scores,
    weightedTotal: Math.round(weightedTotal * 100) / 100,
    noveltyScore: novelty.score,
    mostSimilarPostId: novelty.mostSimilar?.postId ?? null,
    mostSimilarPostLabel: novelty.mostSimilar?.label ?? null,
    sharedTerms: novelty.sharedTerms,
    hardRejectReason,
  };
}
