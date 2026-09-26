# TRACE Implementation Log

### Phase CF4.4 Durable webhook recovery

- Status: Local D1 owner-only recovery implemented; no remote migration,
  deployment, push, merge, resource, credential, or production change.
- Date: 2026-09-21
- Recovery contract: D1 webhook deliveries now retain the trusted normalized
  event, tenant/repository scope, bounded attempts, sanitized failure metadata,
  replay claim state, and operator identity. Queue/handler failures become
  `potentially_unresolved`; this does not claim remote retry exhaustion.
- Access: Owners can list at most 50 unresolved deliveries and request one
  replay by delivery ID. Server-side checks enforce workspace ownership,
  current installation/repository state, stored event validity, and an atomic
  single-winner `replaying` transition. Enqueue failures return to the
  recoverable state. Recovery actions are audited.
- Verification: `pnpm test:d1:cf44` covers normal completion, transient retry,
  post-write replay, four modeled failures, owner replay, existing-effect
  replay, concurrent claims, tenant/non-owner rejection, revoked access,
  enqueue failure/recovery, and exactly-one issue projection. These are local
  simulations; remote Queue exhaustion is not claimed.

### Phase CF4.3 Queue retry and business idempotency

- Status: Local D1 fault-injection proof complete; no staging or production
  deployment, resource, migration, credential, or legacy-infrastructure change.
- Date: 2026-09-21
- Verification: `pnpm test:d1:cf43` proves transient failure retry, replay after
  a business write before acknowledgement, one logical PR projection, tenant
  and repository preservation, and retry exhaustion without false success.
- Operational gap: staging uses `max_retries: 3` without a dead-letter queue.
  Exhausted messages are not acknowledged and leave the D1 delivery row
  `queued`; Cloudflare logs/Queue metrics are the only current operator signal.
  Production cutover requires a bounded DLQ or an owner-only durable replay
  path.

### Staging hardening and merge readiness

- Status: Hardening is implemented, deployed to staging, and regression-tested locally. Immutable Worker version `4817dae0-dd68-4e7b-9a7a-51ef00260882` is serving 100% of staging traffic; GitHub-backed freshness refresh and the completion-race fix are live.
- Date: 2026-08-14
- Freshness: `remote_head_sha` was null because the existing repository-selection and push-webhook paths did not yet populate the trusted default-branch head for the connected repository. The minimum fix now refreshes the selected repository through the authenticated GitHub App ref API and updates the existing webhook path for default-branch pushes. Unknown remains `Freshness unknown`; it is not mapped to current. Public `main` HEAD and the synchronized commit both read `4953addc8992f882a1c983bad061fb8035213276`.
- Sync recovery: A local pooled-PostgreSQL race test reproduced concurrent completion inserting duplicate promoted artifacts. `completeSync` now locks the operation row and performs validation, projection, promotion, and acknowledgement in one transaction. The regression test proves one completion and one idempotent retry; partial staged data cannot become current. The earlier staging transient `500` remains unproven because the live Wrangler tail stream did not provide an exception.
- Diagnostics: Sync route failures now emit only a bounded request ID, route, operation ID, and safe error category; the CLI surfaces the request ID without response bodies, credentials, token hashes, source, or Markdown.
- Audit verification: The staging application path previously showed device approval, repository connection, sync start/completion, rejection, divergence, and revocation records. A later direct Neon re-query timed out; it was not reproduced through application requests, no public audit endpoint was added, and the operator credential was removed before another direct query.
- Migration review: `0004` creates the bridge tables and constraints, `0005` moves artifact uniqueness to operation scope and adds audit metadata, and `0006` backfills `request_key_hash` from `device_code_hash` before enforcing `NOT NULL`. A temporary local fresh-database run and a populated `0003` upgrade run both applied all seven ledger entries and verified the bridge tables and `request_key_hash` constraint.
- Secret handling: `.env.local` was deleted after operator migration access was no longer required. It is not tracked and must not be recreated for this phase. Rotate the staging Neon password because it was pasted into chat.
- Deployment: Immutable version `4817dae0-dd68-4e7b-9a7a-51ef00260882` was promoted with the supported Wrangler version-deployment path to 100% of `trace-test-staging` traffic (deployment `986a6efd-0d6e-45a8-b84b-9970a62b37ba`). Health and unauthenticated route boundaries were reverified. The earlier Windows upload/promotion interruption and version `2a87b573-fb0b-4938-9419-de74dc273a7e` remain historical.
- Scope: No production migration or deployment, commit, push, or PR was performed. Publication branch `codex/local-dashboard-bridge` was created separately; changes remain uncommitted.

### Initial live staging CLI-to-dashboard acceptance

- Status: The initial real authenticated staging happy path completed through projection. The later hardening deployment and freshness refresh are recorded in the merge-readiness entry above. Production was not touched.
- Date: 2026-08-14
- Initial acceptance Worker: `trace-test-staging`, version `2a87b573-fb0b-4938-9419-de74dc273a7e`, 100% staging traffic.
- Targeting: `TRACE_ENVIRONMENT=staging`; the CLI reported `Environment: Staging` and the expected staging server. The credential was stored outside the repository with Windows DPAPI and was never printed.
- Authorization: Owner-approved device authorization completed. `trace whoami` reported the `mathofdynamic on GitHub` workspace, `mathofdynamic/TRACE` and `mathofdynamic/Radar` repository scope, and an active scoped connection. Database verification found one active connection with no exposed token/hash.
- Repository: `trace connect` matched exactly `mathofdynamic/TRACE`; `trace status` persisted the staging binding and a valid `.trace` record.
- Analysis: Local run on branch `main` at `4953addc8992f882a1c983bad061fb8035213276` produced 233 supported files, 752 file-level/unsupported files, 8,005 symbols, and four deterministic findings. The artifact validated; semantic inference was disabled and no source was sent to the cloud.
- Sync: Dry run listed three eligible internal artifacts totaling 32,592 bytes, zero excluded artifacts, `sourceCodeIncluded: false`, and `codeSnippetsIncluded: false`. The first real sync uploaded 4,786 bytes; a daily report increment uploaded one new artifact (2,269 bytes); the interrupted weekly-report upload resumed one missing artifact (25,537 bytes) and promoted operation `920ae2ed-117c-48d5-844a-c26f92ae37dd` atomically. Final snapshot: three artifacts, 32,592 bytes.
- Projection: Staging PostgreSQL contains the completed snapshot, local execution origin, branch/commit metadata, two reports, one completed analysis run, and four deterministic findings. The repository's latest synchronized timestamp and snapshot are current in the server/API projection. No fixture rows were used.
- Reliability/security: Repeated sync returned `idempotent: true` and uploaded zero bytes. Controlled staging checks returned traversal `400`, unauthorized repository `403`, checksum mismatch `422`, and stale-base divergence `409`; failed checksum data was not promoted. A controlled offline client test preserved `.trace` and returned the safe unavailable message; restoring staging recovered with an idempotent sync. Audit rows exist for connection approval, sync start/completion, artifact rejection, and divergence.
- Revocation recovery: Dashboard revocation rejected the old credential (`whoami` reported invalid/expired and `sync` required authentication). Re-authentication stored a new DPAPI credential and restored the exact workspace/repository binding. The first post-revocation idempotent sync exposed a CLI defect: it attempted `/api/sync/complete` for an already-completed operation owned by the revoked connection. The CLI now honors a completed negotiation without calling `complete`; a regression test covers credential rotation, and staging recovery returns `idempotent: true` with `uploaded: 0`.
- Acceptance limits at that time: The first immediate retry of the interrupted upload returned a transient generic `500`; the staged operation remained non-current, subsequent retry returned `200`, and recovery completed. Wrangler tail could not establish its live log stream from this environment, so no server exception is claimed. Dashboard visual inspection and browser-session revocation required an owner-authenticated browser; freshness was `null` because the staging repository had no `remote_head_sha` to compare. These limits were superseded by the deployed hardening and owner visual acceptance recorded above.
- Secret handling: `.env.local` was Git-ignored, never printed, copied into tracked files, uploaded, or written to `.trace`, and was deleted after operator access ended. Rotate the staging Neon password because it was pasted into chat.
- Validation: `pnpm check` passed (26/26 typechecks, 26/26 unit tasks, 15/15 builds); `pnpm test:e2e` passed 17/17 after starting the supported local PostgreSQL cluster; `pnpm cf:build` passed; CLI tests passed 9/9; schema tests passed 4/4; bridge integration passed 6/6; local migration rerun passed; `git diff --check` passed with only CRLF normalization warnings; tracked secret/runtime scan found no tracked `.trace`, credential-like file, or real token.

### Staging database migration and bridge retest

- Status: Staging database access unblocked; migrations applied and the previous CLI authorization 500 resolved. The real login approval remains owner-gated by GitHub authentication in the browser environment.
- Date: 2026-08-13
- Secret handling: `.env.local` exists and is gitignored. Its `DATABASE_URL` was loaded only into short-lived migration/query processes. It was not printed, copied into the repository, uploaded, or written to `.trace`.
- Database identity: The connection matched the configured `trace-staging-postgres` Hyperdrive origin and expected Neon database/user identity. The TRACE schema was present; no production marker was present.
- Migration state: Before migration, `drizzle.__drizzle_migrations` contained entries through `0003_fair_nomad` (four rows). After the operator migration, it contains all seven journal entries through `0006_perfect_falcon`. The repository-supported `scripts/postgres/migrate.ps1` path was made Windows-safe by routing pnpm through `cmd.exe` and preserving the exit code; an idempotent rerun exited successfully.
- Schema verification: `cli_device_authorizations`, `cli_connections`, `sync_operations`, `sync_uploads`, `synced_artifacts`, audit, repository, and analysis tables exist. `request_key_hash` is `text NOT NULL` with its request/created index. Sync uniqueness indexes and foreign keys are present. The organization foreign key exists semantically under the database's existing constraint name rather than the generated name expected by the local migration text.
- Root cause: The Worker was deployed against a database whose migration ledger stopped before the bridge migrations. `POST /api/cli/device/start` therefore queried bridge schema that did not exist, producing the generic 500. After applying `0004-0006`, the same endpoint returned HTTP 200 with the complete device authorization response.
- Live retest: A real staging CLI login process is polling the issued device authorization. The staging authorization page redirects to GitHub sign-in, but this execution environment has no authenticated GitHub browser session, so approval cannot be completed without owner interaction. No CLI credential has been issued.
- Validation after migration: `pnpm check` passed (26/26 typechecks, 26/26 unit tasks, 15/15 builds); `pnpm test:e2e` passed 17/17 after restoring local PostgreSQL; bridge integration passed 6/6; CLI passed 8/8; schema tests passed 4/4; `pnpm cf:build` passed; `git diff --check` passed. Security scan found no tracked runtime `.trace`, environment, private-key, or real-token files.
- Remaining owner action: Sign in to the staging TRACE dashboard with the authorized GitHub account and approve the active CLI device request. Then rerun/continue `trace login`, `trace connect`, analysis, sync, and the remaining live acceptance checks. Production was not touched.

## Current status

