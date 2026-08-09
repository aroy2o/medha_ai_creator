import { describe, expect, it } from "vitest";
import { buildOperatingRecord, UNKNOWN_SOURCE, type RecordPost, type RecordRejection } from "./operatingRecord";

function post(overrides: Partial<RecordPost> = {}): RecordPost {
  return {
    id: "post-1",
    text: "A post about production AI reliability.",
    sources: ["https://simonwillison.net/2026/some-post"],
    createdAt: new Date("2026-08-09T10:00:05.000Z"),
    ...overrides,
  };
}

function rejection(overrides: Partial<RecordRejection> = {}): RecordRejection {
  return {
    topic: "Some other story",
    reason: 'Too similar to an existing post ("X") — 20% keyword overlap.',
    url: "https://news.ycombinator.com/item?id=1",
    consideredAt: new Date("2026-08-09T10:00:00.000Z"),
    rejectedInFavorOfPostId: null,
    ...overrides,
  };
}

describe("buildOperatingRecord", () => {
  it("folds a cycle's rejection group into its winning post's timeline entry, not a separate one", () => {
    const winner = post({ id: "winner", createdAt: new Date("2026-08-09T10:00:05.000Z") });
    const rejections = [
      rejection({ consideredAt: new Date("2026-08-09T10:00:00.000Z"), rejectedInFavorOfPostId: "winner" }),
      rejection({ consideredAt: new Date("2026-08-09T10:00:00.000Z"), rejectedInFavorOfPostId: "winner" }),
      rejection({ consideredAt: new Date("2026-08-09T10:00:00.000Z"), rejectedInFavorOfPostId: null }),
    ];
    const record = buildOperatingRecord([winner], rejections);

    expect(record.timeline).toHaveLength(1);
    expect(record.timeline[0]).toMatchObject({ kind: "published", otherConsidered: 3 });
  });

  it("keeps a cycle that published nothing as its own no-publish entry", () => {
    const rejections = [
      rejection({ consideredAt: new Date("2026-08-09T09:00:00.000Z"), rejectedInFavorOfPostId: null }),
      rejection({ consideredAt: new Date("2026-08-09T09:00:00.000Z"), rejectedInFavorOfPostId: null }),
    ];
    const record = buildOperatingRecord([], rejections);

    expect(record.timeline).toEqual([
      { kind: "no-publish", at: new Date("2026-08-09T09:00:00.000Z"), consideredCount: 2, generationFailed: false },
    ]);
  });

  it("flags a no-publish cycle as a generation failure when that's the real reason", () => {
    const rejections = [
      rejection({
        reason: "Cleared the editorial bar at 7.2/10 but text generation failed this cycle; nothing published.",
        rejectedInFavorOfPostId: null,
      }),
    ];
    const record = buildOperatingRecord([], rejections);

    expect(record.timeline[0]).toMatchObject({ kind: "no-publish", generationFailed: true });
  });

  it("still shows a published post with zero other candidates considered that cycle", () => {
    const record = buildOperatingRecord([post({ id: "only-candidate" })], []);
    expect(record.timeline).toEqual([
      { kind: "published", at: post().createdAt, post: post({ id: "only-candidate" }), otherConsidered: 0 },
    ]);
  });

  it("keeps two published posts as distinct timeline entries even when they share the exact same createdAt", () => {
    // Real, observed data: several posts from an earlier batch of test publishing share an
    // identical createdAt down to the millisecond. Caught a real bug where the page's React key
    // was built from the timestamp alone and collided — this pins the underlying data shape so
    // the fix (keying by post.id instead) has something concrete to guard against regressing.
    const sameInstant = new Date("2026-08-08T17:20:18.358Z");
    const a = post({ id: "post-a", createdAt: sameInstant });
    const b = post({ id: "post-b", createdAt: sameInstant });
    const record = buildOperatingRecord([a, b], []);

    expect(record.timeline).toHaveLength(2);
    const ids = record.timeline.map((e) => (e.kind === "published" ? e.post.id : null));
    expect(ids.sort()).toEqual(["post-a", "post-b"]);
  });

  it("sorts the timeline newest first across published and no-publish entries", () => {
    const older = post({ id: "older", createdAt: new Date("2026-08-01T00:00:00.000Z") });
    const newer = post({ id: "newer", createdAt: new Date("2026-08-08T00:00:00.000Z") });
    const noPublish = rejection({ consideredAt: new Date("2026-08-05T00:00:00.000Z") });
    const record = buildOperatingRecord([older, newer], [noPublish]);

    expect(record.timeline.map((e) => e.at.toISOString())).toEqual([
      "2026-08-08T00:00:00.000Z",
      "2026-08-05T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    ]);
  });

  it("tallies the rejection breakdown by real tone", () => {
    const record = buildOperatingRecord(
      [],
      [
        rejection({ reason: 'Too similar to an existing post ("X") — 20% keyword overlap.' }),
        rejection({ reason: "No detected connection to Medha's domain." }),
        rejection({ reason: "Scored 4.2/10 — below the 6/10 publish bar." }),
        rejection({ reason: 'Cleared the editorial bar at 7.1/10 but ranked below "Y" (9/10).' }),
      ],
    );
    expect(record.rejectionBreakdown).toEqual({
      dedup: 1,
      "off-domain": 1,
      "below-bar": 1,
      outranked: 1,
      "generation-failed": 0,
      other: 0,
    });
  });

  it("groups source hit-rate by hostname, bucketing null urls as unknown", () => {
    const record = buildOperatingRecord(
      [post({ sources: ["https://www.simonwillison.net/a"] }), post({ id: "post-2", sources: ["https://simonwillison.net/b"] })],
      [rejection({ url: null })],
    );
    const simon = record.sources.find((s) => s.host === "simonwillison.net");
    const unknown = record.sources.find((s) => s.host === UNKNOWN_SOURCE);
    expect(simon).toMatchObject({ published: 2, rejected: 0 });
    expect(unknown).toMatchObject({ published: 0, rejected: 1 });
  });

  it("computes a clearance rate from real published+rejected counts", () => {
    const record = buildOperatingRecord([post(), post({ id: "post-2" })], [rejection(), rejection()]);
    expect(record.clearanceRatePercent).toBe(50);
  });

  it("returns null clearance rate rather than a misleading 0 or NaN when nothing has happened yet", () => {
    const record = buildOperatingRecord([], []);
    expect(record.clearanceRatePercent).toBeNull();
  });
});
