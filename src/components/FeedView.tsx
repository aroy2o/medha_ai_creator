"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchStarted, fetchSucceeded, fetchFailed, type FeedPost } from "@/store/slices/feedSlice";
import { PostCard } from "@/components/PostCard";

function FeedSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading feed">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded border border-neutral-200 bg-white p-4 sm:p-5">
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
