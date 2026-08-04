# Repository Memory and Portable `.trace` Standard

## Overview

AI coding agents, DevOps automation, and modern software teams increasingly need **persistent, versioned project memory** inside repositories: instructions, decisions, change narratives, and metadata that survive tools and vendors.[cite:13][cite:43] Today this is implemented through a patchwork of conventions: instruction files like `AGENTS.md` and `CLAUDE.md`, architecture decision records (ADRs), auto‑generated changelogs, git notes and emerging metadata specs such as `git-meta`, plus local memory stores used by agent tools.[cite:2][cite:43][cite:46][cite:36] None of these exactly match the proposed `.trace` directory, but several are close precursors.

This report surveys existing approaches, assesses interoperability and adoption, and then proposes principles for a portable `.trace` specification that can unify daily change reports, PR analyses, decisions, risks, and agent outputs in a tool‑agnostic, git‑native way.

## Existing Repository-Level Memory Conventions

### Agent instruction and context files

Modern AI coding tools converge on **per‑repository instruction files** that give agents persistent context: build commands, coding rules, project structure, and workflows.[cite:31][cite:43]

Key examples:

- **AGENTS.md (open standard)**
  - A plain Markdown file placed at the repository root that describes stack, commands, conventions, and directory boundaries for AI agents.[cite:42][cite:43]
  - Stewarded as an open standard by the Agentic AI Foundation under the Linux Foundation; over 60,000 repos and 20+ AI coding agents (Codex, Cursor, Claude Code, Windsurf, Gemini CLI, Aider, Devin, etc.) read it natively.[cite:43]
  - Agents walk up the directory tree and read all `AGENTS.md` files, with nearer files overriding conflicting instructions in monorepos.[cite:43]
  - Content is free‑form Markdown; no required schema or frontmatter, parsed as natural language.[cite:34]

- **CLAUDE.md (Claude Code)**
  - Claude Code’s instruction file, read from the repo root and from a global `~/.claude/CLAUDE.md`; may also exist as `CLAUDE.local.md` to keep private overrides out of git.[cite:36][cite:32]
  - Used for build/test commands, architecture notes, style guidelines, and workflow instructions.[cite:32][cite:36]
  - Claude automatically loads CLAUDE.md for each session and merges instructions from global, project, and nested files.[cite:36]
  - Claude can also **import AGENTS.md** (via `@AGENTS.md` or symlink), making AGENTS.md the shared cross‑tool source of truth.[cite:36][cite:41]

- **.github/copilot-instructions.md (GitHub Copilot)**
  - Repository‑wide custom instruction file in `.github/copilot-instructions.md`, plain Markdown appended to Copilot’s system prompt for all chats, coding agent tasks, and code review.[cite:20][cite:29]
  - GitHub recommends including project overview, tech stack, coding guidelines, project structure, and build/test commands; keeping it under ~1–2 pages for reliability.[cite:20]
  - Path‑specific rules live in `.github/instructions/*.instructions.md` with YAML `applyTo` globs and optional `excludeAgent` to scope instructions.[cite:20][cite:25]

- **Cursor rules (`.cursor/rules/*.mdc`)**
  - Cursor uses MDC files (Markdown plus YAML frontmatter) for structured rules with glob‑based activation, `alwaysApply`, and `@mention` triggers.[cite:14]
  - Files live under `.cursor/rules/` and can be imported from AGENTS.md (e.g., `@.cursor/rules/*.mdc`).[cite:32]

- **Other tools**
  - Windsurf: `.windsurf/rules/*.md` and global `global_rules.md`.[cite:14][cite:35]
  - Continue.dev, Kiro, Gemini CLI, Codex: similar Markdown or YAML instruction files (`AGENTS.md`, `GEMINI.md`, `AGENTS.md` etc.).[cite:14][cite:43]

**Assessment:** Instruction files are **human‑authored, static context**; they capture rules and structure but generally **do not capture daily change reports, PR analyses, or decisions made over time**. They establish a precedent for a simple, Markdown‑based open spec (AGENTS.md) with broad multi‑agent adoption.[cite:34][cite:43]

### Architecture Decision Records (ADRs)

ADRs are the most established convention for recording **engineering decisions and their rationale** within a code repository.[cite:1][cite:2]

- **Concept and purpose**
  - An ADR records a single architectural decision, including context, decision, and consequences; ADR collections form a “decision log.”[cite:2][cite:6]
  - Widely recommended in engineering playbooks (e.g., Microsoft Engineering Playbook) and government digital services.[cite:5][cite:9]

