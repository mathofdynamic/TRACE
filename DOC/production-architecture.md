# Production architecture

## Current reference topology

The historical production topology remains available only as a rollback and
comparison reference. It is not the proposed Cloudflare-native production
runtime:

```text
Browser
  -> Nginx + TLS
     -> Next.js web process -> PostgreSQL
     -> signed GitHub webhook -> pg-boss -> Node worker
                              -> analysis/rules/reports/sync boundaries
Repository .trace <-> selective manifest API (hybrid; sourceCodeIncluded=false)
```

PostgreSQL, Hyperdrive, pg-boss, and the external Node worker are not removed
until a production canary, recovery proof, and rollback window are complete.

## CF4.9 proposed Workers Free topology

This is a release plan, not deployed configuration. Resource IDs and the
production Workers subdomain are intentionally absent until provisioning is
approved.

```text
Browser
  -> dedicated Worker: trace-production
       -> D1: trace-production-db (DB)
       -> Queue: trace-production-jobs (TRACE_QUEUE)
            -> same Worker queue() consumer
Existing GitHub App/OAuth
  -> explicitly approved production callback and webhook URLs
```

Proposed production resources:

| Resource       | Proposed name                                                              | Status       |
| -------------- | -------------------------------------------------------------------------- | ------------ |
| Worker         | `trace-production`                                                         | Not created  |
| D1             | `trace-production-db`                                                      | Not created  |
| Queue          | `trace-production-jobs`                                                    | Not created  |
| Domain/routing | Dedicated production Workers hostname or separately approved Pages project | Not selected |

Production must set `TRACE_DEPLOYMENT_ENV=production` and
`TRACE_DATABASE_DRIVER=d1`, bind `DB` and `TRACE_QUEUE`, and omit the
`HYPERDRIVE` binding. The request database selector and webhook route now fail
closed instead of entering the PostgreSQL/pg-boss path when production D1 is
selected but the binding is missing. The guard is deployed in the current
staging release `6daa74568846f0313010797a38b49d0e097f5fb6`; it is not deployed
to production.

The production Queue uses the existing versioned message contract and the
same Worker consumer as `fetch()`. The current active denominator is two
reachable message types: `system.healthcheck` and
`github.webhook.process`. Keep the current bounded batch/retry policy during
the canary and recover unresolved deliveries through the owner-only D1
recovery path. Do not add a DLQ or a second consumer without a separate
capacity and operations decision.

## Domain and GitHub callback decision

`https://trace-code.pages.dev` remains the verified staging URL and must not be
repurposed silently. A single GitHub App cannot safely provide independent
staging and production callback/webhook endpoints without a coordinated
cutover. Before production, choose one of:

1. Keep the existing App for staging and create a separately approved
   production App; or
2. Schedule a coordinated existing-App callback/webhook change, accepting that
   the App no longer serves staging independently during the cutover.

No App, OAuth callback, DNS record, Pages project, or production route was
changed in CF4.9. A no-custom-domain launch is possible on a dedicated
Workers hostname, but its account subdomain must be selected from the actual
Cloudflare account rather than guessed in source.

## Production secret names

The production deployment needs authorized values for the existing secret
names only: `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`,
`GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`,
`GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_SLUG`, `GITHUB_APP_CALLBACK_URL`,
`GITHUB_APP_INSTALL_URL`, `GITHUB_OAUTH_CLIENT_ID`, and
`GITHUB_OAUTH_CLIENT_SECRET`. Values remain Cloudflare secrets; they are not
stored in D1 or Queue messages.

## Release, rollback, and monitoring gates

1. Provision the dedicated production Worker, D1, and Queue only after the
   domain/App decision and Free-plan capacity gate pass.
2. Apply the zero-to-D1 migrations once, validate indexes/foreign keys, and
   capture a fresh Time Travel bookmark. Never reuse the staging or rehearsal
   database.
3. Build from the exact release SHA, run the bundled Worker artifact checks,
   deploy with an explicit production environment, and verify 100% traffic.
4. Canary authenticated flows, signed GitHub webhook ingestion, Queue
   delivery/idempotency, tenant isolation, and owner recovery before broad
   traffic.
5. Observe Worker errors/CPU, D1 row metrics, Queue backlog/retries, and
   webhook recovery states. Stop on D1 error 7500, binding errors, CPU/size
   limits, webhook signature failures, or any PostgreSQL/Hyperdrive use.
6. Roll back the Worker to its previous version first. Treat D1 restore as a
   separate owner-approved data operation; after restore, reconcile Queue
   deliveries and re-run idempotent processing without replaying untrusted
   payloads.

Production is not deployed and no production resource exists as of CF4.9.

## Workers Free capacity references

