import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runCycle } from "@/lib/cycleRunner";

export const dynamic = "force-dynamic";
// Discovery hits several external sources concurrently plus up to a few
// Groq calls; give it real headroom on serverless (Vercel's Hobby default is 10s).
export const maxDuration = 60;

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch rather than returning
  // false — compare lengths first (this alone leaks negligible
  // information; the secret's length isn't the secret).
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * POST /api/agent/cycle — auth'd via CRON_SECRET, for manual triggers or an external cron
 * service. Not the primary autonomous trigger anymore — see GET /api/agent/feed, which
 * piggybacks the same `runCycle` on every feed poll instead of depending on an external
 * scheduler. Kept for manual testing and as a second, independent path to the same logic.
 */
export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: "Server misconfigured: CRON_SECRET is not set." }, { status: 500 });
  }
  const providedSecret = request.headers.get("x-cron-secret");
  if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
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

  const outcome = await runCycle(requestedAgentId);
  return NextResponse.json(outcome.body, { status: outcome.status });
}
