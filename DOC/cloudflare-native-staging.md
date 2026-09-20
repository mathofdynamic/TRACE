# Cloudflare-native staging

CF3 provisions an isolated Cloudflare-native staging path without changing the
existing production or legacy PostgreSQL resources.

## Architecture

```text
Browser
  ↓
trace-code.pages.dev
  ↓ existing Pages proxy
trace-test-staging (OpenNext custom Worker)
  ├── D1: trace-test-staging-db (DB)
  └── Queue: trace-staging-jobs (TRACE_QUEUE)
          ↓
      the same Worker queue() handler
          ↓
      shared D1 business handler

Existing GitHub App
  ↓ signed callback/webhook
trace-test-staging
```

The staging runtime selects D1 explicitly with `TRACE_DATABASE_DRIVER=d1`.
The historical `HYPERDRIVE` binding remains configured only as rollback and
legacy reference infrastructure; the D1 path does not fall back to it.
PostgreSQL, pg-boss, and the external Node worker remain intact and are not
part of the Cloudflare-native staging path.

## Resources and bindings

| Resource                    | Staging value                  |
| --------------------------- | ------------------------------ |
| Worker                      | `trace-test-staging`           |
| D1 database                 | `trace-test-staging-db`        |
| D1 binding                  | `DB`                           |
| Queue                       | `trace-staging-jobs`           |
| Queue producer binding      | `TRACE_QUEUE`                  |
| Public authenticated origin | `https://trace-code.pages.dev` |
| Wrangler environment        | `staging`                      |

No production D1 database, Queue, DNS record, custom domain, or GitHub App
configuration is part of CF3.

CF3 verification baseline (source `9f29f6d74632fbf20808d2ebd9e3061d8c1519e2`):
the deployed Worker version is
`9ebfa182-2d41-4e13-83b5-4a7e4e0fc2d6`. A signed GitHub issue event from the
private staging fixture was persisted to D1, processed by the same-Worker Queue
consumer, and safely rejected on legitimate redelivery. This proves the
staging path only; it is not production cutover evidence.

## Existing-installation reconciliation

The repository connection page now exposes **Refresh GitHub access**. The flow
starts an explicit, short-lived GitHub App user authorization and reuses the
existing `/api/github/setup` callback with a separate state cookie. The token
is used only for the current reconciliation request and is not persisted.

Reconciliation lists installations accessible to the authenticated GitHub App
user, filters to the configured App ID, verifies the signed-in GitHub identity,
checks installation access and snapshot identity, then performs the existing
tenant-scoped installation/repository upserts. A single candidate is selected;
multiple candidates fail closed unless an explicitly authorized installation ID
is supplied. Existing repository `selected` values are preserved by the
upsert. Callback state validation and the original installation flow remain
unchanged.

## Migrations

The migration directory is `packages/db/drizzle-d1`. Apply the complete
migration history only to the staging database:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = '<configured account id>'
& .\node_modules\.bin\wrangler.cmd d1 migrations apply trace-test-staging-db --remote --config apps/web/wrangler.jsonc --env staging
```

The migration command must complete before deploying the Worker. Verify the
migration history and schema through Wrangler's remote D1 read-only commands.
Never apply this migration set to production from the staging environment.

## Deployment

Use the repository's existing Cloudflare build followed by the staging
environment explicitly:

```powershell
pnpm cf:build
pnpm --dir apps/web exec opennextjs-cloudflare deploy --env staging
```

The configured `main` is `apps/web/custom-worker.ts`. It wraps the generated
OpenNext `fetch` handler and exposes the Queue `queue()` handler on the same
Worker. No second consumer Worker is required.

## Verification

Before acceptance, verify all of the following against the new staging
resources:

1. D1 migrations and indexes are present.
2. `/api/health`, `/sign-in`, and unauthenticated `/app` respond correctly.
3. `trace-code.pages.dev` reaches the deployed Worker through the existing
   Pages proxy.
4. GitHub callback and webhook secrets are present by name only; values remain
   Cloudflare secrets.
5. A signed GitHub event follows webhook verification -> D1 dedupe -> Queue ->
   the shared D1 handler.
6. Duplicate delivery and Queue retry are idempotent.
7. Logs show no PostgreSQL, Hyperdrive, pg-boss, or external Node-worker work
   for the tested D1 flows.

The CF3 staging migration and deployment completed after the account quota
reset. The historical D1 error 7500 remains a production-capacity risk and
must be rechecked before any production provisioning.

## Rollback

The prior staging Worker version remains available in Wrangler deployment
history. Record the newly deployed version before acceptance, then use the
Wrangler rollback/version-promotion command supported by the installed CLI to
restore that prior version if required. Do not delete the D1 database or Queue
during rollback; they are isolated staging resources and remain available for
diagnosis.

Rollback is a staging-only operation. It must not select `--env production`.
