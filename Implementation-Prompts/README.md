# TRACE Implementation Prompts

This directory contains the ordered implementation plan for building TRACE with Codex or Claude Code.

Each file is an execution prompt, not a general product note. Run the prompts in order unless a prompt explicitly states that it can be parallelized.

## Source documents

Before executing any phase, the coding agent must read:

- `README.md`
- `DOC/project-overview.md`
- `DOC/technical-overview.md`
- `Design-system/TRACE-DESIGN-SPEC.md`
- the current phase prompt
- all completed phase summaries in `IMPLEMENTATION-LOG.md`

The research directory is reference material. It should not be loaded entirely into context for routine implementation.

## Reference stack

The implementation prompts assume this baseline:

- TypeScript monorepo
- pnpm workspaces
- Turborepo task orchestration
- Next.js App Router for the dashboard, website, authentication UI, and HTTP route handlers
- PostgreSQL
- Drizzle ORM and SQL migrations
- Better Auth for product authentication
- GitHub App integration through Octokit
- pg-boss for PostgreSQL-backed jobs and schedules
- a separate Node.js worker runtime
- Zod and JSON Schema for `.trace` contracts
- AI SDK provider abstraction with schema-validated structured output
- Tailwind CSS for token consumption and utility composition
- Radix primitives for accessible low-level interactions
- custom TRACE components and styles; no copied shadcn theme
- Vitest for unit and integration tests
- Playwright for browser-level tests
- Docker Compose for local infrastructure

Use current stable, mutually compatible releases when executing a phase. Pin exact versions in the lockfile. Do not use alpha, beta, canary, or release-candidate packages unless the phase explicitly authorizes them.

## Initial language scope

The first complete analysis path supports:

- TypeScript
- JavaScript

Other languages receive file-level diff analysis only until explicit adapters are added.

## Phase order

1. `00-project-rules-and-workflow.md`
2. `01-foundation-and-monorepo.md`
3. `02-trace-design-system.md`
4. `03-marketing-and-auth-shell.md`
5. `04-dashboard-application-shell.md`
6. `05-github-app-integration.md`
7. `06-trace-artifact-specification.md`
8. `07-local-cli-and-skill.md`
9. `08-change-analysis-engine.md`
10. `09-pr-intelligence.md`
11. `10-conflict-detection.md`
12. `11-daily-and-weekly-reports.md`
13. `12-dashboard-data-and-sync.md`
14. `13-rules-and-governance.md`
15. `14-security-and-privacy.md`
16. `15-testing-and-quality.md`
17. `16-production-deployment.md`

## Execution rules

For each phase:

1. Inspect the repository before editing.
2. Confirm previous phase acceptance criteria are still passing.
3. Make the smallest coherent architecture change that completes the phase.
4. Do not silently replace architectural decisions.
5. Add or update tests with the implementation.
6. Run all required validation commands.
7. Update `IMPLEMENTATION-LOG.md` with:
   - completed scope;
   - files added or changed;
   - architectural decisions;
   - known limitations;
   - commands run and outcomes;
   - next-phase prerequisites.
8. Stop when acceptance criteria pass.
9. Do not implement future-phase features early unless needed for a stable interface.

## Commit policy

The coding agent may prepare commits only when explicitly instructed by the human operator.

When commits are authorized:

- one coherent commit per completed phase is preferred;
- never commit secrets or local environment files;
- never commit generated `.trace` runtime outputs from development fixtures unless the fixture path is explicitly allowlisted;
- include migration and test changes in the same phase commit as the feature they support.

## Definition of done

A phase is complete only when:

- implementation matches the prompt;
- tests pass;
- type checking passes;
- linting passes;
- the relevant UI states are implemented;
- accessibility requirements are met;
- error and empty states are handled;
- no secrets are introduced;
- documentation and implementation log are updated;
- no placeholder behavior is presented as complete functionality.
