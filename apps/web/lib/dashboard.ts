import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { schema } from '@trace/db';
import type { RequestDatabase } from './workspace';

export type AnalysisState =
  | 'unavailable'
  | 'not-started'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed';

export type DashboardRepository = {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string | null;
  visibility: string | null;
  state: string;
  lastSynchronizedAt: string | null;
  latestSync: {
    operationId: string;
    branch: string | null;
    headCommit: string | null;
    traceVersion: string;
    schemaVersion: string;
    completedAt: string;
    stale: boolean | null;
  } | null;
  analysis: {
    id: string;
    status: AnalysisState;
    updatedAt: string;
  } | null;
};

export type DashboardAttention = {
  id: string;
  kind: 'analysis-failed' | 'sync-failed' | 'finding' | 'risk' | 'conflict';
  title: string;
  detail: string;
  severity: string;
  classification: string;
  evidence: string[];
  repositoryId: string | null;
  repositoryName: string | null;
  updatedAt: string;
};

export type DashboardChange = {
  id: string;
  repositoryId: string;
  repositoryName: string;
  number: number;
  title: string;
  state: string;
  url: string | null;
  authorLogin: string | null;
  updatedAt: string;
};

export type DashboardActivity = {
  id: string;
  kind: 'repository-connected' | 'analysis' | 'sync' | 'audit';
  title: string;
  detail: string;
  occurredAt: string;
};

export type DashboardSyncedRecord = {
  id: string;
  artifactId: string;
  artifactType: string;
  repositoryId: string;
  repositoryName: string;
  title: string;
  summary: string;
  status: string | null;
  items: Array<{
    id: string;
    title: string;
    detail: string;
    severity?: string;
    classification?: string;
    evidence: string[];
  }>;
  generatedAt: string;
  syncedAt: string;
  origin: 'local';
  content: string;
};

export type DashboardSummary = {
  source: 'postgresql';
  workspace: {
    name: string;
    profileComplete: boolean;
    intendedUsage: string | null;
    executionMode: string | null;
  };
  setup: {
    authenticated: true;
    githubConnected: boolean;
    repositorySelected: boolean;
    repositoriesAvailable: number;
    analysisState: AnalysisState;
    cloudAnalysisAvailable: false;
    localAnalysisAvailable: true;
  };
  repositories: DashboardRepository[];
  attention: DashboardAttention[];
  latestChanges: DashboardChange[];
  latestReports: DashboardSyncedRecord[];
  conflicts: DashboardSyncedRecord[];
  decisions: DashboardSyncedRecord[];
  risks: DashboardSyncedRecord[];
  rules: DashboardSyncedRecord[];
  activity: DashboardActivity[];
  capabilities: {
    changes: boolean;
    conflicts: boolean;
    reports: boolean;
    decisions: boolean;
    rules: boolean;
    activity: boolean;
  };
};

function normalizeAnalysisState(status: string | null | undefined): AnalysisState {
  if (!status) return 'not-started';
  if (status === 'queued' || status === 'pending') return 'queued';
  if (status === 'running' || status === 'processing') return 'running';
  if (status === 'completed' || status === 'succeeded') return 'completed';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return 'not-started';
}

function latestWorkspaceName(organizations: Array<{ name: string }>, intendedUsage: string | null) {
  if (organizations[0]?.name) return organizations[0].name.replace(/ on GitHub$/, '');
  if (intendedUsage === 'team') return 'Team workspace';
  if (intendedUsage === 'organization') return 'Organization workspace';
  return 'Personal workspace';
}

export function deriveSetupState(input: {
  githubConnected: boolean;
  repositorySelected: boolean;
  latestAnalysisStatus?: string | null;
}) {
  const analysisState = !input.repositorySelected
    ? ('unavailable' as const)
    : normalizeAnalysisState(input.latestAnalysisStatus);
  return {
    authenticated: true as const,
    githubConnected: input.githubConnected,
    repositorySelected: input.repositorySelected,
    analysisState,
    cloudAnalysisAvailable: false as const,
    localAnalysisAvailable: true as const,
  };
}