- **Directory and file structure**
  - Typical layouts: `adr/` at repo root,[cite:1] or `docs/adrs/` / `docs/decisions`.[cite:6][cite:3]
  - Files named with numeric prefixes and dashed titles, e.g. `0002-use-postgres.md`, `NNNN-title-with-dashes.md`.[cite:3][cite:6]
  - Tools like `adr-tools` and MADR standardize numbered file naming and directories (`docs/decisions`).[cite:3][cite:6][cite:10]

- **File formats and schemas**
  - Markdown templates (Nygard ADR, MADR) with sections like Title, Status, Context, Decision, Consequences, and optionally Decision Drivers, Options, Rationale, and Links.[cite:4][cite:6][cite:12]
  - MADR offers “bare” and “minimal” templates, with sequential numbering and Markdown headings.[cite:3][cite:10]

- **Versioning and merge behavior**
  - ADRs are committed to git; accepted ADRs are often treated as immutable, with changes made via new ADRs that supersede earlier ones.[cite:8]
  - Conflicts are rare because ADR files are append‑only and typically edited by one or few people; merge conflicts are resolved like normal Markdown docs.[cite:6][cite:8]

- **Consumption**
  - Humans read ADRs directly in the repo or rendered in docs sites (`docs/decisions`), sometimes via static site generation.[cite:3]
  - Bots and dashboards can parse ADRs thanks to their predictable sections.[cite:3][cite:12]

- **Strengths and failure modes**
  - Strengths: clear rationale, lightweight, git‑native, widely adopted.[cite:2][cite:12]
  - Weaknesses: manual, sporadic (often only major decisions), can drift from reality if not maintained, and seldom linked deeply to specific commits or PRs beyond informal references.[cite:8][cite:12]

**Relation to `.trace`:** ADRs match part of `.trace` (decisions, risks, rationale) but **do not cover daily reports or automated PR analysis**, and their granularity is “per significant decision,” not “per day or per change.”[cite:2][cite:6]

### Automated changelogs and release notes

Multiple tools generate **CHANGELOG.md** files from git history and conventional commits, providing machine‑generated narratives of changes.[cite:17][cite:21]

- **Conventional Changelog ecosystem**
  - `conventional-changelog` and `standard-version` parse commit messages following Conventional Commits to produce grouped changelog sections (Features, Fixes, Breaking Changes).[cite:17][cite:19][cite:21]
  - Integrations via GitHub Actions and local scripts automatically commit updated `CHANGELOG.md` on release.[cite:16][cite:21][cite:26][cite:28]
  - Tools like `git-cliff` offer customizable markdown changelog generation with config files and regex‑based parsers.[cite:24]

- **Directory / file structure and formats**
  - Single or multi‑file Markdown changelogs (`CHANGELOG.md`) at repo root or under `docs/`.[cite:16][cite:21]
  - Some actions output latest release notes separately for dashboards or GitHub Releases.[cite:16][cite:26]

- **Versioning and merge conflicts**
  - Changelog files are committed to git; CI workflows typically regenerate and commit on `main`, which can cause merge conflicts if multiple branches touch the changelog.[cite:16][cite:26] Common mitigations include committing from main only or using “commit only if changed” patterns.[cite:26]

- **Consumption**
  - Humans read `CHANGELOG.md` for release notes; GitHub Releases and marketplace actions ingest generated markdown.[cite:17][cite:21]

**Relation to `.trace`:** Automated changelogs demonstrate **automated, versioned change narratives**, but they usually operate per release, not per day or per PR, and focus purely on code changes, not decisions, risks, or agent behavior.[cite:21][cite:28]

### Engineering journals and devlogs

Several tools and personal workflows turn git history into **daily or weekly engineering journals** stored in Markdown inside a repository or a companion repo.[cite:22][cite:30]

- **Devlog CLI and similar tools**
  - `devlog-cli` (Copilot‑based) reads git history and generates daily journals, standup reports, weekly recaps, and release notes; exports Markdown or JSON via commands like `devlog today`, `devlog week -o weekly-recap.md`.[cite:22]
  - Other CLI devlog tools generate timestamped markdown documents (notes, development logs, TODOs) saved into a git repo, sometimes with templates.[cite:30][cite:51]
  - Some workflows maintain a `daily_log.md` or `dev_log.md` file in a separate “devlog.git” repository, committing log entries with dedicated scripts.[cite:52]

