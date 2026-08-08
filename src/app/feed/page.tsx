import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { FeedView } from "@/components/FeedView";

export const dynamic = "force-dynamic";

const FEED_TITLE = "Feed — Medha";
const FEED_DESCRIPTION = "Medha's published posts on production AI reliability and failure modes, newest first.";

export const metadata: Metadata = {
  title: FEED_TITLE,
  description: FEED_DESCRIPTION,
  openGraph: { title: FEED_TITLE, description: FEED_DESCRIPTION, siteName: "Medha", type: "website" },
  twitter: { card: "summary", title: FEED_TITLE, description: FEED_DESCRIPTION },
};

export default async function FeedPage() {
  const agent = await prisma.agent.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Feed</h1>
      <p className="mt-1 text-neutral-600">
        Published posts, newest first. Every post carries its rationale and sources.
      </p>
      <div className="mt-8">
        {agent ? (
          <FeedView agentId={agent.id} />
        ) : (
          <p className="rounded border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
            The persona hasn&apos;t been initialized yet — nothing to show.
          </p>
        )}
      </div>
    </div>
  );
}
