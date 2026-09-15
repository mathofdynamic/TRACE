export interface TrustBoundaryNode {
  stage: string;
  title: string;
  scope: string;
  rule: string;
  status: string;
  active?: boolean;
}

export interface SecurityMatrixItem {
  boundary: string;
  iconTag: string;
  title: string;
  currentBehavior: string;
  excludedNotClaimed: string;
  invariantStatus: string;
}

export interface NotClaimedItem {
  label: string;
  detail: string;
}

export const trustBoundaryNodes: TrustBoundaryNode[] = [
  {
    stage: '01',
    title: 'Local Repository & CLI',
    scope: 'Local Environment',
    rule: 'Raw source code stays strictly on machine (0 bytes transmitted)',
    status: 'Local Invariant',
    active: true,
  },
  {
    stage: '02',
    title: 'Approved Record Boundary',
    scope: 'Verification Gate',
    rule: 'Only signed metadata & .trace artifacts allowed across boundary',
    status: 'Strict Gate',
    active: true,
  },
  {
    stage: '03',
    title: 'TRACE Dashboard',
    scope: 'Presentation Layer',
    rule: 'Ephemeral view of project memory; Git remains sole authority',
    status: 'View Lens',
  },
];

export const trustBoundaryGates = [
  {
    label: 'sourceCodeIncluded: false',
    description: 'Raw file contents and private buffers are excluded at the parser AST boundary.',
  },
  {
    label: 'codeSnippetsIncluded: false',
    description:
      'Context snippets and inline code extracts are redacted from synchronized payloads.',
  },
  {
    label: 'Secrets & Prompts Redacted',
    description:
      'API keys, credentials, and raw model conversations are forbidden from .trace outputs.',
  },
];

export const securityMatrix: SecurityMatrixItem[] = [
  {
    boundary: 'Local Engine & Workspace',
    iconTag: 'Local Execution',
    title: 'Local mode',
    currentBehavior:
      'Local analysis executes entirely within the project environment. AST symbol extraction, conflict scanning, and deterministic checks run without requiring source-code upload to TRACE Cloud.',
    excludedNotClaimed:
      'Zero required source-code transmission. Raw repository files, uncommitted buffers, and local environment variables never leave your machine.',
    invariantStatus: 'Active Invariant Â· 0 bytes source transmitted',
  },
  {
    boundary: 'Cloud Ingestion & Processing',
    iconTag: 'Hybrid & Cloud',
    title: 'Cloud mode',
    currentBehavior:
      'Cloud coordination requires explicitly configured repository and model-provider boundaries. Only signed summaries, conflict digests, and approved .trace records are processed.',
    excludedNotClaimed:
      'Retention, deletion policies, and third-party model provider behaviors are documented and auditable before production claims are made.',
    invariantStatus: 'Controlled Boundary Â· Configured scopes only',
  },
  {
    boundary: 'Credential & Content Sanitization',
    iconTag: 'Secret Isolation',
    title: 'Secrets',
    currentBehavior:
      'Credentials, tokens, prompts, raw source duplication, and private model conversations must not be written to .trace artifacts. Server-side secrets are kept outside browser and repository bundles.',
    excludedNotClaimed:
      'Automatic runtime secret remediation or unverified DLP guarantees are not claimed; developers remain responsible for local credentials.',
    invariantStatus: 'Sanitization Rule Â· Zero secret persistence',
  },
  {
    boundary: 'Enterprise Governance & Policy',
    iconTag: 'Roadmap Controls',
    title: 'Planned controls',
    currentBehavior:
      'Future phases introduce tenant authorization, tamper-evident audit logs, safe Markdown sandboxing, secret scanning, prompt-injection hardening, and quarantine workflows.',
    excludedNotClaimed:
      'SOC 2, ISO 27001, HIPAA, or formal regulatory compliance certifications are not claimed.',
    invariantStatus: 'Roadmap Â· Implementation in progress',
  },
];

export const notClaimedPoints: NotClaimedItem[] = [
  {
    label: 'No external compliance certifications',
    detail:
      'TRACE does not currently claim SOC 2, ISO 27001, HIPAA, GDPR certification, or a completed enterprise security audit.',
  },
  {
    label: 'No zero-retention third-party claims',
    detail:
      'External LLM model providers may retain temporary logs according to their enterprise terms unless self-hosted or network-isolated.',
  },
  {
    label: 'No absolute vulnerability immunity',
    detail:
      'AST parsers and tree-sitter bindings operate on untrusted input; sandboxing and memory limits are enforced but zero-day immunity is not claimed.',
  },
  {
    label: 'No developer surveillance metrics',
    detail:
      'TRACE will never implement individual developer rankings, keystroke logging, time tracking, or productivity scoring.',
  },
];
