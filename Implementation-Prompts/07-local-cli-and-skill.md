# Phase 07 — Local CLI and Agent Skill

## Role

Act as a senior developer-tooling engineer. Build the canonical local TRACE runtime and the first official Agent Skill.

## Objective

Deliver a useful local-first workflow that can initialize `.trace`, inspect repository changes, validate artifacts, and generate deterministic report inputs without requiring TRACE Cloud.

This phase does not yet implement full semantic analysis. It establishes the safe local runtime and integration contract used by later phases.

## Required reading

Read the standard documents, the full v0.1 specification, Phase 06 implementation notes, and all current package APIs.

## 1. CLI package

Create a publishable CLI package, for example `packages/trace-cli`, with a `trace` binary.

Requirements:

- Node runtime supported by the repository;
- ESM or the repository’s chosen module standard consistently;
- typed command definitions;
- structured internal errors;
- human-readable default output;
- JSON output option for automation;
- no telemetry without explicit opt-in;
- no required cloud login for local commands;
- clear exit codes;
- cross-platform path behavior.

## 2. Commands

Implement:

```text
trace init
trace status
trace validate
trace inspect <artifact-or-id>
trace changes [--since <ref-or-time>] [--until <ref-or-time>]
trace report daily [--date <date>] [--dry-run]
trace pr <number-or-url> [--dry-run]
trace sync status
trace config show
trace doctor
```

At this phase:

- `report daily` may produce a deterministic draft without AI narrative;
- `pr` may produce collected evidence and a structured draft shell;
- `sync status` reports unconfigured state and validates local sync metadata;
- future behavior must be marked clearly rather than faked.

## 3. `trace init`

The initialization flow should:

- confirm repository root;
- detect existing `.trace` data;
- offer non-destructive adoption;
- create minimal `config.yml` and `README.md`;
- write `schema-version`;
- create only required directories;
- detect Git provider from remotes;
- detect default branch where possible;
- ask execution mode preference;
- configure report timezone;
- configure write policy;
- never store credentials;
- show a dry-run preview before writing unless `--yes` is supplied.

Do not overwrite existing files without explicit confirmation.

## 4. Repository adapter

Implement a local Git adapter that can:

- locate repository root;
- inspect working-tree state;
- resolve refs;
- list commits in a range;
- obtain name-status and patch metadata;
- detect renames;
- collect authorship and timestamps;
- map branch and remote identity;
- detect shallow clones;
- avoid loading entire large diffs into memory where possible.

Prefer invoking Git safely with argument arrays or a trusted library. Never compose shell commands from untrusted strings.

## 5. Change-set model

Create the shared normalized change-set type containing:

- repository identity;
- base/head refs;
- commit list;
- changed files;
- additions/deletions counts;
- rename/delete metadata;
- time window;
- authors or agents where known;
- issue/PR references extracted from metadata;
- working-tree status;
- evidence references.

This type must be reused later by cloud workers.

## 6. Deterministic draft reports

Create artifact generators that can produce a valid draft daily report and PR brief using only deterministic data.

The draft must state what is known and what remains unknown.

Example:

- known: three commits modified authentication and test files;
- unknown: intended product goal was not found;
- required input: linked issue or human description.

Do not invent “why” from filenames or commit messages as certainty.

## 7. Configuration loading

Implement layered configuration:

1. explicit CLI flags;
2. repository `.trace/config.yml`;
3. user-level TRACE config where appropriate;
4. safe defaults.

Credentials and API keys must come from environment variables or OS-supported secret mechanisms, never repository config.

Show the source of each effective configuration value in `trace config show` without exposing secret values.

## 8. `trace doctor`

Check:

- supported Node version;
- Git availability;
- repository state;
- schema compatibility;
- config validity;
- filesystem permissions;
- model-provider configuration presence without showing secret;
- cloud endpoint configuration;
- network requirement for requested mode;
- suspicious secrets under `.trace`;
- stale lock/temp files.

Provide actionable remediation and nonzero exit code for blocking issues.

## 9. Agent Skill

Create an official skill under a clear path such as:

```text
skills/trace/
├── SKILL.md
├── workflows/
│   ├── daily-report.md
│   ├── pr-review.md
│   └── validate.md
└── examples/
```

The Skill must:

- instruct agents to call the CLI rather than manually recreate logic;
- load only the workflow needed;
- distinguish deterministic output from interpretation;
- forbid writing secrets;
- require dry-run before durable writes unless user has authorized changes;
- require artifact validation;
- avoid requesting or exposing private chain-of-thought;
- teach agents to cite evidence references;
- explain local, cloud, and hybrid behavior;
- remain concise enough for practical context use.

Provide setup notes for Codex and Claude Code without depending on undocumented private behavior.

## 10. Local locking and atomicity

Implement a repository-scoped lock for write operations.

Requirements:

- prevent two TRACE writers from modifying the same artifact set concurrently;
- timeout and stale-lock recovery;
- clear lock owner metadata without sensitive data;
- safe cleanup on interruption;
- atomic writes through the Phase 06 writer.

## 11. No-cloud guarantee

Add tests proving local commands do not make network requests unless:

- the command explicitly requires GitHub/API access;
- a model provider is configured and invoked;
- sync is explicitly requested.

Use a network-blocked test mode.

## 12. Packaging

Provide:

- executable package build;
- local workspace invocation;
- package README;
- shell-completion strategy or defer explicitly;
- version output;
- license metadata consistent with repository licensing status;
- no postinstall scripts that execute analysis or network calls.

## Tests

Add:

- temporary Git repository fixtures;
- init idempotency;
- dirty worktree;
- shallow clone;
- rename/delete;
- invalid refs;
- large diff metadata handling;
- Windows path behavior where feasible;
- config precedence;
- secret redaction;
- atomic writes and locks;
- JSON output stability;
- exit codes;
- network-blocked local mode;
- Skill workflow smoke tests where practical.

## Acceptance criteria

- A user can initialize TRACE in a Git repository without an account.
- The CLI creates valid v0.1 artifacts.
- `trace changes` returns normalized deterministic evidence.
- Draft reports clearly distinguish known and unknown information.
- Local mode performs no hidden cloud communication.
- Write operations are safe, previewable, and atomic.
- The Agent Skill delegates to the CLI and is not a prompt-only implementation.
- CLI and worker share change-set contracts.
- Documentation and implementation log are updated.

## Completion response

Return:

- command matrix and exit codes;
- example initialization and report output;
- network tests;
- Skill structure;
- package build result;
- limitations before semantic analysis.
