import Groq from "groq-sdk";
import { logger } from "@/lib/logger";
import { extractKeywords } from "@/lib/editorial/keywords";
import type { DiscoveredCandidate } from "@/lib/discovery/types";
import type { JudgedCandidate } from "@/lib/editorial/judge";

export interface PersonaVoice {
  name: string;
  styleGuide: string;
  editorialStandards: string;
}

export interface GenerationInput {
  persona: PersonaVoice;
  winningCandidate: DiscoveredCandidate;
  weightedTotal: number;
  /** Every other candidate considered this cycle, for an accurate rationale. */
  alternatives: JudgedCandidate[];
}

export interface GeneratedPost {
  text: string;
  rationale: string;
  topicTags: string[];
}

const MODEL = "llama-3.3-70b-versatile";
const MAX_TAGS = 6;
const REQUEST_TIMEOUT_MS = 20_000;

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

function buildMockPost(candidate: DiscoveredCandidate): GeneratedPost {
  const tags = extractKeywords(`${candidate.title} ${candidate.summary}`).slice(0, 5);
  const text = [
    `${candidate.title} reads well as a headline and is worth a closer look at what actually holds up.`,
    closeSentence(candidate.summary),
    "The real test is what happens outside the benchmark conditions — production traffic, partial failures, and the long tail of inputs nobody profiled for. Worth revisiting once real deployment numbers exist.",
  ].join(" ");
  return {
    text,
    rationale:
      "[MOCK_MODE] No GROQ_API_KEY is configured, so this text and rationale are template-generated, not model-generated. Set GROQ_API_KEY and MOCK_MODE=false to see real generation — see README.md.",
    topicTags: tags,
  };
}

/**
 * Real-mode failures (Groq unreachable, malformed response, timeout) are
 * thrown rather than silently falling back to a mock post. A runtime
 * failure should behave like "nothing passed this cycle" — which the
 * cycle route already treats as valid, expected editorial behavior — not
 * quietly publish template content that looks like a real generated post
 * but isn't labeled as one.
 */
export async function generatePost(input: GenerationInput): Promise<GeneratedPost> {
  if (isMockMode()) {
    logger.info("generation running in MOCK_MODE", {
      reason: process.env.GROQ_API_KEY ? "MOCK_MODE=true" : "no GROQ_API_KEY set",
    });
    return buildMockPost(input.winningCandidate);
  }

  const client = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: REQUEST_TIMEOUT_MS });
  const alternativesSummary = buildAlternativesSummary(input.alternatives);

  const systemPrompt = [
    `You are ${input.persona.name}, an AI persona with this voice: ${input.persona.styleGuide}`,
    `Editorial standards: ${input.persona.editorialStandards}`,
    "You are writing a short post (150-260 words) about ONE specific news item, paper, or repo — not a generic field overview.",
    `Write in first person as ${input.persona.name}. Be concrete: cite the actual claim, number, or mechanism from the source material rather than vague generalities.`,
    'Output strict JSON only, no markdown code fences, matching exactly: {"text": string, "whySelected": string, "topicTags": string[]}',
    '"text": the post body itself.',
    '"whySelected": 2-3 sentences, same voice, on why this specific topic is worth covering right now — editorial reasoning, not a restatement of the post.',
    '"topicTags": 3-6 short lowercase tags (1-3 words each) naming the specific entities/techniques covered (model names, companies, methods) — not generic tags like "ai" or "technology".',
  ].join("\n");

  const userPrompt = [
    `Source: ${input.winningCandidate.source}`,
    `Title: ${input.winningCandidate.title}`,
    `Summary: ${input.winningCandidate.summary}`,
    `URL: ${input.winningCandidate.url}`,
    `This cycle's editorial score: ${input.weightedTotal}/10`,
  ].join("\n");

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 900,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Groq response had no message content");
  }

  let parsed: { text?: unknown; whySelected?: unknown; topicTags?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Groq response was not valid JSON");
  }

  if (typeof parsed.text !== "string" || !parsed.text.trim()) {
    throw new Error("Groq response missing a usable 'text' field");
  }

  const topicTags = sanitizeTags(
    parsed.topicTags,
    `${input.winningCandidate.title} ${input.winningCandidate.summary}`,
  );
  const whySelected =
    typeof parsed.whySelected === "string" && parsed.whySelected.trim()
      ? parsed.whySelected.trim()
      : `Selected for its relevance to production AI reliability and a ${input.weightedTotal}/10 editorial score this cycle.`;

  return {
    text: parsed.text.trim(),
    rationale: `${whySelected} ${alternativesSummary}`.trim(),
    topicTags,
  };
}
