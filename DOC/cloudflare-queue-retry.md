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
   fail closed when D1 remains unavailable, leaving the delivery unprocessed
   (`queued` when the failure ledger is also unavailable), with no business
   projection.

Each successful projection remains scoped to the seeded organization and
repository.

## Recovery contract

CF4.4 adds the smallest recovery boundary without adding a second job system:

- A verified webhook stores only its bounded normalized event, trusted workspace
  and repository associations, delivery identity, attempt metadata, and a
  sanitized last error. Raw webhook bodies, credentials, and source content are
  never retained for replay.
- Queue/handler failures are recorded as `potentially_unresolved`; this is an
  operator-review state, not a claim that Cloudflare has exhausted retries.
  `processed` and `ignored` remain terminal states. `replaying` is a short-lived
  claim state used to serialize owner recovery requests.
- `GET /api/github/webhooks/recovery` lists at most 50 unresolved deliveries
  for workspaces where the signed-in user is an owner.
- `POST /api/github/webhooks/recovery` accepts only a delivery ID. The server
  rechecks owner membership, installation state, repository state, and the
  stored normalized event before atomically claiming and enqueueing one replay.
  It never accepts a client-supplied webhook payload and never replays a whole
  queue automatically.
- A Queue enqueue failure returns the delivery to `potentially_unresolved`
  with a sanitized error, so the owner can retry after the dependency recovers.
  Replay uses the original delivery idempotency key; existing PR/issue natural
  keys prevent duplicate business projections.
- Every successful owner replay is written to the D1 audit log as
  `github.webhook.recovery.requested`.

## Operator procedure

1. Inspect the unresolved list while authenticated as a workspace owner.
2. Confirm the delivery, repository, installation, and last sanitized error.
3. Restore GitHub installation/repository access if it was revoked.
4. Request one replay by delivery ID and observe the delivery transition from
   `replaying` to `queued`, then `processed` or `ignored`.
5. Confirm the expected projection exists once and review the recovery audit
   event. Do not submit arbitrary payloads or replay every unresolved row.

The endpoint intentionally fails closed for non-owners, cross-workspace rows,
suspended installations, inactive repositories, missing normalized events, and
concurrent claims.

## Retention, limits, and failure modes

- The existing three-retry Queue policy is unchanged (`max_retries: 3`,
  `retry_delay: 60`). There is no DLQ. Cloudflare may discard a message after
  its configured retries and retention window; D1 recovery is useful only while
  the delivery row and normalized event remain available.
- During a simultaneous D1 outage, the consumer may be unable to persist the
  latest failure state. The message still follows Queue retry semantics, but
  recovery cannot be requested until D1 is reachable again.
- D1 recovery does not reconstruct a missing raw webhook. If normalized event
  data is absent or invalid, the row remains non-replayable and must be handled
  through the existing GitHub App redelivery/installation workflow.
- Workers Free limits apply to every D1 read/write, including owner lists,
  replay claims, audits, and Queue processing. Keep recovery lists bounded and
  use it only for individually reviewed deliveries.

## Staging validation requirements

`pnpm test:d1:cf44` uses a fresh local D1 database and proves normal completion,
transient retry, post-write replay, four modeled failed attempts, owner replay,
replay after an existing business effect, concurrent replay serialization,
cross-tenant/non-owner rejection, revoked access rejection, Queue enqueue
failure/recovery, audit logging, and exactly-one issue projection. These are
isolated simulations; they do not claim remote Cloudflare retry exhaustion.
