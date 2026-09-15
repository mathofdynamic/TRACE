export interface NarrativeItem {
  index: string;
  title: string;
  description: string;
  evidenceTag: string;
  evidenceSnippet: string;
}

export interface ExecutionComparisonItem {
  mode: string;
  status: string;
  active: boolean;
  sourceHandling: string;
  parsing: string;
  governance: string;
  storage: string;
}

export const narrativeItems: NarrativeItem[] = [
  {
    index: '01',
    title: 'Understand change',
    description:
      'Connect what changed to original intent, deterministic AST evidence, affected boundaries, and unfinished work.',
    evidenceTag: 'Deterministic AST Check',
    evidenceSnippet: 'stream.rs:48 · No unbounded buffer allocations',
  },
  {
    index: '02',
    title: 'See parallel work',
    description:
      'Surface possible conflicts across active branches before concurrent PRs make coordination expensive.',
    evidenceTag: 'Collision Detector',
    evidenceSnippet: 'PR #88 vs #89 · user_workspaces migration conflict',
  },
  {
    index: '03',
    title: 'Keep the record',
    description:
      'Preserve decisions, risks, and reports as readable repository artifacts, not ephemeral dashboard-only state.',
    evidenceTag: 'Durable Artifact',
    evidenceSnippet: '.trace/reports/daily/2026-08-19.md · Hash 1e9b8a',
  },
];

export const executionComparison: ExecutionComparisonItem[] = [
  {
    mode: 'Local Execution',
    status: 'Active · Production Ready',
    active: true,
    sourceHandling: 'Never leaves machine (0 bytes transmitted)',
    parsing: 'Local AST & symbol extraction',
    governance: 'Local rule verification & CLI reporting',
    storage: 'Local .trace/ directory in repository',
  },
  {
    mode: 'Hybrid Intelligence',
    status: 'Active · Selective Sync',
    active: true,
    sourceHandling: 'Only signed metadata & summaries uploaded',
    parsing: 'Client-side redaction before push',
    governance: 'Team dashboard & conflict detection',
    storage: 'Repository-native + synchronized view',
  },
  {
    mode: 'Cloud Coordination',
    status: 'Planned · Opt-in Policy',
    active: false,
    sourceHandling: 'Ephemeral isolated sandbox (Opt-in only)',
    parsing: 'Automated webhook evaluation pipeline',
    governance: 'Multi-repo organization policy enforcement',
    storage: 'Enterprise artifact registry backup',
  },
];
