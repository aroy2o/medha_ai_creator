import { describe, expect, it } from "vitest";
import { extractKeywords } from "./keywords";
import { buildMemoryIndex, scoreNovelty, NOVELTY_REJECT_THRESHOLD, type MemoryPost } from "./memory";

const pastPosts: MemoryPost[] = [
  {
    id: "post-1",
    text:
      "DeepSeek-V4 Flash shipped this week with a smaller footprint and faster inference. " +
      "Early benchmarks show roughly a 30% latency improvement over V3, though throughput " +
      "under concurrent load still lags GPT-4-class models when batch size climbs past 16.",
    topicTags: ["deepseek-v4", "inference latency", "benchmarks"],
  },
  {
    id: "post-2",
    text:
      "A Kubernetes autoscaling misconfiguration caused GPU inference pods to flap during a " +
      "traffic spike last week, producing a 20-minute partial outage. The root cause was a " +
      "readiness probe that didn't account for model warm-up time.",
    topicTags: ["kubernetes", "autoscaling", "outage", "gpu"],
  },
];

describe("scoreNovelty", () => {
  it("flags a near-duplicate of an existing post as above the reject threshold", () => {
    // Same underlying story as post-1 (same model, same benchmark claim,
    // same comparison), different phrasing.
    const candidateText =
      "DeepSeek-V4 Flash inference benchmarks show a roughly 30% latency improvement " +
      "over V3, though throughput still trails GPT-4-class models under concurrent load.";
    const memory = buildMemoryIndex(pastPosts);
    const result = scoreNovelty(new Set(extractKeywords(candidateText)), memory);

    expect(result.mostSimilar?.postId).toBe("post-1");
    expect(result.score).toBeGreaterThanOrEqual(NOVELTY_REJECT_THRESHOLD);
  });

  it("does not flag a same-domain but substantively different topic", () => {
    // Same broad domain (production inference) as post-1, but a distinct
    // specific topic (speculative decoding technique, not the DeepSeek
    // release) and shares no named entities with either past post.
    const candidateText =
      "A new paper proposes speculative decoding with a smaller draft model to cut " +
      "LLM response latency without hurting output accuracy on reasoning benchmarks.";
    const memory = buildMemoryIndex(pastPosts);
    const result = scoreNovelty(new Set(extractKeywords(candidateText)), memory);

    expect(result.score).toBeLessThan(NOVELTY_REJECT_THRESHOLD);
  });

  it("does not flag a topic unrelated to any past post", () => {
    const candidateText =
      "Reddit discussion thread comparing vector database options for retrieval-augmented generation pipelines.";
    const memory = buildMemoryIndex(pastPosts);
    const result = scoreNovelty(new Set(extractKeywords(candidateText)), memory);

    expect(result.score).toBeLessThan(NOVELTY_REJECT_THRESHOLD);
  });

  it("returns a zero-score, null-match result against empty memory", () => {
    const result = scoreNovelty(new Set(["gpu", "latency"]), []);
    expect(result.score).toBe(0);
    expect(result.mostSimilar).toBeNull();
  });
});