- Implementation frontier: Local-to-dashboard intelligence bridge and UX redesign. The bridge is merged, accepted against staging, and the hardening Worker is deployed to 100% of staging traffic.
- Current staging Worker: `4817dae0-dd68-4e7b-9a7a-51ef00260882` on `trace-test-staging`.
- Current phase: Staging-accepted bridge; local UX redesign implementation is in review.
- Last completed phase: Local-to-dashboard bridge and staging hardening.
- Branch: `main` (local redesign work remains intentionally unstaged).
- Production remains outside this phase and requires separate infrastructure, credentials, migration, and operational authorization.

## Architecture decisions

- TRACE is implemented as a TypeScript-centered monorepo with local-first, cloud, and hybrid execution modes.
- Durable project intelligence is stored in a versioned `.trace/` artifact contract.
- Deterministic repository evidence is collected before semantic model analysis.
- PostgreSQL remains the database architecture. Local Windows development uses native PostgreSQL; Docker is not a required prerequisite.
- The standard unprivileged local fallback uses a project-local PostgreSQL cluster on port `3002` under ignored `.trace-cache/postgres-data`.
- OpenAI is the first live model provider behind a provider-neutral adapter.
- GitHub OAuth authentication and GitHub App installation credentials remain separate concerns.
- TRACE does not implement individual developer productivity scoring.

## Phase history

### Phase 00 — Project Rules and Agent Workflow

- Status: Completed
- Date: 2026-08-08
- Scope completed: Repository instructions, contribution workflow, issue templates, decision records, security documentation shell, and housekeeping rules.
- Files changed: `AGENTS.md`, `IMPLEMENTATION-LOG.md`, `CONTRIBUTING.md`, `.github/`, `DOC/decisions/`, `SECURITY.md`, `.gitignore`
- Migrations: None
- Tests added: None; this phase contains no product runtime.
- Commands run: Repository inspection, Markdown link checks, YAML parsing, secret-pattern scan, runtime-file check.
- Results: Phase 00 validation completed successfully.
- Known limitations: Product code and dependency configuration did not exist at the end of this phase.
- Next prerequisites: Native PostgreSQL installation and Phase 01 monorepo initialization.

### Phase 01 — Foundation and Monorepo

- Status: Completed
- Date: 2026-08-08
- Scope completed: pnpm/Turborepo TypeScript monorepo, Next.js web shell, Node worker, shared package boundaries, strict tooling, environment validation, structured logging, Drizzle migrations, Better Auth server wiring, pg-boss health job, native PostgreSQL lifecycle scripts, and initial browser/unit test foundations.
- Files changed: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.mjs`, `vitest.workspace.ts`, `playwright.config.ts`, `.env.example`, `apps/`, `packages/`, `scripts/postgres/`, `DOC/decisions/0001-native-postgresql-local-runtime.md`, `Implementation-Prompts/01-foundation-and-monorepo.md`, `README.md`
- Migrations: `packages/db/drizzle/0000_foundation.sql`; applied to an empty local PostgreSQL database.
- Tests added: Environment validation, worker health-job registration, web home-page smoke test, and health-route response test.
- Commands run: `pnpm install --offline --no-frozen-lockfile --ignore-scripts`, `scripts/postgres/bootstrap-local.ps1`, `scripts/postgres/health.ps1`, `pnpm db:migrate`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm build`, `pnpm test:e2e`, and a worker healthcheck execution.
- Results: Typecheck, lint, format check, unit tests, production build, browser smoke tests, database migration, Better Auth handler initialization, and worker healthcheck completed successfully.
- Known limitations: GitHub OAuth values are local placeholders; no live GitHub OAuth/App integration exists yet. The Windows PostgreSQL service is installed but could not be started without administrator rights, so the project-local cluster is the supported local fallback. The web surface is explicitly a Phase 01 foundation and does not claim product functionality.
- Next prerequisites: Phase 02 design tokens and shared components.

### Phase 02 — TRACE Design System

- Status: Completed
- Date: 2026-08-08
- Scope completed: Dark-first TRACE token contract, shared React primitives, layered surface variables, restrained tactile controls, semantic evidence/status badges, accessible form field states, responsive foundation styles, and reduced-motion handling.
- Files changed: `packages/ui/src/tokens.ts`, `packages/ui/src/components.tsx`, `packages/ui/src/tokens.test.ts`, `packages/ui/src/index.ts`, `packages/ui/package.json`, `packages/ui/tsconfig.json`, `apps/web/app/globals.css`, `package.json`
- Design constraints enforced: System-font fallback only; existing font binaries remain reference material and are not loaded. Primary blue is reserved for interaction and information emphasis. No generic SaaS gradients, glassmorphism, ambient glow, or decorative product data were added.
- Tests added: Design-token contract test.
- Commands run: `pnpm install --offline --no-frozen-lockfile --ignore-scripts`, `pnpm format`, `pnpm check`, `pnpm test:e2e`, and a live `system.healthcheck` job against local PostgreSQL.
- Results: Shared UI typecheck/build and token test passed. Full format, lint, typecheck, unit test, production build, and browser smoke gate passed. Web E2E: 2 passed. Worker healthcheck completed successfully.
- Known limitations: The primitives are foundational and not yet the complete product shell. Marketing, authentication, GitHub, analysis, and dashboard behavior remain intentionally unimplemented.
- Next prerequisites: Phase 03 public marketing and application shell.

### Phase 03 — Marketing Website and Authentication Shell

- Status: Completed
- Date: 2026-08-08
- Scope completed: Public route map, TRACE wordmark and navigation, responsive marketing pages, original change-flow visualization, security/specification/pricing/docs content, metadata, Open Graph image, sitemap, robots rules, Better Auth route wiring, GitHub sign-in UI, safe unauthenticated states, auth error surface, protected route boundary, and PostgreSQL-backed onboarding persistence.
- Files changed: `apps/web/app/`, `apps/web/package.json`, `packages/auth/src/index.ts`, `packages/db/src/schema.ts`, `packages/db/drizzle/0001_onboarding.sql`, `playwright.config.ts`, `tests/e2e/home.spec.ts`
- Tests added: Public navigation, protected redirect, auth session null-state, onboarding unauthorized-state, and existing health/home smoke coverage.
- Results: Production build passed with public, auth, onboarding, metadata, and API routes. Browser suite: 5 passed. Unauthenticated `/app` redirects server-side; `/api/auth/get-session` returns `null`; `/api/onboarding` returns `401` without a session. Onboarding migration applied to local PostgreSQL.
- Known limitations: GitHub OAuth credentials are placeholders, so live provider sign-in has not been claimed or tested. Rate limiting, production callback configuration, and account recovery depend on later operational setup.
- Next prerequisites: Phase 04 authenticated dashboard shell.

### Phase 04 — Dashboard Application Shell

- Status: Completed
- Date: 2026-08-08
- Scope completed: Protected `/app` route group, persistent desktop sidebar, responsive mobile navigation, workspace context, command-search placeholder, application navigation, overview hierarchy, repository setup state, conflict/report/rules/activity/settings shells, repository route family, explicit fixture labels, empty states, source-data boundaries, and responsive layout adaptations.
- Files changed: `apps/web/app/(app)/app/`, `apps/web/app/globals.css`, `tests/e2e/home.spec.ts`
- Fixtures: No connected GitHub or analysis fixtures were added. All application shells identify themselves as `Demo data · not connected` or use explicit empty states.
- Results: Full typecheck, lint, production build, and browser suite passed. The authenticated route group is server-protected and ready for later typed data adapters.
- Known limitations: No GitHub payloads, analysis results, reports, findings, conflicts, or repository rows are represented as real data.
- Next prerequisites: Phase 05 signed GitHub App webhook and installation integration.

### Phase 05 - GitHub App Integration

- Status: Completed
- Date: 2026-08-08
- Scope completed: Tenant-scoped GitHub installation, repository, pull-request, issue, and webhook-delivery entities; signed webhook verification; delivery deduplication; normalized event contracts; queued processing boundary; installation setup state; and narrow Octokit adapters.
- GitHub permissions/events: Read-only metadata, contents, pull requests, and issues are the requested baseline. The implementation does not request content, review-comment, or issue-comment writes. Installation, repository, pull request, push, and issue events are normalized; Checks integration remains a later phase.
- Files changed: `packages/db/src/schema.ts`, `packages/db/drizzle/0002_github-integration.sql`, `packages/env/src/index.ts`, `packages/trace-github/`, `apps/web/app/api/github/`, `apps/worker/src/`, `.env.example`, `playwright.config.ts`
- Tests added: GitHub HMAC vector, pull-request normalization, signed webhook acceptance/deduplication, and invalid-signature rejection.
- Results: Migration applied to the empty local PostgreSQL database. Webhook verification uses HMAC-SHA256 with constant-time comparison, raw-body validation, a 1 MB limit, delivery-ID uniqueness, and asynchronous pg-boss acknowledgement. Browser suite: 7 passed.
- Known limitations: Live GitHub OAuth/App credentials, installation exchange, repository synchronization, and production callback configuration are not available in this workspace. No live GitHub integration is claimed.
- Next prerequisites: Phase 06 `.trace` artifact schema and safe writer.

### Phase 06 - `.trace` Artifact Contract

- Status: Completed
- Date: 2026-08-08
- Scope completed: Versioned schema 0.1 metadata, Markdown frontmatter parsing, stable IDs, checksums, provenance and evidence references, supersession and sensitivity fields, safe path handling, symlink rejection, atomic writes, no-overwrite defaults, validator CLI, schema JSON, RFC, examples, and versioning/security documentation.
- Files changed: `packages/trace-schema/`, `spec/`
- Tests added: Unsafe-path and unsafe-Markdown rejection plus atomic/no-overwrite writer behavior.
- Results: All example artifacts validate with `trace-schema validate spec/examples/v0.1`; inspection exposes structured metadata and Markdown size without executing content.
- Known limitations: Repository sync, indexes, projections, and artifact production from analysis are implemented in later phases. The schema is intentionally version 0.1 and subject to compatibility rules in `spec/VERSIONING.md`.
- Next prerequisites: Phase 07 local CLI and Agent Skill.

### Phase 07 - Local CLI and Agent Skill

- Status: Completed
- Date: 2026-08-08
- Scope completed: `trace` CLI contract for initialization, status, deterministic Git change collection, validation, inspection, report draft, PR draft, sync status, config inspection, and diagnostics; dry-run defaults; safe artifact writing boundary; and the initial Agent Skill orchestration workflows.
- Files changed: `packages/trace-cli/`, `packages/trace-core/src/index.ts`, `skills/trace/`
- Tests added: CLI contract test; package typecheck and build validation.
- Results: `trace --version`, `trace init --dry-run --json`, `trace status --json`, and `trace changes --json` execute locally. CLI unit test passed. The CLI does not make hidden model calls or present draft reports as completed analysis.
- Known limitations: The CLI currently provides the deterministic local foundation. Full repository analysis, reports, PR intelligence, rules, and synchronization behavior are intentionally delivered by later phases.
- Next prerequisites: Phase 08 staged deterministic and semantic analysis pipeline.

### Phase 08 - Change Analysis Engine

