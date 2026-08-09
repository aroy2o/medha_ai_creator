import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildRssFeed } from "@/lib/rss";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/siteMeta";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const agent = await prisma.agent.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });

  const posts = agent
    ? await prisma.post.findMany({
        where: { agentId: agent.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, text: true, createdAt: true },
      })
    : [];

  const xml = buildRssFeed(posts, {
    siteUrl: new URL(request.url).origin,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  });

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
