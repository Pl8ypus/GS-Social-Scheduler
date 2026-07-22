# Runbook — Pl8ypus LinkedIn Scheduler

Operator guide for D1 backup/restore, deploy, promote, and rollback. No app code — process only.

See also: [README.md](README.md) (setup), [BUILD_LOG.md](BUILD_LOG.md) (evidence trail), [wrangler.jsonc](wrangler.jsonc) (environment config).

---

## Environments

| Environment | Worker name | D1 database | `ENVIRONMENT` var | Deploy command |
|-------------|-------------|-------------|-------------------|----------------|
| **Dev (local)** | `pl8ypus-linkedin-scheduler-dev` | `pl8ypus-scheduler-db-dev` | `development` | `npm run dev` |
| **Staging** | `pl8ypus-linkedin-scheduler-staging` | `pl8ypus-scheduler-db-staging` | `staging` | `npm run deploy:staging` |
| **Production** | `pl8ypus-linkedin-scheduler-prod` | `pl8ypus-scheduler-db-prod` | `production` | `npm run deploy` |

Each environment has its **own D1 database** (separate data). Worker code is deployed independently per environment.

**Prerequisites for remote operations:**

```bash
npx wrangler login
# or set CLOUDFLARE_API_TOKEN for CI / non-interactive use
```

Replace placeholder `database_id` values in `wrangler.jsonc` after `wrangler d1 create` (once per database).

---

## D1 backup

Uses Cloudflare's built-in **`wrangler d1 export`** — no custom backup tooling.

### Local dev database

```bash
mkdir -p backups
npx wrangler d1 export pl8ypus-scheduler-db-dev \
  --local \
  --output backups/dev-$(date +%Y%m%d-%H%M%S).sql
```

### Staging (remote)

```bash
npx wrangler d1 export pl8ypus-scheduler-db-staging \
  --remote \
  --env staging \
  --output backups/staging-$(date +%Y%m%d-%H%M%S).sql
```

### Production (remote)

```bash
npx wrangler d1 export pl8ypus-scheduler-db-prod \
  --remote \
  --env production \
  --output backups/production-$(date +%Y%m%d-%H%M%S).sql
```

**Notes:**

- Remote export briefly makes the database **unavailable** for queries (Wrangler warns before proceeding).
- Export includes schema + data + `d1_migrations` history.
- Store backups **outside git** (`backups/` is gitignored). Copy to durable storage (R2, encrypted drive) for production.
- Optional: enable **D1 Time Travel** in the Cloudflare dashboard (paid plan) for point-in-time recovery without a manual export file.

### Table-scoped export (smaller files)

```bash
npx wrangler d1 export pl8ypus-scheduler-db-prod \
  --remote --env production \
  --table posts --table publish_events --table scheduler_runs \
  --output backups/production-app-tables-$(date +%Y%m%d-%H%M%S).sql
```

---

## D1 restore

Three supported paths. Pick based on scenario.

### Path A — Point-in-time (remote, same database) — preferred for production oops

**Dashboard:** Cloudflare → D1 → select database → **Time Travel** → choose timestamp → restore.

**CLI (Wrangler ≥ 3.89):**

```bash
# List restore points (production example)
npx wrangler d1 time-travel info pl8ypus-scheduler-db-prod --env production

# Restore to a specific bookmark (Unix ms timestamp from info output)
npx wrangler d1 time-travel restore pl8ypus-scheduler-db-prod \
  --env production \
  --timestamp <BOOKMARK_MS>
```

Requires Time Travel enabled on the database. Does not require a local `.sql` file.

### Path B — Full import into a **new** database (disaster recovery)

Use when the existing database is corrupted or you want a clean swap.

```bash
# 1. Create replacement database
npx wrangler d1 create pl8ypus-scheduler-db-prod-restored

# 2. Update wrangler.jsonc production database_id to the new UUID

# 3. Import backup (schema + data)
npx wrangler d1 execute pl8ypus-scheduler-db-prod-restored \
  --remote --env production \
  --file backups/production-YYYYMMDD-HHMMSS.sql \
  -y

# 4. Deploy worker so binding points at updated database_id
npm run deploy
```

