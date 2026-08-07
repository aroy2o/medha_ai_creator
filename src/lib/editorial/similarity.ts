/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|. Simple, deterministic, and easy
 * to reason about — the build brief explicitly says this is an acceptable
 * substitute for embeddings given the time budget.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of a) {
    if (b.has(token)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  if (unionSize === 0) return 0;

  return intersectionSize / unionSize;
}

export function sharedTerms(a: Set<string>, b: Set<string>): string[] {
  const shared: string[] = [];
  for (const token of a) {
    if (b.has(token)) shared.push(token);
  }
  return shared;
}