export async function getDashboardSummary(
  db: RequestDatabase,
  userId: string,
): Promise<DashboardSummary> {
  const [profile] = await db
    .select({
      completed: schema.onboardingProfiles.completed,
      intendedUsage: schema.onboardingProfiles.intendedUsage,
      executionMode: schema.onboardingProfiles.executionMode,
    })
    .from(schema.onboardingProfiles)
    .where(eq(schema.onboardingProfiles.userId, userId))
    .limit(1);

  const organizations = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.memberships.organizationId, schema.organizations.id))
    .where(eq(schema.memberships.userId, userId));
  const organizationIds = organizations.map((organization) => organization.id);

  const installations = organizationIds.length
    ? await db
        .select({ id: schema.githubInstallations.id })
        .from(schema.githubInstallations)
        .where(
          and(
            inArray(schema.githubInstallations.organizationId, organizationIds),
            eq(schema.githubInstallations.state, 'active'),
          ),
        )
    : [];
  const repositoryRows = organizationIds.length
    ? await db
        .select({
          id: schema.githubRepositories.id,
          fullName: schema.githubRepositories.fullName,
          owner: schema.githubRepositories.owner,
          name: schema.githubRepositories.name,
          defaultBranch: schema.githubRepositories.defaultBranch,
          visibility: schema.githubRepositories.visibility,
          state: schema.githubRepositories.state,
          remoteHeadSha: schema.githubRepositories.remoteHeadSha,
          lastSynchronizedAt: schema.githubRepositories.lastSynchronizedAt,
          createdAt: schema.githubRepositories.createdAt,
        })
        .from(schema.githubRepositories)
        .where(inArray(schema.githubRepositories.organizationId, organizationIds))
        .orderBy(desc(schema.githubRepositories.updatedAt))
    : [];
  const activeRepositoryRows = repositoryRows.filter((repository) => repository.state === 'active');
  const activeRepositoryIds = activeRepositoryRows.map((repository) => repository.id);

  const completedSyncRows = activeRepositoryIds.length
    ? await db
        .select({
          id: schema.syncOperations.id,
          repositoryId: schema.syncOperations.repositoryId,
          branch: schema.syncOperations.branch,
          headCommit: schema.syncOperations.headCommit,
          traceVersion: schema.syncOperations.traceVersion,
          schemaVersion: schema.syncOperations.schemaVersion,
          completedAt: schema.syncOperations.completedAt,
        })
        .from(schema.syncOperations)
        .where(
          and(
            inArray(schema.syncOperations.repositoryId, activeRepositoryIds),
            eq(schema.syncOperations.status, 'completed'),
          ),
        )
        .orderBy(desc(schema.syncOperations.completedAt))
    : [];
  const latestSyncByRepository = new Map<string, (typeof completedSyncRows)[number]>();
  for (const operation of completedSyncRows) {
    if (!latestSyncByRepository.has(operation.repositoryId)) {
      latestSyncByRepository.set(operation.repositoryId, operation);
    }
  }

  const failedSyncRows = activeRepositoryIds.length
    ? await db
        .select({
          id: schema.syncOperations.id,
          repositoryId: schema.syncOperations.repositoryId,
          errorCode: schema.syncOperations.errorCode,
          updatedAt: schema.syncOperations.updatedAt,
        })
        .from(schema.syncOperations)
        .where(
          and(
            inArray(schema.syncOperations.repositoryId, activeRepositoryIds),
            eq(schema.syncOperations.status, 'failed'),
          ),
        )
        .orderBy(desc(schema.syncOperations.updatedAt))
        .limit(12)
    : [];

  const analysisRows = activeRepositoryIds.length
    ? await db
        .select({
          id: schema.analysisRuns.id,
          repositoryId: schema.analysisRuns.repositoryId,
          status: schema.analysisRuns.status,
          result: schema.analysisRuns.result,
          updatedAt: schema.analysisRuns.updatedAt,
        })
        .from(schema.analysisRuns)
        .where(
          and(
            inArray(schema.analysisRuns.organizationId, organizationIds),
            inArray(schema.analysisRuns.repositoryId, activeRepositoryIds),
          ),
        )
        .orderBy(desc(schema.analysisRuns.updatedAt))
        .limit(100)
    : [];
  const latestAnalysisByRepository = new Map<string, (typeof analysisRows)[number]>();
  for (const run of analysisRows) {
    if (run.repositoryId && !latestAnalysisByRepository.has(run.repositoryId)) {
      latestAnalysisByRepository.set(run.repositoryId, run);
    }
  }

  const repositories: DashboardRepository[] = activeRepositoryRows.map((repository) => {
    const analysis = latestAnalysisByRepository.get(repository.id);
    const latestSync = latestSyncByRepository.get(repository.id);
    return {
      id: repository.id,
      fullName: repository.fullName,
      owner: repository.owner,
      name: repository.name,
      defaultBranch: repository.defaultBranch,
      visibility: repository.visibility,
      state: repository.state,
      lastSynchronizedAt: repository.lastSynchronizedAt?.toISOString() ?? null,
      latestSync: latestSync?.completedAt
        ? {
            operationId: latestSync.id,
            branch: latestSync.branch,
            headCommit: latestSync.headCommit,
            traceVersion: latestSync.traceVersion,
            schemaVersion: latestSync.schemaVersion,
            completedAt: latestSync.completedAt.toISOString(),
            stale:
              repository.remoteHeadSha && latestSync.headCommit
                ? repository.remoteHeadSha !== latestSync.headCommit
                : null,
          }
        : null,
      analysis: analysis
        ? {
            id: analysis.id,
            status: normalizeAnalysisState(analysis.status),
            updatedAt: analysis.updatedAt.toISOString(),
          }
        : null,
    };
  });

  const findingRows = analysisRows.length
    ? await db
        .select({
          id: schema.analysisFindings.id,
          analysisRunId: schema.analysisFindings.analysisRunId,
          title: schema.analysisFindings.title,
          detail: schema.analysisFindings.detail,
          severity: schema.analysisFindings.severity,
          classification: schema.analysisFindings.classification,
          evidence: schema.analysisFindings.evidence,
          updatedAt: schema.analysisFindings.updatedAt,
        })
        .from(schema.analysisFindings)
        .where(
          and(
            inArray(
              schema.analysisFindings.analysisRunId,
              analysisRows.map((run) => run.id),
            ),
            isNull(schema.analysisFindings.disposition),
          ),
        )
        .orderBy(desc(schema.analysisFindings.updatedAt))
        .limit(20)
    : [];
  const runById = new Map(analysisRows.map((run) => [run.id, run]));
  const repositoryById = new Map(repositoryRows.map((repository) => [repository.id, repository]));
  const attention: DashboardAttention[] = findingRows.map((finding) => {
    const run = runById.get(finding.analysisRunId);
    const repository = run?.repositoryId ? repositoryById.get(run.repositoryId) : null;
    return {
      id: finding.id,
      kind: 'finding',
      title: finding.title,
      detail: finding.detail,
      severity: finding.severity,
      classification: finding.classification,
      evidence: finding.evidence,
      repositoryId: run?.repositoryId ?? null,
      repositoryName: repository?.fullName ?? null,
      updatedAt: finding.updatedAt.toISOString(),
    };
  });
  for (const run of analysisRows.filter(
    (item) => normalizeAnalysisState(item.status) === 'failed',
  )) {
    const repository = run.repositoryId ? repositoryById.get(run.repositoryId) : null;
    const resultMessage =
      typeof run.result?.error === 'string' ? run.result.error : 'The analysis did not complete.';
    attention.unshift({
      id: `analysis-${run.id}`,
      kind: 'analysis-failed',
      title: `Analysis failed${repository ? ` for ${repository.fullName}` : ''}`,
      detail: resultMessage,
      severity: 'high',
      classification: 'deterministic',
      evidence: [],
      repositoryId: run.repositoryId,
      repositoryName: repository?.fullName ?? null,
      updatedAt: run.updatedAt.toISOString(),
    });
  }
  for (const operation of failedSyncRows) {
    const repository = repositoryById.get(operation.repositoryId);
    attention.unshift({
      id: `sync-${operation.id}`,
      kind: 'sync-failed',
      title: `Local sync failed${repository ? ` for ${repository.fullName}` : ''}`,
      detail:
        operation.errorCode === 'manifest_mismatch'
          ? 'An artifact did not match its negotiated checksum. The previous verified snapshot remains active.'
          : 'The upload was rejected. The previous verified snapshot remains active; review the local sync status before retrying.',
      severity: 'high',
      classification: 'deterministic',
      evidence: [],
      repositoryId: operation.repositoryId,
      repositoryName: repository?.fullName ?? null,
      updatedAt: operation.updatedAt.toISOString(),
    });
  }

  const changeRows = activeRepositoryIds.length
    ? await db
        .select({
          id: schema.githubPullRequests.id,
          repositoryId: schema.githubPullRequests.repositoryId,
          number: schema.githubPullRequests.number,
          title: schema.githubPullRequests.title,
          state: schema.githubPullRequests.state,
          url: schema.githubPullRequests.url,
          authorLogin: schema.githubPullRequests.authorLogin,
          updatedAt: schema.githubPullRequests.updatedAt,
        })
        .from(schema.githubPullRequests)
        .where(inArray(schema.githubPullRequests.repositoryId, activeRepositoryIds))
        .orderBy(desc(schema.githubPullRequests.updatedAt))
        .limit(12)
    : [];
  const latestChanges: DashboardChange[] = changeRows.map((change) => ({
    ...change,
    repositoryName: repositoryById.get(change.repositoryId)?.fullName ?? 'Repository',
    updatedAt: change.updatedAt.toISOString(),
  }));

  const latestCompletedSyncIds = [...latestSyncByRepository.values()].map(
    (operation) => operation.id,
  );
  const syncedRows = latestCompletedSyncIds.length
    ? await db
        .select()
        .from(schema.syncedArtifacts)
        .where(inArray(schema.syncedArtifacts.operationId, latestCompletedSyncIds))
        .orderBy(desc(schema.syncedArtifacts.generatedAt))
    : [];
  const syncedRecords: DashboardSyncedRecord[] = syncedRows.map((artifact) => {
    const projection = artifact.projection as {
      title?: string;
      summary?: string;
      status?: string;
      items?: DashboardSyncedRecord['items'];
    };
    return {
      id: artifact.id,
      artifactId: artifact.artifactId,
      artifactType: artifact.artifactType,
      repositoryId: artifact.repositoryId,
      repositoryName: repositoryById.get(artifact.repositoryId)?.fullName ?? 'Repository',
      title: projection.title ?? artifact.artifactId,
      summary: projection.summary ?? '',
      status: projection.status ?? null,
      items: projection.items ?? [],
      generatedAt: artifact.generatedAt.toISOString(),
      syncedAt: artifact.syncedAt.toISOString(),
      origin: 'local',
      content: artifact.content,
    };
  });
  const latestReports = syncedRecords.filter((record) =>
    ['daily_report', 'weekly_report'].includes(record.artifactType),
  );
  const conflicts = syncedRecords.filter((record) => record.artifactType === 'conflict');
  const decisions = syncedRecords.filter((record) => record.artifactType === 'decision');
  const risks = syncedRecords.filter((record) => record.artifactType === 'risk');
  const rules = syncedRecords.filter((record) => record.artifactType === 'rule');
  for (const record of [...risks, ...conflicts]) {
    for (const item of record.items) {
      attention.push({
        id: `${record.id}:${item.id}`,
        kind: record.artifactType === 'risk' ? 'risk' : 'conflict',
        title: item.title,
        detail: item.detail,
        severity: item.severity ?? 'medium',
        classification: item.classification ?? 'uncertain',
        evidence: item.evidence,
        repositoryId: record.repositoryId,
        repositoryName: record.repositoryName,
        updatedAt: record.generatedAt,
      });
    }
  }

  const auditRows = await db
    .select({
      id: schema.auditEvents.id,
      action: schema.auditEvents.action,
      subjectType: schema.auditEvents.subjectType,
      subjectId: schema.auditEvents.subjectId,
      createdAt: schema.auditEvents.createdAt,
    })
    .from(schema.auditEvents)
    .where(
      organizationIds.length
        ? or(
            inArray(schema.auditEvents.organizationId, organizationIds),
            and(
              isNull(schema.auditEvents.organizationId),
              eq(schema.auditEvents.actorUserId, userId),
            ),
          )
        : and(
            isNull(schema.auditEvents.organizationId),
            eq(schema.auditEvents.actorUserId, userId),
          ),
    )
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(12);
  const syncAuditRows = auditRows.filter(
    (event) =>
      !event.action.startsWith('local.sync.') ||
      event.subjectType === 'repository' ||
      activeRepositoryIds.includes(event.subjectId ?? '') ||
      completedSyncRows.some((operation) => operation.id === event.subjectId) ||
      failedSyncRows.some((operation) => operation.id === event.subjectId),
  );
  const activity: DashboardActivity[] = [
    ...syncAuditRows.map((event) => {
      const labels: Record<string, { title: string; detail: string; kind: 'sync' | 'audit' }> = {
        'local.sync.started': {
          title: 'Local sync started',
          detail: 'A source-free artifact manifest was accepted.',
          kind: 'sync',
        },
        'local.sync.completed': {
          title: 'Local analysis synced',
          detail: 'The dashboard switched to a verified completed snapshot.',
          kind: 'sync',
        },
        'local.sync.artifact_rejected': {
          title: 'Local artifact rejected',
          detail: 'The previous dashboard snapshot remains active.',
          kind: 'sync',
        },
        'local.sync.divergence_detected': {
          title: 'Sync requires attention',
          detail: 'Local and dashboard artifact history diverged.',
          kind: 'sync',
        },
        'cli.connection.approved': {
          title: 'Local connection approved',
          detail: 'A scoped CLI credential was created.',
          kind: 'audit',
        },
        'cli.connection.revoked': {
          title: 'Local connection revoked',
          detail: 'Future sync attempts from that credential are blocked.',
          kind: 'audit',
        },
      };
      const label = labels[event.action];
      return {
        id: event.id,
        kind: label?.kind ?? ('audit' as const),
        title: label?.title ?? event.action.replaceAll('.', ' '),
        detail: label?.detail ?? event.subjectType.replaceAll('_', ' '),
        occurredAt: event.createdAt.toISOString(),
      };
    }),
    ...activeRepositoryRows.map((repository) => ({
      id: `repository-${repository.id}`,
      kind: 'repository-connected' as const,
      title: 'Repository connected',
      detail: repository.fullName,
      occurredAt: repository.createdAt.toISOString(),
    })),
    ...analysisRows.slice(0, 8).map((run) => ({
      id: `analysis-${run.id}`,
      kind: 'analysis' as const,
      title: `Analysis ${normalizeAnalysisState(run.status).replace('-', ' ')}`,
      detail: run.repositoryId
        ? (repositoryById.get(run.repositoryId)?.fullName ?? 'Repository')
        : 'Workspace analysis',
      occurredAt: run.updatedAt.toISOString(),
    })),
  ]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 12);

  const latestAnalysisStatus = repositories
    .map((repository) => repository.analysis)
    .filter((analysis): analysis is NonNullable<typeof analysis> => Boolean(analysis))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.status;
  const setup = deriveSetupState({
    githubConnected: installations.length > 0,
    repositorySelected: repositories.length > 0,
    latestAnalysisStatus,
  });

  return {
    source: 'postgresql',
    workspace: {
      name: latestWorkspaceName(organizations, profile?.intendedUsage ?? null),
      profileComplete: profile?.completed ?? false,
      intendedUsage: profile?.intendedUsage ?? null,
      executionMode: profile?.executionMode ?? null,
    },
    setup: { ...setup, repositoriesAvailable: repositoryRows.length },
    repositories,
    attention: attention.slice(0, 12),
    latestChanges,
    latestReports,
    conflicts,
    decisions,
    risks,
    rules,
    activity,
    capabilities: {
      changes: repositories.length > 0,
      conflicts: conflicts.length > 0,
      reports: latestReports.length > 0,
      decisions: decisions.length > 0,
      rules: rules.length > 0,
      activity: repositories.length > 0 || analysisRows.length > 0,
    },
  };
}
