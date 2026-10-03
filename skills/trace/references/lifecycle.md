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

Existing current repo: valid `.trace`, clean tree, latest analysis `head_commit` == `HEAD` -> do not re-analyze; dry-run/sync only if requested.

Modified local repo: dirty tree or new HEAD -> `trace analyze` -> `trace validate` -> `trace sync --dry-run` -> `trace sync` if requested.

Needs refresh: ask/confirm whether the local checkout should first be updated to the remote state (never pull/reset unprompted) -> `trace analyze` -> `trace validate` -> dry-run -> sync.

New PR: `trace pr --base <ref> --base-sha <sha> <n>` preview -> `--write --yes` -> `trace analyze` if checkout changed -> dry-run; note the PR brief is excluded from sync today.

Unsafe sync: dry-run shows a source/snippet flag true, an unexpected `eligible` entry, or surprising content -> STOP, do not run `trace sync`, report which artifact and why.
