import { categorizeRejectionReason, type RejectionTone } from "@/lib/editorialLogDisplay";
import { displayHost } from "@/lib/postDisplay";

export interface RecordPost {
  id: string;
  text: string;
  sources: string[];
  createdAt: Date;
}

export interface RecordRejection {
  topic: string;
  reason: string;
  url: string | null;
  consideredAt: Date;
  rejectedInFavorOfPostId: string | null;
}

export type TimelineEntry =
  | { kind: "published"; at: Date; post: RecordPost; otherConsidered: number }
  | { kind: "no-publish"; at: Date; consideredCount: number; generationFailed: boolean };

export type RejectionBreakdown = Record<RejectionTone, number>;

export interface SourceStats {
  host: string;
  published: number;
  rejected: number;
}

export interface OperatingRecord {
  totalPublished: number;
  totalRejected: number;
  /** null when there are no recorded candidates at all yet — a rate of anything would be misleading. */
  clearanceRatePercent: number | null;
  rejectionBreakdown: RejectionBreakdown;
  sources: SourceStats[];
  timeline: TimelineEntry[];
}

export const UNKNOWN_SOURCE = "unknown (pre-dates source tracking)";

/**
 * `RejectedTopic` rows from the same cycle share the exact `consideredAt` timestamp — one
 * `createMany` call, one DB `now()` — the same fact the editorial log page's grouping relies on.
 * Expects `rejectionsDesc` already sorted newest-first so equal timestamps land adjacently.
 */
function groupByConsideredAt(rejectionsDesc: RecordRejection[]): RecordRejection[][] {
  const groups: RecordRejection[][] = [];
  for (const item of rejectionsDesc) {
    const last = groups.at(-1);
    if (last && last[0].consideredAt.getTime() === item.consideredAt.getTime()) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}

function emptyBreakdown(): RejectionBreakdown {
  return { dedup: 0, "off-domain": 0, "below-bar": 0, outranked: 0, "generation-failed": 0, other: 0 };
}

/**
 * Builds the whole operating-record view from two already-real tables, no invented "cycle"
 * entity. A cycle's rejection group is folded into its winning post's timeline entry (found via
 * `rejectedInFavorOfPostId`, an exact id match — not a time-window guess) rather than shown
 * separately; a group with no linked post becomes its own "nothing published" entry. Cycles that
 * were pacing-skipped, or where discovery returned zero candidates, write nothing to either table
 * and are therefore invisible here — that's a real limitation of what's derivable, not hidden.
 */
export function buildOperatingRecord(posts: RecordPost[], rejectionsDesc: RecordRejection[]): OperatingRecord {
  const groups = groupByConsideredAt(rejectionsDesc);

  const otherConsideredByPostId = new Map<string, number>();
  const timeline: TimelineEntry[] = [];

  for (const group of groups) {
    const linkedPostId = group.find((item) => item.rejectedInFavorOfPostId)?.rejectedInFavorOfPostId ?? null;
    if (linkedPostId) {
      otherConsideredByPostId.set(linkedPostId, group.length);
      continue;
    }
    const generationFailed = group.some(
      (item) => categorizeRejectionReason(item.reason).tone === "generation-failed",
    );
    timeline.push({
      kind: "no-publish",
      at: group[0].consideredAt,
      consideredCount: group.length,
      generationFailed,
    });
  }

  for (const post of posts) {
    timeline.push({
      kind: "published",
      at: post.createdAt,
      post,
      otherConsidered: otherConsideredByPostId.get(post.id) ?? 0,
    });
  }

  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());

  const rejectionBreakdown = emptyBreakdown();
  for (const rejection of rejectionsDesc) {
    rejectionBreakdown[categorizeRejectionReason(rejection.reason).tone] += 1;
  }

  const sourceMap = new Map<string, SourceStats>();
  const bump = (host: string, field: "published" | "rejected") => {
    const existing = sourceMap.get(host) ?? { host, published: 0, rejected: 0 };
    existing[field] += 1;
    sourceMap.set(host, existing);
  };
  for (const post of posts) {
    bump(post.sources[0] ? displayHost(post.sources[0]) : UNKNOWN_SOURCE, "published");
  }
  for (const rejection of rejectionsDesc) {
    bump(rejection.url ? displayHost(rejection.url) : UNKNOWN_SOURCE, "rejected");
  }
  const sources = [...sourceMap.values()].sort(
    (a, b) => b.published + b.rejected - (a.published + a.rejected),
  );

  const totalConsidered = posts.length + rejectionsDesc.length;

  return {
    totalPublished: posts.length,
    totalRejected: rejectionsDesc.length,
    clearanceRatePercent: totalConsidered > 0 ? Math.round((posts.length / totalConsidered) * 1000) / 10 : null,
    rejectionBreakdown,
    sources,
    timeline,
  };
}
