# Pl8ypus LinkedIn Scheduler

Personal app to schedule posts to a LinkedIn profile. Runs on Cloudflare Workers with D1, protected by Cloudflare Access (configured separately).

## Stack

- **Runtime:** Cloudflare Workers
- **API:** Hono
- **Frontend:** React + Vite (`@cloudflare/vite-plugin`)
- **Database:** Cloudflare D1 (SQL migrations)

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- A [Cloudflare account](https://dash.cloudflare.com/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (included as a dev dependency)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

### 3. Create the D1 database (first time only)

If `wrangler.jsonc` still has a placeholder `database_id`, create the remote database and copy the ID:

```bash
npx wrangler d1 create pl8ypus-scheduler-db
```

Update `database_id` in [`wrangler.jsonc`](wrangler.jsonc) with the UUID from the command output.

### 4. Apply database migrations

Local (for development):

```bash
npm run db:migrate:local
```

Remote (before deploy):

```bash
npm run db:migrate:remote
```

### 5. Run locally

```bash
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

**Verify:**

- Frontend placeholder loads at `/`
- Health check: `GET /api/health` → `{ "ok": true, "service": "pl8ypus-linkedin-scheduler" }`

### 6. Build and preview production output

```bash
npm run build
npm run preview
```

### 7. Deploy

```bash
npm run deploy
```

This builds the app and deploys using the generated Worker config at `src/frontend/dist/pl8ypus_linkedin_scheduler/wrangler.json`. Apply remote migrations first if needed:

```bash
npm run db:migrate:remote
```

## Project structure

```
├── migrations/           # D1 SQL migrations
├── src/
│   ├── worker/           # Cloudflare Worker (Hono API)
│   │   ├── index.ts
│   │   ├── routes/api/   # API route modules
│   │   └── types/        # Shared TypeScript types
│   └── frontend/         # React SPA
├── wrangler.jsonc        # Worker + D1 + assets config
└── vite.config.ts
```

## Environment variables

Copy [`.dev.vars.example`](.dev.vars.example) to `.dev.vars` for local secrets. Never commit `.dev.vars`.

LinkedIn OAuth tokens and similar secrets will be added in a later step.

## GitHub

Connect this repository to GitHub on your side. Cloudflare Workers Builds can deploy from GitHub once configured in the dashboard.

## Out of scope (this scaffold)

- UI screens (post list, editor, calendar)
- LinkedIn OAuth / posting API
- Cron scheduling logic
- Cloudflare Access / Zero Trust setup