- Status: Completed
- Date: 2026-08-08
- Scope completed: Shared read-only repository workspace, containment and symlink checks, file-size and binary exclusions, secret-path exclusion, TypeScript/JavaScript AST parsing, exported symbol extraction, import graph construction, bounded context selection, content-addressed parser cache with tenant namespace, deterministic checks, structured semantic provider contract, evidence verification, cancellation, stage timing, CLI analysis integration, and fake-provider local execution.
- Pipeline: Normalize -> change set -> inspect -> parse -> graph -> enrich -> context -> checks -> semantic -> verify.
- Deterministic checks: Missing related tests, dependency change, schema/migration change, public export change, invalid `.trace` artifacts, and bounded-context warning.
- Model contract: Provider-neutral structured generation with Zod validation, timeout, bounded retries, explicit `--with-ai`, OpenAI-compatible HTTP adapter, fake provider for tests, and data-policy metadata. Source code is not sent by the fake provider and credentials are never logged or persisted.
- Tests added: TypeScript symbol/graph extraction, missing-test check, explicit semantic execution, fake-provider policy, cancellation/unsafe workspace paths through the shared boundaries.
- Results: Analysis package typecheck, build, and two tests passed. `trace analyze changes` executes locally and returns serializable coverage, graph, context, findings, timings, provenance, and warnings. Unsupported languages are reported as reduced/no analysis rather than symbol-level support.
- Known limitations: Full incremental relationship invalidation, CI evidence ingestion, active-PR overlap, and cloud persistence are completed in later phases. No analysis comments, commits, or repository writes are published.
- Next prerequisites: Phase 09 PR intelligence, GitHub Checks, and policy-controlled delivery.

### Phase 09 - Pull Request Intelligence

- Status: Completed
- Date: 2026-08-08
- Scope completed: Stable PR trigger/idempotency contract, evidence-backed brief model, review states, publication policy, managed Markdown section merge, local deterministic/optional-semantic `trace pr` dry-run, PR artifact metadata, and analysis-run/finding/disposition persistence schema.
- Results: Analysis and CLI tests pass. Uncertain/low-confidence findings are excluded from the default publication set. TRACE does not approve, merge, comment, or write GitHub content automatically.
- Known limitations: Live GitHub Checks/comments, dashboard PR data loaders, and installation credentials remain deployment/integration work.
- Next prerequisites: Phase 10 conflict lifecycle and detectors.

### Phase 10 - Concurrent-Change Conflict Detection

- Status: Completed
- Date: 2026-08-08
- Scope completed: Active-change candidate selection, file/symbol/API/schema/dependency overlap detectors, typed evidence, separate severity/classification/confidence, lifecycle transitions, stale-head detection, and conflict artifact rendering.
- Results: Compatible cross-repository pairs are excluded from candidate comparison; same-repository overlaps become confirmation-needed entities rather than automatic merge decisions. Two conflict tests pass.
- Known limitations: Semantic conflict calls and persistent conflict lifecycle tables are not yet connected to live GitHub reconciliation.
- Next prerequisites: Phase 11 daily and weekly reports.

### Phase 11 - Daily and Weekly Reports

- Status: Completed
- Date: 2026-08-08
- Scope completed: UTC report windows with display timezone, rolling and weekly windows, material item contract, evidence-linked report rendering, no-change-safe output, local daily/weekly CLI paths, and explicit no-productivity-scoring language.
- Results: Time-window and report-rendering tests pass. `trace report daily` and `trace report weekly` default to dry-run until `--yes`; `--with-ai` remains explicit.
- Known limitations: pg-boss scheduling, dashboard report projections, late-event revisions, and external delivery adapters remain later operational work.
- Next prerequisites: Phase 12 dashboard projections and hybrid synchronization.

### Phase 12 - Dashboard Data and Hybrid Synchronization

- Status: Completed
- Date: 2026-08-08
- Scope completed: Tenant-scoped analysis tables, selective sync manifest contract, sensitivity/path/type policy planning, deterministic redaction, divergence detection, authenticated dashboard summary route, authenticated manifest negotiation, and reconciliation queue boundaries.
- Results: Sync unit tests pass; manifests explicitly declare `sourceCodeIncluded: false`. No whole-repository upload, embeddings, cache, credential, or source persistence was added.
- Known limitations: Production artifact ingestion storage, CLI OS credential broker, full artifact projections/search, resumable upload, and live dashboard query coverage require operational integration.
- Next prerequisites: Phase 13 rules and governance.

### Phase 13 - Rules and Governance

- Status: Completed
- Date: 2026-08-08
- Scope completed: Typed rule definitions, deterministic/advisory distinction, explicit precedence, effective-rule merge, baseline evaluators, scoped expiring overrides, CLI rule inspection/test paths, and feature flags for mandatory/high-risk behavior.
- Results: Rule precedence, deterministic evaluation, and expiry tests pass. Semantic guidance is not treated as a hard failure without explicit deterministic policy.
- Known limitations: Organization-level rule editor, approval persistence, and role matrix UI are not connected to live tenant administration.
- Next prerequisites: Phase 14 security and privacy hardening.

### Phase 14 - Security and Privacy Hardening

- Status: Completed
- Date: 2026-08-08
- Scope completed: Threat model, data-flow, permission matrix, retention baseline, incident and key-rotation runbooks, CSP/security headers, server-side membership-scoped dashboard queries, prompt-injection boundary, artifact/path safety, and sync source-free contract.
- Results: Existing webhook, artifact, analysis, sync, and rule tests pass. Public claims remain limited; no certification, zero-retention, or compliance guarantee is made.
- Known limitations: Production isolation, rate limiting, OS credential storage, vulnerability scanning, and external secret-store controls remain deployment blockers.
- Next prerequisites: Phase 15 testing, evaluation, and release quality gates.

### Phase 15 - Testing, Evaluation, and Quality Gates

- Status: Completed
- Date: 2026-08-08
- Scope completed: CI workflow, quality thresholds, release checklist, cross-package unit coverage, schema/GitHub/CLI/analysis/conflict/report/rule/sync tests, production build, and browser smoke suite.
- Results: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, and `pnpm test:e2e` passed locally. Browser suite: 7 passed. No live provider or GitHub credentials were used.
- Quality gate: The threshold document is defined, but live-provider factuality/precision metrics are not claimed until curated evaluation fixtures and explicit credentials/budget are supplied. Semantic comments, semantic conflict publication, sync, and content writes default off.
- Next prerequisites: Phase 16 VPS staging/deployment only after owner supplies infrastructure and credentials.

### Phase 16 - VPS Deployment and Pilot Readiness

- Status: Blocked pending owner inputs
- Date: 2026-08-08
- Scope completed: Linux VPS deployment scaffold with Nginx, systemd web/worker units, staging/production environment inventories, PostgreSQL backup and isolated restore-check scripts, TLS/security configuration template, rollback runbook, production architecture, and pilot onboarding/exit procedures.
- Results: Deployment files are configuration-only and contain no secret values. Local quality gates and browser smoke tests pass.
- Blockers: No Linux VPS address/access, domain/DNS control, TLS issuance, production PostgreSQL credentials, GitHub App/OAuth credentials, model credentials/budget, secret-management decision, monitoring destination, or named operational owner were supplied. No staging or production deployment was attempted or claimed.
- Pilot restrictions: Local deterministic mode is the validated path. Semantic provider calls, GitHub comments/checks, cloud source analysis, repository writes, scheduled reports, and hybrid sync remain disabled by default until their quality, security, and operational gates pass.

### Cloudflare test deployment

- Status: Deployed to test Worker; runtime smoke test failing; follow-up deployment blocked by expired Wrangler authentication
- Date: 2026-08-08
- Scope completed: Cloudflare Workers/OpenNext configuration, staging Worker environment, safe feature flags, observability defaults, Windows-compatible build helper, and test deployment runbook.
- Results: Account `mathofdynamic2` was verified. Worker `trace-test-staging` deployed successfully at `https://trace-test-staging.mathofdynamic2.workers.dev` with version `e60b9106-935e-45d0-8fe1-c2bfee26316a`. `GET /` and `GET /api/health` both returned HTTP 500. Wrangler tail reported `Dynamic require of "/.next/server/middleware-manifest.json" is not supported`.
- Architecture decision: Use a Worker with a `workers.dev` test URL. Cloudflare Pages static export is not suitable for this full-stack Next.js app because it would omit server routes and authentication.
- Limitations: The current database package uses a Node PostgreSQL pool. Authenticated and database-backed Worker routes require a Cloudflare-compatible PostgreSQL boundary such as Hyperdrive or a separate API/database service. No custom domain, Pages project, GitHub callback, or production secret was configured.
- Follow-up prepared: Staging config now sets `NEXT_PRIVATE_MINIMAL_MODE=1` to avoid the failing runtime manifest require; this change has not been deployed or validated because the stored Wrangler OAuth token returned HTTP 401 and refresh/login requests could not complete.
- Blockers: Refresh Wrangler authentication, then redeploy and rerun the two smoke tests before treating the Cloudflare deployment as usable.

### Cloudflare Worker redeploy retry

- Status: Blocked by Windows OpenNext bundling
- Date: 2026-08-08
- Scope: Redeploy the prepared minimal-mode staging Worker through Wrangler using the working SOCKS proxy.
- Results: The Next.js production build completed. OpenNext failed before upload because esbuild could not read Windows pnpm symlinked `react`, `react-dom`, and `styled-jsx` directories under `.open-next/server-functions/default/node_modules`; no Cloudflare version changed.
- Current verification: `https://trace-test-staging.mathofdynamic2.workers.dev/` and `/api/health` still return HTTP 500. The Pages project remains un-deployed.

### Cloudflare Pages project setup via Wrangler

### Cloudflare Worker deployment recovery

- Status: Completed; staging Worker is usable for public-route testing
- Date: 2026-08-08
- Scope: Finish the Windows OpenNext build workaround, redeploy the prepared staging Worker, and run live smoke tests.
- Results: Wrangler deployed `trace-test-staging` version `a9b1f876-a8ef-4f93-8217-8ec6ec93ea34` at `https://trace-test-staging.mathofdynamic2.workers.dev`. The Windows build helper now materializes generated pnpm symlinks and normalizes generated asset imports before Wrangler bundling. The OpenNext-generated `@vercel/og` assets were repaired for the Windows bundle.
- Live verification: `/`, `/product`, `/sign-in`, `/opengraph-image`, and `/api/health` return HTTP 200. `/api/health` returns `{"service":"web","status":"ok"}`.
- Test limitations: The staging environment remains minimal and feature-gated. Semantic analysis, GitHub comments, and hybrid sync are disabled; database-backed authentication and GitHub integration still require their configured external services and secrets.

### Cloudflare font deployment update

- Status: Completed
- Date: 2026-08-08
- Scope: Deploy the selected Kunst Grotesk Regular and Medium fonts from the owner-provided `ufs.sh` URLs.
- Results: Direct Wrangler deployment bypassing the local SOCKS proxy succeeded. Worker version `be8be187-03e1-49ca-b999-02eb808ff05a` is live at `https://trace-test-staging.mathofdynamic2.workers.dev`. Live HTML and CSS reference the `famjljl5gg.ufs.sh` font URLs, and `/api/health` returns `{"service":"web","status":"ok"}`.

### Cloudflare button underline fix

- Status: Completed
- Date: 2026-08-08
- Scope: Remove browser-default anchor underlines from `.trace-button` links.
- Results: Added `text-decoration: none` to the shared button class. Worker version `72a07687-3bba-4fac-947c-f016ed429e94` is live. A cache-busted browser check reports `textDecorationLine: none` for the primary CTA and the live stylesheet contains the reset.

### Cloudflare button alignment fix

