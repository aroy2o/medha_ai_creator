import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { discoverAll } from "@/lib/discovery";
import { judgeCandidates, type JudgedCandidate } from "@/lib/editorial/judge";
import { generatePost } from "@/lib/generation";
import { extractKeywords } from "@/lib/editorial/keywords";

export const dynamic = "force-dynamic";
// Discovery hits 4 external sources sequentially plus one Groq call;
// give it real headroom on serverless (Vercel's Hobby default is 10s).
export const maxDuration = 60;

const DEFAULT_CYCLE_INTERVAL_HOURS = 4;

function cycleIntervalHours(): number {
  const raw = Number(process.env.CYCLE_INTERVAL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CYCLE_INTERVAL_HOURS;
}

interface RejectionRow {
  topic: string;
  reason: string;
  rejectedInFavorOfPostId: string | null;
}

function toRejectionRows(considered: JudgedCandidate[], publishedPostId: string | null): RejectionRow[] {
  return considered.map((item) => ({
    topic: item.verdict.candidate.title,
    reason: item.reason,
    rejectedInFavorOfPostId: item.category === "outranked" ? publishedPostId : null,
  }));
}

/**
 * POST /api/agent/cycle — auth'd via CRON_SECRET, meant to be called by
 * an external cron trigger every few hours. Runs one full
 * discover -> judge -> write -> publish pass for the agent (or, with no
 * agent yet, 400s: there's nothing to run a cycle for until /init has
 * been called).
 */
export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    logger.error("CRON_SECRET is not configured; refusing all cycle requests");
    return NextResponse.json({ error: "Server misconfigured: CRON_SECRET is not set." }, { status: 500 });
  }
  const providedSecret = request.headers.get("x-cron-secret");
  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let requestedAgentId: string | undefined;
  try {
    const rawBody = await request.text();
    if (rawBody) {
      const parsed = JSON.parse(rawBody) as { agentId?: unknown };
      if (parsed.agentId !== undefined) {
        if (typeof parsed.agentId !== "string" || !parsed.agentId.trim()) {
          return NextResponse.json({ error: "agentId, if provided, must be a non-empty string." }, { status: 400 });
        }
        requestedAgentId = parsed.agentId;
      }
    }
  } catch {
    return NextResponse.json({ error: "Request body, if present, must be valid JSON." }, { status: 400 });
  }

  const agent = requestedAgentId
    ? await prisma.agent.findUnique({ where: { id: requestedAgentId }, include: { personaProfile: true } })
    : await prisma.agent.findFirst({ orderBy: { createdAt: "asc" }, include: { personaProfile: true } });

  if (!agent || !agent.personaProfile) {
    return NextResponse.json(
      { error: "No initialized agent found. Call POST /api/agent/init first." },
      { status: 400 },
    );
  }

  const startedAt = new Date();

  // Guard against a misconfigured or over-eager cron trigger flooding the
  // feed: skip (without touching discovery sources or Groq quota) if the
  // last post is younger than the configured interval. Still a 200 —
  // this is expected, well-behaved pacing, not an error.
  const mostRecentPost = await prisma.post.findFirst({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (mostRecentPost) {
    const hoursSineLastPost = (startedAt.getTime() - mostRecentPost.createdAt.getTime()) / (1000 * 60 * 60);
    const minInterval = cycleIntervalHours();
    if (hoursSineLastPost < minInterval) {
      return NextResponse.json({
        agentId: agent.id,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        skipped: true,
        reason: `Last post was ${hoursSineLastPost.toFixed(2)}h ago; minimum cycle interval is ${minInterval}h.`,
      });
    }
  }

  try {
    const { candidates, results: discoveryResults } = await discoverAll();

    const pastPosts = await prisma.post.findMany({
      where: { agentId: agent.id },
      select: { id: true, text: true, topicTags: true },
    });

    const judged = judgeCandidates({
      candidates,
      pastPosts,
      domainVocabulary: agent.personaProfile.standingInterests,
    });

    const discoverySummary = discoveryResults.map((r) => ({
      source: r.source,
      candidateCount: r.candidates.length,
      error: r.error,
    }));

    if (!judged.winner) {
      const rows = toRejectionRows(judged.considered, null);
      if (rows.length > 0) {
        await prisma.rejectedTopic.createMany({
          data: rows.map((r) => ({ agentId: agent.id, ...r })),
        });
      }
      logger.info("cycle complete: no candidate cleared the bar", {
        agentId: agent.id,
        candidatesConsidered: candidates.length,
      });
      return NextResponse.json({
        agentId: agent.id,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        discovery: discoverySummary,
        totalCandidates: candidates.length,
        published: null,
        rejectedCount: rows.length,
      });
    }

    let publishedPostId: string | null = null;
    let publishedTitle: string | null = null;
    let generationFailure: string | null = null;

    try {
      const generated = await generatePost({
        persona: {
          name: agent.name,
          styleGuide: agent.personaProfile.styleGuide,
          editorialStandards: agent.personaProfile.editorialStandards,
        },
        winningCandidate: judged.winner.candidate,
        weightedTotal: judged.winner.weightedTotal,
        alternatives: judged.considered,
      });

      // Fold a few keywords from the *original candidate's* title into
      // topicTags alongside whatever Groq chose. Groq paraphrases when
      // writing the post body, which measurably weakens future memory
      // comparisons (see memory.ts's NOVELTY_REJECT_THRESHOLD comment) —
      // this keeps the source's own vocabulary in memory regardless of
      // how Aria's prose ends up phrasing it.
      const titleKeywords = extractKeywords(judged.winner.candidate.title).slice(0, 4);
      const enrichedTags = [...new Set([...generated.topicTags, ...titleKeywords])];

      const post = await prisma.post.create({
        data: {
          agentId: agent.id,
          text: generated.text,
          rationale: generated.rationale,
          sources: [judged.winner.candidate.url],
          topicTags: enrichedTags,
        },
      });
      publishedPostId = post.id;
      publishedTitle = judged.winner.candidate.title;
    } catch (err) {
      generationFailure = err instanceof Error ? err.message : "unknown generation error";
      logger.error("generation failed; publishing nothing this cycle", {
        agentId: agent.id,
        message: generationFailure,
      });
    }

    const rows = toRejectionRows(judged.considered, publishedPostId);
    if (!publishedPostId) {
      // The would-be winner cleared editorial judgment but generation
      // failed — log it too, so the editorial log doesn't silently lose
      // track of why nothing was published this cycle.
      rows.unshift({
        topic: judged.winner.candidate.title,
        reason: `Cleared the editorial bar at ${judged.winner.weightedTotal}/10 but generation failed this cycle (${generationFailure}); nothing published.`,
        rejectedInFavorOfPostId: null,
      });
    }
    if (rows.length > 0) {
      await prisma.rejectedTopic.createMany({
        data: rows.map((r) => ({ agentId: agent.id, ...r })),
      });
    }

    logger.info("cycle complete", {
      agentId: agent.id,
      published: publishedPostId ?? "none",
      rejectedCount: rows.length,
    });

    return NextResponse.json({
      agentId: agent.id,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      discovery: discoverySummary,
      totalCandidates: candidates.length,
      published: publishedPostId ? { id: publishedPostId, title: publishedTitle, score: judged.winner.weightedTotal } : null,
      rejectedCount: rows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error("cycle failed", { agentId: agent.id, message });
    return NextResponse.json({ error: "Cycle failed unexpectedly.", agentId: agent.id }, { status: 500 });
  }
}
