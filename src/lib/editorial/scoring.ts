import type { DiscoveredCandidate } from "@/lib/discovery/types";
import { extractKeywords } from "./keywords";
import { buildMemoryIndex, scoreNovelty, NOVELTY_REJECT_THRESHOLD, type MemoryPost } from "./memory";
import { scoreCorroboration, type CandidateWithKeywords } from "./corroboration";

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
  corroboration: number;
}

export interface EditorialVerdict {
  candidate: DiscoveredCandidate;
  scores: EditorialCriteriaScores;
  weightedTotal: number;
  noveltyScore: number;
  mostSimilarPostId: string | null;
  mostSimilarPostLabel: string | null;
  sharedTerms: string[];
  /** Other sources that independently surfaced the same story this cycle. */
  corroboratingSources: DiscoveredCandidate["source"][];
  hardRejectReason: string | null;
}

// Rebalanced from the original 5-criterion weighting (relevance .30,
// substance .25, timeliness .15, novelty .20, credibility .10) to make
// room for corroboration without discarding the reasoning behind the
// original split — relevance and substance still matter most, but each
// gave up a little.
const WEIGHTS: EditorialCriteriaScores = {
  relevance: 0.25,
  substance: 0.2,
  timeliness: 0.15,
  novelty: 0.15,
  credibility: 0.1,
  corroboration: 0.15,
};

/** Weighted total must clear this (0-10 scale) to be publishable at all. */
export const APPROVAL_THRESHOLD = 6.0;

const SOURCE_CREDIBILITY: Record<DiscoveredCandidate["source"], number> = {
  // Peer-review-track preprints with full abstracts and named authors.
  arXiv: 9,
  // Official release notes, written by the maintainers of software that's
  // actually running in production somewhere — as factual as it gets,
  // just not peer-reviewed.
  "GitHub Releases": 8,
  // An independent expert with a strong, specific track record for
  // technical accuracy on LLM tooling — individual, so a notch below an
  // institutional primary source, but not community-crowd-sourced either.
  "Simon Willison": 8,
  // Real, shipped, running code — but stars measure popularity, not
  // correctness or production-readiness.
  "GitHub Trending": 7,
  // Community-vetted via points/comments, but variable quality and no
  // editorial process.
  "Hacker News": 7,
  // A primary source for OpenAI's own announcements, but a company
  // blogging about its own product carries an inherent promotional
  // angle — factually reliable, editorially self-interested.
  "OpenAI Blog": 7,
  // Open discussion forum; the lowest editorial bar of all sources.
  "Reddit r/MachineLearning": 6,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

/**
 * Baseline 6 (a candidate with zero corroboration isn't penalized — being
 * the only source to cover something yet is often exactly when it's most
 * valuable to cover, not a mark against it), +2 per independently
 * corroborating source, capped at 10. Deliberately not scaled to reward
 * corroboration as heavily as it could: this is a bonus signal on top of
 * relevance/substance/credibility, not a replacement for them — a
 * corroborated but low-substance story shouldn't out-score an
 * uncorroborated but rigorous one.
 */
export function scoreCorroborationDimension(corroboratingSourceCount: number): number {
  return clamp(6 + corroboratingSourceCount * 2, 0, 10);
}

export interface ScoreCandidateInput {
  candidate: DiscoveredCandidate;
  pastPosts: MemoryPost[];
  domainVocabulary: string[];
  /** Every candidate discovered this cycle (including this one) with
   * pre-extracted keywords, for corroboration comparison. Extracting
   * once per candidate up front and passing the shared list in avoids
   * O(n^2) keyword re-extraction across a whole cycle's candidate pool
   * — see judge.ts. Defaults to empty (no corroboration data available,
   * e.g. when calling scoreCandidate directly/in isolation), which is
   * equivalent to "nothing else corroborates this."
   */
  allCandidatesWithKeywords?: CandidateWithKeywords[];
}

export function scoreCandidate({
  candidate,
  pastPosts,
  domainVocabulary,
  allCandidatesWithKeywords = [],
}: ScoreCandidateInput): EditorialVerdict {
  const text = `${candidate.title} ${candidate.summary}`;
  const candidateKeywords = new Set(extractKeywords(text));
  const memory = buildMemoryIndex(pastPosts);
  const novelty = scoreNovelty(candidateKeywords, memory);
  const corroboration = scoreCorroboration({ candidate, keywords: candidateKeywords }, allCandidatesWithKeywords);

  const relevance = scoreRelevance(text, [...BASE_DOMAIN_VOCABULARY, ...domainVocabulary]);
  const substance = scoreSubstance(text);
  const timeliness = scoreTimeliness(candidate.publishedAt, candidate.source);
  const noveltyScore = clamp(10 * (1 - novelty.score * 2), 0, 10);
  const credibility = scoreCredibility(candidate.source);
  const corroborationScore = scoreCorroborationDimension(corroboration.count);

  // Rounded for display — these end up in the public rationale/UI via
  // buildScoreBreakdown, not just used internally, so an unrounded value
  // like 9.444444444444445 would leak straight into published text.
  const scores: EditorialCriteriaScores = {
    relevance: round2(relevance),
    substance: round2(substance),
    timeliness: round2(timeliness),
    novelty: round2(noveltyScore),
    credibility: round2(credibility),
    corroboration: round2(corroborationScore),
  };

  const weightedTotal =
    scores.relevance * WEIGHTS.relevance +
    scores.substance * WEIGHTS.substance +
    scores.timeliness * WEIGHTS.timeliness +
    scores.novelty * WEIGHTS.novelty +
    scores.credibility * WEIGHTS.credibility +
    scores.corroboration * WEIGHTS.corroboration;

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
    corroboratingSources: corroboration.fromSources,
    hardRejectReason,
  };
}