- **DevDay (Claude Code skill)**
  - DevDay is a Claude Code skill that creates **append‑only markdown daily logs** for any git repo using two commands: `/devday-log` (checkpoints) and `/devday` (synthesis).[cite:27]
  - It produces a daily file with sections: Summary, Commits Today (table of hashes, messages, times), Decisions Made, Next Steps, Session Quality.[cite:27]
  - Checkpoint entries (`## HH:MM — summary`) are appended throughout the day; synthesis is idempotent, updating summary sections without losing raw checkpoints.[cite:27]

- **Directory / file structure and formats**
  - DevDay uses one append‑only Markdown file per day in a configurable log directory (e.g., `.logs/dev/YYYY-MM-DD.md`), though exact path is tool‑specific.[cite:27]
  - Devlog tools output markdown files named per date or user preferences (`note-YYYY-MM-DD.md`, `log-YYYYMMDD.md`).[cite:30][cite:52]

- **Versioning and merge behavior**
  - Journals are committed to git; conflicts arise if multiple people edit the same day’s file, but most workflows treat journals as personal or single‑writer artifacts.[cite:30][cite:52]

**Relation to `.trace`:** Journals and DevDay **come closest to `.trace` daily change reports**: they combine commits, narrative summaries, and decisions into structured markdown, often per day, and commit them to git.[cite:22][cite:27] However, they lack a shared standard for directory naming, schema, PR links, or multi‑agent compatibility.

### Code ownership and governance files

Git repositories also carry **ownership and governance metadata** that agents and humans use to control who can change what.

- **CODEOWNERS**
  - Standard GitHub/Gitea mechanism mapping path globs to owners (users or teams) in a `CODEOWNERS` file placed at repo root or under `.github/`, `.gitea/`, or docs directories.[cite:38] 
  - Platforms enforce required review from owners for matching paths via branch protection rules.[cite:38][cite:44]
  - Emerging guidance suggests using CODEOWNERS to govern **agent identities** and protect agent configuration files (`AGENTS.md`, `mcp.json`, `.claude`), ensuring human review for changes to agent rules.[cite:37][cite:44]

- **Agent configuration governance**
  - GitHub recommends protecting `AGENTS.md`, `copilot-instructions.md`, and MCP configs with rulesets, CODEOWNERS, and CI, treating them as high‑risk configuration artifacts.[cite:37][cite:44]

**Relation to `.trace`:** Governance files are not memory stores themselves, but they are critical for **controlling writes to `.trace`**, especially when agents generate reports autonomously.

### Machine-readable project metadata

Beyond plain text files, there are mechanisms for structured metadata bound to git objects.

- **Git notes**
  - Native git feature that lets users attach arbitrary blobs of metadata to any git object (commits, trees, blobs, tags) without changing SHAs.[cite:47][cite:57]
  - Notes live under refs like `refs/notes/commits`; multiple namespaces are supported.[cite:57]
  - Common uses: test results, code review notes, build metadata, deployment info, review IDs — all attached to commits.[cite:47][cite:48]
  - Notes are mutable and version controlled (changes create commits on the notes ref); notes can be pushed/pulled separately (`git push origin refs/notes/*`).[cite:47][cite:57]

- **git-meta**
  - `git-meta` is an open specification and CLI for **structured metadata** over git objects, intended as a more flexible, scalable alternative to `git notes`.[cite:46]
  - Supports attaching typed values (string, list, set) to namespaced keys (e.g., `agents:model`) on commits, branches, paths, change-ids, and project scope.[cite:46]
  - Stores metadata in ordinary git trees and commits under `refs/meta/*`; designed around promisor remotes for large-scale metadata sets.[cite:46]
  - Defines deterministic merge behavior per value type, allowing concurrent edits to resolve without custom logic.[cite:46]

**Relation to `.trace`:** Git notes and git-meta show that **attaching structured metadata to commits or paths** is possible and standardized, but they focus on key–value stores in refs, not on a visible `.trace` directory with human‑readable reports.[cite:46][cite:47] However, `.trace` could use git-meta or notes for cross‑repository synchronization or indexing.

### Memory systems for AI coding agents

Persistent agent memory is increasingly important for AI coding tools.

