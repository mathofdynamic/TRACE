# Phase 08 — Change Analysis Engine

## Role

Act as a senior static-analysis and AI-systems engineer.

## Objective

Implement the shared analysis engine that converts a normalized change set into deterministic repository context, selected evidence, structured semantic analysis, and validated findings.

The engine must work in both the local CLI and cloud worker.

## Required reading

Read the technical overview sections on evidence, analysis stages, codebase understanding, security, and model providers. Read the `.trace` schemas and Phase 07 contracts.

## Scope

Full symbol-level support in this phase is limited to TypeScript and JavaScript.

Other languages must use file-level metadata and clearly report reduced analysis precision.

## 1. Pipeline architecture

Implement explicit stages:

1. normalize request;
2. construct change set;
3. inspect repository;
4. parse supported code;
5. build affected-symbol graph;
6. collect rules and historical artifacts;
7. select bounded context;
8. run deterministic checks;
9. run optional semantic analysis;
10. verify and deduplicate findings;
11. return structured analysis result.

Each stage must have typed input/output, timing, cancellation, and error classification.

## 2. Repository workspace

Create a workspace abstraction for local and cloud execution.

Requirements:

- read-only analysis by default;
- explicit root path;
- path containment checks;
- symlink handling;
- file-size limits;
- binary detection;
- ignored-path configuration;
- generated/vendor directory exclusion;
- cancellation and timeout support;
- no arbitrary project command execution.

## 3. TypeScript/JavaScript parser adapter

Use the TypeScript compiler API or an equivalent well-maintained structural parser.

Extract:

- modules/files;
- imports and exports;
- functions;
- classes;
- interfaces and types;
- methods;
- public signatures;
- call/import relationships where reliable;
- test files;
- configuration files;
- package boundaries;
- API route patterns where detectable;
- database/schema/migration files through configurable conventions.

Do not claim complete data-flow or call-graph precision.

## 4. Affected graph

Build a bounded graph around changed files and symbols.

Nodes may include:

- file;
- symbol;
- package;
- component;
- test;
- API/schema surface;
- rule;
- decision/risk artifact.

Edges should record relationship type and confidence.

The graph must be serializable, cacheable, and reusable by conflict detection.

## 5. Incremental indexing

Create a content-addressed cache keyed by relevant repository state.

Requirements:

- invalidate changed files;
- rebuild affected relationships;
- avoid committing large indexes to `.trace` by default;
- allow local cache outside the repository;
- no cache sharing across tenants without isolation;
- cache metadata must identify parser version;
- provide a full-rebuild command/path.

## 6. Deterministic context collection

Collect:

- commit/PR metadata;
- changed symbols;
- direct dependents and dependencies;
- tests connected by convention or imports;
- package/dependency changes;
- migration/schema changes;
- CODEOWNERS;
- project rules;
- linked `.trace` decisions, risks, debt, and previous findings;
- CI/check evidence when supplied;
- issue/goal text when supplied.

## 7. Context selection

Implement a bounded selector with configurable budgets.

The selector must:

- rank evidence by direct relevance;
- prefer changed symbols and immediate dependencies;
- include applicable rules and decisions;
- include linked goals before broad repository text;
- exclude secrets, binaries, minified files, lockfile content except summarized dependency changes, and irrelevant generated code;
- record why each context item was selected;
- expose truncation and missing-context warnings.

Do not solve context limits by blindly sending the entire repository.

## 8. Deterministic checks

Implement an extensible check interface and initial checks for:

- changed production code without related tests;
- failed or missing CI evidence;
- public export/signature change;
- dependency change;
- migration or schema change;
- protected component modification;
- missing linked goal/issue where policy requires it;
- stale analysis due to head SHA change;
- invalid `.trace` artifacts;
- direct open-PR file/symbol overlap when active PR data is supplied.

Every result must identify rule/check ID and evidence.

## 9. Model-provider layer

Implement `packages/trace-models` with:

- provider registry;
- provider-neutral request type;
- structured output through validated schemas;
- timeouts;
- bounded retries;
- token/cost accounting where providers expose it;
- cancellation;
- safe error mapping;
- BYOK support;
- local/OpenAI-compatible endpoint support if feasible;
- explicit data-policy metadata.

Never write keys to logs or artifacts.

## 10. Semantic analysis contract

Create a structured model task that may return:

- semantic change summary;
- inferred intent with confidence and evidence;
- goal alignment assessment;
- affected behavior/components;
- possible incomplete work;
- possible decision/risk/debt updates;
- conceptual conflict candidates;
- questions requiring human clarification.

The schema must prohibit uncited high-severity claims.

The system prompt must treat repository content as untrusted data, not instructions.

## 11. Verification and deduplication

Before returning findings:

- ensure evidence references resolve;
- reject fabricated paths or symbols;
- merge duplicate findings;
- separate deterministic and semantic results;
- downgrade unsupported certainty;
- cap findings by severity and policy;
- suppress style-only output by default;
- apply prior disposition/suppression only within valid scope;
- mark stale findings when base/head changes.

## 12. Analysis result

Return a shared result containing:

- analysis ID;
- input refs;
- parser coverage;
- deterministic facts;
- selected context manifest;
- findings;
- summary;
- conflicts candidates;
- proposed artifact updates;
- costs/timing;
- warnings;
- provenance.

The result must be serializable and consumable by CLI, worker, and UI.

## 13. CLI integration

Upgrade local commands so users can:

```text
trace analyze changes
trace report daily --with-ai
trace pr <number-or-local-range> --with-ai
```

AI use must be explicit or configured. Dry-run and JSON output remain supported.

## 14. Cloud worker integration

Register analysis jobs without publishing comments or committing artifacts yet.

Persist:

- run metadata;
- status;
- findings;
- selected evidence references;
- safe cost/timing data;
- artifact draft.

Do not persist raw source snippets longer than required by configured retention.

## Security tests

Test:

- prompt injection in source comments, issues, and `.trace` files;
- fabricated model evidence;
- path traversal;
- symlink escape;
- oversized files;
- secret-pattern exclusion;
- malicious Markdown;
- timeout and cancellation;
- provider failure;
- cross-tenant cache isolation.

## Quality evaluation fixtures

Create curated repositories/diffs covering:

- simple feature;
- refactor with no behavior change;
- API breaking change;
- migration;
- missing tests;
- intentional unusual design;
- malicious prompt injection;
- unsupported language fallback.

Expected findings must be reviewable and not overly brittle to wording.

## Acceptance criteria

- Local and cloud paths use the same engine.
- TypeScript/JavaScript changes receive symbol-level context.
- Unsupported languages are labeled accurately.
- Deterministic checks work without a model.
- Model output is schema validated and evidence checked.
- Prompt injection does not control the analysis process.
- Context selection is bounded and explainable.
- Findings are deduplicated and classification is preserved.
- No comments or repository writes are automatically published yet.
- Tests and implementation log are complete.

## Completion response

Return:

- pipeline diagram;
- parser coverage;
- deterministic check list;
- model contract;
- security evaluation results;
- cost/context measurements on fixtures;
- known limitations before PR publishing.
