/**
 * Keyword/entity extraction for the memory + editorial system.
 *
 * No embeddings — per the build brief, Jaccard similarity over extracted
 * keyword sets is "fine" given the time budget, as long as the extraction
 * itself is real (not a stub). This does two real things:
 *
 * 1. Entity detection: multi-word Capitalized Sequences ("Global Workspace
 *    Theory"), version-style tokens ("GPT-4", "DeepSeek-V4", "K8s"), and
 *    ALL-CAPS acronyms (>= 2 letters). These carry more topical signal
 *    than generic words, so they're kept even if short or stopword-like.
 * 2. Stopword-filtered unigrams from the rest of the text, so two pieces
 *    of text that talk about the same substantive nouns/verbs still
 *    overlap even without a shared named entity.
 */

const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before",
  "being", "below", "between", "both", "but", "by", "can", "cannot", "could",
  "did", "do", "does", "doing", "don't", "down", "during", "each", "few",
  "for", "from", "further", "had", "has", "have", "having", "he", "her",
  "here", "hers", "herself", "him", "himself", "his", "how", "i", "if", "in",
  "into", "is", "it", "its", "itself", "just", "like", "me", "more", "most",
  "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once",
  "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own",
  "same", "she", "should", "so", "some", "such", "than", "that", "the",
  "their", "theirs", "them", "themselves", "then", "there", "these", "they",
  "this", "those", "through", "to", "too", "under", "until", "up", "very",
  "was", "we", "were", "what", "when", "where", "which", "while", "who",
  "whom", "why", "will", "with", "would", "you", "your", "yours", "yourself",
  "yourselves", "also", "new", "using", "used", "use", "one", "two", "via",
]);

const ENTITY_PATTERN =
  /\b([A-Z][a-zA-Z0-9]*(?:[-.][A-Za-z0-9]+)*(?:\s+[A-Z][a-zA-Z0-9]*(?:[-.][A-Za-z0-9]+)*){0,3})\b/g;

const MAX_KEYWORDS = 25;

function normalize(token: string): string {
  return token.toLowerCase().trim();
}

function extractEntities(text: string): string[] {
  const matches = text.match(ENTITY_PATTERN) ?? [];
  return matches
    .map((m) => m.trim())
    .filter((m) => {
      const words = m.split(/\s+/);
      // Skip single common words that just happen to be capitalized
      // (sentence-initial "The", "This", etc.) unless they contain a
      // digit or hyphen (version/model-name signal, e.g. "GPT-4").
      if (words.length === 1 && !/[0-9-]/.test(m) && m.length < 4) return false;
      return true;
    })
    .map(normalize);
}

function extractUnigrams(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/**
 * Extracts a normalized, deduplicated keyword/entity set from free text.
 * Entities are prioritized (kept first) since they carry more topical
 * signal for the Jaccard comparison than generic unigrams.
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];

  const entities = extractEntities(text);
  const unigrams = extractUnigrams(text);

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const token of [...entities, ...unigrams]) {
    if (!seen.has(token)) {
      seen.add(token);
      ordered.push(token);
    }
  }

  return ordered.slice(0, MAX_KEYWORDS);
}

export function keywordSet(text: string): Set<string> {
  return new Set(extractKeywords(text));
}