- Status: Completed
- Date: 2026-08-08
- Scope: Center button text vertically and horizontally across anchor and native button variants.
- Results: `.trace-button` now uses `inline-flex`, centered alignment, and a controlled line height. Worker version `d81679a5-8fe0-4f56-9253-1a360eb2a47b` is live. Live browser verification reports `display: flex`, `alignItems: center`, `justifyContent: center`, and `textDecorationLine: none`.

### Cloudflare Pages test proxy

- Status: Completed for public test delivery
- Date: 2026-08-08
- Scope: Publish the requested `trace-code.pages.dev` origin through a Pages Function proxy to the validated staging Worker.
- Results: Wrangler deployed Pages project `trace-code`, production deployment `2828841e-cf92-48b7-9474-edd2edfc11fa`, at `https://2828841e.trace-code.pages.dev`. The public hostname `https://trace-code.pages.dev` now forwards to `https://trace-test-staging.mathofdynamic2.workers.dev`.
- Live verification through the active SOCKS proxy: `/` returned HTTP 200 with the TRACE hero HTML; `/api/health` returned HTTP 200 and `{"service":"web","status":"ok"}`; the forwarded stylesheet contains the selected `ufs.sh` fonts, button underline reset, and centered flex alignment.
- Architecture limitation: This is intentionally a test bridge. The Pages project does not contain a standalone Pages-compatible full-stack build; the Worker remains the application runtime. Database-backed authentication and GitHub OAuth are still unavailable until Worker secrets and a Cloudflare-compatible PostgreSQL boundary are configured.
- Network note: Direct requests from this workstation timed out while the active SOCKS proxy path succeeded. This confirms a local network-path issue, not a failed Pages deployment.

- Status: Completed for project provisioning; application deployment not performed
- Date: 2026-08-08
- Scope: Retry Pages provisioning through Wrangler using the owner-selected Cloudflare account and local SOCKS proxy.
- Results: Direct and SOCKS-routed connectivity both reached Cloudflare, but Wrangler Pages API calls succeeded only when `HTTPS_PROXY`, `HTTP_PROXY`, and `ALL_PROXY` were set to `socks5://127.0.0.1:10808`. The requested `trace` name was unavailable as an exact Pages hostname; Cloudflare provisioned it as `trace-8rg.pages.dev`. That temporary project was deleted. The requested fallback project `trace-code` was created successfully at `https://trace-code.pages.dev`.
- Current state: `trace-code` exists with no deployment yet. The Pages deployment list is empty.
- Limitation: TRACE is a full-stack Next.js/OpenNext application. Uploading `.open-next/assets` alone would omit server routes, authentication, and database-backed behavior, so no misleading static deployment was published.

### Cloudflare Pages naming attempt (initial)

- Status: Blocked by account-level Pages API routing
- Date: 2026-08-08
- Scope: Check and create Pages project `trace`, with `trace-code` reserved as the fallback requested by the owner.
- Results: Wrangler authentication succeeded for `mathofdynamic2` (`c5d6cf110905c91fc3eed1abaf8236a`). Both `wrangler pages project list` and `wrangler pages project create trace --production-branch main` failed before project-name validation with Cloudflare API error `7003`: `Could not route to /client/v4/accounts/c5d6cf110905c91fc3eed1abaf8236a/pages/projects`.
- Decision: Do not create `trace-code` based on this response. The API did not report that `trace` was unavailable, and TRACE’s full-stack Next.js app should not be represented as a static Pages deployment without a verified Pages-compatible build.

### Direct GitHub OAuth test boundary

- Status: Completed for the Cloudflare test deployment; not production authentication.
- Date: 2026-08-09
- Scope completed: Removed Better Auth from the web runtime and package dependencies. Added direct GitHub OAuth authorization-code exchange, signed state verification, a signed seven-day test session cookie, safe same-origin redirects, sign-out, and the `TRACE_AUTH_SECRET` Worker secret. GitHub OAuth credentials remain separate from GitHub App installation credentials.
- Security boundary: The GitHub provider access token is exchanged server-side and is not persisted in the cookie, `.trace`, browser storage, or logs. The test cookie is signed but not encrypted and is not durable tenant/session storage.
- Local results: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm test:e2e` (7 passed), and the Windows-compatible `pnpm cf:build` passed. The generated Cloudflare bundle includes the OpenNext runtime modules and the Open Graph asset package.
- Cloudflare results: Wrangler uploaded version `367e110f-d8cf-4c2f-9885-2df41b269523` and promoted it to 100% of staging traffic. `https://trace-test-staging.mathofdynamic2.workers.dev/api/health` and `https://trace-code.pages.dev/api/health` return `{"service":"web","status":"ok"}`. The Pages home route returns HTTP 200. The GitHub start route returns HTTP 302 with the Pages callback URL and a state cookie.
- Known limitations: The callback must still be completed manually through GitHub. Database-backed onboarding, tenant persistence, and authenticated repository features remain unavailable until a Worker-compatible PostgreSQL boundary and user row persistence are configured. This test mode must not be described as durable production authentication.

### GitHub OAuth redirect-header fix

- Status: Completed and deployed to the Cloudflare test environment
- Date: 2026-08-10
- Root cause: `Response.redirect()` returns a response with immutable headers in the Worker runtime. The callback and sign-out routes attempted to append `Set-Cookie` headers directly to that response, producing `TypeError: immutable` after GitHub authorization.
- Fix: Construct mutable `new Response(null, { status: 302, headers: { location, "cache-control": "no-store" } })` responses before adding session and cleanup cookies in `apps/web/app/api/auth/github/callback/route.ts` and `apps/web/app/api/auth/sign-out/route.ts`.
- Verification: The callback regression test, formatting, lint, type-check, unit tests, standard build, and Cloudflare build passed. Wrangler version `9fc11b1d-bbb5-4258-8817-271e282c59d4` is serving 100% of staging traffic. `https://trace-code.pages.dev/api/health` returns HTTP 200, and the OAuth start route returns HTTP 302 with the Pages callback URL.
- Manual acceptance: Complete the GitHub sign-in flow at `https://trace-code.pages.dev/sign-in`. The browser must be redirected to `/app` or `/onboarding`, not `/auth/error`.

### Vercel Neon database through Cloudflare Hyperdrive

- Status: Completed for the Cloudflare staging test environment
- Date: 2026-08-10
- Scope: Provision a separate PostgreSQL database through Vercel’s Neon integration, connect the Cloudflare staging Worker through Hyperdrive, and make authenticated onboarding persistence use the database.
- Results: Created the Vercel database resource `trace-staging-postgres`, created Hyperdrive config `2d1e4821c1484d6299d88e29f2884310`, and applied all repository migrations successfully. The Worker now resolves the request database URL from `env.HYPERDRIVE.connectionString`; no database credential is stored in `wrangler.jsonc`, the repository, or the browser bundle.
- Code changes: Onboarding, dashboard summary, and webhook database access use the request-scoped Hyperdrive connection. The GitHub OAuth callback upserts the authenticated user before issuing the signed test session, preventing onboarding foreign-key failures. The PostgreSQL pool limit is five for the Worker runtime.
- Verification: `pnpm check`, `pnpm cf:build`, and the web callback unit test passed. Wrangler uploaded and promoted version `1c69b70e-0f48-4874-85c0-70ec3f43273c` to 100% of `trace-test-staging`. The Worker `/api/health` and home route return HTTP 200. Wrangler confirms the deployed `HYPERDRIVE` binding.
- Manual acceptance: Open `https://trace-code.pages.dev`, complete GitHub sign-in, select onboarding options, and click `Save and continue`. A successful save should show the green saved state and no `api/onboarding` 500. The current workstation could not re-check the Pages hostname after deployment because its direct network path timed out; the Worker origin is verified.

### Cloudflare PostgreSQL workerd bundle fix

- Status: Completed, deployed, and browser-verified in the Cloudflare staging test environment
- Date: 2026-08-10
- Root cause: The Cloudflare callback completed GitHub authorization but failed while persisting the user through PostgreSQL. OpenNext bundled `pg-cloudflare` with its default empty export instead of the `workerd` conditional export, producing `TypeError: t is not a constructor` when `pg` constructed the Cloudflare socket.
- Fix: Added the direct `pg-cloudflare` dependency, selected the `workerd` server bundle condition, kept `cloudflare:sockets` runtime-native, and added a narrow package patch so OpenNext's final bundle step does not resolve that Worker-only module at build time.
- Verification: Frozen offline install, formatting, lint, type-check, unit tests, standard build, Cloudflare build, and the final Wrangler upload passed. Version `b94bb6b1-58f2-4000-8a77-4b32ad7f00bc` was promoted to 100% of `trace-test-staging`. Both the Worker origin and `https://trace-code.pages.dev/api/health` return HTTP 200 with `{"service":"web","status":"ok"}`.
- Manual acceptance: A real GitHub sign-in through `https://trace-code.pages.dev/sign-in` redirected to `/onboarding` and rendered the authenticated workspace setup screen. No callback error was emitted by the filtered Worker tail.

### Phase 05 GitHub App connection slice

- Status: Code complete and deployed to the Cloudflare staging test environment; live GitHub App installation is owner-gated.
- Date: 2026-08-10
- Scope: Added the Step 2 repository connection screen, signed GitHub App installation state, server-side App OAuth code exchange, installation ownership verification, App JWT and installation-token repository metadata retrieval, workspace/install/repository persistence, repository selection, and the unauthenticated API boundary.
- Configuration correction: When GitHub App user authorization during installation is enabled, the callback URL is the return path and the setup URL is left empty. `GITHUB_APP_CALLBACK_URL` is optional because the application derives the canonical callback from `TRACE_PUBLIC_URL` when it is not set.
- Database boundary: The slice uses the existing Phase 05 GitHub tables and repository-level permissions column. No new remote migration is required.
- Verification: `pnpm check`, `pnpm cf:build`, and the GitHub integration tests passed. Wrangler promoted version `f286775c-7eb5-4c8a-8670-5e12f386647e` to 100% of `trace-test-staging`. `https://trace-code.pages.dev/api/health` and the Worker origin both return HTTP 200 with `{"service":"web","status":"ok"}`.
- Browser verification: The signed-in Chrome session opened `https://trace-code.pages.dev/app/repositories`; the page rendered “Step 2 of 2 · GitHub connection,” “Not connected,” and the real **Install GitHub App** action.
- Known limitations: The GitHub App has not yet been registered/configured for this staging deployment, its private key and secrets are not present in the Worker, and no live installation or repository sync has been claimed.

### Dashboard route-state and interaction refinement