### Path C — Full import into empty **local** store (verified in Step 11)

Used to verify a backup file is restorable. **Do not** run a full import against an existing populated local/remote DB — it will fail on `d1_migrations` primary-key conflicts.

**Verified 2026-07-21** on Windows (Wrangler 4.112.0):

```bash
# 1. Take backup (includes test marker row)
npx wrangler d1 execute pl8ypus-scheduler-db-dev --local \
  --command "INSERT INTO posts (content, status) VALUES ('BACKUP_TEST_MARKER_step11', 'draft');"

npx wrangler d1 export pl8ypus-scheduler-db-dev --local \
  --output backups/dev-local-step11-test.sql

# 2. Simulate data loss
npx wrangler d1 execute pl8ypus-scheduler-db-dev --local \
  --command "DELETE FROM posts WHERE content = 'BACKUP_TEST_MARKER_step11';"
# → COUNT = 0 (confirmed)

# 3. Restore into a FRESH local persist directory
npx wrangler d1 execute pl8ypus-scheduler-db-dev --local \
  --persist-to backups/restore-verify \
  --file backups/dev-local-step11-test.sql \
  -y
# → 25 commands executed successfully

# 4. Verify marker row restored
npx wrangler d1 execute pl8ypus-scheduler-db-dev --local \
  --persist-to backups/restore-verify \
  --command "SELECT id, content FROM posts WHERE content = 'BACKUP_TEST_MARKER_step11';" \
  --json
# → id=5, content=BACKUP_TEST_MARKER_step11 ✓
```

**Could not verify in this session:** remote export/restore (no `CLOUDFLARE_API_TOKEN` / `wrangler login` in the automation environment). Commands above are correct per Cloudflare docs; run against staging before relying on them for production.

### Path D — In-place data restore (existing DB, selective)

For restoring **app tables only** without touching `d1_migrations`:

1. Export app tables: `--table posts --table publish_events --table scheduler_runs --no-schema`
2. **Stop the worker** (or accept brief inconsistency).
3. Truncate/replace target rows (destructive — only when intentional).
4. `wrangler d1 execute … --file <data-only.sql>`

Not tested end-to-end here; prefer Path A (Time Travel) or Path B (new DB) for remote environments.

---

## Deploy to staging

```bash
# 1. Tests green
npm test

# 2. Apply any pending migrations to staging D1
npm run db:migrate:staging

# 3. Set staging secrets / vars (see Secrets section) — first time only

# 4. Build + deploy
npm run deploy:staging
```

Deploy uses the Vite-generated Wrangler config:

`src/frontend/dist/pl8ypus_linkedin_scheduler/wrangler.json` with `--env staging`.

**Post-deploy checks:**

```bash
# Worker health (through Access — use browser or curl with Access service token)
curl -s https://<staging-worker-url>/api/health

# Reporting
curl -s https://<staging-worker-url>/api/reporting/health

# UI: compose → schedule → confirm queue + scheduler health card
```

---

## Promote staging → production

There is no single “promote” button. Promotion means **deploy the same tested commit** to production after staging sign-off.

```bash
# 1. Confirm staging is good (manual QA on staging URL)

# 2. Tests still green on the commit you are promoting
npm test

# 3. Apply migrations to production D1 (if this release adds any)
npm run db:migrate:production

# 4. Take a production D1 backup BEFORE deploy (recommended)
npx wrangler d1 export pl8ypus-scheduler-db-prod \
  --remote --env production \
  --output backups/production-pre-deploy-$(date +%Y%m%d-%H%M%S).sql

# 5. Deploy production worker + assets
npm run deploy

# 6. Post-deploy smoke test (production URL, through Access)
#    - GET /api/health
#    - GET /api/reporting/health
#    - Posts queue loads
```

**Important:** Staging and production D1 are **separate**. Promoting code does **not** copy staging data to production.

---

## Rollback a bad production deploy

Rollback has **two layers**: Worker (code) and D1 (data). They are independent.

### Worker rollback (code / assets)

```bash
# List recent deployments
npx wrangler deployments list --env production

# Roll back to a previous version id
npx wrangler rollback <VERSION_ID> --env production -y
```

