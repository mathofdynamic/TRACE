export interface ProductPipelineNode {
  step: string;
  stage: string;
  label: string;
  description: string;
  active?: boolean;
}

export interface ProductCapability {
  index: string;
  pipelineStage: string;
  category: string;
  title: string;
  value: string;
  statusNote: string;
  preview: {
    header: string;
    badge: string;
    body: string;
    evidence: string;
    footer: string;
  };
}

export interface BoundaryItem {
  title: string;
  description: string;
  tag: string;
}

export interface ProductStatusItem {
  exists: string[];
  planned: string[];
}

export const pipelineNodes: ProductPipelineNode[] = [
  {
    step: '01',
    stage: 'Intent',
    label: 'Goal / RFC',
    description: 'Why this change exists',
  },
  {
    step: '02',
    stage: 'Change',
    label: 'GitHub PR',
    description: 'What files and symbols changed',
  },
  {
    step: '03',
    stage: 'Evidence',
    label: 'Local AST Checks',
    description: 'Deterministic rule evaluation',
    active: true,
  },
  {
    step: '04',
    stage: 'Intelligence',
    label: 'TRACE Reasoning',
    description: 'Change briefs & multi-PR collisions',
    active: true,
  },
  {
    step: '05',
    stage: 'Record',
    label: '.trace Artifact',
    description: 'Durable repository memory in Git',
  },
];

export const capabilities: ProductCapability[] = [
  {
    index: '01',
    pipelineStage: 'Pipeline Stage 02 Ã¢â€ â€™ 03 Ã‚Â· Change & Evidence',
    category: 'PR Intelligence',
    title: 'PR intelligence',
    value:
      'A concise brief for intent, affected surfaces, evidence, findings, incomplete work, and recommended review.',
    statusNote: 'Deterministic engine active Ã‚Â· Local CLI validated',
    preview: {
      header: 'PR #41 Intelligence Brief Ã‚Â· example-repository',
      badge: 'Deterministic',
      body: 'Verified rule: Deterministic Memory Bounds Policy on ring-buffer stream.',
      evidence: 'stream.rs:48 Ã‚Â· AST bounded allocation verified Ã‚Â· 0 secret leaks',
      footer: 'Verification: Deterministic AST Ã‚Â· Status: Ready for review',
    },
  },
  {
    index: '02',
    pipelineStage: 'Pipeline Stage 03 Ã¢â€ â€™ 04 Ã‚Â· Multi-Branch Intelligence',
    category: 'Conflict Detection',
    title: 'Concurrent-change conflicts',
    value:
      'Reason across active work simultaneously, not only one pull request at a time. Deterministic overlap and semantic conflict signals remain strictly separate.',
    statusNote: 'Multi-PR overlap analysis Ã‚Â· Separate deterministic & semantic signals',
    preview: {
      header: 'Shared workspace Ã‚Â· Collision Detected',
      badge: 'Attention Required',
      body: 'Concurrent schema mutation collision between PR #88 and PR #89 on user_workspaces table.',
      evidence: 'Finding: schema-collision-001 Ã‚Â· Classification: Deterministic schema collision',
      footer: 'Resolution: Staged migration ordering required before merge',
    },
  },
  {
    index: '03',
    pipelineStage: 'Pipeline Stage 04 Ã‚Â· Synthesis & Temporal Memory',
    category: 'Reports & Reasoning',
    title: 'Daily and weekly reports',
    value:
      'Summarize meaningful change, decisions, risks, and unresolved coordination questions without turning engineering into individual productivity scores.',
    statusNote: 'Markdown & YAML frontmatter Ã‚Â· Portable artifact',
    preview: {
      header: 'Daily Project Report Ã‚Â· 2026-08-19',
      badge: 'Current HEAD',
      body: '3 changes reviewed Ã‚Â· 1 architectural decision recorded Ã‚Â· 0 productivity rankings',
      evidence: 'Commit: 1e9b8a4746f3 Ã‚Â· Provenance: example-repository',
      footer: 'Output: .trace/reports/daily/2026-08-19.md',
    },
  },
  {
    index: '04',
    pipelineStage: 'Pipeline Stage 05 Ã‚Â· Durable Storage Authority',
    category: 'Portable Memory',
    title: 'A durable project record',
    value:
      'Decisions, risks, evidence, and reports live as readable .trace artifacts. The dashboard helps navigate the record, never becomes its only copy.',
    statusNote: 'Open specification Ã‚Â· Versioned repository files',
    preview: {
      header: '.trace/decisions/0001-single-direction-sync.md',
      badge: 'Git-native',
      body: 'Decision: Single-Direction Local-to-Cloud Intelligence Synchronization with constant-time digest verification.',
      evidence:
        'Schema: v0.1 Ã‚Â· Invariant: sourceCodeIncluded: false Ã‚Â· 100% offline accessible',
      footer: 'Repository authority: Git tree is the sole single source of truth',
    },
  },
];

export const boundaryItems: BoundaryItem[] = [
  {
    title: 'Analysis stays local',
    description:
      'Parsing, AST symbol extraction, and deterministic rule evaluation execute entirely in your local environment.',
    tag: 'Execution Engine',
  },
  {
    title: 'Source code is never synchronized',
    description:
      'The .trace contract strictly enforces sourceCodeIncluded: false and codeSnippetsIncluded: false on all artifact payloads.',
    tag: 'Privacy Invariant',
  },
  {
    title: 'Selective metadata synchronization',
    description:
      'Only explicitly approved, source-free summaries and decisions are transmitted when hybrid mode is active.',
    tag: 'Hybrid Policy',
  },
  {
    title: 'Git as the sole authority',
    description:
      'The dashboard is an ephemeral lens. If TRACE servers disappear, your .trace directory remains complete and readable in Git.',
    tag: 'Data Sovereignty',
  },
];

export const productStatus: ProductStatusItem = {
  exists: [
    'Local CLI analysis & deterministic rule evaluation',
    '.trace version 0.1 schema specification & validator',
    'Concurrent change & schema migration collision detectors',
    'Daily & weekly report generation in Markdown with YAML metadata',
    'Web preview dashboard, command center & repository switcher',
    'Zero source code transmission invariant (sourceCodeIncluded: false)',
  ],
  planned: [
    'Automated GitHub Checks and check-run annotations',
    'Cloud-hosted background job orchestration & webhooks',
    'Multi-tenant team administration & organization policies',
    'Continuous cross-repository dependency synchronization',
  ],
};
