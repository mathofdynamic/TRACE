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

## CF4.14 provisioning attempt

The authorized provisioning attempt began at `2026-09-22T08:54:41.3979923Z`
against account `mathofdynamic2`
(`c5d6cf110905c91fc3eed1abaf8236a`). The preflight inventory contained eight
D1 databases (about 472.7 MB reported by Wrangler); neither production target
name existed. The Workers Free plan and exact current-UTC-day account quota
were not exposed by the available Wrangler surfaces, so quota headroom remains
an open customer-traffic gate.

The single new D1 creation succeeded:

| Resource | Name                    | ID                                     | State                                         |
| -------- | ----------------------- | -------------------------------------- | --------------------------------------------- |
| D1       | `trace-production-db`   | `7a566f2e-da27-46e7-8c3f-271e5566f225` | Created, unbound, empty                       |
| Queue    | `trace-production-jobs` | Not created                            | No mutation attempted after migration failure |

The production D1 ID is distinct from staging
`c4df63bc-8270-4500-9dab-c1c6439efa64` and the retained rehearsal
`5075dc29-954f-4f65-a38a-0d22e7c076ac`. The migration-only Wrangler config was
ignored and targeted only the new production D1. The first corrected migration
command (the initial command was rejected locally because Wrangler 4.120.1 has
no `--yes` flag) reached Cloudflare but failed before any migration was
confirmed with API error `7003` on the new database query endpoint:

```text
Could not route to /client/v4/accounts/c5d6cf110905c91fc3eed1abaf8236a/d1/database/7a566f2e-da27-46e7-8c3f-271e5566f225/query
```

Per the release boundary, no retry, Queue creation, bookmark capture, Worker
binding, or deployment was attempted after that failure. Migration state is
therefore unverified; do not treat the database as deployable. The next
authorized operation must inspect the failed target without recreating it,
resolve the Cloudflare API/resource state, then apply `0000_cheerful_legion.sql`
and `0001_goofy_lester.sql` exactly once if the target is still empty. A fresh
Time Travel bookmark must be captured only after both migrations and schema
validation succeed.

Staging remained on its existing D1/Queue and Worker. The rehearsal database
remains unbound and retained. No production Worker, Queue consumer, GitHub
integration, secret, or customer traffic was changed.

## CF4.14B recovery outcome

On the next authorized recovery pass, the account and resource identity were
rechecked. The production database remained
`7a566f2e-da27-46e7-8c3f-271e5566f225`; staging and rehearsal IDs remained
distinct. `wrangler d1 info` and a minimal remote `SELECT 1` succeeded, and
`wrangler d1 migrations list --remote` showed both migrations pending. This
evidence indicates that the earlier `7003` was transient control-plane
routing/propagation; no account mismatch or authorization failure was found.

The two existing migrations were then applied exactly once to the verified
production target. Wrangler reported both
`0000_cheerful_legion.sql` and `0001_goofy_lester.sql` as successful. A later
read-only schema/count validation pass failed with a transport-level
`fetch failed` before results were returned. Therefore the migration command
result is recorded, but independent post-migration table, index, foreign-key,
and empty-data validation remains pending.

Because that validation could not be completed, the safety gate stopped before
capturing a production bookmark or creating `trace-production-jobs`. The Queue
must not be created until the schema read-back succeeds. No Worker, binding,
consumer, message, GitHub integration, secret, or customer traffic was
changed.

## CF4.14C verification stop

The production database remained the exact target
`7a566f2e-da27-46e7-8c3f-271e5566f225`; the account inventory showed nine D1
databases, with staging and rehearsal IDs unchanged. A bounded read-only pass
confirmed `SELECT 1` and returned this migration history:

```text
1  0000_cheerful_legion.sql  2026-09-22 09:24:57
2  0001_goofy_lester.sql     2026-09-22 09:25:02
```

The subsequent `sqlite_master` schema query was malformed for SQLite because
it used double-quoted string literals. Cloudflare returned API code `7500`
with `SQLITE_ERROR` (`near "table": syntax error`). Per the provisioning
boundary, verification stopped immediately on that code. This is a query
validation error, not evidence of a quota failure, but it still leaves schema,
index, foreign-key, and application-count checks unverified.

No bookmark was captured and `trace-production-jobs` was not created. The next
operation must use corrected SQL in one fresh bounded read-only pass; it must
not rerun migrations. Queue creation remains gated on that successful pass.

## CF4.14D completed provisioning

