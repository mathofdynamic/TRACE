# Cloudflare Test Deployment

TRACE is a full-stack Next.js app. Cloudflare’s current guidance recommends Workers with `@opennextjs/cloudflare` for SSR, App Router, route handlers, and authentication. Pages static export is not the test deployment path because it would omit the server runtime.

## Files

- `apps/web/wrangler.jsonc`: test Worker name `trace-test`, staging Worker `trace-test-staging`, `workers.dev` preview URLs, observability, and safe feature flags.
- `apps/web/open-next.config.ts`: OpenNext Cloudflare adapter.

## Commands

```powershell
pnpm install
pnpm cf:build
pnpm --filter @trace/web cf:typegen
pnpm cf:deploy:test
```

Authenticate first with `wrangler login` and verify the target account with `wrangler whoami`. Deployment creates/updates the staging Worker only; it does not create a Pages project or custom domain.

The root `pnpm cf:build` and `pnpm cf:deploy:test` commands include the Windows OpenNext compatibility helper. Linux and CI use the standard OpenNext build path.

## Database boundary

The staging web Worker uses the `HYPERDRIVE` binding in `apps/web/wrangler.jsonc` to reach the Vercel-provisioned Neon PostgreSQL database. The connection string is not stored in this repository or in the Worker environment. The separate Node worker still uses `DATABASE_URL` because it runs outside the Cloudflare Worker runtime.

On Windows, OpenNext needs a temporary local Hyperdrive emulation value while it inspects bindings during deployment. Supply `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` interactively for the deploy command, then clear it. Do not add `localConnectionString` to `wrangler.jsonc`.

## Required test secrets

Set these interactively after the Worker exists. Never put them in `wrangler.jsonc`, `.env`, or command arguments:

```text
TRACE_AUTH_SECRET
TRACE_PUBLIC_URL
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
GITHUB_APP_ID
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET
GITHUB_APP_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
GITHUB_APP_SLUG
GITHUB_APP_CALLBACK_URL
GITHUB_APP_INSTALL_URL
```

`DATABASE_URL` remains required for the separate Node worker and for local migrations. It is not required as a Cloudflare web Worker secret when `HYPERDRIVE` is configured.

The current database package uses a Node PostgreSQL pool. A real Cloudflare deployment therefore needs a Cloudflare-compatible PostgreSQL path such as Hyperdrive or a separate API/database service before authenticated and database-backed routes can be considered functional. `/api/health` and public pages are the first smoke-test scope.

## Verification

After deploy, verify the generated `workers.dev` URL:

```powershell
Invoke-WebRequest https://<generated-worker>.workers.dev/api/health
Invoke-WebRequest https://<generated-worker>.workers.dev/
```

Do not configure the production domain or GitHub callbacks until the staging Worker and database boundary are verified.
