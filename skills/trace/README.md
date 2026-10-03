# TRACE Agent Skill

`skills/trace/SKILL.md` is the single canonical public TRACE Skill for coding agents.
It evolves the repository's original local-runtime Skill; references provide lifecycle,
dashboard, automation, safety and troubleshooting detail while existing workflows remain.
The Skill delegates execution to the CLI and does not provide a daemon or a separate artifact implementation.

## Current installation state

The current `@trace/cli` package is private, version 0.1.0. No public npm package,
registry installer or global release is verified in current source. For this checkout,
run `pnpm install --frozen-lockfile`, then `pnpm --filter @trace/cli... build`.
Invoke `node packages/trace-cli/dist/cli.js <command>` or root `pnpm trace <command>`;
`trace` in the Skill means that CLI, not a guessed npm package. This is the current
workspace installation path, not a permanent distribution promise.

Point the agent at this SKILL.md, with its references/workflows accessible. No
host-specific loader or registry installation is assumed. Local work needs no cloud
login. Cloud sync requires the normal user-approved device flow and selected repository.

## Review and drift protection

Source remains authoritative. CLI drift tests protect documented command/subcommand
behavior, schema/protocol/types/projections, sync privacy/limits, and stable errors.
Update this package when changing those contracts; never compensate for product gaps
inside the Skill. The current analyze-before-init partial-directory behavior and
PR-brief missing-projection gap are documented in references and exercised locally.
