export interface SpecQuestion {
  id: string;
  number: string;
  title: string;
  summary: string;
  details: string[];
  snippetTitle: string;
  snippetType: 'yaml' | 'markdown' | 'json';
  snippet: string;
}

export interface LifecycleNode {
  stage: string;
  title: string;
  role: string;
  description: string;
  boundaryNote: string;
  active?: boolean;
}

export interface ArtifactRelationship {
  name: string;
  path: string;
  type: string;
  format: 'Markdown + Frontmatter' | 'YAML' | 'JSON Index';
  role: string;
  upstream: string;
  downstream: string;
}

export const specLifecycleNodes: LifecycleNode[] = [
  {
    stage: '01',
    title: 'Local Analysis',
    role: 'AST & Git Extraction',
    description:
      'Deterministic parser inspects commits, diffs, symbol dependencies, and active branch state locally.',
    boundaryNote: 'Raw source stays on local disk',
    active: true,
  },
  {
    stage: '02',
    title: 'Approved .trace Artifact',
    role: 'Durable Repository Record',
    description:
      'Human-readable Markdown with structured YAML frontmatter is committed or staged directly into .trace/.',
    boundaryNote: 'Versioned with Git commit tree',
    active: true,
  },
  {
    stage: '03',
    title: 'Optional Sync',
    role: 'Cryptographic Transport Gate',
    description:
      'If hybrid mode is configured, signed metadata & summaries are synchronized over HTTPS.',
    boundaryNote: 'sourceCodeIncluded: false',
  },
  {
    stage: '04',
    title: 'Dashboard Projection',
    role: 'Presentation Lens',
    description:
      'TRACE web UI indexes and projects artifacts for team navigation without acting as primary source of truth.',
    boundaryNote: 'Ephemeral presentation layer',
  },
];

export const artifactRelationships: ArtifactRelationship[] = [
  {
    name: 'Configuration & Rules',
    path: '.trace/config.yml',
    type: 'Root Schema',
    format: 'YAML',
    role: 'Defines schema version, model provider endpoints, and team governance policies.',
    upstream: 'Repository root & team rules',
    downstream: 'CLI parser & worker runtime',
  },
  {
    name: 'Pull Request Briefs',
    path: '.trace/pull-requests/142.md',
    type: 'Durable Memory',
    format: 'Markdown + Frontmatter',
    role: 'Dense, evidence-backed change summaries, risk assessments, and migration warnings.',
    upstream: 'Git diff + PR metadata',
    downstream: 'Reviewer briefs & daily digest',
  },
  {
    name: 'Daily & Weekly Reports',
    path: '.trace/reports/daily/2026-08-20.md',
    type: 'Temporal Synthesis',
    format: 'Markdown + Frontmatter',
    role: 'Rollup of repository changes, architectural drift, resolved discussions, and active risks.',
    upstream: 'Committed PRs & decisions',
    downstream: 'Team timeline & dashboard projection',
  },
  {
    name: 'Decisions & Architecture',
    path: '.trace/decisions/DEC-2026-0042.md',
    type: 'Governance Record',
    format: 'Markdown + Frontmatter',
    role: 'Lightweight decision records linking PR evidence directly to architectural rules.',
    upstream: 'Engineer intent & discussions',
    downstream: 'AST rule checks in future PRs',
  },
  {
    name: 'Risks & Conflicts',
    path: '.trace/risks/RISK-2026-0017.md',
    type: 'Risk Artifact',
    format: 'Markdown + Frontmatter',
    role: 'Concurrent branch collision warnings and breaking schema divergence notices.',
    upstream: 'Multi-branch AST collision engine',
    downstream: 'Merge blocker & remediation steps',
  },
  {
    name: 'Runtime & Sync State',
    path: '.trace/state/sync.json',
    type: 'Operational State',
    format: 'JSON Index',
    role: 'Local sync sequence tracking, hash trees, and schema validation timestamps.',
    upstream: 'CLI execution events',
    downstream: 'Control plane reconciler',
  },
];

