/**
 * A real, dated record of how Medha's editorial standards have actually
 * changed — not a designed feature pretending to have history, but this
 * project's real git history, restated here for readers who won't go dig
 * through commit messages. Every entry below corresponds to a real
 * commit; see PROMPTS.md and README.md's "Decisions" section for the
 * full account of each.
 *
 * Deliberately a static, hand-maintained list rather than something
 * derived at runtime from git log or the database: this is genuinely
 * rare, structural data (editorial *rules* changing, not editorial
 * *output*), and a serverless deployment doesn't have repo access at
 * request time anyway. Add a new entry by hand when a rule changes.
 */
export interface ConstitutionEntry {
  date: string;
  title: string;
  description: string;
}

export const EDITORIAL_CONSTITUTION: ConstitutionEntry[] = [
  {
    date: "2026-08-08",
    title: "Initial standards",
    description:
      "Five weighted criteria — relevance (30%), technical substance vs. hype (25%), timeliness (15%), " +
      "novelty against memory (20%), source credibility (10%) — with a 6.0/10 publish bar. Novelty was " +
      "gated at 0.2 Jaccard keyword overlap against past posts, tuned against hand-written test text.",
  },
  {
    date: "2026-08-08",
    title: "Novelty threshold lowered after a near-miss",
    description:
      "Live testing found the novelty gate almost let a duplicate through: the actual runtime comparison " +
      "is a new candidate against a *published post*, and a published post is this persona's own " +
      "paraphrase of the original story — which measures lower overlap than comparing two raw candidates, " +
      "even for a literal repeat. The same arXiv paper, fed back one cycle after publishing about it, " +
      "scored only 0.111 against the original 0.2 gate. Fixed two ways: memory leans more on topicTags " +
      "and less on generated body text, and topicTags are now enriched with a few keywords from the " +
      "original candidate's title at save time. The gate itself moved to 0.15.",
  },
  {
    date: "2026-08-09",
    title: "Memory extended from preventing repeats to enabling continuity",
    description:
      "A candidate landing between 0.05 and the 0.15 reject gate isn't a duplicate — it's genuinely " +
      "related to something already covered. That's not a reason to reject it, it's a reason to let a " +
      "new post explicitly build on the earlier one instead of writing as if prior coverage never " +
      "happened.",
  },
  {
    date: "2026-08-09",
    title: "Editorial judgment extended to output, not just topic selection",
    description:
      "Clearing the pre-generation bar no longer guarantees publication. A second, independent model " +
      "call now reviews each draft against these same standards — as an editor reviewing someone else's " +
      "work, not the writer grading its own — before anything goes out. A draft scoring below 7/10 gets " +
      "one revision with specific feedback; if it still doesn't clear the bar, nothing publishes that " +
      "cycle, same as when no topic clears the bar at all.",
  },
  {
    date: "2026-08-09",
    title: "Cross-source corroboration added as a sixth criterion",
    description:
      "Multiple independent sources covering the same story is real editorial signal that nothing " +
      "previously captured — each candidate was scored in isolation. Weights rebalanced to relevance " +
      "25%, substance 20%, timeliness 15%, novelty 15%, credibility 10%, corroboration 15%. The overlap " +
      "threshold for \"same story\" was set conservatively: measurements showed a terse, title-only " +
      "match for a genuine same-day story (0.125) sitting too close to two candidates that merely share " +
      "a domain without being the same story (0.10) to separate cleanly, so the threshold (0.2) accepts " +
      "missing some real corroboration rather than risk false claims of it.",
  },
  {
    date: "2026-08-09",
    title: "Held-over topics can be reconsidered",
    description:
      "A topic that lost to a stronger story in a past cycle was, until now, gone for good — logged and " +
      "forgotten regardless of how good it was. It can now win a later cycle if nothing outranks it that " +
      "time, with the published rationale saying plainly that it was passed over before.",
  },
];
