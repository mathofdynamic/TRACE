---
name: trace
description: Operate a TRACE-enabled repository through the `trace` CLI - initialize `.trace`, analyze, validate, dry-run and sync artifacts, produce PR briefs and daily/weekly reports, and interpret dashboard states such as "Needs refresh". Use when the user mentions TRACE, `.trace`, `trace sync`, or the TRACE dashboard.
---

# Working with TRACE

Written against: TRACE CLI `0.1.0`, artifact schema `0.1`, sync protocol `0.1`.
Check with `trace --version` and `.trace/schema-version`. If versions differ, review the installed CLI contract before applying these instructions; do not guess.

## Purpose

You are the operator. The `trace` CLI is the only executor. `.trace/` is repository-local project memory. This Skill does not run in the background, does not watch Git, and does not talk to TRACE Cloud itself. It only runs while you are working.

```text
Agent + this Skill -> trace CLI -> .trace/ -> (explicit) trace sync -> TRACE Cloud -> Dashboard
```

## Core invariants

1. Never create or edit `.trace/` scaffolding by hand. Use `trace init --yes`.
2. Never hand-write artifacts the CLI can generate (analysis, daily/weekly report, PR brief). Never add a `dashboard:` block to make something sync.
3. Source code stays local. Never put source, snippets, fenced code, secrets, or tokens in `.trace/`.
4. Always run `trace sync --dry-run --json` before `trace sync`. Continue only if `sourceCodeIncluded` and `codeSnippetsIncluded` are both `false`. Otherwise STOP and report.
5. Never invent dashboard or GitHub data. Cloud/GitHub binding and sync state are read through the CLI (`trace status`, `trace whoami`, `trace sync status`); other GitHub/dashboard facts require a trusted authorized source or the user.
6. Never commit, push, or open PRs unless the user asked. Do not change `.trace/` git-ignore policy.
7. Use `--json` on every `trace` call you parse. Exit code `0` ok, `1` failure/invalid, `2` usage or refusal.
8. Do not run commands that do not exist (see `references/automation.md`). Verify with `trace <cmd>` output if unsure.

## Detect repository state (do this first)

Run, from the repo root:

```bash
trace --version
git rev-parse --show-toplevel && git rev-parse HEAD && git status --porcelain
test -f .trace/config.yml && test -f .trace/schema-version && echo initialized
trace status --json        # valid?, GitHub identity, dashboard binding
```

Then pick a branch:

| Observation                                                   | Action                                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `trace` not found                                             | Use the current workspace build instructions in README.md; no published installer is verified. Do not `npm install` a guessed package. |
| `.trace/config.yml` or `schema-version` missing               | Initialize. Do NOT run `trace analyze` first (it would create a partial `.trace/`).                                                    |
| `trace validate` reports issues                               | Stop; read `references/troubleshooting.md`; repair or ask.                                                                             |
| `dashboard.connected: false`                                  | Authenticate/connect if the user wants dashboard sync; otherwise local-only is valid.                                                  |
| Connected, no analysis file                                   | Analyze.                                                                                                                               |
| Tree dirty, or latest analysis `head_commit` != `HEAD`        | Re-analyze.                                                                                                                            |
| Tree clean and latest analysis `head_commit` == `HEAD`, valid | Skip analysis; go to dry-run/sync if sync was requested.                                                                               |

Latest analysis head: `trace inspect .trace/analyses/<file>.md --json` -> `dashboard.head_commit`. The analysis filename is derived from repo + HEAD, so re-analysis of the same HEAD overwrites the same file; it does not distinguish uncommitted edits, hence "dirty -> re-analyze".

## Initialize

```bash
trace init --json          # preview only (dry run)
trace init --yes --json    # creates files, never overwrites existing ones
trace validate --json      # expect []
```

Exit `2` with "TRACE already exists" means `.trace` is present; use `--yes` only to adopt missing files.

## Authenticate and connect (human steps involved)

```bash
trace whoami --json
trace login --no-open      # prints a URL + code; a PERSON must approve it in the browser
trace connect --json
```

- `trace login` blocks until approval or expiry. Print the URL/code to the user, wait, do not pretend it completed.
- `trace connect` needs: initialized `.trace`, a valid login, `remote.origin.url` that is an unambiguous GitHub URL, and exactly one matching repository selected in the user's TRACE workspace. If not selected, tell the user to select it in the dashboard (or grant the GitHub App access). Never connect to a guessed target.
- Do not change `TRACE_CLOUD_URL` / `TRACE_ENVIRONMENT` unless the user explicitly instructs it. Report `environment` from CLI output when relevant.

## Analyze