export const specQuestions: SpecQuestion[] = [
  {
    id: 'what-it-holds',
    number: '01',
    title: 'What it holds',
    summary:
      'Human-readable Markdown files accompanied by structured, machine-parsable YAML frontmatter and JSON operational indexes.',
    details: [
      'Reports: Daily digests and weekly engineering rollups.',
      'Pull-request briefs: Dense risk analyses, invariant verifications, and test impact summaries.',
      'Decisions & risks: Architectural decision records (ADRs) with explicit provenance and links.',
      'Rules & state: Team invariants, AST memory limits, and branch sync indexes.',
    ],
    snippetTitle: '.trace/pull-requests/142.md (Schema v0.1)',
    snippetType: 'markdown',
    snippet: `---
schema_version: "0.1.0"
id: "PR-2026-0142"
artifact_type: "pr_brief"
target_repository: "mathofdynamic/TRACE"
source_branch: "feature/schema-hardening"
base_branch: "main"
evidence_references:
  - "commit:9f2c81a"
  - "ast_rule:db-memory-bounds"
confidence: "high"
review_status: "verified"
source_code_included: false
created_at: "2026-08-20T07:15:00Z"
---

# PR #142: Schema Hardening & Bounded Invariants

## Findings
- Added bounded JSON parser verification ensuring <1MB memory usage during symbol extraction.
- Zero source code transmitted across network boundary.`,
  },
  {
    id: 'how-it-relates',
    number: '02',
    title: 'How it relates',
    summary:
      'Git records code history; AGENTS.md establishes model rules; .trace binds understanding, provenance, and governance into the repository tree.',
    details: [
      'Git is the sole authority: Artifacts live in the repo tree, committed or ignored based on team preference.',
      'Provenance graphs: Every claim links directly to Git SHAs, file path AST nodes, or explicit rule IDs.',
      'No proprietary database lock-in: Exporting or cloning the repository preserves the entire history of understanding.',
    ],
    snippetTitle: '.trace/config.yml (Governance & Provenance)',
    snippetType: 'yaml',
    snippet: `version: "0.1"
repository: "mathofdynamic/TRACE"
governance:
  allow_local_inference: true
  source_code_included: false
  rules:
    - path: ".trace/rules/architecture.md"
      enforce_on: ["pull_request", "commit"]
provenance:
  require_git_sha_links: true
  min_confidence: "medium"`,
  },
  {
    id: 'how-it-travels',
    number: '03',
    title: 'How it travels',
    summary:
      'Identical schema across Local CLI, CI pipelines, and Cloud control planes. Sensitive credentials and raw code are excluded by design.',
    details: [
      'Unified schema contract: The exact same artifact format is parsed by local CLI, GitHub Actions, and TRACE Cloud.',
      'Strict redaction gate: Credentials, tokens, raw source files, and private prompt contexts are rejected by schema validators.',
      'Selective synchronization: In hybrid mode, teams approve exactly which artifact types leave the boundary.',
    ],
    snippetTitle: 'Artifact Transport Validator Invariant',
    snippetType: 'json',
    snippet: `{
  "$schema": "https://trace.dev/schemas/v0.1/artifact-transport.json",
  "invariants": {
    "sourceCodeIncluded": false,
    "secretsIncluded": false,
    "rawPromptsIncluded": false
  },
  "supportedRuntimes": ["cli", "github-actions", "cloud-worker"]
}`,
  },
  {
    id: 'current-state',
    number: '04',
    title: 'Current state',
    summary:
      'Experimental RFC-001 standard. Version 0.1 schema implementation in progress with strict validation test suites.',
    details: [
      'Active reference implementation: In-tree Markdown serializers, Zod validators, and CLI readers.',
      'Backward compatibility guarantee: Versioned frontmatter enables progressive schema migrations.',
      'Open specification: Independent of any proprietary cloud hosting or specific LLM vendor.',
    ],
    snippetTitle: 'Specification Stability & Version Matrix',
    snippetType: 'json',
    snippet: `{
  "specification": "RFC-001",
  "status": "Experimental / RFC",
  "currentSchemaVersion": "0.1.0",
  "validatorSuite": "packages/trace-rules",
  "conformance": "100% in-tree coverage"
}`,
  },
];
