import { describe, expect, it } from "vitest";
import { buildMemoryGraph } from "./memoryGraph";

describe("buildMemoryGraph", () => {
  it("produces one node per post", () => {
    const graph = buildMemoryGraph(
      [
        { id: "a", text: "post a", topicTags: ["gpu"] },
        { id: "b", text: "post b", topicTags: ["latency"] },
      ],
      600,
      600,
    );
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("places all nodes within the given bounds", () => {
    const graph = buildMemoryGraph(
      Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, text: `post ${i}`, topicTags: ["x"] })),
      600,
      600,
    );
    for (const node of graph.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(600);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(600);
    }
  });

  it("creates an edge between two posts that share a tag", () => {
    const graph = buildMemoryGraph(
      [
        { id: "a", text: "post a", topicTags: ["gpu", "latency"] },
        { id: "b", text: "post b", topicTags: ["latency", "cost"] },
      ],
      600,
      600,
    );
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].sharedTags).toEqual(["latency"]);
  });

  it("creates no edge between posts with no shared tags", () => {
    const graph = buildMemoryGraph(
      [
        { id: "a", text: "post a", topicTags: ["gpu"] },
        { id: "b", text: "post b", topicTags: ["reddit"] },
      ],
      600,
      600,
    );
    expect(graph.edges).toHaveLength(0);
  });

  it("matches tags case-insensitively", () => {
    const graph = buildMemoryGraph(
      [
        { id: "a", text: "post a", topicTags: ["GPU"] },
        { id: "b", text: "post b", topicTags: ["gpu"] },
      ],
      600,
      600,
    );
    expect(graph.edges).toHaveLength(1);
  });

  it("never produces a self-edge", () => {
    const graph = buildMemoryGraph(
      [{ id: "a", text: "post a", topicTags: ["gpu"] }],
      600,
      600,
    );
    expect(graph.edges).toHaveLength(0);
  });

  it("handles zero posts without throwing", () => {
    expect(() => buildMemoryGraph([], 600, 600)).not.toThrow();
    expect(buildMemoryGraph([], 600, 600)).toEqual({ nodes: [], edges: [] });
  });
});
