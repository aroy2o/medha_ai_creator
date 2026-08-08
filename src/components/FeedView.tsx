"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchStarted, fetchSucceeded, fetchFailed, type FeedPost } from "@/store/slices/feedSlice";

function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function PostCard({ post }: { post: FeedPost }) {
  return (
    <article className="rounded border border-neutral-200 bg-white p-5">
      <time dateTime={post.createdAt} className="text-xs text-neutral-400">
        {formatDate(post.createdAt)}
      </time>
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
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading feed">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded border border-neutral-200 bg-white p-5">
          <div className="h-3 w-24 rounded bg-neutral-100" />
          <div className="mt-4 h-4 w-full rounded bg-neutral-100" />
          <div className="mt-2 h-4 w-5/6 rounded bg-neutral-100" />
          <div className="mt-2 h-4 w-2/3 rounded bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

export function FeedView({ agentId }: { agentId: string }) {
  const dispatch = useAppDispatch();
  const { posts, status, error } = useAppSelector((state) => state.feed);

  const load = useCallback(async () => {
    dispatch(fetchStarted());
    try {
      const res = await fetch(`/api/agent/feed?agentId=${encodeURIComponent(agentId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Feed request failed (${res.status}).`);
      }
      const data = (await res.json()) as { posts: FeedPost[] };
      dispatch(fetchSucceeded(data.posts));
    } catch (err) {
      dispatch(fetchFailed(err instanceof Error ? err.message : "Failed to load the feed."));
    }
  }, [agentId, dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "idle" || status === "loading") {
    return <FeedSkeleton />;
  }

  if (status === "failed") {
    return (
      <div className="rounded border border-neutral-200 bg-white px-4 py-6 text-sm">
        <p className="text-neutral-700">Couldn&apos;t load the feed: {error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-3 rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <p className="rounded border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
        No posts published yet — first cycle pending. Check back after Medha&apos;s next discovery pass.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
