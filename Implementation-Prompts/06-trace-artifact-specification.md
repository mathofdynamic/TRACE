# Phase 06 — `.trace` Artifact Specification

## Role

Act as a specification author, data-contract engineer, and open-source maintainer.

## Objective

Define and implement version 0.1 of the portable `.trace` artifact contract.

This phase must produce a useful, validated local format before the analysis engine is built. The specification must remain independent from the TRACE Cloud database and any single model provider.

## Required reading

Read:

- product and technical overviews;
- repository-memory research summaries;
- completed implementation logs;
- current `packages/trace-schema` code;
- existing ADR conventions in the repository.

Do not load every research file unless needed to resolve a specific decision.

## 1. Specification repository structure

Create a dedicated specification area:

```text
spec/
├── README.md
├── VERSIONING.md
├── SECURITY.md
├── schemas/
│   └── v0.1/
├── examples/
│   └── v0.1/
└── rfcs/
```

Create an RFC for the initial directory and artifact contract.

## 2. Versioning model

Define:

- specification version format;
- artifact schema version format;
- backward-compatible versus breaking changes;
- deprecation process;
- migration behavior;
- extension namespace rules;
- experimental fields;
- minimum reader behavior for unknown fields.

Version 0.1 is experimental. State this clearly.

## 3. Canonical directory layout

Define the MVP layout:

```text
.trace/
├── README.md
├── config.yml
├── schema-version
├── rules/
├── reports/
│   ├── daily/
│   └── weekly/
├── pull-requests/
├── decisions/
├── risks/
├── debt/
├── state/
└── indexes/
```

Specify which paths are:

- durable and intended for Git;
- generated and rebuildable;
- local-only;
- optional;
- prohibited from containing secrets.

Do not require every directory to exist in an empty project.

## 4. Artifact types

Define schemas and Markdown front matter for:

- project configuration;
- daily report;
- weekly report;
- PR intelligence brief;
- decision record;
- risk record;
- technical-debt record;
- conflict record;
- rule definition metadata;
- artifact index;
- open-PR state;
- sync state.

For each type, document:

- purpose;
- required fields;
- optional fields;
- stable ID format;
- allowed statuses;
- evidence references;
- provenance;
- sensitivity;
- review/disposition status;
- supersession behavior;
- filename convention;
- size guidance.

## 5. Common metadata

Create a shared metadata schema containing at least:

- `schema_version`;
- `id`;
- `artifact_type`;
- `repository` identity;
- `created_at`;
- `updated_at`;
- `generator` name/version;
- `execution_origin`;
- `source_refs`;
- `evidence`;
- `finding_classification` where relevant;
- `review_status`;
- `sensitivity`;
- `sync_policy`;
- `supersedes` and `superseded_by`;
- optional checksums or signatures.

Use clear enums and avoid free-form status strings.

## 6. Evidence references

Define provider-neutral evidence references for:

- repository;
- branch;
- commit;
- PR;
- issue;
- file;
- line range;
- symbol;
- check/test;
- decision;
- risk;
- external URL.

A reference must contain enough information to resolve it without embedding full source content.

Support provider-specific extension fields under a namespace.

## 7. Markdown contract

Human-readable artifacts should use Markdown with YAML front matter.

Define:

- safe Markdown subset;
- heading conventions;
- standard sections by artifact type;
- how generated and human-edited content is identified;
- how evidence links are represented;
- whether raw HTML is prohibited;
- maximum recommended size;
- UTF-8 normalization;
- newline behavior.

Do not store raw model chain-of-thought.

## 8. Configuration schema

`config.yml` should support:

- repository metadata override;
- enabled workflows;
- report timezone and schedule;
- local/cloud/hybrid mode;
- model provider reference without credentials;
- output policies;
- Git write policy;
- sync allowlist/denylist;
- redaction rules;
- rule locations;
- supported-language adapters;
- artifact retention/archive preferences;
- comment publication policy.

Credentials must be referenced through environment variables or secure stores, never stored directly.

## 9. Validation library

Implement `packages/trace-schema` with:

- Zod schemas;
- generated JSON Schema outputs;
- parser for Markdown front matter;
- validator for a complete `.trace` directory;
- path validation;
- stable ID validation;
- unknown-field behavior;
- error format with path and remediation;
- serializer with deterministic key order where practical;
- checksum helper;
- migration interface, even if only v0.1 exists.

The library must work in CLI, worker, and web/server contexts without importing product database code.

## 10. Safe writer

Implement a filesystem writer that:

- writes only under a provided `.trace` root;
- rejects path traversal and symlink escape;
- uses atomic temp-file replacement;
- preserves human sections when the artifact type supports managed regions;
- detects concurrent modification through checksum or mtime;
- creates parent directories safely;
- never overwrites historical artifacts silently;
- supports dry run and diff preview.

## 11. Merge and conflict policy

Document and test:

- date-based report filenames;
- PR-number filenames;
- stable IDs for decisions/risks/debt;
- one primary writer per scheduled report;
- append/supersede behavior;
- index regeneration;
- handling of concurrent local/cloud edits;
- Git merge conflict recommendations.

## 12. Security rules

The specification must prohibit or discourage:

- secrets;
- credentials;
- personal data not required for project understanding;
- raw source duplication;
- raw prompts and conversations;
- executable content;
- large binaries;
- unsanitized external HTML;
- invisible instructions intended to manipulate agents.

Add redaction markers and sensitivity metadata.

## 13. Examples and fixtures

Create complete example artifacts for a fictional TypeScript repository.

Include:

- one daily report;
- one PR brief;
- one deterministic conflict;
- one uncertain semantic conflict;
- one accepted decision;
- one mitigated risk;
- one debt item;
- config and index.

Examples must validate and must not use real credentials or private URLs.

## 14. CLI validation entry point

Expose a temporary development command or package binary that can:

```bash
trace-schema validate <path>
trace-schema format <path> --check
trace-schema inspect <artifact>
```

The full TRACE CLI comes in Phase 07.

## 15. Documentation

Document:

- getting started;
- writing a compatible artifact;
- reading artifacts;
- extensions;
- security;
- versioning;
- migration;
- contribution/RFC process;
- relationship to Git, `AGENTS.md`, and ADRs;
- experimental status.

## Tests

Add:

- valid and invalid fixtures;
- property tests for IDs and paths where useful;
- path traversal tests;
- symlink escape tests;
- malformed front matter tests;
- unknown-field tests;
- round-trip serialization tests;
- atomic-write tests;
- concurrent modification tests;
- JSON Schema consistency tests;
- cross-platform path tests.

## Acceptance criteria

- A third party can understand and produce v0.1 artifacts from the specification alone.
- All examples validate.
- The schema package has no cloud/database dependency.
- Safe writes cannot escape `.trace`.
- Secrets are structurally excluded from configuration.
- Human-readable and machine-readable responsibilities are clear.
- Versioning and extension rules exist.
- The format supports cloud, local, and third-party generation.
- Implementation log is updated.

## Completion response

Return:

- specification tree;
- artifact type matrix;
- versioning decisions;
- validation commands and results;
- security tests;
- unresolved RFC questions for Phase 07.
