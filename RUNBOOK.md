# Runbook — Pl8ypus LinkedIn Scheduler

Production operator guide for D1 backup/restore, deploy, rollback, secrets, and routine checks.

See also: [README.md](README.md) (setup), [BUILD_LOG.md](BUILD_LOG.md) (evidence trail), [wrangler.jsonc](wrangler.jsonc) (production config).

---

## Production

| Worker name | D1 database | `ENVIRONMENT` var | Deploy command |
|-------------|-------------|-------------------|----------------|
| `pl8ypus-linkedin-scheduler-prod` | `pl8ypus-scheduler-db-prod` | `production` | `npm run deploy` |

**Prerequisites for remote operations:**

```bash
npx wrangler login
# or set CLOUDFLARE_API_TOKEN for CI / non-interactive use
```

Replace the production `database_id` in `wrangler.jsonc` after `wrangler d1 create` if the database is recreated.

---

## D1 Backup

Uses Cloudflare's built-in **`wrangler d1 export`**. Remote export briefly makes the database unavailable for queries, so take backups during a quiet window when possible.

```bash
mkdir -p backups
npx wrangler d1 export pl8ypus-scheduler-db-prod \
  --remote \
  --output backups/production-$(date +%Y%m%d-%H%M%S).sql
```

For a smaller app-table export:

```bash
npx wrangler d1 export pl8ypus-scheduler-db-prod \
  --remote \
  --table posts --table publish_events --table scheduler_runs \
  --output backups/production-app-tables-$(date +%Y%m%d-%H%M%S).sql
```

Store backups outside git (`backups/` is gitignored) and copy them to durable storage such as R2 or an encrypted drive.

---

## D1 Restore

### Point-In-Time Restore

Preferred when D1 Time Travel is enabled.

```bash
npx wrangler d1 time-travel info pl8ypus-scheduler-db-prod

npx wrangler d1 time-travel restore pl8ypus-scheduler-db-prod \
  --timestamp <BOOKMARK_MS>
```

### Restore Into A New Database

Use this when the existing database is corrupted or you want a clean swap.

```bash
# 1. Create replacement database
npx wrangler d1 create pl8ypus-scheduler-db-prod-restored

# 2. Update wrangler.jsonc database_id to the new UUID

# 3. Import backup
npx wrangler d1 execute pl8ypus-scheduler-db-prod-restored \
  --remote \
  --file backups/production-YYYYMMDD-HHMMSS.sql \
  -y

# 4. Deploy so the Worker binding points at the replacement database
npm run deploy
```

Do not import a full `.sql` backup over an existing populated database in place; `d1_migrations` primary-key conflicts can stop the restore.

---

## Deploy

```bash
# 1. Confirm tests are green
npm test

# 2. Apply pending migrations, if this release adds any
npm run db:migrate:production

# 3. Take a production D1 backup before deploy
npx wrangler d1 export pl8ypus-scheduler-db-prod \
  --remote \
  --output backups/production-pre-deploy-$(date +%Y%m%d-%H%M%S).sql

# 4. Build and deploy production
npm run deploy

# 5. Smoke test through Cloudflare Access
#    - GET /api/health
#    - GET /api/reporting/health
#    - Posts queue loads
```

---

## Rollback

Rollback has two layers: Worker code/assets and D1 data. They are independent.

```bash
# List recent deployments
npx wrangler deployments list

# Roll back to a previous version id
npx wrangler rollback <VERSION_ID> -y
```

Or redeploy a known-good git tag/commit:

```bash
git checkout <good-commit>
npm run deploy
git checkout main
```

If schema or data was affected, restore D1 via Time Travel or by importing a backup into a new database and updating `wrangler.jsonc`.

---

## Secrets And Access

The Worker fails closed on `/api/*` unless Cloudflare Access variables are configured.

Set in `wrangler.jsonc` or Cloudflare dashboard → Worker → Settings → Variables:

```text
CF_ACCESS_TEAM_DOMAIN = <your-team>.cloudflareaccess.com
CF_ACCESS_AUD         = <Access application AUD tag>
```

Remote secrets are encrypted at rest by Cloudflare:

```bash
npx wrangler secret put LINKEDIN_CLIENT_ID
npx wrangler secret put LINKEDIN_CLIENT_SECRET
npx wrangler secret list
```

`API_RATE_LIMITER` is configured in `wrangler.jsonc`. The namespace ID must exist in your Cloudflare account.

---

## Routine Checklist

| When | Action |
|------|--------|
| Before production deploy | `npm test`, backup production D1, run migrations |
| After production deploy | Smoke test health + queue UI |
| Weekly | D1 export to durable storage |
| After failed publish spike | Check `/api/reporting/health` + `publish_events` table |
| Before schema migration | Backup production D1 |

---

## Quick Reference

```bash
# Backup
npx wrangler d1 export pl8ypus-scheduler-db-prod --remote --output backups/production-<timestamp>.sql

# Migrate
npm run db:migrate:production

# Deploy
npm run deploy

# Worker rollback
npx wrangler deployments list
npx wrangler rollback <VERSION_ID> -y
```
