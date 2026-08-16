import type { DashboardAttention, DashboardRepository } from './dashboard';

export type TraceProjectStateKey =
  | 'not-connected'
  | 'github-access-required'
  | 'github-unavailable'
  | 'connected-not-analyzed'
  | 'analysis-running'
  | 'analysis-failed'
  | 'analysis-available-locally'
  | 'syncing'
  | 'sync-attention'
  | 'synced-freshness-unavailable'
  | 'current'
  | 'needs-refresh'
  | 'computer-revoked';

export type TraceProjectStateTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type TraceProjectState = {
  key: TraceProjectStateKey;
  label: string;
  shortLabel: string;
  description: string;
  tone: TraceProjectStateTone;
  actionLabel: string | null;
  actionKind: 'local' | 'link' | 'retry' | 'none';
};

export function localTraceCommandsForState(state: TraceProjectStateKey): string[] {
  switch (state) {
    case 'connected-not-analyzed':
    case 'analysis-failed':
      return ['trace analyze'];
    case 'analysis-available-locally':
    case 'sync-attention':
      return ['trace sync --dry-run', 'trace sync'];
    case 'needs-refresh':
      return ['trace analyze', 'trace sync --dry-run', 'trace sync'];
    default:
      return [];
  }
}

export function needsReanalysis(repository: DashboardRepository | null) {
  return repository?.latestSync?.stale === true;
}

export function presentFindingDetail(value: string) {
  return value
    .replace(
      /(?:a deterministic local record|this)\s+requires review before the next change is accepted/gi,
      'TRACE detected this deterministically and recommends reviewing it before the change is considered complete',
    )
    .replace(
      /requires review before the next change is accepted/gi,
      'TRACE recommends reviewing it before the change is considered complete',
    )
    .replace(/must be accepted automatically/gi, 'should receive human review before proceeding')
    .replace(/must pass/gi, 'should be checked')
    .replace(/was prevented/gi, 'was flagged before it could proceed');
}

export function analysisOriginLabel(repository: DashboardRepository) {
  return repository.latestSync || repository.analysis?.status === 'completed'
    ? 'Local analysis'
    : null;
}

export function isFileEvidenceReference(value: string) {
  const normalized = value.replaceAll('\\', '/');
  if (/^(?:evidence|trace|artifact)(?:[/\\:]|$)/i.test(normalized)) return false;
  return /(?:^|[/\\])[^/\\]+\.(?:c|cc|cpp|cs|go|java|js|jsx|json|md|php|py|rs|sql|ts|tsx|yml|yaml)$/i.test(
    normalized,
  );
}

export function activityContextLabel(repositoryName: string | null | undefined) {
  return repositoryName ? `Repository - ${repositoryName}` : 'Workspace';
}

export function deriveTraceProjectState(
  repository: DashboardRepository | null,
  attention: DashboardAttention[] = [],
): TraceProjectState {
  if (!repository) {
    return {
      key: 'not-connected',
      label: 'Not connected',
      shortLabel: 'Not connected',
      description: 'Connect a GitHub repository before TRACE can build project intelligence.',
      tone: 'neutral',
      actionLabel: 'Connect repository',
      actionKind: 'link',
    };
  }

  const repositoryAttention = attention.filter((item) => item.repositoryId === repository.id);
  const hasSyncFailure = repositoryAttention.some((item) => item.kind === 'sync-failed');
  const analysisStatus = repository.analysis?.status ?? 'not-started';
  const repositoryNeedsReanalysis = needsReanalysis(repository);

  // A known remote divergence means the current analysis describes an older
  // checkout. It takes precedence over a failed sync so the local workflow
  // cannot imply that re-uploading the old record would make it current.
  if (hasSyncFailure && !repositoryNeedsReanalysis) {
    return {
      key: 'sync-attention',
      label: 'Sync needs attention',
      shortLabel: 'Sync needs attention',
      description:
        'The latest approved record was not accepted. The previous verified dashboard record remains safe.',
      tone: 'danger',
      actionLabel: 'Review sync',
      actionKind: 'local',
    };
  }

  if (analysisStatus === 'queued' || analysisStatus === 'running') {
    return {
      key: 'analysis-running',
      label: 'Analysis in progress',
      shortLabel: 'Analyzing locally',
      description:
        'TRACE is analyzing the checkout on your computer. The dashboard has not changed.',
      tone: 'info',
      actionLabel: null,
      actionKind: 'none',
    };
  }

  if (analysisStatus === 'failed' && !repository.latestSync) {
    return {
      key: 'analysis-failed',
      label: 'Analysis needs attention',
      shortLabel: 'Analysis failed',
      description:
        'Local analysis did not complete. Run it again on your computer; no new dashboard record was created.',
      tone: 'danger',
      actionLabel: 'Review local action',
      actionKind: 'local',
    };
  }

  if (!repository.latestSync) {
    if (analysisStatus === 'completed') {
      return {
        key: 'analysis-available-locally',
        label: 'Analysis ready on this computer',
        shortLabel: 'Ready to sync',
        description:
          'A local TRACE record is available. Review the approved payload before synchronizing it.',
        tone: 'info',
        actionLabel: 'Review sync',
        actionKind: 'local',
      };
    }
    return {
      key: 'connected-not-analyzed',
      label: 'Connected - Not analyzed',
      shortLabel: 'Not analyzed',
      description:
        'TRACE knows this repository identity, but no local analysis has been created yet. Run analysis first; synchronization becomes available after a record is created.',
      tone: 'neutral',
      actionLabel: 'Analyze locally',
      actionKind: 'local',
    };
  }

  if (repositoryNeedsReanalysis) {
    return {
      key: 'needs-refresh',
      label: 'Needs refresh',
      shortLabel: 'Needs refresh',
      description:
        'GitHub contains changes newer than your last TRACE analysis. Analyze the current checkout first, then synchronize the approved TRACE records.',
      tone: 'warning',
      actionLabel: 'Update TRACE',
      actionKind: 'local',
    };
  }

  if (repository.latestSync.stale === false) {
    return {
      key: 'current',
      label: 'Current with GitHub',
      shortLabel: 'Current',
      description: 'The analyzed commit matches the trusted GitHub default-branch state.',
      tone: 'success',
      actionLabel: null,
      actionKind: 'none',
    };
  }

  return {
    key: 'synced-freshness-unavailable',
    label: 'Freshness unavailable',
    shortLabel: 'Freshness unavailable',
    description:
      'A verified dashboard record exists, but trusted GitHub branch state is not available.',
    tone: 'neutral',
    actionLabel: null,
    actionKind: 'none',
  };
}

export function formatRelativeDate(value: string | null | undefined, now = Date.now()) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const minutes = Math.max(0, Math.round((now - date.getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function stateToneClass(tone: TraceProjectStateTone) {
  return `state-tone--${tone}`;
}
