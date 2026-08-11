export const traceConfig = {
  artifactSchemaVersion: '0.1',
  supportedLanguages: ['typescript', 'javascript'] as const,
  executionModes: ['local', 'cloud', 'hybrid'] as const,
} as const;

export const defaultFeatureFlags = {
  cloudSourceAnalysis: false,
  semanticPrFindings: false,
  semanticConflictDetection: false,
  githubCommentPublication: false,
  repositoryWriteProposals: false,
  scheduledReports: false,
  hybridSync: false,
  mandatoryOrganizationRules: false,
} as const;

export type TraceFeatureFlags = { [Key in keyof typeof defaultFeatureFlags]: boolean };

export function resolveFeatureFlags(overrides: Partial<TraceFeatureFlags> = {}): TraceFeatureFlags {
  return { ...defaultFeatureFlags, ...overrides };
}
