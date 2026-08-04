# Repository Memory and Portable `.trace` Standard

**Research Report**  
**Date:** 2026-08-04  
**Focus:** Existing approaches for storing AI-generated project memory, engineering decisions, code-change reports, agent instructions, and development history inside software repositories; assessment of a proposed portable `.trace` directory standard.

---

## 1. Executive Summary

No single existing product or open standard fully matches the proposed `.trace` directory: a version-controlled, multi-purpose folder containing daily change reports, pull-request analysis, decisions, risks, team rules, links to Git objects/Issues/PRs/Tasks, outputs from both cloud and local agents, and sync capability with a central dashboard.

However, the ecosystem already contains strong, overlapping building blocks:

- **Agent instruction / context files** (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc.) — widely adopted open conventions for static project guidance.
- **Architecture Decision Records (ADRs)** — mature, version-controlled decision logs (usually Markdown under `docs/adr/` or similar).
- **Memory-bank patterns** (Cline and derivatives) — structured Markdown folders for project context, active tasks, progress, and decision logs.
- **Persistent memory systems** (agentmemory, Mem0, Letta/MemFS, Hindsight, etc.) — mostly external or local non-Git stores, with some file-based options.
- **Governance and metadata files** (`CODEOWNERS`, `.github/` conventions, Conventional Commits + Keep a Changelog).
- **Hidden tool directories** (`.claude/`, `.cursor/`, `~/.codeium/`, etc.) — frequently local-only and not committed.

The gap that `.trace` would fill is **structured, chronological, multi-agent, Git-native change/decision/risk reporting** that is portable across vendors and usable by both humans and machines, with explicit support for daily reports, PR analysis, and dashboard synchronization.

A well-designed open `.trace` specification has a realistic path to becoming a meaningful complement to `AGENTS.md` and ADRs, provided it stays lightweight, schema-versioned, conflict-resistant, and privacy-aware. Remaining purely internal would limit interoperability value.

---

## 2. Existing Approaches and Conventions

### 2.1 Agent Instruction and Repository-Level AI Context Files

**AGENTS.md** (agents.md)  
- Open format promoted as “a README for agents.”  
- Root-level Markdown file checked into Git.  
- Used by 60k+ open-source projects.  
- Supported (natively or via symlink) by many tools: OpenAI Codex, GitHub Copilot coding agent, Cursor, Windsurf/Devin Desktop, etc.  
- Claude Code prefers `CLAUDE.md` (or symlinks).  
- Content typically includes: project overview, build/test commands, coding conventions, architecture notes, MCP server usage, guardrails.  
- Strength: predictable location, human- and machine-readable, version-controlled.  
- Limitation: static or slowly evolving; does not capture session history, daily changes, or PR analysis. Token cost if too long.

**CLAUDE.md / MEMORY.md (Claude Code)**  
- Project-root or nested `CLAUDE.md` files loaded recursively or on-demand.  
- Global `~/.claude/CLAUDE.md`.  
- `.claude/` directory for settings, skills, subagents, and sometimes `MEMORY.md` (auto-persisted notes).  
- Hierarchical: user → project → directory-level.  
- Generated files often committed; local overrides (`CLAUDE.local.md`, `settings.local.json`) usually gitignored.  
- Strength: progressive disclosure, modular rules.  
- Failure mode: divergence between `AGENTS.md` and `CLAUDE.md`; stale content; context bloat.

**Cursor / Windsurf / Devin Desktop rules and memories**  
- `.cursorrules` or `.cursor/rules/` (project rules).  
- Windsurf/Devin: Rules (manual, durable) vs Memories (auto-generated, workspace-local, stored under `~/.codeium/windsurf/memories/` — **not** committed to the repository).  
- Strength: automatic capture of useful facts.  
- Limitation: vendor lock-in, non-portable across tools or machines, privacy surface (local only).

**Other**  
- GitHub Copilot: `.github/copilot-instructions.md`.  
- Various tools accept nested or progressive context files.

### 2.2 Architecture Decision Records (ADRs)

**Core idea** (Nygard / adr.github.io): one Markdown (or equivalent) file per significant architectural decision, capturing context, decision, and consequences.

**Typical structure**
```
docs/adr/
  0001-record-architecture-decisions.md
  0002-use-postgres.md
  index.md
  template.md
```
or date-prefixed: `20200101-use-messaging-library.md`.

**Tools**
- `adr-tools` (Nat Pryce) — CLI for creation and management.  
- Log4brains — IDE-friendly creation + static-site publishing of the ADR knowledge base.  
- Language-specific ports (Go, Node, Python, .NET, etc.).  
- MADR (Markdown Architectural Decision Records) templates.

