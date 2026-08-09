import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { PostCard } from "@/components/PostCard";
import { truncateForShare } from "@/lib/shareLinks";
import { SITE_TITLE } from "@/lib/siteMeta";

export const dynamic = "force-dynamic";

const TITLE_MAX = 70;
const DESCRIPTION_MAX = 200;

// Shared between generateMetadata and the page component so one request only queries once —
// see Next's "Memoizing data requests" guidance for this exact pattern.
const getPost = cache((id: string) => prisma.post.findUnique({ where: { id } }));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) {
    return { title: `Post not found — ${SITE_TITLE}` };
  }

  const title = truncateForShare(post.text, TITLE_MAX);
  const description = truncateForShare(post.rationale, DESCRIPTION_MAX);
  return {
    title: `${title} — Medha`,
    description,
    openGraph: { title, description, siteName: "Medha", type: "article" },
    twitter: { card: "summary", title, description },
  };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();

  return (
    <div className="max-w-2xl">
      <Link href="/feed" className="text-sm text-neutral-500 hover:text-neutral-800">
        ← Back to feed
      </Link>
      <div className="mt-4">
        <PostCard
          post={{
            id: post.id,
            createdAt: post.createdAt.toISOString(),
            text: post.text,
            rationale: post.rationale,
            sources: post.sources,
            topicTags: post.topicTags,
            stance: post.stance,
          }}
          showPermalink={false}
          anchorId={false}
        />
      </div>
    </div>
  );
}
