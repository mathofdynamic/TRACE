# Contributing to TRACE

TRACE is built in ordered implementation phases. Read the root `AGENTS.md`, the product and technical documents, the design specification, the implementation roadmap, and the current phase prompt before making changes.

## Local prerequisites

The baseline is Node.js 22+, pnpm 11+, native PostgreSQL on Windows, and Git. Docker is not required for the local workflow. Run `powershell -ExecutionPolicy Bypass -File scripts/postgres/install.ps1` if PostgreSQL is not installed, then run `powershell -ExecutionPolicy Bypass -File scripts/postgres/bootstrap-local.ps1` when an elevated Windows service cannot be started. The user-owned local cluster uses port 3002 and `.trace-cache/`.

Available foundation commands include `pnpm install`, `pnpm db:migrate`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm build`, and `pnpm test:e2e`. Use `scripts/postgres/health.ps1` to verify the database and `scripts/postgres/reset.ps1 -ConfirmReset` only for an explicitly disposable local database.

## Workflow

- Work on one phase at a time.
- Inspect existing behavior before editing.
- Keep changes within the current phase unless a stable interface requires otherwise.
- Update `IMPLEMENTATION-LOG.md` with scope, decisions, tests, commands, results, limitations, and prerequisites.
- Use branches prefixed with `codex/` when branch creation is authorized.
- Commits, pushes, and pull requests require explicit human authorization.

## Quality requirements

- Add tests with implementation changes.
- Preserve strict typing, tenant isolation, evidence provenance, and artifact portability.
- Run the phase validation commands and report exact outcomes.
- UI changes must follow the TRACE design specification, support keyboard and reduced-motion use, and include responsive states.
- Migrations must be reviewed, reversible or forward-fixable, and tested from an empty database.
- Never commit secrets, local environment files, generated `.trace/` runtime output, source-code dumps, or private model conversations.

## Security reporting

Do not publish exploitable details in a public issue. Follow `SECURITY.md` and replace its owner placeholder before public launch.