**Versioning & Git**  
- Files are committed; status (proposed / accepted / superseded / deprecated) is updated in place or via new superseding records.  
- Merge conflicts handled like any Markdown: usually rare if one decision per file and sequential numbering.  
- Humans and static sites consume them; agents can be instructed to read the folder.

**Strengths**  
- Proven, lightweight, Git-native, human-readable.  
- Focus on “why.”  

**Limitations**  
- Primarily architectural, not daily operational change logs, risk registers, or PR analyses.  
- No built-in multi-agent or cloud/local provenance.

### 2.3 Automated Changelogs and Conventional Commits

- **Keep a Changelog** format (Markdown `CHANGELOG.md`).  
- **Conventional Commits** + tools (semantic-release, standard-version, release-please, git-cliff, etc.) auto-generate changelogs from commit messages.  
- GitHub Releases / automated release notes.  
- Strength: machine-parsable history of user-facing changes.  
- Limitation: high-level; rarely contains internal decisions, risks, or agent reasoning.

### 2.4 Code Ownership and Governance

- **CODEOWNERS** (GitHub / GitLab) — pattern-based ownership, usually at root, `.github/`, or `docs/`.  
- Triggers required reviews.  
- Complements but does not replace decision or change memory.  
- Other governance: `CONTRIBUTING.md`, security policies, CODE_OF_CONDUCT, etc., under `.github/`.

### 2.5 Engineering Journals / Project Journals

- Ad-hoc Markdown or wiki pages (`docs/journal/`, `ENGINEERING_LOG.md`).  
- Rarely standardized; often personal or team-specific.  
- Some teams keep dated daily notes.

### 2.6 Machine-Readable Project Metadata

- `package.json`, `Cargo.toml`, `pyproject.toml`, `composer.json`, etc.  
- `.github/` workflows, issue templates, FUNDING.yml.  
- SBOM / dependency manifests.  
- Limited semantic richness for decisions or agent history.

### 2.7 Local Coding-Agent Skills and Hidden Folders

- Claude: `.claude/skills/`, settings.  
- Cursor: project and user rules.  
- Many tools keep state under home directories (`~/.claude/`, `~/.cursor/`, `~/.codeium/`).  
- These are typically **not** committed; they are personal or machine-local.  
- Risk: loss of context when switching machines or tools; security exposure if secrets leak into them.

### 2.8 Memory Systems for AI Coding Agents

**File-based / in-repo patterns**
- **Cline Memory Bank** (community pattern):  
  ```
  memory-bank/
    projectContext.md
    activeContext.md
    progress.md
    decisionLog.md
  ```
  (or variations). Agents are instructed to read and update these files. Some MCP servers formalize it.  
- Custom “foundational” or “context” folders next to `AGENTS.md`/`CLAUDE.md`.  
- Simple `NOTES.md` or session-end summaries written by the agent.

**External / hybrid systems**
- **agentmemory** (rohitg00): persistent, searchable memory across Claude Code, Cursor, Copilot CLI, etc., via MCP/hooks. Captures, compresses, retrieves. Built-in agent memories are treated as “sticky notes”; agentmemory is the database behind them. Can use local Markdown storage in some forks.  
- **Mem0**, **Letta** (MemFS / context repositories), **Hindsight**, **Zep/Graphiti**, **Cognee**, etc.: vector/graph stores, often cloud or self-hosted, with MCP integration. Strong temporal/semantic search; not primarily Git-committed.  
- Devin Desktop / Windsurf Memories: local, workspace-scoped, non-committed.  
- Basic Memory, mnemory, and various DIY SQLite + embedding setups.

**Key observations**
- Most advanced memory is **outside** the repository (vector DBs, cloud services, home-dir files).  
- In-repo memory tends to be simple Markdown that agents are told to maintain.  
- No widely adopted standard for daily change reports + PR analysis + risk + decision logs that is both Git-native and multi-vendor.

### 2.9 Markdown / JSON Report Schemas Committed to Git

- ADRs and Keep a Changelog are the closest mainstream examples.  
- Some teams commit CI reports, coverage, or security scan summaries (often under `reports/` or `.github/`).  
- Agent-generated summaries are occasionally committed but lack a shared schema.

---

## 3. Comparison to the Proposed `.trace` Directory

| Desired `.trace` Capability                  | Closest Existing Practice                          | Gap |
|---------------------------------------------|----------------------------------------------------|-----|
| Version-controlled directory                | ADRs, memory-bank, AGENTS.md                       | None for basic storage |
| Daily change reports                        | Manual journals, auto-changelogs, agent notes      | No standard daily schema or agent-generated convention |
| Pull-request analysis                       | GitHub PR descriptions, review comments, bots      | Rarely stored as structured files inside the repo |
| Decisions                                   | ADRs                                               | ADRs are architectural; operational decisions underrepresented |
| Risks                                       | Ad-hoc risk registers, security docs               | No standard lightweight risk log |
| Team rules                                  | AGENTS.md / CLAUDE.md / CODEOWNERS                 | Covered, but scattered |
| Links to Commits, Issues, PRs, Tasks        | Markdown links, Git trailers, Conventional Commits | No uniform reference scheme inside reports |
| Cloud + local agent outputs interchangeable | Almost none                                        | Major gap — vendor silos |
| Sync with central dashboard                 | Log4brains static sites, external memory services  | No portable Git-first sync protocol |

