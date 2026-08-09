import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { discoverAll } from "@/lib/discovery";
import { judgeCandidates } from "@/lib/editorial/judge";
import { RELATED_CALLBACK_MIN } from "@/lib/editorial/memory";
import { generatePost, type RelatedPastPost } from "@/lib/generation";
import { categorizeRejectionReason } from "@/lib/editorialLogDisplay";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COOLDOWN_MS = 45_000;
// Module-level, not per-request — deliberately global rather than per-IP, and deliberately
// imprecise on serverless (each instance has its own memory, so a cold start resets it). This is
// a real, accepted limitation, not a robust rate limiter: it's meant to stop back-to-back clicking
// from a single demo session, not to withstand deliberate abuse. Nothing this route does writes
// to the database, and Groq's own account-level limits are the actual backstop.
let lastRunAt = 0;

function encodeLine(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

/**
 * A live, streamed, real (not simulated) preview of one discover -> judge -> write -> critique
 * pass — real discovery sources, real Groq calls, real scoring against real past posts and real
 * past rejections. The one thing it deliberately never does is write to the database: no Post, no
 * RejectedTopic row, ever. That's what makes it safe to let any visitor trigger repeatedly without
 * polluting the real feed, bypassing the real cycle's pacing guard, or duplicating what a genuine
 * autonomous cycle already logs.
 */
export async function POST() {
  const now = Date.now();
  if (now - lastRunAt < COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((COOLDOWN_MS - (now - lastRunAt)) / 1000);
    return Response.json(
      { error: `A preview run is cooling down. Try again in ${retryAfterSeconds}s.`, retryAfterSeconds },
      { status: 429 },
    );
  }
  lastRunAt = now;

  const agent = await prisma.agent.findFirst({ orderBy: { createdAt: "asc" }, include: { personaProfile: true } });
  if (!agent || !agent.personaProfile) {
    return Response.json({ error: "No initialized agent found." }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encodeLine(event));
      try {
        send({ type: "discovery-started" });
        const { candidates } = await discoverAll((result) =>
          send({ type: "discovery-source", source: result.source, count: result.candidates.length, error: result.error ?? null }),
        );
        send({ type: "discovery-complete", totalCandidates: candidates.length });

        send({ type: "judging-started" });
        const pastPosts = await prisma.post.findMany({
          where: { agentId: agent.id },
          select: { id: true, text: true, topicTags: true },
        });
        const judged = judgeCandidates({
          candidates,
          pastPosts,
          domainVocabulary: agent.personaProfile!.standingInterests,
        });

        const topAlternatives = judged.considered.slice(0, 5).map((item) => ({
          title: item.verdict.candidate.title,
          source: item.verdict.candidate.source,
          weightedTotal: item.verdict.weightedTotal,
          category: item.category,
          tone: categorizeRejectionReason(item.reason).tone,
        }));

        send({
          type: "judged",
          winner: judged.winner
            ? {
                title: judged.winner.candidate.title,
                source: judged.winner.candidate.source,
                url: judged.winner.candidate.url,
                weightedTotal: judged.winner.weightedTotal,
                scores: judged.winner.scores,
                corroboratingSources: judged.winner.corroboratingSources,
              }
            : null,
          consideredCount: judged.considered.length,
          topAlternatives,
        });

        if (!judged.winner) {
          send({ type: "done", published: false, reason: "No candidate cleared the editorial bar this cycle." });
          controller.close();
          return;
        }

        const relatedPastPost: RelatedPastPost | null =
          judged.winner.noveltyScore >= RELATED_CALLBACK_MIN && judged.winner.mostSimilarPostLabel
            ? { label: judged.winner.mostSimilarPostLabel, sharedTerms: judged.winner.sharedTerms }
            : null;

        const pastRejection = await prisma.rejectedTopic.findFirst({
          where: { agentId: agent.id, url: judged.winner.candidate.url },
          orderBy: { consideredAt: "desc" },
        });
        const heldOverSince =
          pastRejection && categorizeRejectionReason(pastRejection.reason).tone === "outranked"
            ? pastRejection.consideredAt
            : null;

        send({ type: "writing-started" });
        const generated = await generatePost(
          {
            persona: {
              name: agent.name,
              styleGuide: agent.personaProfile!.styleGuide,
              editorialStandards: agent.personaProfile!.editorialStandards,
            },
            winningCandidate: judged.winner.candidate,
            weightedTotal: judged.winner.weightedTotal,
            scores: judged.winner.scores,
            alternatives: judged.considered,
            relatedPastPost,
            corroboratingSources: judged.winner.corroboratingSources,
            heldOverSince,
          },
          {
            onDraft: (draft, attempt) => send({ type: "draft", attempt, ...draft }),
            onCritique: (critique, attempt) => send({ type: "critique", attempt, ...critique }),
          },
        );

        send({
          type: "done",
          published: true,
          post: {
            text: generated.text,
            rationale: generated.rationale,
            topicTags: generated.topicTags,
            stance: generated.stance,
            sources: [judged.winner.candidate.url],
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error during preview run.";
        logger.error("preview run failed", { agentId: agent.id, message });
        send({ type: "done", published: false, reason: `Generation failed: ${message}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
