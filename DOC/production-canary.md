# TRACE production canary runbook

This runbook is the controlled production-canary plan produced by CF4.12 and
implemented in CF4.13. The validate-only path is the only path exercised so
far; no Cloudflare resources or GitHub configuration have been changed.

## Proposed resources

| Resource | Name                                                  | CF4.12 status          |
| -------- | ----------------------------------------------------- | ---------------------- |
| Worker   | `trace-production`                                    | Not created            |
| D1       | `trace-production-db`                                 | Not created            |
| Queue    | `trace-production-jobs`                               | Not created            |
| Host     | `https://trace-production.mathofdynamic2.workers.dev` | Proposed, not reserved |

The Worker must expose the existing OpenNext `fetch()` and Queue `queue()`
handlers. Bind only `DB` and `TRACE_QUEUE` for the production runtime. Set
`TRACE_DEPLOYMENT_ENV=production`, `TRACE_DATABASE_DRIVER=d1`, and
`TRACE_PUBLIC_URL=https://trace-production.mathofdynamic2.workers.dev`. Do not
bind Hyperdrive. Missing D1 or a non-D1 driver must fail closed; there is no
PostgreSQL, pg-boss, or external Node-worker fallback.

## GitHub integration

Staging remains on `https://trace-code.pages.dev` and is not changed by this
plan. Create a separate production GitHub App and a separate production OAuth
App after the isolated Worker/D1 canary passes. Use these exact production
routes:

- App homepage: `/`
- App setup/user authorization callback: `/api/github/setup`
- App webhook: `/api/github/webhooks`
- TRACE sign-in start: `/api/auth/github`
- TRACE sign-in callback: `/api/auth/github/callback`
- Existing-installation reconciliation start: `/api/github/reconcile`

The full URLs use the proposed Workers hostname. The App should retain the
verified minimum read-only repository permissions (metadata, contents, pull
requests, issues) and the currently required installation, installation-
repositories, repository, pull-request, push, and issues events. Keep write
permissions and all-repository installation disabled unless a separately
approved product requirement exists. GitHub documents the webhook URL/secret
and event configuration separately from user authorization callback behavior:
[webhooks](https://docs.github.com/en/apps/creating-github-apps/registering-github-app/using-webhooks-with-github-apps),
[user authorization callback](https://docs.github.com/en/apps/creating-github-apps/registering-github-app/about-the-user-authorization-callback-url).

Production secret names, without values, are:

```text
GITHUB_APP_ID
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET
GITHUB_APP_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
GITHUB_APP_SLUG
GITHUB_APP_CALLBACK_URL
GITHUB_APP_INSTALL_URL
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
TRACE_AUTH_SECRET
```

## Ordered canary procedure

1. Verify Workers Free limits, current-UTC-day D1 quota evidence, D1 slot
   capacity, Worker bundle size, and Queue limits. Stop if account identity,
   quota, or capacity is unknown at the point a mutation would be made.
2. Create only the three proposed resources. Assert every returned ID before
   writing configuration. Do not bind the rehearsal or staging D1.
3. Apply migrations `0000` and `0001` to the empty production D1 once. Check
   schema, indexes, foreign keys, and tenant constraints. Capture a fresh
   Time Travel bookmark and record its retention window.
4. Set production-only variables and secrets. Do not copy staging sessions,
   OAuth credentials, webhook payloads, or real repository records.
5. Deploy the exact reviewed release SHA with the bundled Worker artifact.
   Keep the production App uncreated/uninstalled and webhook intake disabled
   for this first canary.
6. Run synthetic health, authenticated configuration, D1 read/write, Queue
   producer/consumer, no-fallback, tenant-isolation, and owner-recovery
   checks. Confirm the Queue consumer acknowledges only after the business
   handler completes.
7. Observe a fixed soak window. Record request count, CPU, exceptions, D1
   rows read/written, Queue backlog/retries/failures, and bundle/asset size.
8. If clean, create/configure the production Apps, install only into one
   explicitly authorized test workspace, and exercise one signed webhook with
   duplicate delivery. Do not enable customer traffic yet.
9. Stop on D1 error `7500`, CPU/size limit, binding or auth error, unexpected
   retries/backlog, failed tenant isolation, signature failure, or any
   PostgreSQL/Hyperdrive/pg-boss activity.

## Rollback and recovery

Roll back the Worker to its prior version first and preserve the D1. A D1
restore is a separate owner-approved operation: select a valid bookmark,
assert the destination ID, pause webhook/Queue intake, restore in place only
when the incident procedure authorizes it, validate schema and tenant data,
then reconcile deliveries using the existing durable idempotency key. Never
replay untrusted raw webhook bodies. If Queue retention expires or D1 is
unavailable, mark recovery unresolved and use the owner-only recovery path
once both services are healthy.

## Current evidence and open gates

- Staging issues `#1` and `#2` and a processed delivery were confirmed by one
  authorized, sanitized remote D1 read.
- The live owner recovery GET is not verified because the browser path is
  blocked; local owner/RBAC tests pass.
- Exact account-wide current-UTC-day D1 totals, aggregate Worker CPU, and
  Queue backlog/retry metrics remain unavailable through the authorized
  surfaces used in CF4.12. Rolling 24-hour staging-only D1 metrics are not a
  substitute for those gates.
- The isolated Time Travel rehearsal database remains unbound and retained.
- Customer-facing production cutover remains prohibited until the canary,
  operational evidence, App/OAuth setup, rollback, and owner approval gates
  all pass.

## CF4.13 execution boundary

CF4.13 may provision the isolated resources and run the no-webhook canary
only after the owner approves the exact resource names and current capacity
evidence is captured. It must not switch staging routing, alter the existing
GitHub App, or expose a customer-facing production callback.

## CF4.13 implementation in this checkout

- `apps/web/production-canary.json` is the tracked production manifest. It
  contains names, bindings, closed-canary variables, migration names, and
  required secret names, but no production resource IDs or secret values.
- `scripts/production-canary-preflight.ts --mode validate-only` validates the
  manifest and built bundle without writing a deployable configuration. It
  reports resource IDs as not provisioned rather than inventing them.
- `--mode deploy` requires a real UUID in `TRACE_PRODUCTION_D1_ID`, the exact
  `trace-production-jobs` Queue name, the exact Worker name, and an account ID
  match. It rejects staging and rehearsal D1 IDs and writes only an ignored,
  generated Wrangler config after those checks pass.
- `.github/workflows/validate-production-canary.yml` is manual-only. Its
  default `validate-only` mode builds and validates the artifact. Deploy mode
  additionally requires `DEPLOY_TRACE_PRODUCTION_CANARY`, provisioned resource
  variables, Cloudflare credentials, a production dry run, and the generated
  production config. It is not dispatched by CF4.13.
- `TRACE_CANARY_MODE=closed` blocks production webhook, install,
  reconciliation, and setup mutation routes with a cache-disabled 503. The
  staging environment has no canary variable and remains unchanged.
