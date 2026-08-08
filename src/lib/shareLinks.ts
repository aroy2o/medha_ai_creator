/**
 * X's compose intent (and most quote-style shares) work off a ~280 char budget shared
 * between text and the appended link; leaving a fixed margin for the link keeps the tweet
 * from being silently truncated by the platform itself.
 */
const SHARE_TEXT_MAX = 240;

export function truncateForShare(text: string, max: number = SHARE_TEXT_MAX): string {
  const collapsed = text.trim();
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const boundary = lastSpace > max * 0.6 ? lastSpace : cut.length;
  return `${cut.slice(0, boundary).trimEnd()}…`;
}

export interface ShareLinks {
  x: string;
  linkedin: string;
  whatsapp: string;
}

/**
 * LinkedIn's share-offsite endpoint dropped support for pre-filled text years ago — it only
 * accepts `url` and pulls the page's own OG tags, so `text` is unused there by design, not
 * an oversight.
 */
export function buildShareLinks(text: string, url: string): ShareLinks {
  const shareText = truncateForShare(text);
  return {
    x: `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`,
  };
}

/** Threads has no public web-compose intent, so the best one-click affordance is clipboard text. */
export function buildThreadsClipboardText(text: string, url: string): string {
  return `${text}\n\n${url}`;
}

/**
 * LinkedIn's share dialog can't be prefilled (see buildShareLinks), so the practical fix is the
 * same clipboard fallback as Threads — except the url is deliberately left out here: LinkedIn
 * already attaches it as a preview card pulled from the page's own OG tags, so appending it again
 * would duplicate the link in the pasted text.
 */
export function buildLinkedInClipboardText(text: string): string {
  return text;
}
