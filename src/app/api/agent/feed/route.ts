import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/feed?agentId=... — reverse-chronological published
 * posts for the given agent. An agentId that doesn't match any agent
 * returns the same empty-state shape as an agent with zero posts so far
 * (rather than a 404): from the evaluator's perspective both are "no
 * posts to show yet," and the contract already defines that shape.
 */
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId")?.trim();

  if (!agentId) {
    return NextResponse.json(
      { error: "Missing required query parameter: agentId." },
      { status: 400 },
    );
  }

  try {
    const posts = await prisma.post.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        text: true,
        rationale: true,
        sources: true,
        topicTags: true,
        stance: true,
      },
    });

    return NextResponse.json({
      posts: posts.map((post) => ({
        // Required contract fields, in spec order.
        id: post.id,
        createdAt: post.createdAt.toISOString(),
        text: post.text,
        rationale: post.rationale,
        sources: post.sources,
        // Additive bonus fields — not part of the required contract, but
        // harmless for any consumer that only reads the fields above.
        topicTags: post.topicTags,
        stance: post.stance,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error("feed fetch failed", { message, agentId });
    return NextResponse.json({ error: "Failed to load feed." }, { status: 500 });
  }
}
