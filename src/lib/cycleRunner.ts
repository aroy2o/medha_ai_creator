import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { discoverAll } from "@/lib/discovery";
import { judgeCandidates, type JudgedCandidate } from "@/lib/editorial/judge";
import { RELATED_CALLBACK_MIN } from "@/lib/editorial/memory";
import { generatePost, type RelatedPastPost } from "@/lib/generation";
import { extractKeywords } from "@/lib/editorial/keywords";
import { categorizeRejectionReason } from "@/lib/editorialLogDisplay";

const DEFAULT_CYCLE_INTERVAL_HOURS = 4;

function cycleIntervalHours(): number {
  const raw = Number(process.env.CYCLE_INTERVAL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CYCLE_INTERVAL_HOURS;
}

interface RejectionRow {
  topic: string;
  reason: string;
  url: string;
  rejectedInFavorOfPostId: string | null;
}

function toRejectionRows(considered: JudgedCandidate[], publishedPostId: string | null): RejectionRow[] {
  return considered.map((item) => ({
    topic: item.verdict.candidate.title,
    reason: item.reason,
    url: item.verdict.candidate.url,
    rejectedInFavorOfPostId: item.category === "outranked" ? publishedPostId : null,
  }));
}

export type CycleOutcome =
  | { status: 400; body: { error: string } }
  | { status: 500; body: { error: string; agentId: string } }
  | { status: 200; body: Record<string, unknown> };

// Guards against two overlapping runs on the *same* warm serverless instance — e.g. two feed
// polls landing close together get routed to the same instance. This narrows, but doesn't
// eliminate, the race: separate instances don't share this flag. The database pacing guard below
// (comparing against the real Post.createdAt) is the actual source of truth either way.
let cycleInFlight = false;

/**
 * Runs one full discover -> judge -> write -> publish pass for the given agent (or the one
 * existing agent, with no id given). Shared by `POST /api/agent/cycle` (manual/external trigger,
 * CRON_SECRET-protected) and `GET /api/agent/feed` (in-app autonomous trigger — see feed/route.ts
 * for why piggybacking on the feed endpoint replaces needing any external scheduler at all).
 */
export async function runCycle(requestedAgentId?: string): Promise<CycleOutcome> {
  if (cycleInFlight) {
    return {
      status: 200,
      body: { skipped: true, reason: "Another cycle is already running on this instance." },
    };
  }
  cycleInFlight = true;
  try {
    return await runCycleInner(requestedAgentId);
  } finally {
    cycleInFlight = false;
  }
}

async function runCycleInner(requestedAgentId?: string): Promise<CycleOutcome> {
  const agent = requestedAgentId
    ? await prisma.agent.findUnique({ where: { id: requestedAgentId }, include: { personaProfile: true } })
    : await prisma.agent.findFirst({ orderBy: { createdAt: "asc" }, include: { personaProfile: true } });

  if (!agent || !agent.personaProfile) {
    return { status: 400, body: { error: "No initialized agent found. Call POST /api/agent/init first." } };
  }

  const startedAt = new Date();

  // Guard against a misconfigured or over-eager trigger flooding the feed: skip (without
  // touching discovery sources or Groq quota) if the last post is younger than the configured
  // interval. Still a 200 — this is expected, well-behaved pacing, not an error.
  const mostRecentPost = await prisma.post.findFirst({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (mostRecentPost) {
    const hoursSineLastPost = (startedAt.getTime() - mostRecentPost.createdAt.getTime()) / (1000 * 60 * 60);
    const minInterval = cycleIntervalHours();
    if (hoursSineLastPost < minInterval) {
      return {
        status: 200,
        body: {
          agentId: agent.id,
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          skipped: true,
          reason: `Last post was ${hoursSineLastPost.toFixed(2)}h ago; minimum cycle interval is ${minInterval}h.`,
        },
      };
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
      return {
        status: 200,
        body: {
          agentId: agent.id,
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          discovery: discoverySummary,
          totalCandidates: candidates.length,
          published: null,
          rejectedCount: rows.length,
        },
      };
    }

    let publishedPostId: string | null = null;
    let publishedTitle: string | null = null;
    let generationFailure: string | null = null;

    try {
      // The winner's novelty score already tells us whether it's related
      // to a past post without being a duplicate (below the hard-reject
      // gate, at/above RELATED_CALLBACK_MIN) — see memory.ts. When it is,
      // pass that context through so generation can reference prior
      // coverage explicitly instead of writing as if it never happened.
      const relatedPastPost: RelatedPastPost | null =
        judged.winner.noveltyScore >= RELATED_CALLBACK_MIN && judged.winner.mostSimilarPostLabel
          ? { label: judged.winner.mostSimilarPostLabel, sharedTerms: judged.winner.sharedTerms }
          : null;

      // "Held over": this exact URL lost to a stronger story in a past
      // cycle (logged with category "outranked" — never for hard-reject
      // or below-bar, since those were rejected on their own merits, not
      // just bad timing) and is winning now that nothing outranks it.
      // Real editors hold a good story for a slower day; this is memory
      // used for more than duplicate prevention.
      const pastRejection = await prisma.rejectedTopic.findFirst({
        where: { agentId: agent.id, url: judged.winner.candidate.url },
        orderBy: { consideredAt: "desc" },
      });
      const heldOverSince =
        pastRejection && categorizeRejectionReason(pastRejection.reason).tone === "outranked"
          ? pastRejection.consideredAt
          : null;

      const generated = await generatePost({
        persona: {
          name: agent.name,
          styleGuide: agent.personaProfile.styleGuide,
          editorialStandards: agent.personaProfile.editorialStandards,
        },
        winningCandidate: judged.winner.candidate,
        weightedTotal: judged.winner.weightedTotal,
        scores: judged.winner.scores,
        alternatives: judged.considered,
        relatedPastPost,
        corroboratingSources: judged.winner.corroboratingSources,
        heldOverSince,
      });

      // Fold a few keywords from the *original candidate's* title into
      // topicTags alongside whatever Groq chose. Groq paraphrases when
      // writing the post body, which measurably weakens future memory
      // comparisons (see memory.ts's NOVELTY_REJECT_THRESHOLD comment) —
      // this keeps the source's own vocabulary in memory regardless of
      // how Medha's prose ends up phrasing it.
      const titleKeywords = extractKeywords(judged.winner.candidate.title).slice(0, 4);
      const enrichedTags = [...new Set([...generated.topicTags, ...titleKeywords])];

      const post = await prisma.post.create({
        data: {
          agentId: agent.id,
          text: generated.text,
          rationale: generated.rationale,
          sources: [judged.winner.candidate.url],
          topicTags: enrichedTags,
          stance: generated.stance,
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
      // The detailed error is logged server-side above; the publicly
      // displayed reason (this app's editorial log is a public page)
      // stays generic rather than echoing a raw exception message that
      // could, depending on the failure, contain more than intended.
      rows.unshift({
        topic: judged.winner.candidate.title,
        reason: `Cleared the editorial bar at ${judged.winner.weightedTotal}/10 but text generation failed this cycle; nothing published.`,
        url: judged.winner.candidate.url,
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

    return {
      status: 200,
      body: {
        agentId: agent.id,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        discovery: discoverySummary,
        totalCandidates: candidates.length,
        published: publishedPostId ? { id: publishedPostId, title: publishedTitle, score: judged.winner.weightedTotal } : null,
        rejectedCount: rows.length,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error("cycle failed", { agentId: agent.id, message });
    return { status: 500, body: { error: "Cycle failed unexpectedly.", agentId: agent.id } };
  }
}