- **Claude Code auto memory**
  - Claude maintains per‑project memory at `~/.claude/projects/<project>/memory/`, with a `MEMORY.md` index and topic files for architecture notes, debugging insights, and preferences.[cite:36]
  - These files are **not committed to git**; they are local to the user and derived from interactions.[cite:36]

- **Windsurf Cascades**
  - Windsurf auto‑generates local memories under `~/.codeium/windsurf/memories/`, workspace‑scoped and not shared via git.[cite:13]

- **memtrace and memories.sh (external memory layers)**
  - `memtrace` creates a local database per project, importing Claude Code memories, Cursor rules, and git history to provide cross‑agent persistent memory (`memory_save`, `memory_recall`, etc.).[cite:7]
  - `memories.sh` maintains a local SQLite database at `~/.config/memories/local.db`, storing rules, decisions, and project knowledge and generating native config files for Claude Code, Cursor, Copilot, Windsurf, etc.[cite:11]

**Relation to `.trace`:** Agent memory systems aim at **local, cross‑agent state**, not repository commits. They emphasize privacy and local control (data never leaves machine).[cite:7][cite:11] `.trace` would be complementary: an explicit, team‑visible memory layer committed to git, with clear scoping and privacy rules.

### Hidden project folders and tool-specific directories

Developer tools routinely create **hidden directories** for configuration and state:

- Examples: `.claude/` (skills, agents, devday skill), `.cursor/` (rules), `.windsurf/`, `.github/` (workflows, instructions), `.agents/`, `.codex/`.[cite:11][cite:31][cite:14]
- These typically store tool configs, rules, and skills, sometimes imported or synchronized via tools like `memories.sh`.[cite:11]

**Relation to `.trace`:** The notion of a **tool‑specific hidden directory** is widely accepted, but most are proprietary conventions. A `.trace` standard would need to avoid collision and remain tool‑agnostic.

## Existing Systems Versus Proposed `.trace` Directory

### Proposed `.trace` capabilities

The `.trace` concept aims for a **version‑controlled directory** inside the repository containing:

- Daily change reports
- Pull‑request analyses (summaries, risk assessment, coverage notes)
- Decisions and rationales
- Risks and mitigation notes
- Team rules and conventions snapshots
- Links to commits, issues, tasks, and PRs
- Outputs produced interchangeably by cloud services and local agents
- Reports synchronized with central dashboards

No single existing product or open standard covers this entire surface today, but several patterns approximate pieces:

### Closest analogues

1. **DevDay + Devlog tools: daily engineering journals**
   - DevDay’s per‑day markdown journal (Summary, Commits Today, Decisions Made, Next Steps) is structurally similar to proposed `.trace/<date>.md` daily reports.[cite:27] 
   - devlog CLI tools produce daily/weekly/standup markdown exports from git history (`devlog today -o journal.md`, `devlog week -o weekly-recap.md`).[cite:22][cite:53]
   - These tools can be wired into CI or local scripts to commit generated reports to git, but there is **no common directory name or schema**.

2. **ADRs and decision logs**
   - ADR directories (`adr/`, `docs/decisions`) capture discrete architectural decisions with structured templates and long‑term context.[cite:1][cite:3][cite:12]
   - They provide a mature practice for decision records but not for daily change or PR‑level analysis.

3. **Conventional changelog + git notes/meta**
   - Conventional Changelog pipelines turn commit history into formatted `CHANGELOG.md`, sometimes automatically committed via CI.[cite:17][cite:21][cite:26]
   - Git notes attach structured metadata to commits (e.g., review IDs, test status), and git-meta defines a multi‑system exchange format for typed metadata entries under `refs/meta/*`.[cite:47][cite:46]
   - Together, these show how machine‑generated summaries and metadata can coexist with git, but they lack a standard for **per‑PR narrative files** stored under a specific directory.

4. **Agent instruction standards (AGENTS.md)**
   - AGENTS.md is notable as an **open, cross‑tool standard** with Linux Foundation stewardship, proving that a simple Markdown file convention can reach tens of thousands of repos and multiple vendors.[cite:34][cite:43][cite:39]
   - Its focus is on **instructions**, not history, but its governance and adoption are strong precedents for a `.trace` spec.

### Gaps relative to `.trace`

Across surveyed systems:

