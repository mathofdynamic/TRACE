# TRACE Agent Skill

`skills/trace/SKILL.md` is the single canonical public TRACE Skill for coding agents.
It evolves the repository's original local-runtime Skill; references provide lifecycle,
dashboard, automation, safety and troubleshooting detail while existing workflows remain.
The Skill delegates execution to the CLI and does not provide a daemon or a separate artifact implementation.

## Current installation state

Install the standalone CLI with the GitHub release instructions in
[the CLI README](../../packages/trace-cli/README.md). Version 0.1.0 bundles its
runtime dependencies; no npm registry package name should be guessed.
For source development, run `pnpm install --frozen-lockfile`, then
`pnpm --filter @trace/cli... build` and `pnpm trace <command>`.

Point the agent at this SKILL.md, with its references/workflows accessible. No
host-specific loader or registry installation is assumed. Local work needs no cloud
login. Cloud sync requires the normal user-approved device flow and selected repository.

## Review and drift protection

Source remains authoritative. CLI drift tests protect documented command/subcommand
behavior, schema/protocol/types/projections, sync privacy/limits, and stable errors.
Update this package when changing those contracts; never compensate for product gaps
inside the Skill. The current analyze-before-init partial-directory behavior and
PR-brief missing-projection gap are documented in references and exercised locally.

Dirty analyses remain local exploratory work; synchronization requires a clean
committed checkout and freshly regenerated clean analysis. The current CLI
`--with-ai` flag has no configured real semantic provider and is not an AI feature.
