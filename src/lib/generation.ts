import Groq from "groq-sdk";
import { logger } from "@/lib/logger";
import { extractKeywords } from "@/lib/editorial/keywords";
import type { DiscoveredCandidate } from "@/lib/discovery/types";
import type { JudgedCandidate } from "@/lib/editorial/judge";
import type { EditorialCriteriaScores } from "@/lib/editorial/scoring";

export interface PersonaVoice {
  name: string;
  styleGuide: string;
  editorialStandards: string;
}

export interface RelatedPastPost {
  label: string;
  sharedTerms: string[];
}

export interface GenerationInput {
  persona: PersonaVoice;
  winningCandidate: DiscoveredCandidate;
  weightedTotal: number;
  scores: EditorialCriteriaScores;
  /** Every other candidate considered this cycle, for an accurate rationale. */
  alternatives: JudgedCandidate[];
  /** Set when this topic is related-but-distinct from a past post — see
   * lib/editorial/memory.ts's RELATED_CALLBACK_MIN. */
  relatedPastPost: RelatedPastPost | null;
  /** Other sources that independently surfaced the same story this cycle
   * — see lib/editorial/corroboration.ts. */
  corroboratingSources: DiscoveredCandidate["source"][];
  /** Set when this exact URL was outranked (not rejected on its own
   * merits) in a past cycle and is winning now that nothing beats it. */
  heldOverSince: Date | null;
}

export interface GeneratedPost {
  text: string;
  rationale: string;
  topicTags: string[];
  /** A short (2-4 word) editorial stance, e.g. "cautiously optimistic",
   * "skeptical" — makes "distinct editorial opinions" checkable rather
   * than merely asserted in a system prompt. */
  stance: string;
}

const MODEL = "llama-3.3-70b-versatile";
const MAX_TAGS = 6;
const REQUEST_TIMEOUT_MS = 20_000;
const CRITIQUE_APPROVAL_THRESHOLD = 7;

export function isMockMode(): boolean {
  return process.env.MOCK_MODE === "true" || !process.env.GROQ_API_KEY;
}

export function sanitizeTags(raw: unknown, fallbackText: string): string[] {
  const tags = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
  const cleaned = tags.map((t) => t.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "")).filter(Boolean);
  const deduped = [...new Set(cleaned)].slice(0, MAX_TAGS);
  if (deduped.length > 0) return deduped;
  return extractKeywords(fallbackText).slice(0, 5);
}

function sanitizeStance(raw: unknown): string {
  if (typeof raw !== "string") return "observational";
  const cleaned = raw.trim().slice(0, 40);
  return cleaned || "observational";
}

/**
 * Builds the "why chosen over alternatives considered" half of the
 * rationale directly from the judge's structured output, not from the
 * model. The model doesn't reliably know what else was discovered this
 * cycle, and inventing plausible-sounding alternatives would be exactly
 * the kind of unverifiable claim the editorial log is meant to prevent.
 */
export function buildAlternativesSummary(alternatives: JudgedCandidate[]): string {
  if (alternatives.length === 0) {
    return "No other candidates cleared this cycle's discovery pass.";
  }
  const outranked = alternatives.filter((a) => a.category === "outranked");
  const parts: string[] = [];
  if (outranked.length > 0) {
    const list = outranked
      .slice(0, 3)
      .map((a) => `"${a.verdict.candidate.title}" (${a.verdict.weightedTotal}/10)`)
      .join(", ");
    parts.push(
      `${outranked.length} other candidate${outranked.length === 1 ? "" : "s"} also cleared the editorial bar this cycle — ${list}${
        outranked.length > 3 ? ", among others" : ""
      } — but scored lower.`,
    );
  }
  const rejectedCount = alternatives.length - outranked.length;
  if (rejectedCount > 0) {
    parts.push(
      `${rejectedCount} more candidate${rejectedCount === 1 ? "" : "s"} were discovered and rejected outright (off-domain, too similar to prior coverage, or short on technical substance) — see the editorial log.`,
    );
  }
  return parts.join(" ");
}

/**
 * Deterministic, not LLM-generated — same reasoning as
 * buildAlternativesSummary: the actual scoring rubric's numbers are real
 * structured data, so state them directly rather than asking the model
 * to paraphrase (and possibly misreport) its own score.
 */
export function buildScoreBreakdown(scores: EditorialCriteriaScores, weightedTotal: number): string {
  return (
    `Scored ${weightedTotal}/10 this cycle — relevance ${scores.relevance}/10, substance ${scores.substance}/10, ` +
    `timeliness ${scores.timeliness}/10, novelty ${scores.novelty}/10, source credibility ${scores.credibility}/10, ` +
    `cross-source corroboration ${scores.corroboration}/10.`
  );
}

/** Separate from the score breakdown (a number alone doesn't say who) —
 * names the actual other sources when corroboration was detected. */
function buildCorroborationNote(sources: DiscoveredCandidate["source"][]): string {
  if (sources.length === 0) return "";
  return `Independently corroborated by ${sources.join(" and ")} this cycle.`;
}