- **Daily reports:** DevDay and devlog cover this, but there is no shared schema or directory name; some logs live in separate repositories.[cite:22][cite:27][cite:52]
- **PR analyses:** No widely adopted convention exists for storing PR‑level analysis markdown alongside code; analyses live mostly in PR descriptions and external dashboards.[cite:44][cite:47]
- **Decisions + links:** ADRs capture decisions but do not consistently link to issues, PRs, or commits in a machine‑readable way.
- **Multi‑agent output interchangeability:** AGENTS.md demonstrates cross‑agent instruction sharing, but multi‑agent generation of reports (e.g., Claude, Copilot, Cursor all writing `.trace` files) lacks a standard contract.[cite:34][cite:43]
- **Dashboard synchronization:** git-meta and CI pipelines show how metadata and generated artifacts can sync to external systems, but there is no canonical `.trace` spec for dashboards to expect.

**Conclusion:** There is **no existing single product or open standard** that fully matches a `.trace` directory with unified daily reports, PR analyses, decision logs, risk notes, and multi‑agent outputs. However, the combination of **DevDay/devlog**, **ADRs**, **Conventional Changelog**, **git-notes/meta**, and **AGENTS.md** offers a rich foundation to design `.trace` as a portable layer.[cite:2][cite:21][cite:27][cite:43][cite:46]

## Detailed Characteristics of Relevant Systems

### AGENTS.md (open instructions standard)

- **Structure**
  - Location: `AGENTS.md` at repository root, with optional nested files in subdirectories for scoped instructions.[cite:42][cite:43]
  - Format: plain Markdown, no required frontmatter; content is natural language instructions (build/test commands, conventions, directory descriptions).[cite:34][cite:43]

- **Versioning and merge behavior**
  - Committed to git; tools read the nearest AGENTS.md along the directory tree, merging multiple files with nearest taking precedence on conflicts.[cite:43]
  - Merge conflicts are resolved like any Markdown doc; teams often protect AGENTS.md via CODEOWNERS and branch rules.[cite:37][cite:44]

- **Privacy and security**
  - Meant to be shared with the team; private or machine‑specific tweaks can live in tool‑specific local files like `CLAUDE.local.md` or untracked configs.[cite:32][cite:36]
  - Governance guidance recommends human review and rulesets for changes to agent configuration files, including AGENTS.md.[cite:37][cite:44]

- **Consumption**
  - Humans read AGENTS.md as an “AI agent README”; agents parse it as context at task start.[cite:42][cite:43][cite:35]

- **Strengths and failure modes**
  - Strengths: extremely simple spec, broad cross‑vendor adoption, low tooling requirements.[cite:43][cite:39]
  - Failure modes: unstructured content can be noisy, lacks explicit schema or versioning, and can drift without governance.

### CLAUDE.md + Auto Memory (Claude Code)

- **Structure**
  - CLAUDE.md at repo root and global `~/.claude/CLAUDE.md`, plus optional `CLAUDE.local.md` and nested files in subdirectories.[cite:36][cite:32]
  - Auto memory directory: `~/.claude/projects/<project>/memory/` with `MEMORY.md` index and topic files.[cite:36]

- **Versioning and merge behavior**
  - CLAUDE.md files can be committed to git; auto memory is local, not versioned in git.[cite:36]
  - Claude merges CLAUDE.md files discovered by walking up the directory tree and reading nested files when editing corresponding paths.[cite:36]

- **Privacy and security**
  - Auto memory is per‑user and local; instructions in CLAUDE.local.md are kept out of git via `.gitignore`.[cite:32][cite:36]

- **Consumption**
  - Claude loads CLAUDE.md into context at session start, and reads/writes auto memory during sessions.[cite:36]

- **Strengths and failure modes**
  - Strengths: layered memory (user, project, auto), good for personalized workflows.[cite:36]
  - Weaknesses: non‑portable auto memory, vendor‑specific, limited interoperability.

### DevDay daily logs

- **Structure**
  - One append‑only markdown file per day in a log directory; each checkpoint appended via `/devday-log` as `## HH:MM — short summary`, plus daily synthesis sections created by `/devday`.[cite:27]
  - Synthesis includes: Summary, Commits Today (table), Decisions Made, Next Steps, Session Quality.[cite:27]

- **Versioning and merge behavior**
  - Files can be committed to git; `devday` is idempotent, updating synthesis without removing checkpoints, reducing conflict risk.[cite:27]

- **Privacy and security**
  - Logs typically reflect developer activity and decisions; teams must choose whether to commit them or keep them personal.[cite:27]