- Status: Completed and deployed to the Cloudflare staging test environment
- Date: 2026-08-11
- Root cause: The application shell hardcoded the Overview breadcrumb and selected Overview through the CSS selector `a[href='/app']`. It never derived navigation state from the current pathname. Dynamic server routes also had no route-level loading boundary, so successful navigation could appear frozen while data loaded.
- Scope: Added one typed navigation map, pathname-derived desktop/mobile active states, dynamic breadcrumbs, pending-link feedback, a route progress indicator, a route-level skeleton, restrained route entrances, a keyboard-accessible mobile drawer, route-aware repository tabs, compact dashboard hierarchy, actionable empty and error states, and accurate connected-data labels. The fake search control is now explicitly disabled and labeled `Soon`.
- Onboarding continuity: Completed users now skip Step 1 on future sign-ins. `Save and continue` persists the profile and automatically routes to GitHub repository connection instead of revealing a second continuation button.
- Tests: Added unit coverage for exact Overview matching, nested repository matching, and route-label derivation. Corrected the repository selection browser contract to exercise its POST interface. The documented isolated PostgreSQL runtime on port `3002` was started and migrated for integration tests.
- Verification: `pnpm check` passed, including formatting, lint, monorepo type checking, unit tests, and the production Next.js build. The Cloudflare OpenNext bundle passed. Playwright passed 8/8 browser contracts after the isolated PostgreSQL test database was restored.
- Deployment: Wrangler uploaded version `27524bec-7866-4c99-ac76-b05c98fe51e4` and promoted it to 100% of `trace-test-staging`. The first deploy request lost connectivity after version upload, so the exact uploaded version was promoted without re-uploading assets. Both `https://trace-test-staging.mathofdynamic2.workers.dev/api/health` and `https://trace-code.pages.dev/api/health` return HTTP 200 with `{"service":"web","status":"ok"}`.
- Manual acceptance: The in-app browser had no TRACE session and the Chrome browser connection was unavailable, so signed-in visual acceptance remains owner-tested. Verify desktop and mobile navigation at `https://trace-code.pages.dev/app`; each selected menu item and breadcrumb must follow the current route and no route should leave Overview selected.

### Product-led first-run and data-backed dashboard refinement

- Status: Code complete and locally verified; live staging acceptance is pending deployment and owner GitHub authorization.
- Date: 2026-08-11
- Problems addressed: GitHub-only authentication was split into Sign In and Sign Up concepts; onboarding required a redundant save-then-continue interaction; GitHub repository access exposed implementation details; repository selection ended without a success moment; the dashboard summary returned hardcoded empty analysis, conflict, report, and artifact arrays; repository routes did not load repository-specific state; and the navigation exposed empty product areas as if they were operational.
- Auth and setup: `/sign-in` is the canonical GitHub entry, `/sign-up` redirects while preserving only safe relative `next` paths, onboarding asks only for the workspace usage profile and advances automatically, and the setup surface shows the four-step progression `Your workspace`, `Connect GitHub`, `Choose repository`, and `Ready`. OAuth and GitHub App state validation, secure cookies, installation ownership checks, and repository authorization were not weakened.
- Repository connection: The UI now distinguishes disconnected, GitHub-connected-with-no-grants, repositories available, selected, and ready states. Successful selection acknowledges the selected repository and directs the user to the actual next capability. Because cloud analysis execution is not implemented in the staging Worker, the interface presents the validated local CLI path instead of a fake cloud analysis action.
- Real dashboard projection: Added a typed, membership-scoped dashboard projection over persisted onboarding profiles, organizations, installations, repositories, analysis runs, findings, pull request snapshots, and audit events. The overview derives its next action, repository state, analysis state, unresolved attention, recent meaningful change, and project record from persisted data. Setup, GitHub connection, and repository selection now emit meaningful audit events for the Activity view.
- Accurate capability boundaries: Reports, persisted conflict projections, and dashboard rule management remain unavailable because no executable cloud ingestion/persistence path currently connects those package-level capabilities to the dashboard. Their pages explain the dependency and local commands. Progressive navigation keeps these direct routes accessible while marking them `Later` until a real capability exists.
- Authenticated product surfaces: Reworked Overview, Repositories, repository detail, pull request snapshots, findings, Active changes, Reports, Conflicts, Rules, Activity, Settings, Documentation, auth error recovery, route loading, mobile navigation, empty states, and contextual terminology. Repository detail now authorizes and loads the requested repository instead of rendering a generic shell.
- Tests: Added unit coverage for dashboard setup/analysis derivation and safe authentication redirects. Expanded Playwright coverage for canonical sign-up behavior, unsafe `next` rejection, unauthenticated application redirects, completed-onboarding bypass, automatic onboarding advancement, GitHub disconnected/connected/no-grants/available states, persisted dashboard/repository data, progressive mobile navigation, valid empty-state actions, and responsive layouts.
- Verification: Final `pnpm check` passed, including formatting, lint, 26/26 monorepo type-check tasks, all unit suites, 15/15 package builds, and the optimized production Next.js build. `pnpm test:e2e` passed 15/15 browser contracts. `pnpm cf:build` produced the complete OpenNext Worker bundle. The authenticated overview was rendered without horizontal overflow and visually reviewed at 1440, 1024, 768, and 390 pixels.
- Manual acceptance remaining: A fresh live GitHub authorization and GitHub App installation journey must be exercised against the next staging deployment. Real report/conflict/rule dashboard states cannot be visually accepted until a supported ingestion/persistence path exists.

### Local-to-dashboard intelligence bridge

- Status: Code complete and locally verified at this implementation checkpoint; the subsequent staging acceptance is recorded below.
- Date: 2026-08-13
- Scope: Added device-style CLI authorization, separate revocable scoped credentials, exact GitHub remote-to-dashboard repository binding, local analysis artifacts, dry-run policy inspection, manifest negotiation, selective checksum-verified uploads, idempotent incremental sync, divergence rejection, staged transactional promotion, completed-snapshot dashboard projection, provenance/freshness UI, report/conflict rendering, device management, privacy copy, security documentation, and integration-focused tests.
- Security boundary: Repository source, code snippets, browser sessions, prompts, credentials, `local_only`, confidential, and restricted artifacts are rejected from sync. CLI tokens are returned once, stored outside `.trace`, encrypted with Windows DPAPI on this pilot platform, stored server-side only as SHA-256 hashes, expire after 30 days, and can be revoked independently. Uploads are bounded and invisible until the complete manifest is validated and promoted.
- Data boundary: Synced analysis projections create local-origin analysis runs and findings. Reports, conflicts, decisions, and risks remain immutable artifact projections from the latest completed repository snapshot. The repository artifact is durable; dashboard surfaces are read projections and do not silently edit `.trace`.
- Failure behavior: Rejected artifacts and stale-device divergence never replace the last verified snapshot. Failed sync is visible as deterministic dashboard attention and activity with a recovery path.
- Pilot evidence: The CLI analyzed this repository locally: 223 supported files, 721 file-level-only files, 7,974 symbols, four deterministic findings, and zero source sent to a model. The generated analysis artifact validated successfully. The dry run selected one 4,786-byte source-free artifact and excluded no eligible artifact.
- Workflow: `trace login` → `trace connect` → `trace analyze` → `trace sync --dry-run` → `trace sync` → `trace sync status`. See `DOC/local-dashboard-workflow.md`.
- Verification: Fresh and existing PostgreSQL migrations passed. `pnpm check` passed all formatting, lint, type-check, unit, package-build, and optimized Next.js build gates. Web tests passed 17/17, including six PostgreSQL bridge integration tests. CLI tests passed 8/8, including Windows DPAPI storage and staging-target safety. Playwright passed 17/17 browser contracts. `pnpm cf:build` produced the complete OpenNext Worker bundle. `git diff --check` passed.
- Deployment at this implementation checkpoint: not authorized and not attempted; see the subsequent `Staging acceptance and deployment` entry.

### Staging acceptance and deployment

- Status: Staging Worker deployed and smoke-tested; real CLI-to-dashboard acceptance blocked by staging database migration access.
- Date: 2026-08-13
- Migration review: `0004`–`0006` were inspected. `0006` previously added `cli_device_authorizations.request_key_hash` as `NOT NULL` without a backfill, which was unsafe for an existing database. It now adds the column nullable, backfills existing rows from the already-hashed `device_code_hash`, then enforces `NOT NULL` before creating the index.
- Migration verification: Fresh and populated upgrade tests passed on temporary local PostgreSQL databases. The populated upgrade preserved one legacy authorization row, backfilled `request_key_hash`, and reported `is_nullable = NO`; both temporary databases were removed. Local `trace_dev` migrations are current.
- Local gates: `pnpm check` passed (format, lint, 26/26 typechecks, unit tests, 15/15 package builds); `pnpm test:e2e` passed 17/17; explicit bridge integration tests passed 6/6; `pnpm --filter @trace/web test:unit` passed 17/17 with the bridge database configured; `pnpm --filter @trace/cli test:unit` passed 8/8; `pnpm cf:build` passed; `git diff --check` passed.
- Post-fix rerun: the first E2E attempt found local PostgreSQL stopped (`ECONNREFUSED 127.0.0.1:3002`); `scripts/postgres/bootstrap-local.ps1` and `scripts/postgres/health.ps1` restored the documented native service, and the subsequent full run passed 17/17.
- Deployment: `pnpm cf:deploy:test` uploaded version `2a87b573-fb0b-4938-9419-de74dc273a7e`; the initial deploy request did not return after asset upload, so `wrangler versions list` and `wrangler deployments list` were used to verify the immutable version before promotion. The documented `wrangler versions deploy 2a87b573-fb0b-4938-9419-de74dc273a7e@100% --env staging --config apps/web/wrangler.jsonc --message "TRACE staging acceptance bridge" --yes` then promoted it to 100% of `trace-test-staging`.
- Staging smoke: `GET /api/health` returned `200 {"service":"web","status":"ok"}`; `/sign-in` returned `200`; unauthenticated `/app` returned `307` to `/sign-in?next=/app`.
- CLI targeting: added explicit `TRACE_ENVIRONMENT` labeling and fail-closed staging resolution. With `TRACE_CLOUD_URL` set to the staging Worker and `TRACE_ENVIRONMENT=staging`, `trace status --json` returned `environment: Staging` and the staging server URL; staging mode without a URL refused the production default. CLI tests passed 8/8.
- Live bridge result: `POST /api/cli/device/start` returned `500 {"error":"The request could not be completed."}`. No credential was issued. The repository has no staging PostgreSQL connection credential, and no safe migration endpoint exists, so `0004`–`0006` could not be applied or inspected remotely. The live `login → connect → sync` path, dashboard projection, revocation, idempotency, freshness, divergence, checksum, and recovery tests remain pending.
- Provider handoff: Vercel CLI identifies team `nebulas-projects-74786240` Neon resource `trace-staging-postgres` (`store_Gu6KtHgqull4KOWU`), surfaced through Hyperdrive `2d1e4821c1484d6299d88e29f2884310`; the resource has no connected Vercel project. The provider guide directs operators from Vercel Storage to **Open in Neon Console** and the SQL Editor. The repository-supported operator path is `scripts/postgres/migrate.ps1` with a temporary `DATABASE_URL`, which lets Drizzle inspect `drizzle.__drizzle_migrations` and apply only pending migrations. No credential was available here. Wrangler tail created a staging tail but returned no exception before the stream disconnected, so the exact 500 cause remains unverified.
- Local pilot evidence: `trace analyze` on `mathofdynamic/TRACE` at the current `main` HEAD produced a valid local artifact with 233 supported files, 742 unsupported/file-level files, 7,986 symbols, four deterministic findings, and `sourceCodeSentToProvider: false`. `trace validate` passed. `trace sync --dry-run --json` selected one 4,786-byte artifact, excluded none, and reported `sourceCodeIncluded: false` and `codeSnippetsIncluded: false`.
- Security scan: no tracked private-key or real token pattern was found. The only `trc_` match is the intentional credential-storage test fixture; the only PEM marker is parser code. `.trace` runtime output and the local private-key file remain ignored/untracked.
- Remaining owner action: Apply and verify migrations `0004`–`0006` on the designated staging PostgreSQL database, then rerun the real CLI authorization and sync acceptance. Production was not touched.

