# Build log — Pl8ypus LinkedIn Scheduler

Evidence trail for portfolio / operator review. Each slice records what was built, files touched, decisions, and what was tested.

---

## Step 1 — Project scaffold

**Built:** Cloudflare Workers + D1 + React/Vite + Hono skeleton; `posts` table migration; health API; placeholder frontend; README; initial git commit.

**Files:** `wrangler.jsonc`, `vite.config.ts`, `migrations/0001_create_posts.sql`, `src/worker/**`, `src/frontend/**`, `README.md`

**Decisions:** React + Vite + Hono (official Cloudflare SPA pattern); raw SQL migrations (no ORM); local D1 via Wrangler.

**Tested:** `GET /api/health`, `npm run build`, D1 migration.

---

## Step 2 — Post composition

**Built:** `/compose` form; `POST /api/posts` (draft); client validation; shared `PostForm`.

**Files:** `src/worker/routes/api/posts.ts`, `src/frontend/pages/Compose.tsx`, `src/frontend/components/PostForm.tsx`

**Decisions:** Image stored as data URL in D1 until R2 added; JSON API (not multipart).

**Tested:** Manual POST/create; form validation.

---

## Step 3 — Posts CRUD / queue

**Built:** `GET/PUT/DELETE /api/posts`; `/posts` list; `/posts/:id/edit`; delete confirm; shared `PostForm`.

**Files:** `src/worker/routes/api/posts.ts`, `src/frontend/pages/Posts.tsx`, `EditPost.tsx`, `PostForm.tsx`

**Decisions:** Edit allowed for `draft` only initially; two-step delete confirm.

**Tested:** Manual list/edit/delete.

---

## Step 4 — Scheduling

**Built:** Schedule checkbox + datetime picker; `scheduled_at` + `status=scheduled`; cancel schedule endpoint; queue shows scheduled time.

**Files:** `posts.ts`, `posts-utils.ts`, `PostForm.tsx`, `Posts.tsx`, `EditPost.tsx`

**Decisions:** `scheduled_at` stored as ISO UTC; cancel via `POST /api/posts/:id/cancel`.

**Tested:** Manual schedule/cancel; API curl tests.

---

## Step 5 — Scheduler (mock publish)

**Built:** Cron (`*/2 * * * *`); `processDuePosts`; mock `linkedin_post_id`; failed status + `error_message`.

**Files:** `src/worker/scheduler/process-due-posts.ts`, `src/worker/index.ts`, `wrangler.jsonc`

**Decisions:** Mock publish only; logs prefixed `[scheduler]`.

**Tested:** Verified scheduled status flips to `posted` in D1.

---

## Step 6 — pl8ypus styling

**Built:** Brand tokens from pl8ypus.io; layout/nav; styled compose + posts table; status badges.

**Files:** `src/frontend/styles/tokens.css`, `app.css`, `Layout.tsx`, `StatusBadge.tsx`, page components

**Decisions:** Custom CSS variables from site (not full Tailwind bundle); status colors use brand accents.

**Tested:** Visual check (compose, posts list, nav).

---

## Step 7 — Production hardening

**Built:**

- Wrangler **production** environment with D1 binding
- **Secrets audit** — no secrets in repo; `.env` gitignored; template only
- **Migration 0002** — `publishing` status for idempotent scheduler claims
- **Two-phase publish** — claim → publish → complete; recovery for stuck `publishing`
- **Vitest** — API unit tests, scheduler unit tests, create→schedule→publish integration test
- **Service layer** — `posts-service.ts` for testable business logic
- **BUILD_LOG.md** (this file)

**Files:**

- `wrangler.jsonc` — production config
- `migrations/0002_add_publishing_status.sql`
- `src/worker/services/posts-service.ts`, `src/worker/app.ts`
- `src/worker/scheduler/process-due-posts.ts` (rewritten)
- `vitest.config.ts`, `tests/**`
- `.env.example`, `.gitignore`, `package.json`, `README.md`

