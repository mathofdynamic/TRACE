# Local-to-dashboard workflow

TRACE analyzes source code in the repository. The dashboard receives only explicitly approved `.trace` artifacts and a small Git context envelope.

## First connection

From the repository root:

```text
trace login
trace connect
trace analyze
trace sync --dry-run
trace sync
```

`trace login` opens a device-authorization page. Browser authentication is used only to approve a separate CLI credential. The CLI credential is scoped to repository discovery and artifact sync, expires after 30 days, is stored outside the repository, and is stored by the server only as a SHA-256 hash.

`trace connect` reads `remote.origin.url`, accepts an unambiguous GitHub HTTPS/SSH remote, and requires exactly one matching repository already granted to the current TRACE workspace. The non-secret binding is written to `.trace/state/dashboard.json`.

`trace analyze` runs locally and writes a versioned analysis artifact under `.trace/analyses/`. The dashboard projection contains titles, summaries, finding classifications, evidence locators, branch, commit, and provenance. Raw source is not part of the artifact.

`trace sync --dry-run` is the review boundary. It lists every eligible artifact, exclusion reason, checksum, size, sensitivity, and total upload size. It always reports `sourceCodeIncluded: false` and `codeSnippetsIncluded: false`.

`trace sync` negotiates the manifest, uploads only missing artifacts, and asks the server to promote the complete snapshot. Interrupted uploads remain staged and invisible. Repeating the same manifest is idempotent and resumes missing uploads. Each new manifest carries the last dashboard operation acknowledged by this checkout. A stale device cannot overwrite a newer snapshot silently.

## Targeting staging safely

For a staging run, set both variables in the same shell:

```powershell
$env:TRACE_CLOUD_URL = 'https://trace-test-staging.mathofdynamic2.workers.dev'
$env:TRACE_ENVIRONMENT = 'staging'
```

CLI responses identify the target as `environment: Staging`. `TRACE_ENVIRONMENT=staging` without `TRACE_CLOUD_URL` fails closed instead of falling back to the production default. Clear both variables after acceptance testing.

## What is sent

- Approved `.trace` Markdown with `sync_policy: allowlisted` or `repository_authoritative`.
- A bounded dashboard projection from artifact front matter.
- Repository identity, branch, head commit, TRACE/schema versions, checksums, sizes, and generation times.
- Evidence locators such as file paths or commit identifiers when present in the artifact.

## What is not sent

- Repository source files.
- Code snippets or fenced code blocks.
- Prompts, model credentials, GitHub credentials, environment variables, browser sessions, or CLI tokens.
- `local_only`, `confidential`, or `restricted` artifacts.
- Invalid, unsafe-path, oversized, executable-HTML, or credential-like content.

## Credential storage and revocation

The CLI credential is encrypted for the current Windows user with DPAPI and saved in `%LOCALAPPDATA%\TRACE\credentials.dpapi`. On other systems it is saved with owner-only permissions at `$XDG_CONFIG_HOME/trace/credentials.json` when configured, or `~/.config/trace/credentials.json`. `TRACE_CONFIG_HOME` can override the directory for isolated automation and tests.

Run `trace logout` to remove the local copy. Revoke or rename active devices under Dashboard → Settings. Revocation takes effect on the next API request. If a credential may have been copied, revoke it in the dashboard; local logout alone cannot invalidate a copied token.

## Incremental state and freshness

The server keeps immutable completed sync snapshots. A later snapshot can reuse unchanged artifacts from the previous completed operation, but the visible dashboard switches only after every manifest item has a verified checksum. Repository pages show local origin, branch, commit, TRACE/schema versions, last sync time, and freshness. Freshness is based on the analyzed commit and a trusted default-branch head supplied by a verified GitHub push webhook or refreshed through the authenticated GitHub App repository-selection path. If that remote state is unavailable, the UI displays `Freshness unknown`; it never maps unknown state to current.

The local acknowledgement is written to `.trace/state/sync.json`. It contains no credential and is not authoritative over server state. Use `trace sync status` to inspect the current dashboard acknowledgement. After inspection, `trace sync status --accept-dashboard-base` deliberately records the current completed dashboard operation as this checkout's base; it does not download or modify canonical artifacts.

## Failure recovery

- `Run trace login`: the local credential is absent, expired, revoked, or belongs to another server.
- `Repository is not selected`: install/configure the TRACE GitHub App and select the exact repository in the dashboard, then rerun `trace connect`.
- `Sync divergence requires review`: the server has a conflicting artifact identity, path, equal/newer revision, or a newer completed snapshot than this checkout acknowledged. No local artifact is changed. Inspect both histories. If the dashboard snapshot is the correct base, run `trace sync status --accept-dashboard-base`; otherwise create an explicit superseding artifact.
- `Artifact contains code snippets...`: remove code fences or credential-like values from the artifact projection. Do not weaken the scanner.
- Network interruption: rerun `trace sync`. Manifest idempotency and staged uploads prevent duplicate visible records.

## Automation

Automation may run `trace sync --dry-run --json` for policy inspection. An actual sync remains an explicit command and requires an active scoped credential. Do not place the credential in `.trace`, command output, build logs, issue text, or source control.

## Historical staging acceptance status — 2026-08-13

The current acceptance Worker is `trace-test-staging` at `https://trace-test-staging.mathofdynamic2.workers.dev`.

