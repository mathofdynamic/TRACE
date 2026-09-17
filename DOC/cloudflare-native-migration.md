# Cloudflare-native runtime migration

Status: Phase CF2 core application parity is implemented for the authenticated
request paths exercised by the isolated D1 harness. D1 is a parity candidate;
PostgreSQL, Hyperdrive, pg-boss, and the Node worker remain the authoritative
fallback/reference until broader domain and browser parity is proven. No remote
provisioning, staging cutover, or production deployment occurred in CF2.

## CF2 parity matrix

The matrix records the current dual-runtime boundary. “D1” means the request
path has an explicit D1 implementation and is covered by the isolated parity
harness; it does not imply that PostgreSQL has been removed.

| Domain                             | PostgreSQL                                  | D1                                                                                          | Browser tested                                  |
| ---------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Authentication, sessions, accounts | Existing request database                   | User upsert, GitHub account/session persistence, expiry and invalidation                    | D1 parity harness; core browser session         |
| Onboarding                         | Existing request database                   | Profile read/write and audit event                                                          | D1 parity harness                               |
| Workspace and membership           | Existing request database                   | Workspace creation, membership lookup, tenant predicates                                    | D1 tenant-isolation harness                     |
| GitHub installation and access     | Existing request database                   | Installation, repository catalog, selected state and re-selection                           | D1 route/service coverage; provider HTTP mocked |
| GitHub repositories                | Existing request database                   | Metadata, provider IDs as TEXT, remote-head updates                                         | D1 parity harness; core browser catalog         |
| Pull requests and issues           | Existing request database                   | D1 schema and read projection for pull requests; issue table retained for the sync boundary | Not yet browser-seeded                          |
| Webhook deduplication              | Existing PostgreSQL delivery path           | D1 delivery identity, status transition and Queue producer boundary                         | Service/integration harness                     |
| Dashboard and repository detail    | Existing request database                   | Membership-scoped D1 projection, fail-closed freshness, records and activity                | D1 projection; core browser dashboard           |
| CLI authorization                  | Existing request database                   | Device authorization, consume-once conditional claim, scoped credentials, expiry/revocation | D1 parity harness                               |
| Local TRACE sync                   | Existing PostgreSQL transaction path        | D1 negotiate, bounded artifact staging, idempotent completion and retry recovery            | D1 parity harness                               |
| Reports and findings               | Existing request database                   | Synced-artifact projection and finding reads from D1                                        | D1 projection/service harness                   |
| Conflicts, decisions, rules        | Existing request database                   | Synced-artifact projection, only when a real artifact exists                                | D1 projection/service harness                   |
| Activity and audit                 | Existing request database                   | Tenant-scoped audit projection with deterministic epoch-ms ordering                         | D1 projection/service harness                   |
| Local browser E2E                  | PostgreSQL fixture/config remains available | Isolated local D1 schema, seed, OpenNext Worker, and Playwright flow                        | Health/session/dashboard/repositories           |

CF2 therefore proves the D1 persistence/service seams and a core browser flow
locally without claiming a remote cutover. The broad Playwright suite still
uses its existing PostgreSQL fixture; the D1 browser runner is intentionally a
separate isolated lifecycle and currently covers health, persisted session,
dashboard, and repository discovery.

## Architecture

### Current

```text
OpenNext web Worker
  -> Hyperdrive
  -> PostgreSQL

GitHub webhook route
  -> PostgreSQL webhook record
  -> pg-boss
  -> continuously running Node worker
```

### Target

```text
OpenNext web Worker
  -> D1

OpenNext web Worker
  -> Queue producer binding
  -> Cloudflare Queue
  -> Cloudflare background Worker consumer
  -> D1

Existing GitHub App
  -> existing callback and webhook routes
```

The public test URL remains `trace-code.pages.dev`. The target requires no external PostgreSQL provider, continuously running Node server, or custom domain. Existing PostgreSQL, Hyperdrive, and staging resources remain rollback/reference infrastructure until D1 parity is proven.

## PostgreSQL dependency inventory

