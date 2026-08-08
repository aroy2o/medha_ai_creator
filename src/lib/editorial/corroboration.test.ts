import { describe, expect, it } from "vitest";
import { extractKeywords } from "./keywords";
import { scoreCorroboration, CORROBORATION_MIN_OVERLAP, type CandidateWithKeywords } from "./corroboration";
import type { DiscoveredCandidate } from "@/lib/discovery/types";

function withKeywords(candidate: DiscoveredCandidate): CandidateWithKeywords {
  return { candidate, keywords: new Set(extractKeywords(`${candidate.title} ${candidate.summary}`)) };
}

function candidate(overrides: Partial<DiscoveredCandidate>): DiscoveredCandidate {
  return {
    title: "untitled",
    summary: "",
    url: "https://example.com",
    source: "Hacker News",
    publishedAt: null,
    ...overrides,
  };
}

describe("scoreCorroboration", () => {
  it("counts an independent second source with real content covering the same release", () => {
    // Two sources that both carry substantive text (not a bare link
    // title) about the literal same release — measured 0.34 overlap,
    // comfortably above the threshold.
    const commentary = withKeywords(
      candidate({
        title: "Notes on DeepSeek-V4 Flash",
        summary:
          "I tried DeepSeek-V4 Flash today and the inference latency improvement over V3 is real — " +
          "about 30% faster on my benchmarks, though throughput under concurrent load still lags " +
          "GPT-4-class models.",
        source: "Simon Willison",
      }),
    );
    const releaseNotes = withKeywords(
      candidate({
        title: "DeepSeek-V4 Flash release notes",
        summary:
          "DeepSeek released V4 Flash this week, claiming a 30% inference latency improvement over V3 " +
          "based on internal benchmarks, though third parties have not yet confirmed throughput claims " +
          "under concurrent load.",
        source: "OpenAI Blog",
      }),
    );
    const result = scoreCorroboration(commentary, [commentary, releaseNotes]);
    expect(result.count).toBe(1);
    expect(result.fromSources).toEqual(["OpenAI Blog"]);
  });

  it("does not count a same-domain but substantively different story", () => {
    // Measured 0.10 overlap — both about "production inference" broadly,
    // neither the same specific story. Below CORROBORATION_MIN_OVERLAP.
    const sameStory = withKeywords(
      candidate({
        title: "DeepSeek-V4 Flash shipped this week",
        summary: "A smaller footprint and faster inference, roughly 30% latency improvement over V3.",
        source: "Hacker News",
      }),
    );
    const differentStory = withKeywords(
      candidate({
        title: "New paper proposes speculative decoding to cut LLM latency",
        summary: "A smaller draft model speeds up response generation without hurting accuracy.",
        source: "arXiv",
      }),
    );
    const result = scoreCorroboration(sameStory, [sameStory, differentStory]);
    expect(result.count).toBe(0);
  });

  it(
    "known, accepted limitation: a terse title-only source (no body text) matched against a " +
      "fuller source for the *same* story can fall short of the threshold",
    () => {
      // Measured 0.125 — real overlap (shared entities), but below the
      // 0.2 threshold. Documented tradeoff in corroboration.ts: raising
      // sensitivity to catch this would also start matching same-domain
      // -different-story pairs (measured 0.10, too close to 0.125 to
      // separate cleanly), and false corroboration claims are worse than
      // missed ones for this persona. This test exists so a future
      // change to the threshold has to consciously decide to accept that
      // tradeoff differently, not accidentally drift into it.
      const terseLinkPost = withKeywords(
        candidate({
          title: "DeepSeek-V4 Flash 0731",
          summary: "312 points, 89 comments on Hacker News.",
          source: "Hacker News",
        }),
      );
      const fullAbstract = withKeywords(
        candidate({
          title: "DeepSeek-V4: A Technical Report",
          summary:
            "We present DeepSeek-V4 Flash, a new large language model with a 30% inference latency " +
            "improvement over V3, evaluated across standard reasoning benchmarks.",
          source: "arXiv",
        }),
      );
      const result = scoreCorroboration(terseLinkPost, [terseLinkPost, fullAbstract]);
      expect(result.count).toBe(0);
    },
  );

  it("does not count the same source twice, or the candidate itself", () => {
    const target = withKeywords(candidate({ title: "Same story A", summary: "GPU inference cost analysis." }));
    const dupeSameSource = withKeywords(
      candidate({ title: "Same story A, reposted", summary: "GPU inference cost analysis.", source: "Hacker News" }),
    );
    const result = scoreCorroboration(target, [target, dupeSameSource]);
    expect(result.count).toBe(0);
    expect(result.fromSources).toEqual([]);
  });

  it("counts each corroborating source only once even with multiple matching items from it", () => {
    const target = withKeywords(
      candidate({
        title: "OrchestraBench multi-agent orchestration",
        summary: "Evaluates failure modes, recovery, and decomposition quality in multi-agent systems.",
        source: "Hacker News",
      }),
    );
    const arxiv1 = withKeywords(
      candidate({
        title: "OrchestraBench: Evaluating Multi-Agent Orchestration Failure Modes",
        summary:
          "Introduces cascade radius and per-failure-mode recovery metrics for multi-agent orchestration.",
        source: "arXiv",
      }),
    );
    const arxiv2 = withKeywords(
      candidate({
        title: "OrchestraBench follow-up: orchestration failure modes revisited",
        summary: "Extended analysis of multi-agent orchestration failure modes and recovery metrics.",
        source: "arXiv",
      }),
    );
    const result = scoreCorroboration(target, [target, arxiv1, arxiv2]);
    expect(result.count).toBe(1);
    expect(result.fromSources).toEqual(["arXiv"]);
  });

  it("returns zero for a candidate with no others", () => {
    const target = withKeywords(candidate({ title: "Solo story" }));
    expect(scoreCorroboration(target, [target]).count).toBe(0);
  });
});

describe("CORROBORATION_MIN_OVERLAP", () => {
  it("is documented as a 0-1 Jaccard threshold", () => {
    expect(CORROBORATION_MIN_OVERLAP).toBeGreaterThan(0);
    expect(CORROBORATION_MIN_OVERLAP).toBeLessThan(1);
  });
});
