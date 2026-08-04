# Phase 10 — Concurrent-Change Conflict Detection

## Role

Act as a senior software-analysis engineer and coordination-systems designer.

## Objective

Implement TRACE’s primary differentiator: detection and explanation of conflicts between active changes that may be individually valid but collectively incompatible.

The system must combine deterministic overlap with carefully bounded semantic reasoning.

## Required reading

Read the technical conflict model, PR intelligence contracts, graph/index code, `.trace` conflict schema, and current dashboard conflict shell.

## 1. Conflict domain model

Create a shared conflict model containing:

- stable conflict ID;
- repositories and changes involved;
- conflict type;
- affected components/symbols/surfaces;
- deterministic evidence;
- semantic evidence;
- severity;
- classification and confidence;
- first detected and last evaluated times;
- current head SHAs;
- owner/coordination group;
- required ordering or decision;
- status;
- resolution;
- provenance;
- linked `.trace` artifact.

A conflict is an entity with a lifecycle, not a disposable warning.

## 2. Active-change set

Build a reliable active-change index from:

- open GitHub PRs;
- configured local branches where available;
- draft PRs according to policy;
- queued or pending changes represented in TRACE;
- cross-repository changes only when explicitly configured and authorized.

Refresh the index on PR events, push events, manual runs, and scheduled reconciliation.

## 3. Deterministic detectors

Implement separate detectors for:

### File overlap

- same file changed;
- rename/delete interactions;
- file moved while another PR modifies old path.

### Symbol overlap

- same exported symbol;
- same function/class/method;
- one PR removes or renames a symbol another uses.

### API and contract overlap

- route or public API signature changes;
- shared type/interface changes;
- event/message contract changes;
- generated client/server contract mismatch.

### Database and migration overlap

- same table/column/index;
- competing migration order;
- destructive migration combined with dependent code;
- duplicate migration identifiers;
- incompatible schema assumptions.

### Dependency overlap

- incompatible package version changes;
- dependency removal while another PR introduces usage;
- lockfile conflicts summarized through manifest changes.

### Configuration and infrastructure overlap

- same environment variable changed differently;
- shared feature flag;
- deployment/configuration sequence conflict;
- permission or policy change affecting another PR.

Each detector must emit typed evidence and avoid semantic conclusions beyond its facts.

## 4. Related-change candidate selection

Do not compare every PR with every other PR using an LLM.

Create deterministic candidate selection based on:

- shared files or symbols;
- dependency relationships;
- same component;
- same linked issue/initiative;
- API/schema relationships;
- close time window;
- explicit cross-repo mapping.

Record why each pair was selected.

## 5. Semantic conflict analysis

For selected candidates, analyze possible conceptual conflicts such as:

- duplicate implementations of the same goal;
- contradictory acceptance criteria;
- incompatible architectural decisions;
- conflicting authorization/security models;
- different data models for the same concept;
- sequencing assumptions;
- one change invalidating another’s goal;
- overlapping temporary workarounds;
- contradictory `.trace` decisions or rules.

The model must receive bounded evidence for both changes and relevant project memory.

Output must include:

- conflict hypothesis;
- supporting evidence from each change;
- missing context;
- confidence;
- coordination question;
- recommended next action.

The model must be allowed to conclude that no conceptual conflict exists.

## 6. Severity model

Define severity from impact and urgency, not model confidence.

Example dimensions:

- likely merge/build failure;
- data-loss or migration risk;
- public API break;
- security-policy contradiction;
- duplicate work cost;
- release sequencing;
- localized maintainability concern.

Keep confidence/classification separate from severity.

A high-impact but uncertain conflict should be labeled “high potential impact, needs confirmation,” not silently downgraded or presented as fact.

## 7. Conflict lifecycle

Statuses should include:

- detected;
- needs_confirmation;
- acknowledged;
- coordinating;
- sequencing_defined;
- false_positive;
- resolved;
- superseded;
- stale.

Reevaluate when:

