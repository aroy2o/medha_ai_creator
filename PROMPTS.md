# PROMPTS.md

A verbatim, chronological log of every prompt given during the autonomous
build session, so the build timeline is auditable. Where a message contained
live secrets (API keys, database passwords), the secret values are redacted
to `[REDACTED]` before being committed here — the build brief itself requires
that no secrets ever be committed to git, so verbatim logging stops at that
boundary. Everything else is reproduced as written.

---

## Prompt 1 — 2026-08-08 (initial build directive)

```
=== AUTONOMOUS BUILD DIRECTIVE ===
You are building a complete, production-grade submission for a hackathon
problem statement end-to-end, UNSUPERVISED, for the next 2-3 hours. I will
not be present to answer questions. Your job is to make sound engineering
decisions, document them, keep moving, and leave me a clear status report
when you stop (either because everything is done, or because you hit a
hard blocker only I can resolve — like needing a real API key).

=== PROJECT CONTEXT ===
Hackathon problem: "Autonomous AI Creator" — build an autonomous AI/tech
persona that discovers topics from live sources, exercises editorial
judgment (including REJECTING topics), writes in a consistent voice,
remembers past posts to avoid repetition, and publishes over time
(not all at once) without further human input, for a 48-hour evaluation
window during which an evaluator repeatedly polls a feed endpoint.

Persona to build: "Aria" — an Applied AI Systems Analyst persona. Voice:
grounded, technically precise, focused on production AI reliability,
real-world deployment lessons, and failure modes — not hype. Opinionated
but evidence-based. Skeptical of overclaimed AI capabilities, interested
in what actually breaks in production.

=== REQUIRED API CONTRACT (do not deviate) ===
POST /api/agent/init
  Request:  { "persona": { "name": string, "domain": string } }
  Response: { "agentId": string }
  Must be idempotent-safe but spec says called exactly once.

GET /api/agent/feed?agentId=abc-123
  Response: {
    "posts": [
      {
        "id": string (unique),
        "createdAt": ISO 8601 UTC string,
        "text": string,
        "rationale": string (why topic selected, why relevant now, why
                     chosen over alternatives considered),
        "sources": [string URLs]
      }
    ]
  }
  - Reverse chronological order (newest first)
  - Previously returned posts must remain available (never delete)
  - Empty state: { "posts": [] }

=== ARCHITECTURE (final, do not change stack) ===
- Next.js 14+ (App Router, TypeScript strict mode) — single repo, frontend
  + API routes together
- Tailwind CSS for styling — clean, minimal, professional. NO gradients,
  NO purple-blue SaaS-template look, NO emoji-heavy UI. Think: a serious
  analyst's dashboard, not a marketing landing page. Good typography
  hierarchy, generous whitespace, subtle borders instead of shadows/glows.
- Redux Toolkit for frontend state (feed data, loading/error states)
- Prisma ORM, Postgres provider (Supabase-compatible connection string)
- Groq API (OpenAI-compatible client, model: llama-3.3-70b-versatile or
  best available free-tier model) for all text generation/reasoning
- Free, no-key data sources for topic discovery: Hacker News Firebase API
  (https://hacker-news.firebaseio.com/v0/), arXiv RSS
  (http://export.arxiv.org/rss/cs.AI), GitHub Trending (scrape or use
  github-trending-api if available), Reddit RSS
  (https://www.reddit.com/r/MachineLearning/.rss)
- An internal secret-protected route /api/agent/cycle that an EXTERNAL
  cron service (cron-job.org) will hit every few hours — this route runs
  one full discover→judge→write→publish cycle. Protect it with a
  CRON_SECRET env var checked via header, return 401 if missing/wrong.
- No image generation, no ImageKit integration needed per-post (out of
  scope per spec) — just build a clean text-first UI.

=== DATA MODEL (Prisma schema) ===
- Agent(id, name, domain, createdAt)
- Post(id, agentId, text, rationale, sources String[], topicTags String[],
  createdAt)
- RejectedTopic(id, agentId, topic, reason, consideredAt,
  rejectedInFavorOfPostId String? references Post)
- PersonaProfile(agentId unique, styleGuide String, standingInterests
  String[], editorialStandards String)

=== MEMORY SYSTEM (build this properly, it's a core judged criterion) ===
Before writing any new post:
1. Pull all previously published posts' topicTags + key entities for this
   agent.
2. For each newly discovered candidate topic, compute a simple overlap
   score against existing memory (keyword/entity Jaccard similarity is
   fine — no need for embeddings given time constraints, but make the
   logic real and testable, not a stub).
3. If overlap exceeds a threshold (tune it, document your reasoning in
   code comments), either reject the topic (log to RejectedTopic with
   reason "too similar to post X") or find a genuinely novel angle before
   proceeding.
4. Always log at least 2-3 candidate topics considered per cycle (not
   just the winner) to RejectedTopic with real reasons, so editorial
   judgment is visible and auditable via the data, not just claimed.

=== EDITORIAL JUDGMENT ENGINE ===
Score each discovered topic against explicit, documented criteria before
generation (e.g. relevance to persona domain, technical substance vs
hype, timeliness/recency, novelty vs memory, source credibility). Reject
topics that don't clear the bar — this must be REAL filtering logic with
a visible rejection reason, not something that always approves.

=== AUTONOMOUS CYCLE LOGIC (/api/agent/cycle) ===
1. Auth check via CRON_SECRET header.
2. Fetch fresh candidates from the discovery sources.
3. Run editorial scoring + memory-dedup on all candidates.
4. Log rejected ones to RejectedTopic with reasons.
5. If at least one candidate passes: generate the post text (persona
   voice via Groq), generate rationale (why selected, why relevant now,
   why chosen over the logged alternatives), extract topicTags, save
   Post.
6. If none pass this cycle: do nothing, log nothing published (this is
   fine and expected — a cycle producing zero posts because nothing met
   the bar IS good editorial behavior, not a bug).
7. Return a JSON summary of what happened this cycle (for your own
   debugging, not part of the required contract).
8. Handle all external calls (Groq, RSS/API fetches) with proper
   try/catch, timeouts, and graceful degradation — a failed discovery
   source should not crash the whole cycle, just skip that source and
   log it.

=== FRONTEND (clean, differentiated, no gradients) ===
- Landing/persona page: who "Aria" is, editorial standards stated
  plainly, a live "time until next cycle" indicator (compute from last
  cycle timestamp + interval, display client-side).
- Feed page: published posts, each showing text, rationale, sources,
  timestamp — reverse chronological.
- Editorial log page: rejected topics with reasons — this is your
  differentiation, make it genuinely readable, not an afterthought.
- Simple memory visualization: a lightweight SVG/graph (no heavy library
  needed — hand-roll with topic nodes and shared-entity edges) showing
  how posts relate to each other. Keep it simple and correct over fancy
  and broken.
- Loading states, empty states (zero posts yet — must not crash or show
  blank white screen, show a clear "first cycle pending" message), and
  error states throughout. This app WILL be viewed with zero posts
  initially — design for that explicitly.

=== PRODUCTION-GRADE STANDARDS (non-negotiable) ===
- TypeScript strict mode, no `any` unless truly unavoidable (comment why)
- All environment variables (DATABASE_URL, GROQ_API_KEY, CRON_SECRET)
  read via process.env, validated at startup (fail fast with a clear
  error if missing in production, but see FALLBACK BEHAVIOR below),
  NEVER hardcoded, .env in .gitignore, .env.example committed with
  placeholder values and comments
- Input validation on all API routes (validate query params, request
  body shape) — reject malformed requests with proper 400s, not crashes
- No secrets or API keys ever logged to console or committed to git
- Rate-limit-aware external calls (don't hammer free APIs — add small
  delays/backoff between discovery source calls)
- Proper HTTP status codes throughout (200, 400, 401, 404, 500 used
  correctly)
- Database queries use Prisma properly — no N+1 patterns, appropriate
  indexes on Agent.id/Post.agentId/Post.createdAt
- Code organized cleanly: separate lib/ modules for discovery, scoring,
  generation, memory — not one giant route file
- No console.log left in for debugging in final code (use a minimal
  logger or remove)
- README.md documenting setup, env vars needed, and how the autonomous
  cycle works

=== FALLBACK BEHAVIOR (critical — you will not have live credentials
initially) ===
I have NOT given you real DATABASE_URL, GROQ_API_KEY, or CRON_SECRET
yet. Do NOT stop and wait for me. Instead:
1. Build everything against a LOCAL SQLite dev database first (Prisma
   supports switching provider easily — use sqlite for local dev/testing
   tonight, and structure the schema/config so switching to Postgres for
   Supabase later is a one-line datasource change, documented in
   README.md under "Production setup").
2. For Groq calls, write the integration for real, but also add a
   clearly-marked MOCK_MODE (env flag) that returns realistic
   placeholder generated text if GROQ_API_KEY is absent, so you can test
   the full cycle end-to-end tonight without a real key. Log clearly
   when running in mock mode.
3. Generate a random CRON_SECRET yourself and put it in .env for local
   testing; document that I need to set the real one in Vercel +
   cron-job.org later.
4. Write a SETUP_TODO.md listing exactly what I need to plug in when I
   wake up (Supabase connection string, Groq key, Vercel env vars,
   cron-job.org config, custom domain DNS) — nothing vague, exact steps.

=== TEST-DRIVEN LOOP — HOW YOU SHOULD WORK ===
For each phase below, implement it, then TEST it for real (run the dev
server, hit the routes with curl/fetch, check Prisma Studio, check
rendered UI) before moving to the next phase. If a test fails, diagnose
the real cause from actual error output — don't guess — fix it, and
re-test. Do not proceed to the next phase until the current one's
acceptance criteria genuinely pass. If you get stuck on the same issue
after 3 real attempts, document the blocker clearly in SETUP_TODO.md and
move on to the next phase rather than looping forever.

PHASES (build in this order):
1. Scaffold Next.js+TS+Tailwind+Redux, PROMPTS.md, git init, first commit
2. Prisma schema + local SQLite migration, verify via Prisma Studio
3. Discovery layer (lib/discovery/*.ts) — one module per source, each
   independently testable
4. Memory + editorial scoring engine (lib/editorial/*.ts) — unit-testable
   pure functions where possible
5. Groq generation module (lib/generation.ts) with MOCK_MODE
6. /api/agent/init and /api/agent/feed routes — test against the exact
   contract above with curl
7. /api/agent/cycle route with CRON_SECRET auth — run it manually
   several times, confirm posts accumulate correctly, confirm rejected
   topics get logged, confirm memory dedup actually prevents repeats
   (test by forcing two similar topics in mock mode)
8. Frontend: persona page, feed page, editorial log page, memory graph,
   all empty/loading/error states
9. Full README.md, SETUP_TODO.md, PROMPTS.md finalized
10. Final review pass: re-read every file you created for the production
    standards above, fix anything sloppy

=== COMMIT + PROMPTS.md HYGIENE (important for authenticity review) ===
- Commit incrementally after each phase completes and tests pass — real,
  descriptive commit messages tied to what changed. Do NOT do one giant
  commit at the end.
- Append EVERY prompt I give you (including this one, verbatim) to
  PROMPTS.md as you go, in order, so it reflects the real build timeline.

=== WHEN YOU FINISH OR STOP ===
Leave a clear final summary: what's done, what's in mock mode pending
real keys, what I need to do first when I wake up (should map directly
to SETUP_TODO.md), and any decisions you made that I should know about.

Begin now with Phase 1. Work through as many phases as you can
autonomously. Do not wait for my confirmation between phases — only stop
for a genuine hard blocker. and if you can skip those blocker if i dont respond in 2 mins but dont do anything else in the system you have just this repo access
```

## Prompt 2 — 2026-08-08 (mid-build, sent alongside a screenshot of the Supabase Data API settings page)

```
groq api key = [REDACTED]
supabase password of db = [REDACTED] so now you might not ger any blocker
```

**Effect on the build:** this unblocked the two items Prompt 1's fallback
plan had anticipated needing. Both values were written straight to the
local, gitignored `.env` (never to `.env.example`, never logged, never
committed) and connectivity was verified against the live Supabase
Postgres instance before relying on it. See the "Decisions" section of
`README.md` for why this changed the plan from "SQLite first, Postgres
later" to "Postgres from the start."
