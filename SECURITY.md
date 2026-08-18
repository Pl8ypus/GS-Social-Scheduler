# Security Policy

## Purpose

GS-Social-Scheduler is a small internal admin application for composing, scheduling, and publishing LinkedIn posts. It runs on Cloudflare Pages/Workers, stores application state in Cloudflare D1, and publishes through LinkedIn OAuth and LinkedIn APIs from scheduled cron execution or manual "Send now" actions.

This file defines repository-level security guidance for Codex Security scans and future reviewers.

## Trust Boundaries

- **Browser/admin user:** The frontend admin pages for Compose, Calendar, Posts, and LinkedIn Admin run in the administrator's browser. Treat browser-controlled data, form input, URL parameters, and rendered post content as untrusted until validated by the Worker.
- **Cloudflare Access:** Cloudflare Access is the intended authentication layer for the admin UI and API. API routes are expected to be cookie-authenticated through Access, but application routes must still enforce their own security assumptions where needed.
- **Worker API routes:** Worker routes are the server-side authorization, validation, mutation, OAuth, and publishing boundary. State-changing routes must not rely only on frontend checks.
- **D1 database:** D1 stores posts, OAuth tokens, publish events, cron runs, and app state. Data read from D1 may include admin-authored content and sensitive tokens, and mutations can directly affect future publishing.
- **LinkedIn OAuth/API:** LinkedIn OAuth authorization, callback handling, token exchange, token refresh, disconnect, and publishing are external trust boundaries. OAuth state, redirect URI handling, and token storage are security-sensitive.
- **Scheduled cron execution:** Cron handlers run without a browser request or Cloudflare Access cookie. Treat scheduled publishing as trusted by Cloudflare execution context, but review claim/lease/idempotency logic because failures can publish, delete, or mutate unintended posts.
- **Environment variables and secrets:** Cloudflare environment variables and secrets are the source of deployment configuration and LinkedIn credentials. Secret values must not be committed, logged, returned to clients, or derived from attacker-controlled request metadata.

## In Scope

- Authentication and authorization assumptions for the Cloudflare Access-protected admin UI and `/api/*` routes.
- CSRF and explicit `Origin`/`Referer` validation, or an equivalent defense, for unsafe API methods such as `POST`, `PUT`, `PATCH`, and `DELETE`.
- LinkedIn OAuth authorize and callback flows, including state validation, redirect handling, token exchange, token storage, token refresh, and disconnect behavior.
- Publishing actions, scheduler behavior, cron runs, manual "Send now" actions, publish event recording, retry/idempotency behavior, and protections against unauthorized or unintended publishing.
- D1 data access and mutation for posts, OAuth tokens, publish events, cron runs, and application state.
- Frontend/backend trust boundaries, including cases where the frontend validates or hides controls but the backend must enforce the actual security property.
- Secrets handling in source, configuration, logs, errors, responses, tests, and deployment files.
- Cloudflare deployment and configuration that affects authentication, routing, cron execution, D1 bindings, rate limiting, trusted origins, or secret use.
- Error handling that could leak LinkedIn tokens, OAuth secrets, Cloudflare Access assertions, internal configuration, SQL details, or other sensitive data.
- File or image upload handling if present or introduced later, including content validation, storage, rendering, and external fetch behavior.

## Out of Scope

- Vulnerabilities in Cloudflare platform internals, Cloudflare Access internals, Workers runtime internals, Pages infrastructure, or D1 service internals.
- Vulnerabilities in LinkedIn platform internals or LinkedIn API behavior outside this application's integration logic.
- Issues requiring physical access to the administrator's device or a compromised administrator email/account used for Cloudflare Access.
- Purely cosmetic UI issues with no meaningful confidentiality, integrity, availability, OAuth, token, or publishing impact.
- Missing enterprise controls, multi-user administration, public signup, tenant isolation, or complex RBAC features that are not relevant to a small internal admin app unless the absence creates a direct bypass or realistic security impact.

## Security Assumptions

- Admin access is restricted by Cloudflare Access.
- API routes are cookie-authenticated through Cloudflare Access.
- Unsafe API methods must still defend against CSRF using explicit `Origin`/`Referer` validation or an equivalent server-side control.
- The production trusted origin must be explicit, for example `https://linkedin-scheduler.greg-staunton.com`.
- Do not trust request `Host` headers, forwarded host headers, or arbitrary request URLs as security configuration.
- Secrets must come from Cloudflare environment variables or Cloudflare secrets, not source code.
- LinkedIn OAuth tokens stored in D1 are sensitive and should be treated like credentials.
- OAuth callback handling must validate state and use an expected redirect URI.
- Scheduler and manual publishing paths must be designed to avoid duplicate, stale, unauthorized, or unintended LinkedIn posts.

## Reportable Findings

Report findings with realistic impact and repository evidence, including:

- Authentication bypasses or failure-open behavior outside explicit test-only paths.
- Authorization flaws that allow an unauthenticated or unintended caller to read, create, edit, delete, restore, publish, disconnect, or alter LinkedIn connection state.
- CSRF on state-changing routes, especially create, update, delete, restore, disconnect, OAuth initiation side effects, scheduler-affecting mutations, or manual "Send now".
- Open redirects or attacker-controlled redirects involving OAuth authorization, OAuth callbacks, or post-authentication navigation.
- LinkedIn token leakage through source code, client responses, logs, errors, frontend state, D1 exposure, or unsafe redirects.
- Secret exposure involving LinkedIn client credentials, Cloudflare Access assertions, Cloudflare configuration secrets, or other sensitive environment values.
- Unsafe D1 mutation or query behavior that enables data corruption, unauthorized data access, SQL injection, token exposure, or unintended state transitions.
- Bugs that allow publishing unauthorized content, publishing the wrong post, publishing deleted/cancelled posts, duplicate publishing, or bypassing intended publish-state checks.
- SSRF or unsafe external fetch behavior, including future file/image upload or URL ingestion paths.
- Stored XSS in admin-visible content that can execute in the administrator's browser, especially if it can trigger API actions or expose sensitive admin-visible data.
- Broken scheduler, claim, lease, retry, or cleanup logic causing unintended publishing, deletion, restoration, or loss of audit data.

## Non-Reportable / Lower Priority

- The application being protected by Cloudflare Access by design.
- Lack of public signup, multi-user RBAC, tenant isolation, or enterprise administration unless it creates a direct security bypass or realistic app-layer risk.
- Generic dependency age or version drift without a plausible exploit path in this application.
- Theoretical issues requiring control of Cloudflare, LinkedIn, the administrator's Cloudflare Access identity, or the administrator's email account.
- Frontend-only concerns where the backend enforces the security property and there is no realistic security impact.
- Scanner findings based only on missing generic headers or best-practice hardening when they do not affect the Cloudflare-hosted internal admin threat model.

## Reviewer Notes

- Prefer validated findings with file and line evidence, reachable attack paths, and clear impact.
- Preserve production behavior and Cloudflare deployment assumptions unless the security issue requires a targeted change.
- Avoid broad rewrites, framework swaps, or unrelated refactors when fixing findings.
- For fixes, keep changes small and add targeted tests for the affected control or regression path.
- Treat tests as evidence of intended behavior, not proof that a control is secure in production.
- Do not include secrets, live tokens, or unnecessary exploit details in findings or follow-up policy edits.
