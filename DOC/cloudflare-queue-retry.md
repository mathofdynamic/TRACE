# Cloudflare Queue retry and business idempotency

## Scope

CF4.3 validates the local D1/Cloudflare Queue path for the production-reachable
`github.webhook.process` job. It does not change staging or production
resources.

## Contract

- `apps/worker/src/cloudflare.ts` parses the strict versioned message contract.
- The business handler runs before `ack()`.
- Malformed, unsupported, and failed messages call `retry()` and are never
  acknowledged as successful.
- D1 delivery state becomes `processed` only after the shared GitHub ingestion
  handler completes.
- PR and issue projections use provider/repository natural keys, so replay
  updates the existing row instead of inserting a duplicate.
- Staging is configured with `max_retries: 3`, `retry_delay: 60`, and no
  `dead_letter_queue`.

## CF4.3 local evidence

`pnpm test:d1:cf43` uses a fresh Miniflare D1 database and proves:

1. a transient D1 failure retries without acknowledgement, then completes on
   the next delivery;
2. a failure after the business write but before acknowledgement retries and
   leaves exactly one PR projection;
3. four delivery attempts (initial delivery plus three configured retries) all
   fail closed when D1 remains unavailable, leaving the delivery `queued`, with
   no business projection.

Each successful projection remains scoped to the seeded organization and
repository.

## Retry-exhaustion gap

The staging queue has no DLQ. After the configured retry limit, Cloudflare
discards a repeatedly failing message. The D1 delivery row remains `queued`
and has no terminal failure marker. Worker logs include the Queue message ID
and error, and Queue metrics identify the failed delivery, but the application
does not currently expose a durable operator replay record.

Before production cutover, choose one recovery mechanism: configure a bounded
DLQ for the existing consumer, or add an owner-only D1 retry ledger/replay
operation that stores the normalized reference needed to safely re-enqueue a
delivery. A GitHub redelivery alone is not sufficient while `queued` deliveries
are treated as duplicates by `enqueueD1Webhook`.
