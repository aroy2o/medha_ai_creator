export interface DiscoveredCandidate {
  /** Short, human-readable title for the item. */
  title: string;
  /** A few sentences of context — description, abstract, or excerpt. */
  summary: string;
  url: string;
  source: "Hacker News" | "arXiv" | "GitHub Trending" | "Reddit r/MachineLearning";
  /** ISO 8601 UTC, when known. */
  publishedAt: string | null;
}

export interface DiscoveryResult {
  source: DiscoveredCandidate["source"];
  candidates: DiscoveredCandidate[];
  error: string | null;
}