- Version `2a87b573-fb0b-4938-9419-de74dc273a7e` is deployed to 100% of staging traffic.
- `/api/health` returns `200` with `{"service":"web","status":"ok"}`.
- `/sign-in` returns `200`; unauthenticated `/app` redirects to `/sign-in?next=/app`.
- `POST /api/cli/device/start` currently returns `500` with the generic route error. No CLI credential was issued and no staging sync was attempted.

The designated database is the Vercel team `nebulas-projects-74786240` Neon resource `trace-staging-postgres` (resource `store_Gu6KtHgqull4KOWU`), surfaced through Hyperdrive `2d1e4821c1484d6299d88e29f2884310`. Its operator dashboard is [Vercel Storage](https://vercel.com/nebulas-projects-74786240/~/stores/integration/store_Gu6KtHgqull4KOWU); Vercel's Neon guide directs operators to **Open in Neon Console** and use the SQL Editor.

The preferred repository-supported migration path remains `scripts/postgres/migrate.ps1` with a temporary operator-supplied `DATABASE_URL`; Drizzle reads `drizzle.__drizzle_migrations` and applies only pending migrations. The connection string is not present in this workspace. Do not add a migration endpoint, paste credentials into chat, manually bypass the migration ledger, or point the CLI at production. The staging bridge remains blocked until an operator runs that path against `trace-staging-postgres` and confirms migrations `0004`–`0006` are current.

The live `POST /api/cli/device/start` request still returns the generic `500`. Wrangler tail successfully creates a staging tail but the current network stream returned no invocation exception before disconnecting, so the underlying SQL/runtime exception is not claimed as identified.

The local path remains independently usable: `trace analyze`, `trace validate`, and `trace sync --dry-run` run without the dashboard or a credential. The 2026-08-13 local dry run selected one source-free analysis artifact (4,786 bytes) and reported `sourceCodeIncluded: false` and `codeSnippetsIncluded: false`.

## Staging acceptance update — 2026-08-14

The 2026-08-13 status above is historical. It was superseded after staging migrations `0004`–`0006` were applied through the operator migration path. Hardening Worker version `4817dae0-dd68-4e7b-9a7a-51ef00260882` is deployed to 100% of staging traffic and returns `200` from `POST /api/cli/device/start`.

The verified live sequence was:

```text
owner-approved trace login
→ trace whoami
→ trace connect
→ trace analyze
→ trace sync --dry-run
→ trace sync
→ trace sync status
```

The CLI reported `Staging`, matched `mathofdynamic/TRACE` exactly, and persisted the active scoped connection. The local analysis ran on `main` at commit `4953addc8992f882a1c983bad061fb8035213276`; it produced 233 supported files, 752 file-level/unsupported files, 8,005 symbols, and four deterministic findings. The generated `.trace` record validated.

The final synchronized snapshot contains three local artifacts (analysis, daily report, and weekly report), 32,592 bytes, a real branch/commit envelope, local execution provenance, and four projected deterministic findings. The dry run reported zero excluded artifacts, `sourceCodeIncluded: false`, and `codeSnippetsIncluded: false`. The dashboard/API projection contains no fixture rows.

Repeated sync is idempotent (`uploaded: 0`). A daily report increment uploaded one new artifact. A controlled interrupted weekly-report upload remained staged, resumed after retry, and promoted only after checksum-complete validation. A controlled offline client call returned `TRACE dashboard is unavailable ... Local .trace files are unchanged.`; restoring the staging target recovered with an idempotent sync.

After dashboard revocation, the old credential was rejected and a fresh owner-approved login restored the DPAPI credential. The first re-authenticated idempotent sync exposed a client defect: the CLI attempted to complete an operation that the server had already completed under the revoked connection. The CLI now stops after a completed negotiation and records the acknowledgement locally; the regression test and live retry both returned `idempotent: true` with `uploaded: 0`.

Live rejection checks returned the expected fail-closed responses: unsafe paths `400`, an unconnected repository `403`, a checksum mismatch `422`, and a stale acknowledged base `409`. Audit records exist for device approval, sync start/completion, artifact rejection, and divergence. The first immediate retry of the interrupted upload returned a transient generic `500`; subsequent retry succeeded and the verified snapshot was never replaced by partial data. Wrangler's live tail stream was unavailable from this execution environment, so no server exception is claimed for that transient response. Local concurrent completion reproduced a duplicate-promotion race; completion now uses one transaction and a row lock, with a regression test proving one winner and one idempotent retry. Sync route failures expose a bounded request ID and safe category-only logs; artifact bodies and credentials are never logged.

The freshness fix uses the existing GitHub integration: a default-branch push updates `remote_head_sha`, and saving repository selection refreshes the exact selected repository through the GitHub App without reading source. The public default branch and synchronized commit are both `4953addc8992f882a1c983bad061fb8035213276`; the owner-approved repository refresh populated the remote head and the dashboard now reports `Current`. The operator credential file `.env.local` was deleted after migration and acceptance; rotate the staging Neon password because it was pasted into chat.

## Owner visual acceptance

Owner-authenticated visual review was completed for these staging routes:

- `https://trace-code.pages.dev/app`
- `https://trace-code.pages.dev/app/repositories`
- `https://trace-code.pages.dev/app/reports`
- `https://trace-code.pages.dev/app/settings`

The review confirmed `mathofdynamic/TRACE`, real findings, Local CLI provenance, `Current` freshness, daily and weekly reports, and visible connections without credentials or token hashes. No visible layout or navigation blocker was reported during the responsive review at 1440, 1024, 768, and 390 pixels.