### Final redesign integration (local review)

- Source baseline: `mathofdynamic/trace-redesign` at `845fd9bb85909e47711a7c12d564d03ee3d34243`.
- Target baseline: `mathofdynamic/TRACE` at `5e41d8e99e74f2c19631b654de174d1b56e6cb57`.
- Scope: Ported the finalized presentation system, authenticated shell, real-data view models, public visual surfaces, entrance motion, overlays, responsive behavior, and redesign documentation into the real product.
- Boundary: Preserved real authentication, database access, GitHub integration, Local TRACE bridge, sync APIs, privacy rules, Cloudflare/OpenNext configuration, and production data semantics. Redesign mock providers, mock sessions, fixture universes, and runtime mock mode were not migrated. No migrations, deployment, or production changes were performed.
- Verification: Web typecheck, monorepo typecheck, lint, unit tests, production build, Cloudflare build, and Playwright passed; the final E2E suite passed 17/17. Repository-wide format checking retains pre-existing baseline failures; zero redesign-changed files intersect those failures.

### Phase CF1 Cloudflare-native runtime foundation

- Status: Additive foundation complete; no runtime cutover or deployment.
- Date: 2026-09-16
- Audit: Documented all 22 PostgreSQL tables, 16 raw PostgreSQL-shaped E2E statements, 10 `returning` sites, three transaction boundaries, 16 conflict/upsert references, and all 12 pg-boss queue names in `DOC/cloudflare-native-migration.md`. No current pg-boss consumer performs business work; seven registered handlers are log-only placeholders and five queues are unused scaffolding.
- D1 foundation: Added a complete transitional Drizzle SQLite schema, generated a zero-to-D1 migration, application-generated TEXT UUIDs, millisecond INTEGER timestamps, JSON text mapping, boolean INTEGER mapping, and precision-safe TEXT provider identifiers. The local Wrangler integration applied 66 migration commands, created all 22 tables, and verified JSON and timestamp round trips in an isolated temporary D1 store.
- Database boundary: Added a D1 Drizzle factory and a driver-neutral user-upsert store. The authenticated web runtime deliberately remains on Hyperdrive/PostgreSQL until auth, GitHub, dashboard, CLI authorization, tenant isolation, and Local TRACE sync transaction parity are proven.
- Queue foundation: Added a strict versioned reference-only message union for all 12 known job types, a validated producer boundary, and an isolated Cloudflare Queue consumer. Only the D1 healthcheck is implemented. Invalid, failed, and placeholder work is retried for DLQ handling rather than acknowledged as completed. The live GitHub webhook route remains on pg-boss to avoid a split persistence boundary.
- Local Cloudflare verification: The isolated background Worker started under Wrangler 4.120.1 with local D1 and Queue bindings. `/api/health` returned HTTP 200 and an unknown route returned 404. The CF1 configs use distinct local/staging names and placeholder resource IDs; no Cloudflare resource was created or changed.
- Quality gates: Frozen install, changed-file Prettier, lint, 26/26 monorepo typecheck tasks, 26/26 unit-test tasks, 15/15 package builds, the optimized Next.js build, and the OpenNext Cloudflare build passed. The web unit suite reported 32 passed and six PostgreSQL bridge tests skipped without the optional integration database. The D1, Queue contract, and Queue consumer tests passed. `git diff --check` passed during the implementation pass.
- Boundaries: PostgreSQL, Hyperdrive, pg-boss, the external Node worker, the existing GitHub App, current staging, and `trace-code.pages.dev` are unchanged. No remote D1 migration, staging cutover, production deployment, secret rotation, or resource deletion occurred.
- Next: Port auth, workspace, GitHub installation/repository, dashboard, CLI authorization, and sync persistence behind driver-neutral contracts; replace PostgreSQL E2E fixtures with D1-local factories; then prove tenant isolation, deduplication, and sync promotion semantics before isolated D1/Queue staging.

### Phase CF2 Cloudflare-native application parity

- Status: Local D1 parity foundation implemented; PostgreSQL remains the fallback/reference runtime. No remote resources, migrations, deployment, or production changes were performed.
- Date: 2026-09-16
- Runtime boundary: `createRequestDatabase()` now selects D1 from the Cloudflare `DB` binding or an explicit local `TRACE_DATABASE_DRIVER=d1` selector, fails closed when that binding is absent, and retains the existing Hyperdrive/PostgreSQL path for legacy mode.
- D1 application paths: Auth callback user/account/session persistence and expiry checks, sign-out invalidation, onboarding, workspace membership, GitHub installation/repository catalog and selection, dashboard projection, CLI device authorization/consume-once/scoped credential checks, and Local TRACE sync negotiation/staging/completion now have explicit D1 implementations. Provider identifiers remain precision-safe TEXT values and all reads retain organization/repository scope.
- Sync correctness: D1 sync avoids unsupported SQL `BEGIN`/`COMMIT` calls. Conditional operation claims, unique natural keys, and bounded `D1Database.batch()` writes preserve source-free manifest validation, checksum checks, divergence rejection, idempotent retries, and previous-snapshot safety.
- Webhooks and queues: The D1 webhook branch records delivery identity, updates known default-branch heads, and enqueues a bounded reference-only Queue message when a D1/Queue binding is explicitly active. The existing PostgreSQL/pg-boss producer and Node worker remain unchanged outside D1 mode; Queue business handlers remain placeholders.
- Verification: `scripts/test-d1-local.ts` applied the zero-to-D1 migration and verified all 22 tables plus JSON/timestamp round trips. `scripts/test-d1-parity.ts` passed auth/session expiry, CLI consume-once including concurrent attempts, tenant isolation, webhook deduplication, sync idempotency, freshness, and required-index assertions. Web, DB, and worker typechecks passed; the web unit suite passed 32 tests with six optional PostgreSQL bridge tests skipped.
- D1 browser status: `scripts/test-d1-e2e.ts` now creates an isolated local D1 store, applies the zero-to-D1 migration, seeds a signed persisted session, starts the OpenNext Worker through Wrangler's `local-d1` environment, and verifies `/api/health`, `/app`, and `/app/repositories` at a mobile viewport. The broad Playwright suite still uses its PostgreSQL fixture; full domain browser parity is not claimed.
- Verification rerun: D1 local schema, D1 parity, and D1 browser E2E passed. The root lint, monorepo typecheck (26/26 tasks), unit suite (26 tasks; web 32 passed and six optional PostgreSQL tests skipped), optimized build, and Cloudflare/OpenNext build passed. Targeted Prettier validation covered 54 changed files with zero failures. The repository-wide format check retains unrelated baseline failures and was not mass-formatted.
- Provider safety: GitHub normalization now rejects unsafe numeric provider identifiers instead of allowing precision-loss values to cross the application boundary; string identifiers remain the D1 representation.
- Next: Expand the isolated D1 browser seed/server lifecycle across reports, findings, conflicts, decisions, rules, activity, settings, and CLI flows; port any unexercised GitHub PR/issue persistence; then validate an isolated remote D1/Queue staging cutover in CF3 while retaining PostgreSQL rollback infrastructure.

### Phase CF2.5 D1 GitHub ingestion and Queue business parity

- Status: Partial parity implementation complete locally; no remote Cloudflare
  resources, migrations, deployment, push, or merge performed.
- Date: 2026-09-17
- GitHub ingestion: Added a bounded normalized event contract and shared
  transport-neutral dispatcher for pull-request, issue, branch, repository,
  and installation-repository webhook events. D1 handlers now create/update/
  close PR and issue projections, enforce installation/repository ownership,
  preserve provider IDs as text, update default-branch heads, and retain
  idempotent natural-key behavior. The legacy PostgreSQL adapter calls the same
  dispatcher for webhook jobs.
- Queue: The D1 webhook route now sends the validated normalized event in the
  reference-only `github.webhook.process` message. The Cloudflare consumer
  handles D1 healthchecks and real GitHub webhook ingestion; malformed,
  failed, and not-yet-implemented message types are retried. pg-boss,
  PostgreSQL, Hyperdrive, and the Node worker remain the fallback/reference
  path, and the seven existing log-only worker handlers were not presented as
  migrated business behavior.
- Verification: `pnpm test:d1:github` passed against an isolated local D1
  database, covering realistic PR and issue create/update/close flows,
  duplicate idempotency, installation mismatch, unknown repository rejection,
  repository removal selection state, Queue schema validation, and successful
  Queue consumer acknowledgement. Focused `@trace/core`, `@trace/github`,
  `@trace/db`, and worker tests passed during implementation.
- Limits: Full D1 application/browser parity is not claimed. Remaining queue
  jobs are placeholders or unused scaffolding, the broad Playwright suite still
  uses its PostgreSQL fixture, and remote D1/Queue provisioning is deferred to
  CF3. PostgreSQL, Hyperdrive, pg-boss, and the external Node worker remain
  intentionally intact.

### Phase CF2.6 production-reachable Queue closure and full D1 browser parity

- Status: Local parity proof complete for the production-reachable queue
  denominator; no remote Cloudflare resources, migrations, deployment, push,
  or merge performed.
- Date: 2026-09-17
- Queue reachability: the current source graph reaches two Cloudflare job types:
  `system.healthcheck` and `github.webhook.process`. The latter is the only
  product business job. The remaining historical pg-boss names are explicitly
  classified as unused, legacy-only, or log-only placeholders in
  `DOC/cloudflare-queue-parity.md`; `traceQueueJobRegistry` prevents dormant
  names from being emitted through the D1 producer.
- Queue safety: Cloudflare messages use the existing strict versioned schema.
  The consumer retries malformed, unsupported, and failed messages and only
  acknowledges completed handlers. A signed pull-request webhook was proven
  locally through D1 delivery dedupe, Queue publication, the shared GitHub
  ingestion handler, duplicate delivery/replay, tenant rejection, and a
  simulated D1 retry.
- Browser parity: `scripts/test-d1-e2e.ts` now provisions fresh local D1,
  seeds a persisted signed session and real projection records, then exercises
  authenticated navigation and interactions across repository access,
  Needs-refresh Local TRACE commands, repository/finding detail, Changes,
  Conflicts, Reports/Quick Inspect/daily/weekly detail, Decisions and Rules
  prompt builders, Activity, Settings, Documentation, overlays, focus/body
  scroll lifecycle, and responsive overflow at 390/768/1024/1440px. It runs
  with an explicit D1 driver and no usable legacy database URL, so the browser
  suite does not depend on PostgreSQL, Hyperdrive, or pg-boss.
- Query review: representative repository, pull-request, webhook-delivery,
  activity, and artifact lookups use the expected D1 indexes with no observed
  unbounded scan.
- Limits: the legacy PostgreSQL Playwright suite and reference Node/pg-boss
  worker remain intentionally separate. The current D1 sync path does not emit
  Queue work, so sync → Queue is not applicable. Remote D1/Queue provisioning
  and cutover remain deferred to CF3.

### Phase CF3 remote D1 and Queue staging

- Status: Staging resources provisioned and accepted through the Cloudflare
  native D1/Queue path. Production cutover remains deferred.
- Date: 2026-09-18
- Resources: Created the isolated `trace-test-staging-db` D1 database and
  `trace-staging-jobs` Queue in the existing `mathofdynamic2` account. The
  existing `trace-test-staging` Worker, Pages proxy, Hyperdrive, GitHub App,
  and secrets were not deleted, changed, or rotated.
