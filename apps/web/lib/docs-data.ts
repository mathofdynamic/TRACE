export interface DocSourceItem {
  id: string;
  name: string;
  purpose: string;
  path: string;
  url: string;
  category:
    | 'Overview'
    | 'Architecture'
    | 'Design'
    | 'Workflow'
    | 'Integration'
    | 'Internal / Contributor';
}

export interface CliCommandStep {
  id: string;
  command: string;
  explanation: string;
  contextNote?: string;
  outputFormat?: string;
}

export interface WorkflowStage {
  step: string;
  title: string;
  description: string;
  command: string;
  boundaryGuarantee: string;
}

export const sourceDocuments: DocSourceItem[] = [
  {
    id: 'readme-quickstart',
    name: 'README & Quick Start',
    purpose: 'Repository quick start, CLI commands summary, and local analysis architecture.',
    path: 'README.md',
    url: 'https://github.com/mathofdynamic/TRACE/blob/main/README.md',
    category: 'Overview',
  },
  {
    id: 'local-dashboard-workflow',
    name: 'Local-to-Dashboard Workflow',
    purpose:
      'First connection walkthrough, signed artifact staging, review boundaries, and sync transport.',
    path: 'DOC/local-dashboard-workflow.md',
    url: 'https://github.com/mathofdynamic/TRACE/blob/main/DOC/local-dashboard-workflow.md',
    category: 'Workflow',
  },
  {
    id: 'technical-overview',
    name: 'Technical Overview & .trace RFC',
    purpose:
      'AST boundary rules, .trace schema v0.1 specification, and source-exclusion guarantees.',
    path: 'DOC/technical-overview.md',
    url: 'https://github.com/mathofdynamic/TRACE/blob/main/DOC/technical-overview.md',
    category: 'Architecture',
  },
  {
    id: 'project-overview',
    name: 'Project Overview & Principles',
    purpose: 'Product thesis, developer coordination model, and noise-elimination principles.',
    path: 'DOC/project-overview.md',
    url: 'https://github.com/mathofdynamic/TRACE/blob/main/DOC/project-overview.md',
    category: 'Overview',
  },
  {
    id: 'github-app-setup',
    name: 'GitHub App & Webhooks',
    purpose: 'Signed webhook pipelines, event deduplication, idempotency tokens, and OAuth scopes.',
    path: 'DOC/github-app-setup.md',
    url: 'https://github.com/mathofdynamic/TRACE/blob/main/DOC/github-app-setup.md',
    category: 'Integration',
  },
  {
    id: 'design-spec',
    name: 'Design Specification',
    purpose:
      'Authoritative UI/UX rules, typography scales, dark-first color universe, and component design.',
    path: 'Design-system/TRACE-DESIGN-SPEC.md',
    url: 'https://github.com/mathofdynamic/TRACE/blob/main/Design-system/TRACE-DESIGN-SPEC.md',
    category: 'Design',
  },
  {
    id: 'roadmap-prompts',
    name: 'Implementation Roadmap',
    purpose:
      'Internal contributor phase execution breakdown, non-negotiable invariants, and test coverage standards.',
    path: 'Implementation-Prompts/README.md',
    url: 'https://github.com/mathofdynamic/TRACE/tree/main/Implementation-Prompts',
    category: 'Internal / Contributor',
  },
];

export const localAnalysisCommands: CliCommandStep[] = [
  {
    id: 'trace-init',
    command: 'trace init',
    explanation:
      'Scaffold the root `.trace/` directory structure, local configuration, and schema definitions.',
    contextNote: 'Initializes `.trace/config.yml` with team governance rules',
  },
  {
    id: 'trace-analyze-changes',
    command: 'trace analyze changes',
    explanation:
      'Deterministic AST analysis of staged diffs, branch divergence, and symbol-level impacts.',
    contextNote: 'Zero source code leaves disk; AST extracts structured facts only',
    outputFormat: '.trace/changes/index.json',
  },
  {
    id: 'trace-report-daily',
    command: 'trace report daily --write --yes',
    explanation:
      'Synthesize verified repository changes, merged pull requests, and architectural drift into a daily report.',
    contextNote: 'Produces human-readable Markdown with versioned YAML frontmatter',
    outputFormat: '.trace/reports/daily/YYYY-MM-DD.md',
  },
  {
    id: 'trace-validate',
    command: 'trace validate',
    explanation:
      'Verify that all `.trace/` Markdown files, ADRs, and indexes strictly comply with schema v0.1.',
    contextNote: 'Runs Zod & JSON schema validation before commit or sync',
  },
];

export const syncWorkflowCommands: CliCommandStep[] = [
  {
    id: 'trace-login',
    command: 'trace login',
    explanation:
      'Acquire an isolated, revocable CLI authentication credential via browser handshake.',
    contextNote: 'Credentials stored locally; distinct from web session tokens',
  },
  {
    id: 'trace-connect',
    command: 'trace connect',
    explanation: 'Bind the local Git repository remote to its registered TRACE cloud workspace.',
    contextNote: 'Validates target repository ownership and authorization',
  },
  {
    id: 'trace-analyze',
    command: 'trace analyze',
    explanation:
      'Execute full repository AST indexing and write structured understanding to `.trace/`.',
    contextNote: 'Processes commits, dependencies, and PR briefs locally',
  },
  {
    id: 'trace-sync-dry-run',
    command: 'trace sync --dry-run',
    explanation:
      'Inspect the exact manifest of metadata to be synchronized without transmitting any payload.',
    contextNote: 'Shows included metadata records and confirms 0 bytes of source code transmitted',
  },
  {
    id: 'trace-sync',
    command: 'trace sync',
    explanation:
      'Publish the approved, source-free metadata snapshot to the cloud projection layer.',
    contextNote: 'Enforces sourceCodeIncluded: false invariant via transport schema',
  },
];

export const localToDashboardStages: WorkflowStage[] = [
  {
    step: '01',
    title: 'Local AST Extraction',
    description: 'CLI parses repository symbols, commits, and diffs on your local machine.',
    command: 'trace analyze',
    boundaryGuarantee: 'Raw source stays on local disk',
  },
  {
    step: '02',
    title: 'Versioned Markdown Record',
    description:
      'Human-readable artifacts with structured frontmatter are written directly to .trace/.',
    command: 'trace report daily',
    boundaryGuarantee: 'Committed to repository Git tree',
  },
  {
    step: '03',
    title: 'Dry-Run Verification',
    description:
      'Inspect the cryptographic manifest to verify no private code or secrets are synchronized.',
    command: 'trace sync --dry-run',
    boundaryGuarantee: 'sourceCodeIncluded: false check',
  },
  {
    step: '04',
    title: 'Projection Sync',
    description: 'Approved metadata snapshot is transmitted over HTTPS to project on the web UI.',
    command: 'trace sync',
    boundaryGuarantee: 'Ephemeral dashboard presentation',
  },
];
