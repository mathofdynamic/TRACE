# Automation model

```text
Skill != daemon     Skill != background service     Skill != GitHub webhook listener
```

Loading this Skill causes nothing to run. The CLI executes only when an agent, hook, or CI job invokes it.

## Commands that do NOT exist (verified against CLI source)

`trace watch`, `trace daemon`, `trace auto`, `trace monitor`, `trace hooks install`. Also `trace rules explain` and `trace rules diff` are advertised in the usage text but return a usage error; only `list`, `effective`, `validate`, `test` work. Never put these in instructions, scripts, or hooks. If a future release adds them, verify against the CLI first.

## Trigger categories

User-driven (supported): the user asks you to update/analyze/sync/report. Follow the workflows in `SKILL.md`.

Git-driven (user-built, not shipped by TRACE): local hooks can run local-only steps, e.g. post-commit: `trace validate --json` and `trace analyze --json` (no network). Do not install hooks unless the user asks. Do not run `trace sync` in `pre-push`: it runs before the commit exists on GitHub. Git has no post-push hook, so push-triggered sync cannot be done reliably with hooks alone.

CI-driven (limited): CI may run `trace validate` and `trace analyze --dry-run`. TRACE documents no CI credential model; credentials are per-device (`trace login`) and must never be copied into CI secrets or repo files by an agent. Artifacts with `execution_origin: ci` are not eligible for sync (sync requires `local`). Do not represent CI-to-dashboard sync as available.

Cloud-driven (not under your control): GitHub webhooks update TRACE's remote repository/PR knowledge. This changes plane A and may flip the dashboard to "Needs refresh". It does not run analysis; analysis is local-first.

Future runtime: none to rely on today.

## Recommended trigger policy (Skill recommendation, not product feature)

| Event                    | Recommended action                                                  | Supported by TRACE today?               |
| ------------------------ | ------------------------------------------------------------------- | --------------------------------------- |
| User asks analyze/update | analyze if needed -> dry-run -> sync                                | Yes (manual CLI)                        |
| Local commit             | update local analysis; do not auto-publish                          | Analysis yes; automation is user-built  |
| Push                     | analyze if changed -> dry-run -> sync (after the push has happened) | Manual only                             |
| PR opened/updated        | `trace pr ... --write --yes` (+ `analyze`)                          | Manual command; no event hook           |
| PR merged/closed         | final `analyze`/report on request, then dry-run -> sync             | Manual only                             |
| Remote GitHub change     | cloud updates remote state; dashboard may say Needs refresh         | Cloud side yes; local refresh is manual |
| Needs refresh            | analyze current checkout -> dry-run -> sync                         | Yes (manual)                            |

Mark in your answer which parts are manual so the user does not assume background behavior.
