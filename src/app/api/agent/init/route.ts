import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { MEDHA_PERSONA } from "@/lib/persona";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  persona: z.object({
    name: z.string().trim().min(1).max(200),
    domain: z.string().trim().min(1).max(500),
  }),
});

/**
 * POST /api/agent/init — creates the Agent + PersonaProfile. The spec
 * calls this exactly once, but requires it be "idempotent-safe": if an
 * Agent with this exact name already exists, its id is returned instead
 * of creating a duplicate, so an accidental double-call doesn't fork the
 * agent's identity or its published history.
 */
export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body. Expected { persona: { name: string, domain: string } }." },
      { status: 400 },
    );
  }

  const { name, domain } = parsed.data.persona;

  try {
    const existing = await prisma.agent.findFirst({
      where: { name },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      logger.info("agent init called again for an existing name; returning existing agentId", {
        agentId: existing.id,
      });
      return NextResponse.json({ agentId: existing.id }, { status: 200 });
    }

    let agent;
    try {
      agent = await prisma.agent.create({
        data: {
          name,
          domain,
          personaProfile: {
            create: {
              styleGuide: MEDHA_PERSONA.styleGuide,
              standingInterests: [...MEDHA_PERSONA.standingInterests],
              editorialStandards: MEDHA_PERSONA.editorialStandards,
            },
          },
        },
      });
    } catch (err) {
      // The findFirst check above and this create aren't atomic — two
      // concurrent /init calls with the same name could both pass the
      // check and race to create. Agent.name has a DB-level unique
      // constraint specifically so the loser of that race gets a clean,
      // handled P2002 here instead of silently creating a duplicate
      // agent (which would break the idempotency guarantee this route
      // exists to provide).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existingAfterRace = await prisma.agent.findFirst({ where: { name } });
        if (existingAfterRace) {
          logger.info("agent init lost a create race; returning the winner's agentId", {
            agentId: existingAfterRace.id,
          });
          return NextResponse.json({ agentId: existingAfterRace.id }, { status: 200 });
        }
      }
      throw err;
    }

    logger.info("agent initialized", { agentId: agent.id });
    return NextResponse.json({ agentId: agent.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error("agent init failed", { message });
    return NextResponse.json({ error: "Failed to initialize agent." }, { status: 500 });
  }
}
