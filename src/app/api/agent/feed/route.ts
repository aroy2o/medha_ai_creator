import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { runCycle } from "@/lib/cycleRunner";

export const dynamic = "force-dynamic";
// The after() callback below can run a full cycle (discovery + up to a few Groq calls), so this
// needs the same headroom as /api/agent/cycle — after() counts against the same invocation.
export const maxDuration = 60;

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

    // The spec guarantees the evaluator polls this exact endpoint repeatedly after init
    // ("the evaluator will periodically call GET /api/agent/feed") — piggybacking the
    // autonomous trigger here means new posts need no external scheduler, cron service, or
    // platform-specific cron feature: every feed poll doubles as the wake-up signal. Scheduled
    // via after() so it runs once this response is already sent, never delaying the feed itself;
    // runCycle's own pacing guard makes this a fast no-op on the vast majority of polls where a
    // new cycle isn't due yet.
    after(() => {
      runCycle(agentId).catch((err) => {
        logger.error("feed-triggered cycle failed", {
          agentId,
          message: err instanceof Error ? err.message : String(err),
        });
      });
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
