export interface MemoryGraphPost {
  id: string;
  text: string;
  topicTags: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  topicTags: string[];
  x: number;
  y: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  sharedTags: string[];
}

export interface MemoryGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Deterministic circular layout — no force simulation needed (and no
 * extra dependency for one). Nodes placed evenly around a circle; edges
 * drawn between any two posts that share at least one topicTag. Simple
 * and correct beats fancy and broken for a hand-rolled graph.
 */
export function buildMemoryGraph(posts: MemoryGraphPost[], width: number, height: number): MemoryGraph {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - Math.min(width, height) * 0.12;
  const n = posts.length;

  const nodes: GraphNode[] = posts.map((post, i) => {
    const angle = n > 0 ? (2 * Math.PI * i) / n - Math.PI / 2 : 0;
    return {
      id: post.id,
      label: post.topicTags[0] ?? post.text.slice(0, 24),
      topicTags: post.topicTags,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  const edges: GraphEdge[] = [];
  for (let i = 0; i < posts.length; i++) {
    const tagsA = new Set(posts[i].topicTags.map((t) => t.toLowerCase().trim()));
    for (let j = i + 1; j < posts.length; j++) {
      const tagsB = new Set(posts[j].topicTags.map((t) => t.toLowerCase().trim()));
      const shared = [...tagsA].filter((t) => tagsB.has(t));
      if (shared.length > 0) {
        edges.push({ source: posts[i].id, target: posts[j].id, sharedTags: shared });
      }
    }
  }

  return { nodes, edges };
}