function buildContinuityNote(related: RelatedPastPost | null): string {
  if (!related) return "";
  return `Related to earlier coverage of ${related.label} (shared: ${related.sharedTerms.slice(0, 4).join(", ") || "overlapping themes"}) — treated as a continuation, not a repeat.`;
}

function buildHeldOverNote(heldOverSince: Date | null): string {
  if (!heldOverSince) return "";
  const date = heldOverSince.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `This topic was passed over on ${date} for a stronger story that cycle — nothing outranked it this time.`;
}

/** Discovery summaries are hard-truncated and can end mid-sentence; trim
 * back to the last full sentence (or add a period) so mock post text
 * doesn't visibly run two unrelated sentences together. */
function closeSentence(summary: string): string {
  const trimmed = summary.trim();
  if (/[.!?]$/.test(trimmed)) return trimmed;
  const lastEnd = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("!"), trimmed.lastIndexOf("?"));
  if (lastEnd > trimmed.length * 0.5) return trimmed.slice(0, lastEnd + 1);
  return `${trimmed}.`;
}

function buildMockPost(input: GenerationInput): GeneratedPost {
  const candidate = input.winningCandidate;
  const tags = extractKeywords(`${candidate.title} ${candidate.summary}`).slice(0, 5);
  const continuity = input.relatedPastPost
    ? ` This follows up on earlier coverage of ${input.relatedPastPost.label}.`
    : "";
  const text = [
    `${candidate.title} reads well as a headline and is worth a closer look at what actually holds up.`,
    closeSentence(candidate.summary) + continuity,
    "The real test is what happens outside the benchmark conditions — production traffic, partial failures, and the long tail of inputs nobody profiled for. Worth revisiting once real deployment numbers exist.",
  ].join(" ");
  return {
    text,
    rationale: [
      "[MOCK_MODE] No GROQ_API_KEY is configured, so this text and rationale are template-generated, not model-generated. Set GROQ_API_KEY and MOCK_MODE=false to see real generation — see README.md.",
      buildScoreBreakdown(input.scores, input.weightedTotal),
      buildContinuityNote(input.relatedPastPost),
      buildCorroborationNote(input.corroboratingSources),
      buildHeldOverNote(input.heldOverSince),
      buildAlternativesSummary(input.alternatives),
    ]
      .filter(Boolean)
      .join(" "),
    topicTags: tags,
    stance: "observational",
  };
}

interface Draft {
  text: string;
  whySelected: string;
  topicTags: string[];
  stance: string;
}

async function generateDraft(
  client: Groq,
  input: GenerationInput,
  revision?: { previousText: string; feedback: string },
): Promise<Draft> {
  const systemPrompt = [
    `You are ${input.persona.name}, an AI persona with this voice: ${input.persona.styleGuide}`,
    `Editorial standards: ${input.persona.editorialStandards}`,
    "You are writing a short post (150-260 words) about ONE specific news item, paper, or repo — not a generic field overview.",
    `Write in first person as ${input.persona.name}. Be concrete: cite the actual claim, number, or mechanism from the source material rather than vague generalities.`,
    'Output strict JSON only, no markdown code fences, matching exactly: {"text": string, "whySelected": string, "topicTags": string[], "stance": string}',
    '"text": the post body itself.',
    '"whySelected": 2-3 sentences, same voice, on why this specific topic is worth covering right now — editorial reasoning, not a restatement of the post.',
    '"topicTags": 3-6 short lowercase tags (1-3 words each) naming the specific entities/techniques covered (model names, companies, methods) — not generic tags like "ai" or "technology".',
    '"stance": your genuine editorial opinion on this specific topic, 2-4 words (e.g. "cautiously optimistic", "skeptical of the claims", "impressed but wary of scale"). Not neutral filler — take an actual position consistent with your editorial standards.',
  ].join("\n");

  const userPromptLines = [
    `Source: ${input.winningCandidate.source}`,
    `Title: ${input.winningCandidate.title}`,
    `Summary: ${input.winningCandidate.summary}`,
    `URL: ${input.winningCandidate.url}`,
    `This cycle's editorial score: ${input.weightedTotal}/10`,
  ];
  if (input.relatedPastPost) {
    userPromptLines.push(
      `You've previously covered something related: ${input.relatedPastPost.label} (shared themes: ${input.relatedPastPost.sharedTerms.slice(0, 4).join(", ")}). If it fits naturally, briefly reference that earlier coverage as continuity (e.g. "Following up on..."). Don't force it if it doesn't read naturally.`,
    );
  }
  if (input.corroboratingSources.length > 0) {
    userPromptLines.push(
      `This story was independently corroborated by ${input.corroboratingSources.join(" and ")} this cycle — not just one source's claim. If it fits naturally, you can note that multiple sources are covering this. Don't force it.`,
    );
  }
  if (input.heldOverSince) {
    userPromptLines.push(
      `You considered this exact story before (on ${input.heldOverSince.toDateString()}) but a stronger story won that cycle instead. Nothing outranked it this time. If it fits naturally, you can briefly acknowledge you're circling back to it. Don't force it.`,
    );
  }
  if (revision) {
    userPromptLines.push(
      "",
      "Your previous draft needs revision. An editor reviewed it and said:",
      revision.feedback,
      "",
      `Previous draft: ${revision.previousText}`,
      "",
      "Write an improved version addressing that feedback. Same JSON output format.",
    );
  }

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPromptLines.join("\n") },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 900,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Groq response had no message content");
  }

  let parsed: { text?: unknown; whySelected?: unknown; topicTags?: unknown; stance?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Groq response was not valid JSON");
  }

  if (typeof parsed.text !== "string" || !parsed.text.trim()) {
    throw new Error("Groq response missing a usable 'text' field");
  }

  const whySelected =
    typeof parsed.whySelected === "string" && parsed.whySelected.trim()
      ? parsed.whySelected.trim()
      : `Selected for its relevance to production AI reliability and a ${input.weightedTotal}/10 editorial score this cycle.`;

  return {
    text: parsed.text.trim(),
    whySelected,
    topicTags: sanitizeTags(parsed.topicTags, `${input.winningCandidate.title} ${input.winningCandidate.summary}`),
    stance: sanitizeStance(parsed.stance),
  };
}

