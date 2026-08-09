# SETUP_TODO

What's already done, what's still yours to do, in order. **Read the eligibility checklist first —
Stage 1 of the hackathon's evaluation process automatically disqualifies submissions that fail it,
before anyone looks at feature quality.**

## Eligibility checklist (Stage 1 — automatic pass/fail)

- [x] **Repository is publicly accessible** — verified: `https://github.com/aroy2o/medha_ai_creator`
      returns 200 unauthenticated, as does the raw README.
- [x] **AI Usage Log is included and accessible** — [`PROMPTS.md`](./PROMPTS.md), explicitly labeled
      as such and linked from the top of `README.md`.
- [x] **Live Demo URL is functional** — re-verified 2026-08-09 against the real production URL,
      `https://medha-ai.aroy2o.xyz` (custom domain, already configured): all seven pages
      (`/`, `/feed`, `/feed/[id]`, `/editorial-log`, `/memory`, `/constitution`, `/stats`) return
      200 with no error markers, `/feed.xml` serves a real RSS feed with the correct content-type,
      and `GET /api/agent/feed?agentId=...` returns real posts in the exact contract shape, reverse
      chronological, including the newer stance/score-breakdown/topicTags additions.
- [x] **Autonomous publishing no longer depends on an external cron service.** This item used to
      flag cron-job.org as unverified and unverifiable from here — that risk was real: a
      2026-08-09 production check found **8.6 hours with zero autonomous posts**, because nothing
      had ever confirmed an external cron job was actually configured and firing. Fixed by moving
      the trigger *inside the app*: `GET /api/agent/feed` — the exact endpoint the spec guarantees
      the evaluator polls repeatedly after init — now runs a real cycle itself (via `after()`) when
      one is due, no external scheduler needed at all. Verified live, not assumed: a real
      end-to-end test showed a single feed poll, with no direct call to `/api/agent/cycle`,
      autonomously publish a genuinely new post moments later. See README.md "Autonomous
      scheduling" for the full mechanism and its honestly-documented edges (best-effort overlap
      protection on serverless; a poll has to actually arrive to restart the clock — acceptable
      given the spec's own polling guarantee).
- [x] Submission belongs to a registered team / received before deadline — outside what I can verify
      or affect; that's on your hackathon platform account, not this repo.

## Already done (during the autonomous build session, 2026-08-08 to 2026-08-09)

- Real Groq API key and Supabase Postgres password were provided mid-build and are already wired
  into the local, gitignored `.env` — nothing placeholder about them.
- The database schema is migrated on the live Supabase instance (`prisma/migrations/`), including
  later migrations adding `Post.stance` (stance tracking) and `RejectedTopic.url` (held-over topic
  reconsideration).
- The Medha persona has been **initialized for real** against that live database. If you call
  `/init` again to re-derive the id, use `name: "Medha"` (it was renamed in place from "Aria" mid
  -build — see README.md "Decisions"). The `agentId` isn't recorded anywhere outside the database
  itself; find it via Prisma Studio (`npx prisma studio`) or by calling `/init` again (idempotent
  -safe — you'll get the same id back, not a duplicate).
- **Nine real posts exist** in that database from testing the cycle route end-to-end across several
  sessions (real discovery, real editorial judgment, real Groq generation and self-critique — not
  synthetic test data), including live proof of cross-source corroboration, held-over topic
  reconsideration, and the new feed-triggered autonomous scheduling all actually firing. Same
  decision as before: leave them (they demonstrate the system working) or wipe them for a pristine
  start. To wipe: Prisma Studio, delete rows from `Post` and `RejectedTopic` for that agent (leave
  `Agent` and `PersonaProfile` alone so `/init` stays idempotent-safe).
- `CRON_SECRET` was generated locally (`.env`) for testing — still used to authenticate the manual
  `POST /api/agent/cycle` path (see README "Autonomous scheduling"), so keep it set on Vercel even
  though nothing external needs to know it anymore.
- `MOCK_MODE=false` locally, since a real Groq key is present — real generation (including the
  two-pass draft-then-critique flow) has been exercised and reviewed, not just the mock path.
- Repo pushed to `https://github.com/aroy2o/medha_ai_creator`, branch `main`.
- **A real production incident already happened and is fixed**: Vercel's `DATABASE_URL` was set to
  Supabase's direct connection string, which fails from serverless (no reliable IPv6 egress and/or a
  low connection cap). Diagnosed via the actual Vercel Runtime Log (not guessed), then failed a
  *second* time with `P1000: Authentication failed` because the pooled connection needs a different,
  project-qualified username (`postgres.rcdzjgkjppgqijfhqlsf`, not `postgres`) and the password's
  special characters (`!`, `&`) must be percent-encoded or the URL parses wrong. The exact, verified
  -working connection string is below — full account in `PROMPTS.md`.

## What you need to do

1. ~~Push to a git remote~~ — done.

2. ~~Confirm Vercel's `DATABASE_URL` is the pooled connection string~~ — done, verified 2026-08-09:
   `GET /api/agent/feed` on the live production URL returns real data, so the DB connection is
   confirmed working end-to-end in production, not just locally.

3. ~~Custom domain~~ — done: `https://medha-ai.aroy2o.xyz`.

4. ~~Set up cron-job.org~~ — no longer required. `GET /api/agent/feed` triggers cycles itself now
   (see README.md "Autonomous scheduling"); nothing to configure beyond having already deployed.
   `POST /api/agent/cycle` (header `x-cron-secret: <your CRON_SECRET value>`) still works if you
   ever want a manual trigger or tighter, poll-independent timing via an external scheduler.

5. **Give the evaluator whatever they need to discover Medha** — typically just
   `https://medha-ai.aroy2o.xyz`. They call `POST /api/agent/init` themselves (idempotent-safe) and
   then poll `GET /api/agent/feed?agentId=...`.

## Known limitations, not blockers

- Reddit's RSS endpoint bot-challenges this build environment's IP (429, then a 403 challenge page).
  May or may not work from Vercel's IPs — handled by the same graceful-degradation path as any other
  discovery-source failure, so not something to fix before deploying. Six other sources cover for it.
- arXiv's feed is legitimately empty on weekends (it doesn't publish new listings Sat/Sun) — observed
  live during testing. Not a bug; the other six sources still run.
- No image generation, no autonomous social platform posting — explicitly out of scope per the
  spec. (One-click Share buttons on the feed — X/LinkedIn/WhatsApp web intents, Threads via
  clipboard — were added since these are human-initiated, not Medha posting on her own; see
  README.md "One-click sharing" and "Decisions".)
