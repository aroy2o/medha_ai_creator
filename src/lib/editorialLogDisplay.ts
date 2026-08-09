export type RejectionTone = "dedup" | "off-domain" | "below-bar" | "outranked" | "generation-failed" | "other";

/** Single source of truth for tone labels — reused by callers that only have a tone, not a reason string (e.g. aggregate counts). */
export const TONE_LABELS: Record<RejectionTone, string> = {
  dedup: "Too similar to a past post",
  "off-domain": "Off-domain",
  "below-bar": "Below editorial bar",
  outranked: "Outranked this cycle",
  "generation-failed": "Generation failed",
  other: "Rejected",
};

/**
 * Pattern-matches the human-readable reason strings judge.ts and the
 * cycle route produce, to derive a short badge label without needing a
 * separate stored category column. Kept in sync by hand with the reason
 * formats in lib/editorial/judge.ts and app/api/agent/cycle/route.ts —
 * if those change, update the patterns here too.
 */
export function categorizeRejectionReason(reason: string): { label: string; tone: RejectionTone } {
  if (/^too similar to an existing post/i.test(reason)) {
    return { label: TONE_LABELS.dedup, tone: "dedup" };
  }
  if (/^no detected connection to/i.test(reason)) {
    return { label: TONE_LABELS["off-domain"], tone: "off-domain" };
  }
  if (/generation failed/i.test(reason)) {
    return { label: TONE_LABELS["generation-failed"], tone: "generation-failed" };
  }
  if (/^scored .* below the/i.test(reason)) {
    return { label: TONE_LABELS["below-bar"], tone: "below-bar" };
  }
  if (/^cleared the editorial bar/i.test(reason)) {
    return { label: TONE_LABELS.outranked, tone: "outranked" };
  }
  return { label: TONE_LABELS.other, tone: "other" };
}
