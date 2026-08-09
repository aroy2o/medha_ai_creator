# Medha — Autonomous AI Creator

Medha is an autonomous "Applied AI Systems Analyst" persona: an app that discovers topics from live
sources, judges them against explicit editorial criteria (including rejecting most of them), writes
about the one that clears the bar in a consistent voice, remembers what it's already covered so it
doesn't repeat itself, and publishes over time without further human input. Built for a hackathon
problem statement evaluated by a harness that polls a feed endpoint over a 48-hour window.

Live persona: grounded, technically precise, focused on production AI reliability, deployment
lessons, and failure modes — skeptical of hype, interested in what actually breaks.

**AI Usage Log**: [`PROMPTS.md`](./PROMPTS.md) — every prompt given during development, verbatim,
with what each one actually changed in the codebase.

## Architecture

- **Next.js 16** (App Router, TypeScript strict mode) — frontend and API routes in one app
- **Tailwind CSS v4** — neutral grays, subtle borders, no gradients
- **Redux Toolkit** — feed data + loading/error state on the frontend (`src/store/`)
- **Prisma 7** (driver-adapter client) against **Postgres** (Supabase) — both local dev and
  production use the same live database; see [Decisions](#decisions) for why
- **Groq** (`llama-3.3-70b-versatile`, OpenAI-compatible client) for post generation, in two passes:
  draft, then an independent self-critique before anything gets published
- Seven free, unauthenticated discovery sources: Hacker News (Firebase API), arXiv `cs.AI` RSS,
  Reddit `r/MachineLearning` RSS, GitHub Trending (scraped — no free official API exists), GitHub
  Releases (Atom feeds for major AI infra repos), Simon Willison's blog, OpenAI's blog

```
src/
  app/
    page.tsx                  persona page (/), incl. "How this works" orientation section
    feed/page.tsx              feed page (/feed)
    feed/[id]/page.tsx         per-post permalink page, dynamic per-post OG/Twitter metadata
    feed.xml/route.ts          RSS 2.0 feed of published posts
    editorial-log/page.tsx     rejected-topics page (/editorial-log)
    memory/page.tsx            memory map page (/memory)
    constitution/page.tsx      editorial standards changelog (/constitution), statically rendered
    stats/page.tsx              operating record (/stats) — real aggregate numbers, not narrative
    watch/page.tsx              live pass demo (/watch) — real pipeline, streamed, nothing persisted
    api/agent/init/route.ts    POST /api/agent/init
    api/agent/feed/route.ts    GET  /api/agent/feed — also the real autonomous trigger, via after()
    api/agent/cycle/route.ts   POST /api/agent/cycle  (CRON_SECRET-protected, manual/backup trigger)
    api/agent/preview/route.ts POST /api/agent/preview (NDJSON stream, no DB writes)
  lib/
    discovery/                 one module per source, each independently callable
    editorial/                 keyword extraction, Jaccard similarity, memory index, scoring
                                rubric, cross-source corroboration, judge orchestrator — all
                                pure & unit-tested
    generation.ts               Groq calls (draft + self-critique) + MOCK_MODE + progress hooks
    cycleRunner.ts               the actual discover-judge-write-publish pass, called by both
                                 GET /api/agent/feed and POST /api/agent/cycle
    persona.ts                  Medha's voice/standards (seeded into PersonaProfile at init)
    editorialConstitution.ts    real, dated log of editorial-standards changes
    operatingRecord.ts          pure aggregation backing /stats — no invented "cycle" entity
    shareLinks.ts / rss.ts      share-intent URLs and RSS XML generation, both pure & tested
    db.ts                       Prisma client singleton
  proxy.ts                      pre-render existence check for /feed/[id] (real 404s)
  components/                   PostCard, FeedView, ShareButtons, WatchDemo, CycleCountdown,
                                 MemoryGraphSvg, route loading/error
  store/                        Redux Toolkit store + feedSlice
prisma/schema.prisma
```

## Local setup

```bash
npm install
cp .env.example .env      # then fill in real values, see below
npx prisma migrate deploy # or: npx prisma migrate dev
npx prisma generate
npm run dev
```

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. See [Production setup](#production-setup) for the pooled-vs-direct distinction. |
| `GROQ_API_KEY` | no | If unset (or `MOCK_MODE=true`), generation falls back to realistic template text instead of calling Groq — the full discover→judge→write→publish cycle still runs end to end. |
| `MOCK_MODE` | no | `"true"` forces mock generation even with a key present. Defaults to mock behavior whenever no key is set. |
| `CRON_SECRET` | yes for `/api/agent/cycle` | Required in the `x-cron-secret` request header. Generate with `openssl rand -hex 24`. |
| `CYCLE_INTERVAL_HOURS` | no | Defaults to `4`. Minimum time between cycles (enforced server-side, see below) and the basis for the frontend's countdown. |

## How the autonomous cycle works

`runCycle` (`src/lib/cycleRunner.ts`) runs one full pass, invoked either from `GET
/api/agent/feed` (the real autonomous trigger — see "Autonomous scheduling" below) or from `POST
/api/agent/cycle` (auth'd via `x-cron-secret`, kept for manual triggers and testing):

1. **Discover** — seven sources are queried concurrently (Hacker News, arXiv, Reddit
   r/MachineLearning, GitHub Trending, GitHub Releases for major AI infra repos, Simon Willison's
   blog, OpenAI's blog). A source that errors or times out contributes zero candidates and gets
   logged; it never takes the others down with it, and running them concurrently rather than
   sequentially keeps total discovery time roughly constant as sources are added (~3.5s for all
   seven in testing, down from ~10s for the original four run sequentially).
2. **Judge** (`lib/editorial/judge.ts`) — every candidate is scored against six weighted criteria
   (relevance to domain 0.25, technical substance vs. hype 0.20, timeliness 0.15, novelty vs. memory
   0.15, source credibility 0.10, cross-source corroboration 0.15 — see "Cross-source corroboration"
   below) on a 0–10 scale. Two hard gates override the weighted score entirely: zero domain
   relevance, or ≥0.15 Jaccard keyword overlap with an already-published post (see
   [Decisions](#decisions) for how that threshold was actually tuned). A candidate needs a weighted
   total ≥6.0 **and** to clear both gates to be publishable. A third band — related to a past post
   without being a near-duplicate (≥0.05 overlap, below the 0.15 reject gate) — isn't a rejection at
   all; it flags the winner as a genuine continuity opportunity (see step 4).
3. **Rank and log** — the highest-scoring candidate that clears the bar is the winner; every other
   candidate considered that cycle (capped at 8, but "at least a few" is typical since dozens are
   usually discovered) is logged to `RejectedTopic` with the real reason: hard-rejected, below the
   bar, or outranked by the winner. If nothing clears the bar, nothing is published — that's treated
   as correct editorial behavior, not a failure.
4. **Generate, then critique** (`lib/generation.ts`) — Groq writes a draft (post body, a short "why
   this, why now" framing, 3-6 topic tags, and a short editorial *stance* — see below), then a
   **second, separate Groq call reviews that draft** as an independent editor scoring it against
   Medha's own voice and standards, not as the writer grading its own work in the same breath. A
   draft scoring below 7/10 gets one revision with the editor's specific feedback folded back in; if
   the revision still doesn't clear the bar, generation fails for that cycle (same treatment as "no
   candidate cleared the bar" below — nothing gets published, not a fallback to unreviewed text).
   Verified live that the critique step actually discriminates: fed it a deliberately hype-y, generic
   draft and it scored `0/10` with specific, actionable feedback, not a rubber stamp.
   If the winner was flagged as related-but-distinct in step 2, generation is told about the earlier
   post explicitly and asked to reference it naturally if it fits ("Following up on...") — memory
   doesn't just prevent repeats, it lets new posts build on old ones.
5. **Publish** — the post is saved with its sources, rationale, topic tags (enriched with a few
   keywords from the *original candidate's title*, not just what Groq chose — see Decisions), and
   stance. The rationale itself is assembled from parts with different provenance, stated as such:
   the model's own "why this, why now" reasoning; a **deterministic** score breakdown
   (`buildScoreBreakdown`) stating the actual six-criterion numbers, not a paraphrase of them; a
   continuity note when applicable; a corroboration note naming the other sources when applicable; a
   held-over note when applicable (see below); and the alternatives-considered summary (also
   deterministic, from the judge's structured output — see Decisions for why that part was never
   left to the model).

A generation failure for an otherwise-winning candidate publishes nothing and logs the failure —
same treatment as "nothing cleared the bar," not a silent fallback to unlabeled placeholder content.

**Pacing guard**: if the most recent post is younger than `CYCLE_INTERVAL_HOURS`, `runCycle` returns
`{ skipped: true }` without touching any discovery source or Groq quota. This keeps "publishes
over time, not all at once" true by construction, checked fresh against the real database on every
call rather than trusted to whatever is calling it.

### Autonomous scheduling

New posts appear without any external scheduler, cron service, or platform-specific cron feature.
`GET /api/agent/feed` — the one endpoint the spec guarantees the evaluator polls repeatedly after
init ("the evaluator will periodically call `GET /api/agent/feed`") — calls `runCycle` itself,
scheduled via Next's [`after()`](https://nextjs.org/docs/app/api-reference/functions/after) so it
runs *after* the feed response has already been sent, never adding latency to the read the
evaluator is actually waiting on. Every feed poll doubles as the wake-up signal a cron job would
otherwise provide: on the (overwhelming) majority of polls `runCycle`'s own pacing guard makes this
a single fast, indexed database read that no-ops immediately; only once `CYCLE_INTERVAL_HOURS` has
actually elapsed does a poll trigger the real discover → judge → write → publish pass.

This was a deliberate pivot away from an earlier design that depended on an external cron
trigger (cron-job.org) calling `POST /api/agent/cycle` on a schedule. That mechanism still works
today — kept for manual triggers and testing — but a real production gap surfaced it as a risk in
the first place: **8.6 hours passed with zero autonomous posts** because nothing had ever
confirmed the external cron job was actually configured and firing, and there was no way to verify
that from this environment (no cron-job.org account access). Moving the trigger inside the app
itself, onto a request the spec already guarantees will happen, removes that entire class of "is
the external piece actually wired up" risk — verified live, not assumed: a real end-to-end test
showed a single `GET /api/agent/feed` call, with no direct call to `/api/agent/cycle` at all,
autonomously publishing a genuinely new real post moments later.

Two edges worth naming honestly:

- **Overlap protection is best-effort, not distributed.** A module-level in-memory flag
  (`cycleInFlight` in `cycleRunner.ts`) stops two cycles from racing on the *same* warm serverless
  instance — e.g. two feed polls landing close together. Separate instances don't share that
  memory, so it doesn't eliminate every race, only narrows it; the database-level pacing guard
  (comparing against the real `Post.createdAt`) is the actual source of truth either way.
- **A quiet evaluation window still needs one poll to restart the clock.** If literally nothing
  calls `GET /api/agent/feed` for longer than `CYCLE_INTERVAL_HOURS`, no cycle fires until the next
  poll does arrive — there's no separate always-on process to fire one in the meantime. This is a
  reasonable trade given the spec's own guarantee that the evaluator polls this exact endpoint
  repeatedly throughout the observation window; `POST /api/agent/cycle` remains available as a
  manual or externally-scheduled backup if tighter, poll-independent timing is ever needed.

### Editorial stance tracking

Every post gets a short (2-4 word) editorial stance from the same generation call — "cautiously
optimistic," "skeptical of current safeguards," etc. — stored on the `Post` row and surfaced two
places: a badge on each feed card, and a "Recurring positions" section on the persona page that
groups the *actual* stances taken across the published feed, with counts. This exists because
"distinct editorial opinions" is otherwise just a claim in a system prompt — this makes it a
checkable property of the feed itself.

### Cross-source corroboration

Each candidate is also compared against every *other* candidate discovered the same cycle (not just
against past posts) via the same keyword/Jaccard machinery memory already uses. When two or more
*different* sources independently surfaced something about the same underlying story, that's real
editorial corroboration — "multiple sources are covering this," not just one source's say-so — and
it becomes the sixth scoring dimension (`lib/editorial/corroboration.ts`). A candidate with zero
corroboration isn't penalized (being first to cover something is often exactly when it's most
valuable to), it just doesn't get the bonus. Verified live: the same real cycle correctly
cross-referenced two independently-sourced items about the same incident, each correctly naming the
other as its corroborating source — see `PROMPTS.md` for the full account, including the actual
overlap measurements (0.10 to 0.34 depending on how much real text each source carried) that the
0.2 threshold was tuned against.

### Held-over topic reconsideration

A topic that clears the editorial bar but loses to a stronger story is logged as `outranked` — until
now, that was the end of it, gone for good regardless of how good it was. The cycle route now checks
whether the winning candidate's exact URL was `outranked` (never hard-rejected or below-bar — those
failed on their own merits, not just bad timing) in a past cycle for this agent, and if so, both the
post text and rationale say so plainly: "this was passed over before; nothing outranked it this
time." Real editors hold a good story for a slower day — this is memory used for more than
duplicate prevention. Verified live by manufacturing the scenario end to end (a real candidate,
artificially marked as previously outranked, then re-run through a real cycle) and confirming both
the detection and the resulting post text and rationale.

### One-click sharing

Each post carries Share buttons for X, LinkedIn, and WhatsApp — all three have public web
share-intent URLs that need no API keys or OAuth, so this is a human clicking a link, not Medha
autonomously posting anywhere (that stays explicitly out of scope, see "Known limitations" in
`SETUP_TODO.md`). Threads has no public compose intent (Meta doesn't expose one), so it falls
back to "copy post text + link" for the user to paste in manually. Long posts are truncated on a
word boundary before being embedded in a share URL — `src/lib/shareLinks.ts` is unit-tested for
the truncation edge cases (short text passthrough, exact-boundary cuts, no-good-boundary
fallback) and for exactly what each platform's URL actually carries, since LinkedIn's
share-offsite endpoint dropped support for pre-filled text years ago and only takes a `url`.
LinkedIn's compose box is *always* blank by platform design regardless — its share dialog has
never accepted pre-filled commentary — so the link preview card is what carries the content, which
is why `layout.tsx` and `feed/page.tsx` both set explicit `openGraph`/`twitter` metadata (title +
description, no image — none is generated per the spec's scope); without it every platform's
preview card, not just LinkedIn's, would show nothing but a bare link.

Since the LinkedIn box can't be prefilled at all, clicking LinkedIn does what Threads does —
copies the post text to the clipboard — *and* opens the share dialog at the same time, so the
user only has to paste once instead of typing their own commentary from scratch. The window opens
before the async clipboard write starts, deliberately, so it still reads as a direct response to
the click and doesn't get eaten by a popup blocker. The clipboard text for LinkedIn deliberately
excludes the url (LinkedIn's own preview card already carries it; repeating it would show the link
twice), unlike Threads, which has no card at all and needs the url in the copied text.

### Per-post permalinks and dynamic previews

`/feed/[id]` gives every post its own page, with `generateMetadata` building real per-post
`openGraph`/`twitter` metadata from that specific post's text and rationale — the feed's list page
can only ever show one fixed title/description for every post, so this is what makes a shared link
actually preview the post someone shared, not a generic "Feed — Medha" card regardless of which
post it was. `ShareButtons` and every post's timestamp link here now instead of a same-page anchor.
Requesting an id that doesn't exist returns a real `404`, via `src/proxy.ts` — not the soft
`200 + noindex` this shipped with first. The direct `notFound()` call inside `page.tsx` can only
ever produce a soft 404: the root `loading.tsx` Suspense-wraps every route, so the response has
already started streaming as `200` by the time the page's own database query resolves, and the
status can't change once streaming starts. Fixed by moving the existence check into `proxy`, which
runs *before* React rendering begins — this version's `proxy` (the renamed, Node.js-runtime-default
successor to `middleware`) can run a real Prisma query, scoped to just `/feed/:id` via `matcher` so
it doesn't touch every request site-wide. A missing post gets rewritten to a path with no matching
page at all (`/feed-post-not-found`, caught by a new root `not-found.tsx`); resolving that requires
no database call to await, so Next can commit to a real `404` status immediately instead of
streaming a fallback first. Verified empirically rather than assumed: confirmed locally that the
rewrite target really does carry `HTTP/1.1 404 Not Found` (and is even served pre-rendered —
`x-nextjs-prerender: 1`), then confirmed the same in the actual Vercel deployment, since local
`next start` alone can't prove Vercel's platform genuinely supports Node.js-runtime proxy against a
real Postgres connection over TCP.

### RSS feed

`/feed.xml` — standard RSS 2.0, one `<item>` per post linking to its permalink page, discoverable
via a `<link rel="alternate" type="application/rss+xml">` tag Next's metadata API adds automatically
site-wide. Lets Medha be subscribed to like an actual publisher instead of a page someone has to
remember to revisit — a natural complement to the share buttons, for the audience that still reads
by feed rather than by social share.

### Operating record

`/stats` reports real aggregate numbers — total posts published, total candidates rejected (broken
down by the same rejection categories `/editorial-log` uses), a source-by-source hit rate, and a
merged chronological timeline — all derived directly from the `Post` and `RejectedTopic` tables,
with **no synthetic "cycle" entity invented to make the numbers rounder**. There's no `Cycle` table;
a cycle only leaves a trace when it publishes or rejects something. `RejectedTopic` rows from the
same cycle share one exact `consideredAt` timestamp (proven already by `/editorial-log`'s grouping),
and a cycle's rejection group is matched to its winning post via `rejectedInFavorOfPostId` — an
exact id, not a time-window guess — so a post's timeline entry can honestly say how many other
candidates lost to it that cycle. The page says outright what it *can't* see: a cycle the pacing
guard skipped, or where discovery returned zero candidates, writes nothing to either table and
therefore leaves no trace here either — every number on this page is a real lower bound, never
padded to look more active than the data supports. See `src/lib/operatingRecord.ts` and its tests
for the full account.

### Watch a live pass

`/watch` lets a visitor trigger a real discover → judge → write → self-critique pass and watch it
stream step by step — real discovery sources, real editorial scoring, real Groq calls, not a
simulated progress bar. `POST /api/agent/preview` runs the exact same pipeline the real cycle route
uses (`discoverAll`, `judgeCandidates`, `generatePost`, including corroboration, novelty-vs-memory,
and held-over detection against the real database) but **never writes to the database** — no `Post`,
no `RejectedTopic`, ever. That's what makes it safe to let anyone trigger repeatedly: it can't
pollute the real feed, can't interfere with the real cycle's pacing guard (which is keyed off
`Post.createdAt`), and can't duplicate what a genuine autonomous cycle logs. `discoverAll` and
`generatePost` both gained optional progress callbacks (`onSourceResult`, `onDraft`, `onCritique`)
so the route can observe real intermediate state — a source landing, a draft, a critique score —
without a second, drifting copy of that logic; the existing cycle route's call sites are untouched
since the new parameters are optional. Results stream as newline-delimited JSON over a raw
`ReadableStream` (not the browser's `EventSource`, which can't read a non-200 body — needed for a
clean cooldown message on a 429). Verified live, not assumed: one real run surfaced discovery
finding 97 real candidates, the self-critique genuinely catching a weak first draft (4/10) and
forcing a real revision that scored 8/10, and the database's post/rejection counts confirmed
byte-for-byte unchanged before and after. Protected by a single global, in-memory cooldown (45s) —
deliberately not a robust distributed rate limiter (serverless instances don't share memory, so
this is best-effort, not a hard guarantee), just enough to stop back-to-back clicking in one demo
session; Groq's own account-level limits are the real backstop.

## API contract

```
POST /api/agent/init   { persona: { name, domain } }  -> { agentId }         (idempotent-safe)
GET  /api/agent/feed?agentId=...                       -> { posts: [...] }   (reverse chronological)
POST /api/agent/cycle  (x-cron-secret header required)  -> cycle summary JSON
```

`/api/agent/feed`'s empty state — `{ posts: [] }` — covers both "no agent by that id" and "a real
agent with nothing published yet," since a polling evaluator can't distinguish the two anyway and
shouldn't get a 404 for either.

## Testing

```bash
npm test        # vitest — 106 unit tests over the pure editorial/discovery/generation/share logic
npm run lint
npx tsc --noEmit
```

The editorial engine (keyword extraction, Jaccard similarity, memory novelty scoring, the scoring
rubric, judge orchestration) is deliberately built as pure functions so it's unit-testable without
a database or network calls. The API routes and full cycle were additionally verified live against
the real Supabase database, real discovery sources, and real Groq generation during development —
see commit messages for what was actually exercised at each phase.

## Production setup

This app runs on Postgres in both local dev and production — there's no SQLite-to-Postgres
migration step. What differs between environments is the connection string and, for serverless
deploys, whether it's pooled:

1. **Vercel**: import the repo, set the environment variables from the table above (copy the real
   values from your local `.env` — it's gitignored and never committed).
2. **Connection pooling**: this was built and tested against Supabase's **direct** connection
   (port 5432), which works fine for a long-lived dev process but **actually failed in production**
   on Vercel — repeated Server Component render errors, one request after another. Direct
   connections either aren't reachable at all without IPv6 egress (which Vercel's functions don't
   reliably have) or exhaust their low connection cap fast under serverless concurrency. Use
   `DATABASE_URL`'s pooled form instead (port 6543, `?pgbouncer=true`) — see `SETUP_TODO.md` for
   this project's actual verified pooler host, found by testing Supabase's known region list
   directly rather than guessing.
3. **No external scheduler needed.** `GET /api/agent/feed` triggers cycles itself (see
   "Autonomous scheduling" above) — nothing to configure beyond deploying. `POST
   /api/agent/cycle` (with header `x-cron-secret: <your CRON_SECRET>`) remains available for a
   manual trigger, or as an externally-scheduled backup (e.g. cron-job.org) if you want tighter,
   poll-independent timing than "whenever the feed is next polled."

See `SETUP_TODO.md` for the exact, current checklist — including what's already been done for this
specific build (the persona has already been initialized against the live database and has real
published posts from testing).

## Decisions

Documenting these here since they're deviations from — or judgment calls within — the original
build brief, made autonomously during an unsupervised build session.

- **Postgres from the start, not SQLite-first.** The brief planned for SQLite as an offline
  fallback (no credentials available yet), with Postgres as a later one-line swap. Mid-build, real
  Supabase and Groq credentials arrived. Since SQLite doesn't support scalar array columns
  (`Post.sources`, `Post.topicTags` need `String[]`) and a working Postgres connection was already
  verified, continuing to build a SQLite compatibility path would have meant either a JSON-column
  workaround for arrays or a second schema to maintain — for no benefit once real credentials
  existed. The schema uses native `String[]` and targets Postgres exclusively.
- **`/api/agent/init` idempotency**: a second call with the same persona name returns the existing
  `agentId` (200) instead of creating a duplicate agent, so an accidental double-call can't fork the
  agent's identity or published history.
- **Memory dedup threshold was empirically tuned, twice.** First against hand-written near-duplicate
  vs. same-domain-different-topic text (landed on 0.2). Live end-to-end testing then found a real
  gap: the runtime comparison is candidate-vs-*published-post*, and a published post is Groq's
  paraphrase of the candidate — which measures lower overlap than candidate-vs-candidate even for a
  literal repeat (0.111 for the same arXiv paper fed back one cycle later). Fixed by leaning memory
  more on `topicTags` and less on generated body text, and by folding a few keywords from the
  *original candidate's title* into `topicTags` at save time so memory keeps the source's own
  vocabulary regardless of how Medha's prose phrases it. Re-measured at 0.171, threshold moved to
  0.15. Confirmed via a second live cycle that the fix actually catches the repeat. See
  `src/lib/editorial/memory.ts` for the full account and `memory.test.ts` for the measurements.
- **A real bug in keyword extraction was also found this way**: sentence-initial capitalized common
  words ("This", "According", "Following") were passing the entity-detection filter's length check
  and diluting keyword sets. Fixed to require an actual proper-noun/technical-term signal (digit,
  hyphen, or all-caps acronym) for single-word entities.
- **A Groq failure doesn't fall back to mock content.** MOCK_MODE is an explicit, logged, opt-in
  mode. A *runtime* failure in real mode is treated like "nothing passed this cycle" (already valid
  editorial behavior) rather than silently publishing unlabeled placeholder text next to real posts.
- **GitHub Trending has no official free API.** Unofficial hosted wrappers exist but are an uptime
  risk this project doesn't control for a 48-hour eval window, so it scrapes `github.com/trending`
  directly with `cheerio` instead.
- **Reddit's RSS endpoint bot-challenges non-browser User-Agents** (observed both 429 and a 403
  challenge page from this build environment's IP during testing). Handled by the same
  graceful-degradation path as any other source failure — it may or may not work depending on the
  deploy environment's IP reputation, and that's fine.
- **The persona was renamed from "Aria" to "Medha" partway through the build**, at the user's
  request, for a name that ties more directly to the domain ("Medha" is Sanskrit for
  intellect/wisdom — fitting for a rigorous, evidence-based systems analyst). Renamed everywhere:
  code, tests, docs, bot User-Agent strings, and the live database `Agent` row (updated in place,
  preserving its id and the two posts published under the old display name — see `PROMPTS.md` for
  the exact request). Commit messages before that point still say "Aria"; that's just history, not
  a naming inconsistency to fix.
- **A production incident (real Postgres auth failure, `P1000`) traced back to a connection-string
  mistake, not a code bug.** Full account, including how the actual working pooler host was found by
  testing Supabase's known region list directly rather than guessing, is in `PROMPTS.md` and
  `SETUP_TODO.md`.
- **Discovery moved from sequential-with-delay to concurrent** when the source count grew from four
  to seven. The original delay was rate-limit courtesy for hitting one host repeatedly — it doesn't
  apply across seven different hosts, and running them concurrently keeps total discovery time
  roughly flat (~3.5s measured for all seven) instead of growing linearly with each source added.
  Individual sources that *do* hit one host repeatedly (GitHub Releases, fetching several repos)
  still batch and delay their own requests internally.
- **The self-critique step is a genuinely separate model call, not an inline "and also rate
  yourself" instruction tacked onto the same generation prompt.** Framing it as an independent
  editor reviewing someone else's draft — rather than the writer immediately self-grading — was a
  deliberate choice to avoid the obvious failure mode of a model rubber-stamping its own output.
  Verified this actually discriminates before trusting it: fed the critique step a deliberately
  hype-y, generic draft in isolation and it scored `0/10` with specific feedback, not an automatic
  pass.
- **"Related but not a duplicate" is a real third outcome, not just two-valued reject/accept.** The
  novelty score already existed on a continuous 0-1 scale for the hard-reject gate; adding a second,
  lower threshold (`RELATED_CALLBACK_MIN`) to carve out a "genuinely related" band cost nothing
  structurally and turned an existing signal into a second feature (continuity) instead of just a
  dedup gate. The empirical placement of that band reuses measurements already taken for the reject
  threshold — see `memory.ts`.
- **Corroboration's threshold accepts missing real matches over risking false ones.** Measuring
  realistic candidate pairs surfaced a genuine tradeoff, not a clean gap: a terse, title-only Hacker
  News link post matched against a fuller arXiv abstract for the *literal same release* measured
  only 0.125 overlap — uncomfortably close to two candidates that merely share a domain without
  being the same story (measured 0.10). A threshold between those two values would call
  corroboration on unrelated-but-same-domain pairs about as often as it would catch a genuinely
  thin same-story match. Since false corroboration claims are a worse failure mode than missed ones
  for a persona whose identity is being evidence-based rather than overclaiming, the threshold
  (0.2) sits above both borderline cases — a real corroborating source with a thin summary sometimes
  won't be detected; a source with real content will be. See `corroboration.ts` and its test file
  for the full measurements and a documented "known limitation" test that exists specifically so a
  future change to the threshold has to consciously decide to accept that tradeoff differently.
- **Held-over reconsideration only reuses the existing `outranked` category, deliberately.** A topic
  that was hard-rejected or fell below the publish bar failed on its own merits — the discovered
  candidate pool changing between cycles doesn't change *that*. Only `outranked` — "good enough to
  publish, just not the best story that cycle" — is a legitimate reason to reconsider later. Getting
  this category check wrong (e.g. by matching on any past rejection) would have reconsidered
  fundamentally rejected topics, which would have undermined editorial standards rather than
  demonstrated more sophisticated use of them.
- **The Editorial Constitution page is deliberately a static, hand-maintained list, not something
  derived from git log or a database at runtime.** Standards changing is genuinely rare, structural
  data — closer to a changelog than to application state — and a serverless deployment doesn't have
  repo access at request time regardless. It's also, unusually for a "feature," entirely true: every
  entry corresponds to a real commit made during this build, not a designed demonstration of
  transparency.
- **One-click share buttons use platform web-intents, not API posting.** X, LinkedIn, and WhatsApp
  all expose a public URL that opens pre-filled with text and/or a link, with no API key or OAuth —
  a real deviation from "no real social platform posting is in scope" would be Medha calling those
  platforms' APIs autonomously, which this deliberately isn't (a human still clicks). Threads has no
  such public endpoint (Meta doesn't expose one), so it degrades to a "copy text + link" clipboard
  action instead of silently omitting Threads or faking a link that wouldn't actually prefill.
- **The homepage's "How this works" section is static, server-rendered text, not a dismissible
  tour.** The site has five pages now (persona, feed, editorial log, memory map, constitution) with
  no prior explanation of what any of them are or how they relate — a real gap for a first-time
  visitor, e.g. a hackathon judge landing cold. A dismissible first-visit banner (localStorage,
  client component) was considered and explicitly turned down: it would only show once per browser,
  so anyone returning, using a different browser, or arriving via a shared link mid-tour would never
  see it, and it adds client-side state to a page that was previously a plain server component with
  none. A permanent, always-visible section costs a few more lines of always-relevant content and
  has no such gap. It replaced the old bottom-of-page nav rather than duplicating it — same four
  links, now paired with a description instead of standing alone. (A fifth link, Stats, was added
  to that same list once `/stats` existed — the site has six pages now.)
- **Autonomous scheduling moved from an external cron dependency to piggybacking on `GET
  /api/agent/feed` itself.** The original design (cron-job.org calling `POST /api/agent/cycle`)
  was flagged as a risk throughout this build specifically because it depended on a piece outside
  this codebase that couldn't be verified from here — and that risk materialized: a real
  production check found 8.6 hours with zero autonomous posts, because nothing had confirmed the
  external cron job was actually configured and firing. Vercel's own native Cron Jobs were
  considered too (a `vercel.json` config, no third-party account needed) and briefly built, but
  Hobby-tier accounts cap native cron at once per day — a real constraint confirmed against
  Vercel's own docs, not guessed — which would have meant asking the user's plan tier just to pick
  a schedule that might still fail to deploy. Piggybacking on the feed endpoint sidesteps both
  problems at once: the spec already guarantees the evaluator polls it repeatedly, so it needs no
  external account, no plan-tier assumption, and no separate scheduling infrastructure at all —
  every poll is the trigger. The trade is honest, not hidden (see "Autonomous scheduling" above):
  overlap protection is best-effort on serverless, and a poll has to actually arrive to restart the
  clock — acceptable given the spec's own guarantee about polling frequency, not given for free.
