# Phase 15 — Testing, Evaluation, and Quality Gates

## Role

Act as the principal quality engineer for TRACE.

## Objective

Build the full verification system needed to trust the MVP: unit, integration, contract, browser, security, analysis-quality, performance, and release gates.

This phase must identify and fix weak behavior. It is not a documentation-only test pass.

## Required reading

Read every completed implementation log entry, all acceptance criteria from Phases 00–14, the threat model, the `.trace` specification, and current CI configuration.

## 1. Test taxonomy

Document and enforce these layers:

- unit tests;
- database integration tests;
- contract/schema tests;
- GitHub webhook and API boundary tests;
- worker/job tests;
- CLI end-to-end tests;
- browser end-to-end tests;
- accessibility tests;
- visual-regression tests;
- security tests;
- analysis-quality evaluations;
- performance and load tests;
- migration tests;
- disaster/recovery drills appropriate to MVP.

Every test must have an owner package and predictable command.

## 2. CI workflow

Create CI workflows for pull requests and protected branches.

The normal PR gate should include:

- dependency install with frozen lockfile;
- formatting check;
- lint;
- typecheck;
- unit tests;
- schema/spec tests;
- database migration test from empty database;
- integration tests;
- web build;
- worker/CLI builds;
- browser smoke tests;
- secret scan;
- dependency/security scan;
- artifact upload for failure diagnostics without secrets.

Run expensive analysis-quality, visual, load, and full security suites on scheduled, labeled, or main-branch workflows according to cost.

## 3. Determinism and isolation

Tests must:

- avoid order dependence;
- create isolated database state;
- isolate tenants;
- use fixed clocks/timezones where needed;
- avoid real model calls in ordinary CI;
- avoid real GitHub writes;
- avoid external network dependence;
- seed explicit fixtures;
- clean temporary repositories and workspaces;
- support parallel execution safely.

Use record/replay only when sanitized and stable.

## 4. Model test strategy

Create three levels:

### Schema and orchestration tests

Use deterministic fake providers to test:

- retries;
- invalid structured output;
- timeouts;
- evidence validation;
- provider failure;
- cost accounting;
- cancellation.

### Golden evaluation set

Use curated PR/change fixtures with expected semantic concepts, not exact prose.

Score:

- evidence correctness;
- factuality;
- finding precision;
- required issue recall;
- duplicate rate;
- uncertainty calibration;
- unsupported claim rate;
- concision;
- conflict accuracy.

### Limited live-provider evaluation

Run only with explicit credentials and budget.

Compare approved providers/models on the same fixtures. Store evaluation results, not private prompts or chain-of-thought.

Do not make model-specific output wording a unit-test dependency.

## 5. Analysis quality gates

Define pilot thresholds for:

- zero fabricated file/symbol references in curated tests;
- maximum unsupported high-severity claim rate;
- maximum published findings per PR by default;
- deterministic detector precision;
- conflict false-positive rate on curated compatible scenarios;
- report evidence coverage;
- no missing stale-analysis warnings;
- no individual-performance output.

If thresholds fail, block release or disable the affected feature by default.

## 6. GitHub integration tests

Cover:

- every subscribed event/action;
- signature validation;
- duplicate delivery;
- out-of-order events;
- permission changes;
- repository transfer/rename;
- fork PR;
- force push;
- rate limiting;
- installation suspension/uninstall;
- comment/check update lifecycle;
- idempotency after retries.

Use sanitized official-shape fixtures and mock server boundaries.

## 7. `.trace` compatibility suite

Create a standalone compatibility test suite that third-party writers can eventually run.

It should validate:

- all artifact types;
- front matter and Markdown safety;
- version behavior;
- extensions;
- invalid paths;
- merge/supersession rules;
- local/cloud round trip;
- deterministic serialization;
- migration framework;
- security exclusions.

Publish fixtures and expected results in `spec/`.

## 8. CLI tests

