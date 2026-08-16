# TRACE

> **Git is the history of code. TRACE is the history of understanding.**

TRACE is a portable change-intelligence and engineering-governance system for human and AI software teams.

It connects the intent behind a change to its implementation, evidence, impact, decisions, risks, conflicts, and remaining work. Durable output lives in a versioned `.trace` directory that can be produced locally, in TRACE Cloud, or through a hybrid workflow.

TRACE is not intended to become another high-volume AI comment bot. Its focus is sparse, evidence-backed intelligence, concurrent-change coordination, and project knowledge that remains usable outside one vendor’s dashboard.

---

## Why TRACE?

AI coding tools allow developers and agents to create more changes in less time. Review capacity, coordination, and project understanding do not scale at the same speed.

Git records files, lines, authors, and timestamps. It rarely preserves a reliable answer to:

- Why was this change made?
- Which goal or requirement did it serve?
- Did the result match the stated intent?
- Which components and teams are affected?
- Does it conflict with other active work?
- What decision or risk did it introduce?
- What remains incomplete?

TRACE is designed to preserve and connect those answers.

---

## Core direction

TRACE is being designed around these principles:

- **Repository-native memory:** durable reports, decisions, risks, and change records remain portable inside `.trace`.
- **Concurrent-change intelligence:** TRACE evaluates active changes together, not only one pull request at a time.
- **Evidence before inference:** deterministic facts are collected before semantic AI analysis.
- **Local, cloud, and hybrid execution:** teams choose where source analysis occurs and what can synchronize.
- **Team-owned governance:** rules and reporting behavior are defined by each team.
- **High signal:** important, provable, actionable findings take priority over comment volume.
- **No developer scoring:** TRACE focuses on system health and coordination, not employee rankings.

---

## The `.trace` directory

`.trace` is the portable artifact layer shared by local and hosted execution.

A proposed structure:

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

Durable records use human-readable Markdown with structured metadata. Rebuildable state and indexes use JSON or YAML where appropriate.

Credentials, raw source duplication, large caches, private model conversations, and unnecessary sensitive data must not be stored in `.trace`.

---

## Execution modes

### TRACE Cloud

TRACE manages repository events, analysis jobs, reports, policies, and dashboard coordination. Source handling and retention must follow the project’s configured policy.

### TRACE Local Skill and CLI

Analysis runs in the user’s environment using the official CLI and optional Agent Skill. The user can choose their model provider or local model and create `.trace` artifacts without a required TRACE Cloud account.

### Hybrid

Analysis remains local or inside the customer’s CI/VPC. Only explicitly permitted artifacts or fields synchronize to the dashboard.

---

## Intended product surfaces

- Pull-request intelligence briefs
- Daily and weekly change reports
- Active-work conflict detection
- Decisions, risks, and technical-debt records
- Team rules and governance
- Evidence and provenance
- Local CLI and Agent Skill
- Central dashboard and selective synchronization

---

## Documentation

- [Nontechnical product overview](DOC/project-overview.md)
- [Technical overview](DOC/technical-overview.md)
- [TRACE design specification](Design-system/TRACE-DESIGN-SPEC.md)
- [Local-to-dashboard workflow](DOC/local-dashboard-workflow.md)
- [Implementation prompt roadmap](Implementation-Prompts/README.md)
- [Research library](Researchs/)

The implementation prompts are ordered execution documents intended for Codex or Claude Code. They cover repository foundation through production pilot readiness.

---

## Repository structure

```text
TRACE/
├── README.md
├── DOC/
│   ├── project-overview.md
│   └── technical-overview.md
├── Design-system/
│   ├── TRACE-DESIGN-SPEC.md
│   └── existing design references and tokens
├── Implementation-Prompts/
│   ├── README.md
│   └── 00–16 phased implementation prompts
└── Researchs/
    ├── Competitive Landscape/
    ├── Competitor Feature Matrix/
    ├── Real User Problems and Product Failures/
    ├── Repository Memory and Portable .trace Standard/
    └── Trace Product Strategy and Market Entry/
```

---

## Current status

TRACE is in active pilot implementation. Authentication, onboarding, GitHub App repository selection, local deterministic analysis, versioned `.trace` artifacts, explicit source-free synchronization, and data-backed dashboard projections now have executable local paths. Cloud source analysis remains disabled; the supported bridge analyzes locally and sends only policy-approved artifacts.

The staging Worker at `https://trace-test-staging.mathofdynamic2.workers.dev` serves hardening version `4817dae0-dd68-4e7b-9a7a-51ef00260882` on 100% of staging traffic; health, unauthenticated route boundaries, and the real CLI-to-dashboard path were verified after staging migrations `0004`–`0006` were applied. GitHub-backed freshness and transactional retry hardening are live in staging. Docker is not required for local development.

---

## License

The project license and contribution model have not yet been finalized. Do not assume the repository or future `.trace` specification is open source until an explicit license is added.
