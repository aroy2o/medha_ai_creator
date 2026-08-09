import { truncateForShare } from "@/lib/shareLinks";

const TITLE_MAX = 90;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface RssPost {
  id: string;
  text: string;
  createdAt: Date;
}

export interface RssChannel {
  /** Origin only, no trailing slash (e.g. "https://medha-ai.aroy2o.xyz"). */
  siteUrl: string;
  title: string;
  description: string;
}

function buildItem(post: RssPost, siteUrl: string): string {
  const link = `${siteUrl}/feed/${post.id}`;
  const title = truncateForShare(post.text, TITLE_MAX);
  return [
    "    <item>",
    `      <title>${escapeXml(title)}</title>`,
    `      <link>${escapeXml(link)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
    `      <pubDate>${post.createdAt.toUTCString()}</pubDate>`,
    `      <description>${escapeXml(post.text)}</description>`,
    "    </item>",
  ].join("\n");
}

/** RSS 2.0, newest first (callers are expected to have already sorted `posts` that way). */
export function buildRssFeed(posts: RssPost[], channel: RssChannel): string {
  const lastBuildDate = (posts[0]?.createdAt ?? new Date()).toUTCString();
  const items = posts.map((post) => buildItem(post, channel.siteUrl)).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.siteUrl)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    "    <language>en-us</language>",
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    items,
    "  </channel>",
    "</rss>",
  ]
    .filter(Boolean)
    .join("\n");
}