- Runtime wiring: `apps/web/wrangler.jsonc` now binds staging `DB` to the
  dedicated D1 database, binds `TRACE_QUEUE` to the dedicated Queue, selects
  `TRACE_DATABASE_DRIVER=d1`, and attaches a same-Worker Queue consumer with
  bounded batch/retry settings. `apps/web/custom-worker.ts` wraps the
  generated OpenNext fetch handler and exposes `queue()`; no second Worker was
  created.
- Local verification: Wrangler 4.120.1 dry-run resolved the intended staging
  D1, Queue, and preserved Hyperdrive bindings. The OpenNext Cloudflare build,
  web typecheck, local D1 integration, CF2.6 queue parity, GitHub ingestion,
  and D1 Playwright E2E passed. The dry-run reported only existing esbuild
  duplicate-case warnings in generated OpenNext output.
- Acceptance: after the account quota reset, migration `0000_cheerful_legion.sql`
  was applied remotely. The deployed Worker, D1 bindings, same-Worker Queue
  consumer, authentication, GitHub issue ingestion, duplicate delivery
  protection, and authenticated browser flows passed staging verification.
- Historical risk: D1 error 7500 remains a production-capacity concern and
  must be rechecked before production provisioning.

### Phase CF4.1 existing GitHub installation reconciliation

- Status: Staging-first reconciliation correction implemented locally; no
  deployment, push, merge, migration, resource, credential, or production
  change performed.
- Date: 2026-09-20
- Root cause: The GitHub App setup callback persisted installations, but the
  authenticated repository page only read persisted rows and never discovered
  an already-authorized installation. Reinstalling the App therefore appeared
  to fix the connection by invoking the callback again.
- Implementation: Added an authenticated Refresh GitHub access flow using a
  separate state cookie and the existing setup callback. The short-lived App
  user token is used to verify the signed-in GitHub identity, list installations
  accessible to that App user, select one candidate only, verify installation
  access and snapshot identity, and then discard the token. Multiple candidates
  fail closed. Installation/repository persistence is shared with the existing
  callback and preserves repository selection on conflict updates.
- Security: Installation ownership and workspace mapping are checked against
  existing D1/PostgreSQL rows before reassociation. No new App, permission,
  persistent OAuth token, or client-supplied workspace association was added.
- Verification: GitHub package tests, setup/reconciliation callback tests,
  installation-selection tests, D1 reconciliation integration tests, and web
  typecheck passed. The D1 integration test covers first discovery, repeated
  refresh idempotency, selected-repository preservation, suspended state, and
  cross-workspace reassociation rejection.
- E2E follow-up: `scripts/test-d1-e2e.ts` now accepts `TRACE_D1_E2E_PORT` and
  derives its Wrangler port, browser base URL, and `TRACE_PUBLIC_URL` from the
  same validated value. The full D1 Playwright suite passed on port `8789`;
  the unrelated RBD process on port `8787` was left untouched.

### Phase CF4.6 recovery API isolation and D1 restore readiness

- Status: Local verification and restore rehearsal preparation complete; no
  staging or production change performed.
- Date: 2026-09-21
- Verification: Added `scripts/test-d1-cf46.ts` and `test:d1:cf46`. The test
  creates two independent owner/member workspaces with installations,
  repositories, selected access, and unresolved deliveries. It proves owner
  scope, non-owner and cross-tenant denial, payload omission, mismatched
  installation/repository rejection, duplicate-installation rejection,
  concurrent replay single-winner behavior, Queue business processing, and
  stable organization assignment.
- Restore readiness: Added `DOC/d1-restore-rehearsal.md`. A local-only
  Wrangler D1 export/import rehearsal preserved schema, indexes, foreign keys,
  sessions, installation, selected repository, issue, delivery, and recovery
  metadata. Remote Time Travel restore was not run; it requires an owner-
  approved separate destination and fresh Free-plan quota headroom.

### Phase CF4.8 isolated Cloudflare D1 restore rehearsal

- Status: Remote Time Travel restoration proven on an isolated synthetic D1;
  live staging and production were not restored or rebound.
- Date: 2026-09-21
- Destination: Created exactly one unbound database,
  `trace-restore-rehearsal-20260921` (`5075dc29-954f-4f65-a38a-0d22e7c076ac`).
  The staging database ID was asserted before migration and restore; no Queue,
  Worker, Pages route, GitHub callback, or external application used the
  destination.
- Data: Applied migrations `0000_cheerful_legion.sql` and
  `0001_goofy_lester.sql`, then inserted only `cf48-*` synthetic records with a
  nonfunctional placeholder session token. No live sessions, OAuth values,
  webhook payloads, or provider identifiers were exported.
- Restore: Captured destination bookmark
  `00000000-0000001a-000050ed-90d1f46fc0c152afc1e24ba13ae0fe5d`, mutated one
  synthetic issue and added one synthetic delivery, then restored once in
  place. The original issue state and recovery metadata returned, and the
  post-bookmark delivery disappeared. Index checks passed and
  `PRAGMA foreign_key_check` returned no rows.
- Safety: Staging remained at Worker version
  `7cfc8de1-0291-47dc-a180-cb691bef2943` with the existing fixture data and
  health response. The rehearsal database remains allocated and unbound for
  owner-directed cleanup. This proves isolated remote recovery only; it is not
  a production recovery rehearsal.

### Phase CF4.9 production topology and Workers Free release gates

- Status: Local production-readiness guard and runbook updates prepared. No
  production resource, migration, deployment, route, OAuth/App setting, or
  secret changed.
- No-fallback guard: `request-database.ts` treats production or explicit D1
  selection as D1-required. Missing D1 configuration fails visibly, and the
  webhook route returns 503 rather than constructing PostgreSQL/pg-boss work.
  The guard is not deployed to staging or production yet.
- Capacity evidence: the account currently contains eight D1 databases. The
  read-only Wrangler output exposes rolling 24-hour database metrics but not
  exact account-wide current-UTC-day totals or aggregate Worker CPU; those
  release gates remain UNKNOWN. The existing staging dry run measured 13,749.19
  KiB uncompressed and 144 assets, below the Workers Free size/file limits.
- Proposed production resources remain uncreated: Worker `trace-production`,
  D1 `trace-production-db`, and Queue `trace-production-jobs`. The isolated
  `trace-restore-rehearsal-20260921` database remains unbound and retained.
- Documentation: production topology, staging local/deployed boundaries,
  Free-plan gates, recovery procedure, and release checklist were updated.

### Phase CF4.10 staging no-fallback regression and capacity evidence

- Status: Local no-fallback regression proof and read-only staging/capacity
  evidence completed. No push, staging deployment, production resource,
  migration, route, callback, or secret change was performed.
- Guard coverage: request-database tests now exercise valid production D1
  selection, missing D1 binding, and incorrect production driver rejection.
  Webhook route tests prove that production without D1 returns 503 before
  pg-boss/PostgreSQL construction, while the normal staging D1 path remains
  Queue-backed.
- Remote read-only evidence: staging D1
  `c4df63bc-8270-4500-9dab-c1c6439efa64` has 23 tables and no pending
  migrations; active Worker version remains
  `7cfc8de1-0291-47dc-a180-cb691bef2943` at 100%. The Pages project
  `trace-code.pages.dev` and workers.dev endpoint
  `trace-test-staging.mathofdynamic2.workers.dev` both serve health checks.
- Capacity limits: eight D1 databases are currently listed. Wrangler exposes
  rolling database metrics, but exact account-wide current-UTC-day row totals,
  aggregate Worker CPU distribution, and Queue backlog/retry metrics were not
  available. Those gates remain UNKNOWN; no load test or quota-consuming probe
  was run.

### Phase CF4.12 operational evidence and production integration decision

- Status: Staging evidence was refreshed read-only; no staging or production
  mutation was performed.
- Source/deployment: local and deployed source is
  `6daa74568846f0313010797a38b49d0e097f5fb6`; active staging Worker is
  `5930a184-d797-4b70-9aee-d7f0647ab1fa` with deployment
  `cfa6e971-7406-4c34-a629-f3f202ca6564`.
- D1 readback: fixture issues `#1` and `#2` remain open in the expected
  workspace/repository. Delivery
  `45efb6c0-b5c3-11f1-8385-adc2e6c87a39` is processed. The read was
  sanitized and did not include payloads, sessions, or tokens.
- Operational limits: the account has eight D1 databases and the staging D1
  exposes only rolling 24-hour metrics (784 read queries, 41 write queries,
  20,947 rows read, 185 rows written). Current-UTC-day account totals,
  aggregate Worker CPU/limit errors, and Queue backlog/retry metrics remain
  UNKNOWN through the available authorized surfaces.
- Integration decision: production should use a separate GitHub App and OAuth
  App with the exact production routes documented in
  `DOC/production-architecture.md` and `DOC/production-canary.md`; staging
  callbacks remain unchanged.
- Live owner recovery GET: UNVERIFIED because the browser path returned
  `ERR_BLOCKED_BY_CLIENT`; local owner and tenant-isolation evidence remains
  valid.

### Phase CF4.13 isolated production canary configuration

- Status: Production configuration and validation tooling implemented locally;
  no production resource, migration, deployment, secret, or GitHub setting
  changed.
- Configuration: Added `apps/web/production-canary.json` with the dedicated
  Worker/D1/Queue names, D1-only variables, closed-canary mode, migration
  allowlist, and secret names. No production IDs or secret values are tracked.
- Preflight: Added `scripts/production-canary-preflight.ts`. Validate-only mode
  checks the manifest and bundle. Deploy mode requires real provisioned IDs,
  rejects staging/rehearsal identity reuse, and materializes an ignored
  Wrangler config without Hyperdrive.
- Safety: Production webhook, install, reconciliation, and setup routes return
  a cache-disabled 503 while `TRACE_CANARY_MODE=closed`. Staging has no canary
  variable and its webhook path remains Queue-backed.
- Workflow: Added the manual-only
  `.github/workflows/validate-production-canary.yml`; validate-only is the
  default and deploy mode requires explicit confirmation plus provisioned
  resources. The workflow was not dispatched.
- Verification: Production canary helper, webhook, setup, reconciliation,
  request-database, and no-fallback tests passed. Production resources remain
  uncreated and customer cutover remains blocked on provisioning and
  operational evidence.

### Phase CF4.14 isolated production D1 and Queue provisioning

- Status: Partial and blocked after one authorized D1 creation. The account
  identity matched `mathofdynamic2` and the pre-provision inventory contained
  eight D1 databases; both target names were absent.
- D1: `trace-production-db` was created as the isolated ID
  `7a566f2e-da27-46e7-8c3f-271e5566f225`, distinct from staging and the
  retained restore-rehearsal database. It is unbound and contains no confirmed
  application schema or data.
- Migration: The corrected remote migration attempt reached Cloudflare but
  failed with API error `7003` while routing the new database `/query` endpoint.
  No migration state is claimed and no retry was made.
- Queue: `trace-production-jobs` was not created because the migration failure
  required stopping before further remote mutation. No producer, consumer,
  message, or deployment was attached.
- Safety: Staging, rehearsal, GitHub configuration, secrets, legacy runtime,
  and customer traffic were unchanged. The production Worker remains
  undeployed. A fresh production bookmark was not captured because schema
  application did not complete.

