# SETUP_TODO

What's already done, what's still yours to do, in order.

## Already done (during the autonomous build session, 2026-08-08)

- Real Groq API key and Supabase Postgres password were provided mid-build and are already wired
  into the local, gitignored `.env` — nothing placeholder about them.
- The database schema is migrated on the live Supabase instance (`prisma/migrations/`).
- The Medha persona has been **initialized for real** against that live database:
  `POST /api/agent/init` was called with `{ name: "Aria", domain: "Applied AI Systems Analyst — production AI reliability, deployment lessons, and failure modes" }`, then later renamed in place to
  "Medha" (same `agentId`, same posts — see README.md "Decisions"). If you call `/init` again to
  re-derive the id, use `name: "Medha"` now, not "Aria".
  The resulting `agentId` isn't recorded anywhere outside the database itself (by design — it's not
  a secret, just not something this file should hardcode). To find it: open Prisma Studio
  (`npx prisma studio`) and check the `Agent` table, or call `POST /api/agent/init` again with the
  same persona name after deploying — the idempotency guarantee means you'll get the *same*
  `agentId` back, not a duplicate.
- **Two real posts already exist** in that database from testing the cycle route end-to-end (real
  discovery, real editorial judgment, real Groq generation — not synthetic test data). Decision
  point for you: leave them (they're genuine and demonstrate the system working) or wipe them for a
  pristine start before the official 48-hour evaluation window. To wipe: open Prisma Studio and
  delete rows from `Post` and `RejectedTopic` for that agent (leave `Agent` and `PersonaProfile`
  alone so `/init` stays idempotent-safe against re-runs).
- `CRON_SECRET` was generated locally (`.env`) for testing — reuse it or rotate it, your call, just
  make sure cron-job.org and your Vercel env var match whichever value you land on.
- `MOCK_MODE=false` locally, since a real Groq key is present — real generation has been exercised
  and reviewed, not just the mock path.

## What you need to do

1. **Push to a git remote.** This repo has commits but no remote configured — `git remote add
   origin <your-repo-url>` then `git push -u origin main`. (I didn't create a GitHub repo or push
   anywhere myself — that's an externally-visible action I left for you.)

2. **Deploy to Vercel.**
   - Import the repo at vercel.com/new.
   - Set environment variables (copy real values from your local `.env`, which is gitignored and
     was never committed):
     - `DATABASE_URL` — **before deploying, switch this to Supabase's pooled connection string**
       (Project Settings → Database → Connection pooling → "Transaction" mode, port 6543,
       `?pgbouncer=true`). What's in your local `.env` right now is the *direct* connection
       (port 5432), which is fine for a long-lived local process but not for serverless functions
       opening many short-lived connections.
     - `GROQ_API_KEY`
     - `MOCK_MODE=false`
     - `CRON_SECRET`
     - `CYCLE_INTERVAL_HOURS` (defaults to `4` if unset)
   - Deploy.

3. **Set up cron-job.org.**
   - New cron job → URL: `https://<your-vercel-domain>/api/agent/cycle`
   - Method: `POST`
   - Custom header: `x-cron-secret: <your CRON_SECRET value>`
   - Body: none needed (the route defaults to the one existing agent when no `agentId` is given in
     the JSON body).
   - Schedule: every `CYCLE_INTERVAL_HOURS` (4h is a reasonable default — gives up to ~12 possible
     posts across a 48h window, though not every cycle will necessarily publish, by design).

4. **Custom domain (optional).** If you want one instead of the default `*.vercel.app` URL, add it
   under the Vercel project's Domains tab and follow Vercel's DNS instructions (CNAME or A record
   at your registrar). Not required for the evaluator's feed-polling to work.

5. **Give the evaluator whatever they need to discover Medha** — typically just the base URL. They
   call `POST /api/agent/init` themselves (idempotent-safe — they'll get the same `agentId` back
   if you already initialized it) and then poll `GET /api/agent/feed?agentId=...`.

## Known limitations, not blockers

- Reddit's RSS endpoint bot-challenged this build environment's IP during testing (429, then a 403
  challenge page). It may or may not work from Vercel's IPs — handled by the same graceful-
  degradation path as any other discovery-source failure either way, so it's not something to fix
  before deploying, just something to be aware of if the feed skews toward the other three sources.
- No image generation — explicitly out of scope per the original spec.
