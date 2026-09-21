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
selected but the binding is missing. This guard exists locally and is not yet
deployed to staging or production.

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