| Area                 | PostgreSQL dependency                                                        | D1 equivalent                                                              | Difficulty | Action                                                                           |
| -------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| Schema               | `pgTable`, native UUID, JSONB, `timestamptz`, bigint, boolean                | SQLite tables using TEXT, INTEGER, JSON text, and explicit application IDs | High       | Complete CF1 schema mapping; retain PostgreSQL schema during transition          |
| Web request database | Hyperdrive connection string or `DATABASE_URL` creates a `pg` client         | Cloudflare `DB` binding passed to `drizzle-orm/d1`                         | High       | Explicit D1/legacy runtime selector added; PG retained as fallback               |
| Authentication       | User/session/account/verification writes use the PostgreSQL request database | Driver-neutral stores over Drizzle D1                                      | High       | D1 callback/session persistence and expiry path ported; PG retained              |
| Workspace/onboarding | PostgreSQL upserts and unique constraints                                    | SQLite `ON CONFLICT` with the same unique targets                          | Medium     | D1 route/service branches and tenant tests added                                 |
| GitHub setup         | Transactional installation/repository upserts and bigint provider IDs        | D1 batches/transactions; provider IDs stored as TEXT                       | High       | D1 installation/catalog/selection path added; PR/issue writes remain PG          |
| GitHub webhooks      | PostgreSQL delivery record, repository update, pg-boss enqueue               | D1 delivery record plus Queue binding                                      | High       | Message contract exists; producer not switched until D1 persistence is active    |
| Dashboard            | Drizzle reads through PostgreSQL request database                            | Membership-scoped D1 projection                                            | Medium     | D1 projection and fail-closed freshness harness added                            |
| CLI authorization    | Multi-write approval transaction and `RETURNING`                             | D1 conditional claim plus bounded batch                                    | High       | D1 consume-once/scoped credential path and concurrency harness added             |
| Local TRACE sync     | Three transactions, idempotent upserts, promotion/supersession               | D1-safe conditional claims and bounded batches                             | High       | D1 negotiation/staging/completion and idempotency harness added                  |
| E2E fixtures         | 16 raw PostgreSQL query sites using `$n`, `::jsonb`, `NOW()`, and `INTERVAL` | D1 local migrations and SQLite-compatible fixture helpers                  | Medium     | New zero-schema D1 integration test added; E2E conversion pending                |
| Migrations           | PostgreSQL DDL and Drizzle PostgreSQL journal                                | Independent transitional SQLite migration journal                          | Medium     | Complete zero-to-D1 migration generated                                          |
| Worker jobs          | pg-boss tables and continuously running Node process                         | Cloudflare Queue consumer with retries and DLQ                             | High       | Contract and isolated consumer boundary added; business handlers remain unported |
| Deployment           | Hyperdrive binding                                                           | D1 and Queue bindings                                                      | Medium     | Isolated example/local config only; current staging config untouched             |

### Query compatibility inventory

The application uses Drizzle rather than runtime raw SQL for most production paths. The audit found:

- 16 raw PostgreSQL-shaped statements in `tests/e2e/home.spec.ts`.
- 10 `.returning()` call sites across runtime and integration-test code, including the new dual-driver user store.
- 3 application transactions: CLI approval plus two Local TRACE synchronization/promotion paths.
- 16 `onConflict` references across runtime and tests, including the new dual-driver user store.
- No PostgreSQL advisory locks or PostgreSQL arrays in runtime application code.
- PostgreSQL-specific migration DDL: `gen_random_uuid()`, JSONB, BIGINT, `timestamptz`, `public.` references, PostgreSQL casts, and btree declarations.

SQLite/D1 supports `RETURNING` and upserts, but each query still requires behavioral parity tests. CF1 does not treat import compatibility as transaction or concurrency parity.

## Schema mapping

All 22 PostgreSQL tables have a D1 counterpart with matching application-level column names.

