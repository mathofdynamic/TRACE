import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { d1Schema, type TraceD1Database } from '@trace/db';
import type {
  AnalysisState,
  DashboardActivity,
  DashboardAttention,
  DashboardChange,
  DashboardRepository,
  DashboardSummary,
  DashboardSyncedRecord,
} from './dashboard';

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

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function setupState(input: {
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

export async function getD1DashboardSummary(
  db: TraceD1Database,
  userId: string,
): Promise<DashboardSummary> {
  const [profile] = await db
    .select({
      completed: d1Schema.onboardingProfiles.completed,
      intendedUsage: d1Schema.onboardingProfiles.intendedUsage,
      executionMode: d1Schema.onboardingProfiles.executionMode,
    })
    .from(d1Schema.onboardingProfiles)
    .where(eq(d1Schema.onboardingProfiles.userId, userId))
    .limit(1);

  const organizations = await db
    .select({ id: d1Schema.organizations.id, name: d1Schema.organizations.name })
    .from(d1Schema.memberships)
    .innerJoin(
      d1Schema.organizations,
      eq(d1Schema.memberships.organizationId, d1Schema.organizations.id),
    )
    .where(eq(d1Schema.memberships.userId, userId));
  const organizationIds = organizations.map((organization) => organization.id);

  const installations = organizationIds.length
    ? await db
        .select({
          id: d1Schema.githubInstallations.id,
          accountLogin: d1Schema.githubInstallations.accountLogin,
          accountType: d1Schema.githubInstallations.accountType,
        })
        .from(d1Schema.githubInstallations)
        .where(
          and(
            inArray(d1Schema.githubInstallations.organizationId, organizationIds),
            eq(d1Schema.githubInstallations.state, 'active'),
          ),
        )
    : [];
  const repositoryRows = organizationIds.length
    ? await db
        .select({
          id: d1Schema.githubRepositories.id,
          fullName: d1Schema.githubRepositories.fullName,
          owner: d1Schema.githubRepositories.owner,
          name: d1Schema.githubRepositories.name,
          defaultBranch: d1Schema.githubRepositories.defaultBranch,
          visibility: d1Schema.githubRepositories.visibility,
          state: d1Schema.githubRepositories.state,
          remoteHeadSha: d1Schema.githubRepositories.remoteHeadSha,
          lastSynchronizedAt: d1Schema.githubRepositories.lastSynchronizedAt,
          createdAt: d1Schema.githubRepositories.createdAt,
        })
        .from(d1Schema.githubRepositories)
        .where(inArray(d1Schema.githubRepositories.organizationId, organizationIds))
        .orderBy(desc(d1Schema.githubRepositories.updatedAt))
    : [];
  const activeRepositoryRows = repositoryRows.filter((repository) => repository.state === 'active');
  const activeRepositoryIds = activeRepositoryRows.map((repository) => repository.id);

  const completedSyncRows = activeRepositoryIds.length
    ? await db
        .select({
          id: d1Schema.syncOperations.id,
          repositoryId: d1Schema.syncOperations.repositoryId,
          branch: d1Schema.syncOperations.branch,
          headCommit: d1Schema.syncOperations.headCommit,
          traceVersion: d1Schema.syncOperations.traceVersion,
          schemaVersion: d1Schema.syncOperations.schemaVersion,
          completedAt: d1Schema.syncOperations.completedAt,
        })
        .from(d1Schema.syncOperations)
        .where(
          and(
            inArray(d1Schema.syncOperations.repositoryId, activeRepositoryIds),
            eq(d1Schema.syncOperations.status, 'completed'),
          ),
        )
        .orderBy(desc(d1Schema.syncOperations.completedAt))
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
          id: d1Schema.syncOperations.id,
          repositoryId: d1Schema.syncOperations.repositoryId,
          errorCode: d1Schema.syncOperations.errorCode,
          updatedAt: d1Schema.syncOperations.updatedAt,
        })
        .from(d1Schema.syncOperations)
        .where(
          and(
            inArray(d1Schema.syncOperations.repositoryId, activeRepositoryIds),
            eq(d1Schema.syncOperations.status, 'failed'),
          ),
        )
        .orderBy(desc(d1Schema.syncOperations.updatedAt))
        .limit(12)
    : [];

  const analysisRows = activeRepositoryIds.length
    ? await db
        .select({
          id: d1Schema.analysisRuns.id,
          repositoryId: d1Schema.analysisRuns.repositoryId,
          status: d1Schema.analysisRuns.status,
          headSha: d1Schema.analysisRuns.headSha,
          result: d1Schema.analysisRuns.result,
          updatedAt: d1Schema.analysisRuns.updatedAt,
        })
        .from(d1Schema.analysisRuns)
        .where(
          and(
            inArray(d1Schema.analysisRuns.organizationId, organizationIds),
            inArray(d1Schema.analysisRuns.repositoryId, activeRepositoryIds),
          ),
        )
        .orderBy(desc(d1Schema.analysisRuns.updatedAt))
        .limit(100)
    : [];
  const latestAnalysisByRepository = new Map<string, (typeof analysisRows)[number]>();
  for (const run of analysisRows) {
    if (run.repositoryId && !latestAnalysisByRepository.has(run.repositoryId)) {
      latestAnalysisByRepository.set(run.repositoryId, run);
    }
  }

  const repositoryById = new Map(repositoryRows.map((repository) => [repository.id, repository]));
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
      remoteHeadSha: repository.remoteHeadSha,
      lastSynchronizedAt: iso(repository.lastSynchronizedAt),
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
      syncState: latestSync
        ? latestSync.headCommit && repository.remoteHeadSha
          ? latestSync.headCommit === repository.remoteHeadSha
            ? 'synced'
            : 'needs_refresh'
          : 'unknown'
        : analysis?.status === 'completed'
          ? 'pending'
          : 'not_analyzed',
    };
  });
  const repositoryCatalog: DashboardRepository[] = repositoryRows.map((repository) => {
    const active = repositories.find((item) => item.id === repository.id);
    return (
      active ?? {
        id: repository.id,
        fullName: repository.fullName,
        owner: repository.owner,
        name: repository.name,
        defaultBranch: repository.defaultBranch,
        visibility: repository.visibility,
        state: repository.state,
        remoteHeadSha: repository.remoteHeadSha,
        lastSynchronizedAt: iso(repository.lastSynchronizedAt),
        latestSync: null,
        analysis: null,
        syncState: 'not_analyzed',
      }
    );
  });

  const findingRows = analysisRows.length
    ? await db
        .select({
          id: d1Schema.analysisFindings.id,
          analysisRunId: d1Schema.analysisFindings.analysisRunId,
          title: d1Schema.analysisFindings.title,
          detail: d1Schema.analysisFindings.detail,
          severity: d1Schema.analysisFindings.severity,
          classification: d1Schema.analysisFindings.classification,
          evidence: d1Schema.analysisFindings.evidence,
          updatedAt: d1Schema.analysisFindings.updatedAt,
        })
        .from(d1Schema.analysisFindings)
        .where(
          and(
            inArray(
              d1Schema.analysisFindings.analysisRunId,
              analysisRows.map((run) => run.id),
            ),
            isNull(d1Schema.analysisFindings.disposition),
          ),
        )
        .orderBy(desc(d1Schema.analysisFindings.updatedAt))
        .limit(20)
    : [];
  const runById = new Map(analysisRows.map((run) => [run.id, run]));
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
      provenance: run
        ? {
            analyzedCommit: run.headSha ?? null,
            remoteHeadCommit: repository?.remoteHeadSha ?? null,
            isStaleWithRemote:
              Boolean(run.headSha && repository?.remoteHeadSha) &&
              run.headSha !== repository?.remoteHeadSha,
          }
        : null,
    };
  });
  for (const run of analysisRows.filter(
    (item) => normalizeAnalysisState(item.status) === 'failed',
  )) {
    const repository = run.repositoryId ? repositoryById.get(run.repositoryId) : null;
    const result = run.result as Record<string, unknown> | null;
    attention.unshift({
      id: `analysis-${run.id}`,
      kind: 'analysis-failed',
      title: `Analysis failed${repository ? ` for ${repository.fullName}` : ''}`,
      detail: typeof result?.error === 'string' ? result.error : 'The analysis did not complete.',
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
          id: d1Schema.githubPullRequests.id,
          repositoryId: d1Schema.githubPullRequests.repositoryId,
          number: d1Schema.githubPullRequests.number,
          title: d1Schema.githubPullRequests.title,
          state: d1Schema.githubPullRequests.state,
          headSha: d1Schema.githubPullRequests.headSha,
          baseBranch: d1Schema.githubPullRequests.baseBranch,
          url: d1Schema.githubPullRequests.url,
          authorLogin: d1Schema.githubPullRequests.authorLogin,
          updatedAt: d1Schema.githubPullRequests.updatedAt,
        })
        .from(d1Schema.githubPullRequests)
        .where(inArray(d1Schema.githubPullRequests.repositoryId, activeRepositoryIds))
        .orderBy(desc(d1Schema.githubPullRequests.updatedAt))
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
        .from(d1Schema.syncedArtifacts)
        .where(inArray(d1Schema.syncedArtifacts.operationId, latestCompletedSyncIds))
        .orderBy(desc(d1Schema.syncedArtifacts.generatedAt))
    : [];
  const syncedRecords: DashboardSyncedRecord[] = syncedRows.map((artifact) => {
    const projection = artifact.projection as Record<string, unknown>;
    const items = Array.isArray(projection.items) ? projection.items : [];
    const reportAnalyzedCommit =
      stringValue(projection.analyzedCommit) ??
      latestSyncByRepository.get(artifact.repositoryId)?.headCommit ??
      null;
    const repository = repositoryById.get(artifact.repositoryId);
    const freshness =
      repository?.remoteHeadSha && reportAnalyzedCommit
        ? repository.remoteHeadSha === reportAnalyzedCommit
          ? ('current' as const)
          : ('needs-refresh' as const)
        : null;
    return {
      id: artifact.id,
      artifactId: artifact.artifactId,
      artifactType: artifact.artifactType,
      repositoryId: artifact.repositoryId,
      repositoryName: repository?.fullName ?? 'Repository',
      title: stringValue(projection.title) ?? artifact.artifactId,
      summary: stringValue(projection.summary) ?? '',
      status: stringValue(projection.status),
      items: items as DashboardSyncedRecord['items'],
      generatedAt: artifact.generatedAt.toISOString(),
      syncedAt: artifact.syncedAt.toISOString(),
      origin: 'local',
      content: artifact.content,
      path: artifact.path,
      timeWindow: stringValue(projection.timeWindow),
      freshness,
      analyzedCommit: reportAnalyzedCommit,
      remoteHeadCommit:
        stringValue(projection.remoteHeadCommit) ?? repository?.remoteHeadSha ?? null,
      relatedChangeIds: stringArray(projection.relatedChangeIds),
      relatedFindingIds: stringArray(projection.relatedFindingIds),
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
      id: d1Schema.auditEvents.id,
      action: d1Schema.auditEvents.action,
      subjectType: d1Schema.auditEvents.subjectType,
      subjectId: d1Schema.auditEvents.subjectId,
      createdAt: d1Schema.auditEvents.createdAt,
    })
    .from(d1Schema.auditEvents)
    .where(
      organizationIds.length
        ? or(
            inArray(d1Schema.auditEvents.organizationId, organizationIds),
            and(
              isNull(d1Schema.auditEvents.organizationId),
              eq(d1Schema.auditEvents.actorUserId, userId),
            ),
          )
        : and(
            isNull(d1Schema.auditEvents.organizationId),
            eq(d1Schema.auditEvents.actorUserId, userId),
          ),
    )
    .orderBy(desc(d1Schema.auditEvents.createdAt))
    .limit(12);
  const activitySyncRows = activeRepositoryIds.length
    ? await db
        .select({
          id: d1Schema.syncOperations.id,
          repositoryId: d1Schema.syncOperations.repositoryId,
        })
        .from(d1Schema.syncOperations)
        .where(inArray(d1Schema.syncOperations.repositoryId, activeRepositoryIds))
    : [];
  const activityRepositoryBySubject = new Map(
    activitySyncRows.map((operation) => [operation.id, operation.repositoryId]),
  );
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
  const activity: DashboardActivity[] = [
    ...auditRows.map((event) => {
      const label = labels[event.action];
      const repositoryId =
        event.subjectType === 'repository'
          ? event.subjectId
          : (activityRepositoryBySubject.get(event.subjectId ?? '') ?? null);
      const repository = repositoryId ? repositoryById.get(repositoryId) : null;
      return {
        id: event.id,
        kind: label?.kind ?? ('audit' as const),
        title: label?.title ?? event.action.replaceAll('.', ' '),
        detail: label?.detail ?? event.subjectType.replaceAll('_', ' '),
        repositoryId,
        repositoryName: repository?.fullName ?? null,
        occurredAt: event.createdAt.toISOString(),
      };
    }),
    ...activeRepositoryRows.map((repository) => ({
      id: `repository-${repository.id}`,
      kind: 'repository-connected' as const,
      title: 'Repository connected',
      detail: 'Repository access is active.',
      repositoryId: repository.id,
      repositoryName: repository.fullName,
      occurredAt: repository.createdAt.toISOString(),
    })),
    ...analysisRows.slice(0, 8).map((run) => ({
      id: `analysis-${run.id}`,
      kind: 'analysis' as const,
      title: `Analysis ${normalizeAnalysisState(run.status).replace('-', ' ')}`,
      detail: 'Local analysis state updated.',
      repositoryId: run.repositoryId,
      repositoryName: run.repositoryId
        ? (repositoryById.get(run.repositoryId)?.fullName ?? null)
        : null,
      occurredAt: run.updatedAt.toISOString(),
    })),
  ]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 12);

  const latestAnalysisStatus = repositories
    .map((repository) => repository.analysis)
    .filter((analysis): analysis is NonNullable<typeof analysis> => Boolean(analysis))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.status;
  const setup = setupState({
    githubConnected: installations.length > 0,
    repositorySelected: repositories.length > 0,
    latestAnalysisStatus,
  });
  const attentionCountByRepository = new Map<string, number>();
  for (const item of attention) {
    if (item.repositoryId) {
      attentionCountByRepository.set(
        item.repositoryId,
        (attentionCountByRepository.get(item.repositoryId) ?? 0) + 1,
      );
    }
  }
  const preferredRepositoryId =
    [...repositories].sort((left, right) => {
      const score = (repository: DashboardRepository) =>
        (repository.latestSync ? 8 : 0) +
        (repository.analysis?.status === 'completed' ? 4 : 0) +
        (attentionCountByRepository.get(repository.id) ?? 0);
      return score(right) - score(left);
    })[0]?.id ?? null;

  return {
    source: 'd1',
    preferredRepositoryId,
    workspace: {
      name: latestWorkspaceName(organizations, profile?.intendedUsage ?? null),
      profileComplete: profile?.completed ?? false,
      intendedUsage: profile?.intendedUsage ?? null,
      executionMode: profile?.executionMode ?? null,
    },
    setup: { ...setup, repositoriesAvailable: repositoryRows.length },
    repositories,
    repositoryCatalog,
    github: {
      connected: installations.length > 0,
      accountLogin: installations[0]?.accountLogin ?? null,
      accountType: installations[0]?.accountType ?? null,
      defaultBranch:
        repositories.find((repository) => repository.defaultBranch)?.defaultBranch ?? null,
    },
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
  } satisfies DashboardSummary;
}
