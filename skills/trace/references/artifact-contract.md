# Artifact contract (schema 0.1)

Source: `packages/trace-schema/src/index.ts` (`artifactMetadataSchema`). The CLI validates with `trace validate`; inspect one file with `trace inspect <path> --json`.

An artifact is Markdown starting with `---` YAML front matter, closed by `---`. Unknown front-matter keys are rejected (`strict`). `<script` tags and NUL bytes are rejected on write.

## Metadata fields

`schema_version` (must be `0.1`), `id` (`^[a-z][a-z0-9-]{2,80}$`), `artifact_type`, `repository` {`provider`,`owner`,`name`,`default_branch?`}, `created_at`, `updated_at` (ISO datetimes), `generator`, `execution_origin` (`cloud|local|ci|third_party`), `source_refs[]`, `evidence[]`, `finding_classification?` (`deterministic|correlated|semantic|uncertain`), `review_status` (`draft|pending|accepted|rejected|superseded`, default `draft`), `sensitivity` (`public|internal|confidential|restricted`, default `internal`), `sync_policy` (`local_only|allowlisted|dashboard_overlay|repository_authoritative`, default `repository_authoritative`), `supersedes?`, `superseded_by?`, `checksum?` (sha256 hex), `dashboard?` (projection; see `dashboard-contract.md`).

Evidence reference: `type` in `repository|branch|commit|pull_request|issue|file|line|symbol|check|decision|risk|url`, `locator`, optional `label`, `provider`, `metadata`.

## Artifact types (13)

`config`, `analysis`, `daily_report`, `weekly_report`, `pr_brief`, `decision`, `risk`, `debt`, `conflict`, `rule`, `index`, `open_pr_state`, `sync_state`.

## Syncable types (10)

`analysis`, `daily_report`, `weekly_report`, `pr_brief`, `decision`, `risk`, `debt`, `conflict`, `rule`, `index`.
Not syncable: `config`, `open_pr_state`, `sync_state`.

## What the CLI generates

| Artifact        | Command                     | Path                              | Dashboard projection                        |
| --------------- | --------------------------- | --------------------------------- | ------------------------------------------- |
| `analysis`      | `trace analyze`             | `analyses/analysis-<hash>.md`     | yes                                         |
| `daily_report`  | `trace report daily --yes`  | `reports/daily/<date>.md`         | yes                                         |
| `weekly_report` | `trace report weekly --yes` | `reports/weekly/<date>.md`        | yes                                         |
| `pr_brief`      | `trace pr --write --yes`    | `pull-requests/<provider>-<n>.md` | yes; clean, stable current HEAD/branch only |

No CLI command generates `decision`, `risk`, `debt`, `conflict`, `rule`, `index`, `open_pr_state`, `sync_state`. Do not fabricate them. If the user explicitly asks you to author one, follow the schema exactly, set `execution_origin: local`, keep source out, run `trace validate`, and say it is hand-authored.

## Rules

- Never hand-edit CLI-generated artifacts to alter findings, classification, evidence, or projection.
- Evidence locators (paths, commit SHAs) are allowed; code content is not.
- Re-running `trace analyze` for the same HEAD overwrites the same file. The period-report implementation also revises the canonical selected-date report with explicit `--yes`; its creation timestamp is preserved. This period-report behavior is available in CLI 0.2.0.

## Commit attribution gate

Every path to synchronization requires empty `git status --porcelain`, fresh
analysis of that clean committed checkout, validation and the privacy dry-run.
Recheck cleanliness and matching HEAD immediately before sync. Dirty analysis
is local exploratory work only and MUST NOT sync. Reverting edits is insufficient:
regenerate the clean analysis even when HEAD has not changed. Runtime enforces clean-input branch/HEAD attribution for analyses. The period-report implementation adds the same publication gate for daily/weekly reports; regenerate legacy/unverified reports before sync. See safety.md for the publication policy.