- either PR head changes;
- linked issue changes;
- decision/rule changes;
- PR closes or merges;
- user changes disposition.

Preserve history.

## 8. Resolution workflow

Users should be able to:

- confirm or reject conflict;
- assign coordination owner;
- select merge/release order;
- link a decision;
- add resolution note;
- mark one change superseded;
- request analysis rerun;
- create a scoped suppression.

Do not provide an automatic merge-order decision without human approval.

## 9. `.trace` artifacts

Write validated conflict artifacts under a stable path, for example:

```text
.trace/conflicts/CONFLICT-2026-0001.md
```

Include:

- involved source refs;
- current SHA snapshot;
- evidence;
- lifecycle history;
- resolution;
- supersession;
- human disposition;
- generator provenance.

Conflict artifacts should remain useful after PRs close.

## 10. Dashboard

Replace conflict fixtures with real data.

Implement:

- conflict queue;
- filters by severity, status, component, repository, and classification;
- detail view with side-by-side change summaries;
- evidence graph/list;
- timeline;
- coordination controls;
- stale state;
- raw artifact;
- deep links to involved PRs;
- clear distinction between deterministic and semantic evidence.

Avoid a visually dramatic “AI detected danger” treatment. Use controlled operational clarity.

## 11. PR integration

Each PR brief should show:

- number of active conflicts;
- highest relevant severity;
- concise conflict explanation;
- coordination owner/status;
- link to conflict detail.

Do not spam both PRs with repeated comments on every analysis. Update one managed summary where policy permits.

## 12. Cross-repository boundaries

Cross-repository analysis is optional and must require:

- repositories within the same authorized organization scope;
- explicit dependency or component mapping;
- compatible privacy/sync policy;
- clear indication when evidence is unavailable due to permissions.

Never infer access to repositories the installation cannot read.

## 13. Evaluation dataset

Create realistic fixture scenarios:

- same file but nonconflicting changes;
- direct same-symbol conflict;
- migration order conflict;
- API producer/consumer mismatch;
- duplicate feature implementation;
- contradictory auth model;
- dependency removal/use conflict;
- intentionally parallel compatible work;
- cross-repo contract change;
- malicious text attempting to fabricate conflict.

Label expected deterministic signals and expected human judgment.

## 14. Metrics

Track:

- conflicts detected;
- deterministic versus semantic;
- confirmed, rejected, and stale rates;
- time from detection to acknowledgement;
- conflicts resolved before merge;
- duplicate-work cases;
- semantic false-positive rate;
- number of candidate pairs analyzed;
- model cost per confirmed conflict.

Do not attribute conflicts as performance failures to individuals.

## Tests

Add:

- detector unit tests;
- candidate-selection tests;
- head-change invalidation;
- lifecycle transitions;
- cross-tenant and cross-permission isolation;
- semantic evidence validation;
- duplicate conflict prevention;
- resolution persistence;
- artifact validation;
- dashboard flows;
- PR summary update behavior;
- large active-PR set performance tests.

## Performance constraints

- deterministic candidate generation must scale without all-pairs semantic calls;
- cache affected graphs by SHA;
- cancel obsolete analysis when new heads arrive;
- cap semantic candidates per change and expose truncation;
- schedule low-priority reconciliation separately.

## Acceptance criteria

- TRACE detects direct overlaps accurately.
- It can explain at least the curated conceptual-conflict scenarios with cited evidence.
- Compatible parallel work is not automatically labeled conflicting.
- Severity and confidence remain separate.
- Users can confirm, reject, assign, sequence, and resolve conflicts.
- Stale conflicts are not shown as current.
- Conflict artifacts validate and remain portable.
- Cross-repository access follows explicit permissions.
- Dashboard and PR views use real data.
- Evaluation metrics are recorded.
- Implementation log is updated.

## Completion response

Return:

- detector matrix;
- candidate-selection strategy;
- lifecycle diagram;
- evaluation results including false positives;
- performance measurements;
- sample conflict artifact;
- unresolved limits before reporting phases.