- **Consumption**
  - Humans read daily files; Claude can use them as context in future sessions.[cite:27]

- **Strengths and failure modes**
  - Strengths: structured daily narrative from git plus checkpoints, close to desired `.trace` daily change reports.[cite:27]
  - Weaknesses: tool‑specific, no standardized directory naming or schema across projects.

### ADR directories

- **Structure**
  - Directories like `adr/` or `docs/adrs/` or `docs/decisions`; numbered Markdown files per decision (`0002-use-postgres.md`, `NNNN-title-with-dashes.md`).[cite:1][cite:3][cite:6]

- **Formats and schemas**
  - Templates with Title, Status, Context, Decision, Consequences, plus optional Decision Drivers, Considered Options, Pros/Cons, and Links.[cite:4][cite:6][cite:12]

- **Versioning and merge behavior**
  - ADRs committed to git; accepted ADRs treated as immutable, superseded by new ADRs for changed decisions, maintaining a historical chain.[cite:8][cite:12]

- **Privacy and security**
  - Purely internal documentation; no special privacy beyond repo access controls.[cite:6]

- **Consumption**
  - Humans read ADRs; docs tools can render them.

### git-notes and git-meta

- **git-notes**
  - Notes attached under `refs/notes/commits`; arbitrary text or structured content attached to commits via `git notes add -m` or `-F` file.[cite:47][cite:57]
  - Pushed/pulled separately; commit SHA remains unchanged.[cite:47][cite:57]

- **git-meta**
  - Metadata stored under `refs/meta/*` as git trees and commits, with namespaced keys and typed values (string, list, set) for commits, paths, branches, change-ids.[cite:46]
  - Deterministic merge semantics per type enable conflict‑free concurrent edits.[cite:46]

- **Strengths and failure modes**
  - Strengths: structured metadata across systems, scalable, git‑native, good for provenance and attestations.[cite:46][cite:49]
  - Weaknesses: user‑visible content is separate from working tree; tooling adoption is still emerging.[cite:49]

## Principles for an Open, Portable `.trace` Specification

Drawing from the above systems, an effective `.trace` spec should balance human readability, machine interoperability, and governance.

### 1. Directory and object model

- **Canonical directory:** `.trace/` at repository root, reserved for trace artifacts.[cite:27][cite:21]
- **Subdirectories by scope:**
  - `daily/` – daily change reports, one file per day (`YYYY-MM-DD.md` or `.json`).
  - `pr/` – per‑pull‑request analyses (`<pr-number>.md` plus optional `<pr-number>.json`).
  - `decisions/` – decision records; can coexist with ADRs (`ADR-XXXX-...`) or provide lightweight decision entries.
  - `risks/` – risk assessments and mitigation plans, optionally cross‑linked to PRs and decisions.
  - `rules/` – snapshots or diffs of team rules and conventions when they changed significantly.

- **File naming:** use predictable, conflict‑minimal schemes:
  - Dates: `2026-08-04.trace.md` or `2026-08-04.md` in `daily/`.
  - PRs: `1234.trace.md` and optional `1234.trace.json` for PR #1234.
  - Decisions: numeric or slug‑based, e.g. `0007-use-tarball-installs.md`. Align with ADR numbering if present.

### 2. Minimum required metadata

Each `.trace` artifact should include a small set of **required fields**, either in YAML frontmatter for Markdown or in JSON:

- **Global fields:**
  - `traceVersion` – schema version string (e.g., `1.0.0`).
  - `id` – stable identifier for the trace record (UUID or structured ID like `daily-2026-08-04` or `pr-1234-2026-08-04`).
  - `createdAt` – ISO 8601 timestamp.
  - `createdBy` – identity of generator (human user, agent name, or service).
  - `sourceType` – `human`, `local-agent`, `cloud-service`, `ci`.

- **Daily report fields (for `daily/`)**:
  - `date` – ISO date.
  - `commits` – list of commit SHAs included.
  - `prs` – list of PR numbers or URLs referenced.
  - `issues` – list of issue IDs.
  - `summary` – short text summary.

- **PR analysis fields (for `pr/`)**:
  - `prNumber` – numeric ID.
  - `prUrl` – full URL (e.g., GitHub/GitLab link).
  - `baseRef` / `headRef` – branch names.
  - `commitRange` – from‑to SHAs.
  - `riskLevel` – enumerated (`low`, `medium`, `high`).
  - `checks` – summary of CI checks, coverage, security scans.
  - `linkedIssues` – list of issue IDs.

