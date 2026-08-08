import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { categorizeRejectionReason, type RejectionTone } from "@/lib/editorialLogDisplay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editorial Log — Medha" };

const TONE_STYLES: Record<RejectionTone, string> = {
  dedup: "border-neutral-300 text-neutral-700",
  "off-domain": "border-neutral-300 text-neutral-700",
  "below-bar": "border-neutral-300 text-neutral-700",
  outranked: "border-neutral-300 text-neutral-500",
  "generation-failed": "border-neutral-400 text-neutral-800",
  other: "border-neutral-300 text-neutral-500",
};

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default async function EditorialLogPage() {
  const agent = await prisma.agent.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });

  if (!agent) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Editorial log</h1>
        <p className="mt-4 rounded border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          The persona hasn&apos;t been initialized yet — nothing to show.
        </p>
      </div>
    );
  }

  const rejections = await prisma.rejectedTopic.findMany({
    where: { agentId: agent.id },
    orderBy: { consideredAt: "desc" },
    include: { rejectedInFavorOfPost: { select: { id: true, text: true } } },
  });

  // RejectedTopic rows from the same cycle share the exact same
  // consideredAt timestamp (a single createMany call, one DB now()), so
  // grouping by that value groups by cycle without needing a separate id.
  const groups: { consideredAt: Date; items: typeof rejections }[] = [];
  for (const item of rejections) {
    const last = groups.at(-1);
    if (last && last.consideredAt.getTime() === item.consideredAt.getTime()) {
      last.items.push(item);
    } else {
      groups.push({ consideredAt: item.consideredAt, items: [item] });
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Editorial log</h1>
      <p className="mt-1 text-neutral-600">
        Every topic Medha discovered and set aside, with the actual reason — not just the ones that made
        the cut.
      </p>

      {groups.length === 0 ? (
        <p className="mt-8 rounded border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          No topics considered yet — first cycle pending.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((group) => (
            <section key={group.consideredAt.toISOString()}>
              <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Cycle — {formatDateTime(group.consideredAt)}
              </h2>
              <ul className="mt-3 space-y-3">
                {group.items.map((item) => {
                  const { label, tone } = categorizeRejectionReason(item.reason);
                  return (
                    <li key={item.id} className="rounded border border-neutral-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-medium text-neutral-900">{item.topic}</h3>
                        <span
                          className={`shrink-0 rounded border px-2 py-0.5 text-xs whitespace-nowrap ${TONE_STYLES[tone]}`}
                        >
                          {label}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.reason}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
