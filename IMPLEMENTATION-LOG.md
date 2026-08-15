# TRACE Implementation Log

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
