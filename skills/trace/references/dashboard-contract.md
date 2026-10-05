# Dashboard projection and sync manifest

Sources: `packages/trace-schema/src/index.ts`, `packages/trace-cli/src/cloud.ts`.

## Projection (`dashboard:` front-matter block, strict)

`title` (1-240), `summary` (<=4000), `branch?` (<=255), `head_commit?` and `base_commit?` (hex 7-64), `status?` (<=80), `items[]` (<=100).

Item (strict): `id` (1-100), `title` (1-240), `detail` (<=2000), `severity?` (`info|low|medium|high`), `classification?` (`deterministic|correlated|semantic|uncertain`), `evidence[]` (<=20 strings, each <=300), `status?` (<=80).

Projections are produced by the CLI from real findings. Never populate or edit them from guesses or from dashboard screenshots.

## Sync manifest (protocol 0.1)

Built by `trace sync` (not by you): `protocolVersion`, `schemaVersion`, `syncId`, `repositoryId`, `repository`, `executionOrigin: local`, `traceVersion`, `createdAt`, `baseOperationId`, `git {branch, headCommit}`, `artifacts[]` (`id,type,path,sha256,size,schemaVersion,sensitivity,revision`), `sourceCodeIncluded: false`, `codeSnippetsIncluded: false` (both literal `false` in the schema).

Lifecycle: negotiate -> upload only missing artifacts -> complete. Same manifest is idempotent; interrupted uploads stay invisible. `baseOperationId` carries the last acknowledged dashboard operation so a stale checkout cannot overwrite a newer snapshot; divergence aborts with no local change.

## Two data planes

A. GitHub / TRACE Cloud: repository identity and selection, installation, catalog, remote HEAD, default branch, PR/change metadata, visibility/state, workspace, cloud activity, remote freshness reference.

B. Synced local `.trace` artifacts: analysis, findings, reports, PR briefs, decisions, risks, conflicts, rules, provenance, analyzed commit.

The backend joins A and B. Never copy dashboard screenshots or inferred A-plane facts into `.trace`. Period reports may include verified GitHub metadata collected by the CLI with explicit `--github`; it remains attributed evidence, not dashboard authority. CLI commands expose repository selection, local binding and sync operation information; they do not expose all GitHub metadata or dashboard state. Use a trusted authorized provider/dashboard source or the user for facts the CLI does not return. PR briefs currently lack a projection and stay local.

## Commit attribution gate

Every path to synchronization requires empty `git status --porcelain`, fresh
analysis of that clean committed checkout, validation and the privacy dry-run.
Recheck cleanliness and matching HEAD immediately before sync. Dirty analysis
is local exploratory work only and MUST NOT sync. Reverting edits is insufficient:
regenerate the clean analysis even when HEAD has not changed. Runtime enforces clean-input branch/HEAD attribution for analyses. The period-report implementation adds the same gate for daily/weekly reports; legacy/unverified reports require regeneration. See safety.md for the publication policy.