- **Decision fields (for `decisions/`)** (aligned with ADRs):
  - `decisionId` – stable ID.
  - `status` – `proposed`, `accepted`, `deprecated`, `superseded`.
  - `context` – summary.
  - `decision` – text.
  - `consequences` – text.
  - `supersedes` / `supersededBy` – IDs of related decisions.

These minima ensure that dashboards and agents can rely on consistent metadata even if the narrative content is free‑form Markdown.

### 3. Human-readable vs machine-readable files

- **Dual representation:** prefer **Markdown with YAML frontmatter**, plus optional JSON sidecar files for pure machine consumption.
  - Example: `daily/2026-08-04.md` contains frontmatter with fields like `date`, `commits`, `prs`, plus sections for Summary, Decisions, Next Steps.
  - Optional `daily/2026-08-04.json` mirrors the structured fields and adds normalized arrays for dashboards.

- **Compatibility:**
  - Human‑readable Markdown aligns with ADRs, DevDay logs, and existing engineering culture.[cite:2][cite:27]
  - JSON sidecars ease integration with CI, metrics pipelines, and external dashboards.

### 4. Schema versioning and evolution

- **Versioned spec:** include `traceVersion` in every record, following semver and published spec docs.
- **Forward compatibility:**
  - New fields should be optional with defaults.
  - Parsers must ignore unknown fields rather than failing.

- **Registry of schemas:** maintain central documentation and JSON Schema definitions per version, enabling validation and tooling generation.

### 5. Stable identifiers and references

- **Stable IDs:** use namespaced IDs (e.g., `daily-2026-08-04`, `pr-1234-2026-08-04`, `decision-0007`) to facilitate linking and deduplication.
- **Git object references:**
  - Store commit SHAs, branch names, and tags directly in fields.
  - For richer metadata, integrate with git-meta or git-notes to attach `trace-id` fields to commits under `refs/meta/trace/*`.[cite:46][cite:47]

- **External references:**
  - Use full URLs for issues, PRs, tasks (e.g., GitHub, Jira), enabling cross‑system linking without requiring vendor‑specific IDs.

### 6. Source attribution and provenance

- **Origin fields:** include `createdBy`, `agentModel`, `agentVersion`, `toolName`, and optionally `taskId` (CI job ID or agent session ID).
- **Multi‑source records:**
  - Support appending or merging multiple sources into a single record (e.g., human post‑edits after agent generation), using structured sections: `generated`, `humanReview`, `revisions`.

- **Audit integration:** align with emergent AI governance practices that label PRs as `ai-authored` or `ai-assisted` and attach model versions and confidence scores to contributions.[cite:44]

### 7. Local vs cloud-generated output

- **SourceType values:** differentiate `local-agent`, `cloud-service`, `human`, `ci` in metadata.
- **Synchronization policies:**
  - Local agents can generate `.trace` files and commit them directly.
  - Cloud services can either push commits or write to git-meta / notes; `.trace` spec should support ingestion from both.

- **Conflict avoidance:** prefer append‑only patterns for daily logs and separate files per PR to reduce contention between local and cloud generators.

### 8. Conflict prevention and merge strategies

- **File partitioning:**
  - One file per day and per PR reduces merge collisions.
  - For multi‑author days, treat `daily/` logs as append‑only; merges rarely conflict if sections are additive.

- **Deterministic synthesis:** adopt DevDay’s idempotent synthesis pattern: generators update specific sections while preserving raw checkpoints, making re‑runs safe.[cite:27]

- **Git-meta integration:** for high‑volume metadata (e.g., per‑commit risk classification), use git-meta under `refs/meta/trace/*` instead of working tree files; rely on typed merge semantics (string/list/set).[cite:46]

### 9. Sensitive-data exclusions and privacy

- **Redaction policies:**
  - Encourage `.trace` entries to avoid secrets, credentials, and sensitive user data; treat `.trace` like code (subject to audits and leaks).
  - If needed, allow redacted fields (`redacted: true`, `redactionReason`) for removed content.

- **Local-only traces:**
  - For personal journaling, allow `.trace-local/` directories or `.trace` entries excluded via `.gitignore` (e.g., `daily/private-*`), keeping them out of the shared repo.

- **Tool behavior:**
  - Agent tools must respect `.gitignore` when writing `.trace` files, as recommended for secret scanning tools.[cite:run_secret_scanning]