| Table                              | D1 mapping notes                                                          |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `users`                            | TEXT ID; INTEGER boolean; millisecond timestamps                          |
| `sessions`                         | TEXT ID/token; millisecond expiry; cascade to user                        |
| `accounts`                         | OAuth tokens remain application data; TEXT IDs; cascade to user           |
| `verifications`                    | TEXT ID/value; millisecond expiry                                         |
| `onboarding_profiles`              | INTEGER boolean; unique user                                              |
| `organizations`                    | TEXT ID; unique slug                                                      |
| `memberships`                      | TEXT references; unique organization/user; cascades preserved             |
| `system_jobs`                      | Retained as product/audit state; not used as Queue infrastructure         |
| `audit_events`                     | JSON text metadata; nullable tenant and actor references                  |
| `github_installations`             | GitHub installation ID stored as TEXT                                     |
| `github_repositories`              | GitHub repository ID stored as TEXT; lifecycle/freshness fields retained  |
| `github_installation_repositories` | GitHub repository ID stored as TEXT; JSON permissions                     |
| `github_pull_requests`             | Provider ID stored as TEXT; PR number remains INTEGER                     |
| `github_issues`                    | Provider ID stored as TEXT; issue number remains INTEGER                  |
| `github_webhook_deliveries`        | Provider installation ID stored as TEXT; idempotent delivery key retained |
| `analysis_runs`                    | JSON result/cost text; nullable repository relation preserved             |
| `cli_device_authorizations`        | Hashed codes only; expiry and approval references retained                |
| `cli_connections`                  | Hashed token and JSON scopes retained; no secret plaintext introduced     |
| `sync_operations`                  | JSON manifest; idempotency and repository/sync unique keys retained       |
| `sync_uploads`                     | JSON metadata/projection; operation cascade retained                      |
| `synced_artifacts`                 | JSON metadata/projection; immutable record references retained            |
| `analysis_findings`                | JSON evidence; disposition references retained                            |

### Type strategies

- **UUIDs:** stored as SQLite TEXT. New application-created IDs use `crypto.randomUUID()` through `createTraceId()`. The SQL migration deliberately has no database UUID default; application and fixture writes must supply IDs.
- **Timestamps:** stored as INTEGER Unix epoch milliseconds through Drizzle `timestamp_ms`. Drizzle exposes `Date` to TypeScript. SQL defaults use `(unixepoch() * 1000)`.
- **Booleans:** stored as INTEGER through Drizzle boolean mode and exposed as TypeScript `boolean`.
- **JSON:** stored as SQLite TEXT through Drizzle JSON mode. JSON is serialized/deserialized at the database boundary. No query depends on PostgreSQL JSONB operators today.
- **GitHub/provider IDs:** stored as TEXT. `normalizeProviderId()` rejects unsafe JavaScript numbers so provider identifiers cannot silently lose precision. API boundaries must normalize IDs before D1 writes during CF2.
- **Application counters:** PR/issue numbers, byte counts, attempts, and artifact counts remain INTEGER because current contracts bound them to safe integer ranges. This must remain validated at input boundaries.

### Foreign keys and deletion behavior

The D1 schema preserves the PostgreSQL cascade, set-null, and restrict intent. D1 foreign-key enforcement and the behavior of each destructive service path must be verified in the D1 integration suite before cutover.

## Database boundary

`createD1Database(binding)` is the D1 factory. It accepts a Cloudflare-compatible
D1 binding and returns the schema-bound Drizzle D1 database. UI code never
constructs a database client. During this transitional phase, route/service
modules use the shared request-database selector and explicit D1 schema branches;
raw `env.DB.prepare()` calls are not scattered through the application.

The first domain seam is `UserStore`:

```text
upsertRequestUser
  -> UserStore
     -> PostgreSQL implementation (current runtime)
     -> D1 implementation (migration target)
```

The live request path selects D1 when the Cloudflare `DB` binding or explicit
local `TRACE_DATABASE_DRIVER=d1` is present, and otherwise retains PostgreSQL.
This keeps the migration reversible while the remaining domain and browser
paths are brought to parity.

## Local D1 development

Local D1 never contacts production.

```bash
pnpm db:d1:generate
pnpm db:d1:migrate:local
pnpm test:d1
```

