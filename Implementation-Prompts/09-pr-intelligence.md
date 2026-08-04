# Phase 09 — Pull Request Intelligence

## Role

Act as a senior code-review systems engineer and product designer.

## Objective

Turn the analysis engine into a complete Pull Request intelligence workflow that produces a concise, evidence-backed brief for the dashboard, GitHub Checks, optional PR comments, and `.trace` artifacts.

The feature must reduce reviewer effort. It must not become another noisy comment bot.

## Required reading

Read the product definition, technical overview, `.trace` PR schema, design specification, completed analysis engine, GitHub integration, and current dashboard PR shell.

## 1. Trigger model

Support:

- PR opened;
- PR reopened;
- new commits pushed/synchronized;
- manual analysis request from dashboard;
- manual local CLI analysis;
- rereview after user disposition or rule change;
- merge completion for final artifact state.

Each trigger must use a stable idempotency key based on repository, PR number, head SHA, analysis profile, and schema version.

## 2. PR state collection

Collect and normalize:

- title and description;
- base/head refs and SHAs;
- commits;
- changed files;
- labels;
- author and reviewers;
- linked issues where detectable;
- checks and CI state;
- review state;
- CODEOWNERS;
- existing comments from TRACE only;
- prior TRACE analysis/dispositions;
- active related PRs.

Do not ingest unrelated conversation or organization data by default.

## 3. Intent and requirement linkage

Resolve intent in this order:

1. explicit linked issue/task;
2. PR description and structured sections;
3. commit metadata;
4. human-provided intent in TRACE;
5. model inference marked as inference.

The system must show when intent is missing or ambiguous.

Do not treat a vague title as reliable acceptance criteria.

## 4. PR brief content

Generate a validated PR brief containing:

- stated goal;
- semantic summary;
- implementation approach;
- affected components, APIs, schemas, and owners;
- requirement/acceptance-criteria coverage;
- deterministic findings;
- semantic findings;
- test and CI evidence;
- related decisions, risks, and debt;
- concurrent-change conflicts;
- incomplete or follow-up work;
- recommended reviewer attention;
- overall review state;
- evidence and provenance;
- analysis limitations.

Avoid a simplistic numeric quality score.

## 5. Review state

Use explicit states such as:

- `collecting`
- `analyzing`
- `needs_context`
- `needs_human_review`
- `changes_recommended`
- `no_material_findings`
- `outdated`
- `failed`
- `merged`

These are coordination states, not GitHub approval decisions.

TRACE must not automatically approve or merge PRs in the MVP.

## 6. Finding publication policy

Implement configurable delivery:

### Default

- one GitHub Check or summary surface;
- one concise top-level comment only when policy enables it;
- no inline comments for uncertain findings;
- maximum number of published findings;
- dashboard contains the full brief.

### Inline comments

Allowed only when:

- evidence points to a stable changed line;
- the finding is specific and actionable;
- severity meets policy;
- it is not a duplicate;
- confidence/classification meets policy;
- the line still exists at current head SHA.

### Silence

If there are no material findings, update the check/summary without adding congratulatory noise.

## 7. GitHub Check integration

If permissions support it, publish a TRACE check run containing:

- status/progress;
- concise conclusion;
- summary;
- annotations only for verified line-level findings;
- link to dashboard;
- current head SHA;
- rerun action if practical.

Map internal states carefully to GitHub check conclusions. Do not mark semantic uncertainty as a failed check unless an explicit rule requires it.

## 8. Comment lifecycle

TRACE comments must be identifiable and updateable.

Requirements:

- edit the existing summary comment for the same analysis lineage;
- avoid creating a new comment on every synchronization;
- show head SHA and updated time;
- collapse resolved/outdated findings;
- preserve user replies;
- never delete human comments;
- stop updating after app permission loss.

## 9. Human disposition

Implement dashboard and GitHub-linked disposition for findings:

- accept;
- reject;
- intentional design;
- resolved;
- needs clarification;
- suppress for this PR;
- propose scoped rule suppression.

Capture:

- actor;
- time;
- reason;
- scope;
- evidence state;
- analysis version.

Do not use rejection as global training data without consent and scope.

## 10. `.trace` artifact behavior

Create or update:

```text
.trace/pull-requests/<provider>-<number>.md
```

Rules:

- draft during active PR;
- update through explicit managed sections or new revisions;
- record head SHA;
- mark outdated when new commits arrive;
- mark merged/closed final state;
- preserve dispositions and provenance;
- never silently overwrite human-authored unmanaged content;
- use safe writer and validation.

Cloud mode may prepare a repository update rather than commit directly if content write permission is not enabled.

## 11. Dashboard integration

Replace PR fixtures with real data.

Implement:

- PR list with analysis state;
- detailed brief;
- evidence drawer;
- finding filters;
- deterministic/semantic distinction;
- analysis history;
- rerun action;
- disposition workflow;
- stale-head warning;
- source origin;
- raw artifact preview;
- GitHub deep links.

Do not show raw model prompts or chain-of-thought.

## 12. Local CLI integration

`trace pr` should support:

- local branch range;
- GitHub PR URL/number when credentials are available;
- offline deterministic mode;
- optional semantic analysis;
- dry-run artifact diff;
- write after confirmation;
- JSON output;
- no automatic GitHub comment unless explicitly requested.

## 13. Failure handling

Handle:

- PR too large;
- unsupported binary-heavy PR;
- missing base commit;
- force push;
- deleted branch;
- draft PR;
- fork PR with limited permissions;
- rate limiting;
- model unavailable;
- partial parser coverage;
- failed CI data fetch;
- malicious PR text;
- new commit during analysis.

Partial results must state limitations rather than appear complete.

## 14. Metrics

Track product-quality metrics:

- time to brief;
- context volume;
- number of findings generated/published;
- acceptance/rejection/intentional rates;
- duplicate suppression;
- stale analysis count;
- user-opened evidence rate;
- actions taken from findings.

Do not create individual developer performance metrics.

## Tests

Add fixtures and tests for:

- normal PR;
- no linked intent;
- updated head during analysis;
- duplicate webhook;
- large PR degradation;
- fork PR;
- deterministic line annotation;
- uncertain semantic finding not published inline;
- existing comment update;
- finding disposition;
- artifact preservation;
- permission loss;
- prompt injection in PR description;
- dashboard and CLI flows.

## Acceptance criteria

- One PR produces one coherent, evidence-backed intelligence brief.
- GitHub output is concise and updateable.
- No automatic approval or merge occurs.
- Uncertain findings are clearly labeled and not over-published.
- Stale analysis is never shown as current.
- Human dispositions persist and remain auditable.
- `.trace` PR artifacts validate and preserve human content.
- Dashboard uses real data.
- Local and cloud outputs remain compatible.
- Implementation log is updated.

## Completion response

Return:

- trigger and state diagrams;
- sample PR brief;
- publication policy defaults;
- GitHub permission changes if any;
- disposition model;
- test results;
- measured finding volume on fixtures.
