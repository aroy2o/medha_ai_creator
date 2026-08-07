export type RejectionTone = "dedup" | "off-domain" | "below-bar" | "outranked" | "generation-failed" | "other";

/**
 * Pattern-matches the human-readable reason strings judge.ts and the
 * cycle route produce, to derive a short badge label without needing a
 * separate stored category column. Kept in sync by hand with the reason
 * formats in lib/editorial/judge.ts and app/api/agent/cycle/route.ts —
 * if those change, update the patterns here too.
 */
export function categorizeRejectionReason(reason: string): { label: string; tone: RejectionTone } {
  if (/^too similar to an existing post/i.test(reason)) {
    return { label: "Too similar to a past post", tone: "dedup" };
  }
  if (/^no detected connection to/i.test(reason)) {
    return { label: "Off-domain", tone: "off-domain" };
  }
  if (/generation failed/i.test(reason)) {
    return { label: "Generation failed", tone: "generation-failed" };
  }
  if (/^scored .* below the/i.test(reason)) {
    return { label: "Below editorial bar", tone: "below-bar" };
  }
  if (/^cleared the editorial bar/i.test(reason)) {
    return { label: "Outranked this cycle", tone: "outranked" };
  }
  return { label: "Rejected", tone: "other" };
}