**Decisions — production naming:**

| Worker name | D1 database name |
|-------------|------------------|
| `pl8ypus-linkedin-scheduler-prod` | `pl8ypus-scheduler-db-prod` |

Replace the production `database_id` in `wrangler.jsonc` after `wrangler d1 create` if the database is recreated.

**Decisions — idempotency (two-phase status vs publish log):**

Chose **two-phase status** (`scheduled` → `publishing` → `posted`) over a separate publish-attempt log table.

- **Why:** Single-row state machine; atomic `UPDATE … WHERE status = 'scheduled'` claim prevents double cron pickup; `linkedin_post_id` assigned at claim time so recovery can complete without re-calling the (future) LinkedIn API.
- **Tradeoff:** Adds internal `publishing` status and migration complexity; a log table would give richer audit history but more joins and cleanup. For single-user scope, row-level state is sufficient.
- **Recovery:** Cron first completes any `publishing` rows that already have a `linkedin_post_id` (crash after publish, before complete).

**Secrets audit:** No LinkedIn credentials or API keys in committed files. Production secrets are set with `wrangler secret put`.

**Tested:** `npm test` (unit + integration); local migration 0002.

---

## Step 8 — pl8ypus branding (verified tokens)

**Built:** Fetched live CSS/markup from `pl8ypus.io/css/site.css`; refreshed design tokens (void, panel, line, signal, accent palette); applied site-accurate header, buttons, cards, form focus rings, and five distinct status badges (including `publishing` with amber + pulse).

**Files:**

- `src/frontend/styles/tokens.css` — verified palette from site.css
- `src/frontend/styles/app.css` — layout, compose, queue, badges
- `src/frontend/components/StatusBadge.tsx` — dot indicator per status
- `src/frontend/components/Layout.tsx`, `PostForm.tsx`
- `src/frontend/pages/Posts.tsx`, `App.tsx`

**Decisions:**