Or redeploy a known-good git tag/commit:

```bash
git checkout <good-commit>
npm run deploy
git checkout main   # return to tip when done
```

**Note:** Worker rollback does **not** undo D1 migrations or data changes made by the bad release.

### D1 rollback (data)

If the bad deploy ran a destructive migration or corrupted data:

1. **Time Travel** (Path A) — fastest if enabled.
2. **Restore from pre-deploy export** (Path B) — import into new DB, update `database_id`, redeploy.
3. **Do not** import a full `.sql` backup over an existing populated DB in place (Path C limitation).

### Combined rollback checklist

1. `wrangler rollback` (or redeploy good commit) for the Worker.
2. If schema/data affected: restore D1 via Time Travel or backup import.
3. Verify `/api/health`, `/api/reporting/health`, posts queue.
4. Record incident in `BUILD_LOG.md`.

---

## Secrets and environment variables

### Per environment

| Name | Dev (local) | Staging | Production | How to set |
|------|-------------|---------|------------|------------|
| `ENVIRONMENT` | `development` | `staging` | `production` | `wrangler.jsonc` `vars` (committed) |
| `CF_ACCESS_TEAM_DOMAIN` | — (not used) | **Required** | **Required** | `wrangler.jsonc` `vars` or dashboard |
| `CF_ACCESS_AUD` | — (not used) | **Required** | **Required** | `wrangler.jsonc` `vars` or dashboard |
| `LINKEDIN_CLIENT_ID` | optional | future | future | `.dev.vars` / `wrangler secret put` |
| `LINKEDIN_CLIENT_SECRET` | optional | future | future | `.dev.vars` / `wrangler secret put` |
| `LINKEDIN_ACCESS_TOKEN` | optional | future | future | `.dev.vars` / `wrangler secret put` |

### Cloudflare Access (outstanding — must configure before staging/prod use)

The Worker **fails closed** on `/api/*` when `ENVIRONMENT` is not `development`. You must:

1. Create a Cloudflare Access application for the staging Worker URL.
2. Create a separate Access application for production.
3. Set in `wrangler.jsonc` (or Cloudflare dashboard → Worker → Settings → Variables):

   ```text
   CF_ACCESS_TEAM_DOMAIN = <your-team>.cloudflareaccess.com
   CF_ACCESS_AUD         = <Access application AUD tag>
   ```

4. Redeploy after setting vars.

Local dev bypasses Access when `ENVIRONMENT=development` (see `src/worker/middleware/access.ts`).

### Secrets commands

```bash
# Local — copy template, never commit
cp .dev.vars.example .dev.vars

# Remote secrets (encrypted at rest by Cloudflare)
npx wrangler secret put LINKEDIN_CLIENT_ID --env staging
npx wrangler secret put LINKEDIN_CLIENT_SECRET --env staging
npx wrangler secret put LINKEDIN_CLIENT_ID --env production
npx wrangler secret put LINKEDIN_CLIENT_SECRET --env production

# List secret names (values not shown)
npx wrangler secret list --env staging
npx wrangler secret list --env production
```

### Rate limiters

`API_RATE_LIMITER` and `SCHEDULED_RATE_LIMITER` are configured in `wrangler.jsonc` `ratelimits` blocks. Namespace IDs must exist in your Cloudflare account (Wrangler provisions on deploy).

---

## Routine operator checklist

| When | Action |
|------|--------|
| Before production deploy | `npm test`, backup production D1, run migrations |
| After production deploy | Smoke test health + queue UI |
| Weekly (production) | D1 export to durable storage |
| After failed publish spike | Check `/api/reporting/health` + `publish_events` table |
| Before schema migration | Backup target environment D1 |

---

## Quick reference

```bash
# Backup
npx wrangler d1 export pl8ypus-scheduler-db-<env> --remote --env <staging|production> --output backups/<env>-<timestamp>.sql

# Migrate
npm run db:migrate:staging
npm run db:migrate:production

# Deploy
npm run deploy:staging
npm run deploy

# Worker rollback
npx wrangler deployments list --env production
npx wrangler rollback <VERSION_ID> --env production -y
```