**Conclusion:** Nothing currently provides the full combination of chronological operational reporting, multi-agent provenance, Git-object linking, and dashboard-ready structure under a single portable directory convention.

---

## 4. Principles for an Open, Portable `.trace` Specification

### 4.1 Directory Layout (Recommended Minimum)

```
.trace/
  README.md                 # Human overview + schema version pointer
  schema.json               # or schema.yaml — machine-readable schema + version
  index.json                # Manifest of all traces (IDs, dates, types, sources)
  decisions/                # Optional; can symlink or complement docs/adr/
    YYYY-MM-DD-title.md
  daily/
    YYYY-MM-DD.md           # or .json / dual
  pr/
    <pr-number-or-id>.md
  risks/
    <id>.md
  rules/                    # Team / agent rules (or references to AGENTS.md)
  sources/                  # Optional provenance or agent config snapshots
  .gitignore                # Explicit exclusions for sensitive local files
```

Keep the root of `.trace/` small. Prefer dated or ID-based files over monolithic logs.

### 4.2 Minimum Required Metadata (per report / record)

Every file (or its front-matter / companion JSON) should contain:

- `trace_id` — stable unique identifier (ULID or UUID).  
- `schema_version` — e.g. `"1.0.0"`.  
- `type` — `daily` | `pr` | `decision` | `risk` | `rule` | `analysis` | …  
- `created_at` / `updated_at` — ISO-8601.  
- `source` — `{ "agent": "claude-code|cursor|codex|human|ci", "version": "...", "mode": "local|cloud" }`.  
- `git` — references:  
  - `commit` (SHA)  
  - `branch`  
  - `prs` / `issues` / `tasks` (URLs or `owner/repo#123` form)  
- `summary` — short human-readable title.  
- `tags` — free-form or controlled vocabulary.  
- Optional: `supersedes`, `related`, `risk_level`, `confidence`.

### 4.3 Human-Readable vs Machine-Readable

- **Primary format:** Markdown with YAML front-matter (or Markdown + sidecar `.json`).  
  - Humans read the body; agents and dashboards parse front-matter + structured sections.  
- Dual publication (`.md` + `.json`) is acceptable for high-value records if repository size is controlled.  
- Avoid pure binary or opaque proprietary formats.

### 4.4 Schema Versioning

- Semantic versioning of the schema itself.  
- `schema.json` (or equivalent) at `.trace/schema.json` declares the current version and any migrations.  
- Older files remain readable; tools should tolerate missing optional fields.  
- Breaking changes require a new major version and a migration path or dual-write period.

### 4.5 Stable Identifiers and Git Object References

- Prefer ULIDs or UUIDv7 for time-sortable IDs.  
- Always include full commit SHAs when referencing history.  
- Use canonical GitHub/GitLab-style references (`org/repo#123`) plus optional full URLs.  
- Never rely solely on relative paths that break on rename.

### 4.6 Source Attribution and Local vs Cloud

- Mandatory `source` block distinguishing:
  - Generating agent / tool name and version  
  - Local vs cloud execution  
  - Human vs automated  
- Optional cryptographic signature or checksum for high-assurance environments.  
- Cloud-generated traces should be downloadable/committable without vendor lock-in of the content.

### 4.7 Conflict Prevention

- One primary writer per file type where possible (e.g., daily report written once per day by a designated agent or CI job).  
- Use date- or ID-based filenames rather than appending to a single growing file.  
- For concurrent PR analyses, use PR-number filenames.  
- Prefer “append-only + supersede” over in-place mutation of historical records.  
- Document a simple merge strategy in the README (e.g., “keep both dated files; index.json is regenerated”).

### 4.8 Sensitive-Data Exclusions

- `.trace/.gitignore` (or root `.gitignore` entries) must exclude:
  - Local-only drafts  
  - Files containing secrets, PII, credentials, internal URLs, customer data  
  - Large binary artifacts  
- Agents must be instructed (via `AGENTS.md` / rules) never to write secrets into `.trace/`.  
- Support redaction markers or “sensitive: true” flags that dashboards can honor.  
- Recommend scanning or pre-commit hooks for common secret patterns.

### 4.9 Repository-Size Control

