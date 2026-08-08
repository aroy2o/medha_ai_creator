import { describe, expect, it } from "vitest";
import { buildLinkedInClipboardText, buildShareLinks, buildThreadsClipboardText, truncateForShare } from "./shareLinks";

describe("truncateForShare", () => {
  it("leaves short text untouched", () => {
    expect(truncateForShare("A short post.", 240)).toBe("A short post.");
  });

  it("trims surrounding whitespace even when under the limit", () => {
    expect(truncateForShare("  padded  ", 240)).toBe("padded");
  });

  it("truncates on a word boundary and appends an ellipsis", () => {
    const text = "word ".repeat(100).trim(); // 499 chars, well over the limit
    const result = truncateForShare(text, 50);
    expect(result.length).toBeLessThanOrEqual(51);
    expect(result.endsWith("…")).toBe(true);
    expect(result.endsWith(" …")).toBe(false); // boundary trim strips trailing space before the ellipsis
  });

  it("falls back to a hard cut when there's no reasonable word boundary", () => {
    const text = "a".repeat(300);
    const result = truncateForShare(text, 50);
    expect(result.length).toBe(50);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("buildShareLinks", () => {
  const url = "https://medha-ai.aroy2o.xyz/feed#post-abc123";

  it("builds an X intent with both text and url params", () => {
    const links = buildShareLinks("Hello world", url);
    expect(links.x).toContain("https://x.com/intent/tweet?");
    expect(links.x).toContain(encodeURIComponent("Hello world"));
    expect(links.x).toContain(encodeURIComponent(url));
  });

  it("builds a LinkedIn share-offsite link carrying only the url (LinkedIn ignores text params)", () => {
    const links = buildShareLinks("Hello world", url);
    expect(links.linkedin).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`);
  });

  it("builds a WhatsApp link with text and url concatenated", () => {
    const links = buildShareLinks("Hello world", url);
    expect(links.whatsapp).toContain(encodeURIComponent("Hello world"));
    expect(links.whatsapp).toContain(encodeURIComponent(url));
  });

  it("truncates long post text before embedding it in the X and WhatsApp links", () => {
    const longText = "word ".repeat(200).trim();
    const links = buildShareLinks(longText, url);
    expect(links.x).not.toContain(encodeURIComponent(longText));
  });
});

describe("buildThreadsClipboardText", () => {
  it("joins text and url with a blank line", () => {
    expect(buildThreadsClipboardText("Hello world", "https://example.com")).toBe(
      "Hello world\n\nhttps://example.com",
    );
  });
});

describe("buildLinkedInClipboardText", () => {
  it("returns the text unchanged, deliberately omitting the url", () => {
    // LinkedIn attaches the url itself as a preview card from OG tags — repeating it in the
    // pasted text would show the link twice.
    expect(buildLinkedInClipboardText("Hello world")).toBe("Hello world");
  });
});
