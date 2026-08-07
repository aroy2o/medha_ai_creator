# Aria — Autonomous AI Creator

Aria is an autonomous "Applied AI Systems Analyst" persona: an app that discovers topics from live
sources, judges them against explicit editorial criteria (including rejecting most of them), writes
about the one that clears the bar in a consistent voice, remembers what it's already covered so it
doesn't repeat itself, and publishes over time without further human input. Built for a hackathon
problem statement evaluated by a harness that polls a feed endpoint over a 48-hour window.

Live persona: grounded, technically precise, focused on production AI reliability, deployment
lessons, and failure modes — skeptical of hype, interested in what actually breaks.

## Architecture

- **Next.js 16** (App Router, TypeScript strict mode) — frontend and API routes in one app
- **Tailwind CSS v4** — neutral grays, subtle borders, no gradients
- **Redux Toolkit** — feed data + loading/error state on the frontend (`src/store/`)
- **Prisma 7** (driver-adapter client) against **Postgres** (Supabase) — both local dev and
  production use the same live database; see [Decisions](#decisions) for why
- **Groq** (`llama-3.3-70b-versatile`, OpenAI-compatible client) for post generation
- Four free, unauthenticated discovery sources: Hacker News (Firebase API), arXiv `cs.AI` RSS,
  Reddit `r/MachineLearning` RSS, GitHub Trending (scraped — no free official API exists)

```
src/
  app/
    page.tsx                 persona page (/)
    feed/page.tsx             feed page (/feed)
    editorial-log/page.tsx    rejected-topics page (/editorial-log)
    memory/page.tsx           memory map page (/memory)
    api/agent/init/route.ts   POST /api/agent/init
    api/agent/feed/route.ts   GET  /api/agent/feed
    api/agent/cycle/route.ts  POST /api/agent/cycle  (CRON_SECRET-protected)
  lib/
    discovery/                one module per source, each independently callable
    editorial/                keyword extraction, Jaccard similarity, memory index,
                               scoring rubric, judge orchestrator — all pure & unit-tested
    generation.ts              Groq call + MOCK_MODE
    persona.ts                 Aria's voice/standards (seeded into PersonaProfile at init)
    db.ts                      Prisma client singleton
  components/                  FeedView, CycleCountdown, MemoryGraphSvg, route loading/error
  store/                       Redux Toolkit store + feedSlice
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

`POST /api/agent/cycle` (auth'd via `x-cron-secret`) runs one full pass:

1. **Discover** — all four sources are queried sequentially (small delay between calls, out of
   courtesy to free APIs). A source that errors or times out contributes zero candidates and gets
   logged; it never takes the other three down with it.
2. **Judge** (`lib/editorial/judge.ts`) — every candidate is scored against five weighted criteria
   (relevance to domain 0.30, technical substance vs. hype 0.25, timeliness 0.15, novelty vs.
   memory 0.20, source credibility 0.10) on a 0–10 scale. Two hard gates override the weighted
   score entirely: zero domain relevance, or ≥0.15 Jaccard keyword overlap with an already-published
   post (see [Decisions](#decisions) for how that threshold was actually tuned). A candidate needs
   a weighted total ≥6.0 **and** to clear both gates to be publishable.
3. **Rank and log** — the highest-scoring candidate that clears the bar is the winner; every other
   candidate considered that cycle (capped at 8, but "at least a few" is typical since dozens are
   usually discovered) is logged to `RejectedTopic` with the real reason: hard-rejected, below the
   bar, or outranked by the winner. If nothing clears the bar, nothing is published — that's treated
   as correct editorial behavior, not a failure.
4. **Generate** (`lib/generation.ts`) — Groq writes the post body, a short "why this, why now"
   framing, and topic tags, in Aria's voice. The *"why chosen over alternatives"* half of the
   rationale is built from the judge's own structured output, not the model — the model doesn't
   reliably know what else was discovered that cycle, and letting it invent plausible-sounding
   alternatives would undermine the whole point of an auditable editorial log.
5. **Publish** — the post is saved with its sources, rationale, and topic tags (enriched with a few
   keywords from the *original candidate's title*, not just what Groq chose — see Decisions).

A generation failure for an otherwise-winning candidate publishes nothing and logs the failure —
same treatment as "nothing cleared the bar," not a silent fallback to unlabeled placeholder content.

**Pacing guard**: if the most recent post is younger than `CYCLE_INTERVAL_HOURS`, the route returns
`200 { skipped: true }` without touching any discovery source or Groq quota. This keeps "publishes
over time, not all at once" true by construction rather than by trusting the external cron
configuration alone.

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
npm test        # vitest — 60 unit tests over the pure editorial/discovery/generation logic
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
   (port 5432), which works fine for a long-lived dev process. Vercel serverless functions open many
   short-lived connections and can exhaust a direct connection's limit — switch `DATABASE_URL` to
   Supabase's **Transaction pooler** string (port 6543, `?pgbouncer=true`, found under Project
   Settings → Database → Connection pooling) before relying on this in production.
3. **cron-job.org**: point it at `POST https://<your-domain>/api/agent/cycle` with header
   `x-cron-secret: <your CRON_SECRET>`, on whatever interval you configured
   `CYCLE_INTERVAL_HOURS` to (the route's own pacing guard is a backstop, not a substitute for a
   sane cron schedule).

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
  vocabulary regardless of how Aria's prose phrases it. Re-measured at 0.171, threshold moved to
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
