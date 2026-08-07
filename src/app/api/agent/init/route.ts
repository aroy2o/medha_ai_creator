import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ARIA_PERSONA } from "@/lib/persona";
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

    const agent = await prisma.agent.create({
      data: {
        name,
        domain,
        personaProfile: {
          create: {
            styleGuide: ARIA_PERSONA.styleGuide,
            standingInterests: [...ARIA_PERSONA.standingInterests],
            editorialStandards: ARIA_PERSONA.editorialStandards,
          },
        },
      },
    });

    logger.info("agent initialized", { agentId: agent.id });
    return NextResponse.json({ agentId: agent.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error("agent init failed", { message });
    return NextResponse.json({ error: "Failed to initialize agent." }, { status: 500 });
  }
}