- `packages/db/wrangler.d1.jsonc` declares a local-only database identity.
- `packages/db/drizzle-d1/` contains deterministic zero-to-D1 migrations.
- `pnpm test:d1` creates an isolated temporary Wrangler persistence directory, applies every migration, verifies all 22 tables, checks JSON/timestamp behavior, then removes that directory.
- `.wrangler/`, `*.sqlite`, and `*.sqlite3` are already ignored. No local database file is committed.
- Remote D1 commands are not part of CF1. No script contains `--remote`.

## Queue audit

### Existing pg-boss queues

| Queue                      | Produced today            | Consumed today | Classification       | Ordering/idempotency requirement                            |
| -------------------------- | ------------------------- | -------------- | -------------------- | ----------------------------------------------------------- |
| `system.healthcheck`       | No runtime producer found | Log only       | Placeholder          | No ordering; probe ID should deduplicate diagnostics        |
| `github.webhook.process`   | GitHub webhook route      | Log only       | Placeholder boundary | Delivery ID is the idempotency key; duplicates must be safe |
| `github.installation.sync` | No                        | No             | Unused scaffold      | Installation ID reference; latest-state processing          |
| `github.repository.sync`   | No                        | No             | Unused scaffold      | Tenant/repository key; duplicate safe                       |
| `github.pull-request.sync` | No                        | No             | Unused scaffold      | Repository/PR reference; duplicate safe                     |
| `github.issue.sync`        | No                        | No             | Unused scaffold      | Repository/issue reference; duplicate safe                  |
| `github.webhook.replay`    | No                        | No             | Unused scaffold      | Original delivery ID; explicit replay audit required        |
| `analysis.changes`         | No                        | Log only       | Placeholder          | Analysis-run idempotency key; no source payload in Queue    |
| `reports.daily`            | No                        | Log only       | Placeholder          | One organization/window key; no strict ordering             |
| `reports.weekly`           | No                        | Log only       | Placeholder          | One organization/window key; no strict ordering             |
| `conflicts.reconcile`      | No                        | Log only       | Placeholder          | Repository-scoped idempotent reconciliation                 |
| `sync.reconcile`           | No                        | Log only       | Placeholder          | Sync-operation ID; retry-safe promotion semantics           |

There are no real pg-boss business handlers in the current worker. Seven registered handlers only log acceptance. Five declared queues have no registered consumer. CF1 therefore does not claim that a background capability was ported.

### Cloudflare Queue contract

`TraceQueueMessage` is a strict, versioned discriminated union for all 12 known job types. Every message carries:

- `version`
- a bounded `idempotencyKey`
- an offset-aware `enqueuedAt`
- only job-specific IDs and bounded metadata

Unknown keys and source-bearing payloads are rejected. Queue bodies contain references, not repository source, snippets, OAuth secrets, or CLI credentials.

The initial Cloudflare consumer:

- validates every message before dispatch;
- implements only `system.healthcheck` against D1;
- retries invalid, failed, and not-yet-implemented jobs so configured max retries/DLQ policy can retain them;
- does not acknowledge placeholder work as completed;
- never logs the Queue body.

The current GitHub webhook route still produces through pg-boss. Switching that producer before the D1 webhook-delivery transaction is parity-tested would create a split-brain persistence boundary, so CF1 exposes a typed Queue sender but does not wire the live route.

Cloudflare Queues provide at-least-once delivery, not global ordering. Every real handler must use the message idempotency key plus durable D1 state. Code must not infer ordering from batch position.

## Scheduling decision

- Daily and weekly report generation should use Cloudflare Cron Triggers to enqueue one bounded Queue message per organization/time window after those handlers become real.
- Reconciliation can use a Cron Trigger to enqueue idempotent repository/operation references when periodic repair is necessary.
- Cloudflare Workflows are not justified by current behavior. No existing handler contains a durable multi-step process requiring workflow state.
- CF1 creates no Cron Trigger because the corresponding handlers are placeholders.

## D1 concurrency and correctness gates

Before switching runtime traffic, CF2/CF3 must prove:

