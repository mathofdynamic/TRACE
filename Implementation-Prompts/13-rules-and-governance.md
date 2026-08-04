# Phase 13 — Rules and Governance

## Role

Act as a senior platform-governance engineer and enterprise product designer.

## Objective

Implement team-owned rules, policy scope, explainable evaluations, approvals, and safe overrides without turning TRACE into an opaque compliance engine.

Rules must work consistently in local, cloud, and hybrid modes.

## Required reading

Read the product rules principles, technical rule precedence, `.trace` rule specification, finding model, GitHub workflow, and sync policy implementation.

## 1. Rule model

Create rule types for:

- deterministic checks;
- natural-language review guidance;
- path/component rules;
- required evidence;
- PR publication policy;
- report policy;
- artifact write policy;
- sync/privacy policy;
- human-approval requirements.

Each rule must include:

- stable ID;
- title and purpose;
- scope;
- owner;
- status;
- severity;
- evaluator type;
- configuration;
- effective date;
- source and provenance;
- override policy;
- version history;
- test cases.

## 2. Scope and precedence

Implement explicit precedence:

1. mandatory organization policy;
2. organization default;
3. repository policy;
4. component/path policy;
5. workflow-specific rule;
6. user-request options.

Rules should merge predictably. A lower scope cannot silently disable a mandatory higher rule.

The effective rule set must be inspectable in CLI and dashboard.

## 3. Deterministic rule interface

Create a typed evaluator API that receives:

- change set;
- repository/component context;
- deterministic evidence;
- configured parameters.

It returns:

- pass/fail/needs_context/not_applicable;
- evidence;
- severity;
- remediation;
- evaluator version;
- runtime and errors.

Initial configurable rules may include:

- linked issue required;
- tests required for selected paths;
- review owner required;
- migration review required;
- protected component change;
- maximum PR size warning;
- dependency change review;
- `.trace` artifact validation;
- sync restrictions;
- no unresolved high-severity conflict before merge recommendation.

Do not duplicate security scanner rule libraries.

## 4. Natural-language guidance

Support Markdown guidance files that tell the semantic analyzer what to consider.

Requirements:

- clearly labeled non-deterministic behavior;
- bounded size;
- component scope;
- examples and counterexamples;
- prompt-injection treatment as untrusted policy content unless authorized;
- model output still requires evidence;
- no direct merge blocking from an uncompiled natural-language conclusion by default.

## 5. Rule files

Support repository-owned rules under `.trace/rules/`.

Define managed metadata and human-readable content.

Allow organization rules to be referenced or synchronized without embedding secrets.

Repository rule changes must themselves be analyzable and auditable.

## 6. Rule editor

Build a high-quality dashboard editor with:

- list and filters;
- scope selection;
- deterministic versus guidance distinction;
- form/editor appropriate to rule type;
- validation;
- example test cases;
- affected repositories/components preview;
- dry-run against historical PR fixtures or selected PRs;
- diff and version history;
- approval workflow;
- rollback;
- permission-aware controls.

Avoid an unstructured giant prompt textarea as the primary experience.

## 7. Rule testing

Implement a rule test harness.

Users should be able to define cases:

- input scenario/reference;
- expected result;
- expected severity;
- expected evidence class;
- acceptable uncertainty.

Before activating a rule, show:

- historical matches;
- likely finding volume;
- false-positive review sample;
- affected teams/repositories;
- model cost estimate for semantic guidance.

## 8. Approval workflow

Support statuses:

- draft;
- testing;
- proposed;
- approved;
- active;
- deprecated;
- archived.

Organization mandatory policies require authorized approvers.

Repository owners may manage local rules within organization constraints.

All approval and activation actions require audit events.

## 9. Overrides and suppressions

Support scoped override:

- one finding;
- one PR;
- one path/component;
- time-limited exception;
- repository exception;
- organization exception only for authorized roles.

Require:

- reason;
- actor;
- expiry where appropriate;
- linked issue/risk for significant exceptions;
- evidence;
- audit history.

Never turn one rejected AI finding into a global suppression automatically.

## 10. Enforcement behavior

Separate:

- informational finding;
- review recommendation;
- required human review;
- check warning;
- check failure from deterministic mandatory rule;
- publication suppression;
- artifact/sync rejection.

TRACE must not automatically merge or approve PRs.

Semantic guidance should generally inform human review rather than create hard failure unless explicitly backed by deterministic evidence and organization policy.

## 11. CLI

Add commands such as:

```text
trace rules list
trace rules explain <id>
trace rules validate
trace rules test <id> [--against <ref>]
trace rules effective [--path <path>]
trace rules diff
```

Local output must identify cloud-only or organization-managed rules and cached freshness.

## 12. GitHub integration

When policy permits:

- summarize failed mandatory rules in the managed PR check;
- link to evidence and rule definition;
- indicate override path;
- update after rule or head changes;
- avoid repeated comments.

Do not expose private organization policy text to unauthorized fork contributors.

## 13. Roles and permissions

Implement role capabilities for:

- organization owner;
- administrator;
- policy manager;
- repository manager;
- reviewer;
- member;
- read-only/auditor.

Enforce permissions server-side and in local sync tokens.

## 14. Governance analytics

Show team/system-level information:

- rule activation and version;
- finding count and disposition;
- false-positive/rejection rate;
- affected repositories;
- override count and expiry;
- evaluation failures;
- rule latency/cost;
- stale local rule cache.

Do not rank developers by violations.

## Tests

Add:

- precedence and merge tests;
- deterministic evaluator tests;
- natural-language evidence constraints;
- activation/approval permissions;
- override scope/expiry;
- local/cloud rule equivalence;
- fork visibility;
- historical dry-run;
- rule version rollback;
- GitHub check behavior;
- tenant isolation;
- UI keyboard and accessibility.

## Acceptance criteria

- Teams can define and own rules without editing code for normal cases.
- Deterministic and semantic rules are visibly different.
- Effective rule set is explainable.
- Rules can be tested before activation.
- Overrides are scoped, reasoned, expiring, and auditable.
- Mandatory policies cannot be silently bypassed.
- Semantic guidance does not create unjustified hard failures.
- Local and cloud evaluation remain compatible.
- No individual violation leaderboard exists.
- Implementation log is updated.

## Completion response

Return:

- rule type/precedence matrix;
- initial rule catalog;
- permission model;
- editor and test workflow;
- override lifecycle;
- evaluation and E2E results;
- security/privacy notes.
