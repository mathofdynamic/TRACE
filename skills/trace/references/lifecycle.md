# Lifecycle and state machine

Source of truth for dashboard states: `apps/web/lib/dashboard-state.ts` (`deriveTraceProjectState`, `localTraceCommandsForState`). Re-check that file if the dashboard wording differs from this table.

## States

| Dashboard state                            | Meaning                                                        | Command(s)                                            | Local | Cloud       | Human                                              |
| ------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------- | ----- | ----------- | -------------------------------------------------- |
| Not connected                              | No repository bound/selected                                   | `trace login`, `trace connect`                        | yes   | yes         | yes: approve login; select repo in dashboard       |
| GitHub access required / unavailable       | TRACE cannot read trusted GitHub state                         | none from CLI                                         | no    | GitHub-side | yes: grant/repair GitHub App access, or wait/retry |
| Connected - Not analyzed                   | Identity known, no local analysis synced                       | `trace analyze`                                       | yes   | no          | no                                                 |
| Analysis in progress                       | Local analysis running/queued; dashboard unchanged             | wait                                                  | yes   | no          | no                                                 |
| Analysis failed (no prior sync)            | Local analysis did not complete                                | `trace analyze` again; see troubleshooting            | yes   | no          | maybe                                              |
| Ready to sync (analysis available locally) | Local analysis completed, nothing synced                       | `trace sync --dry-run`, `trace sync`                  | yes   | yes         | no                                                 |
| Sync needs attention                       | Last sync was not accepted; previous verified record is intact | `trace sync --dry-run`, fix cause, `trace sync`       | yes   | yes         | maybe                                              |
| Needs refresh                              | Last synced `head_commit` != remote HEAD TRACE knows           | `trace analyze`, `trace sync --dry-run`, `trace sync` | yes   | yes         | no                                                 |
| Current                                    | Synced commit == remote HEAD                                   | none                                                  | -     | -           | -                                                  |
| Freshness unavailable                      | Synced, but remote HEAD unknown                                | none from CLI; wait for GitHub state                  | no    | GitHub-side | no                                                 |
| Computer revoked                           | Device credential revoked/invalid                              | `trace login`                                         | yes   | yes         | yes: approve login                                 |

Precedence: Needs refresh outranks Sync needs attention (re-uploading an old analysis cannot make it current).
The CLI never remediates states it does not list. Do not invent fixes for GitHub-side states.

## Freshness rule

`stale = remoteHeadSha !== latestSync.headCommit` (exact string comparison; `null`/unknown when either is missing). Consequences:

- A synced commit that exists only locally reads as stale until remote HEAD equals it.
- Syncing from a non-default branch can read as stale against the repository's remote HEAD.
- Therefore: local commit -> update local analysis, keep sync explicit. Sync after the user has pushed, or when the user asks.

## Scenarios

Fresh repo: `trace init --yes` -> `trace validate` -> (if dashboard wanted) `trace login` [human] -> `trace connect` -> `trace analyze` -> `trace sync --dry-run` -> verify flags -> `trace sync` -> `trace sync status`.

Existing current repo: valid `.trace`, clean tree, latest analysis `head_commit` == `HEAD` -> local-only work may skip analysis; requested synchronization always regenerates analysis from the clean committed checkout.

Modified local repo: dirty tree -> local exploratory `trace analyze` only -> DO NOT sync. Once relevant changes are committed and the tree is clean, re-analyze clean -> validate -> privacy dry-run -> authorized sync. A reverted dirty edit still requires clean re-analysis, even at the same HEAD.

Needs refresh: ask/confirm whether the local checkout should first be updated to the remote state (never pull/reset unprompted) -> `trace analyze` -> `trace validate` -> dry-run -> sync.

New PR: `trace pr --base <ref> --base-sha <sha> <n>` preview -> `--write --yes` -> `trace analyze` if checkout changed -> validate -> privacy dry-run -> authorized sync. The generated source-free PR brief is eligible only for clean, stable current HEAD/branch and matching repository identity; dirty/unstable and legacy projection-free briefs must be regenerated from clean input. GitHub title/state/PR-wide totals remain unavailable.

Unsafe sync: dry-run shows a source/snippet flag true, an unexpected `eligible` entry, or surprising content -> STOP, do not run `trace sync`, report which artifact and why.

## Commit attribution gate

Every path to synchronization requires empty `git status --porcelain`, fresh
analysis of that clean committed checkout, validation and the privacy dry-run.
Recheck cleanliness and matching HEAD immediately before sync. Dirty analysis
is local exploratory work only and MUST NOT sync. Reverting edits is insufficient:
regenerate the clean analysis even when HEAD has not changed. This Skill policy
is not currently enforced by TRACE runtime. See safety.md for the publication policy.