1. Tenant predicates remain mandatory for repository and intelligence queries.
2. Duplicate GitHub deliveries produce one durable effect.
3. CLI approval consumes an authorization code once under concurrency.
4. Sync negotiation remains idempotent for repository/sync and idempotency keys.
5. Artifact promotion is atomic enough for readers to see either the previous verified set or the new complete set.
6. Failed sync preserves the previous verified dashboard state.
7. D1 transaction/batch behavior matches each current PostgreSQL transaction invariant.
8. Queue retries cannot promote partial records or cross organization boundaries.

No PostgreSQL locking primitive was found, but PostgreSQL transaction isolation is still an implicit dependency in CLI approval and sync promotion. It must be replaced with explicit conditional writes, uniqueness constraints, and retry tests rather than assumed away.

## Security and tenant isolation

- Existing Cloudflare/GitHub/session secrets remain deployment secrets. They are not D1 columns or Queue payloads.
- Existing hashes for CLI tokens and device codes remain hashes.
- No repository source or code snippets are added to Queue messages.
- The D1 schema preserves every current organization/repository foreign key, but schema shape alone does not prove authorization. Cross-organization query and mutation tests are required before cutover.
- The existing GitHub App, permissions, callback URLs, webhook secret, and `trace-code.pages.dev` proxy remain unchanged.

## Transition plan and cutover gates

### CF1 — additive foundation (this change)

- Complete PostgreSQL/schema/queue audit.
- Add all 22 D1 tables and zero-to-D1 migration.
- Add D1 factory and first driver-neutral user store.
- Add local isolated D1 test infrastructure.
- Add Queue message contract and non-deployed consumer skeleton.

### CF2 — service parity

- Move auth, workspace, GitHub installation/repository, dashboard, CLI auth, and Local TRACE sync persistence behind driver-neutral contracts.
- Replace PostgreSQL-shaped E2E fixtures with D1-local factories.
- Add auth, tenant isolation, cascade, webhook deduplication, CLI approval, and sync transaction parity tests.

### CF3 — isolated Cloudflare-native staging

- Provision new staging-only D1 and Queue resources.
- Bind a distinct CF-native staging web/consumer pair.
- Switch the webhook producer only in that isolated environment.
- Verify existing GitHub App, auth, dashboard, and Local TRACE bridge end to end.

### CF4 — runtime cutover

- Remove the web runtime dependency on `DATABASE_URL`/Hyperdrive after parity and rollback tests.
- Keep PostgreSQL resources intact until the accepted observation window ends.

### CF5 — retirement

- Remove pg-boss and the external Node worker only after every real producer/consumer is replaced.
- Remove PostgreSQL/Hyperdrive dependencies and legacy CI only after D1 is authoritative and recovery is documented.

## CF1 exclusions (historical)

- No Cloudflare resource was created, changed, or deleted.
- No staging or production deployment occurred.
- No migration was applied to staging or production.
- PostgreSQL, Hyperdrive, pg-boss, and the Node worker were not removed.
- At the end of CF1, the web request database still used PostgreSQL.
- At the end of CF1, the GitHub webhook route still used pg-boss.
- At the end of CF1, auth beyond user upsert, GitHub data paths, dashboard
  reads, CLI authorization, and sync transactions were not yet ported. CF2
  adds explicit D1 branches while retaining these PostgreSQL references.

## CF2 application boundary

The request database now selects an explicit runtime driver:

```text
Cloudflare DB binding or TRACE_DATABASE_DRIVER=d1 -> D1
explicit TRACE_DATABASE_DRIVER=postgres          -> PostgreSQL
no binding/selector                               -> legacy PostgreSQL configuration
```

The selector fails closed when D1 is requested without a `DB` binding or when
an unsupported driver is named. Web routes use the shared request-database
boundary; UI code does not construct a PostgreSQL client or call a D1 binding
directly.

### D1-ready application paths

- Auth callback persistence writes the user, GitHub account identity, and
  signed session to D1. Protected routes validate the signed cookie against an
  unexpired persisted session; sign-out invalidates that session.
