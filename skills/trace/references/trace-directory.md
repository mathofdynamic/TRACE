# `.trace/` directory

Canonical initialization is `trace init --yes`. Other write commands can currently create a partial directory; that does not constitute initialization. Verified from `packages/trace-cli/src/cli.ts`.

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

Do not claim any directory beyond `README.md`, `schema-version`, `config.yml` is mandatory. `trace analyze` will create `.trace/analyses/` even if `.trace` was never initialized, producing a partial tree; avoid that by checking for `config.yml` and `schema-version` first.

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

## Initialization product gap

The shared artifact writer creates its root before the dry-run return. Therefore
`trace analyze --dry-run` can create an empty `.trace/`, and normal `trace analyze`
can create a partial tree without config/schema-version. Neither is initialization.
Always check the two scaffold files and use real init before analysis. This is a
product limitation to address separately, not a reason to hand-build the scaffold.
