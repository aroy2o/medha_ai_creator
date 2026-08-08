import type { DiscoveredCandidate } from "@/lib/discovery/types";
import type { MemoryPost } from "./memory";
import { extractKeywords } from "./keywords";
import type { CandidateWithKeywords } from "./corroboration";
import { scoreCandidate, APPROVAL_THRESHOLD, type EditorialCriteriaScores, type EditorialVerdict } from "./scoring";

export type RejectionCategory = "hard_reject" | "below_bar" | "outranked";

export interface JudgedCandidate {
  verdict: EditorialVerdict;
  category: RejectionCategory;
  reason: string;
}

export interface JudgeResult {
  winner: EditorialVerdict | null;
  /** Every other candidate considered this cycle, ranked, reasons attached. */
  considered: JudgedCandidate[];
}

// At least a few alternatives should be visible in the editorial log per
// cycle even when far more candidates existed; capped so the log stays a
// readable "what did Medha weigh" summary rather than a dump of everything.
const MAX_LOGGED_REJECTIONS = 8;

const WEAKNESS_DESCRIPTIONS: Record<keyof EditorialCriteriaScores, (score: number) => string> = {
  relevance: (s) => `limited connection to Medha's domain (${s}/10)`,
  substance: (s) => `reads as more hype than technical substance (${s}/10)`,
  timeliness: (s) => `not timely — dated or stale (${s}/10)`,
  novelty: (s) => `overlaps meaningfully with prior coverage (${s}/10)`,
  credibility: (s) => `lower source credibility for this kind of claim (${s}/10)`,
  corroboration: (s) => `no independent second source covering this (${s}/10)`,
};

function buildBelowBarReason(v: EditorialVerdict): string {
  const dims = Object.entries(v.scores) as [keyof EditorialCriteriaScores, number][];
  dims.sort((a, b) => a[1] - b[1]);
  const weakest = dims.slice(0, 2).map(([key, score]) => WEAKNESS_DESCRIPTIONS[key](score));
  return `Scored ${v.weightedTotal}/10 — below the ${APPROVAL_THRESHOLD}/10 publish bar. Weakest dimensions: ${weakest.join("; ")}.`;
}

function buildOutrankedReason(v: EditorialVerdict, winner: EditorialVerdict): string {
  return `Cleared the editorial bar at ${v.weightedTotal}/10 but ranked below "${winner.candidate.title}" (${winner.weightedTotal}/10) this cycle. Medha publishes one post per cycle rather than front-loading every plausible story at once.`;
}

export interface JudgeInput {
  candidates: DiscoveredCandidate[];
  pastPosts: MemoryPost[];
  domainVocabulary: string[];
}

export function judgeCandidates({ candidates, pastPosts, domainVocabulary }: JudgeInput): JudgeResult {
  // Extracted once per candidate for the whole cycle, not once per
  // pairwise corroboration comparison — the expensive part (regex-based
  // keyword extraction) stays O(n); only the cheap Jaccard comparisons
  // inside scoreCorroboration are O(n^2).
  const candidatesWithKeywords: CandidateWithKeywords[] = candidates.map((candidate) => ({
    candidate,
    keywords: new Set(extractKeywords(`${candidate.title} ${candidate.summary}`)),
  }));

  const verdicts = candidates.map((candidate) =>
    scoreCandidate({ candidate, pastPosts, domainVocabulary, allCandidatesWithKeywords: candidatesWithKeywords }),
  );

  const sorted = [...verdicts].sort((a, b) => b.weightedTotal - a.weightedTotal);
  const winner =
    sorted.find((v) => !v.hardRejectReason && v.weightedTotal >= APPROVAL_THRESHOLD) ?? null;

  const rest = sorted.filter((v) => v !== winner).slice(0, MAX_LOGGED_REJECTIONS);

  const considered: JudgedCandidate[] = rest.map((verdict) => {
    if (verdict.hardRejectReason) {
      return { verdict, category: "hard_reject", reason: verdict.hardRejectReason };
    }
    if (verdict.weightedTotal < APPROVAL_THRESHOLD) {
      return { verdict, category: "below_bar", reason: buildBelowBarReason(verdict) };
    }
    // weightedTotal >= APPROVAL_THRESHOLD and not hard-rejected implies a
    // winner exists (that's exactly the condition winner search used).
    return { verdict, category: "outranked", reason: buildOutrankedReason(verdict, winner!) };
  });

  return { winner, considered };
}