```bash
trace analyze --json              # writes .trace/analyses/analysis-<id>.md (local, no network)
trace analyze --dry-run --json    # preview, no artifact write (can create an empty .trace directory)
trace validate --json
```

`--with-ai` enables optional semantic analysis; use it only if the user asks, and read `analysis.provenance` (`sourceCodeSentToProvider`) in the output. Plain `analyze` is deterministic. Never describe deterministic output as semantic/model analysis.

## "Update TRACE" workflow

1. Detect state (above). 2. `trace validate --json`. 3. Analyze only if needed. 4. `trace validate --json`. 5. `trace sync --dry-run --json`; inspect `eligible`, `excluded`, `totalBytes`, both flags. 6. If the user asked to update/sync and the dry-run is safe: `trace sync --json`. 7. Verify: `trace sync status --json` and inspect the returned sync operation and commit information, comparing it with `git rev-parse HEAD` when supplied. Do not infer freshness from a successful upload alone.

If not connected, stop after step 4/5 and say what is needed. Local-only update is a valid outcome.

## Safe synchronization

- Sync happens only via `trace sync`; it sends only allowlisted, source-free artifacts that carry a `dashboard` projection. Limits: 256 KiB per artifact, 64 artifacts, 2 MiB total.
- Read every entry in `excluded`. Each has a reason (see `references/safety.md`). Do not "fix" an exclusion by weakening policy, editing sensitivity/sync_policy, or enabling `include_code_snippets`.
- Sync uses the current branch and `HEAD`. On a detached HEAD the branch is empty and the manifest requires one, so a connected sync is expected to fail; ask the user to check out a branch.
- Do not sync merely because a local commit exists. See Dashboard/freshness.
- If sync reports "Dashboard divergence requires review", STOP. `trace sync status --accept-dashboard-base` changes local sync state and needs explicit user approval.

## PR workflow

```bash
trace pr --base <base-branch> --base-sha <sha> [<pr-number>] --json     # preview only
trace pr [<pr-number>] --base <ref> --base-sha <sha> --write --yes      # writes .trace/pull-requests/<provider>-<n-or-local>.md
```

- `trace pr` is a manual, local command. It does not read the PR from GitHub; you must pass `--base`/`--base-sha`/number or they are recorded as `unknown`/`local`.
- Current limitation: the generated `pr_brief` has no dashboard projection, so `trace sync --dry-run` lists it under `excluded` ("no dashboard projection"). The PR brief stays local. Do not patch it to force sync; tell the user.
- There is no CLI command for PR opened/updated/merged/closed events. On request, re-run `trace pr` (and `analyze` if the checkout changed). See `references/automation.md`.

## Reports

Only when the user asks (or a user-configured automation does):

```bash
trace report daily  [--date YYYY-MM-DD] --yes --json     # without --yes it is a preview
trace report weekly --yes --json
```

Reports are deterministic drafts. `--with-ai` (daily) adds an analysis snapshot only. Reports are syncable but sync still requires dry-run first.

## Dashboard / freshness interpretation

Two data planes: (A) GitHub/Cloud state (repo identity, selection, remote HEAD, default branch, PR metadata) and (B) synced `.trace` artifacts (analysis, reports, findings, provenance, analyzed commit). The backend joins them; never copy A into `.trace`.

"Needs refresh" means the last synced `head_commit` differs from the remote HEAD TRACE knows. Fix: update the local checkout if the user wants (do not pull/reset without being asked), then analyze -> dry-run -> sync. A synced local commit that GitHub does not have also reads as stale; publishing is the user's decision. Full state table: `references/lifecycle.md`.

## Automation boundary

You are not a daemon. Triggers come from the user, Git hooks, CI, or GitHub webhooks. TRACE ships no hook installer, watcher, or CI sync today. Do not claim otherwise. Details: `references/automation.md`.

## Human-action boundary

Use existing task authorization for routine CLI steps. Browser/account-owner actions need a person: approving `trace login`; selecting the repository / granting the GitHub App in the dashboard; resolving ambiguous identity; approving `--accept-dashboard-base`; re-authorizing a revoked device; environment overrides not specified by the task. Do everything else first, state the exact action, then wait.

## Reference index

- `references/lifecycle.md` - state machine, command-per-state, scenarios
- `references/trace-directory.md` - `.trace` layout, which files are config/state/artifacts
- `references/artifact-contract.md` - metadata fields, types, syncable types
- `references/dashboard-contract.md` - projection schema, manifest, data planes
- `references/automation.md` - what can/cannot trigger TRACE
- `references/safety.md` - privacy boundary, sync gates, limits, credentials
- `references/troubleshooting.md` - errors and fixes

## Existing workflows

Load `workflows/validate.md`, `workflows/daily-report.md`, or `workflows/pr-review.md` when needed; they use this same CLI contract.
