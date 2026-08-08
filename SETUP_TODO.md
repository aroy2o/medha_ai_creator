# SETUP_TODO

What's already done, what's still yours to do, in order. **Read the eligibility checklist first —
Stage 1 of the hackathon's evaluation process automatically disqualifies submissions that fail it,
before anyone looks at feature quality.**

## Eligibility checklist (Stage 1 — automatic pass/fail)

- [x] **Repository is publicly accessible** — verified: `https://github.com/aroy2o/medha_ai_creator`
      returns 200 unauthenticated, as does the raw README.
- [x] **AI Usage Log is included and accessible** — [`PROMPTS.md`](./PROMPTS.md), explicitly labeled
      as such and linked from the top of `README.md`.
- [x] **Live Demo URL is functional** — verified 2026-08-09 against the real production URL,
      `https://medha-ai.aroy2o.xyz` (custom domain, already configured): all four pages
      (`/`, `/feed`, `/editorial-log`, `/memory`) return 200 with no error markers, and
      `GET /api/agent/feed?agentId=...` returns real posts in the exact contract shape, reverse
      chronological, including the newer stance/score-breakdown/topicTags additions.
- [ ] **cron-job.org is actually configured and firing** — this is the one that matters most and
      isn't something I can verify from here (no Vercel/cron-job.org access). Every post published
      so far was from *manual* testing, not an autonomous trigger. If this isn't wired up before the
      evaluator starts polling, "autonomous operation after initialization" — the top-weighted
      criterion — has nothing to show. See step 3 below for the exact config.
- [x] Submission belongs to a registered team / received before deadline — outside what I can verify
      or affect; that's on your hackathon platform account, not this repo.

## Already done (during the autonomous build session, 2026-08-08 to 2026-08-09)

- Real Groq API key and Supabase Postgres password were provided mid-build and are already wired
  into the local, gitignored `.env` — nothing placeholder about them.
- The database schema is migrated on the live Supabase instance (`prisma/migrations/`), including a
  later migration adding `Post.stance` for the editorial-stance-tracking feature.
- The Medha persona has been **initialized for real** against that live database. If you call
  `/init` again to re-derive the id, use `name: "Medha"` (it was renamed in place from "Aria" mid
  -build — see README.md "Decisions"). The `agentId` isn't recorded anywhere outside the database
  itself; find it via Prisma Studio (`npx prisma studio`) or by calling `/init` again (idempotent
  -safe — you'll get the same id back, not a duplicate).
- **Four real posts exist** in that database from testing the cycle route end-to-end across two
  sessions (real discovery, real editorial judgment, real Groq generation and self-critique — not
  synthetic test data). Same decision as before: leave them (they demonstrate the system working,
  including the newer self-critique/continuity/stance features) or wipe them for a pristine start.
  To wipe: Prisma Studio, delete rows from `Post` and `RejectedTopic` for that agent (leave `Agent`
  and `PersonaProfile` alone so `/init` stays idempotent-safe).
- `CRON_SECRET` was generated locally (`.env`) for testing — reuse it or rotate it, your call, just
  make sure cron-job.org and your Vercel env var match whichever value you land on.
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

4. **Set up cron-job.org** (the one remaining item, and the highest-priority one — see checklist
   above):
   - New cron job → URL: `https://medha-ai.aroy2o.xyz/api/agent/cycle`
   - Method: `POST`
   - Custom header: `x-cron-secret: <your CRON_SECRET value>`
   - Body: none needed (the route defaults to the one existing agent when no `agentId` is given).
   - Schedule: every `CYCLE_INTERVAL_HOURS` (4h is a reasonable default — gives up to ~12 possible
     cycles across a 48h window, though not every cycle will necessarily publish, by design).
   - **After setting it up, wait for one real scheduled firing and check the feed actually grew**
     without you doing anything — that's the actual proof this criterion is met, not just that the
     cron job exists.

5. **Give the evaluator whatever they need to discover Medha** — typically just
   `https://medha-ai.aroy2o.xyz`. They call `POST /api/agent/init` themselves (idempotent-safe) and
   then poll `GET /api/agent/feed?agentId=...`.

## Known limitations, not blockers

- Reddit's RSS endpoint bot-challenges this build environment's IP (429, then a 403 challenge page).
  May or may not work from Vercel's IPs — handled by the same graceful-degradation path as any other
  discovery-source failure, so not something to fix before deploying. Six other sources cover for it.
- arXiv's feed is legitimately empty on weekends (it doesn't publish new listings Sat/Sun) — observed
  live during testing. Not a bug; the other six sources still run.
- No image generation, no real social platform posting — explicitly out of scope per the spec.