The release gate uses the current Cloudflare limits, not historical metrics:

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 pricing and row metrics](https://developers.cloudflare.com/d1/platform/pricing/)
- [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/)
- [Queues limits](https://developers.cloudflare.com/queues/platform/limits/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)

## CF4.12 operational evidence and production integration decision

### Evidence captured

- Source and staging release candidate: `6daa74568846f0313010797a38b49d0e097f5fb6`.
- Active staging Worker: `5930a184-d797-4b70-9aee-d7f0647ab1fa`, deployment
  `cfa6e971-7406-4c34-a629-f3f202ca6564`, at 100% traffic.
- One authorized read-only D1 query confirmed fixture issues `#1` and `#2`
  are present and open in `mathofdynamic/trace-staging-fixture`, under the
  expected workspace/repository. Delivery
  `45efb6c0-b5c3-11f1-8385-adc2e6c87a39` is `processed` with a processing
  timestamp. No payload, token, or session data was read.
- `trace-test-staging-db` has 23 tables and no pending migration. Its
  available CLI metrics are rolling 24-hour, staging-only values: 784 read
  queries, 41 write queries, 20,947 rows read, and 185 rows written.
- The account inventory contains eight D1 databases using about 450.78 MiB
  in aggregate. This is an inventory snapshot, not a current-day quota
  measurement; it includes unrelated databases.

### Evidence still unavailable

- Exact account-wide current-UTC-day D1 rows read/written are not exposed by
  the authorized Wrangler surface used for this check.
- Aggregate Worker CPU distribution, CPU-limit errors, and complete runtime
  exception history were not available. A short error-only tail produced no
  entries; that is not a historical clean bill of health.
- Queue backlog, operation totals, and retry history were not exposed by the
  available CLI. The deployed binding is present with one producer and one
  consumer; the configured policy is three retries, 60-second delay, and no
  DLQ.
- The live owner recovery GET remains unverified. The existing browser path
  returned `ERR_BLOCKED_BY_CLIENT`, and the supported evaluation context could
  not issue a same-origin fetch. Local owner/non-owner/cross-tenant tests are
  the available evidence.

### Production GitHub integration decision

Use a separately approved production GitHub App and a separately scoped
production OAuth App. Keep the existing staging App and OAuth configuration
unchanged. This prevents a production callback/webhook change from taking
the verified staging site offline. GitHub treats the App setup URL, user
authorization callback, and webhook URL as distinct registration concerns;
webhook event delivery is also tied to the App's configured permissions and
subscriptions ([webhook configuration](https://docs.github.com/en/apps/creating-github-apps/registering-github-app/using-webhooks-with-github-apps),
[user authorization callback](https://docs.github.com/en/apps/creating-github-apps/registering-github-app/about-the-user-authorization-callback-url)).

For the proposed production host, use these exact application routes:

| Purpose                                      | Production URL                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| App homepage                                 | `https://trace-production.mathofdynamic2.workers.dev/`                         |
| GitHub App setup/user authorization callback | `https://trace-production.mathofdynamic2.workers.dev/api/github/setup`         |
| GitHub App webhook                           | `https://trace-production.mathofdynamic2.workers.dev/api/github/webhooks`      |
| TRACE sign-in start                          | `https://trace-production.mathofdynamic2.workers.dev/api/auth/github`          |
| TRACE sign-in OAuth callback                 | `https://trace-production.mathofdynamic2.workers.dev/api/auth/github/callback` |
| Existing-installation reconciliation start   | `https://trace-production.mathofdynamic2.workers.dev/api/github/reconcile`     |

The production App should mirror the verified minimum read-only scope:
repository metadata, contents, pull requests, and issues read access;
installation, installation-repositories, repository, pull-request, push, and
issues events. Do not enable write permissions or all-repository installation
by default. The production OAuth App is separate because TRACE sign-in uses
`GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET`; an App installation
callback is not a substitute for that sign-in flow. GitHub permits multiple
user-authorization callback URLs, but sharing one OAuth registration would
couple staging and production secret and callback operations
([App registration](https://docs.github.com/en/apps/creating-github-apps/registering-github-app/registering-a-github-app),
[modifying an App](https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration)).

Production-only secret names are:
`GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`,
`GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_SLUG`,
`GITHUB_APP_CALLBACK_URL`, `GITHUB_APP_INSTALL_URL`,
`GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, and
`TRACE_AUTH_SECRET`. Values must be separate from staging and remain
Cloudflare secrets.

### CF4.13 isolated production canary

1. Verify the Workers Free capacity gate and reserve the exact names
   `trace-production`, `trace-production-db`, and `trace-production-jobs`.
2. Create the Worker, D1, and Queue only in the isolated production
   environment. Bind `DB` and `TRACE_QUEUE`; set
   `TRACE_DEPLOYMENT_ENV=production`, `TRACE_DATABASE_DRIVER=d1`, and
   `TRACE_PUBLIC_URL` to the approved host. Do not bind `HYPERDRIVE`.
3. Apply migrations `0000` and `0001` once to the empty D1, verify indexes,
   foreign keys, and tenant constraints, and capture a fresh Time Travel
   bookmark. Do not copy staging sessions, OAuth data, or webhook payloads.
4. Deploy the exact release SHA with the existing bundled Worker artifact.
   Keep the production App uncreated/uninstalled and public webhook intake
   disabled during the first canary. Use only synthetic, non-secret fixture
   records and a bounded health/Queue probe.
5. Verify health, sign-in configuration, D1 persistence, Queue producer and
   same-Worker `queue()` consumer, no-fallback behavior, tenant isolation,
   and owner recovery controls. Observe logs, D1 usage, CPU, Queue backlog,
   retries, and errors for a defined soak window.
6. Stop immediately on D1 error 7500, binding/auth failure, CPU or bundle
   limit, unexpected retry/backlog, tenant-isolation failure, or any
   PostgreSQL/Hyperdrive/pg-boss access. Roll back the Worker version first;
   restore D1 only through a separately approved recovery operation.
7. Create/configure the production GitHub Apps only after the isolated
   canary is clean. Install into one explicitly authorized test workspace,
   verify signed webhook ingestion and idempotency, then decide whether any
   customer-facing cutover is authorized.

No production resource, route, GitHub App, OAuth App, or secret exists from
this phase. The production hostname above is a proposal, not a reserved or
verified endpoint.
