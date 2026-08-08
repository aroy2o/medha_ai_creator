import Link from "next/link";
import { prisma } from "@/lib/db";
import { CycleCountdown } from "@/components/CycleCountdown";

export const dynamic = "force-dynamic";

const DEFAULT_CYCLE_INTERVAL_HOURS = 4;

function cycleIntervalHours(): number {
  const raw = Number(process.env.CYCLE_INTERVAL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CYCLE_INTERVAL_HOURS;
}

export default async function PersonaPage() {
  const agent = await prisma.agent.findFirst({
    orderBy: { createdAt: "asc" },
    include: { personaProfile: true },
  });

  if (!agent || !agent.personaProfile) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Medha</h1>
        <p className="mt-4 text-neutral-600">
          The persona hasn&apos;t been initialized yet — no agent exists in the database. Call{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">POST /api/agent/init</code> to
          create it.
        </p>
      </div>
    );
  }

  const [lastPost, lastRejection] = await Promise.all([
    prisma.post.findFirst({ where: { agentId: agent.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.rejectedTopic.findFirst({ where: { agentId: agent.id }, orderBy: { consideredAt: "desc" }, select: { consideredAt: true } }),
  ]);

  const lastCycleAt = [lastPost?.createdAt, lastRejection?.consideredAt]
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{agent.name}</h1>
        <p className="mt-1 text-neutral-600">{agent.domain}</p>
        <div className="mt-4">
          <CycleCountdown
            lastCycleAt={lastCycleAt ? lastCycleAt.toISOString() : null}
            intervalHours={cycleIntervalHours()}
          />
        </div>
      </div>

      <section className="space-y-2 border-t border-neutral-200 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Voice</h2>
        <p className="leading-relaxed text-neutral-800">{agent.personaProfile.styleGuide}</p>
      </section>

      <section className="space-y-2 border-t border-neutral-200 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Editorial standards
        </h2>
        <p className="leading-relaxed text-neutral-800">{agent.personaProfile.editorialStandards}</p>
      </section>

      <section className="space-y-3 border-t border-neutral-200 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Standing interests
        </h2>
        <ul className="flex flex-wrap gap-2">
          {agent.personaProfile.standingInterests.map((interest) => (
            <li
              key={interest}
              className="rounded border border-neutral-200 px-2.5 py-1 text-sm text-neutral-700"
            >
              {interest}
            </li>
          ))}
        </ul>
      </section>

      <nav className="flex flex-wrap gap-4 border-t border-neutral-200 pt-6 text-sm">
        <Link href="/feed" className="text-neutral-700 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-900">
          Read the feed
        </Link>
        <Link
          href="/editorial-log"
          className="text-neutral-700 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-900"
        >
          See what was rejected and why
        </Link>
        <Link
          href="/memory"
          className="text-neutral-700 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-900"
        >
          View the memory map
        </Link>
      </nav>
    </div>
  );
}
