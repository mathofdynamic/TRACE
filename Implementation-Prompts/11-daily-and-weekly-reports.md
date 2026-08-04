# Phase 11 — Daily and Weekly Reports

## Role

Act as a senior engineering-intelligence product designer and reporting-systems engineer.

## Objective

Implement concise, evidence-backed daily and weekly reports that explain meaningful project change without reproducing Git logs or creating employee-surveillance summaries.

Reports must be useful in local, cloud, and hybrid modes and must produce valid `.trace` artifacts.

## Required reading

Read the report requirements in the product and technical overviews, the v0.1 report schemas, analysis engine output, conflict lifecycle, and current report-reader UI.

## 1. Report windows

Support:

- calendar-day reports in a configured repository timezone;
- explicit rolling 24-hour reports;
- weekly reports with configured week start;
- manual custom ranges for preview only;
- no empty scheduled artifact when no material changes exist unless policy requests a no-change record.

Persist exact UTC start/end and display timezone separately.

Handle daylight-saving transitions correctly.

## 2. Material-change selection

Create a deterministic selection stage that determines what belongs in a report.

Potential inputs:

- merged and active PRs;
- direct branch commits;
- changed components and public contracts;
- new or resolved conflicts;
- decisions, risks, and debt movement;
- CI or release state when available;
- work marked incomplete;
- relevant human dispositions.

Exclude or collapse:

- merge-only noise;
- bot-only dependency updates unless material;
- formatting-only changes;
- repeated unchanged findings;
- raw commit lists already linked elsewhere.

Record why each item was included or excluded.

## 3. Daily report structure

Produce:

- executive summary in plain language;
- meaningful changes grouped by outcome/component;
- goals and issues advanced;
- active and resolved conflicts;
- decisions created, changed, or superseded;
- risks introduced, changed, mitigated, or resolved;
- incomplete and follow-up work;
- affected teams/components;
- recommended attention for the next working period;
- evidence and limitations;
- generation and review provenance.

The report must answer what changed, why, result, impact, and next action where evidence exists.

Unknown intent must be stated as unknown.

## 4. Weekly report structure

Emphasize coordination and trend:

- outcomes completed or materially advanced;
- major active work;
- requirement progress;
- repeated friction or rule failures;
- conflict and dependency movement;
- decisions, risks, and debt movement;
- blocked or stale work;
- upcoming sequencing needs;
- recommended team-level actions.

Do not include individual rankings, activity scores, or “top contributor” sections.

## 5. Narrative generation

Use a two-stage approach:

1. deterministic report outline and evidence groups;
2. optional semantic synthesis into concise narrative.

Requirements:

- schema-validated output;
- every claim connected to evidence groups;
- facts and inference distinguished;
- no invented motivation;
- no emotionally evaluative language about people;
- strict maximum lengths by section;
- stable regeneration behavior;
- unsupported claims removed during verification.

## 6. Role-specific views

The durable artifact should contain one authoritative report.

The dashboard may render role-focused projections:

### Developer/technical lead

- affected code and dependencies;
- conflicts;
- missing evidence;
- concrete next actions.

### Team/manager

- outcomes;
- coordination;
- risk and decision movement;
- blockers;
- attention required.

Do not create separate conflicting facts for each role.

## 7. Scheduling

Use pg-boss schedules or equivalent existing job infrastructure.

Requirements:

- repository timezone;
- idempotent report key;
- one canonical report per window;
- late event reconciliation;
- retry and failed-job visibility;
- skip when repository is disconnected;
- policy-controlled local/cloud execution;
- manual rerun creates revision metadata, not duplicate canonical files.

## 8. Local CLI

Support:

```text
trace report daily
trace report daily --date YYYY-MM-DD
trace report weekly
trace report daily --dry-run
trace report daily --with-ai
trace report daily --format json
```

Show artifact diff before write unless configured for trusted automation.

## 9. Cloud delivery

Support optional delivery to:

- TRACE dashboard;
- repository `.trace` update proposal;
- email or Slack only as future adapters, not required in this phase.

Do not send reports to external channels by default.

## 10. Artifact lifecycle

Paths should follow the approved specification.

Requirements:

- stable report ID;
- revision metadata;
- source window;
- included source refs;
- checksum;
- human review status;
- late-event amendment;
- supersession without silent historical rewrite;
- size limit and link-out behavior.

## 11. Dashboard

Replace report fixtures with real data.

Implement:

- report calendar/timeline;
- daily/weekly filters;
- report reader;
- evidence drawer;
- revision history;
- reviewed/unreviewed state;
- local/cloud origin;
- raw artifact and repository link;
- missing report explanation;
- schedule and timezone settings;
- generated-late or incomplete-data warning.

## 12. Readership and action signals

Track system-level product usage:

- report opened;
- key section expanded;
- evidence opened;
- action acknowledged;
- report marked useful/not useful with optional reason;
- report exported.

Do not use these signals to evaluate individual employee performance.

## 13. Evaluation fixtures

Create multi-day fixture histories with:

- normal feature development;
- no-change day;
- direct commits outside PR;
- conflicting PRs;
- decision supersession;
- risk mitigation;
- incomplete work;
- missing intent;
- timezone boundary;
- late webhook;
- bot dependency update;
- semantic hallucination attempt.

Evaluate factual correctness, evidence coverage, concision, and duplicate content.

## Tests

Add:

- report-window tests;
- DST/timezone tests;
- materiality filter tests;
- idempotent scheduling;
- late-event revision;
- no-change behavior;
- narrative evidence validation;
- artifact round trip;
- local/cloud compatibility;
- dashboard reader;
- authorization;
- source-disconnection behavior;
- report size limits.

## Acceptance criteria

- Reports explain meaningful project change rather than list commits.
- “Why” is present only when supported.
- Reports distinguish facts, inference, and missing context.
- Daily and weekly artifacts validate and remain portable.
- Scheduling is timezone-safe and idempotent.
- Late data creates a visible revision.
- Dashboard uses real reports.
- No individual performance scoring appears.
- Local and cloud generation produce equivalent artifact structure.
- Implementation log is updated.

## Completion response

Return:

- scheduling model;
- report section contracts;
- example daily and weekly artifacts;
- evaluation results;
- average length/context/cost on fixtures;
- known gaps before hybrid synchronization.
