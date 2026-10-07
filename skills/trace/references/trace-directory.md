# `.trace/` directory

Canonical initialization is `trace init --yes`. Analysis, reports and explicit PR artifact writes require `config.yml` and `schema-version`; they reject missing initialization without creating `.trace/`. Verified from `packages/trace-cli/src/cli.ts`.

```text
.trace/
  README.md          created by init (not an artifact; skipped by validate and sync)
  schema-version     "0.1"
  config.yml         configuration
  analyses/          created lazily by `trace analyze`
  reports/daily/     created by init; files via `trace report daily --yes`
  reports/weekly/    created by init; files via `trace report weekly --yes`
  pull-requests/     created by init; files via `trace pr --write --yes`
  decisions/ risks/ debt/ indexes/   created by init; no CLI command writes artifacts here today
  state/             created by init
    dashboard.json   non-secret repository binding (written by `trace connect`)
    sync.json        last acknowledged sync operation (written by `trace sync`, `sync status --accept-dashboard-base`)
```

Do not claim any directory beyond `README.md`, `schema-version`, `config.yml` is mandatory. `trace analyze` creates `.trace/analyses/` only when writing in an initialized repository. Preview paths do not create directories; check for `config.yml` and `schema-version` first.

## Roles

- Configuration: `config.yml` (`execution_mode`, `repository`, `git_write_policy: disabled`, `sync_policy`). View with `trace config show --json`.
- Artifacts: Markdown files with YAML front matter anywhere under `.trace/` (except `README.md`).
- Binding/state: `state/dashboard.json`, `state/sync.json`. Machine-written; do not edit by hand.
- Credentials: NEVER here. They live outside the repository (see `safety.md`).

## Default `sync_policy`

```yaml
sync_policy:
  enabled: true
  default: local_only
  allow: [analysis, daily_report, weekly_report, pr_brief, decision, risk, conflict]
  include_code_snippets: false
```

`debt`, `rule`, `index` are syncable types but are not in the default allowlist. Do not widen `allow` or set `include_code_snippets: true` unless the user explicitly asks and understands the effect.

## Git policy

TRACE's own repository ignores `.trace/` (runtime output) and its docs say `.trace/` "stays ignored". Follow each project's existing policy. Do not alter `.gitignore` or commit `.trace/` unless the user asks.

## What syncs vs. stays local

Synced (only via `trace sync`, after the gates in `safety.md`): allowlisted Markdown artifacts with a dashboard projection. Always local: `config.yml`, `state/*`, `README.md`, `schema-version`, any excluded artifact, and all source code.

## Initialization and previews

Use real `trace init --yes` before analysis, reports or explicit PR artifact writes.
Missing scaffold files cause an actionable initialization error before persistence.
Artifact previews validate their paths and content without creating files or
folders. Invalid artifact writes likewise do not create an empty artifact root.
Read-only validation and sync previews never initialize the repository.
