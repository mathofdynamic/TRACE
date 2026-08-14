export type ExecutionMode = 'local' | 'cloud' | 'hybrid';

export type JobState =
  | 'queued'
  | 'collecting'
  | 'analyzing'
  | 'validating'
  | 'awaiting-approval'
  | 'publishing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type EvidenceClassification = 'deterministic' | 'correlated' | 'semantic' | 'uncertain';

export type ChangedFile = {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unknown';
  oldPath?: string;
  additions?: number;
  deletions?: number;
};

export type NormalizedChangeSet = {
  repository: { provider: string; owner?: string; name: string; root: string };
  baseRef?: string;
  headRef?: string;
  commits: Array<{ sha: string; subject: string; author?: string; authoredAt?: string }>;
  changedFiles: ChangedFile[];
  additions: number;
  deletions: number;
  workingTree: 'clean' | 'dirty' | 'unknown';
  evidence: Array<{ type: 'commit' | 'file' | 'branch' | 'repository'; locator: string }>;
};

export type SyncSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';
export type SyncPolicy = {
  allowedArtifactTypes: string[];
  maximumSensitivity: SyncSensitivity;
  localOnlyPaths: string[];
  structuredOnly: boolean;
  requireApproval: boolean;
  allowedOrigins: Array<'local' | 'cloud' | 'ci' | 'third_party'>;
};

export type ArtifactManifestEntry = {
  id: string;
  path: string;
  artifactType: string;
  checksum: string;
  sensitivity: SyncSensitivity;
  revision: string;
  sizeBytes: number;
};

export type SyncManifest = {
  protocolVersion: '0.1';
  repository: string;
  repositoryId?: string;
  syncId?: string;
  schemaVersion?: '0.1';
  traceVersion?: string;
  executionOrigin?: 'local';
  baseOperationId?: string | null;
  git?: { branch: string; headCommit: string };
  generatedAt: string;
  sourceCodeIncluded: false;
  codeSnippetsIncluded?: false;
  artifacts: ArtifactManifestEntry[];
};

export type SyncDecision = {
  path: string;
  action: 'upload' | 'skip' | 'reject' | 'conflict';
  reason: string;
};

const sensitivityRank: Record<SyncSensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export function createSyncPlan(
  manifest: SyncManifest,
  policy: SyncPolicy,
  remote: ArtifactManifestEntry[],
) {
  const remoteByPath = new Map(remote.map((entry) => [entry.path, entry]));
  return manifest.artifacts.map<SyncDecision>((artifact) => {
    if (
      policy.localOnlyPaths.some(
        (path) => artifact.path === path || artifact.path.startsWith(`${path}/`),
      )
    ) {
      return { path: artifact.path, action: 'skip', reason: 'path is local-only by policy' };
    }
    if (!policy.allowedArtifactTypes.includes(artifact.artifactType)) {
      return { path: artifact.path, action: 'reject', reason: 'artifact type is not allowlisted' };
    }
    if (sensitivityRank[artifact.sensitivity] > sensitivityRank[policy.maximumSensitivity]) {
      return {
        path: artifact.path,
        action: 'reject',
        reason: 'sensitivity exceeds policy maximum',
      };
    }
    const existing = remoteByPath.get(artifact.path);
    if (existing?.checksum === artifact.checksum)
      return { path: artifact.path, action: 'skip', reason: 'checksum already synchronized' };
    if (existing && existing.revision !== artifact.revision)
      return {
        path: artifact.path,
        action: 'conflict',
        reason: 'local and remote revisions diverged',
      };
    return { path: artifact.path, action: 'upload', reason: 'remote artifact is missing or older' };
  });
}

export function redactSyncText(text: string, patterns: RegExp[] = []) {
  const categories = new Set<string>();
  let redacted = text.replace(
    /(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s\n]+/gi,
    (match) => {
      categories.add('secret-like-value');
      return match.replace(/[:=]\s*[^\s\n]+$/, ': [REDACTED]');
    },
  );
  for (const pattern of patterns) {
    if (pattern.test(redacted)) categories.add('configured-pattern');
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return { text: redacted, categories: [...categories] };
}

export const defaultLocalSyncPolicy: SyncPolicy = {
  allowedArtifactTypes: [
    'analysis',
    'daily_report',
    'weekly_report',
    'pr_brief',
    'decision',
    'risk',
    'debt',
    'conflict',
    'rule',
    'index',
  ],
  maximumSensitivity: 'internal',
  localOnlyPaths: ['state', 'cache', 'logs', 'prompts', 'transcripts'],
  structuredOnly: false,
  requireApproval: true,
  allowedOrigins: ['local'],
};
