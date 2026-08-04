# Phase 00 — Project Rules and Agent Workflow

## Role

Act as the principal engineer responsible for establishing the implementation discipline for TRACE before product code is added.

Do not build features in this phase.

## Required reading

Read these files completely:

- `README.md`
- `DOC/project-overview.md`
- `DOC/technical-overview.md`
- `Design-system/TRACE-DESIGN-SPEC.md`
- `Implementation-Prompts/README.md`

Inspect the entire repository tree and existing configuration before making changes.

## Objective

Create the repository-level instructions, documentation templates, and validation conventions that every later coding-agent session must follow.

The result must prevent architectural drift, accidental secret exposure, generic UI styling, unverified claims of completion, and uncontrolled implementation across future phases.

## Deliverables

### 1. Root `AGENTS.md`

Create a concise root `AGENTS.md` that instructs coding agents to:

- read the product, technical, and design documents before implementation;
- follow the phased prompts in order;
- treat `.trace/` as runtime output unless working on explicit fixtures;
- preserve the local/cloud/hybrid artifact contract;
- keep deterministic facts separate from model inference;
- avoid individual developer scoring;
- use evidence-backed output;
- never introduce secrets;
- validate all generated repository paths;
- keep GitHub webhook handling idempotent;
- implement high-signal interfaces instead of noisy AI comments;
- update tests and `IMPLEMENTATION-LOG.md` in every phase;
- never claim a command passed unless it was executed successfully;
- not commit, push, or open a PR without explicit human authorization.

Keep `AGENTS.md` short enough to load in coding-agent context without creating unnecessary token cost. Link to detailed documents instead of duplicating them.

### 2. `IMPLEMENTATION-LOG.md`

Create a durable implementation log with this structure:

```markdown
# TRACE Implementation Log

## Current status
- Current phase:
- Last completed phase:
- Branch:
- Known blockers:

## Architecture decisions

## Phase history

### Phase XX — Name
- Status:
- Date:
- Scope completed:
- Files changed:
- Migrations:
- Tests added:
- Commands run:
- Results:
- Known limitations:
- Next prerequisites:
```

The file must contain an initial Phase 00 entry.

### 3. `CONTRIBUTING.md`

Create a concise contribution guide covering:

- local prerequisites;
- phase-based workflow;
- branch naming;
- commit expectations;
- required checks;
- migrations;
- documentation updates;
- UI fidelity requirements;
- accessibility;
- security reporting;
- prohibition on committing secrets or local `.trace` runtime data.

Do not invent commands that do not exist yet. Clearly mark future commands as planned and update the document in Phase 01 after scripts exist.

### 4. Pull request template

Create `.github/pull_request_template.md` with sections for:

- purpose;
- phase and scope;
- product impact;
- screenshots or recordings for UI changes;
- architecture decisions;
- security/privacy impact;
- `.trace` contract impact;
- tests and commands executed;
- accessibility checks;
- known limitations;
- checklist.

The template must discourage vague statements such as “tests pass” without listing commands.

### 5. Issue templates

Create minimal GitHub issue templates under `.github/ISSUE_TEMPLATE/`:

- `bug.yml`
- `feature.yml`
- `research.yml`
- `config.yml`

Requirements:

- bug reports request reproducible steps, expected behavior, actual behavior, environment, logs with secrets removed, and privacy impact;
- feature requests require the problem, target user, evidence, non-goals, and expected product outcome;
- research requests separate verified facts from hypotheses and require sources;
- disable blank issues only if templates provide a practical route for all normal work.

### 6. Decision record template

Create `DOC/decisions/README.md` and `DOC/decisions/0000-template.md`.

The template should capture:

- status;
- date;
- context;
- decision;
- alternatives considered;
- consequences;
- privacy/security impact;
- `.trace` compatibility impact;
- superseded decisions.

This is for implementation architecture decisions, not runtime TRACE decision artifacts.

### 7. Security documentation shell

Create `SECURITY.md` with:

- supported-version placeholder;
- private reporting instructions placeholder;
- sensitive-data handling expectations;
- request not to publish exploitable details in public issues;
- scope covering dashboard, GitHub App, CLI, worker, artifact schema, and sync.

Do not add a fake security email. Use a clearly marked placeholder that the repository owner must replace before public launch.

### 8. Repository housekeeping

Review `.gitignore` and improve it only where needed.

It must exclude:

- `.env` variants while preserving an eventual `.env.example`;
- package-manager caches;
- build outputs;
- test artifacts;
- local database data;
- local analysis workspaces;
- `.trace/` runtime output by default.

Do not ignore specification fixtures that later phases will place under explicit test directories.

## Constraints

- Do not initialize the application stack.
- Do not add dependencies.
- Do not create placeholder product code.
- Do not edit research files.
- Do not redesign existing documentation.
- Do not add CI workflows yet.
- Do not include Apple-owned font files or unlicensed assets.
- Use English for implementation and contribution files.

## Validation

Perform these checks:

1. List all created and modified files.
2. Verify every Markdown link resolves to an existing repository path.
3. Verify YAML issue templates parse correctly.
4. Search the changed files for accidental secret-like values.
5. Confirm no product runtime or dependency files were created.

## Acceptance criteria

- Root agent instructions are concise and point to authoritative documents.
- A new coding-agent session can determine the current phase and workflow from repository files alone.
- Contribution and PR templates require explicit validation evidence.
- Issue templates distinguish bugs, product requests, and research.
- Architecture decisions have a durable record format.
- Security reporting expectations exist without fake contact details.
- `.gitignore` protects future local and generated data.
- `IMPLEMENTATION-LOG.md` contains a truthful Phase 00 entry.

## Completion response

Return:

- files created and modified;
- validation performed;
- any owner action required;
- confirmation that no feature implementation was started.