The validation SQL was corrected locally against a fresh isolated D1. The
failed query used double-quoted string literals in
`type IN ("table", "index")`; the valid SQLite form is
`type IN ('table', 'index')`. Local validation also split application counts
into standalone statements to avoid the local compound-SELECT term limit.

Remote production verification then passed for D1
`7a566f2e-da27-46e7-8c3f-271e5566f225`:

- migration history contains exactly `0000_cheerful_legion.sql` and
  `0001_goofy_lester.sql`;
- all 22 TRACE application tables, `d1_migrations`, recovery columns on
  `github_webhook_deliveries`, and the migration-defined indexes are present;
- `PRAGMA foreign_key_check` returned zero rows;
- users, sessions, organizations, memberships, GitHub installations,
  repositories, issues, and webhook deliveries all contain zero rows.

Time Travel bookmark captured at `2026-09-22T10:10:03.5758536Z`:

```text
00000003-00000000-000050ee-ba60b7e52d232df30b5f7d22fafb7c14
```

The bookmark belongs to the production D1 and is subject to the Workers Free
seven-day retention limitation. No restore was performed.

After verification, exactly one Queue was created:

| Resource | Name                    | ID                                 | Producers | Consumers |
| -------- | ----------------------- | ---------------------------------- | --------- | --------- |
| Queue    | `trace-production-jobs` | `9ef092975a554ba296a63b162b16522f` | 0         | 0         |

The Queue was created with one-day message retention and remains unbound,
unpublished, and isolated from `trace-staging-jobs`. The planned consumer
configuration remains batch size 10, timeout 5 seconds, three retries, and
60-second retry delay for the later closed-canary Worker deployment.

The production validate-only preflight passed with the real D1 ID, Queue name,
Worker name, D1-only runtime, and closed-canary mode. Production secrets and
GitHub App/OAuth configuration remain pending. Staging continuity was
verified: Worker version `5930a184-d797-4b70-9aee-d7f0647ab1fa` remains at
100%, `/api/health` returns 200, staging D1 remains
`c4df63bc-8270-4500-9dab-c1c6439efa64`, and `trace-staging-jobs` remains bound
to `trace-test-staging` as its sole producer and consumer.

## CF4.16 closed-canary D1 and Queue acceptance

Read-only checks on 2026-09-24 confirmed the deployed production Worker is
still version `ead868f1-0f5d-4e45-939c-3e6349ed8f86` at 100%, with fetch and
Queue handlers, D1 `7a566f2e-da27-46e7-8c3f-271e5566f225`, and producer and
consumer bindings for `trace-production-jobs`. Queue inventory reports
`trace-production` as its only producer and consumer. Staging remains a
separate producer/consumer of `trace-staging-jobs`; no binding was changed.

Production D1 verification used an ignored temporary Wrangler configuration
and read-only queries. `SELECT 1` succeeded. Migration history contains exactly
`0000_cheerful_legion.sql` and `0001_goofy_lester.sql`. The 22 TRACE application
tables, expected indexes, and CF4.4 webhook-recovery columns are present.
`PRAGMA foreign_key_check` returned zero violations. All 22 application tables
had zero rows before and after the route checks; query metadata showed zero
rows written. No migration or restore was run.

The supported internal `system.healthcheck` message contract was inspected in
`packages/trace-core/src/queue.ts` and `apps/worker/src/cloudflare.ts`. It
requires `version`, `type`, `idempotencyKey`, `enqueuedAt`, and `probeId`; its
handler checks the D1 schema and runs `SELECT 1` without writing business
records. No message was sent. Wrangler exposes no Queue send command, the
Cloudflare Dashboard was stopped at its security-verification interstitial,
and no authorized local API token was available. CI credentials were not
retrieved and no credential workaround was attempted. Therefore consumer
invocation, handler completion, and Queue acknowledgment remain unverified;
configured bindings are not execution evidence.

The closed-canary route checks returned health `200`; GitHub webhook, setup,
installation, and reconciliation routes returned cache-disabled `503`; and
anonymous recovery returned `401`. Runtime tail produced no entries but did
not confirm an active stream, so runtime error status is unknown. Queue
backlog, retry, failure, and operation metrics are unavailable. Account-wide
UTC-day D1 usage and Worker CPU distribution were not measured in this phase.

Staging deployment history and binding identities remain unchanged. A bounded
public health check through Node `fetch` failed, and one `curl` attempt timed
out; staging public health is therefore unverified in this pass. No staging
resource or data was modified.

Acceptance is partial: production D1 schema/integrity/emptiness and closed
route guards are verified, but a safe Queue send path and independent consumer
execution evidence are still required. Customer traffic remains disabled.