Test packaged CLI behavior, not only internal functions:

- install/build;
- help/version;
- initialization;
- status;
- validation;
- changes;
- reports;
- PR analysis;
- rules;
- sync;
- doctor;
- JSON output;
- exit codes;
- offline mode;
- no-network guarantee;
- interruption/lock recovery;
- Windows, macOS, and Linux CI where practical.

## 9. Browser and visual tests

Cover critical user journeys:

- sign in/out;
- onboarding;
- GitHub connection with mocked boundary;
- repository selection;
- dashboard navigation;
- PR brief review;
- evidence drawer;
- conflict resolution;
- report reading;
- rule editing/testing;
- sync policy and token management;
- error/recovery states.

Capture visual regressions for:

- application shell;
- primary button;
- tables;
- report reader;
- PR brief;
- conflict view;
- dialogs/drawers;
- desktop/tablet/mobile;
- reduced motion;
- high text zoom where practical.

Visual tests must use stable fonts/environment and meaningful thresholds.

## 10. Accessibility audit

Automate and manually verify:

- keyboard-only navigation;
- focus order;
- focus trapping and restoration;
- screen-reader labels;
- semantic landmarks;
- table navigation;
- status announcements;
- contrast;
- zoom/reflow;
- reduced motion;
- no color-only severity;
- mobile touch targets.

Fix critical accessibility violations before release.

## 11. Performance tests

Define budgets for:

### Web

- route response and rendering;
- JavaScript size;
- dashboard interaction;
- large table rendering;
- report rendering;
- search latency;
- no major layout shift.

### API/webhooks

- quick webhook acknowledgement;
- ingestion throughput;
- sync upload;
- rate-limit behavior.

### Worker

- queue delay;
- repository checkout/indexing;
- incremental analysis;
- cancellation;
- large PR degradation;
- active-PR conflict candidate scaling.

### CLI

- startup;
- status/validate;
- local change collection;
- memory on large diffs.

Create realistic but bounded load fixtures.

## 12. Migration and backup tests

Verify:

- empty database migration;
- upgrade from prior migration snapshots;
- rollback plan or forward-fix policy;
- migration transaction behavior;
- backup restore into isolated environment;
- artifact projection rebuild;
- queue recovery after restart;
- no tenant data mixing.

## 13. Failure injection

Test:

- database unavailable;
- queue unavailable/restart;
- GitHub rate limit;
- model timeout;
- object storage failure;
- worker termination;
- duplicate jobs;
- stale PR head;
- sync interruption;
- malformed artifact;
- partial repository permission;
- clock/timezone edge cases.

The product should degrade visibly and recover safely.

## 14. Observability validation

Ensure logs, metrics, and traces allow an operator to diagnose:

- webhook delivery to job;
- job to analysis;
- analysis to artifact;
- artifact to dashboard/sync;
- failures and retries;
- cost and latency;
- security-relevant actions.

Verify secret and source-code redaction in telemetry.

## 15. Release checklist

Create `DOC/release-checklist.md` covering:

- migrations;
- tests;
- security;
- accessibility;
- design review;
- specification compatibility;
- environment validation;
- data retention;
- incident readiness;
- rollback;
- release notes;
- known limitations;
- feature flags;
- owner approval.

## Acceptance criteria

- CI reliably blocks regressions.
- Curated analysis evaluation meets documented pilot thresholds or affected features remain disabled.
- `.trace` compatibility suite passes.
- Critical user journeys pass in browser tests.
- Accessibility and visual quality gates pass.
- Security and tenant isolation tests pass.
- Performance budgets are measured and documented.
- Backup/restore and failure recovery are exercised.
- No tests depend on real production credentials.
- Release checklist and implementation log are complete.

## Completion response

Return:

- full test matrix;
- CI workflow map;
- coverage and quality metrics;
- analysis evaluation scores;
- accessibility results;
- performance results;
- unresolved release blockers;
- features disabled due to insufficient quality.
