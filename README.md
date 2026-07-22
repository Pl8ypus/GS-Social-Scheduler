# Pl8ypus LinkedIn Scheduler

Personal app to schedule posts to a LinkedIn profile. Runs on Cloudflare Workers with D1, protected by Cloudflare Access (configured separately).

## Stack

- **Runtime:** Cloudflare Workers
- **API:** Hono
- **Frontend:** React + Vite (`@cloudflare/vite-plugin`)
- **Database:** Cloudflare D1 (versioned SQL migrations)
- **Tests:** Vitest + `@cloudflare/vitest-pool-workers`

See [BUILD_LOG.md](BUILD_LOG.md) for the full evidence trail.

**Operations:** [RUNBOOK.md](RUNBOOK.md) — D1 backup/restore, deploy, rollback, secrets.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- A [Cloudflare account](https://dash.cloudflare.com/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (included as a dev dependency)

## Environments

| Environment | Worker | D1 database | Deploy |
|-------------|--------|-------------|--------|
| **Dev** (default) | `pl8ypus-linkedin-scheduler-dev` | `pl8ypus-scheduler-db-dev` | local / `npm run dev` |
| **Staging** | `pl8ypus-linkedin-scheduler-staging` | `pl8ypus-scheduler-db-staging` | `npm run deploy:staging` |
| **Production** | `pl8ypus-linkedin-scheduler-prod` | `pl8ypus-scheduler-db-prod` | `npm run deploy` |

Create each remote D1 database once:

```bash
npx wrangler d1 create pl8ypus-scheduler-db-dev
npx wrangler d1 create pl8ypus-scheduler-db-staging
npx wrangler d1 create pl8ypus-scheduler-db-prod
```

Copy each returned `database_id` into the matching block in [`wrangler.jsonc`](wrangler.jsonc).

Apply migrations:

```bash
npm run db:migrate:local          # dev (local SQLite)
npm run db:migrate:staging          # staging remote
npm run db:migrate:production       # production remote
```

## Getting started (local)

```bash
npm install
npm run db:migrate:local
npm run dev
```

Verify: `GET /api/health`, frontend at `/`, tests with `npm test`.

## Secrets

**Nothing sensitive is committed.** Templates only:

- [`.dev.vars.example`](.dev.vars.example) → copy to `.dev.vars` for local dev
- [`.env.example`](.env.example) → reference for future tooling

Future LinkedIn OAuth tokens:

```bash
# Local
# .dev.vars

# Remote
npx wrangler secret put LINKEDIN_CLIENT_ID --env staging
npx wrangler secret put LINKEDIN_CLIENT_SECRET --env production
```

## Deploy

```bash
npm run deploy:staging   # staging
npm run deploy           # production
```

Run the matching `db:migrate:*` command before first deploy to each environment.

## Scheduler (mock publish)

Cron runs every 2 minutes. Due posts use a **two-phase claim** (`scheduled` → `publishing` → `posted`) to prevent double-publish on retry. Test locally:

```bash
curl http://localhost:<port>/__scheduled
```

## Tests

```bash
npm test
```

- Unit: API create/edit/cancel, scheduler idempotency
- Integration: create → schedule → mock publish end-to-end

## Project structure

```
├── migrations/              # Versioned D1 migrations (0001_, 0002_, …)
├── src/worker/
│   ├── services/            # Business logic (posts)
│   ├── scheduler/           # Cron / mock publish
│   └── routes/api/          # Hono HTTP layer
├── src/frontend/
├── tests/                   # Vitest + Workers pool
├── BUILD_LOG.md
└── wrangler.jsonc
```

## GitHub

Connect this repository to GitHub on your side. Cloudflare Workers Builds can deploy from GitHub once configured in the dashboard.
