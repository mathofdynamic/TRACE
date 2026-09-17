# Cloudflare Queue parity

This inventory is based on the current CF2.6 source tree, not on the list of
historical queue names alone. A job is `REQUIRED_ACTIVE` only when a current
web/API/webhook path can emit it (or when it is an active runtime health
probe). The production denominator is therefore the set of reachable jobs,
not every queue declaration retained by the PostgreSQL reference worker.

## Reachability graph

| Job type                   | Producer                                                                                                        |  Currently reachable | Production required | Business implementation                   | D1 ready | CF Queue ready | Classification    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------: | ------------------: | ----------------------------------------- | -------: | -------------: | ----------------- |
| `system.healthcheck`       | Cloudflare worker health probe and local worker tests                                                           | Yes (infrastructure) |                 Yes | D1 schema/SQL probe                       |      Yes |            Yes | `REQUIRED_ACTIVE` |
| `github.webhook.process`   | `apps/web/app/api/github/webhooks/route.ts` when D1 and `TRACE_QUEUE` are bound; legacy pg-boss route otherwise |                  Yes |                 Yes | Shared normalized GitHub event dispatcher |      Yes |            Yes | `REQUIRED_ACTIVE` |
| `github.installation.sync` | No current producer; queue is declared by `apps/worker/src/index.ts` only                                       |                   No |                  No | No handler                                |       No |             No | `UNREACHABLE`     |
| `github.repository.sync`   | No current producer; queue is declared by `apps/worker/src/index.ts` only                                       |                   No |                  No | No handler                                |       No |             No | `UNREACHABLE`     |
| `github.pull-request.sync` | No current producer; queue is declared by `apps/worker/src/index.ts` only                                       |                   No |                  No | No handler                                |       No |             No | `UNREACHABLE`     |
| `github.issue.sync`        | No current producer; queue is declared by `apps/worker/src/index.ts` only                                       |                   No |                  No | No handler                                |       No |             No | `UNREACHABLE`     |
| `github.webhook.replay`    | No current producer or consumer; retained as a legacy queue name                                                |                   No |                  No | No handler                                |       No |             No | `LEGACY_ONLY`     |
| `analysis.changes`         | No current producer; pg-boss consumer only logs acceptance                                                      |                   No |                  No | Placeholder/log-only                      |       No |             No | `PLACEHOLDER`     |
| `reports.daily`            | No current producer; pg-boss consumer only logs acceptance                                                      |                   No |                  No | Placeholder/log-only                      |       No |             No | `PLACEHOLDER`     |
| `reports.weekly`           | No current producer; pg-boss consumer only logs acceptance                                                      |                   No |                  No | Placeholder/log-only                      |       No |             No | `PLACEHOLDER`     |
| `conflicts.reconcile`      | No current producer; pg-boss consumer only logs acceptance                                                      |                   No |                  No | Placeholder/log-only                      |       No |             No | `PLACEHOLDER`     |
| `sync.reconcile`           | No current producer; pg-boss consumer only logs acceptance                                                      |                   No |                  No | Placeholder/log-only                      |       No |             No | `PLACEHOLDER`     |

## Denominator and safeguards

- Production-reachable jobs: **2** (`system.healthcheck` and
  `github.webhook.process`). Of those, **1** is a product business job and
  **1** is an infrastructure health probe.
- Production-required Cloudflare migration: **2/2** reachable jobs. The
  business denominator is **1/1**.
- The D1 webhook route uses `enqueueCloudflareTraceMessage`, which accepts only
  the two implemented Cloudflare message types. Dormant pg-boss names cannot
  be emitted through the current Cloudflare application boundary.
- The Cloudflare consumer validates the complete discriminated message
  contract. A valid-but-unsupported historical type is retried and never
  acknowledged as successful; malformed messages are also retried.
- The legacy worker still creates historical pg-boss queues for rollback and
  reference. Its log-only handlers are not presented as completed business
  behavior and are not part of the Cloudflare denominator.

## Evidence

- `apps/web/app/api/github/webhooks/route.ts` is the only non-test producer
  call site. It persists a D1 delivery, validates a normalized event, and
  publishes a bounded `github.webhook.process` message when the D1 queue
  binding exists.
- `apps/worker/src/cloudflare.ts` implements the D1 health probe and the
  shared GitHub webhook handler. It retries malformed, unsupported, and
  failed work rather than acknowledging it.
- `apps/worker/src/index.ts` declares all twelve legacy names, but only
  `system.healthcheck` and `github.webhook.process` perform real work. The
  remaining consumers are absent or explicitly log-only placeholders.