- Tokens sourced from site.css custom colors (`void` #080808, `panel` #111111, `cyan` #4a7fc1, etc.) — not guessed
- Status colors mapped to site accent pattern: draft = neutral zinc pill; scheduled = cyan; publishing = amber (in-progress); posted = emerald; failed = red
- Subtle radial background gradient only — no hero-scale effects that would distract from the operator UI
- Functional markup unchanged; styling-only pass

**Tested:** `npm test` (11 passing); visual check recommended for compose, posts queue, nav

---

## Step 9 — Reporting & observability

**Built:**

- **`publish_events`** — append-only log (post id, timestamp, success/failed, error detail, linkedin_post_id, scheduler_run_id)
- **`scheduler_runs`** — one row per cron/manual run with due/processed/success/failed/recovered counts
- Scheduler writes to both tables on every `processDuePosts` invocation
- **`GET /api/reporting/health`** — last run stats + all-time publish totals + failed posts count
- Queue view — scheduler health card, failed-post alert banner, header badge, highlighted failed rows

**Files:**

- `migrations/0004_reporting_tables.sql`
- `src/worker/types/reporting.ts`, `services/reporting-service.ts`
- `src/worker/scheduler/process-due-posts.ts`, `routes/api/reporting.ts`
- `src/frontend/types/reporting.ts`, `components/SchedulerHealthCard.tsx`, `pages/Posts.tsx`
- `src/frontend/styles/app.css`
- `tests/unit/reporting.test.ts`, `tests/integration/publish-flow.test.ts`, `tests/unit/scheduler.test.ts`

**Decisions:**

- `publish_events.error_detail` stores the real error for operators; `posts.error_message` stays generic for client safety (H3 pattern)
- `scheduler_runs` added alongside `publish_events` so “last run processed count” is O(1) without aggregating events
- Health surfaced on the Posts queue page (operator landing) rather than a separate route

**Tested:** `npm test` — reporting unit tests, scheduler event logging, integration flow health check

---

## Step 10 — Low-severity audit cleanup (L1–L3)

**Built:**

- **L1 — soft delete + restore.** `deletePost` now stamps `deleted_at` instead of removing the row. All normal reads filter `deleted_at IS NULL` (`listPosts`, `getPostById`, scheduler due/stuck queues, reporting failed-count). Added `listDeletedPosts` + `restorePost` service functions, `GET /api/posts/deleted` and `POST /api/posts/:id/restore` routes, and a collapsible "Recently deleted" section on the Posts page with per-row Restore.
- **L3 — proper 409 on edit/cancel race.** `updatePost` / `cancelScheduledPost` return `409 Conflict` ("this post is being published and can no longer be edited/cancelled") when a post is `publishing` — both at the read-time check (transient state) and if the guarded `UPDATE` matches zero rows (scheduler claimed it between read and write). Replaces the previous misleading `500`.
- **L2 — ID enumeration: intentionally left as sequential integer PKs (no code change).** See reasoning below.

**Files:**

- `migrations/0005_soft_delete_posts.sql` — `deleted_at` column + index
- `src/worker/services/posts-service.ts` — soft delete, `listDeletedPosts`, `restorePost`, 409 handling, `deleted_at` filter on list
- `src/worker/routes/api/posts-utils.ts` — `getPostById` filters `deleted_at IS NULL`
- `src/worker/routes/api/posts.ts` — `/deleted` (before `/:id`) + `/:id/restore` routes
- `src/worker/scheduler/process-due-posts.ts` — `deleted_at IS NULL` on due + stuck queues
- `src/worker/services/reporting-service.ts` — failed-count excludes deleted
- `src/frontend/pages/Posts.tsx`, `src/frontend/styles/app.css` — restore UI
- `tests/unit/posts-api.test.ts` — soft delete/restore, `/deleted` routing, 409 edit/cancel, delete-twice

**Decisions — L2 (why keep sequential IDs):**

Access now gates all of `/api/*`, so enumeration requires a valid Access JWT (an authenticated operator). For a single-operator internal tool, an authenticated user walking their own post IDs is not a meaningful threat. Switching the PK to a UUID would touch the primary key, the `publish_events.post_id` / `scheduler_runs` foreign keys, all indexes, D1 `AUTOINCREMENT` semantics, and frontend routing — high churn for near-zero security gain now that Access is the boundary. If individual posts ever become publicly shareable (multi-tenant or unauthenticated deep links), the right move is a separate unguessable `public_token` column rather than changing the PK. Revisit then.

**Decisions — L1/L3:**

- Soft delete over a separate archive table: single-column `deleted_at` keeps queries simple and restore trivial; matches the row-level state-machine philosophy from Step 7.
- `publishing` treated as a `409` (transient conflict) rather than `403` (permanent "not editable") so the read-time and race outcomes are consistent and the message is accurate.
- `GET /posts/deleted` registered before `/:id` so the static path isn't captured as an id param (also covered by a test).

**Tested:** `npm test` — 23 passing (4 files), incl. new soft-delete/restore, `/deleted` routing, and 409 edit/cancel-race cases; migration 0005 applied via the vitest migration loader.

---

## Step 11 — D1 backup/restore + deploy runbook

**Built:** `RUNBOOK.md` — production D1 export/restore procedures, deploy, Worker rollback, secrets/Access setup; `backups/` gitignored.

**Files:** `RUNBOOK.md`, `.gitignore` (exclude backup SQL)

**Could not verify:** Remote production export or Time Travel restore — no Cloudflare API token in automation session. Commands documented from Cloudflare docs; run `wrangler login` before production reliance.

---

## Going forward

For each new slice, append:

1. **Built** — what changed
2. **Files** — paths touched
3. **Decisions** — anything non-obvious
4. **Tested** — commands / coverage
