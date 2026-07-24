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
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (included with project tooling)

## Environments

This repository is configured for production only.

| Worker | D1 database | Deploy |
|--------|-------------|--------|
| `gs-social-scheduler` | `pl8ypus-scheduler-db-prod` | `npm run deploy` |

Create the production D1 database once:

```bash
npx wrangler d1 create pl8ypus-scheduler-db-prod
```

Copy the returned `database_id` into [`wrangler.jsonc`](wrangler.jsonc).

Apply migrations:

```bash
npm run db:migrate:production
```

## Getting Started

```bash
npm install
npm test
npm run build
```

Verify production after deploy with `GET /api/health`, the frontend at `/`, and `npm test`.

## Secrets

**Nothing sensitive is committed.** Templates only:

- [`.env.example`](.env.example) → production secret names

LinkedIn app setup:

- Developer portal: <https://www.linkedin.com/developers/>
- Product/API: Share on LinkedIn / Sign In with LinkedIn using OpenID Connect
- OAuth callback URL: `https://linkedin-scheduler.greg-staunton.com/api/admin/linkedin/callback`
- Scopes: `openid`, `profile`, `w_member_social`

```bash
npx wrangler secret put LINKEDIN_CLIENT_ID
npx wrangler secret put LINKEDIN_CLIENT_SECRET
```

## Deploy

```bash
npm run db:migrate:production
npm run deploy
```

Run the production migration command before the first deploy and before releases that add migrations.

## Scheduler

Cron runs every 2 minutes in production. Due posts use a **two-phase claim** (`scheduled` → `publishing` → `posted`) and publish through LinkedIn once the admin OAuth connection is complete.

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