### 10. Repository-size control

- **Retention configuration:**
  - Offer policies (config file like `.traceconfig.yml`) to cap daily logs (e.g., retain last N days) and prune older files via CI.
  - For PR analyses, keep records only for merged PRs or high‑risk changes.

- **Compaction:**
  - Combine older daily logs into monthly summaries, similar to how journals and changelog tools handle long histories.[cite:53][cite:21]
  - Use git’s compression and large‑file handling to keep `.trace` lightweight.

### 11. Multi-agent and vendor compatibility

- **Tool‑agnostic formats:** rely on Markdown + YAML and JSON; avoid embedding vendor‑specific syntax (e.g., tool directives) in core schema.
- **Discovery rules:**
  - Agents look for `.trace/` at repo root, then read relevant subdirectories based on task (e.g., PR analysis agents read `pr/<number>.md`).

- **Standardization path:**
  - Follow AGENTS.md’s path: start as a **minimal spec** shared by early adopters, then formalize under an open body (Linux Foundation / AAIF) once practice stabilizes.[cite:34][cite:43]

## Could `.trace` Become an Open Standard?

### Factors favoring standardization

- **Precedents:** AGENTS.md demonstrates that a **simple, Markdown‑based repo convention** can become a de facto standard across many AI coding agents and vendors when stewarded by a neutral foundation.[cite:34][cite:43][cite:39]
- **Existing demand:** DevDay, devlog tools, and AI governance practices show clear appetite for **structured, repo‑resident narratives of work** — daily journals, decisions, risk assessments, and PR‑level metadata.[cite:22][cite:27][cite:44]
- **Interoperability gaps:** Today, each vendor has its own memory layer (Claude auto memory, Windsurf Cascades, Copilot instructions, Cursor rules), with limited cross‑tool sharing; a `.trace` spec could provide a neutral layer for history and analysis, just as AGENTS.md did for instructions.[cite:13][cite:31][cite:36]
- **Technical feasibility:** Git and tools like git-meta already support attaching structured metadata and exchanging it across systems; `.trace` could standardize the **working tree representation** while git-meta standardizes the **ref representation**.[cite:46][cite:47]

### Challenges and risks

- **Scope creep:** `.trace` touches multiple domains: engineering journals, ADRs, AI governance, CI metadata, and agent memory. A too‑ambitious spec may be hard to adopt fully.
- **Vendor incentives:** Vendors may prefer proprietary formats that lock users into their dashboards and tools; aligning on a shared `.trace` convention requires clear value, such as easier onboarding and cross‑agent portability.[cite:43][cite:37]
- **Privacy and culture:** Teams may be hesitant to commit rich journals or risk assessments to shared repos, especially in regulated environments; `.trace` must be configurable and privacy‑aware.
- **Merge and maintenance overhead:** If `.trace` files change frequently (daily, per PR), naive implementations may create merge conflicts and noisy diffs; careful design (append‑only sections, per‑artifact files, CI‑based generation) is essential.

### Recommendation

Given existing practices and the success of AGENTS.md, **`.trace` has credible potential to become a meaningful open standard**, provided it is:

- Scoped narrowly at first: start with **daily reports and PR analyses** under `.trace/daily/` and `.trace/pr/`, with minimal required metadata and Markdown frontmatter.
- Tool‑agnostic and vendor‑neutral: avoid embedding any single agent’s directives; focus on content that humans, dashboards, and agents can all read.
- Governed by an open body: pursue standardization through an organization like AAIF / Linux Foundation, ideally in tandem with git-meta as the metadata transport layer.
- Integrated with existing conventions: reuse ADR patterns for decisions, AGENTS.md for instructions, and CODEOWNERS/rulesets for governance.

Until such a standard emerges, `.trace` can **start as an internal product format** inspired by these principles and designed for graceful evolution towards an open spec. An internal implementation should:

- Adopt the directory and metadata patterns above.
- Treat `.trace` files as first‑class citizens in code review and governance (protected via CODEOWNERS and rulesets).[cite:37][cite:44]
- Provide clear tooling (CLI, editor integrations, agent skills) to generate, read, and validate `.trace` artifacts.

If early adopters demonstrate value — better cross‑agent context, clearer decision history, and high‑quality dashboards built on `.trace` — standardization can follow, likely mirroring AGENTS.md’s trajectory from community convention to Linux Foundation standard.[cite:34][cite:43]
