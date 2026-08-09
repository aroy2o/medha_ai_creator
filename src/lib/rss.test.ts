import { describe, expect, it } from "vitest";
import { buildRssFeed, type RssPost } from "./rss";

const channel = {
  siteUrl: "https://medha-ai.aroy2o.xyz",
  title: "Medha — Applied AI Systems Analyst",
  description: "An autonomous AI persona.",
};

function post(overrides: Partial<RssPost> = {}): RssPost {
  return {
    id: "abc123",
    text: "A short post about production AI reliability.",
    createdAt: new Date("2026-08-09T10:00:00.000Z"),
    ...overrides,
  };
}

describe("buildRssFeed", () => {
  it("produces valid, parseable XML with the channel metadata", () => {
    const xml = buildRssFeed([], channel);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<title>Medha — Applied AI Systems Analyst</title>");
    expect(xml).toContain("<link>https://medha-ai.aroy2o.xyz</link>");
    expect(xml).toContain("<description>An autonomous AI persona.</description>");
  });

  it("falls back to the current time for lastBuildDate when there are no posts", () => {
    const xml = buildRssFeed([], channel);
    expect(xml).toMatch(/<lastBuildDate>.+<\/lastBuildDate>/);
  });

  it("emits one item per post, linking to the post's permalink page", () => {
    const xml = buildRssFeed([post({ id: "one" }), post({ id: "two" })], channel);
    expect(xml).toContain("<link>https://medha-ai.aroy2o.xyz/feed/one</link>");
    expect(xml).toContain("<link>https://medha-ai.aroy2o.xyz/feed/two</link>");
    expect(xml.match(/<item>/g)).toHaveLength(2);
  });

  it("uses the post's own createdAt for pubDate, in RFC 822 form", () => {
    const xml = buildRssFeed([post({ createdAt: new Date("2026-01-15T08:30:00.000Z") })], channel);
    expect(xml).toContain(`<pubDate>${new Date("2026-01-15T08:30:00.000Z").toUTCString()}</pubDate>`);
  });

  it("escapes XML-significant characters in post text and channel fields", () => {
    const xml = buildRssFeed([post({ text: 'AI & "safety" <matters> a lot' })], channel);
    expect(xml).not.toContain('& "safety" <matters>');
    expect(xml).toContain("AI &amp; &quot;safety&quot; &lt;matters&gt; a lot");
  });

  it("truncates long post text into a shorter RSS item title but keeps the full text in description", () => {
    const longText = "word ".repeat(60).trim();
    const xml = buildRssFeed([post({ text: longText })], channel);
    const titleMatch = xml.match(/<title>(.*?)<\/title>/g);
    // First <title> is the channel's; the item's title is the second one.
    const itemTitle = titleMatch?.[1] ?? "";
    expect(itemTitle.length).toBeLessThan(longText.length);
    expect(xml).toContain(`<description>${longText}</description>`);
  });

  it("produces a well-formed channel with zero items", () => {
    const xml = buildRssFeed([], channel);
    expect(xml).not.toContain("<item>");
    expect(xml.trim().startsWith("<?xml")).toBe(true);
    expect(xml.trim().endsWith("</rss>")).toBe(true);
  });
});
