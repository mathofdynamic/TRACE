# TRACE

> **Git is the history of code. TRACE is the history of understanding.**

TRACE is an intelligent, portable system for reviewing, recording, and managing software project changes. It turns the raw output of developers and AI coding agents — commits, pull requests, and daily diffs — into clear, actionable, and auditable knowledge that lives **inside** your repository.

Whether analysis runs in the cloud, fully local, or in a hybrid mode, every important output is stored in a standardized, open `.trace` directory so your team's knowledge never gets lost in the noise of Git history.

---

## Why TRACE?

AI has dramatically increased the speed of code generation. A single developer now ships more code in less time, and coding agents can work across many parts of a project simultaneously. As a result, the number of commits, pull requests, and daily changes keeps growing — but the capacity of senior engineers and managers to review, understand, and document those changes does not.

Git tells you *what* changed (which files and lines). It rarely tells you:

- *Why* the change was made
- *What goal* it was meant to achieve
- *What impact* it has on the rest of the project
- *What risks* it introduces
- *What decision* it encodes
- *What work* is still left to do

**TRACE bridges that gap.**

---

## What TRACE Does

TRACE continuously reviews project changes against the rules and expectations defined by each team — not a fixed set of rules for everyone. It evaluates:

- The stated goal of a change and whether the result matches it
- Whether team standards were followed
- Which parts of the project are affected
- Whether a change conflicts or interferes with other work
- Whether work is complete or incomplete
- Whether a human review is needed, and who should do it
- Whether an important decision was made that should be recorded

The output is a set of human-readable reports and structured metadata that lives in a standard `.trace` folder at the root of the repository.

---

## The `.trace` Directory

`.trace` is the canonical, portable, and inspectable home for all meaningful TRACE output — no matter where the analysis ran.

```text
.trace/
├── config.yml
├── rules/
├── reports/
│   └── 2026/
│       ├── August/
│       │   ├── 2026-08-03.md
│       │   └── 2026-08-04.md
│       └── September/
├── pull-requests/
├── decisions/
├── risks/
└── index.json
```

### What lives in `.trace`

- Daily reports
- Pull request summaries
- Code review results
- Identified risks
- Important project decisions
- Team rules and standards
- Links between changes, issues, and tasks
- Incomplete work
- Conflict warnings
- Dashboard display data

### What must **never** live in `.trace`

- API keys, passwords, tokens, or credentials
- Temporary files or large caches
- Cloud-service internals
- Unnecessary confidential data
- Anything that doesn't help understand or review the project

`.trace` stays **portable, readable, and secure**.

---

## Modes of Operation

TRACE can run in three ways, and can even combine them.

### 1. TRACE Cloud
Connect your repository to the TRACE service. The cloud handles change review, commit and PR analysis, team-rule enforcement, daily reports, risk and conflict detection, PR comments, dashboard management, and `.trace` file updates. Best for teams that want the review pipeline fully automated.

### 2. TRACE Skill (Local)
Add the TRACE Skill to your project and run it with coding agents and tools like Claude Code, Codex, or Cursor. Your code never leaves your environment, analysis runs with your own models and infrastructure, and output is written into `.trace` locally. Best for personal, private, or highly sensitive projects.

### 3. Hybrid
Analysis runs locally, but selected `.trace` outputs sync to the TRACE dashboard for central management. Best for organizations that need both privacy and a centralized management view across many teams or projects.

---

## The TRACE Dashboard

The dashboard is a presentation and coordination layer, not the source of truth — the `.trace` directory always is. It surfaces:

- Recent project changes and daily reports
- Reviewed pull requests
- Key risks and high-risk changes
- Recorded decisions
- Conflicts between team members or agents
- Incomplete work and overall project health
- Per-section and per-person activity
- Change trends over time

---

## Outputs for Every Role

| Audience | What TRACE surfaces |
|---|---|
| **Developer** | What was done, what works, what risks remain, which standards were missed, what to fix next, whether the result matches the goal |
| **Team** | What happened in each area, who worked on what, decisions taken, complete/incomplete work, cross-change conflicts, coordination needs |
| **Manager / Tech Lead** | Changes over a period, goals vs. real results, high-risk changes, repeated problems, rule compliance, overall progress and health — without reading every commit and PR manually |

---

## Pull Request Interaction

TRACE can review pull requests and, when warranted, produce a summary, explain the change's goal, flag likely problems, suggest corrections, ask clarifying questions, detect conflicts with other PRs, propose the right reviewer, comment on the PR, and store the final report in `.trace`. It deliberately avoids noisy comments on trivial changes — only **important, provable, and actionable** issues get surfaced.

---

## What TRACE Is Not

- Not a code generator
- Not just a bug-finding bot
- Not only a pull-request summarizer
- Not a way to score developers by commit count, code volume, or PR count

TRACE focuses on change **quality**, project **health**, team **coordination**, decision **preservation**, risk **reduction**, management **visibility**, and project **knowledge retention**.

---

## Why TRACE Is Different From Git

| | Git | TRACE |
|---|---|---|
| **What** | Files and lines changed | What actually happened |
| **Why** | — | Why the change was made |
| **Goal** | — | What the change was for |
| **Result** | — | What the outcome was |
| **Risk** | — | What risks were introduced |
| **Decision** | — | What decision was recorded |
| **Next** | — | What work remains |

**Git is the history of code. TRACE is the history of understanding.**

---

## Architecture & Direction

Based on the research in this repository, TRACE is positioned as a **hybrid engineering-governance and codebase-intelligence platform**:

- **CLI-first execution engine** with an accompanying Agent Skill — runs locally, keeps source code private, and avoids token waste
- **Graph-based codebase understanding** (AST/graph parsing over naive vector RAG) for high-fidelity, low-noise context
- **Open `.trace` specification** — portable, vendor-neutral, and consumable by any tool, CI pipeline, or IDE
- **Local rule enforcement** against team-defined rules (`config.yml` / `rules/`)
- **Bring-Your-Own-Key (BYOK)** — developers use their own model providers or local models
- **Zero-retention posture** — source code never has to leave the machine; only metadata syncs to the dashboard

---

## Repository Structure

```text
TRACE/
├── README.md
├── Design-system/            # Design tokens, theme, and style reference for the TRACE dashboard
├── DOC/
│   └── project-overview.md   # Full product definition (English/فارسی)
└── Researchs/
    ├── Competitive Landscape/
    ├── Competitor Feature Matrix/
    ├── Real User Problems and Product Failures/
    ├── Repository Memory and Portable .trace Standard/
    └── Trace Product Strategy and Market Entry/
```

---

## License

License and contribution guidelines will be added as the project evolves.

---

## Status

Early-stage product definition and research. Not yet an implementation.