interface Critique {
  approved: boolean;
  score: number;
  feedback: string;
}

/**
 * A second, separate Groq call reviewing the draft against the persona's
 * own standards — framed as an independent editor, not the writer
 * grading its own work in the same breath. This is the "quality of
 * editorial decision-making" applied to the *output*, not just the
 * topic: judgment doesn't stop once a topic clears the pre-generation
 * bar, a genuinely bad draft of a good topic should still get caught.
 */
async function critiqueDraft(client: Groq, persona: PersonaVoice, draftText: string): Promise<Critique> {
  const systemPrompt = [
    `You are ${persona.name}'s editor — not the writer. Review drafts critically against her own standards; don't rubber-stamp.`,
    `${persona.name}'s voice: ${persona.styleGuide}`,
    `Editorial standards: ${persona.editorialStandards}`,
    `Score the draft 0-10 on how well it embodies that voice and those standards: specific and evidence-based (not generic), skeptical of unearned hype, genuinely opinionated rather than a neutral summary, and free of filler.`,
    'Output strict JSON only: {"approved": boolean, "score": number, "feedback": string}',
    `"approved" must be true only if score >= ${CRITIQUE_APPROVAL_THRESHOLD}.`,
    '"feedback": if not approved, 1-2 concrete sentences on what specifically to fix. If approved, a brief note on what works.',
  ].join("\n");

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Draft:\n\n${draftText}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 300,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Groq critique response had no message content");
  }

  let parsed: { approved?: unknown; score?: unknown; feedback?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Groq critique response was not valid JSON");
  }

  const score = typeof parsed.score === "number" ? parsed.score : 0;
  return {
    approved: parsed.approved === true && score >= CRITIQUE_APPROVAL_THRESHOLD,
    score,
    feedback: typeof parsed.feedback === "string" ? parsed.feedback : "No feedback returned.",
  };
}

/**
 * Real-mode failures (Groq unreachable, malformed response, timeout, or
 * a draft that still fails self-critique after one revision) are thrown
 * rather than silently falling back to a mock post. A runtime failure
 * should behave like "nothing passed this cycle" — which the cycle
 * route already treats as valid, expected editorial behavior — not
 * quietly publish template content that looks like a real generated
 * post but isn't labeled as one.
 */
export async function generatePost(input: GenerationInput): Promise<GeneratedPost> {
  if (isMockMode()) {
    logger.info("generation running in MOCK_MODE", {
      reason: process.env.GROQ_API_KEY ? "MOCK_MODE=true" : "no GROQ_API_KEY set",
    });
    return buildMockPost(input);
  }

  const client = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: REQUEST_TIMEOUT_MS });

  let draft = await generateDraft(client, input);
  let critique = await critiqueDraft(client, input.persona, draft.text);

  if (!critique.approved) {
    logger.info("draft failed self-critique, revising once", {
      score: critique.score,
      feedback: critique.feedback,
    });
    draft = await generateDraft(client, input, { previousText: draft.text, feedback: critique.feedback });
    critique = await critiqueDraft(client, input.persona, draft.text);
    if (!critique.approved) {
      throw new Error(
        `Draft failed self-critique twice (score ${critique.score}/10): ${critique.feedback}`,
      );
    }
  }

  const rationale = [
    draft.whySelected,
    buildScoreBreakdown(input.scores, input.weightedTotal),
    buildContinuityNote(input.relatedPastPost),
    buildCorroborationNote(input.corroboratingSources),
    buildHeldOverNote(input.heldOverSince),
    buildAlternativesSummary(input.alternatives),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    text: draft.text,
    rationale,
    topicTags: draft.topicTags,
    stance: draft.stance,
  };
}