### Phase CF4.14B production D1 provisioning recovery

- Identity: Account `mathofdynamic2` was revalidated. The existing production
  D1 remained `trace-production-db`
  (`7a566f2e-da27-46e7-8c3f-271e5566f225`), with staging and rehearsal IDs
  excluded. Inventory contained nine D1 databases after the prior creation.
- Diagnosis: `wrangler d1 info` and a minimal `SELECT 1` succeeded on the
  production database, and the remote migration list showed both migrations
  pending. This rules out a persistent identity or authorization failure; the
  original `7003` is recorded as transient control-plane routing/propagation,
  although Cloudflare supplied no request identifier proving the precise cause.
- Migrations: `0000_cheerful_legion.sql` and `0001_goofy_lester.sql` were
  applied exactly once. Wrangler reported both successful.
- Validation stop: The subsequent read-only schema/index/foreign-key/count
  pass failed with transport error `fetch failed`. No further remote retry was
  made. The schema result, empty application counts, and bookmark are not yet
  independently verified.
- Queue: `trace-production-jobs` was not created. Bookmark capture and Queue
  creation remain gated on a successful read-only schema validation pass. No
  Worker, consumer, message, staging resource, secret, or customer traffic
  changed.

### Phase CF4.14C production D1 verification stop

- Identity: Production D1 `trace-production-db`
  (`7a566f2e-da27-46e7-8c3f-271e5566f225`) remained distinct from staging and
  rehearsal. The account inventory contained nine D1 databases.
- Migration history: A bounded remote read confirmed migration rows for
  `0000_cheerful_legion.sql` and `0001_goofy_lester.sql` at
  `2026-09-22 09:24:57` and `2026-09-22 09:25:02`.
- Verification stop: The following schema query used double-quoted string
  literals and returned Cloudflare API code `7500` with SQLite syntax error
  `near "table": syntax error`. The code is recorded exactly; it is not
  interpreted as a quota failure. Per the task boundary, no corrected query,
  bookmark capture, or further remote mutation was attempted.
- Queue: `trace-production-jobs` remains uncreated and isolated from staging.
  Production Worker deployment and customer intake remain disabled.

### Phase CF4.14D completed production D1 and Queue provisioning

- SQL correction: The prior `7500` validation was caused by double-quoted
  SQLite string literals. Corrected `sqlite_master` SQL uses
  `type IN ('table', 'index')`; local validation passed against a fresh D1
  with both migrations and standalone zero-row count statements.
- Remote D1 verification: Production ID
  `7a566f2e-da27-46e7-8c3f-271e5566f225` has exactly migrations `0000` and
  `0001`, all 22 application tables, recovery columns and indexes,
  zero `PRAGMA foreign_key_check` violations, and zero rows in the checked
  users, sessions, workspace, GitHub, issue, and delivery tables.
- Recovery: Time Travel bookmark
  `00000003-00000000-000050ee-ba60b7e52d232df30b5f7d22fafb7c14` captured at
  `2026-09-22T10:10:03.5758536Z`; no restore performed. Workers Free retention
  is seven days.
- Queue: Created exactly one isolated Queue
  `trace-production-jobs` with ID `9ef092975a554ba296a63b162b16522f` and
  one-day retention. It has zero producers and zero consumers; no messages or
  DLQ were created.
- Handoff: Production validate-only preflight passed with the real resource
  identities and closed-canary/D1-only settings. Staging remained at Worker
  version `5930a184-d797-4b70-9aee-d7f0647ab1fa`, health 200, and its existing
  D1/Queue bindings. Production Worker, secrets, GitHub App/OAuth, and public
  intake remain disabled.

### Phase CF4.16 production D1 and Queue canary acceptance

- Production runtime identity: Worker `trace-production` remained at version
  `ead868f1-0f5d-4e45-939c-3e6349ed8f86` and 100% traffic. Its D1 and Queue
  bindings resolve to the dedicated production resources. Queue inventory
  lists this Worker as the only producer and consumer; staging remains
  isolated on `trace-staging-jobs`.
- D1 read-only validation: Production database
  `7a566f2e-da27-46e7-8c3f-271e5566f225` returned `SELECT 1`; migrations 0000
  and 0001 are recorded; all 22 application tables, expected indexes, and
  recovery columns exist; `PRAGMA foreign_key_check` returned zero violations.
  All 22 application tables were empty before and after route checks; remote
  query metadata showed zero writes. No migration or restore was performed.
- Closed canary: Health returned 200; webhook, setup, installation, and
  reconciliation routes returned cache-disabled 503; anonymous recovery
  returned 401. No business records were created.
- Queue healthcheck: The strict `system.healthcheck` contract and side-effect-
  free handler were verified in source. No message was sent: Wrangler has no
  send command, the Dashboard presented a security-verification interstitial,
  and no authorized local API token was available. No CI credential was
  retrieved. Queue invocation, completion, acknowledgment, errors, backlog,
  and retries remain unverified.
- Other telemetry: Worker runtime tail emitted no entries but did not confirm
  a live stream, so runtime error status is unknown. Current UTC-day
  account-wide D1 usage and CPU distribution were not measured. One staging
  health request failed and one timed out; staging version and binding
  identities were read-only verified unchanged, but public health is
  unverified for this pass.
- Result: Partial acceptance. D1 integrity/emptiness and closed route guards
  passed; one authorized healthcheck delivery with independent consumer
  completion evidence remains outstanding. No code, deployment, binding,
  migration, or remote data was changed.

### Phase CF4.16B one-shot production Queue healthcheck

- Workflow registration: Added the manual-only workflow through workflow-only
  PR #6; it is registered on the default branch and restricted to the existing
  `production-canary` environment and feature branch.
- Run: GitHub Actions run
  [35965671051](https://github.com/mathofdynamic/TRACE/actions/runs/35965671051)
  checked out workflow source
  `3744a11dfe1699b3e9372c91355cb9d109542ca1` and pinned runtime source
  `221606dcd57f8191ff2263a68b74d79eb6a45688`. Contract and local migration-
  backed D1 SQL validation passed.
- First failing gate: Read-only staging Worker metadata contained its expected
  legacy Hyperdrive binding `2d1e4821c1484d6299d88e29f2884310`. The preflight
  incorrectly applied production's no-Hyperdrive invariant to staging and
  stopped before checking the Queue, D1, routes, logs, or issuing a Queue push.
  No probe ID was generated and no message was submitted.
- Correction prepared locally: The healthcheck verifier now rejects all
  Hyperdrive bindings for production and requires the exact known legacy
  `HYPERDRIVE` ID for staging. Local contract validation covers production
  rejection, valid staging preservation, wrong staging ID, and duplicate
  staging bindings. This does not change either deployed Worker.
- Runtime evidence: A single production health request returned HTTP 200. One
  bounded staging health request timed out from this workstation; staging
  outage is not established. The single authorized operational workflow run
  was consumed, so Queue publication and consumer/acknowledgment evidence are
  not available in this phase. No Worker deployment, migration, Queue change,
  or application-data write occurred. Customer traffic and GitHub intake
  remain disabled.
- Result: Partial; no Queue message was sent. A future separately authorized
  one-shot run must use the corrected verifier. Do not retry this run.

### Phase CF4.16D Queue API response contract correction

- Baseline: `47a74f3232307b3cf177493a1edd79b2db6ba29f` on the existing
  feature-branch lineage.
- Root cause: The one-shot acceptance script validated Wrangler-style
  `max_batch_size` and `max_batch_timeout` fields, while Cloudflare's Get Queue
  API returns `batch_size` and `max_wait_time_ms`. It also treated optional
  redundant producer/consumer counts and `consumer.queue_name` as mandatory.
- Correction: The control-plane response model now uses the documented
  settings fields and validates worker identity, queue identity, multiplicity,
  optional metadata when present, and each setting with field-specific errors.
  Expected wait time is compared in milliseconds (`5000`). No Worker runtime,
  Queue configuration, or D1 behavior changed.
- Local verification: Queue response fixtures cover the complete documented
  shape, omitted total counts, omitted consumer queue name, invalid producer
  and consumer scripts, incorrect batch/retry/wait settings, duplicate
  producers/consumers, and incorrect optional metadata. The strict message
  parser and migration-backed read-only D1 count query remain part of the
  contract command. Prettier, ESLint, standalone TypeScript checking, contract
  validation, and `git diff --check` passed.
- Remote acceptance: The corrected source must be pushed before the one
  authorized production Queue healthcheck workflow run. No Queue message was
  sent during local validation; no Worker deployment, migration, or remote
  write occurred in this implementation step.

### Phase CF4.16E Queue consumer identity evidence

- Baseline: `843706144e435099d4e98ff4357c6832198121a3`. The read-only
  Wrangler JSON listing returned one array entry with `type: "worker"` and
  `script: "trace-production"`; `queue_name` was absent. Cloudflare's Queue
  API marks `script_name` optional, so it cannot be the only consumer identity
  signal.
- Correction: The Queue API check still requires the exact Queue ID/name,
  exactly one consumer, and expected settings, and validates optional identity
  fields when present. A second read-only Wrangler JSON check now requires
  exactly one Worker consumer for `trace-production`; the active Worker
  `TRACE_QUEUE` binding remains the producer identity gate. CLI diagnostics
  are suppressed to prevent credential disclosure.
- Local verification: Contract fixtures cover omitted and present API
  identity, Wrangler agreement and mismatch, multiple consumers, wrong Queue
  identity, optional producer metadata, and incorrect settings. The focused
  TypeScript, ESLint, Prettier, contract, and diff checks are run for this
  acceptance harness. No Worker runtime source or deployment configuration is
  changed by this correction.

### Phase CF4.16H authenticated E2E fixture baseline

- Baseline: `5c19ee72de60a06d7175c956b9c7abcfa1c303ce`. PR #8 added only
  the read-only Queue drain workflow. The six authenticated E2E failures
  reproduced against the same application/test sources at that baseline, so
  the workflow did not cause them.
- Root cause: E2E fixtures created a signed `trace_session` cookie and user
  rows but did not persist the corresponding session row. Production auth
  correctly rejects a signed cookie without a live D1/PostgreSQL session.
  A differing build/server secret was tested and was not the cause.
- Correction: The fixture now uses the configured E2E auth secret consistently,
  signs sessions through `@trace/auth`, and persists the session row. A focused
  regression checks acceptance with the configured secret, rejection with a
  different secret, and authenticated navigation to `/app`. No production auth
  behavior changed.
- Verification: The six previously failing authenticated tests and the full
  E2E suite passed locally with retries disabled against an isolated local
  PostgreSQL database. Final format, lint, typecheck, unit, build, and E2E gates
  are recorded after the focused branch validation.

### Phase CF4.16H read-only Queue drain workflow coverage

- Added source-level regression coverage for the manually dispatched drain
  workflow: feature-ref/environment restrictions, secret-only environment
  consumption, fixed production resource identities, GET-only requests,
  bounded 3-observation polling with 30/60-second waits, zero-backlog success,
  and final nonzero-backlog failure. The test rejects message, pull, ack,
  retry, purge, consumer-mutation, and deployment paths.
- No Queue message, Cloudflare mutation, or Worker deployment is part of this
  workflow. PR #8 remains responsible only for exposing and testing this
  read-only workflow on the feature ref. The one authorized drain invocation
  and its measured result will be recorded after merge; no observation is
  claimed before that run.
