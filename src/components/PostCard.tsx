"use client";

import Link from "next/link";
import { ShareButtons } from "@/components/ShareButtons";
import { displayHost, formatPostDate } from "@/lib/postDisplay";
import type { FeedPost } from "@/store/slices/feedSlice";

/**
 * Shared between the feed list (`showPermalink` links the timestamp to this post's own page)
 * and that page itself (`showPermalink={false}` — linking a page to itself is pointless, and
 * `anchorId={false}` since the URL already identifies the post without a `#post-id` fragment).
 */
export function PostCard({
  post,
  showPermalink = true,
  anchorId = true,
}: {
  post: FeedPost;
  showPermalink?: boolean;
  anchorId?: boolean;
}) {
  return (
    <article
      id={anchorId ? `post-${post.id}` : undefined}
      className="rounded border border-neutral-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {showPermalink ? (
          <Link href={`/feed/${post.id}`} className="text-xs text-neutral-400 hover:text-neutral-600 hover:underline">
            <time dateTime={post.createdAt}>{formatPostDate(post.createdAt)}</time>
          </Link>
        ) : (
          <time dateTime={post.createdAt} className="text-xs text-neutral-400">
            {formatPostDate(post.createdAt)}
          </time>
        )}
        {post.stance && (
          <span className="shrink-0 rounded border border-neutral-200 px-2 py-0.5 text-xs whitespace-nowrap text-neutral-500">
            {post.stance}
          </span>
        )}
      </div>
      <p className="mt-3 whitespace-pre-wrap leading-relaxed text-neutral-900">{post.text}</p>

      <div className="mt-4 border-t border-neutral-100 pt-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Rationale</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{post.rationale}</p>
      </div>

      {post.sources.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
          {post.sources.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-800"
            >
              {displayHost(url)}
            </a>
          ))}
        </div>
      )}

      <ShareButtons text={post.text} postPath={`/feed/${post.id}`} />
    </article>
  );
}