- Onboarding, workspace membership, repository catalog/selection, and GitHub
  installation setup use D1 tables with the same tenant predicates as the
  PostgreSQL path.
- CLI device authorization uses conditional D1 claims for consume-once
  behavior. Credentials remain hashed, scoped, expiring, and revocable.
- Local TRACE sync uses D1-safe conditional operation claims and bounded D1
  batches. Manifest/checksum validation, source-free policy, divergence, and
  idempotent promotion remain unchanged.
- Dashboard projections read D1 repositories, analysis runs, findings, synced
  artifacts, reports, conflicts, decisions, rules, and audit activity. Unknown
  GitHub freshness remains unknown rather than becoming `Current`.
- A D1 webhook branch records delivery identity before it enqueues a bounded
  Queue reference. The legacy PostgreSQL/pg-boss path remains in place when no
  D1 binding is present.

### Remaining PostgreSQL-only or reference paths

These paths are intentionally retained until CF3/CF4 cutover proof:

- `packages/db/src/index.ts` PostgreSQL pool/client factory and PostgreSQL
  schema remain the legacy driver.
- The PostgreSQL branches in `apps/web/lib/sync-service.ts`,
  `apps/web/lib/cli-auth.ts`, dashboard projection, GitHub setup, and request
  database remain operational reference implementations.
- `apps/worker/src/index.ts` still runs the existing Node/pg-boss worker.
- The non-D1 branch of `apps/web/app/api/github/webhooks/route.ts` still
  records deliveries and publishes through pg-boss.
- `apps/web/lib/bridge.integration.test.ts` and `tests/e2e/home.spec.ts`
  retain PostgreSQL fixtures. They are not production fallbacks; the isolated
  D1 browser runner is separate and currently covers the core authenticated
  dashboard/repository flow.
- PostgreSQL migrations, Hyperdrive bindings, deployment examples, backups,
  and restore scripts remain untouched for rollback/reference use.

### Local CF2 commands

The following commands never use a remote D1 database:

```bash
pnpm db:d1:generate
pnpm db:d1:migrate:local
pnpm test:d1
pnpm test:d1:parity
pnpm dev:d1
```

`test:d1` verifies the zero-to-D1 schema and type round trips. `test:d1:parity`
seeds an isolated in-memory D1 database and verifies auth/session expiry,
workspace isolation, provider-ID precision, CLI authorization, webhook
deduplication, sync idempotency, freshness, and required indexes. `test:d1:e2e`
creates a fresh local D1 store, applies the migration, seeds a signed session,
starts the OpenNext worker with Wrangler's `local-d1` environment, and runs the
core browser flow. `dev:d1` starts the same local environment interactively;
neither command seeds production or staging data.

### Query and index audit

The D1 schema includes indexes for membership lookup, provider identity,
session tokens, CLI credentials, repository-scoped sync history, artifact
lookups, activity ordering, and webhook delivery identity. The dashboard uses
bounded, membership-scoped queries and in-memory maps for latest-per-repository
selection rather than per-row follow-up queries. Sync uploads are sent in
bounded D1 batches and are safe to retry through unique natural keys and
conditional lifecycle updates. No N+1 query was introduced by the D1
projection; full query-plan profiling remains a CF3 staging task.

### Queue transition status

Cloudflare Queue contracts and the isolated consumer are available, but pg-boss
remains the live asynchronous path outside D1 runtime. The D1 webhook branch
uses a Queue binding only when D1 is explicitly active, so a request is never
intentionally published to both systems. Queue business handlers remain
placeholders until their corresponding PostgreSQL behavior is proven and ported.

### CF2 limits

No remote D1 database or Queue was created. No existing PostgreSQL, Hyperdrive,
GitHub App, staging, or production resource was changed. The isolated D1
Playwright runner passed health, persisted-session, dashboard, and repository
discovery checks at a mobile viewport. The broad Playwright suite and several
domain bridge tests still use their PostgreSQL fixtures. GitHub PR/issue write
ingestion and Queue business handlers remain on the reference path or are
placeholders, so full application parity and cutover are not claimed.