- Keep individual reports concise (target < 50–100 KB).  
- Prefer links to external artifacts (CI logs, full PR diffs) over embedding them.  
- Optional compression or archival of old daily reports into quarterly folders.  
- Index files should stay small; full-text search can be delegated to Git or external tools.  
- Discourage committing large generated JSON blobs of embeddings or raw conversation transcripts.

### 4.10 Compatibility with Multiple AI Agents and Vendors

- Treat `.trace/` as a **shared write target** analogous to how `AGENTS.md` is a shared read target.  
- Document a minimal “write contract” so any agent (Claude, Cursor, Codex, open-source agents, CI bots) can produce compliant files.  
- Provide reference implementations or prompt snippets for popular agents.  
- Do not require a specific MCP server or proprietary API for basic compliance.  
- Allow optional richer integrations (dashboard sync, semantic search) on top of the file format.

### 4.11 Additional Recommended Principles

- **Complement, don’t replace** ADRs and `AGENTS.md`. Point to them from `.trace/rules/` or decision records.  
- **Human oversight**: generated traces should be reviewable; important decisions still warrant explicit human confirmation.  
- **Discoverability**: `README.md` + `index.json` so both humans and agents can navigate without scanning the whole tree.  
- **Extensibility**: allow vendor-specific extensions under a namespaced key while keeping the core schema stable.

---

## 5. Strengths, Failure Modes, Adoption, and Interoperability of Related Systems

| System              | Strengths                                      | Failure Modes                              | Adoption / Interop                  |
|---------------------|------------------------------------------------|--------------------------------------------|-------------------------------------|
| AGENTS.md / CLAUDE.md | Simple, widely supported, Git-native          | Stale, token-heavy, tool divergence        | High (60k+ repos)                  |
| ADRs                | Mature, focused on “why”, tooling ecosystem    | Narrow scope, under-maintained             | High in architecture-conscious teams |
| Cline Memory Bank   | Structured, agent-updatable Markdown           | Manual discipline required, no schema      | Community / Cline users            |
| agentmemory / Mem0 et al. | Powerful retrieval, cross-session             | External dependency, less Git-native       | Growing among power users          |
| Vendor memories (Windsurf etc.) | Automatic capture                             | Non-portable, local-only                   | Vendor-specific                    |
| Conventional Commits + Changelog | Automated, standard                           | Surface-level only                         | Very high                          |

Common failure modes across the board: context bloat, staleness, lack of provenance, merge noise, and accidental commitment of secrets.

---

## 6. Assessment: Can `.trace` Become a Meaningful Open Standard?

**Yes — as a complementary standard, not a replacement.**

**Arguments in favor**
- Clear unmet need for portable, chronological, multi-agent operational memory that lives beside the code.  
- Builds on proven patterns (Markdown + front-matter, dated files, Git references) already familiar to developers.  
- Low barrier: any agent that can write a file can participate.  
- Natural pairing with `AGENTS.md` (instructions) and ADRs (architectural decisions).  
- Dashboard and analytics vendors could consume a common format, reducing lock-in.

**Risks and conditions for success**
- Must stay minimal; feature creep will kill adoption.  
- Needs a small set of reference implementations and clear “write” prompts for the major coding agents.  
- Governance should be lightweight (e.g., a GitHub organization or RFC-style process similar to AGENTS.md).  
- Privacy and size controls must be first-class, otherwise enterprises will refuse to adopt.  
- If the originating product keeps proprietary extensions closed, the open core must still be useful on its own.

**Recommendation**  
Publish `.trace` as an open specification (schema + directory conventions + minimal metadata) under a permissive license. Position it explicitly as the “operational and chronological memory” counterpart to `AGENTS.md` (instructions) and ADRs (architecture). Keep an internal product format only for experimental or value-added features that later graduate into the open schema.

If the specification remains internal, it will function well for a single vendor’s ecosystem but will forfeit the interoperability and community momentum that `AGENTS.md` and ADRs have already demonstrated.

---

## 7. References and Further Reading

- AGENTS.md — https://agents.md/  
- Architecture Decision Records — https://adr.github.io/ and https://github.com/architecture-decision-record/architecture-decision-record  
- adr-tools — https://github.com/npryce/adr-tools  
- Log4brains — https://github.com/thomvaill/log4brains  
- Claude Code documentation (CLAUDE.md, .claude/, MEMORY)  
- Cline Memory Bank community patterns and MCP variants  
- agentmemory — https://github.com/rohitg00/agentmemory  
- Keep a Changelog — https://keepachangelog.com/  
- Conventional Commits — https://www.conventionalcommits.org/  
- GitHub CODEOWNERS documentation  
- Various 2025–2026 discussions on persistent memory for coding agents (Reddit, blogs, Mem0, Letta, etc.)

---

*This report synthesizes publicly available conventions, tools, and discussions as of August 2026. No exact pre-existing open standard matching the full proposed `.trace` design was identified.*
