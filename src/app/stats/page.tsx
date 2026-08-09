import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { buildOperatingRecord, type TimelineEntry } from "@/lib/operatingRecord";
import { TONE_LABELS, type RejectionTone } from "@/lib/editorialLogDisplay";
import { truncateForShare } from "@/lib/shareLinks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operating Record — Medha" };

const TONE_ORDER: RejectionTone[] = ["outranked", "below-bar", "dedup", "off-domain", "generation-failed", "other"];

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "published") {
    return (
      <li className="rounded border border-neutral-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/feed/${entry.post.id}`}
            className="text-sm font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-600"
          >
            Published: {truncateForShare(entry.post.text, 90)}
          </Link>
          <span className="shrink-0 text-xs whitespace-nowrap text-neutral-400">{formatDateTime(entry.at)}</span>
        </div>
        {entry.otherConsidered > 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            {entry.otherConsidered} other candidate{entry.otherConsidered === 1 ? "" : "s"} considered that cycle.
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="rounded border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-700">
          {entry.generationFailed
            ? "Nothing published — a candidate cleared the editorial bar but generation failed."
            : `Nothing published — ${entry.consideredCount} candidate${entry.consideredCount === 1 ? "" : "s"} considered, none cleared the bar.`}
        </p>
        <span className="shrink-0 text-xs whitespace-nowrap text-neutral-400">{formatDateTime(entry.at)}</span>
      </div>
    </li>
  );
}

export default async function StatsPage() {
  const agent = await prisma.agent.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });

  if (!agent) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Operating record</h1>
        <p className="mt-4 rounded border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          The persona hasn&apos;t been initialized yet — nothing to show.
        </p>
      </div>
    );
  }

  const [posts, rejections] = await Promise.all([
    prisma.post.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, text: true, sources: true, createdAt: true },
    }),
    prisma.rejectedTopic.findMany({
      where: { agentId: agent.id },
      orderBy: { consideredAt: "desc" },
      select: { topic: true, reason: true, url: true, consideredAt: true, rejectedInFavorOfPostId: true },
    }),
  ]);

  const record = buildOperatingRecord(posts, rejections);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Operating record</h1>
      <p className="mt-1 text-neutral-600">
        Real aggregate numbers from what&apos;s actually in the database — not a claim, something you
        can verify against the <Link href="/feed" className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900">feed</Link> and{" "}
        <Link href="/editorial-log" className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900">editorial log</Link> directly.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-semibold tracking-tight text-neutral-900">{record.totalPublished}</p>
          <p className="mt-1 text-xs text-neutral-500">Posts published</p>
        </div>
        <div className="rounded border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-semibold tracking-tight text-neutral-900">{record.totalRejected}</p>
          <p className="mt-1 text-xs text-neutral-500">Candidates rejected</p>
        </div>
        <div className="rounded border border-neutral-200 bg-white p-4">
          <p className="text-2xl font-semibold tracking-tight text-neutral-900">
            {record.clearanceRatePercent === null ? "—" : `${record.clearanceRatePercent}%`}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Cleared the bar</p>
        </div>
      </div>

      {record.totalRejected > 0 && (
        <section className="mt-8 space-y-3 border-t border-neutral-200 pt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Why candidates were rejected</h2>
          <ul className="flex flex-wrap gap-2">
            {TONE_ORDER.filter((tone) => record.rejectionBreakdown[tone] > 0).map((tone) => (
              <li key={tone} className="rounded border border-neutral-200 px-2.5 py-1 text-sm text-neutral-700">
                {TONE_LABELS[tone]} <span className="text-neutral-400">×{record.rejectionBreakdown[tone]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {record.sources.length > 0 && (
        <section className="mt-8 space-y-3 border-t border-neutral-200 pt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Source hit rate</h2>
          <div className="overflow-x-auto rounded border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs text-neutral-400">
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Published</th>
                  <th className="px-3 py-2 font-medium">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {record.sources.map((source) => (
                  <tr key={source.host} className="border-b border-neutral-50 last:border-0">
                    <td className="px-3 py-2 text-neutral-800">{source.host}</td>
                    <td className="px-3 py-2 text-neutral-600">{source.published}</td>
                    <td className="px-3 py-2 text-neutral-600">{source.rejected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-8 space-y-3 border-t border-neutral-200 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Activity</h2>
        {record.timeline.length === 0 ? (
          <p className="rounded border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
            No recorded activity yet — first cycle pending.
          </p>
        ) : (
          <ul className="space-y-3">
            {record.timeline.map((entry, index) => (
              // Real published posts can share an identical createdAt down to the millisecond
              // (seen live: several test posts created in the same batch during earlier
              // development) — entry.post.id is the only value guaranteed unique for "published"
              // entries; "no-publish" entries have no natural unique id, so the index is the
              // tiebreaker there.
              <TimelineRow
                key={entry.kind === "published" ? `post-${entry.post.id}` : `reject-${index}-${entry.at.toISOString()}`}
                entry={entry}
              />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 border-t border-neutral-200 pt-6 text-xs leading-relaxed text-neutral-400">
        What isn&apos;t shown here: a cycle that the pacing guard skipped, or where discovery returned
        zero candidates, writes nothing to the database — so it leaves no trace in this record either.
        Everything above is a lower bound on real activity, never an inflated one.
      </p>
    </div>
  );
}
